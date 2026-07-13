// Cliente HTTP del panel super admin (token separado del POS)
const BASE = '/api'

async function request(method, path, body) {
  const token = localStorage.getItem('pv_super_token')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    localStorage.removeItem('pv_super_token')
    window.location.href = '/super/login'
    throw new Error('Sesión expirada')
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Error HTTP ${res.status}`)
  return data
}

export const superApi = {
  get:   (path)       => request('GET', path),
  post:  (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
}
