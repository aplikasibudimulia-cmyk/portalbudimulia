import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { getTodayWIB } from '../utils/dateUtils'
import { generateJurnalMengajarPDF } from '../utils/jurnalMengajarPdfExporter'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const toYmd = (dt) => dt.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return toYmd(d) }
const hariOf = (s) => HARI[parseYmd(s).getUTCDay()]
const fmtTanggal = (s) => {
  const d = parseYmd(s)
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const hhmm = (t) => (t || '').slice(0, 5)

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function addMinutes(timeStr, mins) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = (h || 0) * 60 + (m || 0) + (mins || 0)
  const newH = Math.floor(total / 60) % 24
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

const getWeekdayInSameWeek = (currentDateStr, targetDayName) => {
  const d = parseYmd(currentDateStr)
  const currentDayIdx = d.getUTCDay()
  const targetDayIdx = HARI.indexOf(targetDayName)
  if (targetDayIdx === -1) return currentDateStr
  const currentMonBased = currentDayIdx === 0 ? 7 : currentDayIdx
  const targetMonBased = targetDayIdx === 0 ? 7 : targetDayIdx
  const diffDays = targetMonBased - currentMonBased
  const targetDate = new Date(d)
  targetDate.setUTCDate(d.getUTCDate() + diffDays)
  return toYmd(targetDate)
}

function getJamBadgeText(jamAwal, jamAkhir) {
  if (!jamAwal) return '-'
  if (!jamAkhir || jamAkhir === jamAwal) return `${jamAwal}`
  return `${jamAwal}–${jamAkhir}`
}

function getRomanBadgeText(jamAwal, jamAkhir) {
  if (!jamAwal) return '-'
  const r1 = ROMAN_NUMERALS[jamAwal] || `${jamAwal}`
  if (!jamAkhir || jamAkhir === jamAwal) return r1
  const r2 = ROMAN_NUMERALS[jamAkhir] || `${jamAkhir}`
  return `${r1}–${r2}`
}

function getDefaultSlots(hari) {
  return [
    { urutan: 1, jam_ke: null, label: 'PERSIAPAN KBM & DOA / G L S', tipe: 'persiapan', waktu_mulai: '06:30:00', durasi_menit: 30 },
    { urutan: 2, jam_ke: 1, label: 'I', tipe: 'pelajaran', waktu_mulai: '07:00:00', durasi_menit: 40 },
    { urutan: 3, jam_ke: 2, label: 'II', tipe: 'pelajaran', waktu_mulai: '07:40:00', durasi_menit: 40 },
    { urutan: 4, jam_ke: 3, label: 'III', tipe: 'pelajaran', waktu_mulai: '08:20:00', durasi_menit: 40 },
    { urutan: 5, jam_ke: null, label: 'ISTIRAHAT 1', tipe: 'istirahat', waktu_mulai: '09:00:00', durasi_menit: 30 },
    { urutan: 6, jam_ke: 4, label: 'IV', tipe: 'pelajaran', waktu_mulai: '09:30:00', durasi_menit: 40 },
    { urutan: 7, jam_ke: 5, label: 'V', tipe: 'pelajaran', waktu_mulai: '10:10:00', durasi_menit: 40 },
    { urutan: 8, jam_ke: 6, label: 'VI', tipe: 'pelajaran', waktu_mulai: '10:50:00', durasi_menit: 40 },
    { urutan: 9, jam_ke: 7, label: 'VII', tipe: 'pelajaran', waktu_mulai: '11:30:00', durasi_menit: 40 },
    { urutan: 10, jam_ke: null, label: 'ISTIRAHAT 2', tipe: 'istirahat', waktu_mulai: '12:10:00', durasi_menit: 20 },
    { urutan: 11, jam_ke: 8, label: 'VIII', tipe: 'pelajaran', waktu_mulai: '12:30:00', durasi_menit: 40 },
    { urutan: 12, jam_ke: 9, label: 'IX', tipe: 'pelajaran', waktu_mulai: '13:10:00', durasi_menit: 40 },
    { urutan: 13, jam_ke: 10, label: 'X', tipe: 'pelajaran', waktu_mulai: '13:50:00', durasi_menit: 40 },
    { urutan: 14, jam_ke: null, label: 'Bersih Kelas & Pulang', tipe: 'penutup', waktu_mulai: '14:30:00', durasi_menit: 10 }
  ]
}

function deduplicateJadwalRows(rows) {
  const map = new Map()
  for (const r of rows) {
    const key = `${r.hari}_${r.jam_ke}_${r.kelas}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, r)
    } else {
      if ((existing.waktu_selesai === '00:00:00' || !existing.waktu_selesai) && r.waktu_selesai && r.waktu_selesai !== '00:00:00') {
        map.set(key, r)
      }
    }
  }
  return Array.from(map.values())
}

/** Gabungkan jam pelajaran berurutan (kelas & mapel sama) menjadi 1 pertemuan. */
function groupSlots(rows) {
  const deduped = deduplicateJadwalRows(rows)
  const sorted = [...deduped].sort((a, b) => a.jam_ke - b.jam_ke)
  const groups = []
  for (const r of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.kelas === r.kelas && last.mapelId === (r.mata_pelajaran?.id || null) && r.jam_ke === last.jamAkhir + 1) {
      last.jamAkhir = r.jam_ke
      if (r.waktu_selesai && r.waktu_selesai !== '00:00:00') {
        last.waktuSelesai = r.waktu_selesai
      }
      continue
    }
    groups.push({
      key: r.id,
      jadwalId: r.id,
      hari: r.hari,
      kelas: r.kelas,
      mapelId: r.mata_pelajaran?.id || null,
      mapelNama: r.mata_pelajaran?.nama || 'Mata Pelajaran',
      jamAwal: r.jam_ke,
      jamAkhir: r.jam_ke,
      waktuMulai: r.waktu_mulai,
      waktuSelesai: r.waktu_selesai
    })
  }
  return groups
}

const emptyForm = {
  status: 'terlaksana', // 'terlaksana' | 'libur' | 'tidak_terlaksana'
  bab: '',
  materi: '',
  kegiatan: '',
  sertakan_absen: true,
  siswa_tidak_hadir: '',
  catatan: '',
  alasan: ''
}

export default function JurnalMengajarSection({ session, activeTa, semester }) {
  const today = getTodayWIB()
  const semNum = parseInt(semester) || 1

  const [tab, setTab] = useState('harian')
  const [date, setDate] = useState(today)
  const [jadwal, setJadwal] = useState([])
  const [loadingJadwal, setLoadingJadwal] = useState(true)
  const [journalsDay, setJournalsDay] = useState({})
  const [loadingDay, setLoadingDay] = useState(false)
  const [dayPresensiCount, setDayPresensiCount] = useState(null)
  const [missing, setMissing] = useState([])
  const [markingAllHoliday, setMarkingAllHoliday] = useState(false)

  const [month, setMonth] = useState(today.slice(0, 7))
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [editing, setEditing] = useState(null) // { group, existing }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Sinkronisasi Bab & TP dari Nilai Komponen
  const [availableTps, setAvailableTps] = useState([])
  const [loadingTps, setLoadingTps] = useState(false)
  const [selectedTpId, setSelectedTpId] = useState('')

  // Kehadiran siswa (sinkron presensi harian)
  const [classStudents, setClassStudents] = useState([]) // [{ nisn, nama, presensi }]
  const [absentMap, setAbsentMap] = useState({}) // { nisn: 'S' | 'I' | 'A' }
  const [loadingStudents, setLoadingStudents] = useState(false)

  // Export PDF
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportCfg, setExportCfg] = useState({
    dari: today.slice(0, 8) + '01',
    sampai: today,
    kelas: 'all',
    kepsekNama: 'Septian Ruswadi, S.Pd.',
    tempat: 'Jakarta'
  })

  const showToast = (type, text) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3500)
  }

  // 1. Jadwal mengajar guru (semester aktif)
  useEffect(() => {
    if (!session?.id) return
    let cancelled = false
    ;(async () => {
      setLoadingJadwal(true)
      try {
        let q = supabase
          .from('jadwal_pelajaran')
          .select('id, kelas, hari, jam_ke, waktu_mulai, waktu_selesai, mata_pelajaran:mata_pelajaran_id ( id, nama, singkatan )')
          .eq('guru_id', session.id)
          .eq('semester', semNum)
        if (activeTa?.id) q = q.eq('tahun_ajaran_id', activeTa.id)
        const { data, error } = await q.order('jam_ke', { ascending: true })
        if (error) throw error
        if (!cancelled) setJadwal((data || []).filter(r => r.mata_pelajaran))
      } catch (e) {
        console.warn('Gagal memuat jadwal untuk jurnal:', e)
      } finally {
        if (!cancelled) setLoadingJadwal(false)
      }
    })()
    return () => { cancelled = true }
  }, [session?.id, activeTa?.id, semNum])

  // Slot Waktu Master Sekolah (dari jadwal_slot_waktu)
  const [masterSlots, setMasterSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSlots(true)
      try {
        let q = supabase
          .from('jadwal_slot_waktu')
          .select('*')
        if (activeTa?.id) q = q.eq('tahun_ajaran_id', activeTa.id)
        if (semNum) q = q.eq('semester', semNum)
        const { data, error } = await q.order('urutan', { ascending: true })
        if (error) throw error
        if (!cancelled && data && data.length > 0) {
          setMasterSlots(data)
        }
      } catch (err) {
        console.warn('Gagal memuat slot waktu master:', err)
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeTa?.id, semNum])

  // Waktu saat ini (update tiap 30 detik untuk deteksi LIVE)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const jadwalByHari = useMemo(() => {
    const map = {}
    for (const r of jadwal) (map[r.hari] ||= []).push(r)
    const out = {}
    for (const h of Object.keys(map)) out[h] = groupSlots(map[h])
    return out
  }, [jadwal])

  const selectedHari = hariOf(date)
  const groupsToday = jadwalByHari[selectedHari] || []

  // Susun Master Timeline: Istirahat, Jam Kosong, dan Kartu Mengajar (Hijau / Merah / Libur)
  const timelineRows = useMemo(() => {
    let daySlots = masterSlots.filter(s => s.hari === selectedHari)
    if (daySlots.length === 0) {
      daySlots = getDefaultSlots(selectedHari)
    }

    // Deduplikasi slot master berdasarkan urutan + jam_ke + label
    const seenUrutan = new Set()
    const uniqueSlots = []
    for (const s of daySlots) {
      const key = `${s.urutan || ''}_${s.jam_ke || ''}_${s.label || ''}`
      if (!seenUrutan.has(key)) {
        seenUrutan.add(key)
        uniqueSlots.push(s)
      }
    }

    const calculatedSlots = uniqueSlots.map(slot => {
      const start = slot.waktu_mulai ? hhmm(slot.waktu_mulai) : '07:00'
      const dur = slot.durasi_menit || 40
      const end = (slot.waktu_selesai && slot.waktu_selesai !== '00:00:00')
        ? hhmm(slot.waktu_selesai)
        : addMinutes(start, dur)
      return {
        ...slot,
        _start: start,
        _end: end
      }
    })

    const rows = []
    const coveredJams = new Set()
    const coveredGroupKeys = new Set()

    for (const slot of calculatedSlots) {
      // 1. Break / Istirahat
      if (slot.tipe === 'istirahat' || String(slot.label || '').toUpperCase().includes('ISTIRAHAT')) {
        rows.push({
          type: 'break',
          id: slot.id || `break_${slot.urutan}`,
          label: slot.label || 'ISTIRAHAT',
          durasi: slot.durasi_menit || 30,
          start: slot._start,
          end: slot._end,
          slot
        })
        continue
      }

      // 2. Persiapan KBM, Upacara, Doa pagi, Blok khusus, atau Penutup
      if (slot.jam_ke == null && (slot.tipe === 'persiapan' || slot.tipe === 'penutup' || slot.tipe === 'blok_khusus')) {
        rows.push({
          type: 'special',
          id: slot.id || `special_${slot.urutan}`,
          label: slot.label,
          durasi: slot.durasi_menit,
          start: slot._start,
          end: slot._end,
          slot
        })
        continue
      }

      // 3. Jam Pelajaran (bernomor)
      const jamNum = Number(slot.jam_ke) || slot.urutan
      if (coveredJams.has(jamNum)) {
        continue
      }

      const match = groupsToday.find(g => jamNum >= g.jamAwal && jamNum <= g.jamAkhir)
      if (match) {
        for (let j = match.jamAwal; j <= match.jamAkhir; j++) {
          coveredJams.add(j)
        }
        coveredGroupKeys.add(match.key)

        const jrn = journalsDay[match.jadwalId] || null
        rows.push({
          type: 'teaching',
          id: match.key,
          group: match,
          journal: jrn,
          jamAwal: match.jamAwal,
          jamAkhir: match.jamAkhir,
          start: hhmm(match.waktuMulai) || slot._start,
          end: (match.waktuSelesai && match.waktuSelesai !== '00:00:00') ? hhmm(match.waktuSelesai) : slot._end,
          slot
        })
      } else {
        // Guru TIDAK mengajar di jam ini -> Tampilkan Jam Kosong
        rows.push({
          type: 'empty',
          id: slot.id || `empty_${jamNum}`,
          jam_ke: slot.jam_ke || jamNum,
          label: slot.label || `${jamNum}`,
          start: slot._start,
          end: slot._end,
          durasi: slot.durasi_menit || 40,
          slot
        })
      }
    }

    // Safeguard: Kelompok jadwal guru yang mungkin di luar slot standar tetap ditampilkan
    for (const g of groupsToday) {
      if (!coveredGroupKeys.has(g.key)) {
        const jrn = journalsDay[g.jadwalId] || null
        rows.push({
          type: 'teaching',
          id: g.key,
          group: g,
          journal: jrn,
          jamAwal: g.jamAwal,
          jamAkhir: g.jamAkhir,
          start: hhmm(g.waktuMulai),
          end: hhmm(g.waktuSelesai)
        })
      }
    }

    return rows.sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  }, [masterSlots, selectedHari, groupsToday, journalsDay])

  // Live Slot (hanya saat melihat Hari Ini)
  const liveSlot = useMemo(() => {
    if (date !== today) return null
    return timelineRows.find(r => {
      const sMin = timeToMinutes(r.start)
      const eMin = timeToMinutes(r.end)
      return nowMinutes >= sMin && nowMinutes < eMin
    })
  }, [timelineRows, date, today, nowMinutes])

  // Ringkasan angka KBM harian
  const dailyStats = useMemo(() => {
    let teachingCount = 0
    let filledCount = 0
    let needFillCount = 0
    let holidayCount = 0
    let emptyCount = 0

    for (const r of timelineRows) {
      if (r.type === 'teaching') {
        teachingCount++
        const j = r.journal
        if (j) {
          if (j.status === 'libur') holidayCount++
          else if (j.status === 'terlaksana') filledCount++
          else if (j.status === 'tidak_terlaksana') holidayCount++
        } else {
          if (date <= today) needFillCount++
        }
      } else if (r.type === 'empty') {
        emptyCount++
      }
    }

    return { teachingCount, filledCount, needFillCount, holidayCount, emptyCount }
  }, [timelineRows, date, today])

  // 2. Jurnal & Pengecekan Presensi pada tanggal terpilih
  const fetchDay = useCallback(async () => {
    if (!session?.id) return
    setLoadingDay(true)
    try {
      const [{ data, error }, { count }] = await Promise.all([
        supabase
          .from('jurnal_mengajar')
          .select('*')
          .eq('guru_id', session.id)
          .eq('tanggal', date),
        supabase
          .from('presensi_harian')
          .select('id', { count: 'exact', head: true })
          .eq('tanggal', date)
      ])
      if (error) throw error
      const map = {}
      for (const j of data || []) map[j.jadwal_id] = j
      setJournalsDay(map)
      setDayPresensiCount(count ?? 0)
    } catch (e) {
      console.warn('Gagal memuat jurnal harian:', e)
      showToast('error', 'Gagal memuat data jurnal harian.')
    } finally {
      setLoadingDay(false)
    }
  }, [session?.id, date])

  useEffect(() => { fetchDay() }, [fetchDay])

  // 3. Jurnal yang belum diisi (14 hari terakhir) — OTOMATIS ABAIKAN HARI LIBUR / TANPA PRESENSI
  const fetchMissing = useCallback(async () => {
    if (!session?.id || jadwal.length === 0) { setMissing([]); return }
    try {
      const from = addDays(today, -14)
      const [{ data }, { data: presRows }] = await Promise.all([
        supabase
          .from('jurnal_mengajar')
          .select('jadwal_id, tanggal')
          .eq('guru_id', session.id)
          .gte('tanggal', from)
          .lte('tanggal', today),
        supabase
          .from('presensi_harian')
          .select('tanggal')
          .gte('tanggal', from)
          .lte('tanggal', today)
      ])

      // Rekap jumlah presensi sekolah per hari (jika < 10 orang = hari libur / KBM ditiadakan)
      const presCountPerDay = {}
      for (const r of (presRows || [])) {
        presCountPerDay[r.tanggal] = (presCountPerDay[r.tanggal] || 0) + 1
      }

      const filled = new Set((data || []).map(j => `${j.jadwal_id}|${j.tanggal}`))
      const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
      const list = []

      for (let i = 0; i <= 14; i++) {
        const d = addDays(today, -i)
        // Jika tidak ada aktivitas presensi di sekolah (kurang dari 10 rekaman), artinya hari libur!
        if ((presCountPerDay[d] || 0) < 10) continue

        const groups = jadwalByHari[hariOf(d)] || []
        const count = groups.filter(g => {
          if (filled.has(`${g.jadwalId}|${d}`)) return false
          if (d === today && hhmm(g.waktuSelesai) > nowHm) return false // belum selesai hari ini
          return true
        }).length
        if (count > 0) list.push({ date: d, count })
      }
      setMissing(list)
    } catch (e) {
      console.warn('Gagal menghitung jurnal belum terisi:', e)
    }
  }, [session?.id, jadwal.length, jadwalByHari, today])

  useEffect(() => { fetchMissing() }, [fetchMissing, journalsDay])

  // 4. Riwayat bulanan
  const fetchHistory = useCallback(async () => {
    if (!session?.id) return
    setLoadingHistory(true)
    try {
      const [y, m] = month.split('-').map(Number)
      const start = `${month}-01`
      const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
      const { data, error } = await supabase
        .from('jurnal_mengajar')
        .select('*, mata_pelajaran:mata_pelajaran_id ( nama )')
        .eq('guru_id', session.id)
        .gte('tanggal', start)
        .lte('tanggal', end)
        .order('tanggal', { ascending: false })
        .order('jam_ke_awal', { ascending: true })
      if (error) throw error
      setHistory(data || [])
    } catch (e) {
      console.warn('Gagal memuat riwayat jurnal:', e)
    } finally {
      setLoadingHistory(false)
    }
  }, [session?.id, month])

  useEffect(() => { if (tab === 'riwayat') fetchHistory() }, [tab, fetchHistory])

  // 5. Muat daftar TP & Bab dari menu Input Nilai guru
  const loadTps = async (mapelId, kelas) => {
    setLoadingTps(true)
    setAvailableTps([])
    try {
      let q = supabase
        .from('nilai_komponen')
        .select('id, nama, bab_nama, deskripsi, urutan, kelas, target_kelas')
        .eq('guru_id', session.id)
      if (activeTa?.id) q = q.eq('tahun_ajaran_id', activeTa.id)
      if (mapelId) q = q.eq('mata_pelajaran_id', mapelId)
      const { data, error } = await q.order('urutan', { ascending: true })
      if (error) throw error

      // Filter TP yang cocok untuk kelas target
      const list = (data || []).filter(k => {
        if (!k.kelas && (!k.target_kelas || k.target_kelas.length === 0)) return true
        if (k.kelas === kelas) return true
        if (Array.isArray(k.target_kelas) && k.target_kelas.includes(kelas)) return true
        return false
      })
      setAvailableTps(list)
    } catch (e) {
      console.warn('Gagal memuat TP untuk jurnal:', e)
    } finally {
      setLoadingTps(false)
    }
  }

  const handleSelectTp = (tpId) => {
    setSelectedTpId(tpId)
    const tp = availableTps.find(t => t.id === tpId)
    if (!tp) return
    setForm(f => ({
      ...f,
      bab: tp.bab_nama || f.bab || '',
      materi: tp.deskripsi ? `${tp.nama}: ${tp.deskripsi}` : (tp.nama || f.materi),
      kegiatan: f.kegiatan || 'Pembahasan materi, tanya jawab, dan latihan terpadu'
    }))
  }

  // 6. Muat daftar siswa kelas & presensi harian
  const loadClassStudents = async (kelas, existing) => {
    setLoadingStudents(true)
    setClassStudents([])
    setAbsentMap({})
    try {
      let eq = supabase.from('enrollment').select('nisn').eq('kelas', kelas)
      if (activeTa?.id) eq = eq.eq('tahun_ajaran_id', activeTa.id)
      const { data: enr, error: enrErr } = await eq
      if (enrErr) throw enrErr
      const nisns = [...new Set((enr || []).map(r => r.nisn))]
      if (nisns.length === 0) return

      const [{ data: sis }, { data: pres }] = await Promise.all([
        supabase.from('siswa_permanent').select('nisn, nama_lengkap').in('nisn', nisns),
        supabase.from('presensi_harian').select('siswa_nisn, status, tipe').eq('tanggal', date).in('siswa_nisn', nisns)
      ])
      const presMap = {}
      for (const r of pres || []) {
        if (!presMap[r.siswa_nisn] || r.tipe === 'masuk') presMap[r.siswa_nisn] = (r.status || '').toUpperCase()
      }
      const list = (sis || [])
        .map(r => ({ nisn: r.nisn, nama: r.nama_lengkap, presensi: presMap[r.nisn] || null }))
        .sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))
      setClassStudents(list)

      const saved = Array.isArray(existing?.siswa_tidak_hadir_data) ? existing.siswa_tidak_hadir_data : null
      const init = {}
      if (saved) {
        for (const r of saved) if (r?.nisn) init[r.nisn] = r.status || 'A'
      } else {
        // Otomatis sinkron dari presensi harian siswa (Sakit / Izin / Alpa)
        for (const r of list) if (['S', 'I', 'A'].includes(r.presensi)) init[r.nisn] = r.presensi
      }
      setAbsentMap(init)
    } catch (e) {
      console.warn('Gagal memuat siswa kelas untuk jurnal:', e)
    } finally {
      setLoadingStudents(false)
    }
  }

  const cycleAbsent = (nisn) => {
    setAbsentMap(prev => {
      const cur = prev[nisn]
      const next = { ...prev }
      if (!cur) next[nisn] = 'S'
      else if (cur === 'S') next[nisn] = 'I'
      else if (cur === 'I') next[nisn] = 'A'
      else delete next[nisn]
      return next
    })
  }

  const openForm = (group) => {
    const existing = journalsDay[group.jadwalId] || null
    setEditing({ group, existing })
    setSelectedTpId('')
    setForm(existing ? {
      status: existing.status || 'terlaksana',
      bab: existing.bab || '',
      materi: existing.materi || '',
      kegiatan: existing.kegiatan || '',
      sertakan_absen: existing.sertakan_absen !== false,
      siswa_tidak_hadir: existing.siswa_tidak_hadir || '',
      catatan: existing.catatan || '',
      alasan: existing.alasan || ''
    } : {
      ...emptyForm,
      alasan: (dayPresensiCount === 0 && date <= today) ? 'Hari Libur / Tidak Ada KBM' : ''
    })
    loadClassStudents(group.kelas, existing)
    loadTps(group.mapelId, group.kelas)
  }

  // Tandai seluruh jadwal pada tanggal ini sebagai Libur dalam 1 klik
  const handleMarkAllHoliday = async () => {
    if (groupsToday.length === 0) return
    if (!window.confirm(`Tandai seluruh ${groupsToday.length} jadwal pada ${fmtTanggal(date)} sebagai Hari Libur / Tidak Ada KBM?`)) return
    setMarkingAllHoliday(true)
    try {
      const inserts = groupsToday.map(g => ({
        tahun_ajaran_id: activeTa?.id || null,
        semester: semNum,
        guru_id: session.id,
        jadwal_id: g.jadwalId,
        tanggal: date,
        hari: g.hari,
        kelas: g.kelas,
        mata_pelajaran_id: g.mapelId,
        jam_ke_awal: g.jamAwal,
        jam_ke_akhir: g.jamAkhir,
        waktu_mulai: g.waktuMulai,
        waktu_selesai: g.waktuSelesai,
        status: 'libur',
        bab: null,
        materi: null,
        kegiatan: null,
        sertakan_absen: false,
        siswa_tidak_hadir: null,
        siswa_tidak_hadir_data: [],
        alasan: 'Hari Libur / Kegiatan Sekolah'
      }))
      const { error } = await supabase
        .from('jurnal_mengajar')
        .upsert(inserts, { onConflict: 'guru_id,jadwal_id,tanggal' })
      if (error) throw error
      showToast('success', `Berhasil menandai ${groupsToday.length} jadwal sebagai libur.`)
      await fetchDay()
    } catch (err) {
      showToast('error', 'Gagal menandai libur: ' + (err.message || err))
    } finally {
      setMarkingAllHoliday(false)
    }
  }

  const handleExport = async () => {
    if (!exportCfg.dari || !exportCfg.sampai || exportCfg.dari > exportCfg.sampai) {
      showToast('error', 'Rentang tanggal tidak valid.')
      return
    }
    setExporting(true)
    try {
      let q = supabase
        .from('jurnal_mengajar')
        .select('*, mata_pelajaran:mata_pelajaran_id ( nama )')
        .eq('guru_id', session.id)
        .gte('tanggal', exportCfg.dari)
        .lte('tanggal', exportCfg.sampai)
        .order('tanggal', { ascending: true })
        .order('jam_ke_awal', { ascending: true })
      if (exportCfg.kelas !== 'all') q = q.eq('kelas', exportCfg.kelas)
      const { data, error } = await q
      if (error) throw error
      await generateJurnalMengajarPDF({
        journals: data || [],
        guruNama: session?.nama_guru || '',
        periodeDari: exportCfg.dari,
        periodeSampai: exportCfg.sampai,
        tahunAjaran: activeTa?.nama || '',
        semester: `Semester ${semNum}`,
        kepsekNama: exportCfg.kepsekNama,
        tempat: exportCfg.tempat,
        tanggalCetak: today
      })
      setExportOpen(false)
    } catch (err) {
      showToast('error', 'Gagal membuat PDF: ' + (err.message || err))
    } finally {
      setExporting(false)
    }
  }

  const kelasOptions = useMemo(() => [...new Set(jadwal.map(r => r.kelas))].sort(), [jadwal])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editing) return
    if (form.status === 'terlaksana' && !form.materi.trim()) {
      showToast('error', 'Materi / topik pembelajaran wajib diisi.')
      return
    }
    if ((form.status === 'tidak_terlaksana' || form.status === 'libur') && !form.alasan.trim()) {
      showToast('error', 'Keterangan alasan wajib diisi.')
      return
    }
    const g = editing.group
    setSaving(true)
    try {
      const absentList = form.sertakan_absen
        ? classStudents
            .filter(st => absentMap[st.nisn])
            .map(st => ({ nisn: st.nisn, nama: st.nama, status: absentMap[st.nisn] }))
        : []

      const payload = {
        tahun_ajaran_id: activeTa?.id || null,
        semester: semNum,
        guru_id: session.id,
        jadwal_id: g.jadwalId,
        tanggal: date,
        hari: g.hari,
        kelas: g.kelas,
        mata_pelajaran_id: g.mapelId,
        jam_ke_awal: g.jamAwal,
        jam_ke_akhir: g.jamAkhir,
        waktu_mulai: g.waktuMulai,
        waktu_selesai: g.waktuSelesai,
        status: form.status,
        bab: form.status === 'terlaksana' ? (form.bab.trim() || null) : null,
        materi: form.status === 'terlaksana' ? form.materi.trim() : null,
        kegiatan: form.status === 'terlaksana' ? (form.kegiatan.trim() || null) : null,
        sertakan_absen: form.sertakan_absen,
        siswa_tidak_hadir: (form.status === 'terlaksana' && form.sertakan_absen)
          ? (absentList.map(a => `${a.nama} (${a.status})`).join(', ') || null)
          : null,
        siswa_tidak_hadir_data: (form.status === 'terlaksana' && form.sertakan_absen) ? absentList : [],
        catatan: form.catatan.trim() || null,
        alasan: (form.status === 'tidak_terlaksana' || form.status === 'libur') ? form.alasan.trim() : null
      }

      let { error } = await supabase
        .from('jurnal_mengajar')
        .upsert(payload, { onConflict: 'guru_id,jadwal_id,tanggal' })
      if (error && /siswa_tidak_hadir_data/.test(error.message || '')) {
        delete payload.siswa_tidak_hadir_data
        const retry = await supabase
          .from('jurnal_mengajar')
          .upsert(payload, { onConflict: 'guru_id,jadwal_id,tanggal' })
        error = retry.error
      }
      if (error) throw error
      showToast('success', 'Jurnal berhasil disimpan.')
      setEditing(null)
      await fetchDay()
    } catch (err) {
      showToast('error', 'Gagal menyimpan: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing?.existing) return
    if (!window.confirm('Hapus jurnal ini?')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('jurnal_mengajar').delete().eq('id', editing.existing.id)
      if (error) throw error
      showToast('success', 'Jurnal dihapus.')
      setEditing(null)
      await fetchDay()
    } catch (err) {
      showToast('error', 'Gagal menghapus: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const statusOf = (g) => {
    const j = journalsDay[g.jadwalId]
    if (j) {
      if (j.status === 'libur') return { label: 'Libur / Kegiatan', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
      if (j.status === 'tidak_terlaksana') return { label: 'Tidak Terlaksana', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      return { label: 'Terisi', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    }
    if (date > today) return { label: 'Akan Datang', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    if (dayPresensiCount === 0) return { label: 'Libur (0 Presensi)', cls: 'bg-slate-100 text-slate-600 border-slate-300' }
    return { label: 'Belum Diisi', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
  }

  const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Jurnal Mengajar</h2>
          <p className="text-slate-500 text-sm mt-1">Isi jurnal pembelajaran sesuai jadwal mengajar Anda. Terintegrasi dengan TP Nilai dan Presensi Siswa.</p>
        </div>
        <button onClick={() => setExportOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm shrink-0">
          📄 Export PDF
        </button>
      </div>

      {toast && (
        <div className={`p-3 rounded-xl text-sm font-medium border ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {toast.text}
        </div>
      )}

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
        {[['harian', 'Jurnal Harian'], ['riwayat', 'Riwayat']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === k ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'harian' && (
        <>
          {/* Banner Peringatan: Hanya memunculkan hari yang benar-benar ada Presensi Sekolah */}
          {missing.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-bold text-rose-800">
                  ⚠️ {missing.reduce((a, b) => a + b.count, 0)} jurnal belum diisi pada hari efektif sekolah (14 hari terakhir)
                </p>
                <span className="text-[11px] text-rose-600 font-medium hidden sm:inline">Hari libur otomatis diabaikan</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {missing.map(m => (
                  <button key={m.date} onClick={() => setDate(m.date)}
                    className="px-3 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-100">
                    {fmtTanggal(m.date)} · {m.count}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 1. Bar Navigasi Hari (Senin - Jumat) Seperti Jadwal Pelajaran */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide items-center">
            {HARI_LIST.map((hari) => {
              const isTodayTab = hariOf(today) === hari
              const isActive = selectedHari === hari
              return (
                <button
                  key={hari}
                  type="button"
                  onClick={() => setDate(getWeekdayInSameWeek(date, hari))}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 border ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <span>{hari}</span>
                  {isTodayTab && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* 2. Toolbar Tanggal & Info Semester */}
          <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
            <button onClick={() => setDate(addDays(date, -1))} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition">←</button>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => setDate(addDays(date, 1))} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition">→</button>
            {date !== today && (
              <button onClick={() => setDate(today)} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100 transition">Hari Ini</button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 hidden sm:inline-block">
                Semester {semNum} (Aktif)
              </span>
              <span className="text-sm font-bold text-slate-800">{fmtTanggal(date)}</span>
            </div>
          </div>

          {/* 3. Ringkasan Status Harian Guru (Pill Counters) */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-semibold border border-slate-200/80">
              📚 <strong>{dailyStats.teachingCount}</strong> Jadwal Mengajar
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              ✅ <strong>{dailyStats.filledCount}</strong> Terisi (Hijau)
            </span>
            {dailyStats.needFillCount > 0 && (
              <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 font-bold border border-rose-200 animate-pulse-subtle">
                ⚠️ <strong>{dailyStats.needFillCount}</strong> Perlu Diisi (Merah)
              </span>
            )}
            {dailyStats.holidayCount > 0 && (
              <span className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-800 font-semibold border border-sky-200">
                🏖️ <strong>{dailyStats.holidayCount}</strong> Libur / Jam Kosong
              </span>
            )}
            {dailyStats.emptyCount > 0 && (
              <span className="px-3 py-1.5 rounded-xl bg-slate-50 text-slate-500 font-medium border border-slate-200/60 hidden sm:inline-flex">
                ☕ <strong>{dailyStats.emptyCount}</strong> Jam Kosong
              </span>
            )}
          </div>

          {/* 4. Banner jika tanggal terpilih tidak ada presensi sekolah (Hari Libur) */}
          {dayPresensiCount === 0 && date <= today && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🏖️</span>
                <div>
                  <p className="text-sm font-bold text-sky-900">Hari Libur / Tidak Ada Aktivitas Presensi Sekolah</p>
                  <p className="text-xs text-sky-700 mt-0.5">Tidak tercatat kehadiran siswa pada tanggal ini. Anda dapat menandai seluruh jadwal hari ini sebagai Libur sekaligus.</p>
                </div>
              </div>
              {groupsToday.length > 0 && (
                <button
                  onClick={handleMarkAllHoliday}
                  disabled={markingAllHoliday}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-sm transition disabled:opacity-50"
                >
                  {markingAllHoliday ? 'Menandai...' : 'Tandai Semua Libur'}
                </button>
              )}
            </div>
          )}

          {/* 5. LIVE WIDGET: Jika Jam KBM Sedang Berlangsung Hari Ini */}
          {date === today && liveSlot && (
            <div className="py-2.5 px-3.5 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-xs animate-fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-bold shrink-0 text-emerald-900">Sedang Berlangsung:</span>
                <span className="font-bold truncate text-emerald-950">
                  {liveSlot.type === 'teaching'
                    ? `${liveSlot.group.mapelNama} · Kelas ${liveSlot.group.kelas}`
                    : liveSlot.type === 'break'
                    ? (liveSlot.label || 'Istirahat')
                    : liveSlot.type === 'empty'
                    ? 'Jam Kosong / Tidak Ada Jam Mengajar'
                    : (liveSlot.label || 'Kegiatan')}
                </span>
                {liveSlot.type === 'teaching' && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    liveSlot.journal ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}>
                    {liveSlot.journal ? 'Terisi' : 'Perlu Diisi'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                <span className="font-semibold text-emerald-800">{liveSlot.start} – {liveSlot.end}</span>
                {liveSlot.type === 'teaching' && (
                  <button
                    onClick={() => openForm(liveSlot.group)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs shadow-2xs transition ${
                      liveSlot.journal ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-rose-600 text-white hover:bg-rose-700'
                    }`}
                  >
                    {liveSlot.journal ? 'Edit ✏️' : 'Isi Jurnal ✍️'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 6. TIMELINE JADWAL & JURNAL (Format Timeline Kartu Interaktif) */}
          {loadingJadwal || loadingDay || loadingSlots ? (
            <div className="py-14 text-center bg-white border border-slate-200 rounded-3xl p-8">
              <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">Menyinkronkan jadwal mengajar &amp; jurnal...</p>
            </div>
          ) : timelineRows.length === 0 ? (
            <div className="py-12 text-center bg-white border border-slate-200 rounded-3xl p-8">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm font-semibold text-slate-700">Tidak ada slot jadwal pada hari {selectedHari}.</p>
              <p className="text-xs text-slate-400 mt-1">Jurnal mengikuti master jadwal pelajaran sekolah (semester {semNum}).</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {timelineRows.map((row) => {
                const isLive = date === today && liveSlot?.id === row.id

                // A. Break / Istirahat
                if (row.type === 'break') {
                  return (
                    <div
                      key={row.id}
                      className={`py-2 px-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                        isLive
                          ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300 font-bold'
                          : 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-amber-200/70 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0">
                          ☕
                        </span>
                        <div className="truncate">
                          <span className="font-bold uppercase tracking-wide">{row.label}</span>
                          <span className="text-[11px] text-amber-800/80 ml-1.5 font-normal">({row.durasi}m)</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-amber-900 bg-white/90 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                        {row.start} – {row.end}
                      </span>
                    </div>
                  )
                }

                // B. Persiapan KBM / Upacara / Doa pagi / Blok khusus / Penutup
                if (row.type === 'special') {
                  return (
                    <div
                      key={row.id}
                      className={`py-2 px-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                        isLive
                          ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-300 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-slate-200/80 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 font-mono">
                          0
                        </span>
                        <div className="truncate">
                          <span className="font-bold uppercase tracking-wide">{row.label}</span>
                          {row.durasi && (
                            <span className="text-[11px] text-slate-400 ml-1.5 font-normal">({row.durasi}m)</span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                        {row.start} – {row.end}
                      </span>
                    </div>
                  )
                }

                // C. Jam Kosong (Guru Tidak Ada Jadwal Mengajar)
                if (row.type === 'empty') {
                  return (
                    <div
                      key={row.id}
                      className={`py-2.5 px-3.5 rounded-xl border border-dashed flex items-center justify-between gap-3 text-xs transition-all ${
                        isLive
                          ? 'bg-slate-100 border-slate-300 ring-1 ring-slate-400'
                          : 'bg-slate-50/60 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 font-bold text-xs flex items-center justify-center shrink-0 font-mono">
                          {row.label}
                        </span>
                        <div className="truncate flex items-center gap-1.5">
                          <span className="font-bold text-slate-600">☕ Jam Kosong</span>
                          <span className="text-slate-400 hidden sm:inline">• Tidak Ada Jam Mengajar</span>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 bg-white/70 px-2 py-0.5 rounded border border-slate-200/80 shrink-0">
                        {row.start} – {row.end}
                      </span>
                    </div>
                  )
                }

                // D. Kartu Mengajar Guru: HIJAU (Terisi) | MERAH (Perlu Diisi) | SKY (Libur) | AMBER (Tidak Terlaksana) | SLATE (Akan Datang)
                if (row.type === 'teaching') {
                  const { group, journal, jamAwal, jamAkhir, start, end } = row
                  const jamBadge = getJamBadgeText(jamAwal, jamAkhir)

                  const isFilled = journal?.status === 'terlaksana'
                  const isLibur = journal?.status === 'libur'
                  const isNotHeld = journal?.status === 'tidak_terlaksana'
                  const isNeedFill = !journal && date <= today
                  const isFuture = !journal && date > today

                  // Visual Theme
                  let containerCls = 'bg-white border-slate-200 hover:border-indigo-400'
                  let badgeCls = 'bg-slate-100 text-slate-700 border-slate-200'
                  let pillCls = 'bg-slate-100 text-slate-700 border-slate-200'
                  let statusText = 'Belum Diisi'

                  if (isFilled) {
                    containerCls = 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-500 ring-1 ring-emerald-200/60 shadow-xs'
                    pillCls = 'bg-emerald-600 text-white shadow-xs'
                    badgeCls = 'bg-emerald-600 text-white'
                    statusText = '✅ Jurnal Terisi'
                  } else if (isNeedFill) {
                    containerCls = 'bg-rose-50/70 border-rose-300 hover:border-rose-500 ring-2 ring-rose-200 shadow-xs animate-pulse-subtle'
                    pillCls = 'bg-rose-600 text-white shadow-xs'
                    badgeCls = 'bg-rose-600 text-white'
                    statusText = '⚠️ Perlu Diisi'
                  } else if (isLibur) {
                    containerCls = 'bg-sky-50/70 border-sky-300 hover:border-sky-400'
                    pillCls = 'bg-sky-600 text-white'
                    badgeCls = 'bg-sky-600 text-white'
                    statusText = '🏖️ Libur / Kegiatan'
                  } else if (isNotHeld) {
                    containerCls = 'bg-amber-50/70 border-amber-300 hover:border-amber-400'
                    pillCls = 'bg-amber-600 text-white'
                    badgeCls = 'bg-amber-600 text-white'
                    statusText = '⛔ Tidak Terlaksana'
                  } else if (isFuture) {
                    containerCls = 'bg-white border-slate-200 hover:border-indigo-300'
                    pillCls = 'bg-slate-100 text-slate-700 border border-slate-200'
                    badgeCls = 'bg-slate-100 text-slate-600 border border-slate-200'
                    statusText = '🕒 Akan Datang'
                  }

                  return (
                    <div
                      key={row.id}
                      onClick={() => openForm(group)}
                      className={`group relative p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${containerCls} ${
                        isLive ? 'ring-2 ring-emerald-500 border-emerald-500' : ''
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {/* Jam Ke Pill */}
                        <div className={`w-11 sm:w-12 h-11 sm:h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold transition-transform group-hover:scale-105 ${pillCls}`}>
                          <span className="text-[8px] uppercase tracking-wider opacity-85 leading-none">JAM</span>
                          <span className="text-xs sm:text-sm font-black leading-none mt-0.5">{jamBadge}</span>
                        </div>

                        {/* Mapel, Kelas, dan Ringkasan Jurnal */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-sm sm:text-base text-slate-900 truncate">
                              {group.mapelNama}
                            </h4>
                            <span className="text-xs font-bold text-slate-700 bg-white/90 border border-slate-200/80 px-2 py-0.5 rounded-lg shrink-0">
                              Kelas {group.kelas}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs ${badgeCls}`}>
                              {statusText}
                            </span>
                            {isLive && (
                              <span className="text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.2 rounded uppercase animate-pulse shrink-0">
                                LIVE
                              </span>
                            )}
                          </div>

                          {/* Subtitle / Konten Jurnal */}
                          {isFilled && journal && (
                            <div className="mt-1 space-y-0.5 text-xs">
                              {journal.bab && (
                                <div className="font-bold text-emerald-900 truncate">
                                  📘 Bab: {journal.bab}
                                </div>
                              )}
                              {journal.materi && (
                                <div className="text-slate-700 line-clamp-2">
                                  <span className="font-semibold text-slate-900">Materi:</span> {journal.materi}
                                </div>
                              )}
                              {journal.sertakan_absen !== false && journal.siswa_tidak_hadir && (
                                <div className="text-rose-700 font-medium truncate text-[11px]">
                                  👥 Siswa Absen: {journal.siswa_tidak_hadir}
                                </div>
                              )}
                            </div>
                          )}

                          {isNeedFill && (
                            <p className="text-xs text-rose-700 font-medium mt-1">
                              👉 Ketuk di sini untuk mengisi Bab, Materi KBM, dan Presensi Siswa
                            </p>
                          )}

                          {isLibur && journal && (
                            <p className="text-xs text-sky-800 font-medium mt-1 truncate">
                              Keterangan: {journal.alasan || 'Hari Libur / Kegiatan Sekolah'}
                            </p>
                          )}

                          {isNotHeld && journal && (
                            <p className="text-xs text-amber-800 font-medium mt-1 truncate">
                              Alasan: {journal.alasan || 'Tidak terlaksana'}
                            </p>
                          )}

                          {isFuture && (
                            <p className="text-xs text-slate-400 mt-1">
                              Jadwal KBM mendatang. Ketuk jika ingin mengisi lebih awal.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bagian Kanan: Jam & Tombol Action */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">
                          {start} – {end}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openForm(group)
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition shadow-2xs ${
                            isFilled
                              ? 'bg-white hover:bg-emerald-100 text-emerald-700 border border-emerald-300'
                              : isNeedFill
                              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                              : isLibur
                              ? 'bg-white hover:bg-sky-100 text-sky-700 border border-sky-300'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {isFilled ? 'Edit Jurnal ✏️' : isNeedFill ? 'Isi Jurnal ✍️' : isLibur ? 'Edit Libur ✏️' : 'Isi Jurnal'}
                        </button>
                      </div>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )}
        </>
      )}

      {tab === 'riwayat' && (
        <>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3">
            <label className="text-sm font-bold text-slate-700">Bulan:</label>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold" />
            <span className="ml-auto text-xs font-bold text-slate-500">{history.length} jurnal</span>
          </div>
          {loadingHistory ? (
            <div className="py-12 text-center text-slate-400 text-sm">Memuat riwayat...</div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl text-sm text-slate-500">Belum ada jurnal pada bulan ini.</div>
          ) : (
            <div className="space-y-3">
              {history.map(j => (
                <div key={j.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-600">{fmtTanggal(j.tanggal)}</span>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Jam ke-{j.jam_ke_awal}{j.jam_ke_akhir !== j.jam_ke_awal ? `–${j.jam_ke_akhir}` : ''}
                    </span>
                    {j.status === 'libur' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200">Libur / Kegiatan</span>
                    )}
                    {j.status === 'tidak_terlaksana' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Tidak Terlaksana</span>
                    )}
                  </div>
                  <p className="font-bold text-slate-900">{j.mata_pelajaran?.nama || 'Mata Pelajaran'} · Kelas {j.kelas}</p>
                  {j.status === 'libur' ? (
                    <p className="text-sm text-sky-700 mt-1">Keterangan: {j.alasan || 'Hari Libur / Kegiatan Sekolah'}</p>
                  ) : j.status === 'tidak_terlaksana' ? (
                    <p className="text-sm text-slate-600 mt-1">Alasan: {j.alasan}</p>
                  ) : (
                    <>
                      {j.bab && <p className="text-xs font-bold text-indigo-700 mt-1">Bab: {j.bab}</p>}
                      <p className="text-sm text-slate-700 mt-0.5"><span className="font-semibold">Materi:</span> {j.materi}</p>
                      {j.kegiatan && <p className="text-sm text-slate-600 mt-0.5"><span className="font-semibold">Kegiatan:</span> {j.kegiatan}</p>}
                    </>
                  )}
                  {j.sertakan_absen !== false && j.siswa_tidak_hadir && (
                    <p className="text-xs text-slate-500 mt-1">Siswa tidak hadir: {j.siswa_tidak_hadir}</p>
                  )}
                  {j.catatan && <p className="text-xs text-slate-500 mt-0.5">Catatan: {j.catatan}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Pengisian Jurnal */}
      {editing && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4" onClick={() => !saving && setEditing(null)}>
          <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">{editing.existing ? 'Edit Jurnal' : 'Isi Jurnal'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmtTanggal(date)} · Jam ke-{editing.group.jamAwal}{editing.group.jamAkhir !== editing.group.jamAwal ? `–${editing.group.jamAkhir}` : ''} · {editing.group.mapelNama} · Kelas {editing.group.kelas}
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Pilihan Status Pertemuan */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['terlaksana', '✅ Terlaksana'],
                  ['libur', '🏖️ Libur/Kegiatan'],
                  ['tidak_terlaksana', '⛔ Jam Kosong']
                ].map(([v, label]) => (
                  <button type="button" key={v} onClick={() => setForm(f => ({ ...f, status: v }))}
                    className={`py-2 px-1 text-center rounded-xl text-xs font-bold border-2 transition ${form.status === v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {form.status === 'terlaksana' ? (
                <>
                  {/* Dropdown Ambil dari Bab & TP Input Nilai */}
                  {availableTps.length > 0 && (
                    <div className="p-3 bg-indigo-50/80 border border-indigo-200/60 rounded-2xl space-y-1.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>Ambil dari Bab &amp; TP Nilai (Cepat)</span>
                        </label>
                        <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-100">
                          {availableTps.length} TP Terdata
                        </span>
                      </div>
                      <select
                        value={selectedTpId}
                        onChange={(e) => handleSelectTp(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      >
                        <option value="">-- Pilih TP / Bab dari Input Nilai --</option>
                        {availableTps.map(tp => (
                          <option key={tp.id} value={tp.id}>
                            {tp.bab_nama ? `[${tp.bab_nama}] ` : ''}{tp.nama}{tp.deskripsi ? `: ${tp.deskripsi.slice(0, 50)}...` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-indigo-600">
                        Memilih TP otomatis mengisi Bab, Materi, dan kegiatan pembelajaran.
                      </p>
                    </div>
                  )}

                  {/* Input Bab / Lingkup Materi */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Bab / Lingkup Materi (opsional)</label>
                    <input
                      type="text"
                      className={inputCls}
                      value={form.bab}
                      onChange={(e) => setForm(f => ({ ...f, bab: e.target.value }))}
                      placeholder="Contoh: Bab 1: Lingkaran atau Bab 2: Pythagoras"
                    />
                  </div>

                  {/* Input Materi Pembelajaran */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Materi / Topik Pembelajaran *</label>
                    <textarea rows={2} className={inputCls} value={form.materi}
                      onChange={(e) => setForm(f => ({ ...f, materi: e.target.value }))}
                      placeholder="Contoh: Menghitung luas dan keliling juring lingkaran" />
                  </div>

                  {/* Input Kegiatan Pembelajaran */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kegiatan / Metode (opsional)</label>
                    <textarea rows={2} className={inputCls} value={form.kegiatan}
                      onChange={(e) => setForm(f => ({ ...f, kegiatan: e.target.value }))}
                      placeholder="Contoh: Diskusi kelompok terpandu dan latihan soal mandiri" />
                  </div>
                </>
              ) : form.status === 'libur' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan Libur / Kegiatan *</label>
                  <input
                    type="text"
                    className={inputCls}
                    value={form.alasan}
                    onChange={(e) => setForm(f => ({ ...f, alasan: e.target.value }))}
                    placeholder="Contoh: Libur Nasional / Class Meeting / Kegiatan Sekolah"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Jurnal ini akan disimpan sebagai terisi tanpa mewajibkan materi atau absensi siswa.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Jam Kosong / Tidak Terlaksana *</label>
                  <textarea rows={2} className={inputCls} value={form.alasan}
                    onChange={(e) => setForm(f => ({ ...f, alasan: e.target.value }))}
                    placeholder="Contoh: Guru berhalangan hadir karena dinas luar / rapat" />
                </div>
              )}

              {/* Bagian Kehadiran Siswa dengan Opsi Checklist Sertakan / Tidak */}
              {form.status === 'terlaksana' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition">
                    <input
                      type="checkbox"
                      checked={form.sertakan_absen}
                      onChange={(e) => setForm(f => ({ ...f, sertakan_absen: e.target.checked }))}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-800 block">
                        Sertakan Catatan Siswa Tidak Hadir
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {form.sertakan_absen
                          ? `${Object.keys(absentMap).length} siswa tercatat tidak hadir (otomatis sinkron presensi harian).`
                          : 'Daftar absensi ditiadakan dari jurnal ini.'}
                      </span>
                    </div>
                  </label>

                  {form.sertakan_absen && (
                    <div className="animate-fade-in space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-bold text-slate-600">
                          Siswa Tidak Hadir ({Object.keys(absentMap).length})
                        </span>
                        <span className="text-[10px] text-slate-400">Ketuk status: Hadir → S → I → A</span>
                      </div>
                      {loadingStudents ? (
                        <div className="text-xs text-slate-400 py-3 text-center">Memuat presensi siswa...</div>
                      ) : classStudents.length === 0 ? (
                        <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">Daftar siswa kelas {editing.group.kelas} tidak ditemukan.</div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                          {classStudents.map(st => {
                            const mark = absentMap[st.nisn]
                            const markCls = mark === 'S' ? 'bg-blue-100 text-blue-700'
                              : mark === 'I' ? 'bg-amber-100 text-amber-700'
                              : mark === 'A' ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-50 text-emerald-600'
                            return (
                              <button type="button" key={st.nisn} onClick={() => cycleAbsent(st.nisn)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                                <span className="text-xs text-slate-800 truncate">{st.nama}</span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] text-slate-400">
                                    Presensi: {st.presensi || '—'}
                                  </span>
                                  <span className={`min-w-[40px] text-center text-[10px] font-bold px-2 py-0.5 rounded-md ${markCls}`}>
                                    {mark || 'Hadir'}
                                  </span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Catatan Tambahan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan (opsional)</label>
                <textarea rows={2} className={inputCls} value={form.catatan}
                  onChange={(e) => setForm(f => ({ ...f, catatan: e.target.value }))}
                  placeholder="Catatan kendala, PR, atau tindak lanjut..." />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              {editing.existing && (
                <button type="button" onClick={handleDelete} disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 sm:mr-auto">Hapus</button>
              )}
              <button type="button" onClick={() => setEditing(null)} disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Batal</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan Jurnal'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Modal Export PDF */}
      {exportOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4" onClick={() => !exporting && setExportOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Export Jurnal ke PDF</h3>
              <p className="text-xs text-slate-500 mt-0.5">Lengkap dengan kop surat resmi &amp; tanda tangan.</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dari Tanggal</label>
                  <input type="date" className={inputCls} value={exportCfg.dari} onChange={(e) => setExportCfg(c => ({ ...c, dari: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sampai Tanggal</label>
                  <input type="date" className={inputCls} value={exportCfg.sampai} onChange={(e) => setExportCfg(c => ({ ...c, sampai: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kelas</label>
                <select className={inputCls} value={exportCfg.kelas} onChange={(e) => setExportCfg(c => ({ ...c, kelas: e.target.value }))}>
                  <option value="all">Semua Kelas</option>
                  {kelasOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Kepala Sekolah (tanda tangan)</label>
                <input className={inputCls} value={exportCfg.kepsekNama} onChange={(e) => setExportCfg(c => ({ ...c, kepsekNama: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tempat Penandatanganan</label>
                <input className={inputCls} value={exportCfg.tempat} onChange={(e) => setExportCfg(c => ({ ...c, tempat: e.target.value }))} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
              <button onClick={() => setExportOpen(false)} disabled={exporting} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">Batal</button>
              <button onClick={handleExport} disabled={exporting} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
                {exporting ? 'Membuat PDF...' : 'Unduh PDF'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
