import { NextResponse } from 'next/server'
import { supabase } from '@/integrations/supabase'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/escalations
 * Returns all open escalations sorted by most recent.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('escalations')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return NextResponse.json({ escalations: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('EscalationsAPI', `Failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
