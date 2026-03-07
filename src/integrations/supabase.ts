import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PipelineRecord } from '@/schemas/pipeline'
import { PipelineRecordSchema } from '@/schemas/pipeline'

// Lazy singleton — deferred until first use so Next.js build does not throw
// when SUPABASE_URL is absent in the build environment.
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return _client
}

// Proxy forwards every property access to the lazy singleton.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    const client = getClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as Function).bind(client) : value
  },
})

// ─── Row types (snake_case, mirrors DDL) ────────────────────────────────────

export interface PipelineRow {
  id?: string
  job_id: string
  candidate_id: string
  state: string
  previous_state?: string | null
  interview_round: number
  ceipal_job_id?: string | null
  ceipal_candidate_id?: string | null
  agent_notes?: string | null
  rejection_reason?: string | null
  jd_snapshot?: Record<string, unknown> | null
  conversation_history: unknown[]
  last_call_id?: string | null
  call_transcript?: string | null
  call_consent_status?: string | null
  created_at?: string
  updated_at?: string
}

export interface EscalationRow {
  id?: string
  job_id: string
  candidate_id: string
  flagged_by: string
  reason: string
  pipeline_state: string
  candidate_name?: string | null
  job_title?: string | null
  status: 'open' | 'resolved' | 'dismissed'
  resolved_by?: string | null
  resolution_note?: string | null
  created_at?: string
  resolved_at?: string | null
}

export interface PhoneLookupRow {
  phone: string
  candidate_id: string
  job_id: string
  ceipal_candidate_id?: string | null
  ceipal_job_id?: string | null
  candidate_name?: string | null
  candidate_email?: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface TransitionLogRow {
  id?: string
  job_id: string
  candidate_id: string
  from_state: string
  to_state: string
  triggered_by: string
  actor_id?: string | null
  notes?: string | null
  created_at?: string
}

export interface RejectionFeedbackRow {
  id?: string
  job_id: string
  candidate_id: string
  stage: string
  reason: string
  created_at?: string
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────

export function toSupabaseRow(record: PipelineRecord): Omit<PipelineRow, 'id' | 'conversation_history' | 'created_at'> {
  return {
    job_id:              record.jobId,
    candidate_id:        record.candidateId,
    state:               record.state,
    previous_state:      record.previousState ?? null,
    interview_round:     record.interviewRound,
    ceipal_job_id:       record.ceipalJobId ?? null,
    ceipal_candidate_id: record.ceipalCandidateId ?? null,
    agent_notes:         record.agentNotes ?? null,
    rejection_reason:    record.rejectionReason ?? null,
    jd_snapshot:         (record as PipelineRecord & { jdSnapshot?: Record<string, unknown> }).jdSnapshot ?? null,
    updated_at:          record.updatedAt,
  }
}

export function toPipelineRecord(row: PipelineRow): PipelineRecord {
  return PipelineRecordSchema.parse({
    jobId:             row.job_id,
    candidateId:       row.candidate_id,
    state:             row.state,
    previousState:     row.previous_state ?? undefined,
    updatedAt:         row.updated_at ?? new Date().toISOString(),
    agentNotes:        row.agent_notes ?? undefined,
    rejectionReason:   row.rejection_reason ?? undefined,
    interviewRound:    row.interview_round,
    ceipalJobId:       row.ceipal_job_id ?? undefined,
    ceipalCandidateId: row.ceipal_candidate_id ?? undefined,
    jdSnapshot:        row.jd_snapshot ?? undefined,
  })
}
