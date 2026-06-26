import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Html5Qrcode } from 'html5-qrcode'
import { useConfirm } from '../utils/useConfirm'
import SiswaRiwayatPresensi from './SiswaRiwayatPresensi'

const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha' }
const STATUS_COLORS = {
  H: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  T: 'text-amber-600 bg-amber-50 border-amber-200',
  S: 'text-blue-600 bg-blue-50 border-blue-200',
  I: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-rose-600 bg-rose-50 border-rose-200',
}

// Step IDs
const STEP = { IDLE: 'idle', SCANNING: 'scanning', SELFIE: 'selfie', SUBMITTING: 'submitting', SUCCESS: 'success', ERROR: 'error' }

export default function SiswaPresensiSection({ studentData }) {
  const [step, setStep] = useState(STEP.IDLE)
  const [presensiHariIni, setPresensiHariIni] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [selfieSrc, setSelfieSrc] = useState(null)
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [scannedToken, setScannedToken] = useState(null)
  const [jamBatasHadir, setJamBatasHadir] = useState('07:00')
  const [qrAktif, setQrAktif] = useState(true)
  const [activeTab, setActiveTab] = useState('isi_presensi')
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const streamRef = useRef(null)
  const selfieInputRef = useRef(null)

  const today = new Date().toLocaleDateString('en-CA')

  // Load status presensi hari ini & pengaturan jam
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    const [{ data: prData }, { data: settings }] = await Promise.all([
      supabase.from('presensi_harian')
        .select('*').eq('tanggal', today).eq('siswa_nisn', studentData.nisn).maybeSingle(),
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
    ])
    if (prData) setPresensiHariIni(prData)
    if (settings) {
      const jam = settings.find(s => s.setting_key === 'jam_batas_hadir')?.setting_value
      if (jam) setJamBatasHadir(jam)
      const qrStatus = settings.find(s => s.setting_key === 'presensi_qr_aktif')?.setting_value
      setQrAktif(qrStatus !== 'false') // default aktif jika belum diset
    }
    setLoadingStatus(false)
  }, [studentData.nisn, today])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Supabase Realtime: update jika diinput piket
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

  // === QR Scanner ===
  const startScanner = () => {
    if (!qrAktif) {
      setErrorMsg('Presensi QR sedang dinonaktifkan oleh sekolah. Silakan hubungi guru piket.')
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
            // QR berhasil terbaca
            await html5QrCode.stop()
            scannerRef.current = null
            handleQRScanned(decodedText)
          },
          () => {} // error scanning (frame by frame, bukan error kritis)
        )
      } catch (err) {
        console.error("Camera error:", err)
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

      // Validasi token ke Supabase
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
      setStep(STEP.SELFIE)
    } catch {
      setStep(STEP.ERROR)
      setErrorMsg('QR Code tidak dikenali. Pastikan Anda scan QR dari layar TV sekolah.')
    }
  }

  // === Selfie (via input file / kamera) ===
  const compressImage = (file, maxWidth = 800) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let { width, height } = img
          if (width > height && width > maxWidth) {
            height *= maxWidth / width
            width = maxWidth
          } else if (height > maxWidth) {
            width *= maxWidth / height
            height = maxWidth
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleSelfieCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const blob = await compressImage(file)
    setSelfieBlob(blob)
    setSelfieSrc(URL.createObjectURL(blob))
  }

  // === Submit Presensi ===
  const handleSubmit = async () => {
    if (!selfieSrc) { setErrorMsg('Selfie belum diambil'); return }
    setStep(STEP.SUBMITTING)

    try {
      const now = new Date()
      const jamSekarang = now.toTimeString().slice(0, 5) // HH:mm
      const [bH, bM] = jamBatasHadir.split(':').map(Number)
      const [sH, sM] = jamSekarang.split(':').map(Number)
      const lewatBatas = sH > bH || (sH === bH && sM > bM)
      const statusOtomatis = lewatBatas ? 'T' : 'H'

      // Cek sudah presensi hari ini?
      const { data: existing } = await supabase.from('presensi_harian')
        .select('id').eq('tanggal', today).eq('siswa_nisn', studentData.nisn).maybeSingle()
      if (existing) {
        setStep(STEP.ERROR)
        setErrorMsg('Anda sudah presensi hari ini.')
        return
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
        updated_at: now.toISOString()
      })
      if (insertErr) throw insertErr

      // Ambil Bot Token dari pengaturan_sekolah
      const { data: botSetting, error: botErr } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'telegram_bot_token')
        .maybeSingle()

      // Ambil ID Telegram Ortu terbaru dari database (jangan pakai data session lama)
      const { data: siswaInfo } = await supabase
        .from('siswa_permanent')
        .select('telegram_ortu')
        .eq('nisn', studentData.nisn)
        .maybeSingle()

      if (!botSetting?.setting_value) {
        console.warn("Token bot tidak ditemukan di pengaturan_sekolah", botErr)
      } else if (!siswaInfo?.telegram_ortu) {
        console.warn("ID Telegram Ortu kosong di database untuk siswa ini")
      } else {
        const botToken = botSetting.setting_value
        const chatId = siswaInfo.telegram_ortu
        
        const statusLabel = { H: '🟢 Hadir', T: '🟡 Terlambat', S: '🤒 Sakit', I: '📨 Izin', A: '❌ Alpha', P: '🏃 Pulang Awal' }
        const label = statusLabel[statusOtomatis] || statusOtomatis
        const tgl = new Date(today).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        
        const message = `🔔 *Notifikasi Presensi eBudiMulia*\n\n👤 *${studentData.nama_lengkap}*\n🏫 Kelas: ${studentData.kelas}\n📅 ${tgl}\n⏰ Pukul: *${jamSekarang} WIB*\n📝 Status: *${label}*\n\n_Pesan ini dikirim otomatis oleh sistem._`
        
        if (selfieBlob) {
          const formData = new FormData()
          formData.append('chat_id', chatId)
          formData.append('caption', message)
          formData.append('parse_mode', 'Markdown')
          formData.append('photo', selfieBlob, 'selfie.jpg')
          
          fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: formData
          }).then(res => res.json()).then(data => {
            if (!data.ok) console.error("Gagal kirim telegram foto:", data)
          }).catch(err => console.error("Error fetch telegram:", err))
        } else {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
          }).then(res => res.json()).then(data => {
            if (!data.ok) console.error("Gagal kirim telegram:", data)
          }).catch(err => console.error("Error fetch telegram:", err))
        }
      }

      setStep(STEP.SUCCESS)
      setPresensiHariIni({ status: statusOtomatis, waktu: jamSekarang })
    } catch (err) {
      setStep(STEP.ERROR)
      setErrorMsg(`Gagal menyimpan presensi: ${err.message}`)
    }
  }

  const reset = () => {
    setStep(STEP.IDLE)
    setErrorMsg('')
    setSelfieSrc(null)
    setSelfieBlob(null)
    setScannedToken(null)
  }

  // Khusus untuk keperluan testing/development
  const handleResetTesting = async () => {
    const confirmed = await requestConfirm({
      title: 'Reset Presensi?',
      message: 'Hapus data presensi hari ini untuk keperluan testing?',
      confirmLabel: 'Hapus Data',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return
    setStep(STEP.SUBMITTING)
    try {
      const { error } = await supabase.from('presensi_harian').delete().eq('tanggal', today).eq('siswa_nisn', studentData.nisn)
      if (error) throw error
      setPresensiHariIni(null)
      setStep(STEP.IDLE)
      alert("Data presensi berhasil direset! Silakan coba scan lagi.")
    } catch (err) {
      setStep(STEP.ERROR)
      setErrorMsg(`Gagal mereset data: ${err.message}`)
    }
  }

  // ===================== RENDER =====================
  if (loadingStatus) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

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

          {/* Card status presensi sudah ada */}
      {presensiHariIni && step !== STEP.SUCCESS ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 text-4xl font-black border-4 ${STATUS_COLORS[presensiHariIni.status] || 'bg-slate-50 border-slate-200 text-slate-600'}`}>
            {presensiHariIni.status}
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-1">
            {STATUS_LABELS[presensiHariIni.status] || presensiHariIni.status}
          </h3>
          <p className="text-sm text-slate-500 mb-1">Tercatat pukul <strong>{presensiHariIni.waktu || '-'}</strong></p>
          {presensiHariIni.metode === 'qr_scan' && (
            <span className="mt-2 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
              Via Scan QR
            </span>
          )}
          
          {import.meta.env.DEV && (
            <button onClick={handleResetTesting} className="mt-6 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">
              Reset Data (Mode Dev)
            </button>
          )}
        </div>
      ) : step === STEP.IDLE ? (
        /* Tombol mulai */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-5">
            <svg className="w-12 h-12 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Belum Presensi</h3>
          <p className="text-sm text-slate-500 mb-6">Scan QR Code dari layar TV di pintu masuk sekolah.</p>
          <button
            onClick={startScanner}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
            Scan QR Sekarang
          </button>
          <p className="text-xs text-slate-400 mt-3">Jam batas hadir: <strong>{jamBatasHadir}</strong></p>
        </div>
      ) : step === STEP.SCANNING ? (
        /* Scanner kamera */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Scan QR Code</h3>
            <button onClick={stopScanner} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-2xl hover:bg-slate-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-500 text-center mb-3">Arahkan kamera ke QR Code di layar TV sekolah</p>
            {/* HTML5-QRCode akan mount ke sini */}
            <div id="qr-reader" className="rounded-xl overflow-hidden border border-slate-100" style={{ minHeight: 280 }} />
            <button onClick={stopScanner} className="w-full mt-3 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200">
              Batal
            </button>
          </div>
        </div>
      ) : step === STEP.SELFIE ? (
        /* Ambil selfie */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
              </div>
              <span className="text-xs font-bold text-emerald-600">QR berhasil discan</span>
            </div>
            <h3 className="font-bold text-slate-800">Ambil Selfie</h3>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            {selfieSrc ? (
              <div className="relative">
                <img src={selfieSrc} alt="Selfie" className="w-48 h-48 rounded-full object-cover border-4 border-indigo-200 shadow-md" />
                <button onClick={() => { setSelfieSrc(null); selfieInputRef.current?.click() }}
                  className="absolute bottom-2 right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center border border-slate-200 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                </button>
              </div>
            ) : (
              <button onClick={() => selfieInputRef.current?.click()}
                className="w-48 h-48 rounded-full bg-slate-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 flex flex-col items-center justify-center gap-2 transition-all group">
                <svg className="w-10 h-10 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">Ambil Selfie</span>
              </button>
            )}
            <input ref={selfieInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleSelfieCapture} />
            <p className="text-xs text-slate-400 text-center">Foto digunakan untuk verifikasi kehadiran Anda. Tidak disimpan di server.</p>
            <div className="flex gap-3 w-full">
              <button onClick={reset} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors">
                Batal
              </button>
              <button onClick={handleSubmit} disabled={!selfieSrc}
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
            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-1">Presensi Berhasil! 🎉</h3>
          <p className="text-sm text-slate-500 mb-1">
            Status: <span className={`font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[presensiHariIni?.status] || ''}`}>
              {STATUS_LABELS[presensiHariIni?.status] || '-'}
            </span>
          </p>
          <p className="text-sm text-slate-500">Pukul <strong>{presensiHariIni?.waktu}</strong></p>
          <p className="text-xs text-slate-400 mt-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            📱 Notifikasi sudah dikirim ke orang tua Anda
          </p>

          {import.meta.env.DEV && (
            <button onClick={handleResetTesting} className="mt-6 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">
              Reset Data (Mode Dev)
            </button>
          )}
        </div>
      ) : step === STEP.ERROR ? (
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-rose-50 border-2 border-rose-200 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Terjadi Masalah</h3>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">{errorMsg}</p>
          <button onClick={reset} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all text-sm">
            Coba Lagi
          </button>
        </div>
      ) : null}
        </div>
      )}
    </div>
  )
}
