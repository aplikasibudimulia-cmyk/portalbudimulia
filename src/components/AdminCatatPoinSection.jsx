import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const getPoinColor = (p) => {
  if (p > 75) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (p > 50) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (p > 25) return 'text-orange-700 bg-orange-50 border-orange-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export default function AdminCatatPoinSection({ session, activeTa, readOnly = false }) {
  // Tahun Ajaran & Semester state
  const [semester, setSemester] = useState(1)
  const [semesters, setSemesters] = useState([])

  // Form state
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentPoin, setStudentPoin] = useState(null)
  const [katalogSearch, setKatalogSearch] = useState('')
  const [katalogResults, setKatalogResults] = useState([])
  const [selectedKatalog, setSelectedKatalog] = useState(null)
  const [poinDiberikan, setPoinDiberikan] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [alert, setAlert] = useState(null) // { type, message }

  // History state
  const [records, setRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterKelas, setFilterKelas] = useState('all')
  const [allKelas, setAllKelas] = useState([])

  // Guidance stages
  const [stages, setStages] = useState([])

  // Export report
  const [exportDateFrom, setExportDateFrom] = useState(new Date().toISOString().slice(0, 10))
  const [exportDateTo, setExportDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [showExportModal, setShowExportModal] = useState(false)

  const studentSearchRef = useRef()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => {
    fetchStages()
    fetchKelas()
    if (activeTa?.id) fetchSemesters(activeTa.id)
  }, [activeTa])

  useEffect(() => {
    fetchRecords()
  }, [filterDate, filterKelas, activeTa, semester])

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
      .select('*')
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('semester', semester)
      .order('created_at', { ascending: false })
    if (filterDate) query = query.eq('tanggal', filterDate)
    if (filterKelas !== 'all') query = query.eq('kelas', filterKelas)
    const { data } = await query.limit(100)
    setRecords(data || [])
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
    setSelectedKatalog(k)
    setKatalogSearch(`[${k.kode}] ${k.jenis}`)
    setKatalogResults([])
    setPoinDiberikan(k.poin.toString())
  }

  // Determine active stage for a poin value
  const getActiveStage = (poin) => {
    return stages.find(s => poin <= s.batas_poin) || null
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!selectedStudent) { alert('Pilih siswa terlebih dahulu.'); return }
    if (!poinDiberikan) { alert('Isi nilai poin.'); return }
    if (!activeTa?.id) { alert('Tahun Ajaran aktif tidak ditemukan.'); return }
    setSaving(true)
    setAlert(null)

    const poinNum = parseInt(poinDiberikan)
    const petugasName = session?.nama_guru || session?.email || 'Admin'

    // 1. Insert record
    const { error: recErr } = await supabase.from('point_records').insert([{
      nisn: selectedStudent.nisn,
      nama_siswa: selectedStudent.nama_lengkap,
      kelas: selectedStudent.kelas,
      tahun_ajaran_id: activeTa.id,
      semester,
      catalog_id: selectedKatalog?.id || null,
      kode_katalog: selectedKatalog?.kode || null,
      jenis: selectedKatalog?.jenis || keterangan || 'Manual',
      poin_diberikan: poinNum,
      keterangan,
      dicatat_oleh: petugasName,
      tanggal,
    }])
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

    // 4. Reset form
    setSelectedStudent(null)
    setStudentSearch('')
    setStudentPoin(null)
    setSelectedKatalog(null)
    setKatalogSearch('')
    setPoinDiberikan('')
    setKeterangan('')
    setSaving(false)
    fetchRecords()
  }

  // ─── EXPORT LAPORAN ───────────────────────────────────────
  const handleExportLaporan = async () => {
    if (!activeTa?.id) return
    let query = supabase.from('point_records').select('*')
      .eq('tahun_ajaran_id', activeTa.id).eq('semester', semester)
      .gte('tanggal', exportDateFrom).lte('tanggal', exportDateTo)
    if (filterKelas !== 'all') query = query.eq('kelas', filterKelas)
    query = query.order('tanggal').order('created_at')
    const { data: rows } = await query

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Laporan Pelanggaran')
    ws.columns = [
      { header: 'Tanggal', key: 'tanggal', width: 14 },
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
      const r = ws.addRow({ tanggal: row.tanggal, nama_siswa: row.nama_siswa, kelas: row.kelas, kode_katalog: row.kode_katalog || '', jenis: row.jenis, poin_diberikan: row.poin_diberikan, keterangan: row.keterangan || '', dicatat_oleh: row.dicatat_oleh })
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
    saveAs(new Blob([buf]), `laporan-pelanggaran-${today}.xlsx`)
    setShowExportModal(false)
  }

  const handleDeleteRecord = async (rec) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Record Poin?',
      message: `Hapus pencatatan poin "${rec.jenis}" untuk ${rec.nama_siswa}?\nPoin tidak akan dikembalikan otomatis.`,
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('point_records').delete().eq('id', rec.id)
    if (error) alert('Gagal hapus: ' + error.message)
    else fetchRecords()
  }

  return (
    <>
      <div className="animate-slide-up space-y-6">
        {ConfirmModalComponent}

      {/* Header + Semester Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pencatatan Poin</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {activeTa?.nama} — {session?.nama_guru || 'Admin'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Semester:</span>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[1, 2].map(s => (
              <button key={s} onClick={() => setSemester(s)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semester === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                Semester {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alert threshold */}
      {alert && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 relative">
          <p className="font-bold text-red-800 text-sm mb-1">Peringatan Tahap Pembinaan!</p>
          <p className="text-red-700 text-sm whitespace-pre-line">{alert.message}</p>
          <button onClick={() => setAlert(null)} className="absolute top-3 right-3 p-1 text-red-400 hover:text-red-600 rounded-lg">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700 text-sm font-semibold">{successMsg}</div>
      )}

      {/* Form */}
      {!readOnly && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="font-bold text-slate-800 mb-4 text-sm">Form Input Poin</h3>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Tanggal */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal <span className="text-red-500">*</span></label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            {/* Pilih Siswa */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Siswa <span className="text-red-500">*</span></label>
              <div className="relative">
                <input ref={studentSearchRef} type="text" value={studentSearch}
                  onChange={e => { setStudentSearch(e.target.value); if (!e.target.value) { setSelectedStudent(null); setStudentPoin(null) } }}
                  placeholder="Cari nama atau NISN siswa..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                {studentResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {studentResults.map(s => (
                      <button key={s.nisn} type="button" onClick={() => selectStudent(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{s.nama_lengkap}</p>
                          <p className="text-xs text-slate-500">{s.nisn}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{s.kelas}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedStudent && studentPoin !== null && (
                <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${getPoinColor(studentPoin.total_poin)}`}>
                  <span>Poin saat ini: {studentPoin.total_poin}</span>
                </div>
              )}
            </div>

            {/* Pilih dari Katalog */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih dari Katalog Poin</label>
              <div className="relative">
                <input type="text" value={katalogSearch}
                  onChange={e => { setKatalogSearch(e.target.value); if (!e.target.value) { setSelectedKatalog(null); setPoinDiberikan('') } }}
                  placeholder="Cari kode atau jenis pelanggaran/prestasi..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                {katalogResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {katalogResults.map(k => (
                      <button key={k.id} type="button" onClick={() => selectKatalog(k)}
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

            <div className="grid grid-cols-2 gap-3">
              {/* Poin */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Poin <span className="text-red-500">*</span></label>
                <input type="number" value={poinDiberikan} onChange={e => setPoinDiberikan(e.target.value)} required
                  placeholder="-5 atau +10" className={`w-full px-3 py-2 border rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none ${parseInt(poinDiberikan) > 0 ? 'text-emerald-700 border-emerald-200' : parseInt(poinDiberikan) < 0 ? 'text-red-700 border-red-200' : 'border-slate-200'}`} />
              </div>
              {/* Petugas */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Petugas</label>
                <input value={session?.nama_guru || 'Admin'} readOnly className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
              </div>
            </div>

            {/* Keterangan */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Keterangan Tambahan</label>
              <input value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Catatan tambahan (opsional)..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>

            <button type="submit" disabled={saving || !selectedStudent || !poinDiberikan}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Simpan Poin</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Riwayat Harian */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="font-bold text-slate-800 text-sm flex-1">Riwayat Pencatatan</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            <select value={filterKelas} onChange={e => setFilterKelas(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="all">Semua Kelas</option>
              {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
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
                <th className="px-4 py-2.5 text-left">Tanggal</th>
                <th className="px-4 py-2.5 text-left">Siswa</th>
                <th className="px-4 py-2.5 text-left">Kelas</th>
                <th className="px-4 py-2.5 text-left">Jenis</th>
                <th className="px-4 py-2.5 text-center">Poin</th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">Keterangan</th>
                <th className="px-4 py-2.5 text-left hidden lg:table-cell">Petugas</th>
                {!readOnly && <th className="px-4 py-2.5 text-center w-12">Aksi</th>}
              </tr></thead>
              <tbody>
                {records.map((rec, i) => (
                  <tr key={rec.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/80 ${i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{rec.tanggal}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{rec.nama_siswa}</td>
                    <td className="px-4 py-2.5"><span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{rec.kelas}</span></td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {rec.kode_katalog && <span className="font-mono text-[10px] font-bold text-indigo-600 mr-1">[{rec.kode_katalog}]</span>}
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
                        <button onClick={() => handleDeleteRecord(rec)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={3} className="px-4 py-2 text-xs font-bold text-slate-600">{records.length} record</td>
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
    </>
  )
}
