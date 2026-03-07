import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { stateMachine } from '@/orchestrator/stateMachine'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'VapiWebhook'

/**
 * POST /api/webhooks/vapi
 * Receives call-end events from Vapi.ai.
 * Scores the transcript using Claude, then transitions pipeline state.
 */
export async function POST(req: NextRequest) {
  // Verify shared secret (Vapi sends this as a header)
  const secret = req.headers.get('x-vapi-secret')
  if (process.env.VAPI_WEBHOOK_SECRET && secret !== process.env.VAPI_WEBHOOK_SECRET) {
    logger.warn(AGENT, 'Invalid webhook secret')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Vapi sends different event types; we only care about call-end
  const eventType: string = body?.message?.type ?? body?.type ?? ''
  if (eventType !== 'end-of-call-report' && eventType !== 'call.ended') {
    return NextResponse.json({ status: 'ignored', eventType })
  }

  const callId: string = body?.message?.call?.id ?? body?.call?.id ?? body?.id ?? ''
  const transcript: string =
    body?.message?.transcript ?? body?.transcript ?? body?.artifact?.transcript ?? ''
  const metadata: Record<string, string> =
    body?.message?.call?.metadata ?? body?.call?.metadata ?? body?.metadata ?? {}

  const { candidateId, jobId } = metadata

  if (!callId) {
    logger.warn(AGENT, 'Received call-end with no callId')
    return NextResponse.json({ status: 'ignored' })
  }

  logger.info(AGENT, `Call ended`, { callId, candidateId, jobId })

  // Respond 200 quickly; process async
  processCallEnd({ callId, transcript, candidateId, jobId }).catch((err) =>
    logger.error(AGENT, 'Async processing failed', err)
  )

  return NextResponse.json({ status: 'ok' })
}

// ─── Async processing ──────────────────────────────────────────────────────────

const CallAnalysisSchema = z.object({
  consentStatus: z
    .enum(['consented', 'not_interested', 'not_reached', 'ambiguous'])
    .describe('Outcome of the call from the candidate perspective'),
  rejectionReason: z
    .string()
    .optional()
    .describe('If not interested, brief reason (e.g. "Happy at current job", "Salary too low")'),
  collectedCTC: z
    .number()
    .optional()
    .describe('Current CTC confirmed by candidate (LPA), if mentioned'),
  collectedExpectedCTC: z
    .number()
    .optional()
    .describe('Expected CTC mentioned by candidate (LPA), if mentioned'),
  collectedNoticePeriod: z
    .number()
    .optional()
    .describe('Notice period confirmed by candidate (days), if mentioned'),
  needsHumanReview: z
    .boolean()
    .describe('True if call was ambiguous, hostile, or requires recruiter follow-up'),
  reviewReason: z.string().optional(),
  agentNotes: z.string().describe('2-3 sentence summary of the call for the recruiter dashboard'),
})

async function processCallEnd(params: {
  callId: string
  transcript: string
  candidateId: string
  jobId: string
}) {
  const { callId, transcript, candidateId, jobId } = params

  if (!candidateId || !jobId) {
    logger.warn(AGENT, `Missing candidateId/jobId in metadata for call ${callId}`)
    return
  }

  // Load pipeline record
  const record = await stateMachine.getRecord(jobId, candidateId)
  if (!record) {
    logger.warn(AGENT, `No pipeline record for job=${jobId} candidate=${candidateId}`)
    return
  }

  // Score transcript with Claude (use fast model — simple classification)
  let analysis: z.infer<typeof CallAnalysisSchema>

  if (!transcript || transcript.trim().length < 20) {
    // Very short / empty transcript = not reached
    analysis = {
      consentStatus:    'not_reached',
      needsHumanReview: false,
      agentNotes:       'Call ended without meaningful conversation — candidate likely not reached.',
    }
  } else {
    const { object } = await generateObject({
      model:  anthropic(FAST_MODEL),
      schema: CallAnalysisSchema,
      system: `You are analyzing a recruitment phone call transcript.
Determine the candidate's intent and extract key facts.
Be conservative — only mark "consented" if the candidate clearly agreed to explore the opportunity.`,
      prompt: `Call transcript:\n\n${transcript}`,
    })
    analysis = object
  }

  logger.info(AGENT, `Call analysed`, { callId, consentStatus: analysis.consentStatus })

  // Persist transcript + analysis notes on pipeline record
  await supabase
    .from('pipeline_records')
    .update({
      call_transcript:    transcript,
      call_consent_status: analysis.consentStatus,
      agent_notes:         analysis.agentNotes,
      updated_at:          new Date().toISOString(),
    })
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)

  // Map consent status → next pipeline state
  const STATE_MAP: Record<string, PipelineState> = {
    consented:      'CONSENTED',
    not_interested: 'NOT_INTERESTED',
    not_reached:    'NOT_REACHED',
  }
  const toState = STATE_MAP[analysis.consentStatus]

  if (toState && stateMachine.canTransition(record.state, toState)) {
    await stateMachine.transition(record, toState, {
      triggeredBy:     'agent',
      actorId:         'vapi-webhook',
      notes:           analysis.agentNotes,
      rejectionReason: analysis.rejectionReason,
    })
  } else {
    logger.info(AGENT, `No transition for consentStatus=${analysis.consentStatus} from state=${record.state}`)
  }

  // Create escalation if ambiguous or recruiter review needed
  if (analysis.needsHumanReview || analysis.consentStatus === 'ambiguous') {
    await supabase.from('escalations').insert({
      job_id:         jobId,
      candidate_id:   candidateId,
      flagged_by:     'vapi-webhook',
      reason:         analysis.reviewReason ?? 'Voice call requires recruiter review',
      pipeline_state: record.state,
      status:         'open',
    })
    logger.warn(AGENT, `Escalation created for ${candidateId}`)
  }
}
