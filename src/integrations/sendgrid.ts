import sgMail from '@sendgrid/mail'
import { logger } from '@/lib/logger'

const AGENT = 'SendGridIntegration'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'noreply@zodiac-hrc.com',
  name:  process.env.SENDGRID_FROM_NAME  || 'Zodiac HRC',
}

export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{
    content: string   // base64
    filename: string
    type: string
    disposition?: 'attachment' | 'inline'
  }>
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to]
  await sgMail.send({
    from:        FROM,
    to:          recipients,
    subject:     payload.subject,
    html:        payload.html,
    text:        payload.text,
    attachments: payload.attachments,
  })
  logger.info(AGENT, `Email sent: "${payload.subject}"`, { to: recipients })
}
