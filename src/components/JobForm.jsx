import { useState } from 'react'
import { STATUSES } from '../constants/status'
import { JOB_TYPES } from '../constants/jobTypes'

const EMPTY_JOB = {
  company: '',
  role: '',
  location: '',
  jobType: '',
  status: 'Applied',
  dateApplied: new Date().toISOString().slice(0, 10),
  link: '',
  description: '',
  notes: '',
}

export default function JobForm({ initialJob, onSubmit, onCancel }) {
  const [job, setJob] = useState({ ...EMPTY_JOB, ...initialJob })
  const [saving, setSaving] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setJob((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSubmit(job)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="job-form" onSubmit={handleSubmit}>
      <div className="job-form-row">
        <div className="job-form-field">
          <label htmlFor="company">Company</label>
          <input
            id="company"
            name="company"
            required
            value={job.company}
            onChange={handleChange}
          />
        </div>

        <div className="job-form-field">
          <label htmlFor="role">Role</label>
          <input
            id="role"
            name="role"
            required
            value={job.role}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="job-form-row">
        <div className="job-form-field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            placeholder="e.g. Remote, San Francisco, CA"
            value={job.location}
            onChange={handleChange}
          />
        </div>

        <div className="job-form-field">
          <label htmlFor="jobType">Job Type</label>
          <select id="jobType" name="jobType" value={job.jobType} onChange={handleChange}>
            <option value="">Select…</option>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="job-form-row">
        <div className="job-form-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" value={job.status} onChange={handleChange}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="job-form-field">
          <label htmlFor="dateApplied">Date Applied</label>
          <input
            id="dateApplied"
            name="dateApplied"
            type="date"
            required
            value={job.dateApplied}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="job-form-field">
        <label htmlFor="link">Job Link</label>
        <input
          id="link"
          name="link"
          type="url"
          placeholder="https://…"
          value={job.link}
          onChange={handleChange}
        />
      </div>

      <div className="job-form-field">
        <label htmlFor="description">Job Description</label>
        <textarea
          id="description"
          name="description"
          rows={6}
          placeholder="Full job description…"
          value={job.description}
          onChange={handleChange}
        />
      </div>

      <div className="job-form-field">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          value={job.notes}
          onChange={handleChange}
        />
      </div>

      <div className="job-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
