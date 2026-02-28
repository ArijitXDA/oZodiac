import { generateText, tool } from 'ai'
import { z } from 'zod'
import { anthropic, DEFAULT_MODEL } from '@/lib/llm'
import { whatsapp } from '@/integrations/whatsapp'
import { ceipal } from '@/integrations/ceipal'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'
import type { PipelineState } from '@/schemas/pipeline'

const AGENT = 'WhatsAppChatAgent'

/**
 * WhatsApp chat agent for multi-turn candidate engagement.
 * Handles: initial contact → interest check → JD share → confirmation → reminders
 *
 * Uses Vercel AI SDK streamText with tool calls for message sending and state updates.
 */

interface ConversationContext {
  candidate: Candidate
  jd: JD
  jobId: string
  currentState: PipelineState
  incomingMessage?: string   // set when handling an inbound reply
}

// Structured output for the agent's decision
const AgentDecisionSchema = z.object({
  reply: z.string().describe('The WhatsApp message to send to the candidate'),
  nextState: z.string().optional().describe('Pipeline state to transition to, if applicable'),
  flagForHuman: z.boolean().default(false).describe('True if recruiter review is needed'),
  flagReason: z.string().optional(),
})

class WhatsAppChatAgent {
  /**
   * Initiate first contact with a candidate (outbound).
   */
  async initiateContact(context: Omit<ConversationContext, 'incomingMessage'>): Promise<{
    messageSent: string
    nextState: PipelineState | null
  }> {
    logger.info(AGENT, `Initiating contact with ${context.candidate.name}`)

    const { text } = await generateText({
      model:  anthropic(DEFAULT_MODEL),
      system: this.systemPrompt(context),
      prompt: `Write the FIRST outbound WhatsApp message to initiate contact with this candidate.
The message should:
1. Introduce yourself as a consultant from Zodiac HRC
2. Mention you have an exciting ${context.jd.title} opportunity
3. Briefly mention the company type and role level (NOT the client name)
4. Ask if they are open to exploring — single clear call-to-action
5. Keep it under 120 words — WhatsApp friendly, conversational

Return ONLY the message text, nothing else.`,
    })

    await whatsapp.sendText({ to: context.candidate.phone, text })
    await this.persistHistory(context, [{ role: 'assistant', content: text }])

    logger.info(AGENT, `Initial contact sent to ${context.candidate.phone}`)
    return { messageSent: text, nextState: 'CALLING' }
  }

  /**
   * Handle an inbound reply from a candidate.
   * Uses multi-turn tool-calling loop to decide next action.
   */
  async handleReply(context: ConversationContext): Promise<{
    reply: string
    nextState: PipelineState | null
    flagForHuman: boolean
  }> {
    const { candidate, jd, jobId, currentState, incomingMessage } = context
    logger.info(AGENT, `Handling reply from ${candidate.name}`, { state: currentState })

    // Load conversation history from Ceipal
    const historyRaw = await ceipal.getConversationHistory(candidate.id, jobId)
    const history: Array<{ role: 'user' | 'assistant'; content: string }> =
      historyRaw ? JSON.parse(historyRaw) : []

    // Append incoming message
    if (incomingMessage) {
      history.push({ role: 'user', content: incomingMessage })
    }

    const { text } = await generateText({
      model:   anthropic(DEFAULT_MODEL),
      system:  this.systemPrompt(context),
      messages: history,
      tools: {
        sendMessage: tool({
          description: 'Send a WhatsApp message to the candidate',
          parameters: z.object({ message: z.string() }),
          execute: async ({ message }) => {
            await whatsapp.sendText({ to: candidate.phone, text: message })
            return { sent: true }
          },
        }),
        updatePipelineState: tool({
          description: 'Update the candidate pipeline state based on conversation outcome',
          parameters: z.object({
            newState: z.string(),
            notes:    z.string(),
          }),
          execute: async ({ newState, notes }) => {
            logger.info(AGENT, `State update requested: ${currentState} → ${newState}`, { notes })
            return { acknowledged: true, newState }
          },
        }),
        flagForHumanReview: tool({
          description: 'Flag this conversation for a human recruiter to review',
          parameters: z.object({ reason: z.string() }),
          execute: async ({ reason }) => {
            logger.warn(AGENT, `Human review flagged: ${reason}`)
            return { flagged: true }
          },
        }),
        shareJD: tool({
          description: 'Share the job description with the candidate over WhatsApp',
          parameters: z.object({ includeCompanyInfo: z.boolean() }),
          execute: async ({ includeCompanyInfo }) => {
            const jdMessage = this.buildJDMessage(jd, includeCompanyInfo)
            await whatsapp.sendText({ to: candidate.phone, text: jdMessage })
            return { sent: true }
          },
        }),
      },
      maxSteps: 8,
      prompt: `The candidate just replied. Based on their message and conversation history,
decide the appropriate next action and respond naturally.

Current pipeline state: ${currentState}
Candidate's latest message: "${incomingMessage}"

Determine:
1. Candidate's intent (interested / not interested / needs more info / unclear)
2. Appropriate reply
3. Whether to advance/change pipeline state
4. Whether human review is needed (edge cases, salary negotiation, strong objections)`,
    })

    // Parse tool call results to determine next state
    // The agent text itself contains the reply sent via tool
    const nextState = this.extractNextState(text)
    const flagged   = text.includes('flagForHumanReview')

    // Persist updated history
    history.push({ role: 'assistant', content: text })
    await ceipal.saveConversationHistory(candidate.id, jobId, JSON.stringify(history))

    return {
      reply:         text,
      nextState:     nextState as PipelineState | null,
      flagForHuman:  flagged,
    }
  }

