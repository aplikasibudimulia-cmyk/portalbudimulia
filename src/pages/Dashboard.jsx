import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import SiswaNilaiSection from '../components/SiswaNilaiSection'
import SiswaPresensiSection from '../components/SiswaPresensiSection'
import SiswaDashboardWidgets from '../components/SiswaDashboardWidgets'
import SiswaProfilSection from '../components/SiswaProfilSection'
import SiswaNotificationPanel from '../components/SiswaNotificationPanel'
import SiswaPoinSection from '../components/SiswaPoinSection'
import SiswaPengajuanPoinSection from '../components/SiswaPengajuanPoinSection'
import ProgramSekolahSection from '../components/ProgramSekolahSection'
import SiswaBKKonsultasiSection from '../components/SiswaBKKonsultasiSection'
import SiswaJadwalSection from '../components/SiswaJadwalSection'
import TabunganSiswaSection from '../components/TabunganSiswaSection'
import BendaharaInputTabunganSection from '../components/BendaharaInputTabunganSection'
import SiswaKartuPelajarSection from '../components/SiswaKartuPelajarSection'
import MultiAccountSwitcherModal from '../components/MultiAccountSwitcherModal'
import { requestNotifPermission, showLocalNotif, isNotifGranted, subscribeToPushNotification, requestAllInitialPermissions, initNativePushNotifications } from '../utils/pushNotif'
import { getTodayWIB, getDayIndexWIB, getCurrentTimeWIB } from '../utils/dateUtils'

