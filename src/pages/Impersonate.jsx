import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Impersonate Page
 * This page is used by admin to login as another user (siswa or guru).
 * It receives session data via URL search params, sets it into localStorage,
 * and redirects to the appropriate dashboard.
 * 
 * URL format: /impersonate?data=<base64_encoded_session>&role=<murid|guru>
 */
function Impersonate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('Menyiapkan sesi...')

  useEffect(() => {
    try {
      const encodedData = searchParams.get('data')
      const role = searchParams.get('role')

      if (!encodedData || !role) {
        setStatus('Parameter tidak valid.')
        return
      }

      // Decode base64 session data (UTF-8 safe)
      const sessionJson = decodeURIComponent(escape(atob(encodedData)))
      const sessionData = JSON.parse(sessionJson)

      // Clear any existing sessions first
      localStorage.removeItem('siswa_session')
      localStorage.removeItem('guru_session')
      localStorage.removeItem('admin_session')

      // Set the appropriate session
      if (role === 'murid') {
        localStorage.setItem('siswa_session', JSON.stringify(sessionData))
        setStatus(`Login sebagai siswa: ${sessionData.nama_lengkap || sessionData.nama || 'N/A'}`)
        setTimeout(() => navigate('/dashboard'), 500)
      } else if (role === 'guru') {
        localStorage.setItem('guru_session', JSON.stringify(sessionData))
        setStatus(`Login sebagai guru: ${sessionData.nama_guru || sessionData.nama || 'N/A'}`)
        setTimeout(() => navigate('/dashboard-guru'), 500)
      } else {
        setStatus('Role tidak dikenali.')
      }
    } catch (err) {
      setStatus('Gagal memproses sesi: ' + err.message)
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg text-center max-w-md mx-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-700 font-medium">{status}</p>
        <p className="text-xs text-slate-400 mt-2">Mengarahkan ke dashboard...</p>
      </div>
    </div>
  )
}

export default Impersonate
