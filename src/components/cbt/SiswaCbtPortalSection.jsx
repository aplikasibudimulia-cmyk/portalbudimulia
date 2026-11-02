import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import SiswaCbtPembahasanModal from './SiswaCbtPembahasanModal'
import { getOrCreateDeviceId, detectDeviceInfo } from '../../utils/cbt/cbtDeviceHelper'

// Subject styling matcher khas aplikasi eBudimulia
function getSubjectTheme(mapelName = '') {
  const name = String(mapelName || '').toLowerCase()
  if (name.includes('matematika') || name.includes('mat') || name.includes('tik') || name.includes('informatika')) {
    return {
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      cardBorder: 'border-blue-100 hover:border-blue-300',
      pill: 'bg-blue-600 text-white'
    }
  }
  if (name.includes('ipa') || name.includes('biologi') || name.includes('fisika')) {
    return {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBorder: 'border-emerald-100 hover:border-emerald-300',
      pill: 'bg-emerald-600 text-white'
    }
  }
  if (name.includes('ips') || name.includes('sejarah') || name.includes('geografi') || name.includes('ekonomi')) {
    return {
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      cardBorder: 'border-amber-100 hover:border-amber-300',
      pill: 'bg-amber-600 text-white'
    }
  }
  if (name.includes('indonesia') || name.includes('inggris') || name.includes('bahasa') || name.includes('b.ing') || name.includes('b.ind')) {
    return {
      badge: 'bg-violet-50 text-violet-700 border-violet-200',
      cardBorder: 'border-violet-100 hover:border-violet-300',
      pill: 'bg-violet-600 text-white'
    }
  }
  if (name.includes('agama') || name.includes('katolik') || name.includes('kristen') || name.includes('budi pekerti')) {
    return {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      cardBorder: 'border-rose-100 hover:border-rose-300',
      pill: 'bg-rose-600 text-white'
    }
  }
  if (name.includes('pjok') || name.includes('olahraga') || name.includes('penjas')) {
    return {
      badge: 'bg-lime-50 text-lime-800 border-lime-200',
      cardBorder: 'border-lime-100 hover:border-lime-300',
      pill: 'bg-lime-600 text-white'
    }
  }
  if (name.includes('seni') || name.includes('musik') || name.includes('prakarya')) {
    return {
      badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
      cardBorder: 'border-fuchsia-100 hover:border-fuchsia-300',
      pill: 'bg-fuchsia-600 text-white'
    }
  }
  return {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    cardBorder: 'border-slate-200 hover:border-indigo-300',
    pill: 'bg-indigo-600 text-white'
  }
}

