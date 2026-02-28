import { NextRequest, NextResponse } from 'next/server'
import { resumeScorerAgent } from '@/agents/resumeScorer'
import { JDSchema } from '@/schemas/jd'
import { CandidateSchema } from '@/schemas/candidate'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const BodySchema = z.object({
  jd:         JDSchema,
  candidates: z.array(CandidateSchema),
})

/**
 * POST /api/agents/score-resumes
 * Score a batch of candidate resumes against a parsed JD.
 *
 * Body: { jd: JD, candidates: Candidate[] }
 */
export async function POST(req: NextRequest) {
  try {
    const raw    = await req.json()
    const { jd, candidates } = BodySchema.parse(raw)

    const result = await resumeScorerAgent.score(jd, candidates)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('ScoreResumesRoute', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
