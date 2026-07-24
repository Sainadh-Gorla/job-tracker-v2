import { useCallback, useEffect, useRef, useState } from 'react'
import { connectGmail as requestGmailConnection, disconnectGmail, getStoredAccessToken, isGmailConnected } from '../utils/googleAuth'
import { fetchRecentInboxEmails } from '../utils/gmail'
import { classifyEmailStatus } from '../utils/openai'

function normalizeForMatch(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function collapseSpaces(value) {
  return value.replace(/\s+/g, '')
}

// Generic corporate-entity words that add noise to a match: an email domain
// is "numeric.com", never "numerictechnologies.com", so leaving these in the
// company name makes otherwise-good matches fail.
const COMPANY_SUFFIXES = [
  'Technologies',
  'Solutions',
  'Company',
  'Group',
  'Tech',
  'Corp',
  'LLC',
  'Inc',
  'Ltd',
  'Co',
]

function stripCompanySuffixes(name) {
  let result = (name || '').trim()
  let changed = true
  // Loop because a name can carry more than one, e.g. "Acme Tech Solutions".
  while (changed) {
    changed = false
    for (const suffix of COMPANY_SUFFIXES) {
      const re = new RegExp(`[,\\s]+${suffix}\\.?$`, 'i')
      if (re.test(result)) {
        result = result.replace(re, '').trim()
        changed = true
      }
    }
  }
  return result
}

function normalizedCompany(company) {
  return normalizeForMatch(stripCompanySuffixes(company))
}

// Company names that end in ".com" (Realtor.com, Indeed.com, ...) normalize
// to something like "realtor com". Every business email domain also ends in
// a generic TLD ("fedex.com", "acme.io", ...), so comparing against domain
// labels without dropping the TLD meant "realtor com" could match literally
// any ".com" sender purely through the shared "com" fragment. TLDs are
// excluded from the token list entirely so that can't happen.
const COMMON_TLDS = new Set(['com', 'net', 'org', 'io', 'co', 'edu', 'gov', 'us', 'ai', 'app', 'dev'])

// Pulls out every token from an email address worth comparing against a
// company name: the local part before the @ AND every non-TLD label of the
// domain after it - real ATS/recruiting emails put the company name in
// either spot ("hr@numeric.com" has it in the domain; "acme-recruiting@
// greenhouse.io" has it in the local part instead, since greenhouse.io is
// the ATS's own domain, not the company's).
function extractEmailAddressTokens(fromHeader) {
  const match = (fromHeader || '').match(/([\w.+-]+)@([\w.-]+)/)
  if (!match) return []
  const [, localPart, domain] = match
  const domainLabels = domain.split('.').filter((label) => !COMMON_TLDS.has(label.toLowerCase()))
  return [localPart, ...domainLabels]
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length > 2)
}

function companyMatchesEmailAddress(company, addressTokens) {
  // Domain/local-part tokens never contain spaces ("acmerobotics"), while a
  // multi-word company name normalizes WITH spaces ("acme robotics") - has
  // to be collapsed before comparing against them, or a real match like this
  // would silently never fire.
  const collapsedCompany = collapseSpaces(company)
  if (collapsedCompany.length <= 2) return false
  return addressTokens.some((token) => token.includes(collapsedCompany) || collapsedCompany.includes(token))
}

// Whole-word match only - "FedEx" must appear as its own word in the
// (normalized, space-separated) text, not as a fragment of some unrelated
// longer word or an accidental substring collision.
function wholeWordMatch(needle, haystack) {
  if (!needle || needle.length <= 2) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(haystack)
}

// Recognizes the handful of ways a recruiting email subject typically names
// the company: "at Company", "from Company", "with Company", "Company -
// Role", "Company | Role". Each captures 1-4 Title-Case words, since almost
// no real company name is a run of five or more.
const NAME_WORD = "[A-Z][A-Za-z0-9&.']*"
const NAME_RUN = `(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})`
const COMPANY_EXTRACTION_PATTERNS = [
  new RegExp(`\\bat\\s+${NAME_RUN}`),
  new RegExp(`\\bfrom\\s+${NAME_RUN}`),
  new RegExp(`\\bwith\\s+${NAME_RUN}`),
  new RegExp(`^${NAME_RUN}\\s*[-|]`),
]

