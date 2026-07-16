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

export default function SiswaRiwayatPresensi({ studentData }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [presensiList, setPresensiList] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState(null)

  const [effectiveDates, setEffectiveDates] = useState([])

  const [selectedPresensiDate, setSelectedPresensiDate] = useState(null)
  const [noAbsen, setNoAbsen] = useState(1)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [activeSubTipe, setActiveSubTipe] = useState('masuk')

  const pressTimerRef = useRef(null)

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
        const todayStr = new Date().toISOString().split('T')[0]
        setStartDate(todayStr)
        setEndDate(todayStr)
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

          // Cari semester yang menaungi tanggal hari ini
          let activeSem = data.find(s => {
            const start = new Date(s.tanggal_mulai)
            const end = new Date(s.tanggal_selesai)
            start.setHours(0, 0, 0, 0)
            end.setHours(23, 59, 59, 999)
            return today >= start && today <= end
          })

          // Jika tidak ada yang cocok, default ke Semester 1 atau record pertama
          if (!activeSem) {
            activeSem = data.find(s => s.nomor === 1) || data[0]
          }

          if (activeSem && activeSem.tanggal_mulai && activeSem.tanggal_selesai) {
            setStartDate(activeSem.tanggal_mulai)
            setEndDate(activeSem.tanggal_selesai)
          } else {
            const todayStr = new Date().toISOString().split('T')[0]
            setStartDate(todayStr)
            setEndDate(todayStr)
          }
        } else {
          const todayStr = new Date().toISOString().split('T')[0]
          setStartDate(todayStr)
          setEndDate(todayStr)
        }
      } catch (err) {
        console.error('Gagal memuat rentang tanggal semester:', err)
        const todayStr = new Date().toISOString().split('T')[0]
        setStartDate(todayStr)
        setEndDate(todayStr)
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
    
    // 1. Ambil tanggal dari sesi_presensi yang aktif/dibuka
    let sesiQuery = supabase.from('sesi_presensi').select('tanggal').order('tanggal', { ascending: false })
    if (startDate) sesiQuery = sesiQuery.gte('tanggal', startDate)
    if (endDate) sesiQuery = sesiQuery.lte('tanggal', endDate)
    else if (startDate && !endDate) sesiQuery = sesiQuery.lte('tanggal', startDate)
    
    const { data: sesiData } = await sesiQuery
    const activeDates = sesiData ? sesiData.map(s => s.tanggal) : []

    // 2. Ambil data presensi harian milik siswa
    let query = supabase
      .from('presensi_harian')
      .select('status, waktu, tanggal, tipe, selfie_url, keterangan')
      .eq('siswa_nisn', studentData.nisn)
      .order('tanggal', { ascending: false })

    if (startDate) query = query.gte('tanggal', startDate)
    if (endDate) query = query.lte('tanggal', endDate)
    else if (startDate && !endDate) query = query.lte('tanggal', startDate)

    const { data, error } = await query
    let dbRecords = []
    if (!error && data) {
      dbRecords = data
      setPresensiList(data)
    }

    // 3. Gabungkan tanggal dari sesi aktif DAN tanggal di mana siswa memiliki catatan presensi
    const recordDates = dbRecords.map(r => r.tanggal)
    const allDates = [...new Set([...activeDates, ...recordDates])].sort((a, b) => b.localeCompare(a))
    
    setEffectiveDates(allDates)
    setLoading(false)
  }

  if (selectedPresensiDate) {
    const records = presensiList.filter(r => r.tanggal === selectedPresensiDate)
    const record = records.find(r => r.tipe === activeSubTipe || (!r.tipe && activeSubTipe === 'masuk'))
    
    // Inisial nama
    const initials = studentData?.nama_lengkap
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'S'
      
    // Status formatting
    const statusVal = record?.status || 'Belum Presensi'
    const statusLabel = STATUS_LABELS[statusVal] || statusVal
    
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
    if (statusVal === 'H') {
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
    } else if (statusVal === 'A') {
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
    
    const handlePhotoTouchStart = (url) => {
      pressTimerRef.current = setTimeout(() => {
        setSelectedPhoto(url)
      }, 500)
    }
    
    const handlePhotoTouchEnd = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current)
      }
    }

    return (
      <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
        {/* Detail Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPresensiDate(null)}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center transition-colors text-slate-600 focus:outline-none"
              title="Kembali ke Daftar Riwayat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
            </button>
            <div>
              <h3 className="font-black text-slate-800 text-lg sm:text-xl">Informasi Presensi Individu</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Detail kehadiran siswa</p>
            </div>
          </div>
          
          {/* Dropdown Tanggal */}
          <div className="relative">
            <select
              value={selectedPresensiDate}
              onChange={(e) => {
                setSelectedPresensiDate(e.target.value)
                const newRecs = presensiList.filter(r => r.tanggal === e.target.value)
                const newHasMasuk = newRecs.some(r => r.tipe === 'masuk' || !r.tipe)
                const newHasPulang = newRecs.some(r => r.tipe === 'pulang')
                if (newHasMasuk) setActiveSubTipe('masuk')
                else if (newHasPulang) setActiveSubTipe('pulang')
                else setActiveSubTipe('masuk')
              }}
              className="appearance-none pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer hover:bg-slate-50"
            >
              {effectiveDates.map(d => {
                const dateLabel = new Date(d).toLocaleDateString('id-ID', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })
                return (
                  <option key={d} value={d}>
                    {dateLabel}
                  </option>
                )
              })}
            </select>
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <svg className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>
          </div>
        </div>

        {/* Informasi Utama Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
          {/* Watermark Logo */}
          <div className="absolute right-6 top-6 w-16 h-16 opacity-[0.08] pointer-events-none select-none">
            <img src="/logo.png" alt="Crest Watermark" className="w-full h-full object-contain grayscale" />
          </div>

          {/* Student Identity */}
          <div className="flex items-center gap-4 border-b border-slate-100 pb-6 mb-6">
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-base flex items-center justify-center shrink-0 border border-indigo-200 shadow-inner">
              {initials}
            </div>
            <div>
              <h4 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight leading-snug">{studentData?.nama_lengkap}</h4>
              <p className="text-xs sm:text-sm text-slate-500 font-bold mt-0.5">
                Kelas {studentData?.kelas} &bull; No. Absen {noAbsen}
              </p>
            </div>
          </div>

          {/* Switcher Masuk / Pulang (Jika keduanya ada) */}
          {hasMasuk && hasPulang && (
            <div className="flex gap-2 p-1 bg-slate-50 border border-slate-200 rounded-2xl mb-6">
              <button
                onClick={() => setActiveSubTipe('masuk')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${activeSubTipe === 'masuk' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Presensi Masuk
              </button>
              <button
                onClick={() => setActiveSubTipe('pulang')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${activeSubTipe === 'pulang' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Presensi Pulang
              </button>
            </div>
          )}

          {/* Two Columns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-stretch">
            {/* Left Column: Info Fields */}
            <div className="md:col-span-7 flex flex-col gap-6 sm:gap-7 justify-center pr-0 md:pr-4">
              
              {/* Field 1: Status */}
              <div className="flex items-start gap-4">
                {statusIcon}
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Status Presensi</span>
                  <span className={`text-xl sm:text-2xl font-black block leading-none tracking-tight ${statusTextColor}`}>{statusLabel}</span>
                  {badgeText && (
                    <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-md mt-2.5 ${badgeClass}`}>
                      {badgeText}
                    </span>
                  )}
                </div>
              </div>

              {/* Field 2: Waktu */}
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">
                    {activeSubTipe === 'masuk' ? 'Waktu Masuk' : 'Waktu Pulang'}
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-slate-800 block leading-none tracking-tight">
                    {record?.waktu ? `${record.waktu} WIB` : '--:-- WIB'}
                  </span>
                  {timeSubText && (
                    <span className="text-[11px] font-bold text-slate-400 block mt-2">
                      {timeSubText}
                    </span>
                  )}
                </div>
              </div>

              {/* Field 3: Keterangan */}
              <div className="flex items-start gap-4">
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-500 mt-0.5 shrink-0 shadow-sm flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Keterangan</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-600 block leading-relaxed">
                    {descriptionText}
                  </span>
                  {isCoords && (
                    <a 
                      href={`https://www.google.com/maps?q=${coords}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-800 mt-3 transition-colors underline decoration-2 underline-offset-2"
                    >
                      📍 Lihat Lokasi Presensi di Peta
                    </a>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column: Photo Card */}
            <div className="md:col-span-5 flex flex-col justify-center">
              {record?.selfie_url ? (
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 sm:p-5 flex flex-col items-center shadow-sm">
                  <div className="flex items-center gap-2 mb-3.5 self-start">
                    <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shadow-sm flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                    </div>
                    <span className="text-xs font-black text-slate-700">Foto Presensi</span>
                  </div>
                  
                  <div className="w-full relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col items-center group cursor-pointer shadow-md">
                    <img 
                      src={record.selfie_url} 
                      alt={`Selfie ${activeSubTipe}`} 
                      onClick={() => handlePhotoClick(record.selfie_url)}
                      onTouchStart={() => handlePhotoTouchStart(record.selfie_url)}
                      onTouchEnd={handlePhotoTouchEnd}
                      className="w-full aspect-[3/4] object-cover transition-transform duration-500 group-hover:scale-105" 
                    />
                    <div className="w-full bg-slate-50 border-t border-slate-100 py-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 shadow-inner">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      <span>{record.waktu} WIB</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-150 rounded-3xl p-5 flex flex-col items-center justify-center min-h-[300px] shadow-sm">
                  <div className="flex items-center gap-2 mb-3.5 self-start">
                    <div className="p-1.5 bg-slate-100 text-slate-400 rounded-lg flex items-center justify-center border border-slate-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                    </div>
                    <span className="text-xs font-black text-slate-700">Foto Presensi</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl w-full p-6 text-center bg-white shadow-inner">
                    <svg className="w-9 h-9 text-slate-300 mb-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                    <span className="text-xs font-bold text-slate-400">Tidak Anda Bukti Foto</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Catatan Bawah */}
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4.5 flex items-start gap-3 shadow-sm">
          <div className="p-1 text-blue-500 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11.25 11.25l.041-.02a.75.75 0 111.086 1.086L11.25 12v3.75m-.75-7.5h.008v.008H10.5V8.25zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <h5 className="text-xs font-extrabold text-blue-700 uppercase tracking-widest mb-0.5">Catatan</h5>
            <p className="text-xs text-blue-600/80 font-bold leading-normal">
              Informasi presensi dicatat berdasarkan waktu dan lokasi presensi di sekolah.
            </p>
          </div>
        </div>

        {/* Modal Pop-up Foto */}
        {selectedPhoto && (
          <div 
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
          >
            <div className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200/50 animate-scale-up" onClick={(e) => e.stopPropagation()}>
              {/* Close Button */}
              <button 
                onClick={() => setSelectedPhoto(null)}
                className="absolute right-4 top-4 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors shadow z-10 focus:outline-none"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              {/* Full Image */}
              <img src={selectedPhoto} alt="Zoomed Selfie" className="w-full h-auto max-h-[80vh] object-contain" />
            </div>
          </div>
        )}
      </div>
    )
  }

  const handlePhotoClickList = (url) => {
    setSelectedPhoto(url)
  }
  
  const handlePhotoTouchStartList = (url) => {
    pressTimerRef.current = setTimeout(() => {
      setSelectedPhoto(url)
    }, 500)
  }
  
  const handlePhotoTouchEndList = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
    }
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
      
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Riwayat Kehadiran</h3>
          <p className="text-sm text-slate-500 mt-0.5">Pantau catatan presensi harian Anda</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow w-full sm:w-auto"
          />
          <span className="text-slate-400 font-bold text-sm hidden sm:block">s/d</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-500">Memuat data riwayat...</p>
          </div>
        ) : presensiList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h4 className="font-bold text-slate-700">Belum Ada Presensi</h4>
            <p className="text-sm text-slate-500 mt-1">Anda belum memiliki catatan presensi di bulan ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(() => {
              const dates = effectiveDates
              if (dates.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Tidak ada sesi presensi yang aktif pada rentang tanggal tersebut.
                  </div>
                )
              }

              return dates.map(tanggal => {
                const records = presensiList.filter(r => r.tanggal === tanggal)
                const tglStr = new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                
                // Tentukan status utama
                const masukRecord = records.find(r => r.tipe === 'masuk' || !r.tipe)
                let s = { label: 'Belum Presensi', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
                
                if (masukRecord) {
                  s = STATUS_LABELS[masukRecord.status] ? { label: STATUS_LABELS[masukRecord.status], cls: STATUS_COLORS[masukRecord.status] } : { label: masukRecord.status, cls: 'bg-slate-100 text-slate-700' }
                }

                return (
                  <div key={tanggal} className="flex flex-col">
                    <button 
                      onClick={() => {
                        setSelectedPresensiDate(tanggal)
                        const recs = presensiList.filter(r => r.tanggal === tanggal)
                        const hasM = recs.some(r => r.tipe === 'masuk' || !r.tipe)
                        const hasP = recs.some(r => r.tipe === 'pulang')
                        if (hasM) setActiveSubTipe('masuk')
                        else if (hasP) setActiveSubTipe('pulang')
                        else setActiveSubTipe('masuk')
                      }}
                      className="w-full flex items-center justify-between p-4 sm:p-5 transition-colors hover:bg-slate-50 bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span className="font-bold text-slate-800 text-sm sm:text-base">{tglStr}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 text-xs font-bold rounded-md border ${s.cls}`}>{s.label}</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                      </div>
                    </button>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* Modal Pop-up Foto untuk List View jika ada */}
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
