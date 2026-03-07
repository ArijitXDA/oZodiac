import { vapiService } from '@/integrations/vapi'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'
import type { Candidate } from '@/schemas/candidate'
import type { JD } from '@/schemas/jd'

const AGENT = 'VoiceAgent'

interface VoiceOutreachResult {
  callId: string
}

class VoiceAgent {
  /**
   * Initiate an outbound voice call to a candidate.
   * 1. Upserts candidate_phone_lookup so inbound WhatsApp can route back.
   * 2. Builds a call script from JD + candidate data.
   * 3. Triggers a Vapi call and persists the callId on the pipeline record.
   * Returns the Vapi call ID — the call result arrives via the /api/webhooks/vapi webhook.
   */
  async initiateOutreach(
    candidate: Candidate,
    jd: JD,
    jobId: string
  ): Promise<VoiceOutreachResult> {
    logger.info(AGENT, `Initiating voice outreach to ${candidate.name}`, {
      phone: candidate.phone,
      jobId,
    })

    // Register phone lookup (same pattern as whatsappAgent.initiateContact)
    await supabase.from('candidate_phone_lookup').upsert(
      {
        phone:           candidate.phone,
        candidate_id:    candidate.id,
        job_id:          jobId,
        candidate_name:  candidate.name,
        candidate_email: candidate.email,
        is_active:       true,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: 'phone' }
    )

    const callId = await vapiService.initiateCall({
      phoneNumber: candidate.phone,
      assistantConfig: {
        firstMessage: this.buildFirstMessage(candidate, jd),
        systemPrompt: this.buildSystemPrompt(candidate, jd),
        endCallMessage: `Thank you for your time, ${candidate.name.split(' ')[0]}. We'll follow up on WhatsApp shortly. Have a great day!`,
      },
      metadata: {
        candidateId: candidate.id,
        jobId,
        candidateName: candidate.name,
        jobTitle: jd.title,
      },
    })

    // Persist call ID on the pipeline record so the webhook can look it up
    const { error } = await supabase
      .from('pipeline_records')
      .update({ last_call_id: callId, updated_at: new Date().toISOString() })
      .eq('candidate_id', candidate.id)
      .eq('job_id', jobId)

    if (error) {
      logger.warn(AGENT, `Could not persist callId on pipeline record: ${error.message}`)
    }

    logger.info(AGENT, `Voice call queued`, { callId, candidate: candidate.name })
    return { callId }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildFirstMessage(candidate: Candidate, jd: JD): string {
    const firstName = candidate.name.split(' ')[0]
    return `Hello, may I speak with ${firstName}? This is calling from Zodiac HRC, a recruitment consulting firm in Mumbai. I'm reaching out about an exciting ${jd.title} opportunity that I thought might be a great fit for your profile. Do you have about 3 minutes?`
  }

  private buildSystemPrompt(candidate: Candidate, jd: JD): string {
    return `You are a professional recruitment consultant calling on behalf of Zodiac HRC, Mumbai.
You are making an outbound call to ${candidate.name}, currently working as ${candidate.currentTitle} at ${candidate.currentEmployer}.

Candidate profile:
- Current CTC: ${candidate.currentCTC} LPA | Expected: ${candidate.expectedCTC} LPA
- Total experience: ${candidate.totalExperience} years
- Location: ${candidate.location}
- Notice period: ${candidate.noticePeriod} days

Role you are pitching:
- Title: ${jd.title}
- Location: ${jd.location} (${jd.workMode})
- CTC range: ${jd.compensationBand.min}–${jd.compensationBand.max} LPA
- Experience required: ${jd.experienceBand.min}–${jd.experienceBand.max} years
- Key skills: ${jd.skills.must.slice(0, 5).join(', ')}

Call objectives (in order):
1. Confirm you are speaking with the candidate.
2. Briefly introduce yourself and the opportunity (do NOT mention the client company name).
3. Gauge interest — is the candidate open to exploring this role?
4. If interested: confirm their current CTC, expected CTC, and notice period.
5. If consent given: let them know you will send the JD on WhatsApp for review.
6. If not interested or wrong time: note the reason politely and close the call.

Rules:
- Keep the call under 4 minutes.
- Do not pressure the candidate.
- Be warm, professional, and concise.
- If salary expectation is more than 30% above the band, acknowledge the gap honestly and close politely.
- If the candidate asks for the client name, say it will be shared after initial interest confirmation.`
  }
}

export const voiceAgent = new VoiceAgent()
