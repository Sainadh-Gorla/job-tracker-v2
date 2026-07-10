import { STATUSES } from '../constants/status'

const BREAKDOWN_STATUSES = STATUSES.filter((status) => status !== 'Applied')

export default function StatsBar({ jobs, activeFilter, onFilterChange }) {
  const counts = BREAKDOWN_STATUSES.reduce((acc, status) => {
    acc[status] = jobs.filter((job) => job.status === status).length
    return acc
  }, {})

  return (
    <div className="stats-bar">
      <button
        type="button"
        className={`stat-card stat-applied ${activeFilter === null ? 'stat-active' : ''}`}
        onClick={() => onFilterChange(null)}
      >
        <span className="stat-count">{jobs.length}</span>
        <span className="stat-label">Applied</span>
      </button>

      {BREAKDOWN_STATUSES.map((status) => (
        <button
          key={status}
          type="button"
          className={`stat-card stat-${status.toLowerCase()} ${
            activeFilter === status ? 'stat-active' : ''
          }`}
          onClick={() => onFilterChange(activeFilter === status ? null : status)}
        >
          <span className="stat-count">{counts[status]}</span>
          <span className="stat-label">{status}</span>
        </button>
      ))}
    </div>
  )
}
