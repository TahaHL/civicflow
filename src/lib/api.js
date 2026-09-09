const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`${apiOrigin}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
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
  if (!response.ok) throw new Error(data?.message || 'Something went wrong.')
  return data
}
