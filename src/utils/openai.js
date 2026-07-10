const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT =
  'You extract structured data from the scraped text of a job posting web page. The text may contain ' +
  'site navigation, headers, footers, and other boilerplate along with the actual posting — ignore anything ' +
  "that isn't part of the job posting itself. " +
  'Respond with a JSON object with exactly these keys: "company" (string), "role" (string, the job title), ' +
  '"location" (string, e.g. "Remote" or "San Francisco, CA"), "jobType" (string, one of "Full-time", ' +
  '"Part-time", "Contract", "Internship", "Remote"), "description" (string, the full job description — ' +
  'responsibilities, requirements, qualifications — cleaned up as plain text, with boilerplate removed). ' +
  'If a value cannot be determined, use an empty string. Respond with JSON only.'

export async function extractJobDetails(pageText) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing VITE_OPENAI_API_KEY in .env')
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: pageText },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty response')
  }

  const parsed = JSON.parse(content)
  return {
    company: parsed.company || '',
    role: parsed.role || '',
    location: parsed.location || '',
    jobType: parsed.jobType || '',
    description: parsed.description || '',
  }
}
