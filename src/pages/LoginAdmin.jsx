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

  const [isNativeFullScreen, setIsNativeFullScreen] = useState(false)
  const [showIosFsHint, setShowIosFsHint] = useState(false)

  // Detect iOS (Safari doesn't support requestFullscreen)
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream

  const toggleAppFullScreen = () => {
    if (isIos) {
      setShowIosFsHint(true)
      return
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  useEffect(() => {
    const handleFs = () => setIsNativeFullScreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFs)
    document.addEventListener('webkitfullscreenchange', handleFs)
    document.addEventListener('mozfullscreenchange', handleFs)
    document.addEventListener('MSFullscreenChange', handleFs)
    return () => {
      document.removeEventListener('fullscreenchange', handleFs)
      document.removeEventListener('webkitfullscreenchange', handleFs)
      document.removeEventListener('mozfullscreenchange', handleFs)
      document.removeEventListener('MSFullscreenChange', handleFs)
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const userEmail = session.user?.email
        if (!ADMIN_EMAIL || userEmail === ADMIN_EMAIL) {
          navigate('/admin')
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    try {
      // Keluar dari sesi lama terlebih dahulu (jika ada) sebelum masuk sebagai admin
      window.__ebudimuliaExplicitLogout = true
      await supabase.auth.signOut()

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setLoading(false)
        setNotification({ type: 'error', message: 'Kredensial yang Anda masukkan tidak valid. Silakan periksa kembali.' })
        return
      }

      const userEmail = data.user?.email
      if (ADMIN_EMAIL && userEmail !== ADMIN_EMAIL) {
        window.__ebudimuliaExplicitLogout = true
        await supabase.auth.signOut()
        setLoading(false)
        setNotification({ type: 'error', message: 'Akun ini tidak memiliki otorisasi akses administrator.' })
        return
      }
    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Terjadi kesalahan saat masuk.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 overflow-hidden relative">

      <div className="text-center w-full flex justify-center z-10 pointer-events-none mb-2">
        <img src="/logo.png?v=1784818000" alt="Logo SMP Budi Mulia" className="w-[580px] h-auto object-contain drop-shadow-sm" style={{ maxHeight: '55vh' }} />
      </div>

      <div className="w-full max-w-md animate-slide-up z-20 relative">
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-8 shadow-xl">
          
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Masuk ke Portal Admin</h2>
            <p className="text-slate-500 text-sm mt-1">Akses khusus untuk Administrator</p>
          </div>

          <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-xs text-amber-700">Halaman ini hanya dapat diakses oleh Administrator yang berwenang.</p>
          </div>



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
          &copy; {new Date().getFullYear()} eBudiMulia SMP Budi Mulia Jakarta. All rights reserved.
        </p>
      </div>

      {/* Floating Fullscreen Button */}
      <button
        type="button"
        onClick={toggleAppFullScreen}
        title={isNativeFullScreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
        className="fixed bottom-6 right-6 z-[150] w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group border border-indigo-400"
      >
        {isNativeFullScreen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0l5-5M4 4v5M15 9l5-5m0 0l-5-5m5 5v5M9 15l-5 5m0 0l5 5m-5-5v-5M15 15l5 5m0 0l-5 5m5-5v-5"/></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
        )}
      </button>

      {/* iOS Fullscreen Hint Modal */}
      {showIosFsHint && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowIosFsHint(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="bg-indigo-600 px-5 py-4 flex items-center gap-3">
              <svg className="w-6 h-6 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
              <div>
                <p className="text-white font-bold text-sm">Cara Layar Penuh di iPhone/iPad</p>
                <p className="text-indigo-200 text-xs mt-0.5">Safari tidak mendukung fullscreen langsung</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-slate-700 text-sm font-medium">Tambahkan aplikasi ke Home Screen untuk pengalaman layar penuh:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <p className="text-sm text-slate-600">Tekan tombol <strong>Bagikan</strong> <span className="inline-block bg-slate-100 px-1.5 py-0.5 rounded text-xs">⎙</span> di bagian bawah Safari</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p className="text-sm text-slate-600">Pilih <strong>"Tambahkan ke Layar Utama"</strong> (Add to Home Screen)</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <p className="text-sm text-slate-600">Buka aplikasi dari <strong>Home Screen</strong> untuk mode layar penuh otomatis</p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setShowIosFsHint(false)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm">
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginAdmin
