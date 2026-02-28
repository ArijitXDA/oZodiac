import { createAnthropic } from '@ai-sdk/anthropic'

/**
 * Shared Anthropic/Claude client for all agents.
 * Uses claude-opus-4-6 as the default model.
 */
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const DEFAULT_MODEL = 'claude-opus-4-6'

// Lighter model for simpler tasks (email drafting, reminders)
export const FAST_MODEL = 'claude-haiku-4-5-20251001'
