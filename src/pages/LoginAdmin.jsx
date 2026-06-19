import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL

function LoginAdmin() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    let handled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN') return
      if (handled) return
      handled = true

      const userEmail = session?.user?.email

      if (ADMIN_EMAIL && userEmail !== ADMIN_EMAIL) {
        await supabase.auth.signOut()
        setNotification({
          type: 'error',
          message: 'Akun ini tidak memiliki otorisasi untuk mengakses panel administrator.',
        })
        return
      }

      navigate('/admin')
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setLoading(false)
      setNotification({ type: 'error', message: 'Kredensial yang Anda masukkan tidak valid. Silakan periksa kembali.' })
      return
    }

    const userEmail = data.user?.email
    if (ADMIN_EMAIL && userEmail !== ADMIN_EMAIL) {
      await supabase.auth.signOut()
      setLoading(false)
      setNotification({ type: 'error', message: 'Akun ini tidak memiliki otorisasi akses administrator.' })
      return
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">

      <div className="w-full max-w-md animate-slide-up">

        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-2">
            <div className="border border-slate-200 rounded-xl shadow-sm p-2 bg-white">
              <img src="/logo.png" alt="Logo SMP Budi Mulia" className="h-20 w-20 object-contain" />
            </div>
            <span className="font-semibold text-slate-700 text-sm tracking-wide">SMP BUDI MULIA</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mt-3">Portal Admin</h1>
          <p className="text-slate-500 mt-1.5 text-sm">Akses khusus untuk Administrator</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md">

          <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-xs text-amber-700">Halaman ini hanya dapat diakses oleh Administrator yang berwenang.</p>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mb-1">Masuk ke Sistem</h2>
          <p className="text-slate-500 text-sm mb-6">Silakan masuk menggunakan kredensial administrator.</p>

          {notification && (
            <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
              notification.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {notification.message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Administrator
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh: admin@sekolah.com"
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Kredensial
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kredensial akun administrator"
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 active:scale-95 shadow-sm"
            >
              {loading ? 'Memproses...' : 'Masuk ke Sistem'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors duration-200 underline underline-offset-2"
            >
              ← Kembali ke Portal Siswa
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} SIAKD SMP Budi Mulia Jakarta. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default LoginAdmin
