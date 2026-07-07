import React, { useState, useEffect } from 'react'
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

  // Modal States
  const [showRequirementModal, setShowRequirementModal] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState(null)
  const [formReqName, setFormReqName] = useState('')
  const [formReqDesc, setFormReqDesc] = useState('')
  const [formReqWajib, setFormReqWajib] = useState(true)

  // Teacher detail stats modal
  const [detailTeacher, setDetailTeacher] = useState(null)

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
        if (myUpErr) throw myUpErr
        setUploads(myUps || [])
      }
    } catch (err) {
      console.error('Error fetching document data:', err)
    } finally {
      setLoading(false)
    }
  }

  // UPLOAD FILE
  const handleUploadFile = async (e, requirementId) => {
    const file = e.target.files[0]
    if (!file) return

    setIsSubmitting(true)
    try {
      const publicId = `DOC_GURU_${session.id}_${requirementId}_${Date.now()}`
      const folder = `dokumen_guru`

      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('public_id', publicId)
      formData.append('folder', folder)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) throw new Error("Upload ke Cloudinary gagal")
      const data = await res.json()

      // Save upload path to Supabase
      const { error: dbErr } = await supabase.from('guru_document_uploads').upsert({
        requirement_id: requirementId,
        guru_id: session.id,
        file_url: data.secure_url,
        file_name: file.name,
        cloudinary_public_id: data.public_id,
        uploaded_at: new Date().toISOString()
      }, { onConflict: 'requirement_id,guru_id' })

      if (dbErr) throw dbErr
      
      alert('Dokumen berhasil diunggah!')
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Gagal mengupload dokumen: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // DELETE UPLOAD
  const handleDeleteUpload = async (uploadId, publicId) => {
    if (!confirm('Apakah Anda yakin ingin menghapus dokumen yang sudah diupload?')) return
    setIsSubmitting(true)

    try {
      // 1. Delete from database
      const { error: dbErr } = await supabase.from('guru_document_uploads').delete().eq('id', uploadId)
      if (dbErr) throw dbErr

      // NOTE: We leave the Cloudinary destruction as-is or we can call destruction API.
      // Usually, client-side direct deletion is not supported without unsigned delete token.
      // Simply deleting from Supabase is sufficient for application integrity.
      
      alert('Dokumen berhasil dihapus!')
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus dokumen: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
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
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Gagal menyimpan persyaratan: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRequirement = async (id) => {
    if (!confirm('Menghapus persyaratan ini juga akan menghapus seluruh file guru yang sudah diupload. Lanjutkan?')) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('guru_document_requirements').delete().eq('id', id)
      if (error) throw error
      fetchData()
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus persyaratan: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
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

  // Calculate Stats
  const getTeacherStats = (guruId) => {
    const uploadsForGuru = allUploads.filter(u => u.guru_id === guruId)
    const requiredCount = requirements.length
    const uploadedCount = uploadsForGuru.length
    const isComplete = requiredCount > 0 && uploadedCount === requiredCount
    const percent = requiredCount > 0 ? Math.round((uploadedCount / requiredCount) * 100) : 0
    return { uploadedCount, requiredCount, isComplete, percent, uploadsForGuru }
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
                const total = requirements.length
                const completed = uploads.length
                const pct = Math.round((completed / total) * 100)
                return (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 mb-2 shrink-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kelengkapan Dokumen Anda ({selectedTaName})</span>
                      <span className="text-xs font-extrabold text-indigo-700">{completed} dari {total} Dokumen ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requirements.map(req => {
                  const upload = uploads.find(u => u.requirement_id === req.id)
                  return (
                    <div key={req.id} className="p-4 rounded-xl border border-slate-200/80 flex flex-col justify-between bg-white shadow-sm hover:border-slate-300 transition-all">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-bold text-slate-800 text-sm">{req.nama_dokumen}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.is_wajib 
                              ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {req.is_wajib ? 'Wajib' : 'Opsional'}
                          </span>
                        </div>
                        {req.deskripsi && <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">{req.deskripsi}</p>}
                      </div>

                      {/* File Submissions */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        {upload ? (
                          <div className="flex-1 flex items-center justify-between gap-2 overflow-hidden mr-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <svg className="w-4 h-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <a 
                                href={upload.file_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline truncate"
                              >
                                {upload.file_name}
                              </a>
                            </div>
                            
                            {/* Hanya bisa hapus jika di Tahun Ajaran Aktif dan bukan Read-Only */}
                            {isCurrentTa && !readOnly && (
                              <button
                                disabled={isSubmitting}
                                onClick={() => handleDeleteUpload(upload.id, upload.cloudinary_public_id)}
                                className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between gap-3">
                            <span className="text-slate-400 text-xs italic">Belum diupload</span>
                            {isCurrentTa && !readOnly ? (
                              <label className="cursor-pointer px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm">
                                {isSubmitting ? 'Mengunggah...' : 'Pilih & Upload'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={isSubmitting}
                                  onChange={(e) => handleUploadFile(e, req.id)}
                                />
                              </label>
                            ) : (
                              <span className="text-slate-400 text-[11px] font-medium italic">Upload Ditutup</span>
                            )}
                          </div>
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
                    <th className="px-5 py-3 font-semibold text-center">Status Kelengkapan</th>
                    <th className="px-5 py-3 font-semibold text-center">Progress</th>
                    <th className="px-5 py-3 font-semibold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {teachers.length === 0 ? (
                    <tr><td colSpan="4" className="px-5 py-8 text-center text-slate-500">Tidak ada data guru terdaftar.</td></tr>
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
                            <span className="text-[11px] font-bold text-slate-500">{stats.uploadedCount} / {stats.requiredCount} Dokumen</span>
                          </div>
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

      {/* REQUIREMENT MODAL (ADD / EDIT) */}
      {showRequirementModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
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
        </div>
      )}

      {/* DETAIL STATISTICS MODAL (Kurikulum View Teacher Upload Detail) */}
      {detailTeacher && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl overflow-hidden animate-slide-up flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Detail Unggahan Berkas</h3>
                <p className="text-xs text-slate-500 mt-0.5">Guru: <span className="font-semibold text-indigo-600">{detailTeacher.nama_guru}</span> ({detailTeacher.kode})</p>
              </div>
              <button 
                onClick={() => setDetailTeacher(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition animate-fade-in"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1 bg-slate-50/50 space-y-3">
              {requirements.map(req => {
                const up = detailTeacher.stats.uploadsForGuru.find(u => u.requirement_id === req.id)
                return (
                  <div key={req.id} className="p-3.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{req.nama_dokumen}</p>
                      {up ? (
                        <a 
                          href={up.file_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline truncate block mt-1"
                        >
                          {up.file_name}
                        </a>
                      ) : (
                        <p className="text-xs italic text-slate-400 mt-1">Belum dikumpulkan</p>
                      )}
                    </div>
                    <div>
                      {up ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">Terkumpul</span>
                      ) : req.is_wajib ? (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded text-[10px] font-bold">Wajib</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold">Opsional</span>
                      )}
                    </div>
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
        </div>
      )}
    </div>
  )
}