function extractCompanyCandidate(text) {
  for (const pattern of COMPANY_EXTRACTION_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return ''
}

// Matching happens locally, before any OpenAI call - only emails that already
// look connected to a tracked application are worth classifying at all. This
// keeps unrelated personal email content from ever being sent to OpenAI, and
// avoids paying for a classification call on every inbox message.
//
// The previous version checked every tracked company as a raw substring
// against the whole email text, which is what let something like "Realtor.com"
// match an email that was actually about "FedEx" (see extractEmailAddressTokens
// for the specific "com" TLD collision that caused it). Now: if a company name
// can be confidently extracted from the subject, that becomes the ONLY thing
// compared against the tracked list - not a broad scan. The broad whole-word
// scan is reserved for when no company shape could be extracted at all.
function findMatchingJob(email, jobs) {
  const addressTokens = extractEmailAddressTokens(email.from)
  const extractedCompany = extractCompanyCandidate(`${email.subject} ${email.snippet}`)
  const normalizedExtracted = extractedCompany ? normalizedCompany(extractedCompany) : ''

  console.log(
    `[JobTrack] Gmail match - subject="${email.subject}" extracted company="${extractedCompany || '(none)'}"`,
  )

  const haystack = normalizeForMatch(`${email.subject} ${email.snippet}`)

  for (const job of jobs) {
    const company = normalizedCompany(job.company)
    if (company.length <= 2) continue

    const extractedMatch = normalizedExtracted !== '' && normalizedExtracted === company
    const domainMatch = companyMatchesEmailAddress(company, addressTokens)
    // The unrestricted whole-word text scan only applies when the subject
    // didn't yield an extracted company at all - once we have one, a
    // tracked company either equals it or doesn't; it can't also win via a
    // looser text scan.
    const textMatch = !extractedCompany && wholeWordMatch(company, haystack)
    const matched = extractedMatch || domainMatch || textMatch

    console.log(
      `[JobTrack]   tracked company="${job.company}" (normalized "${company}") -> ` +
        `extractedMatch=${extractedMatch} domainMatch=${domainMatch} textMatch=${textMatch} -> ${
          matched ? 'MATCH' : 'no match'
        }`,
    )
    if (matched) return job
  }

  if (extractedCompany) {
    // A company WAS identified in the subject, it just isn't one we're
    // tracking - stop here rather than falling through to the role-name
    // fallback below, which is looser still.
    return null
  }

  // Last resort: the job title itself showing up in the subject line (e.g.
  // "Update on your Senior Engineer application").
  const subjectNormalized = normalizeForMatch(email.subject)
  for (const job of jobs) {
    const role = normalizeForMatch(job.role)
    const matched = role.length > 2 && subjectNormalized.includes(role)
    console.log(
      `[JobTrack] Gmail match check (role fallback) - role="${job.role}" subject="${email.subject}" -> ${
        matched ? 'MATCH' : 'no match'
      }`,
    )
    if (matched) return job
  }

  return null
}

export function useGmailSync(jobs, updateJob) {
  const [connected, setConnected] = useState(isGmailConnected())
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [updatedCount, setUpdatedCount] = useState(0)
  const hasSyncedRef = useRef(false)

  const runSync = useCallback(async () => {
    const token = getStoredAccessToken()
    if (!token) {
      setConnected(false)
      return
    }

    setSyncing(true)
    setError('')
    let count = 0
    try {
      const emails = await fetchRecentInboxEmails(token)
      for (const email of emails) {
        const job = findMatchingJob(email, jobs)
        if (!job) continue

        const status = await classifyEmailStatus(email)
        if (status && status !== job.status) {
          await updateJob(job.id, { status })
          count += 1
        }
      }
      setUpdatedCount(count)
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }, [jobs, updateJob])

  useEffect(() => {
    if (!connected) {
      hasSyncedRef.current = false
      return
    }
    // Sync once per connected session, as soon as jobs are loaded - not on
    // every jobs re-render (including the ones our own updateJob calls cause).
    if (jobs.length > 0 && !hasSyncedRef.current) {
      hasSyncedRef.current = true
      runSync()
    }
  }, [connected, jobs, runSync])

  async function connect() {
    setError('')
    try {
      await requestGmailConnection()
      setConnected(true)
    } catch (err) {
      setError(err.message)
    }
  }

  function disconnect() {
    disconnectGmail()
    setConnected(false)
  }

  return { connected, syncing, error, updatedCount, connect, disconnect }
}
