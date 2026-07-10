import { useState } from 'react'
import Navbar from '../components/Navbar'
import StatsBar from '../components/StatsBar'
import JobForm from '../components/JobForm'
import JobList from '../components/JobList'
import AutoFillBar from '../components/AutoFillBar'
import TipsSidebar from '../components/TipsSidebar'
import { STATUSES } from '../constants/status'
import { useJobs } from '../hooks/useJobs'

export default function Dashboard() {
  const { jobs, loading, error, addJob, updateJob, deleteJob } = useJobs()
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState(null)
  const [formKey, setFormKey] = useState(0)
  const [filter, setFilter] = useState(null)
  const [search, setSearch] = useState('')

  async function handleAdd(job) {
    await addJob(job)
    setShowForm(false)
  }

  function handleExtracted(details) {
    setPrefill(details)
    setFormKey((k) => k + 1)
    setShowForm(true)
  }

  function handleToggleForm() {
    if (showForm) {
      setShowForm(false)
      return
    }
    setPrefill(null)
    setFormKey((k) => k + 1)
    setShowForm(true)
  }

  const term = search.trim().toLowerCase()
  const visibleJobs = jobs
    .filter((job) => (filter ? job.status === filter : true))
    .filter(
      (job) =>
        !term ||
        job.company?.toLowerCase().includes(term) ||
        job.role?.toLowerCase().includes(term),
    )

  return (
    <div className="dashboard">
      <Navbar />
      <main className="dashboard-content">
        <AutoFillBar onExtracted={handleExtracted} />

        <StatsBar jobs={jobs} activeFilter={filter} onFilterChange={setFilter} />

        <div className="dashboard-layout">
          <div className="dashboard-main">
            <div className="dashboard-toolbar">
              <h2>Applications</h2>
              <button onClick={handleToggleForm}>
                {showForm ? 'Close' : '+ Add Application'}
              </button>
            </div>

            <div className="dashboard-filters">
              <input
                type="search"
                className="search-input"
                placeholder="Search by company or role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="status-select"
                value={filter || 'All'}
                onChange={(e) => setFilter(e.target.value === 'All' ? null : e.target.value)}
              >
                <option value="All">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {showForm && (
              <div className="job-form-card">
                <JobForm
                  key={formKey}
                  initialJob={prefill}
                  onSubmit={handleAdd}
                  onCancel={() => setShowForm(false)}
                />
              </div>
            )}

            {error && <p className="auth-error">{error}</p>}
            {loading ? (
              <p className="empty-state">Loading applications…</p>
            ) : (
              <JobList jobs={visibleJobs} onUpdate={updateJob} onDelete={deleteJob} />
            )}
          </div>

          <TipsSidebar />
        </div>
      </main>
    </div>
  )
}
