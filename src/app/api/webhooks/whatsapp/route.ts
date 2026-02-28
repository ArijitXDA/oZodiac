import { NextRequest, NextResponse } from 'next/server'
import { whatsapp } from '@/integrations/whatsapp'
import { whatsappChatAgent } from '@/agents/whatsappAgent'
import { ceipal } from '@/integrations/ceipal'
import { logger } from '@/lib/logger'

const AGENT = 'WhatsAppWebhook'

/**
 * GET /api/webhooks/whatsapp
 * Meta webhook verification challenge.
 */
export async function GET(req: NextRequest) {
  const params      = req.nextUrl.searchParams
  const mode        = params.get('hub.mode')
  const token       = params.get('hub.verify_token')
  const challenge   = params.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info(AGENT, 'Webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST /api/webhooks/whatsapp
 * Handles incoming WhatsApp messages.
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const msg  = whatsapp.parseWebhookPayload(body)

  if (!msg) {
    return NextResponse.json({ status: 'ignored' })
  }

  logger.info(AGENT, `Incoming message from ${msg.from}`, { preview: msg.text.slice(0, 60) })

  // Look up candidate by phone number in Ceipal
  let candidate = null
  let jobId     = null

  try {
    const candidates = await ceipal.searchCandidates({ keyword: msg.from })
    candidate = candidates[0] ?? null
    // TODO: In production, maintain a phone→(candidateId, jobId) lookup table
    jobId = candidate ? 'active-job' : null
  } catch (err) {
    logger.error(AGENT, 'Ceipal lookup failed', err)
  }

  if (!candidate || !jobId) {
    // Unknown sender — log and ignore
    logger.warn(AGENT, `No candidate found for phone ${msg.from}`)
    return NextResponse.json({ status: 'unknown_sender' })
  }

  // Route to WhatsApp chat agent asynchronously
  // (don't await — Meta expects 200 within 5s)
  setImmediate(async () => {
    try {
      const result = await whatsappChatAgent.handleReply({
        candidate: {
          id:              candidate!.candidate_id,
          name:            `${candidate!.first_name} ${candidate!.last_name}`,
          phone:           msg.from,
          email:           candidate!.email,
          currentCTC:      candidate!.current_ctc    ?? 0,
          expectedCTC:     candidate!.expected_ctc   ?? 0,
          currentEmployer: candidate!.current_employer    ?? '',
          currentTitle:    candidate!.current_designation ?? '',
          totalExperience: candidate!.total_experience    ?? 0,
          noticePeriod:    candidate!.notice_period       ?? 90,
          location:        candidate!.location            ?? '',
        },
        jd:             {} as never, // loaded from active pipeline record in production
        jobId:          jobId!,
        currentState:   'CALLING',   // loaded from active pipeline record in production
        incomingMessage: msg.text,
      })

      if (result.flagForHuman) {
        logger.warn(AGENT, `Flagged for human review`, { candidate: candidate!.candidate_id })
      }
    } catch (err) {
      logger.error(AGENT, 'Agent reply failed', err)
    }
  })

  return NextResponse.json({ status: 'ok' })
}
