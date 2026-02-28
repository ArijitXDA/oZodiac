import { generateObject } from 'ai'
import { anthropic, DEFAULT_MODEL } from '@/lib/llm'
import { JDSchema, type JD } from '@/schemas/jd'
import { logger } from '@/lib/logger'

const AGENT = 'JDParserAgent'

const SYSTEM_PROMPT = `You are an expert HR analyst at Zodiac HRC, a Mumbai-based recruitment firm.
Your job is to parse job descriptions and extract structured information for sourcing and screening.

When generating the Boolean search string:
- Use (OR) for synonyms, AND for required combinations
- Include common job title variations
- Add industry-specific keywords
- Format for Naukri/LinkedIn/Shine search bars

For hiddenFilters, infer unstated requirements from industry context, job level, and company type.
Always output realistic INR salary bands based on Indian market standards.`

class JDParserAgent {
  async parse(rawJD: string): Promise<JD> {
    logger.info(AGENT, 'Parsing JD', { length: rawJD.length })

    const { object } = await generateObject({
      model:  anthropic(DEFAULT_MODEL),
      schema: JDSchema,
      system: SYSTEM_PROMPT,
      prompt: `Parse the following job description and extract all structured information:\n\n${rawJD}`,
    })

    logger.info(AGENT, 'JD parsed', {
      title: object.title,
      mustSkills: object.skills.must.length,
      booleanLen: object.booleanSearchString.length,
    })

    return object
  }

  /**
   * Refine an existing parsed JD with additional context from the HR call transcript.
   */
  async refineWithCallContext(existingJD: JD, callTranscript: string): Promise<JD> {
    logger.info(AGENT, 'Refining JD with HR call context')

    const { object } = await generateObject({
      model:  anthropic(DEFAULT_MODEL),
      schema: JDSchema,
      system: SYSTEM_PROMPT,
      prompt: `You have an existing structured JD and a transcript from a clarification call with the client HR.
Update the JD to incorporate any new constraints, preferences, or corrections from the call.

Existing JD:
${JSON.stringify(existingJD, null, 2)}

HR Call Transcript:
${callTranscript}

Return the updated structured JD.`,
    })

    logger.info(AGENT, 'JD refined with call context')
    return object
  }
}

export const jdParserAgent = new JDParserAgent()
