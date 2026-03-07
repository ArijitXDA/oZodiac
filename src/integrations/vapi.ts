import { logger } from '@/lib/logger'

const AGENT = 'VapiIntegration'
const VAPI_BASE = 'https://api.vapi.ai'

export interface VapiCallParams {
  phoneNumber: string        // E.164 format, e.g. +919876543210
  assistantConfig: {
    firstMessage:     string  // What the AI says when candidate picks up
    systemPrompt:     string  // Full assistant personality + instructions
    endCallMessage:   string  // Final message before hanging up
  }
  metadata?: Record<string, string>  // Passed back in webhook payload
}

export interface VapiCall {
  id:          string
  status:      'queued' | 'ringing' | 'in-progress' | 'ended' | 'failed'
  phoneNumber: string
  startedAt?:  string
  endedAt?:    string
  transcript?: string
  summary?:    string
  recordingUrl?: string
  endedReason?:  string
}

class VapiService {
  private apiKey = process.env.VAPI_API_KEY!
  private phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID!

  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${VAPI_BASE}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Vapi ${opts.method ?? 'GET'} ${path} failed (${res.status}): ${text}`)
    }
    return res.json() as Promise<T>
  }

  /**
   * Initiate an outbound phone call using an inline assistant config.
   * Returns the Vapi call ID immediately — result comes via webhook.
   */
  async initiateCall(params: VapiCallParams): Promise<string> {
    const payload = {
      phoneNumberId: this.phoneNumberId,
      customer: { number: params.phoneNumber },
      assistant: {
        model: {
          provider: 'anthropic',
          model:    'claude-haiku-4-5-20251001',
          messages: [{ role: 'system', content: params.assistantConfig.systemPrompt }],
        },
        voice: {
          provider: 'playht',
          voiceId:  'jennifer',  // Professional Indian-English accent
        },
        firstMessage:   params.assistantConfig.firstMessage,
        endCallMessage: params.assistantConfig.endCallMessage,
        maxDurationSeconds: 300,  // 5 min max call
      },
      metadata: params.metadata ?? {},
    }

    const call = await this.request<{ id: string }>('/call/phone', {
      method: 'POST',
      body:   JSON.stringify(payload),
    })

    logger.info(AGENT, `Call initiated`, { callId: call.id, to: params.phoneNumber })
    return call.id
  }

  /**
   * Fetch call details by ID (for polling or post-call enrichment).
   */
  async getCall(callId: string): Promise<VapiCall> {
    return this.request<VapiCall>(`/call/${callId}`)
  }
}

export const vapiService = new VapiService()
