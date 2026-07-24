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

const EMAIL_STATUS_VALUES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Unknown']

function buildEmailClassifierPrompt(subject, snippet) {
  return `You are an expert at reading job application emails. Classify this email into exactly one of these statuses: Applied, Screening, Interview, Offer, Rejected, or Unknown.

Rules:
- Applied: confirmation that application was received
- Screening: recruiter outreach, phone screen invitation, HR call, initial screening
- Interview: invitation for a video call, technical interview, onsite, or any further meeting with the company beyond an initial screen
- Offer: job offer, salary discussion, or request to sign documents
- Rejected: any email saying they are moving forward with other candidates, not selected, position filled, or any form of rejection even if worded politely like 'we regret to inform you' or 'we have decided to pursue other candidates' or 'we will not be moving forward'
- Unknown: newsletters, job alerts, marketing emails, or anything not clearly related to a specific application status

Email Subject: ${subject}
Email Content: ${snippet}

Reply with ONLY one word: Applied, Screening, Interview, Offer, Rejected, or Unknown`
}

export async function classifyEmailStatus({ subject, snippet }) {
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
      messages: [{ role: 'user', content: buildEmailClassifierPrompt(subject, snippet) }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const raw = (data.choices?.[0]?.message?.content || '').trim()

  // The prompt asks for exactly one bare word, but models sometimes wrap it
  // in punctuation or a short phrase anyway (e.g. "Rejected." or "Status:
  // Rejected") - fall back to a word-boundary search for a recognized status
  // before giving up and calling it Unknown.
  const status =
    EMAIL_STATUS_VALUES.find((value) => raw === value) ||
    EMAIL_STATUS_VALUES.find((value) => new RegExp(`\\b${value}\\b`, 'i').test(raw)) ||
    'Unknown'

  console.log(`[JobTrack] email classification - subject: "${subject}" -> ${status}`)

  return status === 'Unknown' ? '' : status
}
