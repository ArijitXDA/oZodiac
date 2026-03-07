import { VALID_TRANSITIONS } from '@/schemas/pipeline'
import type { PipelineState } from '@/schemas/pipeline'
import { supabase } from '@/integrations/supabase'

export const dynamic = 'force-dynamic'

const STATE_COLOR: Record<string, string> = {
  JD_RECEIVED:            'bg-gray-700 text-gray-200',
  JD_PROCESSED:           'bg-blue-900 text-blue-200',
  SOURCING:               'bg-purple-900 text-purple-200',
  RESUME_MATCHED:         'bg-indigo-900 text-indigo-200',
  CALLING:                'bg-yellow-900 text-yellow-200',
  CONSENTED:              'bg-yellow-700 text-yellow-100',
  NOT_INTERESTED:         'bg-red-900 text-red-300',
  NOT_REACHED:            'bg-orange-900 text-orange-200',
  JD_SHARED:              'bg-teal-900 text-teal-200',
  CANDIDATE_CONFIRMED:    'bg-teal-700 text-teal-100',
  CV_REFINED:             'bg-cyan-900 text-cyan-200',
  CV_SUBMITTED:           'bg-cyan-700 text-cyan-100',
  CV_SHORTLISTED:         'bg-green-900 text-green-200',
  CV_REJECTED:            'bg-red-800 text-red-200',
  INTERVIEW_SCHEDULED:    'bg-blue-700 text-blue-100',
  INTERVIEW_ROUNDS:       'bg-blue-600 text-blue-100',
  SELECTED:               'bg-green-700 text-green-100',
  REJECTED:               'bg-red-700 text-red-100',
  DOCUMENTATION:          'bg-emerald-800 text-emerald-100',
  OFFER_STAGE:            'bg-emerald-700 text-emerald-100',
  NEGOTIATION_POSITIVE:   'bg-green-600 text-green-100',
  NEGOTIATION_NEGATIVE:   'bg-red-600 text-red-100',
  OFFER_ACCEPTED:         'bg-green-500 text-green-950',
  DOJ_CONFIRMED:          'bg-green-400 text-green-950',
  INVOICE_RAISED:         'bg-lime-600 text-lime-100',
  CLOSED_PLACED:          'bg-green-500 text-green-950',
  CLOSED_DROPPED:         'bg-gray-800 text-gray-400',
}

const TERMINAL = new Set(['CLOSED_PLACED', 'CLOSED_DROPPED'])

type CandidateRow = {
  candidate_id: string
  state: string
  interview_round: number
  agent_notes: string | null
  updated_at: string
  jd_snapshot: Record<string, unknown> | null
  // phone lookup enrichment
  candidate_name?: string | null
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params

  // Load pipeline records + phone lookup data in parallel
  const [{ data: records }, { data: lookups }] = await Promise.all([
    supabase
      .from('pipeline_records')
      .select('candidate_id, state, interview_round, agent_notes, updated_at, jd_snapshot')
      .eq('job_id', jobId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('candidate_phone_lookup')
      .select('candidate_id, candidate_name')
      .eq('job_id', jobId),
  ])

  const nameMap = new Map((lookups ?? []).map((l) => [l.candidate_id, l.candidate_name]))

  const candidates: CandidateRow[] = (records ?? []).map((r) => ({
    ...r,
    jd_snapshot:    r.jd_snapshot as Record<string, unknown> | null,
    candidate_name: nameMap.get(r.candidate_id) ?? null,
  }))

  const firstSnap = candidates[0]?.jd_snapshot
  const jobTitle  = (firstSnap?.title as string) ?? jobId

  const active = candidates.filter((c) => !TERMINAL.has(c.state))
  const closed = candidates.filter((c) =>  TERMINAL.has(c.state))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[#8b8fa8] text-sm mb-1">
            <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
            <span className="mx-2">/</span>
            {jobId}
          </div>
          <h1 className="text-2xl font-bold">{jobTitle}</h1>
          <p className="text-[#8b8fa8] text-sm mt-1">{candidates.length} total candidates</p>
        </div>
      </div>

      {/* Active candidates */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Active Candidates ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-[#8b8fa8] text-sm">No active candidates.</p>
        ) : (
          <div className="space-y-3">
            {active.map((c) => (
              <CandidateCard key={c.candidate_id} candidate={c} jobId={jobId} />
            ))}
          </div>
        )}
      </div>

      {/* Closed */}
      {closed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[#8b8fa8]">Closed ({closed.length})</h2>
          <div className="space-y-3 opacity-60">
            {closed.map((c) => (
              <CandidateCard key={c.candidate_id} candidate={c} jobId={jobId} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CandidateCard({ candidate, jobId }: { candidate: CandidateRow; jobId: string }) {
  const state      = candidate.state as PipelineState
  const nextStates = VALID_TRANSITIONS[state] ?? []
  const isTerminal = TERMINAL.has(candidate.state)

  return (
    <div className={`bg-[#1a1d26] border rounded-xl p-4 border-[#2a2d3a]`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{candidate.candidate_name ?? candidate.candidate_id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_COLOR[candidate.state] ?? 'bg-gray-700 text-gray-300'}`}>
              {candidate.state.replace(/_/g, ' ')}
              {candidate.interview_round > 0 ? ` (R${candidate.interview_round})` : ''}
            </span>
          </div>
          {candidate.agent_notes && (
            <div className="text-xs text-[#8b8fa8] mt-1 line-clamp-1">{candidate.agent_notes}</div>
          )}
        </div>

        {/* Action buttons */}
        {!isTerminal && nextStates.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {nextStates.slice(0, 3).map((toState) => (
              <form key={toState} action="/api/pipeline/trigger" method="POST">
                <input type="hidden" name="candidateId" value={candidate.candidate_id} />
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="toState" value={toState} />
                <button
                  type="submit"
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium
                    ${toState.includes('REJECTED') || toState.includes('DROPPED') || toState.includes('NEGATIVE')
                      ? 'bg-red-900 hover:bg-red-800 text-red-200'
                      : 'bg-[#2a2d3a] hover:bg-[#33374a] text-white'
                    }`}
                >
                  {toState.replace(/_/g, ' ')}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
