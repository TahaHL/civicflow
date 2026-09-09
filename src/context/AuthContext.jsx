import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/auth/me').then(({ user: currentUser }) => setUser(currentUser)).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = user?.preferences?.theme || 'system'
  }, [user?.preferences?.theme])

  async function login(credentials) {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
    setUser(data.user)
  }

  async function register(details) {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(details) })
    setUser(data.user)
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser: setUser }}>{children}</AuthContext.Provider>
}
