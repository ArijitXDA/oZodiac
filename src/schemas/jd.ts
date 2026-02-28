import { z } from 'zod'

export const JDSchema = z.object({
  title: z.string().describe('Job title as extracted from JD'),
  skills: z.object({
    must: z.array(z.string()).describe('Mandatory skills/requirements'),
    good: z.array(z.string()).describe('Nice-to-have skills'),
  }),
  experienceBand: z.object({
    min: z.number().describe('Minimum years of experience'),
    max: z.number().describe('Maximum years of experience'),
  }),
  industry: z.string().describe('Primary industry (e.g. BFSI, IT, Manufacturing)'),
  function: z.string().describe('Job function (e.g. Sales, Finance, Engineering)'),
  compensationBand: z.object({
    min: z.number().describe('Minimum CTC in LPA'),
    max: z.number().describe('Maximum CTC in LPA'),
    currency: z.string().default('INR'),
  }),
  location: z.string().describe('Work location(s)'),
  noticePeriodMax: z.number().describe('Maximum acceptable notice period in days').default(90),
  workMode: z.enum(['onsite', 'remote', 'hybrid']).default('onsite'),
  booleanSearchString: z.string().describe('Boolean search string for job portals like Naukri/LinkedIn'),
  hiddenFilters: z.array(z.string()).describe('Implied but unstated filters from HR call or JD context'),
  summary: z.string().describe('2-3 sentence summary of the role for candidate pitching'),
})

export type JD = z.infer<typeof JDSchema>
