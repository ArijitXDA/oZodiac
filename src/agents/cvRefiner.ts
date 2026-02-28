import { generateText } from 'ai'
import {
  Document, Paragraph, TextRun, HeadingLevel,
  AlignmentType,
} from 'docx'
import { anthropic, DEFAULT_MODEL } from '@/lib/llm'
import { logger } from '@/lib/logger'
import type { JD } from '@/schemas/jd'
import type { Candidate } from '@/schemas/candidate'

const AGENT = 'CVRefinerAgent'

interface RefineResult {
  docxBuffer: Buffer
  summaryNote: string   // "Why shortlisted?" — sent to HR
  refinedText: string   // clean text version for email body preview
}

class CVRefinerAgent {
  async refine(jd: JD, candidate: Candidate): Promise<RefineResult> {
    logger.info(AGENT, `Refining CV for ${candidate.name}`)

    // Step 1: Generate refined CV text and summary note via Claude
    const { text: refinedText } = await generateText({
      model:  anthropic(DEFAULT_MODEL),
      system: `You are a professional CV writer at Zodiac HRC, Mumbai.
Your task is to rewrite and highlight a candidate's resume to align with a specific job description.

Rules:
- Do NOT fabricate experience, skills, or achievements
- Reorder bullet points to surface most relevant experience first
- Rephrase existing bullets to use keywords from the JD naturally
- Keep education, certifications, and dates factually accurate
- Format: Name → Summary → Experience (reverse chrono) → Skills → Education
- Keep total length under 2 A4 pages
- Write in professional third-person ("Led a team of..." not "I led...")`,
      prompt: `Rewrite the following candidate's CV to align with the job description.

JOB DESCRIPTION:
${JSON.stringify(jd, null, 2)}

CANDIDATE PROFILE:
Name: ${candidate.name}
Current Role: ${candidate.currentTitle} at ${candidate.currentEmployer}
Total Experience: ${candidate.totalExperience} years
Location: ${candidate.location}
CTC: ${candidate.currentCTC} LPA current / ${candidate.expectedCTC} LPA expected
Notice Period: ${candidate.noticePeriod} days

Raw Resume Text:
${candidate.resumeText ?? `${candidate.currentTitle} at ${candidate.currentEmployer} for ${candidate.totalExperience} years`}

First output the refined CV text, then on a new line output:
===SUMMARY_NOTE===
A 3-4 sentence "Why Shortlisted?" note for the HR covering: role fit, key differentiators, compensation alignment, and notice period.`,
    })

    // Split refined CV and summary note
    const [cvText, summaryRaw] = refinedText.split('===SUMMARY_NOTE===')
    const summaryNote = summaryRaw?.trim() ?? `${candidate.name} is a strong fit for ${jd.title}.`

    // Step 2: Generate DOCX
    const docxBuffer = await this.buildDocx(candidate.name, cvText.trim())

    logger.info(AGENT, `CV refined for ${candidate.name}`, { summaryLen: summaryNote.length })
    return { docxBuffer, summaryNote, refinedText: cvText.trim() }
  }

  private async buildDocx(candidateName: string, cvText: string): Promise<Buffer> {
    const lines = cvText.split('\n').filter((l) => l.trim())

    const children: Paragraph[] = [
      new Paragraph({
        text: candidateName,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: 'Confidential — Zodiac HRC',
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: 'Confidential — Zodiac HRC', italics: true, size: 18 })],
      }),
      ...lines.map((line) => {
        const isSection = line.startsWith('##') || line.toUpperCase() === line.trim() && line.length < 40
        const cleanLine  = line.replace(/^#+\s*/, '').trim()
        return new Paragraph({
          text:    cleanLine,
          heading: isSection ? HeadingLevel.HEADING_2 : undefined,
          spacing: { before: isSection ? 200 : 0, after: 60 },
          children: isSection ? undefined : [new TextRun({ text: cleanLine, size: 20 })],
        })
      }),
    ]

    const doc = new Document({
      sections: [{ properties: {}, children }],
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: { font: 'Calibri', size: 20 },
          },
        ],
      },
    })

    const { Packer } = await import('docx')
    const buffer = await Packer.toBuffer(doc)
    return Buffer.from(buffer)
  }
}

export const cvRefinerAgent = new CVRefinerAgent()
