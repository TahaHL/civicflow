import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading"><span className="loading-mark">CF</span><p>Loading your workspace…</p></div>
  return user ? children : <Navigate to="/signin" replace />
}

export default ProtectedRoute
