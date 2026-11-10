import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']

// Subject styling matcher
function getSubjectTheme(mapelName = '') {
  const name = String(mapelName || '').toLowerCase()
  if (name.includes('matematika') || name.includes('mat') || name.includes('tik') || name.includes('informatika')) {
    return {
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      cardBorder: 'border-blue-200 hover:border-blue-400',
      icon: null,
      accent: 'from-blue-500 to-indigo-600'
    }
  }
  if (name.includes('ipa') || name.includes('biologi') || name.includes('fisika')) {
    return {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cardBorder: 'border-emerald-200 hover:border-emerald-400',
      icon: null,
      accent: 'from-emerald-500 to-teal-600'
    }
  }
  if (name.includes('ips') || name.includes('sejarah') || name.includes('geografi') || name.includes('ekonomi')) {
    return {
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      cardBorder: 'border-amber-200 hover:border-amber-400',
      icon: null,
      accent: 'from-amber-500 to-orange-600'
    }
  }
  if (name.includes('indonesia') || name.includes('inggris') || name.includes('bahasa') || name.includes('b.ing') || name.includes('b.ind')) {
    return {
      badge: 'bg-violet-50 text-violet-700 border-violet-200',
      cardBorder: 'border-violet-200 hover:border-violet-400',
      icon: null,
      accent: 'from-violet-500 to-purple-600'
    }
  }
  if (name.includes('agama') || name.includes('katolik') || name.includes('kristen') || name.includes('budi pekerti')) {
    return {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      cardBorder: 'border-rose-200 hover:border-rose-400',
      icon: null,
      accent: 'from-rose-500 to-pink-600'
    }
  }
  if (name.includes('pjok') || name.includes('olahraga') || name.includes('penjas')) {
    return {
      badge: 'bg-lime-50 text-lime-800 border-lime-200',
      cardBorder: 'border-lime-200 hover:border-lime-400',
      icon: null,
      accent: 'from-lime-500 to-green-600'
    }
  }
  if (name.includes('seni') || name.includes('musik') || name.includes('prakarya')) {
    return {
      badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
      cardBorder: 'border-fuchsia-200 hover:border-fuchsia-400',
      icon: null,
      accent: 'from-fuchsia-500 to-pink-600'
    }
  }
  if (name.includes('ppkn') || name.includes('pkn') || name.includes('pancasila')) {
    return {
      badge: 'bg-red-50 text-red-700 border-red-200',
      cardBorder: 'border-red-200 hover:border-red-400',
      icon: null,
      accent: 'from-red-500 to-rose-600'
    }
  }
  return {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    cardBorder: 'border-slate-200 hover:border-indigo-300',
    icon: null,
    accent: 'from-indigo-500 to-blue-600'
  }
}

// Helper: Get today's day name in Indonesian
function getTodayHari() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return days[new Date().getDay()]
}

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function minutesToTime(m) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

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
      _end: minutesToTime(endMin),
      _startMin: startMin,
      _endMin: endMin
    }
  })
}

// Helper to get clean jam display without showing full activity sentences in the jam badge
function getSlotJamBadge(slot, idx, totalCount) {
  if (!slot) return '-'
  if (slot.tipe === 'istirahat' || slot.isBreak) return '-'
  
  // Slot 0 (Persiapan KBM, Upacara, Doa pagi)
  if (
    slot.tipe === 'persiapan' || 
    idx === 0 || 
    slot.jam_ke === 0 || 
    slot.urutan === 0 || 
    String(slot.label || '').trim() === '0'
  ) {
    return '0'
  }
  
  // Closing / Last slot (Penutup, Bersih Kelas, Pulang)
  if (
    slot.tipe === 'penutup' || 
    (totalCount && idx === totalCount - 1) ||
    String(slot.label || '').toLowerCase().includes('pulang') ||
    String(slot.label || '').toLowerCase().includes('bersih')
  ) {
    return '-'
  }
  
  // Other special blocks that are not lessons
  if (slot.tipe === 'blok_khusus') {
    return '-'
  }
  
  // Regular lessons: only use label if it's a short badge (e.g. roman numeral I, II or 1, 2)
  const lbl = String(slot.label || '').trim()
  if (lbl && lbl.length <= 4 && !lbl.includes(' ') && !lbl.includes(':')) {
    return lbl
  }
  if (slot.jam_ke !== null && slot.jam_ke !== undefined) {
    return String(slot.jam_ke)
  }
  return '-'
}

