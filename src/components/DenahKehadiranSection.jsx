import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function DenahKehadiranSection({ session, activeTa, isAdmin }) {
  const isKepalaSekolah = session?.roles?.some(r => r.nama.toLowerCase().includes('kepala sekolah'))
  const hasWriteAccess = isAdmin || isKepalaSekolah

  // States
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [filterTingkat, setFilterTingkat] = useState('all') // all, 7, 8, 9

  // Master & Layout Data
  const [classes, setClasses] = useState([]) // All active class names
  const [layoutMap, setLayoutMap] = useState({}) // { [className]: { x, y } }
  const [waliMap, setWaliMap] = useState({}) // { [className]: guruNama }
  const [classStats, setClassStats] = useState({}) // { [className]: { total, hadir, sakit, izin, alfa, rate, color } }

  // Interactive Configuration
  const [isEditing, setIsEditing] = useState(false)
  const [selectedClassToPlace, setSelectedClassToPlace] = useState(null)
  const [savingLayout, setSavingLayout] = useState(false)

  // Modal Detail
  const [selectedClassDetail, setSelectedClassDetail] = useState(null)
  const [absentStudents, setAbsentStudents] = useState([])
  const [loadingModal, setLoadingModal] = useState(false)

  // Grid Configuration
  const GRID_COLS = 6
  const GRID_ROWS = 6

  // Fetch Wali Kelas
  const fetchWaliKelas = useCallback(async () => {
    if (!activeTa?.id) return
    try {
      const { data } = await supabase.from('guru_kelas')
        .select('kelas, guru(nama_guru)')
        .eq('tahun_ajaran_id', activeTa.id)
      
      const wMap = {}
      data?.forEach(d => {
        wMap[d.kelas] = d.guru?.nama_guru || 'Belum Ditentukan'
      })
      setWaliMap(wMap)
    } catch (err) {
      console.error('Error fetching wali kelas:', err)
    }
  }, [activeTa])

  // Fetch Layout Posisi
  const fetchLayout = useCallback(async () => {
    try {
      const { data } = await supabase.from('denah_kelas_layout').select('kelas, posisi_x, posisi_y')
      const lMap = {}
      data?.forEach(d => {
        lMap[d.kelas] = { x: d.posisi_x, y: d.posisi_y }
      })
      setLayoutMap(lMap)
    } catch (err) {
      console.error('Error fetching denah layout:', err)
    }
  }, [])

  // Fetch Real-time/Today Kehadiran & Siswa
  const fetchAttendanceAndClasses = useCallback(async () => {
    if (!activeTa?.id) return
    setLoading(true)
    try {
      // 1. Fetch seluruh siswa aktif untuk kelas & total count
      const { data: students } = await supabase.from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)
      
      const uniqueClasses = [...new Set((students || []).map(s => s.kelas).filter(Boolean))].sort()
      setClasses(uniqueClasses)

      const studentsByClass = {}
      students?.forEach(s => {
        if (!studentsByClass[s.kelas]) studentsByClass[s.kelas] = []
        studentsByClass[s.kelas].push(s)
      })

      // 2. Fetch presensi hari ini
      const todayStr = new Date().toISOString().slice(0, 10)
      const { data: presence } = await supabase.from('presensi_harian')
        .select('siswa_nisn, status, kelas')
        .eq('tanggal', todayStr)
      
      const presenceByClass = {}
      presence?.forEach(p => {
        if (!presenceByClass[p.kelas]) presenceByClass[p.kelas] = []
        presenceByClass[p.kelas].push(p)
      })

      // 3. Kalkulasi statistika kehadiran per kelas
      const stats = {}
      uniqueClasses.forEach(cls => {
        const classStudents = studentsByClass[cls] || []
        const total = classStudents.length
        const classPresence = presenceByClass[cls] || []

        if (classPresence.length === 0) {
          // Belum ada data presensi hari ini
          stats[cls] = { total, hadir: 0, sakit: 0, izin: 0, alfa: 0, rate: null, color: 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200/60' }
        } else {
          const hadir = classPresence.filter(p => p.status === 'H' || p.status === 'T').length
          const sakit = classPresence.filter(p => p.status === 'S').length
          const izin = classPresence.filter(p => p.status === 'I').length
          const alfa = classPresence.filter(p => p.status === 'A').length
          
          const rate = total > 0 ? Math.round((hadir / total) * 100) : 0
          
          let color = 'bg-rose-500 text-white border-rose-600 hover:bg-rose-600' // < 70%
          if (rate > 90) {
            color = 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600' // > 90%
          } else if (rate >= 70) {
            color = 'bg-amber-400 text-slate-800 border-amber-500 hover:bg-amber-500' // 70% - 90%
          }

          stats[cls] = { total, hadir, sakit, izin, alfa, rate, color }
        }
      })
      setClassStats(stats)

      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      setLastUpdated(timeStr)
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa])

  // Initial Load & Realtime Subscription Setup
  useEffect(() => {
    fetchWaliKelas()
    fetchLayout()
    fetchAttendanceAndClasses()

    // Realtime channel subscription
    const channel = supabase.channel('realtime_presensi_denah')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian' }, () => {
        fetchAttendanceAndClasses()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchWaliKelas, fetchLayout, fetchAttendanceAndClasses])

  // Get filtered classes
  const getFilteredClasses = () => {
    if (filterTingkat === 'all') return classes
    return classes.filter(c => c.startsWith(filterTingkat))
  }

  // Handle cell click (for normal detail modal or positioning during edit mode)
  const handleCellClick = async (x, y) => {
    const classNameInCell = Object.keys(layoutMap).find(
      key => layoutMap[key].x === x && layoutMap[key].y === y
    )

    if (isEditing) {
      if (selectedClassToPlace) {
        // Pindahkan kelas terpilih ke koordinat x, y
        setLayoutMap(prev => ({
          ...prev,
          [selectedClassToPlace]: { x, y }
        }))
        setSelectedClassToPlace(null)
      } else if (classNameInCell) {
        // Pilih kelas yang ada di koordinat ini untuk dipindahkan
        setSelectedClassToPlace(classNameInCell)
      }
    } else if (classNameInCell) {
      // Normal Mode: Buka modal detail kehadiran kelas
      setSelectedClassDetail(classNameInCell)
      setLoadingModal(true)
      try {
        const todayStr = new Date().toISOString().slice(0, 10)
        // Fetch siswa absen hari ini dari presensi_harian join siswa_permanent
        const { data: absent } = await supabase.from('presensi_harian')
          .select(`
            siswa_nisn,
            status,
            siswa_permanent (nama_lengkap)
          `)
          .eq('tanggal', todayStr)
          .eq('kelas', classNameInCell)
          .in('status', ['S', 'I', 'A'])
        
        setAbsentStudents(absent || [])
      } catch (err) {
        console.error('Error loading absent students:', err)
      } finally {
        setLoadingModal(false)
      }
    }
  }

  // Simpan Layout Baru ke database
  const saveLayoutCoordinates = async () => {
    if (!hasWriteAccess) return
    setSavingLayout(true)
    try {
      const promises = Object.entries(layoutMap).map(([cls, pos]) => {
        return supabase.from('denah_kelas_layout').upsert({
          kelas: cls,
          posisi_x: pos.x,
          posisi_y: pos.y,
          updated_at: new Date().toISOString()
        }, { onConflict: 'kelas' })
      })

      await Promise.all(promises)
      setIsEditing(false)
      fetchLayout()
      alert('✓ Tata letak denah kelas berhasil diperbarui!')
    } catch (err) {
      alert('Gagal menyimpan layout: ' + err.message)
    } finally {
      setSavingLayout(false)
    }
  }

  // Mereset layout koordinat (menghapus kelas dari koordinat grid)
  const removeClassFromLayout = (clsName) => {
    setLayoutMap(prev => {
      const next = { ...prev }
      delete next[clsName]
      return next
    })
  }

  // Render Grid Cells
  const renderGrid = () => {
    const gridElements = []
    const filteredClassList = getFilteredClasses()

    for (let r = 1; r <= GRID_ROWS; r++) {
      for (let c = 1; c <= GRID_COLS; c++) {
        // Cari kelas yang terdaftar di koordinat ini
        const clsName = Object.keys(layoutMap).find(
          key => layoutMap[key].x === c && layoutMap[key].y === r
        )

        const isFiltered = clsName ? filteredClassList.includes(clsName) : false
        const stats = clsName ? classStats[clsName] : null
        const isSelected = selectedClassToPlace === clsName

        gridElements.push(
          <div
            key={`${r}-${c}`}
            onClick={() => handleCellClick(c, r)}
            className={`aspect-video rounded-xl border relative transition-all flex flex-col items-center justify-center cursor-pointer p-2 ${
              clsName && isFiltered
                ? (stats?.color || 'bg-slate-100 border-slate-300 text-slate-500') + (isSelected ? ' ring-4 ring-indigo-600 scale-[1.03] shadow-lg' : '')
                : 'bg-slate-50/50 border-dashed border-slate-200 hover:bg-slate-100/50'
            }`}
          >
            {/* Koordinat Grid tipis di Edit Mode */}
            {isEditing && (
              <span className="absolute top-1 left-1.5 text-[8px] font-mono text-slate-400">
                C{c},R{r}
              </span>
            )}

            {clsName && isFiltered ? (
              <div className="text-center w-full select-none">
                <span className="block font-black text-sm md:text-base leading-tight tracking-tight">
                  {clsName}
                </span>
                <span className="block text-[10px] font-bold opacity-90 mt-0.5">
                  {stats && stats.rate !== null && stats.rate !== undefined ? `${stats.rate}% Kehadiran` : 'Belum Presensi'}
                </span>
                
                {/* Tombol Hapus layout di Edit Mode */}
                {isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeClassFromLayout(clsName)
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold border border-white shadow hover:bg-red-600"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              isEditing && selectedClassToPlace && (
                <span className="text-[10px] font-bold text-indigo-400 animate-pulse">Tempatkan</span>
              )
            )}
          </div>
        )
      }
    }
    return gridElements
  }

  // Get classes that don't have position assigned yet
  const getUnpositionedClasses = () => {
    return classes.filter(c => !layoutMap[c])
  }

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Denah Kehadiran Interaktif</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Peta ruang kelas real-time. Terakhir diperbarui: <span className="font-semibold text-indigo-600">{lastUpdated || '—'}</span>
          </p>
        </div>

        {/* Edit Button khusus Admin & Kepala Sekolah */}
        {hasWriteAccess && (
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => { setIsEditing(false); fetchLayout() }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={saveLayoutCoordinates}
                  disabled={savingLayout}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  {savingLayout ? 'Menyimpan...' : 'Simpan Layout'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Denah 2D
              </button>
            )}
          </div>
        )}
      </div>

      {/* Control Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Filter Tingkat */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Filter Tingkat:</span>
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            {[
              { id: 'all', label: 'Semua Kelas' },
              { id: 'VII-', label: 'Kelas 7' },
              { id: 'VIII-', label: 'Kelas 8' },
              { id: 'IX-', label: 'Kelas 9' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTingkat(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTingkat === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">Status:</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-500" /> &gt; 90%</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-amber-400" /> 70% - 90%</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-rose-500" /> &lt; 70%</span>
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-slate-200" /> Belum Presensi</span>
        </div>
      </div>

      {/* Edit Mode Instructions / Placement Pool */}
      {isEditing && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-indigo-900">Mode Edit Denah Kelas Aktif</h4>
            <p className="text-xs text-indigo-700 mt-1">
              Pilih nama kelas di bawah, kemudian **klik sel kosong** pada grid denah di bawah untuk menempatkan. Anda juga bisa mengeklik kotak kelas di dalam grid untuk dipindahkan.
            </p>
          </div>

          {/* List Kelas Belum Ditempatkan */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block">Belum Ditempatkan di Grid:</span>
            {getUnpositionedClasses().length === 0 ? (
              <span className="text-xs text-slate-400 italic">Semua kelas sudah ditempatkan di grid.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {getUnpositionedClasses().map(cls => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClassToPlace(cls)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      selectedClassToPlace === cls
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-400'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactive 2D Grid Board */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {renderGrid()}
        </div>
      </div>

      {/* Detail Modal Kehadiran Kelas */}
      {selectedClassDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-zoom-in">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Kelas {selectedClassDetail}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Wali Kelas: {waliMap[selectedClassDetail] || '—'}</p>
              </div>
              <button
                onClick={() => { setSelectedClassDetail(null); setAbsentStudents([]) }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Quick stats grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="block text-xl font-black text-emerald-600">
                    {classStats[selectedClassDetail]?.hadir || 0}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">Hadir</span>
                </div>
                <div className="p-2 bg-yellow-50 rounded-xl border border-yellow-100">
                  <span className="block text-xl font-black text-yellow-600">
                    {classStats[selectedClassDetail]?.sakit || 0}
                  </span>
                  <span className="text-[10px] font-bold text-yellow-700">Sakit</span>
                </div>
                <div className="p-2 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="block text-xl font-black text-blue-600">
                    {classStats[selectedClassDetail]?.izin || 0}
                  </span>
                  <span className="text-[10px] font-bold text-blue-700">Izin</span>
                </div>
                <div className="p-2 bg-rose-50 rounded-xl border border-rose-100">
                  <span className="block text-xl font-black text-rose-600">
                    {classStats[selectedClassDetail]?.alfa || 0}
                  </span>
                  <span className="text-[10px] font-bold text-rose-700">Alfa</span>
                </div>
              </div>

              {/* Absent/Sick/Permit Student List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider">Siswa Tidak Hadir Hari Ini ({absentStudents.length})</h4>
                
                {loadingModal ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                ) : absentStudents.length === 0 ? (
                  <p className="text-xs text-emerald-600 font-semibold italic">✓ Luar biasa! Seluruh siswa kelas ini hadir hari ini.</p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[200px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                        <tr>
                          <th className="px-4 py-2">Nama Murid</th>
                          <th className="px-4 py-2 text-center w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absentStudents.map(abs => (
                          <tr key={abs.siswa_nisn} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-bold text-slate-700">{abs.siswa_permanent?.nama_lengkap}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                                abs.status === 'S'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : abs.status === 'I'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {abs.status === 'S' ? 'Sakit' : abs.status === 'I' ? 'Izin' : 'Alfa'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50/40">
              <button
                onClick={() => { setSelectedClassDetail(null); setAbsentStudents([]) }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
