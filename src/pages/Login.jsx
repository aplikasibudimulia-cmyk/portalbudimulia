import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isKodeAksesMode, setIsKodeAksesMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    if (localStorage.getItem('siswa_session')) navigate('/dashboard')
  }, [navigate])

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })

    setLoading(false)

    if (error) {
      setNotification({ type: 'error', message: 'Terjadi kesalahan saat mengirim tautan masuk. Periksa alamat email Anda dan coba lagi.' })
    } else {
      setNotification({ type: 'success', message: 'Tautan masuk telah dikirimkan ke email Anda. Silakan periksa kotak masuk Anda.' })
    }
  }

  const handleKodeAkses = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    const { data, error } = await supabase
      .from('siswa')
      .select('*')
      .ilike('email_aktif', email.trim())
      .eq('kode_akses', password.trim())
      .single()

    if (error || !data) {
      setLoading(false)
      setNotification({ type: 'error', message: 'Email atau Kode Akses yang Anda masukkan tidak valid. Silakan periksa kembali.' })
      return
    }

    localStorage.setItem('siswa_session', JSON.stringify(data))
    setLoading(false)
    navigate('/dashboard')
  }

  const switchMode = (toKodeAkses) => {
    setIsKodeAksesMode(toKodeAkses)
    setNotification(null)
    setPassword('')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">

      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-2">
            <div className="border border-slate-200 rounded-xl shadow-sm p-2 bg-white">
              <img src="/logo.png" alt="Logo SMP Budi Mulia" className="h-20 w-20 object-contain" />
            </div>
            <span className="font-semibold text-slate-700 text-sm tracking-wide">SMP BUDI MULIA</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mt-3">Portal SKL</h1>
          <p className="text-slate-500 mt-1.5 text-sm">Surat Keterangan Lulus — Akses Dokumen Kelulusan</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md">

          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {isKodeAksesMode ? 'Masuk dengan Kode Akses' : 'Akses Dokumen Kelulusan'}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {isKodeAksesMode
              ? 'Masukkan email dan kode akses yang telah diberikan oleh sekolah.'
              : 'Masukkan alamat email terdaftar Anda untuk menerima tautan masuk.'}
          </p>

          {notification && (
            <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
              notification.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {notification.message}
            </div>
          )}

          <form onSubmit={isKodeAksesMode ? handleKodeAkses : handleMagicLink} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Aktif
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh: nama@gmail.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {isKodeAksesMode && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  Kode Akses
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kode akses dari sekolah"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 active:scale-95 shadow-sm"
            >
              {loading ? 'Memproses...' : isKodeAksesMode ? 'Masuk ke Sistem' : 'Kirim Tautan Masuk'}
            </button>
          </form>

          {isKodeAksesMode && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-600 leading-relaxed">
                <span className="font-medium">Catatan:</span> Kode Akses Anda telah dilampirkan di dalam pesan tautan masuk yang pernah dikirimkan oleh sistem.
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            {isKodeAksesMode ? (
              <button
                type="button"
                onClick={() => switchMode(false)}
                className="text-sm text-indigo-600 hover:text-indigo-700 transition-colors duration-200 underline underline-offset-2"
              >
                Kembali menggunakan Tautan Masuk
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode(true)}
                className="text-sm text-indigo-600 hover:text-indigo-700 transition-colors duration-200 underline underline-offset-2"
              >
                Ingin masuk menggunakan Kode Akses?
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} Portal SKL. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Login
