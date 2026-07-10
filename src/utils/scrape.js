const PROXY_URL = 'https://api.allorigins.win/raw?url='
const MAX_CHARS = 15000

export async function fetchPageText(url) {
  let response
  try {
    response = await fetch(PROXY_URL + encodeURIComponent(url))
  } catch {
    throw new Error('Could not reach the job posting page (network error)')
  }

  if (!response.ok) {
    throw new Error(`Could not fetch the job posting page (${response.status})`)
  }

  const html = await response.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove())
  const text = (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

  return text.slice(0, MAX_CHARS)
}
