import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { requestNotifPermission, showLocalNotif, isNotifGranted, subscribeToPushNotification, requestAllInitialPermissions, initNativePushNotifications } from '../utils/pushNotif'
import SiswaNilaiSection from '../components/SiswaNilaiSection'
import SiswaPresensiSection from '../components/SiswaPresensiSection'
import SiswaDashboardWidgets from '../components/SiswaDashboardWidgets'
import SiswaProfilSection from '../components/SiswaProfilSection'
import SiswaNotificationPanel from '../components/SiswaNotificationPanel'
import SiswaPoinSection from '../components/SiswaPoinSection'
import SiswaRiwayatPresensi from '../components/SiswaRiwayatPresensi'
import ProgramSekolahSection from '../components/ProgramSekolahSection'
import SiswaJadwalSection from '../components/SiswaJadwalSection'
import TabunganSiswaSection from '../components/TabunganSiswaSection'
import OrangTuaTagihanSection from '../components/OrangTuaTagihanSection'
import MultiAccountSwitcherModal from '../components/MultiAccountSwitcherModal'
import { sendLinePushNotification, createBindingSuccessFlexMessage } from '../utils/lineNotifier'

function DashboardOrangTua() {
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(() => {
    try {
      const raw = localStorage.getItem('orangtua_session') || localStorage.getItem('siswa_session')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(() => {
    const raw = localStorage.getItem('orangtua_session') || localStorage.getItem('siswa_session')
    return !raw
  })
  const [menuTypes, setMenuTypes] = useState([])
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)

  useEffect(() => {
    // Orang tua HANYA memerlukan izin notifikasi (tidak perlu kamera atau lokasi)
    requestNotifPermission().catch(() => {})
  }, [])
  
  // Sidebar state for mobile and desktop collapse
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // Default to collapsed as requested
  
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

  // State Profile Menu Dropdown & Poin Siswa di Beranda
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [berandaPointRecords, setBerandaPointRecords] = useState([])
  const [berandaStudentPoints, setBerandaStudentPoints] = useState(null)
  const [loadingBerandaPoints, setLoadingBerandaPoints] = useState(false)
  const [berandaPointTab, setBerandaPointTab] = useState('semua') // 'semua' | 'positif' | 'negatif'

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showPengaturanModal, setShowPengaturanModal] = useState(false)

  // Edit Biodata Modal for Orang Tua
  const [showEditBiodataModal, setShowEditBiodataModal] = useState(false)
  const [inputKontak, setInputKontak] = useState({ tag: 'Ayah', nomor: '', nama: '' })
  const [isSavingBiodata, setIsSavingBiodata] = useState(false)
  const [biodataError, setBiodataError] = useState('')
  const [biodataSuccess, setBiodataSuccess] = useState(false)

  // LINE Notification Binding state
  const [showLineBindingModal, setShowLineBindingModal] = useState(false)
  const [lineIdInput, setLineIdInput] = useState('')
  const [isSavingLine, setIsSavingLine] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  const handleCopyLineCommand = (textToCopy) => {
    if (!textToCopy) return
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2500)
      }).catch(() => {
        fallbackCopyText(textToCopy)
      })
    } else {
      fallbackCopyText(textToCopy)
    }
  }

  const fallbackCopyText = (text) => {
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2500)
  }


  const handleSaveLineBinding = async (idToSave) => {
    if (!studentData?.nisn) return
    setIsSavingLine(true)
    try {
      if (idToSave && idToSave.trim()) {
        // TAUTKAN AKUN LINE
        const cleanId = idToSave.trim()
        await supabase
          .from('line_bindings')
          .upsert(
            { nisn: studentData.nisn, line_user_id: cleanId, updated_at: new Date().toISOString() },
            { onConflict: 'nisn' }
          )

        await supabase
          .from('siswa_permanent')
          .update({ line_user_id: cleanId })
          .eq('nisn', studentData.nisn)

        const updated = { ...studentData, line_user_id: cleanId }
        setStudentData(updated)
        localStorage.setItem('orangtua_session', JSON.stringify(updated))

        // Kirim konfirmasi penautan ke akun LINE
        try {
          const flexMsg = createBindingSuccessFlexMessage({
            nama: studentData.nama_lengkap || studentData.nama || 'Siswa',
            kelas: studentData.kelas || '-',
            nisn: studentData.nisn
          })
          await sendLinePushNotification({ lineUserId: cleanId, flexMessage: flexMsg })
        } catch (e) {
          console.warn('[LINE] Gagal kirim notif konfirmasi:', e)
        }

        alert('Akun LINE berhasil ditautkan! Notifikasi presensi otomatis aktif.')
        setShowLineBindingModal(false)
      } else {
        // PUTUSKAN TAUTAN AKUN LINE
        const oldLineUserId = studentData.line_user_id

        // 1. Kirim pesan notifikasi pemutusan ke LINE jika ada LINE User ID sebelumnya
        if (oldLineUserId) {
          try {
            await sendLinePushNotification({
              lineUserId: oldLineUserId,
              flexMessage: {
                type: 'text',
                text: `ℹ️ Tautan akun LINE Anda dengan siswa ${studentData.nama_lengkap || studentData.nama} (NISN: ${studentData.nisn}) telah diputuskan dari portal sekolah.`
              }
            })
          } catch (e) {
            console.warn('[LINE] Gagal kirim notif pemutusan ke LINE:', e)
          }
        }

        // 2. Hapus dari tabel line_bindings secara permanen
        await supabase
          .from('line_bindings')
          .delete()
          .eq('nisn', studentData.nisn)

        // 3. Reset line_user_id di siswa_permanent menjadi null
        await supabase
          .from('siswa_permanent')
          .update({ line_user_id: null })
          .eq('nisn', studentData.nisn)

        const updated = { ...studentData, line_user_id: null }
        setStudentData(updated)
        localStorage.setItem('orangtua_session', JSON.stringify(updated))
        alert('Tautan akun LINE telah berhasil dilepas.')
        setShowLineBindingModal(false)
      }
    } catch (err) {
      console.error('Error line binding:', err)
      alert('Gagal memperbarui tautan LINE.')
    } finally {
      setIsSavingLine(false)
    }
  }

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

  const [pengumuman, setPengumuman] = useState('')
  const [linkGrupOrtu, setLinkGrupOrtu] = useState('')
  const [loggedTypes, setLoggedTypes] = useState([])

  // Notifikasi presensi anak (realtime)
  const [presensiToast, setPresensiToast] = useState(null) // { namaLengkap, status, statusLabel, waktu, tipe, tipeLabel, tanggal, selfieUrl }
  const [notifOrtuGranted, setNotifOrtuGranted] = useState(isNotifGranted())

  // Helper: daftarkan push subscription orang tua ke Supabase
  const registerOrtuPushSubscription = async (nisn) => {
    try {
      const sub = await subscribeToPushNotification()
      if (!sub) return
      const endpointUrl = sub.endpoint
      // Hapus subscription lama dengan endpoint yang sama
      if (endpointUrl) {
        await supabase.from('push_subscriptions_ortu')
          .delete()
          .filter('subscription->>endpoint', 'eq', endpointUrl)
      }
      await supabase.from('push_subscriptions_ortu').upsert({
        nisn_anak: nisn,
        subscription: sub.toJSON()
      }, { onConflict: 'nisn_anak' })
    } catch (err) {
      console.warn('[Ortu Push] Gagal daftar subscription:', err)
    }
  }

  const [currentFont, setCurrentFont] = useState(() => {
    return localStorage.getItem('app_font') || 'jakarta'
  })

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
    kalender: true,
    jadwal: true,
    tagihan: true,
    tabunganOrtuSiswa: true,
    tabunganWaliKelas: true,
    jadwalSemester: '2'
  })

  const init = useCallback(async () => {
    try {
      const raw = localStorage.getItem('orangtua_session') || localStorage.getItem('siswa_session')
      if (!raw) {
        setLoading(false)
        navigate('/')
        return
      }
      let data = null
      try {
        data = JSON.parse(raw)
      } catch (e) {
        console.error("Invalid orangtua session JSON:", e)
        localStorage.removeItem('orangtua_session')
        setLoading(false)
        navigate('/')
        return
      }
      
      // Set session data immediately so layout loads without waiting
      setStudentData(data)
      
      // Parallelize all initial Supabase queries
      const [
        { data: enrollments },
        { data: activeTaData },
        { data: latestStudentData },
        { data: types },
        { data: pengaturan },
        { data: allFotos }
      ] = await Promise.all([
        supabase.from('enrollment').select('kelas, tahun_ajaran_id, kode').eq('nisn', data.nisn),
        supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).maybeSingle(),
        supabase.from('siswa_permanent').select('*').eq('nisn', data.nisn).maybeSingle(),
        supabase.from('jenis_pengumuman').select('*').neq('visible_orangtua', false).order('urutan'),
        supabase.from('pengaturan_sekolah').select('*'),
        supabase.from('foto').select('cloudinary_url, tahun_ajaran_id').eq('nisn', data.nisn)
      ])

      if (enrollments) data.enrollments = enrollments
      
      if (activeTaData) {
        data.tahun_ajaran_id = activeTaData.id
        data.tahun_ajaran = activeTaData.nama

        const currentEnr = enrollments?.find(e => e.tahun_ajaran_id === activeTaData.id)
        if (currentEnr) {
          data.kelas = currentEnr.kelas
          data.kode = currentEnr.kode
        }
      }

      if (latestStudentData) {
        Object.assign(data, latestStudentData)
        localStorage.setItem('orangtua_session', JSON.stringify(data))
      }

      setStudentData({ ...data })

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
          tagihan: true,
          tabunganOrtuSiswa: true,
          tabunganWaliKelas: true,
          jadwalSemester: '2'
        }
        pengaturan.forEach(p => {
          if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
          if (p.setting_key === 'link_grup_wa_ortu') setLinkGrupOrtu(p.setting_value)
          if (p.setting_key === 'tema_warna') document.documentElement.setAttribute('data-theme', p.setting_value)
          if (p.setting_key === 'show_profile_foto') newShowProfile.foto = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_kelas') newShowProfile.kelas = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nisn') newShowProfile.nisn = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nipd') newShowProfile.nipd = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_presensi') newShowFeature.presensi = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_nilai') newShowFeature.nilai = p.setting_value === 'true'
          if (p.setting_key === 'show_feature_poin') newShowFeature.poin = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_total') newShowFeature.poinTotal = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_negatif') newShowFeature.poinNegatif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_positif') newShowFeature.poinPositif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_leaderboard') newShowFeature.poinLeaderboard = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_tata_tertib') newShowFeature.poinTataTertib = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_katalog') newShowFeature.poinKatalog = p.setting_value === 'true'
          if (p.setting_key === 'show_calendar_siswa') newShowFeature.kalender = p.setting_value === 'true'
          if (p.setting_key === 'show_jadwal_siswa') newShowFeature.jadwal = p.setting_value === 'true'
          if (p.setting_key === 'show_tagihan_ortu') newShowFeature.tagihan = p.setting_value === 'true'
          if (p.setting_key === 'show_tabungan_ortu_siswa') newShowFeature.tabunganOrtuSiswa = p.setting_value === 'true'
          if (p.setting_key === 'show_tabungan_wali_kelas') newShowFeature.tabunganWaliKelas = p.setting_value === 'true'
          if (p.setting_key === 'jadwal_semester_aktif') newShowFeature.jadwalSemester = p.setting_value || '2'
        })
        setShowProfileConfig(newShowProfile)
        setShowFeatureConfig(newShowFeature)
      }
      
      const urls = []
      if (allFotos && allFotos.length > 0) {
        const currentYearFoto = allFotos.find(f => f.tahun_ajaran_id === data.tahun_ajaran_id)
        if (currentYearFoto && currentYearFoto.cloudinary_url) {
          urls.push(currentYearFoto.cloudinary_url)
        }
        
        allFotos.forEach(f => {
          if (f.tahun_ajaran_id !== data.tahun_ajaran_id && f.cloudinary_url) {
            urls.push(f.cloudinary_url)
          }
        })
      }

      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dwyhpysp5'
      if (data.tahun_ajaran_id) {
        urls.push(`https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_300,h_300,g_face/SKL-BM/FOTO_${data.nisn}_${data.tahun_ajaran_id}`)
      }
      urls.push(`https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_300,h_300,g_face/SKL-BM/FOTO_${data.nisn}`)
      
      urls.push(DEFAULT_AVATAR)
      setPhotoUrls(urls)
    } catch (err) {
      console.error('Error during init:', err)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    init()

    const taChannel = supabase.channel(`global-ta-changes-ortu-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tahun_ajaran' }, () => {
        init()
      })
      .subscribe()

    return () => supabase.removeChannel(taChannel)
  }, [init])

  useEffect(() => {
    if (selectedType === 'TABUNGAN' && showFeatureConfig.tabunganOrtuSiswa === false) {
      setSelectedType(null)
    }
  }, [selectedType, showFeatureConfig.tabunganOrtuSiswa])

  const fetchNotifCount = useCallback(async () => {
    if (!studentData?.nisn) return
    try {
      const { data: allNotif } = await supabase.from('notifikasi')
        .select('id, target_kelas, judul, pesan, tipe, created_at')
        .or(`target_nisn.is.null,target_nisn.eq.${studentData.nisn}`)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (!allNotif) return
      const valid = allNotif.filter(n => {
        if (n.target_kelas && n.target_kelas !== studentData.kelas) return false
        // Abaikan notifikasi poin untuk orang tua
        if (n.tipe === 'poin' || n.judul?.toLowerCase().includes('poin') || n.pesan?.toLowerCase().includes('poin')) return false
        return true
      })
      
      const { data: readNotif } = await supabase.from('notifikasi_read')
        .select('notifikasi_id')
        .eq('nisn', studentData.nisn)
        
      const readIds = new Set((readNotif || []).map(r => r.notifikasi_id))
      const unreadCount = valid.filter(n => !readIds.has(n.id)).length
      setUnreadNotifCount(unreadCount)
    } catch (e) {
      console.warn('Error fetching notif count for ortu:', e)
    }
  }, [studentData?.nisn, studentData?.kelas])

  useEffect(() => {
    if (!studentData?.nisn) return
    
    fetchNotifCount()
    
    const notifChannel = supabase.channel(`ortu-notif-realtime-${studentData.nisn}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifikasi' }, (payload) => {
        fetchNotifCount()
        const newNotif = payload.new
        if (newNotif && (!newNotif.target_nisn || newNotif.target_nisn === studentData.nisn)) {
          if (!newNotif.target_kelas || newNotif.target_kelas === studentData.kelas) {
            // Jangan kirim notifikasi poin ke orang tua
            if (newNotif.tipe === 'poin' || newNotif.judul?.toLowerCase().includes('poin') || newNotif.pesan?.toLowerCase().includes('poin')) {
              return
            }
            if (isNotifGranted()) {
              showLocalNotif(newNotif.judul || 'Notifikasi Sekolah', newNotif.pesan || 'Ada notifikasi baru dari pihak sekolah.', {
                tag: `notif-${newNotif.id}`,
                data: { url: '/dashboard-orang-tua', role: 'Orang Tua' }
              })
            }
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifikasi_read', filter: `nisn=eq.${studentData.nisn}` }, fetchNotifCount)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'berita_sekolah' }, (payload) => {
        const newBerita = payload.new
        if (newBerita && newBerita.is_published !== false) {
          if (isNotifGranted()) {
            showLocalNotif(`Pengumuman: ${newBerita.judul}`, newBerita.konten ? newBerita.konten.slice(0, 120) : 'Pengumuman baru telah diterbitkan.', {
              tag: `berita-${newBerita.id}`,
              data: { url: '/dashboard-orang-tua', role: 'Orang Tua' }
            })
          }
        }
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tabungan_transaksi', 
        filter: `siswa_nisn=eq.${studentData.nisn}` 
      }, (payload) => {
        const row = payload.new
        if (!row) return
        if (row.status_verifikasi === 'VERIFIED') {
          // Hindari notifikasi ganda jika old record juga sudah VERIFIED
          if (payload.old && payload.old.status_verifikasi === 'VERIFIED') return
          
          const isSetor = row.tipe === 'SETOR'
          const nominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.jumlah)
          const saldo = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.saldo_akhir)
          const nama = studentData.nama_lengkap || studentData.nama || 'Siswa'
          
          const title = isSetor ? `Setoran Tabungan ${nama}` : `Penarikan Tabungan ${nama}`
          const body = isSetor 
            ? `${nama} telah menabung sebesar ${nominal}. Total tabungan sekarang: ${saldo}.`
            : `Penarikan tabungan sebesar ${nominal} telah berhasil. Total tabungan sekarang: ${saldo}.`
            
          if (isNotifGranted()) {
            showLocalNotif(title, body, {
              tag: `tabungan-${row.id}-${Date.now()}`,
              summaryText: body,
              data: { url: '/dashboard-orang-tua?menu=TABUNGAN', targetMenu: 'TABUNGAN', role: 'Orang Tua' }
            })
          }
        }
      })
      .subscribe()
      
    return () => supabase.removeChannel(notifChannel)
  }, [studentData?.nisn, studentData?.kelas, studentData?.nama_lengkap, studentData?.nama, fetchNotifCount])

  // Realtime listener notifikasi presensi dari anak ke orangtua
  useEffect(() => {
    if (!studentData?.nisn) return
    const channel = supabase.channel(`notif-ortu-${studentData.nisn}`)
      .on('broadcast', { event: 'presensi_update' }, ({ payload }) => {
        setPresensiToast(payload)
        if (isNotifGranted()) {
          const lokasiText = payload.lokasi ? ` Lokasi: ${payload.lokasi}` : ""
          const body = `${payload.namaLengkap} - ${payload.tipeLabel} pukul ${payload.waktu} WIB (${payload.statusLabel}).${lokasiText}`
          showLocalNotif(`Presensi ${payload.tipeLabel} Siswa (${payload.statusLabel} - ${payload.waktu} WIB)`, body, { 
            tag: `presensi-${payload.tipe}-${Date.now()}`,
            image: payload.selfieUrl || undefined,
            summaryText: body,
            data: { url: '/dashboard-orang-tua?menu=PRESENSI', targetMenu: 'PRESENSI', role: 'Orang Tua' }
          })
        }
        setTimeout(() => setPresensiToast(null), 15000)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian', filter: `siswa_nisn=eq.${studentData.nisn}` }, (payload) => {
        const row = payload.new
        if (!row) return
        const tipeLabel = row.tipe === 'pulang' ? 'Pulang' : 'Masuk'
        const statusLabel = row.status === 'H' ? 'Hadir' : row.status === 'T' ? 'Terlambat' : row.status === 'P' ? 'Pulang' : row.status
        const toastObj = {
          namaLengkap: studentData.nama_lengkap,
          tipeLabel,
          waktu: row.waktu,
          statusLabel,
          lokasi: row.keterangan,
          selfieUrl: row.selfie_url
        }
        setPresensiToast(toastObj)
        if (isNotifGranted()) {
          const lokasiText = row.keterangan ? ` Lokasi: ${row.keterangan}` : ""
          const body = `${studentData.nama_lengkap} - ${tipeLabel} pukul ${row.waktu} WIB (${statusLabel}).${lokasiText}`
          showLocalNotif(`Presensi ${tipeLabel} Siswa (${statusLabel} - ${row.waktu} WIB)`, body, { 
            tag: `presensi-${row.tipe}-${row.id}`,
            image: row.selfie_url || undefined,
            summaryText: body,
            data: { url: '/dashboard-orang-tua?menu=PRESENSI', targetMenu: 'PRESENSI', role: 'Orang Tua' }
          })
        }
        setTimeout(() => setPresensiToast(null), 15000)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [studentData?.nisn, studentData?.nama_lengkap])

  // Auto-subscribe to Web Push & Android Native FCM Push for parents
  useEffect(() => {
    if (!studentData?.nisn) return
    initNativePushNotifications({ nisn: studentData.nisn, role: 'Orang Tua' })
    if (notifOrtuGranted) {
      registerOrtuPushSubscription(studentData.nisn)
    }
  }, [notifOrtuGranted, studentData?.nisn])

  useEffect(() => {
    const checkFileExists = async () => {
      if (!selectedType || !studentData || typeof selectedType === 'string') {
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
          details: `Siswa ${studentData.nama_lengkap} membuka dokumen ${selectedType?.nama || 'Dokumen'} di browser.`
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
    if (pdfUrl && selectedType && typeof selectedType === 'object' && studentData && !loggedTypes.includes(selectedType.id)) {
      logActivity({
        userRole: 'Siswa',
        action: 'Unduh Dokumen',
        details: `Siswa ${studentData.nama_lengkap} membuka/mengakses dokumen ${selectedType?.nama || 'Dokumen'}.`
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
        .from('jenis_pengumuman').select('*').neq('visible_orangtua', false).order('urutan')
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
          tagihan: true,
          tabunganOrtuSiswa: true,
          tabunganWaliKelas: true,
          jadwalSemester: '2'
        }
        pengaturan.forEach(p => {
          if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
          if (p.setting_key === 'link_grup_ortu') setLinkGrupOrtu(p.setting_value)
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
          if (p.setting_key === 'show_tagihan_ortu') newShowFeature.tagihan = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_total') newShowFeature.poinTotal = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_negatif') newShowFeature.poinNegatif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_positif') newShowFeature.poinPositif = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_leaderboard') newShowFeature.poinLeaderboard = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_tata_tertib') newShowFeature.poinTataTertib = p.setting_value === 'true'
          if (p.setting_key === 'show_poin_katalog') newShowFeature.poinKatalog = p.setting_value === 'true'
          if (p.setting_key === 'show_calendar_ortu') newShowFeature.kalender = p.setting_value === 'true'
          if (p.setting_key === 'show_jadwal_ortu') newShowFeature.jadwal = p.setting_value === 'true'
          if (p.setting_key === 'jadwal_semester_aktif') newShowFeature.jadwalSemester = p.setting_value || '2'
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
    let clean = String(phone).replace(/\D/g, '')
    if (clean.startsWith('6208')) {
      clean = '628' + clean.substring(4)
    } else if (clean.startsWith('08')) {
      clean = '628' + clean.substring(2)
    } else if (clean.startsWith('8')) {
      clean = '628' + clean.substring(1)
    }
    return clean
  }

  const handleOpenEditBiodata = () => {
    setInputKontak({ tag: 'Ayah', nomor: '', nama: '' })
    setBiodataError('')
    setBiodataSuccess(false)
    setShowEditBiodataModal(true)
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
            nama_ortu: primaryName,
            no_hp_ortu: primaryPhone
          })
          .eq('nisn', studentData.nisn)

        if (error) throw error
      }

      const updatedData = { 
        ...studentData, 
        kontak_ortu: list,
        nama_ortu: primaryName,
        no_hp_ortu: primaryPhone
      }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      setBiodataSuccess(true)
      setTimeout(() => setBiodataSuccess(false), 2000)
      return true
    } catch (err) {
      console.error('Error saving kontak in DashboardOrangTua:', err)
      setBiodataError('Terjadi kesalahan saat menyimpan kontak.')
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

  // Tampilan Menu Siswa (Opsional / Per Pengumuman)
  const showNisnMenu = selectedType ? selectedType.show_nisn : false
  const showNipdMenu = selectedType ? selectedType.show_nipd : false
  const showTahunLulusMenu = selectedType ? selectedType.show_tahun_lulus : false

  // Either global profile wants it shown OR the current menu type specifically wants it shown
  const isNisnVisible = showProfileConfig.nisn || showNisnMenu
  const isNipdVisible = showProfileConfig.nipd || showNipdMenu

  const sapaanHeader = studentData?.nama_ortu 
    ? `Selamat datang, ${studentData.nama_ortu} orangtua dari ${studentData.nama_lengkap || studentData?.nama}` 
    : `Selamat datang, Bapak/Ibu orangtua dari ${studentData?.nama_lengkap || studentData?.nama}`;

  const currentMenuLabel = 
    selectedType === 'TAGIHAN' ? 'Status Tagihan & SPP' :
    selectedType === 'TABUNGAN' ? 'Tabungan Siswa' : 
    selectedType === 'NILAI' ? 'Laporan Nilai Anak' : 
    selectedType === 'PRESENSI' ? 'Riwayat Presensi' : 
    selectedType === 'POIN' ? 'Poin & Kedisiplinan' : 
    selectedType === 'JADWAL' ? 'Jadwal Pelajaran' : 
    selectedType === 'KALENDER' ? 'Kalender Akademik' : 
    selectedType === 'PENGATURAN' ? 'Pengaturan Portal' : 
    selectedType === 'PROFIL' ? 'Profil Siswa' :
    selectedType?.nama || 'Dokumen Siswa'

  const isBiodataLengkap = Boolean(
    studentData && (
      (Array.isArray(studentData.kontak_ortu) && studentData.kontak_ortu.length > 0) ||
      studentData.no_hp_ortu ||
      studentData.nama_ortu
    )
  )

  const biodataWarningBanner = studentData && !isBiodataLengkap && (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 animate-fade-in shadow-sm">
      <div className="flex items-start gap-3">
        <span className="p-2 bg-amber-100 text-amber-800 rounded-lg mt-0.5 sm:mt-0 shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </span>
        <div>
          <h4 className="text-sm font-bold text-amber-900">Penting: Lengkapi Biodata Orang Tua!</h4>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Mohon isi <strong>Nama</strong>, <strong>Nomor HP / WhatsApp</strong>, dan <strong>Email</strong> Bapak/Ibu pada biodata agar sekolah dapat mengirimkan informasi penting secara tepat.
          </p>
        </div>
      </div>
      <button
        onClick={() => handleOpenEditBiodata()}
        className="px-4.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shrink-0 uppercase tracking-wider"
      >
        Lengkapi Sekarang
      </button>
    </div>
  )

  const lineNotifWidgetCard = studentData && (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-md">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-sm">Notifikasi Presensi LINE</h4>
            {studentData.line_user_id ? (
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                TERHUBUNG
              </span>
            ) : (
              <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300">
                BELUM TERHUBUNG
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            {studentData.line_user_id
              ? `Akun LINE Anda (${studentData.line_user_id}) aktif menerima kartu presensi otomatis.`
              : `Dapatkan kartu notifikasi presensi otomatis di aplikasi LINE HP Anda saat anak tiba/pulang sekolah.`}
          </p>
          {!studentData.line_user_id && (
            <div className="mt-2 text-[11px] text-emerald-900 bg-white/70 border border-emerald-200 rounded-xl p-2.5 space-y-1.5">
              <p className="font-bold text-slate-800">Metode 2 (Chat Auto-Binding Bot):</p>
              <p>Add LINE sekolah <strong>@499koywa</strong>, lalu kirim chat:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="bg-emerald-100 px-2 py-1 rounded font-mono font-bold text-emerald-900 text-xs border border-emerald-300 select-all">
                  TAUTKAN {studentData.nisn} {studentData.ortu_password || studentData.kode_akses || ''}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyLineCommand(`TAUTKAN ${studentData.nisn} ${studentData.ortu_password || studentData.kode_akses || ''}`.trim())}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1 shrink-0"
                  title="Salin teks perintah ini"
                >
                  <span>{copySuccess ? 'Tersalin' : 'Salin Perintah'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {studentData.line_user_id ? (
          <button
            onClick={() => handleSaveLineBinding(null)}
            disabled={isSavingLine}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-sm"
          >
            Putuskan Tautan
          </button>
        ) : (
          <button
            onClick={() => {
              setLineIdInput(studentData.line_user_id || '')
              setShowLineBindingModal(true)
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5"
          >
            <span>Tautkan LINE (1-Click)</span>
          </button>
        )}
      </div>
    </div>
  )

  const studentInfoCard = studentData && (
    <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden animate-slide-up mb-6">
      <div className="relative z-10 space-y-3.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-snug">
            Selamat Datang, Bapak/Ibu!
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {linkGrupOrtu && (
              <a 
                href={linkGrupOrtu} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 font-extrabold text-xs px-3 py-1.5 rounded-xl border border-emerald-400/40 shadow-xs transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
                title="Grup WhatsApp Wali Kelas"
              >
                <svg className="w-3.5 h-3.5 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>Grup Wali Kelas</span>
              </a>
            )}
            <button
              onClick={() => setShowAccountSwitcher(true)}
              className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl border border-white/30 shadow-xs transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
              title="Beralih Akun / Tambah Akun Anak Lain"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Beralih Akun</span>
              <svg className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>
        </div>

        <p className="text-indigo-100 text-xs sm:text-sm font-medium max-w-xl leading-relaxed">
          Anda sedang mengakses Sistem Informasi Akademik Digital SMP Budi Mulia untuk memantau perkembangan akademik dan kedisiplinan dari <strong>{studentData.nama_lengkap}</strong>.
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

  if (loading && !studentData) {
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
              
              {showFeatureConfig.nilai && (
                <button 
                  onClick={() => { setSelectedType('NILAI'); setSidebarOpen(false) }}
                  title="Nilai Anak"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'NILAI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'NILAI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"></path></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Nilai Anak</span>}
                </button>
              )}
              
              {showFeatureConfig.presensi && (
                <button 
                  onClick={() => { setSelectedType('PRESENSI'); setSidebarOpen(false) }}
                  title="Riwayat Presensi"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'PRESENSI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'PRESENSI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Riwayat Presensi</span>}
                </button>
              )}

              {showFeatureConfig.poin && (
                <button 
                  onClick={() => { setSelectedType('POIN'); setSidebarOpen(false) }}
                  title="Sistem Poin & Kedisiplinan Anak"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'POIN' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'POIN' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="7" />
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
                  </svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Poin & Disiplin</span>}
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

              {/* Tagihan & SPP Siswa (Khusus Orang Tua) */}
              {showFeatureConfig.tagihan !== false && (
                <button 
                  onClick={() => { setSelectedType('TAGIHAN'); setSidebarOpen(false) }}
                  title="Tagihan & SPP Sekolah"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'TAGIHAN' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'TAGIHAN' ? 'text-indigo-600' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Tagihan & SPP</span>}
                </button>
              )}

              {/* Jadwal Pelajaran */}
              {showFeatureConfig.jadwal && (
                <button 
                  onClick={() => { setSelectedType('JADWAL'); setSidebarOpen(false) }}
                  title="Jadwal Pelajaran Anak"
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

        {/* Sidebar Footer Actions */}
        <div className="p-4 shrink-0">
           <button onClick={handleLogout}
             title="Keluar"
             className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-all ${sidebarCollapsed ? 'justify-center aspect-square px-0 bg-red-50' : 'gap-4 bg-red-50'}`}>
             <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
             {!sidebarCollapsed && <span className="animate-fade-in">Keluar</span>}
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50 dashboard-content-area">
        
        {/* Sticky Orange Notification Banner */}
        {!notifOrtuGranted && 'Notification' in window && (
          <div className="bg-amber-500 text-white text-xs font-bold py-2.5 px-4 flex items-center justify-between gap-3 sticky top-0 z-50 animate-slide-down shadow-md shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <span>Aktifkan notifikasi presensi langsung di HP Anda</span>
            </div>
            <button
              onClick={async () => {
                const result = await requestNotifPermission()
                if (result === 'granted') {
                  setNotifOrtuGranted(true)
                  await registerOrtuPushSubscription(studentData?.nisn)
                  showLocalNotif('Notifikasi Aktif', 'Anda akan mendapat notifikasi saat anak presensi.', { tag: 'notif-aktif-ortu' })
                }
              }}
              className="bg-white text-amber-600 hover:bg-amber-50 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors shadow-sm shrink-0"
            >
              Aktifkan
            </button>
          </div>
        )}

        {/* Top Header Navbar */}
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
              <span className="text-base font-black text-slate-800 tracking-tight">eBudiMulia Orang Tua</span>
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
              ) : !notifOrtuGranted && (
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
                  <p className="text-sm font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">Orang Tua {studentData?.nama_lengkap}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kelas {studentData?.kelas}</p>
                </div>
                <div className="w-9 h-9 rounded-full border border-slate-200 bg-indigo-50 shadow-sm overflow-hidden flex items-center justify-center font-bold text-indigo-600 shrink-0 group-hover:border-indigo-400 group-hover:ring-2 group-hover:ring-indigo-100 transition-all">
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
                    <span className="text-xs font-bold">{studentData?.nama_lengkap?.charAt(0) || 'O'}</span>
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
                      <p className="text-xs font-bold text-slate-800 truncate">Orang Tua {studentData?.nama_lengkap}</p>
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

            {/* Banner Peringatan Biodata belum lengkap */}
            {biodataWarningBanner}

            {/* Header Native Minimalis khusus Menu Spesifik */}
            {selectedType && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 animate-fade-in">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight truncate">
                    {currentMenuLabel}
                  </h1>
                  <p className="text-sm text-slate-500 font-medium mt-1 truncate">
                    Dashboard Orang Tua • Siswa: <span className="font-bold text-slate-700">{studentData?.nama_lengkap}</span> ({studentData?.kelas})
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

            {/* Kartu Profil, Dashboard Widgets, LINE Notif & Catatan Poin di Beranda (!selectedType) */}
            {!selectedType && (
              <>
                {studentInfoCard}

                {/* Widget Kehadiran, Nilai & Tabungan/Tagihan Siswa */}
                <SiswaDashboardWidgets 
                  studentData={studentData} 
                  menuTypes={menuTypes} 
                  onNavigate={setSelectedType} 
                  showFeatureConfig={showFeatureConfig}
                  isOrangTua={true}
                />

                {/* Widget Notifikasi LINE */}
                {lineNotifWidgetCard}

                {/* List Catatan Poin Siswa di Beranda */}
                {showFeatureConfig.poin && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                        </span>
                        <div>
                          <h3 className="font-extrabold text-slate-800 text-base">Catatan Poin & Karakter Siswa</h3>
                          <p className="text-xs text-slate-400">Daftar riwayat kedisiplinan dan poin prestasi ananda</p>
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
                            Positif ({berandaPointRecords.filter(r => (r.poin_diberikan || 0) > 0).length})
                          </button>
                          <button
                            onClick={() => setBerandaPointTab('negatif')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${berandaPointTab === 'negatif' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:bg-rose-50'}`}
                          >
                            Pelanggaran ({berandaPointRecords.filter(r => (r.poin_diberikan || 0) < 0).length})
                          </button>
                        </div>

                        <button
                          onClick={() => setSelectedType('POIN')}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1"
                        >
                          Lihat Detail Poin &rarr;
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
                          <p className="text-xs font-semibold text-slate-600">Belum ada catatan {berandaPointTab === 'positif' ? 'poin positif' : berandaPointTab === 'negatif' ? 'pelanggaran' : 'poin'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Pertahankan kedisiplinan dan raih poin prestasi.</p>
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
                                        <span>{formattedDate}</span>
                                        {rec.dicatat_oleh && (
                                          <span>&bull; Oleh: <strong className="text-slate-600">{rec.dicatat_oleh}</strong></span>
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
            {selectedType === 'PROFIL' ? (
              <SiswaProfilSection studentData={studentData} menuTypes={menuTypes} isOrangTua={true} />
            ) : selectedType === 'NILAI' ? (
              <SiswaNilaiSection studentData={studentData} />
            ) : selectedType === 'PRESENSI' ? (
              <SiswaRiwayatPresensi studentData={studentData} />
            ) : selectedType === 'POIN' ? (
              <SiswaPoinSection 
                siswaNisn={studentData?.nisn} 
                activeTa={{ id: studentData?.tahun_ajaran_id }} 
                showTabPoinSaya={showFeatureConfig.poinTotal || showFeatureConfig.poinNegatif || showFeatureConfig.poinPositif}
                showPoinTotal={showFeatureConfig.poinTotal}
                showPoinNegatif={showFeatureConfig.poinNegatif}
                showPoinPositif={showFeatureConfig.poinPositif}
                showTabLeaderboard={showFeatureConfig.poinLeaderboard}
                showTabTataTertib={showFeatureConfig.poinTataTertib}
                showTabKatalog={showFeatureConfig.poinKatalog}
                showPointRecords={showFeatureConfig.detailPoin}
              />
            ) : selectedType === 'JADWAL' ? (
              <SiswaJadwalSection 
                kelas={studentData?.kelas}
                activeTa={{ id: studentData?.tahun_ajaran_id }}
                semester={showFeatureConfig.jadwalSemester}
              />
            ) : selectedType === 'KALENDER' ? (
              <ProgramSekolahSection session={null} isAdmin={false} activeTa={{ id: studentData?.tahun_ajaran_id, nama: studentData?.tahun_ajaran }} />
            ) : selectedType === 'TABUNGAN' ? (
              <TabunganSiswaSection 
                session={null}
                activeTa={{ id: studentData?.tahun_ajaran_id }}
                mode="siswa"
                studentData={studentData}
                isOrangTuaView={true}
              />
            ) : selectedType === 'PENGATURAN' ? (
              <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fade-in">
                  <h2 className="text-xl font-bold text-slate-800">Pengaturan Portal</h2>
                  <p className="text-xs text-slate-500 mt-1">Sesuaikan preferensi tampilan, kontak orang tua, kode akses, dan notifikasi Anda di sini.</p>
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
                      <span>Tambah / Kelola Kontak</span>
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
                          <span>+ Lengkapi Kontak Sekarang</span>
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
                              name="app-font-setting-ortu" 
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
            ) : selectedType === 'TAGIHAN' ? (
              <OrangTuaTagihanSection studentData={studentData} />
            ) : (
              <div className="space-y-6">
                


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
                        <p className="text-sm text-amber-700 leading-relaxed">Akses untuk dokumen <strong>{selectedType?.nama || 'Dokumen'}</strong> belum diaktifkan oleh admin. Silakan tunggu informasi resmi dari pihak sekolah.</p>
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
                        <h3 className="text-xl font-bold text-slate-800">{selectedType?.nama || 'Dokumen'}</h3>
                        <p className="text-sm text-slate-500 mt-1">Dokumen resmi terenkripsi</p>
                      </div>
                      <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                        onClick={() => {
                          logActivity({
                            userRole: 'Siswa',
                            action: 'Unduh Dokumen',
                            details: `Siswa ${studentData?.nama_lengkap} membuka/mengunduh dokumen ${selectedType?.nama || 'Dokumen'}.`
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
                        title={selectedType?.nama || 'Dokumen'}
                        onError={() => setError('Gagal memuat dokumen.')}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

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
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-sm font-medium">
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

      {/* Ubah Kode Akses Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Ubah Kode Akses</h3>
              <button onClick={() => { setShowPasswordModal(false); setPasswordError(''); setPasswordSuccess(false); setOldPassword(''); setNewPassword(''); }} className="text-slate-500 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-5">
              {passwordSuccess ? (
                <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm text-center font-bold border border-green-200">
                  ✅ Kode Akses berhasil diubah!
                </div>
              ) : (
                <>
                  {passwordError && (
                    <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-sm border border-red-100 font-medium">
                      {passwordError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kode Akses Lama</label>
                    <input type="password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-all font-medium"
                      placeholder="Masukkan kode akses saat ini" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Kode Akses Baru</label>
                    <input type="text" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-all font-medium"
                      placeholder="Masukkan kode akses baru" />
                  </div>
                  <div className="pt-2">
                    <button type="submit" disabled={isChangingPassword}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-all shadow-sm">
                      {isChangingPassword ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}



      {/* Panel Notifikasi Slide-in */}
      {showNotifPanel && (
        <SiswaNotificationPanel
          isOpen={showNotifPanel}
          onClose={() => {
            setShowNotifPanel(false)
            fetchNotifCount()
          }}
          studentData={studentData}
          onNavigateMenu={(menu) => setSelectedType(menu)}
          isOrangTua={true}
        />
      )}

      {/* Toast Notifikasi Presensi Anak (Realtime) */}
      {presensiToast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[100] bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 max-w-sm flex items-start gap-4 animate-fade-in-up">
          {presensiToast.selfieUrl ? (
            <img src={presensiToast.selfieUrl} alt="Selfie" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 shrink-0 shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border-2 border-indigo-100 shadow-sm">
              <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
          )}
          <div className="flex-1">
            <h4 className="text-xs font-black text-indigo-600 uppercase tracking-wider mb-1">Presensi {presensiToast.tipeLabel}</h4>
            <p className="text-sm font-bold text-slate-800 leading-snug">{presensiToast.namaLengkap}</p>
            <p className="text-xs text-slate-500 mt-1">Pukul {presensiToast.waktu} WIB • <span className="font-semibold text-slate-700">{presensiToast.statusLabel}</span></p>
            {presensiToast.lokasi && (
              <a 
                href={`https://www.google.com/maps?q=${presensiToast.lokasi}`}
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold mt-2 underline"
              >
                Lihat Lokasi (Peta)
              </a>
            )}
          </div>
          <button onClick={() => setPresensiToast(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-1 -mr-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Floating Fullscreen FAB – always visible on mobile */}
      <button
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

      {/* Modal Tautkan Akun LINE */}
      {showLineBindingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                🟢 Tautkan Akun LINE Orang Tua
              </h3>
              <button onClick={() => setShowLineBindingModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Masukkan <strong>LINE User ID</strong> milik Anda untuk menerima notifikasi kartu presensi anak.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">LINE User ID Anda</label>
              <input
                type="text"
                value={lineIdInput}
                onChange={(e) => setLineIdInput(e.target.value)}
                placeholder="Contoh: U1a2b3c4d5e6f..."
                className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                *Dapatkan User ID dari profil LINE atau dari menu LINE Developers Console.
              </span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-900 space-y-2">
              <p className="font-bold">💬 Pilihan Alternatif (Metode 2 - Tanpa Ketik):</p>
              <p className="mt-0.5">Cukup add LINE Official <strong>@499koywa</strong> di HP Anda, lalu kirim chat:</p>
              <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-emerald-200 shadow-inner flex-wrap">
                <span className="font-mono font-bold text-emerald-900 text-xs select-all">
                  TAUTKAN {studentData?.nisn} {studentData?.ortu_password || studentData?.kode_akses || ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyLineCommand(`TAUTKAN ${studentData?.nisn || ''} ${studentData?.ortu_password || studentData?.kode_akses || ''}`.trim())}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1 shrink-0"
                >
                  <span>{copySuccess ? '✅ Tersalin!' : '📋 Copas Text'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLineBindingModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={() => handleSaveLineBinding(lineIdInput)}
                disabled={isSavingLine || !lineIdInput.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {isSavingLine ? 'Simpan...' : 'Simpan Tautan LINE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instagram-style Multi-Account Switcher Modal */}
      <MultiAccountSwitcherModal
        isOpen={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        currentAccountName={studentData?.nama_lengkap}
        currentUsername={studentData?.nisn}
        currentRole="Orang Tua"
      />
    </div>
  )
}

export default DashboardOrangTua