function Dashboard() {
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  
  // Sidebar state for mobile and desktop collapse
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // Default to collapsed as requested
  const [isNativeFullScreen, setIsNativeFullScreen] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  // Status Bendahara Kelas
  const [isBendahara, setIsBendahara] = useState(false)
  const [bendaharaKelas, setBendaharaKelas] = useState(null)

  // Status Pengingat Presensi Hari Ini
  const [presensiHariIniStatus, setPresensiHariIniStatus] = useState(null) // null | 'belum_masuk' | 'sudah_masuk'
  const hasAutoRedirectedPresensiRef = useRef(false)

  useEffect(() => {
    // Otomatis minta izin notifikasi, lokasi, dan kamera di Android APK
    requestAllInitialPermissions().catch(() => {})
  }, [])

  // Cek status presensi hari ini siswa & jalankan interval pengingat
  useEffect(() => {
    if (!studentData?.nisn) return
    let intervalId = null

    const checkPresensiHariIni = async () => {
      try {
        const { data: pengaturan } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .in('setting_key', [
            'notif_peringatan_aktif',
            'jam_mulai_notif_belum_presensi',
            'jam_batas_hadir',
            'hari_aktif_presensi',
            'notif_pengingat_interval_menit'
          ])

        const pMap = {}
        pengaturan?.forEach(p => { pMap[p.setting_key] = p.setting_value })

        const notifAktif = String(pMap['notif_peringatan_aktif']) === 'true'
        const jamMulaiNotif = pMap['jam_mulai_notif_belum_presensi'] || '06:00'
        const jamBatasHadir = pMap['jam_batas_hadir'] || '07:00'
        const hariAktifStr = pMap['hari_aktif_presensi'] || '1,2,3,4,5,6'
        const hariAktifList = hariAktifStr.split(',').map(s => parseInt(s.trim()))

        const dayOfWeek = getDayIndexWIB()
        const isHariSekolah = hariAktifList.includes(dayOfWeek)

        if (!isHariSekolah) {
          setPresensiHariIniStatus('libur')
          return
        }

        const todayStr = getTodayWIB()
        const { data: presensiData } = await supabase
          .from('presensi_harian')
          .select('id, tipe, status')
          .eq('siswa_nisn', studentData.nisn)
          .eq('tanggal', todayStr)

        const sudahMasuk = presensiData?.some(p => p.tipe === 'masuk')

        if (!sudahMasuk) {
          setPresensiHariIniStatus('belum_masuk')

          // Hanya arahkan ke menu Presensi sekali saja pada saat pertama kali load dan siswa sedang berada di beranda
          const params = new URLSearchParams(window.location.search)
          if (!hasAutoRedirectedPresensiRef.current && !params.get('menu')) {
            hasAutoRedirectedPresensiRef.current = true
            setSelectedType(current => (current === null ? 'PRESENSI' : current))
          }

          // Evaluasi jam pengingat dalam WIB
          const currentTimeStr = getCurrentTimeWIB()

          if (notifAktif && currentTimeStr >= jamMulaiNotif) {
            showLocalNotif(
              'Pengingat Presensi Masuk',
              `Halo ${studentData.nama_lengkap || studentData.nama || 'Siswa'}, Anda belum melakukan presensi hari ini (Batas hadir: ${jamBatasHadir} WIB). Silakan lakukan presensi.`,
              { tag: `pengingat-presensi-${Date.now()}` }
            )
          }
        } else {
          setPresensiHariIniStatus('sudah_masuk')
        }
      } catch (err) {
        console.warn('Error checking presensi status:', err)
      }
    }

    checkPresensiHariIni()
    intervalId = setInterval(checkPresensiHariIni, 60 * 1000)
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [studentData?.nisn])

  useEffect(() => {
    if (!studentData?.nisn) return
    const taId = studentData?.tahun_ajaran_id || null
    const checkBendahara = async () => {
      try {
        let query = supabase
          .from('bendahara_kelas')
          .select('*')
          .eq('siswa_nisn', studentData.nisn)

        if (taId) {
          query = query.or(`tahun_ajaran_id.eq.${taId},tahun_ajaran_id.is.null`)
        }

        const { data } = await query.maybeSingle()
        if (data) {
          setIsBendahara(true)
          setBendaharaKelas(data.kelas)
        } else {
          setIsBendahara(false)
          setBendaharaKelas(null)
        }
      } catch (err) {
        console.error('Check bendahara err:', err)
      }
    }
    checkBendahara()
  }, [studentData])

  // Realtime Notification Listener untuk Siswa yang sedang login
  useEffect(() => {
    if (!studentData?.nisn) return
    const nisn = String(studentData.nisn)

    const handleIncomingNotif = (payload) => {
      if (isNotifGranted()) {
        showLocalNotif(payload.judul || 'Status Pengajuan Poin', payload.pesan || 'Ada pembaruan status pengajuan poin Anda.', {
          tag: `pengajuan-${payload.status || 'update'}-${nisn}-${Date.now()}`,
          data: { url: '/dashboard?menu=AJUKAN_POIN', targetMenu: 'AJUKAN_POIN', role: 'Siswa' }
        })
      }
    }

    const channel = supabase.channel(`dashboard-siswa-live-${nisn}`, { config: { broadcast: { self: true } } })
      // 1. Broadcast dari Review Pengajuan Poin
      .on('broadcast', { event: 'pengajuan_poin_update' }, ({ payload }) => {
        handleIncomingNotif(payload)
      })
      // 2. Postgres Changes saat record pengajuan diupdate (disetujui/revisi/ditolak)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pengajuan_poin_positif', filter: `nisn=eq.${nisn}` }, (payload) => {
        const row = payload.new
        if (!row) return
        const oldRow = payload.old
        if (oldRow && oldRow.status === row.status) return

        let title = 'Pusat Notifikasi: Pengajuan Poin'
        let body = `Pengajuan "${row.jenis || 'Poin Positif'}" Anda telah diproses.`

        if (row.status === 'disetujui') {
          title = `Pengajuan Poin Disetujui (+${row.poin_diajukan} Poin)`
          body = `Selamat! Pengajuan "${row.jenis || 'Prestasi'}" Anda telah disetujui oleh pihak sekolah.`
        } else if (row.status === 'revisi') {
          title = 'Pengajuan Poin Perlu Revisi'
          body = `Pengajuan "${row.jenis || 'Kegiatan'}" memerlukan perbaikan: ${row.catatan_reviewer || 'Silakan cek menu Pengajuan Poin.'}`
        } else if (row.status === 'ditolak') {
          title = 'Pengajuan Poin Ditolak'
          body = `Pengajuan "${row.jenis || 'Kegiatan'}" belum dapat disetujui: ${row.catatan_reviewer || '-'}`
        }

        handleIncomingNotif({ judul: title, pesan: body, status: row.status })
      })
      // 3. Postgres Changes saat ada pencatatan poin baru (point_records)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'point_records', filter: `nisn=eq.${nisn}` }, (payload) => {
        const row = payload.new
        if (!row) return
        const isPos = (row.poin_diberikan || 0) > 0
        const title = isPos ? `Poin Prestasi (+${row.poin_diberikan})` : `Catatan Pelanggaran (${row.poin_diberikan} Poin)`
        const body = `${row.jenis || 'Catatan Karakter'}\n${row.keterangan ? row.keterangan : ''}`
        if (isNotifGranted()) {
          showLocalNotif(title, body, {
            tag: `poin-rec-${row.id}`,
            data: { url: '/dashboard?menu=POIN', targetMenu: 'POIN', role: 'Siswa' }
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [studentData?.nisn])

  // Detect iOS (Safari doesn't support requestFullscreen)
  const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const toggleAppFullScreen = () => {
    if (isIOS) {
      setShowIosHint(true)
      return
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }
  
  const [selectedType, setSelectedType] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      return params.get('menu') || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const checkMenuParam = () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const m = params.get('menu')
        if (m) setSelectedType(m)
      } catch {}
    }
    checkMenuParam()
    window.addEventListener('popstate', checkMenuParam)
    return () => window.removeEventListener('popstate', checkMenuParam)
  }, [])
  const [pdfUrl, setPdfUrl] = useState(null)
  const [accessBlocked, setAccessBlocked] = useState(false)
  const [refreshBerkas, setRefreshBerkas] = useState(0)
  const [error, setError] = useState(null)
  const [studentBerkas, setStudentBerkas] = useState(null)
  const [isStatusExpanded, setIsStatusExpanded] = useState(false)

  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [unreadPoinNotifCount, setUnreadPoinNotifCount] = useState(0)

  // State Poin Siswa di Beranda
  const [berandaPointRecords, setBerandaPointRecords] = useState([])
  const [berandaStudentPoints, setBerandaStudentPoints] = useState(null)
  const [loadingBerandaPoints, setLoadingBerandaPoints] = useState(false)
  const [berandaPointTab, setBerandaPointTab] = useState('semua') // 'semua' | 'positif' | 'negatif'

  // State Edit Biodata Orang Tua
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showEditBiodataModal, setShowEditBiodataModal] = useState(false)
  const [inputKontak, setInputKontak] = useState({ tag: 'Ayah', nomor: '', nama: '' })
  const [isSavingBiodata, setIsSavingBiodata] = useState(false)
  const [biodataError, setBiodataError] = useState('')
  const [biodataSuccess, setBiodataSuccess] = useState(false)

  // State Edit Nomor HP / WA Siswa
  const [showEditPhoneSiswaModal, setShowEditPhoneSiswaModal] = useState(false)
  const [inputSiswaPhone, setInputSiswaPhone] = useState('')
  const [isSavingSiswaPhone, setIsSavingSiswaPhone] = useState(false)
  const [siswaPhoneError, setSiswaPhoneError] = useState('')
  const [siswaPhoneSuccess, setSiswaPhoneSuccess] = useState(false)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [pengumuman, setPengumuman] = useState('')
  const [loggedTypes, setLoggedTypes] = useState([])
  const [showFeatureConfig, setShowFeatureConfig] = useState({
    presensi: true,
    nilai: true,
    poin: true,
    poinTotal: true,
    poinNegatif: true,
    poinPositif: true,
    poinLeaderboard: true,
    poinTataTertib: true,
    poinKatalog: true,
    jadwal: true,
    jadwalSemester: '2',
    kartuPelajar: true
  })
  const [recentNotifications, setRecentNotifications] = useState([])
  
  // State untuk perizinan notifikasi siswa
  const [notifGranted, setNotifGranted] = useState(() => {
    if (!('Notification' in window)) return false
    return Notification.permission === 'granted'
  })

  const [currentFont, setCurrentFont] = useState(() => {
    return localStorage.getItem('app_font') || 'jakarta'
  })

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

  useEffect(() => {
    document.documentElement.classList.remove('font-ubuntu', 'font-bricolage')
    if (currentFont === 'ubuntu') document.documentElement.classList.add('font-ubuntu')
    if (currentFont === 'bricolage') document.documentElement.classList.add('font-bricolage')
    localStorage.setItem('app_font', currentFont)
  }, [currentFont])

  const cycleFont = () => {
    setCurrentFont(prev => {
      if (prev === 'jakarta') return 'ubuntu'
      if (prev === 'ubuntu') return 'bricolage'
      return 'jakarta'
    })
  }

  // Photo fallback logic
  const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=Siswa&background=eff6ff&color=2563eb&size=150"
  const [photoUrls, setPhotoUrls] = useState([])
  const [photoIndex, setPhotoIndex] = useState(0)

  // Global Profile Visibility State
  const [showProfileConfig, setShowProfileConfig] = useState({
    foto: true,
    kelas: true,
    nisn: true,
    nipd: true,
    tahun_ajaran: true
  })

  const init = useCallback(async () => {
    const raw = localStorage.getItem('siswa_session')
    if (!raw) {
      navigate('/')
      return
    }
    let data = null
    try {
      data = JSON.parse(raw)
    } catch (e) {
      console.error("Invalid student session JSON:", e)
      localStorage.removeItem('siswa_session')
      navigate('/')
      return
    }
    
    // Fetch historical enrollments to check ta_referensi_id correctly
    const { data: enrollments } = await supabase.from('enrollment').select('kelas, tahun_ajaran_id, kode').eq('nisn', data.nisn)
    if (enrollments) data.enrollments = enrollments
    
    // Ambil tahun ajaran yang sedang aktif saat ini
    try {
      const { data: activeTaData } = await supabase
        .from('tahun_ajaran')
        .select('*')
        .eq('is_aktif', true)
        .maybeSingle()

      if (activeTaData) {
        data.tahun_ajaran_id = activeTaData.id
        data.tahun_ajaran = activeTaData.nama

        // Ambil rombel/kelas siswa di tahun ajaran aktif tersebut jika ada
        const currentEnr = enrollments?.find(e => e.tahun_ajaran_id === activeTaData.id)
        if (currentEnr) {
          data.kelas = currentEnr.kelas
          data.kode = currentEnr.kode
        }
      }
    } catch (err) {
      console.warn('Gagal fetch active tahun_ajaran:', err)
    }

    // Fetch latest biodata directly from siswa_permanent to ensure up-to-date parent data & NISN
    try {
      let { data: latestStudentData } = await supabase.from('siswa_permanent').select('*').eq('nisn', data.nisn).maybeSingle()
      
      // Auto-heal jika NISN siswa sudah di-update oleh sekolah namun HP siswa masih menyimpan NISN lama:
      if (!latestStudentData && data.nama_lengkap) {
        const { data: healedStudent } = await supabase
          .from('siswa_permanent')
          .select('*')
          .ilike('nama_lengkap', data.nama_lengkap.trim())
          .maybeSingle()
        if (healedStudent && healedStudent.nisn) {
          console.log(`[Auto-Heal NISN] Mengupdate NISN lokal dari ${data.nisn} ke ${healedStudent.nisn}`)
          latestStudentData = healedStudent
          data.nisn = healedStudent.nisn
          localStorage.setItem('siswa_session', JSON.stringify({ ...data, ...healedStudent }))
        }
      }

      if (latestStudentData) {
        data = { ...data, ...latestStudentData }
      }
    } catch (err) {
      console.warn('Failed to fetch latest siswa_permanent biodata:', err)
    }

    setStudentData(data)

    const { data: types } = await supabase
      .from('jenis_pengumuman').select('*').eq('visible', true).order('urutan')
    
    const visible = types ?? []
    
    const applicableTypes = visible.filter(t => {
      const target = t.target_kelas || []
      if (!Array.isArray(target) || target.length === 0) return true
      if (t.ta_referensi_id && data.enrollments) {
        const enr = data.enrollments.find(e => e.tahun_ajaran_id === t.ta_referensi_id)
        if (enr) return target.includes(enr.kelas)
      }
      return target.includes(data.kelas)
    })

    setMenuTypes(applicableTypes)
    
    // Fetch pengaturan
    const { data: pengaturan } = await supabase.from('pengaturan_sekolah').select('*')
    if (pengaturan) {
      const newShowProfile = { foto: true, kelas: true, nisn: true, nipd: true, tahun_ajaran: true }
      const newShowFeature = { 
        presensi: true, 
        nilai: true, 
        poin: true, 
        poinTotal: true, 
        poinNegatif: true, 
        poinPositif: true, 
        poinLeaderboard: true, 
        poinTataTertib: true, 
        poinKatalog: true, 
        kalender: true,
        jadwal: true,
        tabunganOrtuSiswa: true,
        tabunganWaliKelas: true,
        jadwalSemester: '2',
        kartuPelajar: true
      }
      pengaturan.forEach(p => {
        if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
        if (p.setting_key === 'tema_warna') document.documentElement.setAttribute('data-theme', p.setting_value)
        if (p.setting_key === 'show_profile_foto') newShowProfile.foto = p.setting_value === 'true'
        if (p.setting_key === 'show_profile_kelas') newShowProfile.kelas = p.setting_value === 'true'
        if (p.setting_key === 'show_profile_nisn') newShowProfile.nisn = p.setting_value === 'true'
        if (p.setting_key === 'show_profile_nipd') newShowProfile.nipd = p.setting_value === 'true'
        if (p.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = p.setting_value === 'true'
        if (p.setting_key === 'show_feature_presensi') newShowFeature.presensi = p.setting_value === 'true'
        if (p.setting_key === 'show_feature_nilai') newShowFeature.nilai = p.setting_value === 'true'
        if (p.setting_key === 'show_feature_poin') newShowFeature.poin = p.setting_value === 'true'
        if (p.setting_key === 'show_tabungan_ortu_siswa') newShowFeature.tabunganOrtuSiswa = p.setting_value === 'true'
        if (p.setting_key === 'show_tabungan_wali_kelas') newShowFeature.tabunganWaliKelas = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_total') newShowFeature.poinTotal = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_negatif') newShowFeature.poinNegatif = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_positif') newShowFeature.poinPositif = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_leaderboard') newShowFeature.poinLeaderboard = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_tata_tertib') newShowFeature.poinTataTertib = p.setting_value === 'true'
        if (p.setting_key === 'show_poin_katalog') newShowFeature.poinKatalog = p.setting_value === 'true'
        if (p.setting_key === 'show_calendar_siswa') newShowFeature.kalender = p.setting_value === 'true'
        if (p.setting_key === 'show_jadwal_siswa') newShowFeature.jadwal = p.setting_value === 'true'
        if (p.setting_key === 'jadwal_semester_aktif') newShowFeature.jadwalSemester = p.setting_value || '2'
        if (p.setting_key === 'show_feature_kartu_pelajar') newShowFeature.kartuPelajar = p.setting_value === 'true'
      })
      setShowProfileConfig(newShowProfile)
      setShowFeatureConfig(newShowFeature)
    }
    
    // Fetch student profile photos
    const urls = []
    if (data.nisn) {
      // 1. Fetch from 'foto' table
      const { data: allFotos } = await supabase
        .from('foto')
        .select('cloudinary_url, tahun_ajaran_id')
        .eq('nisn', data.nisn)
        
      if (allFotos && allFotos.length > 0) {
        const currentYearFoto = allFotos.find(f => f.tahun_ajaran_id === data.tahun_ajaran_id)
        if (currentYearFoto?.cloudinary_url) {
          urls.push(currentYearFoto.cloudinary_url)
        }
        allFotos.forEach(f => {
          if (f.tahun_ajaran_id !== data.tahun_ajaran_id && f.cloudinary_url) {
            urls.push(f.cloudinary_url)
          }
        })
      }

      // 2. Direct Cloudinary public URL fallback
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dwyhpysp5'
      if (data.tahun_ajaran_id) {
        urls.push(`https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_300,h_300,g_face/SKL-BM/FOTO_${data.nisn}_${data.tahun_ajaran_id}`)
      }
      urls.push(`https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_300,h_300,g_face/SKL-BM/FOTO_${data.nisn}`)
    }
    
    urls.push(DEFAULT_AVATAR)
    setPhotoUrls(urls)
    
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    init()

    const taChannel = supabase.channel('global-ta-changes-siswa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tahun_ajaran' }, () => {
        init()
      })
      .subscribe()

    return () => supabase.removeChannel(taChannel)
  }, [init])

  useEffect(() => {
    if ((selectedType === 'TABUNGAN' || selectedType === 'INPUT_TABUNGAN') && showFeatureConfig.tabunganOrtuSiswa === false) {
      setSelectedType(null)
    }
    if (selectedType === 'KARTU_PELAJAR' && showFeatureConfig.kartuPelajar === false) {
      setSelectedType(null)
    }
  }, [selectedType, showFeatureConfig.tabunganOrtuSiswa, showFeatureConfig.kartuPelajar])

  const fetchNotifCount = async () => {
    if (!studentData) return
    const { data: allNotif } = await supabase.from('notifikasi')
      .select('id, judul, pesan, tipe, created_at, target_kelas')
      .or(`target_nisn.is.null,target_nisn.eq.${studentData.nisn}`)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (!allNotif) return
    const valid = allNotif.filter(n => !n.target_kelas || n.target_kelas === studentData.kelas)
    
    const { data: readNotif } = await supabase.from('notifikasi_read')
      .select('notifikasi_id')
      .eq('nisn', studentData.nisn)
      
    const readIds = new Set((readNotif || []).map(r => r.notifikasi_id))
    const unreadList = valid.filter(n => !readIds.has(n.id))
    setUnreadNotifCount(unreadList.length)

    // Unread spesifik notifikasi pengajuan poin
    const unreadPoinList = unreadList.filter(n => 
      n.tipe === 'poin' || 
      n.judul?.toLowerCase().includes('pengajuan') || 
      n.pesan?.toLowerCase().includes('pengajuan')
    )
    setUnreadPoinNotifCount(unreadPoinList.length)

    const mapped = valid.map(n => ({
      ...n,
      isRead: readIds.has(n.id)
    })).slice(0, 3)
    setRecentNotifications(mapped)
  }

  useEffect(() => {
    if (!studentData) return
    initNativePushNotifications({ nisn: studentData.nisn, role: 'Siswa' })
    fetchNotifCount()
    
    const channel = supabase.channel(`siswa-notif-${studentData.nisn}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifikasi' }, fetchNotifCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifikasi_read', filter: `nisn=eq.${studentData.nisn}` }, fetchNotifCount)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tabungan_transaksi', 
        filter: `siswa_nisn=eq.${studentData.nisn}` 
      }, (payload) => {
        const row = payload.new
        if (!row) return
        if (row.status_verifikasi === 'VERIFIED') {
          if (payload.old && payload.old.status_verifikasi === 'VERIFIED') return
          
          const isSetor = row.tipe === 'SETOR'
          const nominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.jumlah)
          const saldo = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.saldo_akhir)
          
          const title = isSetor ? 'Setoran Tabungan Berhasil' : 'Penarikan Tabungan Berhasil'
          const body = isSetor
            ? `Setoran tabungan sebesar ${nominal} telah diverifikasi. Total tabungan kamu sekarang: ${saldo}.`
            : `Penarikan tabungan sebesar ${nominal} berhasil. Total tabungan kamu sekarang: ${saldo}.`
            
          if (isNotifGranted()) {
            showLocalNotif(title, body, {
              tag: `tabungan-${row.id}-${Date.now()}`,
              summaryText: body,
              data: { url: '/dashboard?menu=TABUNGAN', targetMenu: 'TABUNGAN', role: 'Siswa' }
            })
          }
        }
      })
      .subscribe()
      
    return () => supabase.removeChannel(channel)
  }, [studentData])

  const fetchBerandaPoints = useCallback(async () => {
    if (!studentData?.nisn) return
    setLoadingBerandaPoints(true)
    try {
      // 1. Ambil data skor poin aktif
      let ptQuery = supabase
        .from('student_points')
        .select('total_poin, poin_default, semester')
        .eq('nisn', studentData.nisn)
        
      if (studentData.tahun_ajaran_id) {
        ptQuery = ptQuery.eq('tahun_ajaran_id', studentData.tahun_ajaran_id)
      }
      const { data: ptData } = await ptQuery.order('semester', { ascending: false }).limit(1).maybeSingle()
      setBerandaStudentPoints(ptData || null)

      // 2. Ambil catatan kasus poin positif & negatif
      let recQuery = supabase
        .from('point_records')
        .select('*')
        .eq('nisn', studentData.nisn)

      if (studentData.tahun_ajaran_id) {
        recQuery = recQuery.eq('tahun_ajaran_id', studentData.tahun_ajaran_id)
      }

      const { data: recData } = await recQuery
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })

      setBerandaPointRecords(recData || [])
    } catch (err) {
      console.error('Error fetching beranda point records:', err)
    } finally {
      setLoadingBerandaPoints(false)
    }
  }, [studentData])

  useEffect(() => {
    if (studentData?.nisn) {
      fetchBerandaPoints()

      const pChannel = supabase.channel(`siswa-points-${studentData.nisn}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'point_records', filter: `nisn=eq.${studentData.nisn}` }, fetchBerandaPoints)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_points', filter: `nisn=eq.${studentData.nisn}` }, fetchBerandaPoints)
        .subscribe()

      return () => supabase.removeChannel(pChannel)
    }
  }, [studentData, fetchBerandaPoints])

  const handleRequestPushNotif = async () => {
    const permission = await requestNotifPermission()
    if (permission === 'granted') {
      setNotifGranted(true)
      const sub = await subscribeToPushNotification()
      if (sub && studentData) {
        await supabase.from('push_subscriptions').upsert({
          nisn: studentData.nisn,
          subscription: sub.toJSON()
        }, { onConflict: 'nisn' })
        showLocalNotif('✅ Pengingat Aktif', 'Sistem akan mengingatkan Anda jika belum presensi.', { tag: 'notif-aktif' })
      }
    }
  }

  useEffect(() => {
    const checkFileExists = async () => {
      if (!selectedType || !studentData) {
        setPdfUrl(null)
        setError(null)
        setAccessBlocked(false)
        return
      }

      if (!selectedType.aktif) {
        setPdfUrl(null)
        setError(null)
        setAccessBlocked(true)
        return
      }

      const allStudentKodes = [
        ...(studentData?.enrollments?.map(e => e.kode) || []),
        studentData?.kode,
        studentData?.nisn
      ].filter(Boolean);

      const { data: berkas } = await supabase
        .from('berkas_pengumuman')
        .select('*')
        .in('kode_siswa', allStudentKodes)
        .eq('kode_jenis', selectedType.dokumen_kode_jenis || selectedType.kode_jenis)
        .limit(1)
        .maybeSingle()
        
      setStudentBerkas(berkas)

      // LANGKAH 1: Cek Persyaratan terlebih dahulu
      // Jika ada persyaratan, semua harus terpenuhi (dicentang admin/guru)
      if (selectedType.persyaratan && selectedType.persyaratan.length > 0) {
        const terpenuhi = berkas?.persyaratan_terpenuhi || {}
        const belumTerpenuhi = selectedType.persyaratan.filter(req => !terpenuhi[req.id])
        if (belumTerpenuhi.length > 0) {
          setPdfUrl(null)
          setAccessBlocked(false)
          setError('Akses ditangguhkan. Cek Prasyarat Akses.')
          return
        }
      }

      // LANGKAH 2: Cek apakah admin memblokir akses secara individual (is_accessible = false)
      // Hanya blokir jika record ada DAN is_accessible secara eksplisit = false
      if (berkas && berkas.is_accessible === false) {
        setPdfUrl(null)
        setError(null)
        setAccessBlocked(true)
        return
      }

      // LANGKAH 3: Semua syarat terpenuhi & tidak diblokir — tampilkan dokumen atau pesan belum upload
      const fileUrl = berkas?.file_url
      const hasFile = fileUrl && fileUrl !== '-'
      if (hasFile) {
        setAccessBlocked(false)
        setError(null)
        setPdfUrl(fileUrl)
        
        logActivity({
          userRole: 'Siswa',
          action: 'Unduh Dokumen',
          details: `Siswa ${studentData.nama_lengkap} membuka dokumen ${selectedType.nama} di browser.`
        })
      } else {
        // Persyaratan sudah terpenuhi, tapi dokumen belum diupload oleh sekolah
        setPdfUrl(null)
        setAccessBlocked(false)
        setError('Dokumen belum diunggah oleh sekolah. Silakan cek kembali nanti.')
      }
    }
    checkFileExists()
  }, [selectedType, studentData, refreshBerkas])

  useEffect(() => {
    if (pdfUrl && selectedType && studentData && !loggedTypes.includes(selectedType.id)) {
      logActivity({
        userRole: 'Siswa',
        action: 'Unduh Dokumen',
        details: `Siswa ${studentData.nama_lengkap} membuka/mengakses dokumen ${selectedType.nama}.`
      })
      setLoggedTypes(prev => [...prev, selectedType.id])
    }
  }, [pdfUrl, selectedType, studentData, loggedTypes])

  // Supabase Realtime — menggantikan polling setInterval 1.5 detik
  // Subscribe ke 3 tabel: jenis_pengumuman, berkas_pengumuman, pengaturan_sekolah
  useEffect(() => {
    if (loading || !studentData) return

    const handleMenuUpdate = async () => {
      const { data: types } = await supabase
        .from('jenis_pengumuman').select('*').eq('visible', true).order('urutan')
      const visible = types ?? []
      const applicableTypes = visible.filter(t => {
        const target = t.target_kelas || []
        if (!Array.isArray(target) || target.length === 0) return true
        if (t.ta_referensi_id && studentData?.enrollments) {
          const enr = studentData.enrollments.find(e => e.tahun_ajaran_id === t.ta_referensi_id)
          if (enr) return target.includes(enr.kelas)
        }
        return target.includes(studentData?.kelas)
      })
      setMenuTypes(prev => {
        if (JSON.stringify(prev) === JSON.stringify(applicableTypes)) return prev
        return applicableTypes
      })
      setSelectedType(prev => {
        if (!prev || typeof prev === 'string') return prev
        const updated = applicableTypes.find(t => t.id === prev.id)
        if (!updated) return null
        if (JSON.stringify(updated) === JSON.stringify(prev)) return prev
        return updated
      })
    }

    const handleBerkasUpdate = () => {
      setRefreshBerkas(prev => prev + 1)
    }

    const handleSettingsUpdate = async () => {
      const { data: pengaturan } = await supabase.from('pengaturan_sekolah').select('*')
      if (pengaturan) {
        const newShowProfile = { foto: true, kelas: true, nisn: true, nipd: true, tahun_ajaran: true }
        const newShowFeature = { 
          presensi: true, 
          nilai: true, 
          poin: true, 
          poinTotal: true, 
          poinNegatif: true, 
          poinPositif: true, 
          poinLeaderboard: true, 
          poinTataTertib: true, 
          poinKatalog: true, 
          kalender: true,
          jadwal: true,
          jadwalSemester: '2',
          kartuPelajar: true
        }
        pengaturan.forEach(p => {
          if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
          if (p.setting_key === 'tema_warna') document.documentElement.setAttribute('data-theme', p.setting_value)
          if (p.setting_key === 'show_profile_foto') newShowProfile.foto = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_kelas') newShowProfile.kelas = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nisn') newShowProfile.nisn = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nipd') newShowProfile.nipd = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_presensi') newShowFeature.presensi = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_nilai') newShowFeature.nilai = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_poin') newShowFeature.poin = p.setting_value === 'true'
          if (p.setting_key === 'show_tabungan_ortu_siswa') newShowFeature.tabunganOrtuSiswa = p.setting_value === 'true'
          if (p.setting_key === 'show_tabungan_wali_kelas') newShowFeature.tabunganWaliKelas = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_total') newShowFeature.poinTotal = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_negatif') newShowFeature.poinNegatif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_positif') newShowFeature.poinPositif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_leaderboard') newShowFeature.poinLeaderboard = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_tata_tertib') newShowFeature.poinTataTertib = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_katalog') newShowFeature.poinKatalog = p.setting_value === 'true'
          if (p.setting_key === 'show_calendar_siswa') newShowFeature.kalender = p.setting_value === 'true'
          if (p.setting_key === 'show_jadwal_siswa') newShowFeature.jadwal = p.setting_value === 'true'
          if (p.setting_key === 'jadwal_semester_aktif') newShowFeature.jadwalSemester = p.setting_value || '2'
          if (p.setting_key === 'show_feature_kartu_pelajar') newShowFeature.kartuPelajar = p.setting_value === 'true'
        })
        setShowProfileConfig(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newShowProfile)) return newShowProfile
          return prev
        })
        setShowFeatureConfig(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newShowFeature)) return newShowFeature
          return prev
        })
      }
    }

    const channel = supabase.channel(`dashboard-updates-${studentData.nisn}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jenis_pengumuman' }, handleMenuUpdate)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'berkas_pengumuman'
        },
        (payload) => {
          console.log('[REALTIME DEBUG] Berkas update received:', payload)
          if (payload.new && payload.new.kode_siswa === (studentData?.enrollments?.find(e => e.tahun_ajaran_id === (studentData.tahun_ajaran_id))?.kode || studentData.kode)) {
            console.log('[REALTIME DEBUG] Matched kode_siswa, updating state!')
            handleBerkasUpdate()
          } else if (payload.eventType === 'DELETE' && payload.old && (studentData?.enrollments?.map(e => e.kode).includes(payload.old.kode_siswa) || payload.old.kode_siswa === studentData.kode)) {
             handleBerkasUpdate()
          } else {
            // Also call handleBerkasUpdate just in case the filter was failing due to missing columns
            console.log('[REALTIME DEBUG] Payload did not contain expected kode_siswa, but calling update anyway.')
            handleBerkasUpdate()
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sekolah' }, handleSettingsUpdate)
      .subscribe()

    // Bulletproof Broadcast Listener (ebudimulia-global-settings-broadcast)
    const broadcastChannel = supabase.channel('ebudimulia-global-settings-broadcast')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sekolah' }, handleSettingsUpdate)
      .on('broadcast', { event: 'berkas_updated' }, (payload) => {
        console.log('[REALTIME DEBUG] Broadcast received:', payload)
        if (payload.payload && (studentData?.enrollments?.map(e => e.kode).includes(payload.payload.kode_siswa) || payload.payload.kode_siswa === studentData.kode || studentData?.nisn === payload.payload.kode_siswa)) {
          handleBerkasUpdate()
        } else if (payload.payload && String(payload.payload.kode_siswa).toLowerCase() === 'all') {
          handleBerkasUpdate()
        }
      })
      .on('broadcast', { event: 'toggle_tabungan_feature' }, (payload) => {
        if (payload?.payload?.key === 'show_tabungan_ortu_siswa') {
          setShowFeatureConfig(prev => ({ ...prev, tabunganOrtuSiswa: payload.payload.value }))
        }
        if (payload?.payload?.key === 'show_tabungan_wali_kelas') {
          setShowFeatureConfig(prev => ({ ...prev, tabunganWaliKelas: payload.payload.value }))
        }
      })
      .subscribe()

    const jenisChannel = supabase.channel('jenis-updates-all')
      .on('broadcast', { event: 'jenis_updated' }, () => {
        console.log('[REALTIME DEBUG] Broadcast jenis_updated received')
        handleMenuUpdate()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(broadcastChannel)
      supabase.removeChannel(jenisChannel)
    }
  }, [loading, studentData])

  const handleLogout = async () => {
    window.__ebudimuliaExplicitLogout = true
    localStorage.removeItem('siswa_session')
    await supabase.auth.signOut()
    navigate('/')
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)
    setIsChangingPassword(true)

    try {
      if (oldPassword !== studentData.kode_akses) {
        setPasswordError('Kode akses lama salah.')
        setIsChangingPassword(false)
        return
      }
      if (newPassword.trim() === '') {
        setPasswordError('Kode akses baru tidak boleh kosong.')
        setIsChangingPassword(false)
        return
      }

      const { error } = await supabase
        .from('siswa_permanent')
        .update({ kode_akses: newPassword.trim() })
        .eq('nisn', studentData.nisn)

      if (error) throw error

      setPasswordSuccess(true)
      const updatedData = { ...studentData, kode_akses: newPassword.trim() }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      
      logActivity({
        userRole: 'Siswa',
        action: 'Ubah Kode Akses',
        details: `Siswa dengan NISN ${studentData.nisn} berhasil mengubah kode akses.`
      })

      setTimeout(() => {
        setShowPasswordModal(false)
        setOldPassword('')
        setNewPassword('')
        setPasswordSuccess(false)
      }, 2000)

    } catch (err) {
      setPasswordError('Terjadi kesalahan saat mengubah kode akses.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const formatPhoneNumber = (phone) => {
    if (!phone) return ''
    let clean = phone.replace(/\D/g, '')
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1)
    } else if (clean.startsWith('8')) {
      clean = '628' + clean.slice(1)
    }
    return clean
  }

  const handleOpenEditBiodata = () => {
    setInputKontak({ tag: 'Ayah', nomor: '', nama: '' })
    setBiodataError('')
    setBiodataSuccess(false)
    setShowEditBiodataModal(true)
  }

  const handleOpenEditSiswaPhone = () => {
    setInputSiswaPhone(studentData?.no_whatsapp || '')
    setSiswaPhoneError('')
    setSiswaPhoneSuccess(false)
    setShowEditPhoneSiswaModal(true)
  }

  const handleSaveSiswaPhone = async (e) => {
    e.preventDefault()
    setSiswaPhoneError('')
    setSiswaPhoneSuccess(false)
    setIsSavingSiswaPhone(true)
    try {
      const formatted = inputSiswaPhone && inputSiswaPhone.trim() !== '' ? formatPhoneNumber(inputSiswaPhone) : null
      const { error } = await supabase
        .from('siswa_permanent')
        .update({ no_whatsapp: formatted })
        .eq('nisn', studentData.nisn)
      
      if (error) throw error

      const updatedData = { ...studentData, no_whatsapp: formatted }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      setSiswaPhoneSuccess(true)
      setTimeout(() => {
        setSiswaPhoneSuccess(false)
        setShowEditPhoneSiswaModal(false)
      }, 1500)
    } catch (err) {
      console.error('Error saving siswa phone:', err)
      setSiswaPhoneError('Gagal menyimpan nomor WhatsApp siswa.')
    } finally {
      setIsSavingSiswaPhone(false)
    }
  }

  const getSavedKontakList = () => {
    if (Array.isArray(studentData?.kontak_ortu) && studentData.kontak_ortu.length > 0) {
      return studentData.kontak_ortu
    }
    if (studentData?.no_hp_ortu) {
      return [{
        tag: 'Orang Tua',
        nomor: formatPhoneNumber(studentData.no_hp_ortu),
        nama: studentData.nama_ortu || ''
      }]
    }
    return []
  }

  const saveKontakListToDb = async (list) => {
    setIsSavingBiodata(true)
    try {
      const primaryPhone = list[0]?.nomor || null
      const primaryName = list.find(k => k.nama)?.nama || studentData?.nama_ortu || null

      let updateOk = false
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_kontak_ortu_siswa', {
          p_nisn: String(studentData.nisn),
          p_kontak_list: list
        })
        if (!rpcErr && rpcRes?.success) updateOk = true
      } catch (rpcEx) {
        console.warn('RPC update_kontak_ortu_siswa fallback:', rpcEx)
      }

      if (!updateOk) {
        const { error } = await supabase
          .from('siswa_permanent')
          .update({
            kontak_ortu: list,
            no_hp_ortu: primaryPhone,
            nama_ortu: primaryName
          })
          .eq('nisn', studentData.nisn)

        if (error) throw error
      }

      const updatedData = {
        ...studentData,
        kontak_ortu: list,
        no_hp_ortu: primaryPhone,
        nama_ortu: primaryName
      }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      setBiodataSuccess(true)
      setTimeout(() => setBiodataSuccess(false), 2000)
      return true
    } catch (err) {
      console.error('Error saving kontak:', err)
      setBiodataError('Gagal menyimpan kontak orang tua.')
      return false
    } finally {
      setIsSavingBiodata(false)
    }
  }

  const handleSaveSingleKontak = async (e) => {
    e.preventDefault()
    setBiodataError('')
    setBiodataSuccess(false)

    if (!inputKontak.nomor || inputKontak.nomor.trim() === '') {
      setBiodataError('Mohon masukkan nomor HP / WhatsApp.')
      return
    }

    const formattedNum = formatPhoneNumber(inputKontak.nomor)
    const newEntry = {
      tag: inputKontak.tag || 'Orang Tua',
      nomor: formattedNum,
      nama: inputKontak.nama ? inputKontak.nama.trim() : ''
    }

    const currentList = getSavedKontakList()
    const existIdx = currentList.findIndex(k => k.nomor === formattedNum)
    let updatedList = []
    if (existIdx >= 0) {
      updatedList = [...currentList]
      updatedList[existIdx] = newEntry
    } else {
      updatedList = [...currentList, newEntry]
    }

    const ok = await saveKontakListToDb(updatedList)
    if (ok) {
      setInputKontak({ tag: inputKontak.tag === 'Ayah' ? 'Ibu' : 'Ayah', nomor: '', nama: '' })
    }
  }

  const handleDeleteSavedKontak = async (idxToDelete) => {
    const currentList = getSavedKontakList()
    const updatedList = currentList.filter((_, i) => i !== idxToDelete)
    await saveKontakListToDb(updatedList)
  }

  const isBiodataLengkap = Boolean(
    studentData && (
      (Array.isArray(studentData.kontak_ortu) && studentData.kontak_ortu.length > 0) ||
      studentData.no_hp_ortu
    )
  );

  const biodataWarningBanner = studentData && !isBiodataLengkap && (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 animate-fade-in shadow-sm">
      <div className="flex items-start gap-3.5">
        <span className="p-2.5 bg-amber-100 text-amber-800 rounded-xl mt-0.5 sm:mt-0 shrink-0 shadow-2xs">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </span>
        <div>
          <h4 className="text-sm font-bold text-amber-950">Penting: Lengkapi Nomor HP Orang Tua!</h4>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Mohon bantu isikan <strong>Nomor WhatsApp / HP Orang Tua</strong> kamu agar sekolah dapat mengirimkan laporan presensi dan informasi penting secara otomatis.
          </p>
        </div>
      </div>
      <button
        onClick={() => handleOpenEditBiodata()}
        className="px-4.5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm shrink-0 uppercase tracking-wider flex items-center justify-center gap-1.5"
      >
        Lengkapi Sekarang
      </button>
    </div>
  )

  // Tampilan Menu Siswa (Opsional / Per Pengumuman)
  const showNisnMenu = selectedType ? selectedType.show_nisn : false
  const showNipdMenu = selectedType ? selectedType.show_nipd : false
  const showTahunLulusMenu = selectedType ? selectedType.show_tahun_lulus : false

  // Either global profile wants it shown OR the current menu type specifically wants it shown
  const isNisnVisible = showProfileConfig.nisn || showNisnMenu
  const isNipdVisible = showProfileConfig.nipd || showNipdMenu
  const currentMenuLabel = 
    selectedType === 'INPUT_TABUNGAN' ? `Input Tabungan Kelas ${bendaharaKelas}` :
    selectedType === 'TABUNGAN' ? 'Tabungan Siswa' :
    selectedType === 'NILAI' ? 'Laporan Nilai Saya' : 
    selectedType === 'PRESENSI' ? 'Presensi Hari Ini' : 
    selectedType === 'POIN' ? 'Poin & Disiplin' : 
    selectedType === 'JADWAL' ? 'Jadwal Pelajaran' :
    selectedType === 'KALENDER' ? 'Kalender Akademik' : 
    selectedType === 'KONSULTASI_BK' ? 'Konsultasi BK' :
    selectedType === 'AJUKAN_POIN' ? 'Pengajuan Poin Positif' :
    selectedType === 'KARTU_PELAJAR' ? 'Kartu Pelajar Digital' :
    selectedType === 'PROFIL' ? 'Profil Siswa' :
    selectedType === 'PENGATURAN' ? 'Pengaturan Portal' : 
    selectedType?.nama || 'Dokumen Siswa'

  const studentInfoCard = studentData && (
    <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden animate-slide-up mb-6">
      <div className="relative z-10 space-y-3.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-snug">
            Selamat Datang, {studentData.nama_lengkap}!
          </h2>
          <button
            onClick={() => setShowAccountSwitcher(true)}
            className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl border border-white/30 shadow-xs transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
            title="Beralih Akun / Tambah Akun"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Beralih Akun</span>
            <svg className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>

        <p className="text-indigo-100 text-xs sm:text-sm font-medium max-w-xl leading-relaxed">
          Anda sedang mengakses Sistem Informasi Akademik Digital SMP Budi Mulia sebagai Siswa.
        </p>

        {/* Badges Info Grid (Kelas, NISN, NIPD, Tahun Ajaran) */}
        <div className="flex items-center gap-2 flex-wrap pt-1.5">
          {showProfileConfig.kelas && (
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-xl text-xs font-bold border border-white/20">
              Kelas: <strong className="text-white font-black">{studentData.kelas}</strong>
            </span>
          )}
          {isNisnVisible && (
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-xl text-xs font-bold border border-white/20 font-mono">
              NISN: <strong className="text-white font-bold">{studentData.nisn ?? '—'}</strong>
            </span>
          )}
          {isNipdVisible && studentData.nipd && (
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-xl text-xs font-bold border border-white/20 font-mono">
              NIPD: <strong className="text-white font-bold">{studentData.nipd}</strong>
            </span>
          )}
          {showProfileConfig.tahun_ajaran && (
            <span className="px-3 py-1.5 bg-white/15 backdrop-blur-md rounded-xl text-xs font-bold border border-white/20">
              T.A: <strong className="text-white font-bold">{studentData.tahun_ajaran ?? '—'}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Decorative Background Geometric Shape */}
      <svg className="absolute right-0 bottom-0 opacity-10 w-64 h-64 -mb-16 -mr-16 transform rotate-12 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 22h20L12 2zm0 3.8l7.5 14.2H4.5L12 5.8z" />
      </svg>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium mt-4">Memuat portal...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-800">
      
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
{/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 transform transition-all duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col shadow-sm ${sidebarOpen ? 'translate-x-0' : '-translate-x-[150%]'} ${sidebarCollapsed ? 'w-24' : 'w-72'}`}>
        
        {/* Sidebar Header */}
        <div className={`p-5 border-b border-slate-200 flex items-center shrink-0 bg-white transition-all ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`flex items-center cursor-pointer hover:opacity-80 transition-opacity ${sidebarCollapsed ? 'justify-center w-full' : 'gap-3'}`} title="Tampilkan/Sembunyikan Sidebar">
            <img src="/logo.png?v=1784818000" alt="Logo" className={`${sidebarCollapsed ? 'w-14 h-14' : 'w-20 h-20'} object-contain shrink-0 drop-shadow-sm transition-all duration-300`} />
            {!sidebarCollapsed && (
              <div className="animate-fade-in truncate">
                <h2 className="font-bold text-base text-slate-800 leading-tight truncate">eBudiMulia</h2>
                <p className="text-[10px] font-medium text-slate-500 truncate">SMP Budi Mulia Jakarta</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button className="md:hidden p-2 text-slate-500 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setSidebarOpen(false)}>
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}
        </div>
        
        {/* Sidebar Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scrollbar-hide">
          
          <div>
            {!sidebarCollapsed && <div className="px-3 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Menu Utama</div>}
            <div className="space-y-2">
              <button 
                onClick={() => { setSelectedType(null); setSidebarOpen(false) }}
                title="Beranda"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${!selectedType ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${!selectedType ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Beranda</span>}
              </button>
              {showFeatureConfig.presensi && (
                <button 
                  onClick={() => { setSelectedType('PRESENSI'); setSidebarOpen(false) }}
                  title="Presensi Hari Ini"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'PRESENSI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'PRESENSI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Presensi Hari Ini</span>}
                </button>
              )}
              {showFeatureConfig.nilai && (
                <button 
                  onClick={() => { setSelectedType('NILAI'); setSidebarOpen(false) }}
                  title="Nilai Saya"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'NILAI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'NILAI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"></path></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Nilai Saya</span>}
                </button>
              )}
              {showFeatureConfig.poin && (
                <button 
                  onClick={() => { setSelectedType('POIN'); setSidebarOpen(false) }}
                  title="Poin Siswa"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'POIN' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'POIN' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Poin Siswa</span>}
                </button>
              )}

              {/* Tabungan Siswa */}
              {showFeatureConfig.tabunganOrtuSiswa !== false && (
                <button 
                  onClick={() => { setSelectedType('TABUNGAN'); setSidebarOpen(false) }}
                  title="Tabungan Siswa"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'TABUNGAN' ? 'bg-emerald-50 text-emerald-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'TABUNGAN' ? 'text-emerald-600' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Tabungan Siswa</span>}
                </button>
              )}

              {/* Menu Khusus Bendahara Kelas (Hanya untuk Siswa yang Bertugas & Jika Fitur Aktif) */}
              {isBendahara && showFeatureConfig.tabunganOrtuSiswa !== false && (
                <button 
                  onClick={() => { setSelectedType('INPUT_TABUNGAN'); setSidebarOpen(false) }}
                  title={`Input Tabungan Kelas ${bendaharaKelas}`}
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'INPUT_TABUNGAN' ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm scale-100' : 'text-amber-700 hover:bg-amber-50/70 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-3'}`}
                >
                  <div className="relative shrink-0">
                    <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                      ✍️
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                  </div>
                  {!sidebarCollapsed && (
                    <div className="text-left animate-fade-in truncate">
                      <p className="leading-tight font-extrabold text-amber-950 text-xs">Input Tabungan</p>
                      <p className="text-[10px] text-amber-700 font-semibold truncate">Bendahara {bendaharaKelas}</p>
                    </div>
                  )}
                </button>
              )}

              {/* Jadwal Pelajaran */}
              {showFeatureConfig.jadwal && (
                <button 
                  onClick={() => { setSelectedType('JADWAL'); setSidebarOpen(false) }}
                  title="Jadwal Pelajaran"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'JADWAL' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'JADWAL' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Jadwal Pelajaran</span>}
                </button>
              )}

              {/* Kalender Akademik */}
              {showFeatureConfig.kalender && (
                <button 
                  onClick={() => { setSelectedType('KALENDER'); setSidebarOpen(false) }}
                  title="Kalender Akademik"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'KALENDER' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'KALENDER' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Kalender Akademik</span>}
                </button>
              )}

              {/* Konsultasi BK */}
              <button 
                onClick={() => { setSelectedType('KONSULTASI_BK'); setSidebarOpen(false) }}
                title="Konsultasi BK"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'KONSULTASI_BK' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${selectedType === 'KONSULTASI_BK' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Konsultasi BK</span>}
              </button>

              {/* Pengajuan Poin Positif */}
              <button 
                onClick={() => { setSelectedType('AJUKAN_POIN'); setSidebarOpen(false) }}
                title="Pengajuan Poin Positif"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative ${selectedType === 'AJUKAN_POIN' ? 'bg-emerald-50 text-emerald-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <div className="relative shrink-0">
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'AJUKAN_POIN' ? 'text-emerald-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  {unreadPoinNotifCount > 0 && sidebarCollapsed && (
                    <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[8px] font-black px-1 py-0.5 rounded-full ring-1 ring-white animate-pulse">
                      {unreadPoinNotifCount > 99 ? '99+' : unreadPoinNotifCount}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Pengajuan Poin Positif</span>}
                {unreadPoinNotifCount > 0 && !sidebarCollapsed && (
                  <span className="absolute bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full right-4 animate-pulse">
                    {unreadPoinNotifCount > 99 ? '99+' : unreadPoinNotifCount}
                  </span>
                )}
              </button>

              {/* Kartu Pelajar Digital */}
              {showFeatureConfig.kartuPelajar !== false && (
              <button 
                onClick={() => { setSelectedType('KARTU_PELAJAR'); setSidebarOpen(false) }}
                title="Kartu Pelajar"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative ${selectedType === 'KARTU_PELAJAR' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${selectedType === 'KARTU_PELAJAR' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="9" cy="10" r="2" />
                  <line x1="15" y1="8" x2="19" y2="8" />
                  <line x1="15" y1="12" x2="19" y2="12" />
                  <line x1="7" y1="16" x2="17" y2="16" />
                </svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Kartu Pelajar</span>}
              </button>
              )}

            </div>
          </div>

          {menuTypes.length > 0 && (
            <div>
              {!sidebarCollapsed && <div className="px-3 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6">Dokumen</div>}
              <div className="space-y-2">
                {menuTypes.map(type => (
                  <button 
                    key={type.id} 
                    title={type.nama}
                    onClick={() => { setSelectedType(type); setSidebarOpen(false) }}
                    className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType?.id === type.id ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                  >
                    <svg className={`w-6 h-6 shrink-0 ${selectedType?.id === type.id ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    {!sidebarCollapsed && <span className="animate-fade-in truncate text-left">{type.nama}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar Footer Actions (Hanya Keluar) */}
        <div className="p-4 shrink-0">
          <button 
            onClick={handleLogout}
            title="Keluar"
            className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-all ${sidebarCollapsed ? 'justify-center aspect-square px-0 bg-red-50' : 'gap-4 bg-red-50'}`}
          >
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            {!sidebarCollapsed && <span className="animate-fade-in">Keluar</span>}
          </button>
        </div>
      </div>

      {/* iOS Fullscreen Hint Modal */}
      {showIosHint && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowIosHint(false)}>
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
              <button onClick={() => setShowIosHint(false)} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors text-sm">
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Fullscreen FAB – always visible on mobile */}
      <button
        onClick={toggleAppFullScreen}
        title={isNativeFullScreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
        className={`fixed bottom-5 right-5 z-[100] md:hidden w-12 h-12 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-300 border ${
          isNativeFullScreen
            ? 'bg-indigo-600 border-indigo-700 text-white'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
      >
        {isNativeFullScreen ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m12 0l-5-5m5 5v-4m0 4h-4"/></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
        )}
      </button>
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50 dashboard-content-area">
        
        {/* Top Header Navbar (Mirip Desain Guru) */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-2xs shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl md:hidden transition-colors"
              title="Buka Menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-slate-800 tracking-tight">eBudiMulia Siswa</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notification Bell Button */}
            <button
              onClick={() => setShowNotifPanel(true)}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              title="Notifikasi"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadNotifCount > 0 ? (
                <span className="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-white animate-pulse">
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </span>
              ) : !notifGranted && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
              )}
            </button>

            {/* Profile Avatar & Dropdown Menu (Pengaturan & Pindah Akun) */}
            <div className="relative">
              <div 
                onClick={() => setShowProfileMenu(prev => !prev)}
                className="flex items-center gap-3 pl-1 border-l border-slate-200 cursor-pointer group"
                title="Menu Profil"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">{studentData?.nama_lengkap}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kelas {studentData?.kelas}</p>
                </div>
                <div className="w-9 h-9 rounded-full border border-slate-200 bg-slate-50 shadow-sm overflow-hidden flex items-center justify-center font-bold text-slate-500 shrink-0 group-hover:border-indigo-400 group-hover:ring-2 group-hover:ring-indigo-100 transition-all">
                  {photoUrls[photoIndex] ? (
                    <img 
                      src={photoUrls[photoIndex]} 
                      alt={studentData?.nama_lengkap} 
                      className="w-full h-full object-cover"
                      onError={() => {
                        if (photoIndex < photoUrls.length - 1) {
                          setPhotoIndex(prev => prev + 1)
                        }
                      }}
                    />
                  ) : (
                    <span className="text-xs font-bold">{studentData?.nama_lengkap?.charAt(0) || 'S'}</span>
                  )}
                </div>
              </div>

              {/* Profile Dropdown Popup */}
              {showProfileMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fade-in">
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-800 truncate">{studentData?.nama_lengkap}</p>
                      <p className="text-[10px] text-slate-400 font-mono">NISN: {studentData?.nisn || '-'}</p>
                    </div>

                    <div className="p-1 space-y-0.5">
                      <button
                        onClick={() => {
                          setSelectedType('PENGATURAN')
                          setShowProfileMenu(false)
                        }}
                        className="w-full px-3 py-2.5 rounded-xl text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        <span>Pengaturan</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowAccountSwitcher(true)
                          setShowProfileMenu(false)
                        }}
                        className="w-full px-3 py-2.5 rounded-xl text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>Pindah Akun</span>
                      </button>
                    </div>

                    <div className="p-1 border-t border-slate-100 mt-1">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false)
                          handleLogout()
                        }}
                        className="w-full px-3 py-2.5 rounded-xl text-left text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2.5"
                      >
                        <svg className="w-4 h-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        <span>Keluar</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="w-full space-y-6">
            
            {/* Banner Peringatan Biodata Orang Tua belum lengkap */}
            {biodataWarningBanner}
            
            {/* Header Minimalis khusus Menu Spesifik */}
            {selectedType && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 animate-fade-in">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight truncate">
                    {currentMenuLabel}
                  </h1>
                  <p className="text-sm text-slate-500 font-medium mt-1 truncate">
                    Dashboard Siswa • <span className="font-bold text-slate-700">{studentData?.nama_lengkap}</span> ({studentData?.kelas})
                  </p>
                </div>

                <button
                  onClick={() => setSelectedType(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto"
                >
                  <span>←</span> <span>Kembali ke Beranda</span>
                </button>
              </div>
            )}

            {/* Kartu Profil & Beranda Utama (!selectedType) */}
            {!selectedType && (
              <>
                {studentInfoCard}

                {/* Widget Kehadiran & Dashboard Siswa (Paling Atas) */}
                <SiswaDashboardWidgets 
                  studentData={studentData} 
                  menuTypes={menuTypes} 
                  onNavigate={setSelectedType} 
                  showFeatureConfig={showFeatureConfig}
                />

                {/* List Catatan Poin Positif & Negatif Siswa di Beranda (Simpel Menurut Katalog) */}
                {showFeatureConfig.poin && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    {/* Card Header Simpel */}
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base">
                          ⭐
                        </span>
                        <div>
                          <h3 className="font-extrabold text-slate-800 text-base">Catatan Poin Siswa</h3>
                          <p className="text-xs text-slate-400">Daftar riwayat penghargaan &amp; kedisiplinan semester ini</p>
                        </div>
                      </div>

                      {/* Filter Tabs Simpel */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                          <button
                            onClick={() => setBerandaPointTab('semua')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${berandaPointTab === 'semua' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Semua ({berandaPointRecords.length})
                          </button>
                          <button
                            onClick={() => setBerandaPointTab('positif')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${berandaPointTab === 'positif' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'}`}
                          >
                            🟢 Positif ({berandaPointRecords.filter(r => (r.poin_diberikan || 0) > 0).length})
                          </button>
                          <button
                            onClick={() => setBerandaPointTab('negatif')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${berandaPointTab === 'negatif' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'}`}
                          >
                            🔴 Pelanggaran ({berandaPointRecords.filter(r => (r.poin_diberikan || 0) < 0).length})
                          </button>
                        </div>

                        <button
                          onClick={() => setSelectedType('AJUKAN_POIN')}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1"
                        >
                          <span>+</span> Ajukan Poin
                        </button>
                      </div>
                    </div>

                    {/* List Poin Records Simpel */}
                    <div className="p-4 sm:p-6">
                      {loadingBerandaPoints ? (
                        <div className="py-8 text-center text-slate-400 text-xs">Memuat catatan poin...</div>
                      ) : berandaPointRecords.filter(r => {
                          if (berandaPointTab === 'positif') return (r.poin_diberikan || 0) > 0
                          if (berandaPointTab === 'negatif') return (r.poin_diberikan || 0) < 0
                          return true
                        }).length === 0 ? (
                        <div className="py-8 text-center flex flex-col items-center justify-center text-slate-400">
                          <span className="text-2xl mb-1">🎉</span>
                          <p className="text-xs font-semibold text-slate-600">Belum ada catatan {berandaPointTab === 'positif' ? 'poin positif' : berandaPointTab === 'negatif' ? 'pelanggaran' : 'poin'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Pertahankan kedisiplinan dan raih poin prestasi!</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {berandaPointRecords
                            .filter(r => {
                              if (berandaPointTab === 'positif') return (r.poin_diberikan || 0) > 0
                              if (berandaPointTab === 'negatif') return (r.poin_diberikan || 0) < 0
                              return true
                            })
                            .map(rec => {
                              const isPlus = (rec.poin_diberikan || 0) > 0
                              const formattedDate = rec.tanggal ? new Date(rec.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
                              return (
                                <div key={rec.id} className="py-3 flex items-start justify-between gap-3 hover:bg-slate-50/60 px-2 rounded-xl transition-colors">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${isPlus ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                                      {isPlus ? `+${rec.poin_diberikan}` : rec.poin_diberikan}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-xs sm:text-sm text-slate-800 truncate">{rec.jenis || 'Catatan Poin'}</p>
                                      {rec.keterangan && (
                                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{rec.keterangan}</p>
                                      )}
                                      <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center gap-2 flex-wrap">
                                        <span>📅 {formattedDate}</span>
                                        {rec.dicatat_oleh && (
                                          <span>• ✍️ Oleh: <strong className="text-slate-600">{rec.dicatat_oleh}</strong></span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Konten Spesifik per Menu */}
            {selectedType === 'INPUT_TABUNGAN' ? (
              <BendaharaInputTabunganSection 
                studentData={studentData}
                bendaharaKelas={bendaharaKelas}
                activeTa={{ id: studentData?.tahun_ajaran_id }}
              />
            ) : selectedType === 'TABUNGAN' ? (
              <TabunganSiswaSection 
                session={null}
                activeTa={{ id: studentData?.tahun_ajaran_id }}
                mode="siswa"
                studentData={studentData}
              />
            ) : selectedType === 'NILAI' ? (
              <SiswaNilaiSection studentData={studentData} />
            ) : selectedType === 'PRESENSI' ? (
              <SiswaPresensiSection studentData={studentData} />
            ) : selectedType === 'POIN' ? (
              <SiswaPoinSection 
                siswaNisn={studentData?.nisn} 
                activeTa={{ id: studentData?.tahun_ajaran_id }} 
                showTabPoinSaya={true}
                showPoinTotal={false}
                showPoinNegatif={true}
                showPoinPositif={true}
                showTabLeaderboard={false}
                showTabTataTertib={true}
                showTabKatalog={true}
                showPointRecords={true}
              />
            ) : selectedType === 'JADWAL' ? (
              <SiswaJadwalSection 
                kelas={studentData?.kelas}
                activeTa={{ id: studentData?.tahun_ajaran_id }}
                semester={showFeatureConfig.jadwalSemester}
              />
            ) : selectedType === 'KALENDER' ? (
              <ProgramSekolahSection session={null} isAdmin={false} activeTa={{ id: studentData?.tahun_ajaran_id, nama: studentData?.tahun_ajaran }} />
            ) : selectedType === 'KONSULTASI_BK' ? (
              <SiswaBKKonsultasiSection studentData={studentData} />
            ) : selectedType === 'AJUKAN_POIN' ? (
              <SiswaPengajuanPoinSection 
                studentData={studentData} 
                activeTa={{ id: studentData?.tahun_ajaran_id, nama: studentData?.tahun_ajaran }} 
              />
            ) : selectedType === 'KARTU_PELAJAR' ? (
              <SiswaKartuPelajarSection 
                studentData={studentData} 
                photoUrls={photoUrls} 
                onUpdateStudentData={(updated) => {
                  setStudentData(updated)
                  try {
                    localStorage.setItem('siswa_session', JSON.stringify(updated))
                  } catch (e) {
                    console.warn('Gagal menyimpan pembaruan profil siswa ke storage:', e)
                  }
                }}
              />
            ) : selectedType === 'PROFIL' ? (
              <SiswaProfilSection studentData={studentData} menuTypes={menuTypes} onOpenEditBiodata={handleOpenEditBiodata} />
            ) : selectedType === 'PENGATURAN' ? (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fade-in">
                  <h2 className="text-xl font-bold text-slate-800">Pengaturan Portal</h2>
                  <p className="text-xs text-slate-500 mt-1">Sesuaikan preferensi tampilan, kontak orang tua, kode akses, dan notifikasi Anda di sini.</p>
                </div>

                {/* Card Kontak WhatsApp Siswa */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        Nomor WhatsApp / HP Siswa
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Nomor kontak pribadi siswa untuk keperluan komunikasi dan informasi sekolah.</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenEditSiswaPhone}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-emerald-100 flex items-center justify-center gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      <span>{studentData?.no_whatsapp ? 'Ubah Nomor Siswa' : '+ Isi Nomor Siswa'}</span>
                    </button>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-md">
                          Siswa
                        </span>
                        <span className="text-xs font-bold text-slate-700 truncate">{studentData?.nama_lengkap}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 font-mono mt-1">
                        {studentData?.no_whatsapp || <span className="text-slate-400 font-normal italic text-xs">Belum diisi</span>}
                      </p>
                    </div>
                    {studentData?.no_whatsapp && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shrink-0">
                        Aktif
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Kontak Orang Tua / Wali */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        Kontak Orang Tua / Wali
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Daftar nomor WhatsApp / HP orang tua untuk menerima laporan presensi otomatis.</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenEditBiodata}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-indigo-100 flex items-center justify-center gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                      <span>Tambah / Kelola Kontak Ortu</span>
                    </button>
                  </div>

                  {/* List Kontak Tersimpan */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Array.isArray(studentData.kontak_ortu) && studentData.kontak_ortu.length > 0 ? (
                      studentData.kontak_ortu.map((k, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-md">
                                {k.tag || 'Orang Tua'}
                              </span>
                              {k.nama && <span className="text-xs font-bold text-slate-700 truncate">{k.nama}</span>}
                            </div>
                            <p className="text-sm font-bold text-slate-900 font-mono mt-1">{k.nomor}</p>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shrink-0">
                            Aktif
                          </span>
                        </div>
                      ))
                    ) : studentData.no_hp_ortu ? (
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-md">
                              Orang Tua
                            </span>
                            {studentData.nama_ortu && <span className="text-xs font-bold text-slate-700 truncate">{studentData.nama_ortu}</span>}
                          </div>
                          <p className="text-sm font-bold text-slate-900 font-mono mt-1">{studentData.no_hp_ortu}</p>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shrink-0">
                          Aktif
                        </span>
                      </div>
                    ) : (
                      <div className="sm:col-span-2 p-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center">
                        <p className="text-xs text-slate-500 font-medium mb-3">Belum ada nomor HP orang tua yang tersimpan.</p>
                        <button
                          type="button"
                          onClick={handleOpenEditBiodata}
                          className="px-4 py-2 bg-white hover:bg-slate-100 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          <span>+ Lengkapi Kontak Ortu Sekarang</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card 1: Ganti Font */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between animate-fade-in">
                    <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                        Preferensi Font
                      </h3>
                      <p className="text-xs text-slate-500 mb-4">Pilih jenis font yang nyaman untuk membaca isi portal.</p>
                      
                      <div className="space-y-2">
                        {[
                          { id: 'jakarta', label: 'Plus Jakarta Sans (Default)' },
                          { id: 'ubuntu', label: 'Ubuntu' },
                          { id: 'bricolage', label: 'Bricolage Grotesque' }
                        ].map(f => (
                          <label key={f.id} className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${currentFont === f.id ? 'bg-indigo-50 border-indigo-300 font-semibold text-indigo-900' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                            <span className="text-xs">{f.label}</span>
                            <input 
                              type="radio" 
                              name="app-font-setting" 
                              checked={currentFont === f.id} 
                              onChange={() => setCurrentFont(f.id)} 
                              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Ubah Kode Akses */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      Ubah Kode Akses
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">Ganti kode akses (password) masuk Anda untuk meningkatkan keamanan akun.</p>
                    
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      {passwordSuccess ? (
                        <div className="bg-green-50 text-green-700 p-4 rounded-xl text-xs text-center font-bold border border-green-200">
                          Kode Akses berhasil diubah.
                        </div>
                      ) : (
                        <>
                          {passwordError && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-bold border border-red-200">
                              {passwordError}
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase">Kode Akses Lama</label>
                            <input type="password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase">Kode Akses Baru</label>
                            <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
                          </div>
                          <button type="submit" disabled={isChangingPassword}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
                            {isChangingPassword ? 'Menyimpan...' : 'Simpan Perubahan'}
                          </button>
                        </>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            ) : selectedType ? (
              <div className="space-y-6">
                
                {/* Status Dokumen & Prasyarat Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in transition-all duration-300">
                  <div 
                    onClick={() => setIsStatusExpanded(!isStatusExpanded)}
                    className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        Status Dokumen
                      </h3>
                      {!isStatusExpanded && (
                        <p className="text-xs font-semibold text-slate-500">
                          {studentBerkas?.file_url && studentBerkas.file_url !== '-' ? 'DOKUMEN TERSEDIA' : 'DOKUMEN BELUM DIUNGGAH'} | {' '}
                          <span className={!accessBlocked && !error && pdfUrl ? 'text-green-600' : 'text-red-500'}>
                            {!accessBlocked && !error && pdfUrl ? 'AKSES TERBUKA' : 'AKSES TERTUTUP'}
                          </span>{' '}
                          &mdash; <span className="text-indigo-500">KLIK UNTUK DETAIL</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isStatusExpanded && (
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${!accessBlocked && !error && pdfUrl ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                          {!accessBlocked && !error && pdfUrl ? 'AKSES TERBUKA' : 'AKSES TERTUTUP'}
                        </span>
                      )}
                      <svg className={`w-5 h-5 text-slate-500 transform transition-transform duration-300 ${isStatusExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                  </div>
                  
                  {isStatusExpanded && (
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Kolom Status Ketersediaan File */}
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Ketersediaan File</p>
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${studentBerkas?.file_url && studentBerkas.file_url !== '-' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                              {studentBerkas?.file_url && studentBerkas.file_url !== '-' ? (
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                              ) : (
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-lg mb-0.5">
                                {studentBerkas?.file_url && studentBerkas.file_url !== '-' ? 'Dokumen Tersedia' : 'Dokumen Belum Diunggah'}
                              </p>
                              <p className="text-sm text-slate-500 leading-relaxed">
                                {studentBerkas?.file_url && studentBerkas.file_url !== '-' 
                                  ? 'File dokumen/pengumuman resmi Anda sudah diunggah oleh pihak sekolah.' 
                                  : 'Pihak sekolah belum mengunggah file dokumen untuk Anda. Silakan tunggu.'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Kolom Prasyarat Akses */}
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Prasyarat Akses</p>
                          {!selectedType.persyaratan || selectedType.persyaratan.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                              Tidak ada prasyarat khusus untuk dokumen ini.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {selectedType.persyaratan.map((req, idx) => {
                                const isMet = studentBerkas?.persyaratan_terpenuhi?.[req.id]
                                return (
                                  <div key={req.id} className={`flex items-start gap-3 p-3 rounded-xl border ${isMet ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}>
                                    <div className={`mt-0.5 shrink-0 ${isMet ? 'text-green-500' : 'text-red-400'}`}>
                                      {isMet ? (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                      ) : (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                      )}
                                    </div>
                                    <div>
                                      <p className={`text-sm font-bold ${isMet ? 'text-green-800' : 'text-red-800'}`}>{idx + 1}. {req.nama}</p>
                                      {!isMet && req.info_gagal && (
                                        <p className="text-xs text-red-600 mt-1 leading-relaxed">{req.info_gagal}</p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {accessBlocked && (
                  <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-amber-800 mb-1">Akses Belum Dibuka</h3>
                        <p className="text-sm text-amber-700 leading-relaxed">Akses untuk dokumen <strong>{selectedType.nama}</strong> belum diaktifkan oleh admin. Silakan tunggu informasi resmi dari pihak sekolah.</p>
                      </div>
                    </div>
                  </div>
                )}

                {!accessBlocked && error && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      {error === 'Akses ditangguhkan. Cek Prasyarat Akses.' && studentBerkas?.file_url && studentBerkas.file_url !== '-' ? (
                        <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      ) : (
                        <svg className="w-8 h-8 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">
                      {error === 'Akses ditangguhkan. Cek Prasyarat Akses.' && studentBerkas?.file_url && studentBerkas.file_url !== '-'
                        ? 'Akses Dokumen Ditangguhkan'
                        : 'Dokumen Belum Tersedia'}
                    </h3>
                    <p className="text-slate-500 max-w-lg mx-auto whitespace-pre-line text-center">{error}</p>
                  </div>
                )}

                {!accessBlocked && !error && pdfUrl && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">{selectedType.nama}</h3>
                        <p className="text-sm text-slate-500 mt-1">Dokumen resmi terenkripsi</p>
                      </div>
                      <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                        onClick={() => {
                          logActivity({
                            userRole: 'Siswa',
                            action: 'Unduh Dokumen',
                            details: `Siswa ${studentData?.nama_lengkap} membuka/mengunduh dokumen ${selectedType.nama}.`
                          })
                        }}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm shrink-0">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Buka / Unduh Full
                      </a>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                      <iframe
                        src={pdfUrl}
                        width="100%"
                        height="600px"
                        className="w-full border-0"
                        title={selectedType.nama}
                        onError={() => setError('Gagal memuat dokumen.')}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}


          </div>
        </div>
      </div>



      {/* Panel Notifikasi Slide-in */}
      <SiswaNotificationPanel 
        isOpen={showNotifPanel} 
        onClose={() => setShowNotifPanel(false)} 
        studentData={studentData}
        onNavigateMenu={(menuKey) => {
          setSelectedType(menuKey)
          setShowNotifPanel(false)
        }}
      />

      {/* Modal Kelola Kontak Orang Tua (Dropdown Hubungan & Kontak Tersimpan di Bawah) */}
      {showEditBiodataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">Kelola Kontak Orang Tua</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tambah nomor Ayah, Ibu, atau Wali untuk laporan presensi</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowEditBiodataModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              {biodataSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-xl text-xs font-bold text-center animate-fade-in">
                  Kontak orang tua berhasil disimpan.
                </div>
              )}

              {biodataError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-xs font-medium">
                  {biodataError}
                </div>
              )}

              {/* Form Input Kontak Baru */}
              <form onSubmit={handleSaveSingleKontak} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Tambah / Update Kontak</p>

                {/* Dropdown Hubungan */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Hubungan
                  </label>
                  <select
                    value={inputKontak.tag}
                    onChange={(e) => setInputKontak({ ...inputKontak, tag: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  >
                    <option value="Ayah">Ayah</option>
                    <option value="Ibu">Ibu</option>
                    <option value="Wali">Wali</option>
                    <option value="Orang Tua">Orang Tua</option>
                  </select>
                </div>

                {/* Input Nomor HP / WhatsApp */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Nomor WhatsApp / HP <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={inputKontak.nomor}
                    onChange={(e) => setInputKontak({ ...inputKontak, nomor: e.target.value })}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  />
                </div>

                {/* Input Nama (Opsional) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Nama <span className="font-normal">(Opsional)</span>
                  </label>
                  <input
                    type="text"
                    value={inputKontak.nama}
                    onChange={(e) => setInputKontak({ ...inputKontak, nama: e.target.value })}
                    placeholder="Contoh: Nama Orang Tua"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingBiodata}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSavingBiodata ? 'Menyimpan...' : '+ Simpan Kontak'}
                </button>
              </form>

              {/* Daftar Kontak Tersimpan di Bagian Bawah */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Kontak Tersimpan ({getSavedKontakList().length})
                  </span>
                </div>

                {getSavedKontakList().length > 0 ? (
                  <div className="space-y-2">
                    {getSavedKontakList().map((k, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-md">
                              {k.tag || 'Orang Tua'}
                            </span>
                            {k.nama && <span className="text-xs font-bold text-slate-700 truncate">({k.nama})</span>}
                          </div>
                          <p className="text-xs font-bold text-slate-900 font-mono mt-1">{k.nomor}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSavedKontak(idx)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-bold p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Hapus Kontak"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-center">
                    <p className="text-xs text-slate-400 font-medium">Belum ada kontak yang tersimpan.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowEditBiodataModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Nomor WhatsApp Siswa */}
      {showEditPhoneSiswaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">Nomor WhatsApp Siswa</h3>
                <p className="text-xs text-slate-500 mt-0.5">Perbarui nomor kontak pribadi siswa</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowEditPhoneSiswaModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveSiswaPhone} className="p-6 space-y-4">
              {siswaPhoneSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-3.5 rounded-xl text-xs font-bold text-center animate-fade-in">
                  Nomor WhatsApp siswa berhasil disimpan.
                </div>
              )}

              {siswaPhoneError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-xs font-medium">
                  {siswaPhoneError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nomor WhatsApp Siswa
                </label>
                <input
                  type="tel"
                  value={inputSiswaPhone}
                  onChange={(e) => setInputSiswaPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">Kosongkan jika siswa tidak memiliki nomor WhatsApp pribadi.</p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditPhoneSiswaModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingSiswaPhone}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-emerald-100 disabled:opacity-50"
                >
                  {isSavingSiswaPhone ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Instagram-style Multi-Account Switcher Modal */}
      <MultiAccountSwitcherModal
        isOpen={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        currentAccountName={studentData?.nama_lengkap}
        currentUsername={studentData?.nisn}
        currentRole="Siswa"
      />
    </div>
  )
}

export default Dashboard
