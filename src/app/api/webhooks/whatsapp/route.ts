import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { whatsapp } from '@/integrations/whatsapp'
import { whatsappChatAgent } from '@/agents/whatsappAgent'
import { stateMachine } from '@/orchestrator/stateMachine'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'WhatsAppWebhook'

/**
 * GET /api/webhooks/whatsapp
 * Meta webhook verification challenge.
 */
export async function GET(req: NextRequest) {
  const params    = req.nextUrl.searchParams
  const mode      = params.get('hub.mode')
  const token     = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info(AGENT, 'Webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST /api/webhooks/whatsapp
 * Handles incoming WhatsApp messages.
 * Looks up (candidateId, jobId) from candidate_phone_lookup, loads the real
 * PipelineRecord from Supabase, then routes to the WhatsApp chat agent.
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const msg  = whatsapp.parseWebhookPayload(body)

  if (!msg) return NextResponse.json({ status: 'ignored' })

  logger.info(AGENT, `Incoming message from ${msg.from}`, { preview: msg.text.slice(0, 60) })

  // ── Look up candidate via E.164 phone number ─────────────────────────────
  const { data: lookup, error: lookupErr } = await supabase
    .from('candidate_phone_lookup')
    .select('*')
    .eq('phone', msg.from)
    .eq('is_active', true)
    .single()

  if (lookupErr || !lookup) {
    logger.warn(AGENT, `No active phone lookup for ${msg.from}`)
    return NextResponse.json({ status: 'unknown_sender' })
  }

  // ── Load real pipeline record from Supabase ───────────────────────────────
  const record = await stateMachine.getRecord(lookup.job_id, lookup.candidate_id)

  if (!record) {
    logger.warn(AGENT, `No pipeline record for job=${lookup.job_id} candidate=${lookup.candidate_id}`)
    return NextResponse.json({ status: 'no_record' })
  }

  // Return 200 immediately — Meta requires response within 5 s
  setImmediate(async () => {
    try {
      const result = await whatsappChatAgent.handleReply({
        candidate: {
          id:              lookup.candidate_id,
          name:            lookup.candidate_name ?? lookup.candidate_id,
          phone:           msg.from,
          email:           lookup.candidate_email ?? '',
          currentCTC:      0,
          expectedCTC:     0,
          currentEmployer: '',
          currentTitle:    '',
          totalExperience: 0,
          noticePeriod:    90,
          location:        '',
        },
        jd:              (record.jdSnapshot ?? {}) as never,
        jobId:           lookup.job_id,
        currentState:    record.state,
        incomingMessage: msg.text,
      })

      // Advance state if agent returned a valid transition
      if (result.nextState && stateMachine.canTransition(record.state, result.nextState as PipelineState)) {
        await stateMachine.transition(record, result.nextState as PipelineState, {
          triggeredBy: 'agent',
          actorId:     'whatsapp-chat-agent',
          notes:       `WhatsApp conversation. New state: ${result.nextState}`,
        })
      }

      // Create escalation if agent flagged for human review
      if (result.flagForHuman) {
        await supabase.from('escalations').insert({
          job_id:         lookup.job_id,
          candidate_id:   lookup.candidate_id,
          flagged_by:     'whatsapp-chat-agent',
          reason:         'Candidate conversation requires human review',
          pipeline_state: record.state,
          candidate_name: lookup.candidate_name,
          status:         'open',
        })
        logger.warn(AGENT, `Escalation created for ${lookup.candidate_id}`)
      }
    } catch (err) {
      logger.error(AGENT, 'Agent reply failed', err)
    }
  })

  return NextResponse.json({ status: 'ok' })
}
