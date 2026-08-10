import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

export default function AdminPengajuanPoinSection({ session, activeTa, readOnly = false }) {
  const [activeTab, setActiveTab] = useState('pengajuan') // 'pengajuan' | 'ban'
  const [pengajuanList, setPengajuanList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all') // Default: 'all' (Semua Status)
  const [filterKelas, setFilterKelas] = useState('all')
  const [allKelas, setAllKelas] = useState([])
  const [search, setSearch] = useState('')
  const [allPengajuan, setAllPengajuan] = useState([])

  // Settings
  const [spamThreshold, setSpamThreshold] = useState(3)
  const [spamBanDays, setSpamBanDays] = useState(30)
  const [savingSettings, setSavingSettings] = useState(false)

  // Ban management
  const [banList, setBanList] = useState([])
  const [banLoading, setBanLoading] = useState(false)

  // Modal state
  const [reviewModal, setReviewModal] = useState(null) // { pengajuan, mode: 'setujui'|'revisi'|'tolak'|'spam' }
  const [catatanReviewer, setCatatanReviewer] = useState('')
  const [reviewerAttachmentFile, setReviewerAttachmentFile] = useState(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [previewModal, setPreviewModal] = useState(null) // { url, type, name }

  // Selection / Bulk approval state
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkProcessing, setBulkProcessing] = useState(false)

  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const reviewerName = session?.nama_guru || session?.email || 'Admin'

  useEffect(() => {
    fetchSettings()
    fetchKelas()
  }, [])

  useEffect(() => {
    if (activeTa?.id) fetchPengajuan()
  }, [activeTa, filterKelas, search])

  useEffect(() => {
    setSelectedIds([])
    if (allPengajuan.length > 0) {
      if (filterStatus === 'all') {
        setPengajuanList(allPengajuan)
      } else {
        setPengajuanList(allPengajuan.filter(p => p.status === filterStatus))
      }
    } else {
      setPengajuanList([])
    }
  }, [filterStatus, allPengajuan])

  useEffect(() => {
    if (activeTab === 'ban') fetchBanList()
  }, [activeTab])

  const fetchSettings = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
      .in('setting_key', ['spam_threshold_pengajuan_poin', 'spam_ban_days_pengajuan_poin'])
    ;(data || []).forEach(d => {
      if (d.setting_key === 'spam_threshold_pengajuan_poin') setSpamThreshold(parseInt(d.setting_value) || 3)
      if (d.setting_key === 'spam_ban_days_pengajuan_poin') setSpamBanDays(parseInt(d.setting_value) || 30)
    })
  }

  const fetchKelas = async () => {
    const { data } = await supabase.from('siswa_lengkap').select('kelas').eq('is_aktif', true)
    const unique = [...new Set((data || []).map(d => d.kelas).filter(Boolean))].sort()
    setAllKelas(unique)
  }

  const fetchPengajuan = async () => {
    if (!activeTa?.id) return
    setLoading(true)
    let query = supabase.from('pengajuan_poin_positif').select('*')
      .eq('tahun_ajaran_id', activeTa.id)
      .order('created_at', { ascending: false })

    if (filterKelas !== 'all') query = query.eq('kelas', filterKelas)
    if (search.trim()) query = query.or(`nama_siswa.ilike.%${search}%,nisn.ilike.%${search}%`)

    const { data } = await query
    const list = data || []
    setAllPengajuan(list)
    if (filterStatus === 'all') {
      setPengajuanList(list)
    } else {
      setPengajuanList(list.filter(p => p.status === filterStatus))
    }
    setLoading(false)
  }

  const fetchBanList = async () => {
    setBanLoading(true)
    const { data } = await supabase.from('pengajuan_poin_ban').select('*').order('created_at', { ascending: false })
    setBanList(data || [])
    setBanLoading(false)
  }

  const openFile = async (bukti) => {
    if (bukti.type === 'link') {
      setPreviewModal({ url: bukti.url, type: 'link', name: bukti.name || 'Link Pendukung' })
      return
    }
    const { data } = await supabase.storage.from('bukti-pengajuan').createSignedUrl(bukti.path, 300)
    if (data?.signedUrl) {
      setPreviewModal({ url: data.signedUrl, type: bukti.type, name: bukti.name || 'Bukti File' })
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    await supabase.from('pengaturan_sekolah').upsert([
      { setting_key: 'spam_threshold_pengajuan_poin', setting_value: spamThreshold.toString() },
      { setting_key: 'spam_ban_days_pengajuan_poin', setting_value: spamBanDays.toString() },
    ], { onConflict: 'setting_key' })
    setSavingSettings(false)
    alert('Setting berhasil disimpan.')
  }

  const openReviewModal = (pengajuan, mode) => {
    setCatatanReviewer(pengajuan.catatan_reviewer || '')
    setReviewerAttachmentFile(null)
    setReviewModal({ pengajuan, mode })
  }

  const handleReview = async () => {
    if (!reviewModal) return
    const { pengajuan, mode } = reviewModal
    const isSpam = mode === 'spam'
    const isDitolak = mode === 'tolak' || isSpam
    const isRevisi = mode === 'revisi'

    if ((isDitolak || isRevisi) && !catatanReviewer.trim()) {
      alert(isRevisi ? 'Isi catatan/instruksi revisi untuk siswa terlebih dahulu.' : 'Isi catatan/alasan penolakan terlebih dahulu.')
      return
    }

    setReviewSaving(true)
    const now = new Date().toISOString()
    const previousStatus = pengajuan.status

    let attachmentObj = pengajuan.reviewer_attachment || null
    if (isRevisi && reviewerAttachmentFile) {
      const ext = reviewerAttachmentFile.name.split('.').pop()
      const path = `teacher-attachments/${pengajuan.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upFileErr } = await supabase.storage.from('bukti-pengajuan').upload(path, reviewerAttachmentFile, { contentType: reviewerAttachmentFile.type })
      if (!upFileErr) {
        attachmentObj = {
          path,
          name: reviewerAttachmentFile.name,
          type: reviewerAttachmentFile.type,
          size: reviewerAttachmentFile.size
        }
      } else {
        console.error('Gagal upload lampiran guru:', upFileErr)
      }
    }

    let targetStatus = 'disetujui'
    if (isDitolak) targetStatus = 'ditolak'
    if (isRevisi) targetStatus = 'revisi'

    // 1. Update status pengajuan
    const updatePayload = {
      status: targetStatus,
      catatan_reviewer: catatanReviewer.trim() || null,
      reviewed_by: reviewerName,
      reviewed_at: now,
      is_spam: isSpam,
      updated_at: now,
    }

    if (attachmentObj) {
      updatePayload.reviewer_attachment = attachmentObj
    }

    let { error: upErr } = await supabase.from('pengajuan_poin_positif').update(updatePayload).eq('id', pengajuan.id)

    // Fallback jika kolom reviewer_attachment belum dibuat di database Supabase
    if (upErr && upErr.message?.includes('reviewer_attachment')) {
      delete updatePayload.reviewer_attachment
      const retryRes = await supabase.from('pengajuan_poin_positif').update(updatePayload).eq('id', pengajuan.id)
      upErr = retryRes.error
    }

    if (upErr) {
      if (upErr.message?.includes('status_check')) {
        alert('Gagal: Database Supabase belum mengizinkan status "revisi". Silakan jalankan perintah SQL di Supabase SQL Editor (lihat file supabase/add_reviewer_attachment_column.sql).')
      } else {
        alert('Gagal: ' + upErr.message)
      }
      setReviewSaving(false)
      return
    }

    // 2. Logika Penyesuaian Poin:
    // A. Jika status SEBELUMNYA bukan disetujui, dan SEKARANG menjadi disetujui: Tambah poin & insert point_records
    if (previousStatus !== 'disetujui' && targetStatus === 'disetujui') {
      const tanggalHariIni = new Date().toISOString().slice(0, 10)

      // Insert point_records
      const { error: recErr } = await supabase.from('point_records').insert({
        nisn: pengajuan.nisn,
        nama_siswa: pengajuan.nama_siswa,
        kelas: pengajuan.kelas,
        tahun_ajaran_id: pengajuan.tahun_ajaran_id,
        semester: pengajuan.semester,
        catalog_id: pengajuan.catalog_id,
        kode_katalog: pengajuan.kode_katalog,
        jenis: pengajuan.jenis,
        poin_diberikan: pengajuan.poin_diajukan,
        keterangan: `[Pengajuan Mandiri] ${pengajuan.alasan?.slice(0, 100)}`,
        dicatat_oleh: reviewerName,
        tanggal: tanggalHariIni,
      })
      if (recErr) console.error('Gagal insert point_records:', recErr)

      // Update student_points
      const { data: spData } = await supabase.from('student_points').select('*')
        .eq('nisn', pengajuan.nisn).eq('tahun_ajaran_id', pengajuan.tahun_ajaran_id)
        .eq('semester', pengajuan.semester).maybeSingle()

      const defaultPoin = spData?.poin_default ?? 100
      const currentPoin = spData?.total_poin ?? defaultPoin
      const newPoin = currentPoin + pengajuan.poin_diajukan

      await supabase.from('student_points').upsert({
        nisn: pengajuan.nisn,
        tahun_ajaran_id: pengajuan.tahun_ajaran_id,
        semester: pengajuan.semester,
        total_poin: newPoin,
        poin_default: defaultPoin,
        updated_at: now,
      }, { onConflict: 'nisn,tahun_ajaran_id,semester' })
    }

    // B. Jika status SEBELUMNYA disetujui, dan SEKARANG diubah menjadi BUKAN disetujui: Deduct poin & hapus point_records
    if (previousStatus === 'disetujui' && targetStatus !== 'disetujui') {
      // Hapus point_records terkait
      await supabase.from('point_records')
        .delete()
        .eq('nisn', pengajuan.nisn)
        .eq('tahun_ajaran_id', pengajuan.tahun_ajaran_id)
        .eq('semester', pengajuan.semester)
        .eq('catalog_id', pengajuan.catalog_id)
        .ilike('keterangan', '%[Pengajuan Mandiri]%')

      // Kurangi student_points
      const { data: spData } = await supabase.from('student_points').select('*')
        .eq('nisn', pengajuan.nisn).eq('tahun_ajaran_id', pengajuan.tahun_ajaran_id)
        .eq('semester', pengajuan.semester).maybeSingle()

      if (spData) {
        const defaultPoin = spData.poin_default ?? 100
        const currentPoin = spData.total_poin ?? defaultPoin
        const newPoin = Math.max(0, currentPoin - pengajuan.poin_diajukan)

        await supabase.from('student_points').upsert({
          nisn: pengajuan.nisn,
          tahun_ajaran_id: pengajuan.tahun_ajaran_id,
          semester: pengajuan.semester,
          total_poin: newPoin,
          poin_default: defaultPoin,
          updated_at: now,
        }, { onConflict: 'nisn,tahun_ajaran_id,semester' })
      }
    }

    // 3. Jika SPAM: update ban record
    if (isSpam) {
      const { data: existingBan } = await supabase.from('pengajuan_poin_ban')
        .select('*').eq('nisn', pengajuan.nisn).maybeSingle()

      const newSpamCount = (existingBan?.spam_count || 0) + 1
      const shouldBan = newSpamCount >= spamThreshold

      const bannedUntil = shouldBan
        ? new Date(Date.now() + spamBanDays * 24 * 60 * 60 * 1000).toISOString()
        : existingBan?.banned_until || null

      await supabase.from('pengajuan_poin_ban').upsert({
        nisn: pengajuan.nisn,
        nama_siswa: pengajuan.nama_siswa,
        alasan: shouldBan
          ? `Pengajuan spam terdeteksi ${newSpamCount}x. Diblokir otomatis selama ${spamBanDays} hari oleh ${reviewerName}.`
          : `Spam ${newSpamCount}x (belum mencapai batas ${spamThreshold}x).`,
        banned_by: reviewerName,
        banned_at: now,
        banned_until: bannedUntil,
        is_active: shouldBan,
        spam_count: newSpamCount,
        updated_at: now,
      }, { onConflict: 'nisn' })
    }

    setReviewModal(null)
    setReviewSaving(false)
    fetchPengajuan()
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.length === pengajuanList.length && pengajuanList.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(pengajuanList.map(p => p.id))
    }
  }

  const handleToggleSelectRow = (id, e) => {
    if (e) e.stopPropagation()
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return
    const selectedItems = pengajuanList.filter(p => selectedIds.includes(p.id))
    const itemsToApprove = selectedItems.filter(p => p.status !== 'disetujui')

    if (itemsToApprove.length === 0) {
      alert('Semua pengajuan yang Anda pilih sudah berstatus Disetujui.')
      return
    }

    const totalPoin = itemsToApprove.reduce((sum, item) => sum + (item.poin_diajukan || 0), 0)

    const confirmed = await requestConfirm({
      title: `Setujui ${itemsToApprove.length} Pengajuan Terpilih?`,
      message: `Pengajuan terpilih akan langsung disetujui dan poin (+${totalPoin} poin total) akan ditambahkan ke rekap poin masing-masing siswa.`,
      confirmLabel: `Ya, Setujui (${itemsToApprove.length})`,
      confirmColor: 'green',
      icon: 'info',
    })

    if (!confirmed) return

    setBulkProcessing(true)
    const now = new Date().toISOString()
    const tanggalHariIni = now.slice(0, 10)

    for (const item of itemsToApprove) {
      const updatePayload = {
        status: 'disetujui',
        reviewed_by: reviewerName,
        reviewed_at: now,
        updated_at: now,
      }

      const { error: upErr } = await supabase.from('pengajuan_poin_positif').update(updatePayload).eq('id', item.id)
      if (upErr) {
        console.error(`Gagal approve item ${item.id}:`, upErr)
        continue
      }

      // Insert point_records
      await supabase.from('point_records').insert({
        nisn: item.nisn,
        nama_siswa: item.nama_siswa,
        kelas: item.kelas,
        tahun_ajaran_id: item.tahun_ajaran_id,
        semester: item.semester,
        catalog_id: item.catalog_id,
        kode_katalog: item.kode_katalog,
        jenis: item.jenis,
        poin_diberikan: item.poin_diajukan,
        keterangan: `[Pengajuan Mandiri] ${item.alasan?.slice(0, 100)}`,
        dicatat_oleh: reviewerName,
        tanggal: tanggalHariIni,
      })

      // Update student_points
      const { data: spData } = await supabase.from('student_points').select('*')
        .eq('nisn', item.nisn).eq('tahun_ajaran_id', item.tahun_ajaran_id)
        .eq('semester', item.semester).maybeSingle()

      const defaultPoin = spData?.poin_default ?? 100
      const currentPoin = spData?.total_poin ?? defaultPoin
      const newPoin = currentPoin + item.poin_diajukan

      await supabase.from('student_points').upsert({
        nisn: item.nisn,
        tahun_ajaran_id: item.tahun_ajaran_id,
        semester: item.semester,
        total_poin: newPoin,
        poin_default: defaultPoin,
        updated_at: now,
      }, { onConflict: 'nisn,tahun_ajaran_id,semester' })
    }

    setBulkProcessing(false)
    setSelectedIds([])
    fetchPengajuan()
  }

  const handleToggleBan = async (ban) => {
    const confirmed = await requestConfirm({
      title: ban.is_active ? 'Cabut Blokir Siswa?' : 'Aktifkan Blokir Siswa?',
      message: ban.is_active
        ? `Cabut blokir pengajuan poin untuk ${ban.nama_siswa}? Siswa ini akan bisa mengajukan poin kembali.`
        : `Aktifkan kembali blokir untuk ${ban.nama_siswa}?`,
      confirmLabel: ban.is_active ? 'Cabut Blokir' : 'Blokir',
      confirmColor: ban.is_active ? 'green' : 'red',
      icon: ban.is_active ? 'info' : 'danger',
    })
    if (!confirmed) return
    await supabase.from('pengajuan_poin_ban').update({
      is_active: !ban.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', ban.id)
    fetchBanList()
  }

  const handleDeleteBan = async (ban) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Record Ban?',
      message: `Hapus catatan ban untuk ${ban.nama_siswa}? Data spam count akan terhapus.`,
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    await supabase.from('pengajuan_poin_ban').delete().eq('id', ban.id)
    fetchBanList()
  }

  const pendingCount = pengajuanList.filter(p => p.status === 'pending').length
  const statusColor = (s) => {
    if (s === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200'
    if (s === 'revisi') return 'bg-blue-100 text-blue-800 border-blue-200'
    if (s === 'disetujui') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (s === 'ditolak') return 'bg-red-100 text-red-700 border-red-200'
    return 'bg-slate-100 text-slate-600 border-slate-200'
  }
  const statusLabel = (s) => {
    if (s === 'pending') return '⏳ Menunggu'
    if (s === 'revisi') return '✏️ Perlu Revisi'
    if (s === 'disetujui') return '✅ Disetujui'
    if (s === 'ditolak') return '❌ Ditolak'
    return s
  }

  const statsCount = {
    total: allPengajuan.length,
    pending: allPengajuan.filter(p => p.status === 'pending').length,
    revisi: allPengajuan.filter(p => p.status === 'revisi').length,
    disetujui: allPengajuan.filter(p => p.status === 'disetujui').length,
    ditolak: allPengajuan.filter(p => p.status === 'ditolak').length,
  }

  return (
    <div className="animate-slide-up space-y-5">
      {ConfirmModalComponent}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Pengajuan Poin Positif
            {statsCount.pending > 0 && (
              <span className="text-xs font-black bg-amber-500 text-white px-2.5 py-0.5 rounded-full">{statsCount.pending} Menunggu</span>
            )}
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">{activeTa?.nama} — Review pengajuan poin mandiri dari siswa</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('pengajuan')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'pengajuan' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            📋 Daftar Pengajuan
          </button>
          {!readOnly && (
            <button onClick={() => setActiveTab('ban')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'ban' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              🚫 Manajemen Blokir
            </button>
          )}
        </div>
      </div>

      {/* ─── TAB: PENGAJUAN ─── */}
      {activeTab === 'pengajuan' && (
        <div className="space-y-3">
          {/* Quick Status Filter Tabs / Chips */}
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>Semua Status</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${filterStatus === 'all' ? 'bg-white text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
                {statsCount.total}
              </span>
            </button>

            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === 'pending'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-amber-700 hover:bg-amber-100/70'
              }`}
            >
              <span>⏳ Menunggu Review</span>
              {statsCount.pending > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${filterStatus === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-200 text-amber-800'}`}>
                  {statsCount.pending}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilterStatus('revisi')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === 'revisi'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-blue-700 hover:bg-blue-100/70'
              }`}
            >
              <span>✏️ Perlu Revisi</span>
              {statsCount.revisi > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${filterStatus === 'revisi' ? 'bg-white text-blue-700' : 'bg-blue-200 text-blue-800'}`}>
                  {statsCount.revisi}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilterStatus('disetujui')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === 'disetujui'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 hover:bg-emerald-100/70'
              }`}
            >
              <span>✅ Disetujui</span>
              {statsCount.disetujui > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${filterStatus === 'disetujui' ? 'bg-white text-emerald-700' : 'bg-emerald-200 text-emerald-800'}`}>
                  {statsCount.disetujui}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilterStatus('ditolak')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterStatus === 'ditolak'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-red-700 hover:bg-red-100/70'
              }`}
            >
              <span>❌ Ditolak</span>
              {statsCount.ditolak > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${filterStatus === 'ditolak' ? 'bg-white text-red-700' : 'bg-red-200 text-red-800'}`}>
                  {statsCount.ditolak}
                </span>
              )}
            </button>
          </div>

          {/* Search Bar & Class Filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Cari nama atau NISN..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <select value={filterKelas} onChange={e => setFilterKelas(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="all">Semua Kelas</option>
              {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button onClick={fetchPengajuan}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium flex items-center gap-1.5">
              🔄 Refresh
            </button>
          </div>

          {/* Tabel / List Ringkas Expandable */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
          ) : pengajuanList.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center shadow-sm">
              <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              <p className="text-slate-400 font-medium text-sm">Tidak ada pengajuan {filterStatus !== 'all' ? `dengan status "${statusLabel(filterStatus)}"` : ''}</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {!readOnly && pengajuanList.length > 0 && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-700 hover:text-indigo-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={pengajuanList.length > 0 && selectedIds.length === pengajuanList.length}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold">Pilih Semua</span>
                    </label>
                  )}
                  {(!readOnly && pengajuanList.length > 0) && <span className="text-slate-300">|</span>}
                  <span>{pengajuanList.length} Pengajuan Ditemukan</span>
                </div>

                {selectedIds.length > 0 && !readOnly && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                      {selectedIds.length} Terpilih
                    </span>
                    <button
                      type="button"
                      onClick={handleBulkApprove}
                      disabled={bulkProcessing}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {bulkProcessing ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      <span>Setujui ({selectedIds.length}) Terpilih</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium hover:bg-slate-200/60 rounded-lg transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                )}

                {selectedIds.length === 0 && (
                  <span className="text-[10px] text-slate-400">Klik baris untuk rincian | Centang untuk setujui sekaligus</span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {pengajuanList.map(p => {
                  const isExpanded = expandedId === p.id
                  const isSelected = selectedIds.includes(p.id)
                  const dateFormatted = new Date(p.created_at).toLocaleDateString('id-ID', {
                    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
                  })
                  return (
                    <div key={p.id} className="transition-colors hover:bg-slate-50/70">
                      {/* Baris Ringkas (1 Baris Default) */}
                      <div className="flex items-center">
                        {!readOnly && (
                          <div className="pl-4 pr-1 py-3 shrink-0 flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelectRow(p.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        )}
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : p.id)}
                          className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${isExpanded ? 'bg-indigo-50/40' : ''} ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Waktu */}
                            <span className="text-[11px] font-mono text-slate-400 shrink-0 w-24 hidden sm:inline">{dateFormatted}</span>

                            {/* Siswa & Kelas */}
                            <div className="w-36 sm:w-44 shrink-0 truncate">
                              <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{p.nama_siswa}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.2 rounded-full">{p.kelas}</span>
                                {p.is_spam && <span className="text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 px-1 rounded">Spam</span>}
                              </div>
                            </div>

                            {/* Kategori */}
                            <span className="text-xs text-slate-500 shrink-0 w-32 hidden md:inline truncate">{p.kategori}</span>

                            {/* Jenis Poin */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded shrink-0 hidden lg:inline">{p.kode_katalog}</span>
                              <span className="text-xs font-semibold text-slate-700 truncate">{p.jenis}</span>
                              <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">+{p.poin_diajukan}</span>
                            </div>
                          </div>

                          {/* Status + Indikator Panah */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(p.status)}`}>
                              {statusLabel(p.status)}
                            </span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </div>
                        </button>
                      </div>

                      {/* Detail Terbuka (Expanded Area) */}
                      {isExpanded && (
                        <div className="px-4 py-4 bg-slate-50/90 border-t border-slate-100 space-y-3 animate-fade-in text-xs">
                          <div className="flex items-center justify-between text-slate-500 text-[11px] flex-wrap gap-2 pb-1 border-b border-slate-200/60">
                            <span>NISN: <strong className="font-mono text-slate-700">{p.nisn}</strong></span>
                            <span>Tgl Pelaksanaan Kegiatan: <strong className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{p.tanggal_kegiatan ? new Date(p.tanggal_kegiatan).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></span>
                            <span>Tgl Diajukan: <strong>{new Date(p.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>
                          </div>

                          {/* Alasan */}
                          <div>
                            <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1">Alasan Pengajuan</p>
                            <p className="bg-white p-3 rounded-xl border border-slate-200 text-slate-700 leading-relaxed font-normal">{p.alasan}</p>
                          </div>

                          {/* Catatan Reviewer */}
                          {p.catatan_reviewer && (
                            <div>
                              <p className="font-bold text-red-500 uppercase tracking-wider text-[10px] mb-1">Catatan Reviewer ({p.reviewed_by})</p>
                              <p className="bg-red-50 p-3 rounded-xl border border-red-200 text-red-700 font-medium">{p.catatan_reviewer}</p>
                            </div>
                          )}

                          {/* Bukti File / Link */}
                          {p.bukti_files?.length > 0 && (
                            <div>
                              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mb-1.5">Bukti ({p.bukti_files.length})</p>
                              <div className="flex gap-2 flex-wrap">
                                {p.bukti_files.map((bf, i) => (
                                  <button key={i} type="button" onClick={() => openFile(bf)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors shadow-sm">
                                    {bf.type === 'link' ? '🔗' : bf.type?.startsWith('image/') ? '🖼️' : '📄'} {bf.name || `Bukti ${i+1}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tombol Aksional Review */}
                          {!readOnly && (
                            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-200/60 items-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Ubah Status / Review:</span>
                              <button onClick={() => openReviewModal(p, 'setujui')}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors shadow-sm ${
                                  p.status === 'disetujui' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                {p.status === 'disetujui' ? '✓ Disetujui' : 'Setujui'}
                              </button>
                              <button onClick={() => openReviewModal(p, 'revisi')}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors shadow-sm ${
                                  p.status === 'revisi' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-amber-500 hover:bg-amber-600 text-white'
                                }`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                {p.status === 'revisi' ? '✏️ Perlu Revisi' : 'Revisi'}
                              </button>
                              <button onClick={() => openReviewModal(p, 'tolak')}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                                  p.status === 'ditolak' ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                                }`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                {p.status === 'ditolak' ? '✕ Ditolak' : 'Tolak'}
                              </button>
                              <button onClick={() => openReviewModal(p, 'spam')}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold rounded-xl transition-colors">
                                🚫 Tandai Spam
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: BAN MANAGEMENT ─── */}
      {activeTab === 'ban' && !readOnly && (
        <div className="space-y-4">
          {/* Settings spam */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <p className="font-bold text-amber-800 text-sm mb-1">⚙️ Pengaturan Anti-Spam</p>
            <p className="text-amber-600 text-xs mb-4">Atur batas spam sebelum siswa diblokir otomatis.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">Batas Spam (kali)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={spamThreshold} onChange={e => setSpamThreshold(parseInt(e.target.value) || 1)} min={1} max={20}
                    className="w-24 px-3 py-2 border border-amber-200 rounded-xl text-sm font-bold text-amber-700 bg-white focus:ring-2 focus:ring-amber-400 outline-none text-center" />
                  <span className="text-xs text-amber-600">kali tag spam → auto-blokir</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">Durasi Blokir Otomatis (hari)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={spamBanDays} onChange={e => setSpamBanDays(parseInt(e.target.value) || 1)} min={1} max={365}
                    className="w-24 px-3 py-2 border border-amber-200 rounded-xl text-sm font-bold text-amber-700 bg-white focus:ring-2 focus:ring-amber-400 outline-none text-center" />
                  <span className="text-xs text-amber-600">hari</span>
                </div>
              </div>
            </div>
            <button onClick={handleSaveSettings} disabled={savingSettings}
              className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors">
              {savingSettings ? 'Menyimpan...' : 'Simpan Setting'}
            </button>
          </div>

          {/* Ban list */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Daftar Siswa Terblokir</h3>
              <button onClick={fetchBanList} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800">Refresh</button>
            </div>
            {banLoading ? (
              <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : banList.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-400 text-sm">Tidak ada siswa yang diblokir</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {banList.map(ban => (
                  <div key={ban.id} className={`p-4 flex items-start gap-4 ${ban.is_active ? 'bg-red-50/30' : 'bg-slate-50/50'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${ban.is_active ? 'bg-red-100' : 'bg-slate-100'}`}>
                      <svg className={`w-4 h-4 ${ban.is_active ? 'text-red-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800 text-sm">{ban.nama_siswa || ban.nisn}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ban.is_active ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {ban.is_active ? '🚫 Aktif' : '✓ Tidak Aktif'}
                        </span>
                        <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full font-bold">{ban.spam_count}x spam</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{ban.alasan}</p>
                      {ban.banned_until && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Berakhir: {new Date(ban.banned_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {new Date(ban.banned_until) < new Date() && <span className="text-emerald-600 ml-1">(sudah berakhir)</span>}
                        </p>
                      )}
                      {!ban.banned_until && ban.is_active && <p className="text-[11px] text-red-400 mt-0.5">Blokir permanen</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleToggleBan(ban)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${ban.is_active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}>
                        {ban.is_active ? 'Cabut Blokir' : 'Blokir Lagi'}
                      </button>
                      <button onClick={() => handleDeleteBan(ban)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Hapus record">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── REVIEW MODAL ─── */}
      {reviewModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/65 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={e => e.target === e.currentTarget && setReviewModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up overflow-hidden border border-slate-100">
            {/* Modal header */}
            <div className={`px-5 py-4 flex items-center gap-3 ${
              reviewModal.mode === 'setujui' ? 'bg-emerald-600' :
              reviewModal.mode === 'revisi' ? 'bg-amber-600' :
              reviewModal.mode === 'spam' ? 'bg-orange-500' : 'bg-red-600'
            }`}>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white shrink-0">
                {reviewModal.mode === 'setujui' ? '✅' : reviewModal.mode === 'revisi' ? '✏️' : reviewModal.mode === 'spam' ? '🚫' : '❌'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm">
                  {reviewModal.mode === 'setujui' ? 'Setujui Pengajuan' :
                   reviewModal.mode === 'revisi' ? 'Minta Revisi Kepada Siswa' :
                   reviewModal.mode === 'spam' ? 'Tandai sebagai Spam' : 'Tolak Pengajuan'}
                </p>
                <p className="text-white/80 text-xs truncate">{reviewModal.pengajuan.nama_siswa} — {reviewModal.pengajuan.jenis} (Status saat ini: <span className="font-bold uppercase">{statusLabel(reviewModal.pengajuan.status)}</span>)</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {reviewModal.mode === 'setujui' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-emerald-800 font-bold text-sm mb-1">Konfirmasi Persetujuan</p>
                  <p className="text-emerald-700 text-xs">Poin <strong>+{reviewModal.pengajuan.poin_diajukan}</strong> akan ditambahkan ke rekap poin {reviewModal.pengajuan.nama_siswa} secara otomatis.</p>
                </div>
              )}

              {reviewModal.mode === 'revisi' && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
                    Siswa dapat mengedit &amp; mengirim ulang pengajuan ini berdasarkan catatan &amp; lampiran dari Anda.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Catatan / Instruksi Revisi <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={catatanReviewer}
                      onChange={e => setCatatanReviewer(e.target.value)}
                      placeholder="Contoh: Silakan upload foto bukti fisik sertifikat yang lebih jelas, atau isi form berikut..."
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lampiran File Dari Guru / Form <span className="text-slate-400 font-normal">(opsional)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer border border-slate-300 transition-colors inline-flex items-center gap-1.5">
                        <span>📎 Upload File / Template</span>
                        <input
                          type="file"
                          onChange={e => setReviewerAttachmentFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                      {reviewerAttachmentFile && (
                        <div className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200 truncate max-w-[200px]">
                          <span className="truncate">{reviewerAttachmentFile.name}</span>
                          <button type="button" onClick={() => setReviewerAttachmentFile(null)} className="text-indigo-400 hover:text-red-600 font-bold ml-1">✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(reviewModal.mode === 'tolak' || reviewModal.mode === 'spam') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Catatan / Alasan {reviewModal.mode === 'spam' ? 'Penandaan Spam' : 'Penolakan'} <span className="text-red-500">*</span>
                  </label>
                  <textarea value={catatanReviewer} onChange={e => setCatatanReviewer(e.target.value)}
                    placeholder={reviewModal.mode === 'spam' ? 'Contoh: Bukti tidak valid / pengajuan berulang tanpa dasar...' : 'Jelaskan alasan penolakan kepada siswa...'}
                    rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                </div>
              )}

              {reviewModal.mode === 'spam' && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="text-orange-700 text-xs"><strong>Perhatian:</strong> Jika siswa ini sudah mencapai batas spam ({spamThreshold}x), mereka akan otomatis diblokir selama {spamBanDays} hari.</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setReviewModal(null)} disabled={reviewSaving}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">
                  Batal
                </button>
                <button onClick={handleReview} disabled={reviewSaving}
                  className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                    reviewModal.mode === 'setujui' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    reviewModal.mode === 'revisi' ? 'bg-amber-600 hover:bg-amber-700' :
                    reviewModal.mode === 'spam' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                  }`}>
                  {reviewSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                    reviewModal.mode === 'setujui' ? 'Ya, Setujui' :
                    reviewModal.mode === 'revisi' ? 'Kirim Minta Revisi' :
                    reviewModal.mode === 'spam' ? 'Tandai Spam' : 'Tolak Pengajuan'
                  )}
                </button>
              </div>
            </div>
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
