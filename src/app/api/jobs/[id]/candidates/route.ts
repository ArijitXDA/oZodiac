import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/integrations/supabase'
import { ceipal } from '@/integrations/ceipal'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jobs/[id]/candidates
 * Returns all pipeline records for a job, enriched with Ceipal candidate data.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params

    const { data: records, error } = await supabase
      .from('pipeline_records')
      .select('*')
      .eq('job_id', jobId)
      .order('updated_at', { ascending: false })

    if (error) throw error

    // Enrich with Ceipal candidate metadata where available
    const candidates = await Promise.all(
      (records ?? []).map(async (row) => {
        if (row.ceipal_candidate_id) {
          try {
            const ceipalData = await ceipal.getCandidate(row.ceipal_candidate_id)
            return {
              ...row,
              name:            `${ceipalData.first_name} ${ceipalData.last_name}`,
              currentTitle:    ceipalData.current_designation ?? '',
              currentEmployer: ceipalData.current_employer ?? '',
              totalExperience: ceipalData.total_experience ?? 0,
              expectedCTC:     ceipalData.expected_ctc ?? 0,
            }
          } catch {
            // Ceipal unavailable — return row with fallback fields
          }
        }
        return {
          ...row,
          name:            row.candidate_id,
          currentTitle:    '',
          currentEmployer: '',
          totalExperience: 0,
          expectedCTC:     0,
        }
      })
    )

    logger.info('JobCandidatesAPI', `Returning ${candidates.length} candidates for job ${jobId}`)
    return NextResponse.json({ candidates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('JobCandidatesAPI', `Failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
