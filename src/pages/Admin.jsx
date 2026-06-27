import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import TemplateGenerator from '../components/TemplateGenerator'
import AdminRoleSection from '../components/AdminRoleSection'
import AdminGuruSection from '../components/AdminGuruSection'
import AdminDashboardSection from '../components/AdminDashboardSection'
import AdminActivityLogSection from '../components/AdminActivityLogSection'
import AdminPersonalisasiSection from '../components/AdminPersonalisasiSection'
import AdminMapelSection from '../components/AdminMapelSection'
import AdminBerandaConfigSection from '../components/AdminBerandaConfigSection'
import AdminManajemenAkunSection from '../components/AdminManajemenAkunSection'
import AdminBeritaSection from '../components/AdminBeritaSection'
import AdminNotifikasiSection from '../components/AdminNotifikasiSection'
import AdminVerifikasiModal from '../components/AdminVerifikasiModal'
import AdminSemesterSection from '../components/AdminSemesterSection'
import AdminPresensiConfigSection from '../components/AdminPresensiConfigSection'
import CollapsibleSection from '../components/CollapsibleSection'
import AdminTataTertibSection from '../components/AdminTataTertibSection'
import AdminKatalogPoinSection from '../components/AdminKatalogPoinSection'
import AdminTahapPembinaanSection from '../components/AdminTahapPembinaanSection'
import AdminCatatPoinSection from '../components/AdminCatatPoinSection'
import AdminPengaturanPoinSection from '../components/AdminPengaturanPoinSection'
import { logActivity } from '../utils/logger'
import { globalUploadManager, useUploadManager } from '../utils/uploadManager'
import { useConfirm } from '../utils/useConfirm'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const DEFAULT_AVATAR = '/default-avatar.png'

const getFallbackPhotoUrls = (student, allFotos) => {
  if (!student || !student.nisn) return []
  const matches = allFotos.filter(f => f.nisn === student.nisn)
  matches.sort((a, b) => (b.tahun_ajaran?.nama || '').localeCompare(a.tahun_ajaran?.nama || ''))
  return [...new Set(matches.map(m => m.cloudinary_url).filter(Boolean))]
}

const StudentAvatar = ({ fallbackUrls = [], name, className = 'w-9 h-9 text-xs' }) => {
  const [photoIndex, setPhotoIndex] = useState(0)
  const initial = String(name ?? '?').trim().charAt(0).toUpperCase()
  const photoUrl = fallbackUrls[photoIndex]

  if (!photoUrl) {
    return (
      <div className={`${className} rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold shrink-0 select-none`}>
        {initial}
      </div>
    )
  }

  return (
    <img
      key={photoUrl}
      src={photoUrl}
      alt={name}
      className={`${className} rounded-full object-cover bg-slate-100 border border-slate-200 shrink-0`}
      onError={() => setPhotoIndex(prev => prev + 1)}
    />
  )
}

const IconUsers = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconFile = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconSettings = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconUpload = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)
const IconLogout = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const IconTeacher = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
)
const IconShield = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const IconDashboard = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
  </svg>
)
const IconActivity = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconMessage = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
)

