import { stateMachine } from './stateMachine'
import { jdParserAgent } from '@/agents/jdParser'
import { resumeScorerAgent } from '@/agents/resumeScorer'
import { cvRefinerAgent } from '@/agents/cvRefiner'
import { emailAgent } from '@/agents/emailAgent'
import { groomingAgent } from '@/agents/groomingAgent'
import { schedulingAgent } from '@/agents/schedulingAgent'
import { feedbackAgent } from '@/agents/feedbackAgent'
import { ceipal } from '@/integrations/ceipal'
import { logger } from '@/lib/logger'
import type { PipelineRecord } from '@/schemas/pipeline'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'

const AGENT = 'Orchestrator'

export class PipelineOrchestrator {
  /**
   * Stage 1: Process a newly received JD.
   * JD_RECEIVED → JD_PROCESSED
   */
  async processJD(record: PipelineRecord, rawJDText: string): Promise<{ record: PipelineRecord; jd: JD }> {
    logger.info(AGENT, 'Processing JD', { jobId: record.jobId })
    const jd = await jdParserAgent.parse(rawJDText)
    const updated = await stateMachine.transition(record, 'JD_PROCESSED', {
      triggeredBy: 'agent',
      actorId: 'jd-parser-agent',
      notes: `JD parsed. Title: ${jd.title}. Skills: ${jd.skills.must.join(', ')}. Boolean: ${jd.booleanSearchString}`,
    })
    return { record: updated, jd }
  }

  /**
   * Stage 2: Score a list of candidate resumes against the parsed JD.
   * JD_PROCESSED → SOURCING → RESUME_MATCHED
   */
  async scoreResumes(
    record: PipelineRecord,
    jd: JD,
    candidates: Candidate[]
  ): Promise<PipelineRecord> {
    logger.info(AGENT, 'Scoring resumes', { jobId: record.jobId, count: candidates.length })
    const sourcing = await stateMachine.transition(record, 'SOURCING', {
      triggeredBy: 'agent',
      notes: `${candidates.length} candidates pulled for evaluation`,
    })
    const scores = await resumeScorerAgent.score(jd, candidates)
    const shortlisted = scores.candidates.filter((c) => c.shouldShortlist)
    return stateMachine.transition(sourcing, 'RESUME_MATCHED', {
      triggeredBy: 'agent',
      actorId: 'resume-scorer-agent',
      notes: `${shortlisted.length}/${scores.totalEvaluated} candidates shortlisted. Top score: ${Math.max(...shortlisted.map((c) => c.overallScore)).toFixed(1)}`,
    })
  }

  /**
   * Stage 3: Candidate consented on call.
   * CALLING → CONSENTED
   */
  async markConsented(record: PipelineRecord, notes: string): Promise<PipelineRecord> {
    return stateMachine.transition(record, 'CONSENTED', {
      triggeredBy: 'agent',
      notes,
    })
  }

  /**
   * Stage 3b: Candidate not interested.
   */
  async markNotInterested(record: PipelineRecord, reason: string): Promise<PipelineRecord> {
    return stateMachine.transition(record, 'NOT_INTERESTED', {
      triggeredBy: 'agent',
      notes: reason,
      rejectionReason: reason,
    })
  }

  /**
   * Stage 4: Refine CV after candidate confirms.
   * CANDIDATE_CONFIRMED → CV_REFINED → CV_SUBMITTED
   */
  async refineAndSubmitCV(
    record: PipelineRecord,
    jd: JD,
    candidate: Candidate,
    hrEmail: string
  ): Promise<PipelineRecord> {
    logger.info(AGENT, 'Refining CV', { candidateId: candidate.id })

    const { docxBuffer, summaryNote, refinedText } = await cvRefinerAgent.refine(jd, candidate)

    // Upload refined CV to Ceipal
    if (record.ceipalCandidateId && record.ceipalJobId) {
      await ceipal.uploadDocument(
        record.ceipalCandidateId,
        record.ceipalJobId,
        docxBuffer,
        `${candidate.name.replace(/\s+/g, '_')}_Zodiac.docx`
      )
    }

    const refined = await stateMachine.transition(record, 'CV_REFINED', {
      triggeredBy: 'agent',
      actorId: 'cv-refiner-agent',
      notes: summaryNote,
    })

    // Email refined CV to HR
    await emailAgent.sendCVToHR({
      hrEmail,
      candidate,
      jd,
      docxBuffer,
      summaryNote,
      refinedText,
    })

    return stateMachine.transition(refined, 'CV_SUBMITTED', {
      triggeredBy: 'agent',
      actorId: 'email-agent',
      notes: `CV emailed to HR (${hrEmail})`,
    })
  }

