import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import { getSemesterAktif } from '../utils/semesterUtils'

// ─── Icons ───────────────────────────────────────────────────────────────────
const IconPlus = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconDownload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IconUpload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IconEye = ({ on }) => on
  ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>

// ─── NilaiGuruSection ─────────────────────────────────────────────────────────
export default function NilaiGuruSection({ session, activeTa }) {
  // Context selectors
  const [selectedKelas, setSelectedKelas] = useState('')
  const [selectedMapelId, setSelectedMapelId] = useState('')
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  
  // Data
  const [semesters, setSemesters] = useState([])
  const [komponen, setKomponen] = useState([])
  const [students, setStudents] = useState([])
  const [nilaiData, setNilaiData] = useState({}) // { [komponen_id]: { [nisn]: nilai } }
  const [savingCell, setSavingCell] = useState(null)
  
  // Komponen form
  const [showAddKomponen, setShowAddKomponen] = useState(false)
  const [newKomponenNama, setNewKomponenNama] = useState('')
  const [newKomponenBobot, setNewKomponenBobot] = useState('1')
  const [addingKomponen, setAddingKomponen] = useState(false)
  
  // Upload Excel
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const uploadRef = useRef(null)
  
  // Available classes/mapel from session
  const waliKelas = session?.kelas?.filter(k => !activeTa || k.tahun_ajaran_id === activeTa?.id).map(k => k.kelas) || []
  const mapelRaw = session?.guru_mapel_raw?.filter(m => !activeTa || m.tahun_ajaran_id === activeTa?.id) || []
  
  // All unique classes (wali + mapel)
  const allKelas = [...new Set([
    ...waliKelas,
    ...mapelRaw.map(m => m.kelas)
  ])].sort()
  
  // Mapel for selected class
  const mapelsForKelas = mapelRaw
    .filter(m => m.kelas === selectedKelas)
    .reduce((acc, m) => {
      const nama = m.mata_pelajaran?.nama
      const id = m.mata_pelajaran_id
      if (id && nama && !acc.find(x => x.id === id)) acc.push({ id, nama })
      return acc
    }, [])
  
  // Auto-select when only one option
  useEffect(() => {
    if (allKelas.length === 1) setSelectedKelas(allKelas[0])
  }, [])
  
  useEffect(() => {
    if (mapelsForKelas.length === 1) setSelectedMapelId(mapelsForKelas[0].id)
    else setSelectedMapelId('')
  }, [selectedKelas])
  
  // Fetch semesters when TA changes
  useEffect(() => {
    if (!activeTa?.id) return
    fetchSemesters()
  }, [activeTa])
  
  // Auto-select active semester
  useEffect(() => {
    const aktif = getSemesterAktif(semesters)
    if (aktif) setSelectedSemesterId(aktif.id)
    else if (semesters.length > 0) setSelectedSemesterId(semesters[0].id)
  }, [semesters])
  
  // Fetch komponen & siswa when context changes
  useEffect(() => {
    if (selectedKelas && selectedMapelId && selectedSemesterId) {
      fetchKomponen()
      fetchStudents()
    } else {
      setKomponen([])
      setStudents([])
      setNilaiData({})
    }
  }, [selectedKelas, selectedMapelId, selectedSemesterId])
  
  // Fetch nilai when komponen or students change
  useEffect(() => {
    if (komponen.length > 0 && students.length > 0) {
      fetchNilai()
    }
  }, [komponen, students])
  
  const fetchSemesters = async () => {
    const { data } = await supabase.from('semester')
      .select('*')
      .eq('tahun_ajaran_id', activeTa.id)
      .order('nomor')
    setSemesters(data || [])
  }
  
  const fetchKomponen = async () => {
    const { data } = await supabase.from('nilai_komponen')
      .select('*')
      .eq('guru_id', session.id)
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('semester_id', selectedSemesterId)
      .eq('kelas', selectedKelas)
      .eq('mata_pelajaran_id', selectedMapelId)
      .order('urutan')
    setKomponen(data || [])
  }
  
  const fetchStudents = async () => {
    const { data } = await supabase.from('siswa_lengkap')
      .select('nisn, nama_lengkap, kelas')
      .eq('kelas', selectedKelas)
      .eq('is_aktif', true)
      .order('nama_lengkap')
    setStudents(data || [])
  }
  
  const fetchNilai = async () => {
    const komponenIds = komponen.map(k => k.id)
    if (komponenIds.length === 0) return
    
    const { data } = await supabase.from('nilai_siswa')
      .select('*')
      .in('komponen_id', komponenIds)
    
    const map = {}
    ;(data || []).forEach(n => {
      if (!map[n.komponen_id]) map[n.komponen_id] = {}
      map[n.komponen_id][n.siswa_nisn] = n.nilai
    })
    setNilaiData(map)
  }
  
  const handleAddKomponen = async () => {
    if (!newKomponenNama.trim()) return
    setAddingKomponen(true)
    
    const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
    
    const { error } = await supabase.from('nilai_komponen').insert({
      guru_id: session.id,
      tahun_ajaran_id: activeTa.id,
      semester_id: selectedSemesterId,
      kelas: selectedKelas,
      mata_pelajaran_id: selectedMapelId,
      nama: newKomponenNama.trim(),
      bobot: parseFloat(newKomponenBobot) || 1,
      urutan: maxUrutan
    })
    
    setAddingKomponen(false)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      setNewKomponenNama('')
      setNewKomponenBobot('1')
      setShowAddKomponen(false)
      fetchKomponen()
    }
  }
  
  const handleDeleteKomponen = async (id) => {
    if (!window.confirm('Hapus komponen ini? Semua nilai dalam komponen ini juga akan terhapus.')) return
    const { error } = await supabase.from('nilai_komponen').delete().eq('id', id)
    if (error) alert('Gagal: ' + error.message)
    else fetchKomponen()
  }
  
  const handleToggleVisible = async (komp) => {
    const { error } = await supabase.from('nilai_komponen')
      .update({ is_nilai_visible: !komp.is_nilai_visible })
      .eq('id', komp.id)
    if (error) alert('Gagal: ' + error.message)
    else setKomponen(prev => prev.map(k => k.id === komp.id ? { ...k, is_nilai_visible: !k.is_nilai_visible } : k))
  }
  
  const handleNilaiChange = async (komponenId, nisn, nilai) => {
    const cellKey = `${komponenId}-${nisn}`
    setSavingCell(cellKey)
    
    // Update local state immediately
    setNilaiData(prev => ({
      ...prev,
      [komponenId]: { ...prev[komponenId], [nisn]: nilai === '' ? null : Number(nilai) }
    }))
    
    const payload = {
      komponen_id: komponenId,
      siswa_nisn: nisn,
      nilai: nilai === '' ? null : Number(nilai),
      diinput_oleh: session.id,
      updated_at: new Date().toISOString()
    }
    
    await supabase.from('nilai_siswa').upsert(payload, { onConflict: 'komponen_id,siswa_nisn' })
    setSavingCell(null)
  }
  
  // ─── Hitung Rata-rata ────────────────────────────────────────────────────────
  const hitungRataRata = (nisn) => {
    let totalBobot = 0
    let totalNilaiBobot = 0
    let hasAnyValue = false
    
    komponen.forEach(k => {
      const val = nilaiData[k.id]?.[nisn]
      if (val !== undefined && val !== null && val !== '') {
        totalNilaiBobot += Number(val) * (k.bobot || 1)
        totalBobot += (k.bobot || 1)
        hasAnyValue = true
      }
    })
    
    if (!hasAnyValue || totalBobot === 0) return null
    return (totalNilaiBobot / totalBobot).toFixed(1)
  }
  
  // ─── Export Excel ────────────────────────────────────────────────────────────
  const handleDownloadExcel = () => {
    const selectedSemester = semesters.find(s => s.id === selectedSemesterId)
    const mapelNama = mapelsForKelas.find(m => m.id === selectedMapelId)?.nama || 'Mapel'
    
    const headers = ['NISN', 'Nama Siswa', ...komponen.map(k => k.nama)]
    const rows = students.map(s => {
      const row = [s.nisn, s.nama_lengkap]
      komponen.forEach(k => {
        const val = nilaiData[k.id]?.[s.nisn]
        row.push(val !== undefined && val !== null ? val : '')
      })
      return row
    })
    
    const sheetData = [headers, ...rows]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    
    // Style header row width
    ws['!cols'] = [
      { wch: 14 }, // NISN
      { wch: 30 }, // Nama
      ...komponen.map(() => ({ wch: 10 }))
    ]
    
    const sheetName = `Nilai ${selectedKelas} Sem${selectedSemester?.nomor || '?'}`
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31))
    
    const fileName = `Nilai_${selectedKelas}_${mapelNama}_Semester${selectedSemester?.nomor}_${activeTa?.nama?.replace('/', '-')}.xlsx`
    XLSX.writeFile(wb, fileName)
  }
  
  // ─── Import Excel ────────────────────────────────────────────────────────────
  const handleUploadExcel = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploadResult(null)
    setUploadProgress({ status: 'reading' })
    
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      
      if (!raw || raw.length < 2) {
        setUploadResult({ error: 'File Excel kosong atau tidak valid.' })
        setUploadProgress(null)
        return
      }
      
      const headerRow = raw[0].map(h => String(h).trim())
      const nisnIdx = headerRow.findIndex(h => h.toLowerCase() === 'nisn')
      
      if (nisnIdx === -1) {
        setUploadResult({ error: 'Kolom NISN tidak ditemukan di baris pertama.' })
        setUploadProgress(null)
        return
      }
      
      // Match komponen columns to header
      const komponenCols = komponen.map(k => ({
        komponen: k,
        colIdx: headerRow.findIndex(h => h === k.nama)
      })).filter(c => c.colIdx !== -1)
      
      if (komponenCols.length === 0) {
        setUploadResult({ error: 'Tidak ada kolom komponen nilai yang cocok. Pastikan nama kolom sesuai.' })
        setUploadProgress(null)
        return
      }
      
      const studentMap = Object.fromEntries(students.map(s => [String(s.nisn).trim(), s]))
      
      let success = 0, failed = 0, skipped = 0
      const upserts = []
      
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i]
        const nisn = String(row[nisnIdx] || '').trim()
        if (!nisn) continue
        
        if (!studentMap[nisn]) { skipped++; continue }
        
        komponenCols.forEach(({ komponen: k, colIdx }) => {
          const rawVal = row[colIdx]
          const val = rawVal === '' ? null : Number(rawVal)
          if (rawVal !== '' && isNaN(val)) { failed++; return }
          
          upserts.push({
            komponen_id: k.id,
            siswa_nisn: nisn,
            nilai: val,
            diinput_oleh: session.id,
            updated_at: new Date().toISOString()
          })
        })
      }
      
      setUploadProgress({ status: 'saving', total: upserts.length })
      
      // Batch upsert in chunks of 100
      for (let i = 0; i < upserts.length; i += 100) {
        const chunk = upserts.slice(i, i + 100)
        const { error } = await supabase.from('nilai_siswa')
          .upsert(chunk, { onConflict: 'komponen_id,siswa_nisn' })
        if (error) failed += chunk.length
        else success += chunk.length
        setUploadProgress({ status: 'saving', done: i + chunk.length, total: upserts.length })
      }
      
      setUploadResult({ success, failed, skipped })
      fetchNilai()
    } catch (err) {
      setUploadResult({ error: err.message })
    }
    
    setUploadProgress(null)
    if (uploadRef.current) uploadRef.current.value = ''
  }
  
  const contextReady = selectedKelas && selectedMapelId && selectedSemesterId
  const selectedMapelNama = mapelsForKelas.find(m => m.id === selectedMapelId)?.nama || ''
  const selectedSemesterObj = semesters.find(s => s.id === selectedSemesterId)
  
  return (
    <div className="animate-slide-up flex flex-col h-full">
      <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadExcel} />
      
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-900">Input Nilai</h2>
        <p className="text-slate-500 text-sm mt-1">Kelola komponen nilai dan input nilai siswa per mata pelajaran & semester.</p>
      </div>
      
      {/* Context Selectors */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Kelas</label>
            <select value={selectedKelas} onChange={e => setSelectedKelas(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">-- Pilih Kelas --</option>
              {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Mata Pelajaran</label>
            <select value={selectedMapelId} onChange={e => setSelectedMapelId(e.target.value)}
              disabled={!selectedKelas}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
              <option value="">-- Pilih Mapel --</option>
              {mapelsForKelas.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Semester</label>
            <select value={selectedSemesterId} onChange={e => setSelectedSemesterId(e.target.value)}
              disabled={semesters.length === 0}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
              <option value="">-- Pilih Semester --</option>
              {semesters.map(s => (
                <option key={s.id} value={s.id}>
                  Semester {s.nomor} ({s.tanggal_mulai?.slice(0,7)} s.d. {s.tanggal_selesai?.slice(0,7)})
                </option>
              ))}
            </select>
            {semesters.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠ Belum ada semester. Minta Admin untuk mengatur semester terlebih dahulu.</p>
            )}
          </div>
        </div>
        
        {contextReady && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500">Konteks Aktif:</span>
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100">{selectedKelas}</span>
            <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-100">{selectedMapelNama}</span>
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">Semester {selectedSemesterObj?.nomor}</span>
            <span className="text-xs text-slate-400 ml-1">{students.length} siswa</span>
          </div>
        )}
      </div>
      
      {!contextReady ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl p-12">
          <svg className="w-12 h-12 mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
          <p className="font-semibold text-slate-500">Pilih Kelas, Mata Pelajaran, dan Semester</p>
          <p className="text-sm text-slate-400 mt-1">untuk mulai mengelola nilai siswa</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          
          {/* Komponen Nilai Manager */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <p className="text-sm font-bold text-slate-800">Komponen Nilai</p>
                <p className="text-xs text-slate-500 mt-0.5">Tambah/hapus komponen nilai untuk mapel ini</p>
              </div>
              <button onClick={() => setShowAddKomponen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                <IconPlus /> Tambah Komponen
              </button>
            </div>
            
            {showAddKomponen && (
              <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100 flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Komponen</label>
                  <input value={newKomponenNama} onChange={e => setNewKomponenNama(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddKomponen()}
                    placeholder="Cth: TP1, PH, PTS, Tugas Harian..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Bobot</label>
                  <input type="number" value={newKomponenBobot} onChange={e => setNewKomponenBobot(e.target.value)}
                    min="0.1" step="0.1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleAddKomponen} disabled={addingKomponen || !newKomponenNama.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg disabled:opacity-50">
                    {addingKomponen ? '...' : 'Simpan'}
                  </button>
                  <button onClick={() => { setShowAddKomponen(false); setNewKomponenNama(''); setNewKomponenBobot('1') }}
                    className="px-3 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-medium rounded-lg">
                    Batal
                  </button>
                </div>
              </div>
            )}
            
            {komponen.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">
                Belum ada komponen nilai. Klik "Tambah Komponen" untuk memulai.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {komponen.map((k, idx) => (
                  <div key={k.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <div className="flex-1">
                      <span className="font-semibold text-slate-800 text-sm">{k.nama}</span>
                      <span className="text-xs text-slate-400 ml-2">bobot: {k.bobot}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleVisible(k)}
                        title={k.is_nilai_visible ? 'Nilai terlihat siswa — klik untuk sembunyikan' : 'Nilai disembunyikan dari siswa — klik untuk tampilkan'}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                          k.is_nilai_visible
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <IconEye on={k.is_nilai_visible} />
                        {k.is_nilai_visible ? 'Terlihat Siswa' : 'Disembunyikan'}
                      </button>
                      <button onClick={() => handleDeleteKomponen(k.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Action Buttons: Excel */}
          {komponen.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleDownloadExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                <IconDownload /> Download Template Excel
              </button>
              <button onClick={() => uploadRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors shadow-sm">
                <IconUpload /> Upload Excel
              </button>
              
              {uploadProgress && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                  {uploadProgress.status === 'reading' ? 'Membaca file...' : `Menyimpan ${uploadProgress.done || 0}/${uploadProgress.total}...`}
                </div>
              )}
              
              {uploadResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${uploadResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  {uploadResult.error
                    ? `❌ ${uploadResult.error}`
                    : `✅ Berhasil: ${uploadResult.success} | Gagal: ${uploadResult.failed} | Dilewati: ${uploadResult.skipped}`
                  }
                  <button onClick={() => setUploadResult(null)} className="ml-1 opacity-60 hover:opacity-100">✕</button>
                </div>
              )}
            </div>
          )}
          
          {/* Tabel Nilai */}
          {komponen.length > 0 && students.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <p className="text-sm font-bold text-slate-800">Tabel Nilai — {selectedKelas} | {selectedMapelNama} | Semester {selectedSemesterObj?.nomor}</p>
                <p className="text-xs text-slate-500 mt-0.5">Klik nilai untuk mengedit langsung. Auto-save setelah selesai mengetik.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                      <th className="text-center px-3 py-2.5 w-10">No</th>
                      <th className="text-left px-3 py-2.5 min-w-[180px]">Nama Siswa</th>
                      <th className="text-left px-2 py-2.5 w-28 font-mono text-[9px]">NISN</th>
                      {komponen.map(k => (
                        <th key={k.id} className="text-center px-2 py-2.5 min-w-[70px]">
                          <div>{k.nama}</div>
                          <div className="text-[9px] text-slate-400 font-normal">bobot:{k.bobot}</div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-2.5 min-w-[70px] bg-indigo-50/50 border-l border-indigo-100">
                        Rata-rata
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((s, idx) => {
                      const rataRata = hitungRataRata(s.nisn)
                      const rataColor = rataRata === null ? 'text-slate-300' : Number(rataRata) >= 75 ? 'text-emerald-700' : Number(rataRata) >= 60 ? 'text-amber-600' : 'text-red-600'
                      
                      return (
                        <tr key={s.nisn} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="text-center px-3 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{s.nama_lengkap}</td>
                          <td className="px-2 py-2 text-slate-400 font-mono text-[10px]">{s.nisn}</td>
                          {komponen.map(k => {
                            const cellKey = `${k.id}-${s.nisn}`
                            const val = nilaiData[k.id]?.[s.nisn]
                            const isSaving = savingCell === cellKey
                            
                            return (
                              <td key={k.id} className="text-center px-1 py-1">
                                <div className="relative">
                                  <input
                                    type="number"
                                    min="0" max="100" step="1"
                                    defaultValue={val !== undefined && val !== null ? val : ''}
                                    key={`${cellKey}-${val}`}
                                    onBlur={e => {
                                      const newVal = e.target.value
                                      const oldVal = val !== undefined && val !== null ? String(val) : ''
                                      if (newVal !== oldVal) {
                                        handleNilaiChange(k.id, s.nisn, newVal)
                                      }
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') e.target.blur()
                                    }}
                                    className="w-16 text-center text-xs font-bold px-1 py-1.5 border border-transparent rounded-lg bg-transparent hover:border-indigo-300 hover:bg-indigo-50 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                    placeholder="—"
                                  />
                                  {isSaving && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400 animate-pulse"/>
                                  )}
                                </div>
                              </td>
                            )
                          })}
                          <td className={`text-center px-3 py-2 font-black text-sm border-l border-indigo-100 bg-indigo-50/30 ${rataColor}`}>
                            {rataRata !== null ? rataRata : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
        </div>
      )}
    </div>
  )
}
