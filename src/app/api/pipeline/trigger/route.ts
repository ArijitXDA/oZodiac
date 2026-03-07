import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { stateMachine } from '@/orchestrator/stateMachine'
import { PipelineStateEnum } from '@/schemas/pipeline'
import { logger } from '@/lib/logger'

const AGENT = 'PipelineTriggerAPI'

/**
 * POST /api/pipeline/trigger
 * Manually advance a pipeline record to a new state.
 * Used by the dashboard for human-in-the-loop overrides.
 *
 * Body: { jobId, candidateId, toState, notes?, rejectionReason? }
 * Record is loaded from Supabase — client cannot forge state.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { jobId, candidateId, toState, notes, rejectionReason } = body

    if (!jobId || !candidateId || !toState) {
      return NextResponse.json({ error: 'jobId, candidateId, and toState are required' }, { status: 400 })
    }

    const newState = PipelineStateEnum.parse(toState)

    // Load authoritative record from Supabase
    const record = await stateMachine.getRecord(jobId, candidateId)
    if (!record) {
      return NextResponse.json({ error: `No record found for job=${jobId} candidate=${candidateId}` }, { status: 404 })
    }

    const updated = await stateMachine.transition(record, newState, {
      triggeredBy:     'human',
      actorId:         'dashboard-user',
      notes,
      rejectionReason,
    })

    logger.info(AGENT, `Manual transition: ${record.state} → ${newState}`, { jobId, candidateId })

    return NextResponse.json({ success: true, record: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error(AGENT, `Transition failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
