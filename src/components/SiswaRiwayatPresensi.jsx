import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha', P: 'Pulang' }
const STATUS_COLORS = {
  H: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  T: 'text-amber-600 bg-amber-50 border-amber-200',
  S: 'text-blue-600 bg-blue-50 border-blue-200',
  I: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-rose-600 bg-rose-50 border-rose-200',
  P: 'text-slate-600 bg-slate-50 border-slate-200',
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export default function SiswaRiwayatPresensi({ studentData }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [presensiList, setPresensiList] = useState([])
  const [loading, setLoading] = useState(true)

  // Mode Tampilan: 'calendar' atau 'list'
  const [viewMode, setViewMode] = useState('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Data Hari Tidak Efektif / Libur
  const [holidaysMap, setHolidaysMap] = useState({})

  const [selectedPresensiDate, setSelectedPresensiDate] = useState(null)
  const [noAbsen, setNoAbsen] = useState(1)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [activeSubTipe, setActiveSubTipe] = useState('masuk')

  const pressTimerRef = useRef(null)

  // Fetch data hari libur & tidak efektif dari program_sekolah
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const { data } = await supabase
          .from('program_sekolah')
          .select('nama_kegiatan, nama, tanggal_mulai, tanggal_selesai, is_efektif, efektif')

        const map = {}
        if (data) {
          data.forEach(item => {
            const isNonEfektif = item.is_efektif === false || item.efektif === false
            if (isNonEfektif && item.tanggal_mulai) {
              const start = new Date(item.tanggal_mulai)
              const end = item.tanggal_selesai ? new Date(item.tanggal_selesai) : new Date(item.tanggal_mulai)
              
              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                const dateStr = `${y}-${m}-${day}`
                map[dateStr] = item.nama_kegiatan || item.nama || 'Hari Libur / Tidak Efektif'
              }
            }
          })
        }
        setHolidaysMap(map)
      } catch (err) {
        console.warn('Gagal memuat kalender libur:', err)
      }
    }
    fetchHolidays()
  }, [])

  // Fetch nomor absen siswa secara dinamis
  useEffect(() => {
    const fetchNoAbsen = async () => {
      if (!studentData?.kelas || !studentData?.nisn) return
      try {
        const { data } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap')
          .eq('kelas', studentData.kelas)
          .eq('is_aktif', true)
          .order('nama_lengkap')
        
        if (data) {
          const index = data.findIndex(s => s.nisn === studentData.nisn)
          if (index !== -1) {
            setNoAbsen(index + 1)
          }
        }
      } catch (err) {
        console.error('Gagal memuat nomor absen:', err)
      }
    }
    fetchNoAbsen()
  }, [studentData])

  // Fetch rentang tanggal semester aktif dari admin
  useEffect(() => {
    const fetchSemesterRange = async () => {
      if (!studentData?.tahun_ajaran_id) {
        const y = new Date().getFullYear()
        setStartDate(`${y}-01-01`)
        setEndDate(`${y}-12-31`)
        return
      }

      try {
        const { data, error } = await supabase
          .from('semester')
          .select('nomor, tanggal_mulai, tanggal_selesai')
          .eq('tahun_ajaran_id', studentData.tahun_ajaran_id)

        if (!error && data && data.length > 0) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          let activeSem = data.find(s => {
            const start = new Date(s.tanggal_mulai)
            const end = new Date(s.tanggal_selesai)
            start.setHours(0, 0, 0, 0)
            end.setHours(23, 59, 59, 999)
            return today >= start && today <= end
          })

          if (!activeSem) {
            activeSem = data.find(s => s.nomor === 1) || data[0]
          }

          if (activeSem && activeSem.tanggal_mulai && activeSem.tanggal_selesai) {
            setStartDate(activeSem.tanggal_mulai)
            setEndDate(activeSem.tanggal_selesai)
          } else {
            const y = new Date().getFullYear()
            setStartDate(`${y}-01-01`)
            setEndDate(`${y}-12-31`)
          }
        } else {
          const y = new Date().getFullYear()
          setStartDate(`${y}-01-01`)
          setEndDate(`${y}-12-31`)
        }
      } catch (err) {
        console.error('Gagal memuat rentang tanggal semester:', err)
        const y = new Date().getFullYear()
        setStartDate(`${y}-01-01`)
        setEndDate(`${y}-12-31`)
      }
    }

    fetchSemesterRange()
  }, [studentData?.tahun_ajaran_id])

  useEffect(() => {
    if (startDate && endDate) {
      fetchPresensi()
    }
  }, [startDate, endDate])

  const fetchPresensi = async () => {
    setLoading(true)

    let query = supabase
      .from('presensi_harian')
      .select('status, waktu, tanggal, tipe, selfie_url, keterangan')
      .eq('siswa_nisn', studentData.nisn)
      .order('tanggal', { ascending: false })

    if (startDate) query = query.gte('tanggal', startDate)
    if (endDate) query = query.lte('tanggal', endDate)

    const { data, error } = await query
    if (!error && data) {
      setPresensiList(data)
    }
    setLoading(false)
  }

  // Navigation Kalender
  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentMonth(new Date())
  }

  // ── DETAIL TAMPILAN PRESENSI ──────────────────────────────────────────────
  if (selectedPresensiDate) {
    const records = presensiList.filter(r => r.tanggal === selectedPresensiDate)
    const record = records.find(r => r.tipe === activeSubTipe || (!r.tipe && activeSubTipe === 'masuk'))
    const holidayName = holidaysMap[selectedPresensiDate]
    
    // Inisial nama
    const initials = studentData?.nama_lengkap
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'S'
      
    // Status formatting
    const statusVal = record?.status || (holidayName ? 'LIBUR' : 'Belum Presensi')
    const statusLabel = STATUS_LABELS[statusVal] || (holidayName ? 'Hari Libur' : statusVal)
    
    // Status text colors
    let statusTextColor = 'text-slate-600'
    let statusBgColor = 'bg-slate-50'
    if (statusVal === 'H') {
      statusTextColor = 'text-emerald-600'
      statusBgColor = 'bg-emerald-50 border-emerald-100 text-emerald-700'
    } else if (statusVal === 'T') {
      statusTextColor = 'text-amber-500'
      statusBgColor = 'bg-amber-50 border-amber-100 text-amber-700'
    } else if (statusVal === 'S') {
      statusTextColor = 'text-blue-600'
      statusBgColor = 'bg-blue-50 border-blue-100 text-blue-700'
    } else if (statusVal === 'I') {
      statusTextColor = 'text-purple-600'
      statusBgColor = 'bg-purple-50 border-purple-100 text-purple-700'
    } else if (statusVal === 'A') {
      statusTextColor = 'text-rose-600'
      statusBgColor = 'bg-rose-50 border-rose-100 text-rose-700'
    } else if (holidayName) {
      statusTextColor = 'text-rose-600'
      statusBgColor = 'bg-rose-50 border-rose-200 text-rose-700'
    }
    
    // Badge status text
    let badgeText = ''
    let badgeClass = ''
    if (statusVal === 'H') {
      badgeText = 'Tepat Waktu'
      badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded text-[10px]'
    } else if (statusVal === 'T') {
      badgeText = 'Terlambat'
      badgeClass = 'bg-amber-50 text-amber-700 border border-amber-100 font-bold px-2 py-0.5 rounded text-[10px]'
    } else if (statusVal === 'S') {
      badgeText = 'Sakit'
      badgeClass = 'bg-blue-50 text-blue-700 border border-blue-100 font-bold px-2 py-0.5 rounded text-[10px]'
    } else if (statusVal === 'I') {
      badgeText = 'Izin'
      badgeClass = 'bg-purple-50 text-purple-700 border border-purple-100 font-bold px-2 py-0.5 rounded text-[10px]'
    } else if (statusVal === 'A') {
      badgeText = 'Tanpa Keterangan'
      badgeClass = 'bg-rose-50 text-rose-700 border border-rose-100 font-bold px-2 py-0.5 rounded text-[10px]'
    } else if (holidayName) {
      badgeText = 'Hari Libur Sekolah'
      badgeClass = 'bg-rose-100 text-rose-800 border border-rose-200 font-bold px-2 py-0.5 rounded text-[10px]'
    }

    let timeSubText = ''
    if (activeSubTipe === 'masuk') {
      if (statusVal === 'H') {
        timeSubText = 'Sebelum jam 07:00'
      } else if (statusVal === 'T') {
        timeSubText = 'Setelah jam 07:00'
      } else {
        timeSubText = 'Jam batas masuk: 07:00'
      }
    } else {
      timeSubText = 'Jam pulang sekolah'
    }
    
    let descriptionText = ''
    if (holidayName) {
      descriptionText = `Hari ini adalah hari libur/tidak efektif: ${holidayName}`
    } else if (statusVal === 'H') {
      descriptionText = activeSubTipe === 'masuk' ? 'Siswa hadir tepat waktu.' : 'Siswa telah melakukan konfirmasi pulang.'
    } else if (statusVal === 'T') {
      descriptionText = 'Siswa hadir terlambat.'
    } else if (statusVal === 'S') {
      descriptionText = 'Siswa tidak hadir sekolah karena sakit.'
    } else if (statusVal === 'I') {
      descriptionText = 'Siswa tidak hadir sekolah karena ada izin/keperluan.'
    } else if (statusVal === 'A') {
      descriptionText = 'Siswa tidak hadir sekolah tanpa keterangan (alpha).'
    } else {
      descriptionText = 'Belum ada catatan presensi untuk hari ini.'
    }
    
    const coords = record?.keterangan
    const isCoords = coords && /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/.test(coords)

    // Icons
    let statusIcon = (
      <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-600 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
      </div>
    )
    if (statusVal === 'T') {
      statusIcon = (
        <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-full text-amber-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
      )
    } else if (statusVal === 'S') {
      statusIcon = (
        <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-full text-blue-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
      )
    } else if (statusVal === 'I') {
      statusIcon = (
        <div className="p-2.5 bg-purple-50 border border-purple-100 rounded-full text-purple-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
      )
    } else if (statusVal === 'A' || holidayName) {
      statusIcon = (
        <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-full text-rose-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </div>
      )
    }

    const hasMasuk = records.some(r => r.tipe === 'masuk' || !r.tipe)
    const hasPulang = records.some(r => r.tipe === 'pulang')

    const handlePhotoClick = (url) => {
      setSelectedPhoto(url)
    }

    return (
      <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
        {/* Detail Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPresensiDate(null)}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center transition-colors text-slate-600 focus:outline-none"
              title="Kembali ke Kalender"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
            </button>
            <div>
              <h3 className="font-black text-slate-800 text-lg sm:text-xl">Informasi Presensi Individu</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                {new Date(selectedPresensiDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Banner Libur jika ada */}
        {holidayName && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-800 text-xs sm:text-sm font-bold">
            <span className="text-xl">🎉</span>
            <div>
              <p className="font-extrabold">{holidayName}</p>
              <p className="text-rose-600 text-xs font-normal">Hari ini adalah hari tidak efektif / libur sekolah.</p>
            </div>
          </div>
        )}

        {/* Informasi Utama Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
          <div className="flex items-start justify-between border-b border-slate-100 pb-6 mb-6">
            <div className="flex items-center gap-4">
              {record?.selfie_url ? (
                <img
                  src={record.selfie_url}
                  alt="Selfie Presensi"
                  onClick={() => handlePhotoClick(record.selfie_url)}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-100 shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
                  {initials}
                </div>
              )}
              <div>
                <h4 className="font-black text-slate-900 text-base sm:text-lg">{studentData?.nama_lengkap || 'Siswa'}</h4>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    Kelas {studentData?.kelas || '-'}
                  </span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    No. Absen {noAbsen}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub Sesi Switcher (Masuk vs Pulang) */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button
              onClick={() => setActiveSubTipe('masuk')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTipe === 'masuk' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Presensi Masuk {hasMasuk ? '✓' : ''}
            </button>
            <button
              onClick={() => setActiveSubTipe('pulang')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTipe === 'pulang' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Presensi Pulang {hasPulang ? '✓' : ''}
            </button>
          </div>

          {/* Sesi Detail */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {statusIcon}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-extrabold ${statusTextColor}`}>{statusLabel}</span>
                  {badgeText && <span className={badgeClass}>{badgeText}</span>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{descriptionText}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Waktu Presensi</span>
                <p className="text-base font-black text-slate-800 mt-1">
                  {record?.waktu ? `${record.waktu} WIB` : '-'}
                </p>
                <span className="text-[11px] text-slate-400 font-medium block mt-0.5">{timeSubText}</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lokasi Koordinat</span>
                <p className="text-xs font-mono font-bold text-slate-700 mt-1 truncate">
                  {coords || '-'}
                </p>
                {isCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${coords}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 font-bold hover:underline inline-block mt-0.5"
                  >
                    Buka Google Maps ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Zoom Foto */}
        {selectedPhoto && (
          <div
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
          >
            <div className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200/50 animate-scale-up" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute right-4 top-4 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors shadow z-10 focus:outline-none"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <img src={selectedPhoto} alt="Zoomed Selfie" className="w-full h-auto max-h-[80vh] object-contain" />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── RENDER KALENDER UTAMA & LIST ──────────────────────────────────────────
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const monthName = MONTH_NAMES[month]

  // Hari pertama bulan ini (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayStr = new Date().toISOString().split('T')[0]

  // Generate grid cell
  const calendarCells = []
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push({ empty: true, key: `empty-${i}` })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const monthStr = String(month + 1).padStart(2, '0')
    const dateStr = `${year}-${monthStr}-${dayStr}`
    
    const records = presensiList.filter(r => r.tanggal === dateStr)
    const masukRec = records.find(r => r.tipe === 'masuk' || !r.tipe)
    const holidayName = holidaysMap[dateStr]
    
    const dateObj = new Date(year, month, d)
    const dayOfWeek = dateObj.getDay()
    const isSunday = dayOfWeek === 0
    const isToday = dateStr === todayStr
    const isPast = dateStr < todayStr

    calendarCells.push({
      empty: false,
      key: dateStr,
      day: d,
      dateStr,
      masukRec,
      records,
      holidayName,
      isSunday,
      isToday,
      isPast
    })
  }

  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-slate-800 text-lg sm:text-xl flex items-center gap-2">
            <span>📅</span> Riwayat Kehadiran
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pantau catatan kehadiran harian Anda dalam kalender interaktif
          </p>
        </div>

        {/* Switch View Toggle (Kalender / List) */}
        <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto shrink-0">
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${viewMode === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Kalender
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Daftar
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        /* ── TAMPILAN KALENDER ──────────────────────────────────────────────── */
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-md">
          
          {/* Kalender Header (Month & Year Navigator) */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 border border-slate-200/80 flex items-center justify-center transition-colors font-bold"
                title="Bulan Sebelumnya"
              >
                ‹
              </button>
              <h4 className="text-base sm:text-lg font-black text-slate-800 min-w-[140px] text-center">
                {monthName} {year}
              </h4>
              <button
                onClick={nextMonth}
                className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 border border-slate-200/80 flex items-center justify-center transition-colors font-bold"
                title="Bulan Berikutnya"
              >
                ›
              </button>
            </div>

            <button
              onClick={goToToday}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl text-xs font-bold transition-colors border border-indigo-100 shadow-xs"
            >
              Hari Ini
            </button>
          </div>

          {/* Grid Nama Hari */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {DAY_NAMES.map((day, idx) => (
              <div
                key={day}
                className={`py-2 text-xs font-black uppercase tracking-wider ${idx === 0 ? 'text-rose-500' : 'text-slate-400'}`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid Tanggal Kalender */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold text-slate-400">Memuat kalender presensi...</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {calendarCells.map(cell => {
                if (cell.empty) {
                  return <div key={cell.key} className="h-16 sm:h-20 rounded-2xl bg-slate-50/40 border border-transparent" />
                }

                const { dateStr, day, masukRec, holidayName, isSunday, isToday, isPast } = cell
                const statusVal = masukRec?.status

                // Determine Cell Style & Badge Text
                let bgStyle = 'bg-white border-slate-200/80 hover:border-indigo-300 text-slate-700'
                let badgeText = ''
                let badgeStyle = ''

                if (masukRec) {
                  if (statusVal === 'H') {
                    bgStyle = 'bg-emerald-500/10 border-emerald-300 text-emerald-950 font-extrabold hover:bg-emerald-500/20'
                    badgeText = 'Hadir'
                    badgeStyle = 'bg-emerald-600 text-white font-black'
                  } else if (statusVal === 'T') {
                    bgStyle = 'bg-amber-500/10 border-amber-300 text-amber-950 font-extrabold hover:bg-amber-500/20'
                    badgeText = 'Telat'
                    badgeStyle = 'bg-amber-500 text-white font-black'
                  } else if (statusVal === 'S') {
                    bgStyle = 'bg-blue-500/10 border-blue-300 text-blue-950 font-extrabold hover:bg-blue-500/20'
                    badgeText = 'Sakit'
                    badgeStyle = 'bg-blue-600 text-white font-black'
                  } else if (statusVal === 'I') {
                    bgStyle = 'bg-purple-500/10 border-purple-300 text-purple-950 font-extrabold hover:bg-purple-500/20'
                    badgeText = 'Izin'
                    badgeStyle = 'bg-purple-600 text-white font-black'
                  } else if (statusVal === 'A') {
                    bgStyle = 'bg-rose-500/10 border-rose-300 text-rose-950 font-extrabold hover:bg-rose-500/20'
                    badgeText = 'Alpha'
                    badgeStyle = 'bg-rose-600 text-white font-black'
                  }
                } else if (holidayName) {
                  bgStyle = 'bg-rose-500/15 border-rose-200 text-rose-900 font-bold hover:bg-rose-500/25'
                  badgeText = 'Libur'
                  badgeStyle = 'bg-rose-600 text-white font-black'
                } else if (isSunday) {
                  bgStyle = 'bg-rose-50/50 border-slate-100 text-rose-400 font-medium'
                } else if (isPast) {
                  bgStyle = 'bg-slate-50/80 border-slate-100 text-slate-400'
                }

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      setSelectedPresensiDate(dateStr)
                      const recs = presensiList.filter(r => r.tanggal === dateStr)
                      const hasM = recs.some(r => r.tipe === 'masuk' || !r.tipe)
                      const hasP = recs.some(r => r.tipe === 'pulang')
                      if (hasM) setActiveSubTipe('masuk')
                      else if (hasP) setActiveSubTipe('pulang')
                      else setActiveSubTipe('masuk')
                    }}
                    className={`relative h-16 sm:h-20 p-1.5 sm:p-2.5 rounded-2xl border transition-all flex flex-col justify-between text-left group cursor-pointer ${bgStyle} ${isToday ? 'ring-2 ring-indigo-600 ring-offset-2 font-black' : ''}`}
                  >
                    {/* Header Angka Tanggal */}
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs sm:text-sm font-extrabold leading-none ${isSunday ? 'text-rose-600' : ''}`}>
                        {day}
                      </span>
                      {isToday && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" title="Hari Ini" />
                      )}
                    </div>

                    {/* Badge Status */}
                    {badgeText ? (
                      <div className="w-full mt-auto">
                        <span className={`block w-full text-center py-0.5 rounded-md text-[9px] sm:text-[10px] tracking-tight truncate shadow-xs ${badgeStyle}`}>
                          {badgeText}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        Klik detail
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Legend / Petunjuk Warna */}
          <div className="mt-8 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-600">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1">Keterangan:</span>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Hadir (H)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-amber-800">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Terlambat (T)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-blue-800">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>Sakit (S)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg text-purple-800">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>Izin (I)</span>
            </div>
            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg text-rose-800">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>Alpha (A) / Libur</span>
            </div>
          </div>
        </div>
      ) : (
        /* ── TAMPILAN DAFTAR (LIST) ─────────────────────────────────────────── */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h4 className="font-bold text-slate-800 text-base">Filter Rentang Tanggal</h4>
              <p className="text-xs text-slate-400 mt-0.5">Pilih tanggal awal dan akhir untuk daftar riwayat</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-slate-400 font-bold text-xs hidden sm:block">s/d</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden divide-y divide-slate-100">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium text-slate-500">Memuat data riwayat...</p>
              </div>
            ) : presensiList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-2xl">
                  📅
                </div>
                <h4 className="font-bold text-slate-700">Belum Ada Presensi</h4>
                <p className="text-sm text-slate-500 mt-1">Anda belum memiliki catatan presensi pada rentang tanggal ini.</p>
              </div>
            ) : (
              presensiList.map((item, idx) => {
                const tglStr = new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                const sLabel = STATUS_LABELS[item.status] || item.status
                const sColor = STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'

                return (
                  <button
                    key={`${item.tanggal}-${item.tipe}-${idx}`}
                    onClick={() => {
                      setSelectedPresensiDate(item.tanggal)
                      setActiveSubTipe(item.tipe || 'masuk')
                    }}
                    className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50 transition-colors bg-white text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 text-sm sm:text-base block">{tglStr}</span>
                        <span className="text-xs text-slate-400 font-medium">Sesi: {item.tipe === 'pulang' ? 'Pulang' : 'Masuk'} ({item.waktu ? `${item.waktu} WIB` : '-'})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 text-xs font-bold rounded-lg border ${sColor}`}>{sLabel}</span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

    </div>
  )
}
