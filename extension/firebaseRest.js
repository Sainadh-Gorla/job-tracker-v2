import { FIREBASE_API_KEY, FIREBASE_PROJECT_ID } from './config.js'

const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1'
const TOKEN_BASE = 'https://securetoken.googleapis.com/v1'
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`

export async function signInWithPassword(email, password) {
  const res = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Login failed')
  }
  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    uid: data.localId,
    email: data.email,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
  }
}

export async function refreshIdToken(refreshToken) {
  const res = await fetch(`${TOKEN_BASE}/token?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Session expired - please log in again')
  }
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    uid: data.user_id,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  }
}

function toFirestoreFields(obj) {
  const fields = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue
    fields[key] = { stringValue: String(value) }
  }
  return fields
}

export async function createJobDocument(uid, idToken, job) {
  const body = {
    fields: {
      ...toFirestoreFields(job),
      createdAt: { timestampValue: new Date().toISOString() },
    },
  }

  const res = await fetch(`${FIRESTORE_BASE}/users/${uid}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error?.message || `Firestore request failed (${res.status})`)
  }

  return res.json()
}
