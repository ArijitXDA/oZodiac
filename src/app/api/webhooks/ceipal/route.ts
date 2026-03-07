import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { stateMachine } from '@/orchestrator/stateMachine'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'CeipalWebhook'

/**
 * Inverse of STATE_TO_CEIPAL_STAGE: maps Ceipal stage name → best-fit pipeline state.
 * Used when a recruiter manually changes a stage in Ceipal.
 */
const CEIPAL_STAGE_TO_STATE: Record<string, PipelineState> = {
  'New Requirement':      'JD_RECEIVED',
  'Sourcing':             'SOURCING',
  'Sourced':              'RESUME_MATCHED',
  'Screening':            'CALLING',
  'Profile Submission':   'CV_REFINED',
  'Submitted':            'CV_SUBMITTED',
  'Shortlisted':          'CV_SHORTLISTED',
  'Interview Scheduled':  'INTERVIEW_SCHEDULED',
  'Interview':            'INTERVIEW_ROUNDS',
  'Selected':             'SELECTED',
  'Documentation':        'DOCUMENTATION',
  'Offered':              'OFFER_STAGE',
  'Offer Accepted':       'OFFER_ACCEPTED',
  'Joining Confirmed':    'DOJ_CONFIRMED',
  'Joined':               'CLOSED_PLACED',
  'Rejected':             'CLOSED_DROPPED',
}

/**
 * POST /api/webhooks/ceipal
 * Receives status change events from Ceipal ATS.
 * Syncs recruiter-driven Ceipal stage changes back into the Supabase pipeline.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey !== process.env.CEIPAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  logger.info(AGENT, 'Ceipal webhook received', {
    event:       body.event_type,
    candidateId: body.candidate_id,
    jobId:       body.job_id,
    stage:       body.stage,
  })

  if (body.event_type === 'candidate.stage_changed') {
    const targetState = CEIPAL_STAGE_TO_STATE[body.stage as string]

    if (!targetState) {
      logger.warn(AGENT, `No mapping for Ceipal stage: ${body.stage}`)
      return NextResponse.json({ status: 'no_mapping' })
    }

    // Look up pipeline_records by Ceipal IDs
    const { data: rows, error } = await supabase
      .from('pipeline_records')
      .select('*')
      .eq('ceipal_candidate_id', body.candidate_id)
      .eq('ceipal_job_id', body.job_id)
      .limit(1)

    if (error || !rows?.length) {
      logger.warn(AGENT, `No pipeline record for Ceipal candidate=${body.candidate_id} job=${body.job_id}`)
      return NextResponse.json({ status: 'not_found' })
    }

    const { toPipelineRecord } = await import('@/integrations/supabase')
    const record = toPipelineRecord(rows[0])

    if (!stateMachine.canTransition(record.state, targetState)) {
      logger.info(AGENT, `Skipping invalid transition ${record.state} → ${targetState} (Ceipal sync)`)
      return NextResponse.json({ status: 'invalid_transition' })
    }

    await stateMachine.transition(record, targetState, {
      triggeredBy: 'webhook',
      actorId:     'ceipal-webhook',
      notes:       `Synced from Ceipal stage change: ${body.stage}`,
    })

    logger.info(AGENT, `Synced: ${record.state} → ${targetState}`)
    return NextResponse.json({ status: 'synced', from: record.state, to: targetState })
  }

  if (body.event_type === 'job.created') {
    logger.info(AGENT, `New job created in Ceipal: ${body.job_id}`)
  }

  return NextResponse.json({ status: 'received' })
}
