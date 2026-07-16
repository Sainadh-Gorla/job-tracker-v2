import { useState } from 'react'
import JobForm from './JobForm'
import { avatarColor, avatarInitial } from '../utils/avatar'
import { downloadJobDescription } from '../utils/jobDoc'

export default function JobItem({ job, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  async function handleSave(updates) {
    await onUpdate(job.id, updates)
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete application to ${job.company}?`)) return
    setDeleting(true)
    try {
      await onDelete(job.id)
    } finally {
      setDeleting(false)
    }
  }

  async function handleDownloadJD() {
    if (!job.description) {
      alert('No job description saved for this application.')
      return
    }
    setDownloading(true)
    try {
      await downloadJobDescription(job)
    } finally {
      setDownloading(false)
    }
  }

  if (editing) {
    return (
      <li className="job-item job-item-editing">
        <JobForm initialJob={job} onSubmit={handleSave} onCancel={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="job-item">
      <div className="job-item-avatar" style={{ backgroundColor: avatarColor(job.company) }}>
        {avatarInitial(job.company)}
      </div>
      <div className="job-item-main">
        <div className="job-item-heading">
          <span className="job-item-role">{job.role}</span>
          <span className="job-item-company">{job.company}</span>
        </div>
        <div className="job-item-meta">
          <span className={`badge badge-${job.status.toLowerCase()}`}>{job.status}</span>
          {job.jobType && <span className="job-item-tag">{job.jobType}</span>}
          {job.location && <span className="job-item-tag">{job.location}</span>}
          {job.dateApplied && <span className="job-item-date">Applied {job.dateApplied}</span>}
          {job.link && (
            <a href={job.link} target="_blank" rel="noopener noreferrer">
              Listing ↗
            </a>
          )}
        </div>
        {job.notes && <p className="job-item-notes">{job.notes}</p>}
        {job.description && (
          <details className="job-item-description">
            <summary>View full job description</summary>
            <p>{job.description}</p>
          </details>
        )}
      </div>
      <div className="job-item-actions">
        <button className="btn-secondary" onClick={handleDownloadJD} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download JD'}
        </button>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </li>
  )
}
