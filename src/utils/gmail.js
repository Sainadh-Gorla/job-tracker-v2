const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
// Bounded on purpose - classifying every inbox email on every dashboard load
// would be slow and run up OpenAI usage for no benefit, so this only looks
// at what's actually recent enough to matter for an application update.
const MAX_MESSAGES = 25
const RECENCY_QUERY = 'newer_than:30d'

async function gmailFetch(path, accessToken) {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gmail API request failed (${response.status}): ${body}`)
  }
  return response.json()
}

function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

export async function fetchRecentInboxEmails(accessToken) {
  const list = await gmailFetch(
    `/messages?maxResults=${MAX_MESSAGES}&labelIds=INBOX&q=${encodeURIComponent(RECENCY_QUERY)}`,
    accessToken,
  )

  const ids = (list.messages || []).map((m) => m.id)

  const messages = await Promise.all(
    ids.map((id) =>
      gmailFetch(
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        accessToken,
      ),
    ),
  )

  return messages.map((message) => ({
    id: message.id,
    from: getHeader(message.payload?.headers, 'From'),
    subject: getHeader(message.payload?.headers, 'Subject'),
    snippet: message.snippet || '',
  }))
}
