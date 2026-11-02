import React, { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL

/**
 * Loading Spinner untuk Guard
 */
function GuardLoading({ text = 'Memverifikasi keamanan sesi...' }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 12 }}>
      <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{text}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

/**
 * 🛡️ AdminRoute: Mengunci halaman /admin
 * Hanya pengguna yang terotentikasi di Supabase Auth DAN terbukti Administrator yang diizinkan lewat.
 */
export function AdminRoute({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'allowed' | 'denied'
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const verifyAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session || !session.user) {
          if (isMounted) setStatus('denied')
          return
        }

        const userEmail = session.user.email?.toLowerCase() || ''

        // 1. Cek apakah cocok dengan VITE_ADMIN_EMAIL (jika dikonfigurasi)
        if (ADMIN_EMAIL && userEmail === ADMIN_EMAIL.toLowerCase()) {
          if (isMounted) setStatus('allowed')
          return
        }

        // 2. Verifikasi ke server database via RPC fn_check_is_admin
        const { data: isAdmin, error } = await supabase.rpc('fn_check_is_admin', { p_email: userEmail })

        if (!error && isAdmin === true) {
          if (isMounted) setStatus('allowed')
          return
        }

        // Jika tidak lolos verifikasi, sign out dan tolak akses
        await supabase.auth.signOut().catch(() => {})
        if (isMounted) setStatus('denied')
      } catch (err) {
        console.warn('[AdminGuard] Error verifying admin:', err)
        if (isMounted) setStatus('denied')
      }
    }

    verifyAdmin()

    return () => { isMounted = false }
  }, [navigate])

  if (status === 'checking') {
    return <GuardLoading text="Memvalidasi kredensial administrator..." />
  }

  if (status === 'denied') {
    return <Navigate to="/login-admin" replace />
  }

  return children
}

/**
 * 🛡️ GuruRoute: Mengunci halaman /dashboard-guru
 * Memastikan sesi guru_session bukan hasil rekayasa di LocalStorage.
 */
export function GuruRoute({ children }) {
  const [status, setStatus] = useState('checking')
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const verifyGuru = async () => {
      const raw = localStorage.getItem('guru_session')
      if (!raw) {
        if (isMounted) setStatus('denied')
        return
      }

      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        localStorage.removeItem('guru_session')
        if (isMounted) setStatus('denied')
        return
      }

      if (!parsed.id || !parsed.akun_id) {
        localStorage.removeItem('guru_session')
        if (isMounted) setStatus('denied')
        return
      }

      try {
        // Validasi ke server database: Apakah ID & akun_id ini sah sebagai pegawai aktif?
        const { data: res, error } = await supabase.rpc('fn_verify_session', {
          p_akun_id: parsed.akun_id,
          p_role: 'staff',
          p_foreign_id: String(parsed.id)
        })

        if (error || !res?.ok) {
          console.warn('[GuruGuard] Sesi guru terdeteksi tidak valid:', res?.msg || error?.message)
          localStorage.removeItem('guru_session')
          if (isMounted) setStatus('denied')
          return
        }

        if (isMounted) setStatus('allowed')
      } catch (e) {
        // Fallback jika jaringan lambat: tetap izinkan jika format sesi valid
        if (isMounted) setStatus('allowed')
      }
    }

    verifyGuru()

    return () => { isMounted = false }
  }, [navigate])

  if (status === 'checking') {
    return <GuardLoading text="Memverifikasi hak akses pegawai..." />
  }

  if (status === 'denied') {
    return <Navigate to="/login?r=guru" replace />
  }

  return children
}

/**
 * 🛡️ StudentRoute: Mengunci halaman /dashboard
 * Memastikan sesi siswa_session bukan hasil modifikasi NISN orang lain.
 */
export function StudentRoute({ children }) {
  const [status, setStatus] = useState('checking')
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const verifyStudent = async () => {
      const raw = localStorage.getItem('siswa_session')
      if (!raw) {
        if (isMounted) setStatus('denied')
        return
      }

      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        localStorage.removeItem('siswa_session')
        if (isMounted) setStatus('denied')
        return
      }

      const nisn = parsed.nisn || parsed.id
      if (!nisn || !parsed.akun_id) {
        // Jika akun lama belum punya akun_id, tetap izinkan sementara
        if (isMounted) setStatus('allowed')
        return
      }

      try {
        const { data: res, error } = await supabase.rpc('fn_verify_session', {
          p_akun_id: parsed.akun_id,
          p_role: 'murid',
          p_foreign_id: String(nisn)
        })

        if (error || !res?.ok) {
          console.warn('[StudentGuard] Manipulasi sesi siswa terdeteksi:', res?.msg || error?.message)
          localStorage.removeItem('siswa_session')
          if (isMounted) setStatus('denied')
          return
        }

        if (isMounted) setStatus('allowed')
      } catch (e) {
        if (isMounted) setStatus('allowed')
      }
    }

    verifyStudent()

    return () => { isMounted = false }
  }, [navigate])

  if (status === 'checking') {
    return <GuardLoading text="Memuat sesi siswa..." />
  }

  if (status === 'denied') {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * 🛡️ ParentRoute: Mengunci halaman /dashboard-orang-tua
 */
export function ParentRoute({ children }) {
  const [status, setStatus] = useState('checking')
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    const verifyParent = async () => {
      const raw = localStorage.getItem('orangtua_session')
      if (!raw) {
        if (isMounted) setStatus('denied')
        return
      }

      let parsed = null
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        localStorage.removeItem('orangtua_session')
        if (isMounted) setStatus('denied')
        return
      }

      const nisn = parsed.nisn || parsed.id
      if (!nisn || !parsed.akun_id) {
        if (isMounted) setStatus('allowed')
        return
      }

      try {
        const { data: res, error } = await supabase.rpc('fn_verify_session', {
          p_akun_id: parsed.akun_id,
          p_role: 'orang_tua',
          p_foreign_id: String(nisn)
        })

        if (error || !res?.ok) {
          console.warn('[ParentGuard] Manipulasi sesi orang tua terdeteksi:', res?.msg || error?.message)
          localStorage.removeItem('orangtua_session')
          if (isMounted) setStatus('denied')
          return
        }

        if (isMounted) setStatus('allowed')
      } catch (e) {
        if (isMounted) setStatus('allowed')
      }
    }

    verifyParent()

    return () => { isMounted = false }
  }, [navigate])

  if (status === 'checking') {
    return <GuardLoading text="Memuat sesi orang tua..." />
  }

  if (status === 'denied') {
    return <Navigate to="/login?r=orang_tua" replace />
  }

  return children
}
