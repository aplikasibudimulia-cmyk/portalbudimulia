import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { requestNotifPermission, showLocalNotif, isNotifGranted, subscribeToPushNotification } from '../utils/pushNotif'
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
import { sendLinePushNotification, createBindingSuccessFlexMessage } from '../utils/lineNotifier'

function DashboardOrangTua() {
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  
  // Sidebar state for mobile and desktop collapse
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // Default to collapsed as requested
  
  const [selectedType, setSelectedType] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [accessBlocked, setAccessBlocked] = useState(false)
  const [refreshBerkas, setRefreshBerkas] = useState(0)
  const [error, setError] = useState(null)
  const [studentBerkas, setStudentBerkas] = useState(null)
  const [isStatusExpanded, setIsStatusExpanded] = useState(false)

  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showPengaturanModal, setShowPengaturanModal] = useState(false)

  // Edit Biodata Modal for Orang Tua
  const [showEditBiodataModal, setShowEditBiodataModal] = useState(false)
  const [editBiodataForm, setEditBiodataForm] = useState({ nama_ortu: '', no_hp_ortu: '', email_ortu: '' })
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
    jadwal: true,
    jadwalSemester: '2'
  })

  useEffect(() => {
    const init = async () => {

      const raw = localStorage.getItem('orangtua_session')
      if (!raw) {
        navigate('/')
        return
      }
      let data = null
      try {
        data = JSON.parse(raw)
      } catch (e) {
        console.error("Invalid orangtua session JSON:", e)
        localStorage.removeItem('orangtua_session')
        navigate('/')
        return
      }
      
      // Fetch historical enrollments to check ta_referensi_id correctly
      const { data: enrollments } = await supabase.from('enrollment').select('kelas, tahun_ajaran_id, kode').eq('nisn', data.nisn)
      if (enrollments) data.enrollments = enrollments
      
      const { data: latestStudentData } = await supabase.from('siswa_permanent').select('*').eq('nisn', data.nisn).single()
      if (latestStudentData) {
        Object.assign(data, latestStudentData)
        localStorage.setItem('orangtua_session', JSON.stringify(data))
      }

      setStudentData(data)

      const { data: types } = await supabase
        .from('jenis_pengumuman').select('*').neq('visible_orangtua', false).order('urutan')
      
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
      
      // Setup photo fallbacks
      const urls = []
      
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
          tabungan: true,
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
          if (p.setting_key === 'show_tabungan_ortu_siswa') newShowFeature.tabungan = p.setting_value === 'true'
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
        setShowProfileConfig(newShowProfile)
        setShowFeatureConfig(newShowFeature)
      }
      
      // 1. Fetch all photos from database
      const { data: allFotos } = await supabase
        .from('foto')
        .select('cloudinary_url, tahun_ajaran_id')
        .eq('nisn', data.nisn)
        
      if (allFotos && allFotos.length > 0) {
        // Put the photo for the current active year first
        const currentYearFoto = allFotos.find(f => f.tahun_ajaran_id === data.tahun_ajaran_id)
        if (currentYearFoto && currentYearFoto.cloudinary_url) {
          urls.push(currentYearFoto.cloudinary_url)
        }
        
        // Add the rest
        allFotos.forEach(f => {
          if (f.tahun_ajaran_id !== data.tahun_ajaran_id && f.cloudinary_url) {
            urls.push(f.cloudinary_url)
          }
        })
      }
      
      urls.push(DEFAULT_AVATAR)
      setPhotoUrls(urls)
      
      setLoading(false)
    }
    init()
  }, [navigate])

  useEffect(() => {
    if (!studentData) return
    const fetchNotifCount = async () => {
      const { data: allNotif } = await supabase.from('notifikasi')
        .select('id, target_kelas')
        .or(`target_nisn.is.null,target_nisn.eq.${studentData.nisn}`)
      
      if (!allNotif) return
      const valid = allNotif.filter(n => !n.target_kelas || n.target_kelas === studentData.kelas)
      
      const { data: readNotif } = await supabase.from('notifikasi_read')
        .select('notifikasi_id')
        .eq('nisn', studentData.nisn)
        
      const readIds = new Set((readNotif || []).map(r => r.notifikasi_id))
      const unreadCount = valid.filter(n => !readIds.has(n.id)).length
      setUnreadNotifCount(unreadCount)
    }
    
    fetchNotifCount()
    
    const channel = supabase.channel(`siswa-notif-${studentData.nisn}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifikasi' }, fetchNotifCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifikasi_read', filter: `nisn=eq.${studentData.nisn}` }, fetchNotifCount)
      .subscribe()
      
    return () => supabase.removeChannel(channel)
  }, [studentData])

  // Realtime listener notifikasi presensi dari anak ke orangtua
  useEffect(() => {
    if (!studentData?.nisn) return
    const channel = supabase.channel(`notif-ortu-${studentData.nisn}`)
      .on('broadcast', { event: 'presensi_update' }, ({ payload }) => {
        setPresensiToast(payload)
        // Tampilkan push notification jika browser notif diizinkan
        if (isNotifGranted()) {
          const lokasiText = payload.lokasi ? `\n📍 Lokasi: ${payload.lokasi}` : ""
          const body = `${payload.namaLengkap} — ${payload.tipeLabel} pukul ${payload.waktu} WIB (${payload.statusLabel}).${lokasiText}`
          showLocalNotif('🏫 Presensi Anak', body, { 
            tag: `presensi-${payload.tipe}`,
            data: { url: payload.lokasi ? `https://www.google.com/maps?q=${payload.lokasi}` : '/' }
          })
        }
        // Auto dismiss toast setelah 15 detik
        setTimeout(() => setPresensiToast(null), 15000)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [studentData?.nisn])

  // Auto-subscribe to Web Push for parents if permission was previously granted
  useEffect(() => {
    if (!notifOrtuGranted || !studentData?.nisn) return
    const autoSubscribe = async () => {
      await registerOrtuPushSubscription(studentData.nisn)
    }
    autoSubscribe()
  }, [notifOrtuGranted, studentData?.nisn])

  useEffect(() => {
    const checkFileExists = async () => {
      if (!selectedType || !studentData || selectedType === 'PROFIL') {
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
          jadwal: true,
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
          if (p.setting_key === 'show_tabungan_ortu_siswa') newShowFeature.tabungan = p.setting_value === 'true'
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
          setShowFeatureConfig(prev => ({ ...prev, tabungan: payload.payload.value }))
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
    setEditBiodataForm({
      nama_ortu: studentData?.nama_ortu || '',
      no_hp_ortu: studentData?.no_hp_ortu || '',
      email_ortu: studentData?.email_ortu || ''
    })
    setBiodataError('')
    setBiodataSuccess(false)
    setShowEditBiodataModal(true)
  }

  const handleSaveBiodata = async (e) => {
    e.preventDefault()
    setBiodataError('')
    setBiodataSuccess(false)
    setIsSavingBiodata(true)

    try {
      const formattedWa = formatPhoneNumber(editBiodataForm.no_hp_ortu)
      const { error } = await supabase
        .from('siswa_permanent')
        .update({
          nama_ortu: editBiodataForm.nama_ortu.trim() || null,
          no_hp_ortu: formattedWa || null,
          email_ortu: editBiodataForm.email_ortu.trim() || null
        })
        .eq('nisn', studentData.nisn)

      if (error) throw error

      setBiodataSuccess(true)
      const updatedData = { ...studentData, ...editBiodataForm }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      
      logActivity({
        userRole: 'Orang Tua',
        action: 'Update Biodata Orang Tua',
        details: `Orang tua dari ${studentData.nama_lengkap || studentData.nama || 'siswa'} (NISN: ${studentData.nisn}) berhasil memperbarui biodata.`
      })

      setTimeout(() => {
        setShowEditBiodataModal(false)
        setBiodataSuccess(false)
      }, 1500)
    } catch (err) {
      setBiodataError('Terjadi kesalahan saat menyimpan biodata.')
    } finally {
      setIsSavingBiodata(false)
    }
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
    selectedType === 'NILAI' ? 'Laporan Nilai Anak' : 
    selectedType === 'PRESENSI' ? 'Riwayat Presensi' : 
    selectedType === 'POIN' ? 'Poin & Disiplin' : 
    selectedType === 'JADWAL' ? 'Jadwal Pelajaran' : 
    selectedType === 'KALENDER' ? 'Kalender Akademik' : 
    selectedType ? selectedType.nama : 
    'Beranda Profil'

  const isBiodataLengkap = studentData && studentData.nama_ortu && studentData.no_hp_ortu && studentData.email_ortu;

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
        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-md">
          🟢
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-sm">Notifikasi Presensi LINE</h4>
            {studentData.line_user_id ? (
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                ✅ TERHUBUNG
              </span>
            ) : (
              <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                ⚪ BELUM TERHUBUNG
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
              <p className="font-bold text-slate-800">💬 Metode 2 (Chat Auto-Binding Bot):</p>
              <p>Add LINE sekolah <strong>@499koywa</strong>, lalu kirim chat:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="bg-emerald-100 px-2 py-1 rounded font-mono font-bold text-emerald-900 text-xs border border-emerald-300 select-all">
                  TAUTKAN {studentData.nisn} {studentData.ortu_password || studentData.kode_akses || ''}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyLineCommand(`TAUTKAN ${studentData.nisn} ${studentData.ortu_password || studentData.kode_akses || ''}`.trim())}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm flex items-center gap-1 shrink-0"
                  title="Copas teks perintah ini"
                >
                  <span>{copySuccess ? '✅ Tersalin!' : '📋 Copas Text'}</span>
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
            <span>📱 Tautkan LINE (1-Click)</span>
          </button>
        )}
      </div>
    </div>
  )

  const studentInfoCard = studentData && (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in mb-8 relative">
      {linkGrupOrtu && (
        <a href={linkGrupOrtu} target="_blank" rel="noopener noreferrer" className="absolute top-6 right-6 inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs px-3 py-1.5 rounded-xl transition-colors border border-emerald-200 shadow-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span className="hidden sm:inline">Grup Wali Kelas</span>
          <span className="sm:hidden">Grup</span>
        </a>
      )}
      <div className="flex items-center gap-5 mb-6">
        
        {/* Mobile Hamburger Button inside studentInfoCard */}
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="p-2.5 -ml-2 text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl md:hidden transition-colors shrink-0"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>

        {showProfileConfig.foto && (
          <img src={photoUrls[photoIndex] || DEFAULT_AVATAR} alt={studentData.nama_lengkap}
            className="w-16 h-16 rounded-full object-cover bg-blue-100 shrink-0 border-2 border-white shadow-sm"
            onError={() => {
              if (photoIndex < photoUrls.length - 1) {
                setPhotoIndex(prev => prev + 1)
              } else if (photoUrls[photoIndex] !== DEFAULT_AVATAR) {
                setPhotoUrls(prev => { const n = [...prev]; n[photoIndex] = DEFAULT_AVATAR; return n; })
              }
            }} />
        )}
        <div className={linkGrupOrtu ? "pr-24 sm:pr-32" : ""}>
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">{currentMenuLabel}</p>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">{sapaanHeader}</h2>
          {showProfileConfig.kelas && (
            <p className="text-sm text-slate-500 mt-2">Kelas: <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{studentData.kelas}</span></p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isNisnVisible && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">NISN</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nisn ?? '—'}</p>
          </div>
        )}
        {isNipdVisible && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">NIPD</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nipd ?? '—'}</p>
          </div>
        )}
        {showTahunLulusMenu && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">Tahun Lulus</p>
            <p className="text-sm font-bold text-slate-700">{studentData.tahun_lulus ?? '—'}</p>
          </div>
        )}
        {showProfileConfig.tahun_ajaran && (
          <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl px-4 py-3">
            <p className="text-xs text-indigo-400 font-medium mb-1">Tahun Ajaran</p>
            <p className="text-sm font-bold text-indigo-700">{studentData.tahun_ajaran ?? '—'}</p>
          </div>
        )}
      </div>
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
              {showFeatureConfig.tabungan !== false && (
                <button 
                  onClick={() => { setSelectedType('TABUNGAN'); setSidebarOpen(false) }}
                  title="Tabungan Siswa"
                  className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'TABUNGAN' ? 'bg-emerald-50 text-emerald-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
                >
                  <svg className={`w-6 h-6 shrink-0 ${selectedType === 'TABUNGAN' ? 'text-emerald-600' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {!sidebarCollapsed && <span className="animate-fade-in truncate">Tabungan Siswa</span>}
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
        <div className="p-4 space-y-3 shrink-0">
           
            {/* Tombol Notifikasi */}
            <button 
              onClick={() => { setShowNotifPanel(true); setSidebarOpen(false); }}
              title="Notifikasi"
              className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 relative text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02] ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
            >
              <div className="relative shrink-0">
                <svg 
                  className="w-6 h-6 transition-transform duration-300" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadNotifCount > 0 && sidebarCollapsed && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded-full ring-1 ring-white animate-pulse">
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </div>
              {!sidebarCollapsed && <span className="animate-fade-in">Notifikasi</span>}
              {unreadNotifCount > 0 && !sidebarCollapsed && (
                <span className="absolute bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full right-4">
                  {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                </span>
              )}
            </button>

            <button onClick={() => setShowPengaturanModal(true)}
              title="Pengaturan"
              className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all relative ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}>
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              {!sidebarCollapsed && <span className="animate-fade-in">Pengaturan</span>}
            </button>

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
                  showLocalNotif('✅ Notifikasi Aktif', 'Anda akan mendapat notifikasi saat anak presensi.', { tag: 'notif-aktif-ortu' })
                }
              }}
              className="bg-white text-amber-600 hover:bg-amber-50 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors shadow-sm shrink-0"
            >
              Tampilkan / Allow
            </button>
          </div>
        )}



        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="w-full space-y-6">


            {/* Banner Peringatan Biodata belum lengkap */}
            {biodataWarningBanner}

            {/* Header Native Minimalis khusus Menu Spesifik */}
            {selectedType && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 animate-fade-in">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Mobile Hamburger Button (Garis Tiga) */}
                  <button 
                    onClick={() => setSidebarOpen(true)} 
                    className="p-2 -ml-1 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl md:hidden transition-colors shrink-0 shadow-2xs mt-0.5"
                    title="Buka Menu Navigasi"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"/></svg>
                  </button>

                  <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight truncate">
                      {selectedType === 'TABUNGAN' ? 'Tabungan Siswa' : 
                       selectedType === 'NILAI' ? 'Laporan Nilai Anak' : 
                       selectedType === 'PRESENSI' ? 'Riwayat Presensi' : 
                       selectedType === 'POIN' ? 'Poin & Kedisiplinan' : 
                       selectedType === 'JADWAL' ? 'Jadwal Pelajaran' : 'Kalender Akademik'}
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1 truncate">
                      Dashboard Orang Tua • Siswa: <span className="font-bold text-slate-700">{studentData?.nama_lengkap}</span> ({studentData?.kelas})
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedType(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs shrink-0 self-start sm:self-auto"
                >
                  <span>←</span> <span>Kembali ke Beranda</span>
                </button>
              </div>
            )}

            {/* Kartu Profil & Widget LINE hanya muncul di Beranda (!selectedType) */}
            {!selectedType && (
              <>
                {studentInfoCard}
                {lineNotifWidgetCard}
              </>
            )}

            {/* Konten Spesifik per Menu */}
            {!selectedType ? (
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
            ) : (
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
            )}

            {!selectedType && (
              <SiswaDashboardWidgets 
                studentData={studentData} 
                menuTypes={menuTypes} 
                onNavigate={setSelectedType} 
                isOrangTua={true}
                showFeatureConfig={showFeatureConfig}
              />
            )}

          </div>
        </div>
      </div>

      {/* Edit Biodata Modal */}
      {showEditBiodataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Edit Biodata Orang Tua
              </h3>
              <button onClick={() => setShowEditBiodataModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveBiodata} className="p-6">
              {biodataSuccess ? (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl text-sm font-bold text-center mb-0">
                  ✅ Biodata berhasil diperbarui!
                </div>
              ) : (
                <div className="space-y-4">
                  {biodataError && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-600 p-3 rounded-xl text-sm font-medium">
                      {biodataError}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nama Orang Tua</label>
                    <input 
                      type="text" 
                      value={editBiodataForm.nama_ortu}
                      onChange={(e) => setEditBiodataForm({...editBiodataForm, nama_ortu: e.target.value})}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nomor WhatsApp / HP</label>
                    <input 
                      type="text" 
                      value={editBiodataForm.no_hp_ortu}
                      onChange={(e) => setEditBiodataForm({...editBiodataForm, no_hp_ortu: e.target.value})}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email</label>
                    <input 
                      type="email" 
                      value={editBiodataForm.email_ortu}
                      onChange={(e) => setEditBiodataForm({...editBiodataForm, email_ortu: e.target.value})}
                      placeholder="Contoh: budi@email.com"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    />
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => setShowEditBiodataModal(false)}
                      className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                      Batal
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSavingBiodata}
                      className="px-5 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-70 transition-colors shadow-sm flex items-center gap-2">
                      {isSavingBiodata ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          Menyimpan...
                        </>
                      ) : 'Simpan Biodata'}
                    </button>
                  </div>
                </div>
              )}
            </form>
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

      {/* Pengaturan Modal */}
      {showPengaturanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Pengaturan
              </h3>
              <button onClick={() => setShowPengaturanModal(false)} className="text-slate-500 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button onClick={() => { setShowPengaturanModal(false); handleOpenEditBiodata(); }} className="w-full flex items-center gap-3 p-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Edit Biodata
              </button>
              <button onClick={() => { setShowPengaturanModal(false); setShowPasswordModal(true); }} className="w-full flex items-center gap-3 p-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Ubah Kode Akses
              </button>
              <button onClick={() => { setShowPengaturanModal(false); setShowNotifPanel(true); }} className="w-full flex items-center gap-3 p-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                Setting Notifikasi
              </button>
              <button onClick={() => { setShowPengaturanModal(false); cycleFont(); }} className="w-full flex items-center gap-3 p-3 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
                Ganti Font
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel Notifikasi Slide-in */}
      {showNotifPanel && (
        <SiswaNotificationPanel
          onClose={() => setShowNotifPanel(false)}
          nisn={studentData?.nisn}
        />
      )}

      {/* Toast Notifikasi Presensi Anak (Realtime) */}
      {presensiToast && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[100] bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 max-w-sm flex items-start gap-4 animate-fade-in-up">
          {presensiToast.selfieUrl ? (
            <img src={presensiToast.selfieUrl} alt="Selfie" className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 shrink-0 shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border-2 border-indigo-100 shadow-sm">
              <span className="text-xl">📸</span>
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
                📍 Lihat Lokasi (Peta)
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
    </div>
  )
}

export default DashboardOrangTua
