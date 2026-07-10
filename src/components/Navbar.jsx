import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
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
        {currentUser && <span className="navbar-email">{currentUser.email}</span>}
        <button className="btn-secondary" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </nav>
  )
}
