import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'

const AGENT = 'MarketIntelAgent'

export const MarketIntelSchema = z.object({
  targetCompanies: z
    .array(z.string())
    .describe('Top 8-12 companies to poach candidates from for this role in India'),
  salaryBenchmarks: z.object({
    p25:    z.number().describe('25th percentile market CTC (LPA)'),
    median: z.number().describe('Median market CTC (LPA)'),
    p75:    z.number().describe('75th percentile market CTC (LPA)'),
  }),
  sourcingDifficultyScore: z
    .number()
    .min(1)
    .max(10)
    .describe('1 = easily sourced, 10 = scarce talent; based on skill rarity and demand in India'),
  refinedBooleanSearch: z
    .string()
    .describe('Optimized Boolean search string for Naukri/LinkedIn sourcing'),
  keyInsights: z
    .array(z.string())
    .describe('3-5 actionable insights for the recruiter (e.g. niche certifications, demand drivers)'),
  talentPoolSize: z
    .enum(['small', 'medium', 'large'])
    .describe('Estimated size of relevant talent pool in India'),
})

export type MarketIntel = z.infer<typeof MarketIntelSchema>

class MarketIntelAgent {
  /**
   * Analyze a JD and produce structured market intelligence.
   * Used to enrich jd_snapshot and guide resume scoring + sourcing.
   */
  async analyze(jd: JD): Promise<MarketIntel> {
    logger.info(AGENT, `Analyzing market intel for "${jd.title}"`)

    const { object } = await generateObject({
      model:  anthropic(FAST_MODEL),
      schema: MarketIntelSchema,
      system: `You are a senior recruitment market analyst specializing in the Indian job market.
You have deep knowledge of:
- Indian tech, BFSI, manufacturing, pharma, and FMCG talent pools
- Salary benchmarks across metros (Mumbai, Bangalore, Delhi, Hyderabad, Pune, Chennai)
- Which companies are the best sources of specific talent profiles
- Naukri and LinkedIn Boolean search best practices

Provide concrete, actionable intelligence. Base salary ranges on current Indian market rates (in LPA).`,
      prompt: `Provide market intelligence for this recruitment requirement:

Job Title: ${jd.title}
Location: ${jd.location} | Work Mode: ${jd.workMode}
Experience: ${jd.experienceBand.min}–${jd.experienceBand.max} years
CTC Range: ${jd.compensationBand.min}–${jd.compensationBand.max} LPA
Industry: ${jd.industry}

Must-have skills: ${jd.skills.must.join(', ')}
Good-to-have skills: ${jd.skills.good.join(', ')}

JD Summary: ${jd.summary}

Analyze:
1. Which companies have the highest concentration of candidates matching this profile in India?
2. What are realistic salary benchmarks (P25 / median / P75) for this profile in ${jd.location}?
3. How difficult is this profile to source (1-10) and why?
4. Craft an optimized Boolean search string for Naukri/LinkedIn.
5. What key insights should the recruiter know about sourcing this profile?`,
    })

    logger.info(AGENT, 'Market intel generated', {
      targetCompanies: object.targetCompanies.length,
      difficultyScore: object.sourcingDifficultyScore,
      talentPool:      object.talentPoolSize,
    })

    return object
  }
}

export const marketIntelAgent = new MarketIntelAgent()
