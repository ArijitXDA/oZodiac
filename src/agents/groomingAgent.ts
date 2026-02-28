import { generateText } from 'ai'
import { anthropic, DEFAULT_MODEL } from '@/lib/llm'
import { whatsapp } from '@/integrations/whatsapp'
import { sendEmail } from '@/integrations/sendgrid'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'

const AGENT = 'GroomingAgent'

/**
 * Grooming agent — generates a 10-question interview prep kit tailored to
 * the candidate's profile and the target JD, then sends it via WhatsApp + email.
 *
 * Triggered after CV_SHORTLISTED.
 */
class GroomingAgent {
  async sendGroomingKit(jd: JD, candidate: Candidate): Promise<void> {
    logger.info(AGENT, `Generating grooming kit for ${candidate.name}`)

    const { text: groomingContent } = await generateText({
      model:  anthropic(DEFAULT_MODEL),
      system: `You are a senior recruitment consultant at Zodiac HRC preparing a candidate for an interview.
Generate a practical, role-specific interview preparation kit. Be specific — not generic.
Use the candidate's background to highlight what they should emphasize.`,
      prompt: `Generate a comprehensive interview preparation kit for this candidate.

ROLE BEING INTERVIEWED FOR: ${jd.title}
INDUSTRY: ${jd.industry}
KEY SKILLS REQUIRED: ${jd.skills.must.join(', ')}

CANDIDATE BACKGROUND:
Name: ${candidate.name}
Current Role: ${candidate.currentTitle} at ${candidate.currentEmployer}
Experience: ${candidate.totalExperience} years

Generate EXACTLY:
1. A brief "How to present yourself" intro (3-4 sentences)
2. 10 likely interview questions (numbered), each with:
   - The question
   - A 2-3 sentence suggested answer framework based on their background
3. 5 questions the candidate should ask the interviewer
4. Key keywords to use repeatedly (skills from the JD)
5. Red flags to avoid mentioning

Format clearly with headers. Keep tone professional but friendly.`,
    })

    // Send shortened version on WhatsApp
    const whatsappMessage = this.buildWhatsAppVersion(candidate.name, jd.title, groomingContent)
    await whatsapp.sendText({ to: candidate.phone, text: whatsappMessage })

    // Send full kit via email
    await sendEmail({
      to:      candidate.email,
      subject: `Interview Prep Kit — ${jd.title} | Zodiac HRC`,
      html:    `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.8; max-width: 700px; margin: auto">
                  <h2 style="color: #1a5f3c">Interview Preparation Kit</h2>
                  <h3>${jd.title} | Zodiac HRC</h3>
                  <hr/>
                  <pre style="white-space: pre-wrap">${groomingContent}</pre>
                  <hr/>
                  <p style="color: #666; font-size: 12px">Confidential — Prepared by Zodiac HRC for ${candidate.name}</p>
                </div>`,
      text: groomingContent,
    })

    logger.info(AGENT, `Grooming kit sent to ${candidate.name}`)
  }

  private buildWhatsAppVersion(name: string, role: string, fullContent: string): string {
    // Extract just the 10 questions for WhatsApp (brief version)
    const lines = fullContent.split('\n')
    const questionLines = lines
      .filter((l) => /^\d+\./.test(l.trim()))
      .slice(0, 10)
      .join('\n')

    return `Hi ${name}! 🎯

Great news — your profile has been shortlisted for *${role}*!

Here are your top 10 interview prep questions:

${questionLines}

📧 Full preparation kit with suggested answers sent to your email.

All the best! 💪 — Zodiac HRC`
  }
}

export const groomingAgent = new GroomingAgent()
