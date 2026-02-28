import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { logger } from '@/lib/logger'
import { promises as fs } from 'fs'
import path from 'path'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'FeedbackAgent'

// Local feedback store (JSON file). In Phase 2 replace with vector DB.
const FEEDBACK_FILE = path.join(process.cwd(), '.feedback-store.json')

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
    skillWeightDelta:       z.number().min(-20).max(20),
    experienceWeightDelta:  z.number().min(-20).max(20),
    compensationWeightDelta: z.number().min(-20).max(20),
  }),
  insight: z.string().describe('Key insight for the recruiter in plain English'),
})

export type ClientPreference = z.infer<typeof ClientPreferenceSchema>

class FeedbackAgent {
  /**
   * Log a rejection reason.
   */
  async logRejection(params: {
    jobId: string
    candidateId: string
    reason: string
    stage: PipelineState
  }): Promise<void> {
    const record: RejectionRecord = { ...params, timestamp: new Date().toISOString() }
    const store = await this.loadStore()
    store.push(record)
    await this.saveStore(store)
    logger.info(AGENT, `Rejection logged`, { stage: params.stage, reason: params.reason.slice(0, 80) })
  }

  /**
   * Analyze rejection history for a job and return preference insights.
   * Used to improve future resume scoring for the same client/role.
   */
  async analyzeRejections(jobId: string): Promise<ClientPreference | null> {
    const store  = await this.loadStore()
    const jobRej = store.filter((r) => r.jobId === jobId)

    if (jobRej.length < 2) {
      logger.info(AGENT, `Not enough rejections to analyze (${jobRej.length})`)
      return null
    }

    logger.info(AGENT, `Analyzing ${jobRej.length} rejections for job ${jobId}`)

    const { object } = await generateObject({
      model:  anthropic(FAST_MODEL),
      schema: ClientPreferenceSchema,
      prompt: `Analyze these rejection reasons from a client HR and extract actionable insights
for improving future candidate sourcing and scoring.

REJECTION HISTORY (Job ID: ${jobId}):
${jobRej.map((r, i) => `${i + 1}. [${r.stage}] ${r.reason}`).join('\n')}

Identify:
1. Recurring patterns in rejections
2. Skills or traits that seem important but weren't in the JD
3. Skills or traits that triggered rejections
4. How future scoring should be adjusted
5. One plain-English insight for the recruiter`,
    })

    logger.info(AGENT, `Analysis complete`, { insight: object.insight })
    return object
  }

  /**
   * Get rejection history for a job.
   */
  async getRejections(jobId: string): Promise<RejectionRecord[]> {
    const store = await this.loadStore()
    return store.filter((r) => r.jobId === jobId)
  }

  // ─── Store helpers ───────────────────────────────────────────────────────

  private async loadStore(): Promise<RejectionRecord[]> {
    try {
      const raw = await fs.readFile(FEEDBACK_FILE, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  private async saveStore(store: RejectionRecord[]): Promise<void> {
    await fs.writeFile(FEEDBACK_FILE, JSON.stringify(store, null, 2))
  }
}

export const feedbackAgent = new FeedbackAgent()
