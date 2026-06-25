import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export default function AdminGuruSection({ tahunAjarans, activeTa }) {
  const [gurus, setGurus] = useState([])
  const [roles, setRoles] = useState([])
  const [classes, setClasses] = useState([])
  const [mapels, setMapels] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [formData, setFormData] = useState(null)
  
  const [csvSyncing, setCsvSyncing] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoProgress, setPhotoProgress] = useState(null)
  
  const csvInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const singlePhotoInputRef = useRef(null)
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  const fetchInitialData = async () => {
    setLoading(true)
    
    // Fetch classes from enrollment
    const { data: enrolls } = await supabase.from('enrollment').select('kelas').eq('tahun_ajaran_id', activeTa?.id || null)
    if (enrolls) {
      const uniqueClasses = [...new Set(enrolls.map(e => e.kelas).filter(Boolean))].sort()
      setClasses(uniqueClasses)
    }

    // Fetch roles
    const { data: rolesData } = await supabase.from('roles').select('id, nama').order('nama')
    if (rolesData) setRoles(rolesData)

    // Fetch mapels
    const { data: mapelsData } = await supabase.from('mata_pelajaran').select('id, nama').order('nama')
    if (mapelsData) setMapels(mapelsData)

    fetchGurus()
  }

  const fetchGurus = async () => {
    // Fetch guru + their roles + their classes
    const { data: gurusData, error } = await supabase.from('guru')
      .select(`
        *,
        guru_role ( role_id ),
        guru_kelas ( kelas, tahun_ajaran_id ),
        guru_mapel ( mata_pelajaran_id, kelas, tahun_ajaran_id )
      `)
      .order('nama_guru')
      
    if (error) {
      console.error(error)
      alert('Gagal mengambil data guru: ' + error.message)
    } else {
      setGurus(gurusData || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInitialData()
  }, [activeTa?.id])

  const handleEdit = (guru) => {
    const activeClasses = guru.guru_kelas
      .filter(gk => gk.tahun_ajaran_id === activeTa?.id)
      .map(gk => gk.kelas)
      
    const activeMapels = guru.guru_mapel
      .filter(gm => gm.tahun_ajaran_id === activeTa?.id)

    const mapelGroup = {}
    activeMapels.forEach(gm => {
      if (!mapelGroup[gm.mata_pelajaran_id]) mapelGroup[gm.mata_pelajaran_id] = []
      mapelGroup[gm.mata_pelajaran_id].push(gm.kelas)
    })
    
    const mapelAssigned = Object.keys(mapelGroup).map(mapel_id => ({
      mapel_id,
      kelas_list: mapelGroup[mapel_id]
    }))
    
    setFormData({
      id: guru.id,
      kode: guru.kode,
      nama_guru: guru.nama_guru,
      user_name: guru.user_name,
      kode_akses: guru.kode_akses,
      foto_url: guru.foto_url,
      role_ids: guru.guru_role.map(gr => gr.role_id),
      kelas_assigned: activeClasses,
      mapel_assigned: mapelAssigned
    })
    setShowModal(true)
  }

  const handleAdd = () => {
    setFormData({
      id: null,
      kode: '',
      nama_guru: '',
      user_name: '',
      kode_akses: '',
      foto_url: null,
      role_ids: [],
      kelas_assigned: [],
      mapel_assigned: []
    })
    setShowModal(true)
  }

  const handleDelete = async (id, nama) => {
    if (!window.confirm(`Yakin ingin menghapus guru ${nama}? Data terkait (role, penugasan kelas) juga akan terhapus.`)) return
    setLoading(true)
    const { error } = await supabase.from('guru').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    fetchGurus()
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    let guruId = formData.id

    // 1. Save Guru Data
    const guruPayload = {
      kode: formData.kode,
      nama_guru: formData.nama_guru,
      user_name: formData.user_name,
      kode_akses: formData.kode_akses,
      foto_url: formData.foto_url
    }

    if (guruId) {
      const { error } = await supabase.from('guru').update(guruPayload).eq('id', guruId)
      if (error) { alert('Gagal: ' + error.message); setIsSaving(false); return }
    } else {
      const { data, error } = await supabase.from('guru').insert([guruPayload]).select()
      if (error) { alert('Gagal: ' + error.message); setIsSaving(false); return }
      guruId = data[0].id
    }

    // 2. Sync Roles
    await supabase.from('guru_role').delete().eq('guru_id', guruId)
    if (formData.role_ids.length > 0) {
      const roleInserts = formData.role_ids.map(rid => ({ guru_id: guruId, role_id: rid }))
      await supabase.from('guru_role').insert(roleInserts)
    }

    // 3. Sync Kelas for Active TA
    if (activeTa) {
      await supabase.from('guru_kelas').delete().match({ guru_id: guruId, tahun_ajaran_id: activeTa.id })
      if (formData.kelas_assigned.length > 0) {
        const kelasInserts = formData.kelas_assigned.map(k => ({ guru_id: guruId, kelas: k, tahun_ajaran_id: activeTa.id }))
        await supabase.from('guru_kelas').insert(kelasInserts)
      }
      
      // Sync Mapel for Active TA
      await supabase.from('guru_mapel').delete().match({ guru_id: guruId, tahun_ajaran_id: activeTa.id })
      const mapelInserts = []
      formData.mapel_assigned.forEach(ma => {
        ma.kelas_list.forEach(k => {
          mapelInserts.push({ guru_id: guruId, mata_pelajaran_id: ma.mapel_id, kelas: k, tahun_ajaran_id: activeTa.id })
        })
      })
      if (mapelInserts.length > 0) {
        await supabase.from('guru_mapel').insert(mapelInserts)
      }
    }

    setShowModal(false)
    setIsSaving(false)
    fetchGurus()
  }

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvSyncing(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data || data.length === 0) {
        alert('File Excel kosong atau format salah')
        setCsvSyncing(false)
        return
      }

      const defaultRole = roles.find(r => r.nama.toLowerCase() === 'guru')
      let successCount = 0
      let errorCount = 0

      for (const row of data) {
        const kode = String(row.kode || row.KODE || '').trim()
        const nama = String(row.nama_guru || row['NAMA GURU'] || '').trim()
        const user_name = String(row.user_name || row.USERNAME || '').trim()
        const kode_akses = String(row.kode_akses || row['KODE AKSES'] || '').trim()
        if (!kode || !nama || !user_name || !kode_akses) continue
        
        const payload = { kode, nama_guru: nama, user_name, kode_akses }

        const { data: exist } = await supabase.from('guru').select('id').eq('kode', payload.kode).maybeSingle()
        
        let guruId
        if (exist) {
          guruId = exist.id
          const { error } = await supabase.from('guru').update(payload).eq('id', guruId)
          if (error) { errorCount++ } else { successCount++ }
        } else {
          const { data: newGuru, error } = await supabase.from('guru').insert([payload]).select()
          if (error) { errorCount++; continue }
          guruId = newGuru[0].id
          successCount++
          if (defaultRole) {
            await supabase.from('guru_role').insert([{ guru_id: guruId, role_id: defaultRole.id }])
          }
        }
      }

      alert(`Sinkronisasi selesai!\nBerhasil: ${successCount}\nGagal: ${errorCount}`)
    } catch (err) {
      alert('Gagal memproses file: ' + err.message)
    }
    setCsvSyncing(false)
    if (csvInputRef.current) csvInputRef.current.value = ''
    fetchGurus()
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    
    if (!window.confirm(`Akan mengunggah ${files.length} foto guru. Pastikan nama file adalah KODE GURU (misal: g02026.jpg). Lanjutkan?`)) {
      if (photoInputRef.current) photoInputRef.current.value = ''
      return
    }

    setPhotoUploading(true)
    let success = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      setPhotoProgress(`Mengunggah ${i + 1} dari ${files.length}...`)
      const file = files[i]
      
      // Filename without extension should be the guru code
      const kodeGuru = file.name.split('.').slice(0, -1).join('.')
      
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('upload_preset', UPLOAD_PRESET)

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) throw new Error('Cloudinary upload failed')
        const uploadResult = await res.json()
        const photoUrl = uploadResult.secure_url

        // Update database
        const { error: dbError } = await supabase.from('guru')
          .update({ foto_url: photoUrl })
          .eq('kode', kodeGuru)

        if (dbError) throw dbError
        success++
      } catch (err) {
        console.error('Failed uploading photo for', kodeGuru, err)
        failed++
      }
    }

    setPhotoUploading(false)
    setPhotoProgress(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    alert(`Selesai unggah foto guru.\nBerhasil: ${success}\nGagal: ${failed}`)
    fetchGurus()
  }

  const handleSinglePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!formData.kode) {
      alert('Harap isi "Kode" guru terlebih dahulu sebelum mengunggah foto.')
      if (singlePhotoInputRef.current) singlePhotoInputRef.current.value = ''
      return
    }

    setIsUploadingPhoto(true)
    try {
      const uploadData = new FormData()
      uploadData.append('file', file)
      uploadData.append('upload_preset', UPLOAD_PRESET)
      uploadData.append('public_id', formData.kode)
      
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: uploadData
      })

      if (!res.ok) throw new Error('Upload failed')
      const result = await res.json()
      
      setFormData(prev => ({ ...prev, foto_url: result.secure_url }))
    } catch (err) {
      console.error(err)
      alert('Gagal mengunggah foto.')
    }
    setIsUploadingPhoto(false)
    if (singlePhotoInputRef.current) singlePhotoInputRef.current.value = ''
  }

  return (
    <div className="animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Guru</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola data guru, role, dan penugasan kelas</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="file" accept=".xlsx,.xls,.csv" ref={csvInputRef} className="hidden" onChange={handleCsvImport} />
          <button onClick={() => csvInputRef.current?.click()} disabled={csvSyncing || photoUploading}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2">
            {csvSyncing ? (
              <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            )}
            Import Excel
          </button>
          
          <input type="file" accept="image/*" multiple ref={photoInputRef} className="hidden" onChange={handlePhotoUpload} />
          <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading || csvSyncing}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2">
            {photoUploading ? (
              <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            )}
            Upload Foto
          </button>

          <button onClick={handleAdd}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Tambah Guru
          </button>
        </div>
      </div>

      <div className="bg-white border-none rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800 text-sm">Daftar Guru / Staff</h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
                  <th className="px-5 py-3 font-semibold">Nama & Kode</th>
                  <th className="px-5 py-3 font-semibold">Login Info</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Wali Kelas (TA Aktif)</th>
                  <th className="px-5 py-3 font-semibold">Tugas Mengajar (TA Aktif)</th>
                  <th className="px-5 py-3 font-semibold text-center w-24 sticky right-0 bg-white shadow-[-4px_0_10px_rgba(0,0,0,0.05)] z-10">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gurus.length === 0 ? (
                  <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-500">Belum ada data guru. Silakan tambah atau import CSV.</td></tr>
                ) : gurus.map(guru => {
                  const roleNames = guru.guru_role.map(gr => roles.find(r => r.id === gr.role_id)?.nama).filter(Boolean)
                  const kelasNames = guru.guru_kelas.filter(gk => gk.tahun_ajaran_id === activeTa?.id).map(gk => gk.kelas)
                  
                  const activeMapels = guru.guru_mapel.filter(gm => gm.tahun_ajaran_id === activeTa?.id)
                  const mapelGroup = {}
                  activeMapels.forEach(gm => {
                    const mapelObj = mapels.find(m => m.id === gm.mata_pelajaran_id)
                    const mName = mapelObj ? (mapelObj.singkatan || mapelObj.nama) : 'Unknown'
                    if (!mapelGroup[mName]) mapelGroup[mName] = []
                    mapelGroup[mName].push(gm.kelas)
                  })
                  
                  return (
                    <tr key={guru.id} className="group hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-500 font-bold text-xs">
                            {guru.foto_url ? <img src={guru.foto_url} alt="" className="w-full h-full object-cover" /> : guru.nama_guru.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{guru.nama_guru}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{guru.kode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 w-fit">User: {guru.user_name}</span>
                          <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 w-fit">Pass: {guru.kode_akses}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {roleNames.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {roleNames.map(r => <span key={r} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md border border-indigo-100">{r}</span>)}
                          </div>
                        ) : <span className="text-xs text-slate-400 italic">Belum diset</span>}
                      </td>
                      <td className="px-5 py-3">
                        {kelasNames.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {kelasNames.map(k => <span key={k} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-md border border-emerald-100">{k}</span>)}
                          </div>
                        ) : <span className="text-xs text-slate-400 italic">Tidak ada kelas</span>}
                      </td>
                      <td className="px-5 py-3">
                        {Object.keys(mapelGroup).length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {Object.keys(mapelGroup).map(mName => (
                              <div key={mName} className="text-xs">
                                <span className="font-medium text-slate-700">{mName}:</span> <span className="text-slate-500">{mapelGroup[mName].join(', ')}</span>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-slate-400 italic">-</span>}
                      </td>
                      <td className="px-5 py-3 text-center sticky right-0 bg-white shadow-[-4px_0_10px_rgba(0,0,0,0.05)] z-10 group-hover:bg-slate-50">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => handleEdit(guru)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                          <button onClick={() => handleDelete(guru.id, guru.nama_guru)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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

      {showModal && formData && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh] animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{formData.id ? 'Edit Guru' : 'Tambah Guru'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-2xl hover:bg-slate-100"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            <form id="guru-form" onSubmit={handleSave} className="p-5 overflow-y-auto space-y-5">
              <div className="flex flex-col items-center justify-center mb-2">
                <input type="file" accept="image/*" ref={singlePhotoInputRef} className="hidden" onChange={handleSinglePhotoUpload} />
                <div 
                  onClick={() => singlePhotoInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-pointer group flex items-center justify-center text-slate-400 hover:border-indigo-400 transition-colors"
                >
                  {isUploadingPhoto ? (
                    <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  ) : formData.foto_url ? (
                    <img src={formData.foto_url} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold">{formData.nama_guru?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                  
                  {!isUploadingPhoto && (
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kode <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.kode} onChange={e => setFormData({...formData, kode: e.target.value})} placeholder="g02026" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.nama_guru} onChange={e => setFormData({...formData, nama_guru: e.target.value})} placeholder="Nama Guru" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username Login <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} placeholder="ebm..." className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kode Akses / Pass <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.kode_akses} onChange={e => setFormData({...formData, kode_akses: e.target.value})} placeholder="Password" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role Pengguna</label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map(r => {
                    const checked = formData.role_ids.includes(r.id)
                    return (
                      <label key={r.id} className={`flex items-center gap-2 p-2 border rounded-2xl cursor-pointer transition-colors ${checked ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" checked={checked} 
                          onChange={(e) => {
                            if (e.target.checked) setFormData({...formData, role_ids: [...formData.role_ids, r.id]})
                            else setFormData({...formData, role_ids: formData.role_ids.filter(id => id !== r.id)})
                          }} 
                        />
                        <span className="text-sm text-slate-700">{r.nama}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {activeTa ? (
                <div className="space-y-4">
                  {formData.role_ids.some(rid => {
                    const r = roles.find(role => role.id === rid)
                    return r && r.nama?.toLowerCase().includes('wali')
                  }) && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="block text-sm font-semibold text-slate-800 mb-2">Penugasan Wali Kelas (TA: {activeTa.nama})</label>
                      <div className="flex flex-wrap gap-2">
                        {classes.map(k => {
                          const checked = formData.kelas_assigned.includes(k)
                          return (
                            <label key={k} className={`flex items-center justify-center px-3 py-1.5 border rounded-2xl cursor-pointer transition-colors ${checked ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                              <input type="checkbox" className="sr-only" checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setFormData({...formData, kelas_assigned: [...formData.kelas_assigned, k]})
                                  else setFormData({...formData, kelas_assigned: formData.kelas_assigned.filter(id => id !== k)})
                                }}
                              />
                              <span className="text-sm">{k}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-semibold text-slate-800">Tugas Mengajar Mapel</label>
                      <button type="button" onClick={() => {
                        setFormData({...formData, mapel_assigned: [...formData.mapel_assigned, { mapel_id: '', kelas_list: [] }]})
                      }} className="text-xs bg-white border border-slate-300 px-2 py-1 rounded-md shadow-sm hover:bg-slate-100 font-medium text-slate-700">
                        + Tambah Mapel
                      </button>
                    </div>
                    
                    {formData.mapel_assigned.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Belum ada tugas mengajar mapel ditambahkan.</p>
                    ) : (
                      <div className="space-y-3">
                        {formData.mapel_assigned.map((ma, index) => (
                          <div key={index} className="bg-white p-3 rounded-2xl border border-slate-200">
                            <div className="flex gap-2 mb-2">
                              <select value={ma.mapel_id} onChange={(e) => {
                                const newMapels = [...formData.mapel_assigned]
                                newMapels[index].mapel_id = e.target.value
                                setFormData({...formData, mapel_assigned: newMapels})
                              }} className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="">-- Pilih Mata Pelajaran --</option>
                                {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                              </select>
                              <button type="button" onClick={() => {
                                const newMapels = formData.mapel_assigned.filter((_, i) => i !== index)
                                setFormData({...formData, mapel_assigned: newMapels})
                              }} className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-md text-sm">Hapus</button>
                            </div>
                            <div className="flex items-center justify-between mt-2 mb-1.5">
                              <span className="text-xs font-medium text-slate-500">Pilih Kelas:</span>
                              {classes.length > 0 && (
                                <label className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 px-1.5 py-0.5 rounded transition-colors">
                                  <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3 h-3"
                                    checked={ma.kelas_list.length === classes.length && classes.length > 0}
                                    onChange={(e) => {
                                      const newMapels = [...formData.mapel_assigned]
                                      if (e.target.checked) newMapels[index].kelas_list = [...classes]
                                      else newMapels[index].kelas_list = []
                                      setFormData({...formData, mapel_assigned: newMapels})
                                    }}
                                  />
                                  <span className="text-[11px] font-medium text-slate-500">Pilih Semua</span>
                                </label>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {classes.map(k => {
                                const checked = ma.kelas_list.includes(k)
                                return (
                                  <label key={k} className={`flex items-center justify-center px-2 py-1 border rounded cursor-pointer transition-colors text-xs ${checked ? 'bg-indigo-100 border-indigo-400 text-indigo-700 font-medium' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                                    <input type="checkbox" className="sr-only" checked={checked}
                                      onChange={(e) => {
                                        const newMapels = [...formData.mapel_assigned]
                                        if (e.target.checked) newMapels[index].kelas_list.push(k)
                                        else newMapels[index].kelas_list = newMapels[index].kelas_list.filter(id => id !== k)
                                        setFormData({...formData, mapel_assigned: newMapels})
                                      }}
                                    />
                                    <span>{k}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                 <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-2xl border border-amber-200">
                   Tidak dapat assign kelas karena tidak ada Tahun Ajaran aktif.
                 </div>
              )}
            </form>

            <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
              <button type="submit" form="guru-form" disabled={isSaving} className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center shadow-sm">
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan Data Guru'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
