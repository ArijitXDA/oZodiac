import { google } from 'googleapis'
import { logger } from '@/lib/logger'

const AGENT = 'GoogleCalendarIntegration'

function getAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN })
  return auth
}

export interface CalendarEvent {
  summary: string
  description?: string
  startDateTime: string   // ISO 8601
  endDateTime: string     // ISO 8601
  attendees: string[]     // email addresses
  location?: string
  meetLink?: boolean      // auto-create Google Meet
}

export async function createCalendarEvent(event: CalendarEvent): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: getAuthClient() })

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startDateTime, timeZone: 'Asia/Kolkata' },
      end:   { dateTime: event.endDateTime,   timeZone: 'Asia/Kolkata' },
      attendees: event.attendees.map((email) => ({ email })),
      location: event.location,
      conferenceData: event.meetLink
        ? { createRequest: { requestId: `zodiac-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        : undefined,
    },
    conferenceDataVersion: event.meetLink ? 1 : 0,
  })

  const eventId = res.data.id!
  logger.info(AGENT, 'Calendar event created', { eventId, summary: event.summary })
  return eventId
}