export default function SiswaJadwalSection({ kelas, activeTa, semester = 1 }) {
  const [selectedSemester, setSelectedSemester] = useState(parseInt(semester) || 1)
  const [schoolActiveSem, setSchoolActiveSem] = useState(1)
  const [activeHari, setActiveHari] = useState(() => {
    const today = getTodayHari()
    return HARI_LIST.includes(today) ? today : 'Senin'
  })
  const [slots, setSlots] = useState([])
  const [jadwals, setJadwals] = useState([])
  const [catatanList, setCatatanList] = useState([])
  const [ekskulList, setEkskulList] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [viewMode, setViewMode] = useState('card') // 'card' or 'table'

  // Fetch school-wide active semester
  useEffect(() => {
    const fetchSchoolSettings = async () => {
      try {
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_value')
          .eq('setting_key', 'jadwal_semester_aktif')
          .maybeSingle()
        if (data?.setting_value) {
          const semNum = parseInt(data.setting_value) || 1
          setSchoolActiveSem(semNum)
          // If no initial semester was passed, align with school active
          if (!semester) {
            setSelectedSemester(semNum)
          }
        }
      } catch (err) {
        console.warn('Failed to fetch school active semester:', err)
      }
    }
    fetchSchoolSettings()
  }, [])

  // Sync prop changes
  useEffect(() => {
    if (semester) setSelectedSemester(parseInt(semester) || 1)
  }, [semester])

  // Update current time clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  // Fetch data on parameters change
  useEffect(() => {
    if (!kelas) return
    fetchDayData()
  }, [activeHari, activeTa?.id, kelas, selectedSemester])

  const fetchDayData = async () => {
    const cacheKey = `ebm_jadwal_cache_${kelas || 'all'}_${selectedSemester}_${activeHari}`
    try {
      const cachedRaw = localStorage.getItem(cacheKey)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw)
        if (cached && Array.isArray(cached.slots)) {
          setSlots(cached.slots)
          setJadwals(cached.jadwals || [])
          if (cached.catatanList) setCatatanList(cached.catatanList)
          if (cached.ekskulList) setEkskulList(cached.ekskulList)
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setLoading(false)
            return
          }
        }
      }
    } catch {}

    setLoading(true)
    try {
      // 1. Fetch slots
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

      // Fallback 1b: fallback to any slots for today
      if (!slotsData || slotsData.length === 0) {
        const res = await supabase
          .from('jadwal_slot_waktu')
          .select('*')
          .eq('hari', activeHari)
          .order('urutan')
        slotsData = res.data
      }

      let computedSlots = []
      if (slotsData && slotsData.length > 0) {
        const baseStart = slotsData[0].waktu_mulai ? slotsData[0].waktu_mulai.slice(0, 5) : '06:30'
        computedSlots = calculateSlotTimes(slotsData, baseStart)
        setSlots(computedSlots)
      } else if (typeof navigator === 'undefined' || navigator.onLine !== false) {
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

      // Fallback 2a: try without semester filter
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

      // Fallback 2b: try without TA filter
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

      if (jadwalData && jadwalData.length > 0) {
        setJadwals(jadwalData)
      } else if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        setJadwals([])
      }

      // 3. Fetch Catatan Kurikulum & Ekskul
      let nextCatatan = []
      let nextEkskul = []
      if (activeTa?.id) {
        const [catatanRes, ekskulRes] = await Promise.all([
          supabase
            .from('jadwal_catatan')
            .select('*')
            .eq('tahun_ajaran_id', activeTa.id)
            .eq('semester', selectedSemester)
            .order('urutan'),
          supabase
            .from('jadwal_ekskul')
            .select('*')
            .eq('tahun_ajaran_id', activeTa.id)
            .eq('semester', selectedSemester)
            .order('urutan')
        ])
        nextCatatan = catatanRes.data || []
        nextEkskul = ekskulRes.data || []
        setCatatanList(nextCatatan)
        setEkskulList(nextEkskul)
      }

      if (computedSlots.length > 0 || (jadwalData && jadwalData.length > 0)) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            slots: computedSlots,
            jadwals: jadwalData || [],
            catatanList: nextCatatan,
            ekskulList: nextEkskul,
            savedAt: Date.now()
          }))
        } catch {}
      }
    } catch (err) {
      console.error('Error fetching jadwal:', err)
    } finally {
      setLoading(false)
    }
  }

  // Today check
  const isToday = getTodayHari() === activeHari

  // Schedule Rows calculation
  const scheduleRows = useMemo(() => {
    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes()

    return slots.map(slot => {
      const jadwal = jadwals.find(j => j.jam_ke === slot.jam_ke)
      const isBreak = slot.tipe === 'istirahat'
      const isSpecial = slot.tipe === 'blok_khusus'
      const isPrep = slot.tipe === 'persiapan'
      const isPenutup = slot.tipe === 'penutup'
      const isActive = isToday && nowMin >= slot._startMin && nowMin < slot._endMin
      const isPast = isToday && nowMin >= slot._endMin
      const isUpcoming = isToday && nowMin < slot._startMin

      const progressPercent = isActive && slot.durasi_menit > 0
        ? Math.min(100, Math.max(0, Math.round(((nowMin - slot._startMin) / slot.durasi_menit) * 100)))
        : 0
      const remainingMinutes = isActive ? slot._endMin - nowMin : 0

      const mapelName = jadwal?.mata_pelajaran?.nama || jadwal?.mata_pelajaran?.singkatan || null
      const theme = getSubjectTheme(mapelName)

      return {
        slot,
        jadwal,
        isBreak,
        isSpecial,
        isPrep,
        isPenutup,
        isActive,
        isPast,
        isUpcoming,
        progressPercent,
        remainingMinutes,
        mapel: mapelName,
        singkatan: jadwal?.mata_pelajaran?.singkatan,
        guru: jadwal?.guru?.nama_guru || null,
        kodeGuru: jadwal?.guru?.kode || null,
        specialLabel: slot.keterangan_blok || slot.label || 'KEGIATAN KHUSUS',
        theme
      }
    })
  }, [slots, jadwals, isToday, currentTime])

  // Active or next lesson finding
  const liveSlot = useMemo(() => {
    if (!isToday) return null
    return scheduleRows.find(r => r.isActive) || null
  }, [scheduleRows, isToday])

  const nextSlot = useMemo(() => {
    if (!isToday) return null
    return scheduleRows.find(r => r.isUpcoming && !r.isBreak) || null
  }, [scheduleRows, isToday])

  const totalJamPelajaran = scheduleRows.filter(r => !r.isBreak && !r.isSpecial && !r.isPrep && !r.isPenutup && r.mapel).length
  const totalIstirahat = scheduleRows.filter(r => r.isBreak).length

  // Filter ekskul for active day
  const todayEkskuls = useMemo(() => {
    return ekskulList.filter(e => !e.hari || e.hari.toLowerCase() === activeHari.toLowerCase())
  }, [ekskulList, activeHari])

  return (
    <div className="space-y-3 animate-fade-in text-slate-800">
      
      {/* 1. COMPACT TOP CONTROLS & DAY BAR */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-2.5 sm:p-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          {/* Badges Info */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-0.5 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-2xs">
              Kelas {kelas || '-'}
            </span>
            <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg">
              Semester {schoolActiveSem} (Aktif)
            </span>
            {slots.length > 0 && (
              <span className="text-xs font-medium text-slate-500 hidden sm:inline-flex items-center gap-1 ml-1">
                <span>•</span>
                <span>{totalJamPelajaran} Jam Pelajaran</span>
                {totalIstirahat > 0 && <span>({totalIstirahat} Istirahat)</span>}
              </span>
            )}
          </div>

          {/* Controls: View Switcher & Cetak */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                title="Tampilan Kartu"
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                  viewMode === 'card' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Kartu
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Tampilan Tabel"
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tabel
              </button>
            </div>
          </div>
        </div>

        {/* Day Navigation Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide items-center pt-1.5 border-t border-slate-100">
          {HARI_LIST.map((hari) => {
            const isTodayTab = getTodayHari() === hari
            const isActive = activeHari === hari
            return (
              <button
                key={hari}
                type="button"
                onClick={() => setActiveHari(hari)}
                className={`
                  relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 border
                  ${isActive 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200/80'
                  }
                `}
              >
                <span>{hari}</span>
                {isTodayTab && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. SLIM LIVE WIDGET (Hanya muncul jika ada jam KBM sedang berlangsung) */}
      {isToday && liveSlot && (
        <div className="py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between gap-2 text-xs shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-bold shrink-0">Sedang Berlangsung:</span>
            <span className="font-bold truncate text-emerald-950">
              {liveSlot.isBreak 
                ? (liveSlot.slot.label || 'Istirahat') 
                : (liveSlot.isSpecial || liveSlot.isPrep || liveSlot.isPenutup)
                ? liveSlot.specialLabel
                : liveSlot.mapel}
            </span>
            {!liveSlot.isBreak && liveSlot.guru && (
              <span className="text-emerald-700 hidden sm:inline truncate">
                • {liveSlot.guru} {liveSlot.kodeGuru ? `[Kode ${liveSlot.kodeGuru}]` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
            <span className="font-semibold text-emerald-800">{liveSlot.slot._start} - {liveSlot.slot._end}</span>
            <span className="bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
              {liveSlot.remainingMinutes > 0 ? `${liveSlot.remainingMinutes}m lagi` : '<1m'}
            </span>
          </div>
        </div>
      )}

      {/* 3. MAIN SCHEDULE CONTENT */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
          <div className="inline-flex flex-col items-center gap-2.5">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-500">Memuat jadwal pelajaran...</span>
          </div>
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <h3 className="text-sm font-bold text-slate-700">Belum Ada Jadwal</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Jadwal pelajaran untuk hari <strong className="text-slate-600">{activeHari}</strong> di Semester <strong className="text-slate-600">{selectedSemester}</strong> belum diatur oleh kurikulum.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* VIEW MODE: CARD TIMELINE (DEFAULT & SUPER MOBILE-FRIENDLY) */}
          {viewMode === 'card' && (
            <div className="space-y-2">
              {scheduleRows.map((row, idx) => {
                const { slot, isBreak, isSpecial, isPrep, isPenutup, isActive, mapel, guru, kodeGuru, specialLabel } = row

                // 1. ISTIRAHAT CARD
                if (isBreak) {
                  return (
                    <div 
                      key={slot.id || idx}
                      className={`py-2 px-3 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                        isActive 
                          ? 'bg-amber-100/90 border-amber-300 ring-1 ring-amber-400 font-bold' 
                          : 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-amber-200/60 text-amber-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                          -
                        </span>
                        <div className="truncate">
                          <span className="font-bold uppercase tracking-wide">{slot.label || 'Istirahat'}</span>
                          <span className="text-[11px] text-amber-700/80 ml-1.5 font-normal">({slot.durasi_menit}m)</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-amber-900 bg-white/80 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                        {slot._start} - {slot._end}
                      </span>
                    </div>
                  )
                }

                // 2. SPECIAL & PREPARATION & CLOSING
                if (isSpecial || isPrep || isPenutup) {
                  return (
                    <div 
                      key={slot.id || idx}
                      className={`py-2 px-3 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                        isActive 
                          ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-400 font-bold' 
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-slate-200/80 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 font-mono">
                          {getSlotJamBadge(slot, idx, scheduleRows.length)}
                        </span>
                        <div className="truncate">
                          <span className="font-bold uppercase tracking-wide">{specialLabel || slot.label}</span>
                          <span className="text-[11px] text-slate-500 ml-1.5 font-normal">({slot.durasi_menit}m)</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                        {slot._start} - {slot._end}
                      </span>
                    </div>
                  )
                }

                // 3. REGULAR LESSON CARD (Compact Dense Design)
                return (
                  <div
                    key={slot.id || idx}
                    className={`p-2.5 sm:p-3 rounded-xl border bg-white transition-all shadow-2xs hover:border-indigo-300 flex items-center justify-between gap-2.5 ${
                      isActive 
                        ? 'border-emerald-500 ring-2 ring-emerald-500/80 bg-emerald-50/20' 
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Jam Ke Pill */}
                      <div className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center shrink-0 font-bold text-xs border ${
                        isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        <span className="text-[8px] uppercase opacity-75 leading-none">Jam</span>
                        <span className="leading-none mt-0.5 font-black">{getSlotJamBadge(slot, idx, scheduleRows.length)}</span>
                      </div>

                      {/* Mapel & Guru */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {mapel || <span className="text-slate-400 font-normal italic">Belum Diisi</span>}
                          </h4>
                          {isActive && (
                            <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded uppercase animate-pulse shrink-0">
                              Live
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                          <span>{guru || 'Guru belum ditentukan'}</span>
                          {kodeGuru && (
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1 py-0.2 rounded text-[10px]">
                              [{kodeGuru}]
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Right: Time Badge */}
                    <div className="text-right shrink-0">
                      <span className="font-mono font-semibold text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 block">
                        {slot._start} - {slot._end}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* VIEW MODE: MODERN TABLE (SUPERB FOR DESKTOP & PRINTING) */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-3 sm:p-5 print:p-0 print:border-none print:shadow-none">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider text-center">
                      <th className="p-2.5 w-14 border-r border-slate-200">Jam</th>
                      <th className="p-2.5 w-24 border-r border-slate-200">Waktu</th>
                      <th className="p-2.5 w-14 border-r border-slate-200">Kode</th>
                      <th className="p-2.5 text-left border-r border-slate-200">Mata Pelajaran</th>
                      <th className="p-2.5 text-left">Guru Pengajar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {scheduleRows.map((row, idx) => {
                      const { slot, isBreak, isSpecial, isPrep, isPenutup, isActive, mapel, guru, kodeGuru, specialLabel } = row

                      if (isBreak) {
                        return (
                          <tr key={slot.id || idx} className="bg-amber-50/70 font-semibold text-amber-950 text-center">
                            <td className="p-2.5 border-r border-amber-200">-</td>
                            <td className="p-2.5 font-mono border-r border-amber-200">{slot._start} - {slot._end}</td>
                            <td className="p-2.5 border-r border-amber-200">-</td>
                            <td colSpan="2" className="p-2.5 text-center uppercase tracking-wider text-xs">
                              {slot.label || 'Istirahat'} ({slot.durasi_menit} Menit)
                            </td>
                          </tr>
                        )
                      }

                      if (isSpecial || isPrep || isPenutup) {
                        return (
                          <tr key={slot.id || idx} className="bg-slate-50 font-semibold text-slate-800 text-center">
                            <td className="p-2.5 border-r border-slate-200 font-mono font-bold">{getSlotJamBadge(slot, idx, scheduleRows.length)}</td>
                            <td className="p-2.5 font-mono border-r border-slate-200">{slot._start} - {slot._end}</td>
                            <td className="p-2.5 border-r border-slate-200">-</td>
                            <td colSpan="2" className="p-2.5 text-center uppercase tracking-wider text-xs">
                              {specialLabel || slot.label}
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr 
                          key={slot.id || idx}
                          className={`hover:bg-slate-50/80 transition-colors ${isActive ? 'bg-emerald-50/60 font-semibold text-emerald-950' : ''}`}
                        >
                          <td className="p-2.5 text-center font-bold font-mono border-r border-slate-200">
                            {getSlotJamBadge(slot, idx, scheduleRows.length)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600 border-r border-slate-200 whitespace-nowrap">
                            {slot._start} - {slot._end}
                          </td>
                          <td className="p-2.5 text-center font-bold font-mono text-indigo-700 border-r border-slate-200">
                            {kodeGuru || '-'}
                          </td>
                          <td className="p-2.5 font-bold text-slate-900 border-r border-slate-200">
                            {mapel || <span className="text-slate-400 font-normal italic">Belum diisi</span>}
                          </td>
                          <td className="p-2.5 font-medium text-slate-700">
                            {guru || <span className="text-slate-400 italic">Belum diisi</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. CATATAN & EKSTRAKURIKULER WIDGET */}
          {(catatanList.length > 0 || todayEkskuls.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {catatanList.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-3">
                    Catatan Kurikulum
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {catatanList.map((c, i) => (
                      <li key={c.id || i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span>{c.isi_catatan}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {todayEkskuls.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-3">
                    Ekstrakurikuler Hari {activeHari}
                  </h4>
                  <div className="space-y-2 text-xs">
                    {todayEkskuls.map((ek, i) => (
                      <div key={ek.id || i} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
                        <div>
                          <strong className="text-slate-800 block">{ek.nama}</strong>
                          <span className="text-[11px] text-slate-500">Pembina: {ek.pembina || '-'}</span>
                        </div>
                        <span className="font-mono font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] shadow-xs">
                          {ek.waktu || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
