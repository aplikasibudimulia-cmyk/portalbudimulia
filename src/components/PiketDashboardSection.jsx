import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function PiketDashboardSection({ session, activeTa, filterKelas }) {
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString('en-CA'))
  const [semuaKelas, setSemuaKelas] = useState([])
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [presensiHariIni, setPresensiHariIni] = useState([])
  const [presensiMingguan, setPresensiMingguan] = useState([])
  const [presensiHariIniFull, setPresensiHariIniFull] = useState([])
  const [semuaKelasFull, setSemuaKelasFull] = useState([])
  const [loading, setLoading] = useState(true)
  const [laporanLoading, setLaporanLoading] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [tanggal, activeTa, filterKelas])

  const latestFetchRef = React.useRef(null)
  React.useEffect(() => {
    latestFetchRef.current = fetchDashboardData
  })

  useEffect(() => {
    const channel = supabase.channel('realtime_piket_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian' }, (payload) => {
        const record = payload.new || payload.old
        if (record && record.tanggal === tanggal) {
          latestFetchRef.current?.(true)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tanggal, filterKelas])

  // Fast-poll fallback (4s) to guarantee updates if websocket experiences RLS or channel errors
  useEffect(() => {
    const poll = setInterval(() => {
      latestFetchRef.current?.(true)
    }, 4000)
    return () => clearInterval(poll)
  }, [tanggal, filterKelas])

  const fetchDashboardData = async (isRealtime = false) => {
    if (!isRealtime) setLoading(true)
    try {
      let siswaData = []
      let from = 0
      let to = 999
      let hasMore = true
      while (hasMore) {
        let query = supabase.from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .eq('is_aktif', true)
          .range(from, to)
        if (filterKelas && filterKelas.length > 0) {
          query = query.in('kelas', filterKelas)
        }
        const { data, error } = await query
        if (error) {
          console.error(error)
          break
        }
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          siswaData = [...siswaData, ...data]
          if (data.length < 1000) {
            hasMore = false
          } else {
            from += 1000
            to += 1000
          }
        }
      }

      const siswaMap = {}
      let nisnList = []

      if (siswaData) {
        setSemuaSiswa(siswaData)
        const uniqueClasses = [...new Set(siswaData.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelas(uniqueClasses)
        siswaData.forEach(s => { 
          siswaMap[s.nisn] = s.kelas 
          nisnList.push(s.nisn)
        })
      }

      // Fetch ALL classes and ALL presence today for the full bar chart
      let semuaSiswaFullDB = []
      from = 0
      to = 999
      hasMore = true
      while (hasMore) {
        const { data, error } = await supabase.from('siswa_lengkap')
          .select('nisn, kelas')
          .eq('is_aktif', true)
          .range(from, to)
        if (error) {
          console.error(error)
          break
        }
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          semuaSiswaFullDB = [...semuaSiswaFullDB, ...data]
          if (data.length < 1000) {
            hasMore = false
          } else {
            from += 1000
            to += 1000
          }
        }
      }

      const fullSiswaMap = {}
      if (semuaSiswaFullDB) {
        const uniqueKelasFull = [...new Set(semuaSiswaFullDB.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelasFull(uniqueKelasFull)
        semuaSiswaFullDB.forEach(s => { fullSiswaMap[s.nisn] = s.kelas })
      }

      const { data: presensiFullData } = await supabase.from('presensi_harian').select('siswa_nisn, kelas, status, tipe').eq('tanggal', tanggal)
      if (presensiFullData) {
        const syncedFull = presensiFullData
          .filter(p => p.tipe !== 'pulang')
          .map(p => ({ ...p, kelas: fullSiswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiHariIniFull(syncedFull)
      }

      let presensiQuery = supabase.from('presensi_harian').select('*').eq('tanggal', tanggal)
      if (filterKelas && filterKelas.length > 0 && nisnList.length > 0) {
        // Fetch presensi for current students in these classes, ignoring the old class they were saved with
        presensiQuery = presensiQuery.in('siswa_nisn', nisnList)
      } else if (filterKelas && filterKelas.length > 0) {
        // If there are no students in the filtered classes, just force an empty result
        presensiQuery = presensiQuery.in('siswa_nisn', ['0000000000'])
      }
      const { data: presensiDataDB } = await presensiQuery
      
      if (presensiDataDB) {
        // Sync class to current student class
        const updatedPresensi = presensiDataDB
          .filter(p => p.tipe !== 'pulang')
          .map(p => ({ ...p, kelas: siswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiHariIni(updatedPresensi)
      }

      const dateObj = new Date(tanggal)
      dateObj.setDate(dateObj.getDate() - 7)
      const startDate = dateObj.toLocaleDateString('en-CA')

      let mingguanQuery = supabase.from('presensi_harian').select('*').gte('tanggal', startDate).lte('tanggal', tanggal).order('tanggal', { ascending: true })
      if (filterKelas && filterKelas.length > 0 && nisnList.length > 0) {
        mingguanQuery = mingguanQuery.in('siswa_nisn', nisnList)
      } else if (filterKelas && filterKelas.length > 0) {
        mingguanQuery = mingguanQuery.in('siswa_nisn', ['0000000000'])
      }
      const { data: presensiMingguanDB } = await mingguanQuery

      if (presensiMingguanDB) {
        // Sync class to current student class
        const updatedMingguan = presensiMingguanDB
          .filter(p => p.tipe !== 'pulang')
          .map(p => ({ ...p, kelas: siswaMap[p.siswa_nisn] || p.kelas }))
        setPresensiMingguan(updatedMingguan)
      }

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  // Summary statistics (Hari Ini)
  const totalSiswaCount = semuaSiswa.length
  // Sesuai logika baru: siswa yang hadir dan terlambat keduanya dihitung sebagai Hadir
  const hadirCount = presensiHariIni.filter(p => p.status === 'H' || p.status === 'T').length
  const telatCount = presensiHariIni.filter(p => p.status === 'T').length
  const sakitIzinCount = presensiHariIni.filter(p => p.status === 'S' || p.status === 'I').length
  const alpaCount = presensiHariIni.filter(p => p.status === 'A').length
  
  // Line Chart (7 Days Attendance)
  const lineChartData = useMemo(() => {
    const data = []
    for(let i=6; i>=0; i--) {
      const d = new Date(tanggal)
      d.setDate(d.getDate() - i)
      const dateStr = d.toLocaleDateString('en-CA')
      const label = d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
      const count = presensiMingguan.filter(p => p.tanggal === dateStr && (p.status === 'H' || p.status === 'T')).length
      data.push({ dateStr, label, total: count })
    }
    return data
  }, [presensiMingguan, tanggal])

  // Bar Chart (Students Present by Class Today)
  const barChartData = useMemo(() => {
    return semuaKelasFull.map(c => {
      const hadir = presensiHariIniFull.filter(p => p.kelas === c && (p.status === 'H' || p.status === 'T')).length
      return { kelas: c, hadir }
    })
  }, [semuaKelasFull, presensiHariIniFull])

  // Pie Chart
  const pieChartData = useMemo(() => {
    return [
      { name: 'Sakit', value: presensiHariIni.filter(p => p.status === 'S').length, color: '#3b82f6' },
      { name: 'Izin', value: presensiHariIni.filter(p => p.status === 'I').length, color: '#a855f7' },
      { name: 'Alpha', value: presensiHariIni.filter(p => p.status === 'A').length, color: '#f43f5e' },
      { name: 'Terlambat', value: telatCount, color: '#f97316' },
    ].filter(d => d.value > 0)
  }, [presensiHariIni, telatCount])

  const totalPerhatian = pieChartData.reduce((acc, curr) => acc + curr.value, 0)

  // Top 6 Attendant (over last 7 days)
  const topAttendant = useMemo(() => {
    const studentCount = {}
    presensiMingguan.forEach(p => {
      if (p.status === 'H' || p.status === 'T') {
        studentCount[p.siswa_nisn] = (studentCount[p.siswa_nisn] || 0) + 1
      }
    })
    
    const sorted = Object.entries(studentCount)
      .map(([nisn, count]) => ({ nisn, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return sorted.map(item => {
      const s = semuaSiswa.find(x => x.nisn === item.nisn)
      return {
        ...item,
        nama: s?.nama_lengkap || item.nisn,
        kelas: s?.kelas || '-',
        percentage: Math.min(Math.round((item.count / 7) * 100), 100)
      }
    })
  }, [presensiMingguan, semuaSiswa])

  // Unrecorded students today
  const unrecordedStudents = useMemo(() => {
    const recordedNisn = new Set(presensiHariIni.map(p => p.siswa_nisn))
    return semuaSiswa.filter(s => !recordedNisn.has(s.nisn))
  }, [semuaSiswa, presensiHariIni])

  // ── Laporan Harian Print ──────────────────────────────────────────────
  const handlePrintLaporan = useCallback(async () => {
    setLaporanLoading(true)
    try {
      // Fetch school info
      const { data: settings } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
      const settingsMap = {}
      if (settings) settings.forEach(s => { settingsMap[s.setting_key] = s.setting_value })

      const namaSekolah = settingsMap['nama_sekolah'] || 'SMP BUDI MULIA JAKARTA'
      const alamatSekolah = settingsMap['alamat_sekolah'] || 'Jakarta'
      const teleponSekolah = settingsMap['telepon_sekolah'] || ''
      const websiteSekolah = settingsMap['website_sekolah'] || ''

      // Fetch ALL active siswa
      const { data: siswaData } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)
        .order('kelas')
        .order('nama_lengkap')
      // Fetch presensi for the date
      const { data: presensiData } = await supabase
        .from('presensi_harian')
        .select('siswa_nisn, status, kelas, waktu, tipe')
        .eq('tanggal', tanggal)

      const siswaMap = {}
      if (siswaData) siswaData.forEach(s => { siswaMap[s.nisn] = s })

      // Build presensi lookup: nisn -> record
      const presensiMap = {}
      if (presensiData) {
        presensiData.forEach(p => {
          if (p.tipe === 'pulang') return // Skip checkout records in daily report counts
          const siswa = siswaMap[p.siswa_nisn]
          if (siswa) {
            presensiMap[p.siswa_nisn] = { ...p, kelas: siswa.kelas, nama: siswa.nama_lengkap }
          }
        })
      }

      // All classes (sorted)
      const allKelas = [...new Set((siswaData || []).map(s => s.kelas).filter(Boolean))].sort()

      // Rekap per kelas: { kelas, total, hadir, terlambat, sakit, izin, alpa, tidakHadir }
      const rekapKelas = allKelas.map(kelas => {
        const kelasSiswa = (siswaData || []).filter(s => s.kelas === kelas)
        const totalSiswa = kelasSiswa.length
        let hadir = 0, terlambat = 0, sakit = 0, izin = 0, alpa = 0
        kelasSiswa.forEach(s => {
          const p = presensiMap[s.nisn]
          if (!p) return
          if (p.status === 'H') hadir++
          else if (p.status === 'T') {
            hadir++
            terlambat++
          }
          else if (p.status === 'S') sakit++
          else if (p.status === 'I') izin++
          else if (p.status === 'A') alpa++
        })
        const tidakHadir = sakit + izin + alpa
        return { kelas, totalSiswa, hadir, terlambat, sakit, izin, alpa, tidakHadir }
      })

      // Siswa terlambat
      const siswaTerlambat = Object.values(presensiMap)
        .filter(p => p.status === 'T')
        .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama))

      // Siswa tidak hadir (S/I/A)
      const siswaTidakHadir = Object.values(presensiMap)
        .filter(p => p.status === 'S' || p.status === 'I' || p.status === 'A')
        .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama))

      // Total rekap
      const totalSeluruh = rekapKelas.reduce((acc, r) => acc + r.totalSiswa, 0)
      const totalHadir = rekapKelas.reduce((acc, r) => acc + r.hadir, 0)
      const totalTerlambat = rekapKelas.reduce((acc, r) => acc + r.terlambat, 0)
      const totalSakit = rekapKelas.reduce((acc, r) => acc + r.sakit, 0)
      const totalIzin = rekapKelas.reduce((acc, r) => acc + r.izin, 0)
      const totalAlpa = rekapKelas.reduce((acc, r) => acc + r.alpa, 0)
      const totalTidakHadir = rekapKelas.reduce((acc, r) => acc + r.tidakHadir, 0)

      // Format tanggal
      const dateObj = new Date(tanggal + 'T00:00:00')
      const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const hariStr = hariNames[dateObj.getDay()]
      const tanggalStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      const koordinator = session?.nama_guru || ''

      // Build rows for rekap kelas table - 2 columns
      const midIdx = Math.ceil(rekapKelas.length / 2)
      const leftKelas = rekapKelas.slice(0, midIdx)
      const rightKelas = rekapKelas.slice(midIdx)

      // Build rows for siswa terlambat (2-column)
      const midT = Math.ceil(siswaTerlambat.length / 2)
      const siswaTerlambatLeft = siswaTerlambat.slice(0, midT)
      const siswaTerlambatRight = siswaTerlambat.slice(midT)

      // Build rows for siswa tidak hadir (3 columns: S | I | A)
      const siswaSakit = siswaTidakHadir.filter(p => p.status === 'S')
      const siswaIzin = siswaTidakHadir.filter(p => p.status === 'I')
      const siswaAlpa = siswaTidakHadir.filter(p => p.status === 'A')

      const maxRowsTH = Math.max(siswaSakit.length, siswaIzin.length, siswaAlpa.length, 1)

      const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan Piket Harian - ${tanggalStr}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
  }
  @page {
    size: A4;
    margin: 1.8cm 2cm 1.8cm 2.5cm;
  }
  @media print {
    body { margin: 0; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
  }
  .page { width: 100%; }

  /* Header */
  .header-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 6pt; }
  .header-table td { padding: 6pt 8pt; vertical-align: middle; }
  .header-table td:first-child { width: 65%; border-right: 1.5px solid #000; }
  .school-name { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
  .school-sub { font-size: 9.5pt; }
  .doc-info { font-size: 9pt; line-height: 1.7; }

  /* Title */
  .title-block { text-align: center; margin: 10pt 0 6pt; }
  .title-main { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .title-sub { font-size: 10pt; font-weight: bold; }
  .underline-line { border-bottom: 1.5px solid #000; display: block; width: 100%; margin: 2pt 0; }

  /* Info row */
  .info-row { font-size: 10.5pt; margin: 6pt 0 10pt; font-weight: bold; }
  .info-row span { display: inline-block; border-bottom: 1px solid #000; min-width: 200pt; padding: 0 4pt; }

  /* Tables */
  table.data-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 8pt; }
  table.data-table th, table.data-table td {
    border: 1px solid #000;
    padding: 3pt 5pt;
    vertical-align: middle;
  }
  table.data-table th {
    background: #f0f0f0;
    font-weight: bold;
    text-align: center;
  }
  table.data-table td.num { text-align: center; width: 24pt; }
  table.data-table td.center { text-align: center; }
  table.data-table td.kelas-cell { text-align: center; width: 48pt; }
  table.data-table td.status-cell { text-align: center; width: 36pt; font-weight: bold; }
  table.data-table tr.total-row td { font-weight: bold; background: #f8f8f8; }

  /* Section title */
  .section-title { font-size: 10pt; font-weight: bold; margin: 10pt 0 4pt; text-decoration: underline; }

  /* Signature */
  .signature-table { width: 100%; border-collapse: collapse; margin-top: 14pt; }
  .signature-table td { width: 50%; padding: 6pt 10pt; vertical-align: top; text-align: center; font-size: 10pt; }
  .signature-space { height: 44pt; }
  .signature-name { border-top: 1px solid #000; display: inline-block; min-width: 140pt; margin-top: 2pt; padding-top: 2pt; }

  /* Empty cell */
  td.empty { background: #fff; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <table class="header-table">
    <tr>
      <td>
        <div class="school-name">${namaSekolah}</div>
        ${alamatSekolah ? `<div class="school-sub">${alamatSekolah}</div>` : ''}
        ${(teleponSekolah || websiteSekolah) ? `<div class="school-sub">${[teleponSekolah ? 'Telp. ' + teleponSekolah : '', websiteSekolah].filter(Boolean).join('  |  ')}</div>` : ''}
      </td>
      <td>
        <div class="doc-info">
          No. Dokumen&nbsp;&nbsp;: FR-PIKET-01<br>
          Revisi&emsp;&emsp;&emsp;&emsp;: 00<br>
          Berlaku Sejak : Juli 2026
        </div>
      </td>
    </tr>
  </table>

  <!-- TITLE -->
  <div class="title-block">
    <div class="title-main">Laporan Piket Harian</div>
  </div>

  <!-- HARI/TANGGAL -->
  <div class="info-row">
    HARI / TANGGAL : <span>${hariStr} / ${tanggalStr}</span>
  </div>

  <!-- REKAP PER KELAS -->
  <div class="section-title">Rekapitulasi Kehadiran Siswa per Kelas</div>
  <table class="data-table">
    <thead>
      <tr>
        <th>No.</th>
        <th>Kelas</th>
        <th>Jml Siswa</th>
        <th>Hadir</th>
        <th>Terlambat</th>
        <th>Sakit (S)</th>
        <th>Izin (I)</th>
        <th>Alpa (A)</th>
        <th>Tdk Hadir</th>
      </tr>
    </thead>
    <tbody>
      ${rekapKelas.map((r, i) => `
      <tr>
        <td class="num">${i + 1}.</td>
        <td class="kelas-cell">${r.kelas}</td>
        <td class="center">${r.totalSiswa}</td>
        <td class="center">${r.hadir}</td>
        <td class="center">${r.terlambat > 0 ? r.terlambat : '-'}</td>
        <td class="center">${r.sakit > 0 ? r.sakit : '-'}</td>
        <td class="center">${r.izin > 0 ? r.izin : '-'}</td>
        <td class="center">${r.alpa > 0 ? r.alpa : '-'}</td>
        <td class="center">${r.tidakHadir > 0 ? r.tidakHadir : '-'}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="2" class="center">TOTAL</td>
        <td class="center">${totalSeluruh}</td>
        <td class="center">${totalHadir}</td>
        <td class="center">${totalTerlambat > 0 ? totalTerlambat : '-'}</td>
        <td class="center">${totalSakit > 0 ? totalSakit : '-'}</td>
        <td class="center">${totalIzin > 0 ? totalIzin : '-'}</td>
        <td class="center">${totalAlpa > 0 ? totalAlpa : '-'}</td>
        <td class="center">${totalTidakHadir > 0 ? totalTidakHadir : '-'}</td>
      </tr>
    </tbody>
  </table>

  <!-- SISWA TERLAMBAT -->
  <div class="section-title">Siswa Terlambat</div>
  ${siswaTerlambat.length === 0
    ? `<table class="data-table"><thead><tr><th>No.</th><th>Kelas</th><th>Nama Siswa</th></tr></thead><tbody><tr><td class="num">-</td><td class="center">-</td><td style="text-align:center;color:#666;"><em>Tidak ada siswa terlambat</em></td></tr></tbody></table>`
    : `<table class="data-table">
    <thead>
      <tr>
        <th style="width:28pt">No.</th>
        <th style="width:52pt">Kelas</th>
        <th>Nama Siswa</th>
        <th style="width:28pt">No.</th>
        <th style="width:52pt">Kelas</th>
        <th>Nama Siswa</th>
      </tr>
    </thead>
    <tbody>
      ${Array.from({ length: Math.max(siswaTerlambatLeft.length, siswaTerlambatRight.length) }, (_, i) => {
        const l = siswaTerlambatLeft[i]
        const r = siswaTerlambatRight[i]
        return `<tr>
          <td class="num">${l ? (siswaTerlambatLeft.indexOf(l) + 1) + '.' : ''}</td>
          <td class="kelas-cell">${l ? l.kelas : ''}</td>
          <td>${l ? l.nama : ''}</td>
          <td class="num">${r ? (midT + siswaTerlambatRight.indexOf(r) + 1) + '.' : ''}</td>
          <td class="kelas-cell">${r ? r.kelas : ''}</td>
          <td>${r ? r.nama : ''}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>`
  }

  <!-- SISWA TIDAK HADIR -->
  <div class="section-title">Siswa Tidak Hadir</div>
  <table class="data-table">
    <thead>
      <tr>
        <th colspan="3" style="background:#fef2f2;">Sakit (S) — ${siswaSakit.length} siswa</th>
        <th colspan="3" style="background:#fefce8;">Izin (I) — ${siswaIzin.length} siswa</th>
        <th colspan="3" style="background:#fff7ed;">Alpa (A) — ${siswaAlpa.length} siswa</th>
      </tr>
      <tr>
        <th>No.</th><th>Kls</th><th>Nama</th>
        <th>No.</th><th>Kls</th><th>Nama</th>
        <th>No.</th><th>Kls</th><th>Nama</th>
      </tr>
    </thead>
    <tbody>
      ${Array.from({ length: maxRowsTH }, (_, i) => {
        const s = siswaSakit[i]
        const iz = siswaIzin[i]
        const al = siswaAlpa[i]
        return `<tr>
          <td class="num">${s ? (i + 1) + '.' : ''}</td>
          <td class="kelas-cell">${s ? s.kelas : ''}</td>
          <td>${s ? s.nama : ''}</td>
          <td class="num">${iz ? (i + 1) + '.' : ''}</td>
          <td class="kelas-cell">${iz ? iz.kelas : ''}</td>
          <td>${iz ? iz.nama : ''}</td>
          <td class="num">${al ? (i + 1) + '.' : ''}</td>
          <td class="kelas-cell">${al ? al.kelas : ''}</td>
          <td>${al ? al.nama : ''}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- KEJADIAN PENTING -->
  <div class="section-title">Kejadian Penting dan Tindak Lanjut</div>
  <table class="data-table" style="margin-bottom: 0;">
    <tbody>
      <tr><td style="height: 60pt;"></td></tr>
    </tbody>
  </table>

  <!-- TANDA TANGAN -->
  <table class="signature-table">
    <tr>
      <td>
        Mengetahui,<br>
        <strong>Kepala Sekolah</strong>
        <div class="signature-space"></div>
        <div>( <span class="signature-name"></span> )</div>
      </td>
      <td>
        Jakarta, ${tanggalStr}<br>
        <strong>Koordinator Guru Piket</strong>
        <div class="signature-space"></div>
        <div>( <span class="signature-name">${koordinator}</span> )</div>
      </td>
    </tr>
  </table>

</div>
</body>
</html>`

      const printWindow = window.open('', '_blank', 'width=900,height=700')
      if (!printWindow) {
        alert('Popup diblokir oleh browser. Izinkan popup untuk halaman ini.')
        return
      }
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 500)

    } catch (err) {
      console.error('Laporan error:', err)
      alert('Gagal membuat laporan: ' + err.message)
    } finally {
      setLaporanLoading(false)
    }
  }, [tanggal, session])

  // ── End Laporan Harian Print ──────────────────────────────────────────

  if (loading && semuaKelas.length === 0) {
    return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  const CustomTooltipLine = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-2xl shadow-lg">
          <p className="font-semibold mb-1">{label}</p>
          <p className="text-emerald-400">{payload[0].value} Siswa Hadir</p>
        </div>
      )
    }
    return null
  }

  const CustomTooltipBar = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-2xl shadow-lg">
          <p className="font-semibold mb-1">Kelas {label}</p>
          <p className="text-indigo-400">{payload[0].value} Siswa Hadir</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="animate-fade-in font-sans text-slate-800 flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard Presensi</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Ringkasan harian dan statistik kehadiran siswa.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrintLaporan}
            disabled={laporanLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2 shrink-0"
          >
            {laporanLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            )}
            {laporanLoading ? 'Memuat...' : 'Laporan Harian'}
          </button>
          <a
            href="/presensi-manual-siswa"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Presensi Manual Siswa
          </a>
          <input 
            type="date" 
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="px-4 py-2 bg-white border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
          />
        </div>
      </div>

      {/* Row 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Total Siswa</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{totalSiswaCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md relative overflow-hidden">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 relative z-10">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <div className="relative z-10">
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Hadir Hari Ini</p>
            <p className="text-2xl font-black text-emerald-600 leading-none">{hadirCount}</p>
          </div>
          <div className="absolute right-0 top-0 h-full w-2 bg-emerald-500"></div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Sakit / Izin</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{sakitIzinCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 transition-all hover:-translate-y-1 hover:shadow-md">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"></path></svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-0.5">Alpha</p>
            <p className="text-2xl font-black text-slate-800 leading-none">{alpaCount}</p>
          </div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Laporan Kehadiran Total (Line Chart) */}
        <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Laporan Kehadiran Total</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltipLine />} />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#10b981' }} 
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Siswa per Kelas (Bar Chart) */}
        <div className="col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Kehadiran per Kelas</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          <div className="flex-1 min-h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="kelas" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<CustomTooltipBar />} cursor={{fill: '#f8fafc'}} />
                <Bar dataKey="hadir" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Row 3: Bottom Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Perlu Perhatian Total (Pie Chart) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Total Perlu Perhatian</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          
          {presensiHariIni.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <p className="text-sm font-semibold text-slate-700">Belum Ada Data</p>
              <p className="text-xs text-slate-500 mt-1">Belum ada data presensi yang masuk hari ini.</p>
            </div>
          ) : totalPerhatian === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <p className="text-emerald-600 font-bold mb-1">Aman Terkendali</p>
              <p className="text-slate-500 text-sm">Tidak ada catatan Sakit, Izin, atau Alpha sejauh ini.</p>
            </div>
          ) : (
            <>
              <div className="h-[180px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [`${value} Siswa`, '']} 
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                  <span className="text-2xl font-black text-slate-800 leading-none">{totalPerhatian}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Siswa</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
                {pieChartData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></div>
                    {d.name} <span className="text-slate-400 font-bold ml-0.5">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top 6 Attendant (Siswa Terajin) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Siswa Terajin (Minggu Ini)</h3>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"></path></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[220px]">
            {topAttendant.length === 0 ? (
              <div className="text-center text-slate-500 py-6 text-sm">Belum ada data absensi yang mencukupi.</div>
            ) : topAttendant.map((s, idx) => (
              <div key={s.nisn} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden relative border border-slate-200">
                  <span className="absolute z-0">{getInitials(s.nama)}</span>
                  <img 
                    src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${s.nisn}_${activeTa?.id}`} 
                    alt={s.nama}
                    className="w-full h-full object-cover relative z-10"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.nama}</p>
                  <p className="text-[11px] text-slate-500">Kelas {s.kelas}</p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{s.percentage}%</span>
                  <span className="text-xs font-bold text-emerald-600">{s.count} hr</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Siswa Belum Presensi (List) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Siswa Belum Presensi</h3>
            <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-2xl">
              {unrecordedStudents.length} Siswa
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 max-h-[220px]">
            {unrecordedStudents.length === 0 ? (
              <div className="text-center text-slate-500 py-6 text-sm">Semua siswa sudah dipresensi.</div>
            ) : unrecordedStudents.sort((a,b) => a.kelas.localeCompare(b.kelas) || a.nama_lengkap.localeCompare(b.nama_lengkap)).map((s, idx) => {
              return (
                <div key={`${s.nisn}-${idx}`} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 overflow-hidden relative border border-slate-200">
                    <span className="absolute z-0">{getInitials(s.nama_lengkap)}</span>
                    <img 
                      src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${s.nisn}_${activeTa?.id}`} 
                      alt={s.nama_lengkap}
                      className="w-full h-full object-cover relative z-10"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{s.nama_lengkap}</p>
                    <p className="text-[11px] text-slate-500">Kls {s.kelas}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">Belum Ada Data</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #94a3b8;
        }
      `}} />
    </div>
  )
}
