import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

const AGENT = 'CeipalWebhook'

/**
 * POST /api/webhooks/ceipal
 * Receives status change events from Ceipal ATS.
 *
 * Use case: When a recruiter manually changes a stage in Ceipal,
 * this webhook syncs the change back into the pipeline state machine.
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

  // Handle relevant events
  switch (body.event_type) {
    case 'candidate.stage_changed':
      // TODO: Map Ceipal stage back to pipeline state and update local record
      logger.info(AGENT, `Stage changed: ${body.stage}`, {
        candidateId: body.candidate_id,
        jobId:       body.job_id,
      })
      break

    case 'job.created':
      logger.info(AGENT, `New job created in Ceipal: ${body.job_id}`)
      break

    default:
      logger.debug(AGENT, `Unhandled event: ${body.event_type}`)
  }

  return NextResponse.json({ status: 'received' })
}
