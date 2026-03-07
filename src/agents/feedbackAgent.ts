import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'FeedbackAgent'

interface RejectionRecord {
  jobId:       string
  candidateId: string
  reason:      string
  stage:       PipelineState
  timestamp:   string
}

const ClientPreferenceSchema = z.object({
  commonRejectionReasons:   z.array(z.string()),
  impliedSkillsToAvoid:     z.array(z.string()),
  impliedSkillsToEmphasize: z.array(z.string()),
  scoringAdjustments: z.object({
    skillWeightDelta:        z.number().min(-20).max(20),
    experienceWeightDelta:   z.number().min(-20).max(20),
    compensationWeightDelta: z.number().min(-20).max(20),
  }),
  insight: z.string().describe('Key insight for the recruiter in plain English'),
})

export type ClientPreference = z.infer<typeof ClientPreferenceSchema>

class FeedbackAgent {
  /**
   * Log a rejection reason to Supabase rejection_feedback.
   */
  async logRejection(params: {
    jobId: string
    candidateId: string
    reason: string
    stage: PipelineState
  }): Promise<void> {
    const { error } = await supabase.from('rejection_feedback').insert({
      job_id:       params.jobId,
      candidate_id: params.candidateId,
      stage:        params.stage,
      reason:       params.reason,
    })
    if (error) logger.error(AGENT, 'Failed to log rejection', error)
    else logger.info(AGENT, 'Rejection logged', { stage: params.stage, reason: params.reason.slice(0, 80) })
  }

  /**
   * Analyze rejection history for a job and return preference insights.
   * Used to improve future resume scoring for the same client/role.
   */
  async analyzeRejections(jobId: string): Promise<ClientPreference | null> {
    const { data: rows, error } = await supabase
      .from('rejection_feedback')
      .select('stage, reason, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error(AGENT, 'Failed to load rejections', error)
      return null
    }

    if (!rows || rows.length < 2) {
      logger.info(AGENT, `Not enough rejections to analyze (${rows?.length ?? 0})`)
      return null
    }

    logger.info(AGENT, `Analyzing ${rows.length} rejections for job ${jobId}`)

    const { object } = await generateObject({
      model:  anthropic(FAST_MODEL),
      schema: ClientPreferenceSchema,
      prompt: `Analyze these rejection reasons from a client HR and extract actionable insights
for improving future candidate sourcing and scoring.

REJECTION HISTORY (Job ID: ${jobId}):
${rows.map((r, i) => `${i + 1}. [${r.stage}] ${r.reason}`).join('\n')}

Identify:
1. Recurring patterns in rejections
2. Skills or traits that seem important but weren't in the JD
3. Skills or traits that triggered rejections
4. How future scoring should be adjusted
5. One plain-English insight for the recruiter`,
    })

    logger.info(AGENT, 'Analysis complete', { insight: object.insight })
    return object
  }

  /**
   * Get rejection history for a job from Supabase.
   */
  async getRejections(jobId: string): Promise<RejectionRecord[]> {
    const { data, error } = await supabase
      .from('rejection_feedback')
      .select('job_id, candidate_id, stage, reason, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error(AGENT, 'Failed to get rejections', error)
      return []
    }

    return (data ?? []).map((r) => ({
      jobId:       r.job_id,
      candidateId: r.candidate_id,
      stage:       r.stage as PipelineState,
      reason:      r.reason,
      timestamp:   r.created_at,
    }))
  }
}

export const feedbackAgent = new FeedbackAgent()
