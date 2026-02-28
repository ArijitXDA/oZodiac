import { logger } from '@/lib/logger'
import { ceipal } from '@/integrations/ceipal'
import {
  PipelineState,
  PipelineRecord,
  TransitionEvent,
  VALID_TRANSITIONS,
  PipelineRecordSchema,
} from '@/schemas/pipeline'

const AGENT = 'StateMachine'

export class PipelineStateMachine {
  /**
   * Validate and execute a state transition.
   * Persists the new state to Ceipal and returns the updated record.
   */
  async transition(
    current: PipelineRecord,
    toState: PipelineState,
    opts: {
      triggeredBy: TransitionEvent['triggeredBy']
      actorId?: string
      notes?: string
      rejectionReason?: string
    }
  ): Promise<PipelineRecord> {
    const allowed = VALID_TRANSITIONS[current.state]
    if (!allowed.includes(toState)) {
      throw new Error(
        `Invalid transition: ${current.state} → ${toState}. Allowed: [${allowed.join(', ')}]`
      )
    }

    const updated: PipelineRecord = {
      ...current,
      previousState: current.state,
      state: toState,
      updatedAt: new Date().toISOString(),
      agentNotes: opts.notes ?? current.agentNotes,
      rejectionReason: opts.rejectionReason ?? current.rejectionReason,
    }

    logger.info(AGENT, `Transition: ${current.state} → ${toState}`, {
      jobId: current.jobId,
      candidateId: current.candidateId,
      triggeredBy: opts.triggeredBy,
    })

    // Persist to Ceipal
    if (current.ceipalCandidateId && current.ceipalJobId) {
      await ceipal.updateCandidateStage({
        candidate_id: current.ceipalCandidateId,
        job_id:       current.ceipalJobId,
        stage:        toState,
        notes:        opts.notes,
        updated_by:   opts.actorId ?? 'zodiac-agent',
      })

      if (opts.notes) {
        await ceipal.addNote(
          current.ceipalCandidateId,
          current.ceipalJobId,
          `[${opts.triggeredBy.toUpperCase()}] ${opts.notes}`
        )
      }
    }

    return PipelineRecordSchema.parse(updated)
  }

  /**
   * Check if a transition is valid without executing it.
   */
  canTransition(from: PipelineState, to: PipelineState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false
  }

  /**
   * Returns all possible next states from the current state.
   */
  nextStates(from: PipelineState): PipelineState[] {
    return VALID_TRANSITIONS[from] ?? []
  }

  /**
   * Returns true if the pipeline has reached a terminal state.
   */
  isTerminal(state: PipelineState): boolean {
    return state === 'CLOSED_PLACED' || state === 'CLOSED_DROPPED'
  }

  /**
   * Build a fresh pipeline record for a new job+candidate pair.
   */
  createRecord(params: {
    jobId: string
    candidateId: string
    ceipalJobId?: string
    ceipalCandidateId?: string
  }): PipelineRecord {
    return PipelineRecordSchema.parse({
      jobId:              params.jobId,
      candidateId:        params.candidateId,
      state:              'JD_RECEIVED' as PipelineState,
      updatedAt:          new Date().toISOString(),
      interviewRound:     0,
      ceipalJobId:        params.ceipalJobId,
      ceipalCandidateId:  params.ceipalCandidateId,
    })
  }
}

export const stateMachine = new PipelineStateMachine()
