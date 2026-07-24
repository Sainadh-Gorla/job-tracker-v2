// Google Identity Services (GIS) token client - the current supported way to
// get an OAuth access token client-side with no backend, replacing the old
// (fully shut down) gapi.auth2 implicit-flow library. Functionally the same
// tradeoff as the classic implicit flow: no refresh token, so the access
// token expires (~1hr) and reconnecting requires another user click.
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const STORAGE_KEY = 'jobtrack_gmail_token'

let tokenClient = null
let scriptLoadPromise = null

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      console.log('[Gmail] Google Identity Services script loaded from', GOOGLE_IDENTITY_SCRIPT_SRC)
      resolve()
    }
    script.onerror = (event) => {
      console.error('[Gmail] failed to load script from', GOOGLE_IDENTITY_SCRIPT_SRC, event)
      reject(new Error(`Failed to load Google Identity Services script from ${GOOGLE_IDENTITY_SCRIPT_SRC}`))
    }
    document.head.appendChild(script)
  })

  return scriptLoadPromise
}

function readStoredToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.accessToken || !parsed.expiresAt) return null
    if (Date.now() >= parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

function storeToken(accessToken, expiresInSeconds) {
  // Treat the token as expiring a minute early so we never try to use one
  // that dies mid-request.
  const expiresAt = Date.now() + expiresInSeconds * 1000 - 60_000
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, expiresAt }))
}

export function getStoredAccessToken() {
  return readStoredToken()?.accessToken || null
}

export function isGmailConnected() {
  return Boolean(readStoredToken())
}

export function disconnectGmail() {
  localStorage.removeItem(STORAGE_KEY)
}

async function ensureTokenClient(clientId) {
  await loadGoogleIdentityScript()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: () => {}, // replaced per-call below
    })
  }
  return tokenClient
}

export async function connectGmail() {
  const clientId = import.meta.env.VITE_GMAIL_CLIENT_ID
  console.log('[Gmail] VITE_GMAIL_CLIENT_ID =', clientId || '(not set)')
  if (!clientId) {
    throw new Error('Missing VITE_GMAIL_CLIENT_ID in .env')
  }

  const client = await ensureTokenClient(clientId)

  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error))
        return
      }
      storeToken(response.access_token, response.expires_in)
      resolve(response.access_token)
    }
    client.requestAccessToken({ prompt: 'consent' })
  })
}
