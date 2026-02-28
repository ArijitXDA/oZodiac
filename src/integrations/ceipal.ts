import axios, { AxiosInstance } from 'axios'
import { logger } from '@/lib/logger'
import type { CeipalCandidate, CeipalJob, CeipalStageUpdate } from '@/schemas/ceipal'

const AGENT = 'CeipalIntegration'

/**
 * Ceipal ATS REST API wrapper.
 * All agents interact with Ceipal exclusively through this service.
 *
 * Stage names map to Zodiac pipeline states:
 *   Ceipal "Sourced"        → RESUME_MATCHED
 *   Ceipal "Screening"      → CALLING / CONSENTED
 *   Ceipal "Submitted"      → CV_SUBMITTED
 *   Ceipal "Interview"      → INTERVIEW_SCHEDULED / INTERVIEW_ROUNDS
 *   Ceipal "Offered"        → OFFER_STAGE
 *   Ceipal "Joined"         → CLOSED_PLACED
 *   Ceipal "Rejected"       → CLOSED_DROPPED / REJECTED
 */

// Mapping from internal pipeline state to Ceipal stage name
export const STATE_TO_CEIPAL_STAGE: Record<string, string> = {
  JD_RECEIVED:              'New Requirement',
  JD_PROCESSED:             'New Requirement',
  SOURCING:                 'Sourcing',
  RESUME_MATCHED:           'Sourced',
  CALLING:                  'Screening',
  CONSENTED:                'Screening',
  NOT_INTERESTED:           'Rejected',
  NOT_REACHED:              'Screening',
  JD_SHARED:                'Screening',
  CANDIDATE_CONFIRMED:      'Screening',
  CANDIDATE_NOT_INTERESTED: 'Rejected',
  CV_REFINED:               'Profile Submission',
  CV_SUBMITTED:             'Submitted',
  CV_SHORTLISTED:           'Shortlisted',
  CV_REJECTED:              'Rejected',
  INTERVIEW_SCHEDULED:      'Interview Scheduled',
  INTERVIEW_ROUNDS:         'Interview',
  SELECTED:                 'Selected',
  REJECTED:                 'Rejected',
  DOCUMENTATION:            'Documentation',
  OFFER_STAGE:              'Offered',
  NEGOTIATION_POSITIVE:     'Offered',
  NEGOTIATION_NEGATIVE:     'Rejected',
  OFFER_ACCEPTED:           'Offer Accepted',
  NOT_POSITIVE:             'Rejected',
  DOJ_CONFIRMED:            'Joining Confirmed',
  INVOICE_RAISED:           'Joined',
  PAYMENT_FOLLOWUP:         'Joined',
  CLOSED_PLACED:            'Joined',
  CLOSED_DROPPED:           'Rejected',
}

class CeipalService {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: process.env.CEIPAL_BASE_URL || 'https://api.ceipal.com/v1',
      headers: {
        Authorization: `Bearer ${process.env.CEIPAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        logger.error(AGENT, 'API error', {
          status: err.response?.status,
          data: err.response?.data,
          url: err.config?.url,
        })
        throw err
      }
    )
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────

  async getJob(jobId: string): Promise<CeipalJob> {
    const res = await this.client.get(`/jobs/${jobId}`)
    return res.data
  }

  async listJobs(params?: { status?: string; limit?: number }): Promise<CeipalJob[]> {
    const res = await this.client.get('/jobs', { params })
    return res.data.data ?? res.data
  }

  // ─── Candidates ──────────────────────────────────────────────────────────

  async getCandidate(candidateId: string): Promise<CeipalCandidate> {
    const res = await this.client.get(`/candidates/${candidateId}`)
    return res.data
  }

  async createCandidate(data: Omit<CeipalCandidate, 'candidate_id'>): Promise<CeipalCandidate> {
    const res = await this.client.post('/candidates', data)
    logger.info(AGENT, 'Candidate created', { id: res.data.candidate_id })
    return res.data
  }

  async searchCandidates(params: {
    keyword?: string
    location?: string
    experience_min?: number
    experience_max?: number
    limit?: number
  }): Promise<CeipalCandidate[]> {
    const res = await this.client.get('/candidates/search', { params })
    return res.data.data ?? res.data
  }

  // ─── Stage Updates ───────────────────────────────────────────────────────

  /**
   * Core method: every agent calls this after completing its task.
   * Maps internal pipeline state → Ceipal stage name and logs notes.
   */
  async updateCandidateStage(update: CeipalStageUpdate): Promise<void> {
    const ceipalStage = STATE_TO_CEIPAL_STAGE[update.stage] ?? update.stage
    logger.info(AGENT, `Stage update: ${update.stage} → Ceipal "${ceipalStage}"`, {
      candidateId: update.candidate_id,
      jobId: update.job_id,
    })
    await this.client.patch(`/jobs/${update.job_id}/candidates/${update.candidate_id}/stage`, {
      stage: ceipalStage,
      notes: update.notes,
      updated_by: update.updated_by,
    })
  }

  // ─── Notes ───────────────────────────────────────────────────────────────

  async addNote(candidateId: string, jobId: string, note: string): Promise<void> {
    await this.client.post(`/jobs/${jobId}/candidates/${candidateId}/notes`, {
      note,
      created_by: 'zodiac-agent',
    })
    logger.info(AGENT, 'Note added', { candidateId, jobId })
  }

  // ─── Documents ───────────────────────────────────────────────────────────

  async uploadDocument(
    candidateId: string,
    jobId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ): Promise<string> {
    const FormData = (await import('form-data')).default
    const form = new FormData()
    form.append('file', fileBuffer, { filename: fileName, contentType: mimeType })
    form.append('job_id', jobId)
    form.append('document_type', 'resume')

    const res = await this.client.post(
      `/candidates/${candidateId}/documents`,
      form,
      { headers: form.getHeaders() }
    )
    logger.info(AGENT, 'Document uploaded', { candidateId, fileName, url: res.data.url })
    return res.data.url as string
  }

  // ─── Conversation History (stored as notes for WhatsApp agent) ──────────

  async getConversationHistory(candidateId: string, jobId: string): Promise<string> {
    try {
      const res = await this.client.get(
        `/jobs/${jobId}/candidates/${candidateId}/notes`,
        { params: { tag: 'whatsapp_history', limit: 1 } }
      )
      return res.data.data?.[0]?.note ?? ''
    } catch {
      return ''
    }
  }

  async saveConversationHistory(candidateId: string, jobId: string, history: string): Promise<void> {
    await this.client.post(`/jobs/${jobId}/candidates/${candidateId}/notes`, {
      note: history,
      tag: 'whatsapp_history',
      created_by: 'zodiac-whatsapp-agent',
    })
  }
}

// Singleton export
export const ceipal = new CeipalService()
