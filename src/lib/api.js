const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const sessionStorageKey = 'civicflow_session_token'

function storedSessionToken() {
  try { return localStorage.getItem(sessionStorageKey) || '' } catch { return '' }
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(sessionStorageKey, token)
    else localStorage.removeItem(sessionStorageKey)
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export async function api(path, options = {}) {
  let response
  try {
    const sessionToken = storedSessionToken()
    response = await fetch(`${apiOrigin}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...options.headers },
      ...options,
    })
  } catch {
    throw new Error('CivicFlow cannot reach its server right now. Please try again shortly.')
  }

  const contentType = response.headers.get('content-type') || ''
  const data = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : null

  if (!response.ok && !data) throw new Error('CivicFlow’s server is not available yet. Please try again shortly.')
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') {
      setSessionToken(null)
      window.dispatchEvent(new Event('civicflow:session-expired'))
    }
    throw new Error(data?.message || 'Something went wrong.')
  }
  return data
}
