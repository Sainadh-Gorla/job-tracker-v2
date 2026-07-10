const loggedOutView = document.getElementById('loggedOutView')
const loggedInView = document.getElementById('loggedInView')
const loginForm = document.getElementById('loginForm')
const loginError = document.getElementById('loginError')
const userEmail = document.getElementById('userEmail')
const logoutBtn = document.getElementById('logoutBtn')
const saveCurrentBtn = document.getElementById('saveCurrentBtn')
const saveStatus = document.getElementById('saveStatus')

async function refreshView() {
  const { session } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' })
  if (session) {
    loggedOutView.hidden = true
    loggedInView.hidden = false
    userEmail.textContent = session.email
  } else {
    loggedOutView.hidden = false
    loggedInView.hidden = true
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  loginError.textContent = ''
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const submitBtn = loginForm.querySelector('button')

  submitBtn.disabled = true
  submitBtn.textContent = 'Logging in…'
  const response = await chrome.runtime.sendMessage({ type: 'LOGIN', email, password })
  submitBtn.disabled = false
  submitBtn.textContent = 'Log In'

  if (response.ok) {
    await refreshView()
  } else {
    loginError.textContent = response.error
  }
})

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'LOGOUT' })
  await refreshView()
})

saveCurrentBtn.addEventListener('click', async () => {
  saveStatus.textContent = 'Saving…'
  saveCurrentBtn.disabled = true
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_AND_SAVE' })
    saveStatus.textContent = response?.ok
      ? 'Saved to JobTrack!'
      : `Error: ${response?.error || 'Could not save this page'}`
  } catch {
    saveStatus.textContent = 'Open a supported job posting page first (LinkedIn, Indeed, Glassdoor, or Amazon Jobs).'
  } finally {
    saveCurrentBtn.disabled = false
  }
})

refreshView()
