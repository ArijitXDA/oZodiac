import { PipelineStateEnum } from '@/schemas/pipeline'
import { supabase } from '@/integrations/supabase'

export const dynamic = 'force-dynamic'

// ─── Stage colour map ────────────────────────────────────────────────────────
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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins   = Math.floor(diffMs / 60_000)
  if (mins < 60)   return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)    return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default async function DashboardPage() {
  // ── Fetch all pipeline records ───────────────────────────────────────────
  const [{ data: records }, { data: escalations }] = await Promise.all([
    supabase
      .from('pipeline_records')
      .select('job_id, candidate_id, state, updated_at, jd_snapshot')
      .order('updated_at', { ascending: false }),
    supabase
      .from('escalations')
      .select('id, job_id, candidate_id, candidate_name, job_title, reason, pipeline_state, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const allRecords = records ?? []

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const activeJobIds = new Set(
    allRecords.filter((r) => !TERMINAL.has(r.state)).map((r) => r.job_id)
  )
  const candidatesInPipe = allRecords.filter((r) => !TERMINAL.has(r.state)).length
  const cvsSubmitted     = allRecords.filter((r) =>
    ['CV_SUBMITTED', 'CV_SHORTLISTED', 'CV_REFINED', 'CV_REJECTED',
     'INTERVIEW_SCHEDULED', 'INTERVIEW_ROUNDS', 'SELECTED', 'REJECTED',
     'DOCUMENTATION', 'OFFER_STAGE', 'NEGOTIATION_POSITIVE', 'NEGOTIATION_NEGATIVE',
     'OFFER_ACCEPTED', 'NOT_POSITIVE', 'DOJ_CONFIRMED', 'INVOICE_RAISED',
     'PAYMENT_FOLLOWUP', 'CLOSED_PLACED'].includes(r.state)
  ).length
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const placementsMTD = allRecords.filter(
    (r) => r.state === 'CLOSED_PLACED' && r.updated_at >= startOfMonth
  ).length

  const stats = [
    { label: 'Active Jobs',        value: activeJobIds.size,    change: 'currently open' },
    { label: 'Candidates in Pipe', value: candidatesInPipe,     change: 'active pipeline' },
    { label: 'CVs Submitted',      value: cvsSubmitted,         change: 'total pipeline' },
    { label: 'Placements (MTD)',   value: placementsMTD,        change: 'this month' },
  ]

  // ── Build jobs table ─────────────────────────────────────────────────────
  const jobMap = new Map<string, {
    jobId: string; title: string; activeCandidates: number; hotState: string; latestUpdate: string
  }>()
  for (const r of allRecords) {
    const existing = jobMap.get(r.job_id)
    const snap = r.jd_snapshot as Record<string, unknown> | null
    if (!existing) {
      jobMap.set(r.job_id, {
        jobId:            r.job_id,
        title:            (snap?.title as string) ?? r.job_id,
        activeCandidates: TERMINAL.has(r.state) ? 0 : 1,
        hotState:         r.state,
        latestUpdate:     r.updated_at,
      })
    } else {
      if (!TERMINAL.has(r.state)) existing.activeCandidates++
      if (r.updated_at > existing.latestUpdate) {
        existing.latestUpdate = r.updated_at
        existing.hotState     = r.state
      }
    }
  }
  const jobs = [...jobMap.values()]
    .filter((j) => !TERMINAL.has(j.hotState) || j.activeCandidates > 0)
    .slice(0, 20)

  const openEscalations = escalations ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Pipeline Overview</h1>
        <p className="text-[#8b8fa8] text-sm mt-1">Real-time view of all active recruitment pipelines</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl p-4">
            <div className="text-3xl font-bold text-green-400">{s.value}</div>
            <div className="text-sm font-medium mt-1">{s.label}</div>
            <div className="text-xs text-[#8b8fa8] mt-0.5">{s.change}</div>
          </div>
        ))}
      </div>

      {/* Active Jobs */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Active Jobs</h2>
        <div className="bg-[#1a1d26] border border-[#2a2d3a] rounded-xl overflow-hidden">
          {jobs.length === 0 ? (
            <p className="text-[#8b8fa8] text-sm px-4 py-8 text-center">No active jobs yet. Trigger a pipeline to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2d3a] text-[#8b8fa8]">
                  <th className="text-left px-4 py-3 font-medium">Job</th>
                  <th className="text-left px-4 py-3 font-medium">Pipeline Stage</th>
                  <th className="text-right px-4 py-3 font-medium">Active</th>
                  <th className="text-right px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="border-b border-[#2a2d3a] hover:bg-[#20242f] transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/dashboard/jobs/${job.jobId}`} className="font-medium hover:text-green-400 transition-colors">
                        {job.title}
                      </a>
                      <div className="text-xs text-[#8b8fa8]">{job.jobId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATE_COLOR[job.hotState] ?? 'bg-gray-700 text-gray-300'}`}>
                        {job.hotState.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{job.activeCandidates}</td>
                    <td className="px-4 py-3 text-right text-[#8b8fa8]">{timeAgo(job.latestUpdate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Escalation Queue */}
      {openEscalations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Escalation Queue
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">{openEscalations.length}</span>
          </h2>
          <div className="space-y-2">
            {openEscalations.map((e) => (
              <div key={e.id} className="bg-[#1a1d26] border border-red-900/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{e.candidate_name ?? e.candidate_id}</span>
                  {e.job_title && <span className="text-[#8b8fa8] text-sm ml-2">— {e.job_title}</span>}
                  <div className="text-sm text-red-400 mt-0.5">{e.reason}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8b8fa8]">{timeAgo(e.created_at)}</span>
                  <a
                    href={`/dashboard/jobs/${e.job_id}`}
                    className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Review
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Stage Legend */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Stage Reference</h2>
        <div className="flex flex-wrap gap-2">
          {PipelineStateEnum.options.map((state) => (
            <span key={state} className={`text-xs px-2 py-1 rounded-full font-medium ${STATE_COLOR[state] ?? 'bg-gray-700 text-gray-300'}`}>
              {state.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
