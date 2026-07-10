import { signInWithPassword, refreshIdToken, createJobDocument } from './firebaseRest.js'

async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  return session || null
}

async function setSession(session) {
  await chrome.storage.local.set({ session })
}

async function clearSession() {
  await chrome.storage.local.remove('session')
}

async function getValidSession() {
  let session = await getSession()
  if (!session) {
    throw new Error('Not logged in. Open the JobTrack v2 extension popup and log in first.')
  }

  if (Date.now() > session.expiresAt - 60_000) {
    const refreshed = await refreshIdToken(session.refreshToken)
    session = { ...session, ...refreshed }
    await setSession(session)
  }

  return session
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LOGIN') {
    signInWithPassword(message.email, message.password)
      .then(async (session) => {
        await setSession(session)
        sendResponse({ ok: true, email: session.email })
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }

  if (message.type === 'LOGOUT') {
    clearSession().then(() => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'GET_SESSION') {
    getSession().then((session) => sendResponse({ session }))
    return true
  }

  if (message.type === 'SAVE_JOB') {
    ;(async () => {
      try {
        const session = await getValidSession()
        await createJobDocument(session.uid, session.idToken, message.job)
        sendResponse({ ok: true })
      } catch (err) {
        sendResponse({ ok: false, error: err.message })
      }
    })()
    return true
  }

  return false
})
