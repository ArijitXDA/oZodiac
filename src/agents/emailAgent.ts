import { generateText } from 'ai'
import { anthropic, FAST_MODEL } from '@/lib/llm'
import { sendEmail } from '@/integrations/sendgrid'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'

const AGENT = 'EmailAgent'

class EmailAgent {
  /**
   * Send refined CV + cover note to HR.
   * Triggered when CV_SUBMITTED state is entered.
   */
  async sendCVToHR(params: {
    hrEmail: string
    candidate: Candidate
    jd: JD
    docxBuffer: Buffer
    summaryNote: string
    refinedText: string
  }): Promise<void> {
    const { hrEmail, candidate, jd, docxBuffer, summaryNote } = params
    logger.info(AGENT, `Sending CV to HR`, { hrEmail, candidate: candidate.name })

    const { text: coverNote } = await generateText({
      model:  anthropic(FAST_MODEL),
      system: `You are a recruitment consultant at Zodiac HRC, writing a professional email to a client HR
to submit a shortlisted candidate's profile. Be concise, professional, and persuasive.`,
      prompt: `Write a professional email cover note to submit this candidate's CV to the HR.

Role: ${jd.title}
Candidate: ${candidate.name}
Why shortlisted: ${summaryNote}
Current CTC: ${candidate.currentCTC} LPA | Expected: ${candidate.expectedCTC} LPA
Notice Period: ${candidate.noticePeriod} days

Format:
- Subject line (start with "Subject:")
- Brief professional email body (3-4 paragraphs)
- Sign off as "Recruitment Team, Zodiac HRC"`,
    })

    const [subjectLine, ...bodyLines] = coverNote.split('\n').filter(Boolean)
    const subject = subjectLine.replace(/^Subject:\s*/i, '').trim()
    const body    = bodyLines.join('\n')

    await sendEmail({
      to:      hrEmail,
      subject,
      html:    `<pre style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6">${body}</pre>`,
      text:    body,
      attachments: [{
        content:     docxBuffer.toString('base64'),
        filename:    `${candidate.name.replace(/\s+/g, '_')}_Zodiac_HRC.docx`,
        type:        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        disposition: 'attachment',
      }],
    })
    logger.info(AGENT, 'CV email sent to HR', { subject })
  }

  /**
   * Request offer + CTC details from HR after DOJ is confirmed.
   */
  async sendOfferCTCRequest(params: {
    hrEmail: string
    candidate: Candidate
    jd: JD
    doj: string
  }): Promise<void> {
    const { hrEmail, candidate, jd, doj } = params
    const subject = `Offer Details Required — ${candidate.name} | ${jd.title}`
    const body    = `Dear HR Team,

Congratulations on the successful placement of ${candidate.name} for the ${jd.title} role.

We would need the following details to process our invoice:
1. Final Offer Letter (PDF)
2. Confirmed CTC breakup
3. Date of Joining: ${doj}

Please share these at your earliest convenience.

Best regards,
Recruitment Team
Zodiac HRC`

    await sendEmail({ to: hrEmail, subject, html: `<pre>${body}</pre>`, text: body })
    logger.info(AGENT, 'Offer+CTC request sent', { hrEmail, candidate: candidate.name })
  }

  /**
   * Send documentation checklist to candidate after selection.
   */
  async sendDocumentationChecklist(params: {
    candidate: Candidate
    jd: JD
  }): Promise<void> {
    const { candidate, jd } = params
    const subject = `Congratulations! Next Steps — ${jd.title} Opportunity`
    const body    = `Dear ${candidate.name},

Congratulations! You have been selected for the ${jd.title} position.

To proceed, please prepare and share the following documents:

📋 REQUIRED DOCUMENTS:
1. Updated CV / Resume
2. Last 3 months salary slips
3. Current/last CTC proof (offer letter or Form 16)
4. Bank statement (last 3 months)
5. Aadhaar Card / PAN Card (both sides)
6. Passport-size photograph (soft copy)
7. Educational certificates (10th, 12th, Graduation)
8. Experience letters from all previous employers
9. Resignation acceptance letter (when available)
10. No-Objection Certificate (if applicable)

Please share scanned copies via email or WhatsApp at your earliest.

Warm regards,
Recruitment Team
Zodiac HRC`

    await sendEmail({
      to:      candidate.email,
      subject,
      html:    `<pre style="font-family: Arial; font-size: 14px; line-height: 1.8">${body}</pre>`,
      text:    body,
    })
    logger.info(AGENT, 'Documentation checklist sent', { candidate: candidate.name })
  }

  /**
   * Invoice email to HR (for billing/accounts team).
   */
  async sendInvoice(params: {
    hrEmail: string
    candidate: Candidate
    jd: JD
    offeredCTC: number
    doj: string
    invoiceNumber: string
    feePercent: number
  }): Promise<void> {
    const { hrEmail, candidate, jd, offeredCTC, doj, invoiceNumber, feePercent } = params
    const fee = ((offeredCTC * feePercent) / 100).toFixed(2)
    const subject = `Invoice #${invoiceNumber} — Placement of ${candidate.name} | ${jd.title}`
    const body    = `Dear HR / Accounts Team,

Thank you for entrusting Zodiac HRC with this placement.

INVOICE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━
Invoice No.    : ${invoiceNumber}
Candidate      : ${candidate.name}
Position       : ${jd.title}
Date of Joining: ${doj}
Offered CTC    : ₹${offeredCTC} LPA
Placement Fee  : ${feePercent}% of CTC
Invoice Amount : ₹${fee} LPA
━━━━━━━━━━━━━━━━━━━━━━━━━

Payment Terms: As per agreement.

Please process at your earliest and share payment confirmation.

Best regards,
Accounts Team
Zodiac HRC`

    await sendEmail({ to: hrEmail, subject, html: `<pre>${body}</pre>`, text: body })
    logger.info(AGENT, 'Invoice email sent', { invoiceNumber, candidate: candidate.name })
  }
}

export const emailAgent = new EmailAgent()
