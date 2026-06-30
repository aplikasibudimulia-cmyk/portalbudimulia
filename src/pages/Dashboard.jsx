import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import SiswaNilaiSection from '../components/SiswaNilaiSection'
import SiswaPresensiSection from '../components/SiswaPresensiSection'
import SiswaDashboardWidgets from '../components/SiswaDashboardWidgets'
import SiswaProfilSection from '../components/SiswaProfilSection'
import SiswaNotificationPanel from '../components/SiswaNotificationPanel'
import SiswaPoinSection from '../components/SiswaPoinSection'

function Dashboard() {
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
  const [pengumuman, setPengumuman] = useState('')
  const [loggedTypes, setLoggedTypes] = useState([])

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

  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem('siswa_session')
      if (!raw) {
        navigate('/')
        return
      }
      const data = JSON.parse(raw)
      setStudentData(data)

      const { data: types } = await supabase
        .from('jenis_pengumuman').select('*').eq('visible', true).order('urutan')
      
      const visible = types ?? []
      
      const applicableTypes = visible.filter(t => {
        const target = t.target_kelas || []
        if (!Array.isArray(target) || target.length === 0) return true
        return target.includes(data.kelas)
      })

      setMenuTypes(applicableTypes)
      
      // Setup photo fallbacks
      const urls = []
      
      // Fetch pengaturan
      const { data: pengaturan } = await supabase.from('pengaturan_sekolah').select('*')
      if (pengaturan) {
        const newShowProfile = { foto: true, kelas: true, nisn: true, nipd: true, tahun_ajaran: true }
        pengaturan.forEach(p => {
          if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
          if (p.setting_key === 'tema_warna') document.documentElement.setAttribute('data-theme', p.setting_value)
          if (p.setting_key === 'show_profile_foto') newShowProfile.foto = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_kelas') newShowProfile.kelas = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nisn') newShowProfile.nisn = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nipd') newShowProfile.nipd = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = p.setting_value === 'true'
        })
        setShowProfileConfig(newShowProfile)
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

      const { data: berkas } = await supabase
        .from('berkas_pengumuman')
        .select('*')
        .eq('kode_siswa', studentData.kode)
        .eq('kode_jenis', selectedType.kode_jenis)
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
        pengaturan.forEach(p => {
          if (p.setting_key === 'pengumuman_teks') setPengumuman(p.setting_value)
          if (p.setting_key === 'tema_warna') document.documentElement.setAttribute('data-theme', p.setting_value)
          if (p.setting_key === 'show_profile_foto') newShowProfile.foto = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_kelas') newShowProfile.kelas = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nisn') newShowProfile.nisn = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_nipd') newShowProfile.nipd = p.setting_value === 'true'
          if (p.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = p.setting_value === 'true'
        })
        setShowProfileConfig(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newShowProfile)) return newShowProfile
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
          if (payload.new && payload.new.kode_siswa === studentData.kode) {
            console.log('[REALTIME DEBUG] Matched kode_siswa, updating state!')
            handleBerkasUpdate()
          } else if (payload.eventType === 'DELETE' && payload.old && payload.old.kode_siswa === studentData.kode) {
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

    // Bulletproof Broadcast Listener
    const broadcastChannel = supabase.channel('dashboard-updates-all')
      .on('broadcast', { event: 'berkas_updated' }, (payload) => {
        console.log('[REALTIME DEBUG] Broadcast received:', payload)
        if (payload.payload && payload.payload.kode_siswa === studentData.kode) {
          handleBerkasUpdate()
        } else if (payload.payload && payload.payload.kode_siswa === 'ALL') {
          handleBerkasUpdate()
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

  const handleLogout = () => {
    localStorage.removeItem('siswa_session')
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

  // Tampilan Menu Siswa (Opsional / Per Pengumuman)
  const showNisnMenu = selectedType ? selectedType.show_nisn : false
  const showNipdMenu = selectedType ? selectedType.show_nipd : false
  const showTahunLulusMenu = selectedType ? selectedType.show_tahun_lulus : false

  // Either global profile wants it shown OR the current menu type specifically wants it shown
  const isNisnVisible = showProfileConfig.nisn || showNisnMenu
  const isNipdVisible = showProfileConfig.nipd || showNipdMenu
  const studentInfoCard = studentData && (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in mb-8">
      <div className="flex items-center gap-5 mb-6">
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
        <div>
          <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-0.5">Beranda Profil</p>
          <h2 className="text-2xl font-bold text-slate-800 leading-tight">{studentData.nama_lengkap}</h2>
          {showProfileConfig.kelas && (
            <p className="text-sm text-slate-500 mt-1">Kelas: <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{studentData.kelas}</span></p>
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
            <img src="/logo.png?v=1782401880" alt="Logo" className={`${sidebarCollapsed ? 'w-14 h-14' : 'w-20 h-20'} object-contain shrink-0 drop-shadow-sm transition-all duration-300`} />
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
              <button 
                onClick={() => { setSelectedType('PRESENSI'); setSidebarOpen(false) }}
                title="Presensi Hari Ini"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'PRESENSI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${selectedType === 'PRESENSI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Presensi Hari Ini</span>}
              </button>
              <button 
                onClick={() => { setSelectedType('NILAI'); setSidebarOpen(false) }}
                title="Nilai Saya"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'NILAI' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${selectedType === 'NILAI' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"></path></svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Nilai Saya</span>}
              </button>
              <button 
                onClick={() => { setSelectedType('POIN'); setSidebarOpen(false) }}
                title="Poin Siswa"
                className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${selectedType === 'POIN' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}
              >
                <svg className={`w-6 h-6 shrink-0 ${selectedType === 'POIN' ? 'text-indigo-600' : 'text-slate-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {!sidebarCollapsed && <span className="animate-fade-in truncate">Poin Siswa</span>}
              </button>

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
           
           <button onClick={() => setShowNotifPanel(true)}
             title="Notifikasi"
             className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all relative ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}>
             <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
             {!sidebarCollapsed && <span className="animate-fade-in">Notifikasi</span>}
             {unreadNotifCount > 0 && (
               <span className={`absolute bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ${sidebarCollapsed ? 'top-1 right-1' : 'right-4'}`}>
                 {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
               </span>
             )}
           </button>

           <button onClick={cycleFont}
             title="Ganti Font"
             className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}>
             <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
             {!sidebarCollapsed && <span className="animate-fade-in truncate">Font: {currentFont === 'jakarta' ? 'Plus Jakarta' : currentFont === 'ubuntu' ? 'Ubuntu' : 'Bricolage'}</span>}
           </button>

           <button onClick={() => { setShowPasswordModal(true); setSidebarOpen(false); }}
             title="Ubah Kode Akses"
             className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all ${sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}`}>
             <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
             {!sidebarCollapsed && <span className="animate-fade-in">Kode Akses</span>}
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
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-transparent border-none shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-slate-700 bg-slate-50 rounded-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <span className="font-bold text-slate-800 text-lg">
              {selectedType === 'NILAI' ? 'Nilai Saya' : selectedType ? selectedType.nama : 'Beranda'}
            </span>
          </div>
          <img src={photoUrls[photoIndex] || DEFAULT_AVATAR} className="w-8 h-8 rounded-full border border-slate-200 object-cover" />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="w-full space-y-6">
            
            {/* Kartu Profil selalu muncul di atas */}
            {studentInfoCard}

            {/* Konten Spesifik per Menu */}
            {selectedType === 'NILAI' ? (
              <SiswaNilaiSection studentData={studentData} />
            ) : selectedType === 'PRESENSI' ? (
              <SiswaPresensiSection studentData={studentData} />
            ) : selectedType === 'POIN' ? (
              <SiswaPoinSection siswaNisn={studentData?.nisn} activeTa={{ id: studentData?.tahun_ajaran_id }} />
            ) : selectedType === 'PROFIL' ? (
              <SiswaProfilSection studentData={studentData} menuTypes={menuTypes} />
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

            {!selectedType && (
              <SiswaDashboardWidgets 
                studentData={studentData} 
                menuTypes={menuTypes} 
                onNavigate={setSelectedType} 
              />
            )}

          </div>
        </div>
      </div>

      {/* Ubah Kode Akses Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
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
      <SiswaNotificationPanel 
        isOpen={showNotifPanel} 
        onClose={() => setShowNotifPanel(false)} 
        studentData={studentData} 
      />
    </div>
  )
}

export default Dashboard
