import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'
import TemplateGenerator from '../components/TemplateGenerator'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const DEFAULT_AVATAR = '/default-avatar.png'

const getStudentPhotoUrl = (kode, kelas, tahun_lulus) => {
  if (!kode) return null
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const folderKls = kelas ? kelas.replace(/\s+/g, '_') : 'Uncategorized'
  const folderThn = tahun_lulus ? `_${tahun_lulus.replace(/\s+/g, '_')}` : ''
  const folder = `foto-siswa/${folderKls}${folderThn}`

  if (cloudName && cloudName !== 'your_cloud_name') {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${folder}/${kode}.jpg`
  }
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/storage/v1/object/public/${folder}/${kode}.jpg`
}

const StudentAvatar = ({ kode, name, kelas, tahun_lulus, className = 'w-9 h-9 text-xs' }) => {
  const [hasError, setHasError] = useState(false)
  const initial = String(name ?? '?').trim().charAt(0).toUpperCase()
  const photoUrl = getStudentPhotoUrl(kode, kelas, tahun_lulus)

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

const Toggle = ({ value, onChange, disabled, colorOn = 'bg-green-500' }) => (
  <button onClick={() => onChange(!value)} disabled={disabled}
    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${value ? colorOn : 'bg-slate-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
)

function AnnouncementTypeSection({ type, students, uniqueClasses, onDelete, onRefresh }) {
  const [files, setFiles] = useState(new Set())
  const [fileUrls, setFileUrls] = useState({})
  const [fileAccess, setFileAccess] = useState({})
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResults, setUploadResults] = useState(null)
  const [activeTab, setActiveTab] = useState('dokumen')
  const [selectedPreview, setSelectedPreview] = useState(null)
  const [toggling, setToggling] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const inputRef = useRef(null)
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  useEffect(() => { fetchFiles() }, [type.id])

  const fetchFiles = async () => {
    const { data } = await supabase.from('berkas_pengumuman')
      .select('file_name, file_url, is_accessible')
      .eq('kode_jenis', type.kode_jenis)
    
    setFiles(new Set(data?.map(f => f.file_name) ?? []))
    setFileUrls(data?.reduce((acc, f) => ({...acc, [f.file_name]: f.file_url}), {}) ?? {})
    setFileAccess(data?.reduce((acc, f) => ({...acc, [f.file_name]: f.is_accessible}), {}) ?? {})
  }

  const handleToggle = async (field, value) => {
    setToggling(field)
    const { error } = await supabase.from('jenis_pengumuman').update({ [field]: value }).eq('id', type.id)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      onRefresh?.()
    }
    setToggling(null)
  }

  const handleToggleFileAccess = async (kode, fileName) => {
    const currentStatus = fileAccess[fileName]
    setToggling(fileName)
    const { error } = await supabase.from('berkas_pengumuman')
      .update({ is_accessible: !currentStatus })
      .match({ kode_siswa: kode, kode_jenis: type.kode_jenis })
    if (error) {
      alert('Gagal mengubah akses: ' + error.message)
    } else {
      setFileAccess(prev => ({ ...prev, [fileName]: !currentStatus }))
    }
    setToggling(null)
  }

  const handleBulkAccess = async (status) => {
    if (!window.confirm(`Anda yakin ingin ${status ? 'membuka' : 'menutup'} akses untuk semua siswa pada menu ini?`)) return
    const { error } = await supabase.from('berkas_pengumuman')
      .update({ is_accessible: status })
      .eq('kode_jenis', type.kode_jenis)
    if (error) {
      alert('Gagal mengubah akses: ' + error.message)
    } else {
      fetchFiles()
    }
  }

  const handleDownload = async (kode, nama) => {
    const fileName = `${kode}${type.kode_jenis}.pdf`
    const url = fileUrls[fileName]
    if (!url) { alert('File tidak ditemukan untuk ' + nama); return }
    window.open(url, '_blank')
  }

  const handleDeleteFile = async (kode, nama) => {
    const fileName = `${kode}${type.kode_jenis}.pdf`
    if (!window.confirm(`Hapus file "${fileName}" milik ${nama}?\nTindakan ini tidak dapat dibatalkan.`)) return
    const { error } = await supabase.from('berkas_pengumuman').delete().match({ kode_siswa: kode, kode_jenis: type.kode_jenis })
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    fetchFiles()
  }

  const handleUpload = async (filesList) => {
    if (!filesList?.length) return
    if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
      alert('Konfigurasi Cloudinary belum diatur di .env'); return
    }
    setIsUploading(true); setUploadResults(null)
    const validKodes = new Set(students.map(s => String(s.kode ?? '').trim()).filter(Boolean))
    const results = { success: [], failed: [], skipped: [] }
    
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i]
      setUploadProgress({ current: i + 1, total: filesList.length, fileName: file.name })
      const kode = file.name.replace(/\.[^/.]+$/, '').replace(new RegExp(`${type.kode_jenis}$`, 'i'), '').trim()
      
      if (validKodes.size > 0 && !validKodes.has(kode)) { results.skipped.push(file.name); continue }
      
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      const sanitizeName = (str) => (str || 'Lainnya').replace(/\s+/g, '_')
      formData.append('public_id', `${kode}${type.kode_jenis}`)
      formData.append('folder', `pengumuman/${sanitizeName(type.nama)}`)
      
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
          method: 'POST',
          body: formData
        })
        const data = await res.json()
        
        if (data.secure_url) {
          const { error } = await supabase.from('berkas_pengumuman').upsert({
            kode_siswa: kode,
            kode_jenis: type.kode_jenis,
            file_name: file.name,
            file_url: data.secure_url
          }, { onConflict: 'kode_siswa,kode_jenis' })
          
          if (error) {
            console.error(error)
            results.failed.push(file.name)
          } else {
            results.success.push(file.name)
          }
        } else {
          console.error(data)
          results.failed.push(file.name)
        }
      } catch (err) {
        console.error(err)
        results.failed.push(file.name)
      }
    }
    setIsUploading(false); setUploadProgress(null); setUploadResults(results)
    fetchFiles()
    if (inputRef.current) inputRef.current.value = ''
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return (!search || s.nama_lengkap?.toLowerCase().includes(q) || String(s.nisn ?? '').includes(q))
      && (classFilter === 'all' || s.kelas === classFilter)
  })

  return (
    <div className="animate-slide-up">
      <input ref={inputRef} type="file" multiple accept="application/pdf" className="hidden"
        onChange={e => handleUpload(Array.from(e.target.files))} />

      <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">{type.nama}</h2>
          <p className="text-slate-500 text-sm">Format berkas: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{'<kode>'}{type.kode_jenis}.pdf</code></p>
        </div>
      </div>

      <div className="flex gap-6 border-b border-slate-200 mb-6 mt-4">
        <button onClick={() => setActiveTab('dokumen')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'dokumen' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Daftar Dokumen
        </button>
        <button onClick={() => setActiveTab('generator')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'generator' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Auto-Generate PDF (Baru!)
        </button>
      </div>

      {activeTab === 'dokumen' ? (
        <>
          <div className="flex flex-wrap gap-2 justify-end mb-4">
            <button onClick={() => handleBulkAccess(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-sm font-medium transition-all active:scale-95 border border-teal-200">
              Buka Semua
            </button>
            <button onClick={() => handleBulkAccess(false)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium transition-all active:scale-95 border border-orange-200">
              Tutup Semua
            </button>
            <button onClick={() => inputRef.current?.click()} disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition-all active:scale-95">
              <IconUpload /> Upload PDF Massal
            </button>
            {onDelete && (
              <button onClick={onDelete}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 text-sm font-medium transition-all active:scale-95">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Hapus Jenis Pengumuman
              </button>
            )}
          </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Akses Siswa</p>
              <p className="text-xs text-slate-500 mt-0.5">Aktifkan agar siswa dapat membuka dokumen ini.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold ${type.aktif ? 'text-green-600' : 'text-slate-400'}`}>
                {toggling === 'aktif' ? '...' : type.aktif ? 'Aktif' : 'Nonaktif'}
              </span>
              <Toggle value={type.aktif} onChange={v => handleToggle('aktif', v)} disabled={toggling !== null} colorOn="bg-green-500" />
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Tampilkan di Menu Siswa</p>
              <p className="text-xs text-slate-500 mt-0.5">Sembunyikan agar menu ini tidak muncul untuk siswa.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold ${type.visible ? 'text-blue-600' : 'text-slate-400'}`}>
                {toggling === 'visible' ? '...' : type.visible ? 'Tampil' : 'Tersembunyi'}
              </span>
              <Toggle value={type.visible} onChange={v => handleToggle('visible', v)} disabled={toggling !== null} colorOn="bg-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {isUploading && uploadProgress && (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-700 font-medium">Mengunggah berkas...</p>
            <p className="text-xs text-slate-500">{uploadProgress.current} / {uploadProgress.total}</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
            <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-slate-400 truncate">{uploadProgress.fileName}</p>
        </div>
      )}

      {!isUploading && uploadResults && (
        <div className="mb-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-800 mb-3">Proses unggah selesai.</p>
          <div className="grid grid-cols-3 gap-3 text-center">
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
              <p className="text-xs text-red-700 font-medium mb-1">Gagal diunggah:</p>
              {uploadResults.failed.map(f => <p key={f} className="text-xs text-red-500">{f}</p>)}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau NISN..."
          className="flex-1 min-w-48 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
        {classFilter !== 'all' && (
          <button onClick={() => { setClassFilter('all'); setSearch(''); }}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Kembali ke Daftar Kelas
          </button>
        )}
      </div>

      {classFilter === 'all' && !search ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
          {uniqueClasses.map(k => {
            const count = students.filter(s => s.kelas === k).length;
            return (
              <button key={k} onClick={() => setClassFilter(k)}
                className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all group cursor-pointer text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-indigo-200 group-hover:text-indigo-400 mb-3 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.59 4.59C10.21 4.21 9.7 4 9.17 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-1.41-1.41z"/>
                </svg>
                <span className="text-base font-bold text-slate-800">{k}</span>
                <span className="text-xs text-slate-500 mt-1">{count} Siswa</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden animate-fade-in">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">
              {search ? 'Hasil Pencarian' : `Daftar Siswa Kelas ${classFilter}`}
            </h3>
            <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{filtered.length} siswa</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="text-center px-3 py-4 w-14">No</th>
                  <th className="text-left px-5 py-4">Foto</th>
                  <th className="text-left px-5 py-4">Nama Lengkap</th>
                  <th className="text-left px-5 py-4">NISN</th>
                  <th className="text-left px-5 py-4">Kelas</th>
                  <th className="text-left px-5 py-4">Berkas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-14 text-slate-400 text-sm">
                    {students.length === 0 ? 'Belum ada data siswa.' : 'Tidak ada data sesuai filter.'}
                  </td></tr>
                ) : filtered.map((s, i) => {
                  const hasFile = files.has(`${s.kode}${type.kode_jenis}.pdf`)
                  return (
                    <tr key={s.kode ?? s.nisn ?? i} className={`border-b border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/60'}`}>
                      <td className="text-center px-3 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-5 py-3"><StudentAvatar kode={s.kode} name={s.nama_lengkap} kelas={s.kelas} tahun_lulus={s.tahun_lulus} /></td>
                      <td className="px-5 py-3">
                        <button onClick={() => setSelectedPreview(s)}
                          className="text-slate-900 font-medium hover:text-indigo-600 transition-colors text-left">
                          {s.nama_lengkap}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{s.nisn ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{s.kelas ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        {hasFile ? (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <span className={`text-xs font-semibold ${fileAccess[`${s.kode}${type.kode_jenis}.pdf`] ? 'text-green-600' : 'text-slate-400'}`}>
                                {toggling === `${s.kode}${type.kode_jenis}.pdf` ? '...' : fileAccess[`${s.kode}${type.kode_jenis}.pdf`] ? 'Terbuka' : 'Tertutup'}
                              </span>
                              <Toggle 
                                value={fileAccess[`${s.kode}${type.kode_jenis}.pdf`]} 
                                onChange={() => handleToggleFileAccess(s.kode, `${s.kode}${type.kode_jenis}.pdf`)} 
                                disabled={toggling === `${s.kode}${type.kode_jenis}.pdf`} 
                                colorOn="bg-green-500" 
                              />
                            </div>
                            <div className="w-px h-6 bg-slate-200 mx-1"></div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleDownload(s.kode, s.nama_lengkap)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium border border-green-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                Unduh
                              </button>
                              <button onClick={() => handleDeleteFile(s.kode, s.nama_lengkap)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium border border-red-200" title="Hapus file">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                                Hapus
                              </button>
                            </div>
                          </div>
                        ) : <span className="text-red-500 text-xs font-medium">Belum tersedia</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      ) : (
        <TemplateGenerator type={type} students={students} onRefresh={onRefresh} />
      )}

      {selectedPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4 animate-fade-in">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
            onClick={() => setSelectedPreview(null)} />
          <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center gap-4 p-5 border-b border-slate-200">
              <StudentAvatar kode={selectedPreview.kode} name={selectedPreview.nama_lengkap} kelas={selectedPreview.kelas} tahun_lulus={selectedPreview.tahun_lulus} className="w-12 h-12 text-base" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Pratinjau — {type.nama}</p>
                <h3 className="text-slate-900 font-bold text-lg truncate">{selectedPreview.nama_lengkap}</h3>
                <p className="text-sm text-slate-500">Kelas: <span className="font-medium text-slate-700">{selectedPreview.kelas ?? '—'}</span></p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedPreview.kode && fileUrls[`${selectedPreview.kode}${type.kode_jenis}.pdf`] && (
                  <a href={fileUrls[`${selectedPreview.kode}${type.kode_jenis}.pdf`]}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium border border-indigo-200">
                    Buka Tab Baru
                  </a>
                )}
                <button onClick={() => setSelectedPreview(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            {selectedPreview.kode && fileUrls[`${selectedPreview.kode}${type.kode_jenis}.pdf`] ? (
              <div className="bg-slate-50">
                <iframe
                  key={selectedPreview.kode + type.kode_jenis}
                  src={fileUrls[`${selectedPreview.kode}${type.kode_jenis}.pdf`]}
                  width="100%"
                  height="650px"
                  className="w-full block"
                  title={`${type.nama} - ${selectedPreview.nama_lengkap}`}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 p-6">
                <p className="text-red-500 text-sm">Kode siswa tidak tersedia.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Admin() {
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [announcementSaving, setAnnouncementSaving] = useState(false)
  const [announcementMsg, setAnnouncementMsg] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newType, setNewType] = useState({ nama: '', kode_jenis: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [csvSyncing, setCsvSyncing] = useState(false)
  const [csvResult, setCsvResult] = useState(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoProgress, setPhotoProgress] = useState(null)
  const csvInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  useEffect(() => {
    let handled = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return
      if (handled) return
      handled = true
      if (!session) { navigate('/'); return }
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
      if (adminEmail && session.user.email !== adminEmail) { navigate('/dashboard'); return }
      setAuthLoading(false)
      fetchMenuTypes()
      fetchStudents()
      fetchAnnouncement()
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siswa' }, fetchStudents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jenis_pengumuman' }, fetchMenuTypes)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [authLoading])

  const fetchMenuTypes = async () => {
    const { data } = await supabase.from('jenis_pengumuman').select('*').order('urutan')
    if (data) {
      setMenuTypes(data)
      setActiveMenu(prev => prev ?? data[0]?.id ?? 'konfigurasi')
    }
  }

  const fetchStudents = async () => {
    setStudentsLoading(true)
    const { data } = await supabase.from('siswa').select('*').order('nama_lengkap')
    if (data) setStudents(data)
    setStudentsLoading(false)
  }

  const fetchAnnouncement = async () => {
    const { data } = await supabase.from('pengaturan').select('nilai').eq('kunci', 'teks_pengumuman').maybeSingle()
    setAnnouncement(data?.nilai ?? '')
  }

  const handleSaveAnnouncement = async () => {
    setAnnouncementSaving(true); setAnnouncementMsg(null)
    const { error } = await supabase.from('pengaturan').upsert({ kunci: 'teks_pengumuman', nilai: announcement }, { onConflict: 'kunci' })
    setAnnouncementSaving(false)
    setAnnouncementMsg(error ? { type: 'error', text: 'Gagal menyimpan.' } : { type: 'success', text: 'Berhasil disimpan!' })
  }

  const handleCsvSync = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvSyncing(true)
    setCsvResult(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data
        if (!rows || rows.length === 0) {
          setCsvResult({ type: 'error', text: 'File CSV kosong atau format tidak sesuai.' })
          setCsvSyncing(false)
          if (csvInputRef.current) csvInputRef.current.value = ''
          return
        }

        const validStudents = rows.map(r => {
          const kode = (r['kode'] || r['KODE'] || '').trim()
          const rawEmail = (r['email_aktif'] || r['EMAIL AKTIF'] || '').trim()
          return {
            kode: kode || null,
            nama_lengkap: (r['nama_lengkap'] || r['NAMA LENGKAP'] || '').trim() || null,
            kelas: (r['kelas'] || r['KELAS SEKARANG'] || r['KELAS BARU'] || '').trim() || null,
            email_aktif: rawEmail || null,
            no_whatsapp: (r['no_whatsapp'] || r['NO. WHATSAPP'] || '').trim() || null,
            nipd: (r['nipd'] || r['NIPD'] || '').trim() || null,
            nisn: (r['nisn'] || r['NISN'] || '').trim() || null,
            tahun_lulus: (r['tahun_lulus'] || r['TAHUN LULUS'] || '').trim() || null,
            kode_akses: (r['kode_akses'] || r['KODE AKSES'] || '').trim() || null,
            file_path: (r['file_path'] || r['FILE PATH'] || '').trim() || '-'
          }
        }).filter(s => s.kode)

        if (validStudents.length === 0) {
          setCsvResult({ type: 'error', text: 'Tidak ditemukan data siswa dengan kolom KODE.' })
          setCsvSyncing(false)
          if (csvInputRef.current) csvInputRef.current.value = ''
          return
        }

        const { error } = await supabase.from('siswa').upsert(validStudents, { onConflict: 'kode' })
        
        setCsvSyncing(false)
        if (error) {
          setCsvResult({ type: 'error', text: `Gagal sinkronisasi: ${error.message}` })
        } else {
          setCsvResult({ type: 'success', text: `Berhasil sinkronisasi ${validStudents.length} data siswa.` })
          fetchStudents()
        }
        
        if (csvInputRef.current) csvInputRef.current.value = ''
      },
      error: (err) => {
        setCsvResult({ type: 'error', text: `Gagal membaca CSV: ${err.message}` })
        setCsvSyncing(false)
        if (csvInputRef.current) csvInputRef.current.value = ''
      }
    })
  }

  const handleBulkPhotoUpload = async (files) => {
    if (!files || files.length === 0) return
    if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
      alert('Konfigurasi Cloudinary belum diatur di file .env')
      return
    }

    setPhotoUploading(true)
    let success = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setPhotoProgress({ current: i + 1, total: files.length, name: file.name })
      
      const fileName = file.name.split('.')[0] // get code without extension
      const student = students.find(s => s.kode === fileName)
      const sanitize = (str) => (str || '').replace(/\s+/g, '_')
      const kls = sanitize(student?.kelas) || 'Uncategorized'
      const thn = student?.tahun_lulus ? `_${sanitize(student.tahun_lulus)}` : ''
      const folderName = `foto-siswa/${kls}${thn}`

      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('public_id', fileName)
      formData.append('folder', folderName)

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          success++
        } else {
          failed++
          const errData = await res.json()
          console.error(`Upload failed for ${file.name}:`, errData)
        }
      } catch (err) {
        failed++
        console.error(`Network error for ${file.name}:`, err)
      }
    }

    setPhotoUploading(false)
    setPhotoProgress(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    alert(`Upload Foto Selesai!\nBerhasil: ${success}\nGagal: ${failed}`)
  }

  const handleAddType = async () => {
    setAddSaving(true); setAddError(null)
    const { error } = await supabase.from('jenis_pengumuman').insert({
      nama: newType.nama.trim(),
      kode_jenis: newType.kode_jenis.trim().toUpperCase(),
      aktif: false, visible: true, urutan: menuTypes.length + 1,
    })
    setAddSaving(false)
    if (error) { setAddError(error.message); return }
    setShowAddModal(false); setNewType({ nama: '', kode_jenis: '' }); fetchMenuTypes()
  }

  const handleDeleteType = async () => {
    if (!activeType) return
    if (!window.confirm(`Hapus jenis "${activeType.nama}"?\nTindakan ini tidak dapat dibatalkan.`)) return
    const kodeJenis = activeType.kode_jenis
    
    // Hapus records di tabel berkas_pengumuman
    const { error: rmError } = await supabase.from('berkas_pengumuman').delete().eq('kode_jenis', kodeJenis)
    if (rmError) { alert('Gagal menghapus file terkait: ' + rmError.message); return }
    
    const { error } = await supabase.from('jenis_pengumuman').delete().eq('id', activeType.id)
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    const remaining = menuTypes.filter(t => t.id !== activeType.id)
    setActiveMenu(remaining[0]?.id ?? 'konfigurasi')
    fetchMenuTypes()
  }

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/') }

  const uniqueClasses = [...new Set(students.map(s => s.kelas).filter(Boolean))].sort()
  const activeType = menuTypes.find(t => t.id === activeMenu)

  if (authLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Memverifikasi akses Administrator...</p>
      </div>
    </div>
  )

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex min-h-screen bg-slate-50 animate-fade-in">

      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden animate-fade-in" onClick={closeSidebar} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 md:z-auto ${
        sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="border border-slate-200 rounded-xl shadow-sm p-1 bg-white shrink-0">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">SMP BUDI MULIA</p>
              <p className="text-slate-500 text-xs mt-0.5">Panel Administrator</p>
            </div>
          </div>
          <button onClick={closeSidebar} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Jenis Pengumuman</p>
          {menuTypes.map(type => (
            <button key={type.id} onClick={() => { setActiveMenu(type.id); closeSidebar() }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeMenu === type.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>
              <IconFile />
              <span className="truncate flex-1 text-left">{type.nama}</span>
              {!type.visible && <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded shrink-0">Hidden</span>}
            </button>
          ))}
          <button onClick={() => { setShowAddModal(true); closeSidebar() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-all border border-dashed border-indigo-200 mt-2">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Tambah Jenis
          </button>
          <div className="pt-2 border-t border-slate-100 mt-2">
            <button onClick={() => { setActiveMenu('konfigurasi'); closeSidebar() }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeMenu === 'konfigurasi' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>
              <IconSettings /> Konfigurasi
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">
            <IconLogout /> Keluar dari Sistem
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{activeType?.nama ?? 'Konfigurasi'}</p>
            <p className="text-slate-400 text-xs">Panel Administrator</p>
          </div>
        </div>

        <div className="p-4 md:p-8">
        {activeType && !studentsLoading && (
          <AnnouncementTypeSection key={activeType.id} type={activeType} students={students} uniqueClasses={uniqueClasses} onDelete={handleDeleteType} onRefresh={fetchMenuTypes} />
        )}
        {activeType && studentsLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {activeMenu === 'konfigurasi' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Konfigurasi</h2>
            <p className="text-slate-500 text-sm mb-6">Teks pengumuman yang tampil di dashboard siswa.</p>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
              {announcementMsg && (
                <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${announcementMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {announcementMsg.text}
                </div>
              )}
              <label className="block text-sm font-medium text-slate-700 mb-2">Teks Pengumuman Resmi</label>
              <textarea rows={8} value={announcement} onChange={e => { setAnnouncement(e.target.value); setAnnouncementMsg(null) }}
                placeholder="Contoh: Selamat kepada seluruh siswa yang telah dinyatakan LULUS..."
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none" />
              <button onClick={handleSaveAnnouncement} disabled={announcementSaving}
                className="mt-4 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold transition-all active:scale-95">
                {announcementSaving ? 'Menyimpan...' : 'Simpan Pengumuman'}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl mt-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Sinkronisasi Data Siswa (CSV)</h3>
              <p className="text-slate-500 text-sm mb-4">Unggah file CSV dari spreadsheet untuk memperbarui biodata siswa secara massal. Pastikan terdapat kolom <strong>kode</strong> di dalam file tersebut.</p>
              
              {csvResult && (
                <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${csvResult.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {csvResult.text}
                </div>
              )}

              <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvSync} />
              
              <button onClick={() => csvInputRef.current?.click()} disabled={csvSyncing}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-semibold transition-all active:scale-95 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {csvSyncing ? 'Memproses CSV...' : 'Pilih File CSV & Sinkronisasi'}
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl mt-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Upload Foto Siswa Massal</h3>
              <p className="text-slate-500 text-sm mb-4">Pilih banyak file foto sekaligus (JPG/PNG). Pastikan nama file foto **sama persis** dengan kode siswa (contoh: <code>8A12026_2027.jpg</code>).</p>
              
              {photoProgress && (
                <div className="mb-5 p-4 rounded-xl border border-indigo-200 bg-indigo-50">
                  <div className="flex justify-between text-xs font-semibold text-indigo-800 mb-2">
                    <span>Mengunggah: {photoProgress.name}</span>
                    <span>{photoProgress.current} / {photoProgress.total}</span>
                  </div>
                  <div className="w-full bg-indigo-200 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(photoProgress.current / photoProgress.total) * 100}%` }}></div>
                  </div>
                </div>
              )}

              <input ref={photoInputRef} type="file" multiple accept="image/jpeg, image/png" className="hidden" onChange={e => handleBulkPhotoUpload(Array.from(e.target.files))} />
              
              <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition-all active:scale-95 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                {photoUploading ? 'Mengunggah Foto...' : 'Pilih Foto & Upload'}
              </button>
            </div>
          </div>
        )}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Tambah Jenis Pengumuman</h3>
            {addError && <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">{addError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Menu</label>
                <input type="text" value={newType.nama} onChange={e => setNewType(p => ({ ...p, nama: e.target.value }))}
                  placeholder="contoh: Raport PTS Semester 1"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kode Jenis</label>
                <input type="text" value={newType.kode_jenis} onChange={e => setNewType(p => ({ ...p, kode_jenis: e.target.value.toUpperCase() }))}
                  placeholder="contoh: PTS1"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-slate-400 mt-1">
                  File akan dinamai: <code className="bg-slate-100 px-1 rounded">{`<kode_siswa>${newType.kode_jenis || 'KODE'}.pdf`}</code>
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAddModal(false); setAddError(null) }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                Batal
              </button>
              <button onClick={handleAddType} disabled={addSaving || !newType.nama.trim() || !newType.kode_jenis.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold transition active:scale-95">
                {addSaving ? 'Menyimpan...' : 'Tambah'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin
