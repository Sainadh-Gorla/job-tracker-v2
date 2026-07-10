import { useState } from 'react'
import { fetchPageText } from '../utils/scrape'
import { extractJobDetails } from '../utils/openai'

export default function AutoFillBar({ onExtracted }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loading = status !== ''

  async function handleContinue(e) {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    setError('')
    try {
      setStatus('Fetching posting…')
      const pageText = await fetchPageText(trimmedUrl)
      if (!pageText) {
        throw new Error('Could not read any content from that page')
      }

      setStatus('Extracting details…')
      const details = await extractJobDetails(pageText)
      onExtracted({ ...details, link: trimmedUrl })
      setUrl('')
    } catch (err) {
      setError(err.message)
    } finally {
      setStatus('')
    }
  }

  return (
    <div className="autofill-bar">
      <div className="autofill-header">
        <h3>Quick add from a job URL</h3>
        <p>Paste the posting link — we'll scrape it and let AI fill in the rest.</p>
      </div>

      <form className="autofill-row" onSubmit={handleContinue}>
        <input
          type="url"
          placeholder="Paste job posting URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? status : 'Continue'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}
