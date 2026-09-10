import { useEffect, useState } from 'react'
import { api, setSessionToken } from '../lib/api'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const expireSession = () => setUser(null)
    window.addEventListener('civicflow:session-expired', expireSession)
    return () => window.removeEventListener('civicflow:session-expired', expireSession)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = user?.preferences?.theme || 'system'
  }, [user?.preferences?.theme])

  async function login(credentials) {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
    setSessionToken(data.sessionToken)
    setUser(data.user)
  }

  async function register(details) {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(details) })
    setSessionToken(data.sessionToken)
    setUser(data.user)
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setSessionToken(null)
    setUser(null)
  }

  function completePasswordReset(data) {
    setSessionToken(data.sessionToken)
    setUser(data.user)
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout, completePasswordReset, updateUser: setUser }}>{children}</AuthContext.Provider>
}
