import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { getTodayWIB, getServerNow } from '../utils/dateUtils'
import { sortKelasList, getDefaultKelas } from '../utils/kelasHelper'

// Daftar nama bulan dalam Bahasa Indonesia
const BULAN_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const HARI_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

const STATUS_CONFIG = {
  H: { label: 'Hadir', short: 'H', bg: 'bg-emerald-500', text: 'text-white', lightBg: 'bg-emerald-50', lightText: 'text-emerald-700', border: 'border-emerald-200' },
  T: { label: 'Terlambat', short: 'T', bg: 'bg-amber-500', text: 'text-white', lightBg: 'bg-amber-50', lightText: 'text-amber-700', border: 'border-amber-200' },
  S: { label: 'Sakit', short: 'S', bg: 'bg-blue-500', text: 'text-white', lightBg: 'bg-blue-50', lightText: 'text-blue-700', border: 'border-blue-200' },
  I: { label: 'Izin', short: 'I', bg: 'bg-purple-500', text: 'text-white', lightBg: 'bg-purple-50', lightText: 'text-purple-700', border: 'border-purple-200' },
  A: { label: 'Alpa', short: 'A', bg: 'bg-rose-500', text: 'text-white', lightBg: 'bg-rose-50', lightText: 'text-rose-700', border: 'border-rose-200' },
}

