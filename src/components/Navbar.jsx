import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ gmail }) {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <span className="navbar-brand">JobTrack v2</span>
      <div className="navbar-right">
        {gmail &&
          (gmail.connected ? (
            <span className="gmail-status">
              <span className="gmail-status-dot" />
              {gmail.syncing ? 'Syncing Gmail…' : 'Gmail connected'}
            </span>
          ) : (
            <button className="btn-secondary" onClick={gmail.connect}>
              Connect Gmail
            </button>
          ))}
        {currentUser && <span className="navbar-email">{currentUser.email}</span>}
        <button className="btn-secondary" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </nav>
  )
}
