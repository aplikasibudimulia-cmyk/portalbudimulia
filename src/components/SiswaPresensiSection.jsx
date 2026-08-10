import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Html5Qrcode } from 'html5-qrcode'
import { useConfirm } from '../utils/useConfirm'
import { requestNotifPermission, showLocalNotif, isNotifGranted, subscribeToPushNotification } from '../utils/pushNotif'
import { getCameraStream, processFileToSelfie } from '../utils/cameraUtils'
import SiswaRiwayatPresensi from './SiswaRiwayatPresensi'

const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha', P: 'Pulang' }
const STATUS_COLORS = {
  H: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  T: 'text-amber-600 bg-amber-50 border-amber-200',
  S: 'text-blue-600 bg-blue-50 border-blue-200',
  I: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-rose-600 bg-rose-50 border-rose-200',
  P: 'text-slate-600 bg-slate-50 border-slate-200',
}

// Tipe presensi
const TIPE = { MASUK: 'masuk', PULANG: 'pulang' }

// Step IDs
const STEP = { IDLE: 'idle', SCANNING: 'scanning', SELFIE: 'selfie', SUBMITTING: 'submitting', SUCCESS: 'success', ERROR: 'error' }

// ===== Haversine Distance Calculator =====
function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Radius bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function SiswaPresensiSection({ studentData }) {
  const [step, setStep] = useState(STEP.IDLE)
  const [presensiMasuk, setPresensiMasuk] = useState(null)
  const [presensiPulang, setPresensiPulang] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [selfieSrc, setSelfieSrc] = useState(null)
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [scannedToken, setScannedToken] = useState(null)
  const [jamBatasHadir, setJamBatasHadir] = useState('07:00')
  const [qrAktif, setQrAktif] = useState(true)
  const [selfieRequired, setSelfieRequired] = useState(true)
  const [activeTab, setActiveTab] = useState('isi_presensi')
  const [tipeAktif, setTipeAktif] = useState(TIPE.MASUK) // masuk atau pulang
  const [sesiAktif, setSesiAktif] = useState(false)
  const [jadwalOtomatisAktif, setJadwalOtomatisAktif] = useState(false)
  const [jamMulaiPresensi, setJamMulaiPresensi] = useState('')
  const [hariAktifPresensi, setHariAktifPresensi] = useState('1,2,3,4,5')
  const [jamBatasPulang, setJamBatasPulang] = useState('')
  const [presensiMasukMode, setPresensiMasukMode] = useState('qr') // 'qr' | 'geofence' | 'both'
  const [presensiPulangAktif, setPresensiPulangAktif] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null) // null | 'qr' | 'geofence'
  const [notifGranted, setNotifGranted] = useState(isNotifGranted())
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const [geofenceConfig, setGeofenceConfig] = useState({
    aktif: false,
    lat: null,
    lng: null,
    radius: 200
  })
  const [geofenceAreas, setGeofenceAreas] = useState([]) // multiple extra areas

  const scannerRef = useRef(null)
  const selfieFileInputRef = useRef(null)
  const qrFileInputRef = useRef(null)
  const videoRef = useRef(null)
  const selectedModeRef = useRef(null) // ref agar tidak stale di async callbacks

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
      const autAct = settings.find(s => s.setting_key === 'jadwal_otomatis_aktif')?.setting_value === 'true'
      setJadwalOtomatisAktif(autAct)
      const mul = settings.find(s => s.setting_key === 'jam_mulai_presensi')?.setting_value || ''
      setJamMulaiPresensi(mul)
      const har = settings.find(s => s.setting_key === 'hari_aktif_presensi')?.setting_value || '1,2,3,4,5'
      setHariAktifPresensi(har)
      const pul = settings.find(s => s.setting_key === 'jam_batas_pulang')?.setting_value || ''
      setJamBatasPulang(pul)
      const pulAktifVal = settings ? settings.find(s => s.setting_key === 'presensi_pulang_aktif')?.setting_value : null
      const pulAktif = pulAktifVal === 'true' || pulAktifVal === '1'
      setPresensiPulangAktif(pulAktif || !!sesi)
      const selfieReq = settings.find(s => s.setting_key === 'selfie_required')?.setting_value
      setSelfieRequired(selfieReq !== 'false')
      const mMode = settings.find(s => s.setting_key === 'presensi_masuk_mode')?.setting_value || 'qr'
      setPresensiMasukMode(mMode)

      // Geofence config
      const geoAktif = settings.find(s => s.setting_key === 'geofence_aktif')?.setting_value === 'true'
      const geoLat = parseFloat(settings.find(s => s.setting_key === 'geofence_lat')?.setting_value || '')
      const geoLng = parseFloat(settings.find(s => s.setting_key === 'geofence_lng')?.setting_value || '')
      const geoRadius = parseInt(settings.find(s => s.setting_key === 'geofence_radius_meter')?.setting_value || '200', 10)
      setGeofenceConfig({
        aktif: geoAktif,
        lat: isNaN(geoLat) ? null : geoLat,
        lng: isNaN(geoLng) ? null : geoLng,
        radius: isNaN(geoRadius) ? 200 : geoRadius
      })
      // Load extra geofence areas
      const areasRaw = settings.find(s => s.setting_key === 'geofence_areas')?.setting_value
      if (areasRaw) {
        try { setGeofenceAreas(JSON.parse(areasRaw)) } catch { setGeofenceAreas([]) }
      }
    }
    setLoadingStatus(false)
  }, [studentData.nisn, today])

  const isHariAktif = useMemo(() => {
    if (!jadwalOtomatisAktif) return true
    const todayDow = new Date().getDay()
    const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
    return activeDays.includes(todayDow)
  }, [jadwalOtomatisAktif, hariAktifPresensi])

  const presensiBelumMulai = useMemo(() => {
    if (!jadwalOtomatisAktif || !jamMulaiPresensi) return false
    if (!isHariAktif) return false
    const [mh, mm] = jamMulaiPresensi.split(':').map(Number)
    const now = new Date()
    const [nh, nm] = [now.getHours(), now.getMinutes()]
    return nh < mh || (nh === mh && nm < mm)
  }, [jadwalOtomatisAktif, jamMulaiPresensi, isHariAktif])

  const presensiSelesai = useMemo(() => {
    if (!jadwalOtomatisAktif || !jamBatasPulang) return false
    if (!isHariAktif) return false
    const [bh, bm] = jamBatasPulang.split(':').map(Number)
    const now = new Date()
    const [nh, nm] = [now.getHours(), now.getMinutes()]
    return nh > bh || (nh === bh && nm >= bm)
  }, [jadwalOtomatisAktif, jamBatasPulang, isHariAktif])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Auto-subscribe to Web Push jika izin sudah diberikan sebelumnya
  useEffect(() => {
    if (!notifGranted) return;
    const autoSubscribe = async () => {
      try {
        const subscription = await subscribeToPushNotification()
        if (subscription) {
          // Hapus subscription dari user lain yang menggunakan browser/perangkat ini
          const endpointUrl = subscription.endpoint
          if (endpointUrl) {
            await supabase.from('push_subscriptions')
              .delete()
              .filter('subscription->>endpoint', 'eq', endpointUrl)
          }

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
    const channel1 = supabase
      .channel(`presensi-siswa-${studentData.nisn}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'presensi_harian',
        filter: `siswa_nisn=eq.${studentData.nisn}`
      }, () => { loadStatus() })
      .subscribe()

    const channel2 = supabase
      .channel(`pengaturan-sekolah-siswa`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pengaturan_sekolah'
      }, () => { loadStatus() })
      .subscribe()

    return () => {
      supabase.removeChannel(channel1)
      supabase.removeChannel(channel2)
    }
  }, [studentData.nisn, loadStatus])

  const handleMulaiPresensiQR = () => {
    selectedModeRef.current = 'qr'
    setSelectedMode('qr')
    startScanner()
  }

  const handleMulaiPresensiGeofence = () => {
    selectedModeRef.current = 'geofence'
    setSelectedMode('geofence')
    setErrorMsg('')
    if (selfieRequired) {
      setStep(STEP.SELFIE)
    } else {
      doSubmit(null, null, null, 'geofence')
    }
  }

  const handleMulaiPresensi = (modeOverride) => {
    if (tipeAktif === TIPE.MASUK) {
      // Jika hanya geofence aktif, atau dipilih geofence
      const hanyaGeofence = !qrAktif && geofenceConfig.aktif
      const dipilihGeofence = modeOverride === 'geofence'

      if (hanyaGeofence || dipilihGeofence) {
        handleMulaiPresensiGeofence()
      } else {
        selectedModeRef.current = 'qr'
        setSelectedMode('qr')
        startScanner()
      }
    } else {
      // Presensi Pulang
      if (presensiPulang) {
        setErrorMsg('Anda sudah melakukan presensi pulang hari ini.')
        setStep(STEP.ERROR)
        return
      }
      if (!presensiMasuk) {
        setErrorMsg('Anda belum melakukan presensi masuk hari ini.')
        setStep(STEP.ERROR)
        return
      }
      const statusMasuk = presensiMasuk.status
      if (['S', 'I', 'A'].includes(statusMasuk)) {
        setErrorMsg('Presensi pulang tidak tersedia karena status presensi Anda hari ini adalah Sakit, Izin, atau Alpha.')
        setStep(STEP.ERROR)
        return
      }
      if (!presensiPulangAktif) {
        setErrorMsg('Sesi presensi pulang belum dibuka oleh Petugas Piket / Admin. Silakan tunggu hingga petugas mengaktifkan sesi pulang.')
        setStep(STEP.ERROR)
        return
      }
      // Langsung menuju kamera selfie tanpa QR code scanner!
      setErrorMsg('')
      setStep(STEP.SELFIE)
    }
  }


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
    setCameraError('')

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode
        
        const qrConfig = { fps: 10, qrbox: { width: 240, height: 240 } }
        const qrSuccessCallback = async (decodedText) => {
          await html5QrCode.stop()
          scannerRef.current = null
          handleQRScanned(decodedText)
        }

        try {
          await html5QrCode.start({ facingMode: 'environment' }, qrConfig, qrSuccessCallback, () => {})
        } catch {
          try {
            await html5QrCode.start({ facingMode: 'user' }, qrConfig, qrSuccessCallback, () => {})
          } catch {
            await html5QrCode.start({ facingMode: { exact: 'environment' } }, qrConfig, qrSuccessCallback, () => {})
          }
        }
      } catch (err) {
        console.warn('Scanner error:', err)
        setCameraError('Kamera langsung browser tidak dapat dibuka. Silakan gunakan opsi foto/upload QR di bawah.')
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

  const handleQRFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setStep(STEP.SUBMITTING)
      if (scannerRef.current) {
        try { await scannerRef.current.stop() } catch {}
        scannerRef.current = null
      }

      const tempId = 'qr-temp-' + Date.now()
      const tempDiv = document.createElement('div')
      tempDiv.id = tempId
      tempDiv.style.display = 'none'
      document.body.appendChild(tempDiv)

      const html5QrCode = new Html5Qrcode(tempId)
      const decodedText = await html5QrCode.scanFile(file, false)
      try { await html5QrCode.clear() } catch {}
      document.body.removeChild(tempDiv)

      handleQRScanned(decodedText)
    } catch (err) {
      console.error('Gagal scan file QR:', err)
      setStep(STEP.ERROR)
      setErrorMsg('QR Code tidak terdeteksi dari foto. Pastikan gambar QR Code terlihat jelas dan terang.')
    } finally {
      if (e.target) e.target.value = ''
    }
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
      setCameraError('')
      try {
        const ms = await getCameraStream('user')
        currentStream = ms
        if (videoRef.current) {
          videoRef.current.srcObject = ms
          videoRef.current.play().catch(() => {})
        }
      } catch (err) {
        console.warn('Camera error:', err)
        setCameraError(err.userMessage || 'Kamera tidak dapat diakses langsung oleh browser.')
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

  const handleSelfieFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { dataUrl, blob } = await processFileToSelfie(file)
      setSelfieSrc(dataUrl)
      setSelfieBlob(blob)
    } catch (err) {
      setErrorMsg('Gagal memproses foto selfie: ' + err.message)
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  const takeSnapshot = () => {
    if (!videoRef.current) return
    try {
      const video = videoRef.current
      const origW = video.videoWidth || 640
      const origH = video.videoHeight || 480
      
      // Auto-compress & downscale proportionally (Max dimension: 640px)
      const maxDim = 640
      let targetW = origW
      let targetH = origH

      if (origW > maxDim || origH > maxDim) {
        if (origW > origH) {
          targetW = maxDim
          targetH = Math.round((origH / origW) * maxDim)
        } else {
          targetH = maxDim
          targetW = Math.round((origW / origH) * maxDim)
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context tidak tersedia')

      // Mirror the canvas so the saved photo looks exactly like the video preview
      ctx.translate(targetW, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, targetW, targetH)

      canvas.toBlob((blob) => {
        if (blob) {
          setSelfieBlob(blob)
          setSelfieSrc(URL.createObjectURL(blob))
        }
      }, 'image/jpeg', 0.75)
    } catch (err) {
      console.error('Error saat mengambil foto selfie:', err)
      setErrorMsg('Gagal mengambil foto. Silakan tekan tombol selfie sekali lagi.')
    }
  }

  // === Upload Selfie ke Supabase Storage ===
  const uploadSelfie = async (blob, nisn, tipe) => {
    if (!blob) return null
    try {
      const fileName = `${nisn}_${tipe}_${today}_${Date.now()}.jpg`
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

  // === Kirim Notifikasi Web ke Orangtua via Supabase realtime broadcast + Web Push ===
  const notifyOrangTua = async (nisn, namaLengkap, kelas, status, waktu, tipe, selfieUrl) => {
    try {
      const tglFormatted = new Date(today).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
      const tipeLabel = tipe === TIPE.PULANG ? 'Pulang' : 'Masuk'
      const statusLabel = STATUS_LABELS[status] || status

      const payload = {
        nisn, namaLengkap, kelas, status, statusLabel, waktu,
        tipe, tipeLabel, tanggal: tglFormatted, selfieUrl
      }

      // 1. Broadcast ke channel orangtua via Supabase Realtime (saat app terbuka)
      await supabase.channel(`notif-ortu-${nisn}`).send({
        type: 'broadcast',
        event: 'presensi_update',
        payload,
      })

      // 2. Kirim Web Push server-side (bekerja meski app tertutup)
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

      // 3. Kirim LINE Push Notification via Supabase Edge Function line-notify
      fetch(`${supabaseUrl}/functions/v1/line-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          nisn,
          nama: namaLengkap,
          kelas,
          status,
          waktu,
          tipe,
          fotoUrl: selfieUrl,
          keterangan: payload.lokasi || '-'
        }),
      }).catch(err => console.warn('[line-notify] Fetch error:', err))

    } catch (err) {
      console.warn('Gagal kirim notif ke orangtua:', err)
    }
  }

  // === Core Submit ===
  const doSubmit = async (selfieB, selfieSrcLocal, token, modeKirim) => {
    // modeKirim: 'qr' | 'geofence' | undefined (auto-detect dari selectedMode)
    setStep(STEP.SUBMITTING)
    try {
      // 1. Dapatkan koordinat (opsional / soft-check)
      let coords = '0,0';
      let accuracy = 0;
      try {
        if ("geolocation" in navigator) {
          const getPos = () => new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (p) => resolve(p),
              () => {
                navigator.geolocation.getCurrentPosition(
                  (p2) => resolve(p2),
                  () => resolve(null),
                  { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }
                );
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          });
          const pos = await getPos();
          if (pos && pos.coords) {
            coords = `${pos.coords.latitude},${pos.coords.longitude}`;
            accuracy = Math.round(pos.coords.accuracy);
          }
        }
      } catch (err) {
        // Lokasi diabaikan sesuai pengaturan
      }

      // ===== GEOFENCING CHECK =====
      // Gunakan ref (bukan state) agar tidak stale di async callback QR scanner
      const modeYangDipakai = modeKirim || selectedModeRef.current
      const isGeofenceRequired = (geofenceConfig.aktif || presensiMasukMode === 'geofence') && modeYangDipakai !== 'qr'
      if (isGeofenceRequired) {
        if (!window.isSecureContext && window.location.protocol === 'http:') {
          setStep(STEP.ERROR)
          setErrorMsg('Presensi ditolak. Akses GPS diblokir oleh browser karena website dibuka menggunakan HTTP (tidak aman). Silakan buka menggunakan HTTPS: https://' + window.location.host + window.location.pathname)
          return
        }

        if (coords === '0,0') {
          setStep(STEP.ERROR)
          setErrorMsg('Presensi ditolak. Gagal mendapatkan lokasi GPS HP Anda. Pastikan Izin Lokasi diizinkan di browser HP Anda dan fitur GPS HP telah diaktifkan.')
          return
        }

        const [userLat, userLng] = coords.split(',').map(Number);

        // Build all areas to check: primary + extra
        const allAreas = [];
        if (geofenceConfig.lat !== null && geofenceConfig.lng !== null) {
          allAreas.push({ lat: geofenceConfig.lat, lng: geofenceConfig.lng, radius: geofenceConfig.radius, nama: 'Sekolah' });
        }
        geofenceAreas.forEach(a => {
          const lat = parseFloat(a.lat);
          const lng = parseFloat(a.lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            allAreas.push({ lat, lng, radius: a.radius || 200, nama: a.nama || 'Area Tambahan' });
          }
        });

        if (allAreas.length > 0) {
          // OR logic: allowed if within ANY area
          const diDalamSalahSatuArea = allAreas.some(area => {
            const jarak = hitungJarak(userLat, userLng, area.lat, area.lng);
            return jarak <= area.radius;
          });

          if (!diDalamSalahSatuArea) {
            // Find closest area for error message
            const closest = allAreas.reduce((best, area) => {
              const jarak = hitungJarak(userLat, userLng, area.lat, area.lng);
              return jarak < best.jarak ? { ...area, jarak } : best;
            }, { jarak: Infinity });
            setStep(STEP.ERROR);
            setErrorMsg(`Presensi ditolak. Lokasi Anda berada di luar area sekolah yang terdaftar. Jarak terdekat: ${Math.round(closest.jarak)} meter dari area "${closest.nama}" (Batas: ${closest.radius} meter). Akurasi GPS Perangkat Anda: ±${accuracy} meter. Tips: Karena akurasi GPS browser Anda saat ini berkisar ±${accuracy} meter, disarankan bagi Admin untuk memperbesar "Radius Toleransi" (misal menjadi 100-200 meter) di Pengaturan Presensi untuk mengantisipasi pergeseran (drift) sinyal GPS.`);
            return;
          }
        }
      }

      const now = new Date();
      const jamSekarang = now.toTimeString().slice(0, 5);
      const [bH, bM] = jamBatasHadir.split(':').map(Number);
      const [sH, sM] = jamSekarang.split(':').map(Number);
      const lewatBatas = sH > bH || (sH === bH && sM > bM);
      const statusOtomatis = (tipeAktif === TIPE.MASUK) ? (lewatBatas ? 'T' : 'H') : 'P';

      // Cek duplikat untuk tipe yang sama
      const { data: existing } = await supabase.from('presensi_harian')
        .select('id').eq('tanggal', today).eq('siswa_nisn', studentData.nisn)
        .eq('tipe', tipeAktif).maybeSingle();

      if (existing) {
        setStep(STEP.ERROR);
        setErrorMsg(`Anda sudah presensi ${tipeAktif} hari ini.`);
        return;
      }

      // Upload selfie ke Supabase Storage (jika ada)
      let selfieUrl = null;
      if (selfieB) {
        selfieUrl = await uploadSelfie(selfieB, studentData.nisn, tipeAktif);
      }

      // Insert presensi
      const { error: insertErr } = await supabase.from('presensi_harian').insert({
        tanggal: today,
        tahun_ajaran_id: studentData.tahun_ajaran_id || null,
        kelas: studentData.kelas || '-',
        siswa_nisn: studentData.nisn,
        status: statusOtomatis,
        waktu: jamSekarang,
        metode: 'qr_scan',
        tipe: tipeAktif,
        selfie_url: selfieUrl,
        keterangan: coords,
        updated_at: now.toISOString()
      })
      if (insertErr) throw insertErr

      // Kirim notifikasi ke orangtua via realtime & Web Push
      await notifyOrangTua(
        studentData.nisn,
        studentData.nama_lengkap,
        studentData.kelas,
        statusOtomatis,
        jamSekarang,
        tipeAktif,
        selfieUrl,
        coords
      )

      // Update state lokal
      if (tipeAktif === TIPE.MASUK) {
        setPresensiMasuk({ status: statusOtomatis, waktu: jamSekarang, tipe: TIPE.MASUK, selfie_url: selfieUrl, keterangan: coords })
        setTipeAktif(TIPE.PULANG)
      } else {
        setPresensiPulang({ status: statusOtomatis, waktu: jamSekarang, tipe: TIPE.PULANG, selfie_url: selfieUrl, keterangan: coords })
      }

      setStep(STEP.SUCCESS)

      // Tampilkan local notification ke siswa
      if (isNotifGranted()) {
        const tipeLabelSiswa = tipeAktif === TIPE.PULANG ? 'Pulang' : 'Masuk'
        const statusLabelSiswa = STATUS_LABELS[statusOtomatis] || statusOtomatis
        showLocalNotif('✅ Presensi Berhasil', `Presensi ${tipeLabelSiswa} berhasil dikonfirmasi (${statusLabelSiswa}) pada ${jamSekarang} WIB. Lokasi: ${coords}`, {
          tag: `presensi-siswa-${tipeAktif}`,
          data: { url: `https://www.google.com/maps?q=${coords}` }
        })
      }
    } catch (err) {
      setStep(STEP.ERROR)
      setErrorMsg(`Gagal menyimpan presensi: ${err.message}`)
    }
  }

  const handleSubmit = async () => {
    if (selfieRequired && !selfieSrc) { setErrorMsg('Selfie belum diambil'); return }
    await doSubmit(selfieBlob, selfieSrc, scannedToken, selectedMode)
  }

  const reset = () => {
    setStep(STEP.IDLE)
    setErrorMsg('')
    setSelfieSrc(null)
    setSelfieBlob(null)
    setScannedToken(null)
    setSelectedMode(null)
    selectedModeRef.current = null
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
      const filesToDelete = []
      if (presensiMasuk?.selfie_url) {
        const urlParts = presensiMasuk.selfie_url.split('/')
        const fileName = urlParts[urlParts.length - 1].split('?')[0] // remove query parameters if any
        filesToDelete.push(fileName)
      }
      if (presensiPulang?.selfie_url) {
        const urlParts = presensiPulang.selfie_url.split('/')
        const fileName = urlParts[urlParts.length - 1].split('?')[0]
        filesToDelete.push(fileName)
      }

      const { error } = await supabase.from('presensi_harian').delete().eq('tanggal', today).eq('siswa_nisn', studentData.nisn)
      if (error) throw error

      if (filesToDelete.length > 0) {
        await supabase.storage.from('selfie-presensi').remove(filesToDelete)
      }

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
          const endpointUrl = subscription.endpoint
          if (endpointUrl) {
            await supabase.from('push_subscriptions')
              .delete()
              .filter('subscription->>endpoint', 'eq', endpointUrl)
          }

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

  const isNotificationSupported = 'Notification' in window;
  if (isNotificationSupported && !notifGranted) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 min-h-[60vh] text-center">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg max-w-md w-full animate-fade-in flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-6 text-amber-500 shadow-sm animate-bounce">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">Izin Notifikasi Diperlukan</h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Aplikasi eBudiMulia mewajibkan fitur Notifikasi Browser diaktifkan untuk menerima pengingat presensi dan laporan kehadiran secara real-time.
          </p>
          <button 
            onClick={handleMintaIzinNotif} 
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
          >
            Aktifkan Notifikasi Sekarang
          </button>
          <button 
            onClick={() => setNotifGranted(true)} 
            className="w-full mt-2 py-2 text-slate-500 hover:text-slate-700 font-bold text-xs transition-colors"
          >
            Nanti Saja / Lanjutkan Presensi
          </button>
          <p className="text-[10px] text-slate-400 mt-4 italic">
            *Untuk iOS: Pastikan Anda telah menggunakan menu "Add to Home Screen" di Safari sebelum mengizinkan notifikasi.
          </p>
        </div>
      </div>
    )
  }

  const sudahMasuk = !!presensiMasuk
  const sudahPulang = !!presensiPulang
  const isDone = sudahMasuk && sudahPulang

  return (
    <div className="animate-fade-in w-full max-w-4xl mx-auto">
      {ConfirmModalComponent}

      {/* Sticky Orange Notification Banner */}
      {!notifGranted && 'Notification' in window && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2.5 px-4 flex items-center justify-between gap-3 rounded-xl mb-6 shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span>Aktifkan pengingat presensi harian di HP Anda</span>
          </div>
          <button
            onClick={handleMintaIzinNotif}
            className="bg-white text-amber-600 hover:bg-amber-50 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors shadow-sm shrink-0"
          >
            Tampilkan / Allow
          </button>
        </div>
      )}

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
          <div className="mb-6 hidden">
            <h2 className="text-2xl font-black text-slate-900">Presensi Hari Ini</h2>
            <p className="text-sm text-slate-500 mt-1">Scan QR Code dari layar TV sekolah untuk mencatat kehadiran Anda.</p>
          </div>



          {/* Status Masuk & Pulang */}
          {sesiAktif && (
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
          )}

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
          ) : presensiSelesai ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center mb-5">
                <span className="text-4xl select-none">🌙</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Presensi Selesai</h3>
              <p className="text-sm text-slate-500 max-w-sm">Presensi hari ini telah selesai pukul <strong>{jamBatasPulang}</strong>. Sampai jumpa besok! 👋</p>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : (jadwalOtomatisAktif && !isHariAktif) ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center mb-5">
                <span className="text-4xl select-none">🏖️</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Hari Bebas Presensi</h3>
              <p className="text-sm text-slate-500 max-w-sm">Hari ini tidak dijadwalkan untuk presensi.</p>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : presensiBelumMulai ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center mb-5">
                <span className="text-4xl select-none">🌅</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Presensi Belum Mulai</h3>
              <p className="text-sm text-slate-500 max-w-sm">Sesi presensi otomatis hari ini belum dimulai (dijadwalkan pukul <strong>{jamMulaiPresensi}</strong>). Silakan tunggu beberapa saat lagi. 👋</p>
              {import.meta.env.DEV && (
                <button onClick={handleResetTesting} className="mt-5 text-[10px] text-slate-400 hover:text-red-500 underline underline-offset-2">Reset Data (Mode Dev)</button>
              )}
            </div>
          ) : !(tipeAktif === TIPE.PULANG ? (presensiPulangAktif || sesiAktif) : sesiAktif) ? (
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
              {tipeAktif === TIPE.MASUK ? (
                (() => {
                  const keduanyaAktif = qrAktif && geofenceConfig.aktif
                  const hanyaGeofence = !qrAktif && geofenceConfig.aktif

                  if (keduanyaAktif) {
                    // ─── Dual Mode: Tampilkan dua pilihan tombol ───
                    return (
                      <>
                        <div className="w-24 h-24 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-5">
                          <span className="text-4xl select-none">📋</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Presensi Masuk</h3>
                        <p className="text-sm text-slate-500 mb-5 max-w-sm">
                          Pilih metode presensi yang ingin Anda gunakan hari ini.
                        </p>
                        <div className="flex flex-col gap-3 w-full">
                          {/* Tombol Scan QR */}
                          <button
                            onClick={handleMulaiPresensiQR}
                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                            Scan QR Code
                          </button>
                          {/* Tombol Geofencing */}
                          <button
                            onClick={handleMulaiPresensiGeofence}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            Presensi dengan Lokasi GPS
                          </button>
                        </div>
                        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-left w-full">
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            <strong className="text-indigo-700">📷 Scan QR Code</strong> — Scan QR dari layar TV di pintu masuk sekolah, lalu selfie.<br/>
                            <strong className="text-emerald-700">📍 Presensi GPS</strong> — Langsung selfie, lokasi Anda otomatis diverifikasi terhadap area sekolah.
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 mt-3">Jam batas hadir: <strong>{jamBatasHadir}</strong></p>
                      </>
                    )
                  }

                  if (hanyaGeofence) {
                    // ─── Hanya Geofencing ───
                    return (
                      <>
                        <div className="w-24 h-24 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mb-5">
                          <span className="text-4xl select-none">📍</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Presensi Masuk</h3>
                        <p className="text-sm text-slate-500 mb-6 max-w-sm">
                          Pastikan Anda berada di area sekolah, lalu tekan tombol di bawah untuk ambil foto selfie.
                        </p>
                        <button
                          onClick={handleMulaiPresensiGeofence}
                          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          Presensi Masuk (Verifikasi GPS & Selfie)
                        </button>
                        <p className="text-xs text-slate-400 mt-3">Jam batas hadir: <strong>{jamBatasHadir}</strong></p>
                      </>
                    )
                  }

                  // ─── Hanya QR (default) ───
                  return (
                    <>
                      <div className="w-24 h-24 rounded-full bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center mb-5">
                        <svg className="w-12 h-12 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                          <rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/>
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">Presensi Masuk</h3>
                      <p className="text-sm text-slate-500 mb-6 max-w-sm">
                        Scan QR Code dari layar TV di pintu masuk sekolah.
                      </p>
                      <button
                        onClick={() => handleMulaiPresensi('qr')}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                        Scan QR — Masuk
                      </button>
                      <p className="text-xs text-slate-400 mt-3">Jam batas hadir: <strong>{jamBatasHadir}</strong></p>
                    </>
                  )
                })()
              ) : (
                /* Mode Presensi Pulang */
                (() => {
                  const statusMasuk = presensiMasuk?.status
                  const isSakitIzinAlpa = ['S', 'I', 'A'].includes(statusMasuk)

                  if (isSakitIzinAlpa) {
                    return (
                      <>
                        <div className="w-20 h-20 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center mb-4">
                          <span className="text-3xl">ℹ️</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Presensi Pulang Tidak Berlaku</h3>
                        <p className="text-sm text-slate-500 mb-4 max-w-sm">
                          Status presensi Anda hari ini tercatat sebagai <strong className="text-amber-700">{STATUS_LABELS[statusMasuk] || statusMasuk}</strong>. Presensi pulang hanya berlaku untuk siswa yang hadir di sekolah.
                        </p>
                      </>
                    )
                  }

                  if (!presensiPulangAktif) {
                    return (
                      <>
                        <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center mb-4">
                          <span className="text-3xl">🔒</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Sesi Presensi Pulang Belum Dibuka</h3>
                        <p className="text-sm text-slate-500 mb-4 max-w-sm">
                          Sesi presensi pulang belum diaktifkan oleh Guru Piket atau Admin. Silakan tunggu hingga jam kepulangan dimulai.
                        </p>
                        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl font-medium">
                          💡 Saat sesi dibuka oleh piket, tombol foto selfie pulang akan otomatis muncul di sini.
                        </div>
                      </>
                    )
                  }

                  return (
                    <>
                      <div className="w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mb-4">
                        <span className="text-3xl">🏠</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">Presensi Pulang</h3>
                      <p className="text-sm text-slate-500 mb-6 max-w-sm">
                        Sesi presensi pulang telah dibuka! Klik tombol di bawah untuk langsung melakukan foto selfie kepulangan.
                      </p>
                      <button
                        onClick={handleMulaiPresensi}
                        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Ambil Foto Selfie Pulang
                      </button>
                    </>
                  )
                })()
              )}

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
              <div className="p-4 flex flex-col items-center gap-3">
                <p className="text-sm text-slate-500 text-center">Arahkan kamera ke QR Code di layar TV sekolah</p>

                {/* Live Scanner — tampil langsung */}
                <div id="qr-reader" className="w-full rounded-xl overflow-hidden border border-slate-100" style={{ minHeight: 260 }} />

                {/* Input file untuk fallback foto */}
                <input
                  ref={qrFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleQRFileSelect}
                />

                {/* Jika kamera live gagal (mis. HTTP), tampilkan tombol foto */}
                {cameraError && (
                  <div className="w-full p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex flex-col gap-2">
                    <p className="font-bold">⚠️ Kamera langsung tidak tersedia</p>
                    <p className="text-amber-700">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                      Alternatif: Foto QR via Kamera HP
                    </button>
                  </div>
                )}

                <div className="flex gap-2 w-full">
                  {!cameraError && (
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      className="flex-1 py-2.5 px-3 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:scale-95 rounded-xl transition-all border border-indigo-200 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                      📷 Foto QR via HP
                    </button>
                  )}
                  <button onClick={stopScanner} className="flex-1 py-2.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200">
                    Batal
                  </button>
                </div>
              </div>
            </div>
          ) : step === STEP.SELFIE ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                {/* Badge kontekstual sesuai mode */}
                {tipeAktif === TIPE.MASUK && selectedMode === 'qr' && (
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">QR berhasil discan</span>
                  </div>
                )}
                {tipeAktif === TIPE.MASUK && selectedMode === 'geofence' && (
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">Lokasi GPS akan diverifikasi saat kirim</span>
                  </div>
                )}
                <h3 className="font-bold text-slate-800">Ambil Selfie</h3>
              </div>

              <input
                ref={selfieFileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleSelfieFileChange}
              />

              <div className="p-5 flex flex-col items-center gap-4">
                {selfieSrc ? (
                  /* ─── Foto sudah diambil ─── */
                  <div className="relative">
                    <img src={selfieSrc} alt="Selfie" className="w-48 h-48 rounded-full object-cover border-4 border-indigo-200 shadow-md" />
                    <button onClick={() => { setSelfieSrc(null); setSelfieBlob(null); }}
                      className="absolute bottom-2 right-2 w-9 h-9 bg-white rounded-full shadow-md flex items-center justify-center border border-slate-200 hover:bg-slate-50 transition-colors"
                      title="Foto Ulang"
                    >
                      <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                  </div>
                ) : (
                  /* ─── Belum ada foto ─── */
                  <div className="flex flex-col items-center w-full gap-3">

                    {/* Tombol utama: Kamera HP via input capture — paling reliable di semua perangkat */}
                    <button
                      type="button"
                      onClick={() => selfieFileInputRef.current?.click()}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-3 text-sm"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <circle cx="12" cy="13" r="3"/>
                      </svg>
                      Buka Kamera & Selfie
                    </button>

                    {/* Kamera inline browser — opsional, muncul jika berhasil */}
                    {!cameraError && (
                      <div className="w-full flex flex-col items-center gap-2">
                        <p className="text-[11px] text-slate-400">atau gunakan preview kamera di bawah ini:</p>
                        <div className="relative w-44 h-44 rounded-full bg-slate-100 border-4 border-slate-200 overflow-hidden flex flex-col items-center justify-center shadow-inner">
                          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" />
                          <button onClick={takeSnapshot} className="absolute bottom-3 bg-white/90 backdrop-blur text-indigo-700 px-4 py-1.5 rounded-full text-xs font-bold shadow-md hover:bg-indigo-50 border border-indigo-100 transition-colors z-10 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                            Jepret
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-400 text-center px-4">Arahkan wajah ke kamera sebagai bukti kehadiran.</p>
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
