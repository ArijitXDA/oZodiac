import { generateObject } from 'ai'
import { anthropic, DEFAULT_MODEL } from '@/lib/llm'
import { ScoredCandidateListSchema, type ScoredCandidateList } from '@/schemas/candidate'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'

const AGENT = 'ResumeScorerAgent'

const SYSTEM_PROMPT = `You are a senior recruitment consultant at Zodiac HRC.
Your job is to evaluate candidate profiles against job descriptions and produce objective scores.

Scoring guidelines:
- skillOverlap (0-100): % of must-have + good-to-have skills present in the resume
- experienceAlignment (0-100): How well years of experience and career progression match the requirement
- industryRelevance (0-100): Relevance of previous employers/domains to the target industry
- compensationAlignment (0-100): How well candidate's expected CTC fits the compensation band (100 = perfect fit)
- noticePeriodFit (0-100): 100 = within limit, drops proportionally if over limit
- overallScore: weighted average (skills 35%, experience 25%, industry 20%, compensation 15%, notice 5%)

Set shouldShortlist = true if overallScore >= 65 and no critical red flags.
In shortlistReason, write a concise 1-2 sentence pitch that a recruiter can use verbatim.
In redFlags, list only genuine mismatches (e.g. "10 LPA above budget", "No BFSI experience").`

class ResumeScorerAgent {
  async score(jd: JD, candidates: Candidate[]): Promise<ScoredCandidateList> {
    logger.info(AGENT, `Scoring ${candidates.length} candidates for "${jd.title}"`)

    // Process in batches of 10 to stay within token limits
    const BATCH = 10
    const allScores: ScoredCandidateList['candidates'] = []

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)

      const { object } = await generateObject({
        model:  anthropic(DEFAULT_MODEL),
        schema: ScoredCandidateListSchema,
        system: SYSTEM_PROMPT,
        prompt: `Evaluate these ${batch.length} candidates for the following role:

JOB DESCRIPTION:
${JSON.stringify(jd, null, 2)}

CANDIDATES:
${batch.map((c, idx) => `
--- Candidate ${idx + 1} (ID: ${c.id}) ---
Name: ${c.name}
Current Role: ${c.currentTitle} at ${c.currentEmployer}
Total Experience: ${c.totalExperience} years
Location: ${c.location}
Current CTC: ${c.currentCTC} LPA | Expected CTC: ${c.expectedCTC} LPA
Notice Period: ${c.noticePeriod} days
Resume Text:
${c.resumeText ?? '(not available — use profile fields only)'}
`).join('\n')}`,
      })

      allScores.push(...object.candidates)
      logger.info(AGENT, `Batch ${Math.floor(i / BATCH) + 1} scored`, {
        shortlisted: object.candidates.filter((c) => c.shouldShortlist).length,
      })
    }

    const result: ScoredCandidateList = {
      candidates:       allScores,
      shortlistedCount: allScores.filter((c) => c.shouldShortlist).length,
      totalEvaluated:   allScores.length,
    }

    logger.info(AGENT, 'Scoring complete', {
      total:      result.totalEvaluated,
      shortlisted: result.shortlistedCount,
      avgScore:   (allScores.reduce((s, c) => s + c.overallScore, 0) / allScores.length).toFixed(1),
    })

    return result
  }
}

export const resumeScorerAgent = new ResumeScorerAgent()
