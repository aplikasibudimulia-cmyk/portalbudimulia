import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import { downloadFile } from '../utils/fileDownloader'

const getPoinColor = (p) => {
  if (p > 75) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (p > 50) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (p > 25) return 'text-orange-700 bg-orange-50 border-orange-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

const formatRecordDateTime = (rec) => {
  const source = rec?.created_at || rec?.tanggal
  if (!source) return { date: '-', time: '' }
  try {
    const d = new Date(rec?.created_at || `${rec?.tanggal}T00:00:00`)
    if (isNaN(d.getTime())) return { date: rec?.tanggal || '-', time: '' }

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    let timeStr = ''
    if (rec?.created_at) {
      timeStr = `${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':')} WIB`
    }
    return { date: dateStr, time: timeStr }
  } catch {
    return { date: rec?.tanggal || '-', time: '' }
  }
}

export default function AdminCatatPoinSection({ session, activeTa, readOnly = false }) {
  // Tahun Ajaran & Semester state
  const [semester, setSemester] = useState(1)
  const [semesters, setSemesters] = useState([])

  // Form state
  const getInitialTime = () => {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [jam, setJam] = useState(getInitialTime())
  const [guruList, setGuruList] = useState([])
  const [selectedPetugas, setSelectedPetugas] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentPoin, setStudentPoin] = useState(null)
  const [katalogSearch, setKatalogSearch] = useState('')
  const [katalogResults, setKatalogResults] = useState([])
  const [selectedKatalogs, setSelectedKatalogs] = useState([])
  const [poinDiberikan, setPoinDiberikan] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [alert, setAlert] = useState(null) // { type, message }

  // Mode Pemulihan Poin Khusus Guru BK
  const [catatMode, setCatatMode] = useState('katalog') // 'katalog' | 'pemulihan_bk'
  const [pemulihanJudul, setPemulihanJudul] = useState('Pemulihan Poin Siswa (Tugas Khusus BK)')
  const [manualPoin, setManualPoin] = useState('10')

  // Detect if current session is logged in as Petugas Piket
  const isPiket = Boolean(
    session?.role?.toLowerCase()?.includes('piket') ||
    session?.nama_guru?.toLowerCase()?.includes('piket') ||
    session?.username?.toLowerCase()?.includes('piket') ||
    (Array.isArray(session?.roles) && session.roles.some(r => (typeof r === 'string' ? r : r?.nama || '').toLowerCase().includes('piket')))
  )

  // Detect if current session is logged in as Guru BK / Admin
  const isBK = Boolean(
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) ||
    session?.is_admin ||
    session?.role?.toLowerCase()?.includes('bk') ||
    session?.role?.toLowerCase()?.includes('admin') ||
    session?.nama_guru?.toLowerCase()?.includes('bk') ||
    session?.nama_guru?.toLowerCase()?.includes('admin') ||
    session?.username?.toLowerCase()?.includes('bk') ||
    session?.username?.toLowerCase()?.includes('admin') ||
    session?.email?.toLowerCase()?.includes('admin') ||
    (Array.isArray(session?.roles) && session.roles.some(r => {
      const name = (typeof r === 'string' ? r : r?.nama || '').toLowerCase()
      return name.includes('bk') || name.includes('bimbingan') || name.includes('admin') || name.includes('konseling')
    }))
  )

  // History state
  const [records, setRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | '7days' | '30days' | 'custom'
  const [filterKelas, setFilterKelas] = useState('all')
  const [allKelas, setAllKelas] = useState([])
  const [limitRows, setLimitRows] = useState('all')
  const [totalCount, setTotalCount] = useState(0)

  // Guidance stages
  const [stages, setStages] = useState([])

  // Export report
  const [exportDateFrom, setExportDateFrom] = useState(new Date().toISOString().slice(0, 10))
  const [exportDateTo, setExportDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [showExportModal, setShowExportModal] = useState(false)

  // Edit record state
  const [editingRecord, setEditingRecord] = useState(null)
  const [editForm, setEditForm] = useState({ tanggal: '', jenis: '', poin_diberikan: '', keterangan: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editKatalogSearch, setEditKatalogSearch] = useState('')
  const [editKatalogResults, setEditKatalogResults] = useState([])

  // Rekalkulasi Poin
  const [rekalkulasiLoading, setRekalkulasiLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const studentSearchRef = useRef()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => {
    fetchStages()
    fetchKelas()
    fetchGuruList()
  }, [])

  useEffect(() => {
    if (activeTa?.id) fetchSemesters(activeTa.id)
  }, [activeTa])

  const fetchGuruList = async () => {
    try {
      const { data, error } = await supabase
        .from('guru')
        .select('id, nama_guru, kode')
        .order('nama_guru', { ascending: true })

      if (error) {
        console.error('Error fetching guru list:', error)
      } else if (data) {
        setGuruList(data)
      }
    } catch (err) {
      console.error('Exception fetching guru list:', err)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [filterDateFrom, filterDateTo, filterKelas, activeTa, semester, limitRows])

  const fetchSemesters = async (taId) => {
    const { data } = await supabase.from('semester').select('*').eq('tahun_ajaran_id', taId).order('nomor')
    setSemesters(data || [])
    // Auto-set current semester
    const today = new Date().toISOString().slice(0, 10)
    const active = (data || []).find(s => s.tanggal_mulai <= today && s.tanggal_selesai >= today)
    if (active) setSemester(active.nomor)
  }

  const fetchStages = async () => {
    const { data } = await supabase.from('guidance_stages').select('*').order('batas_poin', { ascending: false })
    setStages(data || [])
  }

  const fetchKelas = async () => {
    const { data } = await supabase.from('siswa_lengkap').select('kelas').eq('is_aktif', true)
    const unique = [...new Set((data || []).map(d => d.kelas).filter(Boolean))].sort()
    setAllKelas(unique)
  }

  const fetchRecords = async () => {
    if (!activeTa?.id) return
    setHistoryLoading(true)
    let query = supabase.from('point_records')
      .select('*', { count: 'exact' })
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('semester', semester)
      .order('created_at', { ascending: false })

    if (filterDateFrom && filterDateTo) {
      const fromIso = new Date(`${filterDateFrom}T00:00:00`).toISOString()
      const toIso = new Date(`${filterDateTo}T23:59:59.999`).toISOString()
      query = query.gte('created_at', fromIso).lte('created_at', toIso)
    } else if (filterDateFrom) {
      const fromIso = new Date(`${filterDateFrom}T00:00:00`).toISOString()
      query = query.gte('created_at', fromIso)
    } else if (filterDateTo) {
      const toIso = new Date(`${filterDateTo}T23:59:59.999`).toISOString()
      query = query.lte('created_at', toIso)
    }

    if (filterKelas !== 'all') query = query.eq('kelas', filterKelas)
    
    if (limitRows !== 'all') {
      query = query.limit(parseInt(limitRows, 10))
    }

    const { data, count } = await query
    setRecords(data || [])
    setTotalCount(count || 0)
    setHistoryLoading(false)
  }

  // Student search with debounce
  const searchStudents = useCallback(async (q) => {
    if (!q || q.length < 2) { setStudentResults([]); return }
    const { data } = await supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas')
      .eq('is_aktif', true)
      .or(`nama_lengkap.ilike.%${q}%,nisn.ilike.%${q}%`)
      .limit(10)
    setStudentResults(data || [])
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchStudents(studentSearch), 300)
    return () => clearTimeout(timer)
  }, [studentSearch])

  const selectStudent = async (s) => {
    setSelectedStudent(s)
    setStudentSearch(s.nama_lengkap)
    setStudentResults([])
    // Fetch current poin
    if (activeTa?.id) {
      const { data } = await supabase.from('student_points')
        .select('total_poin, poin_default')
        .eq('nisn', s.nisn)
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', semester)
        .maybeSingle()
      setStudentPoin(data || { total_poin: 100, poin_default: 100 })
    }
  }

  // Katalog search
  const searchKatalog = useCallback(async (q) => {
    if (!q || q.length < 1) { setKatalogResults([]); return }
    const { data } = await supabase.from('point_catalog')
      .select('*')
      .or(`kode.ilike.%${q}%,jenis.ilike.%${q}%,kategori.ilike.%${q}%`)
      .limit(10)
    setKatalogResults(data || [])
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchKatalog(katalogSearch), 300)
    return () => clearTimeout(timer)
  }, [katalogSearch])

  const selectKatalog = (k) => {
    if (selectedKatalogs.some(item => item.id === k.id)) {
      setKatalogSearch('')
      setKatalogResults([])
      return
    }
    const newKatalogs = [...selectedKatalogs, k]
    setSelectedKatalogs(newKatalogs)
    setKatalogSearch('')
    setKatalogResults([])
    const totalPoin = newKatalogs.reduce((sum, item) => sum + item.poin, 0)
    setPoinDiberikan(totalPoin.toString())
  }

  const removeKatalog = (id) => {
    const newKatalogs = selectedKatalogs.filter(item => item.id !== id)
    setSelectedKatalogs(newKatalogs)
    const totalPoin = newKatalogs.reduce((sum, item) => sum + item.poin, 0)
    setPoinDiberikan(newKatalogs.length > 0 ? totalPoin.toString() : '')
  }

  // Determine active stage for a poin value
  const getActiveStage = (poin) => {
    return stages.find(s => poin <= s.batas_poin) || null
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!selectedStudent) { alert('Pilih siswa terlebih dahulu.'); return }
    if (!activeTa?.id) { alert('Tahun Ajaran aktif tidak ditemukan.'); return }
    
    if (isPiket && !selectedPetugas) {
      alert('Sebagai Petugas Piket, Anda wajib memilih nama guru/staff yang bertugas mengisi.')
      return
    }

    let recordsToInsert = []
    let poinNum = 0

    if (catatMode === 'pemulihan_bk') {
      const pVal = parseInt(manualPoin)
      if (isNaN(pVal) || pVal <= 0) {
        alert('Masukkan jumlah poin pemulihan yang valid (angka positif).')
        return
      }
      if (!keterangan || !keterangan.trim()) {
        alert('Keterangan tugas pemulihan wajib diisi oleh Guru BK.')
        return
      }
      poinNum = Math.abs(pVal)
    } else {
      if (selectedKatalogs.length === 0) { alert('Pilih poin dari katalog terlebih dahulu.'); return }
      poinNum = parseInt(poinDiberikan)
    }

    setSaving(true)
    setAlert(null)

    const finalPetugas = isPiket ? selectedPetugas : (session?.nama_guru || session?.email || 'Guru BK')
    const nowIso = new Date().toISOString()

    if (catatMode === 'pemulihan_bk') {
      recordsToInsert = [{
        nisn: selectedStudent.nisn,
        nama_siswa: selectedStudent.nama_lengkap,
        kelas: selectedStudent.kelas,
        tahun_ajaran_id: activeTa.id,
        semester,
        catalog_id: null,
        kode_katalog: 'PEMULIHAN',
        jenis: pemulihanJudul.trim() || 'Pemulihan Poin Siswa (Tugas Khusus BK)',
        poin_diberikan: poinNum,
        keterangan: keterangan.trim(),
        dicatat_oleh: finalPetugas,
        tanggal,
        created_at: nowIso,
      }]
    } else {
      recordsToInsert = selectedKatalogs.map(k => ({
        nisn: selectedStudent.nisn,
        nama_siswa: selectedStudent.nama_lengkap,
        kelas: selectedStudent.kelas,
        tahun_ajaran_id: activeTa.id,
        semester,
        catalog_id: k.id,
        kode_katalog: k.kode,
        jenis: k.jenis,
        poin_diberikan: k.poin,
        keterangan,
        dicatat_oleh: finalPetugas,
        tanggal,
        created_at: nowIso,
      }))
    }

    const { error: recErr } = await supabase.from('point_records').insert(recordsToInsert)
    if (recErr) { alert('Gagal menyimpan: ' + recErr.message); setSaving(false); return }

    // 2. Upsert student_points — get current then update
    const { data: spData } = await supabase.from('student_points')
      .select('*').eq('nisn', selectedStudent.nisn).eq('tahun_ajaran_id', activeTa.id).eq('semester', semester).maybeSingle()

    const defaultPoin = spData?.poin_default ?? 100
    const currentPoin = spData?.total_poin ?? defaultPoin
    const newPoin = currentPoin + poinNum

    const { data: spUpsert, error: spErr } = await supabase.from('student_points').upsert({
      nisn: selectedStudent.nisn,
      tahun_ajaran_id: activeTa.id,
      semester,
      total_poin: newPoin,
      poin_default: defaultPoin,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'nisn,tahun_ajaran_id,semester' }).select().single()

    if (spErr) console.error('Gagal update poin:', spErr)

    // 3. Check guidance stage threshold
    const newStage = getActiveStage(newPoin)
    const oldStage = getActiveStage(currentPoin)

    if (newStage && newStage.id !== oldStage?.id) {
      // Siswa masuk tahap baru — update student_points dan catat log
      await supabase.from('student_points').update({ tahap_pembinaan_aktif: newStage.id })
        .eq('nisn', selectedStudent.nisn).eq('tahun_ajaran_id', activeTa.id).eq('semester', semester)
      await supabase.from('guidance_logs').insert([{
        nisn: selectedStudent.nisn,
        nama_siswa: selectedStudent.nama_lengkap,
        tahun_ajaran_id: activeTa.id,
        semester,
        stage_id: newStage.id,
        nama_tahap: newStage.nama_tahap,
        poin_saat_trigger: newPoin,
        status: 'aktif',
      }])
      setAlert({
        type: 'warning',
        message: `⚠️ ${selectedStudent.nama_lengkap} kini masuk ke ${newStage.nama_tahap} (Poin: ${newPoin})!\nTindakan: ${newStage.tindakan}\nPenanggung Jawab: ${newStage.penanggung_jawab}`
      })
    } else {
      setSuccessMsg(`✓ Poin ${poinNum > 0 ? '+' : ''}${poinNum} berhasil dicatat untuk ${selectedStudent.nama_lengkap}. Total poin: ${newPoin}`)
      setTimeout(() => setSuccessMsg(''), 4000)
    }

    // Reset form
    setSelectedStudent(null)
    setStudentSearch('')
    setSelectedKatalogs([])
    setPoinDiberikan('')
    setKeterangan('')
    setSaving(false)
    fetchRecords()
  }

  // ─── EXPORT LAPORAN ───────────────────────────────────────
  const handleExportLaporan = async () => {
    if (!activeTa?.id) return
    const fromIso = new Date(`${exportDateFrom}T00:00:00`).toISOString()
    const toIso = new Date(`${exportDateTo}T23:59:59.999`).toISOString()

    let query = supabase.from('point_records').select('*')
      .eq('tahun_ajaran_id', activeTa.id).eq('semester', semester)
      .gte('created_at', fromIso).lte('created_at', toIso)
    if (filterKelas !== 'all') query = query.eq('kelas', filterKelas)
    query = query.order('created_at', { ascending: false })
    const { data: rows } = await query

    const ExcelJS = await import('exceljs')
    const { saveAs } = await import('file-saver')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Laporan Pelanggaran')
    ws.columns = [
      { header: 'Tanggal & Jam Input', key: 'tanggal', width: 22 },
      { header: 'Nama Siswa', key: 'nama_siswa', width: 28 },
      { header: 'Kelas', key: 'kelas', width: 10 },
      { header: 'Kode', key: 'kode_katalog', width: 10 },
      { header: 'Jenis', key: 'jenis', width: 38 },
      { header: 'Poin', key: 'poin_diberikan', width: 10 },
      { header: 'Keterangan', key: 'keterangan', width: 30 },
      { header: 'Dicatat Oleh', key: 'dicatat_oleh', width: 22 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    ;(rows || []).forEach((row, i) => {
      const dt = formatRecordDateTime(row)
      const displayDateStr = dt.time ? `${dt.date} ${dt.time}` : dt.date
      const r = ws.addRow({
        tanggal: displayDateStr,
        nama_siswa: row.nama_siswa,
        kelas: row.kelas,
        kode_katalog: row.kode_katalog || '',
        jenis: row.jenis,
        poin_diberikan: row.poin_diberikan,
        keterangan: row.keterangan || '',
        dicatat_oleh: row.dicatat_oleh
      })
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i%2===0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
      r.getCell('poin_diberikan').font = { color: { argb: row.poin_diberikan < 0 ? 'FFDC2626' : 'FF16A34A' }, bold: true }
    })
    // Summary row
    const totalPoin = (rows||[]).reduce((s, r) => s+r.poin_diberikan, 0)
    const sumRow = ws.addRow({ tanggal: 'TOTAL', nama_siswa: `${(rows||[]).length} record`, kelas: '', kode_katalog: '', jenis: '', poin_diberikan: totalPoin, keterangan: '', dicatat_oleh: '' })
    sumRow.font = { bold: true }
    sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    ws.eachRow(r => { r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } } }) })
    const buf = await wb.xlsx.writeBuffer()
    const today = new Date().toISOString().slice(0, 10)
    await downloadFile(buf, `laporan-pelanggaran-${today}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setShowExportModal(false)
  }

  const handleDeleteRecord = async (rec) => {
    const poinVal = rec.poin_diberikan || 0
    const confirmed = await requestConfirm({
      title: 'Hapus Catatan Poin?',
      message: `Hapus pencatatan poin "${rec.jenis}" (${poinVal > 0 ? '+' : ''}${poinVal} poin) untuk ${rec.nama_siswa}?\nTotal poin siswa akan otomatis disesuaikan kembali.`,
      confirmLabel: 'Hapus & Kembalikan Poin', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return

    try {
      // 1. Delete from point_records
      const { error: delErr } = await supabase.from('point_records').delete().eq('id', rec.id)
      if (delErr) throw delErr

      // 2. Revert / Deduct points in student_points
      const taId = rec.tahun_ajaran_id || activeTa?.id
      const sem = rec.semester || semester

      if (poinVal !== 0 && taId) {
        const { data: spData } = await supabase.from('student_points')
          .select('*')
          .eq('nisn', rec.nisn)
          .eq('tahun_ajaran_id', taId)
          .eq('semester', sem)
          .maybeSingle()

        if (spData) {
          const newTotalPoin = spData.total_poin - poinVal
          const newStage = getActiveStage(newTotalPoin)
          
          await supabase.from('student_points').update({
            total_poin: newTotalPoin,
            tahap_pembinaan_aktif: newStage?.id || null,
            updated_at: new Date().toISOString(),
          }).eq('nisn', rec.nisn)
            .eq('tahun_ajaran_id', taId)
            .eq('semester', sem)
        }
      }

      setSuccessMsg(`✓ Catatan poin untuk ${rec.nama_siswa} berhasil dihapus dan total poin telah disesuaikan.`)
      setTimeout(() => setSuccessMsg(''), 4000)
      fetchRecords()
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  // ─── EDIT RECORD ───────────────────────────────────────
  const handleEditRecord = (rec) => {
    setEditingRecord(rec)
    setEditForm({
      tanggal: rec.tanggal || '',
      jenis: rec.jenis || '',
      poin_diberikan: rec.poin_diberikan?.toString() || '',
      keterangan: rec.keterangan || '',
    })
    setEditKatalogSearch('')
    setEditKatalogResults([])
  }

  const searchEditKatalog = useCallback(async (q) => {
    if (!q || q.length < 1) { setEditKatalogResults([]); return }
    const { data } = await supabase.from('point_catalog')
      .select('*')
      .or(`kode.ilike.%${q}%,jenis.ilike.%${q}%,kategori.ilike.%${q}%`)
      .limit(10)
    setEditKatalogResults(data || [])
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchEditKatalog(editKatalogSearch), 300)
    return () => clearTimeout(timer)
  }, [editKatalogSearch])

  const handleSaveEdit = async () => {
    if (!editingRecord) return
    setEditSaving(true)
    const newPoin = parseInt(editForm.poin_diberikan)
    if (isNaN(newPoin)) { alert('Poin harus berupa angka.'); setEditSaving(false); return }
    const oldPoin = editingRecord.poin_diberikan || 0
    const poinDiff = newPoin - oldPoin

    try {
      // 1. Update record in point_records
      const { error: updateErr } = await supabase.from('point_records').update({
        tanggal: editForm.tanggal,
        jenis: editForm.jenis,
        poin_diberikan: newPoin,
        keterangan: editForm.keterangan,
      }).eq('id', editingRecord.id)

      if (updateErr) throw updateErr

      // 2. Update student_points if poin changed
      const taId = editingRecord.tahun_ajaran_id || activeTa?.id
      const sem = editingRecord.semester || semester

      if (poinDiff !== 0 && taId) {
        const { data: spData } = await supabase.from('student_points')
          .select('*')
          .eq('nisn', editingRecord.nisn)
          .eq('tahun_ajaran_id', taId)
          .eq('semester', sem)
          .maybeSingle()

        if (spData) {
          const newTotalPoin = spData.total_poin + poinDiff
          const newStage = getActiveStage(newTotalPoin)
          await supabase.from('student_points').update({
            total_poin: newTotalPoin,
            tahap_pembinaan_aktif: newStage?.id || null,
            updated_at: new Date().toISOString(),
          }).eq('nisn', editingRecord.nisn)
            .eq('tahun_ajaran_id', taId)
            .eq('semester', sem)
        }
      }

      setSuccessMsg(`✓ Record untuk ${editingRecord.nama_siswa} berhasil diperbarui.`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setEditingRecord(null)
      setEditSaving(false)
      fetchRecords()
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message)
      setEditSaving(false)
    }
  }

  const handleRekalkulasiPoin = async () => {
    if (!activeTa?.id) return
    const confirmed = await requestConfirm({
      title: 'Rekalkulasi Ulang Poin?',
      message: `Semua total poin siswa di semester ${semester} akan dihitung ulang berdasarkan catatan pelanggaran yang masih ada.\nProses ini aman — tidak menghapus data apapun.`,
      confirmLabel: 'Rekalkulasi', confirmColor: 'indigo', icon: 'info',
    })
    if (!confirmed) return

    setRekalkulasiLoading(true)
    try {
      // 1. Ambil semua point_records untuk TA & semester ini
      const { data: allRecords } = await supabase.from('point_records')
        .select('nisn, poin_diberikan')
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', semester)

      // 2. Hitung total pengurangan poin per siswa
      const poinByNisn = {}
      ;(allRecords || []).forEach(r => {
        if (!poinByNisn[r.nisn]) poinByNisn[r.nisn] = 0
        poinByNisn[r.nisn] += (r.poin_diberikan || 0)
      })

      // 3. Ambil semua student_points yang ada untuk TA & semester ini
      const { data: spList } = await supabase.from('student_points')
        .select('nisn, poin_default')
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', semester)

      // 4. Update tiap student_points dengan total yang benar
      let updatedCount = 0
      for (const sp of (spList || [])) {
        const defaultPoin = sp.poin_default ?? 100
        const totalPenguranganPoin = poinByNisn[sp.nisn] || 0
        const correctTotalPoin = defaultPoin + totalPenguranganPoin // poin negatif sudah di-handle di sini
        const newStage = getActiveStage(correctTotalPoin)
        const { error } = await supabase.from('student_points')
          .update({ 
            total_poin: correctTotalPoin, 
            tahap_pembinaan_aktif: newStage?.id || null,
            updated_at: new Date().toISOString() 
          })
          .eq('nisn', sp.nisn)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', semester)
        if (!error) updatedCount++
      }

      setSuccessMsg(`✅ Rekalkulasi selesai. ${updatedCount} data poin siswa telah disinkronkan.`)
      setTimeout(() => setSuccessMsg(''), 5000)
      fetchRecords()
    } catch (err) {
      alert('Gagal rekalkulasi: ' + err.message)
    }
    setRekalkulasiLoading(false)
  }

  return (
    <>
      <div className="animate-slide-up space-y-3">
        {ConfirmModalComponent}

      {/* Header + Semester Selector + Toggle Form Input */}
      <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
              <span>⭐</span>
              <span>Pencatatan Poin</span>
            </span>
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              {activeTa?.nama}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            {[1, 2].map(s => (
              <button key={s} onClick={() => setSemester(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${semester === s ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                Semester {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={handleRekalkulasiPoin}
                disabled={rekalkulasiLoading}
                title="Hitung ulang total poin semua siswa berdasarkan catatan yang masih ada"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${rekalkulasiLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{rekalkulasiLoading ? 'Menghitung...' : 'Rekalkulasi'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFormOpen(!isFormOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                  isFormOpen 
                    ? 'bg-slate-800 text-white hover:bg-slate-900' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <span>{isFormOpen ? '✕ Tutup Form' : '+ Catat Poin Baru'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert threshold */}
      {alert && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3.5 relative text-xs">
          <p className="font-bold text-red-800 mb-0.5">Peringatan Tahap Pembinaan!</p>
          <p className="text-red-700 whitespace-pre-line">{alert.message}</p>
          <button onClick={() => setAlert(null)} className="absolute top-2.5 right-2.5 p-1 text-red-400 hover:text-red-600 rounded-lg">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-700 text-xs font-bold">{successMsg}</div>
      )}

      {/* Form Input Poin (Collapsible & Compact) */}
      {!readOnly && isFormOpen && (
        <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm p-4 sm:p-5 animate-fade-in relative ring-1 ring-indigo-50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3.5">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>✍️</span> Form Input Poin Siswa
            </h3>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕ Sembunyikan
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal <span className="text-red-500">*</span></label>
                <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white" />
              </div>

              {/* Jam Pencatatan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jam <span className="text-red-500">*</span></label>
                <input type="time" value={jam} onChange={e => setJam(e.target.value)} required className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white" />
              </div>

              {/* Pilih Siswa */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Siswa <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input ref={studentSearchRef} type="text" value={studentSearch}
                    onChange={e => { setStudentSearch(e.target.value); if (!e.target.value) { setSelectedStudent(null); setStudentPoin(null) } }}
                    placeholder="Cari nama atau NISN siswa..." className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white" />
                  {studentResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {studentResults.map(s => (
                        <button key={s.nisn} type="button" onClick={() => selectStudent(s)}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 border-b border-slate-50 last:border-0">
                          <div>
                            <p className="text-xs font-bold text-slate-800">{s.nama_lengkap}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{s.nisn}</p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{s.kelas}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedStudent && studentPoin !== null && (
                  <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${getPoinColor(studentPoin.total_poin)}`}>
                    <span>Total Poin Saat Ini: {studentPoin.total_poin}</span>
                  </div>
                )}
              </div>
            </div>

            {/* KHUSUS GURU BK: Tab Switcher Mode Katalog vs Pemulihan Poin */}
            {isBK && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold gap-1">
                <button
                  type="button"
                  onClick={() => setCatatMode('katalog')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    catatMode === 'katalog'
                      ? 'bg-white text-indigo-700 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Pilih dari Katalog</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCatatMode('pemulihan_bk')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    catatMode === 'pemulihan_bk'
                      ? 'bg-emerald-600 text-white shadow-2xs font-black'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span>Pemulihan Poin (Khusus BK)</span>
                </button>
              </div>
            )}

            {/* Mode 1: Pilih dari Katalog */}
            {catatMode === 'katalog' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih dari Katalog Poin <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type="text" value={katalogSearch}
                    onChange={e => setKatalogSearch(e.target.value)}
                    placeholder="Ketik nama atau kode pelanggaran/prestasi..." className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white" />
                  {katalogResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {katalogResults.map(k => (
                        <button key={k.id} type="button" onClick={() => selectKatalog(k)}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2 border-b border-slate-50 last:border-0">
                          <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">{k.kode}</span>
                          <span className="text-xs text-slate-800 flex-1 min-w-0 truncate font-semibold">{k.jenis}</span>
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full shrink-0 ${k.poin < 0 ? 'text-red-700 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>{k.poin > 0 ? '+' : ''}{k.poin}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedKatalogs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedKatalogs.map(k => (
                      <span key={k.id} className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${k.poin < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        <span className="font-mono text-[10px] bg-white/60 px-1 rounded">{k.kode}</span>
                        <span className="truncate max-w-[240px]" title={k.jenis}>{k.jenis}</span>
                        <span className="font-black">{k.poin > 0 ? '+' : ''}{k.poin}</span>
                        <button type="button" onClick={() => removeKatalog(k.id)} className="hover:text-red-950 font-bold ml-1 text-sm select-none">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Mode 2: Pemulihan Poin Khusus Guru BK */
              <div className="space-y-3 bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>Formulir Pemulihan Poin Siswa (Guru BK Bebas Input Nilai Poin & Keterangan Tugas)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nama Tugas / Pembinaan <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={pemulihanJudul}
                      onChange={e => setPemulihanJudul(e.target.value)}
                      placeholder="Contoh: Tugas Piket Perpustakaan & Refleksi Diri"
                      required
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Poin Pemulihan (+) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      min="1"
                      value={manualPoin}
                      onChange={e => setManualPoin(e.target.value)}
                      placeholder="Contoh: 10"
                      required
                      className="w-full px-3 py-1.5 border border-emerald-300 rounded-xl text-xs font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Poin Total */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Poin Diberikan
                  <span className="ml-1 text-[10px] font-normal text-amber-600 bg-amber-50 px-1 rounded">
                    {catatMode === 'pemulihan_bk' ? 'manual BK' : 'otomatis'}
                  </span>
                </label>
                <input
                  type="text"
                  value={catatMode === 'pemulihan_bk' ? `+${parseInt(manualPoin) || 0}` : poinDiberikan}
                  readOnly
                  placeholder="Pilih katalog / tentukan poin"
                  className={`w-full px-3 py-1.5 border rounded-xl text-xs font-black bg-slate-50 cursor-not-allowed select-none ${
                    catatMode === 'pemulihan_bk' || parseInt(poinDiberikan) > 0
                      ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                      : parseInt(poinDiberikan) < 0
                      ? 'text-red-700 border-red-200 bg-red-50'
                      : 'border-slate-200 text-slate-500'
                  }`}
                />
              </div>
              {/* Petugas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isPiket ? (
                    <>
                      Petugas Pengisi <span className="text-red-500">*</span>
                      <span className="ml-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">Piket Wajib Pilih</span>
                    </>
                  ) : (
                    'Petugas'
                  )}
                </label>
                {isPiket ? (
                  <select
                    value={selectedPetugas}
                    onChange={e => setSelectedPetugas(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 border border-indigo-300 rounded-xl text-xs font-bold bg-indigo-50/30 text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">-- Pilih Guru / Staff Pengisi --</option>
                    {guruList.map(g => (
                      <option key={g.id} value={g.nama_guru}>
                        {g.nama_guru} {g.kode ? `(${g.kode})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={session?.nama_guru || session?.email || 'Admin'} readOnly className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50 text-slate-600 cursor-not-allowed" />
                )}
              </div>
              {/* Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan Tambahan</label>
                <input value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Opsional..." className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white" />
              </div>
            </div>

            <button type="submit" disabled={saving || !selectedStudent || selectedKatalogs.length === 0}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition-all shadow-2xs flex items-center justify-center gap-1.5">
              {saving ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {selectedKatalogs.length === 0 ? 'Pilih Katalog Poin Terlebih Dahulu' : 'Simpan Poin Siswa'}</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Riwayat Harian Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Riwayat Pencatatan</h3>
            <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              {totalCount || records.length} Data
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            {/* Preset Tanggal */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setDatePreset('all') }}
                className={`px-2 py-0.5 rounded-md font-bold transition-all ${datePreset === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = new Date().toISOString().slice(0, 10)
                  setFilterDateFrom(t); setFilterDateTo(t); setDatePreset('today')
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${datePreset === 'today' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const from = new Date(now.setDate(now.getDate() - 7)).toISOString().slice(0, 10)
                  const to = new Date().toISOString().slice(0, 10)
                  setFilterDateFrom(from); setFilterDateTo(to); setDatePreset('7days')
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${datePreset === '7days' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const from = new Date(now.setDate(now.getDate() - 30)).toISOString().slice(0, 10)
                  const to = new Date().toISOString().slice(0, 10)
                  setFilterDateFrom(from); setFilterDateTo(to); setDatePreset('30days')
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${datePreset === '30days' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                30 Hari
              </button>
            </div>

            {/* Custom Range Input */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-xl text-xs">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setDatePreset('custom') }}
                title="Dari Tanggal"
                className="bg-transparent outline-none font-medium text-slate-700 cursor-pointer"
              />
              <span className="text-slate-400 font-bold text-[10px]">s/d</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setDatePreset('custom') }}
                title="Sampai Tanggal"
                className="bg-transparent outline-none font-medium text-slate-700 cursor-pointer"
              />
            </div>

            {/* Filter Kelas */}
            <select value={filterKelas} onChange={e => setFilterKelas(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="all">Semua Kelas</option>
              {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            {/* Filter Limit Baris */}
            <select 
              value={limitRows} 
              onChange={e => setLimitRows(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
              title="Batasan jumlah data yang ditampilkan"
            >
              <option value="100">100 Data</option>
              <option value="250">250 Data</option>
              <option value="500">500 Data</option>
              <option value="all">Semua ({totalCount} Data)</option>
            </select>

            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Laporan
            </button>
          </div>
        </div>
        {historyLoading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">Tidak ada record pada tanggal ini.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left">Tanggal & Waktu</th>
                <th className="px-4 py-2.5 text-left">Siswa</th>
                <th className="px-4 py-2.5 text-left">Kelas</th>
                <th className="px-4 py-2.5 text-left">Jenis</th>
                <th className="px-4 py-2.5 text-center">Poin</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Keterangan</th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">Petugas</th>
                {!readOnly && <th className="px-4 py-2.5 text-center w-12">Aksi</th>}
              </tr></thead>
              <tbody>
                {records.map((rec, i) => {
                  const dt = formatRecordDateTime(rec)
                  return (
                    <tr key={rec.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/80 ${i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        <div className="font-semibold">{dt.date}</div>
                        {dt.time && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {dt.time}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{rec.nama_siswa}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{rec.kelas}</span></td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {rec.jenis}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rec.poin_diberikan < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {rec.poin_diberikan > 0 ? '+' : ''}{rec.poin_diberikan}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell">{rec.keterangan || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell">{rec.dicatat_oleh}</td>
                      {!readOnly && (
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleEditRecord(rec)} title="Edit record" className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => handleDeleteRecord(rec)} title="Hapus record" className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-slate-700">
                    Menampilkan {records.length} dari {totalCount} total catatan
                  </td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-center text-xs font-bold">
                    <span className={`px-2 py-0.5 rounded-full ${records.reduce((s,r)=>s+r.poin_diberikan,0) < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {records.reduce((s,r)=>s+r.poin_diberikan,0) > 0 ? '+' : ''}{records.reduce((s,r)=>s+r.poin_diberikan,0)}
                    </span>
                  </td>
                  <td colSpan={readOnly ? 2 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Export Laporan Harian</h3>
              <button onClick={() => setShowExportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dari Tanggal</label>
                  <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sampai Tanggal</label>
                  <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Kelas</label>
                <select value={filterKelas} onChange={e => setFilterKelas(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="all">Semua Kelas</option>
                  {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowExportModal(false)} className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Batal</button>
                <button onClick={handleExportLaporan} className="flex-1 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors">Download Excel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setEditingRecord(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h3 className="font-bold text-slate-800">Edit Record Poin</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingRecord.nama_siswa} — {editingRecord.kelas}</p>
              </div>
              <button onClick={() => setEditingRecord(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                <input type="date" value={editForm.tanggal}
                  onChange={e => setEditForm(f => ({ ...f, tanggal: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              {/* Jenis / Pelanggaran */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Pelanggaran / Prestasi</label>
                <input type="text" value={editForm.jenis}
                  onChange={e => setEditForm(f => ({ ...f, jenis: e.target.value }))}
                  placeholder="Masukkan jenis..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              {/* Pilih dari Katalog */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ganti dari Katalog <span className="text-slate-400 font-normal">(opsional)</span></label>
                <div className="relative">
                  <input type="text" value={editKatalogSearch}
                    onChange={e => setEditKatalogSearch(e.target.value)}
                    placeholder="Cari kode atau jenis..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  {editKatalogResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {editKatalogResults.map(k => (
                        <button key={k.id} type="button" onClick={() => {
                          setEditForm(f => ({ ...f, jenis: k.jenis, poin_diberikan: k.poin.toString() }))
                          setEditKatalogSearch('')
                          setEditKatalogResults([])
                        }}
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">{k.kode}</span>
                          <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">{k.jenis}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${k.poin < 0 ? 'text-red-700 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>{k.poin > 0 ? '+' : ''}{k.poin}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Poin */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Poin</label>
                <input type="number" value={editForm.poin_diberikan}
                  onChange={e => setEditForm(f => ({ ...f, poin_diberikan: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none ${parseInt(editForm.poin_diberikan) > 0 ? 'text-emerald-700 border-emerald-200' : parseInt(editForm.poin_diberikan) < 0 ? 'text-red-700 border-red-200' : 'border-slate-200'}`} />
                {editingRecord.poin_diberikan !== parseInt(editForm.poin_diberikan) && !isNaN(parseInt(editForm.poin_diberikan)) && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">
                    ⚠️ Poin berubah dari {editingRecord.poin_diberikan} → {editForm.poin_diberikan}. Total poin siswa akan disesuaikan otomatis.
                  </p>
                )}
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan</label>
                <input type="text" value={editForm.keterangan}
                  onChange={e => setEditForm(f => ({ ...f, keterangan: e.target.value }))}
                  placeholder="Catatan tambahan (opsional)..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditingRecord(null)} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                <button onClick={handleSaveEdit} disabled={editSaving || !editForm.jenis || !editForm.poin_diberikan}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {editSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Simpan Perubahan
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
