import { PipelineStateEnum } from '@/schemas/pipeline'
import type { PipelineState } from '@/schemas/pipeline'

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

// ─── Mock data (replace with real Ceipal + DB queries) ──────────────────────
const MOCK_STATS = [
  { label: 'Active Jobs',         value: 12, change: '+3 this week' },
  { label: 'Candidates in Pipe',  value: 87, change: '+14 this week' },
  { label: 'CVs Submitted',       value: 23, change: 'this month' },
  { label: 'Placements (MTD)',     value: 4,  change: '₹2.1L invoiced' },
]

const MOCK_JOBS = [
  { id: 'J001', title: 'VP Sales', client: 'Confidential BFSI', candidates: 8,  hotState: 'INTERVIEW_ROUNDS', updatedAgo: '2h' },
  { id: 'J002', title: 'Senior React Developer', client: 'Tech Startup', candidates: 14, hotState: 'CV_SUBMITTED', updatedAgo: '45m' },
  { id: 'J003', title: 'Finance Controller', client: 'Mfg Co.', candidates: 5,  hotState: 'OFFER_STAGE', updatedAgo: '1d' },
  { id: 'J004', title: 'HR Business Partner', client: 'FMCG Giant', candidates: 11, hotState: 'CALLING', updatedAgo: '3h' },
]

const MOCK_ESCALATIONS = [
  { candidateName: 'Rahul Sharma', role: 'VP Sales', reason: 'Salary expectation 18% above band', time: '1h ago' },
  { candidateName: 'Priya Iyer',   role: 'React Dev',  reason: 'Candidate asked about work-from-home policy', time: '3h ago' },
]

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Pipeline Overview</h1>
        <p className="text-[#8b8fa8] text-sm mt-1">Real-time view of all active recruitment pipelines</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {MOCK_STATS.map((s) => (
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2d3a] text-[#8b8fa8]">
                <th className="text-left px-4 py-3 font-medium">Job</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Pipeline Stage</th>
                <th className="text-right px-4 py-3 font-medium">Candidates</th>
                <th className="text-right px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_JOBS.map((job) => (
                <tr key={job.id} className="border-b border-[#2a2d3a] hover:bg-[#20242f] transition-colors">
                  <td className="px-4 py-3">
                    <a href={`/dashboard/jobs/${job.id}`} className="font-medium hover:text-green-400 transition-colors">
                      {job.title}
                    </a>
                    <div className="text-xs text-[#8b8fa8]">{job.id}</div>
                  </td>
                  <td className="px-4 py-3 text-[#8b8fa8]">{job.client}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATE_COLOR[job.hotState] ?? 'bg-gray-700 text-gray-300'}`}>
                      {job.hotState.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{job.candidates}</td>
                  <td className="px-4 py-3 text-right text-[#8b8fa8]">{job.updatedAgo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Escalation Queue */}
      {MOCK_ESCALATIONS.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Escalation Queue
            <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">{MOCK_ESCALATIONS.length}</span>
          </h2>
          <div className="space-y-2">
            {MOCK_ESCALATIONS.map((e, i) => (
              <div key={i} className="bg-[#1a1d26] border border-red-900/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{e.candidateName}</span>
                  <span className="text-[#8b8fa8] text-sm ml-2">— {e.role}</span>
                  <div className="text-sm text-red-400 mt-0.5">{e.reason}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8b8fa8]">{e.time}</span>
                  <button className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                    Review
                  </button>
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
