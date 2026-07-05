import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { jsPDF } from 'jspdf'

export default function PengumumanResmiSection({ session, activeTa }) {
  const isKepalaSekolah = session?.roles?.some(r => r.nama.toLowerCase().includes('kepala sekolah'))
  const hasWriteAccess = session?.roles?.some(r => r.nama.toLowerCase().includes('kepala sekolah')) || session?.email === 'admin@gmail.com' || (session?.role || '').toLowerCase() === 'admin'

  // Cloudinary settings
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  // States
  const [announcements, setAnnouncements] = useState([])
  const [targetPesertaOptions, setTargetPesertaOptions] = useState([])
  const [kelasOptions, setKelasOptions] = useState([])
  const [schoolSettings, setSchoolSettings] = useState({
    nama_sekolah: 'SMP BUDI MULIA JAKARTA',
    logo_url: '/logo.png',
    alamat: 'Jl. Mangga Besar No. 3, Jakarta Pusat',
    telepon: '(021) 6296366'
  })
  
  const [loading, setLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSearch, setFilterSearch] = useState('')

  // Form Fields
  const [editingId, setEditingId] = useState(null)
  const [judul, setJudul] = useState('')
  const [nomorSurat, setNomorSurat] = useState('')
  const [isi, setIsi] = useState('')
  const [tanggalTerbit, setTanggalTerbit] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState('Draft') // Draft, Terbit, Diarsipkan
  const [selectedTargets, setSelectedTargets] = useState([]) // array of target_id (pivot)
  const [selectedClasses, setSelectedClasses] = useState([]) // target specific classes
  const [attachments, setAttachments] = useState([]) // array of { file_name, file_url }
  const [tandaTanganUrl, setTandaTanganUrl] = useState('')
  const [isUploadingSignature, setIsUploadingSignature] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)

  // Preview / PDF Modal
  const [previewItem, setPreviewItem] = useState(null)
  const editorRef = useRef(null)

  // Fetch announcements & config data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch announcements
      let query = supabase.from('pengumuman_resmi')
        .select(`
          *,
          pengumuman_resmi_dokumen (*),
          pengumuman_resmi_target_pivot (target_id)
        `)
        .order('tanggal_terbit', { ascending: false })
        .order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      setAnnouncements(data || [])

      // 2. Fetch target options (Semua Siswa, Guru, Orang Tua)
      const { data: targets } = await supabase.from('program_sekolah_target_peserta').select('*')
      setTargetPesertaOptions(targets || [])

      // 3. Fetch kelas options
      const { data: students } = await supabase.from('siswa_lengkap').select('kelas').eq('is_aktif', true)
      const uniqueKelas = [...new Set((students || []).map(s => s.kelas).filter(Boolean))].sort()
      setKelasOptions(uniqueKelas)

      // 4. Fetch school profile settings
      const { data: sch } = await supabase.from('pengaturan_sekolah').select('*')
      if (sch) {
        const settings = { ...schoolSettings }
        sch.forEach(s => {
          if (s.setting_key === 'nama_sekolah') settings.nama_sekolah = s.setting_value
          if (s.setting_key === 'logo_sekolah' || s.setting_key === 'logo_url') settings.logo_url = s.setting_value
          if (s.setting_key === 'alamat_sekolah') settings.alamat = s.setting_value
          if (s.setting_key === 'telepon_sekolah') settings.telepon = s.setting_value
        })
        setSchoolSettings(settings)
      }

      // 5. Fetch last used signature URL for convenience
      const { data: lastSig } = await supabase.from('pengumuman_resmi')
        .select('tanda_tangan_url')
        .is('tanda_tangan_url', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (lastSig && lastSig.length > 0 && lastSig[0].tanda_tangan_url) {
        setTandaTanganUrl(lastSig[0].tanda_tangan_url)
      }

    } catch (err) {
      console.error('Error fetching announcement data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Simple rich text action formatter
  const handleEditorAction = (tag) => {
    if (!editorRef.current) return
    const textarea = editorRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selectedText = text.substring(start, end)
    
    let replacement = ''
    if (tag === 'bold') replacement = `<b>${selectedText || 'Teks Tebal'}</b>`
    else if (tag === 'italic') replacement = `<i>${selectedText || 'Teks Miring'}</i>`
    else if (tag === 'underline') replacement = `<u>${selectedText || 'Teks Garis Bawah'}</u>`
    else if (tag === 'list') replacement = `\n<ul>\n  <li>${selectedText || 'Item Daftar'}</li>\n</ul>`

    const newText = text.substring(0, start) + replacement + text.substring(end)
    setIsi(newText)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + replacement.length, start + replacement.length)
    }, 0)
  }

  // Upload digital signature to Cloudinary
  const handleUploadSignature = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploadingSignature(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
      })
      const result = await res.json()
      if (result.secure_url) {
        setTandaTanganUrl(result.secure_url)
      } else {
        throw new Error('Gagal mengunggah foto tanda tangan.')
      }
    } catch (err) {
      alert('Gagal mengunggah: ' + err.message)
    } finally {
      setIsUploadingSignature(false)
    }
  }

  // Upload attachment file to Cloudinary
  const handleUploadAttachment = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setIsUploadingFile(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
        method: 'POST',
        body: formData
      })
      const result = await res.json()
      if (result.secure_url) {
        setAttachments(prev => [...prev, { file_name: file.name, file_url: result.secure_url }])
      } else {
        throw new Error('Gagal mengunggah dokumen lampiran.')
      }
    } catch (err) {
      alert('Gagal mengunggah dokumen: ' + err.message)
    } finally {
      setIsUploadingFile(false)
    }
  }

  // Form Reset
  const resetForm = () => {
    setEditingId(null)
    setJudul('')
    setNomorSurat('')
    setIsi('')
    setTanggalTerbit(new Date().toISOString().slice(0, 10))
    setStatus('Draft')
    setSelectedTargets([])
    setSelectedClasses([])
    setAttachments([])
    setIsFormOpen(false)
  }

  // Edit action
  const handleEdit = (item) => {
    setEditingId(item.id)
    setJudul(item.judul)
    setNomorSurat(item.nomor_surat || '')
    setIsi(item.isi)
    setTanggalTerbit(item.tanggal_terbit)
    setStatus(item.status)
    setSelectedClasses(item.target_kelas || [])
    setTandaTanganUrl(item.tanda_tangan_url || '')
    setSelectedTargets(item.pengumuman_resmi_target_pivot.map(p => p.target_id))
    setAttachments(item.pengumuman_resmi_dokumen.map(d => ({ file_name: d.file_name, file_url: d.file_url })))
    setIsFormOpen(true)
  }

  // Submit / Create / Update
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!judul || !isi) return alert('Harap isi judul dan isi surat.')
    setIsSubmitting(true)

    try {
      // 1. Upsert pengumuman_resmi
      const payload = {
        judul,
        nomor_surat: nomorSurat || null,
        isi,
        tanggal_terbit: tanggalTerbit,
        status,
        tanda_tangan_url: tandaTanganUrl || null,
        target_kelas: selectedClasses.length > 0 ? selectedClasses : null,
        created_by: session?.id || null,
        updated_at: new Date().toISOString()
      }

      let pengumumanId = editingId
      if (editingId) {
        const { error } = await supabase.from('pengumuman_resmi').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('pengumuman_resmi').insert([payload]).select('id').single()
        if (error) throw error
        pengumumanId = data.id
      }

      // 2. Sync target pivot
      await supabase.from('pengumuman_resmi_target_pivot').delete().eq('pengumuman_id', pengumumanId)
      if (selectedTargets.length > 0) {
        const pivotInserts = selectedTargets.map(tid => ({
          pengumuman_id: pengumumanId,
          target_id: tid
        }))
        await supabase.from('pengumuman_resmi_target_pivot').insert(pivotInserts)
      }

      // 3. Sync documents
      await supabase.from('pengumuman_resmi_dokumen').delete().eq('pengumuman_id', pengumumanId)
      if (attachments.length > 0) {
        const docInserts = attachments.map(att => ({
          pengumuman_id: pengumumanId,
          file_name: att.file_name,
          file_url: att.file_url
        }))
        await supabase.from('pengumuman_resmi_dokumen').insert(docInserts)
      }

      // 4. Send Automatic In-App Notification if published (status === 'Terbit')
      if (status === 'Terbit') {
        const isSiswaTarget = selectedTargets.some(tid => {
          const tName = targetPesertaOptions.find(t => t.id === tid)?.nama?.toLowerCase()
          return tName === 'semua siswa' || tName?.includes('siswa')
        })

        const notifPayload = {
          judul: `[PENGUMUMAN RESMI] ${judul}`,
          pesan: `Surat Keputusan Resmi Kepala Sekolah No. ${nomorSurat || '—'}. Silakan cek riwayat dokumen surat.`,
          tipe: 'info',
          target_kelas: selectedClasses.length > 0 ? selectedClasses[0] : null, // Notifikasi target kelas pertama
          dibuat_oleh: 'Kepala Sekolah'
        }

        await supabase.from('notifikasi').insert(notifPayload)
      }

      alert('✓ Pengumuman resmi berhasil disimpan!')
      resetForm()
      fetchData()
    } catch (err) {
      alert('Gagal menyimpan pengumuman: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete action
  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus surat pengumuman resmi ini? Tindakan ini tidak dapat dibatalkan.')) return
    try {
      const { error } = await supabase.from('pengumuman_resmi').delete().eq('id', id)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  // Export formal letter design to PDF
  const handleExportPDF = (item) => {
    const doc = new jsPDF()

    // 1. Header (Kop Surat)
    doc.setFont('times', 'bold')
    doc.setFontSize(14)
    doc.text(schoolSettings.nama_sekolah.toUpperCase(), 105, 20, { align: 'center' })
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text(schoolSettings.alamat, 105, 25, { align: 'center' })
    doc.text(`Telepon: ${schoolSettings.telepon}`, 105, 30, { align: 'center' })
    
    // Garis Kop Surat
    doc.setLineWidth(0.8)
    doc.line(20, 34, 190, 34)
    doc.setLineWidth(0.2)
    doc.line(20, 35.5, 190, 35.5)

    // 2. Detail Pengumuman
    doc.setFont('times', 'bold')
    doc.setFontSize(12)
    doc.text('SURAT PENGUMUMAN RESMI', 105, 48, { align: 'center' })
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text(`Nomor: ${item.nomor_surat || '—'}`, 105, 53, { align: 'center' })

    // Tanggal Terbit
    doc.text(`Tanggal Terbit: ${new Date(item.tanggal_terbit).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, 20, 68)

    // Perihal / Judul
    doc.setFont('times', 'bold')
    doc.text(`Hal: ${item.judul}`, 20, 74)

    // 3. Body Text (Hilangkan tag HTML dasar untuk PDF rendering aman)
    const cleanIsi = item.isi
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<li>/gi, ' - ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]*>/g, '') // remove remaining tags

    doc.setFont('times', 'normal')
    const splitText = doc.splitTextToSize(cleanIsi, 170)
    doc.text(splitText, 20, 86)

    // 4. Tanda Tangan
    const bottomY = doc.previousAutoTable ? doc.previousAutoTable.finalY + 30 : 200
    doc.text('Hormat Kami,', 140, bottomY)
    doc.setFont('times', 'bold')
    doc.text('Kepala Sekolah SMP Budi Mulia', 140, bottomY + 5)
    
    if (item.tanda_tangan_url) {
      // Jika ada tanda tangan, cetak gambar statis (harus mendukung CORS)
      // Di jsPDF, kita bisa menggambar signature placeholder jika CORS memblokir URL eksternal
      doc.text('(Tanda Tangan Digital)', 140, bottomY + 25)
    } else {
      doc.text('_______________________', 140, bottomY + 30)
    }

    doc.save(`surat-resmi-kepsek-${item.nomor_surat || item.id}.pdf`)
  }

  // Filter announcements
  const getFilteredAnnouncements = () => {
    return announcements.filter(item => {
      const matchStatus = filterStatus === 'all' || item.status === filterStatus
      const matchSearch = item.judul.toLowerCase().includes(filterSearch.toLowerCase()) || (item.nomor_surat || '').toLowerCase().includes(filterSearch.toLowerCase())
      return matchStatus && matchSearch
    })
  }

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengumuman Resmi Kepala Sekolah</h2>
          <p className="text-slate-500 text-sm mt-0.5">Kelola keputusan, instruksi, dan edaran formal ber-Kop Surat resmi</p>
        </div>
        {hasWriteAccess && !isFormOpen && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Buat Surat Keputusan Baru
          </button>
        )}
      </div>

      {/* Main Content Split Form/List */}
      {isFormOpen ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-950">
              {editingId ? 'Edit Surat Pengumuman' : 'Penyusunan Surat Pengumuman Baru'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 font-semibold text-xs">
              Batal
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Form Input (Left & Center) */}
              <div className="md:col-span-2 space-y-4">
                {/* Judul & Nomor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Judul Pengumuman/Hal <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={judul}
                      onChange={e => setJudul(e.target.value)}
                      placeholder="Hal surat atau pengumuman..."
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Nomor Surat (Opsional)</label>
                    <input
                      type="text"
                      value={nomorSurat}
                      onChange={e => setNomorSurat(e.target.value)}
                      placeholder="Mis: 024/SMP-BM/VII/2026"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {/* Content Editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-600">Isi Pengumuman <span className="text-red-500">*</span></label>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => handleEditorAction('bold')} title="Tebal" className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded">B</button>
                      <button type="button" onClick={() => handleEditorAction('italic')} title="Miring" className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-xs italic rounded">I</button>
                      <button type="button" onClick={() => handleEditorAction('underline')} title="Garis Bawah" className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-xs underline rounded">U</button>
                      <button type="button" onClick={() => handleEditorAction('list')} title="List" className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-xs rounded">• List</button>
                    </div>
                  </div>
                  <textarea
                    ref={editorRef}
                    required
                    rows="8"
                    value={isi}
                    onChange={e => setIsi(e.target.value)}
                    placeholder="Tuliskan isi surat resmi di sini (Anda dapat menggunakan html tag jika diinginkan)..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-sans"
                  />
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Unggah Lampiran Berkas (PDF / Gambar)</label>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 border border-dashed border-slate-300 hover:bg-slate-50 cursor-pointer rounded-xl text-xs font-bold text-slate-600">
                      <input type="file" onChange={handleUploadAttachment} className="hidden" disabled={isUploadingFile} />
                      {isUploadingFile ? 'Mengunggah...' : 'Pilih File'}
                    </label>
                    <div className="flex-1 flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full text-xs font-bold">
                          <span className="truncate max-w-[120px]">{att.file_name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Targets & Digital Signature (Right Column) */}
              <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Target Penerima (Multi-select)</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {targetPesertaOptions.map(t => (
                      <label key={t.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTargets.includes(t.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedTargets(prev => [...prev, t.id])
                            else setSelectedTargets(prev => prev.filter(id => id !== t.id))
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {t.nama}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Specific Classes targeting */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Spesifik Kelas (Opsional)</label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-24 overflow-y-auto border border-slate-200 bg-white p-2.5 rounded-xl">
                    {kelasOptions.map(cls => (
                      <label key={cls} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(cls)}
                          onChange={e => {
                            if (e.target.checked) setSelectedClasses(prev => [...prev, cls])
                            else setSelectedClasses(prev => prev.filter(c => c !== cls))
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                        />
                        {cls}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Digital Signature */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Tanda Tangan Digital Kepala Sekolah</label>
                  <div className="space-y-3">
                    {tandaTanganUrl ? (
                      <div className="relative border border-slate-200 bg-white p-2 rounded-xl flex items-center justify-center h-20 overflow-hidden group">
                        <img src={tandaTanganUrl} alt="Tanda Tangan" className="h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setTandaTanganUrl('')}
                          className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs"
                        >
                          Ganti Gambar
                        </button>
                      </div>
                    ) : (
                      <label className="w-full h-20 border border-dashed border-slate-300 hover:bg-slate-50 cursor-pointer rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-slate-500">
                        <input type="file" onChange={handleUploadSignature} className="hidden" disabled={isUploadingSignature} />
                        {isUploadingSignature ? 'Mengunggah...' : 'Pilih Gambar Tanda Tangan'}
                      </label>
                    )}
                  </div>
                </div>

                {/* Status & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Terbit</label>
                    <input
                      type="date"
                      value={tanggalTerbit}
                      onChange={e => setTanggalTerbit(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Status Publikasi</label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Terbit">Terbit</option>
                      <option value="Arsip">Diarsipkan</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan & Publikasikan'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-4 animate-slide-up">
          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 shrink-0">Filter Status:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                {[
                  { id: 'all', label: 'Semua' },
                  { id: 'Draft', label: 'Draft' },
                  { id: 'Terbit', label: 'Terbit' },
                  { id: 'Arsip', label: 'Arsip' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterStatus(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterStatus === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Cari perihal atau nomor surat..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>

          {/* List Table of Announcements */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex justify-center"><div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : getFilteredAnnouncements().length === 0 ? (
              <div className="p-16 text-center text-slate-400 text-sm flex flex-col items-center">
                <svg className="w-16 h-16 text-slate-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-5.625-3.75L9 14.5m6-4.5l-5.625 3.75L9 10"/></svg>
                Belum ada surat keputusan resmi yang terbit pada kategori ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                      <th className="px-6 py-3.5">Nomor Surat</th>
                      <th className="px-6 py-3.5">Perihal / Hal</th>
                      <th className="px-6 py-3.5">Tanggal Terbit</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-center">Lampiran</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAnnouncements().map(item => (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800">
                          {item.nomor_surat || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 leading-tight">{item.judul}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">Target: {item.target_kelas?.join(', ') || 'Global'}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">
                          {new Date(item.tanggal_terbit).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            item.status === 'Terbit'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'Draft'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {item.pengumuman_resmi_dokumen?.length || 0} berkas
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 text-xs font-bold transition-all inline-flex items-center gap-1"
                            title="Preview Kop Surat"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </button>
                          
                          <button
                            onClick={() => handleExportPDF(item)}
                            className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-emerald-600 text-xs font-bold transition-all inline-flex items-center gap-1"
                            title="Unduh PDF"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>

                          {hasWriteAccess && (
                            <>
                              <button
                                onClick={() => handleEdit(item)}
                                className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-indigo-600 text-xs font-bold transition-all inline-flex items-center gap-1"
                                title="Edit"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                              </button>
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1.5 border border-red-100 bg-white hover:bg-red-50 rounded-lg text-red-600 text-xs font-bold transition-all inline-flex items-center gap-1"
                                title="Hapus"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </button>
                            </>
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

      {/* Modal Preview Kop Surat */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-zoom-in max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 shrink-0">
              <span className="text-xs font-black text-slate-800">Preview Kop & Struktur Surat Keputusan</span>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                Tutup
              </button>
            </div>

            {/* Formal Layout Body */}
            <div className="p-8 overflow-y-auto flex-1 font-serif text-slate-900 bg-slate-50/20">
              <div className="border border-slate-200 bg-white p-8 shadow-inner max-w-xl mx-auto rounded-xl">
                {/* Kop Surat */}
                <div className="flex items-center gap-4 border-b-4 border-double border-slate-800 pb-3 text-center sm:text-left">
                  <img src={schoolSettings.logo_url} alt="Logo" className="w-16 h-16 object-contain hidden sm:block shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-extrabold text-base tracking-wide uppercase">{schoolSettings.nama_sekolah}</h4>
                    <p className="text-[10px] font-sans text-slate-500 leading-normal">{schoolSettings.alamat}</p>
                    <p className="text-[9px] font-sans text-slate-400 leading-normal">Telepon: {schoolSettings.telepon}</p>
                  </div>
                </div>

                {/* Perihal & Nomor */}
                <div className="mt-6 text-center">
                  <h5 className="font-bold text-sm underline tracking-wide">SURAT PENGUMUMAN RESMI</h5>
                  <p className="text-xs text-slate-500 mt-0.5">Nomor: {previewItem.nomor_surat || '—'}</p>
                </div>

                <div className="mt-5 text-xs text-right">
                  <span>Jakarta, {new Date(previewItem.tanggal_terbit).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>

                {/* Hal */}
                <div className="mt-4 text-xs font-bold flex gap-1">
                  <span>Hal:</span>
                  <span>{previewItem.judul}</span>
                </div>

                {/* Content */}
                <div 
                  className="mt-6 text-xs leading-relaxed text-justify space-y-3 prose max-w-none font-serif"
                  dangerouslySetInnerHTML={{ __html: previewItem.isi }}
                />

                {/* Signature Area */}
                <div className="mt-10 flex justify-end text-xs">
                  <div className="text-center w-48 space-y-1">
                    <p>Hormat Kami,</p>
                    <p className="font-bold">Kepala Sekolah SMP Budi Mulia</p>
                    <div className="h-16 flex items-center justify-center overflow-hidden py-1">
                      {previewItem.tanda_tangan_url ? (
                        <img src={previewItem.tanda_tangan_url} alt="Tanda Tangan" className="h-full object-contain" />
                      ) : (
                        <div className="h-10 w-full border border-dashed border-slate-200 rounded flex items-center justify-center text-[10px] text-slate-300">Belum diunggah</div>
                      )}
                    </div>
                    <p className="font-extrabold underline mt-2">ANSELMA J.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/40 shrink-0">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Tutup
              </button>
              <button
                onClick={() => handleExportPDF(previewItem)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Unduh PDF
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
