// src/components/HallOfFameModal.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'

// Helper tie-ranking yang adil: Nilai sama = Peringkat sama
const assignTieRanks = (items, scoreFn) => {
  let currentRank = 1
  return items.map((item, index) => {
    if (index > 0) {
      const prevScore = scoreFn(items[index - 1])
      const currScore = scoreFn(item)
      if (currScore !== prevScore) {
        currentRank = index + 1
      }
    } else {
      currentRank = 1
    }
    return { ...item, displayRank: currentRank }
  })
}

// Avatar Foto Profil Siswa dengan fallback Cloudinary URL & Initials
function StudentPhotoAvatar({ nisn, nama, activeTaId, size = 'md', className = '' }) {
  const [imgError, setImgError] = useState(false)
  const [photoUrl, setPhotoUrl] = useState(null)

  useEffect(() => {
    setImgError(false)
    if (!nisn) return

    let isMounted = true
    supabase
      .from('foto')
      .select('cloudinary_url')
      .eq('nisn', nisn)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) {
          if (data?.cloudinary_url) {
            setPhotoUrl(data.cloudinary_url)
          } else {
            const url = activeTaId
              ? `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_200,h_200,g_face/SKL-BM/FOTO_${nisn}_${activeTaId}`
              : `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_200,h_200,g_face/SKL-BM/FOTO_${nisn}`
            setPhotoUrl(url)
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setPhotoUrl(`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_200,h_200,g_face/SKL-BM/FOTO_${nisn}`)
        }
      })

    return () => { isMounted = false }
  }, [nisn, activeTaId])

  const initials = useMemo(() => {
    if (!nama) return 'S'
    const parts = nama.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }, [nama])

  const sizeClasses = {
    sm: 'w-9 h-9 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-2xl',
  }[size] || 'w-12 h-12 text-sm'

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={nama || 'Foto Siswa'}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-2xl object-cover shadow-md border-2 border-white/20 shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses} rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 text-white font-bold flex items-center justify-center shadow-md border-2 border-white/20 shrink-0 ${className}`}
    >
      {initials}
    </div>
  )
}

export default function HallOfFameModal({
  isOpen,
  onClose,
  activeTa,
  allClasses = [],
  monthOptions = []
}) {
  const [periode, setPeriode] = useState('tahun_ajaran')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedClass, setSelectedClass] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
  const [loading, setLoading] = useState(false)
  const [totalPointsList, setTotalPointsList] = useState([])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
    }
  }

  // Load data total perolehan poin siswa
  const loadData = useCallback(async () => {
    if (!activeTa?.id || !isOpen) return
    setLoading(true)

    try {
      let start = '2000-01-01'
      let end = '2099-12-31'
      const today = new Date().toISOString().slice(0, 10)

      if (periode === 'tahun_ajaran') {
        start = activeTa?.tanggal_mulai || '2000-01-01'
        end = activeTa?.tanggal_selesai || '2099-12-31'
      } else if (periode === 'bulan_ini') {
        const d = new Date()
        d.setDate(1)
        start = d.toISOString().slice(0, 10)
        end = today
      } else if (periode === 'bulan_tertentu') {
        const parts = selectedMonth.split('-')
        const y = parseInt(parts[0])
        const m = parseInt(parts[1])
        const first = new Date(y, m - 1, 1)
        const last = new Date(y, m, 0)
        start = `${y}-${String(m).padStart(2, '0')}-01`
        end = `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
      } else if (periode === 'minggu_ini') {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        start = d.toISOString().slice(0, 10)
        end = today
      }

      // Fetch point_records
      let q = supabase
        .from('point_records')
        .select('*')
        .gte('tanggal', start)
        .lte('tanggal', end)

      if (activeTa?.id) {
        q = q.or(`tahun_ajaran_id.eq.${activeTa.id},tahun_ajaran_id.is.null`)
      }

      const { data: recs } = await q
      const records = recs || []
      const allNisns = Array.from(new Set(records.map(r => r.nisn)))

      let studentMap = {}
      if (allNisns.length > 0) {
        const { data: sData } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', allNisns)

        if (sData) {
          sData.forEach(s => {
            studentMap[s.nisn] = {
              nama: s.nama_lengkap || s.nama || 'Siswa',
              kelas: s.kelas || '-'
            }
          })
        }
      }

      // Hitung akumulasi poin per siswa
      const statsMap = {}
      records.forEach(r => {
        if (!statsMap[r.nisn]) {
          const info = studentMap[r.nisn] || {}
          statsMap[r.nisn] = {
            nisn: r.nisn,
            nama: info.nama || r.nama_siswa || 'Siswa',
            kelas: r.kelas || info.kelas || '-',
            prestasiPoin: 0,
            pelanggaranPoin: 0
          }
        }

        if (r.poin_diberikan < 0) {
          statsMap[r.nisn].pelanggaranPoin += Math.abs(r.poin_diberikan)
        } else {
          statsMap[r.nisn].prestasiPoin += r.poin_diberikan
        }
      })

      const studentList = Object.values(statsMap)

      // Query akumulasi student_points dari database
      const { data: spPoints } = await supabase
        .from('student_points')
        .select('nisn, total_poin, poin_default')
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: false })

      if (spPoints && spPoints.length > 0) {
        const spNisns = spPoints.map(s => s.nisn)
        const { data: spSiswaNames } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', spNisns)

        const nameMap = {}
        const classMap = {}
        ;(spSiswaNames || []).forEach(s => {
          nameMap[s.nisn] = s.nama_lengkap
          classMap[s.nisn] = s.kelas
        })

        const kumulatifList = spPoints.map(sp => {
          const matched = statsMap[sp.nisn] || { prestasiPoin: 0, pelanggaranPoin: 0 }
          return {
            nisn: sp.nisn,
            nama: nameMap[sp.nisn] || 'Siswa',
            kelas: classMap[sp.nisn] || '-',
            poinAwal: sp.poin_default ?? 100,
            prestasiPoin: matched.prestasiPoin,
            pelanggaranPoin: matched.pelanggaranPoin,
            totalPoinAkhir: sp.total_poin
          }
        })

        setTotalPointsList(assignTieRanks(kumulatifList, s => s.totalPoinAkhir))
      } else {
        const fallbackList = [...studentList]
          .map(s => ({
            ...s,
            poinAwal: 100,
            totalPoinAkhir: 100 + s.prestasiPoin - s.pelanggaranPoin
          }))
          .sort((a, b) => b.totalPoinAkhir - a.totalPoinAkhir)

        setTotalPointsList(assignTieRanks(fallbackList, s => s.totalPoinAkhir))
      }

    } catch (err) {
      console.error('Error loading total points data:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa, isOpen, periode, selectedMonth])

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, loadData])

  // Filter list berdasarkan pencarian dan kelas
  const filteredList = useMemo(() => {
    return totalPointsList.filter(item => {
      const matchesClass = selectedClass === 'all' || item.kelas === selectedClass
      const matchesSearch = !searchQuery.trim() ||
        item.nama?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nisn?.includes(searchQuery)
      return matchesClass && matchesSearch
    })
  }, [totalPointsList, selectedClass, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 backdrop-blur-2xl text-white animate-fade-in flex flex-col min-h-screen">
      
      {/* HEADER SHOWCASE */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-600 to-amber-500 p-0.5 shadow-lg shadow-indigo-500/20 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <span className="text-2xl animate-pulse">⭐</span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black bg-gradient-to-r from-amber-300 via-amber-100 to-indigo-200 bg-clip-text text-transparent tracking-wide">
                TOTAL PEROLEHAN POIN SEMENTARA SISWA
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                TRANSPARAN & ADIL
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Portal Akademik eBudiMulia • SMP Budi Mulia Jakarta
            </p>
          </div>
        </div>

        {/* Presentation & Close Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            title="Layar Penuh untuk TV / Presentasi"
          >
            <span>📺</span>
            <span className="hidden sm:inline">Layar Penuh</span>
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
          >
            <span>✕</span> Tutup Tampilan
          </button>
        </div>
      </header>

      {/* FILTER & VIEW CONTROLS BAR */}
      <div className="bg-slate-900/60 border-b border-slate-800/50 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* Status Label & View Mode Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
              Total Siswa: <strong className="text-amber-300">{filteredList.length}</strong> Siswa
            </span>

            {/* View Mode Toggle: Grid vs Table */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'grid'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🎴</span> Kartu Profil
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>📋</span> Tabel Ringkas
              </button>
            </div>
          </div>

          {/* Filters: Search, Periode, Kelas */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <input
                type="text"
                placeholder="Cari nama atau NISN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
            </div>

            {/* Periode Filter */}
            <select
              value={periode}
              onChange={e => setPeriode(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer"
            >
              <option value="tahun_ajaran">Full TA ({activeTa?.nama || 'Aktif'})</option>
              <option value="bulan_ini">Bulan Ini</option>
              <option value="bulan_tertentu">Bulan Tertentu</option>
              <option value="minggu_ini">7 Hari Terakhir</option>
            </select>

            {/* Select Month (If bulan_tertentu) */}
            {periode === 'bulan_tertentu' && (
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-indigo-500/50 text-xs text-amber-300 font-semibold cursor-pointer"
              >
                {monthOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}

            {/* Filter Kelas */}
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer"
            >
              <option value="all">Semua Kelas</option>
              {allClasses.map(k => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>

          </div>

        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 space-y-4">
            <div className="w-12 h-12 border-4 border-amber-400/20 border-t-amber-400 rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-amber-200 animate-pulse">Memuat Rekap Perolehan Poin Sementara...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-28 bg-slate-900/40 rounded-3xl border border-slate-800 p-8 space-y-3">
            <span className="text-5xl">📊</span>
            <h3 className="text-lg font-bold text-slate-300">Belum Ada Data Poin Siswa</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tidak ditemukan data poin siswa untuk kriteria filter atau kelas yang dipilih.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* MODE 1: GRID KARTU PROFIL FOTO SISWA */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredList.map((s) => {
              const isTopTier = s.displayRank === 1
              return (
                <div
                  key={s.nisn}
                  className={`bg-slate-900/80 hover:bg-slate-800/90 border rounded-3xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 hover:scale-[1.02] shadow-xl relative overflow-hidden group ${
                    isTopTier
                      ? 'border-amber-400/70 shadow-amber-500/10'
                      : 'border-slate-800 hover:border-indigo-500/40'
                  }`}
                >
                  {/* Top Bar inside Card: Rank Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 border ${
                      isTopTier
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-sm'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}>
                      {isTopTier ? '👑 PERINGKAT #1' : `#${s.displayRank}`}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-extrabold text-[11px] border border-indigo-500/30">
                      Kelas {s.kelas}
                    </span>
                  </div>

                  {/* Center: Student Photo + Info */}
                  <div className="flex items-center gap-3.5 my-1">
                    <StudentPhotoAvatar
                      nisn={s.nisn}
                      nama={s.nama}
                      activeTaId={activeTa?.id}
                      size="lg"
                      className={isTopTier ? 'border-amber-400 shadow-lg shadow-amber-500/20' : 'border-indigo-500/50'}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold text-white text-sm line-clamp-2 leading-snug group-hover:text-amber-200 transition-colors">
                        {s.nama}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        NISN: {s.nisn}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Formula + Total Point Pill */}
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between gap-2 shadow-inner">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Formula Poin</div>
                      <div className="text-xs font-bold text-slate-300 mt-0.5">
                        {s.poinAwal || 100}
                        {s.prestasiPoin > 0 && <span className="text-emerald-400 ml-1">+{s.prestasiPoin}</span>}
                        {s.pelanggaranPoin > 0 && <span className="text-rose-400 ml-1">-{s.pelanggaranPoin}</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-medium">Total Akhir</div>
                      <span className={`inline-block px-3 py-1 rounded-xl text-sm font-black mt-0.5 border ${
                        s.totalPoinAkhir >= 100
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : s.totalPoinAkhir >= 75
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {s.totalPoinAkhir} Poin
                      </span>
                    </div>
                  </div>

                </div>
              )
            })}
          </div>
        ) : (
          /* MODE 2: TABEL RINGKAS */
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800 tracking-wider">
                  <tr>
                    <th className="px-5 py-4 w-16 text-center">Peringkat</th>
                    <th className="px-5 py-4">Siswa</th>
                    <th className="px-5 py-4 text-center">Kelas</th>
                    <th className="px-5 py-4 text-center">Formula Perhitungan (Awal + Plus - Negatif)</th>
                    <th className="px-5 py-4 text-center">Total Poin Akhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredList.map((s) => {
                    const isTopTier = s.displayRank === 1
                    return (
                      <tr key={s.nisn} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3.5 text-center font-black text-xs">
                          <span className={`px-2.5 py-1 rounded-lg border ${
                            isTopTier
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}>
                            #{s.displayRank}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <StudentPhotoAvatar
                              nisn={s.nisn}
                              nama={s.nama}
                              activeTaId={activeTa?.id}
                              size="sm"
                            />
                            <div>
                              <div className="font-bold text-white text-xs">{s.nama}</div>
                              <div className="text-[10px] font-mono text-slate-400">NISN: {s.nisn}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-center font-bold text-indigo-300">{s.kelas}</td>
                        <td className="px-5 py-3.5 text-center font-medium text-slate-300">
                          <span>{s.poinAwal || 100} (Awal)</span>
                          {s.prestasiPoin > 0 && <span className="text-emerald-400 font-bold ml-1">+{s.prestasiPoin}</span>}
                          {s.pelanggaranPoin > 0 && <span className="text-rose-400 font-bold ml-1">-{s.pelanggaranPoin}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`px-3 py-1 font-black rounded-xl text-xs border ${
                            s.totalPoinAkhir >= 100
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : s.totalPoinAkhir >= 75
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            {s.totalPoinAkhir} Poin
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
