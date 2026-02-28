import { z } from 'zod'

export const CandidateSchema = z.object({
  id: z.string().describe('Internal ID (Ceipal candidate ID)'),
  name: z.string(),
  phone: z.string(),
  email: z.string().email(),
  currentCTC: z.number().describe('Current CTC in LPA'),
  expectedCTC: z.number().describe('Expected CTC in LPA'),
  currentEmployer: z.string(),
  currentTitle: z.string(),
  totalExperience: z.number().describe('Total years of experience'),
  noticePeriod: z.number().describe('Notice period in days'),
  location: z.string(),
  resumeUrl: z.string().url().optional().describe('URL to raw resume in Ceipal'),
  resumeText: z.string().optional().describe('Extracted plain text of resume'),
})

export type Candidate = z.infer<typeof CandidateSchema>

export const ResumeScoreSchema = z.object({
  candidateId: z.string(),
  skillOverlap: z.number().min(0).max(100),
  experienceAlignment: z.number().min(0).max(100),
  industryRelevance: z.number().min(0).max(100),
  compensationAlignment: z.number().min(0).max(100),
  noticePeriodFit: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  shortlistReason: z.string().describe('1-2 sentence justification for shortlisting'),
  redFlags: z.array(z.string()).describe('Any potential mismatches or risks'),
  shouldShortlist: z.boolean(),
})

export type ResumeScore = z.infer<typeof ResumeScoreSchema>

export const ScoredCandidateListSchema = z.object({
  candidates: z.array(ResumeScoreSchema),
  shortlistedCount: z.number(),
  totalEvaluated: z.number(),
})

export type ScoredCandidateList = z.infer<typeof ScoredCandidateListSchema>
