import { NextRequest, NextResponse } from 'next/server'
import { jdParserAgent } from '@/agents/jdParser'
import { logger } from '@/lib/logger'

/**
 * POST /api/agents/jd-parse
 * Direct invocation of the JD Parser Agent.
 *
 * Body: { jdText: string, callTranscript?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { jdText, callTranscript } = await req.json()

    if (!jdText || typeof jdText !== 'string') {
      return NextResponse.json({ error: 'jdText is required' }, { status: 400 })
    }

    let result = await jdParserAgent.parse(jdText)

    if (callTranscript) {
      result = await jdParserAgent.refineWithCallContext(result, callTranscript)
    }

    return NextResponse.json({ success: true, jd: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('JDParseRoute', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
