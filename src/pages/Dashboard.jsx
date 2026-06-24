import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import SiswaNilaiSection from '../components/SiswaNilaiSection'

function Dashboard() {
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  
  // Sidebar state for mobile
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  // Instead of auto-selecting the first menu, we can make 'null' mean Beranda
  const [selectedType, setSelectedType] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [accessBlocked, setAccessBlocked] = useState(false)
  const [refreshBerkas, setRefreshBerkas] = useState(0)
  const [error, setError] = useState(null)

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [pengumuman, setPengumuman] = useState('')

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
      
      // 1. Photo for current active year
      if (data.tahun_ajaran_id) {
        urls.push(`https://res.cloudinary.com/dwyhpysp5/image/upload/SKL-BM/FOTO_${data.nisn}_${data.tahun_ajaran_id}`)
      }
      
      // 2. Fetch older photos
      let query = supabase
        .from('foto')
        .select('cloudinary_url, tahun_ajaran_id')
        .eq('nisn', data.nisn)
        .order('tahun_ajaran_id', { ascending: false })
        
      if (data.tahun_ajaran_id) {
        query = query.neq('tahun_ajaran_id', data.tahun_ajaran_id)
      }
      
      const { data: oldFotos } = await query
      
      if (oldFotos && oldFotos.length > 0) {
        oldFotos.forEach(f => urls.push(f.cloudinary_url))
      }
      
      urls.push(DEFAULT_AVATAR)
      setPhotoUrls(urls)
      
      setLoading(false)
    }
    init()
  }, [navigate])

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
        .single()

      if (berkas && !berkas.is_accessible) {
        setPdfUrl(null)
        setError(null)
        setAccessBlocked(true)
        return
      }

      // Cek Persyaratan
      if (selectedType.persyaratan && selectedType.persyaratan.length > 0) {
        const terpenuhi = berkas?.persyaratan_terpenuhi || {}
        const belumTerpenuhi = selectedType.persyaratan.filter(req => !terpenuhi[req.id])
        if (belumTerpenuhi.length > 0) {
          setPdfUrl(null)
          setAccessBlocked(false)
          const messages = belumTerpenuhi.map(req => `• ${req.info_gagal || `Akses diblokir karena syarat "${req.nama}" belum terpenuhi.`}`)
          setError('Akses ditangguhkan karena alasan berikut:\n' + messages.join('\n'))
          return
        }
      }

      if (berkas && berkas.file_url) {
        setAccessBlocked(false)
        setError(null)
        setPdfUrl(berkas.file_url)
      } else {
        setPdfUrl(null)
        setAccessBlocked(false)
        setError('Dokumen belum tersedia. Silakan hubungi pihak sekolah.')
      }
    }
    checkFileExists()
  }, [selectedType, studentData, refreshBerkas])

  // Polling setiap 1.5 detik agar perubahan dari Admin langsung terasa di siswa
  useEffect(() => {
    if (loading || !studentData || showPasswordModal) return

    // Simpan referensi ke state terkini untuk perbandingan di dalam polling
    let lastBerkasJson = ''

    const poll = async () => {
      // 1. Cek perubahan jenis pengumuman (Global Toggle: aktif, visible, target_kelas)
      const { data: types } = await supabase
        .from('jenis_pengumuman').select('*').eq('visible', true).order('urutan')
      const visible = types ?? []

      const applicableTypes = visible.filter(t => {
        const target = t.target_kelas || []
        if (!Array.isArray(target) || target.length === 0) return true
        return target.includes(studentData?.kelas)
      })

      setMenuTypes(prev => {
        const newJson = JSON.stringify(applicableTypes)
        if (JSON.stringify(prev) === newJson) return prev
        return applicableTypes
      })

      setSelectedType(prev => {
        if (!prev) return null
        const updated = applicableTypes.find(t => t.id === prev.id)
        if (!updated) return null
        if (JSON.stringify(updated) === JSON.stringify(prev)) return prev
        return updated
      })

      // 2. Cek perubahan berkas pengumuman per siswa (Individual Toggle)
      if (studentData.kode) {
        const { data: berkas } = await supabase
          .from('berkas_pengumuman')
          .select('*')
          .eq('kode_siswa', studentData.kode)
        
        const berkasJson = JSON.stringify(berkas)
        if (berkasJson !== lastBerkasJson) {
          lastBerkasJson = berkasJson
          setRefreshBerkas(prev => prev + 1)
        }
      }

      // 3. Poll settings
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
           if (JSON.stringify(prev) !== JSON.stringify(newShowProfile)) return newShowProfile;
           return prev;
        })
      }
    }

    const intervalId = setInterval(poll, 1500)
    return () => clearInterval(intervalId)
  }, [loading, studentData, showPasswordModal])

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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-fade-in">
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
            <p className="text-xs text-slate-400 font-medium mb-1">NISN</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nisn ?? '—'}</p>
          </div>
        )}
        {isNipdVisible && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 font-medium mb-1">NIPD</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nipd ?? '—'}</p>
          </div>
        )}
        {showTahunLulusMenu && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 font-medium mb-1">Tahun Lulus</p>
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
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Sidebar Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center bg-white p-1">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 leading-tight">SIAKD</h2>
              <p className="text-xs font-medium text-slate-500">SMP Budi Mulia Jakarta</p>
            </div>
          </div>
          <button className="md:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setSidebarOpen(false)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        {/* Sidebar Menu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Menu Utama</div>
            <div className="space-y-1">
              <button 
                onClick={() => { setSelectedType(null); setSidebarOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${!selectedType ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <svg className={`w-5 h-5 ${!selectedType ? 'text-indigo-600' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                Beranda
              </button>
              <button 
                onClick={() => { setSelectedType('NILAI'); setSidebarOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${selectedType === 'NILAI' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
              >
                <svg className={`w-5 h-5 ${selectedType === 'NILAI' ? 'text-indigo-600' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10M18 20V4M6 20v-4"></path></svg>
                Nilai Saya
              </button>
            </div>
          </div>

          {menuTypes.length > 0 && (
            <div>
              <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pengumuman & Dokumen</div>
              <div className="space-y-1">
                {menuTypes.map(type => (
                  <button 
                    key={type.id} 
                    onClick={() => { setSelectedType(type); setSidebarOpen(false) }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${selectedType?.id === type.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                  >
                    <svg className={`w-5 h-5 shrink-0 ${selectedType?.id === type.id ? 'text-indigo-600' : 'text-slate-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span className="truncate text-left">{type.nama}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2 shrink-0">
           <button onClick={() => { setShowPasswordModal(true); setSidebarOpen(false); }}
             className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm">
             <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
             Ubah Kode Akses
           </button>
           <button onClick={handleLogout}
             className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all">
             <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
             Keluar Sistem
           </button>
        </div>

      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm shrink-0">
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
            ) : selectedType ? (
              <div>
                {accessBlocked && (
                  <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
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
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center py-12">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">Dokumen Belum Tersedia</h3>
                    <p className="text-slate-500 max-w-lg mx-auto whitespace-pre-line text-left">{error}</p>
                  </div>
                )}

                {!accessBlocked && !error && pdfUrl && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
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
              <div className="space-y-6">
                {pengumuman && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 shadow-sm animate-slide-up">
                    <h3 className="text-base font-bold text-indigo-900 mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                      Pengumuman Sekolah
                    </h3>
                    <p className="text-sm text-indigo-800 leading-relaxed whitespace-pre-wrap">{pengumuman}</p>
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 flex flex-col items-center justify-center text-center">
                   <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-5">
                     <svg className="w-10 h-10 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                   </div>
                   <h3 className="text-xl font-bold text-slate-800 mb-2">SIAKD SMP Budi Mulia Jakarta</h3>
                   <p className="text-slate-500 max-w-md mx-auto">Silakan pilih jenis pengumuman atau dokumen dari menu di sebelah kiri untuk melihat detailnya.</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Ubah Kode Akses Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Ubah Kode Akses</h3>
              <button onClick={() => { setShowPasswordModal(false); setPasswordError(''); setPasswordSuccess(false); setOldPassword(''); setNewPassword(''); }} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-lg">
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
    </div>
  )
}

export default Dashboard
