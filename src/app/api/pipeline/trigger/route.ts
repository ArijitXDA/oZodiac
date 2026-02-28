import { NextRequest, NextResponse } from 'next/server'
import { orchestrator } from '@/orchestrator'
import { stateMachine } from '@/orchestrator/stateMachine'
import { jdParserAgent } from '@/agents/jdParser'
import { PipelineStateEnum, PipelineRecordSchema } from '@/schemas/pipeline'
import { logger } from '@/lib/logger'

const AGENT = 'PipelineTriggerAPI'

/**
 * POST /api/pipeline/trigger
 * Manually advance a pipeline record to a new state.
 * Used by the dashboard for human-in-the-loop overrides.
 *
 * Body: {
 *   record: PipelineRecord,
 *   toState: PipelineState,
 *   notes?: string,
 *   rejectionReason?: string,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { record: rawRecord, toState, notes, rejectionReason } = body

    const record   = PipelineRecordSchema.parse(rawRecord)
    const newState = PipelineStateEnum.parse(toState)

    const updated = await stateMachine.transition(record, newState, {
      triggeredBy:     'human',
      actorId:         'dashboard-user',
      notes,
      rejectionReason,
    })

    logger.info(AGENT, `Manual transition: ${record.state} → ${newState}`, {
      jobId:       record.jobId,
      candidateId: record.candidateId,
    })

    return NextResponse.json({ success: true, record: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error(AGENT, `Transition failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