export default function SiswaCbtPortalSection({ student: studentProp }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('active') // 'active', 'upcoming', 'history'
  const [loading, setLoading] = useState(true)

  // Ambil student dari prop atau localStorage sebagai fallback
  const localStudent = (() => {
    try {
      return JSON.parse(localStorage.getItem('siswa_session') || '{}')
    } catch {
      return {}
    }
  })()
  const student = studentProp?.nisn ? studentProp : localStudent

  // Data Sesi
  const [activeSessions, setActiveSessions] = useState([])
  const [upcomingSessions, setUpcomingSessions] = useState([])
  const [pastSessions, setPastSessions] = useState([])

  // Kesiapan Perangkat (Battery, Ping Latency, Connectivity)
  const [batteryLevel, setBatteryLevel] = useState(null)
  const [isCharging, setIsCharging] = useState(false)
  const [pingLatency, setPingLatency] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // State Mulai Ujian Langsung (Tanpa Token)
  const [launchingSesiId, setLaunchingSesiId] = useState(null)

  // Modal Pembahasan
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)

  // Inisialisasi Readiness Check & Data Fetch + Realtime Subscription
  useEffect(() => {
    checkBattery()
    checkPing()

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const handleAppRefresh = () => {
      fetchStudentExamData()
    }
    window.addEventListener('app_refresh_data', handleAppRefresh)

    if (student?.nisn) {
      fetchStudentExamData()

      // Realtime subscription agar saat Guru mengaktifkan Ujian Ulang,
      // data di siswa langsung berpindah secara otomatis tanpa reload!
      const channel = supabase
        .channel(`cbt_student_sync_${student.nisn}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cbt_peserta_ujian',
            filter: `siswa_nisn=eq.${String(student.nisn).trim()}`
          },
          () => {
            fetchStudentExamData()
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cbt_sesi_ujian'
          },
          () => {
            fetchStudentExamData()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener('app_refresh_data', handleAppRefresh)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('app_refresh_data', handleAppRefresh)
    }
  }, [student])

  // Cek Status Baterai
  const checkBattery = async () => {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery()
        setBatteryLevel(Math.round(battery.level * 100))
        setIsCharging(battery.charging)
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100))
        })
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging)
        })
      }
    } catch {
      // Browser tidak mendukung Battery API
    }
  }

  // Cek Latency Jaringan
  const checkPing = async () => {
    try {
      const start = Date.now()
      await supabase.from('cbt_pengaturan').select('id').limit(1)
      setPingLatency(Date.now() - start)
    } catch {
      setPingLatency(null)
    }
  }

  // Ambil Data Sesi Ujian untuk Siswa
  const fetchStudentExamData = useCallback(async () => {
    if (!student?.nisn) return
    setLoading(true)
    try {
      const now = new Date()

      // 1. Ambil Sesi yang tidak berstatus draft
      const { data: sesiList, error: errSesi } = await supabase
        .from('cbt_sesi_ujian')
        .select('*')
        .neq('status', 'draft')
        .order('waktu_buka', { ascending: true })

      if (errSesi) throw errSesi

      // Filter sesi sesuai kelas siswa (case-insensitive & toleran spasi)
      const studentClassNorm = (student?.kelas || '').trim().toLowerCase()
      const targetedSesi = (sesiList || []).filter(s => {
        if (!s.kelas_ids || !Array.isArray(s.kelas_ids)) return false
        return s.kelas_ids.some(k => String(k).trim().toLowerCase() === studentClassNorm)
      })

      // 2. Ambil Status Peserta Siswa
      const { data: pesertaList } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('siswa_nisn', String(student.nisn).trim())

      const pesertaMap = {}
      pesertaList?.forEach(p => { pesertaMap[p.sesi_id] = p })

      const active = []
      const upcoming = []
      const history = []

      targetedSesi.forEach(sesi => {
        const peserta = pesertaMap[sesi.id]
        const waktuBuka = sesi.waktu_buka ? new Date(sesi.waktu_buka) : null
        const waktuTutup = sesi.waktu_tutup ? new Date(sesi.waktu_tutup) : null

        const isExpired = waktuTutup && now > waktuTutup
        const isSelesai = sesi.status === 'selesai' || isExpired

        const item = {
          ...sesi,
          status: isExpired && sesi.status !== 'draft' ? 'selesai' : sesi.status,
          peserta_data: peserta || null
        }

        if (peserta && peserta.status === 'selesai') {
          history.push(item)
        } else if (isSelesai) {
          // Ujian sudah ditutup / melewati batas waktu pengerjaan
          history.push(item)
        } else if (peserta && (peserta.status === 'sedang_mengerjakan' || peserta.status === 'belum_melanjutkan')) {
          // Masuk tab aktif (sedang berlangsung atau ujian ulang dengan jawaban terakhir)
          active.push(item)
        } else if (sesi.status === 'berlangsung' || sesi.status === 'aktif') {
          active.push(item)
        } else if (waktuBuka && waktuTutup && now >= waktuBuka && now <= waktuTutup) {
          active.push(item)
        } else if (waktuBuka && now < waktuBuka) {
          upcoming.push(item)
        } else {
          // Ujian lewat waktu tanpa dikerjakan
          history.push(item)
        }
      })

      setActiveSessions(active)
      setUpcomingSessions(upcoming)
      setPastSessions(history)
    } catch (err) {
      console.error('[CBT Portal] Gagal memuat sesi siswa:', err)
    } finally {
      setLoading(false)
    }
  }, [student])

  // Masuk Lembar Ujian Langsung (Siswa Langsung Mengerjakan Sesuai Kelas)
  const handleStartExamFlow = async (sesi) => {
    const waktuTutup = sesi.waktu_tutup ? new Date(sesi.waktu_tutup) : null
    if ((waktuTutup && new Date() > waktuTutup) || sesi.status === 'selesai') {
      alert('Batas waktu pengerjaan untuk penilaian ini telah berakhir.')
      return
    }

    const myDevId = getOrCreateDeviceId()
    const myDevInfo = detectDeviceInfo()
    const peserta = sesi.peserta_data
    if (peserta?.device_id && peserta.device_id !== myDevId && peserta.status !== 'selesai') {
      alert(`Peringatan Akses Ujian:\n\nUjian ini sedang aktif dan terkunci pada perangkat lain (${peserta.device_info || 'Perangkat Lain'}).\n\n1 akun siswa tidak diperbolehkan membuka ujian dari 2 perangkat secara bersamaan. Silakan lanjutkan pengerjaan di perangkat tersebut. Jika perangkat Anda rusak atau kehabisan baterai, mintalah Pengawas Ruang untuk melakukan Reset Perangkat.`)
      return
    }

    setLaunchingSesiId(sesi.id)

    try {
      const studentNisn = student?.nisn || localStudent?.nisn
      if (!studentNisn) {
        throw new Error('NISN tidak terdeteksi pada sesi login siswa. Silakan periksa akun atau login kembali.')
      }

      const activeKelas = String(student?.kelas || localStudent?.kelas || '').trim()

      // Eksekusi verifikasi kelas secara langsung (tanpa perlu input token)
      const { data: verifyData, error: verifyErr } = await supabase.rpc('cbt_verify_token', {
        p_sesi_id: sesi.id,
        p_token: 'DIRECT_ACCESS',
        p_siswa_nisn: String(studentNisn).trim(),
        p_kelas: activeKelas || null
      })

      let finalPesertaId = null

      if (verifyErr) {
        // Fallback: panggil cbt_start_exam
        const { data: startData, error: startErr } = await supabase.rpc('cbt_start_exam', {
          p_sesi_id: sesi.id,
          p_token: 'DIRECT_ACCESS',
          p_nisn: String(studentNisn).trim(),
          p_kelas: activeKelas || null
        })

        if (startErr) {
          throw new Error(startErr.message || verifyErr.message)
        }

        if (startData?.peserta_id) {
          finalPesertaId = startData.peserta_id
        }
      } else if (verifyData) {
        if (verifyData.success === false) {
          throw new Error(verifyData.message || 'Kelas Anda bukan sasaran sesi penilaian ini.')
        }
        if (verifyData.peserta_id) {
          finalPesertaId = verifyData.peserta_id
        }
      }

      if (finalPesertaId) {
        // Langsung ikat sesi ujian ke perangkat fisik ini
        await supabase
          .from('cbt_peserta_ujian')
          .update({
            device_id: myDevId,
            device_info: myDevInfo
          })
          .eq('id', finalPesertaId)

        navigate(`/cbt/ujian/${sesi.id}?peserta_id=${finalPesertaId}`)
        return
      }

      throw new Error('Gagal menyiapkan lembar ujian Anda.')
    } catch (err) {
      alert(err.message || 'Gagal memulai lembar ujian.')
    } finally {
      setLaunchingSesiId(null)
    }
  }

  // Lanjutkan Ujian (reconnection atau ujian ulang dengan jawaban terakhir)
  const handleResumeExam = (sesi) => {
    const peserta = sesi.peserta_data
    const myDevId = getOrCreateDeviceId()
    if (peserta?.device_id && peserta.device_id !== myDevId && peserta.status !== 'selesai') {
      alert(`Peringatan Akses Ujian:\n\nUjian ini sedang aktif dan terkunci pada perangkat lain (${peserta.device_info || 'Perangkat Lain'}).\n\n1 akun siswa tidak dapat membuka ujian dari 2 perangkat secara bersamaan. Silakan lanjutkan pengerjaan di perangkat tersebut. Jika perangkat Anda rusak atau kehabisan baterai, mintalah Pengawas Ruang untuk melakukan Reset Perangkat.`)
      return
    }
    const pesertaId = sesi.peserta_data?.id
    navigate(`/cbt/ujian/${sesi.id}?peserta_id=${pesertaId}`)
  }

  // Buka Modal Pembahasan
  const handleOpenReview = (item) => {
    setReviewTarget(item)
    setReviewModalOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* 1. Baris Navigasi Tab Utama & Status Ringkas Daya/Jaringan di Kanan */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Navigasi Tab Utama (Luas, Menonjol & Nyaman Digunakan) */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 bg-slate-100/90 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-extrabold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'active'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Ujian Hari Ini</span>
            {activeSessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-indigo-100 text-indigo-700 font-black">
                {activeSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-extrabold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'upcoming'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Jadwal Mendatang</span>
            {upcomingSessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-200 text-slate-700 font-black">
                {upcomingSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-extrabold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Riwayat &amp; Nilai</span>
            {pastSessions.length > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-200 text-slate-700 font-black">
                {pastSessions.length}
              </span>
            )}
          </button>
        </div>

        {/* Status Ringkas di Kanan: Baterai & Koneksi Saja */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Status Daya Baterai */}
          <div 
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-700 text-xs font-bold shadow-2xs"
            title={batteryLevel !== null ? `Baterai: ${batteryLevel}% ${isCharging ? '(Mengisi Daya)' : ''}` : 'Status Baterai'}
          >
            <span>{isCharging ? '⚡' : '🔋'}</span>
            <span>{batteryLevel !== null ? `${batteryLevel}%` : '100%'}</span>
          </div>

          {/* Status Jaringan Sekolah */}
          <div 
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200/90 rounded-xl text-slate-700 text-xs font-bold shadow-2xs"
            title={`Jaringan: ${isOnline ? 'Terhubung (Online)' : 'Terputus (Offline)'} ${pingLatency ? `| Latency: ${pingLatency}ms` : ''}`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span>{isOnline ? (pingLatency ? `${pingLatency}ms` : 'Online') : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* 4. Konten Sesi Ujian */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 space-y-2 bg-white rounded-2xl border border-slate-100">
          <div className="animate-spin inline-block text-xl">⟳</div>
          <p className="text-xs">Memuat agenda penilaian siswa...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: UJIAN HARI INI */}
          {activeTab === 'active' && (
            <div className="space-y-4">
              {activeSessions.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-slate-700">
                    Tidak Ada Ujian Aktif Saat Ini
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Belum ada sesi penilaian yang dijadwalkan berlangsung untuk kelasmu saat ini. Silakan periksa tab Jadwal Mendatang untuk persiapan belajar.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeSessions.map((sesi) => {
                    const theme = getSubjectTheme(sesi.mapel)
                    const peserta = sesi.peserta_data
                    const isResume = peserta?.status === 'sedang_mengerjakan' || peserta?.status === 'belum_melanjutkan' || Boolean(peserta?.waktu_mulai && peserta?.status !== 'selesai')
                    const isRetakeActive = isResume && peserta?.waktu_selesai === null

                    return (
                      <div 
                        key={sesi.id}
                        className={`bg-white rounded-2xl p-5 border ${theme.cardBorder} shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-4`}
                      >
                        <div className="space-y-3">
                          {/* Top Row: Mapel Badge + KKTP */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${theme.badge}`}>
                              {sesi.mapel}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                KKTP: {sesi.kkm || 75.0}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase">
                                {sesi.kategori || 'Ujian'}
                              </span>
                            </div>
                          </div>

                          {/* Judul & Detail */}
                          <div>
                            <h3 className="text-base font-bold text-slate-800 leading-snug">
                              {sesi.judul}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                              <span>Durasi: <strong className="text-slate-600">{sesi.durasi_menit} Menit</strong></span>
                              <span>•</span>
                              <span>Sesi: <span className="font-mono text-slate-500">{sesi.id.substring(0, 8)}</span></span>
                            </p>
                          </div>

                          {/* Info Jadwal Waktu Buka & Tutup */}
                          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 text-xs space-y-1.5">
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Waktu Buka:</span>
                              <span className="font-semibold text-slate-700">
                                {new Date(sesi.waktu_buka).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-500">
                              <span>Batas Pengumpulan:</span>
                              <span className="font-semibold text-slate-700">
                                {new Date(sesi.waktu_tutup).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                              </span>
                            </div>
                          </div>

                          {/* Status Khusus Ujian Ulang / Device Conflict jika aktif */}
                          {isResume && (
                            <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center gap-2 ${
                              peserta?.device_id && peserta.device_id !== getOrCreateDeviceId() && peserta.status !== 'selesai'
                                ? 'bg-rose-50 border-rose-300 text-rose-900'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                peserta?.device_id && peserta.device_id !== getOrCreateDeviceId() && peserta.status !== 'selesai'
                                  ? 'bg-rose-600'
                                  : 'bg-amber-500 animate-pulse'
                              }`}></span>
                              <span>
                                {peserta?.device_id && peserta.device_id !== getOrCreateDeviceId() && peserta.status !== 'selesai'
                                  ? `Terkunci di: ${peserta?.device_info || 'Perangkat Lain'}`
                                  : (peserta?.status === 'belum_melanjutkan' || !peserta?.device_id)
                                  ? 'Perangkat telah di-reset. Klik tombol di bawah untuk melanjutkan.'
                                  : 'Ujian sedang berlangsung / Diizinkan melanjutkan pengerjaan'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Tombol Aksi */}
                        <div>
                          {isResume && peserta?.device_id && peserta.device_id !== getOrCreateDeviceId() && peserta.status !== 'selesai' ? (
                            <button
                              type="button"
                              onClick={() => {
                                alert(`Peringatan Akses Ujian:\n\nUjian ini sedang aktif dan terkunci pada perangkat lain: ${peserta?.device_info || 'Perangkat Lain'}.\n\n1 akun siswa tidak diperbolehkan membuka ujian pada 2 perangkat secara bersamaan. Silakan lanjutkan pengerjaan di perangkat tersebut. Jika perangkat Anda rusak atau kehabisan baterai, mintalah Pengawas Ruang untuk melakukan Reset Perangkat.`)
                              }}
                              className="w-full py-2.5 px-4 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 active:scale-[0.99] rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              <span>Terkunci di {peserta?.device_info || 'Perangkat Lain'}</span>
                            </button>
                          ) : isResume ? (
                            <button
                              type="button"
                              onClick={() => handleResumeExam(sesi)}
                              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-slate-950 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>Lanjutkan Pengerjaan Ujian</span>
                              <svg className="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={launchingSesiId === sesi.id}
                              onClick={() => handleStartExamFlow(sesi)}
                              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-75 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                              {launchingSesiId === sesi.id ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                  <span>Menyiapkan Lembar Ujian...</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                  <span>Mulai Mengerjakan Soal</span>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                  </svg>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: JADWAL MENDATANG */}
          {activeTab === 'upcoming' && (
            <div className="space-y-3">
              {upcomingSessions.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80">
                  <p className="text-xs text-slate-400">Belum ada agenda ujian mendatang yang dijadwalkan.</p>
                </div>
              ) : (
                upcomingSessions.map((sesi) => {
                  const theme = getSubjectTheme(sesi.mapel)
                  return (
                    <div 
                      key={sesi.id}
                      className={`bg-white rounded-2xl p-5 border ${theme.cardBorder} shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${theme.badge}`}>
                            {sesi.mapel}
                          </span>
                          <span className="text-[11px] text-slate-500 font-semibold uppercase">
                            {sesi.kategori}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">
                          {sesi.judul}
                        </h4>
                        <p className="text-xs text-slate-400">
                          Jadwal: {new Date(sesi.waktu_buka).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} • Pukul {new Date(sesi.waktu_buka).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold">
                          Durasi: {sesi.durasi_menit} Menit
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB 3: RIWAYAT & HASIL NILAI */}
          {pastSessions.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80">
              <p className="text-xs text-slate-400">Belum ada riwayat penilaian yang diselesaikan.</p>
            </div>
          ) : (
            activeTab === 'history' && (
              <div className="space-y-3">
                {pastSessions.map((sesi) => {
                  const theme = getSubjectTheme(sesi.mapel)
                  const peserta = sesi.peserta_data
                  const isShared = peserta?.is_nilai_shared
                  const nilaiAkhir = peserta?.nilai_akhir
                  const isTuntas = nilaiAkhir !== null && nilaiAkhir >= (sesi.kkm || 75.0)

                  return (
                    <div 
                      key={sesi.id}
                      className={`bg-white rounded-2xl p-5 border ${theme.cardBorder} shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${theme.badge}`}>
                            {sesi.mapel}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Selesai: {peserta?.waktu_selesai ? new Date(peserta.waktu_selesai).toLocaleDateString('id-ID') : '-'}
                          </span>
                          {peserta && (
                            (peserta.total_pelanggaran ?? peserta.strike_count ?? 0) > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                ⚠️ {peserta.total_pelanggaran ?? peserta.strike_count}x Pindah Layar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                🛡️ Tertib (0 Pelanggaran)
                              </span>
                            )
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">
                          {sesi.judul}
                        </h4>
                        <div className="text-xs text-slate-400">
                          KKTP: {sesi.kkm || 75.0}
                        </div>
                      </div>

                      {/* Status Nilai & Tombol Pembahasan */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {isShared ? (
                          <div className="text-right">
                            <div className="text-base font-bold text-slate-800">
                              {nilaiAkhir !== null ? nilaiAkhir : '0.00'} <span className="text-xs text-slate-400">/ 100</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              isTuntas ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {isTuntas ? 'Tuntas KKTP' : 'Perlu Remedial'}
                            </span>
                          </div>
                        ) : (
                          <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Menunggu Pengumuman Guru</span>
                          </span>
                        )}

                        {sesi.tampilkan_kunci && (
                          <button
                            onClick={() => handleOpenReview(sesi)}
                            className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>Pembahasan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </>
      )}



      {/* Modal Pembahasan */}
      {reviewTarget && (
        <SiswaCbtPembahasanModal
          pesertaId={reviewTarget.peserta_data?.id}
          sesi={reviewTarget}
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
        />
      )}
    </div>
  )
}
