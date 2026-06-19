import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('siswa')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    if (localStorage.getItem('siswa_session')) navigate('/dashboard')
  }, [navigate])

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
          <h1 className="text-3xl font-bold text-slate-900 mt-3">SIAKD</h1>
          <p className="text-slate-500 mt-1.5 text-sm">Sistem Informasi Akademik Digital</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md">

          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setRole('siswa'); setNotification(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                role === 'siswa' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Siswa
            </button>
            <button
              type="button"
              onClick={() => { setRole('guru'); setNotification(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                role === 'guru' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Guru
            </button>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {role === 'siswa' ? 'Masuk sebagai Siswa' : 'Masuk sebagai Guru'}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {role === 'siswa'
              ? 'Masukkan email dan kode akses yang telah diberikan oleh sekolah.'
              : 'Silakan masuk menggunakan kredensial guru Anda.'}
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

          {role === 'siswa' ? (
            <form onSubmit={handleKodeAkses} className="space-y-5">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 active:scale-95 shadow-sm"
              >
                {loading ? 'Memproses...' : 'Masuk ke Sistem'}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-slate-900 mb-1">Modul Guru Belum Tersedia</h3>
              <p className="text-xs text-slate-500">Fitur otentikasi dan dashboard untuk guru sedang dalam tahap pengembangan.</p>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} SIAKD SMP Budi Mulia Jakarta. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Login
