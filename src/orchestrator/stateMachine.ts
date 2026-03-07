import { logger } from '@/lib/logger'
import { ceipal } from '@/integrations/ceipal'
import { supabase, toSupabaseRow, toPipelineRecord } from '@/integrations/supabase'
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
   * Persists the new state to Supabase (source of truth) and then Ceipal (eventually consistent).
   */
  async transition(
    current: PipelineRecord,
    toState: PipelineState,
    opts: {
      triggeredBy: TransitionEvent['triggeredBy']
      actorId?: string
      notes?: string
      rejectionReason?: string
      jdSnapshot?: Record<string, unknown>
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
      previousState:   current.state,
      state:           toState,
      updatedAt:       new Date().toISOString(),
      agentNotes:      opts.notes ?? current.agentNotes,
      rejectionReason: opts.rejectionReason ?? current.rejectionReason,
      jdSnapshot:      opts.jdSnapshot ?? current.jdSnapshot,
    }

    logger.info(AGENT, `Transition: ${current.state} → ${toState}`, {
      jobId:       current.jobId,
      candidateId: current.candidateId,
      triggeredBy: opts.triggeredBy,
    })

    // ── 1. Supabase: upsert pipeline_records (source of truth) ──────────────
    const row = toSupabaseRow(updated)
    const { error: upsertErr } = await supabase
      .from('pipeline_records')
      .upsert({ ...row, updated_at: updated.updatedAt }, { onConflict: 'job_id,candidate_id' })
    if (upsertErr) throw new Error(`Supabase upsert failed: ${upsertErr.message}`)

    // ── 2. Supabase: insert transition_log (immutable audit trail) ───────────
    const { error: logErr } = await supabase.from('transition_log').insert({
      job_id:       current.jobId,
      candidate_id: current.candidateId,
      from_state:   current.state,
      to_state:     toState,
      triggered_by: opts.triggeredBy,
      actor_id:     opts.actorId ?? null,
      notes:        opts.notes ?? null,
    })
    if (logErr) logger.error(AGENT, 'transition_log insert failed', logErr)

    // ── 3. Ceipal: eventually consistent stage sync ──────────────────────────
    if (current.ceipalCandidateId && current.ceipalJobId) {
      try {
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
      } catch (err) {
        // Ceipal errors are non-blocking — Supabase already persisted
        logger.error(AGENT, 'Ceipal sync failed (non-fatal)', err)
      }
    }

    return PipelineRecordSchema.parse(updated)
  }

  /**
   * Fetch a pipeline record from Supabase by (jobId, candidateId).
   * Returns null if no record exists.
   */
  async getRecord(jobId: string, candidateId: string): Promise<PipelineRecord | null> {
    const { data, error } = await supabase
      .from('pipeline_records')
      .select('*')
      .eq('job_id', jobId)
      .eq('candidate_id', candidateId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // row not found
      throw new Error(`Supabase getRecord failed: ${error.message}`)
    }
    return toPipelineRecord(data)
  }

  /**
   * Upsert a pipeline record directly to Supabase without triggering a transition.
   * Used for initial record creation and direct field updates (e.g. last_call_id).
   */
  async persistRecord(record: PipelineRecord, extra?: Record<string, unknown>): Promise<void> {
    const row = { ...toSupabaseRow(record), ...extra }
    const { error } = await supabase
      .from('pipeline_records')
      .upsert({ ...row, updated_at: record.updatedAt }, { onConflict: 'job_id,candidate_id' })
    if (error) throw new Error(`Supabase persistRecord failed: ${error.message}`)
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
   * Build a fresh pipeline record for a new job+candidate pair and persist it.
   */
  async createRecord(params: {
    jobId: string
    candidateId: string
    ceipalJobId?: string
    ceipalCandidateId?: string
  }): Promise<PipelineRecord> {
    const record = PipelineRecordSchema.parse({
      jobId:             params.jobId,
      candidateId:       params.candidateId,
      state:             'JD_RECEIVED' as PipelineState,
      updatedAt:         new Date().toISOString(),
      interviewRound:    0,
      ceipalJobId:       params.ceipalJobId,
      ceipalCandidateId: params.ceipalCandidateId,
    })

    // Ensure the row exists in Supabase before the first transition
    const { error } = await supabase.from('pipeline_records').upsert(
      {
        ...toSupabaseRow(record),
        conversation_history: [],
        updated_at: record.updatedAt,
      },
      { onConflict: 'job_id,candidate_id', ignoreDuplicates: true }
    )
    if (error) throw new Error(`Supabase createRecord failed: ${error.message}`)

    return record
  }
}

export const stateMachine = new PipelineStateMachine()
