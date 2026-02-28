import { z } from 'zod'

export const CeipalJobSchema = z.object({
  job_id: z.string(),
  job_title: z.string(),
  client_name: z.string(),
  status: z.string(),
  created_date: z.string(),
})

export type CeipalJob = z.infer<typeof CeipalJobSchema>

export const CeipalCandidateSchema = z.object({
  candidate_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  phone: z.string(),
  current_employer: z.string().optional(),
  current_designation: z.string().optional(),
  total_experience: z.number().optional(),
  current_ctc: z.number().optional(),
  expected_ctc: z.number().optional(),
  notice_period: z.number().optional(),
  location: z.string().optional(),
  resume_url: z.string().optional(),
  stage: z.string().optional(),
  notes: z.string().optional(),
})

export type CeipalCandidate = z.infer<typeof CeipalCandidateSchema>

export const CeipalStageUpdateSchema = z.object({
  candidate_id: z.string(),
  job_id: z.string(),
  stage: z.string(),
  notes: z.string().optional(),
  updated_by: z.string().default('zodiac-agent'),
})

export type CeipalStageUpdate = z.infer<typeof CeipalStageUpdateSchema>
