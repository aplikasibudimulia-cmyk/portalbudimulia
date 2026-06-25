import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import bcrypt from 'bcryptjs'

function Login() {
  const navigate = useNavigate()

  const [loginRole, setLoginRole] = useState('Siswa')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('siswa_session')) navigate('/dashboard')
    if (localStorage.getItem('guru_session')) navigate('/dashboard-guru')
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    try {
      if (loginRole === 'Siswa') {
        // --- LOGIC LOGIN SISWA ---
        const { data: siswa, error: siswaError } = await supabase
          .from('siswa_permanent')
          .select('*')
          .ilike('email_aktif', username.trim())
          .maybeSingle()

        if (siswaError || !siswa) {
          setLoading(false)
          setNotification({ type: 'error', message: 'Email tidak terdaftar sebagai Siswa.' })
          return
        }

        if (password.trim() !== siswa.kode_akses) {
          setLoading(false)
          setNotification({ type: 'error', message: 'Kode akses salah.' })
          return
        }

        const { data: activeTa } = await supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).single()

        let enrollment = {}
        if (activeTa) {
          const { data: enrol } = await supabase.from('enrollment').select('*').eq('nisn', siswa.nisn).eq('tahun_ajaran_id', activeTa.id).maybeSingle()
          if (enrol) enrollment = enrol
        }

        const sessionData = {
          ...siswa,
          kode: enrollment.kode || null,
          kelas: enrollment.kelas || null,
          tahun_ajaran_id: activeTa?.id || null,
          tahun_ajaran: activeTa?.nama || null,
          akun_id: 'siswa_' + siswa.id
        }

        localStorage.setItem('siswa_session', JSON.stringify(sessionData))
        logActivity({ userRole: 'Siswa', action: 'Siswa Login', details: `Siswa ${siswa.nama_lengkap} login via eBudiMulia.` })
        navigate('/dashboard')

      } else {
        // --- LOGIC LOGIN GURU / STAFF ---
        const { data: akun, error: akunError } = await supabase
          .from('akun_pengguna')
          .select('*')
          .ilike('username', username.trim())
          .maybeSingle()

        if (akunError || !akun) {
          setLoading(false)
          setNotification({ type: 'error', message: 'Username tidak terdaftar.' })
          return
        }

        if (akun.status !== 'aktif') {
          setLoading(false)
          setNotification({ type: 'error', message: 'Akun Anda dinonaktifkan. Silakan hubungi admin.' })
          return
        }

        const isGuruStaffAkun = akun.role === 'guru' || akun.role === 'admin'
        if (!isGuruStaffAkun) {
          setLoading(false)
          setNotification({ type: 'error', message: `Akun ini bukan milik Guru / Staff.` })
          return
        }

        // Verifikasi Password dengan bcrypt
        const isMatch = bcrypt.compareSync(password.trim(), akun.password || '')
        if (!isMatch) {
          setLoading(false)
          setNotification({ type: 'error', message: 'Kata sandi salah. Silakan coba lagi.' })
          return
        }

        // Login sukses! Ekstrak data
        const { data: guru } = await supabase
          .from('guru')
          .select('*, guru_role(role_id, roles(nama)), guru_kelas(kelas, tahun_ajaran_id)')
          .eq('id', akun.foreign_id)
          .single()

        if (!guru) throw new Error("Data pegawai tidak ditemukan.")

        const sessionData = {
          id: guru.id,
          kode: guru.kode,
          nama_guru: guru.nama_guru,
          user_name: guru.user_name,
          foto_url: guru.foto_url,
          roles: guru.guru_role.map(r => ({ id: r.role_id, nama: r.roles?.nama })),
          kelas: guru.guru_kelas,
          akun_id: akun.id,
          app_role: akun.role
        }

        localStorage.setItem('guru_session', JSON.stringify(sessionData))
        logActivity({ userId: guru.id, userRole: akun.role, action: 'Pegawai Login', details: `${guru.nama_guru} login via eBudiMulia.` })
        navigate('/dashboard-guru')
      }

    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Terjadi kesalahan sistem.' })
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 overflow-hidden relative">
      
      <div className="text-center w-full flex justify-center z-10 pointer-events-none" style={{ marginBottom: '-25px' }}>
        <img src="/logo.png?v=1782401880" alt="Logo SMP Budi Mulia" className="w-[500px] h-auto object-contain drop-shadow-sm" style={{ maxHeight: '50vh' }} />
      </div>

      <div className="w-full max-w-md z-20 relative">
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-8 shadow-xl">
          
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Masuk untuk melanjutkan</h2>
          </div>

          {/* Role Toggle Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
            {['Siswa', 'Guru / Staff'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setLoginRole(role)
                  setUsername('')
                  setPassword('')
                  setNotification(null)
                }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  loginRole === role
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {notification && (
            <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border flex items-center gap-3 ${
              notification.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {notification.type === 'error' && (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {notification.message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                {loginRole === 'Siswa' ? 'Email Siswa (Gmail)' : 'Username Pegawai'}
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={loginRole === 'Siswa' ? 'contoh: nama@gmail.com' : 'Masukkan username'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                {loginRole === 'Siswa' ? 'Kode Akses' : 'Kata Sandi'}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={loginRole === 'Siswa' ? 'Masukkan kode akses' : 'Masukkan kata sandi'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 active:scale-95 shadow-sm"
            >
              {loading ? 'Memproses...' : 'Masuk ke Sistem'}
            </button>
          </form>

        </div>

        <p className="text-center text-xs text-slate-500 mt-8 font-medium">
          &copy; {new Date().getFullYear()} eBudiMulia SMP Budi Mulia Jakarta.<br />All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Login