  /**
   * Send a structured reminder (interview reminder, T-1 day reminder, DOJ reminder).
   */
  async sendReminder(
    candidate: Candidate,
    type: 'interview_confirmation' | 't_minus_1' | 'doj_confirmation',
    details: Record<string, string>
  ): Promise<void> {
    const templates: Record<typeof type, string> = {
      interview_confirmation: `Hi ${candidate.name}, this is a reminder that your interview for the ${details.role} role is scheduled for ${details.dateTime}. Mode: ${details.mode}. ${details.mode === 'virtual' ? `Link: ${details.link}` : `Address: ${details.address}`}. Please confirm your attendance. — Zodiac HRC`,
      t_minus_1: `Hi ${candidate.name}, your interview for ${details.role} is TOMORROW at ${details.time}. Please be prepared with your documents and be on time. Best of luck! — Zodiac HRC`,
      doj_confirmation: `Hi ${candidate.name}, congratulations! Your joining date is confirmed as ${details.doj}. Please carry all original documents on Day 1. Looking forward to your new chapter! — Zodiac HRC`,
    }
    await whatsapp.sendText({ to: candidate.phone, text: templates[type] })
    logger.info(AGENT, `Reminder sent: ${type}`, { candidateName: candidate.name })
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private systemPrompt(ctx: Omit<ConversationContext, 'incomingMessage'>): string {
    return `You are a professional recruitment consultant at Zodiac HRC, Mumbai.
You are communicating with candidates via WhatsApp to evaluate their interest in job opportunities.

Current candidate: ${ctx.candidate.name} | ${ctx.candidate.currentTitle} at ${ctx.candidate.currentEmployer}
Current CTC: ${ctx.candidate.currentCTC} LPA | Expected: ${ctx.candidate.expectedCTC} LPA
Role being pitched: ${ctx.jd.title} (${ctx.jd.compensationBand.min}-${ctx.jd.compensationBand.max} LPA)

Communication guidelines:
- Be warm, professional, and concise — WhatsApp messages, not essays
- Never reveal the client company name until candidate confirms interest
- Never share raw JD text — always pitch the role attractively
- If candidate is not interested, log the reason gracefully
- If salary expectations are too far off, acknowledge and close politely
- If conversation becomes complex or candidate shows strong objections, flag for human review`
  }

  private buildJDMessage(jd: JD, includeCompanyInfo: boolean): string {
    return `*${jd.title}*
${includeCompanyInfo ? `📍 ${jd.location} | ${jd.workMode}` : `📍 ${jd.location}`}

*About the Role:*
${jd.summary}

*Key Skills:* ${jd.skills.must.slice(0, 5).join(' • ')}

*Experience:* ${jd.experienceBand.min}-${jd.experienceBand.max} years
*CTC Range:* ${jd.compensationBand.min}-${jd.compensationBand.max} LPA

Please confirm if you'd like to proceed. We'll share full details on confirmation. 🙏`
  }

  private extractNextState(text: string): string | null {
    if (text.includes('CONSENTED') || text.includes('consented'))      return 'CONSENTED'
    if (text.includes('NOT_INTERESTED') || text.includes('not interested')) return 'NOT_INTERESTED'
    if (text.includes('CONFIRMED') || text.includes('confirmed'))      return 'CANDIDATE_CONFIRMED'
    if (text.includes('JD_SHARED'))                                    return 'JD_SHARED'
    return null
  }

  private async persistHistory(
    ctx: Omit<ConversationContext, 'incomingMessage'>,
    messages: Array<{ role: string; content: string }>
  ): Promise<void> {
    await ceipal.saveConversationHistory(
      ctx.candidate.id,
      ctx.jobId,
      JSON.stringify(messages)
    )
  }
}

export const whatsappChatAgent = new WhatsAppChatAgent()
