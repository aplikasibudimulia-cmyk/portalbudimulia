import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const DEFAULT_AVATAR = '/default-avatar.png'

const getStudentPhotoUrl = (kode) => {
  if (!kode) return null
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/storage/v1/object/public/foto-siswa/${kode}.jpg`
}

const StudentAvatar = ({ kode, name, className = 'w-9 h-9 text-xs' }) => {
  const [hasError, setHasError] = useState(false)
  const initial = String(name ?? '?').trim().charAt(0).toUpperCase()
  const photoUrl = getStudentPhotoUrl(kode)

  if (hasError || !photoUrl) {
    return (
      <div className={`${className} rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold shrink-0 select-none`}>
        {initial}
      </div>
    )
  }

  return (
    <img
      src={photoUrl}
      alt={name}
      className={`${className} rounded-full object-cover bg-slate-100 border border-slate-200 shrink-0`}
      onError={() => setHasError(true)}
    />
  )
}

const IconUsers = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconFile = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconSettings = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconUpload = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)
const IconLogout = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

function Admin() {
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState('siswa')
  const [authLoading, setAuthLoading] = useState(true)

  const [students, setStudents] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [studentsLoading, setStudentsLoading] = useState(false)

  const [selectedPreview, setSelectedPreview] = useState(null)
  const [modalIframeLoading, setModalIframeLoading] = useState(true)

  const [announcement, setAnnouncement] = useState('')
  const [announcementSaving, setAnnouncementSaving] = useState(false)
  const [announcementMsg, setAnnouncementMsg] = useState(null)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResults, setUploadResults] = useState(null)

  const pdfInputRef = useRef(null)
  const photoInputRef = useRef(null)

  useEffect(() => {
    let handled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Admin] Auth event :', event)
      console.log('[Admin] Session    :', session ? 'ADA' : 'TIDAK ADA')

      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
      if (handled) return
      handled = true

      if (!session) {
        console.log('[Admin] Tidak ada sesi aktif → redirect ke halaman login.')
        navigate('/')
        return
      }

      const userEmail = session.user.email
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL

      console.log('[Admin] User object :', session.user)
      console.log('[Admin] Email user  :', userEmail)
      console.log('[Admin] Email admin :', adminEmail ?? '(TIDAK DISET di .env)')

      if (!adminEmail) {
        console.warn('[Admin] PERINGATAN: VITE_ADMIN_EMAIL belum diset di .env — akses dibuka tanpa filter.')
      }

      if (adminEmail && userEmail !== adminEmail) {
        console.log('[Admin] Akses DITOLAK — email tidak cocok → redirect ke /dashboard.')
        navigate('/dashboard')
        return
      }

      console.log('[Admin] Akses DITERIMA ✓')
      setAuthLoading(false)
      fetchStudents()
      fetchAnnouncement()
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    const channel = supabase
      .channel('realtime-siswa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siswa' }, () => fetchStudents())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [authLoading])

  const fetchStudents = async () => {
    setStudentsLoading(true)
    const { data, error } = await supabase.from('siswa').select('*').order('nama_lengkap')
    console.log('[Admin] fetchStudents — data:', data?.length ?? 0, 'baris | error:', error?.message ?? 'tidak ada')
    if (data) setStudents(data)
    setStudentsLoading(false)
  }

  const handleDownloadSKL = async (filePath, nama) => {
    if (!filePath) return
    const { data, error } = await supabase.storage.from('ijazah-siswa').createSignedUrl(filePath, 60)
    if (error || !data?.signedUrl) {
      alert('Gagal membuat link download untuk ' + nama)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const fetchAnnouncement = async () => {
    const { data } = await supabase.from('pengaturan').select('nilai').eq('kunci', 'teks_pengumuman').maybeSingle()
    setAnnouncement(data?.nilai ?? '')
  }

  const handleSaveAnnouncement = async () => {
    setAnnouncementSaving(true)
    setAnnouncementMsg(null)
    const { error } = await supabase.from('pengaturan').upsert(
      { kunci: 'teks_pengumuman', nilai: announcement },
      { onConflict: 'kunci' }
    )
    setAnnouncementSaving(false)
    setAnnouncementMsg(error
      ? { type: 'error', text: 'Gagal menyimpan. Coba lagi.' }
      : { type: 'success', text: 'Pengumuman berhasil disimpan!' }
    )
  }

  const handleBulkUpload = async (files, bucketName) => {
    if (!files || files.length === 0) return
    setIsUploading(true)
    setUploadResults(null)

    const fileList = Array.from(files)
    const results = { success: [], failed: [], skipped: [] }
    const validKodes = new Set(students.map(s => String(s.kode ?? '').trim()).filter(Boolean))

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      setUploadProgress({ current: i + 1, total: fileList.length, fileName: file.name })

      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').trim()
      console.log(`[Admin] Upload validasi — file: "${nameWithoutExt}" | ada di kode:`, validKodes.has(nameWithoutExt))
      if (validKodes.size > 0 && !validKodes.has(nameWithoutExt)) {
        results.skipped.push(file.name)
        continue
      }

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(file.name, file, { upsert: true })

      if (error) {
        console.error(`[Admin] Upload gagal — ${file.name}:`, error.message, '| status:', error.statusCode ?? '-')
        results.failed.push(file.name)
      } else {
        results.success.push(file.name)
      }
    }

    setIsUploading(false)
    setUploadProgress(null)
    setUploadResults(results)
    fetchStudents()

    if (pdfInputRef.current) pdfInputRef.current.value = ''
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const uniqueClasses = [...new Set(students.map(s => s.kelas).filter(Boolean))].sort()
  const filteredStudents = students.filter(s => {
    const q = searchTerm.toLowerCase()
    const matchSearch = !searchTerm ||
      s.nama_lengkap?.toLowerCase().includes(q) ||
      String(s.nisn ?? '').toLowerCase().includes(q)
    const matchClass = classFilter === 'all' || s.kelas === classFilter
    return matchSearch && matchClass
  })

  const menuItems = [
    { id: 'siswa', label: 'Manajemen Data Kelulusan', icon: <IconUsers /> },
    { id: 'pengumuman', label: 'Konfigurasi Pengumuman', icon: <IconSettings /> },
  ]

  if (authLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Memverifikasi akses Administrator...</p>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">

      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="border border-slate-200 rounded-xl shadow-sm p-1 bg-white shrink-0">
              <img src="/logo.png" alt="Logo SMP Budi Mulia" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">SMP BUDI MULIA</p>
              <p className="text-slate-500 text-xs mt-0.5">Panel Administrator</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeMenu === item.id
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <IconLogout />
            Keluar dari Sistem
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">

        {activeMenu === 'siswa' && (
          <div>
            <input ref={pdfInputRef} type="file" multiple accept="application/pdf" className="hidden"
              onChange={e => handleBulkUpload(e.target.files, 'ijazah-siswa')} />
            <input ref={photoInputRef} type="file" multiple accept="image/*" className="hidden"
              onChange={e => handleBulkUpload(e.target.files, 'foto-siswa')} />

            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Manajemen Data Kelulusan</h2>
                <p className="text-slate-500 text-sm">Total {filteredStudents.length} siswa terdaftar. Klik nama untuk pratinjau SKL.</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition-all duration-200 active:scale-95"
                >
                  <IconUpload />
                  Upload PDF Massal
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium transition-all duration-200 active:scale-95"
                >
                  <IconUpload />
                  Upload Foto Massal
                </button>
              </div>
            </div>

            {isUploading && uploadProgress && (
              <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-700 font-medium">Mengunggah berkas...</p>
                  <p className="text-xs text-slate-500">{uploadProgress.current} / {uploadProgress.total}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 truncate">{uploadProgress.fileName}</p>
              </div>
            )}

            {!isUploading && uploadResults && (
              <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-slate-800 mb-3">Proses unggah selesai.</p>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="bg-green-50 border border-green-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-green-700">{uploadResults.success.length}</p>
                    <p className="text-xs text-green-600 mt-1">Berhasil</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-amber-700">{uploadResults.skipped.length}</p>
                    <p className="text-xs text-amber-600 mt-1">Dilewati</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-red-700">{uploadResults.failed.length}</p>
                    <p className="text-xs text-red-600 mt-1">Gagal</p>
                  </div>
                </div>
                {uploadResults.failed.length > 0 && (
                  <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-medium mb-1">Berkas gagal diunggah:</p>
                    {uploadResults.failed.map(f => (
                      <p key={f} className="text-xs text-red-500">{f}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mb-5">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari nama atau NISN..."
                className="flex-1 min-w-48 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <select
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              >
                <option value="all">Semua Kelas</option>
                {uniqueClasses.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {studentsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="text-center px-3 py-4 w-14">No</th>
                        <th className="text-left px-5 py-4">Foto</th>
                        <th className="text-left px-5 py-4">Nama Lengkap</th>
                        <th className="text-left px-5 py-4">NISN</th>
                        <th className="text-left px-5 py-4">Kelas</th>
                        <th className="text-left px-5 py-4">Tahun Lulus</th>
                        <th className="text-left px-5 py-4">Email Aktif</th>
                        <th className="text-left px-5 py-4">Berkas SKL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-14">
                            <p className="text-slate-400 text-sm">
                              {students.length === 0 ? 'Belum ada data siswa yang diimpor.' : 'Tidak ada data yang sesuai dengan filter.'}
                            </p>
                          </td>
                        </tr>
                      ) : filteredStudents.map((s, i) => (
                        <tr key={s.kode ?? s.nisn ?? i} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/60'}`}>
                          <td className="text-center px-3 py-3 text-slate-500 w-14">{i + 1}</td>
                          <td className="px-5 py-3">
                            <StudentAvatar kode={s.kode} name={s.nama_lengkap} className="w-9 h-9 text-xs" />
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => { setSelectedPreview(s); setModalIframeLoading(true) }}
                              className="text-slate-900 font-medium hover:text-indigo-600 transition-colors text-left cursor-pointer"
                              title="Klik untuk pratinjau SKL"
                            >
                              {s.nama_lengkap}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-slate-600">{s.nisn ?? '—'}</td>
                          <td className="px-5 py-3">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {s.kelas ?? '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-600">{s.tahun_lulus ?? '—'}</td>
                          <td className="px-5 py-3 text-slate-600">{s.email_aktif ?? '—'}</td>
                          <td className="px-5 py-3">
                            {s.file_path ? (
                              <button
                                onClick={() => handleDownloadSKL(s.file_path, s.nama_lengkap)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium transition-colors border border-green-200"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Unduh
                              </button>
                            ) : (
                              <span className="text-red-500 text-xs font-medium">Belum tersedia</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {false && (
          <div>
            <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Pratinjau & Upload SKL</h2>
                <p className="text-blue-300 text-sm">Cari siswa untuk preview, atau upload file secara massal.</p>
              </div>
              <div className="flex gap-3">
                <input ref={pdfInputRef} type="file" multiple accept="application/pdf" className="hidden"
                  onChange={e => handleBulkUpload(e.target.files, 'ijazah-siswa')} />
                <input ref={photoInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => handleBulkUpload(e.target.files, 'foto-siswa')} />
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-500/40 text-white text-sm font-medium transition-all active:scale-95"
                >
                  <IconUpload />
                  Upload PDF Massal
                </button>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:bg-purple-500/40 text-white text-sm font-medium transition-all active:scale-95"
                >
                  <IconUpload />
                  Upload Foto Massal
                </button>
              </div>
            </div>

            {isUploading && uploadProgress && (
              <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-700 font-medium">Mengunggah berkas...</p>
                  <p className="text-xs text-slate-500">{uploadProgress.current} / {uploadProgress.total}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 truncate">{uploadProgress.fileName}</p>
              </div>
            )}

            {!isUploading && uploadResults && (
              <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <p className="text-sm font-semibold text-slate-800 mb-3">Proses unggah selesai.</p>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="bg-green-50 border border-green-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-green-700">{uploadResults.success.length}</p>
                    <p className="text-xs text-green-600 mt-1">Berhasil</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-amber-700">{uploadResults.skipped.length}</p>
                    <p className="text-xs text-amber-600 mt-1">Dilewati</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl py-3">
                    <p className="text-2xl font-bold text-red-700">{uploadResults.failed.length}</p>
                    <p className="text-xs text-red-600 mt-1">Gagal</p>
                  </div>
                </div>
                {uploadResults.failed.length > 0 && (
                  <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-medium mb-1">Berkas gagal diunggah:</p>
                    {uploadResults.failed.map(f => (
                      <p key={f} className="text-xs text-red-500">{f}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative mb-6 max-w-md mt-4">
              <input
                type="text"
                value={previewSearch}
                onChange={handlePreviewSearch}
                placeholder="Ketik nama siswa..."
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-blue-300/60 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
              {previewResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-white/10 rounded-xl overflow-hidden z-20 shadow-2xl">
                  {previewResults.map(s => (
                    <button
                      key={s.kode ?? s.nisn ?? s.nama_lengkap}
                      onClick={() => handleSelectPreview(s)}
                      className="w-full text-left px-4 py-3 text-sm text-blue-100 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                    >
                      {s.nama_lengkap}
                      {!s.file_path && <span className="ml-2 text-xs text-red-400">(file belum ada)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(() => { console.log('[Debug Pratinjau] State selectedStudent saat ini:', selectedStudent); return null })()}

            {selectedStudent ? (
              <div>
                <div className="mb-5 bg-white/10 border border-white/20 rounded-2xl p-4 flex items-center gap-4">
                  <img
                    src={getStudentPhotoUrl(selectedStudent.kode)}
                    alt={selectedStudent.nama_lengkap}
                    className="w-14 h-14 rounded-full object-cover bg-white/10 border border-white/20 shrink-0"
                    onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_AVATAR }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-blue-400 uppercase tracking-wider mb-0.5">Siswa Dipilih</p>
                    <h3 className="text-white font-semibold truncate">{selectedStudent.nama_lengkap}</h3>
                    <p className="text-sm text-blue-300">
                      Kelas: <span className="font-medium">{selectedStudent.kelas ?? '—'}</span>
                      {' · '}
                      Kode: <span className="font-medium">{selectedStudent.kode ?? '—'}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => { setSelectedStudent(null); setSelectedStudentName(''); setPdfUrl(null); setPreviewSearch('') }}
                    className="text-blue-300/60 hover:text-white transition-colors p-1"
                    title="Batal pilih"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                {!pdfUrl ? (
                  <div className="bg-red-500/10 border border-red-400/20 rounded-2xl flex items-center justify-center h-40">
                    <p className="text-red-300 text-sm">⚠️ Kolom kode siswa kosong — tidak bisa membentuk URL PDF.</p>
                  </div>
                ) : (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <p className="text-xs text-blue-400 uppercase tracking-wider">Dokumen SKL</p>
                        <h3 className="text-white font-semibold">{selectedStudent.nama_lengkap}</h3>
                        <p className="text-xs text-blue-300/60 mt-0.5 break-all">{pdfUrl}</p>
                      </div>
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-all active:scale-95 shrink-0"
                      >
                        Buka di Tab Baru
                      </a>
                    </div>
                    <div className="relative rounded-xl overflow-hidden border border-white/10">
                      {iframeLoading && (
                        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center z-10">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-400 rounded-full animate-spin" />
                        </div>
                      )}
                      <iframe
                        key={pdfUrl}
                        src={pdfUrl}
                        width="100%"
                        height="600px"
                        className="w-full block"
                        onLoad={() => setIframeLoading(false)}
                        title="Preview SKL"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center h-48">
                <p className="text-blue-300/60 text-sm">Ketik nama siswa di atas untuk memulai pratinjau.</p>
              </div>
            )}
          </div>
        )}

        {activeMenu === 'pengumuman' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Konfigurasi Teks Pengumuman</h2>
            <p className="text-slate-500 text-sm mb-6">Teks ini akan tampil di halaman Dashboard siswa secara dinamis.</p>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
              {announcementMsg && (
                <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
                  announcementMsg.type === 'success'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {announcementMsg.text}
                </div>
              )}

              <label className="block text-sm font-medium text-slate-700 mb-2">
                Teks Ucapan / Pengumuman Resmi
              </label>
              <textarea
                rows={8}
                value={announcement}
                onChange={e => { setAnnouncement(e.target.value); setAnnouncementMsg(null) }}
                placeholder="Contoh: Selamat kepada seluruh siswa yang telah dinyatakan LULUS..."
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
              />
              <p className="text-xs text-slate-400 mt-2 mb-5">
                Teks disimpan ke tabel <code className="bg-slate-100 px-1.5 py-0.5 rounded">pengaturan</code> dengan kunci <code className="bg-slate-100 px-1.5 py-0.5 rounded">teks_pengumuman</code>.
              </p>

              <button
                onClick={handleSaveAnnouncement}
                disabled={announcementSaving}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold transition-all duration-200 active:scale-95 shadow-sm"
              >
                {announcementSaving ? 'Menyimpan...' : 'Simpan Pengumuman'}
              </button>
            </div>
          </div>
        )}

      </main>

      {selectedPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
            onClick={() => { setSelectedPreview(null); setModalIframeLoading(true) }}
          />
          <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-4 p-5 border-b border-slate-200">
              <StudentAvatar kode={selectedPreview.kode} name={selectedPreview.nama_lengkap} className="w-12 h-12 text-base" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Pratinjau SKL</p>
                <h3 className="text-slate-900 font-bold text-lg truncate">{selectedPreview.nama_lengkap}</h3>
                <p className="text-sm text-slate-500">
                  Kelas: <span className="font-medium text-slate-700">{selectedPreview.kelas ?? '—'}</span>
                  {' · '}
                  Kode: <span className="font-medium text-slate-700">{selectedPreview.kode ?? '—'}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedPreview.kode && (
                  <a
                    href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ijazah-siswa/${selectedPreview.kode}.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium transition-all border border-indigo-200"
                  >
                    Buka Tab Baru
                  </a>
                )}
                <button
                  onClick={() => { setSelectedPreview(null); setModalIframeLoading(true) }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200"
                  title="Tutup"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {selectedPreview.kode ? (
              <div className="relative">
                {modalIframeLoading && (
                  <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center z-10" style={{ minHeight: '600px' }}>
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3" />
                    <p className="text-slate-500 text-sm">Memuat dokumen SKL...</p>
                  </div>
                )}
                <iframe
                  key={selectedPreview.kode}
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ijazah-siswa/${selectedPreview.kode}.pdf`)}&embedded=true`}
                  width="100%"
                  height="600px"
                  className="w-full block"
                  onLoad={() => setModalIframeLoading(false)}
                  title={`SKL - ${selectedPreview.nama_lengkap}`}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 p-6">
                <p className="text-red-500 text-sm">Kode identifikasi untuk siswa ini tidak tersedia. Pratinjau tidak dapat ditampilkan.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
