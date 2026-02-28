import { z } from 'zod'

/**
 * All valid pipeline states derived from zodiacFlow.drawio.xml
 */
export const PipelineStateEnum = z.enum([
  'JD_RECEIVED',
  'JD_PROCESSED',
  'SOURCING',
  'RESUME_MATCHED',
  'CALLING',
  'CONSENTED',
  'NOT_INTERESTED',
  'NOT_REACHED',
  'JD_SHARED',
  'CANDIDATE_CONFIRMED',
  'CANDIDATE_NOT_INTERESTED',
  'CV_REFINED',
  'CV_SUBMITTED',
  'CV_SHORTLISTED',
  'CV_REJECTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_ROUNDS',
  'SELECTED',
  'REJECTED',
  'DOCUMENTATION',
  'OFFER_STAGE',
  'NEGOTIATION_POSITIVE',
  'NEGOTIATION_NEGATIVE',
  'OFFER_ACCEPTED',
  'NOT_POSITIVE',
  'DOJ_CONFIRMED',
  'INVOICE_RAISED',
  'PAYMENT_FOLLOWUP',
  'CLOSED_PLACED',      // terminal success
  'CLOSED_DROPPED',     // terminal failure
])

export type PipelineState = z.infer<typeof PipelineStateEnum>

/**
 * Valid transitions map: state → allowed next states
 */
export const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  JD_RECEIVED:               ['JD_PROCESSED'],
  JD_PROCESSED:              ['SOURCING'],
  SOURCING:                  ['RESUME_MATCHED'],
  RESUME_MATCHED:            ['CALLING'],
  CALLING:                   ['CONSENTED', 'NOT_INTERESTED', 'NOT_REACHED'],
  NOT_REACHED:               ['CALLING'],                         // retry loop
  CONSENTED:                 ['JD_SHARED'],
  NOT_INTERESTED:            ['CLOSED_DROPPED'],
  JD_SHARED:                 ['CANDIDATE_CONFIRMED', 'CANDIDATE_NOT_INTERESTED'],
  CANDIDATE_NOT_INTERESTED:  ['CLOSED_DROPPED'],
  CANDIDATE_CONFIRMED:       ['CV_REFINED'],
  CV_REFINED:                ['CV_SUBMITTED'],
  CV_SUBMITTED:              ['CV_SHORTLISTED', 'CV_REJECTED'],
  CV_REJECTED:               ['SOURCING'],                        // feedback → re-source
  CV_SHORTLISTED:            ['INTERVIEW_SCHEDULED'],
  INTERVIEW_SCHEDULED:       ['INTERVIEW_ROUNDS'],
  INTERVIEW_ROUNDS:          ['SELECTED', 'REJECTED', 'INTERVIEW_ROUNDS'], // multi-round loop
  REJECTED:                  ['CLOSED_DROPPED'],
  SELECTED:                  ['DOCUMENTATION'],
  DOCUMENTATION:             ['OFFER_STAGE'],
  OFFER_STAGE:               ['NEGOTIATION_POSITIVE', 'NEGOTIATION_NEGATIVE'],
  NEGOTIATION_NEGATIVE:      ['CLOSED_DROPPED'],
  NEGOTIATION_POSITIVE:      ['OFFER_ACCEPTED', 'NOT_POSITIVE'],
  NOT_POSITIVE:              ['CLOSED_DROPPED'],
  OFFER_ACCEPTED:            ['DOJ_CONFIRMED'],
  DOJ_CONFIRMED:             ['INVOICE_RAISED'],
  INVOICE_RAISED:            ['PAYMENT_FOLLOWUP', 'CLOSED_PLACED'],
  PAYMENT_FOLLOWUP:          ['CLOSED_PLACED'],
  CLOSED_PLACED:             [],
  CLOSED_DROPPED:            [],
}

export const PipelineRecordSchema = z.object({
  jobId: z.string(),
  candidateId: z.string(),
  state: PipelineStateEnum,
  previousState: PipelineStateEnum.optional(),
  updatedAt: z.string().datetime(),
  agentNotes: z.string().optional().describe('Last agent output/decision rationale'),
  rejectionReason: z.string().optional(),
  interviewRound: z.number().default(0),
  ceipalJobId: z.string().optional(),
  ceipalCandidateId: z.string().optional(),
})

export type PipelineRecord = z.infer<typeof PipelineRecordSchema>

export const TransitionEventSchema = z.object({
  jobId: z.string(),
  candidateId: z.string(),
  fromState: PipelineStateEnum,
  toState: PipelineStateEnum,
  triggeredBy: z.enum(['agent', 'human', 'webhook']),
  actorId: z.string().optional().describe('Human user ID or agent name'),
  notes: z.string().optional(),
  timestamp: z.string().datetime(),
})

export type TransitionEvent = z.infer<typeof TransitionEventSchema>
