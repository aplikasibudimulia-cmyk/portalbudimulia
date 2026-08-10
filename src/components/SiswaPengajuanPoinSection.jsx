import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

// ─── Kompresi gambar via Canvas (tanpa library eksternal) ───
async function compressImage(file, maxBytes = 1024 * 1024) {
  if (!file.type.startsWith('image/') || file.size <= maxBytes) return file
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const maxDim = 1920
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
          else { width = Math.round(width * maxDim / height); height = maxDim }
        }
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const tryCompress = q => {
          canvas.toBlob(blob => {
            if (!blob) { resolve(file); return }
            if (blob.size <= maxBytes || q <= 0.3) resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }))
            else tryCompress(q - 0.1)
          }, 'image/jpeg', q)
        }
        tryCompress(0.85)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const MAX_FILE_SIZE = 1024 * 1024
const MAX_FILES = 5
const ALLOWED_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']

export default function SiswaPengajuanPoinSection({ studentData, activeTa }) {
  const nisn = studentData?.nisn

  // ─── State ───
  const [banInfo, setBanInfo]           = useState(null)
  const [banLoading, setBanLoading]     = useState(true)
  const [katalog, setKatalog]           = useState([])
  const [katalogLoading, setKatalogLoading] = useState(true)
  const [byKategori, setByKategori]     = useState({})
  const [openKategori, setOpenKategori] = useState({})
  const [search, setSearch]             = useState('')
  const [semester, setSemester]         = useState(1)

  // Riwayat
  const [activeTab, setActiveTab]       = useState('katalog') // 'katalog' | 'riwayat'
  const [riwayat, setRiwayat]           = useState([])
  const [riwayatLoading, setRiwayatLoading] = useState(false)

  // Modal pengajuan
  const [modal, setModal]               = useState(null) // katalog item yang dipilih
  const [tanggalKegiatan, setTanggalKegiatan] = useState(new Date().toISOString().slice(0, 10))
  const [alasan, setAlasan]             = useState('')
  const [linkPendukung, setLinkPendukung] = useState('')
  const [files, setFiles]               = useState([])
  const [fileError, setFileError]       = useState('')
  const [uploading, setUploading]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [successMsg, setSuccessMsg]     = useState('')
  const [errorMsg, setErrorMsg]         = useState('')
  const [previewModal, setPreviewModal] = useState(null) // { url, type, name }

  // Modal Resubmit Revisi
  const [resubmitItem, setResubmitItem]           = useState(null)
  const [resubmitTanggalKegiatan, setResubmitTanggalKegiatan] = useState(new Date().toISOString().slice(0, 10))
  const [resubmitAlasan, setResubmitAlasan]       = useState('')
  const [resubmitLink, setResubmitLink]           = useState('')
  const [resubmitExistingFiles, setResubmitExistingFiles] = useState([])
  const [resubmitNewFiles, setResubmitNewFiles]   = useState([])
  const [resubmitError, setResubmitError]         = useState('')
  const [resubmitSaving, setResubmitSaving]       = useState(false)

  const fileInputRef = useRef()

  useEffect(() => {
    if (nisn) { checkBan(); fetchKatalog(); fetchSemester() }
  }, [nisn, activeTa])

  useEffect(() => {
    if (activeTab === 'riwayat' && nisn) fetchRiwayat()
  }, [activeTab, nisn])

  // ─── Fetch helpers ───
  const fetchSemester = async () => {
    if (!activeTa?.id) return
    const { data } = await supabase.from('semester').select('*').eq('tahun_ajaran_id', activeTa.id).order('nomor')
    const today = new Date().toISOString().slice(0, 10)
    const active = (data || []).find(s => s.tanggal_mulai <= today && s.tanggal_selesai >= today)
    setSemester(active?.nomor || 1)
  }

  const checkBan = async () => {
    setBanLoading(true)
    const { data } = await supabase.from('pengajuan_poin_ban').select('*').eq('nisn', nisn).eq('is_active', true).maybeSingle()
    if (data && data.banned_until && new Date(data.banned_until) < new Date()) {
      await supabase.from('pengajuan_poin_ban').update({ is_active: false }).eq('nisn', nisn)
      setBanInfo(null)
    } else { setBanInfo(data || null) }
    setBanLoading(false)
  }

  const fetchKatalog = async () => {
    setKatalogLoading(true)
    const { data } = await supabase.from('point_catalog').select('*').gt('poin', 0).order('kategori').order('kode')
    const list = data || []
    setKatalog(list)
    const grouped = {}
    list.forEach(k => { if (!grouped[k.kategori]) grouped[k.kategori] = []; grouped[k.kategori].push(k) })
    setByKategori(grouped)
    // Buka semua kategori by default
    const allOpen = {}
    Object.keys(grouped).forEach(k => allOpen[k] = true)
    setOpenKategori(allOpen)
    setKatalogLoading(false)
  }

  const fetchRiwayat = async () => {
    if (!activeTa?.id) return
    setRiwayatLoading(true)
    const { data } = await supabase.from('pengajuan_poin_positif').select('*')
      .eq('nisn', nisn).eq('tahun_ajaran_id', activeTa.id).order('created_at', { ascending: false })
    setRiwayat(data || [])
    setRiwayatLoading(false)
  }

  // ─── Filter katalog berdasarkan search ───
  const filtered = search.trim()
    ? katalog.filter(k =>
        k.jenis?.toLowerCase().includes(search.toLowerCase()) ||
        k.kode?.toLowerCase().includes(search.toLowerCase()) ||
        k.kategori?.toLowerCase().includes(search.toLowerCase()) ||
        k.keterangan?.toLowerCase().includes(search.toLowerCase())
      )
    : null

  // ─── File handling ───
  const handleFileChange = async e => {
    const selected = Array.from(e.target.files || [])
    setFileError('')
    if (files.length + selected.length > MAX_FILES) { setFileError(`Maks ${MAX_FILES} file.`); return }
    const newFiles = []
    for (const f of selected) {
      if (!ALLOWED_TYPES.includes(f.type)) { setFileError(`Format tidak didukung: ${f.name}`); continue }
      let processed = f.type.startsWith('image/') ? await compressImage(f, MAX_FILE_SIZE) : f
      if (processed.size > MAX_FILE_SIZE) { setFileError(`File "${f.name}" terlalu besar (maks 1 MB).`); continue }
      let preview = null
      if (processed.type.startsWith('image/')) {
        preview = await new Promise(r => { const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(processed) })
      }
      newFiles.push({ file: processed, preview, name: f.name, size: processed.size, type: processed.type })
    }
    setFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }

  const removeFile = idx => setFiles(prev => prev.filter((_, i) => i !== idx))

  const formatSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(1) + ' MB'

  // ─── Resubmit Handling ───
  const openResubmitModal = (item) => {
    setResubmitItem(item)
    setResubmitTanggalKegiatan(item.tanggal_kegiatan || item.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10))
    setResubmitAlasan(item.alasan || '')
    const linkObj = (item.bukti_files || []).find(b => b.type === 'link')
    setResubmitLink(linkObj?.url || '')
    const nonLinkFiles = (item.bukti_files || []).filter(b => b.type !== 'link')
    setResubmitExistingFiles(nonLinkFiles)
    setResubmitNewFiles([])
    setResubmitError('')
  }

  const removeResubmitExistingFile = (idx) => {
    setResubmitExistingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const removeResubmitNewFile = (idx) => {
    setResubmitNewFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleResubmitFileChange = async (e) => {
    const selected = Array.from(e.target.files || [])
    setResubmitError('')
    if (resubmitExistingFiles.length + resubmitNewFiles.length + selected.length > MAX_FILES) {
      setResubmitError(`Maksimal ${MAX_FILES} file.`)
      return
    }
    const newFiles = []
    for (const f of selected) {
      if (!ALLOWED_TYPES.includes(f.type)) { setResubmitError(`Format tidak didukung: ${f.name}`); continue }
      let processed = f.type.startsWith('image/') ? await compressImage(f, MAX_FILE_SIZE) : f
      if (processed.size > MAX_FILE_SIZE) { setResubmitError(`File "${f.name}" terlalu besar (maks 1 MB).`); continue }
      let preview = null
      if (processed.type.startsWith('image/')) {
        preview = await new Promise(r => { const fr = new FileReader(); fr.onload = evt => r(evt.target.result); fr.readAsDataURL(processed) })
      }
      newFiles.push({ file: processed, preview, name: f.name, size: processed.size, type: processed.type })
    }
    setResubmitNewFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }

  const handleResubmitSubmit = async (e) => {
    e.preventDefault()
    if (!resubmitItem) return
    if (!resubmitTanggalKegiatan) { setResubmitError('Tanggal pelaksanaan wajib diisi.'); return }
    if (resubmitAlasan.trim().length < 20) { setResubmitError('Alasan minimal 20 karakter.'); return }
    setResubmitError(''); setResubmitSaving(true)
    try {
      const updatedBuktiFiles = [...resubmitExistingFiles]

      for (const f of resubmitNewFiles) {
        const ext = f.name.split('.').pop()
        const path = `pengajuan-poin/${nisn}/${resubmitItem.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('bukti-pengajuan').upload(path, f.file, { contentType: f.type })
        if (uploadErr) throw new Error('Gagal upload file baru: ' + uploadErr.message)
        updatedBuktiFiles.push({ path, name: f.name, type: f.type, size: f.size })
      }

      if (resubmitLink.trim()) {
        let formattedUrl = resubmitLink.trim()
        if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = 'https://' + formattedUrl
        updatedBuktiFiles.push({ type: 'link', url: formattedUrl, name: 'Link Pendukung (YouTube/Drive/dll)' })
      }

      const updateData = {
        alasan: resubmitAlasan.trim(),
        bukti_files: updatedBuktiFiles,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }
      if (resubmitTanggalKegiatan) updateData.tanggal_kegiatan = resubmitTanggalKegiatan

      let { error } = await supabase.from('pengajuan_poin_positif').update(updateData).eq('id', resubmitItem.id)
      if (error && error.message?.includes('tanggal_kegiatan')) {
        delete updateData.tanggal_kegiatan
        const res = await supabase.from('pengajuan_poin_positif').update(updateData).eq('id', resubmitItem.id)
        error = res.error
      }

      if (error) throw error

      setResubmitItem(null)
      setSuccessMsg('✅ Revisi pengajuan berhasil dikirim ulang! Menunggu review guru BK.')
      setTimeout(() => setSuccessMsg(''), 7000)
      fetchRiwayat()
    } catch (err) {
      setResubmitError(err.message || 'Terjadi kesalahan.')
    } finally {
      setResubmitSaving(false)
    }
  }

  // ─── Submit pengajuan ───
  const openModal = async (katalogItem) => {
    if (banInfo) return
    // Cek apakah sudah ada pengajuan pending untuk item ini
    if (activeTa?.id) {
      const { data: existing } = await supabase.from('pengajuan_poin_positif')
        .select('id').eq('nisn', nisn).eq('catalog_id', katalogItem.id)
        .eq('tahun_ajaran_id', activeTa.id).eq('status', 'pending').maybeSingle()
      if (existing) {
        alert('Kamu sudah punya pengajuan yang sedang diproses untuk jenis poin ini.')
        return
      }
    }
    setTanggalKegiatan(new Date().toISOString().slice(0, 10))
    setAlasan(''); setLinkPendukung(''); setFiles([]); setFileError(''); setErrorMsg(''); setSuccessMsg('')
    setModal(katalogItem)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!modal || !activeTa?.id) return
    if (!tanggalKegiatan) { setErrorMsg('Tanggal pelaksanaan wajib diisi.'); return }
    if (alasan.trim().length < 20) { setErrorMsg('Alasan minimal 20 karakter.'); return }
    setErrorMsg(''); setSaving(true)
    try {
      setUploading(true)
      const pengajuanId = crypto.randomUUID()
      const buktiFiles = []
      for (const f of files) {
        const ext = f.name.split('.').pop()
        const path = `pengajuan-poin/${nisn}/${pengajuanId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('bukti-pengajuan').upload(path, f.file, { contentType: f.type })
        if (uploadErr) throw new Error('Gagal upload: ' + uploadErr.message)
        buktiFiles.push({ path, name: f.name, type: f.type, size: f.size })
      }
      // Jika ada link pendukung, tambahkan ke buktiFiles
      if (linkPendukung.trim()) {
        let formattedUrl = linkPendukung.trim()
        if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = 'https://' + formattedUrl
        buktiFiles.push({ type: 'link', url: formattedUrl, name: 'Link Pendukung (YouTube/Drive/dll)' })
      }
      setUploading(false)

      const insertData = {
        id: pengajuanId, nisn, nama_siswa: studentData?.nama_lengkap,
        kelas: studentData?.kelas, tahun_ajaran_id: activeTa.id, semester,
        catalog_id: modal.id, kode_katalog: modal.kode, jenis: modal.jenis,
        kategori: modal.kategori, poin_diajukan: modal.poin,
        tanggal_kegiatan: tanggalKegiatan,
        alasan: alasan.trim(), bukti_files: buktiFiles, status: 'pending',
      }

      let { error } = await supabase.from('pengajuan_poin_positif').insert(insertData)
      if (error && error.message?.includes('tanggal_kegiatan')) {
        delete insertData.tanggal_kegiatan
        const res = await supabase.from('pengajuan_poin_positif').insert(insertData)
        error = res.error
      }

      if (error) throw error
      setModal(null)
      setSuccessMsg(`✅ Pengajuan "${modal.jenis}" berhasil dikirim! Menunggu review guru BK.`)
      setTimeout(() => setSuccessMsg(''), 7000)
      setActiveTab('riwayat'); fetchRiwayat()
    } catch (err) {
      setErrorMsg(err.message || 'Terjadi kesalahan.')
      setUploading(false)
    } finally { setSaving(false) }
  }

  const openFile = async bukti => {
    if (bukti.type === 'link') {
      setPreviewModal({ url: bukti.url, type: 'link', name: bukti.name || 'Link Pendukung' })
      return
    }
    const { data } = await supabase.storage.from('bukti-pengajuan').createSignedUrl(bukti.path, 300)
    if (data?.signedUrl) {
      setPreviewModal({ url: data.signedUrl, type: bukti.type, name: bukti.name || 'Bukti File' })
    }
  }

  const statusBadge = s => {
    if (s === 'pending')    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"/>Menunggu Review</span>
    if (s === 'revisi')     return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">✏️ Perlu Revisi</span>
    if (s === 'disetujui')  return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✅ Disetujui</span>
    if (s === 'ditolak')    return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">❌ Ditolak</span>
    return null
  }

  if (banLoading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"/></div>

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pengajuan Poin Positif</h2>
          <p className="text-slate-500 text-sm mt-0.5">{activeTa?.nama} — Ajukan poin atas prestasimu</p>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('katalog')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'katalog' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            📋 Katalog Poin
          </button>
          <button onClick={() => setActiveTab('riwayat')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'riwayat' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            🕓 Riwayat Saya
          </button>
        </div>
      </div>

      {/* Ban Alert */}
      {banInfo && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          </div>
          <div>
            <p className="font-bold text-red-800 text-sm">Pengajuan Diblokir</p>
            <p className="text-red-600 text-xs mt-0.5">{banInfo.alasan || 'Hubungi guru BK untuk info lebih lanjut.'}</p>
            {banInfo.banned_until && <p className="text-red-500 text-xs mt-1 font-medium">Berlaku hingga: {new Date(banInfo.banned_until).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>}
            {!banInfo.banned_until && <p className="text-red-500 text-xs mt-1 font-medium">Status: Blokir permanen</p>}
          </div>
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-700 text-sm font-semibold">{successMsg}</div>
      )}

      {/* ─── TAB: KATALOG ─── */}
      {activeTab === 'katalog' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Cari jenis poin positif..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {katalogLoading ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"/></div>
          ) : search.trim() ? (
            /* ─── Mode Search: flat list ─── */
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-medium">
                {filtered.length} hasil untuk "{search}"
              </div>
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">Tidak ada hasil yang cocok</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filtered.map(k => <KatalogItem key={k.id} item={k} onAjukan={openModal} disabled={!!banInfo} />)}
                </div>
              )}
            </div>
          ) : (
            /* ─── Mode Normal: accordion per kategori ─── */
            <div className="space-y-2">
              {Object.keys(byKategori).map(kat => (
                <div key={kat} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Accordion header */}
                  <button type="button" onClick={() => setOpenKategori(prev => ({ ...prev, [kat]: !prev[kat] }))}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{kat}</p>
                        <p className="text-xs text-slate-400">{byKategori[kat].length} jenis poin</p>
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openKategori[kat] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
                  </button>

                  {/* Accordion body */}
                  {openKategori[kat] && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50 animate-fade-in">
                      {byKategori[kat].map(k => <KatalogItem key={k.id} item={k} onAjukan={openModal} disabled={!!banInfo} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: RIWAYAT ─── */}
      {activeTab === 'riwayat' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm">Riwayat Pengajuan Saya</h3>
            <button onClick={fetchRiwayat} className="text-xs text-emerald-600 font-semibold hover:text-emerald-800">Refresh</button>
          </div>
          {riwayatLoading ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"/></div>
          ) : riwayat.length === 0 ? (
            <div className="py-14 text-center">
              <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <p className="text-slate-400 text-sm font-medium">Belum ada pengajuan</p>
              <p className="text-slate-300 text-xs mt-1">Klik tombol "Ajukan Poin" di tab Katalog</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {riwayat.map(r => (
                <div key={r.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{r.jenis}</span>
                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">+{r.poin_diajukan}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{r.kategori} · {new Date(r.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</p>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                  <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mb-2 line-clamp-2">{r.alasan}</p>
                  
                  {/* Catatan Reviewer jika Ditolak */}
                  {r.catatan_reviewer && r.status === 'ditolak' && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
                      <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <p className="text-[10px] font-bold text-red-500 mb-0.5">Catatan Penolakan dari {r.reviewed_by || 'Reviewer'}:</p>
                        <p className="text-xs text-red-700">{r.catatan_reviewer}</p>
                      </div>
                    </div>
                  )}

                  {/* Card Alert jika Perlu Revisi */}
                  {r.status === 'revisi' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-3 text-xs space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <span>✏️ Instruksi Revisi dari Guru ({r.reviewed_by || 'Reviewer'}):</span>
                      </div>
                      <p className="text-amber-900 bg-white p-3 rounded-lg border border-amber-200/80 font-medium leading-relaxed">
                        {r.catatan_reviewer || 'Silakan perbaiki data pengajuan sesuai instruksi guru.'}
                      </p>

                      {/* Lampiran Guru jika ada */}
                      {r.reviewer_attachment && (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <span className="font-semibold text-slate-700 text-[11px]">Lampiran dari Guru:</span>
                          <button
                            type="button"
                            onClick={() => openFile(r.reviewer_attachment)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-amber-900 font-bold text-xxs hover:bg-amber-100 transition-colors shadow-2xs"
                          >
                            <span>📎</span> {r.reviewer_attachment.name || 'File Lampiran Guru'}
                          </button>
                        </div>
                      )}

                      {/* Tombol Edit & Kirim Ulang */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => openResubmitModal(r)}
                          className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Edit &amp; Kirim Ulang Revisi
                        </button>
                      </div>
                    </div>
                  )}

                  {r.bukti_files?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {r.bukti_files.map((bf, i) => (
                        <button key={i} type="button" onClick={() => openFile(bf)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors font-medium">
                          {bf.type === 'link' ? '🔗' : bf.type?.startsWith('image/') ? '🖼️' : '📄'} {bf.name || `Bukti ${i+1}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL PENGAJUAN ─── */}
      {modal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/65 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-slide-up my-auto flex flex-col max-h-[85vh] border border-slate-100">
            {/* Modal header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">{modal.kategori}</span>
                    <span className="font-mono text-[10px] text-emerald-100 font-bold bg-black/20 px-1.5 py-0.5 rounded">{modal.kode}</span>
                  </div>
                  <p className="text-white font-bold text-sm sm:text-base leading-snug">{modal.jenis}</p>
                </div>
                <div className="shrink-0 text-center bg-white/20 rounded-xl px-3 py-1.5 backdrop-blur-sm">
                  <p className="text-white text-xl sm:text-2xl font-black">+{modal.poin}</p>
                  <p className="text-white/80 text-[9px] font-bold tracking-wider">POIN</p>
                </div>
              </div>
              {modal.keterangan && <p className="text-emerald-100 text-xs mt-2 line-clamp-2">{modal.keterangan}</p>}
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">

              {/* Tanggal Pelaksanaan Kegiatan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tanggal Pelaksanaan / Kegiatan <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={tanggalKegiatan}
                  onChange={e => setTanggalKegiatan(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Pilih tanggal kapan kamu melaksanakan kegiatan ini.</p>
              </div>

              {/* Alasan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Jelaskan mengapa kamu layak mendapat poin ini <span className="text-red-500">*</span>
                </label>
                <textarea value={alasan} onChange={e => setAlasan(e.target.value)} required rows={4}
                  placeholder="Contoh: Saya meraih juara 1 lomba olimpiade Matematika tingkat Kota pada tanggal ... yang diselenggarakan oleh ..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"/>
                <p className={`text-[10px] mt-1 ${alasan.length < 20 ? 'text-amber-500' : 'text-emerald-600 font-medium'}`}>
                  {alasan.length < 20 ? `${alasan.length}/20 karakter minimum` : `✓ ${alasan.length} karakter`}
                </p>
              </div>

              {/* Link Pendukung */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Link / URL Pendukung <span className="text-slate-400 font-normal">(opsional)</span>
                </label>
                <input type="url" value={linkPendukung} onChange={e => setLinkPendukung(e.target.value)}
                  placeholder="https://youtube.com/watch?... atau https://drive.google.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"/>
              </div>

              {/* Upload bukti */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Lampirkan foto / dokumen <span className="text-slate-400 font-normal">(opsional, maks {MAX_FILES} file × 1 MB)</span>
                </label>

                {files.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {files.map((f, i) => (
                      <div key={i} className="relative group">
                        {f.preview
                          ? <img src={f.preview} alt={f.name} className="w-full aspect-square object-cover rounded-xl border border-slate-200 cursor-pointer" onClick={() => setLightboxUrl(f.preview)}/>
                          : <div className="w-full aspect-square rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 p-1">
                              <span className="text-lg">📄</span>
                              <span className="text-[9px] text-slate-400 text-center truncate w-full px-1">{f.name}</span>
                            </div>
                        }
                        <button type="button" onClick={() => removeFile(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        <p className="text-[9px] text-slate-400 mt-0.5 text-center">{formatSize(f.size)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {files.length < MAX_FILES && (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-xl py-5 flex flex-col items-center gap-1.5 text-slate-400 hover:text-emerald-600 transition-all">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span className="text-xs font-medium">Tambah foto / dokumen ({files.length}/{MAX_FILES})</span>
                    <span className="text-[10px]">JPG, PNG, PDF, DOC — gambar dikompres otomatis</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileChange} className="hidden"/>

                {fileError && <p className="text-xs text-red-600 mt-1.5 font-medium">{fileError}</p>}
              </div>

              {errorMsg && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{errorMsg}</div>}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(null)} disabled={saving}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                  Batal
                </button>
                <button type="submit" disabled={saving || alasan.trim().length < 20}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  {saving
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>{uploading ? 'Mengupload...' : 'Mengirim...'}</>
                    : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>Kirim Pengajuan</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ─── MODAL REVISI PENGAJUAN (SISWA) ─── */}
      {resubmitItem && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/65 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={e => e.target === e.currentTarget && setResubmitItem(null)}>
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-slide-up my-auto flex flex-col max-h-[85vh] border border-slate-100">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-4 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">Revisi Pengajuan</span>
                  <p className="text-white font-bold text-sm sm:text-base leading-snug mt-1">{resubmitItem.jenis}</p>
                </div>
                <div className="shrink-0 text-center bg-white/20 rounded-xl px-3 py-1.5 backdrop-blur-sm">
                  <p className="text-white text-xl sm:text-2xl font-black">+{resubmitItem.poin_diajukan}</p>
                  <p className="text-white/80 text-[9px] font-bold tracking-wider">POIN</p>
                </div>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleResubmitSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* Catatan Reviewer & Attachment Reference */}
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl space-y-2">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>📌 Catatan Guru ({resubmitItem.reviewed_by || 'Reviewer'}):</span>
                </p>
                <p className="text-amber-800 font-medium bg-amber-100/70 p-2.5 rounded-lg border border-amber-200/60">
                  {resubmitItem.catatan_reviewer || 'Silakan perbaiki data pengajuan sesuai petunjuk.'}
                </p>
                {resubmitItem.reviewer_attachment && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="font-semibold text-slate-700">Lampiran dari Guru:</span>
                    <button
                      type="button"
                      onClick={() => openFile(resubmitItem.reviewer_attachment)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-amber-900 font-bold text-xxs hover:bg-amber-100 transition-colors shadow-2xs"
                    >
                      <span>📎</span> {resubmitItem.reviewer_attachment.name || 'File Lampiran Guru'}
                    </button>
                  </div>
                )}
              </div>

              {/* Tanggal Pelaksanaan Kegiatan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Tanggal Pelaksanaan / Kegiatan <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={resubmitTanggalKegiatan}
                  onChange={e => setResubmitTanggalKegiatan(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Pilih tanggal kapan kamu melaksanakan kegiatan ini.</p>
              </div>

              {/* Alasan */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Alasan / Keterangan Pengajuan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={resubmitAlasan}
                  onChange={e => setResubmitAlasan(e.target.value)}
                  required
                  rows={4}
                  placeholder="Jelaskan atau perbaiki keterangan pengajuan Anda..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
                <p className={`text-[10px] mt-1 ${resubmitAlasan.length < 20 ? 'text-amber-500' : 'text-emerald-600 font-medium'}`}>
                  {resubmitAlasan.length < 20 ? `${resubmitAlasan.length}/20 karakter minimum` : `✓ ${resubmitAlasan.length} karakter`}
                </p>
              </div>

              {/* Link Pendukung */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Link / URL Pendukung <span className="text-slate-400 font-normal">(opsional)</span>
                </label>
                <input
                  type="url"
                  value={resubmitLink}
                  onChange={e => setResubmitLink(e.target.value)}
                  placeholder="https://youtube.com/... atau https://drive.google.com/..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Bukti Existing & Bukti Baru */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  File Bukti Pendukung <span className="text-slate-400 font-normal">(Maksimal {MAX_FILES} file)</span>
                </label>

                {/* Existing files */}
                {resubmitExistingFiles.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    <span className="text-[10px] text-slate-500 font-semibold block">File yang sudah diupload sebelumnya:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {resubmitExistingFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                          <span>{f.type === 'link' ? '🔗' : f.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span className="truncate max-w-[140px]">{f.name || `Bukti ${i+1}`}</span>
                          <button type="button" onClick={() => removeResubmitExistingFile(i)} className="text-slate-400 hover:text-red-600 font-bold ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New files */}
                {resubmitNewFiles.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    <span className="text-[10px] text-emerald-600 font-semibold block">File baru yang akan diupload:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {resubmitNewFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <span>{f.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                          <span className="truncate max-w-[140px]">{f.name}</span>
                          <button type="button" onClick={() => removeResubmitNewFile(i)} className="text-emerald-400 hover:text-red-600 font-bold ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resubmitExistingFiles.length + resubmitNewFiles.length < MAX_FILES && (
                  <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer border border-slate-300 transition-colors inline-flex items-center gap-1.5">
                    <span>📷 Tambah File Bukti Baru</span>
                    <input type="file" multiple onChange={handleResubmitFileChange} className="hidden" />
                  </label>
                )}
              </div>

              {resubmitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold">
                  {resubmitError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResubmitItem(null)}
                  disabled={resubmitSaving}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={resubmitSaving}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {resubmitSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Kirim Ulang Revisi'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Pop-up Preview Viewer Universal */}
      {previewModal && createPortal(
        <div className="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in" onClick={() => setPreviewModal(null)}>
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{previewModal.type === 'link' ? '🔗' : previewModal.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                <p className="font-bold text-xs sm:text-sm truncate">{previewModal.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={previewModal.url} target="_blank" rel="noreferrer"
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
                  <span>Buka Tab Baru</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
                <button onClick={() => setPreviewModal(null)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold text-sm">✕</button>
              </div>
            </div>
            <div className="p-2 sm:p-4 flex-1 overflow-auto bg-slate-100 flex items-center justify-center min-h-[300px]">
              {previewModal.type === 'link' ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm max-w-md text-center space-y-4">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto text-2xl">🔗</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Tautan Pendukung</p>
                    <p className="text-xs text-indigo-600 mt-1 break-all font-mono bg-slate-50 p-2 rounded-lg border border-slate-200">{previewModal.url}</p>
                  </div>
                  <a href={previewModal.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all">
                    Kunjungi Tautan
                  </a>
                </div>
              ) : previewModal.type?.startsWith('image/') ? (
                <img src={previewModal.url} alt={previewModal.name} className="max-w-full max-h-[75vh] rounded-lg object-contain shadow-md"/>
              ) : (
                <iframe src={previewModal.url} title={previewModal.name} className="w-full h-[75vh] rounded-xl border border-slate-200 bg-white"/>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Sub-komponen: satu baris katalog ───
function KatalogItem({ item, onAjukan, disabled }) {
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{item.kode}</span>
          <span className="font-semibold text-slate-800 text-xs sm:text-sm leading-snug">{item.jenis}</span>
        </div>
        {item.keterangan && <p className="text-[11px] sm:text-xs text-slate-500 truncate">{item.keterangan}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">+{item.poin}</span>
        <button type="button" onClick={() => onAjukan(item)} disabled={disabled}
          className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-sm">
          Ajukan
        </button>
      </div>
    </div>
  )
}
