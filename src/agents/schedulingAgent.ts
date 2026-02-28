import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { createCalendarEvent } from '@/integrations/googleCalendar'
import { whatsapp } from '@/integrations/whatsapp'
import { sendEmail } from '@/integrations/sendgrid'
import { logger } from '@/lib/logger'
import type { Candidate } from '@/schemas/candidate'
import type { JD } from '@/schemas/jd'

const AGENT = 'SchedulingAgent'

const InterviewSlotSchema = z.object({
  selectedSlot: z.string().describe('ISO 8601 datetime of the selected interview slot'),
  endTime:      z.string().describe('ISO 8601 end datetime (typically +1 hour)'),
  reasoning:    z.string().describe('Why this slot was selected'),
})

interface ScheduleParams {
  candidate: Candidate
  hrEmail: string
  mode: 'f2f' | 'virtual'
  proposedSlots: string[]     // ISO 8601 strings
  jd?: JD
  round?: number
}

class SchedulingAgent {
  /**
   * Select best slot, create calendar event, and notify candidate + HR.
   * Returns the Google Calendar event ID.
   */
  async scheduleInterview(params: ScheduleParams): Promise<string> {
    const { candidate, hrEmail, mode, proposedSlots, jd, round = 1 } = params
    logger.info(AGENT, `Scheduling Round ${round} interview for ${candidate.name}`)

    // Pick best slot via AI (considers IST business hours, round number)
    const { object: slotChoice } = await generateObject({
      model:  anthropic(FAST_MODEL),
      schema: InterviewSlotSchema,
      prompt: `Select the best interview slot from the proposed options.

Candidate: ${candidate.name} (${candidate.location})
Mode: ${mode}
Round: ${round}
Proposed slots: ${proposedSlots.join(', ')}

Prefer:
- IST business hours (10am-5pm)
- Mid-week (Tue-Thu) for first rounds
- Morning slots for senior roles
- Give at least 24 hours notice`,
    })

    const eventTitle = `Interview Round ${round} — ${candidate.name} | ${jd?.title ?? 'Role'}`

    const eventId = await createCalendarEvent({
      summary:       eventTitle,
      description:   `Candidate: ${candidate.name}\nPhone: ${candidate.phone}\nCurrent Role: ${candidate.currentTitle} at ${candidate.currentEmployer}\n${jd ? `\nRole: ${jd.title}\nIndustry: ${jd.industry}` : ''}`,
      startDateTime: slotChoice.selectedSlot,
      endDateTime:   slotChoice.endTime,
      attendees:     [candidate.email, hrEmail],
      meetLink:      mode === 'virtual',
    })

    // Notify candidate via WhatsApp
    const dateStr = new Date(slotChoice.selectedSlot).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'short',
    })

    await whatsapp.sendText({
      to:   candidate.phone,
      text: `Hi ${candidate.name}! 🎉

Your *Round ${round} Interview* has been scheduled!

📅 *Date & Time:* ${dateStr} IST
💼 *Role:* ${jd?.title ?? 'As discussed'}
🎯 *Mode:* ${mode === 'virtual' ? 'Virtual (Google Meet link sent to your email)' : 'Face-to-Face'}
${mode === 'f2f' ? `📍 *Venue:* Details sent to your email` : ''}

📧 Calendar invite sent to ${candidate.email}

Please confirm receipt. Best of luck! 🤞
— Zodiac HRC`,
    })

    // Notify HR via email
    await sendEmail({
      to:      hrEmail,
      subject: `Interview Scheduled — ${candidate.name} | Round ${round}`,
      html:    `<p>Dear HR,</p>
               <p>Interview has been scheduled as below:</p>
               <table style="border-collapse: collapse; font-family: Arial">
                 <tr><td style="padding: 6px; font-weight: bold">Candidate</td><td style="padding: 6px">${candidate.name}</td></tr>
                 <tr><td style="padding: 6px; font-weight: bold">Round</td><td style="padding: 6px">${round}</td></tr>
                 <tr><td style="padding: 6px; font-weight: bold">Date/Time</td><td style="padding: 6px">${dateStr} IST</td></tr>
                 <tr><td style="padding: 6px; font-weight: bold">Mode</td><td style="padding: 6px">${mode.toUpperCase()}</td></tr>
               </table>
               <p>Calendar invite has been sent to all attendees.</p>
               <p>Regards,<br/>Zodiac HRC</p>`,
    })

    logger.info(AGENT, `Interview scheduled`, { eventId, slot: slotChoice.selectedSlot })
    return eventId
  }

  /**
   * Send T-1 reminder to candidate.
   */
  async sendTMinus1Reminder(candidate: Candidate, jd: JD, interviewTime: string): Promise<void> {
    const dateStr = new Date(interviewTime).toLocaleString('en-IN', {
      timeZone:  'Asia/Kolkata',
      timeStyle: 'short',
    })
    await whatsapp.sendText({
      to:   candidate.phone,
      text: `Hi ${candidate.name}! 👋

Friendly reminder — your interview for *${jd.title}* is *TOMORROW at ${dateStr} IST*.

✅ Tips for tomorrow:
• Keep your documents ready
• Test your internet/camera if virtual
• Be online 5 minutes early
• Stay confident — you've got this!

Good luck! 💪 — Zodiac HRC`,
    })
    logger.info(AGENT, `T-1 reminder sent to ${candidate.name}`)
  }
}

export const schedulingAgent = new SchedulingAgent()