  /**
   * Stage 5: HR shortlists CV.
   * CV_SUBMITTED → CV_SHORTLISTED
   */
  async markCVShortlisted(
    record: PipelineRecord,
    jd: JD,
    candidate: Candidate
  ): Promise<PipelineRecord> {
    const shortlisted = await stateMachine.transition(record, 'CV_SHORTLISTED', {
      triggeredBy: 'human',
      notes: 'CV approved by HR',
    })

    // Trigger grooming agent — sends 10-question prep list to candidate
    await groomingAgent.sendGroomingKit(jd, candidate)

    return shortlisted
  }

  /**
   * Stage 5b: HR rejects CV — capture reason and loop back to sourcing.
   */
  async markCVRejected(
    record: PipelineRecord,
    reason: string,
    jobId: string
  ): Promise<PipelineRecord> {
    const rejected = await stateMachine.transition(record, 'CV_REJECTED', {
      triggeredBy: 'human',
      notes: reason,
      rejectionReason: reason,
    })
    // Feed rejection reason into feedback agent
    await feedbackAgent.logRejection({ jobId, candidateId: record.candidateId, reason, stage: 'CV_REJECTED' })
    return stateMachine.transition(rejected, 'SOURCING', {
      triggeredBy: 'agent',
      notes: 'Re-sourcing after CV rejection feedback',
    })
  }

  /**
   * Stage 6: Schedule interview.
   * CV_SHORTLISTED → INTERVIEW_SCHEDULED
   */
  async scheduleInterview(
    record: PipelineRecord,
    params: {
      candidate: Candidate
      hrEmail: string
      mode: 'f2f' | 'virtual'
      proposedSlots: string[]
    }
  ): Promise<PipelineRecord> {
    const eventId = await schedulingAgent.scheduleInterview(params)
    return stateMachine.transition(record, 'INTERVIEW_SCHEDULED', {
      triggeredBy: 'agent',
      actorId: 'scheduling-agent',
      notes: `Interview scheduled (${params.mode}). Calendar event: ${eventId}`,
    })
  }

  /**
   * Stage 7: Candidate selected after interview round(s).
   * INTERVIEW_ROUNDS → SELECTED
   */
  async markSelected(record: PipelineRecord, notes: string): Promise<PipelineRecord> {
    return stateMachine.transition(record, 'SELECTED', {
      triggeredBy: 'human',
      notes,
    })
  }

  /**
   * Stage 7b: Candidate rejected after interview — capture reason.
   */
  async markRejectedPostInterview(
    record: PipelineRecord,
    reason: string
  ): Promise<PipelineRecord> {
    await feedbackAgent.logRejection({
      jobId: record.jobId,
      candidateId: record.candidateId,
      reason,
      stage: 'INTERVIEW_ROUNDS',
    })
    return stateMachine.transition(record, 'REJECTED', {
      triggeredBy: 'human',
      notes: reason,
      rejectionReason: reason,
    })
  }

  /**
   * Stage 8: Offer negotiation positive → request documentation → send to HR.
   */
  async processOffer(
    record: PipelineRecord,
    outcome: 'positive' | 'negative',
    notes: string
  ): Promise<PipelineRecord> {
    const nextState = outcome === 'positive' ? 'NEGOTIATION_POSITIVE' : 'NEGOTIATION_NEGATIVE'
    return stateMachine.transition(record, nextState, { triggeredBy: 'human', notes })
  }

  /**
   * Stage 9: DOJ confirmed → raise invoice.
   */
  async confirmDOJ(
    record: PipelineRecord,
    doj: string,
    candidate: Candidate,
    jd: JD,
    hrEmail: string
  ): Promise<PipelineRecord> {
    const confirmed = await stateMachine.transition(record, 'DOJ_CONFIRMED', {
      triggeredBy: 'human',
      notes: `DOJ confirmed: ${doj}`,
    })

    // Email HR for offer + CTC details
    await emailAgent.sendOfferCTCRequest({ hrEmail, candidate, jd, doj })

    return stateMachine.transition(confirmed, 'INVOICE_RAISED', {
      triggeredBy: 'agent',
      actorId: 'email-agent',
      notes: `Invoice request sent to HR (${hrEmail})`,
    })
  }
}

export const orchestrator = new PipelineOrchestrator()
