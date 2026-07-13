import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

// Captura /c/:slug → amarra el dispositivo a la empresa y va al login
export default function TenantEntry() {
  const { slug } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (slug) localStorage.setItem('pv_tenant_slug', slug.toLowerCase())
    navigate('/login', { replace: true })
  }, [slug, navigate])

  return null
}
