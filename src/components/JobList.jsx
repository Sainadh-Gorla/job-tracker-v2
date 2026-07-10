import JobItem from './JobItem'

export default function JobList({ jobs, onUpdate, onDelete }) {
  if (jobs.length === 0) {
    return <p className="empty-state">No applications yet. Add your first one above.</p>
  }

  return (
    <ul className="job-list">
      {jobs.map((job) => (
        <JobItem key={job.id} job={job} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </ul>
  )
}
