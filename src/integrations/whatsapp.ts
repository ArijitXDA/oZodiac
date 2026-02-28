import axios from 'axios'
import { logger } from '@/lib/logger'

const AGENT = 'WhatsAppIntegration'

const BASE_URL = 'https://graph.facebook.com/v21.0'

interface TextMessage {
  to: string
  text: string
}

interface TemplateMessage {
  to: string
  templateName: string
  languageCode?: string
  components?: object[]
}

export interface IncomingWhatsAppMessage {
  from: string          // phone number in E.164
  messageId: string
  text: string
  timestamp: number
  candidateId?: string  // resolved by webhook handler
  jobId?: string        // resolved by webhook handler
}

class WhatsAppService {
  private phoneNumberId: string
  private accessToken: string

  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
    this.accessToken   = process.env.WHATSAPP_ACCESS_TOKEN!
  }

  private get url() {
    return `${BASE_URL}/${this.phoneNumberId}/messages`
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    }
  }

  async sendText({ to, text }: TextMessage): Promise<string> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }
    const res = await axios.post(this.url, payload, { headers: this.headers })
    const messageId = res.data.messages?.[0]?.id as string
    logger.info(AGENT, `Text sent to ${to}`, { messageId })
    return messageId
  }

  async sendTemplate({ to, templateName, languageCode = 'en', components = [] }: TemplateMessage): Promise<string> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }
    const res = await axios.post(this.url, payload, { headers: this.headers })
    const messageId = res.data.messages?.[0]?.id as string
    logger.info(AGENT, `Template "${templateName}" sent to ${to}`, { messageId })
    return messageId
  }

  /**
   * Parses a raw Meta webhook payload into a normalized IncomingWhatsAppMessage.
   * Returns null if the payload doesn't contain a text message.
   */
  parseWebhookPayload(body: Record<string, unknown>): IncomingWhatsAppMessage | null {
    try {
      const entry = (body.entry as Record<string, unknown>[])?.[0]
      const changes = (entry?.changes as Record<string, unknown>[])?.[0]
      const value = changes?.value as Record<string, unknown>
      const messages = value?.messages as Record<string, unknown>[]
      const msg = messages?.[0]

      if (!msg || msg.type !== 'text') return null

      return {
        from:      msg.from as string,
        messageId: msg.id as string,
        text:      (msg.text as Record<string, string>).body,
        timestamp: parseInt(msg.timestamp as string, 10) * 1000,
      }
    } catch {
      return null
    }
  }
}

export const whatsapp = new WhatsAppService()
