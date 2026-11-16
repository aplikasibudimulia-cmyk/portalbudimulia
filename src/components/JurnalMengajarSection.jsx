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

const emptyForm = { status: 'terlaksana', materi: '', kegiatan: '', siswa_tidak_hadir: '', catatan: '', alasan: '' }

export default function JurnalMengajarSection({ session, activeTa, semester }) {
  const today = getTodayWIB()
  const semNum = parseInt(semester) || 1

  const [tab, setTab] = useState('harian')
  const [date, setDate] = useState(today)
  const [jadwal, setJadwal] = useState([])
  const [loadingJadwal, setLoadingJadwal] = useState(true)
  const [journalsDay, setJournalsDay] = useState({})
  const [loadingDay, setLoadingDay] = useState(false)
  const [missing, setMissing] = useState([])

  const [month, setMonth] = useState(today.slice(0, 7))
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [editing, setEditing] = useState(null) // { group, existing }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

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

  // 2. Jurnal pada tanggal terpilih
  const fetchDay = useCallback(async () => {
    if (!session?.id) return
    setLoadingDay(true)
    try {
      const { data, error } = await supabase
        .from('jurnal_mengajar')
        .select('*')
        .eq('guru_id', session.id)
        .eq('tanggal', date)
      if (error) throw error
      const map = {}
      for (const j of data || []) map[j.jadwal_id] = j
      setJournalsDay(map)
    } catch (e) {
      console.warn('Gagal memuat jurnal harian:', e)
      showToast('error', 'Gagal memuat jurnal. Pastikan SQL create_jurnal_mengajar.sql sudah dijalankan.')
    } finally {
      setLoadingDay(false)
    }
  }, [session?.id, date])

  useEffect(() => { fetchDay() }, [fetchDay])

  // 3. Jurnal yang belum diisi (14 hari terakhir)
  const fetchMissing = useCallback(async () => {
    if (!session?.id || jadwal.length === 0) { setMissing([]); return }
    try {
      const from = addDays(today, -14)
      const { data } = await supabase
        .from('jurnal_mengajar')
        .select('jadwal_id, tanggal')
        .eq('guru_id', session.id)
        .gte('tanggal', from)
        .lte('tanggal', today)
      const filled = new Set((data || []).map(j => `${j.jadwal_id}|${j.tanggal}`))
      const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
      const list = []
      for (let i = 0; i <= 14; i++) {
        const d = addDays(today, -i)
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
        // prioritaskan presensi masuk
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
        // Jurnal baru: otomatis ikuti presensi harian (Sakit / Izin / Alpa)
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
    setForm(existing ? {
      status: existing.status || 'terlaksana',
      materi: existing.materi || '',
      kegiatan: existing.kegiatan || '',
      siswa_tidak_hadir: existing.siswa_tidak_hadir || '',
      catatan: existing.catatan || '',
      alasan: existing.alasan || ''
    } : emptyForm)
    loadClassStudents(group.kelas, existing)
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
    if (form.status === 'tidak_terlaksana' && !form.alasan.trim()) {
      showToast('error', 'Alasan tidak terlaksana wajib diisi.')
      return
    }
    const g = editing.group
    setSaving(true)
    try {
      const absentList = classStudents
        .filter(st => absentMap[st.nisn])
        .map(st => ({ nisn: st.nisn, nama: st.nama, status: absentMap[st.nisn] }))
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
        materi: form.status === 'terlaksana' ? form.materi.trim() : null,
        kegiatan: form.status === 'terlaksana' ? (form.kegiatan.trim() || null) : null,
        siswa_tidak_hadir: form.status === 'terlaksana' ? (absentList.map(a => `${a.nama} (${a.status})`).join(', ') || null) : null,
        siswa_tidak_hadir_data: form.status === 'terlaksana' ? absentList : [],
        catatan: form.catatan.trim() || null,
        alasan: form.status === 'tidak_terlaksana' ? form.alasan.trim() : null
      }
      let { error } = await supabase
        .from('jurnal_mengajar')
        .upsert(payload, { onConflict: 'guru_id,jadwal_id,tanggal' })
      // Fallback jika kolom siswa_tidak_hadir_data belum dibuat di database
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
    if (j) return j.status === 'tidak_terlaksana'
      ? { label: 'Tidak Terlaksana', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { label: 'Terisi', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (date > today) return { label: 'Akan Datang', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    return { label: 'Belum Diisi', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
  }

  const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="animate-slide-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Jurnal Mengajar</h2>
          <p className="text-slate-500 text-sm mt-1">Isi jurnal pembelajaran sesuai jadwal mengajar Anda. Bisa mengisi hari yang sudah lewat maupun yang akan datang.</p>
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
          {missing.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
              <p className="text-sm font-bold text-rose-800 mb-2">
                ⚠️ {missing.reduce((a, b) => a + b.count, 0)} jurnal belum diisi (14 hari terakhir)
              </p>
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
                          {j.status === 'tidak_terlaksana' ? `Alasan: ${j.alasan}` : `Materi: ${j.materi}`}
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
                    {j.status === 'tidak_terlaksana' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Tidak Terlaksana</span>
                    )}
                  </div>
                  <p className="font-bold text-slate-900">{j.mata_pelajaran?.nama || 'Mata Pelajaran'} · Kelas {j.kelas}</p>
                  {j.status === 'tidak_terlaksana' ? (
                    <p className="text-sm text-slate-600 mt-1">Alasan: {j.alasan}</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 mt-1"><span className="font-semibold">Materi:</span> {j.materi}</p>
                      {j.kegiatan && <p className="text-sm text-slate-600 mt-0.5"><span className="font-semibold">Kegiatan:</span> {j.kegiatan}</p>}
                    </>
                  )}
                  {j.siswa_tidak_hadir && <p className="text-xs text-slate-500 mt-1">Siswa tidak hadir: {j.siswa_tidak_hadir}</p>}
                  {j.catatan && <p className="text-xs text-slate-500 mt-0.5">Catatan: {j.catatan}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

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
              <div className="grid grid-cols-2 gap-2">
                {[['terlaksana', '✅ Terlaksana'], ['tidak_terlaksana', '⛔ Tidak Terlaksana']].map(([v, label]) => (
                  <button type="button" key={v} onClick={() => setForm(f => ({ ...f, status: v }))}
                    className={`py-2.5 rounded-xl text-sm font-bold border-2 transition ${form.status === v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {form.status === 'terlaksana' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Materi / Topik Pembelajaran *</label>
                    <textarea rows={2} className={inputCls} value={form.materi}
                      onChange={(e) => setForm(f => ({ ...f, materi: e.target.value }))}
                      placeholder="Contoh: Persamaan linear satu variabel" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kegiatan / Metode (opsional)</label>
                    <textarea rows={2} className={inputCls} value={form.kegiatan}
                      onChange={(e) => setForm(f => ({ ...f, kegiatan: e.target.value }))}
                      placeholder="Contoh: Diskusi kelompok dan latihan soal" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Tidak Terlaksana *</label>
                  <textarea rows={2} className={inputCls} value={form.alasan}
                    onChange={(e) => setForm(f => ({ ...f, alasan: e.target.value }))}
                    placeholder="Contoh: Guru dinas luar / kelas dipakai kegiatan sekolah" />
                </div>
              )}

              {form.status === 'terlaksana' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Siswa Tidak Hadir ({Object.keys(absentMap).length})
                    </label>
                    <span className="text-[10px] text-slate-400">Ketuk nama untuk ubah: Hadir → S → I → A</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">Otomatis mengikuti presensi harian {fmtTanggal(date)}. Bisa ditambah (mis. membolos pelajaran) atau dikurangi.</p>
                  {loadingStudents ? (
                    <div className="text-xs text-slate-400 py-3 text-center">Memuat daftar siswa...</div>
                  ) : classStudents.length === 0 ? (
                    <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-xl">Daftar siswa kelas {editing.group.kelas} tidak ditemukan.</div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {classStudents.map(st => {
                        const mark = absentMap[st.nisn]
                        const markCls = mark === 'S' ? 'bg-blue-100 text-blue-700'
                          : mark === 'I' ? 'bg-amber-100 text-amber-700'
                          : mark === 'A' ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 text-emerald-600'
                        return (
                          <button type="button" key={st.nisn} onClick={() => cycleAbsent(st.nisn)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50">
                            <span className="text-sm text-slate-800 truncate">{st.nama}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400" title="Status presensi harian">
                                Presensi: {st.presensi || '—'}
                              </span>
                              <span className={`min-w-[44px] text-center text-[11px] font-bold px-2 py-0.5 rounded-md ${markCls}`}>
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (opsional)</label>
                <textarea rows={2} className={inputCls} value={form.catatan}
                  onChange={(e) => setForm(f => ({ ...f, catatan: e.target.value }))} />
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

      {exportOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-0 sm:p-4" onClick={() => !exporting && setExportOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Export Jurnal ke PDF</h3>
              <p className="text-xs text-slate-500 mt-0.5">Lengkap dengan kop surat & tanda tangan.</p>
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
