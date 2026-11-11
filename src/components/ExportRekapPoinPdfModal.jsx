import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { generateOfficialRekapPoinPDF } from '../utils/rekapPoinPdfExporter'

// Helper mengambil semua baris point_records tanpa terpotong limit 1000
const fetchAllPointRecords = async (queryBuilder, pageSize = 1000) => {
  let allRows = []
  let from = 0
  while (true) {
    const { data, error } = await queryBuilder(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export default function ExportRekapPoinPdfModal({
  isOpen,
  onClose,
  allStudents = [],
  allClasses = [],
  activeTa = null,
  session = null,
  initialKelas = 'all',
  preselectedStudent = null
}) {
  // 1. Cakupan Kelas & Siswa
  const [kelasScope, setKelasScope] = useState('all') // 'all' | 'selected' | 'single_student'
  const [selectedClasses, setSelectedClasses] = useState([])
  const [studentCondition, setStudentCondition] = useState('semua_siswa')
  // 'semua_siswa' | 'punya_catatan' | 'poin_diatas_100' | 'poin_dibawah_100'
  const [pageBreakPerClass, setPageBreakPerClass] = useState(false)

  // 2. Jenis Isi & Filter Poin
  const [reportMode, setReportMode] = useState('total_only') // 'total_only' | 'detailed'
  const [pointTypeFilter, setPointTypeFilter] = useState('semua') // 'semua' | 'positif' | 'negatif'

  // 3. Urutan Data dari Atas ke Bawah
  const [sortBy, setSortBy] = useState('absen_per_kelas')
  // 'absen_per_kelas' | 'absen_global' | 'poin_desc' | 'poin_asc' | 'positif_desc' | 'negatif_desc'
  const [sortWithinClass, setSortWithinClass] = useState(false)

  // 4. Filter Periode Tanggal Catatan Poin
  const [periodeMode, setPeriodeMode] = useState('tahun_ajaran') // 'tahun_ajaran' | 'semester_1' | 'semester_2' | 'custom'
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10))

  // 5. Pengaturan Dokumen Resmi & Pengesahan
  const [orientation, setOrientation] = useState('portrait')
  const [showOfficialSettings, setShowOfficialSettings] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [nomorDokumen, setNomorDokumen] = useState(() => {
    const now = new Date()
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    return `RKP-POIN/SMP-BM/${roman[now.getMonth()]}/${now.getFullYear()}`
  })
  const [showSignature, setShowSignature] = useState(true)
  const [kotaSurat, setKotaSurat] = useState('Jakarta')
  const [tanggalSurat, setTanggalSurat] = useState(() => new Date().toISOString().slice(0, 10))
  const [leftSignerTitle, setLeftSignerTitle] = useState('Kepala SMP Budi Mulia Jakarta')
  const [leftSignerName, setLeftSignerName] = useState('Septian Ruswadi, S.Pd.')
  const [leftSignerNip, setLeftSignerNip] = useState('')
  const [rightSignerTitle, setRightSignerTitle] = useState('Koordinator BK / Kesiswaan')
  const [rightSignerName, setRightSignerName] = useState(
    session?.nama_guru && session.nama_guru !== 'Admin' ? session.nama_guru : ''
  )
  const [rightSignerNip, setRightSignerNip] = useState('')

  // State Data Transaksi Poin Lengkap dari DB
  const [allRecords, setAllRecords] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [exportingAction, setExportingAction] = useState(null) // 'download' | 'print' | null

  // Sinkronisasi state awal saat modal dibuka
  useEffect(() => {
    if (!isOpen) return
    if (preselectedStudent) {
      setKelasScope('single_student')
      setReportMode('detailed')
      setStudentCondition('semua_siswa')
    } else if (initialKelas && initialKelas !== 'all') {
      setKelasScope('selected')
      setSelectedClasses([initialKelas])
    } else {
      setKelasScope('all')
      setSelectedClasses([])
    }
    if (session?.nama_guru && session.nama_guru !== 'Admin' && !rightSignerName) {
      setRightSignerName(session.nama_guru)
    }
  }, [isOpen, initialKelas, preselectedStudent, session])

  // Ambil seluruh point_records untuk Tahun Ajaran aktif saat modal dibuka
  useEffect(() => {
    if (!isOpen || !activeTa?.id) return
    let isMounted = true
    const loadRecords = async () => {
      setLoadingRecords(true)
      try {
        const rows = await fetchAllPointRecords((from, to) =>
          supabase
            .from('point_records')
            .select('id, nisn, nama_siswa, kelas, kode_katalog, jenis, poin_diberikan, keterangan, dicatat_oleh, tanggal, semester, created_at')
            .eq('tahun_ajaran_id', activeTa.id)
            .order('tanggal', { ascending: true })
            .order('created_at', { ascending: true })
            .range(from, to)
        )
        if (isMounted) setAllRecords(rows || [])
      } catch (err) {
        console.error('Gagal memuat rincian poin untuk ekspor PDF:', err)
      } finally {
        if (isMounted) setLoadingRecords(false)
      }
    }
    loadRecords()
    return () => {
      isMounted = false
    }
  }, [isOpen, activeTa?.id])

  // Olah data siswa & catatan poin sesuai seluruh filter yang dipilih
  const processedData = useMemo(() => {
    // 1. Filter catatan poin berdasarkan periode & jenis poin (semua / positif / negatif)
    const filteredRecsByNisn = {}
    const statsByNisn = {}

    allRecords.forEach((r) => {
      // Cek periode
      if (periodeMode === 'semester_1' && Number(r.semester) !== 1) return
      if (periodeMode === 'semester_2' && Number(r.semester) !== 2) return
      if (periodeMode === 'custom') {
        const tgl = String(r.tanggal || '').slice(0, 10)
        if (customStartDate && tgl < customStartDate) return
        if (customEndDate && tgl > customEndDate) return
      }

      const pVal = Number(r.poin_diberikan || 0)
      if (!statsByNisn[r.nisn]) {
        statsByNisn[r.nisn] = { posPoin: 0, posCount: 0, negPoin: 0, negCount: 0 }
      }
      if (pVal >= 0) {
        statsByNisn[r.nisn].posPoin += pVal
        statsByNisn[r.nisn].posCount += 1
      } else {
        statsByNisn[r.nisn].negPoin += Math.abs(pVal)
        statsByNisn[r.nisn].negCount += 1
      }

      // Filter untuk daftar rincian berdasarkan pointTypeFilter
      if (pointTypeFilter === 'positif' && pVal < 0) return
      if (pointTypeFilter === 'negatif' && pVal >= 0) return

      if (!filteredRecsByNisn[r.nisn]) filteredRecsByNisn[r.nisn] = []
      filteredRecsByNisn[r.nisn].push(r)
    })

    // 2. Pilih daftar siswa sesuai cakupan kelas
    let baseStudents = allStudents
    if (kelasScope === 'single_student' && preselectedStudent) {
      baseStudents = allStudents.filter((s) => s.nisn === preselectedStudent.nisn)
      if (baseStudents.length === 0) baseStudents = [preselectedStudent]
    } else if (kelasScope === 'selected' && selectedClasses.length > 0) {
      baseStudents = allStudents.filter((s) => selectedClasses.includes(s.kelas))
    }

    // 3. Perkaya objek siswa dengan statistik yang sudah terfilter
    let enriched = baseStudents.map((s) => {
      const st = statsByNisn[s.nisn] || {
        posPoin: Number(s.prestasiPoin || 0),
        posCount: Number(s.prestasiCount || 0),
        negPoin: Number(s.pelanggaranPoin || 0),
        negCount: Number(s.pelanggaranCount || 0)
      }
      const poinAwal = Number(s.poin_default ?? 100)
      const computedTotal =
        allRecords.length > 0 ? poinAwal + st.posPoin - st.negPoin : Number(s.total_poin ?? 100)

      return {
        ...s,
        poin_default: poinAwal,
        total_poin: computedTotal,
        filteredPosPoin: pointTypeFilter === 'negatif' ? 0 : st.posPoin,
        filteredPosCount: pointTypeFilter === 'negatif' ? 0 : st.posCount,
        filteredNegPoin: pointTypeFilter === 'positif' ? 0 : st.negPoin,
        filteredNegCount: pointTypeFilter === 'positif' ? 0 : st.negCount,
        rawPosPoin: st.posPoin,
        rawNegPoin: st.negPoin
      }
    })

    // 4. Filter kriteria kondisi siswa
    if (kelasScope !== 'single_student') {
      enriched = enriched.filter((s) => {
        if (studentCondition === 'punya_catatan') {
          if (pointTypeFilter === 'positif') return s.filteredPosCount > 0
          if (pointTypeFilter === 'negatif') return s.filteredNegCount > 0
          return s.filteredPosCount > 0 || s.filteredNegCount > 0
        }
        if (studentCondition === 'poin_diatas_100') {
          return s.total_poin > 100
        }
        if (studentCondition === 'poin_dibawah_100') {
          return s.total_poin < 100
        }
        // Jika filter jenis poin hanya positif/negatif tetapi kondisi masih 'semua_siswa',
        // tetap tampilkan semua siswa sesuai pilihan user
        return true
      })
    }

    // 5. Pengurutan Data (Sorting)
    const compareMetric = (a, b) => {
      if (sortBy === 'poin_desc') {
        if (b.total_poin !== a.total_poin) return b.total_poin - a.total_poin
      } else if (sortBy === 'poin_asc') {
        if (a.total_poin !== b.total_poin) return a.total_poin - b.total_poin
      } else if (sortBy === 'positif_desc') {
        if (b.rawPosPoin !== a.rawPosPoin) return b.rawPosPoin - a.rawPosPoin
        if (b.total_poin !== a.total_poin) return b.total_poin - a.total_poin
      } else if (sortBy === 'negatif_desc') {
        if (b.rawNegPoin !== a.rawNegPoin) return b.rawNegPoin - a.rawNegPoin
        if (a.total_poin !== b.total_poin) return a.total_poin - b.total_poin
      } else if (sortBy === 'absen_global') {
        return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''), 'id')
      }
      // Tie-breaker: Kelas lalu Nama A-Z
      if (a.kelas !== b.kelas) return String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id')
      return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''), 'id')
    }

    const sorted = [...enriched].sort((a, b) => {
      if (sortBy === 'absen_per_kelas') {
        if (a.kelas !== b.kelas) return String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id')
        return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''), 'id')
      }
      // Jika user memilih urutkan poin di dalam masing-masing kelas (atau pisah halaman per kelas aktif)
      if ((sortWithinClass || pageBreakPerClass) && sortBy !== 'absen_global') {
        if (a.kelas !== b.kelas) return String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id')
      }
      return compareMetric(a, b)
    })

    return {
      students: sorted,
      recordsByNisn: filteredRecsByNisn
    }
  }, [
    allStudents,
    allRecords,
    kelasScope,
    selectedClasses,
    preselectedStudent,
    studentCondition,
    pointTypeFilter,
    sortBy,
    sortWithinClass,
    pageBreakPerClass,
    periodeMode,
    customStartDate,
    customEndDate
  ])

  if (!isOpen || typeof document === 'undefined') return null

  const toggleClassSelection = (k) => {
    setSelectedClasses((prev) =>
      prev.includes(k) ? prev.filter((item) => item !== k) : [...prev, k].sort()
    )
  }

  const getPeriodeLabel = () => {
    if (periodeMode === 'semester_1') return 'Semester 1 (Ganjil)'
    if (periodeMode === 'semester_2') return 'Semester 2 (Genap)'
    if (periodeMode === 'custom') return `Periode ${customStartDate} s.d. ${customEndDate}`
    return 'Full Tahun Ajaran'
  }

  const handleExportPdf = async (action = 'download') => {
    if (kelasScope === 'selected' && selectedClasses.length === 0) {
      alert('Pilih minimal 1 kelas terlebih dahulu, atau pilih opsi "Seluruh Siswa (Semua Kelas)".')
      return
    }
    setExportingAction(action)
    try {
      await generateOfficialRekapPoinPDF({
        students: processedData.students,
        recordsByNisn: processedData.recordsByNisn,
        activeTa,
        config: {
          action, // 'download' atau 'print'
          kelasScope: kelasScope === 'single_student' ? 'selected' : kelasScope,
          selectedClasses:
            kelasScope === 'single_student' && preselectedStudent
              ? [`${preselectedStudent.kelas} - ${preselectedStudent.nama_lengkap}`]
              : selectedClasses,
          reportMode,
          pointTypeFilter,
          sortBy,
          pageBreakPerClass: kelasScope !== 'single_student' && pageBreakPerClass,
          orientation,
          customTitle: customTitle.trim(),
          nomorDokumen: nomorDokumen.trim(),
          periodeLabel: getPeriodeLabel(),
          showSignature,
          kotaSurat: kotaSurat.trim() || 'Jakarta',
          tanggalSurat,
          leftSignerTitle: leftSignerTitle.trim(),
          leftSignerName: leftSignerName.trim(),
          leftSignerNip: leftSignerNip.trim(),
          rightSignerTitle: rightSignerTitle.trim(),
          rightSignerName: rightSignerName.trim(),
          rightSignerNip: rightSignerNip.trim(),
          customFilename:
            kelasScope === 'single_student' && preselectedStudent
              ? `Laporan-Poin-${preselectedStudent.nama_lengkap.replace(/\s+/g, '-')}-${preselectedStudent.kelas}.pdf`
              : undefined
        }
      })
      onClose()
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Gagal memproses dokumen PDF: ' + (err.message || err))
    } finally {
      setExportingAction(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] w-screen h-screen flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex items-center justify-center shrink-0 shadow-inner">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                Ekspor Laporan Rekap Poin Resmi (PDF)
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Dokumen resmi ber-Kop Surat SMP Budi Mulia dengan filter kelas, rincian poin, dan urutan kustom
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body Modal Scrollable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {/* 1. CAKUPAN SISWA & FILTER KELAS */}
          <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">1</span>
                <span>Cakupan Siswa &amp; Filter Kelas</span>
              </label>
              {kelasScope !== 'single_student' && (
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                  {processedData.students.length} Siswa Terpilih
                </span>
              )}
            </div>

            {preselectedStudent && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setKelasScope('single_student')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    kelasScope === 'single_student'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  👤 Khusus Siswa Ini: {preselectedStudent.nama_lengkap} ({preselectedStudent.kelas})
                </button>
                <button
                  type="button"
                  onClick={() => setKelasScope('all')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    kelasScope !== 'single_student'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  🏫 Pilih Kelas / Seluruh Siswa
                </button>
              </div>
            )}

            {kelasScope !== 'single_student' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setKelasScope('all')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      kelasScope === 'all'
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">🏫 Seluruh Siswa (Semua Kelas)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Ekspor seluruh kelas ({allClasses.length} kelas)</p>
                    </div>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${kelasScope === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                      {kelasScope === 'all' && <span className="text-[9px]">✓</span>}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setKelasScope('selected')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      kelasScope === 'selected'
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">🎯 Pilih Kelas Tertentu</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Pilih 1 atau beberapa kelas spesifik</p>
                    </div>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${kelasScope === 'selected' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                      {kelasScope === 'selected' && <span className="text-[9px]">✓</span>}
                    </span>
                  </button>
                </div>

                {kelasScope === 'selected' && (
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600">Klik kelas yang ingin diekspor:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedClasses([...allClasses])}
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Pilih Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedClasses([])}
                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allClasses.map((k) => {
                        const active = selectedClasses.includes(k)
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleClassSelection(k)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300'
                            }`}
                          >
                            Kelas {k}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Filter Kondisi Siswa & Opsi Pisah Halaman Per Kelas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Filter Kriteria Siswa:</label>
                    <select
                      value={studentCondition}
                      onChange={(e) => setStudentCondition(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="semua_siswa">Seluruh Siswa (Termasuk Poin Utuh 100)</option>
                      <option value="punya_catatan">Hanya Siswa yang Memiliki Catatan Poin</option>
                      <option value="poin_diatas_100">Hanya Siswa Berprestasi (Total Poin &gt; 100)</option>
                      <option value="poin_dibawah_100">Hanya Siswa Perlu Pembinaan (Total Poin &lt; 100)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl w-full cursor-pointer hover:border-indigo-300 transition-colors">
                      <input
                        type="checkbox"
                        checked={pageBreakPerClass}
                        onChange={(e) => setPageBreakPerClass(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">
                        Pisahkan halaman baru per kelas
                      </span>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. FORMAT ISI LAPORAN (TOTAL SAJA VS RINCIAN POIN) */}
          <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <label className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">2</span>
              <span>Kedalaman Isi Laporan (Total Saja vs Rincian Poin)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setReportMode('total_only')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                  reportMode === 'total_only'
                    ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900">📊 Rekapitulasi Total Poin Saja</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Tabel ringkas berisi NISN, Nama, Kelas, Poin Awal, Total Poin Positif (+), Negatif (-), Total Akhir, &amp; Status.
                  </p>
                </div>
                <span className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${reportMode === 'total_only' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                  {reportMode === 'total_only' && <span className="text-[9px]">✓</span>}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setReportMode('detailed')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                  reportMode === 'detailed'
                    ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900">📋 Dirincikan Poin-Poin yang Didapatkan</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Menampilkan total poin setiap siswa disertai daftar lengkap tanggal, kegiatan/pelanggaran, &amp; skor poinnya.
                  </p>
                </div>
                <span className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${reportMode === 'detailed' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                  {reportMode === 'detailed' && <span className="text-[9px]">✓</span>}
                </span>
              </button>
            </div>
          </div>

          {/* 3. FILTER KATEGORI POIN (SEMUA / POSITIF SAJA / NEGATIF SAJA) */}
          <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <label className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">3</span>
              <span>Filter Jenis Poin yang Ditampilkan</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'semua',
                  title: '⚖️ Semua Poin (+ & -)',
                  desc: 'Gabungan poin positif, negatif, & total akhir',
                  activeClass: 'border-indigo-600 bg-indigo-50/80 text-indigo-950 ring-2 ring-indigo-500/20'
                },
                {
                  id: 'positif',
                  title: '🌟 Hanya Poin Positif (+)',
                  desc: 'Khusus prestasi, apresiasi & kebaikan siswa',
                  activeClass: 'border-emerald-600 bg-emerald-50/80 text-emerald-950 ring-2 ring-emerald-500/20'
                },
                {
                  id: 'negatif',
                  title: '⚠️ Hanya Poin Negatif (-)',
                  desc: 'Khusus pelanggaran & pembinaan kedisiplinan',
                  activeClass: 'border-rose-600 bg-rose-50/80 text-rose-950 ring-2 ring-rose-500/20'
                }
              ].map((item) => {
                const active = pointTypeFilter === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPointTypeFilter(item.id)
                      if (item.id === 'positif' && sortBy === 'negatif_desc') setSortBy('positif_desc')
                      if (item.id === 'negatif' && sortBy === 'positif_desc') setSortBy('negatif_desc')
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active ? item.activeClass : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-extrabold">{item.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 4. URUTAN DATA SISWA DARI ATAS KE BAWAH & PERIODE */}
          <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <label className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">4</span>
              <span>Urutan Daftar Siswa (Dari Paling Atas) &amp; Periode</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Urutkan Baris Siswa Berdasarkan:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="absen_per_kelas">📋 Sesuai Urutan Absen Kelas (Kelas &amp; Nama A → Z)</option>
                  <option value="poin_desc">🏆 Total Poin Paling Tinggi ke Rendah (Tertinggi di Atas)</option>
                  <option value="poin_asc">🚨 Total Poin Paling Rendah ke Tinggi (Terendah di Atas)</option>
                  <option value="positif_desc">🌟 Poin Positif (+) Paling Banyak ke Rendah</option>
                  <option value="negatif_desc">⚠️ Poin Pelanggaran (-) Paling Banyak ke Rendah</option>
                  <option value="absen_global">🔤 Abjad Nama Seluruh Siswa Lintas Kelas (A → Z)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Periode Rekapitulasi Poin:</label>
                <select
                  value={periodeMode}
                  onChange={(e) => setPeriodeMode(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="tahun_ajaran">Full Tahun Ajaran ({activeTa?.nama || 'Aktif'})</option>
                  <option value="semester_1">Semester 1 (Ganjil)</option>
                  <option value="semester_2">Semester 2 (Genap)</option>
                  <option value="custom">Rentang Tanggal Tertentu</option>
                </select>
              </div>
            </div>

            {/* Opsi Urut Poin di dalam Kelas vs Lintas Kelas */}
            {['poin_desc', 'poin_asc', 'positif_desc', 'negatif_desc'].includes(sortBy) && (
              <div className="pt-1">
                <label className="flex items-center gap-2.5 p-2.5 bg-white border border-indigo-100 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sortWithinClass}
                    onChange={(e) => setSortWithinClass(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Kelompokkan per kelas terlebih dahulu, lalu urutkan peringkat poin di dalam masing-masing kelas
                  </span>
                </label>
              </div>
            )}

            {periodeMode === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-fade-in">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Dari Tanggal:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Sampai Tanggal:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. PENGATURAN DOKUMEN RESMI, ORIENTASI & TANDA TANGAN PENGESAHAN */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-black">5</span>
                <span>Format Kertas &amp; Pengesahan Tanda Tangan Resmi</span>
              </label>
              <button
                type="button"
                onClick={() => setShowOfficialSettings((v) => !v)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {showOfficialSettings ? 'Sembunyikan Detail ▲' : 'Atur Nama Penandatangan & Nomor Surat ▼'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Orientasi Kertas A4:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrientation('portrait')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                      orientation === 'portrait'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    📄 Portrait (Tegak)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('landscape')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                      orientation === 'landscape'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    🖼️ Landscape (Lebar)
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl w-full cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSignature}
                    onChange={(e) => setShowSignature(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    Sertakan Blok Tanda Tangan Kepala Sekolah &amp; BK
                  </span>
                </label>
              </div>
            </div>

            {showOfficialSettings && (
              <div className="pt-3 border-t border-slate-200 space-y-3 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Judul Dokumen Kustom (Opsional):</label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Otomatis mengikuti filter poin..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Nomor Dokumen / Surat:</label>
                    <input
                      type="text"
                      value={nomorDokumen}
                      onChange={(e) => setNomorDokumen(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                {showSignature && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
                    <div className="space-y-2">
                      <p className="text-[11px] font-extrabold text-indigo-900 uppercase">Penandatangan Kiri (Mengetahui)</p>
                      <input
                        type="text"
                        value={leftSignerTitle}
                        onChange={(e) => setLeftSignerTitle(e.target.value)}
                        placeholder="Jabatan (mis: Kepala SMP Budi Mulia Jakarta)"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                      />
                      <input
                        type="text"
                        value={leftSignerName}
                        onChange={(e) => setLeftSignerName(e.target.value)}
                        placeholder="Nama Lengkap & Gelar"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                      />
                      <input
                        type="text"
                        value={leftSignerNip}
                        onChange={(e) => setLeftSignerNip(e.target.value)}
                        placeholder="NIP / NIK (Opsional)"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-extrabold text-indigo-900 uppercase">Penandatangan Kanan (Penyusun)</p>
                      <input
                        type="text"
                        value={rightSignerTitle}
                        onChange={(e) => setRightSignerTitle(e.target.value)}
                        placeholder="Jabatan (mis: Koordinator BK / Wali Kelas)"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                      />
                      <input
                        type="text"
                        value={rightSignerName}
                        onChange={(e) => setRightSignerName(e.target.value)}
                        placeholder="Nama Guru BK / Kesiswaan / Wali Kelas"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={kotaSurat}
                          onChange={(e) => setKotaSurat(e.target.value)}
                          placeholder="Kota (Jakarta)"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                        <input
                          type="date"
                          value={tanggalSurat}
                          onChange={(e) => setTanggalSurat(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Modal & Live Summary */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            {loadingRecords ? (
              <span className="inline-flex items-center gap-2 font-semibold text-indigo-600">
                <span className="w-3.5 h-3.5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                Menyiapkan rincian catatan poin dari server...
              </span>
            ) : (
              <span>
                Siap mencetak <strong className="text-slate-900">{processedData.students.length} siswa</strong> •{' '}
                Mode: <strong className="text-indigo-700">{reportMode === 'detailed' ? 'Total + Rincian Poin' : 'Total Poin Saja'}</strong> •{' '}
                Filter: <strong className="text-indigo-700">{pointTypeFilter === 'positif' ? 'Positif Saja' : pointTypeFilter === 'negatif' ? 'Negatif Saja' : 'Semua Poin'}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Batal
            </button>

            {/* Tombol Cetak / Print Langsung */}
            <button
              type="button"
              onClick={() => handleExportPdf('print')}
              disabled={Boolean(exportingAction) || loadingRecords || processedData.students.length === 0}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white shadow-md shadow-slate-900/20 transition-all cursor-pointer flex items-center gap-2"
              title="Membuka jendela cetak / print browser langsung"
            >
              {exportingAction === 'print' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Membuka Print...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Cetak / Print Langsung</span>
                </>
              )}
            </button>

            {/* Tombol Unduh PDF File */}
            <button
              type="button"
              onClick={() => handleExportPdf('download')}
              disabled={Boolean(exportingAction) || loadingRecords || processedData.students.length === 0}
              className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center gap-2"
              title="Menyimpan file PDF langsung ke perangkat"
            >
              {exportingAction === 'download' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Mengunduh...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Unduh File PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