export default function PresensiMatriksRekapSection({
  session,
  activeTa,
  initialKelas = '',
  allowedClasses = null,
  isWaliMode = false,
  onDataChanged
}) {
  const todayStr = getTodayWIB()
  const now = getServerNow()

  // State Periode Bulan & Tahun
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => now.getMonth() + 1) // 1 - 12
  const [selectedKelas, setSelectedKelas] = useState(() => {
    if (allowedClasses && allowedClasses.length > 0) {
      if (initialKelas && allowedClasses.includes(initialKelas)) return initialKelas
      return allowedClasses[0]
    }
    if (initialKelas && initialKelas !== 'Semua Kelas' && !/^(10|test|uji|dummy|trial)/i.test(initialKelas)) return initialKelas
    if (session?.kelas && session.kelas.length > 0) return session.kelas[0].kelas
    return '7A'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filterHanyaEntriPiket, setFilterHanyaEntriPiket] = useState(false)
  const [filterHanyaTidakHadir, setFilterHanyaTidakHadir] = useState(false)

  // Full Screen Table View & Mobile Filter States
  const [isTableFullscreen, setIsTableFullscreen] = useState(false)
  const [showFsFilterDropdown, setShowFsFilterDropdown] = useState(false)
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)

  // Rekap Total Pop-up States
  const [showRekapTotalModal, setShowRekapTotalModal] = useState(false)
  const [rekapSearch, setRekapSearch] = useState('')
  const [copiedRekap, setCopiedRekap] = useState(false)

  // Mode Tampilan: 'bulanan' | 'ringkasan_semester'
  const [viewTab, setViewTab] = useState('bulanan')

  // Data States
  const [loading, setLoading] = useState(true)
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [semuaKelas, setSemuaKelas] = useState([])
  const [presensiMap, setPresensiMap] = useState({}) // key: `${nisn}_${tanggal}` => record
  const [totalRecordsLoaded, setTotalRecordsLoaded] = useState(0)

  // Koreksi Modal State
  const [editingCell, setEditingCell] = useState(null) // { student, tanggal, currentRecord }
  const [newStatus, setNewStatus] = useState('H')
  const [keteranganKoreksi, setKeteranganKoreksi] = useState('')
  const [isSavingKoreksi, setIsSavingKoreksi] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }, [])

  // ─── 1. Hitung Hari dalam Bulan Terpilih ────────────────────────────────────
  const daysInMonth = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate()
    const days = []
    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(selectedYear, selectedMonth - 1, day)
      const dayOfWeek = dateObj.getDay() // 0 = Min, 6 = Sab
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({
        dayNumber: day,
        dateStr,
        dayName: HARI_SHORT[dayOfWeek],
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isSunday: dayOfWeek === 0,
        isToday: dateStr === todayStr,
      })
    }
    return days
  }, [selectedYear, selectedMonth, todayStr])

  // ─── 2. Fetch Siswa & Kelas Sesuai Tahun Ajaran ─────────────────────────────
  useEffect(() => {
    let isMounted = true
    const loadStudents = async () => {
      try {
        let allStudents = []
        let from = 0
        let to = 999
        let hasMore = true

        while (hasMore) {
          let query = supabase
            .from('siswa_lengkap')
            .select('nisn, nama_lengkap, kelas')
            .eq('is_aktif', true)
            .order('kelas', { ascending: true })
            .order('nama_lengkap', { ascending: true })
            .range(from, to)

          if (allowedClasses && allowedClasses.length > 0) {
            query = query.in('kelas', allowedClasses)
          } else if (activeTa?.id) {
            query = query.eq('tahun_ajaran_id', activeTa.id)
          }

          const { data, error } = await query
          if (error) {
            console.warn('[MatriksPresensi] Error fetching students with activeTa, retrying fallback:', error)
            let fallback = supabase
              .from('siswa_lengkap')
              .select('nisn, nama_lengkap, kelas')
              .eq('is_aktif', true)
              .order('kelas', { ascending: true })
              .order('nama_lengkap', { ascending: true })
              .range(from, to)
            if (allowedClasses && allowedClasses.length > 0) {
              fallback = fallback.in('kelas', allowedClasses)
            }
            const fallbackRes = await fallback
            if (fallbackRes.error) throw fallbackRes.error
            if (!fallbackRes.data || fallbackRes.data.length === 0) {
              hasMore = false
            } else {
              allStudents = [...allStudents, ...fallbackRes.data]
              if (fallbackRes.data.length < 1000) hasMore = false
              else { from += 1000; to += 1000 }
            }
          } else if (!data || data.length === 0) {
            hasMore = false
          } else {
            allStudents = [...allStudents, ...data]
            if (data.length < 1000) hasMore = false
            else { from += 1000; to += 1000 }
          }
        }

        if (isMounted) {
          let filtered = allStudents
          if (allowedClasses && allowedClasses.length > 0) {
            filtered = allStudents.filter(s => allowedClasses.includes(s.kelas))
          }
          setSemuaSiswa(filtered)
          const classes = sortKelasList([...new Set(filtered.map(s => s.kelas).filter(Boolean))])
          setSemuaKelas(classes)
          setSelectedKelas(prev => {
            if (allowedClasses && allowedClasses.length > 0) {
              if (prev && classes.includes(prev)) return prev
              if (initialKelas && classes.includes(initialKelas)) return initialKelas
              return classes[0] || ''
            }
            if (prev && prev !== 'Semua Kelas' && classes.includes(prev) && !/^(10|test|uji|dummy|trial)/i.test(prev)) return prev
            if (initialKelas && classes.includes(initialKelas) && !/^(10|test|uji|dummy|trial)/i.test(initialKelas)) return initialKelas
            return getDefaultKelas(classes, session)
          })
        }
      } catch (err) {
        console.error('Gagal memuat siswa matriks presensi:', err)
      }
    }

    loadStudents()
    return () => { isMounted = false }
  }, [activeTa?.id, initialKelas, allowedClasses])

  // ─── 3. Fetch Data Presensi untuk Bulan / Semester ──────────────────────────
  const fetchPresensiBulan = useCallback(async () => {
    setLoading(true)
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate()
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      let records = []
      let from = 0
      let to = 999
      let hasMore = true

      while (hasMore) {
        let query = supabase
          .from('presensi_harian')
          .select('id, tanggal, siswa_nisn, status, tipe, metode, waktu, keterangan, diinput_oleh')
          .gte('tanggal', startDate)
          .lte('tanggal', endDate)
          .range(from, to)

        if (selectedKelas && selectedKelas !== 'Semua Kelas') {
          query = query.eq('kelas', selectedKelas)
        } else if (allowedClasses && allowedClasses.length > 0) {
          query = query.in('kelas', allowedClasses)
        }

        const { data, error } = await query
        if (error) throw error

        if (!data || data.length === 0) {
          hasMore = false
        } else {
          records = [...records, ...data]
          if (data.length < 1000) hasMore = false
          else { from += 1000; to += 1000 }
        }
      }

      // Bangun Dictionary Lookup: `${siswa_nisn}_${tanggal}`
      const map = {}
      records.forEach(r => {
        // Prioritaskan presensi tipe 'masuk' jika ada ganda (masuk & pulang)
        const key = `${r.siswa_nisn}_${r.tanggal}`
        if (!map[key] || r.tipe === 'masuk') {
          map[key] = r
        }
      })

      setPresensiMap(map)
      setTotalRecordsLoaded(records.length)
    } catch (err) {
      console.error('Gagal memuat data presensi matriks:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedYear, selectedMonth, selectedKelas])

  useEffect(() => {
    fetchPresensiBulan()
  }, [fetchPresensiBulan])

  // ─── 4. Realtime Listener agar Selalu Tersinkron ─────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`matriks_presensi_${selectedYear}_${selectedMonth}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian' }, (payload) => {
        const record = payload.new || payload.old
        if (record && record.tanggal) {
          const recMonth = parseInt(record.tanggal.split('-')[1], 10)
          const recYear = parseInt(record.tanggal.split('-')[0], 10)
          if (recMonth === selectedMonth && recYear === selectedYear) {
            // Update realtime optimistik
            setPresensiMap(prev => {
              const key = `${record.siswa_nisn}_${record.tanggal}`
              const copy = { ...prev }
              if (payload.eventType === 'DELETE') {
                delete copy[key]
              } else if (payload.new) {
                copy[key] = payload.new
              }
              return copy
            })
          }
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedYear, selectedMonth])


  // ─── 5. Filter Siswa yang Ditampilkan ───────────────────────────────────────
  const displayedStudents = useMemo(() => {
    return semuaSiswa.filter(student => {
      // Filter Kelas
      if (selectedKelas && selectedKelas !== 'Semua Kelas' && student.kelas !== selectedKelas) {
        return false
      }

      // Filter Pencarian
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNama = student.nama_lengkap?.toLowerCase().includes(q)
        const matchNisn = student.nisn?.includes(q)
        if (!matchNama && !matchNisn) return false
      }

      // Filter Khusus 1: Hanya siswa yang memiliki entri manual piket di bulan ini
      if (filterHanyaEntriPiket) {
        const hasPiketEntry = daysInMonth.some(d => {
          const rec = presensiMap[`${student.nisn}_${d.dateStr}`]
          return rec && (rec.metode === 'manual_piket' || rec.metode === 'susulan_piket')
        })
        if (!hasPiketEntry) return false
      }

      // Filter Khusus 2: Hanya siswa yang pernah tidak hadir (S, I, A) di bulan ini
      if (filterHanyaTidakHadir) {
        const hasAbsent = daysInMonth.some(d => {
          const rec = presensiMap[`${student.nisn}_${d.dateStr}`]
          return rec && (rec.status === 'S' || rec.status === 'I' || rec.status === 'A')
        })
        if (!hasAbsent) return false
      }

      return true
    })
  }, [semuaSiswa, selectedKelas, searchQuery, filterHanyaEntriPiket, filterHanyaTidakHadir, daysInMonth, presensiMap])

  // ─── 6. Hitung Ringkasan Kehadiran per Siswa ────────────────────────────────
  const studentSummaries = useMemo(() => {
    const summary = {}
    const effectiveDaysCount = daysInMonth.filter(d => !d.isWeekend).length

    displayedStudents.forEach(student => {
      let h = 0, t = 0, s = 0, i = 0, a = 0, piketCount = 0

      daysInMonth.forEach(d => {
        const rec = presensiMap[`${student.nisn}_${d.dateStr}`]
        if (!rec) return

        if (rec.status === 'H') h++
        else if (rec.status === 'T') { h++; t++ }
        else if (rec.status === 'S') s++
        else if (rec.status === 'I') i++
        else if (rec.status === 'A') a++

        if (rec.metode === 'manual_piket' || rec.metode === 'susulan_piket') {
          piketCount++
        }
      })

      const totalHadirEfektif = h // Hadir + Terlambat dihitung hadir
      const persen = effectiveDaysCount > 0 ? Math.min(100, Math.round((totalHadirEfektif / effectiveDaysCount) * 100)) : 0

      summary[student.nisn] = {
        h, t, s, i, a,
        piketCount,
        persen,
        totalTidakHadir: s + i + a
      }
    })

    return summary
  }, [displayedStudents, daysInMonth, presensiMap])

  // ─── 7. Quick Cell Click Handler (Buka Dialog Koreksi) ───────────────────────
  const handleOpenKoreksi = (student, day) => {
    const currentRec = presensiMap[`${student.nisn}_${day.dateStr}`] || null
    setEditingCell({
      student,
      day,
      currentRecord: currentRec
    })
    setNewStatus(currentRec?.status || 'H')
    setKeteranganKoreksi(currentRec?.keterangan || '')
  }

  // ─── 8. Simpan Koreksi ke Database ──────────────────────────────────────────
  const handleSaveKoreksi = async () => {
    if (!editingCell) return
    const { student, day, currentRecord } = editingCell
    setIsSavingKoreksi(true)

    try {
      const isReset = newStatus === 'KOSONG'

      if (isReset) {
        // Hapus rekaman presensi
        const { error } = await supabase
          .from('presensi_harian')
          .delete()
          .eq('tanggal', day.dateStr)
          .eq('siswa_nisn', student.nisn)
          .eq('tipe', 'masuk')

        if (error) throw error

        // Update state lokal seketika
        setPresensiMap(prev => {
          const copy = { ...prev }
          delete copy[`${student.nisn}_${day.dateStr}`]
          return copy
        })

        showToast(`🗑️ Status presensi ${student.nama_lengkap} pada ${day.dayNumber} ${BULAN_NAMES[selectedMonth - 1]} direset (kosong).`)
      } else {
        // Simpan / update status baru
        const userNama = session?.nama_guru || session?.nama_lengkap || 'Petugas'
        const ketStr = keteranganKoreksi.trim() 
          ? keteranganKoreksi.trim()
          : `Koreksi hardfile oleh ${userNama}`

        const recordToSave = {
          tanggal: day.dateStr,
          tahun_ajaran_id: activeTa?.id || null,
          kelas: student.kelas || '-',
          siswa_nisn: student.nisn,
          status: newStatus,
          tipe: 'masuk',
          metode: currentRecord?.metode === 'manual_piket' ? 'koreksi_piket' : 'koreksi_hardfile',
          keterangan: ketStr,
          diinput_oleh: session?.id || null,
          diedit_oleh: session?.id || null,
          updated_at: new Date().toISOString()
        }

        const { error } = await supabase
          .from('presensi_harian')
          .upsert([recordToSave], { onConflict: 'tanggal,siswa_nisn,tipe' })

        if (error) throw error

        // Update state lokal seketika
        setPresensiMap(prev => ({
          ...prev,
          [`${student.nisn}_${day.dateStr}`]: recordToSave
        }))

        const labelStatus = STATUS_CONFIG[newStatus]?.label || newStatus
        showToast(`✅ ${student.nama_lengkap} (${day.dayNumber} ${BULAN_NAMES[selectedMonth - 1]}): Berhasil diubah ke ${labelStatus}!`)
      }

      setEditingCell(null)
      onDataChanged?.()
    } catch (err) {
      alert('Gagal menyimpan koreksi presensi: ' + err.message)
    } finally {
      setIsSavingKoreksi(false)
    }
  }

  // Navigasi Bulan
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear(y => y - 1)
    } else {
      setSelectedMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear(y => y + 1)
    } else {
      setSelectedMonth(m => m + 1)
    }
  }

  const handleCurrentMonth = () => {
    const cur = getServerNow()
    setSelectedYear(cur.getFullYear())
    setSelectedMonth(cur.getMonth() + 1)
  }

  // Handle lock body scroll saat mode layar penuh aktif
  useEffect(() => {
    if (isTableFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isTableFullscreen])

  // Handle tombol ESC untuk keluar layar penuh / menutup dropdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showFsFilterDropdown) {
          setShowFsFilterDropdown(false)
        } else if (isTableFullscreen) {
          setIsTableFullscreen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTableFullscreen, showFsFilterDropdown])

  // Hitung jumlah filter aktif untuk badge indikator
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count++
    if (filterHanyaEntriPiket) count++
    if (filterHanyaTidakHadir) count++
    return count
  }, [searchQuery, filterHanyaEntriPiket, filterHanyaTidakHadir])

  // ─── Shared Table Content Renderer ──────────────────────────────────────────
  const renderTableContent = (isFullscreen = false) => {
    return (
      <div 
        className={`overflow-x-auto overflow-y-auto ${isFullscreen ? 'flex-1 h-full' : 'max-h-[65vh] sm:max-h-[72vh]'} max-w-full custom-scrollbar touch-auto overscroll-contain relative border-t border-slate-200 bg-white`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Mobile Swipe Hint Bar */}
        <div className="sm:hidden px-3 py-1.5 bg-indigo-50/90 border-b border-indigo-100 text-[11px] text-indigo-700 font-bold flex items-center justify-between sticky top-0 z-30">
          <span className="flex items-center gap-1">
            <span>👉 Geser kanan (Tgl 1–{daysInMonth.length})</span>
          </span>
          {!isFullscreen && (
            <button
              type="button"
              onClick={() => setIsTableFullscreen(true)}
              className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
              <span>Layar Penuh</span>
            </button>
          )}
        </div>

        <table className="w-full text-left border-collapse text-xs touch-auto min-w-[700px] sm:min-w-[800px]">
          {/* Header Tabel Sticky */}
          <thead className="sticky top-0 z-30 bg-slate-100 shadow-xs">
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
              {/* 1. Kolom No (Lebar tetap pasti, bebas gap) */}
              <th className="p-1 sm:p-2 w-8 min-w-[32px] max-w-[32px] sm:w-10 sm:min-w-[40px] sm:max-w-[40px] text-center font-bold sticky left-0 z-30 bg-slate-100 border-r border-slate-200">
                No
              </th>

              {/* 2. Kolom Nama Siswa (Posisi pixel-perfect setelah No, ramping di HP) */}
              <th className="px-2 py-1.5 sm:p-2 w-[115px] min-w-[115px] max-w-[115px] sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px] font-bold sticky left-[32px] sm:left-[40px] z-30 bg-slate-100 border-r border-slate-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.12)]">
                Nama Siswa
              </th>

              {/* 3. Kolom Kelas (Disembunyikan di HP untuk hemat tempat) */}
              <th className="hidden sm:table-cell p-2 w-14 text-center font-bold border-r border-slate-200 bg-slate-100">
                Kelas
              </th>

              {/* Kolom Tanggal (1 ... 31) */}
              {daysInMonth.map((day) => (
                <th
                  key={day.dateStr}
                  className={`p-0.5 sm:p-1 w-7 min-w-[28px] max-w-[28px] sm:w-8 sm:min-w-[32px] sm:max-w-[32px] text-center border-r border-slate-200 font-bold transition-colors ${
                    day.isSunday
                      ? 'bg-rose-50 text-rose-600'
                      : day.isWeekend
                      ? 'bg-slate-100 text-slate-400'
                      : day.isToday
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400 inset-0'
                      : 'bg-slate-50 text-slate-700'
                  }`}
                  title={`${day.dayName}, ${day.dayNumber} ${BULAN_NAMES[selectedMonth - 1]} ${selectedYear}`}
                >
                  <div className="text-[10px] sm:text-[11px] font-black leading-tight">{day.dayNumber}</div>
                  <div className="text-[7px] sm:text-[8px] font-medium uppercase tracking-tight text-slate-400 leading-tight">
                    {day.dayName}
                  </div>
                </th>
              ))}

              {/* Kolom Ringkasan di Ujung Kanan */}
              <th className="p-1 sm:p-1.5 w-7 sm:w-9 text-center font-black bg-emerald-50 text-emerald-800 border-r border-slate-200" title="Total Hadir">
                H
              </th>
              <th className="p-1 sm:p-1.5 w-7 sm:w-9 text-center font-black bg-amber-50 text-amber-800 border-r border-slate-200" title="Total Terlambat">
                T
              </th>
              <th className="p-1 sm:p-1.5 w-7 sm:w-9 text-center font-black bg-blue-50 text-blue-800 border-r border-slate-200" title="Total Sakit">
                S
              </th>
              <th className="p-1 sm:p-1.5 w-7 sm:w-9 text-center font-black bg-purple-50 text-purple-800 border-r border-slate-200" title="Total Izin">
                I
              </th>
              <th className="p-1 sm:p-1.5 w-7 sm:w-9 text-center font-black bg-rose-50 text-rose-800 border-r border-slate-200" title="Total Alpa (Termasuk Tidak Presensi)">
                A
              </th>
              <th className="p-1 sm:p-1.5 w-9 sm:w-12 text-center font-black bg-indigo-50 text-indigo-900" title="Persentase Kehadiran">
                %
              </th>
            </tr>
          </thead>

          {/* Body Baris Siswa */}
          <tbody className="divide-y divide-slate-100 font-medium">
            {displayedStudents.map((student, idx) => {
              const summary = studentSummaries[student.nisn] || { h: 0, t: 0, s: 0, i: 0, a: 0, persen: 0 }

              return (
                <tr key={student.nisn} className="group hover:bg-slate-50/80 transition-colors">
                  {/* 1. Kolom No (Solid opaque background) */}
                  <td className="p-1 sm:p-2 w-8 min-w-[32px] max-w-[32px] sm:w-10 sm:min-w-[40px] sm:max-w-[40px] text-center text-slate-400 font-mono text-[10px] sm:text-[11px] sticky left-0 z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200">
                    {idx + 1}
                  </td>

                  {/* 2. Kolom Nama Siswa (Solid opaque background, truncate di HP, bayangan pemisah) */}
                  <td className="px-2 py-1.5 sm:p-2 w-[115px] min-w-[115px] max-w-[115px] sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px] sticky left-[32px] sm:left-[40px] z-20 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[3px_0_6px_-2px_rgba(0,0,0,0.12)]">
                    <div className="font-bold text-slate-800 text-[11px] sm:text-xs truncate" title={student.nama_lengkap}>
                      {student.nama_lengkap}
                    </div>
                    <div className="hidden sm:block text-[10px] text-slate-400 font-mono">
                      {student.nisn}
                    </div>
                  </td>

                  {/* 3. Kolom Kelas (Disembunyikan di HP) */}
                  <td className="hidden sm:table-cell p-2 text-center text-slate-600 font-bold border-r border-slate-200">
                    {student.kelas || '-'}
                  </td>

                  {/* 4. Kolom Hari 1 s/d 31 */}
                  {daysInMonth.map((day) => {
                    const rec = presensiMap[`${student.nisn}_${day.dateStr}`]
                    const status = rec?.status || null
                    const isPiket = rec?.metode === 'manual_piket' || rec?.metode === 'susulan_piket'
                    const isKoreksi = rec?.metode === 'koreksi_piket' || rec?.metode === 'koreksi_hardfile'
                    const cfg = status ? STATUS_CONFIG[status] : null

                    return (
                      <td
                        key={day.dateStr}
                        onClick={() => handleOpenKoreksi(student, day)}
                        className={`p-0.5 text-center border-r transition-all cursor-pointer relative group/cell ${
                          day.isSunday
                            ? 'bg-rose-50/40 border-slate-100'
                            : day.isWeekend
                            ? 'bg-slate-50/40 border-slate-100'
                            : 'bg-white hover:bg-indigo-50/60 border-slate-100'
                        }`}
                        title={`Klik untuk ubah: ${student.nama_lengkap} (${day.dayNumber} ${BULAN_NAMES[selectedMonth - 1]})\nStatus: ${cfg?.label || 'Belum Presensi'}${isPiket ? ' (Diinput Manual Piket)' : ''}${rec?.keterangan ? ' - ' + rec.keterangan : ''}`}
                      >
                        <div className="w-full h-7 flex items-center justify-center relative">
                          {cfg ? (
                            <span
                              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md font-black text-[9px] sm:text-[10px] flex items-center justify-center shadow-2xs transition-transform group-hover/cell:scale-110 ${cfg.bg} ${cfg.text} ${
                                isPiket ? 'ring-2 ring-amber-400 ring-offset-1' : ''
                              }`}
                            >
                              {cfg.short}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold text-[10px] group-hover/cell:text-indigo-400">-</span>
                          )}

                          {/* Indikator Badge Piket */}
                          {isPiket && (
                            <span
                              className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 text-slate-900 rounded-full text-[7px] font-black flex items-center justify-center shadow-xs"
                              title="Diinput oleh Piket (Verifikasi dengan Hardfile)"
                            >
                              •
                            </span>
                          )}

                          {/* Indikator Badge Koreksi */}
                          {isKoreksi && (
                            <span
                              className="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"
                              title="Telah dikoreksi sesuai hardfile"
                            ></span>
                          )}
                        </div>
                      </td>
                    )
                  })}

                  {/* 5. Kolom Ringkasan Total */}
                  <td className="p-1 sm:p-1.5 text-center font-bold text-emerald-700 bg-emerald-50/30 border-r border-slate-200 text-xs">
                    {summary.h}
                  </td>
                  <td className="p-1 sm:p-1.5 text-center font-bold text-amber-700 bg-amber-50/30 border-r border-slate-200 text-xs">
                    {summary.t > 0 ? summary.t : '-'}
                  </td>
                  <td className="p-1 sm:p-1.5 text-center font-bold text-blue-700 bg-blue-50/30 border-r border-slate-200 text-xs">
                    {summary.s > 0 ? summary.s : '-'}
                  </td>
                  <td className="p-1 sm:p-1.5 text-center font-bold text-purple-700 bg-purple-50/30 border-r border-slate-200 text-xs">
                    {summary.i > 0 ? summary.i : '-'}
                  </td>
                  <td className="p-1 sm:p-1.5 text-center font-bold text-rose-700 bg-rose-50/30 border-r border-slate-200 text-xs">
                    {summary.a > 0 ? summary.a : '-'}
                  </td>
                  <td className={`p-1 sm:p-1.5 text-center font-black text-[10px] sm:text-[11px] ${
                    summary.persen < 75 ? 'text-rose-600 bg-rose-50/50' : 'text-indigo-900 bg-indigo-50/30'
                  }`}>
                    {summary.persen}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 font-sans animate-fade-in text-slate-800">
      {/* ─── Top Control Card ──────────────────────────────────────────────── */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3 sm:gap-4">
        {/* === TAMPILAN DESKTOP (Spacious Layout) === */}
        <div className="hidden sm:flex flex-col gap-4">
          {/* Row 1: Header & Navigasi Bulan */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Matriks Rekapitulasi Presensi Siswa
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                  Audit &amp; Rekonsiliasi Hardfile
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Format grid bulanan seperti buku absen fisik. Klik sel tanggal untuk mengoreksi status presensi siswa secara langsung.
              </p>
            </div>

            {/* Month Navigator Controls */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 self-start lg:self-auto">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-xl transition-all shadow-2xs cursor-pointer"
                title="Bulan Sebelumnya"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>

              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {BULAN_NAMES.map((bName, idx) => (
                  <option key={idx + 1} value={idx + 1}>{bName}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-xl transition-all shadow-2xs cursor-pointer"
                title="Bulan Berikutnya"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>

              <button
                onClick={handleCurrentMonth}
                className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors ml-1 cursor-pointer"
                title="Kembali ke Bulan Berjalan"
              >
                Hari Ini
              </button>
            </div>
          </div>

          {/* Row 2: Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              {/* Filter Kelas */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500">Kelas:</span>
                <select
                  value={selectedKelas}
                  onChange={(e) => setSelectedKelas(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  {semuaKelas.map(k => (
                    <option key={k} value={k}>Kelas {k}</option>
                  ))}
                  {!isWaliMode && <option value="Semua Kelas">Semua Kelas (Seluruh Siswa)</option>}
                  {isWaliMode && semuaKelas.length > 1 && <option value="Semua Kelas">Semua Kelas Perwalian</option>}
                </select>
              </div>

              {/* Search Input */}
              <div className="relative min-w-[180px] max-w-xs flex-1">
                <input
                  type="text"
                  placeholder="Cari nama siswa atau NISN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Quick Toggle Filter: Hanya Entri Piket */}
              <button
                onClick={() => setFilterHanyaEntriPiket(!filterHanyaEntriPiket)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  filterHanyaEntriPiket
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title="Hanya tampilkan siswa yang memiliki status diinput manual oleh guru piket"
              >
                <span>📌</span>
                <span>Sorot Input Piket</span>
              </button>

              {/* Quick Toggle Filter: Hanya yang Pernah Tidak Hadir */}
              <button
                onClick={() => setFilterHanyaTidakHadir(!filterHanyaTidakHadir)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  filterHanyaTidakHadir
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title="Hanya tampilkan siswa yang ada catatan Sakit / Izin / Alpa"
              >
                <span>⚠️</span>
                <span>Hanya S / I / A</span>
              </button>
            </div>

            {/* Quick Actions (Rekap Total / Print / Refresh / Fullscreen) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRekapTotalModal(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Tampilkan pop-up ringkasan akumulasi total S, I, A per siswa"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Rekap Total (S/I/A)</span>
              </button>

              <button
                onClick={fetchPresensiBulan}
                disabled={loading}
                className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl transition-all shadow-2xs cursor-pointer"
                title="Muat Ulang Data"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Cetak format tabel matriks bulanan"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                <span>Cetak</span>
              </button>

              {/* Tombol Layar Penuh Tabel di Desktop */}
              <button
                type="button"
                onClick={() => setIsTableFullscreen(true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ring-1 ring-indigo-500"
                title="Buka tabel dalam mode layar penuh (Fokus maksimal)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                </svg>
                <span>Layar Penuh</span>
              </button>
            </div>
          </div>

          {/* Row 3: Legend Status & Keterangan Badge */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-500 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Legenda:</span>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-emerald-500 text-white font-black text-[10px] flex items-center justify-center">H</span><span>Hadir</span></div>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-500 text-white font-black text-[10px] flex items-center justify-center">T</span><span>Terlambat</span></div>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-500 text-white font-black text-[10px] flex items-center justify-center">S</span><span>Sakit</span></div>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-purple-500 text-white font-black text-[10px] flex items-center justify-center">I</span><span>Izin</span></div>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-rose-500 text-white font-black text-[10px] flex items-center justify-center">A</span><span>Alpa</span></div>
            <div className="flex items-center gap-1"><span className="w-4 h-4 rounded border-2 border-dashed border-amber-500 bg-amber-50 text-amber-900 font-bold text-[9px] flex items-center justify-center">📌</span><span>Manual Piket</span></div>
            <span className="ml-auto text-slate-400">
              {selectedKelas === 'Semua Kelas' ? 'Semua Kelas' : `Kelas ${selectedKelas}`} • {displayedStudents.length} siswa • {totalRecordsLoaded} data presensi
            </span>
          </div>
        </div>

        {/* === TAMPILAN KHUSUS HP (Compact, Collapsible & Ergonomis) === */}
        <div className="sm:hidden flex flex-col gap-2.5">
          {/* Header Baris 1: Judul Ringkas */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-lg">📊</span>
              <h3 className="text-sm font-black text-slate-900 tracking-tight truncate">
                Matriks Presensi
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-700 shrink-0">
              Audit Hardfile
            </span>
          </div>

          {/* Baris 2: Stepper Bulan & Pemilihan Kelas dalam 1 Baris */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            {/* Navigasi Bulan Cepat */}
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-white text-slate-600 rounded-lg transition-colors cursor-pointer"
              title="Bulan Lalu"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="flex-1 py-1 px-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              {BULAN_NAMES.map((bName, idx) => (
                <option key={idx + 1} value={idx + 1}>{bName.slice(0, 3)}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="py-1 px-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-white text-slate-600 rounded-lg transition-colors cursor-pointer"
              title="Bulan Berikutnya"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>

            {/* Pilihan Kelas */}
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="py-1 px-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-black outline-none cursor-pointer shrink-0"
            >
              {semuaKelas.map(k => (
                <option key={k} value={k}>Kls {k}</option>
              ))}
              {!isWaliMode && <option value="Semua Kelas">Semua Kls</option>}
              {isWaliMode && semuaKelas.length > 1 && <option value="Semua Kelas">Semua Wali</option>}
            </select>
          </div>

          {/* Baris 3: Tombol Aksi Cepat HP (Filter Toggle, Rekap, dan Layar Penuh) */}
          <div className="flex items-center gap-1.5">
            {/* Toggle Filter Dropdown Collapsible */}
            <button
              type="button"
              onClick={() => setIsMobileControlsOpen(prev => !prev)}
              className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                isMobileControlsOpen || activeFilterCount > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>🔍</span>
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <svg className={`w-3 h-3 transition-transform ${isMobileControlsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>

            {/* Quick Rekap Button */}
            <button
              type="button"
              onClick={() => setShowRekapTotalModal(true)}
              className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <span>📊</span>
              <span>Rekap</span>
            </button>

            {/* Tombol Utama Layar Penuh di HP */}
            <button
              type="button"
              onClick={() => setIsTableFullscreen(true)}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ring-1 ring-indigo-400"
              title="Perbesar tampilan tabel penuh di layar HP"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
              </svg>
              <span>Layar Penuh</span>
            </button>
          </div>

          {/* Panel Filter yang Bisa Dibuka/Tutup di HP */}
          {isMobileControlsOpen && (
            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-col gap-2.5 animate-slide-up text-xs">
              {/* Input Pencarian Siswa */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari nama siswa atau NISN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Toggles Piket & SIA */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterHanyaEntriPiket(!filterHanyaEntriPiket)}
                  className={`p-1.5 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1 transition-all ${
                    filterHanyaEntriPiket
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <span>📌</span>
                  <span>Input Piket</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterHanyaTidakHadir(!filterHanyaTidakHadir)}
                  className={`p-1.5 rounded-lg text-[11px] font-bold border flex items-center justify-center gap-1 transition-all ${
                    filterHanyaTidakHadir
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <span>⚠️</span>
                  <span>Hanya S/I/A</span>
                </button>
              </div>

              {/* Tombol Muat Ulang & Cetak */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={fetchPresensiBulan}
                  disabled={loading}
                  className="flex-1 py-1 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1"
                >
                  <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-1 px-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1"
                >
                  <span>🖨️</span>
                  <span>Cetak</span>
                </button>
              </div>

              {/* Legenda Ringkas di HP */}
              <div className="pt-1 border-t border-slate-200">
                <span className="font-extrabold text-[9px] text-slate-400 uppercase tracking-wider block mb-1">Legenda:</span>
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-600">
                  <span className="flex items-center gap-0.5"><span className="w-3.5 h-3.5 rounded bg-emerald-500 text-white font-black flex items-center justify-center text-[9px]">H</span> Hadir</span>
                  <span className="flex items-center gap-0.5"><span className="w-3.5 h-3.5 rounded bg-amber-500 text-white font-black flex items-center justify-center text-[9px]">T</span> Terlambat</span>
                  <span className="flex items-center gap-0.5"><span className="w-3.5 h-3.5 rounded bg-blue-500 text-white font-black flex items-center justify-center text-[9px]">S</span> Sakit</span>
                  <span className="flex items-center gap-0.5"><span className="w-3.5 h-3.5 rounded bg-purple-500 text-white font-black flex items-center justify-center text-[9px]">I</span> Izin</span>
                  <span className="flex items-center gap-0.5"><span className="w-3.5 h-3.5 rounded bg-rose-500 text-white font-black flex items-center justify-center text-[9px]">A</span> Alpa</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Grid Table (Normal View) ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs font-bold text-slate-700">Memuat matriks presensi bulan {BULAN_NAMES[selectedMonth - 1]} {selectedYear}...</p>
            <p className="text-[11px] text-slate-400 mt-1">Mengambil data kehadiran siswa per hari...</p>
          </div>
        ) : displayedStudents.length === 0 ? (
          <div className="py-20 text-center px-4">
            <p className="text-sm font-bold text-slate-700">Tidak ada siswa yang sesuai kriteria filter.</p>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan pilihan kelas atau bersihkan kata kunci pencarian.</p>
          </div>
        ) : (
          renderTableContent(false)
        )}
      </div>

      {/* ─── FULL SCREEN TABLE OVERLAY MODAL (PORTAL) ──────────────────────── */}
      {isTableFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[220] bg-white flex flex-col font-sans animate-fade-in w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
          {/* Header Layar Penuh (Sleek Compact Toolbar) */}
          <header className="bg-slate-900 text-white px-3 sm:px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] flex items-center justify-between gap-2 shadow-md shrink-0 z-40 app-header-safe ios-fullscreen-header">
            {/* Kiri: Judul, Kelas, & Stepper Bulan */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-base sm:text-lg">📊</span>
                <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white hidden xs:inline">
                  Matriks Presensi
                </span>
              </div>

              <span className="px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shrink-0">
                Kelas {selectedKelas}
              </span>

              {/* Stepper Bulan Cepat di Header Layar Penuh */}
              <div className="flex items-center gap-0.5 bg-slate-800 px-1 py-0.5 rounded-lg border border-slate-700 shrink-0">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Bulan Sebelumnya"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-[11px] font-bold text-white px-1">
                  {BULAN_NAMES[selectedMonth - 1]?.slice(0, 3)} {selectedYear}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700 transition-colors cursor-pointer"
                  title="Bulan Berikutnya"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>

            {/* Kanan: Dropdown Filter, Tombol Rekap, & Tombol Tutup Layar Penuh */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Tombol Pemicu Dropdown Filter */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFsFilterDropdown(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    showFsFilterDropdown
                      ? 'bg-indigo-600 text-white border-indigo-500 ring-2 ring-indigo-400'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Atur filter kelas, pencarian, dan opsi lainnya"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="hidden sm:inline">Filter &amp; Opsi</span>
                  <span className="sm:hidden">Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-900 text-[9px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                  <svg className={`w-3 h-3 transition-transform ${showFsFilterDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                </button>

                {/* MODAL / DROPDOWN FILTER DI MODE FULL SCREEN */}
                {showFsFilterDropdown && (
                  <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-80 max-w-sm bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-slide-up max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                      <h4 className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                        <span>⚙️</span>
                        <span>Filter &amp; Pengaturan Matriks</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowFsFilterDropdown(false)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* 1. Pilih Kelas */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Pilih Kelas:</label>
                        <select
                          value={selectedKelas}
                          onChange={(e) => setSelectedKelas(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          {semuaKelas.map(k => (
                            <option key={k} value={k}>Kelas {k}</option>
                          ))}
                          {!isWaliMode && <option value="Semua Kelas">Semua Kelas (Seluruh Siswa)</option>}
                          {isWaliMode && semuaKelas.length > 1 && <option value="Semua Kelas">Semua Kelas Perwalian</option>}
                        </select>
                      </div>

                      {/* 2. Pilih Bulan & Tahun */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Bulan:</label>
                          <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            {BULAN_NAMES.map((bName, idx) => (
                              <option key={idx + 1} value={idx + 1}>{bName}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Tahun:</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 3. Pencarian Nama / NISN */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">Cari Siswa:</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Nama siswa atau NISN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                          />
                          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery('')}
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 4. Quick Toggles */}
                      <div className="space-y-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setFilterHanyaEntriPiket(!filterHanyaEntriPiket)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-between cursor-pointer ${
                            filterHanyaEntriPiket
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>📌</span>
                            <span>Sorot Input Piket</span>
                          </span>
                          <span className="text-[10px]">{filterHanyaEntriPiket ? 'Aktif' : 'Mati'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFilterHanyaTidakHadir(!filterHanyaTidakHadir)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-between cursor-pointer ${
                            filterHanyaTidakHadir
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>⚠️</span>
                            <span>Hanya S / I / A</span>
                          </span>
                          <span className="text-[10px]">{filterHanyaTidakHadir ? 'Aktif' : 'Mati'}</span>
                        </button>
                      </div>

                      {/* 5. Tindakan Tambahan (Muat Ulang & Cetak) */}
                      <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            fetchPresensiBulan()
                            setShowFsFilterDropdown(false)
                          }}
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>🔄</span>
                          <span>Muat Ulang</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowFsFilterDropdown(false)
                            window.print()
                          }}
                          className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-1.5 border border-indigo-200 cursor-pointer"
                        >
                          <span>🖨️</span>
                          <span>Cetak</span>
                        </button>
                      </div>

                      {/* 6. Legenda Status Ringkas */}
                      <div className="pt-2 border-t border-slate-100">
                        <span className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider block mb-1.5">
                          Legenda Status:
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-emerald-500 text-white font-black flex items-center justify-center text-[9px]">H</span> Hadir</div>
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-amber-500 text-white font-black flex items-center justify-center text-[9px]">T</span> Terlambat</div>
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-blue-500 text-white font-black flex items-center justify-center text-[9px]">S</span> Sakit</div>
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-purple-500 text-white font-black flex items-center justify-center text-[9px]">I</span> Izin</div>
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded bg-rose-500 text-white font-black flex items-center justify-center text-[9px]">A</span> Alpa</div>
                          <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded border border-amber-500 bg-amber-50 text-amber-900 font-bold flex items-center justify-center text-[8px]">📌</span> Piket</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tombol Cepat Rekap Total di Header Layar Penuh */}
              <button
                type="button"
                onClick={() => setShowRekapTotalModal(true)}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                title="Rekapitulasi Total S, I, A"
              >
                <span>📊</span>
                <span className="hidden md:inline">Rekap</span>
              </button>

              {/* Tombol Tutup / Keluar Full Screen */}
              <button
                type="button"
                onClick={() => {
                  setIsTableFullscreen(false)
                  setShowFsFilterDropdown(false)
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer border border-rose-500"
                title="Keluar dari mode layar penuh (Esc)"
              >
                <span className="text-sm">✕</span>
                <span className="hidden sm:inline">Keluar Layar Penuh</span>
                <span className="sm:hidden">Keluar</span>
              </button>
            </div>
          </header>

          {/* Tabel Mengisi 100% Sisa Ruang Layar Penuh */}
          <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col bg-white">
            {renderTableContent(true)}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Modal Popover Koreksi Status (Inline Quick Edit) ──────────────── */}
      {editingCell && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-indigo-50 via-slate-50 to-amber-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="font-black text-base text-slate-800 flex items-center gap-2">
                  <span>✏️</span>
                  <span>Koreksi Presensi Siswa</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuaikan dengan buku absen fisik / surat izin hardfile.
                </p>
              </div>
              <button
                onClick={() => setEditingCell(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4">
              {/* Info Siswa & Tanggal */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{editingCell.student.nama_lengkap}</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700">
                    Kelas {editingCell.student.kelas}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  NISN: {editingCell.student.nisn}
                </div>
                <div className="text-xs font-bold text-indigo-900 pt-1 border-t border-slate-200 flex items-center gap-1.5">
                  <span>📅</span>
                  <span>
                    {editingCell.day.dayName}, {editingCell.day.dayNumber} {BULAN_NAMES[selectedMonth - 1]} {selectedYear}
                  </span>
                </div>

                {editingCell.currentRecord ? (
                  <div className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between">
                    <span>
                      Status Saat Ini: <strong>{STATUS_CONFIG[editingCell.currentRecord.status]?.label || editingCell.currentRecord.status}</strong>
                    </span>
                    {editingCell.currentRecord.metode === 'manual_piket' && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                        📌 Input Piket
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Status Saat Ini: <em>Belum Ada Presensi</em></span>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600">
                      Kosong
                    </span>
                  </div>
                )}
              </div>

              {/* Pilihan Status Baru (1-Klik) */}
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-2">
                  Pilih Status Kehadiran Baru:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'H', label: 'Hadir', bg: 'hover:bg-emerald-50 border-emerald-200', active: 'bg-emerald-600 text-white border-emerald-600' },
                    { key: 'T', label: 'Terlambat', bg: 'hover:bg-amber-50 border-amber-200', active: 'bg-amber-500 text-white border-amber-500' },
                    { key: 'S', label: 'Sakit', bg: 'hover:bg-blue-50 border-blue-200', active: 'bg-blue-600 text-white border-blue-600' },
                    { key: 'I', label: 'Izin', bg: 'hover:bg-purple-50 border-purple-200', active: 'bg-purple-600 text-white border-purple-600' },
                    { key: 'A', label: 'Alpa', bg: 'hover:bg-rose-50 border-rose-200', active: 'bg-rose-600 text-white border-rose-600' },
                    { key: 'KOSONG', label: 'Kosongkan', bg: 'hover:bg-slate-100 border-slate-200', active: 'bg-slate-700 text-white border-slate-700' },
                  ].map(opt => {
                    const isSelected = newStatus === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setNewStatus(opt.key)}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? opt.active + ' shadow-sm ring-2 ring-indigo-200'
                            : `bg-white text-slate-700 ${opt.bg}`
                        }`}
                      >
                        <span>{opt.key !== 'KOSONG' ? opt.key : '✕'}</span>
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Keterangan / Alasan Koreksi */}
              <div>
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1.5">
                  Alasan Koreksi / Surat Bukti:
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Surat dokter diserahkan ke wali kelas..."
                  value={keteranganKoreksi}
                  onChange={(e) => setKeteranganKoreksi(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />

                {/* Quick Chips Alasan */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    'Surat dokter fisik',
                    'Surat izin ortu',
                    'Salah catat piket',
                    'Sesuai buku absen fisik',
                  ].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setKeteranganKoreksi(chip)}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                disabled={isSavingKoreksi}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSaveKoreksi}
                disabled={isSavingKoreksi}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                {isSavingKoreksi ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <span>💾</span>
                )}
                <span>{isSavingKoreksi ? 'Menyimpan...' : 'Simpan Koreksi'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── MODAL REKAPITULASI TOTAL KETIDAKHADIRAN (S, I, A, TOTAL) ──────── */}
      {showRekapTotalModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in print:p-0 print:bg-white">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-slide-up print:border-none print:shadow-none print:max-h-none print:w-full">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shadow-2xs font-bold">
                  📊
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm sm:text-base leading-tight">
                    Rekapitulasi Total Presensi Siswa
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kelas: <strong className="text-slate-800 font-bold">{selectedKelas}</strong> • Periode: <strong className="text-indigo-600 font-bold">{BULAN_NAMES[selectedMonth - 1]} {selectedYear}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRekapTotalModal(false)}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors shadow-2xs border border-slate-200 cursor-pointer print:hidden"
                title="Tutup Modal"
              >
                ✕
              </button>
            </div>

            {/* Quick Stat Badges & Search */}
            {(() => {
              let sTotal = 0, iTotal = 0, aTotal = 0, grandTotal = 0
              displayedStudents.forEach(s => {
                const sum = studentSummaries[s.nisn] || { s: 0, i: 0, a: 0, totalTidakHadir: 0 }
                sTotal += sum.s || 0
                iTotal += sum.i || 0
                aTotal += sum.a || 0
                grandTotal += (sum.s || 0) + (sum.i || 0) + (sum.a || 0)
              })

              const filteredList = displayedStudents.filter(s => {
                if (!rekapSearch.trim()) return true
                const q = rekapSearch.toLowerCase()
                return s.nama_lengkap?.toLowerCase().includes(q) || s.nisn?.includes(q)
              })

              const handleCopyRekap = () => {
                let text = `REKAPITULASI PRESENSI - KELAS ${selectedKelas}\n`
                text += `Bulan: ${BULAN_NAMES[selectedMonth - 1]} ${selectedYear}\n\n`
                text += `NO | NAMA SISWA | S | I | A | TOTAL\n`
                text += `------------------------------------\n`
                displayedStudents.forEach((s, idx) => {
                  const sum = studentSummaries[s.nisn] || { s: 0, i: 0, a: 0, totalTidakHadir: 0 }
                  text += `${idx + 1}. ${s.nama_lengkap} | S:${sum.s} | I:${sum.i} | A:${sum.a} | Total:${sum.totalTidakHadir}\n`
                })
                text += `------------------------------------\n`
                text += `TOTAL KELAS: Sakit=${sTotal}, Izin=${iTotal}, Alpa=${aTotal}, Akumulasi=${grandTotal}`
                navigator.clipboard.writeText(text)
                setCopiedRekap(true)
                setTimeout(() => setCopiedRekap(false), 2500)
              }

              return (
                <>
                  <div className="px-4 sm:px-5 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        Sakit (S): <strong>{sTotal}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                        Izin (I): <strong>{iTotal}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        Alpa (A): <strong>{aTotal}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 font-black">
                        Total Ketidakhadiran: <strong>{grandTotal}</strong>
                      </span>
                    </div>

                    <div className="relative min-w-[160px] max-w-xs flex-1 sm:flex-initial print:hidden">
                      <input
                        type="text"
                        placeholder="Cari nama siswa..."
                        value={rekapSearch}
                        onChange={(e) => setRekapSearch(e.target.value)}
                        className="w-full pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      />
                      <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>

                  {/* Body Tabel Modal */}
                  <div className="overflow-y-auto flex-1 custom-scrollbar">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100/90 text-slate-700 uppercase font-black tracking-wider text-[11px] sticky top-0 z-10 shadow-2xs border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-12 border-r border-slate-200">No</th>
                          <th className="py-2.5 px-3 border-r border-slate-200">Nama Siswa</th>
                          <th className="py-2.5 px-2 text-center w-16 bg-blue-50/80 text-blue-800 border-r border-slate-200" title="Sakit">S</th>
                          <th className="py-2.5 px-2 text-center w-16 bg-purple-50/80 text-purple-800 border-r border-slate-200" title="Izin">I</th>
                          <th className="py-2.5 px-2 text-center w-16 bg-rose-50/80 text-rose-800 border-r border-slate-200" title="Alpa">A</th>
                          <th className="py-2.5 px-3 text-center w-20 bg-slate-200/70 text-slate-900" title="Total Ketidakhadiran (S + I + A)">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filteredList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              Tidak ada data siswa yang cocok
                            </td>
                          </tr>
                        ) : (
                          filteredList.map((student, idx) => {
                            const sum = studentSummaries[student.nisn] || { s: 0, i: 0, a: 0, totalTidakHadir: 0 }
                            const hasAbsent = sum.totalTidakHadir > 0

                            return (
                              <tr 
                                key={student.nisn} 
                                className={`hover:bg-slate-50/80 transition-colors ${hasAbsent ? 'bg-amber-50/20' : ''}`}
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] border-r border-slate-100">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3 border-r border-slate-100">
                                  <div className="font-bold text-slate-800 truncate" title={student.nama_lengkap}>
                                    {student.nama_lengkap}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {student.nisn}
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-center border-r border-slate-100">
                                  {sum.s > 0 ? (
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-black text-xs shadow-2xs">
                                      {sum.s}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-mono">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center border-r border-slate-100">
                                  {sum.i > 0 ? (
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-black text-xs shadow-2xs">
                                      {sum.i}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-mono">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center border-r border-slate-100">
                                  {sum.a > 0 ? (
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-black text-xs shadow-2xs">
                                      {sum.a}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-mono">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-center font-black">
                                  {sum.totalTidakHadir > 0 ? (
                                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-600 text-white font-black text-xs shadow-2xs">
                                      {sum.totalTidakHadir}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold text-xs">
                                      <span>0</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      <tfoot className="bg-slate-50 font-black text-xs border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={2} className="py-2.5 px-3 text-slate-800 font-extrabold uppercase text-right border-r border-slate-200">
                            Total Rekapitulasi:
                          </td>
                          <td className="py-2.5 px-2 text-center text-blue-700 bg-blue-50/50 border-r border-slate-200 font-black text-sm">
                            {sTotal}
                          </td>
                          <td className="py-2.5 px-2 text-center text-purple-700 bg-purple-50/50 border-r border-slate-200 font-black text-sm">
                            {iTotal}
                          </td>
                          <td className="py-2.5 px-2 text-center text-rose-700 bg-rose-50/50 border-r border-slate-200 font-black text-sm">
                            {aTotal}
                          </td>
                          <td className="py-2.5 px-3 text-center text-rose-800 bg-rose-100/60 font-black text-sm">
                            {grandTotal}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Footer Modal */}
                  <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={handleCopyRekap}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      title="Salin teks ringkasan untuk WhatsApp / Catatan"
                    >
                      <span>{copiedRekap ? '✓ Berhasil Disalin!' : '📋 Salin Ringkasan'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        <span>Cetak Rekap</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRekapTotalModal(false)}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Floating Toast Notification ──────────────────────────────────── */}
      {toastMsg && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 right-6 z-[300] bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-fade-in border border-slate-700">
          <span>{toastMsg}</span>
        </div>,
        document.body
      )}
    </div>
  )
}
