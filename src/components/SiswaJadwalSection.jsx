import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const HARI_ICONS = ['🟦', '🟩', '🟨', '🟧', '🟪', '🟥']

// Helper: Get today's day name in Indonesian
function getTodayHari() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return days[new Date().getDay()]
}

// Helper: Calculate computed times for slots from a base start time
function calculateSlotTimes(slots, baseStart) {
  let currentMinutes = timeToMinutes(baseStart)
  return slots.map(slot => {
    const startMin = slot.waktu_mulai ? timeToMinutes(slot.waktu_mulai.slice(0, 5)) : currentMinutes
    const dur = slot.durasi_menit || 40
    const endMin = startMin + dur
    currentMinutes = endMin
    return {
      ...slot,
      _start: minutesToTime(startMin),
      _end: minutesToTime(endMin)
    }
  })
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Helper: Check if current time is within a slot
function isCurrentSlot(startTime, endTime) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= timeToMinutes(startTime) && nowMin < timeToMinutes(endTime)
}

export default function SiswaJadwalSection({ kelas, activeTa, semester = 1 }) {
  const [selectedSemester, setSelectedSemester] = useState(semester)
  const [activeHari, setActiveHari] = useState(() => {
    const today = getTodayHari()
    return HARI_LIST.includes(today) ? today : 'Senin'
  })
  const [slots, setSlots] = useState([])
  const [jadwals, setJadwals] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Keep selectedSemester synced if parent prop changes
  useEffect(() => {
    if (semester) setSelectedSemester(semester)
  }, [semester])

  // Update current time every minute for "Sedang Berlangsung" indicator
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch data when day changes
  useEffect(() => {
    if (!kelas) return
    fetchDayData()
  }, [activeHari, activeTa?.id, kelas, selectedSemester])

  const fetchDayData = async () => {
    setLoading(true)
    try {
      // 1. Fetch slot waktu hari ini
      let slotsData = null
      if (activeTa?.id) {
        const res = await supabase
          .from('jadwal_slot_waktu')
          .select('*')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', selectedSemester)
          .eq('hari', activeHari)
          .order('urutan')
        slotsData = res.data
      }

      // Fallback 1a: if slots empty for selectedSemester, try without semester filter
      if ((!slotsData || slotsData.length === 0) && activeTa?.id) {
        const res = await supabase
          .from('jadwal_slot_waktu')
          .select('*')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('hari', activeHari)
          .order('urutan')
        slotsData = res.data
      }

      // Fallback 1b: if still empty, fetch any slots for today
      if (!slotsData || slotsData.length === 0) {
        const res = await supabase
          .from('jadwal_slot_waktu')
          .select('*')
          .eq('hari', activeHari)
          .order('urutan')
        slotsData = res.data
      }

      if (slotsData && slotsData.length > 0) {
        const baseStart = slotsData[0].waktu_mulai ? slotsData[0].waktu_mulai.slice(0, 5) : '06:30'
        setSlots(calculateSlotTimes(slotsData, baseStart))
      } else {
        setSlots([])
      }

      // 2. Fetch jadwal pelajaran untuk kelas ini
      let jadwalData = null
      if (activeTa?.id) {
        const res = await supabase
          .from('jadwal_pelajaran')
          .select(`
            *,
            guru ( id, nama_guru, kode ),
            mata_pelajaran ( id, nama, singkatan )
          `)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', selectedSemester)
          .eq('hari', activeHari)
          .eq('kelas', kelas)
        jadwalData = res.data
      }

      // Fallback 2a: if empty for selectedSemester, try without semester filter
      if ((!jadwalData || jadwalData.length === 0) && activeTa?.id) {
        const res = await supabase
          .from('jadwal_pelajaran')
          .select(`
            *,
            guru ( id, nama_guru, kode ),
            mata_pelajaran ( id, nama, singkatan )
          `)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('hari', activeHari)
          .eq('kelas', kelas)
        jadwalData = res.data
      }

      // Fallback 2b: if still empty, try without TA filter (in case TA id mismatch)
      if (!jadwalData || jadwalData.length === 0) {
        const res = await supabase
          .from('jadwal_pelajaran')
          .select(`
            *,
            guru ( id, nama_guru, kode ),
            mata_pelajaran ( id, nama, singkatan )
          `)
          .eq('hari', activeHari)
          .eq('kelas', kelas)
        jadwalData = res.data
      }

      setJadwals(jadwalData || [])
    } catch (err) {
      console.error('Error fetching jadwal:', err)
    } finally {
      setLoading(false)
    }
  }

  // Determine if today is active day
  const isToday = getTodayHari() === activeHari

  // Build schedule rows
  const scheduleRows = useMemo(() => {
    return slots.map(slot => {
      const jadwal = jadwals.find(j => j.jam_ke === slot.jam_ke)
      const isBreak = slot.tipe === 'istirahat'
      const isSpecial = slot.tipe === 'blok_khusus'
      const isPrep = slot.tipe === 'persiapan' || slot.tipe === 'penutup'
      const isActive = isToday && isCurrentSlot(slot._start, slot._end)

      return {
        slot,
        jadwal,
        isBreak,
        isSpecial,
        isPrep,
        isActive,
        mapel: jadwal?.mata_pelajaran?.nama || jadwal?.mata_pelajaran?.singkatan || null,
        guru: jadwal?.guru?.nama_guru || null,
        kodeGuru: jadwal?.guru?.kode || null,
        specialLabel: slot.keterangan_blok || slot.label || 'KEGIATAN KHUSUS'
      }
    })
  }, [slots, jadwals, isToday, currentTime])

  // Count summary
  const totalJamPelajaran = scheduleRows.filter(r => !r.isBreak && !r.isSpecial && !r.isPrep && r.mapel).length
  const totalIstirahat = scheduleRows.filter(r => r.isBreak).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Jadwal Pelajaran
              </h2>
              <p className="text-blue-100 text-xs mt-1">
                Kelas <span className="font-bold text-white">{kelas}</span> — Semester {semester}
              </p>
            </div>
            {isToday && (
              <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Hari Ini
              </div>
            )}
          </div>
        </div>

        {/* Day Tabs */}
        <div className="p-3 bg-slate-50/80 border-b border-slate-200">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {HARI_LIST.map((hari, i) => {
              const isTodayTab = getTodayHari() === hari
              const isActive = activeHari === hari
              return (
                <button
                  key={hari}
                  onClick={() => setActiveHari(hari)}
                  className={`
                    relative flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300
                    ${isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' 
                      : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200'
                    }
                  `}
                >
                  <span className="text-sm">{HARI_ICONS[i]}</span>
                  {hari}
                  {isTodayTab && !isActive && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Schedule Table */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500 font-medium">Memuat jadwal...</span>
          </div>
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-700">Belum Ada Jadwal</h3>
          <p className="text-xs text-slate-500 mt-1">Jadwal untuk hari {activeHari} belum diatur oleh admin.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
          {/* Summary bar */}
          <div className="px-5 py-3 mb-6 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-xs text-slate-600 font-medium">{totalJamPelajaran} Jam Pelajaran</span>
              </div>
              {totalIstirahat > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs text-slate-600 font-medium">{totalIstirahat} Istirahat</span>
                </div>
              )}
            </div>
            {isToday && (
              <span className="text-xs text-slate-500 font-mono font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
              </span>
            )}
          </div>

          {/* Premium Excel-styled Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-400 text-slate-800 text-sm">
              <thead>
                {/* Day Header (e.g. SENIN) */}
                <tr>
                  <th 
                    colSpan="5" 
                    className="border border-slate-400 text-center font-extrabold text-base tracking-wider uppercase py-3 select-none"
                    style={{ backgroundColor: '#fed166', color: '#1e293b' }}
                  >
                    {activeHari}
                  </th>
                </tr>
                {/* Column Headers */}
                <tr className="text-slate-900 font-bold select-none text-[13px]" style={{ backgroundColor: '#fbe9e7' }}>
                  <th className="border border-slate-400 px-3 py-2.5 text-center w-[12%]">Jam Ke-</th>
                  <th className="border border-slate-400 px-3 py-2.5 text-center w-[20%]">WAKTU</th>
                  <th className="border border-slate-400 px-3 py-2.5 text-center w-[10%]">KODE</th>
                  <th className="border border-slate-400 px-4 py-2.5 text-center w-[28%]">Mata Pelajaran</th>
                  <th className="border border-slate-400 px-4 py-2.5 text-center w-[30%]">Guru Pengajar</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row, idx) => {
                  const { slot, jadwal, isBreak, isSpecial, isPrep, isActive, mapel, guru, specialLabel, kodeGuru } = row
                  
                  // Active row overlay style (very clean live indicator)
                  const activeRowBg = isActive ? "bg-emerald-50/70" : "";

                  // Format time string to dot style (e.g. 06.30 - 07.00)
                  const formattedTimeRange = `${slot._start.slice(0, 5).replace(':', '.')} - ${slot._end.slice(0, 5).replace(':', '.')}`;

                  // 1. ISTIRAHAT (Green background, single colspan for the notes)
                  if (isBreak) {
                    return (
                      <tr 
                        key={slot.id || idx} 
                        className={`${activeRowBg} transition-all`}
                        style={{ backgroundColor: isActive ? '#e8f5e9' : '#c8e6c9' }}
                      >
                        <td className="border border-slate-400 px-3 py-2 text-center font-bold text-emerald-950">-</td>
                        <td className="border border-slate-400 px-3 py-2 text-center font-mono font-bold text-emerald-950 text-xs">
                          {formattedTimeRange}
                        </td>
                        <td className="border border-slate-400 px-3 py-2 text-center"></td>
                        <td 
                          colSpan="2" 
                          className="border border-slate-400 px-4 py-2 text-center font-bold italic tracking-wide text-emerald-950 text-xs uppercase"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>☕</span>
                            <span>{slot.label || 'ISTIRAHAT'}</span>
                            {isActive && (
                              <span className="text-[10px] not-italic font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full animate-pulse">
                                Berlangsung
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  // 2. SPECIAL & PREPARATION (Beige/light cream background, KODE column is empty/'-')
                  if (isSpecial || isPrep) {
                    const isPenutup = slot.tipe === 'penutup';
                    // Pulang / Penutup has light yellow background, GLS/Prep has very light cream/off-white background
                    const rowBgColor = isPenutup ? '#ffd54f' : '#fffde7';

                    return (
                      <tr 
                        key={slot.id || idx} 
                        className={`${activeRowBg} transition-all`}
                        style={{ backgroundColor: isActive ? '#e8f5e9' : rowBgColor }}
                      >
                        <td className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-800">
                          {slot.label || (isPenutup ? '*' : '0')}
                        </td>
                        <td className="border border-slate-400 px-3 py-2 text-center font-mono font-bold text-slate-700 text-xs">
                          {formattedTimeRange}
                        </td>
                        <td className="border border-slate-400 px-3 py-2 text-center font-medium text-slate-500">-</td>
                        <td 
                          colSpan="2" 
                          className="border border-slate-400 px-4 py-2 text-center font-bold text-slate-800 text-[11px] uppercase tracking-wide"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>{isPenutup ? '🔔' : '📋'}</span>
                            <span>{specialLabel || slot.label}</span>
                            {isActive && (
                              <span className="text-[10px] font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full animate-pulse">
                                Berlangsung
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  // 3. NORMAL LESSON ROW
                  return (
                    <tr 
                      key={slot.id || idx} 
                      className={`
                        hover:bg-slate-50/50 transition-colors
                        ${isActive ? 'bg-emerald-50/60 font-semibold ring-2 ring-emerald-500 ring-inset' : 'bg-white'}
                      `}
                    >
                      {/* Jam Ke */}
                      <td className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-700">
                        {slot.label || slot.jam_ke}
                      </td>
                      {/* Waktu */}
                      <td className="border border-slate-400 px-3 py-2 text-center font-mono text-xs font-semibold text-slate-600">
                        {formattedTimeRange}
                      </td>
                      {/* KODE */}
                      <td className="border border-slate-400 px-3 py-2 text-center font-bold text-slate-800">
                        {kodeGuru || '-'}
                      </td>
                      {/* Mata Pelajaran */}
                      <td className={`border border-slate-400 px-4 py-2.5 text-center text-xs font-bold ${isActive ? 'text-emerald-800' : 'text-slate-800'}`}>
                        {mapel || <span className="text-slate-400 font-normal italic">Belum diisi</span>}
                      </td>
                      {/* Guru Pengajar */}
                      <td className={`border border-slate-400 px-4 py-2.5 text-center text-xs font-semibold ${isActive ? 'text-emerald-700' : 'text-slate-600'}`}>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <span>{guru || <span className="text-slate-400 font-normal italic">Belum diisi</span>}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-[9px] font-extrabold text-white bg-emerald-600 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 animate-pulse">
                              Live
                            </span>
                          )}
                        </div>
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
  )
}
