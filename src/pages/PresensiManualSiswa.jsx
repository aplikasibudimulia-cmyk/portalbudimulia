import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

// Tipe presensi
const TIPE = { MASUK: 'masuk', PULANG: 'pulang' }
const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha' }

export default function PresensiManualSiswa() {
  const navigate = useNavigate()
  const today = new Date().toLocaleDateString('en-CA')

  // Screen State: 'login' | 'selfie' | 'success' | 'error'
  const [screen, setScreen] = useState('login')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Login Form State
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Student Session State (Local memory of logged-in student)
  const [studentSession, setStudentSession] = useState(null)
  const [tipeAktif, setTipeAktif] = useState(TIPE.MASUK)
  const [jamBatasHadir, setJamBatasHadir] = useState('07:00')
  const [hasMasuk, setHasMasuk] = useState(false)
  const [hasPulang, setHasPulang] = useState(false)

  // Camera State
  const videoRef = useRef(null)
  const [cameraStream, setCameraStream] = useState(null)
  const [selfieSrc, setSelfieSrc] = useState(null)
  const [selfieBlob, setSelfieBlob] = useState(null)

  // Load Settings
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
      if (data) {
        const jam = data.find(s => s.setting_key === 'jam_batas_hadir')?.setting_value
        if (jam) setJamBatasHadir(jam)
      }
    }
    fetchSettings()
  }, [])

  // Handle camera activation in selfie screen
  useEffect(() => {
    let currentStream = null
    const startCam = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        currentStream = ms
        setCameraStream(ms)
        if (videoRef.current) {
          videoRef.current.srcObject = ms
        }
      } catch (err) {
        console.warn('Gagal memuat kamera:', err)
        setErrorMsg('Tidak dapat mengakses kamera. Pastikan browser memiliki izin kamera.')
      }
    }

    if (screen === 'selfie' && !selfieSrc) {
      startCam()
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [screen, selfieSrc])

  // Reset Student Session and return to Login Screen
  const handleLogout = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop())
      setCameraStream(null)
    }
    setStudentSession(null)
    setSelfieSrc(null)
    setSelfieBlob(null)
    setUsername('')
    setPassword('')
    setErrorMsg('')
    setScreen('login')
  }

  // Handle Student Login
  const handleLogin = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Username dan password harus diisi.')
      return
    }
    setLoading(true)
    setErrorMsg('')

    try {
      // 1. Autentikasi menggunakan Supabase Auth (Mengamankan Session Client)
      let emailToSignIn = username.trim().toLowerCase()
      if (!emailToSignIn.includes('@')) {
        if (emailToSignIn.startsWith('ebmortu.')) {
          emailToSignIn = emailToSignIn + '@ebudimulia.local'
        } else {
          emailToSignIn = emailToSignIn + '@gmail.com'
        }
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
        setErrorMsg(errMsg)
        return
      }

      // 2. Ambil data profil siswa menggunakan RPC
      const { data: result, error } = await supabase.rpc('fn_login', {
        p_username: emailToSignIn,
        p_password: password.trim(),
        p_role: 'murid'
      })

      if (error || !result?.ok) {
        setErrorMsg(result?.msg || error?.message || 'Terjadi kesalahan sistem.')
        setLoading(false)
        return
      }

      const session = {
        ...result.siswa,
        kode: result.kode || null,
        kelas: result.kelas || null,
        tahun_ajaran_id: result.tahun_ajaran_id || null,
        tahun_ajaran: result.tahun_ajaran || null,
        akun_id: result.akun_id
      }

      // Cek apakah sudah presensi hari ini untuk tipe default
      const { data: presensi } = await supabase
        .from('presensi_harian')
        .select('tipe')
        .eq('tanggal', today)
        .eq('siswa_nisn', result.siswa?.nisn)

      const sudahMasuk = presensi?.some(p => !p.tipe || p.tipe === TIPE.MASUK) || false
      const sudahPulang = presensi?.some(p => p.tipe === TIPE.PULANG) || false
      setHasMasuk(sudahMasuk)
      setHasPulang(sudahPulang)

      // Set default tipe yang aktif
      if (sudahMasuk && !sudahPulang) {
        setTipeAktif(TIPE.PULANG)
      } else if (!sudahMasuk) {
        setTipeAktif(TIPE.MASUK)
      } else {
        setTipeAktif(TIPE.MASUK)
      }

      setStudentSession(session)
      setScreen('selfie')
    } catch (err) {
      setErrorMsg('Kesalahan sistem: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Capture Selfie Snapshot
  const takeSnapshot = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    const ctx = canvas.getContext('2d')
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob((blob) => {
      if (blob) {
        setSelfieBlob(blob)
        setSelfieSrc(URL.createObjectURL(blob))
      }
    }, 'image/jpeg', 0.8)
  }

  // Upload Selfie Photo
  const uploadSelfie = async (blob, nisn, tipe) => {
    if (!blob) return null
    try {
      const fileName = `${nisn}_${tipe}_${today}.jpg`
      const { data, error } = await supabase.storage
        .from('selfie-presensi')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })
      if (error) { console.warn('Upload selfie gagal:', error.message); return null }
      const { data: urlData } = supabase.storage.from('selfie-presensi').getPublicUrl(fileName)
      return urlData?.publicUrl || null
    } catch (err) {
      console.warn('Upload selfie error:', err)
      return null
    }
  }

  // Notify parent
  const notifyOrangTua = async (nisn, namaLengkap, kelas, status, waktu, tipe, selfieUrl, lokasi) => {
    try {
      const tglFormatted = new Date(today).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
      const tipeLabel = tipe === TIPE.PULANG ? 'Pulang' : 'Masuk'
      const statusLabel = STATUS_LABELS[status] || status

      const payload = {
        nisn, namaLengkap, kelas, status, statusLabel, waktu,
        tipe, tipeLabel, tanggal: tglFormatted, selfieUrl, lokasi
      }

      await supabase.channel(`notif-ortu-${nisn}`).send({
        type: 'broadcast',
        event: 'presensi_update',
        payload,
      })

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      fetch(`${supabaseUrl}/functions/v1/notify-ortu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(payload),
      }).catch(err => console.warn('[notify-ortu] Fetch error:', err))
    } catch (err) {
      console.warn('Gagal notifikasi orang tua:', err)
    }
  }

  // Submit Attendance Record
  const submitPresensi = async () => {
    if (!selfieBlob) {
      setErrorMsg('Silakan ambil foto selfie terlebih dahulu.')
      return
    }
    setLoading(true)
    setErrorMsg('')

    try {
      // 1. Cek duplikat tipe
      const { data: existing } = await supabase
        .from('presensi_harian')
        .select('id')
        .eq('tanggal', today)
        .eq('siswa_nisn', studentSession.nisn)
        .eq('tipe', tipeAktif)
        .maybeSingle()

      if (existing) {
        setErrorMsg(`Anda sudah presensi ${tipeAktif} hari ini.`)
        setLoading(false)
        return
      }

      // 2. Tentukan status otomatis
      const now = new Date()
      const jamSekarang = now.toTimeString().slice(0, 5)
      const [bH, bM] = jamBatasHadir.split(':').map(Number)
      const [sH, sM] = jamSekarang.split(':').map(Number)
      const lewatBatas = sH > bH || (sH === bH && sM > bM)
      const statusOtomatis = (tipeAktif === TIPE.MASUK) ? (lewatBatas ? 'T' : 'H') : 'H'

      // 3. Upload Selfie
      const selfieUrl = await uploadSelfie(selfieBlob, studentSession.nisn, tipeAktif)

      // 4. Catat presensi (metode 'manual_piket')
      const locationNote = 'Presensi Manual di Meja Piket'
      const { error: insertErr } = await supabase.from('presensi_harian').insert({
        tanggal: today,
        tahun_ajaran_id: studentSession.tahun_ajaran_id || null,
        kelas: studentSession.kelas,
        siswa_nisn: studentSession.nisn,
        status: statusOtomatis,
        waktu: jamSekarang,
        metode: 'manual_piket',
        tipe: tipeAktif,
        selfie_url: selfieUrl,
        keterangan: locationNote,
        updated_at: now.toISOString()
      })

      if (insertErr) throw insertErr

      // 5. Notify orang tua
      await notifyOrangTua(
        studentSession.nisn,
        studentSession.nama_lengkap,
        studentSession.kelas,
        statusOtomatis,
        jamSekarang,
        tipeAktif,
        selfieUrl,
        locationNote
      )

      logActivity({
        userRole: 'Siswa',
        action: 'Presensi Manual Piket',
        details: `Siswa ${studentSession.nama_lengkap} melakukan presensi manual ${tipeAktif} di meja piket.`
      })

      setSuccessMsg(`Presensi ${tipeAktif === TIPE.MASUK ? 'Masuk' : 'Pulang'} Berhasil!`)
      setScreen('success')

      // Auto logout and return to login screen after 3 seconds
      setTimeout(() => {
        handleLogout()
      }, 3000)
    } catch (err) {
      setErrorMsg('Gagal mengirim presensi: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 overflow-hidden relative font-sans" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      
      {/* Centered Large Logo identical to Login.jsx */}
      <div className="text-center w-full flex justify-center z-10 pointer-events-none" style={{ marginBottom: '-25px' }}>
        <img src="/logo.png?v=1782401880" alt="Logo SMP Budi Mulia" className="w-[500px] h-auto object-contain drop-shadow-sm" style={{ maxHeight: '50vh' }} />
      </div>

      <div className="w-full max-w-md z-20 relative">
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-8 shadow-xl">
          
          {/* ================= SCREEN 1: LOGIN ================= */}
          {screen === 'login' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Portal Presensi Mandiri Siswa</h2>
                <p className="text-xs text-slate-400 mt-1">Silakan masuk menggunakan akun Siswa Anda.</p>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold text-center flex items-center gap-2 justify-center">
                  <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Email Siswa (Gmail)</label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: nama@gmail.com"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Kode Akses</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Masukkan kode akses Anda"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
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
                  {loading ? 'Memproses...' : 'Lanjut Presensi →'}
                </button>
              </form>
            </div>
          )}

          {/* ================= SCREEN 2: SELFIE ================= */}
          {screen === 'selfie' && studentSession && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center mb-2">
                <h3 className="text-lg font-bold text-slate-800">Ambil Foto Selfie</h3>
                <p className="text-xs text-slate-400 mt-1">Konfirmasi kehadiran mandiri siswa.</p>
              </div>

              {/* Student Info */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <div className="w-10 h-10 rounded-full bg-indigo-55 flex items-center justify-center shrink-0 border border-indigo-100 overflow-hidden relative shadow-sm">
                  <span className="absolute z-0 text-slate-400 font-bold">{studentSession.nama_lengkap.substring(0,2).toUpperCase()}</span>
                  <img 
                    src={studentSession.tahun_ajaran_id ? `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${studentSession.nisn}_${studentSession.tahun_ajaran_id}` : `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${studentSession.nisn}`}
                    alt={studentSession.nama_lengkap}
                    className="w-full h-full object-cover relative z-10"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{studentSession.nama_lengkap}</h3>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">NISN: {studentSession.nisn} • Kelas: {studentSession.kelas}</p>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold text-center">
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* Selection Tipe Presensi */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pilih Tipe Kehadiran</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={hasMasuk}
                    onClick={() => setTipeAktif(TIPE.MASUK)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      tipeAktif === TIPE.MASUK
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-black shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    } ${hasMasuk ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200 font-normal' : ''}`}
                  >
                    🏫 Masuk {hasMasuk && ' (Terkunci)'}
                  </button>
                  <button
                    type="button"
                    disabled={hasPulang}
                    onClick={() => setTipeAktif(TIPE.PULANG)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      tipeAktif === TIPE.PULANG
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-black shadow-sm'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    } ${hasPulang ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200 font-normal' : ''}`}
                  >
                    🏠 Pulang {hasPulang && ' (Terkunci)'}
                  </button>
                </div>

                {hasMasuk && hasPulang && (
                  <div className="mt-3 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl p-3 text-xs font-semibold text-center">
                    🔒 Anda sudah melakukan presensi Masuk & Pulang hari ini. Presensi telah terkunci.
                  </div>
                )}
              </div>

              {/* Camera View / Photo Preview */}
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 shadow-inner">
                {!selfieSrc ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                      <button
                        type="button"
                        onClick={takeSnapshot}
                        className="w-12 h-12 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                      >
                        <div className="w-8 h-8 rounded-full border-4 border-slate-800" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <img
                      src={selfieSrc}
                      alt="Selfie"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelfieSrc(null)
                        setSelfieBlob(null)
                      }}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl text-[10px] font-bold border border-slate-700"
                    >
                      🔄 Foto Ulang
                    </button>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl text-xs transition-colors"
                >
                  Batal
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

          {/* ================= SCREEN 3: SUCCESS ================= */}
          {screen === 'success' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center mx-auto animate-bounce">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">{successMsg}</h3>
                <p className="text-xs text-slate-500 mt-2 font-medium">Data kehadiran manual berhasil dicatat.</p>
                <p className="text-[10px] text-indigo-600 font-bold mt-4 animate-pulse">Akan kembali ke layar utama secara otomatis...</p>
              </div>
            </div>
          )}

        </div>

        {/* Copyright Footer identical to Login.jsx */}
        <p className="text-center text-xs text-slate-500 mt-8 font-medium">
          &copy; {new Date().getFullYear()} eBudiMulia SMP Budi Mulia Jakarta.<br />All rights reserved.
        </p>
      </div>
    </div>
  )
}
