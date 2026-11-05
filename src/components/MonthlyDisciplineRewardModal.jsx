import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const POS_PKET_CATALOG_ID = 'bbee71cd-1424-4497-8795-54980b5ed0f9'
const REWARD_POINTS = 4

export default function MonthlyDisciplineRewardModal({
  isOpen,
  onClose,
  activeTa,
  semester = 1,
  currentUser = null,
  allStudents = [],
  onSuccess
}) {
  const now = new Date()
  // Default ke bulan kemarin
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth() // 1-indexed
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [analyzing, setAnalyzing] = useState(false)
  const [hasCalculated, setHasCalculated] = useState(false)
  const [eligibleList, setEligibleList] = useState([])
  const [disqualifiedList, setDisqualifiedList] = useState([])
  const [selectedNisns, setSelectedNisns] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [tabFilter, setTabFilter] = useState('eligible') // 'eligible' | 'disqualified'
  
  // Execution states
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 })
  const [alert, setAlert] = useState(null)

  // Map siswa_lengkap untuk lookup cepat nama & kelas
  const studentMap = useMemo(() => {
    const map = new Map()
    for (const s of allStudents) {
      if (s.nisn) map.set(s.nisn, s)
    }
    return map
  }, [allStudents])

  if (!isOpen) return null

  // 1. Hitung & Pratinjau Siswa Lolos Disiplin Bulanan
  const handleCalculate = async () => {
    setAnalyzing(true)
    setAlert(null)
    setHasCalculated(false)
    setEligibleList([])
    setDisqualifiedList([])
    setSelectedNisns(new Set())

    try {
      const monthStr = String(selectedMonth).padStart(2, '0')
      const startDate = `${selectedYear}-${monthStr}-01`
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const endDate = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`

      // A. Ambil semua data presensi_harian pada rentang bulan tersebut (dengan paginasi penuh)
      let allPresensi = []
      let from = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('presensi_harian')
          .select('siswa_nisn, status, tipe')
          .gte('tanggal', startDate)
          .lte('tanggal', endDate)
          .range(from, from + pageSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allPresensi.push(...data)
          from += pageSize
          if (data.length < pageSize) hasMore = false
        } else {
          hasMore = false
        }
      }

      // B. Ambil catatan point_records untuk mendeteksi apakah siswa sudah pernah dapat reward di bulan ini
      const namaBulan = MONTH_NAMES[selectedMonth - 1]
      const { data: existingRecords, error: recErr } = await supabase
        .from('point_records')
        .select('nisn, keterangan')
        .eq('kode_katalog', 'POS-PKET-1')

      if (recErr) console.warn('Gagal membaca existing point_records:', recErr)

      const claimedNisnSet = new Set()
      if (existingRecords) {
        for (const r of existingRecords) {
          const ketLower = (r.keterangan || '').toLowerCase()
          if (ketLower.includes(namaBulan.toLowerCase()) && ketLower.includes(String(selectedYear))) {
            claimedNisnSet.add(r.nisn)
          }
        }
      }

      // C. Agregasi data presensi per siswa
      const presensiMap = new Map()
      for (const p of allPresensi) {
        if (!p.siswa_nisn) continue
        if (!presensiMap.has(p.siswa_nisn)) {
          presensiMap.set(p.siswa_nisn, { H: 0, S: 0, I: 0, T: 0, A: 0, totalHari: 0 })
        }
        const st = presensiMap.get(p.siswa_nisn)
        const s = (p.status || '').toUpperCase()
        if (s === 'H' || s === 'T' || s === 'S' || s === 'I' || s === 'A') {
          st[s] = (st[s] || 0) + 1
          st.totalHari++
        }
      }

      // D. Klasifikasi Lolos vs Diskualifikasi
      const eligible = []
      const disqualified = []
      const initialSelected = new Set()

      for (const [nisn, stats] of presensiMap.entries()) {
        const info = studentMap.get(nisn) || {
          nisn,
          nama_lengkap: `Siswa (${nisn})`,
          kelas: '-'
        }

        const isClaimed = claimedNisnSet.has(nisn)
        const isEligible = stats.T === 0 && stats.A === 0 && (stats.H > 0 || stats.S > 0 || stats.I > 0)

        const studentItem = {
          nisn,
          nama_lengkap: info.nama_lengkap,
          kelas: info.kelas,
          stats,
          isClaimed
        }

        if (isEligible) {
          eligible.push(studentItem)
          // Hanya auto-select siswa yang belum pernah menerima reward
          if (!isClaimed) {
            initialSelected.add(nisn)
          }
        } else {
          disqualified.push(studentItem)
        }
      }

      // Urutkan berdasarkan kelas lalu nama
      eligible.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_lengkap.localeCompare(b.nama_lengkap))
      disqualified.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama_lengkap.localeCompare(b.nama_lengkap))

      setEligibleList(eligible)
      setDisqualifiedList(disqualified)
      setSelectedNisns(initialSelected)
      setHasCalculated(true)

      if (eligible.length === 0) {
        setAlert({
          type: 'info',
          message: `Tidak ditemukan data presensi atau siswa yang memenuhi syarat pada bulan ${namaBulan} ${selectedYear}.`
        })
      }
    } catch (err) {
      console.error('Error calculate discipline reward:', err)
      setAlert({
        type: 'error',
        message: err.message || 'Gagal menghitung data presensi siswa.'
      })
    } finally {
      setAnalyzing(false)
    }
  }

  // Toggle selection
  const handleToggleSelectAll = () => {
    const unclaimable = eligibleList.filter(s => !s.isClaimed).map(s => s.nisn)
    if (selectedNisns.size === unclaimable.length) {
      setSelectedNisns(new Set())
    } else {
      setSelectedNisns(new Set(unclaimable))
    }
  }

  const handleToggleNisn = (nisn) => {
    const next = new Set(selectedNisns)
    if (next.has(nisn)) next.delete(nisn)
    else next.add(nisn)
    setSelectedNisns(next)
  }

  // 2. Eksekusi Batch Insert Reward Poin Serentak
  const handleProcessRewards = async () => {
    if (selectedNisns.size === 0) {
      setAlert({ type: 'warning', message: 'Silakan pilih minimal 1 siswa yang akan dikreditkan poin reward.' })
      return
    }

    const namaBulan = MONTH_NAMES[selectedMonth - 1]
    const confirmMsg = `Yakin ingin mengkreditkan +${REWARD_POINTS} Poin Disiplin Bulanan (${namaBulan} ${selectedYear}) kepada ${selectedNisns.size} siswa terpilih?`
    if (!window.confirm(confirmMsg)) return

    setProcessing(true)
    setAlert(null)
    setProgress({ current: 0, total: selectedNisns.size, percent: 0 })

    try {
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const recordDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const petugasName = currentUser?.nama_guru || currentUser?.nama || 'Petugas Piket'
      const nowIso = new Date().toISOString()

      // Filter siswa terpilih
      const targetStudents = eligibleList.filter(s => selectedNisns.has(s.nisn))

      // Siapkan payload batch
      const recordsToInsert = targetStudents.map(s => ({
        nisn: s.nisn,
        nama_siswa: s.nama_lengkap,
        kelas: s.kelas,
        tahun_ajaran_id: activeTa?.id || null,
        semester: semester || 1,
        catalog_id: POS_PKET_CATALOG_ID,
        kode_katalog: 'POS-PKET-1',
        jenis: 'Tidak pernah terlambat dalam 1 bulan penuh',
        poin_diberikan: REWARD_POINTS,
        keterangan: `Reward Disiplin Bulanan - Tidak Pernah Terlambat / Alpa (Bulan ${namaBulan} ${selectedYear})`,
        dicatat_oleh: petugasName,
        tanggal: recordDate,
        created_at: nowIso
      }))

      // Batch insert per 50 rows
      const chunkSize = 50
      let insertedCount = 0

      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize)
        const { error: insErr } = await supabase.from('point_records').insert(chunk)
        if (insErr) throw insErr

        insertedCount += chunk.length
        const pct = Math.round((insertedCount / recordsToInsert.length) * 100)
        setProgress({
          current: insertedCount,
          total: recordsToInsert.length,
          percent: pct
        })
      }

      setAlert({
        type: 'success',
        message: `🎉 Berhasil! Sebanyak ${insertedCount} siswa telah menerima +${REWARD_POINTS} Poin Disiplin Bulanan (${namaBulan} ${selectedYear}). Total poin siswa otomatis diperbarui di database!`
      })

      // Update local state isClaimed
      setEligibleList(prev => prev.map(s => selectedNisns.has(s.nisn) ? { ...s, isClaimed: true } : s))
      setSelectedNisns(new Set())

      if (onSuccess) onSuccess()
    } catch (err) {
      console.error('Error inserting reward records:', err)
      setAlert({
        type: 'error',
        message: err.message || 'Gagal memproses kredit poin reward ke database.'
      })
    } finally {
      setProcessing(false)
    }
  }

  // Filtered List for Table
  const displayList = useMemo(() => {
    const list = tabFilter === 'eligible' ? eligibleList : disqualifiedList
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(s =>
      s.nama_lengkap.toLowerCase().includes(q) ||
      s.nisn.includes(q) ||
      (s.kelas || '').toLowerCase().includes(q)
    )
  }, [tabFilter, eligibleList, disqualifiedList, searchQuery])

  const namaBulanAktif = MONTH_NAMES[selectedMonth - 1]
  const unclaimableEligibleCount = eligibleList.filter(s => !s.isClaimed).length
  const alreadyClaimedCount = eligibleList.filter(s => s.isClaimed).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl shadow-inner">
              🏆
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Kredit Poin Disiplin Bulanan</h2>
              <p className="text-xs text-amber-100 font-medium">
                Reward +4 Poin Otomatis: Siswa yang 0 Terlambat & 0 Alfa dalam 1 Bulan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-bold transition-all disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          
          {/* Notification Alert */}
          {alert && (
            <div className={`p-4 rounded-xl border text-xs font-semibold flex items-start gap-2.5 shadow-2xs ${
              alert.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : alert.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className="text-base shrink-0">
                {alert.type === 'success' ? '✅' : alert.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              <div className="flex-1 leading-relaxed">{alert.message}</div>
              <button onClick={() => setAlert(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
          )}

          {/* Filter Periode Bulan & Tahun */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="text-xs font-bold text-slate-700">Pilih Periode:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  disabled={analyzing || processing}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx + 1}>{name}</option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  disabled={analyzing || processing}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                >
                  {[2025, 2026, 2027].map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>

                <button
                  onClick={handleCalculate}
                  disabled={analyzing || processing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span>
                      <span>Menganalisis Presensi...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>Hitung & Pratinjau Siswa Lolos</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-[11px] text-slate-500 font-medium">
                Katalog: <strong className="text-amber-700">POS-PKET-1</strong> (+4 Poin)
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          {hasCalculated && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => setTabFilter('eligible')}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  tabFilter === 'eligible'
                    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Memenuhi Syarat (+4)</span>
                  <span className="text-xl">🌟</span>
                </div>
                <div className="text-2xl font-black text-amber-800 mt-1">{eligibleList.length} Siswa</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {unclaimableEligibleCount} siap dikreditkan, {alreadyClaimedCount} sudah pernah
                </div>
              </div>

              <div
                onClick={() => setTabFilter('disqualified')}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  tabFilter === 'disqualified'
                    ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-200'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Pernah Terlambat / Alfa</span>
                  <span className="text-xl">⚠️</span>
                </div>
                <div className="text-2xl font-black text-rose-800 mt-1">{disqualifiedList.length} Siswa</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Gugur reward disiplin bulan ini
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Terpilih Siap Diproses</span>
                  <span className="text-xl">🎯</span>
                </div>
                <div className="text-2xl font-black text-emerald-800 mt-1">{selectedNisns.size} Siswa</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Total poin yang akan dikreditkan: +{selectedNisns.size * REWARD_POINTS} Poin
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar saat Eksekusi Batch */}
          {processing && (
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-300 shadow-xs space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-amber-900">
                <span>Sedang mengkreditkan poin ke database...</span>
                <span>{progress.current} / {progress.total} Siswa ({progress.percent}%)</span>
              </div>
              <div className="w-full h-3 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-600 transition-all duration-200 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Table Pratinjau Siswa */}
          {hasCalculated && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-3.5 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  {tabFilter === 'eligible' && (
                    <button
                      onClick={handleToggleSelectAll}
                      disabled={processing || unclaimableEligibleCount === 0}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      {selectedNisns.size === unclaimableEligibleCount && unclaimableEligibleCount > 0
                        ? 'Batal Pilih Semua'
                        : `Pilih Semua (${unclaimableEligibleCount})`}
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-600">
                    Menampilkan {displayList.length} Siswa ({tabFilter === 'eligible' ? 'Lolos' : 'Gugur'})
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama, kelas, NISN..."
                    className="w-full sm:w-60 pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">🔍</span>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-black sticky top-0 z-10">
                    <tr>
                      {tabFilter === 'eligible' && (
                        <th className="py-2.5 px-3 w-10 text-center">Pilih</th>
                      )}
                      <th className="py-2.5 px-3">Siswa</th>
                      <th className="py-2.5 px-3 text-center">Kelas</th>
                      <th className="py-2.5 px-3 text-center">Hadir</th>
                      <th className="py-2.5 px-3 text-center">Sakit</th>
                      <th className="py-2.5 px-3 text-center">Izin</th>
                      <th className="py-2.5 px-3 text-center">Terlambat</th>
                      <th className="py-2.5 px-3 text-center">Alfa</th>
                      <th className="py-2.5 px-3 text-center">Status Reward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                          Tidak ada data siswa pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      displayList.map(s => {
                        const isSelected = selectedNisns.has(s.nisn)
                        return (
                          <tr
                            key={s.nisn}
                            className={`hover:bg-slate-50 transition-colors ${
                              s.isClaimed ? 'bg-slate-50/60 opacity-75' : isSelected ? 'bg-amber-50/50' : ''
                            }`}
                          >
                            {tabFilter === 'eligible' && (
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleNisn(s.nisn)}
                                  disabled={s.isClaimed || processing}
                                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer disabled:opacity-40"
                                />
                              </td>
                            )}
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800">{s.nama_lengkap}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{s.nisn}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">{s.kelas}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{s.stats.H}</td>
                            <td className="py-2.5 px-3 text-center text-blue-600">{s.stats.S}</td>
                            <td className="py-2.5 px-3 text-center text-purple-600">{s.stats.I}</td>
                            <td className={`py-2.5 px-3 text-center font-bold ${s.stats.T > 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-400'}`}>
                              {s.stats.T}
                            </td>
                            <td className={`py-2.5 px-3 text-center font-bold ${s.stats.A > 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-400'}`}>
                              {s.stats.A}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {s.isClaimed ? (
                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                                  Sudah Diberikan
                                </span>
                              ) : tabFilter === 'eligible' ? (
                                <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md">
                                  Siap +{REWARD_POINTS} Poin
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-md">
                                  Tidak Lolos
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium text-center sm:text-left">
            {hasCalculated ? (
              <span>Periode evaluasi: <strong>1 s.d. {new Date(selectedYear, selectedMonth, 0).getDate()} {namaBulanAktif} {selectedYear}</strong></span>
            ) : (
              <span>Pilih bulan & tahun, lalu klik tombol Hitung untuk memuat pratinjau.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={processing}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 active:scale-95 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Tutup
            </button>

            {hasCalculated && (
              <button
                onClick={handleProcessRewards}
                disabled={processing || selectedNisns.size === 0}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>🏆</span>
                <span>Proses & Kreditkan +{REWARD_POINTS} Poin ({selectedNisns.size} Siswa)</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