const Toggle = ({ value, onChange, disabled, colorOn="bg-indigo-500" }) => (
  <div onClick={() => !disabled && onChange(!value)}
    className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${value ? colorOn : 'bg-slate-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ${value ? 'translate-x-4' : 'translate-x-0'}`} />
  </div>
)

function AnnouncementTypeSection({ type, students, allFotos, uniqueClasses, activeTa, onDelete, onRefresh }) {
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [files, setFiles] = useState(new Set())
  const [fileUrls, setFileUrls] = useState({})
  const [fileNames, setFileNames] = useState({})
  const [fileAccess, setFileAccess] = useState({})
  const [fileReqs, setFileReqs] = useState({})
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [reqFilter, setReqFilter] = useState('all')
  const [fileFilter, setFileFilter] = useState('all')
  const { isUploading, progress: uploadProgress, results: uploadResults } = useUploadManager()
  const [activeTab, setActiveTab] = useState('dokumen')
  const [selectedPreview, setSelectedPreview] = useState(null)
  const [toggling, setToggling] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const inputRef = useRef(null)
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const uniqueStudentCount = new Set(students.map(s => s.nisn)).size
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => { 
    fetchFiles()
    fetchActivityLogs()

    // Supabase Realtime — menggantikan polling setInterval 2 detik untuk activity_log
    const channel = supabase.channel(`admin-activity-log-${type.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_log' },
        (payload) => {
          const detail = payload.new?.detail || payload.old?.detail || ''
          if (detail.includes(type.nama)) {
            fetchActivityLogs()
          }
        }
      )
      .subscribe()
    // Listener untuk sync realtime antar perangkat admin/guru
    const broadcastChannel = supabase.channel('dashboard-updates-all')
      .on('broadcast', { event: 'berkas_updated' }, () => {
        console.log('[REALTIME SYNC] Berkas updated by other user, refetching...')
        fetchFiles()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(broadcastChannel)
    }
  }, [type.id])

  const fetchActivityLogs = async () => {
    const { data } = await supabase.from('activity_log')
      .select('*')
      .eq('aksi', 'Unduh Dokumen')
      .ilike('detail', `%${type.nama}%`)
    setActivityLogs(data || [])
  }

  const fetchFiles = async () => {
    const { data } = await supabase.from('berkas_pengumuman')
      .select('kode_siswa, file_name, file_url, is_accessible, persyaratan_terpenuhi')
      .eq('kode_jenis', type.kode_jenis)
    
    setFiles(new Set(data?.filter(f => f.file_url && f.file_url !== '-').map(f => f.kode_siswa) ?? []))
    setFileUrls(data?.reduce((acc, f) => (f.file_url && f.file_url !== '-') ? {...acc, [f.kode_siswa]: f.file_url} : acc, {}) ?? {})
    setFileNames(data?.reduce((acc, f) => ({...acc, [f.kode_siswa]: f.file_name}), {}) ?? {})
    setFileAccess(data?.reduce((acc, f) => ({...acc, [f.kode_siswa]: f.is_accessible}), {}) ?? {})
    setFileReqs(data?.reduce((acc, f) => ({...acc, [f.kode_siswa]: f.persyaratan_terpenuhi || {}}), {}) ?? {})
  }

  const handleToggleReq = async (kode, reqId) => {
    const currentReqs = fileReqs[kode] || {}
    const newStatus = !currentReqs[reqId]
    const updatedReqs = { ...currentReqs, [reqId]: newStatus }
    
    setToggling(`${kode}_req_${reqId}`)
    
    const { error: upsertErr } = await supabase.from('berkas_pengumuman').upsert({
      kode_siswa: kode,
      kode_jenis: type.kode_jenis,
      persyaratan_terpenuhi: updatedReqs,
      file_name: fileNames[kode] || '-',
      file_url: fileUrls[kode] || '-'
    }, { onConflict: 'kode_siswa,kode_jenis' })
    
    if (upsertErr) {
      alert('Gagal: ' + upsertErr.message)
    } else {
      setFileReqs(prev => ({ ...prev, [kode]: updatedReqs }))
      supabase.channel('dashboard-updates-all').send({
        type: 'broadcast',
        event: 'berkas_updated',
        payload: { kode_siswa: kode }
      })
    }
    
    setToggling(null)
  }

  const handleMassToggleReq = async (reqId, targetStatus) => {
    const confirmed = await requestConfirm({
      title: targetStatus ? 'Centang Semua Syarat?' : 'Hapus Centang Semua?',
      message: `Anda yakin ingin ${targetStatus ? 'mencentang' : 'menghapus centang'} syarat ini untuk semua siswa yang tampil di bawah?`,
      confirmLabel: targetStatus ? 'Ya, Centang Semua' : 'Ya, Hapus Centang',
      confirmColor: targetStatus ? 'green' : 'red',
      icon: 'warning',
    })
    if (!confirmed) return
    const codes = filtered.map(s => s.kode).filter(Boolean)
    if (codes.length === 0) return
    setToggling(`mass_req_${reqId}`)
    
    const upserts = codes.map(kode => {
      const currentReqs = fileReqs[kode] || {}
      return {
        kode_siswa: kode,
        kode_jenis: type.kode_jenis,
        persyaratan_terpenuhi: { ...currentReqs, [reqId]: targetStatus },
        file_name: fileNames[kode] || '-',
        file_url: fileUrls[kode] || '-'
      }
    })
    
    const { error } = await supabase.from('berkas_pengumuman').upsert(upserts, { onConflict: 'kode_siswa,kode_jenis' })
    if (error) {
      alert('Gagal mengubah massal: ' + error.message)
    } else {
      const newFileReqs = { ...fileReqs }
      codes.forEach(kode => {
        newFileReqs[kode] = { ...(newFileReqs[kode] || {}), [reqId]: targetStatus }
      })
      setFileReqs(newFileReqs)
      supabase.channel('dashboard-updates-all').send({
        type: 'broadcast',
        event: 'berkas_updated',
        payload: { kode_siswa: 'ALL' }
      })
    }
    setToggling(null)
  }

  const handleToggle = async (field, value) => {
    setToggling(field)
    const { error } = await supabase.from('jenis_pengumuman').update({ [field]: value }).eq('id', type.id)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      logActivity({
        userRole: 'Administrator',
        action: 'Update Jenis Pengumuman',
        details: `Mengubah properti ${field} menjadi ${value} pada pengumuman ${type.nama}.`
      })
      const channel = supabase.channel('jenis-updates-all')
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'jenis_updated'
          })
          setTimeout(() => supabase.removeChannel(channel), 1000)
        }
      })
      onRefresh?.()
    }
    setToggling(null)
  }

  const handleToggleFileAccess = async (kode) => {
    const currentStatus = fileAccess[kode]
    setToggling(kode)
    const { error } = await supabase.from('berkas_pengumuman')
      .update({ is_accessible: !currentStatus })
      .match({ kode_siswa: kode, kode_jenis: type.kode_jenis })
    if (error) {
      alert('Gagal mengubah akses: ' + error.message)
    } else {
      setFileAccess(prev => ({ ...prev, [kode]: !currentStatus }))
      logActivity({
        userRole: 'Administrator',
        action: 'Toggle Akses File',
        details: `${!currentStatus ? 'Membuka' : 'Menutup'} akses dokumen untuk kode siswa ${kode}.`
      })
    }
    setToggling(null)
  }

  const handleBulkAccess = async (status) => {
    const confirmed = await requestConfirm({
      title: status ? 'Buka Akses Semua Siswa?' : 'Tutup Akses Semua Siswa?',
      message: `Anda yakin ingin ${status ? 'membuka' : 'menutup'} akses untuk semua siswa pada menu ini?`,
      confirmLabel: status ? 'Buka Semua' : 'Tutup Semua',
      confirmColor: status ? 'green' : 'red',
      icon: 'warning',
    })
    if (!confirmed) return
    const { error } = await supabase.from('berkas_pengumuman')
      .update({ is_accessible: status })
      .eq('kode_jenis', type.kode_jenis)
    if (error) {
      alert('Gagal mengubah akses: ' + error.message)
    } else {
      logActivity({
        userRole: 'Administrator',
        action: 'Ubah Akses Dokumen Massal',
        details: `${status ? 'Membuka' : 'Menutup'} akses semua file untuk pengumuman ${type.nama}.`
      })
      fetchFiles()
    }
  }

  const handleDownloadTemplate = () => {
    const sortedFiltered = [...students].sort((a, b) => {
      const classA = a.kelas || ''
      const classB = b.kelas || ''
      if (classA !== classB) return classA.localeCompare(classB)
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
    })

    const dataToExport = sortedFiltered.map((s, i) => {
      const fileName = `${s.kode}${type.kode_jenis}.pdf`
      return {
        'No': i + 1,
        'NAMA FILE PDF (WAJIB SAMA PERSIS)': fileName,
        'NISN': s.nisn || '',
        'Nama Lengkap': s.nama_lengkap || '',
        'Kelas': s.kelas || '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    ws['!cols'] = [
      { wch: 5 },
      { wch: 45 },
      { wch: 15 },
      { wch: 35 },
      { wch: 10 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Template PDF')
    XLSX.writeFile(wb, `Template_Penamaan_PDF_${type.nama.replace(/\s+/g, '_')}.xlsx`)
  }

  const handleDownload = async (kode, nama) => {
    const url = fileUrls[kode]
    if (!url || url === '-') { alert('File tidak ditemukan untuk ' + nama); return }
    window.open(url, '_blank')
  }

  const handleDeleteFile = async (kode, nama) => {
    const fileName = fileNames[kode] || `${kode}${type.kode_jenis}.pdf`
    const confirmed = await requestConfirm({
      title: 'Hapus File?',
      message: `Hapus file "${fileName}" milik ${nama}?\nTindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus File',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('berkas_pengumuman').delete().match({ kode_siswa: kode, kode_jenis: type.kode_jenis })
    if (error) { alert('Gagal menghapus: ' + error.message); return }
    fetchFiles()
  }

  const handleResetStatusUnduh = async (nama_lengkap) => {
    const confirmed = await requestConfirm({
      title: 'Reset Status Unduh?',
      message: `Yakin ingin mereset status unduh untuk ${nama_lengkap}?`,
      confirmLabel: 'Reset',
      confirmColor: 'indigo',
      icon: 'warning',
    })
    if (!confirmed) return
    
    const { error } = await supabase.from('activity_log')
      .delete()
      .match({ aksi: 'Unduh Dokumen' })
      .ilike('detail', `%${type.nama}%`)
      .ilike('detail', `%${nama_lengkap}%`)
      
    if (error) {
      alert('Gagal mereset status: ' + error.message)
    } else {
      fetchActivityLogs()
      logActivity({
        userRole: 'Administrator',
        action: 'Reset Status Unduh',
        details: `Mereset status unduh dokumen ${type.nama} untuk siswa ${nama_lengkap}.`
      })
    }
  }

  const handleUpload = async (filesList) => {
    if (!filesList?.length) return
    if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
      alert('Konfigurasi Cloudinary belum diatur di .env'); return
    }
    
    // Gunakan global manager alih-alih state lokal
    globalUploadManager.startUpload()
    
    const validKodes = new Set(students.map(s => String(s.kode ?? '').trim()).filter(Boolean))
    const results = { success: [], failed: [], skipped: [] }
    
    for (let i = 0; i < filesList.length; i++) {
      if (globalUploadManager.getState().cancelFlag) {
        break; // Hentikan upload jika dibatalkan pengguna
      }
      
      const file = filesList[i]
      globalUploadManager.updateProgress(i + 1, filesList.length, file.name)
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
    
    globalUploadManager.finishUpload(results)
    
    fetchFiles()
    if (inputRef.current) inputRef.current.value = ''
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || (s.nama_lengkap?.toLowerCase().includes(q)) || (s.nisn?.includes(q))
    const matchClass = classFilter === 'all' || s.kelas === classFilter
    
    let matchReq = true
    if (type.persyaratan && type.persyaratan.length > 0 && reqFilter !== 'all') {
      const terpenuhi = fileReqs[s.kode] || {}
      if (reqFilter === 'fulfilled') {
        if (!type.persyaratan.every(req => terpenuhi[req.id])) matchReq = false
      } else if (reqFilter === 'unfulfilled') {
        if (type.persyaratan.every(req => terpenuhi[req.id])) matchReq = false
      } else if (reqFilter.startsWith('fulfilled_')) {
        const reqId = reqFilter.replace('fulfilled_', '')
        if (!terpenuhi[reqId]) matchReq = false
      } else if (reqFilter.startsWith('unfulfilled_')) {
        const reqId = reqFilter.replace('unfulfilled_', '')
        if (terpenuhi[reqId]) matchReq = false
      }
    }

    let matchFile = true
    if (fileFilter !== 'all') {
      const hasFile = !!fileUrls[s.kode]
      if (fileFilter === 'has_file' && !hasFile) matchFile = false
      if (fileFilter === 'no_file' && hasFile) matchFile = false
    }

    return matchSearch && matchClass && matchReq && matchFile
  })

  // Stats calculations
  const statsStudentsWithFile = students.filter(s => files.has(s.kode)).length
  const statsAllReqMet = type.persyaratan && type.persyaratan.length > 0
    ? students.filter(s => {
        const terpenuhi = fileReqs[s.kode] || {}
        return type.persyaratan.every(req => terpenuhi[req.id])
      }).length
    : null
  const statsClassProgress = uniqueClasses.map(c => {
    const classStudents = students.filter(s => s.kelas === c)
    const total = classStudents.length
    const withFile = classStudents.filter(s => files.has(s.kode)).length
    const allMet = type.persyaratan && type.persyaratan.length > 0
      ? classStudents.filter(s => {
          const t = fileReqs[s.kode] || {}
          return type.persyaratan.every(req => t[req.id])
        }).length
      : withFile
    return { kelas: c, total, withFile, allMet, pct: total > 0 ? Math.round((allMet / total) * 100) : 0 }
  })

  const hasActiveFilters = classFilter !== 'all' || reqFilter !== 'all' || fileFilter !== 'all' || search

  return (
    <div className="animate-slide-up flex flex-col h-auto lg:h-[calc(100vh-120px)] min-h-[calc(100vh-120px)]">
      {ConfirmModalComponent}
      <input ref={inputRef} type="file" multiple accept="application/pdf" className="hidden"
        onChange={e => handleUpload(Array.from(e.target.files))} />

      {/* STICKY TOP SECTION */}
      <div className="shrink-0">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{type.nama}</h2>
            <p className="text-slate-500 text-xs mt-0.5">Format berkas: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{'<kode>'}{type.kode_jenis}.pdf</code></p>
          </div>
        </div>

        <div className="flex gap-4 border-b border-slate-200 mb-4">
          <button onClick={() => setActiveTab('dokumen')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'dokumen' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Daftar Dokumen
          </button>
          <button onClick={() => setActiveTab('generator')}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'generator' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Auto-Generate PDF
          </button>
        </div>

        {activeTab === 'dokumen' && (
          <>
            {/* STATS DASHBOARD */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Siswa</p>
                <p className="text-xl font-bold text-slate-800 mt-0.5">{uniqueStudentCount}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ada Berkas</p>
                <p className="text-xl font-bold text-emerald-600 mt-0.5">{statsStudentsWithFile}</p>
              </div>
              {statsAllReqMet !== null && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Syarat Lengkap</p>
                  <p className="text-xl font-bold text-blue-600 mt-0.5">{statsAllReqMet}</p>
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Belum Ada Berkas</p>
                <p className="text-xl font-bold text-red-500 mt-0.5">{uniqueStudentCount - statsStudentsWithFile}</p>
              </div>
            </div>


            {/* CONTROL TOGGLES & ACTION BUTTONS */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-600 font-medium">Akses</span>
                <Toggle value={type.aktif} onChange={v => handleToggle('aktif', v)} disabled={toggling !== null} colorOn="bg-green-500" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-600 font-medium">Tampil (Siswa)</span>
                <Toggle value={type.visible} onChange={v => handleToggle('visible', v)} disabled={toggling !== null} colorOn="bg-blue-500" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-600 font-medium">Tampil (Guru)</span>
                <Toggle value={type.visible_guru ?? true} onChange={v => handleToggle('visible_guru', v)} disabled={toggling !== null} colorOn="bg-cyan-500" />
              </div>
              <div className="flex-1" />
              {type.persyaratan && type.persyaratan.length > 0 && (
                <button onClick={() => setShowVerificationModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium transition-all border border-purple-200">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Verifikasi Massal
                </button>
              )}
              <button onClick={() => handleBulkAccess(true)} className="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-medium border border-teal-200">Buka Semua</button>
              <button onClick={() => handleBulkAccess(false)} className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium border border-orange-200">Tutup Semua</button>
              <button onClick={handleDownloadTemplate} disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium transition-all">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Template Penamaan PDF
              </button>
              <button onClick={() => inputRef.current?.click()} disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium transition-all">
                <IconUpload /> Upload PDF
            </button>
              {onDelete && (
                <button onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 text-xs font-medium transition-all">Hapus</button>
              )}
            </div>

            {/* UPLOAD PROGRESS */}
            {isUploading && uploadProgress && !globalUploadManager.getState().minimized && (
              <div className="mb-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-700 font-medium">Mengunggah...</p>
                  <p className="text-[10px] text-slate-500">{uploadProgress.current}/{uploadProgress.total}</p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            {!isUploading && uploadResults && (
              <div className="mb-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-lg py-2">
                    <p className="text-lg font-bold text-green-700">{uploadResults.success.length}</p>
                    <p className="text-[10px] text-green-600">Berhasil</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg py-2">
                    <p className="text-lg font-bold text-amber-700">{uploadResults.skipped.length}</p>
                    <p className="text-[10px] text-amber-600">Dilewati</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg py-2">
                    <p className="text-lg font-bold text-red-700">{uploadResults.failed.length}</p>
                    <p className="text-[10px] text-red-600">Gagal</p>
                  </div>
                </div>
              </div>
            )}


          </>
        )}
      </div>

      {/* SCROLLABLE TABLE SECTION */}
      {activeTab === 'dokumen' ? (
        <div className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row gap-4">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] lg:min-h-0 min-w-0">
            {/* UNIFIED FILTERS */}
            <div className="p-4 border-b border-slate-100 flex flex-col gap-3 shrink-0 bg-white">
              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input type="text" placeholder="Cari nama atau NISN..." value={search} onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                </div>

                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                  <option value="all">Semua Kelas ({students.length})</option>
                  {uniqueClasses.map(c => {
                    const count = students.filter(s => s.kelas === c).length
                    return <option key={c} value={c}>{c} ({count})</option>
                  })}
                </select>

                <select value={fileFilter} onChange={e => setFileFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                  <option value="all">Semua Berkas</option>
                  <option value="has_file">✅ Ada Berkas</option>
                  <option value="no_file">❌ Belum Ada</option>
                </select>

                {type.persyaratan && type.persyaratan.length > 0 && (
                  <select value={reqFilter} onChange={e => setReqFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                    <option value="all">Semua Status Syarat</option>
                    <option value="fulfilled">✅ Semua Syarat Terpenuhi</option>
                    <option value="unfulfilled">❌ Belum Lengkap</option>
                    {type.persyaratan.map(req => (
                      <React.Fragment key={req.id}>
                        <option value={`fulfilled_${req.id}`}>✓ Sudah: {req.nama}</option>
                        <option value={`unfulfilled_${req.id}`}>✗ Belum: {req.nama}</option>
                      </React.Fragment>
                    ))}
                  </select>
                )}
              </div>

              {/* Active filter chips + count */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-500">Ditemukan: {filtered.length} siswa</span>
                {hasActiveFilters && (
                  <>
                    <div className="h-3 w-px bg-slate-200" />
                    {classFilter !== 'all' && (
                      <button onClick={() => setClassFilter('all')} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-medium rounded-full border border-indigo-200 hover:bg-indigo-100">
                        {classFilter} <span className="text-indigo-400">✕</span>
                      </button>
                    )}
                    {fileFilter !== 'all' && (
                      <button onClick={() => setFileFilter('all')} className="flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-medium rounded-full border border-teal-200 hover:bg-teal-100">
                        {fileFilter === 'has_file' ? 'Ada Berkas' : 'Belum Ada'} <span className="text-teal-400">✕</span>
                      </button>
                    )}
                    {reqFilter !== 'all' && (
                      <button onClick={() => setReqFilter('all')} className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-medium rounded-full border border-purple-200 hover:bg-purple-100">
                        {reqFilter.startsWith('fulfilled_') ? '✓ ' : reqFilter.startsWith('unfulfilled_') ? '✗ ' : ''}{reqFilter === 'fulfilled' ? 'Lengkap' : reqFilter === 'unfulfilled' ? 'Belum Lengkap' : type.persyaratan?.find(r => reqFilter.includes(r.id))?.nama || reqFilter} <span className="text-purple-400">✕</span>
                      </button>
                    )}
                    {search && (
                      <button onClick={() => setSearch('')} className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full border border-slate-200 hover:bg-slate-200">
                        "{search}" <span className="text-slate-500">✕</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                {search || hasActiveFilters ? 'Tidak ada siswa yang cocok dengan filter.' : 'Belum ada data siswa.'}
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="text-center px-2 py-2.5 w-10">No</th>
                    <th className="text-left px-2 py-2.5 w-10">Foto</th>
                    <th className="text-left px-2 py-2.5">Nama</th>
                    <th className="text-left px-2 py-2.5 w-24">NISN</th>
                    <th className="text-center px-2 py-2.5 w-14">Kelas</th>
                    <th className="text-center px-2 py-2.5 w-16">Berkas</th>
                    {type.persyaratan && type.persyaratan.map(req => (
                      <th key={req.id} className="text-center px-2 py-2.5 w-20">
                        <div className="flex flex-col items-center gap-1">
                          <span className="max-w-[70px] truncate" title={req.nama}>{req.nama}</span>
                          <div className="flex gap-0.5">
                            <button onClick={() => handleMassToggleReq(req.id, true)} disabled={toggling === `mass_req_${req.id}`}
                              className="text-[9px] bg-green-50 text-green-600 px-1 py-0.5 rounded border border-green-200 hover:bg-green-100 font-bold leading-none" title="Centang Semua">✓</button>
                            <button onClick={() => handleMassToggleReq(req.id, false)} disabled={toggling === `mass_req_${req.id}`}
                              className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded border border-red-200 hover:bg-red-100 font-bold leading-none" title="Hapus Centang">✗</button>
                          </div>
                        </div>
                      </th>
                    ))}
                    <th className="text-center px-2 py-2.5 w-20">Status Unduh</th>
                    <th className="text-center px-2 py-2.5 w-16 sticky right-0 bg-slate-50 border-l border-slate-200 shadow-[-2px_0_8px_rgba(0,0,0,0.04)]">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const hasFile = files.has(s.kode)
                    const reqs = type.persyaratan || []
                    const terpenuhi = fileReqs[s.kode] || {}
                    const allReqMet = reqs.length > 0 ? reqs.every(r => terpenuhi[r.id]) : true
                    const isComplete = hasFile && allReqMet

                    return (
                      <tr key={s.kode ?? s.nisn ?? i}
                        className={`group border-b border-slate-50 hover:bg-slate-50/80 transition-colors ${isComplete ? 'bg-emerald-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="text-center px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2">
                          <StudentAvatar fallbackUrls={getFallbackPhotoUrls(s, allFotos)} name={s.nama_lengkap} className="w-7 h-7 text-[10px]" />
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => setSelectedPreview(s)}
                            className="text-slate-900 font-medium hover:text-indigo-600 transition-colors text-left text-xs truncate max-w-[200px] block">
                            {s.nama_lengkap}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-slate-500 font-mono text-[11px]">{s.nisn ?? '—'}</td>
                        <td className="text-center px-2 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{s.kelas ?? '—'}</span>
                        </td>
                        <td className="text-center px-2 py-2">
                          {hasFile ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              Ada
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-500 border border-red-200">—</span>
                          )}
                        </td>
                        {reqs.map(req => {
                          const isChecked = !!(terpenuhi[req.id])
                          return (
                            <td key={req.id} className="text-center px-2 py-2">
                              <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox"
                                  className={`w-4 h-4 rounded focus:ring-0 cursor-pointer ${isChecked ? 'text-green-600' : 'text-slate-300 border-slate-300'}`}
                                  checked={isChecked}
                                  disabled={toggling === `${s.kode}_req_${req.id}`}
                                  onChange={() => handleToggleReq(s.kode, req.id)}
                                />
                              </label>
                            </td>
                          )
                        })}
                        <td className="text-center px-2 py-2">
                          {activityLogs.some(log => log.detail.includes(s.nama_lengkap)) ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200" title="Siswa telah mengakses dokumen">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                Telah Diakses
                              </span>
                              <button onClick={() => handleResetStatusUnduh(s.nama_lengkap)} title="Reset Status"
                                className="p-0.5 rounded text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[10px] italic">—</span>
                          )}
                        </td>
                        <td className="text-center px-2 py-2 sticky right-0 border-l border-slate-100 shadow-[-2px_0_8px_rgba(0,0,0,0.04)] bg-white group-hover:bg-slate-50/80 transition-colors">
                          <div className="flex items-center justify-center gap-1">
                            {hasFile && (
                              <>
                                <button onClick={() => handleDownload(s.kode, s.nama_lengkap)} title="Unduh"
                                  className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors">
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                                  </svg>
                                </button>
                                <button onClick={() => handleDeleteFile(s.kode, s.nama_lengkap)} title="Hapus"
                                  className="p-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors">
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
          {/* Sidebar Progress Per Kelas */}
          <div className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col h-auto lg:h-full lg:max-h-full overflow-y-auto">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-5">Progress Per Kelas (Akses Dokumen)</h3>
            <div className="space-y-4">
              {uniqueClasses.map(c => {
                const classStudents = students.filter(s => s.kelas === c)
                const total = classStudents.length
                if (total === 0) return null

                const hasFileReqs = type.persyaratan && type.persyaratan.length > 0
                const grantedCount = classStudents.filter(s => {
                  const hasFile = files.has(s.kode)
                  if (!hasFile) return false
                  if (!hasFileReqs) return true
                  const terpenuhi = fileReqs[s.kode] || {}
                  return type.persyaratan.every(r => terpenuhi[r.id])
                }).length

                const accessedCount = classStudents.filter(s => activityLogs.some(log => log.detail.includes(s.nama_lengkap))).length
                
                const grantedPercent = total > 0 ? (grantedCount / total) * 100 : 0
                const accessedPercent = total > 0 ? (accessedCount / total) * 100 : 0

                return (
                  <div key={c} className="flex flex-col gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50/50">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>{c} (Dapat Akses)</span>
                        <span>{grantedCount}/{total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full rounded-full transition-all duration-500 ${grantedPercent >= 100 ? 'bg-indigo-600' : 'bg-indigo-400'}`} style={{ width: `${grantedPercent}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>Telah Mengunduh</span>
                        <span>{accessedCount}/{total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full rounded-full transition-all duration-500 ${accessedPercent >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${accessedPercent}%` }}></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <TemplateGenerator type={type} students={students} onRefresh={onRefresh} />
        </div>
      )}

      {/* PREVIEW MODAL */}
      {selectedPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4 animate-fade-in">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
            onClick={() => setSelectedPreview(null)} />
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
            <div className="relative bg-indigo-600 h-28 shrink-0">
              <button onClick={() => setSelectedPreview(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-indigo-600 transition-colors">
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="px-6 pb-4 shrink-0 bg-white relative z-10">
              <div className="flex flex-col items-center -mt-14">
                <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white overflow-hidden shadow-md shrink-0">
                  <StudentAvatar fallbackUrls={getFallbackPhotoUrls(selectedPreview, allFotos)} name={selectedPreview.nama_lengkap} className="w-full h-full object-cover text-2xl" />
                </div>
                <h3 className="text-slate-900 font-bold text-xl mt-3 text-center">{selectedPreview.nama_lengkap}</h3>
                <p className="text-indigo-600 font-medium text-sm mt-0.5 mb-3">Kelas {selectedPreview.kelas ?? '—'}</p>
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">NISN / NIPD</p>
                  <p className="text-slate-800 font-semibold">{selectedPreview.nisn || '-'}{selectedPreview.nipd ? ` / ${selectedPreview.nipd}` : ''}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-100 border-t border-slate-200 relative h-[60vh] min-h-[400px]">
              {selectedPreview.kode && fileUrls[selectedPreview.kode] ? (
                <>
                  <div className="absolute top-4 right-4 z-10">
                    <a href={fileUrls[selectedPreview.kode]}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 text-sm font-bold shadow-md border border-slate-200 transition-transform active:scale-95">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Buka Tab Baru
                    </a>
                  </div>
                  <iframe
                    key={selectedPreview.kode + type.kode_jenis}
                    src={fileUrls[selectedPreview.kode]}
                    width="100%" height="100%"
                    className="w-full h-full block border-0"
                    title={`${type.nama} - ${selectedPreview.nama_lengkap}`}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  </div>
                  <h3 className="text-slate-700 font-bold mb-1">Dokumen Belum Tersedia</h3>
                  <p className="text-slate-500 text-sm">Dokumen {type.nama} untuk siswa ini belum diunggah.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showVerificationModal && (
        <AdminVerifikasiModal
          type={type}
          students={students}
          onClose={() => setShowVerificationModal(false)}
        />
      )}
    </div>
  )
}

function DataSiswaSection({ students, allFotos, activeTa, tahunAjarans, isProcessing, setIsProcessing, onDeleteIndividual, onRefresh }) {
  const [search, setSearch] = useState('')
  const [selectedClasses, setSelectedClasses] = useState([])
  const [selectedTaFilter, setSelectedTaFilter] = useState(activeTa?.nama || 'all')
  const [uploadingFor, setUploadingFor] = useState(null)
  const individualPhotoInputRef = useRef(null)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState(null)
  const [isSavingModal, setIsSavingModal] = useState(false)
  const [isUploadingModalPhoto, setIsUploadingModalPhoto] = useState(false)
  const editPhotoInputRef = useRef(null)

  const handleIndividualPhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingFor) return
    
    const targetTa = tahunAjarans.find(t => t.nama === uploadingFor.tahun_ajaran)
    if (!targetTa) {
      alert("Tahun ajaran tidak ditemukan.")
      setUploadingFor(null)
      return
    }

    setIsProcessing(true)

    const sanitize = (str) => (str || '').replace(/\s+/g, '_')
    const folderName = `foto/${sanitize(targetTa.nama).replace(/\//g, '_')}`
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
    formData.append('public_id', `FOTO_${uploadingFor.nisn}_${targetTa.id}`)
    formData.append('folder', folderName)

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        await supabase.from('foto').upsert({
          nisn: uploadingFor.nisn,
          tahun_ajaran_id: targetTa.id,
          cloudinary_url: data.secure_url,
          cloudinary_public_id: data.public_id
        }, { onConflict: 'nisn,tahun_ajaran_id' })
        alert('Foto berhasil diunggah!')
        onRefresh()
      } else {
        alert('Gagal mengunggah foto ke Cloudinary.')
      }
    } catch (err) {
      alert('Terjadi kesalahan saat mengunggah foto.')
    }

    setIsProcessing(false)
    setUploadingFor(null)
    if (individualPhotoInputRef.current) individualPhotoInputRef.current.value = ''
  }

  const handleSaveSiswa = async (e) => {
    e.preventDefault()
    setIsSavingModal(true)
    
    // Cek perubahan NISN
    if (editFormData.nisn && editFormData.original_nisn && editFormData.nisn !== editFormData.original_nisn) {
      const { error: rpcError } = await supabase.rpc('update_siswa_nisn', { 
        old_nisn: editFormData.original_nisn, 
        new_nisn: editFormData.nisn 
      })
      if (rpcError) {
        alert('Gagal memigrasikan NISN: ' + rpcError.message)
        setIsSavingModal(false)
        return
      }
    }

    // Update permanent data
    const { error: err1 } = await supabase.from('siswa_permanent')
      .update({
        nama_lengkap: editFormData.nama_lengkap,
        kode_akses: editFormData.kode_akses,
        email_aktif: editFormData.email_aktif
      })
      .eq('nisn', editFormData.nisn)
      
    if (err1) {
      alert('Gagal update data siswa: ' + err1.message)
      setIsSavingModal(false)
      return
    }

    // Update enrollment if it exists
    if (editFormData.kode) {
      const { error: err2 } = await supabase.from('enrollment')
        .update({ kelas: editFormData.kelas })
        .eq('id', editFormData.kode)
      if (err2) {
        console.error('Gagal update kelas:', err2)
      }
    }

    setIsSavingModal(false)
    setShowEditModal(false)
    alert('Data siswa berhasil diubah!')
    onRefresh()
  }

  const handleEditPhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editFormData) return
    
    const targetTa = tahunAjarans.find(t => t.nama === editFormData.tahun_ajaran)
    if (!targetTa) {
      alert("Tahun ajaran tidak ditemukan.")
      return
    }

    setIsUploadingModalPhoto(true)
    try {
      const sanitize = (str) => (str || '').replace(/\s+/g, '_')
      const folderName = `foto/${sanitize(targetTa.nama).replace(/\//g, '_')}`
      
      const uploadData = new FormData()
      uploadData.append('file', file)
      uploadData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
      uploadData.append('public_id', `FOTO_${editFormData.nisn}_${targetTa.id}`)
      uploadData.append('folder', folderName)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`, {
        method: 'POST',
        body: uploadData
      })

      if (!res.ok) throw new Error('Upload failed')
      const result = await res.json()

      await supabase.from('foto').upsert({
        nisn: editFormData.nisn,
        tahun_ajaran_id: targetTa.id,
        cloudinary_url: result.secure_url,
        cloudinary_public_id: result.public_id
      }, { onConflict: 'nisn,tahun_ajaran_id' })
      
      setEditFormData(prev => ({ ...prev, foto_url: result.secure_url }))
      onRefresh()
    } catch (err) {
      console.error(err)
      alert('Gagal mengunggah foto.')
    }
    setIsUploadingModalPhoto(false)
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = ''
  }

  const handleDeletePhoto = async (student, photoRecord) => {
    if (!photoRecord) return
    
    const confirmed = await requestConfirm({
      title: 'Hapus Foto?',
      message: `Yakin ingin menghapus foto untuk siswa ${student.nama_lengkap}?`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return

    setIsProcessing(true)
    const { error } = await supabase.from('foto').delete().match({
      nisn: photoRecord.nisn,
      tahun_ajaran_id: photoRecord.tahun_ajaran_id
    })
    
    setIsProcessing(false)
    if (error) {
      alert('Gagal menghapus foto: ' + error.message)
    } else {
      onRefresh()
    }
  }

  useEffect(() => {
    if (activeTa && selectedTaFilter === 'all') {
      setSelectedTaFilter(activeTa.nama)
    }
  }, [activeTa])

  const filteredByYear = selectedTaFilter === 'all' ? students : students.filter(s => s.tahun_ajaran === selectedTaFilter)
  const uniqueClasses = [...new Set(filteredByYear.map(s => s.kelas).filter(Boolean))].sort()

  const filtered = filteredByYear.filter(s => {
    const q = search.toLowerCase()
    return (!search || s.nama_lengkap?.toLowerCase().includes(q) || String(s.nisn ?? '').includes(q))
      && (selectedClasses.length === 0 || selectedClasses.includes(s.kelas))
  }).sort((a, b) => {
    const classA = a.kelas || ''
    const classB = b.kelas || ''
    if (classA !== classB) return classA.localeCompare(classB)
    return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
  })

  const handleBulkDeleteYear = async () => {
    if (!activeTa) return
    const confirmed = await requestConfirm({
      title: 'Hapus Seluruh Data Siswa?',
      message: `⚠️ PERINGATAN KERAS ⚠️\n\nAnda yakin ingin menghapus SEMUA data siswa di tahun ajaran ${activeTa.nama}?\nSeluruh riwayat kelas, foto, dan dokumen pengumuman pada tahun ajaran ini akan musnah dan tidak dapat dikembalikan.`,
      confirmLabel: 'Hapus Semua Data',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return
    
    setIsProcessing(true)
    const kodes = students.filter(s => s.tahun_ajaran === activeTa.nama).map(s => s.kode)

    await supabase.from('foto').delete().eq('tahun_ajaran_id', activeTa.id)
    await supabase.from('enrollment').delete().eq('tahun_ajaran_id', activeTa.id)
    
    if (kodes.length > 0) {
      for (let i = 0; i < kodes.length; i += 100) {
        await supabase.from('berkas_pengumuman').delete().in('kode_siswa', kodes.slice(i, i + 100))
      }
    }
    setIsProcessing(false)
    onRefresh()
  }

  const handleExportCsv = () => {
    const sortedFiltered = [...filtered].sort((a, b) => {
      const classA = a.kelas || ''
      const classB = b.kelas || ''
      if (classA !== classB) return classA.localeCompare(classB)
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
    })

    let currentClass = null
    let currentAbsen = 1

    const dataToExport = sortedFiltered.map((s, i) => {
      if (s.kelas !== currentClass) {
        currentClass = s.kelas
        currentAbsen = 1
      }
      const absen = currentAbsen++

      return {
        'No': i + 1,
        'No Absen': absen,
        'KODE PDF (PENTING)': s.kode || '',
        'Kode Akses': s.kode_akses || '',
        'Nama Lengkap': s.nama_lengkap || '',
        'NISN': s.nisn || '',
        'NIPD': s.nipd || '',
        'Kelas': s.kelas || '',
        'Email': s.email_aktif || '',
        'No Telp': s.no_whatsapp || '',
        'Tahun Lulus': s.tahun_lulus || '',
        'Tahun Ajaran': s.tahun_ajaran || '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa')
    const classStr = selectedClasses.length === 0 ? 'Semua_Kelas' : selectedClasses.join('_')
    XLSX.writeFile(wb, `Data_Siswa_${selectedTaFilter}_${classStr}.xlsx`)
  }

  return (
    <div className="animate-slide-up flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <input ref={individualPhotoInputRef} type="file" accept="image/jpeg,image/png,image/jpg" className="hidden" 
        onChange={handleIndividualPhotoUpload} />

      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Data Keseluruhan Siswa</h2>
          <p className="text-sm text-slate-500 mt-1">Daftar semua siswa dari {selectedTaFilter === 'all' ? 'semua tahun ajaran' : `tahun ajaran ${selectedTaFilter}`}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportCsv} disabled={filtered.length === 0}
            className="px-4 py-2 rounded-xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="hidden md:inline">Export</span> CSV
          </button>

          <button onClick={handleRapihkanKode} disabled={isProcessing || !activeTa || students.filter(s => s.tahun_ajaran_id === activeTa.id).length === 0}
            className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm" title="Urutkan absen dan perbarui kode PDF otomatis">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18"/><path d="M12 3v18"/><path d="m8 8-4 4 4 4"/><path d="m16 16 4-4-4-4"/>
            </svg>
            <span className="hidden md:inline">Rapihkan Kode (A-Z)</span>
          </button>
          
          {activeTa && students.filter(s => s.tahun_ajaran === activeTa.nama).length > 0 && (
            <button onClick={handleBulkDeleteYear} disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
              <span className="hidden md:inline">Kosongkan Tahun</span> {activeTa.nama}
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="flex flex-col md:flex-row gap-3 mb-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input type="text" placeholder="Cari nama atau NISN..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>

          <div className="flex items-center px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            <span className="mr-2">Tahun Ajaran:</span>
            <select 
              value={selectedTaFilter}
              onChange={(e) => { setSelectedTaFilter(e.target.value); setSelectedClasses([]); }}
              className="bg-transparent border-none outline-none text-indigo-700 font-semibold cursor-pointer"
            >
              <option value="all">Semua Tahun</option>
              {tahunAjarans?.map(ta => (
                <option key={ta.id} value={ta.nama}>{ta.nama}</option>
              ))}
            </select>
          </div>
        </div>

        {uniqueClasses.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button 
              onClick={() => setSelectedClasses([])}
              className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                selectedClasses.length === 0 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              Semua Kelas ({filteredByYear.length})
            </button>
            {uniqueClasses.map(c => {
              const count = filteredByYear.filter(s => s.kelas === c).length
              return (
                <button 
                  key={c}
                  onClick={() => setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                  className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                    selectedClasses.includes(c) 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {c} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {search ? 'Tidak ada siswa yang cocok dengan pencarian.' : 'Belum ada data siswa.'}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="text-center px-2 py-2.5 w-10">No</th>
                  <th className="text-left px-2 py-2.5 w-10">Foto</th>
                  <th className="text-left px-2 py-2.5">Nama Lengkap</th>
                  <th className="text-left px-2 py-2.5 w-24">NISN</th>
                  <th className="text-center px-2 py-2.5 w-14">Kelas</th>
                  <th className="text-center px-2 py-2.5 w-24">Thn. Ajaran</th>
                  <th className="text-center px-2 py-2.5 w-32 sticky right-0 bg-slate-50 border-l border-slate-200 shadow-[-2px_0_8px_rgba(0,0,0,0.04)]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const displayedPhoto = allFotos
                    .filter(f => f.nisn === s.nisn && f.cloudinary_url)
                    .sort((a, b) => (b.tahun_ajaran?.nama || '').localeCompare(a.tahun_ajaran?.nama || ''))[0]

                  return (
                  <tr key={s.kode ?? s.nisn ?? i} className={`group border-b border-slate-50 hover:bg-slate-50/80 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="text-center px-2 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-2"><StudentAvatar fallbackUrls={getFallbackPhotoUrls(s, allFotos)} name={s.nama_lengkap} className="w-7 h-7 text-[10px]" /></td>
                    <td className="px-2 py-2 text-slate-900 font-medium truncate max-w-[180px]">{s.nama_lengkap}</td>
                    <td className="px-2 py-2 text-slate-500 font-mono text-[11px]">{s.nisn ?? '—'}</td>
                    <td className="text-center px-2 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{s.kelas ?? '—'}</span></td>
                    <td className="text-center px-2 py-2 text-slate-600">{s.tahun_ajaran ?? '—'}</td>
                    <td className="text-center px-2 py-2 sticky right-0 bg-white group-hover:bg-slate-50/80 border-l border-slate-100 shadow-[-2px_0_8px_rgba(0,0,0,0.04)] transition-colors">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setUploadingFor(s); individualPhotoInputRef.current?.click(); }} disabled={isProcessing}
                          className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded border border-blue-200 transition-colors disabled:opacity-50" title="Ubah Foto Siswa">
                          {uploadingFor?.kode === s.kode ? (
                            <svg className="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                              <circle cx="12" cy="13" r="4"></circle>
                            </svg>
                          )}
                        </button>
                        {displayedPhoto && (
                          <button onClick={() => handleDeletePhoto(s, displayedPhoto)} disabled={isProcessing}
                            className="p-1 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded border border-orange-200 transition-colors disabled:opacity-50" title="Hapus Foto">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line>
                            </svg>
                          </button>
                        )}
                        <button onClick={() => { 
                            setEditFormData({...s, original_nisn: s.nisn, foto_url: displayedPhoto?.cloudinary_url || null})
                            setShowEditModal(true)
                          }} disabled={isProcessing}
                          className="p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded border border-indigo-200 transition-colors disabled:opacity-50" title="Edit Siswa">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onClick={() => onDeleteIndividual(s)} disabled={isProcessing}
                          className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded border border-red-200 transition-colors disabled:opacity-50" title="Hapus Riwayat Kelas Ini">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showEditModal && editFormData && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl flex flex-col max-h-[90vh] animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg text-slate-800">Edit Data Siswa</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100"><svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            <form id="siswa-form" onSubmit={handleSaveSiswa} className="p-5 overflow-y-auto space-y-4">
              <div className="flex flex-col items-center justify-center mb-2">
                <input type="file" accept="image/*" ref={editPhotoInputRef} className="hidden" onChange={handleEditPhotoUpload} />
                <div 
                  onClick={() => editPhotoInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-pointer group flex items-center justify-center text-slate-500 hover:border-indigo-400 transition-colors"
                >
                  {isUploadingModalPhoto ? (
                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  ) : editFormData.foto_url ? (
                    <img src={editFormData.foto_url} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold">{editFormData.nama_lengkap?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                  
                  {!isUploadingModalPhoto && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-500 mt-2">Klik untuk ubah foto</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NISN <span className="text-amber-500 font-normal">(Ubah dengan hati-hati)</span></label>
                <input type="text" required value={editFormData.nisn || ''} onChange={e => setEditFormData({...editFormData, nisn: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                <input type="text" required value={editFormData.nama_lengkap || ''} onChange={e => setEditFormData({...editFormData, nama_lengkap: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={editFormData.email_aktif || ''} onChange={e => setEditFormData({...editFormData, email_aktif: e.target.value})} placeholder="Email siswa" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kelas <span className="text-red-500">*</span></label>
                  <input type="text" required value={editFormData.kelas || ''} onChange={e => setEditFormData({...editFormData, kelas: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
                  <input type="text" value={editFormData.kode_akses || ''} onChange={e => setEditFormData({...editFormData, kode_akses: e.target.value})} placeholder="Biarkan jika tidak diubah" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
            </form>

            <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
              <button type="submit" form="siswa-form" disabled={isSavingModal} className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center shadow-sm">
                {isSavingModal ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function Admin() {
  const navigate = useNavigate()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const [activeMenu, setActiveMenu] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  const [students, setStudents] = useState([])
  const [fotos, setFotos] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [announcementSaving, setAnnouncementSaving] = useState(false)
  const [announcementMsg, setAnnouncementMsg] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditTypeModal, setShowEditTypeModal] = useState(false)
  const [editingType, setEditingType] = useState(null)
  const [newType, setNewType] = useState({ 
    nama: '', 
    kode_jenis: '',
    target_kelas: [],
    show_tahun_lulus: false,
    show_nisn: true,
    show_nipd: false
  })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState(null)

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [csvSyncing, setCsvSyncing] = useState(false)
  const [csvResult, setCsvResult] = useState(null)
  const [lastSyncDetails, setLastSyncDetails] = useState(null)
  const [showLastSyncModal, setShowLastSyncModal] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoProgress, setPhotoProgress] = useState(null)
  const csvInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  const [tahunAjarans, setTahunAjarans] = useState([])
  const [newTahunAjaran, setNewTahunAjaran] = useState('')
  const [tahunAjaranSaving, setTahunAjaranSaving] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showUploadInterceptModal, setShowUploadInterceptModal] = useState(false)
  const [pendingMenu, setPendingMenu] = useState(null)

  const activeTa = tahunAjarans.find(t => t.is_aktif)

  const uniqueStudentCount = new Set(students.map(s => s.nisn).filter(Boolean)).size

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
      fetchTahunAjarans()
      fetchStudents()
      fetchAnnouncement()
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollment' }, fetchStudents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siswa_permanent' }, fetchStudents)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tahun_ajaran' }, fetchTahunAjarans)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jenis_pengumuman' }, fetchMenuTypes)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [authLoading])

  const { isUploading, progress: uploadProgress, results: uploadResults } = useUploadManager()

  useEffect(() => {
    if (uploadResults && globalUploadManager.getState().minimized) {
      alert(`Upload Selesai.\nBerhasil: ${uploadResults.success.length}\nGagal: ${uploadResults.failed.length}\nDilewati: ${uploadResults.skipped.length}`)
      globalUploadManager.setMinimized(false)
    }
  }, [uploadResults])

  const fetchTahunAjarans = async () => {
    const { data } = await supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false })
    if (data) {
      setTahunAjarans(data)
    }
  }

  const fetchMenuTypes = async () => {
    const { data } = await supabase.from('jenis_pengumuman').select('*').order('urutan')
    if (data) {
      setMenuTypes(data)
      setActiveMenu(prev => prev ?? data[0]?.id ?? 'konfigurasi')
    }
  }

  const fetchStudents = async () => {
    setStudentsLoading(true)
    const { data } = await supabase.from('siswa_lengkap').select('*').order('nama_lengkap')
    if (data) setStudents(data)
    
    const { data: fotoData } = await supabase.from('foto').select('*, tahun_ajaran:tahun_ajaran_id(nama)')
    if (fotoData) setFotos(fotoData)

    setStudentsLoading(false)
  }

  const fetchAnnouncement = async () => {
    // Menggunakan pengaturan_sekolah agar konsisten dengan Dashboard siswa
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'pengumuman_teks').maybeSingle()
    setAnnouncement(data?.setting_value ?? '')
  }

  const handleSaveAnnouncement = async () => {
    setAnnouncementSaving(true); setAnnouncementMsg(null)
    const { error } = await supabase.from('pengaturan_sekolah').upsert(
      { setting_key: 'pengumuman_teks', setting_value: announcement },
      { onConflict: 'setting_key' }
    )
    setAnnouncementSaving(false)
    setAnnouncementMsg(error ? { type: 'error', text: 'Gagal menyimpan.' } : { type: 'success', text: 'Berhasil disimpan!' })
  }

  const handleAddTahunAjaran = async () => {
    setTahunAjaranSaving(true)
    const { error } = await supabase.from('tahun_ajaran').insert({ nama: newTahunAjaran })
    setTahunAjaranSaving(false)
    if (error) {
      alert('Gagal menambah: ' + error.message)
    } else {
      setNewTahunAjaran('')
      fetchTahunAjarans()
    }
  }

  const handleToggleTahunAjaran = async (id, isAktif) => {
    if (isAktif) {
      const { error: err1 } = await supabase.from('tahun_ajaran').update({ is_aktif: false }).neq('id', id)
      if (err1) { alert('Gagal: ' + err1.message); return }
    }
    const { error: err2 } = await supabase.from('tahun_ajaran').update({ is_aktif: isAktif }).eq('id', id)
    if (err2) { alert('Gagal: ' + err2.message); return }
    fetchTahunAjarans()
  }

  const handleExportDatabase = () => {
    if (!activeTa) {
      alert("Silakan aktifkan tahun ajaran di menu Konfigurasi terlebih dahulu.")
      return
    }
    const filteredStudents = students.filter(s => s.tahun_ajaran === activeTa.nama)
    
    if (filteredStudents.length === 0) {
      alert(`Tidak ada data siswa pada tahun ajaran ${activeTa.nama}.`)
      return
    }

    const sortedFiltered = [...filteredStudents].sort((a, b) => {
      const classA = a.kelas || ''
      const classB = b.kelas || ''
      if (classA !== classB) return classA.localeCompare(classB)
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
    })

    let currentClass = null
    let currentAbsen = 1

    const dataToExport = sortedFiltered.map((s) => {
      if (s.kelas !== currentClass) {
        currentClass = s.kelas
        currentAbsen = 1
      }
      const absen = currentAbsen++

      return {
        'NO ABSEN': absen,
        'KODE PDF (PENTING)': s.kode || '',
        'NISN': s.nisn || '',
        'NIPD': s.nipd || '',
        'NAMA LENGKAP': s.nama_lengkap || '',
        'KELAS': s.kelas || '',
        'EMAIL AKTIF': s.email_aktif || '',
        'NO. WHATSAPP': s.no_whatsapp || '',
        'KODE AKSES': s.kode_akses || '',
        'TAHUN LULUS': s.tahun_lulus || '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa')
    XLSX.writeFile(wb, `Export_Data_Siswa_${activeTa.nama.replace('/', '_')}.xlsx`)
  }

  const handleCsvSync = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!activeTa) {
      alert("Silakan aktifkan tahun ajaran di menu Konfigurasi terlebih dahulu.")
      if (csvInputRef.current) csvInputRef.current.value = ''
      return
    }

    setCsvSyncing(true)
    setCsvResult(null)
    setLastSyncDetails(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!rows || rows.length === 0) {
        setCsvResult({ type: 'error', text: 'File Excel kosong atau format tidak sesuai.' })
        setCsvSyncing(false)
        if (csvInputRef.current) csvInputRef.current.value = ''
        return
      }

      const cleanStr = (val) => {
        let str = (val || '').toString().trim()
        if (str.startsWith("'")) str = str.substring(1)
        if (str.startsWith('="') && str.endsWith('"')) str = str.substring(2, str.length - 1)
        return str.trim()
      }

      const permanents = []
      const enrollments = []

      rows.forEach(r => {
        let nisn = cleanStr(r['nisn'] || r['NISN'])
        if (nisn) {
          if (nisn.length > 10) {
            nisn = nisn.slice(-10)
          } else if (nisn.length < 10) {
            nisn = nisn.padStart(10, '0')
          }
        }

        const kelas = cleanStr(r['kelas'] || r['KELAS SEKARANG'] || r['KELAS'] || r['Kelas'])
        const absen = cleanStr(r['no absen'] || r['NO ABSEN'] || r['ABSEN'] || r['No Absen'])
        
        let kode = cleanStr(r['kode'] || r['KODE'])
        
        if (!kode) {
          const formattedTa = activeTa.nama.replace('/', '_')
          kode = absen ? `${kelas}${absen}${formattedTa}` : `${kelas}_${nisn}_${formattedTa}`
        }
        
        if (!kode || !nisn) return
        
        permanents.push({
          nisn: nisn,
          nipd: cleanStr(r['nipd'] || r['NIPD']) || null,
          nama_lengkap: (r['nama_lengkap'] || r['NAMA LENGKAP'] || r['Nama Lengkap'] || '').toString().trim() || null,
          email_aktif: (r['email_aktif'] || r['EMAIL AKTIF'] || r['Email'] || '').toString().trim() || null,
          no_whatsapp: cleanStr(r['no_whatsapp'] || r['NO. WHATSAPP'] || r['No Telp']) || null,
          kode_akses: (r['kode_akses'] || r['KODE AKSES'] || r['Kode Akses'] || '').toString().trim() || null,
          tahun_lulus: (r['tahun_lulus'] || r['TAHUN LULUS'] || r['Tahun Lulus'] || '').toString().trim() || null,
        })

        enrollments.push({
          kode: kode,
          nisn: nisn,
          kelas: kelas || null,
          tahun_ajaran_id: activeTa.id
        })
      })

      if (permanents.length === 0) {
        setCsvResult({ type: 'error', text: 'Tidak ditemukan data yang valid. Pastikan kolom NISN dan NO ABSEN terisi.' })
        setCsvSyncing(false)
        if (csvInputRef.current) csvInputRef.current.value = ''
        return
      }

      const uniquePermanentsMap = new Map()
      const uniqueEnrollmentsMap = new Map()
      
      permanents.forEach((p, index) => {
        uniquePermanentsMap.set(p.nisn, p)
        uniqueEnrollmentsMap.set(p.nisn, enrollments[index])
      })

      const uniquePermanents = Array.from(uniquePermanentsMap.values())
      const uniqueEnrollments = Array.from(uniqueEnrollmentsMap.values())

      const nisnList = uniquePermanents.map(p => p.nisn)
      const { data: existingData } = await supabase.from('siswa_permanent').select('*').in('nisn', nisnList)
      const existingMap = new Map((existingData || []).map(s => [s.nisn, s]))

      const mergedPermanents = uniquePermanents.map(p => {
        const old = existingMap.get(p.nisn) || {}
        return {
          nisn: p.nisn,
          nipd: p.nipd || old.nipd || null,
          nama_lengkap: p.nama_lengkap || old.nama_lengkap || null,
          email_aktif: p.email_aktif || old.email_aktif || null,
          no_whatsapp: p.no_whatsapp || old.no_whatsapp || null,
          kode_akses: p.kode_akses || old.kode_akses || null,
          tahun_lulus: p.tahun_lulus || old.tahun_lulus || null,
        }
      })

      const { error: err1 } = await supabase.from('siswa_permanent').upsert(mergedPermanents, { onConflict: 'nisn' })
      if (err1) {
        setCsvResult({ type: 'error', text: `Gagal sinkronisasi identitas: ${err1.message}` })
        setCsvSyncing(false)
        return
      }

      const { data: existingEnrollments } = await supabase
        .from('enrollment')
        .select('id, nisn, kode')
        .eq('tahun_ajaran_id', activeTa.id)
        .in('nisn', nisnList)
        
      const existingEnrollMap = new Map((existingEnrollments || []).map(e => [e.nisn, e]))

      const enrollmentsToUpdate = []
      const enrollmentsToInsert = []

      uniqueEnrollments.forEach(e => {
        const existing = existingEnrollMap.get(e.nisn)
        if (existing) {
          if (existing.kelas !== e.kelas || existing.kode !== e.kode) {
            enrollmentsToUpdate.push({
              id: existing.id,
              kelas: e.kelas,
              kode: e.kode // SEKARANG KITA UPDATE KARENA SUDAH ADA TRIGGER CASCADE!
            })
          }
        } else {
          enrollmentsToInsert.push(e)
        }
      })

      let insertCount = 0
      let updateCount = 0

      if (enrollmentsToUpdate.length > 0) {
        // Chunk array to prevent payload too large
        for (let i = 0; i < enrollmentsToUpdate.length; i += 500) {
          const chunk = enrollmentsToUpdate.slice(i, i + 500)
          const { error: errUpd } = await supabase.from('enrollment').upsert(chunk, { onConflict: 'id' })
          if (errUpd) {
            console.error("Enrollment update error:", errUpd)
            setCsvResult({ type: 'error', text: `Gagal mengupdate kelas: ${errUpd.message}` })
            setCsvSyncing(false)
            return
          }
        }
        updateCount = enrollmentsToUpdate.length
      }

      if (enrollmentsToInsert.length > 0) {
        for (let i = 0; i < enrollmentsToInsert.length; i += 500) {
          const chunk = enrollmentsToInsert.slice(i, i + 500)
          const { error: errIns } = await supabase.from('enrollment').insert(chunk)
          if (errIns) {
            console.error("Enrollment insert error:", errIns)
            setCsvResult({ type: 'error', text: `Gagal menambahkan siswa baru: ${errIns.message}` })
            setCsvSyncing(false)
            return
          }
        }
        insertCount = enrollmentsToInsert.length
      }
      
      await fetchStudents() // Await to ensure UI refreshes BEFORE success message
      setCsvSyncing(false)
      setCsvResult({ type: 'success', text: `Berhasil sinkronisasi. ${insertCount} data baru ditambahkan, ${updateCount} data diperbarui.` })
      setLastSyncDetails({ inserted: enrollmentsToInsert, updated: enrollmentsToUpdate })
      
      if (csvInputRef.current) csvInputRef.current.value = ''
    } catch (err) {
      setCsvResult({ type: 'error', text: `Gagal memproses file: ${err.message}` })
      setCsvSyncing(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }


  const handleDownloadTemplate = () => {
    const headers = [['NO ABSEN', 'NISN', 'NIPD', 'NAMA LENGKAP', 'KELAS', 'EMAIL AKTIF', 'NO. WHATSAPP', 'KODE AKSES', 'TAHUN LULUS']]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(headers)
    ws['!cols'] = headers[0].map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Format Data Siswa')
    XLSX.writeFile(wb, 'format_data_siswa.xlsx')
  }

  const handleBulkPhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    if (!activeTa) {
      alert("Silakan aktifkan tahun ajaran di menu Konfigurasi terlebih dahulu.")
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    setPhotoUploading(true)
    let success = 0
    let failed = 0

    const sanitize = (str) => (str || '').replace(/\s+/g, '_')
    const folderName = `foto/${sanitize(activeTa.nama).replace(/\//g, '_')}`

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setPhotoProgress({ current: i + 1, total: files.length, name: file.name })
      
      const fileNameRaw = file.name.split('.')[0] 
      let nisn = fileNameRaw

      // Cek apakah nama file adalah 'Kode' (misal: 7A12025_2026), jika ya, cari NISN-nya
      const { data: enrol } = await supabase.from('enrollment')
        .select('nisn')
        .eq('kode', fileNameRaw)
        .eq('tahun_ajaran_id', activeTa.id)
        .maybeSingle()
        
      if (enrol && enrol.nisn) {
        nisn = enrol.nisn
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('public_id', `FOTO_${nisn}_${activeTa.id}`)
      formData.append('folder', folderName)

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          await supabase.from('foto').upsert({
            nisn: nisn,
            tahun_ajaran_id: activeTa.id,
            cloudinary_url: data.secure_url,
            cloudinary_public_id: data.public_id
          }, { onConflict: 'nisn,tahun_ajaran_id' })
          
          success++
        } else {
          failed++
        }
      } catch (err) {
        failed++
      }
    }

    setPhotoUploading(false)
    setPhotoProgress(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    fetchStudents() 
    alert(`Upload Foto Selesai!\nBerhasil: ${success}\nGagal: ${failed}`)
  }

  const handleDeleteIndividual = async (s) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Riwayat Kelas?',
      message: `Yakin ingin menghapus riwayat kelas ${s.nama_lengkap} (${s.nisn}) di tahun ajaran ${s.tahun_ajaran}?`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return
    setIsProcessing(true)
    await supabase.from('berkas_pengumuman').delete().eq('kode_siswa', s.kode)
    const { data: enrollData } = await supabase.from('enrollment').select('tahun_ajaran_id').eq('kode', s.kode).single()
    if (enrollData) {
      await supabase.from('foto').delete().match({ nisn: s.nisn, tahun_ajaran_id: enrollData.tahun_ajaran_id })
    }
    await supabase.from('enrollment').delete().eq('kode', s.kode)
    const { count } = await supabase.from('enrollment').select('*', { count: 'exact', head: true }).eq('nisn', s.nisn)
    if (count === 0) {
      await supabase.from('siswa_permanent').delete().eq('nisn', s.nisn)
    }
    setIsProcessing(false)
    fetchStudents()
  }

  const handleAddType = async () => {
    setAddSaving(true); setAddError(null)
    const { error } = await supabase.from('jenis_pengumuman').insert({
      nama: newType.nama.trim(),
      kode_jenis: newType.kode_jenis.trim().toUpperCase(),
      aktif: false, 
      visible: true, 
      urutan: menuTypes.length + 1,
      target_kelas: newType.target_kelas,
      show_tahun_lulus: newType.show_tahun_lulus,
      show_nisn: newType.show_nisn,
      show_nipd: newType.show_nipd
    })
    setAddSaving(false)
    if (error) { setAddError(error.message); return }
    setShowAddModal(false); 
    setNewType({ 
      nama: '', 
      kode_jenis: '',
      target_kelas: [],
      show_tahun_lulus: false,
      show_nisn: true,
      show_nipd: false
    })
    fetchMenuTypes()
  }

  const handleDeleteType = async () => {
    if (!activeType) return
    const confirmed = await requestConfirm({
      title: 'Hapus Jenis Pengumuman?',
      message: `Hapus jenis "${activeType.nama}"?\nTindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return
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

  const handleUpdateType = async (e) => {
    e.preventDefault()
    if (!editingType) return
    setAddSaving(true)
    setAddError(null)

    const { error } = await supabase.from('jenis_pengumuman').update({
      nama: editingType.nama,
      kode_jenis: editingType.kode_jenis,
      target_kelas: editingType.target_kelas,
      show_tahun_lulus: editingType.show_tahun_lulus,
      show_nisn: editingType.show_nisn,
      show_nipd: editingType.show_nipd,
      persyaratan: editingType.persyaratan || []
    }).eq('id', editingType.id)

    setAddSaving(false)
    if (error) { setAddError(error.message); return }
    setShowEditTypeModal(false)
    setEditingType(null)
    fetchMenuTypes()
  }

  const handleLogout = async () => { await supabase.auth.signOut(); navigate('/') }

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

  const handleMenuNavigation = (menuId) => {
    if (globalUploadManager.getState().isUploading && !globalUploadManager.getState().minimized) {
      setPendingMenu(menuId)
      setShowUploadInterceptModal(true)
    } else {
      setActiveMenu(menuId)
      closeSidebar()
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 animate-fade-in">
      {ConfirmModalComponent}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden animate-fade-in" onClick={closeSidebar} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 m-4 bg-white rounded-xl border-none flex flex-col transition-all duration-300 ease-in-out md:static md:translate-x-0 md:z-auto ${sidebarCollapsed ? 'w-24' : 'w-72 md:w-64'} ${
        sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}>
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
            <button onClick={closeSidebar} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <button title="Beranda Utama" onClick={() => handleMenuNavigation('dashboard')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconDashboard /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Beranda Utama</span>}
            </button>
          
          <button title="Manajemen Akun" onClick={() => handleMenuNavigation('manajemen_akun')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'manajemen_akun' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconUsers /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Manajemen Akun</span>}
            </button>
<button title="Manajemen Role" onClick={() => handleMenuNavigation('manajemen_role')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'manajemen_role' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconShield /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Manajemen Role</span>}
            </button>
          
          <button title="Log Aktivitas" onClick={() => handleMenuNavigation('log_aktivitas')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'log_aktivitas' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconActivity /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Log Aktivitas</span>}
            </button>

          <button title="Berita Sekolah" onClick={() => handleMenuNavigation('berita_sekolah')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'berita_sekolah' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M2 15h10"/><path d="M2 18h10"/><path d="M2 12h10"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Berita Sekolah</span>}
          </button>
          
          <button title="Notifikasi Siswa" onClick={() => handleMenuNavigation('notifikasi')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'notifikasi' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Notifikasi Siswa</span>}
          </button>

          <div className="pt-4 pb-2">
            {!sidebarCollapsed && <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FITUR SISTEM</p>}
          </div>

          <button onClick={() => handleMenuNavigation('presensi_qr')}
            title="Presensi QR Code"
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'presensi_qr' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Presensi QR Code</span>}
          </button>

          <div className="pt-4 pb-2">
            {!sidebarCollapsed && <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">PENGUMUMAN / DOKUMEN</p>}
          </div>

          <button title="Kelola Pengumuman" onClick={() => handleMenuNavigation('kelola_pengumuman')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'kelola_pengumuman' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconSettings /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Kelola Pengumuman</span>}
          </button>
          
          {menuTypes.map(t => (
            <button key={t.id} onClick={() => handleMenuNavigation(t.id)}
              className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === t.id ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
              <IconFile />
              {!sidebarCollapsed && <span className="animate-fade-in truncate">{t.nama}</span>}
            </button>
          ))}

          <div className="pt-4 pb-2">
            {!sidebarCollapsed && <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">SISTEM POIN</p>}
          </div>

          <button title="Tata Tertib" onClick={() => handleMenuNavigation('tata_tertib')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'tata_tertib' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Tata Tertib</span>}
          </button>

          <button title="Katalog Poin" onClick={() => handleMenuNavigation('katalog_poin')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'katalog_poin' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Katalog Poin</span>}
          </button>

          <button title="Tahap Pembinaan" onClick={() => handleMenuNavigation('tahap_pembinaan')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'tahap_pembinaan' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Tahap Pembinaan</span>}
          </button>

          <button title="Catat Poin" onClick={() => handleMenuNavigation('catat_poin')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'catat_poin' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Catat Poin</span>}
          </button>

          <button title="Pengaturan Poin" onClick={() => handleMenuNavigation('pengaturan_poin')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'pengaturan_poin' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Pengaturan Poin</span>}
          </button>

        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
          
          <button title="Pengaturan Sistem" onClick={() => handleMenuNavigation('konfigurasi')}
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'konfigurasi' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <IconSettings /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Pengaturan Sistem</span>}
          </button>
          
          <button onClick={cycleFont}
            className={`w-full flex items-center justify-center rounded-xl text-sm font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors ${sidebarCollapsed ? "aspect-square px-0" : "gap-2 px-4 py-2.5"}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Font: {currentFont === 'jakarta' ? 'Plus Jakarta' : currentFont === 'ubuntu' ? 'Ubuntu' : 'Bricolage'}</span>}
          </button>
          <button onClick={handleLogout}
            className={`w-full flex items-center justify-center rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors ${sidebarCollapsed ? "aspect-square px-0" : "gap-2 px-4 py-2.5"}`}>
            <IconLogout /> {!sidebarCollapsed && <span className="animate-fade-in truncate">Keluar Sesi</span>}
            </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto bg-slate-50/50">
        <div className="md:hidden p-4 border-b border-slate-200 bg-white flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <p className="font-semibold text-slate-800 text-sm">Panel Admin</p>
        </div>
        <div className="p-4 md:p-6 lg:p-8 w-full">
          {activeMenu === 'dashboard' && (
            <AdminDashboardSection />
          )}

          {activeMenu === 'log_aktivitas' && (
            <AdminActivityLogSection />
          )}

          {activeMenu === 'berita_sekolah' && (
            <AdminBeritaSection />
          )}

          {activeMenu === 'notifikasi' && (
            <AdminNotifikasiSection />
          )}

          {activeMenu === 'manajemen_akun' && (
            <AdminManajemenAkunSection 
              students={students} 
              allFotos={fotos} 
              activeTa={activeTa}
              tahunAjarans={tahunAjarans}
              initialSearchQuery=""
              onRefresh={fetchStudents}
            />
          )}

          {activeMenu === 'manajemen_role' && (
            <AdminRoleSection />
          )}

          {activeMenu === 'presensi_qr' && (
            <AdminPresensiConfigSection />
          )}

          {activeMenu === 'tata_tertib' && (
            <AdminTataTertibSection />
          )}

          {activeMenu === 'katalog_poin' && (
            <AdminKatalogPoinSection />
          )}

          {activeMenu === 'tahap_pembinaan' && (
            <AdminTahapPembinaanSection />
          )}

          {activeMenu === 'catat_poin' && (
            <AdminCatatPoinSection session={{ nama_guru: 'Admin' }} activeTa={activeTa} />
          )}

          {activeMenu === 'pengaturan_poin' && (
            <AdminPengaturanPoinSection activeTa={activeTa} />
          )}

          {activeMenu === 'konfigurasi' && (
            <div className="animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Pengaturan Sistem</h2>
                  <p className="text-slate-500 text-sm mt-1">Konfigurasi data siswa dan informasi pengumuman</p>
                </div>
              </div>

              <CollapsibleSection title="Manajemen Tahun Ajaran" defaultOpen={true}>
                
                <div className="flex gap-2 mb-4">
                  <input type="text" value={newTahunAjaran} onChange={e => setNewTahunAjaran(e.target.value)} 
                    placeholder="Contoh: 2025/2026" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  <button onClick={handleAddTahunAjaran} disabled={!newTahunAjaran || tahunAjaranSaving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    Tambah
                  </button>
                </div>

                <div className="space-y-2">
                  {tahunAjarans.map(ta => (
                    <div key={ta.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                      <span className="text-sm font-medium">{ta.nama}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${ta.is_aktif ? 'text-green-600' : 'text-slate-500'}`}>
                          {ta.is_aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <Toggle value={ta.is_aktif} onChange={() => handleToggleTahunAjaran(ta.id, !ta.is_aktif)} colorOn="bg-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Manajemen Semester">
                <AdminSemesterSection tahunAjarans={tahunAjarans} activeTa={activeTa} />
              </CollapsibleSection>

              <CollapsibleSection title="Mata Pelajaran">
                <AdminMapelSection />
              </CollapsibleSection>

              <CollapsibleSection title="Tampilan Profil Beranda Siswa">
                <AdminBerandaConfigSection />
              </CollapsibleSection>

              <CollapsibleSection title="Sinkronisasi Data (CSV)">
                <div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    Target Sinkronisasi Data: {activeTa ? activeTa.nama : 'TIDAK ADA TAHUN AJARAN AKTIF'}
                  </h3>
                  <p className="text-xs text-indigo-700 font-medium mt-1">
                    {activeTa ? 'Semua data CSV atau Foto yang diupload di bawah ini akan otomatis masuk ke dalam Tahun Ajaran yang sedang aktif.' : '⚠️ Silakan aktifkan salah satu tahun ajaran di menu Konfigurasi terlebih dahulu untuk bisa melakukan upload CSV atau Foto.'}
                  </p>
                </div>

                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <IconUsers /> Sinkronisasi Database Siswa (CSV)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Upload file CSV untuk memperbarui data siswa secara massal.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total Siswa Unik</p>
                    <p className="text-lg font-bold text-slate-800">{uniqueStudentCount} <span className="text-sm font-normal text-slate-500">Siswa</span></p>
                  </div>
                </div>

                {csvResult && (
                  <div className={`p-3 rounded-lg text-sm mb-4 border flex flex-col sm:flex-row gap-3 sm:items-center justify-between ${
                    csvResult.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
                  }`}>
                    <span>{csvResult.text}</span>
                    {lastSyncDetails && csvResult.type === 'success' && (
                      <button onClick={() => setShowLastSyncModal(true)} className="w-fit shrink-0 px-3 py-1.5 bg-white border border-green-200 rounded-md text-xs font-bold text-green-700 hover:bg-green-100 transition-colors shadow-sm">
                        Lihat Update Terakhir
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvSync} />
                  <button onClick={() => csvInputRef.current?.click()} disabled={csvSyncing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 transition-all active:scale-95 disabled:opacity-50">
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {csvSyncing ? 'Memproses...' : 'Upload Data Baru (CSV)'}
                  </button>
                  <button onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium text-slate-600 transition-colors">
                    Unduh Format CSV
                  </button>
                  <button onClick={handleExportDatabase}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-sm font-medium text-indigo-700 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export Database Saat Ini
                  </button>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Upload Foto Siswa Massal">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="hidden">Upload Foto Siswa Massal</h3>
                    <p className="text-xs text-slate-500 mt-1">Pilih banyak foto sekaligus. Nama file foto HARUS sesuai dengan NISN siswa (contoh: 0132835115.jpg).</p>
                  </div>
                </div>

                {photoProgress && (
                  <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-slate-700">Mengunggah: {photoProgress.name}</p>
                      <p className="text-xs text-slate-500">{photoProgress.current} / {photoProgress.total}</p>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${(photoProgress.current / photoProgress.total) * 100}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/png,image/jpg" className="hidden" 
                    onChange={handleBulkPhotoUpload} />
                  <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-sm font-medium transition-all active:scale-95 disabled:opacity-50">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {photoUploading ? 'Mengunggah Foto...' : 'Upload Foto (.jpg/.png)'}
                  </button>
                </div>
              </CollapsibleSection>

              {/* Modal Update Terakhir */}
              {showLastSyncModal && lastSyncDetails && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white rounded-t-2xl shrink-0">
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Detail Update Terakhir</h2>
                        <p className="text-xs text-slate-500 mt-1">Data siswa yang baru saja ditambahkan atau diperbarui</p>
                      </div>
                      <button onClick={() => setShowLastSyncModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    
                    <div className="p-5 overflow-y-auto flex flex-col gap-6">
                      <div>
                        <h3 className="text-sm font-bold text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-md inline-block mb-3 border border-indigo-100">Data Diperbarui ({lastSyncDetails.updated.length})</h3>
                        {lastSyncDetails.updated.length === 0 ? (
                          <p className="text-sm text-slate-500 italic px-2">Tidak ada data diperbarui.</p>
                        ) : (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr><th className="px-4 py-2.5 font-semibold">NISN</th><th className="px-4 py-2.5 font-semibold">Kelas Target</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {lastSyncDetails.updated.map(u => (
                                  <tr key={u.nisn} className="hover:bg-slate-50/50"><td className="px-4 py-2 font-mono text-xs text-slate-500">{u.nisn}</td><td className="px-4 py-2 font-medium text-slate-700">{u.kelas || '-'}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-emerald-900 bg-emerald-50 px-3 py-1.5 rounded-md inline-block mb-3 border border-emerald-100">Data Baru ({lastSyncDetails.inserted.length})</h3>
                        {lastSyncDetails.inserted.length === 0 ? (
                          <p className="text-sm text-slate-500 italic px-2">Tidak ada data baru ditambahkan.</p>
                        ) : (
                          <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr><th className="px-4 py-2.5 font-semibold">NISN</th><th className="px-4 py-2.5 font-semibold">Kelas Target</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {lastSyncDetails.inserted.map(u => (
                                  <tr key={u.nisn} className="hover:bg-slate-50/50"><td className="px-4 py-2 font-mono text-xs text-slate-500">{u.nisn}</td><td className="px-4 py-2 font-medium text-slate-700">{u.kelas || '-'}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {activeMenu === 'kelola_pengumuman' && (
            <div className="animate-slide-up">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Kelola Pengumuman</h2>
                  <p className="text-slate-500 text-sm mt-1">Buat, edit, dan kelola semua jenis dokumen/pengumuman</p>
                </div>
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Buat Pengumuman Baru
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {menuTypes.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">Belum ada jenis pengumuman.</div>
                  ) : menuTypes.map(t => (
                    <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <IconFile />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{t.nama}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-500 font-mono">{t.kode_jenis}</span>
                            {t.target_kelas && t.target_kelas.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                                Target: {t.target_kelas.join(', ')}
                              </span>
                            )}
                            {t.persyaratan && t.persyaratan.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full font-medium">
                                {t.persyaratan.length} Syarat
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Akses</span>
                          <span className={`text-xs font-bold ${t.aktif ? 'text-green-600' : 'text-slate-500'}`}>{t.aktif ? 'Aktif' : 'Off'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Tampil</span>
                          <span className={`text-xs font-bold ${t.visible ? 'text-blue-600' : 'text-slate-500'}`}>{t.visible ? 'Ya' : 'Tidak'}</span>
                        </div>
                        <button
                          onClick={() => {
                            setEditingType({ ...t })
                            setShowEditTypeModal(true)
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleMenuNavigation(t.id)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                        >
                          Kelola Dokumen →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showAddModal && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
                  <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg animate-scale-in flex flex-col max-h-[90vh]">
                    <div className="p-5 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                      <h3 className="text-lg font-bold text-slate-800">Buat Jenis Pengumuman Baru</h3>
                      <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-600">
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
                      {addError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">{addError}</p>}
                      <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Nama Tampilan</label>
                        <input type="text" value={newType.nama} onChange={e => setNewType({ ...newType, nama: e.target.value })}
                          placeholder="Misal: Surat Kelulusan" className="w-full px-3 py-2 border rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Kode Jenis (Singkat, huruf kapital)</label>
                        <input type="text" value={newType.kode_jenis} onChange={e => setNewType({ ...newType, kode_jenis: e.target.value.toUpperCase() })}
                          placeholder="Misal: SKL" className="w-full px-3 py-2 border rounded-xl text-sm uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-2">Target Kelas</label>
                        <div className="flex flex-col gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-32 overflow-y-auto">
                          <label className="flex items-center gap-2 text-xs text-slate-800 font-medium">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={newType.target_kelas.length === 0} 
                              onChange={() => setNewType({...newType, target_kelas: []})} />
                            Tampilkan ke Semua Kelas
                          </label>
                          <div className="h-px bg-slate-200 w-full my-1"></div>
                          <div className="flex flex-wrap gap-3">
                            {[...new Set((activeTa ? students.filter(s => s.tahun_ajaran === activeTa.nama) : students).map(s => s.kelas).filter(Boolean))].sort().map(c => (
                              <label key={c} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                                <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                                  checked={newType.target_kelas.includes(c)}
                                  onChange={e => {
                                    if (e.target.checked) setNewType({...newType, target_kelas: [...newType.target_kelas, c]})
                                    else setNewType({...newType, target_kelas: newType.target_kelas.filter(x => x !== c)})
                                  }} />
                                {c}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-2">Tampilan Menu Siswa (Opsional)</label>
                        <div className="space-y-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={newType.show_nisn} onChange={e => setNewType({...newType, show_nisn: e.target.checked})} />
                            Tampilkan NISN
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={newType.show_nipd} onChange={e => setNewType({...newType, show_nipd: e.target.checked})} />
                            Tampilkan NIPD
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={newType.show_tahun_lulus} onChange={e => setNewType({...newType, show_tahun_lulus: e.target.checked})} />
                            Tampilkan Tahun Lulus
                          </label>
                        </div>
                      </div>
                    </div>
                    </div>
                    <div className="p-5 border-t border-slate-100 shrink-0 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
                      <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                      <button onClick={handleAddType} disabled={addSaving || !newType.nama || !newType.kode_jenis}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 transition-colors shadow-sm">
                        {addSaving ? 'Menyimpan...' : 'Simpan Pengumuman'}
                      </button>
                    </div>
                  </div>
                </div>
              , document.body)}

              {showEditTypeModal && editingType && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditTypeModal(false)} />
                  <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg animate-scale-in flex flex-col max-h-[90vh]">
                    <div className="p-5 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                      <h3 className="text-lg font-bold text-slate-800">Edit Pengumuman: {editingType.nama}</h3>
                      <button onClick={() => setShowEditTypeModal(false)} className="text-slate-500 hover:text-slate-600">
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
                      {addError && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">{addError}</p>}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Tampilan</label>
                          <input type="text" value={editingType.nama} onChange={e => setEditingType({ ...editingType, nama: e.target.value })}
                            className="w-full px-3 py-2 border rounded-xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kode Jenis</label>
                          <input type="text" value={editingType.kode_jenis} readOnly disabled
                            className="w-full px-3 py-2 border rounded-xl text-sm bg-slate-100 text-slate-500 cursor-not-allowed" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-2">Persyaratan Dokumen (Opsional)</label>
                        <div className="space-y-3">
                          {(editingType.persyaratan || []).map((req, index) => (
                            <div key={index} className="p-3 border border-slate-200 rounded-xl bg-slate-50 relative group">
                              <button onClick={() => {
                                const newReqs = [...(editingType.persyaratan || [])];
                                newReqs.splice(index, 1);
                                setEditingType({ ...editingType, persyaratan: newReqs })
                              }} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                              <div className="space-y-2 pr-6">
                                <input type="text" value={req.nama} onChange={e => {
                                  const newReqs = [...(editingType.persyaratan || [])];
                                  newReqs[index].nama = e.target.value;
                                  setEditingType({ ...editingType, persyaratan: newReqs })
                                }} placeholder="Nama Syarat (misal: Lunas Administrasi)" className="w-full px-2 py-1 text-sm border rounded" />
                                <textarea value={req.info_gagal} onChange={e => {
                                  const newReqs = [...(editingType.persyaratan || [])];
                                  newReqs[index].info_gagal = e.target.value;
                                  setEditingType({ ...editingType, persyaratan: newReqs })
                                }} placeholder="Info jika belum terpenuhi (Opsional)" className="w-full px-2 py-1 text-xs border rounded" rows={2} />
                              </div>
                            </div>
                          ))}
                          <button onClick={() => {
                            setEditingType({
                              ...editingType,
                              persyaratan: [...(editingType.persyaratan || []), { id: `req_${Date.now()}`, nama: '', info_gagal: '' }]
                            })
                          }} className="w-full py-2 border-2 border-dashed border-indigo-200 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-50">
                            + Tambah Syarat Baru
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Target Kelas (Kosongkan jika semua kelas)</label>
                        <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-2">
                            {[...new Set((activeTa ? students.filter(s => s.tahun_ajaran === activeTa.nama) : students).map(s => s.kelas).filter(Boolean))].sort().map(c => (
                              <label key={c} className="flex items-center gap-1.5 text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                                <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                                  checked={(editingType.target_kelas || []).includes(c)}
                                  onChange={e => {
                                    const current = editingType.target_kelas || [];
                                    if (e.target.checked) setEditingType({...editingType, target_kelas: [...current, c]})
                                    else setEditingType({...editingType, target_kelas: current.filter(x => x !== c)})
                                  }} />
                                {c}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-2">Tampilan Menu Siswa (Opsional)</label>
                        <div className="space-y-2 p-3 border border-slate-200 rounded-xl bg-slate-50">
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={editingType.show_nisn} onChange={e => setEditingType({...editingType, show_nisn: e.target.checked})} />
                            Tampilkan NISN
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={editingType.show_nipd} onChange={e => setEditingType({...editingType, show_nipd: e.target.checked})} />
                            Tampilkan NIPD
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500"
                              checked={editingType.show_tahun_lulus} onChange={e => setEditingType({...editingType, show_tahun_lulus: e.target.checked})} />
                            Tampilkan Tahun Lulus
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 border-t border-slate-100 shrink-0 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
                      <button onClick={() => setShowEditTypeModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                      <button onClick={handleUpdateType} disabled={addSaving || !editingType.nama}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 transition-colors shadow-sm">
                        {addSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                      </button>
                    </div>
                  </div>
                </div>
              , document.body)}
            </div>
          )}

          {activeType && (
            <div className="animate-slide-up">
              <AnnouncementTypeSection
                key={activeType.id}
                type={activeType}
                students={activeTa ? students.filter(s => s.tahun_ajaran === activeTa.nama) : students}
                allFotos={fotos}
                activeTa={activeTa}
                uniqueClasses={[...new Set((activeTa ? students.filter(s => s.tahun_ajaran === activeTa.nama) : students).map(s => s.kelas).filter(Boolean))].sort()}
                onDelete={handleDeleteType}
                onRefresh={fetchMenuTypes}
              />
            </div>
          )}
        </div>
      </main>

      {showUploadInterceptModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowUploadInterceptModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-scale-in flex flex-col p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Proses Upload Berjalan</h3>
                <p className="text-sm text-slate-500">Anda sedang mengupload file. Yakin ingin berpindah halaman?</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={() => setShowUploadInterceptModal(false)} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Batal Pindah</button>
              <button onClick={() => {
                globalUploadManager.setMinimized(true)
                setShowUploadInterceptModal(false)
                setActiveMenu(pendingMenu)
                closeSidebar()
              }} className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl transition-colors border border-indigo-200">Minimalis Progress</button>
              <button onClick={() => {
                globalUploadManager.cancelUpload()
                setShowUploadInterceptModal(false)
                setActiveMenu(pendingMenu)
                closeSidebar()
              }} className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl transition-colors border border-red-200">Hentikan Upload</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isUploading && globalUploadManager.getState().minimized && createPortal(
        <div className="fixed bottom-6 right-6 z-[150] w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-slide-up">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-600">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span className="font-bold text-sm">Mengupload Dokumen</span>
            </div>
            <button onClick={async () => {
              const confirmed = await requestConfirm({
                title: 'Hentikan Upload?',
                message: 'Hentikan proses upload saat ini?',
                confirmLabel: 'Hentikan',
                confirmColor: 'red',
                icon: 'danger'
              })
              if(confirmed) {
                globalUploadManager.cancelUpload()
              }
            }} className="text-slate-500 hover:text-red-500 transition-colors">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-500 truncate max-w-[150px]">{uploadProgress?.filename || 'Menyiapkan...'}</span>
              <span className="text-xs font-bold text-indigo-600">{uploadProgress?.percentage || 0}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress?.percentage || 0}%` }} />
            </div>
            <div className="mt-2 text-right">
              <span className="text-xs text-slate-500 font-medium">{uploadProgress?.current || 0} / {uploadProgress?.total || 0} file</span>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}

export default Admin
