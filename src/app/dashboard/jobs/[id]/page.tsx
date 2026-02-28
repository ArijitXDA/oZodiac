import { VALID_TRANSITIONS, PipelineStateEnum } from '@/schemas/pipeline'
import type { PipelineState } from '@/schemas/pipeline'

const STATE_COLOR: Record<string, string> = {
  JD_RECEIVED:            'bg-gray-700 text-gray-200',
  RESUME_MATCHED:         'bg-indigo-900 text-indigo-200',
  CALLING:                'bg-yellow-900 text-yellow-200',
  CONSENTED:              'bg-yellow-700 text-yellow-100',
  NOT_INTERESTED:         'bg-red-900 text-red-300',
  JD_SHARED:              'bg-teal-900 text-teal-200',
  CANDIDATE_CONFIRMED:    'bg-teal-700 text-teal-100',
  CV_SHORTLISTED:         'bg-green-900 text-green-200',
  CV_REJECTED:            'bg-red-800 text-red-200',
  INTERVIEW_ROUNDS:       'bg-blue-600 text-blue-100',
  SELECTED:               'bg-green-700 text-green-100',
  REJECTED:               'bg-red-700 text-red-100',
  OFFER_STAGE:            'bg-emerald-700 text-emerald-100',
  CLOSED_PLACED:          'bg-green-500 text-green-950',
  CLOSED_DROPPED:         'bg-gray-800 text-gray-400',
}

// Mock candidates for a job (replace with real Ceipal API call)
const MOCK_CANDIDATES = [
  {
    id:      'C001',
    name:    'Rahul Sharma',
    title:   'Sales Manager at ICICI Bank',
    exp:     8,
    ctc:     '18 LPA',
    state:   'INTERVIEW_ROUNDS' as PipelineState,
    round:   2,
    score:   87,
    flagged: true,
  },
  {
    id:      'C002',
    name:    'Sneha Kapoor',
    title:   'AVP Sales at HDFC',
    exp:     11,
    ctc:     '24 LPA',
    state:   'CV_SHORTLISTED' as PipelineState,
    round:   0,
    score:   92,
    flagged: false,
  },
  {
    id:      'C003',
    name:    'Amit Verma',
    title:   'Regional Manager at Bajaj',
    exp:     9,
    ctc:     '20 LPA',
    state:   'CALLING' as PipelineState,
    round:   0,
    score:   74,
    flagged: false,
  },
  {
    id:      'C004',
    name:    'Pooja Singh',
    title:   'Business Dev Lead at Axis',
    exp:     7,
    ctc:     '15 LPA',
    state:   'CLOSED_DROPPED' as PipelineState,
    round:   0,
    score:   61,
    flagged: false,
  },
]

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const active = MOCK_CANDIDATES.filter((c) => !['CLOSED_PLACED', 'CLOSED_DROPPED'].includes(c.state))
  const closed = MOCK_CANDIDATES.filter((c) =>  ['CLOSED_PLACED', 'CLOSED_DROPPED'].includes(c.state))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[#8b8fa8] text-sm mb-1">
            <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
            <span className="mx-2">/</span>
            Job {jobId}
          </div>
          <h1 className="text-2xl font-bold">VP Sales</h1>
          <p className="text-[#8b8fa8] text-sm mt-1">Confidential BFSI Client · Created 3 days ago</p>
        </div>
        <div className="flex gap-2">
          <button className="text-sm bg-[#2a2d3a] hover:bg-[#33374a] px-4 py-2 rounded-lg transition-colors">
            View JD
          </button>
          <button className="text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors">
            + Add Candidate
          </button>
        </div>
      </div>

      {/* Active candidates */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Active Candidates ({active.length})</h2>
        <div className="space-y-3">
          {active.map((c) => (
            <CandidateCard key={c.id} candidate={c} jobId={jobId} />
          ))}
        </div>
      </div>

      {/* Closed */}
      {closed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[#8b8fa8]">Closed ({closed.length})</h2>
          <div className="space-y-3 opacity-60">
            {closed.map((c) => (
              <CandidateCard key={c.id} candidate={c} jobId={jobId} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CandidateCard({
  candidate,
  jobId,
}: {
  candidate: typeof MOCK_CANDIDATES[number]
  jobId: string
}) {
  const nextStates = VALID_TRANSITIONS[candidate.state] ?? []
  const isTerminal = ['CLOSED_PLACED', 'CLOSED_DROPPED'].includes(candidate.state)

  return (
    <div className={`bg-[#1a1d26] border rounded-xl p-4 ${candidate.flagged ? 'border-red-900' : 'border-[#2a2d3a]'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{candidate.name}</span>
            {candidate.flagged && (
              <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">Needs Review</span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATE_COLOR[candidate.state] ?? 'bg-gray-700 text-gray-300'}`}>
              {candidate.state.replace(/_/g, ' ')}
              {candidate.round > 0 ? ` (R${candidate.round})` : ''}
            </span>
          </div>
          <div className="text-sm text-[#8b8fa8] mt-1">{candidate.title}</div>
          <div className="flex gap-4 mt-2 text-xs text-[#8b8fa8]">
            <span>{candidate.exp} yrs exp</span>
            <span>{candidate.ctc}</span>
            <span className="text-green-400">Match: {candidate.score}%</span>
          </div>
        </div>

        {/* Action buttons */}
        {!isTerminal && nextStates.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {nextStates.slice(0, 3).map((state) => (
              <form key={state} action="/api/pipeline/trigger" method="POST">
                <input type="hidden" name="candidateId" value={candidate.id} />
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="toState" value={state} />
                <button
                  type="submit"
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium
                    ${state.includes('REJECTED') || state.includes('DROPPED') || state.includes('NEGATIVE')
                      ? 'bg-red-900 hover:bg-red-800 text-red-200'
                      : 'bg-[#2a2d3a] hover:bg-[#33374a] text-white'
                    }`}
                >
                  {state.replace(/_/g, ' ')}
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
