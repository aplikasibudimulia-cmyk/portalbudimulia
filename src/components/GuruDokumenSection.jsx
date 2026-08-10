import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

export default function GuruDokumenSection({ session, activeTa, fitur, readOnly }) {
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('upload') // upload, statistik, syarat
  
  // School Years
  const [tahunAjarans, setTahunAjarans] = useState([])
  const [selectedTaId, setSelectedTaId] = useState('')
  const [selectedTaName, setSelectedTaName] = useState('')

  // Data States
  const [requirements, setRequirements] = useState([])
  const [uploads, setUploads] = useState([]) // For teacher view
  const [teachers, setTeachers] = useState([]) // For kurikulum view
  const [allUploads, setAllUploads] = useState([]) // For kurikulum view

  // Requirement Modal States (Kurikulum)
  const [showRequirementModal, setShowRequirementModal] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState(null)
  const [formReqName, setFormReqName] = useState('')
  const [formReqDesc, setFormReqDesc] = useState('')
  const [formReqWajib, setFormReqWajib] = useState(true)

  // Upload Modal States (Teacher File Upload with custom name)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadTargetReq, setUploadTargetReq] = useState(null)
  const [formDocName, setFormDocName] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)

  // Teacher detail stats modal (Kurikulum View)
  const [detailTeacher, setDetailTeacher] = useState(null)

  // Preview Modal State
  const [previewFile, setPreviewFile] = useState(null)

  // Professional Alert & Confirm Modal States
  const [notifyModal, setNotifyModal] = useState({ show: false, type: 'success', title: '', message: '' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  // CLOUDINARY CONFIG
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  // Check Permissions
  const canUpload = fitur.has('upload_dokumen_guru')
  const canManage = fitur.has('kelola_dokumen_guru')

  useEffect(() => {
    fetchTahunAjarans()
  }, [])

  useEffect(() => {
    if (selectedTaId) {
      fetchData()
    }
  }, [selectedTaId, activeTab])

  // Get active year and dropdown values
  const fetchTahunAjarans = async () => {
    const { data, error } = await supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false })
    if (error) {
      console.error('Error fetching tahun ajaran:', error)
      return
    }
    setTahunAjarans(data || [])
    if (data && data.length > 0) {
      const active = activeTa?.id ? data.find(ta => ta.id === activeTa.id) : data[0]
      const defaultTa = active || data[0]
      setSelectedTaId(defaultTa.id)
      setSelectedTaName(defaultTa.nama)
    }
  }

  const handleTaChange = (e) => {
    const taId = e.target.value
    const ta = tahunAjarans.find(t => t.id === taId)
    setSelectedTaId(taId)
    if (ta) setSelectedTaName(ta.nama)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch requirements for the year
      const { data: reqData, error: reqErr } = await supabase
        .from('guru_document_requirements')
        .select('*')
        .eq('tahun_ajaran_id', selectedTaId)
        .order('created_at', { ascending: true })
      
      if (reqErr) throw reqErr
      setRequirements(reqData || [])

      // 2. Fetch upload data
      if (canManage && (activeTab === 'statistik' || activeTab === 'syarat')) {
        // Kurikulum stats: fetch all teachers and all uploads
        const { data: guruData, error: guruErr } = await supabase
          .from('guru')
          .select('id, kode, nama_guru')
          .order('nama_guru', { ascending: true })
        if (guruErr) throw guruErr
        setTeachers(guruData || [])

        const reqIds = (reqData || []).map(r => r.id)
        if (reqIds.length > 0) {
          const { data: upData, error: upErr } = await supabase
            .from('guru_document_uploads')
            .select('*, guru(nama_guru, kode)')
            .in('requirement_id', reqIds)
          if (upErr) throw upErr
          setAllUploads(upData || [])
        } else {
          setAllUploads([])
        }
      } else {
        // Teacher view: fetch only my uploads
        const { data: myUps, error: myUpErr } = await supabase
          .from('guru_document_uploads')
          .select('*')
          .eq('guru_id', session.id)
          .order('uploaded_at', { ascending: false })
        if (myUpErr) throw myUpErr
        setUploads(myUps || [])
      }
    } catch (err) {
      console.error('Error fetching document data:', err)
    } finally {
      setLoading(false)
    }
  }

  // OPEN UPLOAD MODAL FOR A CATEGORY
  const openUploadModal = (req) => {
    setUploadTargetReq(req)
    setFormDocName('')
    setSelectedFile(null)
    setShowUploadModal(true)
  }

  // SUBMIT FILE UPLOAD (MULTI-FILE PER REQUIREMENT CATEGORY)
  const handleSubmitUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile || !uploadTargetReq) {
      setNotifyModal({ show: true, type: 'warning', title: 'Pilih Berkas', message: 'Silakan pilih berkas file terlebih dahulu sebelum mengunggah.' })
      return
    }

    setIsSubmitting(true)
    try {
      const publicId = `DOC_GURU_${session.id}_${uploadTargetReq.id}_${Date.now()}`
      const folder = `dokumen_guru`

      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('public_id', publicId)
      formData.append('folder', folder)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) throw new Error("Upload ke Cloudinary gagal")
      const data = await res.json()

      const docName = formDocName.trim() || selectedFile.name

      // Save upload row to Supabase (Insert instead of upsert so multiple uploads per category are allowed)
      const { error: dbErr } = await supabase.from('guru_document_uploads').insert([{
        requirement_id: uploadTargetReq.id,
        guru_id: session.id,
        file_url: data.secure_url,
        file_name: docName,
        cloudinary_public_id: data.public_id,
        uploaded_at: new Date().toISOString()
      }])

      if (dbErr) throw dbErr
      
      setShowUploadModal(false)
      setUploadTargetReq(null)
      setSelectedFile(null)
      setFormDocName('')
      setNotifyModal({ 
        show: true, 
        type: 'success', 
        title: 'Berhasil Diunggah!', 
        message: `Dokumen "${docName}" telah berhasil disimpan ke sistem.` 
      })
      fetchData()
    } catch (err) {
      console.error(err)
      setNotifyModal({ show: true, type: 'error', title: 'Gagal Mengunggah', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // DELETE SINGLE UPLOAD
  const handleDeleteUpload = (uploadId) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Dokumen?',
      message: 'Apakah Anda yakin ingin menghapus dokumen ini dari sistem?',
      onConfirm: async () => {
        setIsSubmitting(true)
        try {
          const { error: dbErr } = await supabase.from('guru_document_uploads').delete().eq('id', uploadId)
          if (dbErr) throw dbErr
          
          setNotifyModal({ show: true, type: 'success', title: 'Berhasil Dihapus', message: 'Dokumen telah berhasil dihapus.' })
          fetchData()
        } catch (err) {
          console.error(err)
          setNotifyModal({ show: true, type: 'error', title: 'Gagal Menghapus', message: err.message })
        } finally {
          setIsSubmitting(false)
        }
      }
    })
  }

  // REQUIREMENT CRUD (Kurikulum)
  const handleSaveRequirement = async (e) => {
    e.preventDefault()
    if (!formReqName) return
    setIsSubmitting(true)

    try {
      if (editingRequirement) {
        // UPDATE
        const { error } = await supabase
          .from('guru_document_requirements')
          .update({
            nama_dokumen: formReqName,
            deskripsi: formReqDesc,
            is_wajib: formReqWajib
          })
          .eq('id', editingRequirement.id)
        if (error) throw error
      } else {
        // INSERT
        const { error } = await supabase
          .from('guru_document_requirements')
          .insert({
            nama_dokumen: formReqName,
            deskripsi: formReqDesc,
            is_wajib: formReqWajib,
            tahun_ajaran_id: selectedTaId
          })
        if (error) throw error
      }

      setShowRequirementModal(false)
      setEditingRequirement(null)
      setFormReqName('')
      setFormReqDesc('')
      setFormReqWajib(true)
      setNotifyModal({ show: true, type: 'success', title: 'Tersimpan!', message: 'Persyaratan dokumen berhasil disimpan.' })
      fetchData()
    } catch (err) {
      console.error(err)
      setNotifyModal({ show: true, type: 'error', title: 'Gagal Menyimpan', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRequirement = (id) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Persyaratan?',
      message: 'Menghapus persyaratan ini juga akan menghapus seluruh file guru yang sudah diupload. Lanjutkan?',
      onConfirm: async () => {
        setIsSubmitting(true)
        try {
          const { error } = await supabase.from('guru_document_requirements').delete().eq('id', id)
          if (error) throw error
          setNotifyModal({ show: true, type: 'success', title: 'Berhasil Dihapus', message: 'Persyaratan dokumen berhasil dihapus.' })
          fetchData()
        } catch (err) {
          console.error(err)
          setNotifyModal({ show: true, type: 'error', title: 'Gagal Menghapus', message: err.message })
        } finally {
          setIsSubmitting(false)
        }
      }
    })
  }

  const openAddModal = () => {
    setEditingRequirement(null)
    setFormReqName('')
    setFormReqDesc('')
    setFormReqWajib(true)
    setShowRequirementModal(true)
  }

  const openEditModal = (req) => {
    setEditingRequirement(req)
    setFormReqName(req.nama_dokumen)
    setFormReqDesc(req.deskripsi || '')
    setFormReqWajib(req.is_wajib)
    setShowRequirementModal(true)
  }

  const isCurrentTa = selectedTaId === activeTa?.id

  // Calculate Stats for Kurikulum View
  const getTeacherStats = (guruId) => {
    const uploadsForGuru = allUploads.filter(u => u.guru_id === guruId)
    const requiredList = requirements.filter(r => r.is_wajib)
    const uploadedReqIds = new Set(uploadsForGuru.map(u => u.requirement_id))
    
    // Count how many required categories have at least 1 upload
    const uploadedRequiredCount = requiredList.filter(r => uploadedReqIds.has(r.id)).length
    const totalRequired = requiredList.length
    
    const isComplete = totalRequired > 0 && uploadedRequiredCount === totalRequired
    const percent = totalRequired > 0 ? Math.round((uploadedRequiredCount / totalRequired) * 100) : 0

    return { 
      uploadedCount: uploadedRequiredCount, 
      requiredCount: totalRequired, 
      isComplete, 
      percent, 
      uploadsForGuru,
      totalFilesCount: uploadsForGuru.length
    }
  }

  // Format date helper
  const formatDate = (isoStr) => {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Detect file type for preview icon & modal
  const getFileType = (url = '', fileName = '') => {
    const cleanUrl = url.split('?')[0].toLowerCase()
    const cleanName = fileName.toLowerCase()
    if (/\.(jpeg|jpg|png|webp|gif|svg)$/.test(cleanUrl) || /\.(jpeg|jpg|png|webp|gif|svg)$/.test(cleanName)) return 'image'
    if (/\.pdf$/.test(cleanUrl) || /\.pdf$/.test(cleanName)) return 'pdf'
    if (/\.(doc|docx|xls|xlsx|csv|ppt|pptx)$/.test(cleanUrl) || /\.(doc|docx|xls|xlsx|csv|ppt|pptx)$/.test(cleanName)) return 'office'
    return 'other'
  }

  return (
    <div className="animate-slide-up flex flex-col h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-4rem)]">
      {/* HEADER SECTION */}
      <div className="shrink-0 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dokumen Guru</h2>
          <p className="text-slate-500 text-sm mt-1">Pengelolaan berkas administrasi dan dokumen pembelajaran guru mata pelajaran</p>
        </div>

        {/* Dropdown Tahun Ajaran */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 uppercase">Tahun Ajaran:</label>
          <select
            value={selectedTaId}
            onChange={handleTaChange}
            className="bg-white border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          >
            {tahunAjarans.map(ta => (
              <option key={ta.id} value={ta.id}>
                {ta.nama} {ta.id === activeTa?.id ? '(Aktif)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TABS (Hanya Kurikulum / Admin yang memiliki menu manajemen) */}
      {canManage && (
        <div className="shrink-0 flex border-b border-slate-200 mb-6">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-5 py-2.5 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Unggah Dokumen Saya
          </button>
          <button
            onClick={() => setActiveTab('statistik')}
            className={`px-5 py-2.5 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'statistik'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Statistik Pengumpulan
          </button>
          <button
            onClick={() => setActiveTab('syarat')}
            className={`px-5 py-2.5 font-semibold text-sm border-b-2 transition-all ${
              activeTab === 'syarat'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Atur Syarat Dokumen
          </button>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-slate-500 text-xs font-semibold">Memuat data dokumen...</p>
            </div>
          </div>
        ) : activeTab === 'upload' ? (
          /* =======================================
             MODE 1: UPLOAD DOKUMEN SAYA (TAMPILAN GURU)
             ======================================= */
          requirements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-4 font-semibold text-slate-800 text-base">Tidak Ada Persyaratan Dokumen</h3>
              <p className="text-slate-500 text-xs mt-1.5 max-w-sm">Waka Kurikulum belum menetapkan daftar persyaratan dokumen wajib untuk Tahun Ajaran {selectedTaName}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress Bar Kelengkapan Guru */}
              {(() => {
                const totalReq = requirements.filter(r => r.is_wajib).length || requirements.length
                const uploadedReqSet = new Set(uploads.map(u => u.requirement_id))
                const completedCount = requirements.filter(r => (r.is_wajib ? uploadedReqSet.has(r.id) : false)).length
                const pct = totalReq > 0 ? Math.round((completedCount / totalReq) * 100) : 0
                return (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 mb-2 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kelengkapan Dokumen Wajib ({selectedTaName})</span>
                      <span className="text-xs font-extrabold text-indigo-700">{completedCount} dari {totalReq} Kategori Wajib ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requirements.map(req => {
                  const reqUploads = uploads.filter(u => u.requirement_id === req.id)
                  return (
                    <div key={req.id} className="p-4.5 rounded-xl border border-slate-200/80 flex flex-col justify-between bg-white shadow-sm hover:border-slate-300 transition-all">
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="font-bold text-slate-800 text-sm">{req.nama_dokumen}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            req.is_wajib 
                              ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {req.is_wajib ? 'Wajib' : 'Opsional'}
                          </span>
                        </div>
                        {req.deskripsi && <p className="text-slate-500 text-xs leading-relaxed">{req.deskripsi}</p>}
                      </div>

                      {/* File Submissions List */}
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        {reqUploads.length === 0 ? (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-slate-400 text-xs italic">Belum ada berkas diunggah</span>
                            {isCurrentTa && !readOnly && (
                              <button
                                onClick={() => openUploadModal(req)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                                Pilih & Upload
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                              {reqUploads.map((up) => {
                                const fType = getFileType(up.file_url, up.file_name)
                                return (
                                  <div key={up.id} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 rounded-xl gap-2 transition-colors">
                                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                                      {/* Icon file type */}
                                      {fType === 'image' ? (
                                        <svg className="w-4 h-4 text-sky-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21" strokeWidth="2"/></svg>
                                      ) : fType === 'pdf' ? (
                                        <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V7.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 1H7a2 2 0 00-2 2v16a2 2 0 002 2z"/></svg>
                                      ) : (
                                        <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                      )}
                                      <div className="overflow-hidden flex-1">
                                        <p className="text-xs font-semibold text-slate-800 truncate" title={up.file_name}>{up.file_name}</p>
                                        <p className="text-[10px] text-slate-400">{formatDate(up.uploaded_at)}</p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      {/* Tombol Preview */}
                                      <button
                                        onClick={() => setPreviewFile({ ...up, requirement_name: req.nama_dokumen, guru_nama: session.nama_guru })}
                                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Pratinjau Berkas"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                      </button>

                                      {/* Tombol Hapus */}
                                      {isCurrentTa && !readOnly && (
                                        <button
                                          disabled={isSubmitting}
                                          onClick={() => handleDeleteUpload(up.id)}
                                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                          title="Hapus Berkas"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Tombol Tambah File Lagi */}
                            {isCurrentTa && !readOnly && (
                              <button
                                onClick={() => openUploadModal(req)}
                                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 mt-2"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                                + Upload File Lagi
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ) : activeTab === 'statistik' ? (
          /* =======================================
             MODE 2: STATISTIK PENGUMPULAN (KURIKULUM)
             ======================================= */
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Statistik Pengumpulan Dokumen Guru ({selectedTaName})</h3>
              <span className="text-xs text-slate-500">Total guru: <strong>{teachers.length}</strong></span>
            </div>

            <div className="overflow-auto border border-slate-200 rounded-xl flex-1 min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-5 py-3 font-semibold">Nama Guru</th>
                    <th className="px-5 py-3 font-semibold text-center">Status Kelengkapan Wajib</th>
                    <th className="px-5 py-3 font-semibold text-center">Progress Kategori</th>
                    <th className="px-5 py-3 font-semibold text-center">Total Berkas</th>
                    <th className="px-5 py-3 font-semibold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {teachers.length === 0 ? (
                    <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-500">Tidak ada data guru terdaftar.</td></tr>
                  ) : teachers.map(guru => {
                    const stats = getTeacherStats(guru.id)
                    return (
                      <tr key={guru.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-800">{guru.nama_guru} <span className="text-xs text-slate-400 font-mono">({guru.kode})</span></td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            stats.isComplete
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : stats.uploadedCount > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {stats.isComplete ? 'Lengkap' : stats.uploadedCount > 0 ? 'Sebagian' : 'Belum Ada'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-center justify-center gap-1.5 w-32 mx-auto">
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${stats.percent}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-500">{stats.uploadedCount} / {stats.requiredCount} Kategori</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-bold text-slate-700 text-xs">
                          {stats.totalFilesCount} Berkas
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => setDetailTeacher({ ...guru, stats })}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold rounded-lg text-xs transition"
                          >
                            Lihat Dokumen
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* =======================================
             MODE 3: PENGATURAN SYARAT (KURIKULUM)
             ======================================= */
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Pengaturan Persyaratan Dokumen ({selectedTaName})</h3>
                <p className="text-xs text-slate-500">Tentukan daftar file wajib/opsional yang harus diupload oleh seluruh guru mapel</p>
              </div>
              
              {isCurrentTa && (
                <button
                  onClick={openAddModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                  Tambah Syarat Dokumen
                </button>
              )}
            </div>

            <div className="overflow-auto border border-slate-200 rounded-xl flex-1 min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-5 py-3 font-semibold">Nama Persyaratan</th>
                    <th className="px-5 py-3 font-semibold">Deskripsi</th>
                    <th className="px-5 py-3 font-semibold text-center">Sifat</th>
                    {isCurrentTa && <th className="px-5 py-3 font-semibold text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {requirements.length === 0 ? (
                    <tr><td colSpan={isCurrentTa ? 4 : 3} className="px-5 py-8 text-center text-slate-500">Belum ada persyaratan dokumen dibuat untuk tahun ini.</td></tr>
                  ) : requirements.map(req => (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-800">{req.nama_dokumen}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs max-w-xs truncate">{req.deskripsi || '-'}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          req.is_wajib 
                            ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {req.is_wajib ? 'Wajib' : 'Opsional'}
                        </span>
                      </td>
                      {isCurrentTa && (
                        <td className="px-5 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              onClick={() => openEditModal(req)}
                              className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={() => handleDeleteRequirement(req.id)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-semibold"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* UPLOAD FILE MODAL (TEACHER FORM WITH CUSTOM NAME) */}
      {showUploadModal && uploadTargetReq && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Unggah Dokumen Baru</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-0.5">Kategori: {uploadTargetReq.nama_dokumen}</p>
              </div>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleSubmitUpload} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Nama / Judul Dokumen *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: RPP Matematika Kls 8 Bab 1 Aljabar"
                  value={formDocName}
                  onChange={(e) => setFormDocName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">Berikan nama/keterangan file agar mudah diidentifikasi</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Pilih Berkas File *</label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setSelectedFile(f)
                      if (!formDocName) setFormDocName(f.name)
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Mengunggah...
                    </>
                  ) : (
                    'Unggah Berkas'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* REQUIREMENT MODAL (ADD / EDIT PERSYARATAN KURIKULUM) */}
      {showRequirementModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">{editingRequirement ? 'Edit Syarat Dokumen' : 'Tambah Syarat Dokumen'}</h3>
              <button 
                onClick={() => setShowRequirementModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleSaveRequirement} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Nama Dokumen</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: RPP Semester Ganjil, Silabus, KKM"
                  value={formReqName}
                  onChange={(e) => setFormReqName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Deskripsi</label>
                <textarea
                  placeholder="Penjelasan detail atau berkas pendukung yang disyaratkan"
                  value={formReqDesc}
                  onChange={(e) => setFormReqDesc(e.target.value)}
                  rows="3"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="formReqWajib"
                  checked={formReqWajib}
                  onChange={(e) => setFormReqWajib(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                />
                <label htmlFor="formReqWajib" className="text-sm font-semibold text-slate-700 select-none">
                  Dokumen Bersifat Wajib
                </label>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequirementModal(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* DETAIL STATISTICS MODAL (Kurikulum View Teacher Upload Detail) */}
      {detailTeacher && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Detail Unggahan Berkas Guru</h3>
                <p className="text-xs text-slate-500 mt-0.5">Guru: <span className="font-semibold text-indigo-600">{detailTeacher.nama_guru}</span> ({detailTeacher.kode})</p>
              </div>
              <button 
                onClick={() => setDetailTeacher(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1 space-y-4">
              {requirements.map(req => {
                const ups = detailTeacher.stats.uploadsForGuru.filter(u => u.requirement_id === req.id)
                return (
                  <div key={req.id} className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{req.nama_dokumen}</h4>
                      {ups.length > 0 ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">{ups.length} Berkas Terkumpul</span>
                      ) : req.is_wajib ? (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded text-[10px] font-bold">Belum Ada (Wajib)</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">Opsional</span>
                      )}
                    </div>

                    {ups.length === 0 ? (
                      <p className="text-xs italic text-slate-400 py-1">Belum ada berkas diunggah pada kategori ini.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ups.map(up => (
                          <div key={up.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-xs">
                            <div className="overflow-hidden flex-1 mr-2">
                              <p className="font-semibold text-slate-800 truncate" title={up.file_name}>{up.file_name}</p>
                              <p className="text-[10px] text-slate-400">{formatDate(up.uploaded_at)}</p>
                            </div>
                            <button
                              onClick={() => setPreviewFile({ ...up, requirement_name: req.nama_dokumen, guru_nama: detailTeacher.nama_guru })}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md font-semibold text-[11px] transition shrink-0 flex items-center gap-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              Pratinjau
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-white">
              <button
                onClick={() => setDetailTeacher(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FILE PREVIEW MODAL */}
      {previewFile && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-3 md:p-6">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden animate-slide-up flex flex-col h-[88vh]">
            <div className="p-4 px-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="overflow-hidden mr-4">
                <h3 className="font-bold text-base text-slate-800 truncate" title={previewFile.file_name}>{previewFile.file_name}</h3>
                <p className="text-xs text-slate-500">
                  {previewFile.requirement_name} {previewFile.guru_nama ? `• Guru: ${previewFile.guru_nama}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewFile.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  Buka Tab Baru
                </a>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>

            {/* PREVIEW CONTENT BODY */}
            <div className="p-3 overflow-auto flex-1 bg-slate-100/70 flex items-center justify-center">
              {(() => {
                const type = getFileType(previewFile.file_url, previewFile.file_name)
                if (type === 'image') {
                  return (
                    <img 
                      src={previewFile.file_url} 
                      alt={previewFile.file_name} 
                      className="max-h-full max-w-full object-contain rounded-lg shadow-md"
                    />
                  )
                }
                if (type === 'pdf') {
                  return (
                    <iframe 
                      src={previewFile.file_url} 
                      title={previewFile.file_name} 
                      className="w-full h-full rounded-lg border border-slate-200 shadow-sm bg-white"
                    />
                  )
                }
                if (type === 'office') {
                  const officeEmbedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewFile.file_url)}`
                  const googleEmbedUrl = `https://docs.google.com/gview?url=${encodeURIComponent(previewFile.file_url)}&embedded=true`
                  const embedUrl = previewFile._engine === 'google' ? googleEmbedUrl : officeEmbedUrl

                  return (
                    <div className="w-full h-full flex flex-col">
                      <div className="shrink-0 mb-2 flex items-center justify-between px-1">
                        <span className="text-[11px] text-slate-500 font-semibold">
                          Pratinjau Dokumen Office ({previewFile._engine === 'google' ? 'Google Viewer' : 'Microsoft Office Viewer'})
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewFile(prev => ({ ...prev, _engine: prev._engine === 'google' ? 'office' : 'google' }))}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                        >
                          Ganti ke {previewFile._engine === 'google' ? 'Microsoft Viewer' : 'Google Viewer'}
                        </button>
                      </div>
                      <iframe 
                        src={embedUrl} 
                        title={previewFile.file_name} 
                        className="w-full flex-1 rounded-lg border border-slate-200 shadow-sm bg-white"
                      />
                    </div>
                  )
                }
                // Fallback for zip, etc.
                return (
                  <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md">
                    <svg className="w-16 h-16 text-indigo-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h4 className="font-bold text-slate-800 text-base mb-1">{previewFile.file_name}</h4>
                    <p className="text-xs text-slate-500 mb-4">Pratinjau langsung tidak didukung untuk format berkas ini. Silakan buka atau unduh berkas di bawah ini.</p>
                    <a
                      href={previewFile.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      Buka / Unduh Berkas
                    </a>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* NOTIFICATION ALERT MODAL */}
      {notifyModal.show && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-scale-up">
            {notifyModal.type === 'success' ? (
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : notifyModal.type === 'error' ? (
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}

            <h3 className="font-extrabold text-slate-800 text-lg">{notifyModal.title}</h3>
            <p className="text-slate-500 text-xs font-semibold mt-1.5 leading-relaxed px-2">{notifyModal.message}</p>

            <button
              onClick={() => setNotifyModal(prev => ({ ...prev, show: false }))}
              className={`w-full mt-5 py-2.5 rounded-xl text-xs font-extrabold text-white transition-all shadow-md ${
                notifyModal.type === 'success' 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                  : notifyModal.type === 'error'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
              }`}
            >
              Selesai
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.show && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-scale-up">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <h3 className="font-extrabold text-slate-800 text-lg">{confirmModal.title}</h3>
            <p className="text-slate-500 text-xs font-semibold mt-1.5 leading-relaxed px-2">{confirmModal.message}</p>

            <div className="grid grid-cols-2 gap-2.5 w-full mt-5">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="py-2.5 rounded-xl text-xs font-extrabold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const action = confirmModal.onConfirm
                  setConfirmModal(prev => ({ ...prev, show: false }))
                  if (action) action()
                }}
                className="py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-200 transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
