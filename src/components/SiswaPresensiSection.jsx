import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Html5Qrcode } from 'html5-qrcode'
import { useConfirm } from '../utils/useConfirm'
import { requestNotifPermission, showLocalNotif, isNotifGranted, subscribeToPushNotification } from '../utils/pushNotif'
import SiswaRiwayatPresensi from './SiswaRiwayatPresensi'

const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha' }
const STATUS_COLORS = {
  H: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  T: 'text-amber-600 bg-amber-50 border-amber-200',
  S: 'text-blue-600 bg-blue-50 border-blue-200',
  I: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-rose-600 bg-rose-50 border-rose-200',
}

// Tipe presensi
const TIPE = { MASUK: 'masuk', PULANG: 'pulang' }

// Step IDs
const STEP = { IDLE: 'idle', SCANNING: 'scanning', SELFIE: 'selfie', SUBMITTING: 'submitting', SUCCESS: 'success', ERROR: 'error' }

export default function SiswaPresensiSection({ studentData }) {
  const [step, setStep] = useState(STEP.IDLE)
  const [presensiMasuk, setPresensiMasuk] = useState(null)
  const [presensiPulang, setPresensiPulang] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [selfieSrc, setSelfieSrc] = useState(null)
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [scannedToken, setScannedToken] = useState(null)
  const [jamBatasHadir, setJamBatasHadir] = useState('07:00')
  const [qrAktif, setQrAktif] = useState(true)
  const [selfieRequired, setSelfieRequired] = useState(true)
  const [activeTab, setActiveTab] = useState('isi_presensi')
  const [tipeAktif, setTipeAktif] = useState(TIPE.MASUK) // masuk atau pulang
  const [sesiAktif, setSesiAktif] = useState(false)
  const [notifGranted, setNotifGranted] = useState(isNotifGranted())
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const scannerRef = useRef(null)
  const selfieInputRef = useRef(null)
  const videoRef = useRef(null)

  const today = new Date().toLocaleDateString('en-CA')

  // Load status presensi hari ini & pengaturan
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    const [{ data: prDataAll }, { data: settings }, { data: sesi }] = await Promise.all([
      supabase.from('presensi_harian')
        .select('*').eq('tanggal', today).eq('siswa_nisn', studentData.nisn),
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value'),
      supabase.from('sesi_presensi').select('*').eq('tanggal', today).maybeSingle()
    ])

    setSesiAktif(!!sesi)

    if (prDataAll) {
      const masuk = prDataAll.find(p => !p.tipe || p.tipe === TIPE.MASUK) || null
      const pulang = prDataAll.find(p => p.tipe === TIPE.PULANG) || null
      setPresensiMasuk(masuk)
      setPresensiPulang(pulang)

      // Tentukan tipe aktif: jika sudah masuk, tampilkan pulang; jika sudah pulang, done
      if (!masuk) setTipeAktif(TIPE.MASUK)
      else if (!pulang) setTipeAktif(TIPE.PULANG)
    }

    if (settings) {
      const jam = settings.find(s => s.setting_key === 'jam_batas_hadir')?.setting_value
      if (jam) setJamBatasHadir(jam)
      const qrStatus = settings.find(s => s.setting_key === 'presensi_qr_aktif')?.setting_value
      setQrAktif(qrStatus !== 'false')
      const selfieReq = settings.find(s => s.setting_key === 'selfie_required')?.setting_value
      setSelfieRequired(selfieReq !== 'false')
    }
    setLoadingStatus(false)
  }, [studentData.nisn, today])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Auto-subscribe to Web Push jika izin sudah diberikan sebelumnya
  useEffect(() => {
    if (!notifGranted) return;
    const autoSubscribe = async () => {
      try {
        const subscription = await subscribeToPushNotification()
        if (subscription) {
          await supabase.from('push_subscriptions').upsert({
            nisn: studentData.nisn,
            subscription: subscription.toJSON()
          }, { onConflict: 'nisn' })
        }
      } catch (err) {
        console.error('Gagal auto-subscribe push notification:', err)
      }
    }
    autoSubscribe()
  }, [notifGranted, studentData.nisn])

  // Realtime update
  useEffect(() => {
    const channel = supabase
      .channel(`presensi-siswa-${studentData.nisn}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'presensi_harian',
        filter: `siswa_nisn=eq.${studentData.nisn}`
      }, () => { loadStatus() })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [studentData.nisn, loadStatus])

  // Notifikasi peringatan belum presensi (setiap 5 menit mulai jam 06:40)
  useEffect(() => {
    if (!notifGranted) return

    const checkAndNotify = async () => {
      const now = new Date()
      const { data: settings } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', ['notif_peringatan_aktif', 'jam_mulai_notif_belum_presensi'])

      const notifAktif = settings?.find(s => s.setting_key === 'notif_peringatan_aktif')?.setting_value
      if (notifAktif === 'false') return

      const jamMulai = settings?.find(s => s.setting_key === 'jam_mulai_notif_belum_presensi')?.setting_value || '06:40'
      const [mulaiH, mulaiM] = jamMulai.split(':').map(Number)
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const mulaiMinutes = mulaiH * 60 + mulaiM

      if (nowMinutes < mulaiMinutes) return // belum waktunya

      // Cek apakah sudah presensi hari ini
      const { data: pr } = await supabase
        .from('presensi_harian')
        .select('id').eq('tanggal', today).eq('siswa_nisn', studentData.nisn).limit(1)

      if (!pr || pr.length === 0) {
        showLocalNotif(
          '⏰ Belum Presensi!',
          `${studentData.nama_lengkap}, jangan lupa presensi masuk hari ini!`,
          { tag: 'presensi-reminder' }
        )
      }
    }

    // Jalankan setiap 5 menit
    checkAndNotify()
    const interval = setInterval(checkAndNotify, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [notifGranted, studentData.nisn, studentData.nama_lengkap, today])

  // === QR Scanner ===
  const startScanner = () => {
    if (!qrAktif) {
      setErrorMsg('Presensi QR sedang dinonaktifkan oleh sekolah. Silakan hubungi guru piket.')
      setStep(STEP.ERROR)
      return
    }
    if (tipeAktif === TIPE.PULANG && presensiPulang) {
      setErrorMsg('Anda sudah presensi pulang hari ini.')
      setStep(STEP.ERROR)
      return
    }
    setStep(STEP.SCANNING)
    setErrorMsg('')

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            await html5QrCode.stop()
            scannerRef.current = null
            handleQRScanned(decodedText)
          },
          () => {}
        )
      } catch (err) {
        const errorDetail = typeof err === 'string' ? err : (err?.name || err?.message || 'Unknown error')
        setStep(STEP.ERROR)
        setErrorMsg(`Tidak dapat mengakses kamera: ${errorDetail}. Pastikan browser memiliki izin.`)
      }
    }, 100)
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setStep(STEP.IDLE)
  }

  const handleQRScanned = async (raw) => {
    try {
      const parsed = JSON.parse(raw)
      const { token } = parsed
      if (!token) throw new Error('QR tidak valid')

      const { data, error } = await supabase
        .from('qr_tokens')
        .select('*')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (error || !data) {
        setStep(STEP.ERROR)
        setErrorMsg('QR Code sudah kadaluarsa atau tidak valid. Scan ulang QR terbaru dari TV sekolah.')
        return
      }

      setScannedToken(token)
      if (selfieRequired) {
        setStep(STEP.SELFIE)
      } else {
        // Langsung submit tanpa selfie
        await doSubmit(null, null, token)
      }
    } catch {
      setStep(STEP.ERROR)
      setErrorMsg('QR Code tidak dikenali. Pastikan Anda scan QR dari layar TV sekolah.')
    }
  }

  // === In-browser Camera (Selfie) ===
  useEffect(() => {
    let currentStream = null
    const startCam = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } } })
        currentStream = ms
        if (videoRef.current) videoRef.current.srcObject = ms
      } catch (err) {
        console.warn('Camera error:', err)
      }
    }

    if (step === STEP.SELFIE && !selfieSrc) {
      startCam()
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [step, selfieSrc])

  const takeSnapshot = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    
    // Handle cases where video dimensions aren't ready yet
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    
    const ctx = canvas.getContext('2d')
    // Mirror the canvas so the saved photo looks exactly like the video preview
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

  // === Upload Selfie ke Supabase Storage ===
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

  // === Kirim Notifikasi Web ke Orangtua via Supabase realtime broadcast ===
  const notifyOrangTua = async (nisn, namaLengkap, kelas, status, waktu, tipe, selfieUrl) => {
    try {
      const tglFormatted = new Date(today).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
      const tipeLabel = tipe === TIPE.PULANG ? 'Pulang' : 'Masuk'
      const statusLabel = STATUS_LABELS[status] || status

      // Broadcast ke channel orangtua via Supabase Realtime
      await supabase.channel(`notif-ortu-${nisn}`).send({
        type: 'broadcast',
        event: 'presensi_update',
        payload: {
          nisn, namaLengkap, kelas, status, statusLabel, waktu,
          tipe, tipeLabel, tanggal: tglFormatted, selfieUrl
        }
      })
    } catch (err) {
      console.warn('Gagal kirim notif ke orangtua:', err)
    }
  }

  // === Core Submit ===
  const doSubmit = async (selfieB, selfieSrcLocal, token) => {
    setStep(STEP.SUBMITTING)
    try {
      const now = new Date()
      const jamSekarang = now.toTimeString().slice(0, 5)
      const [bH, bM] = jamBatasHadir.split(':').map(Number)
      const [sH, sM] = jamSekarang.split(':').map(Number)
      const lewatBatas = sH > bH || (sH === bH && sM > bM)
      const statusOtomatis = (tipeAktif === TIPE.MASUK) ? (lewatBatas ? 'T' : 'H') : 'H'

      // Cek duplikat untuk tipe yang sama
      const { data: existing } = await supabase.from('presensi_harian')
        .select('id').eq('tanggal', today).eq('siswa_nisn', studentData.nisn)
        .eq('tipe', tipeAktif).maybeSingle()

      if (existing) {
        setStep(STEP.ERROR)
        setErrorMsg(`Anda sudah presensi ${tipeAktif} hari ini.`)
        return
      }

      // Upload selfie ke Supabase Storage (jika ada)
      let selfieUrl = null
      if (selfieB) {
        selfieUrl = await uploadSelfie(selfieB, studentData.nisn, tipeAktif)
      }

      // Insert presensi
      const { error: insertErr } = await supabase.from('presensi_harian').insert({
        tanggal: today,
        tahun_ajaran_id: studentData.tahun_ajaran_id || null,
        kelas: studentData.kelas,
        siswa_nisn: studentData.nisn,
        status: statusOtomatis,
        waktu: jamSekarang,
        metode: 'qr_scan',
        tipe: tipeAktif,
        selfie_url: selfieUrl,
        updated_at: now.toISOString()
      })
      if (insertErr) throw insertErr

      // Kirim notifikasi ke orangtua via realtime
      await notifyOrangTua(
        studentData.nisn,
        studentData.nama_lengkap,
        studentData.kelas,
        statusOtomatis,
        jamSekarang,
        tipeAktif,
        selfieUrl
      )

      // Update state lokal
      if (tipeAktif === TIPE.MASUK) {
        setPresensiMasuk({ status: statusOtomatis, waktu: jamSekarang, tipe: TIPE.MASUK, selfie_url: selfieUrl })
        setTipeAktif(TIPE.PULANG)
      } else {
        setPresensiPulang({ status: statusOtomatis, waktu: jamSekarang, tipe: TIPE.PULANG, selfie_url: selfieUrl })
      }

      setStep(STEP.SUCCESS)
    } catch (err) {
      setStep(STEP.ERROR)
      setErrorMsg(`Gagal menyimpan presensi: ${err.message}`)
    }
  }

  const handleSubmit = async () => {
    if (selfieRequired && !selfieSrc) { setErrorMsg('Selfie belum diambil'); return }
    await doSubmit(selfieBlob, selfieSrc, scannedToken)
  }

  const reset = () => {
    setStep(STEP.IDLE)
    setErrorMsg('')
    setSelfieSrc(null)
    setSelfieBlob(null)
    setScannedToken(null)
  }

  const handleResetTesting = async () => {
    const confirmed = await requestConfirm({
      title: 'Reset Presensi?',
      message: 'Hapus data presensi hari ini untuk keperluan testing?',
      confirmLabel: 'Hapus Data', confirmColor: 'red', icon: 'danger'
    })
    if (!confirmed) return
    setStep(STEP.SUBMITTING)
    try {
      const { error } = await supabase.from('presensi_harian').delete().eq('tanggal', today).eq('siswa_nisn', studentData.nisn)
      if (error) throw error
      setPresensiMasuk(null); setPresensiPulang(null)
      setTipeAktif(TIPE.MASUK)
      setStep(STEP.IDLE)
    } catch (err) {
      setStep(STEP.ERROR)
      setErrorMsg(`Gagal mereset data: ${err.message}`)
    }
  }

  const handleMintaIzinNotif = async () => {
    const result = await requestNotifPermission()
    if (result === 'granted') {
      setNotifGranted(true)
      await showLocalNotif('✅ Notifikasi Aktif', 'Kamu akan mendapat pengingat presensi setiap hari.', { tag: 'notif-aktif' })
      
      // Subscribe to Web Push and save to Supabase
      const subscription = await subscribeToPushNotification()
      if (subscription) {
        try {
          await supabase.from('push_subscriptions').upsert({
            nisn: studentData.nisn,
            subscription: subscription.toJSON()
          }, { onConflict: 'nisn' })
        } catch (err) {
          console.error('Gagal menyimpan push subscription:', err)
        }
      }
    } else {
      alert('Izin notifikasi ditolak. Aktifkan dari pengaturan browser Anda.')
    }
  }

  // ===================== RENDER =====================
  if (loadingStatus) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  const sudahMasuk = !!presensiMasuk
  const sudahPulang = !!presensiPulang
  const isDone = sudahMasuk && sudahPulang

  return (
    <div className="animate-fade-in w-full max-w-4xl mx-auto">
      {ConfirmModalComponent}

      {/* TABS NAVIGATION */}
      <div className="flex gap-4 border-b border-slate-200 mb-8 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('isi_presensi')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'isi_presensi' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Isi Presensi Harian
        </button>
        <button
          onClick={() => setActiveTab('riwayat')}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'riwayat' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Riwayat Kehadiran
        </button>
      </div>

      {activeTab === 'riwayat' ? (
        <SiswaRiwayatPresensi studentData={studentData} />
      ) : (
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-900">Presensi Hari Ini</h2>
            <p className="text-sm text-slate-500 mt-1">Scan QR Code dari layar TV sekolah untuk mencatat kehadiran Anda.</p>
          </div>

          {/* Banner minta izin notifikasi */}
          {!notifGranted && 'Notification' in window && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800">Aktifkan Pengingat Presensi</p>
                <p className="text-xs text-amber-700 mt-0.5">Dapatkan notifikasi jika belum presensi di pagi hari.</p>
              </div>
              <button onClick={handleMintaIzinNotif} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-2xl transition-colors shrink-0">
                Aktifkan
              </button>
            </div>
          )}

          {/* Status Masuk & Pulang */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className={`rounded-xl border p-4 text-center ${sudahMasuk ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Masuk</p>
              {sudahMasuk ? (
                <>
                  <p className={`text-sm font-black ${STATUS_COLORS[presensiMasuk.status]?.split(' ')[0] || 'text-emerald-600'}`}>{STATUS_LABELS[presensiMasuk.status]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{presensiMasuk.waktu} WIB</p>
                  {presensiMasuk.selfie_url && (
                    <img src={presensiMasuk.selfie_url} alt="selfie" className="w-10 h-10 rounded-full object-cover mx-auto mt-2 border-2 border-emerald-200" />
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Belum</p>
              )}
            </div>
            <div className={`rounded-xl border p-4 text-center ${sudahPulang ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Pulang</p>
              {sudahPulang ? (
                <>
                  <p className="text-sm font-black text-blue-600">Pulang</p>
                  <p className="text-xs text-slate-500 mt-0.5">{presensiPulang.waktu} WIB</p>
                  {presensiPulang.selfie_url && (
                    <img src={presensiPulang.selfie_url} alt="selfie" className="w-10 h-10 rounded-full object-cover mx-auto mt-2 border-2 border-blue-200" />
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Belum</p>
              )}
            </div>
          </div>

          {/* Semua sudah selesai */}
          {isDone && step !== STEP.SUCCESS ? (
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-1">Presensi Lengkap 🎉</h3>
              <p className="text-sm text-slate-500">Masuk & pulang sudah tercatat. Sampai jumpa besok!</p>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : !sesiAktif ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center mb-5">
                <svg className="w-12 h-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Belum Waktunya</h3>
              <p className="text-sm text-slate-500 max-w-sm">Presensi hari ini belum dibuka oleh Petugas Piket. Silakan tunggu beberapa saat lagi atau hubungi petugas.</p>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : step === STEP.IDLE && !isDone ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-5">
                <svg className="w-12 h-12 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">
                {tipeAktif === TIPE.MASUK ? 'Presensi Masuk' : 'Presensi Pulang'}
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                {tipeAktif === TIPE.MASUK
                  ? 'Scan QR Code dari layar TV di pintu masuk sekolah.'
                  : 'Scan QR Code dari layar TV untuk konfirmasi pulang.'}
              </p>
              <button
                onClick={startScanner}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                Scan QR — {tipeAktif === TIPE.MASUK ? 'Masuk' : 'Pulang'}
              </button>
              <p className="text-xs text-slate-400 mt-3">Jam batas hadir: <strong>{jamBatasHadir}</strong></p>

              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : step === STEP.SCANNING ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Scan QR — {tipeAktif === TIPE.MASUK ? 'Masuk' : 'Pulang'}</h3>
                <button onClick={stopScanner} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-2xl hover:bg-slate-100 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-500 text-center mb-3">Arahkan kamera ke QR Code di layar TV sekolah</p>
                <div id="qr-reader" className="rounded-xl overflow-hidden border border-slate-100" style={{ minHeight: 280 }} />
                <button onClick={stopScanner} className="w-full mt-3 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200">Batal</button>
              </div>
            </div>
          ) : step === STEP.SELFIE ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">QR berhasil discan</span>
                </div>
                <h3 className="font-bold text-slate-800">Ambil Selfie</h3>
              </div>
              <div className="p-5 flex flex-col items-center gap-4">
                {selfieSrc ? (
                  <div className="relative">
                    <img src={selfieSrc} alt="Selfie" className="w-48 h-48 rounded-full object-cover border-4 border-indigo-200 shadow-md" />
                    <button onClick={() => { setSelfieSrc(null) }}
                      className="absolute bottom-2 right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border border-slate-200 hover:bg-slate-50 transition-colors">
                      <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                    </button>
                  </div>
                ) : (
                  <div className="relative w-48 h-48 rounded-full bg-slate-100 border-4 border-slate-200 overflow-hidden flex flex-col items-center justify-center group shadow-inner">
                    <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" />
                    <button onClick={takeSnapshot} className="absolute bottom-3 bg-white/90 backdrop-blur text-indigo-700 px-4 py-1.5 rounded-full text-xs font-bold shadow-md hover:bg-indigo-50 border border-indigo-100 transition-colors z-10 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                      Jepret
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-400 text-center px-4">Arahkan wajah ke layar lalu tekan tombol <strong>Jepret</strong> untuk foto bukti kehadiran.</p>
                <div className="flex gap-3 w-full">
                  <button onClick={reset} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors">Batal</button>
                  <button onClick={handleSubmit} disabled={selfieRequired && !selfieSrc}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-xl transition-all shadow-md shadow-indigo-100">
                    Konfirmasi Presensi
                  </button>
                </div>
              </div>
            </div>
          ) : step === STEP.SUBMITTING ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
              <p className="font-bold text-slate-700">Menyimpan presensi...</p>
              <p className="text-sm text-slate-400 mt-1">Sedang mengirim data ke server</p>
            </div>
          ) : step === STEP.SUCCESS ? (
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-8 flex flex-col items-center text-center animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-1">Presensi Berhasil! 🎉</h3>
              <p className="text-sm text-slate-500 mb-3">
                {tipeAktif === TIPE.PULANG && sudahMasuk ? 'Presensi masuk' : 'Presensi'} sudah tercatat.
              </p>
              <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                📱 Notifikasi sudah dikirim ke akun orang tua
              </p>
              <button onClick={reset} className="mt-5 px-5 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-100">
                Selesai
              </button>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-2 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : step === STEP.ERROR ? (
            <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-200 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Terjadi Masalah</h3>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">{errorMsg}</p>
              <button onClick={reset} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all text-sm">Coba Lagi</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
