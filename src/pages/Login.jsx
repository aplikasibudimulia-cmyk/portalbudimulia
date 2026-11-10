import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { getCameraStream } from '../utils/cameraUtils'
import { initNativePushNotifications } from '../utils/pushNotif'
import { saveAccount, loadAccounts, removeAccount } from '../utils/credentialStore'
import { Capacitor } from '@capacitor/core'
import { recordAdminAccessAttempt, detectMaliciousPayload } from '../utils/geoTracker'
// bcrypt diverifikasi server-side via fn_login RPC (tidak perlu di browser)


function Login() {
  const navigate = useNavigate()

  // Get credentials from URL if present (WhatsApp Auto-Login Link)
  const getUrlParams = () => {
    try {
      const params = new URLSearchParams(window.location.search)
      return {
        u: params.get('u')?.trim() || '',
        p: params.get('p')?.trim() || '',
        r: params.get('r')?.trim() || ''
      }
    } catch (e) {
      return { u: '', p: '', r: '' }
    }
  }

  const initialParams = getUrlParams()

  const [loginRole, setLoginRole] = useState(() => {
    const r = initialParams.r.toLowerCase()
    if (r === 'guru' || r === 'staff') return 'Guru / Staff'
    if (r === 'orang_tua' || r === 'ortu') return 'Orang Tua'
    return 'Siswa'
  })
  const [username, setUsername] = useState(initialParams.u)
  const [password, setPassword] = useState(initialParams.p)
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  // Saved Accounts / Quick Login Switcher
  const [savedAccounts, setSavedAccounts] = useState(() => loadAccounts())
  const [directLoginId, setDirectLoginId] = useState(null) // id akun yang sedang direct-login
  const [showOpenInApp, setShowOpenInApp] = useState(() => {
    return Boolean(initialParams.u && initialParams.p && typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent))
  })

  const saveAccountToHistory = (account) => {
    try {
      const updated = saveAccount(account)
      setSavedAccounts(updated)
    } catch (e) {
      console.warn('Failed to save account:', e)
    }
  }

  const removeSavedAccount = (id, e) => {
    e.stopPropagation()
    try {
      const updated = removeAccount(id)
      setSavedAccounts(updated)
    } catch (e) {
      console.warn('Failed to remove account:', e)
    }
  }

  const handleSelectSavedAccount = (acc) => {
    setLoginRole(acc.role)
    setUsername(acc.username)
    setPassword(acc.password)
    setNotification({ type: 'success', message: `Memilih akun ${acc.displayName}` })
  }

  // Direct Login: klik kartu akun → langsung login via RPC tanpa isi form manual
  const handleDirectLogin = async (acc) => {
    if (directLoginId) return // cegah double-tap
    setDirectLoginId(acc.id)
    setNotification(null)

    try {
      let rpcRole = 'murid'
      let sessionKey = 'siswa_session'
      let targetPath = '/dashboard'

      if (acc.role === 'Orang Tua') {
        rpcRole = 'orang_tua'
        sessionKey = 'orangtua_session'
        targetPath = '/dashboard-orang-tua'
      } else if (acc.role === 'Guru / Staff') {
        rpcRole = 'staff'
        sessionKey = 'guru_session'
        targetPath = '/dashboard-guru'
      }

      // Login langsung via RPC server-side
      const { data: result, error } = await supabase.rpc('fn_login', {
        p_username: acc.username,
        p_password: acc.password,
        p_role: rpcRole
      })

      if (error || !result?.ok) {
        const errMsg = result?.msg || error?.message || 'Gagal login.'
        setNotification({ type: 'error', message: errMsg })
        setDirectLoginId(null)
        return
      }

      // Safeguard: pastikan role dari server cocok dengan yang diminta
      const expectedDbRole = rpcRole === 'staff' ? ['guru','admin','staff','staf','piket'] : [rpcRole]
      if (result.role && !expectedDbRole.includes(result.role)) {
        setNotification({ type: 'error', message: `Akun ini terdaftar sebagai ${result.role}, bukan ${acc.role}. Silakan pilih tab login yang sesuai.` })
        setDirectLoginId(null)
        return
      }

      // Bersihkan session aktif lama agar tidak konflik
      localStorage.removeItem('siswa_session')
      localStorage.removeItem('guru_session')
      localStorage.removeItem('orangtua_session')
      localStorage.removeItem('ebm_session_token')
      if (result.session_token) {
        localStorage.setItem('ebm_session_token', result.session_token)
      }

      let sessionData = {}
      if (acc.role === 'Guru / Staff') {
        const g = result.guru

        // Preload guru_mapel dan role_fitur agar menu akademik (Input Nilai, Siswa Mapel) langsung siap 0ms
        let guruMapelList = (g.guru_mapel && Array.isArray(g.guru_mapel)) ? g.guru_mapel : []
        if (guruMapelList.length === 0) {
          try {
            const { data: gmData } = await supabase
              .from('guru_mapel')
              .select('kelas, tahun_ajaran_id, mata_pelajaran_id, mata_pelajaran(nama)')
              .eq('guru_id', g.id)
            if (gmData && gmData.length > 0) guruMapelList = gmData
          } catch (e) {
            console.warn('Preload guru_mapel error:', e)
          }

          if (guruMapelList.length === 0) {
            try {
              const { data: rpcGm } = await supabase.rpc('fn_get_guru_mapel', { p_guru_id: g.id })
              if (rpcGm && Array.isArray(rpcGm) && rpcGm.length > 0) guruMapelList = rpcGm
            } catch (e) {
              console.warn('Preload rpc guru_mapel error:', e)
            }
          }
        }

        const roleIds = (g.roles || []).map(r => r.id).filter(Boolean)
        if (roleIds.length > 0) {
          try {
            const { data: rfData } = await supabase
              .from('role_fitur')
              .select('fitur, akses_level')
              .in('role_id', roleIds)
            if (rfData) {
              const cachedFitur = []
              const cachedAkses = {}
              rfData.forEach(d => {
                cachedFitur.push(d.fitur)
                if (d.akses_level === 'edit' || !cachedAkses[d.fitur]) {
                  cachedAkses[d.fitur] = d.akses_level || 'edit'
                }
              })
              localStorage.setItem('guru_cached_fitur', JSON.stringify(cachedFitur))
              localStorage.setItem('guru_cached_fitur_akses', JSON.stringify(cachedAkses))
            }
          } catch (e) {
            console.warn('Preload role_fitur error:', e)
          }
        }

        sessionData = {
          id: g.id,
          kode: g.kode,
          nama_guru: g.nama_guru,
          user_name: g.user_name,
          foto_url: g.foto_url,
          roles: g.roles || [],
          kelas: g.kelas || [],
          guru_mapel_raw: guruMapelList,
          mapels: Array.from(new Set(guruMapelList.map(gm => gm.mata_pelajaran?.nama).filter(Boolean))),
          akun_id: result.akun_id,
          app_role: result.role,
          session_token: result.session_token || null
        }
        localStorage.setItem(sessionKey, JSON.stringify(sessionData))
        logActivity({ userId: g.id, userRole: result.role, action: 'Pegawai Login', details: `${g.nama_guru} login via eBudiMulia.` })
      } else {
        sessionData = { ...result.siswa, kode: result.kode || null, kelas: result.kelas || null, tahun_ajaran_id: result.tahun_ajaran_id || null, tahun_ajaran: result.tahun_ajaran || null, akun_id: result.akun_id, role: result.role, session_token: result.session_token || null }
        localStorage.setItem(sessionKey, JSON.stringify(sessionData))
        initNativePushNotifications({ nisn: result.siswa?.nisn || result.siswa?.id, role: acc.role })
        logActivity({ userRole: acc.role, action: `${acc.role} Login`, details: `${result.siswa?.nama_lengkap || acc.displayName} login via eBudiMulia.` })
      }

      navigate(targetPath)
    } catch (err) {
      const msg = err?.message || ''
      const isTimeout = msg.includes('connection pool') || msg.includes('statement timeout') || msg.includes('AbortError') || msg.includes('Failed to fetch')
      setNotification({ type: 'error', message: isTimeout ? '⏳ Server sedang sibuk. Silakan tunggu 5 detik lalu coba lagi.' : (msg || 'Terjadi kesalahan sistem.') })
      setDirectLoginId(null)
    }
  }


  // Deep Link Listener (@capacitor/app) untuk Cold Start & Warm Start
  useEffect(() => {
    let listener = null
    const setupDeepLink = async () => {
      try {
        const { App } = await import('@capacitor/app')

        const handleUrlString = (rawUrl) => {
          if (!rawUrl) return
          try {
            const urlObj = new URL(rawUrl)
            const u = urlObj.searchParams.get('u')?.trim()
            const p = urlObj.searchParams.get('p')?.trim()
            const r = urlObj.searchParams.get('r')?.trim()?.toLowerCase()
            if (u && p) {
              setUsername(u)
              setPassword(p)
              if (r === 'guru' || r === 'staff') setLoginRole('Guru / Staff')
              else if (r === 'orang_tua' || r === 'ortu') setLoginRole('Orang Tua')
              else setLoginRole('Siswa')
              setNotification({ type: 'success', message: 'Kredensial login dari link WhatsApp berhasil dimuat otomatis!' })
            }
          } catch (err) {
            console.warn('Error parsing deep link URL:', err)
          }
        }

        // 1. Cold start: Aplikasi baru dibuka dari link saat sedang ditutup
        const launchUrl = await App.getLaunchUrl()
        if (launchUrl?.url) {
          handleUrlString(launchUrl.url)
        }

        // 2. Warm start: Aplikasi dibuka kembali saat berjalan di latar belakang
        listener = await App.addListener('appUrlOpen', (event) => {
          if (event?.url) {
            handleUrlString(event.url)
          }
        })
      } catch (e) {
        // App plugin fallback
      }
    }
    setupDeepLink()
    return () => {
      if (listener && listener.remove) listener.remove()
    }
  }, [])

  // Onboarding izin perangkat — disabled by default as requested
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  const [guideType, setGuideType] = useState('')
  const [permissionState, setPermissionState] = useState('prompt')
  const [modalError, setModalError] = useState('')
  
  // State untuk memperbesar gambar setelan
  const [zoomedImg, setZoomedImg] = useState(null)

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
        const stream = await getCameraStream('user');
        if (stream) stream.getTracks().forEach(track => track.stop());
        setPermissionState('granted')
        setShowPermissionGuide(false)
        setNotification({ type: 'success', message: 'Izin Kamera berhasil diaktifkan!' })
      } catch (e) {
        setPermissionState('denied')
        setModalError(e.userMessage || 'Gagal: Kamera masih diblokir browser. Anda harus mengaktifkannya melalui pengaturan browser HP.')
      }
    } else if (type === 'lokasi') {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
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
        const rParam = urlParams.get('r')
        if (uParam && pParam) {
          e.preventDefault()
          setUsername(uParam.trim())
          setPassword(pParam.trim())
          if (rParam) {
            const r = rParam.toLowerCase().trim()
            if (r === 'guru' || r === 'staff') setLoginRole('Guru / Staff')
            else if (r === 'orang_tua' || r === 'ortu') setLoginRole('Orang Tua')
            else setLoginRole('Siswa')
          }
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
    const params = new URLSearchParams(window.location.search)
    const uParam = params.get('u')?.trim()
    const pParam = params.get('p')?.trim()
    const rParam = params.get('r')?.trim()?.toLowerCase()

    // Jika tautan mengandung kredensial u dan p, muat langsung ke form dan jangan redirect ke sesi lama
    if (uParam && pParam) {
      setUsername(uParam)
      setPassword(pParam)
      if (rParam === 'guru' || rParam === 'staff') setLoginRole('Guru / Staff')
      else if (rParam === 'orang_tua' || rParam === 'ortu') setLoginRole('Orang Tua')
      else setLoginRole('Siswa')
      setNotification({ type: 'success', message: 'Kredensial login dari link WhatsApp berhasil dimuat otomatis!' })
      if (typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
        setShowOpenInApp(true)
      }
      return
    }

    if (params.get('add_account') === 'true' || params.get('switch') === 'true') {
      return
    }
    if (localStorage.getItem('siswa_session')) navigate('/dashboard')
    if (localStorage.getItem('guru_session')) navigate('/dashboard-guru')
    if (localStorage.getItem('orangtua_session')) navigate('/dashboard-orang-tua')
  }, [navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setNotification(null)

    try {
      const rawInput = username.trim()
      const cleanPassword = password.trim()
      const rpcRole = loginRole === 'Orang Tua' ? 'orang_tua' : loginRole === 'Guru / Staff' ? 'staff' : 'murid'

      // Deteksi instan jika input mengandung SQL Injection / XSS / Payload Peretasan
      const payloadThreat = detectMaliciousPayload(rawInput) || detectMaliciousPayload(cleanPassword)
      if (payloadThreat) {
        recordAdminAccessAttempt(`☠️ SERANGAN ${payloadThreat.toUpperCase()} (${loginRole}): ${rawInput}`, { force: true }).catch(() => {})
        logActivity({
          userId: rawInput,
          userRole: 'SUSPECT_HACKER',
          action: `🚨 Percobaan ${payloadThreat} Diblokir`,
          details: `Percobaan input berbahaya (${payloadThreat}) pada form login ${loginRole} dengan input "${rawInput}".`
        }).catch(() => {})
      }

      // 1. Eksekusi Login via RPC Server-Side dalam 1 kali roundtrip (Super Cepat < 1 detik)
      const { data: result, error } = await supabase.rpc('fn_login', {
        p_username: rawInput,
        p_password: cleanPassword,
        p_role: rpcRole
      })

      if (error || !result?.ok) {
        setLoading(false)
        const errMsg = error?.message || result?.msg || ''
        const isPoolErr = errMsg.includes('connection pool') || errMsg.includes('57014') || errMsg.includes('PGRST003') || errMsg.includes('statement timeout')

        if (!isPoolErr) {
          const prevFails = Number(sessionStorage.getItem('ebm_login_fail_count') || '0') + 1
          sessionStorage.setItem('ebm_login_fail_count', String(prevFails))

          // Rekam ke Pelacak Penyusup jika gagal login Guru/Staff, mencoba akun admin, atau gagal berulang (>= 2x)
          if (
            rpcRole === 'staff' ||
            rawInput.toLowerCase().includes('admin') ||
            rawInput.toLowerCase().includes('aplikasibudimulia') ||
            prevFails >= 2
          ) {
            recordAdminAccessAttempt(
              `🚨 GAGAL LOGIN ${loginRole.toUpperCase()} (${prevFails}x): ${rawInput}`,
              { force: true }
            ).catch(() => {})
          }
        }

        setNotification({ 
          type: 'error', 
          message: isPoolErr ? '⏳ Server sedang sibuk (jam puncak). Tunggu 5 detik lalu coba lagi.' : (result?.msg || errMsg || 'Username atau Kata Sandi salah.') 
        })
        return
      }

      // Reset penghitung gagal login saat berhasil
      sessionStorage.removeItem('ebm_login_fail_count')

      // Safeguard: pastikan role dari server cocok dengan yang diminta
      const expectedDbRoles = rpcRole === 'staff' ? ['guru','admin','staff','staf','piket'] : [rpcRole]
      if (result.role && !expectedDbRoles.includes(result.role)) {
        setLoading(false)
        setNotification({ type: 'error', message: `Akun ini terdaftar sebagai "${result.role}", bukan "${loginRole}". Silakan pilih tab login yang sesuai.` })
        return
      }

      // 2. Bersihkan session aktif lama agar tidak konflik
      localStorage.removeItem('siswa_session')
      localStorage.removeItem('guru_session')
      localStorage.removeItem('orangtua_session')
      localStorage.removeItem('ebm_session_token')
      if (result.session_token) {
        localStorage.setItem('ebm_session_token', result.session_token)
      }

      // 3. Sinkronisasi Auth token Supabase di latar belakang (Non-blocking, tidak menahan loading layar)
      const authUser = (result.siswa?.nisn || result.guru?.id || rawInput.split('@')[0])
      const authEmail = `${authUser}@ebudimulia.local`
      supabase.auth.signInWithPassword({
        email: authEmail,
        password: cleanPassword
      }).catch(() => {})

      // 4. Proses navigasi dan simpan session sesuai role
      if (loginRole === 'Siswa') {
        // Minta izin notifikasi secara non-blocking
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {})
        }

        const sessionData = {
          ...result.siswa,
          kode: result.kode || null,
          kelas: result.kelas || null,
          tahun_ajaran_id: result.tahun_ajaran_id || null,
          tahun_ajaran: result.tahun_ajaran || null,
          akun_id: result.akun_id,
          role: result.role,
          session_token: result.session_token || null
        }

        saveAccountToHistory({
          id: `siswa_${result.siswa?.nisn || result.siswa?.id || username}`,
          role: 'Siswa',
          username: rawInput,
          password: cleanPassword,
          displayName: result.siswa?.nama_lengkap || result.siswa?.nama || username,
          className: result.kelas || result.siswa?.kelas || '',
          avatarUrl: result.siswa?.foto_url || null,
          nisn: result.siswa?.nisn || result.siswa?.id || rawInput,
          lastLogin: Date.now()
        })

        localStorage.setItem('siswa_session', JSON.stringify(sessionData))
        initNativePushNotifications({ nisn: result.siswa?.nisn || result.siswa?.id, role: 'Siswa' })
        logActivity({ userRole: 'Siswa', action: 'Siswa Login', details: `Siswa ${result.siswa?.nama_lengkap} login via eBudiMulia.` })
        navigate('/dashboard')

      } else if (loginRole === 'Orang Tua') {
        const sessionData = {
          ...result.siswa,
          kode: result.kode || null,
          kelas: result.kelas || null,
          tahun_ajaran_id: result.tahun_ajaran_id || null,
          tahun_ajaran: result.tahun_ajaran || null,
          akun_id: result.akun_id,
          role: result.role,
          session_token: result.session_token || null
        }

        saveAccountToHistory({
          id: `ortu_${result.siswa?.nisn || result.siswa?.id || username}`,
          role: 'Orang Tua',
          username: rawInput,
          password: cleanPassword,
          displayName: `Orang Tua (${result.siswa?.nama_lengkap || result.siswa?.nama || username})`,
          className: result.kelas || result.siswa?.kelas || '',
          avatarUrl: null,
          nisn: result.siswa?.nisn || result.siswa?.id || rawInput,
          lastLogin: Date.now()
        })

        localStorage.setItem('orangtua_session', JSON.stringify(sessionData))
        initNativePushNotifications({ nisn: result.siswa?.nisn || result.siswa?.id, role: 'Orang Tua' })
        logActivity({ userRole: 'Orang Tua', action: 'Orang Tua Login', details: `Orang Tua dari ${result.siswa?.nama_lengkap} (NISN: ${result.siswa?.nisn || result.siswa?.id}) login via portal.` })
        navigate('/dashboard-orang-tua')

      } else {
        // Guru / Staff
        const g = result.guru
        let guruMapelList = (g.guru_mapel && Array.isArray(g.guru_mapel)) ? g.guru_mapel : []

        const roleIds = (g.roles || []).map(r => r.id).filter(Boolean)
        if (roleIds.length > 0) {
          // Preload role_fitur di background tanpa memblokir
          supabase
            .from('role_fitur')
            .select('fitur, akses_level')
            .in('role_id', roleIds)
            .then(({ data: rfData }) => {
              if (rfData) {
                const cachedFitur = []
                const cachedAkses = {}
                rfData.forEach(d => {
                  cachedFitur.push(d.fitur)
                  if (d.akses_level === 'edit' || !cachedAkses[d.fitur]) {
                    cachedAkses[d.fitur] = d.akses_level || 'edit'
                  }
                })
                localStorage.setItem('guru_cached_fitur', JSON.stringify(cachedFitur))
                localStorage.setItem('guru_cached_fitur_akses', JSON.stringify(cachedAkses))
              }
            }).catch(() => {})
        }

        const sessionData = {
          id: g.id,
          kode: g.kode,
          nama_guru: g.nama_guru,
          user_name: g.user_name,
          foto_url: g.foto_url,
          roles: g.roles || [],
          kelas: g.kelas || [],
          guru_mapel_raw: guruMapelList,
          mapels: Array.from(new Set(guruMapelList.map(gm => gm.mata_pelajaran?.nama).filter(Boolean))),
          akun_id: result.akun_id,
          app_role: result.role,
          session_token: result.session_token || null
        }

        saveAccountToHistory({
          id: `guru_${g.id || g.user_name || username}`,
          role: 'Guru / Staff',
          username: username.trim(),
          password: password.trim(),
          displayName: g.nama_guru || username,
          className: (g.roles && g.roles.length > 0) ? g.roles.map(r => typeof r === 'string' ? r : (r.nama || '')).filter(Boolean).join(', ') : (g.jabatan || 'Guru/Staff'),
          avatarUrl: g.foto_url || null,
          lastLogin: Date.now()
        })

        localStorage.setItem('guru_session', JSON.stringify(sessionData))
        initNativePushNotifications({ nisn: String(g.id), role: 'Guru' })
        logActivity({ userId: g.id, userRole: result.role, action: 'Pegawai Login', details: `${g.nama_guru} login via eBudiMulia.` })
        navigate('/dashboard-guru')
      }
    } catch (err) {
      setLoading(false)
      const msg = err?.message || ''
      const isTimeout = msg.includes('connection pool') || msg.includes('statement timeout') || msg.includes('AbortError') || msg.includes('Failed to fetch') || msg.includes('PGRST003') || msg.includes('57014')
      if (isTimeout) {
        setNotification({ type: 'error', message: '⏳ Server sedang sibuk (jam puncak presensi). Silakan tunggu 5 detik lalu coba lagi.' })
      } else {
        setNotification({ type: 'error', message: msg || 'Terjadi kesalahan sistem.' })
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 overflow-hidden relative">
      
      <div className="text-center w-full flex justify-center z-10 pointer-events-none mb-2 px-4">
        <img src="/logo.png?v=1784818000" alt="Logo SMP Budi Mulia" className="w-full max-w-[340px] sm:max-w-[460px] md:max-w-[560px] h-auto object-contain drop-shadow-sm" style={{ maxHeight: '50vh' }} />
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

          {/* Banner Buka di Aplikasi Native Android/iOS jika dibuka di web mobile */}
          {showOpenInApp && username && password && !Capacitor.isNativePlatform() && (
            <a
              href={`ebudimulia://login?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&r=${loginRole === 'Orang Tua' ? 'ortu' : loginRole === 'Guru / Staff' ? 'guru' : 'siswa'}`}
              className="mb-4 flex items-center justify-between p-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl shadow-md hover:opacity-95 transition no-underline"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📱</span>
                <div className="text-left leading-tight">
                  <div className="font-bold text-xs">Punya Aplikasi eBudiMulia?</div>
                  <div className="text-[11px] text-blue-100">Buka langsung di aplikasi HP Anda</div>
                </div>
              </div>
              <span className="text-xs bg-white text-indigo-700 font-extrabold px-3 py-1.5 rounded-xl shadow-sm shrink-0">
                Buka Aplikasi →
              </span>
            </a>
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

          {/* Akun Tersimpan di HP Ini (Quick Switcher) */}
          {savedAccounts.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Akun Tersimpan di HP Ini
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Klik untuk masuk langsung</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {savedAccounts.map((acc) => {
                  const isLogging = directLoginId === acc.id
                  return (
                    <div
                      key={acc.id}
                      onClick={() => !directLoginId && handleDirectLogin(acc)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 text-left ${
                        isLogging
                          ? 'border-indigo-300 bg-indigo-50 cursor-wait'
                          : directLoginId
                          ? 'border-slate-200/80 bg-slate-50/70 opacity-50 cursor-not-allowed'
                          : 'border-slate-200/80 bg-slate-50/70 hover:bg-indigo-50/60 hover:border-indigo-200 cursor-pointer group'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                          acc.role === 'Siswa' ? 'bg-gradient-to-tr from-blue-600 to-indigo-500' :
                          acc.role === 'Orang Tua' ? 'bg-gradient-to-tr from-amber-500 to-orange-500' :
                          'bg-gradient-to-tr from-purple-600 to-pink-500'
                        }`}>
                          {isLogging ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                          ) : (
                            acc.displayName ? acc.displayName.charAt(0).toUpperCase() : 'U'
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate transition-colors ${
                            isLogging ? 'text-indigo-700' : 'text-slate-800 group-hover:text-indigo-700'
                          }`}>
                            {isLogging ? 'Sedang masuk...' : acc.displayName}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                              acc.role === 'Siswa' ? 'bg-blue-100 text-blue-700' :
                              acc.role === 'Orang Tua' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {acc.role}
                            </span>
                            {acc.className && <span className="truncate">• {acc.className}</span>}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSavedAccount(acc.id, e) }}
                        title="Hapus dari daftar tersimpan"
                        disabled={!!directLoginId}
                        className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 ml-2 disabled:opacity-30"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
                              <img src="/chrome_tune_icon.png" className="h-8 md:h-10 object-contain" alt="Chrome Tune Icon" />
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

export default Login
