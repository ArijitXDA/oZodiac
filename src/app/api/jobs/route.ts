import { NextResponse } from 'next/server'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const TERMINAL = new Set(['CLOSED_PLACED', 'CLOSED_DROPPED'])

/**
 * GET /api/jobs
 * Returns all jobs with pipeline aggregate stats.
 * Groups pipeline_records by job_id and computes candidate counts.
 */
export async function GET() {
  try {
    const { data: records, error } = await supabase
      .from('pipeline_records')
      .select('job_id, candidate_id, state, updated_at, jd_snapshot, ceipal_job_id')
      .order('updated_at', { ascending: false })

    if (error) throw error

    // Group by job_id
    const jobMap = new Map<string, {
      jobId: string
      title: string
      ceipalJobId: string | null
      totalCandidates: number
      activeCandidates: number
      hotState: string
      latestUpdate: string
    }>()

    for (const row of records ?? []) {
      const existing = jobMap.get(row.job_id)
      const isTerminal = TERMINAL.has(row.state)
      const jdSnap = row.jd_snapshot as Record<string, unknown> | null

      if (!existing) {
        jobMap.set(row.job_id, {
          jobId:            row.job_id,
          title:            (jdSnap?.title as string) ?? row.job_id,
          ceipalJobId:      row.ceipal_job_id,
          totalCandidates:  1,
          activeCandidates: isTerminal ? 0 : 1,
          hotState:         row.state,
          latestUpdate:     row.updated_at,
        })
      } else {
        existing.totalCandidates++
        if (!isTerminal) existing.activeCandidates++
        // Keep the most recent update time and corresponding hot state
        if (row.updated_at > existing.latestUpdate) {
          existing.latestUpdate = row.updated_at
          existing.hotState     = row.state
        }
      }
    }

    const jobs = [...jobMap.values()].sort((a, b) =>
      b.latestUpdate.localeCompare(a.latestUpdate)
    )

    logger.info('JobsAPI', `Returning ${jobs.length} jobs`)
    return NextResponse.json({ jobs })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('JobsAPI', `Failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
