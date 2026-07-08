import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
// bcrypt diverifikasi server-side via fn_login RPC (tidak perlu di browser)


function Login() {
  const navigate = useNavigate()

  // Get credentials from URL if present (WhatsApp Auto-Login Link)
  const getUrlParams = () => {
    try {
      const params = new URLSearchParams(window.location.search)
      return {
        u: params.get('u')?.trim() || '',
        p: params.get('p')?.trim() || ''
      }
    } catch (e) {
      return { u: '', p: '' }
    }
  }

  const initialParams = getUrlParams()

  const [loginRole, setLoginRole] = useState('Siswa')
  const [username, setUsername] = useState(initialParams.u)
  const [password, setPassword] = useState(initialParams.p)
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  // Onboarding izin perangkat — disabled by default as requested
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  const [guideType, setGuideType] = useState('')
  const [permissionState, setPermissionState] = useState('prompt')
  const [modalError, setModalError] = useState('')
  
  // State untuk memperbesar gambar setelan
  const [zoomedImg, setZoomedImg] = useState(null)

  const openPermissionGuide = async (type, errorMsg) => {
    setGuideType(type)
    setModalError('')
    setNotification({ type: 'error', message: errorMsg })
    setShowPermissionGuide(true)
    
    try {
      let stateName = 'camera';
      if (type === 'lokasi') stateName = 'geolocation';
      if (type === 'notifikasi') stateName = 'notifications';
      
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: stateName })
        setPermissionState(res.state)
        res.onchange = () => {
          setPermissionState(res.state)
        }
      } else {
        setPermissionState('unknown')
      }
    } catch (e) {
      setPermissionState('unknown')
    }
  }

  const requestSpecificPermission = async (type) => {
    setNotification(null)
    setModalError('')
    if (type === 'kamera') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setPermissionState('granted')
        setShowPermissionGuide(false)
        setNotification({ type: 'success', message: 'Izin Kamera berhasil diaktifkan!' })
      } catch (e) {
        setPermissionState('denied')
        setModalError('Gagal: Kamera masih diblokir browser. Anda harus mengaktifkannya melalui ikon setelan (🎛️) di sebelah kiri alamat web.')
      }
    } else if (type === 'lokasi') {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
        });
        setPermissionState('granted')
        setShowPermissionGuide(false)
        setNotification({ type: 'success', message: 'Izin Lokasi berhasil diaktifkan!' })
      } catch (e) {
        setPermissionState('denied')
        setModalError('Gagal: Lokasi GPS masih diblokir browser. Anda harus mengaktifkannya melalui ikon setelan (🎛️) di sebelah kiri alamat web.')
      }
    } else if (type === 'notifikasi') {
      if ('Notification' in window) {
        const res = await Notification.requestPermission();
        if (res === 'granted') {
          setPermissionState('granted')
          setShowPermissionGuide(false)
          setNotification({ type: 'success', message: 'Izin Notifikasi berhasil diaktifkan!' })
        } else {
          setPermissionState('denied')
          setModalError('Gagal: Notifikasi masih diblokir browser. Anda harus mengaktifkannya melalui ikon setelan (🎛️) di sebelah kiri alamat web.')
        }
      }
    }
  }

  const handleUsernamePaste = (e) => {
    const pastedText = e.clipboardData.getData('text')
    if (!pastedText) return
    const cleanText = pastedText.replace(/\*/g, '').trim()
    
    // 1. Cek jika yang di-paste adalah link login itu sendiri
    if (cleanText.includes('/login?u=') || cleanText.includes('?u=')) {
      try {
        const urlParams = new URLSearchParams(cleanText.substring(cleanText.indexOf('?')))
        const uParam = urlParams.get('u')
        const pParam = urlParams.get('p')
        if (uParam && pParam) {
          e.preventDefault()
          setUsername(uParam.trim())
          setPassword(pParam.trim())
          return
        }
      } catch (err) {
        console.warn("Gagal mengekstrak URL:", err)
      }
    }

    // 2. Format: username|password
    if (cleanText.includes('|')) {
      const parts = cleanText.split('|')
      if (parts.length >= 2) {
        e.preventDefault()
        setUsername(parts[0].trim())
        setPassword(parts[1].trim())
        return
      }
    }

    // 3. Format pesan WhatsApp
    const usernameMatch = cleanText.match(/(?:Username|Email|ID):\s*(\S+)/i)
    const passwordMatch = cleanText.match(/(?:Kode Akses|Password|Kata Sandi):\s*(\S+)/i)
    if (usernameMatch && passwordMatch) {
      e.preventDefault()
      setUsername(usernameMatch[1].trim())
      setPassword(passwordMatch[1].trim())
    }
  }

  useEffect(() => {
    if (localStorage.getItem('siswa_session')) navigate('/dashboard')
    if (localStorage.getItem('guru_session')) navigate('/dashboard-guru')
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    try {
      // 1. Autentikasi menggunakan Supabase Auth (Mengamankan Session Client)
      let emailToSignIn = username.trim().toLowerCase()
      if (!emailToSignIn.includes('@')) {
        emailToSignIn = emailToSignIn + '@ebudimulia.local'
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: emailToSignIn,
        password: password.trim()
      })

      if (authError) {
        setLoading(false)
        let errMsg = authError.message
        if (errMsg === 'Invalid login credentials') {
          errMsg = 'Username atau Kata Sandi salah. Silakan coba lagi.'
        }
        setNotification({ type: 'error', message: errMsg })
        return
      }

      if (loginRole === 'Siswa') {
        // A. Cek izin lokasi (wajib untuk presensi)
        try {
          if (!("geolocation" in navigator)) throw new Error('Browser tidak mendukung Geolocation.');
          await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
        } catch (e) {
          setLoading(false);
          await openPermissionGuide('lokasi', 'Izin LOKASI (GPS) diperlukan untuk verifikasi presensi. Silakan aktifkan izin lokasi perangkat Anda.');
          return;
        }

        // B. Notifikasi (soft-check)
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if ('Notification' in window && Notification.permission === 'denied') {
          setNotification({ type: 'warning', message: '⚠️ Notifikasi diblokir di browser. Pengingat presensi tidak akan muncul. Anda masih bisa login.' });
        }

        // Login via RPC — password diverifikasi server-side, hash tidak keluar ke browser
        const { data: result, error } = await supabase.rpc('fn_login', {
          p_username: emailToSignIn,
          p_password: password.trim(),
          p_role: 'murid'
        })

        if (error || !result?.ok) {
          setLoading(false)
          setNotification({ type: 'error', message: result?.msg || error?.message || 'Terjadi kesalahan sistem.' })
          return
        }

        const sessionData = {
          ...result.siswa,
          kode: result.kode || null,
          kelas: result.kelas || null,
          tahun_ajaran_id: result.tahun_ajaran_id || null,
          tahun_ajaran: result.tahun_ajaran || null,
          akun_id: result.akun_id,
          role: result.role
        }

        localStorage.setItem('siswa_session', JSON.stringify(sessionData))
        logActivity({ userRole: 'Siswa', action: 'Siswa Login', details: `Siswa ${result.siswa?.nama_lengkap} login via eBudiMulia.` })
        navigate('/dashboard')

      } else if (loginRole === 'Orang Tua') {
        // Login orang tua via RPC
        const { data: result, error } = await supabase.rpc('fn_login', {
          p_username: emailToSignIn,
          p_password: password.trim(),
          p_role: 'orang_tua'
        })

        if (error || !result?.ok) {
          setLoading(false)
          setNotification({ type: 'error', message: result?.msg || error?.message || 'Terjadi kesalahan sistem.' })
          return
        }

        const sessionData = {
          ...result.siswa,
          kode: result.kode || null,
          kelas: result.kelas || null,
          tahun_ajaran_id: result.tahun_ajaran_id || null,
          tahun_ajaran: result.tahun_ajaran || null,
          akun_id: result.akun_id,
          role: result.role
        }

        localStorage.setItem('orangtua_session', JSON.stringify(sessionData))
        logActivity({ userRole: 'Orang Tua', action: 'Orang Tua Login', details: `Orang Tua dari ${result.siswa?.nama_lengkap} login via portal.` })
        navigate('/dashboard-orang-tua')

      } else {
        // Login guru/staff via RPC
        const { data: result, error } = await supabase.rpc('fn_login', {
          p_username: emailToSignIn,
          p_password: password.trim(),
          p_role: 'staff'
        })

        if (error || !result?.ok) {
          setLoading(false)
          setNotification({ type: 'error', message: result?.msg || error?.message || 'Terjadi kesalahan sistem.' })
          return
        }

        const g = result.guru
        const sessionData = {
          id: g.id,
          kode: g.kode,
          nama_guru: g.nama_guru,
          user_name: g.user_name,
          foto_url: g.foto_url,
          roles: g.roles || [],
          kelas: g.kelas || [],
          akun_id: result.akun_id,
          app_role: result.role
        }

        localStorage.setItem('guru_session', JSON.stringify(sessionData))
        logActivity({ userId: g.id, userRole: result.role, action: 'Pegawai Login', details: `${g.nama_guru} login via eBudiMulia.` })
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
          <div className="flex p-1 bg-slate-100 rounded-xl mb-6 flex-wrap">
            {['Siswa', 'Orang Tua', 'Guru / Staff'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setLoginRole(role)
                  setUsername('')
                  setPassword('')
                  setNotification(null)
                }}
                className={`flex-1 py-2 px-2 text-sm font-semibold rounded-lg transition-all duration-200 min-w-[30%] ${
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
                : notification.type === 'warning'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {notification.type === 'error' && (
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {notification.type === 'warning' && (
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
                {loginRole === 'Siswa' ? 'Email Siswa (Gmail)' : loginRole === 'Orang Tua' ? 'Username Orang Tua' : 'Username Pegawai'}
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onPaste={handleUsernamePaste}
                placeholder={loginRole === 'Siswa' ? 'contoh: nama@gmail.com' : loginRole === 'Orang Tua' ? 'contoh: ebm.nama123' : 'Masukkan username'}
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

        <div className="text-center text-xs text-slate-500 mt-8 font-medium">
          &copy; {new Date().getFullYear()} eBudiMulia SMP Budi Mulia Jakarta.<br />All rights reserved.
          <br /><br />
          <div className="flex items-center justify-center gap-4">
            <Link to="/login-admin" className="text-slate-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Akses Admin
            </Link>
          </div>
        </div>
      </div>


      {/* MODAL PANDUAN IZIN PERANGKAT (JIKA DIBLOKIR ATAU BELUM AKTIF) */}
      {showPermissionGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 text-center border-b border-slate-100 bg-slate-50">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                {guideType === 'kamera' ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ) : guideType === 'lokasi' ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Izin {guideType === 'kamera' ? 'Kamera' : guideType === 'lokasi' ? 'Lokasi (GPS)' : 'Notifikasi'}
              </h3>
              
              {/* Status Badge */}
              <div className="mt-2 flex items-center justify-center">
                {permissionState === 'denied' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Status: Diblokir 🔒
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Status: Belum Aktif ⚠️
                  </span>
                )}
              </div>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-4 text-left">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2 animate-shake">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  <span>{modalError}</span>
                </div>
              )}
              {permissionState === 'denied' ? (
                <>
                  {window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone ? (
                    <>
                      <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed mb-3">
                        ℹ️ Karena aplikasi dibuka dalam mode <strong>PWA (Aplikasi Terinstal)</strong>, tidak ada ikon setelan alamat web. Aktifkan izin lewat cara berikut:
                      </p>
                      
                      <div className="space-y-3">
                        <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                          <h4 className="text-xs font-bold text-indigo-800 mb-2">📱 Android:</h4>
                          <ol className="text-xs text-slate-600 leading-relaxed space-y-2 list-none">
                            <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">1.</span><span>Tutup aplikasi ini, lalu kembali ke <strong>Layar Utama (Home Screen)</strong> HP.</span></li>
                            <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">2.</span><span><strong>Tekan lama</strong> ikon aplikasi <strong>eBudiMulia</strong> hingga muncul menu pop-up.</span></li>
                            <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">3.</span><span>Pilih <strong>"Info Aplikasi"</strong> atau <strong>"App Info" (ⓘ)</strong>.</span></li>
                            <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">4.</span><span>Pilih <strong>"Izin" / "Permissions"</strong>, lalu aktifkan <strong>{guideType === 'kamera' ? 'Kamera' : guideType === 'lokasi' ? 'Lokasi' : 'Notifikasi'}</strong>.</span></li>
                            <li className="flex gap-2"><span className="font-bold text-indigo-600 shrink-0">5.</span><span>Buka kembali aplikasi dan klik <strong>"Coba Minta Ulang"</strong>.</span></li>
                          </ol>
                        </div>
                        
                        <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl">
                          <h4 className="text-xs font-bold text-purple-800 mb-1">🍎 iPhone (iOS / Safari):</h4>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Hapus ikon aplikasi ini dari Layar Utama, buka kembali di <strong>Safari</strong>, lalu pilih <strong>"Tambah ke Layar Utama"</strong> kembali agar izin dapat di-reset bersih.
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed mb-3">
                        ℹ️ Karena Anda menolak izin sebelumnya, silakan ikuti petunjuk berikut untuk mengaktifkannya kembali secara manual:
                      </p>
                      <div className="space-y-3.5">
                        <div className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                          <div className="text-xs text-slate-600 leading-relaxed space-y-1.5">
                            <span>Klik lambang setelan di sebelah kiri nama domain alamat browser:</span>
                            <div 
                              onClick={() => setZoomedImg('chrome_tune_icon.png')}
                              className="p-1.5 bg-slate-100 border border-slate-200 rounded-lg w-fit cursor-zoom-in hover:opacity-85 transition-opacity"
                              title="Klik untuk memperbesar gambar"
                            >
                              <img src="chrome_tune_icon.png" className="h-8 md:h-10 object-contain" alt="Chrome Tune Icon" />
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium">🔍 Klik gambar di atas untuk memperbesar</p>
                          </div>
                        </div>
                        <div className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Buka / klik menu <strong>Izin / Permissions</strong>.
                          </p>
                        </div>
                        <div className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Centang / aktifkan <strong>Lokasi (Location)</strong> dan <strong>Kamera</strong>.
                          </p>
                        </div>
                        <div className="flex gap-3 items-start">
                          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Buka opsi <strong>Notifikasi / Pemberitahuan</strong> dan aktifkan <strong>Tampilkan Notifikasi (Allow notifications)</strong>.
                          </p>
                        </div>
                        <div className="flex gap-3 items-start border-t border-slate-150 pt-2.5">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">5</div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Muat ulang / <strong>Refresh (Reload)</strong> halaman web ini, lalu login kembali.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-2 space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Browser Anda memerlukan persetujuan izin untuk melanjutkan. Silakan klik tombol besar di bawah ini untuk memicu dan menyetujui perizinan secara langsung.
                  </p>
                  <button
                    type="button"
                    onClick={() => requestSpecificPermission(guideType)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2 animate-bounce"
                  >
                    <span>Aktifkan {guideType === 'kamera' ? 'Kamera' : guideType === 'lokasi' ? 'Lokasi' : 'Notifikasi'} Sekarang</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </button>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
              <button 
                type="button"
                onClick={() => setShowPermissionGuide(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Tutup
              </button>
              {permissionState === 'denied' && (
                <button
                  type="button"
                  onClick={() => requestSpecificPermission(guideType)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors"
                >
                  Coba Minta Ulang
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zoom Modal Popup for Login Guide */}
      {zoomedImg && (
        <div 
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <div 
            className="bg-white p-3 rounded-2xl max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-slate-400 font-bold text-center mb-2">Klik di luar gambar untuk menutup 🔍</p>
            <img src={zoomedImg} className="w-full h-auto rounded-xl object-contain border border-slate-100" alt="Zoomed Icon" />
            <button 
              onClick={() => setZoomedImg(null)} 
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700 shadow-md"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
