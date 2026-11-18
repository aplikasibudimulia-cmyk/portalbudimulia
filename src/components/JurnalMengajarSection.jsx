import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { getTodayWIB } from '../utils/dateUtils'
import { generateJurnalMengajarPDF } from '../utils/jurnalMengajarPdfExporter'

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

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

/** Gabungkan jam pelajaran berurutan (kelas & mapel sama) menjadi 1 pertemuan. */
function groupSlots(rows) {
  const sorted = [...rows].sort((a, b) => a.jam_ke - b.jam_ke)
  const groups = []
  for (const r of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.kelas === r.kelas && last.mapelId === (r.mata_pelajaran?.id || null) && r.jam_ke === last.jamAkhir + 1) {
      last.jamAkhir = r.jam_ke
      last.waktuSelesai = r.waktu_selesai
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

  const jadwalByHari = useMemo(() => {
    const map = {}
    for (const r of jadwal) (map[r.hari] ||= []).push(r)
    const out = {}
    for (const h of Object.keys(map)) out[h] = groupSlots(map[h])
    return out
  }, [jadwal])

  const groupsToday = jadwalByHari[hariOf(date)] || []

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

          <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3">
            <button onClick={() => setDate(addDays(date, -1))} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">←</button>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold" />
            <button onClick={() => setDate(addDays(date, 1))} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">→</button>
            {date !== today && (
              <button onClick={() => setDate(today)} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100">Hari Ini</button>
            )}
            <span className="ml-auto text-sm font-bold text-slate-700">{fmtTanggal(date)}</span>
          </div>

          {/* Banner jika tanggal terpilih tidak ada presensi sekolah (Hari Libur) */}
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

          {loadingJadwal || loadingDay ? (
            <div className="py-12 text-center text-slate-400 text-sm">Memuat jadwal...</div>
          ) : groupsToday.length === 0 ? (
            <div className="py-12 text-center bg-white border border-slate-200 rounded-2xl">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm font-semibold text-slate-700">Tidak ada jadwal mengajar pada hari {hariOf(date)}.</p>
              <p className="text-xs text-slate-400 mt-1">Jurnal mengikuti Jadwal Pelajaran yang diatur admin (semester {semNum}).</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupsToday.map(g => {
                const st = statusOf(g)
                const j = journalsDay[g.jadwalId]
                return (
                  <div key={g.key} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          Jam ke-{g.jamAwal}{g.jamAkhir !== g.jamAwal ? `–${g.jamAkhir}` : ''}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">{hhmm(g.waktuMulai)} – {hhmm(g.waktuSelesai)}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="font-bold text-slate-900">{g.mapelNama} · Kelas {g.kelas}</p>
                      {j && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {j.status === 'libur' ? `🏖️ Libur / Kegiatan: ${j.alasan || '-'}` : (
                            j.status === 'tidak_terlaksana' ? `⛔ Jam Kosong: ${j.alasan || '-'}` : (
                              `${j.bab ? `[${j.bab}] ` : ''}${j.materi || '-'}`
                            )
                          )}
                        </p>
                      )}
                    </div>
                    <button onClick={() => openForm(g)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition shrink-0 ${j ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                      {j ? 'Edit Jurnal' : 'Isi Jurnal'}
                    </button>
                  </div>
                )
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
