import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { getCameraStream, processFileToSelfie } from '../utils/cameraUtils'
import { getTodayWIB } from '../utils/dateUtils'
import { sendFCMPushNotification } from '../utils/fcmSender'
import { showLocalNotif, isNotifGranted } from '../utils/pushNotif'

// Tipe presensi
const TIPE = { MASUK: 'masuk', PULANG: 'pulang' }
const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha', P: 'Pulang' }

export default function PresensiManualSiswa({ isSusulanMode = false }) {
  const isSusulanActive = isSusulanMode || (typeof window !== 'undefined' && (window.location.pathname.includes('susulan') || new URLSearchParams(window.location.search).get('mode') === 'susulan'))
  const today = getTodayWIB()

  // Screen: 'piket_login' | 'select_student' | 'selfie' | 'success'
  const [screen, setScreen] = useState('piket_login')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Piket login state
  const [piketSession, setPiketSession] = useState(null)
  const [piketUsername, setPiketUsername] = useState('')
  const [piketPassword, setPiketPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Student list state
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [semuaKelas, setSemuaKelas] = useState([])
  const [kelasFilter, setKelasFilter] = useState('Semua')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingSiswa, setLoadingSiswa] = useState(false)
  const [presensiMap, setPresensiMap] = useState({}) // nisn => { masuk: bool, pulang: bool }

  // Selected student state
  const [studentSession, setStudentSession] = useState(null)
  const [tipeAktif, setTipeAktif] = useState(TIPE.MASUK)
  const [statusManual, setStatusManual] = useState('H') // 'H' | 'T'
  const [hasMasuk, setHasMasuk] = useState(false)
  const [hasPulang, setHasPulang] = useState(false)
  const [isSusulan, setIsSusulan] = useState(isSusulanActive)
  const [jamBatasHadir, setJamBatasHadir] = useState('07:00')

  // Selfie/camera state
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const [cameraStream, setCameraStream] = useState(null)
  const [selfieSrc, setSelfieSrc] = useState(null)
  const [selfieBlob, setSelfieBlob] = useState(null)

  // ─── Auto-login from existing guru_session ────────────────────────────────
  useEffect(() => {
    try {
      const existing = localStorage.getItem('guru_session')
      if (existing) {
        const g = JSON.parse(existing)
        if (g?.nama_guru) {
          setPiketSession({ id: g.id, nama_guru: g.nama_guru, foto_url: g.foto_url })
          loadStudents()
          setScreen('select_student')
        }
      }
    } catch { }
  }, [])

  // ─── Load Settings ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('pengaturan_sekolah').select('setting_key, setting_value').then(({ data }) => {
      if (data) {
        const jam = data.find(s => s.setting_key === 'jam_batas_hadir')?.setting_value
        if (jam) setJamBatasHadir(jam)
      }
    })
  }, [])

  // ─── Camera ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let currentStream = null
    const startCam = async () => {
      setCameraError('')
      try {
        const ms = await getCameraStream('user')
        currentStream = ms
        setCameraStream(ms)
        if (videoRef.current) {
          videoRef.current.srcObject = ms
          videoRef.current.play().catch(() => {})
        }
      } catch (err) {
        setCameraError(err.userMessage || 'Tidak dapat mengakses kamera browser.')
      }
    }

    if (screen === 'selfie' && !selfieSrc) startCam()

    return () => {
      if (currentStream) currentStream.getTracks().forEach(t => t.stop())
    }
  }, [screen, selfieSrc])

  // ─── Stop camera when leaving selfie ──────────────────────────────────────────
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop())
      setCameraStream(null)
    }
  }

  // ─── Native photo fallback ────────────────────────────────────────────────────
  const handleNativeSelfie = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { dataUrl, blob } = await processFileToSelfie(file)
      setSelfieSrc(dataUrl)
      setSelfieBlob(blob)
    } catch (err) {
      setErrorMsg('Gagal memproses gambar: ' + err.message)
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  // ─── Piket Login ─────────────────────────────────────────────────────────────
  const handlePiketLogin = async (e) => {
    e.preventDefault()
    if (!piketUsername.trim() || !piketPassword.trim()) {
      setErrorMsg('Username dan password harus diisi.')
      return
    }
    setLoading(true)
    setErrorMsg('')

    try {
      const inputUsername = piketUsername.trim().toLowerCase()
      const authEmail = inputUsername.split('@')[0] + '@ebudimulia.local'

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: piketPassword.trim()
      })

      if (authError) {
        let errMsg = authError.message
        if (errMsg === 'Invalid login credentials') errMsg = 'Username atau Kata Sandi salah.'
        setErrorMsg(errMsg)
        setLoading(false)
        return
      }

      const { data: result, error } = await supabase.rpc('fn_login', {
        p_username: inputUsername,
        p_password: piketPassword.trim(),
        p_role: 'staff'
      })

      if (error || !result?.ok) {
        setErrorMsg(result?.msg || error?.message || 'Terjadi kesalahan sistem.')
        setLoading(false)
        return
      }

      const g = result.guru
      setPiketSession({
        id: g.id,
        nama_guru: g.nama_guru,
        foto_url: g.foto_url
      })

      // Load student list
      await loadStudents()
      setScreen('select_student')
    } catch (err) {
      setErrorMsg('Kesalahan sistem: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Load daftar siswa + status presensi hari ini ──────────────────────────
  const loadStudents = async () => {
    setLoadingSiswa(true)
    try {
      const [{ data: siswaData }, { data: presensiData }] = await Promise.all([
        supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('is_aktif', true).order('kelas').order('nama_lengkap'),
        supabase.from('presensi_harian').select('siswa_nisn, tipe').eq('tanggal', today)
      ])

      if (siswaData) {
        setSemuaSiswa(siswaData)
        const kelas = [...new Set(siswaData.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelas(kelas)
      }

      // Build presensi map: nisn => { masuk: bool, pulang: bool }
      const map = {}
      if (presensiData) {
        presensiData.forEach(p => {
          if (!map[p.siswa_nisn]) map[p.siswa_nisn] = { masuk: false, pulang: false }
          if (!p.tipe || p.tipe === TIPE.MASUK) map[p.siswa_nisn].masuk = true
          if (p.tipe === TIPE.PULANG) map[p.siswa_nisn].pulang = true
        })
      }
      setPresensiMap(map)
    } catch (err) {
      console.error('Gagal load siswa:', err)
    } finally {
      setLoadingSiswa(false)
    }
  }

  // ─── Select a student ────────────────────────────────────────────────────────
  const handleSelectStudent = (siswa) => {
    const masuk = presensiMap[siswa.nisn]?.masuk || false
    const pulang = presensiMap[siswa.nisn]?.pulang || false
    setHasMasuk(masuk)
    setHasPulang(pulang)
    setTipeAktif(masuk && !pulang ? TIPE.PULANG : TIPE.MASUK)
    
    const now = new Date()
    const jamSekarang = now.toTimeString().slice(0, 5)
    const [bH, bM] = (jamBatasHadir || '07:00').split(':').map(Number)
    const [sH, sM] = jamSekarang.split(':').map(Number)
    const lewatBatas = sH > bH || (sH === bH && sM > bM)

    if (isSusulanActive) {
      setIsSusulan(true)
      setStatusManual('H')
    } else {
      setIsSusulan(false)
      setStatusManual(lewatBatas ? 'T' : 'H')
    }
    
    setStudentSession(siswa)
    setSelfieSrc(null)
    setSelfieBlob(null)
    setErrorMsg('')
    setCameraError('')
    setScreen('selfie')
  }

  // ─── Back to student list ────────────────────────────────────────────────────
  const handleBackToList = () => {
    stopCamera()
    setStudentSession(null)
    setSelfieSrc(null)
    setSelfieBlob(null)
    setErrorMsg('')
    setScreen('select_student')
    // Refresh presensi map
    loadStudents()
  }

  // ─── Piket Logout ────────────────────────────────────────────────────────────
  const handlePiketLogout = () => {
    stopCamera()
    setPiketSession(null)
    setPiketUsername('')
    setPiketPassword('')
    setStudentSession(null)
    setSemuaSiswa([])
    setPresensiMap({})
    setSearchQuery('')
    setKelasFilter('Semua')
    setErrorMsg('')
    setScreen('piket_login')
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────────
  const takeSnapshot = () => {
    if (!videoRef.current) return
    try {
      const video = videoRef.current
      const origW = video.videoWidth || 640
      const origH = video.videoHeight || 480
      const maxDim = 640
      let targetW = origW, targetH = origH
      if (origW > maxDim || origH > maxDim) {
        if (origW > origH) { targetW = maxDim; targetH = Math.round((origH / origW) * maxDim) }
        else { targetH = maxDim; targetW = Math.round((origW / origH) * maxDim) }
      }
      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      ctx.translate(targetW, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, targetW, targetH)
      canvas.toBlob((blob) => {
        if (blob) { setSelfieBlob(blob); setSelfieSrc(URL.createObjectURL(blob)) }
      }, 'image/jpeg', 0.75)
    } catch (err) { console.error('Selfie error:', err) }
  }

  // ─── Upload selfie ──────────────────────────────────────────────────────────
  const uploadSelfie = async (blob, nisn, tipe) => {
    if (!blob) return null
    try {
      const fileName = `${nisn}_${tipe}_${today}.jpg`
      const { error } = await supabase.storage.from('selfie-presensi').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })
      if (error) return null
      const { data: urlData } = supabase.storage.from('selfie-presensi').getPublicUrl(fileName)
      return urlData?.publicUrl || null
    } catch { return null }
  }

  // ─── Notify ortu & siswa ──────────────────────────────────────────────────
  const notifyOrangTua = async (nisn, namaLengkap, kelas, status, waktu, tipe, selfieUrl) => {
    try {
      const tglFormatted = new Date(today).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const tipeLabel = tipe === TIPE.PULANG ? 'Pulang' : 'Masuk'
      const statusLabel = STATUS_LABELS[status] || status
      const payload = { 
        nisn, 
        namaLengkap, 
        kelas, 
        status, 
        statusLabel, 
        waktu, 
        tipe, 
        tipeLabel, 
        tanggal: tglFormatted, 
        selfieUrl, 
        lokasi: 'Presensi Manual di Meja Piket' 
      }

      // 1. Broadcast Supabase Realtime ke HP Orang Tua & Siswa
      const channelsToSend = [`notif-ortu-${nisn}`, `notif-ortu-dash-${nisn}`, `app-notif-${nisn}`]
      channelsToSend.forEach(chName => {
        const broadcastCh = supabase.channel(chName, { config: { broadcast: { self: true } } })
        if (broadcastCh.state === 'joined') {
          broadcastCh.send({ type: 'broadcast', event: 'presensi_update', payload })
        } else {
          broadcastCh.subscribe(async (s) => {
            if (s === 'SUBSCRIBED') {
              await broadcastCh.send({ type: 'broadcast', event: 'presensi_update', payload })
              setTimeout(() => supabase.removeChannel(broadcastCh), 4000)
            }
          })
        }
      })

      // 2. Kirim Google FCM Push Notification langsung ke HP Orang Tua
      sendFCMPushNotification({
        nisn,
        role: 'Orang Tua',
        title: `[Orang Tua] Presensi ${tipeLabel} Siswa (${statusLabel} - ${waktu} WIB)`,
        body: `${namaLengkap} - Presensi ${tipeLabel} oleh Piket pukul ${waktu} WIB (${statusLabel}).`,
        image: selfieUrl || undefined,
        targetMenu: 'PRESENSI',
        data: { tag: `presensi-ortu-${nisn}-${tipe}` }
      }).catch(err => console.warn('[FCM Presensi Manual] Send error:', err))

      // 4. Edge functions & webhook
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (supabaseUrl && supabaseAnonKey) {
        fetch(`${supabaseUrl}/functions/v1/line-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}`, 'apikey': supabaseAnonKey },
          body: JSON.stringify({ nisn, nama: namaLengkap, kelas, status, waktu, tipe, fotoUrl: selfieUrl, keterangan: 'Presensi Manual di Meja Piket' })
        }).catch(() => {})
      }
    } catch (e) {
      console.warn('[notifyOrangTua] Error:', e)
    }
  }

  // ─── Submit Presensi ─────────────────────────────────────────────────────────
  const submitPresensi = async () => {
    if (!selfieBlob) { setErrorMsg('Silakan ambil foto selfie terlebih dahulu.'); return }
    setLoading(true)
    setErrorMsg('')

    try {
      const { data: existing } = await supabase.from('presensi_harian').select('id').eq('tanggal', today).eq('siswa_nisn', studentSession.nisn).eq('tipe', tipeAktif).maybeSingle()
      if (existing) { setErrorMsg(`Siswa sudah presensi ${tipeAktif} hari ini.`); setLoading(false); return }

      const now = new Date()
      const jamSekarang = now.toTimeString().slice(0, 5)
      const [bH, bM] = (jamBatasHadir || '07:00').split(':').map(Number)
      const [sH, sM] = jamSekarang.split(':').map(Number)
      const lewatBatas = sH > bH || (sH === bH && sM > bM)
      
      const isSusulanFinal = isSusulanActive || isSusulan || (statusManual === 'H' && lewatBatas)
      const finalStatus = tipeAktif === TIPE.MASUK ? statusManual : 'H'

      const selfieUrl = await uploadSelfie(selfieBlob, studentSession.nisn, tipeAktif)
      const keteranganStr = isSusulanFinal 
        ? `Presensi Susulan Manual oleh Piket: ${piketSession?.nama_guru || 'Petugas'}`
        : `Presensi Manual oleh Piket: ${piketSession?.nama_guru || 'Petugas'}`

      const { error: insertErr } = await supabase.from('presensi_harian').upsert({
        tanggal: today,
        kelas: studentSession.kelas,
        siswa_nisn: studentSession.nisn,
        status: finalStatus,
        waktu: jamSekarang,
        metode: isSusulanFinal ? 'susulan_piket' : 'manual_piket',
        tipe: tipeAktif,
        selfie_url: selfieUrl,
        keterangan: keteranganStr,
        updated_at: now.toISOString()
      }, { onConflict: 'tanggal,siswa_nisn,tipe' })
      if (insertErr) throw insertErr

      // Kirim notifikasi ke orang tua di background agar proses di meja piket instan
      notifyOrangTua(studentSession.nisn, studentSession.nama_lengkap, studentSession.kelas, finalStatus, jamSekarang, tipeAktif, selfieUrl).catch(() => {})
      logActivity({ userRole: 'Guru/Piket', action: 'Presensi Manual Piket', details: `${piketSession?.nama_guru} mencatat presensi manual ${tipeAktif} (${finalStatus}) untuk ${studentSession.nama_lengkap}.` })

      const tipeLabel = tipeAktif === TIPE.MASUK ? 'Masuk' : 'Pulang'
      const statusLabel = finalStatus === 'T' ? 'Terlambat' : 'Hadir'
      
      // Tampilkan notifikasi konfirmasi di layar usap HP perangkat piket
      if (isNotifGranted()) {
        showLocalNotif(`Presensi ${tipeLabel} Berhasil: ${studentSession.nama_lengkap}`, `Presensi ${tipeLabel} (${statusLabel}) pada ${jamSekarang} WIB berhasil dicatat.`, {
          tag: `presensi-piket-${studentSession.nisn}-${Date.now()}`,
          data: { url: '/presensi-manual-siswa' }
        })
      }

      setSuccessMsg(`✅ Presensi ${tipeLabel} — ${statusLabel}!`)
      setScreen('success')

      stopCamera()
      setTimeout(() => {
        handleBackToList()
        setScreen('select_student')
        setSuccessMsg('')
      }, 2500)
    } catch (err) {
      setErrorMsg('Gagal mengirim presensi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Filtered Students ───────────────────────────────────────────────────────
  const filteredSiswa = semuaSiswa.filter(s => {
    const matchKelas = kelasFilter === 'Semua' || s.kelas === kelasFilter
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || s.nama_lengkap.toLowerCase().includes(q) || s.nisn.includes(q)
    return matchKelas && matchSearch
  })

  const getStatusBadge = (nisn) => {
    const p = presensiMap[nisn]
    if (!p) return null
    if (p.masuk && p.pulang) return { label: 'Masuk & Pulang', cls: 'bg-emerald-100 text-emerald-700' }
    if (p.masuk) return { label: 'Sudah Masuk', cls: 'bg-blue-100 text-blue-700' }
    if (p.pulang) return { label: 'Sudah Pulang', cls: 'bg-purple-100 text-purple-700' }
    return null
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-8 font-sans" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Logo */}
      <div className="text-center w-full flex justify-center pointer-events-none mb-4">
        <img src="/logo.png?v=1784818000" alt="Logo" className="w-[340px] h-auto object-contain drop-shadow-sm" style={{ maxHeight: '22vh' }} />
      </div>

      <div className="w-full max-w-md z-20 relative">

        {/* ============= SCREEN 1: PIKET LOGIN ============= */}
        {screen === 'piket_login' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className={`w-12 h-12 ${isSusulanActive ? 'bg-amber-600' : 'bg-indigo-600'} rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md`}>
                <span className="text-white text-xl">{isSusulanActive ? '📝' : '🛡️'}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-800">
                {isSusulanActive ? 'Portal Presensi Susulan Siswa' : 'Portal Presensi Piket'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {isSusulanActive ? 'Login untuk mencatat presensi susulan siswa yang lupa absen' : 'Login dengan akun Petugas Piket Anda'}
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold text-center">
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handlePiketLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Username petugas piket"
                  value={piketUsername}
                  onChange={e => setPiketUsername(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 ${isSusulanActive ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'} transition`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Password"
                    value={piketPassword}
                    onChange={e => setPiketPassword(e.target.value)}
                    className={`w-full px-4 py-3 pr-12 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 ${isSusulanActive ? 'focus:ring-amber-500' : 'focus:ring-indigo-500'} transition`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword
                      ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full ${isSusulanActive ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400' : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400'} text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95 shadow-sm`}
              >
                {loading ? 'Memverifikasi...' : 'Masuk sebagai Petugas Piket →'}
              </button>
            </form>
          </div>
        )}

        {/* ============= SCREEN 2: PILIH SISWA ============= */}
        {screen === 'select_student' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 border-b border-slate-100 ${isSusulanActive ? 'bg-gradient-to-r from-amber-50 via-orange-50/40 to-white' : 'bg-gradient-to-r from-indigo-50 to-white'} flex items-center justify-between`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className={`text-[10px] ${isSusulanActive ? 'text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md' : 'text-indigo-600'} font-bold uppercase tracking-widest`}>
                    {isSusulanActive ? '📝 Presensi Susulan Siswa' : 'Petugas Piket'}
                  </p>
                </div>
                <h2 className="text-base font-black text-slate-800 mt-0.5">{piketSession?.nama_guru}</h2>
                {isSusulanActive && (
                  <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                    ⚡ Mode Susulan: Siswa otomatis dicatat <strong>Hadir</strong> (tidak terlambat).
                  </p>
                )}
              </div>
              {localStorage.getItem('guru_session') ? (
                <button
                  onClick={() => window.history.back()}
                  className="text-xs text-slate-500 hover:text-indigo-600 font-semibold transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  Kembali
                </button>
              ) : (
                <button onClick={handlePiketLogout} className="text-xs text-slate-400 hover:text-red-500 font-semibold transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200">
                  Ganti Akun
                </button>
              )}
            </div>

            {/* Search & Filter */}
            <div className="px-5 py-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                <input
                  type="text"
                  placeholder="Cari nama atau NISN siswa..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {['Semua', ...semuaKelas].map(k => (
                  <button
                    key={k}
                    onClick={() => setKelasFilter(k)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${kelasFilter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Student list */}
            <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
              {loadingSiswa ? (
                <div className="flex justify-center py-8">
                  <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : filteredSiswa.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Tidak ada siswa ditemukan</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredSiswa.map(siswa => {
                    const badge = getStatusBadge(siswa.nisn)
                    const selesai = presensiMap[siswa.nisn]?.masuk && presensiMap[siswa.nisn]?.pulang
                    return (
                      <button
                        key={siswa.nisn}
                        onClick={() => handleSelectStudent(siswa)}
                        disabled={selesai}
                        className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-indigo-50 active:bg-indigo-100 transition-colors text-left ${selesai ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
                      >
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 relative">
                          <span className="text-indigo-700 font-black text-sm absolute">
                            {siswa.nama_lengkap.charAt(0).toUpperCase()}
                          </span>
                          <img
                            src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_80,h_80/SKL-BM/FOTO_${siswa.nisn}`}
                            alt=""
                            className="w-full h-full object-cover relative z-10"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{siswa.nama_lengkap}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{siswa.nisn} • Kelas {siswa.kelas}</p>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {badge ? (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Belum Presensi</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer stats */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">
                <span className="font-bold text-slate-700">{filteredSiswa.length}</span> siswa ditampilkan
              </p>
              <button onClick={loadStudents} className="text-[11px] text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* ============= SCREEN 3: SELFIE ============= */}
        {screen === 'selfie' && studentSession && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <button onClick={handleBackToList} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h3 className="text-base font-bold text-slate-800">Foto Selfie Presensi</h3>
                <p className="text-[11px] text-slate-400">Oleh: {piketSession?.nama_guru}</p>
              </div>
            </div>

            {/* Student info */}
            <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-2xl border border-indigo-100">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200 overflow-hidden relative">
                <span className="text-indigo-700 font-black text-sm z-0 absolute">{studentSession.nama_lengkap.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-800 truncate">{studentSession.nama_lengkap}</h4>
                <p className="text-[11px] text-slate-500 font-mono">{studentSession.nisn} • Kelas {studentSession.kelas}</p>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold text-center">⚠️ {errorMsg}</div>
            )}

            {/* Tipe selector */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipe Kehadiran</label>
              <div className="grid grid-cols-2 gap-2">
                {[TIPE.MASUK, TIPE.PULANG].map(t => {
                  const done = t === TIPE.MASUK ? hasMasuk : hasPulang
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={done}
                      onClick={() => setTipeAktif(t)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        tipeAktif === t && !done ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500'
                      } ${done ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                    >
                      {t === TIPE.MASUK ? '🏫 Masuk' : '🏠 Pulang'}{done ? ' ✓' : ''}
                    </button>
                  )
                })}
              </div>

              {/* Status selector (Khusus Masuk) */}
              {tipeAktif === TIPE.MASUK && (
                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Status Kehadiran Masuk
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusManual('H')
                        setIsSusulan(true)
                      }}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        statusManual === 'H'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>🟢</span>
                      <span>Hadir {isSusulanActive ? '(Susulan)' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusManual('T')
                        setIsSusulan(false)
                      }}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        statusManual === 'T'
                          ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-sm ring-2 ring-amber-200'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>🟡</span>
                      <span>Terlambat</span>
                    </button>
                  </div>
                  {statusManual === 'H' && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 mt-2">
                      ✨ Siswa akan dicatat <strong>Hadir</strong> (tidak terlambat).
                    </p>
                  )}
                  {statusManual === 'T' && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                      ⚠️ Siswa akan dicatat <strong>Terlambat</strong>.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Camera */}
            {cameraError && !selfieSrc && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs text-center">
                <p className="font-bold mb-2">⚠️ {cameraError}</p>
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs">
                  📷 Ambil Foto via Kamera HP
                </button>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleNativeSelfie} />

            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 shadow-inner">
              {!selfieSrc ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                    <button type="button" onClick={takeSnapshot} className="w-14 h-14 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-lg active:scale-90 transition-transform border-4 border-indigo-500">
                      <div className="w-9 h-9 rounded-full border-4 border-slate-800" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <img src={selfieSrc} alt="Selfie" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => { setSelfieSrc(null); setSelfieBlob(null) }} className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 text-white rounded-xl text-[10px] font-bold">
                    🔄 Foto Ulang
                  </button>
                </>
              )}
            </div>

            {!selfieSrc && !cameraError && (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1.5">
                📱 Opsi Lain: Buka Kamera HP Native
              </button>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button type="button" onClick={handleBackToList} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl text-xs transition-colors">
                ← Kembali
              </button>
              <button
                type="button"
                onClick={submitPresensi}
                disabled={loading || !selfieSrc || (hasMasuk && hasPulang)}
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-2xl text-xs transition-all shadow-md flex items-center justify-center gap-2"
              >
                {loading ? 'Mengirim...' : 'Kirim Presensi ✅'}
              </button>
            </div>
          </div>
        )}

        {/* ============= SCREEN 4: SUCCESS ============= */}
        {screen === 'success' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center mx-auto animate-bounce">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">{successMsg}</h3>
              <p className="text-sm text-slate-600 font-bold mt-1">{studentSession?.nama_lengkap}</p>
              <p className="text-xs text-slate-400 mt-2">Kembali ke daftar siswa...</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          © {new Date().getFullYear()} eBudiMulia SMP Budi Mulia Jakarta
        </p>
      </div>
    </div>
  )
}
