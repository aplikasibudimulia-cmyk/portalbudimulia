// src/components/LaporanKeterlambatanSection.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'

// Helper Format Tanggal Indonesia (misal: 2026-08-05 -> 5 Agustus 2026)
const formatDateIndo = (str) => {
  if (!str) return '-'
  const parts = str.split('-')
  if (parts.length !== 3) return str
  const [y, m, d] = parts
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const idx = parseInt(m, 10) - 1
  return `${parseInt(d, 10)} ${months[idx] || m} ${y}`
}

// Helper Format Bulan & Tahun (misal: 2026-08 -> Agustus 2026)
const getMonthYearLabel = (yyyyMm) => {
  if (!yyyyMm) return ''
  const parts = yyyyMm.split('-')
  if (parts.length < 2) return yyyyMm
  const [y, m] = parts
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const idx = parseInt(m, 10) - 1
  return `${months[idx] || m} ${y}`
}

// ── Helper Rincian Keterlambatan Per Kelas (Format Horizontal Compact MS Word) ───────
const ClassBreakdownTable = ({ records }) => {
  if (!records || records.length === 0) return null

  const classCounts = {}
  records.forEach(r => {
    let kls = r.kelas ? String(r.kelas).replace(/^Kelas\s+/i, '').trim() : '-'
    if (!kls || kls.toLowerCase().includes('semua')) kls = '-'
    classCounts[kls] = (classCounts[kls] || 0) + 1
  })

  const sortedClasses = Object.entries(classCounts).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true })
  )

  if (sortedClasses.length === 0) return null

  const totalLate = records.length

  return (
    <div className="mb-3 keep-with-next">
      <p className="text-[10px] font-bold text-black mb-1">Rekapitulasi Keterlambatan Per Kelas:</p>
      <table className="w-full text-center text-[9px] border-collapse border border-black">
        <thead>
          <tr className="bg-slate-100 text-black font-bold uppercase border-b border-black">
            <th className="border border-black px-1.5 py-1 w-16 bg-slate-200">KELAS</th>
            {sortedClasses.map(([kls]) => (
              <th key={kls} className="border border-black px-1 py-1">{kls}</th>
            ))}
            <th className="border border-black px-1.5 py-1 bg-slate-200 w-16">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-1.5 py-1 font-bold bg-slate-100">JUMLAH</td>
            {sortedClasses.map(([kls, count]) => (
              <td key={kls} className="border border-black px-1 py-1 font-medium">{count}</td>
            ))}
            <td className="border border-black px-1.5 py-1 font-bold bg-slate-100">{totalLate}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Sub-Tabel Rekapan Total Per Siswa (Format Resmi MS Word) ─────────────────
const PrintAggregatedTable = ({ students, monthLabel }) => {
  if (!students || students.length === 0) {
    return <p className="text-xs italic text-slate-500 py-2 text-center">Tidak ada data siswa terlambat.</p>
  }
  return (
    <div className="mb-4">
      <table className="w-full text-left text-[10.5px] border-collapse border border-black">
        <thead>
          <tr className="bg-slate-100 text-black font-bold uppercase text-[9.5px] border-b border-black">
            <th className="border border-black px-2 py-1.5 w-10 text-center">No</th>
            <th className="border border-black px-3 py-1.5 w-24">NISN</th>
            <th className="border border-black px-3 py-1.5">Nama Lengkap Siswa</th>
            <th className="border border-black px-3 py-1.5 w-20 text-center">Kelas</th>
            <th className="border border-black px-3 py-1.5 w-32 text-center">
              {monthLabel ? `Terlambat (${monthLabel})` : 'Total Terlambat'}
            </th>
            <th className="border border-black px-3 py-1.5 w-44">Terakhir Terlambat</th>
          </tr>
        </thead>
        <tbody>
          {students.map((item, idx) => (
            <tr key={`${item.siswa_nisn}-${idx}`} className="border-b border-black">
              <td className="border border-black px-2 py-1.5 text-center font-mono">{idx + 1}</td>
              <td className="border border-black px-3 py-1.5 font-mono">{item.siswa_nisn || '-'}</td>
              <td className="border border-black px-3 py-1.5 font-bold">{item.nama_lengkap}</td>
              <td className="border border-black px-3 py-1.5 text-center font-semibold">Kelas {item.kelas}</td>
              <td className="border border-black px-3 py-1.5 text-center font-bold">
                {item.total_terlambat} Kali
              </td>
              <td className="border border-black px-3 py-1.5 font-medium">
                {formatDateIndo(item.terakhir_tanggal)} {item.terakhir_waktu ? `(${item.terakhir_waktu} WIB)` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sub-Tabel Rincian Harian Kejadian (Format Resmi MS Word) ─────────────────
const PrintDetailLogTable = ({ records }) => {
  if (!records || records.length === 0) {
    return <p className="text-xs italic text-slate-500 py-2 text-center">Tidak ada log rincian kejadian.</p>
  }
  return (
    <div className="mb-4">
      <table className="w-full text-left text-[10px] border-collapse border border-black">
        <thead>
          <tr className="bg-slate-100 text-black font-bold uppercase text-[9px] border-b border-black">
            <th className="border border-black px-2 py-1.5 w-9 text-center">No</th>
            <th className="border border-black px-2.5 py-1.5 w-24">Tanggal</th>
            <th className="border border-black px-2 py-1.5 w-20 text-center">Waktu</th>
            <th className="border border-black px-2 py-1.5 w-20 font-mono">NISN</th>
            <th className="border border-black px-2.5 py-1.5 font-bold">Nama Siswa</th>
            <th className="border border-black px-2 py-1.5 w-16 text-center">Kelas</th>
            <th className="border border-black px-2 py-1.5 w-20 text-center">Metode</th>
            <th className="border border-black px-2.5 py-1.5">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => (
            <tr key={rec.id || idx} className="border-b border-black">
              <td className="border border-black px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-black px-2.5 py-1 font-semibold">{formatDateIndo(rec.tanggal)}</td>
              <td className="border border-black px-2 py-1 text-center font-bold">
                {rec.waktu ? `${rec.waktu} WIB` : '-'}
              </td>
              <td className="border border-black px-2 py-1 font-mono">{rec.siswa_nisn}</td>
              <td className="border border-black px-2.5 py-1 font-bold">{rec.nama_lengkap}</td>
              <td className="border border-black px-2 py-1 text-center font-medium">Kelas {rec.kelas}</td>
              <td className="border border-black px-2 py-1 text-center uppercase font-semibold text-[9px]">{rec.metode || '-'}</td>
              <td className="border border-black px-2.5 py-1">{rec.keterangan || 'Terlambat'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LaporanKeterlambatanSection() {
  // ── State Date Range (Default: Tanggal 1 bulan berjalan s.d. hari ini) ────────
  const todayStr = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const firstDayOfMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [startDate, setStartDate] = useState(firstDayOfMonthStr)
  const [endDate, setEndDate] = useState(todayStr)
  const [selectedKelas, setSelectedKelas] = useState('Semua')
  
  // State Autocomplete Live Search Siswa
  const [studentSearchInput, setStudentSearchInput] = useState('')
  const [selectedSiswaObj, setSelectedSiswaObj] = useState(null) // { nisn, nama_lengkap, kelas }
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [presensiData, setPresensiData] = useState([])
  const [kelasList, setKelasList] = useState([])
  const [siswaList, setSiswaList] = useState([])
  const [copySuccess, setCopySuccess] = useState(false)
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState(null)

  // ── State Config Pengaturan Cetak & Kop (Disimpan Otomatis di LocalStorage) ─
  const [printConfig, setPrintConfig] = useState(() => {
    const saved = localStorage.getItem('ebudimulia_print_config')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error(e)
      }
    }
    return {
      kopAlamat: 'Jl. Mangga Besar VI No. 21, Tamansari, Jakarta Barat — Telp. (021) 6294528',
      nomorSuratPrefix: 'LKP/KTL',
      showLogo: true,
      customLogoUrl: '',
      kepalaSekolahName: 'Drs. H. Sukarno, M.Pd.',
      kepalaSekolahNip: '19680512 199403 1 004',
      petugasName: 'Petugas Piket Sekolah',
      petugasNip: '19850314 201101 1 002',
      bkName: 'Tim BK / Kesiswaan',
      bkNip: '19720921 199802 2 001',
      showSignatures: true
    }
  })

  // Auto-save printConfig setiap kali berubah
  useEffect(() => {
    localStorage.setItem('ebudimulia_print_config', JSON.stringify(printConfig))
  }, [printConfig])

  // Handler Upload Logo
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file logo terlalu besar (Maksimal 2MB).')
      return
    }
    const reader = new FileReader()
    reader.onload = (evt) => {
      setPrintConfig(prev => ({ ...prev, customLogoUrl: evt.target?.result || '' }))
    }
    reader.readAsDataURL(file)
  }

  // ── State Opsi & Filter Modal Cetak ─────────────────────────────────────────
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printMode, setPrintMode] = useState('total_plus_bulan') // 'seluruh' | 'total_plus_bulan' | 'bulan_tertentu'
  const [selectedPrintMonth, setSelectedPrintMonth] = useState('') // YYYY-MM
  const [printTableType, setPrintTableType] = useState('gabungan') // 'rekapan' | 'detail' | 'gabungan'
  const [pageBreakPerMonth, setPageBreakPerMonth] = useState(false)

  // State List Semua Bulan Yang Memiliki Data di Database Supabase
  const [allAvailableMonths, setAllAvailableMonths] = useState([])
  const [customMonthData, setCustomMonthData] = useState(null)
  const [loadingCustomMonth, setLoadingCustomMonth] = useState(false)

  // State Data Semua Bulan (untuk mode total_plus_bulan)
  const [allMonthsData, setAllMonthsData] = useState([]) // Array of monthItem objects
  const [loadingAllMonths, setLoadingAllMonths] = useState(false)

  // ── Fetch Daftar Semua Bulan yang Punya Catatan Keterlambatan ─────────────────
  useEffect(() => {
    const fetchMonthsList = async () => {
      try {
        const { data, error } = await supabase
          .from('presensi_harian')
          .select('tanggal')
          .eq('status', 'T')
          .order('tanggal', { ascending: false })

        if (error) throw error

        if (data && data.length > 0) {
          const monthCountsMap = new Map()
          data.forEach(item => {
            if (item.tanggal && item.tanggal.length >= 7) {
              const key = item.tanggal.substring(0, 7)
              monthCountsMap.set(key, (monthCountsMap.get(key) || 0) + 1)
            }
          })

          const monthList = Array.from(monthCountsMap.entries()).map(([key, count]) => ({
            monthKey: key,
            monthLabel: getMonthYearLabel(key),
            count
          }))

          setAllAvailableMonths(monthList)
          if (monthList.length > 0 && !selectedPrintMonth) {
            setSelectedPrintMonth(monthList[0].monthKey)
          }
        }
      } catch (err) {
        console.error('Gagal mengambil daftar bulan:', err)
      }
    }

    fetchMonthsList()
  }, [])

  // ── Fetch Data Kelas & Daftar Siswa ─────────────────────────────────────────
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const { data: kelasData } = await supabase
          .from('siswa_lengkap')
          .select('kelas')
          .eq('is_aktif', true)
        
        if (kelasData) {
          const uniqueKelas = Array.from(new Set(kelasData.map(k => k.kelas).filter(Boolean))).sort()
          setKelasList(uniqueKelas)
        }

        const { data: stdData } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .eq('is_aktif', true)
          .order('nama_lengkap', { ascending: true })

        if (stdData) {
          setSiswaList(stdData)
        }
      } catch (err) {
        console.error('Gagal memuat data filter:', err)
      }
    }
    fetchDropdownData()
  }, [])

  // ── Auto Close Dropdown saat klik di luar ───────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Live Autocomplete Filter list berdasarkan input & kelas ────────────────
  const autocompleteSuggestions = useMemo(() => {
    let pool = siswaList
    if (selectedKelas !== 'Semua') {
      pool = pool.filter(s => s.kelas === selectedKelas)
    }

    if (!studentSearchInput.trim()) {
      return pool.slice(0, 8) // Tampilkan 8 siswa pertama jika belum mengetik
    }

    const kw = studentSearchInput.toLowerCase()
    return pool.filter(s => 
      s.nama_lengkap?.toLowerCase().includes(kw) ||
      s.nisn?.includes(kw)
    ).slice(0, 10)
  }, [siswaList, selectedKelas, studentSearchInput])

  // ── Fetch Data Keterlambatan dari Supabase ───────────────────────────────
  const fetchLaporanKeterlambatan = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('presensi_harian')
        .select(`
          id,
          tanggal,
          waktu,
          status,
          tipe,
          metode,
          keterangan,
          siswa_nisn,
          kelas
        `)
        .eq('status', 'T')
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
        .order('tanggal', { ascending: false })
        .order('waktu', { ascending: false })

      if (selectedKelas !== 'Semua') {
        query = query.eq('kelas', selectedKelas)
      }

      if (selectedSiswaObj?.nisn) {
        query = query.eq('siswa_nisn', selectedSiswaObj.nisn)
      }

      const { data, error } = await query

      if (error) throw error

      if (data && data.length > 0) {
        const nisns = Array.from(new Set(data.map(d => d.siswa_nisn)))
        const { data: siswaInfo } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', nisns)

        const siswaMap = new Map()
        siswaInfo?.forEach(s => siswaMap.set(s.nisn, s))

        const merged = data
          .filter(p => p.siswa_nisn && siswaMap.has(p.siswa_nisn))
          .map(p => {
            const info = siswaMap.get(p.siswa_nisn)
            let finalKelas = '-'
            if (info?.kelas && !info.kelas.toLowerCase().includes('semua')) {
              finalKelas = info.kelas
            } else if (p.kelas && !p.kelas.toLowerCase().includes('semua')) {
              finalKelas = p.kelas.replace(/^Kelas\s+/i, '')
            }
            return {
              ...p,
              nama_lengkap: info?.nama_lengkap || p.siswa_nisn,
              kelas: finalKelas
            }
          })

        setPresensiData(merged)
      } else {
        setPresensiData([])
      }
    } catch (err) {
      console.error('Gagal mengambil laporan keterlambatan:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, selectedKelas, selectedSiswaObj])

  useEffect(() => {
    fetchLaporanKeterlambatan()
  }, [fetchLaporanKeterlambatan])

  // ── Fetch Khusus Data Bulan Tertentu yang Dipilih Pengguna ────────────────
  useEffect(() => {
    if (printMode !== 'bulan_tertentu' || !selectedPrintMonth) {
      setCustomMonthData(null)
      return
    }

    const fetchSpecificMonthData = async () => {
      setLoadingCustomMonth(true)
      try {
        const [y, m] = selectedPrintMonth.split('-')
        const start = `${selectedPrintMonth}-01`
        const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate()
        const end = `${selectedPrintMonth}-${String(lastDay).padStart(2, '0')}`

        let query = supabase
          .from('presensi_harian')
          .select(`
            id, tanggal, waktu, status, tipe, metode, keterangan, siswa_nisn, kelas
          `)
          .eq('status', 'T')
          .gte('tanggal', start)
          .lte('tanggal', end)
          .order('tanggal', { ascending: false })
          .order('waktu', { ascending: false })

        if (selectedKelas !== 'Semua') {
          query = query.eq('kelas', selectedKelas)
        }

        if (selectedSiswaObj?.nisn) {
          query = query.eq('siswa_nisn', selectedSiswaObj.nisn)
        }

        const { data, error } = await query
        if (error) throw error

        if (data && data.length > 0) {
          const nisns = Array.from(new Set(data.map(d => d.siswa_nisn)))
          const { data: siswaInfo } = await supabase
            .from('siswa_lengkap')
            .select('nisn, nama_lengkap, kelas')
            .in('nisn', nisns)

          const siswaMap = new Map()
          siswaInfo?.forEach(s => siswaMap.set(s.nisn, s))

          const merged = data
            .filter(p => p.siswa_nisn && siswaMap.has(p.siswa_nisn))
            .map(p => {
              const info = siswaMap.get(p.siswa_nisn)
              let finalKelas = '-'
              if (info?.kelas && !info.kelas.toLowerCase().includes('semua')) {
                finalKelas = info.kelas
              } else if (p.kelas && !p.kelas.toLowerCase().includes('semua')) {
                finalKelas = p.kelas.replace(/^Kelas\s+/i, '')
              }
              return {
                ...p,
                nama_lengkap: info?.nama_lengkap || p.siswa_nisn,
                kelas: finalKelas
              }
            })

          const stdMap = new Map()
          merged.forEach(p => {
            const nisn = p.siswa_nisn || p.nama_lengkap
            if (!stdMap.has(nisn)) {
              stdMap.set(nisn, {
                siswa_nisn: p.siswa_nisn,
                nama_lengkap: p.nama_lengkap,
                kelas: p.kelas,
                total_terlambat: 0,
                terakhir_tanggal: p.tanggal,
                terakhir_waktu: p.waktu,
                records: []
              })
            }
            const st = stdMap.get(nisn)
            st.total_terlambat += 1
            st.records.push(p)
          })

          const aggregated = Array.from(stdMap.values()).sort((a, b) => {
            if (b.total_terlambat !== a.total_terlambat) return b.total_terlambat - a.total_terlambat
            return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id')
          })

          setCustomMonthData({
            monthKey: selectedPrintMonth,
            monthLabel: getMonthYearLabel(selectedPrintMonth),
            rawItems: merged,
            aggregatedStudents: aggregated,
            totalKejadian: merged.length,
            uniqueStudents: aggregated.length
          })
        } else {
          setCustomMonthData({
            monthKey: selectedPrintMonth,
            monthLabel: getMonthYearLabel(selectedPrintMonth),
            rawItems: [],
            aggregatedStudents: [],
            totalKejadian: 0,
            uniqueStudents: 0
          })
        }
      } catch (err) {
        console.error('Gagal mengambil data bulan terpilih:', err)
      } finally {
        setLoadingCustomMonth(false)
      }
    }

    fetchSpecificMonthData()
  }, [printMode, selectedPrintMonth, selectedKelas, selectedSiswaObj])

  // ── Fetch SEMUA Data Keterlambatan (Tanpa Filter Tanggal) untuk Mode total_plus_bulan ──
  useEffect(() => {
    // Reset saat mode berubah atau modal ditutup
    if (!isPrintModalOpen || printMode !== 'total_plus_bulan') {
      setAllMonthsData([])
      setLoadingAllMonths(false)
      return
    }

    // Langsung set loading & kosongkan data lama
    setAllMonthsData([])
    setLoadingAllMonths(true)

    const fetchAllLateData = async () => {
      try {
        // 1. Ambil SEMUA record terlambat dari database (tanpa filter tanggal)
        let query = supabase
          .from('presensi_harian')
          .select('id, tanggal, waktu, status, tipe, metode, keterangan, siswa_nisn, kelas')
          .eq('status', 'T')
          .order('tanggal', { ascending: false })
          .order('waktu', { ascending: false })

        if (selectedKelas !== 'Semua') query = query.eq('kelas', selectedKelas)
        if (selectedSiswaObj?.nisn) query = query.eq('siswa_nisn', selectedSiswaObj.nisn)

        const { data, error } = await query
        if (error) throw error
        if (!data || data.length === 0) {
          setAllMonthsData([])
          return
        }

        // 2. Ambil info siswa
        const allNisns = Array.from(new Set(data.map(d => d.siswa_nisn)))
        const { data: siswaInfo } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', allNisns)

        const siswaMap = new Map()
        siswaInfo?.forEach(s => siswaMap.set(s.nisn, s))

        // 3. Merge nama siswa (hanya siswa yang masih ada di siswa_lengkap)
        const allMerged = data
          .filter(p => p.siswa_nisn && siswaMap.has(p.siswa_nisn))
          .map(p => {
            const info = siswaMap.get(p.siswa_nisn)
            let finalKelas = '-'
            if (info?.kelas && !info.kelas.toLowerCase().includes('semua')) {
              finalKelas = info.kelas
            } else if (p.kelas && !p.kelas.toLowerCase().includes('semua')) {
              finalKelas = p.kelas.replace(/^Kelas\s+/i, '')
            }
            return { ...p, nama_lengkap: info?.nama_lengkap || p.siswa_nisn, kelas: finalKelas }
          })

        // 4. Group by bulan (YYYY-MM)
        const monthMap = new Map()
        allMerged.forEach(p => {
          if (!p.tanggal || p.tanggal.length < 7) return
          const key = p.tanggal.substring(0, 7)
          if (!monthMap.has(key)) monthMap.set(key, [])
          monthMap.get(key).push(p)
        })

        // 5. Sort bulan descending & aggregate per siswa per bulan
        const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a))
        const monthResults = sortedKeys.map(key => {
          const rawItems = monthMap.get(key)
          const stdMap = new Map()
          rawItems.forEach(p => {
            const nisn = p.siswa_nisn || p.nama_lengkap
            if (!stdMap.has(nisn)) {
              stdMap.set(nisn, {
                siswa_nisn: p.siswa_nisn,
                nama_lengkap: p.nama_lengkap,
                kelas: p.kelas,
                total_terlambat: 0,
                terakhir_tanggal: p.tanggal,
                terakhir_waktu: p.waktu,
                records: []
              })
            }
            const st = stdMap.get(nisn)
            st.total_terlambat += 1
            st.records.push(p)
          })

          const aggregated = Array.from(stdMap.values()).sort((a, b) => {
            if (b.total_terlambat !== a.total_terlambat) return b.total_terlambat - a.total_terlambat
            return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id')
          })

          return {
            monthKey: key,
            monthLabel: getMonthYearLabel(key),
            rawItems,
            aggregatedStudents: aggregated,
            totalKejadian: rawItems.length,
            uniqueStudents: aggregated.length
          }
        })

        setAllMonthsData(monthResults.filter(m => m.aggregatedStudents.length > 0))
      } catch (err) {
        console.error('Gagal memuat data semua bulan:', err)
      } finally {
        setLoadingAllMonths(false)
      }
    }

    fetchAllLateData()
  }, [isPrintModalOpen, printMode, selectedKelas, selectedSiswaObj])

  // ── Group Data Per Siswa (1 Siswa = 1 Baris Utama) ─────────────────────────
  const aggregatedStudents = useMemo(() => {
    const map = new Map()

    presensiData.forEach(p => {
      const nisn = p.siswa_nisn || p.nama_lengkap
      if (!map.has(nisn)) {
        map.set(nisn, {
          siswa_nisn: p.siswa_nisn,
          nama_lengkap: p.nama_lengkap,
          kelas: p.kelas,
          total_terlambat: 0,
          terakhir_tanggal: p.tanggal,
          terakhir_waktu: p.waktu,
          terakhir_metode: p.metode,
          records: []
        })
      }

      const std = map.get(nisn)
      std.total_terlambat += 1
      std.records.push(p)
    })

    // Sort aggregated list by total_terlambat descending, then name ascending
    return Array.from(map.values()).sort((a, b) => {
      if (b.total_terlambat !== a.total_terlambat) {
        return b.total_terlambat - a.total_terlambat
      }
      return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id')
    })
  }, [presensiData])

  // ── Grouping Data Per Bulan (Untuk Breakdown & Filter Bulan Saat Cetak) ──────
  const monthlyDataMap = useMemo(() => {
    const map = new Map()
    
    presensiData.forEach(p => {
      if (!p.tanggal || p.tanggal.length < 7) return
      const monthKey = p.tanggal.substring(0, 7) // 'YYYY-MM'
      if (!map.has(monthKey)) {
        map.set(monthKey, [])
      }
      map.get(monthKey).push(p)
    })

    const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a))

    return sortedKeys.map(key => {
      const rawItems = map.get(key)
      
      const stdMap = new Map()
      rawItems.forEach(p => {
        const nisn = p.siswa_nisn || p.nama_lengkap
        if (!stdMap.has(nisn)) {
          stdMap.set(nisn, {
            siswa_nisn: p.siswa_nisn,
            nama_lengkap: p.nama_lengkap,
            kelas: p.kelas,
            total_terlambat: 0,
            terakhir_tanggal: p.tanggal,
            terakhir_waktu: p.waktu,
            terakhir_metode: p.metode,
            records: []
          })
        }
        const std = stdMap.get(nisn)
        std.total_terlambat += 1
        std.records.push(p)
      })

      const aggregated = Array.from(stdMap.values()).sort((a, b) => {
        if (b.total_terlambat !== a.total_terlambat) return b.total_terlambat - a.total_terlambat
        return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id')
      })

      return {
        monthKey: key,
        monthLabel: getMonthYearLabel(key),
        rawItems,
        aggregatedStudents: aggregated,
        totalKejadian: rawItems.length,
        uniqueStudents: aggregated.length
      }
    })
  }, [presensiData])

  // ── Statistika Ringkasan ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalKejadian = presensiData.length
    const uniqueStudents = aggregatedStudents.length
    
    const kelasCount = {}
    presensiData.forEach(p => {
      if (p.kelas && p.kelas !== '-' && !p.kelas.toLowerCase().includes('semua')) {
        const klsKey = p.kelas.replace(/^Kelas\s+/i, '')
        kelasCount[klsKey] = (kelasCount[klsKey] || 0) + 1
      }
    })
    let kelasTerbanyak = '-'
    let maxCount = 0
    Object.entries(kelasCount).forEach(([kls, count]) => {
      if (count > maxCount) {
        maxCount = count
        kelasTerbanyak = `Kelas ${kls} (${count}x)`
      }
    })

    return {
      totalKejadian,
      uniqueStudents,
      kelasTerbanyak
    }
  }, [presensiData, aggregatedStudents])

  // ── Aksi Salin ke Clipboard untuk Grup Guru ────────────────────────────────
  const handleCopyToClipboard = () => {
    if (aggregatedStudents.length === 0) {
      alert('Tidak ada data keterlambatan untuk disalin.')
      return
    }

    let text = `📋 LAPORAN REKAP KETERLAMBATAN SISWA\n`
    text += `SMP Budi Mulia Jakarta\n`
    text += `Periode: ${formatDateIndo(startDate)} s.d. ${formatDateIndo(endDate)}\n`
    text += `Kelas: ${selectedKelas === 'Semua' ? 'Semua Kelas' : `Kelas ${selectedKelas}`}\n`
    if (selectedSiswaObj) {
      text += `Siswa: ${selectedSiswaObj.nama_lengkap}\n`
    }
    text += `────────────────────────────\n\n`
    text += `Daftar Rekap Siswa Terlambat:\n`

    aggregatedStudents.forEach((item, idx) => {
      const cleanKls = item.kelas ? item.kelas.replace(/^Kelas\s+/i, '') : '-'
      text += `${idx + 1}. ${item.nama_lengkap} (${cleanKls}) - *Terlambat ${item.total_terlambat}x*\n`
    })

    text += `\nTotal: ${stats.totalKejadian} Kejadian (${stats.uniqueStudents} Siswa)\n`
    text += `Disampaikan oleh: Petugas Piket eBudiMulia`

    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 3000)
    }).catch(err => {
      console.error('Gagal menyalin:', err)
      alert('Gagal menyalin teks ke clipboard.')
    })
  }

  // ── Export Excel ─────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (aggregatedStudents.length === 0) {
      alert('Tidak ada data untuk diexport.')
      return
    }

    const rows = aggregatedStudents.map((item, idx) => ({
      No: idx + 1,
      NISN: item.siswa_nisn,
      'Nama Siswa': item.nama_lengkap,
      Kelas: item.kelas,
      'Total Terlambat': `${item.total_terlambat} Kali`,
      'Terlambat Terakhir': `${formatDateIndo(item.terakhir_tanggal)} (${item.terakhir_waktu || '-'} WIB)`
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Keterlambatan')
    XLSX.writeFile(workbook, `Laporan_Keterlambatan_${startDate}_s.d_${endDate}.xlsx`)
  }

  // ── Buka Modal Pengaturan & Opsi Cetak Laporan ──────────────────────────────
  const handleOpenPrintModal = () => {
    setIsPrintModalOpen(true)
  }

  // ── Jalankan Fungsi Window Print ──────────────────────────────────────────
  const triggerBrowserPrint = () => {
    window.print()
  }

  // ── Muat Seluruh Bulan (Dari 2025 s.d. Hari Ini) ──────────────────────────
  const handleLoadAllMonths = () => {
    setStartDate('2025-01-01')
    setEndDate(todayStr)
  }

  // ── Select Siswa dari Autocomplete Dropdown ──────────────────────────────
  const handleSelectSiswa = (siswa) => {
    setSelectedSiswaObj(siswa)
    setStudentSearchInput(siswa.nama_lengkap)
    setIsDropdownOpen(false)
  }

  const handleClearSiswa = () => {
    setSelectedSiswaObj(null)
    setStudentSearchInput('')
    setIsDropdownOpen(false)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">

      {/* Style Kustom Cetak Printer/PDF (Presisi Margin 10mm Semua Halaman) */}
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body, #root, #root > div, main, div {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
          .print\:hidden, nav, header, aside, .sticky, .fixed:not(#print-laporan-area) {
            display: none !important;
          }
          #print-laporan-area, #print-laporan-area * {
            visibility: visible !important;
          }
          #print-laporan-area {
            display: block !important;
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            height: auto !important;
            overflow: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
          .page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
          .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .keep-with-next, h4, h5 {
            break-after: avoid !important;
            page-break-after: avoid !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
        }
      `}</style>
      
      {/* ── BANNER HEADER DENGAN TEMA INDIGO / EBUDIMULIA ───────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 md:p-8 rounded-3xl text-white shadow-xl shadow-indigo-900/10 print:hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute right-32 -top-12 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-indigo-200 border border-white/10">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Sistem Kehadiran & Rekap Piket
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Laporan Keterlambatan Siswa
            </h2>
            <p className="text-xs md:text-sm text-indigo-200/80 max-w-xl">
              Rekapitulasi data siswa terlambat secara akurat dengan filter rentang tanggal, kelas, live search, serta fitur versi cetak proper.
            </p>
          </div>

          {/* Tombol Aksi Utama */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleCopyToClipboard}
              className={`px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all duration-300 shadow-lg ${
                copySuccess
                  ? 'bg-emerald-500 text-white shadow-emerald-500/25 scale-105'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 hover:scale-[1.02]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copySuccess ? '✓ Teks Berhasil Disalin!' : 'Salin Teks untuk Grup Guru'}
            </button>

            <button
              onClick={handleExportExcel}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/15 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-[1.02]"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>

            <button
              onClick={handleOpenPrintModal}
              className="px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-900/30 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all hover:scale-[1.02]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Cetak / PDF Proper
            </button>
          </div>
        </div>
      </div>

      {/* ── FILTER SECTION CONTROL ───────────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Tanggal Mulai */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          {/* Tanggal Selesai */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Tanggal Selesai
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          {/* Pilih Kelas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Filter Kelas
            </label>
            <select
              value={selectedKelas}
              onChange={e => {
                setSelectedKelas(e.target.value)
                handleClearSiswa()
              }}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white transition-all"
            >
              <option value="Semua">Semua Kelas</option>
              {kelasList.map(k => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>
          </div>

          {/* AUTOCOMPLETE LIVE SEARCH INPUT SISWA */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Cari & Pilih Nama Siswa
            </label>

            <div className="relative">
              <input
                type="text"
                placeholder="Ketik nama siswa..."
                value={studentSearchInput}
                onChange={e => {
                  setStudentSearchInput(e.target.value)
                  if (selectedSiswaObj && e.target.value !== selectedSiswaObj.nama_lengkap) {
                    setSelectedSiswaObj(null)
                  }
                  setIsDropdownOpen(true)
                }}
                onFocus={() => setIsDropdownOpen(true)}
                className={`w-full pl-3.5 pr-8 py-2.5 border rounded-2xl text-xs font-medium outline-none transition-all ${
                  selectedSiswaObj
                    ? 'border-indigo-500 bg-indigo-50/40 text-indigo-950 font-bold'
                    : 'border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />

              {/* Clear button jika ada input/terpilih */}
              {(studentSearchInput || selectedSiswaObj) ? (
                <button
                  type="button"
                  onClick={handleClearSiswa}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 rounded-full p-0.5 hover:bg-slate-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <svg className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>

            {/* FLOATING DROPDOWN LIST */}
            {isDropdownOpen && autocompleteSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fade-in">
                {autocompleteSuggestions.map(siswa => (
                  <button
                    key={siswa.nisn}
                    type="button"
                    onClick={() => handleSelectSiswa(siswa)}
                    className="w-full px-4 py-2.5 text-left hover:bg-indigo-50/70 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-900">
                        {siswa.nama_lengkap}
                      </p>
                      <p className="text-xxs text-slate-400 font-mono">
                        NISN: {siswa.nisn}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 group-hover:bg-indigo-100 text-slate-600 group-hover:text-indigo-700 rounded-lg text-xxs font-bold">
                      Kelas {siswa.kelas}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Refresh / Filter trigger bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500 font-medium">
            {selectedSiswaObj ? (
              <span className="flex items-center gap-1.5 text-indigo-700 font-semibold bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                <span>Filter Aktif:</span>
                <span>{selectedSiswaObj.nama_lengkap} ({selectedSiswaObj.kelas})</span>
              </span>
            ) : (
              <span>Menampilkan: <strong className="text-slate-700">{selectedKelas === 'Semua' ? 'Semua Kelas' : `Kelas ${selectedKelas}`}</strong></span>
            )}
          </div>

          <button
            onClick={fetchLaporanKeterlambatan}
            disabled={loading}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 hover:scale-[1.02] flex items-center gap-2"
          >
            {loading ? (
              <span className="inline-block animate-spin font-bold">↻</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh Laporan
          </button>
        </div>
      </div>

      {/* ── STATISTIK CARD RINGKASAN MODERN ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-amber-200 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">Total Kejadian Terlambat</p>
            <h3 className="text-xl font-bold text-slate-800">{stats.totalKejadian} <span className="text-xs text-slate-400 font-normal">kali</span></h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-200 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">Siswa Terlibat</p>
            <h3 className="text-xl font-bold text-slate-800">{stats.uniqueStudents} <span className="text-xs text-slate-400 font-normal">orang</span></h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-rose-200 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v64 4v-4m6 0v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">Kelas Keterlambatan Tertinggi</p>
            <h3 className="text-lg font-bold text-slate-800">{stats.kelasTerbanyak}</h3>
          </div>
        </div>
      </div>

      {/* ── TABEL DATA KETERLAMBATAN ON-SCREEN ───────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden print:hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            <span className="inline-block animate-spin text-xl mb-2 text-indigo-600">↻</span>
            <p>Memuat data keterlambatan...</p>
          </div>
        ) : aggregatedStudents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
              ✓
            </div>
            <h3 className="text-sm font-bold text-slate-800">Tidak Ada Data Keterlambatan</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Tidak ditemukan catatan keterlambatan siswa untuk kriteria rentang tanggal dan filter yang Anda pilih.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4 w-12 text-center">No</th>
                  <th className="px-5 py-4">Nama Siswa</th>
                  <th className="px-5 py-4">NISN</th>
                  <th className="px-5 py-4">Kelas</th>
                  <th className="px-5 py-4 text-center">Total Terlambat</th>
                  <th className="px-5 py-4">Keterlambatan Terakhir</th>
                  <th className="px-5 py-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {aggregatedStudents.map((item, idx) => (
                  <tr 
                    key={`${item.siswa_nisn}-${idx}`}
                    onClick={() => setSelectedStudentForDetail(item)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4 text-center text-slate-400 font-normal">{idx + 1}</td>
                    <td className="px-5 py-4 font-bold text-slate-900 group-hover:text-indigo-600 flex items-center gap-2">
                      <span>{item.nama_lengkap}</span>
                      <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Klik detail
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-500">{item.siswa_nisn}</td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xxs font-bold">
                        Kelas {item.kelas}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xxs font-extrabold ${
                        item.total_terlambat >= 3 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {item.total_terlambat} Kali
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {formatDateIndo(item.terakhir_tanggal)} <span className="text-amber-600 ml-1">({item.terakhir_waktu || '-'} WIB)</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedStudentForDetail(item)
                        }}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl text-xxs font-bold transition-colors flex items-center gap-1.5 mx-auto shadow-xs"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Lihat Riwayat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL PROPER PENGATURAN & FILTER CETAK (PRINT CONFIG MODAL) ─────── */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:hidden">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header Modal */}
            <div className="p-6 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300 flex items-center justify-center font-bold text-lg">
                  🖨️
                </div>
                <div>
                  <h3 className="text-lg font-extrabold leading-tight">Pengaturan & Opsi Cetak Laporan</h3>
                  <p className="text-xs text-indigo-200 mt-0.5">Pilih mode rekapan cetak, filter bulan, dan rincian tabel pengesahan.</p>
                </div>
              </div>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body Options + Live Preview */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Opsi Mode Cetak Utama */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Pilih Mode Rekapan Cetak Laporan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Mode 1: Seluruh Rekapan Total */}
                  <label className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    printMode === 'seluruh'
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="printMode"
                        value="seluruh"
                        checked={printMode === 'seluruh'}
                        onChange={e => setPrintMode(e.target.value)}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 block">📊 Rekapan Total Keseluruhan</span>
                        <span className="text-xxs text-slate-500 mt-1 block">
                          Cetak 1 tabel rekapitulasi total untuk seluruh rentang tanggal ({formatDateIndo(startDate)} s.d. {formatDateIndo(endDate)}).
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* Mode 2: Total + Rekapan Per Bulan */}
                  <label className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    printMode === 'total_plus_bulan'
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="printMode"
                        value="total_plus_bulan"
                        checked={printMode === 'total_plus_bulan'}
                        onChange={e => setPrintMode(e.target.value)}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 block">📑 Rekapan Total + Breakdown Per Bulan</span>
                        <span className="text-xxs text-slate-500 mt-1 block">
                          Cetak tabel total utama lalu diikuti sub-tabel rincian rekapan untuk setiap bulan secara terpisah.
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* Mode 3: Bulan Tertentu Saja */}
                  <label className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    printMode === 'bulan_tertentu'
                      ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="printMode"
                        value="bulan_tertentu"
                        checked={printMode === 'bulan_tertentu'}
                        onChange={e => setPrintMode(e.target.value)}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 block">🗓️ Rekapan Bulan Tertentu Saja</span>
                        <span className="text-xxs text-slate-500 mt-1 block">
                          Cetak tabel khusus untuk 1 bulan spesifik yang dipilih dari dropdown.
                        </span>
                      </div>
                    </div>
                  </label>

                </div>
              </div>

              {/* Selector Bulan jika memilih 'bulan_tertentu' */}
              {printMode === 'bulan_tertentu' && (
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 animate-fade-in">
                  <label className="block text-xs font-bold text-amber-900 mb-1.5">
                    Pilih Bulan Yang Ingin Dicetak:
                  </label>
                  <select
                    value={selectedPrintMonth}
                    onChange={e => setSelectedPrintMonth(e.target.value)}
                    className="w-full sm:w-72 px-3.5 py-2 border border-amber-300 rounded-xl text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {monthlyDataMap.length === 0 ? (
                      <option value="">Tidak ada bulan tersedia</option>
                    ) : (
                      monthlyDataMap.map(m => (
                        <option key={m.monthKey} value={m.monthKey}>
                          Bulan {m.monthLabel} ({m.totalKejadian} kejadian, {m.uniqueStudents} siswa)
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Grid Setting Tambahan: Format Tabel & Tanda Tangan */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Pilih Tipe Tabel */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Format Tipe Tabel
                  </label>
                  <select
                    value={printTableType}
                    onChange={e => setPrintTableType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="gabungan">✨ Lengkap (Tabel Rekapan Siswa + Tabel Log Harian)</option>
                    <option value="rekapan">📋 Tabel Rekapan Ringkasan Per Siswa Saja</option>
                    <option value="detail">📝 Tabel Log Rincian Kejadian Harian Saja</option>
                  </select>
                </div>

                {/* Pisah Halaman Per Bulan */}
                {printMode === 'total_plus_bulan' && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">3. Pisah Halaman Per Bulan</p>
                      <p className="text-xxs text-slate-500 mt-0.5">Setiap bulan baru mulai halaman baru.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={pageBreakPerMonth}
                        onChange={e => setPageBreakPerMonth(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                )}
              </div>

              {/* Pengaturan Kop Surat, Logo, & Pejabat (Tersimpan Otomatis) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <span>⚙️ Pengaturan Kop Surat, Logo &amp; Pengesahan</span>
                  </label>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                    💾 Disimpan Otomatis
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Option Logo */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Logo Sekolah</span>
                      <label className="flex items-center gap-1 text-slate-600 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={printConfig.showLogo}
                          onChange={e => setPrintConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Tampilkan Logo</span>
                      </label>
                    </div>

                    {printConfig.showLogo && (
                      <div className="flex items-center gap-2 pt-1">
                        <label className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xxs cursor-pointer border border-indigo-200 transition-colors">
                          📷 Upload Logo Baru
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {printConfig.customLogoUrl && (
                          <button
                            onClick={() => setPrintConfig(prev => ({ ...prev, customLogoUrl: '' }))}
                            className="px-2 py-1 bg-red-50 text-red-600 font-semibold rounded-lg text-xxs hover:bg-red-100 border border-red-200"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Option Prefix Nomor Surat */}
                  <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-700 block">Prefix Nomor Surat</span>
                    <input
                      type="text"
                      value={printConfig.nomorSuratPrefix}
                      onChange={e => setPrintConfig(prev => ({ ...prev, nomorSuratPrefix: e.target.value }))}
                      placeholder="LKP/KTL"
                      className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Option Alamat Kop */}
                <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block text-xs">Alamat / Telp Kop Surat</span>
                  <input
                    type="text"
                    value={printConfig.kopAlamat}
                    onChange={e => setPrintConfig(prev => ({ ...prev, kopAlamat: e.target.value }))}
                    placeholder="Jl. Mangga Besar VI No. 21, Tamansari, Jakarta Barat — Telp. (021) 6294528"
                    className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Pejabat Tanda Tangan */}
                <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-xs">Pejabat Pengesahan Laporan</span>
                    <label className="flex items-center gap-1 text-slate-600 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printConfig.showSignatures}
                        onChange={e => setPrintConfig(prev => ({ ...prev, showSignatures: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Tampilkan Tanda Tangan</span>
                    </label>
                  </div>

                  {printConfig.showSignatures && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">1. Petugas Piket</span>
                        <input
                          type="text"
                          placeholder="Nama Petugas"
                          value={printConfig.petugasName}
                          onChange={e => setPrintConfig(prev => ({ ...prev, petugasName: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded mb-1"
                        />
                        <input
                          type="text"
                          placeholder="NIP / NIK"
                          value={printConfig.petugasNip}
                          onChange={e => setPrintConfig(prev => ({ ...prev, petugasNip: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">2. Tim BK / Kesiswaan</span>
                        <input
                          type="text"
                          placeholder="Nama Guru BK"
                          value={printConfig.bkName}
                          onChange={e => setPrintConfig(prev => ({ ...prev, bkName: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded mb-1"
                        />
                        <input
                          type="text"
                          placeholder="NIP / NIK"
                          value={printConfig.bkNip}
                          onChange={e => setPrintConfig(prev => ({ ...prev, bkNip: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">3. Kepala Sekolah</span>
                        <input
                          type="text"
                          placeholder="Nama Kepala Sekolah"
                          value={printConfig.kepalaSekolahName}
                          onChange={e => setPrintConfig(prev => ({ ...prev, kepalaSekolahName: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded mb-1"
                        />
                        <input
                          type="text"
                          placeholder="NIP / NIK"
                          value={printConfig.kepalaSekolahNip}
                          onChange={e => setPrintConfig(prev => ({ ...prev, kepalaSekolahNip: e.target.value }))}
                          className="w-full px-2 py-1 text-xxs border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* LIVE PREVIEW BANNER */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <span>👁️ Live Preview &amp; Status Data</span>
                  </span>
                  <span className="text-xxs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full font-semibold">
                    Kertas A4 • Top Margin Minimal
                  </span>
                </div>

                <div className="border border-slate-300 rounded-2xl p-4 bg-slate-200/50">
                  <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 text-slate-900 space-y-2">

                    {/* Status loading bulan */}
                    {printMode === 'total_plus_bulan' && (
                      <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${
                        loadingAllMonths
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : allMonthsData.length > 0
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {loadingAllMonths ? (
                          <><span className="animate-spin">↻</span> Memuat data {allAvailableMonths.length} bulan dari database...</>
                        ) : allMonthsData.length > 0 ? (
                          <>✅ Data siap: <strong>{allMonthsData.length} bulan</strong> ({allMonthsData.reduce((s, m) => s + m.totalKejadian, 0)} kejadian total)</>
                        ) : (
                          <>⚠️ Data belum dimuat. Buka kembali modal ini atau coba lagi.</>
                        )}
                      </div>
                    )}

                    {/* Mini Title */}
                    <div className="text-center pt-1">
                      <h5 className="text-xs font-extrabold uppercase text-slate-900">
                        {printMode === 'bulan_tertentu'
                          ? `LAPORAN REKAPITULASI KETERLAMBATAN SISWA - BULAN ${(customMonthData?.monthLabel || getMonthYearLabel(selectedPrintMonth)).toUpperCase()}`
                          : 'LAPORAN REKAPITULASI KETERLAMBATAN SISWA'}
                      </h5>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        Periode: {formatDateIndo(startDate)} s.d. {formatDateIndo(endDate)} | Kelas: {selectedKelas}
                      </p>
                    </div>

                    {/* Preview Table Info */}
                    <div className="bg-slate-50 p-2 border border-slate-200 text-center rounded text-[10px] text-slate-600">
                      Mode: <strong>{printMode === 'seluruh' ? 'Rekapan Total' : printMode === 'total_plus_bulan' ? 'Total + Per Bulan' : 'Bulan Tertentu'}</strong>
                      {' | '}Total Kejadian: <strong>{printMode === 'bulan_tertentu' ? (customMonthData?.totalKejadian || 0) : printMode === 'total_plus_bulan' ? allMonthsData.reduce((s, m) => s + m.totalKejadian, 0) : stats.totalKejadian}</strong>
                    </div>

                    <p className="text-[10px] text-slate-400 italic text-center">
                      (Klik Cetak setelah semua data selesai dimuat)
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Modal Action Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-2xl text-xs transition-colors"
              >
                Batal
              </button>

              <button
                onClick={triggerBrowserPrint}
                disabled={
                  loadingAllMonths ||
                  loadingCustomMonth ||
                  (printMode === 'total_plus_bulan' && allMonthsData.length === 0)
                }
                className={`px-6 py-2.5 font-extrabold rounded-2xl text-xs shadow-lg transition-all flex items-center gap-2 ${
                  loadingAllMonths || loadingCustomMonth || (printMode === 'total_plus_bulan' && allMonthsData.length === 0)
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-indigo-600/30 scale-100 hover:scale-[1.02]'
                }`}
              >
                {(loadingAllMonths || loadingCustomMonth) ? (
                  <><span className="animate-spin font-bold">↻</span> Memuat data semua bulan...</>
                ) : (printMode === 'total_plus_bulan' && allMonthsData.length === 0) ? (
                  <><span className="animate-spin font-bold">↻</span> Menyiapkan data...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    🖨️ Cetak / Simpan Ke PDF Sekarang
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL DETAIL RIWAYAT KETERLAMBATAN SISWA ──────────────────────── */}
      {selectedStudentForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:hidden">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300 flex items-center justify-center font-bold text-lg shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold leading-tight">{selectedStudentForDetail.nama_lengkap}</h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    NISN: <span className="font-mono">{selectedStudentForDetail.siswa_nisn}</span> • Kelas <span className="font-bold">{selectedStudentForDetail.kelas}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Summary Bar */}
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Periode: {formatDateIndo(startDate)} s.d. {formatDateIndo(endDate)}
              </span>
              <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-full font-extrabold text-xs">
                Terlambat {selectedStudentForDetail.total_terlambat} Kali
              </span>
            </div>

            {/* Modal Body / Table of dates */}
            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">No</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Waktu Masuk</th>
                    <th className="px-4 py-3 text-center">Metode Presensi</th>
                    <th className="px-4 py-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {selectedStudentForDetail.records.map((rec, i) => (
                    <tr key={rec.id || i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-center text-slate-400 font-normal">{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatDateIndo(rec.tanggal)}</td>
                      <td className="px-4 py-3 text-amber-600 font-bold">
                        {rec.waktu ? `${rec.waktu} WIB` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xxs font-semibold uppercase">
                          {rec.metode || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{rec.keterangan || 'Terlambat'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedStudentForDetail(null)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINTABLE CONTAINER DOKUMEN CETAK OFFICIAL (FORMAT RESMI MS WORD) ──────────────── */}
      <div id="print-laporan-area" className="hidden print:block pt-0 px-2 pb-4 bg-white text-black font-serif">
        
        {/* Kop Surat Resmi */}
        <div className="flex items-center justify-between border-b-4 border-double border-black pb-2 mb-3">
          {printConfig.showLogo && (
            <div className="w-16 h-16 shrink-0 mr-3">
              <img
                src={printConfig.customLogoUrl || '/logo.png'}
                alt="Logo Sekolah"
                className="w-full h-full object-contain"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            </div>
          )}
          <div className="text-center flex-1">
            <h1 className="text-xl font-black uppercase tracking-wide text-black leading-tight">
              SMP BUDI MULIA JAKARTA
            </h1>
            <p className="text-[10px] text-black mt-0.5 font-medium">
              {printConfig.kopAlamat || 'Jl. Mangga Besar VI No. 21, Tamansari, Jakarta Barat — Telp. (021) 6294528'}
            </p>
          </div>
          {printConfig.showLogo && <div className="w-16 shrink-0"></div>}
        </div>

        {/* Judul & Nomor Surat */}
        <div className="text-center mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-black underline underline-offset-4">
            {printMode === 'bulan_tertentu'
              ? `LAPORAN REKAPITULASI KETERLAMBATAN SISWA — BULAN ${(customMonthData?.monthLabel || getMonthYearLabel(selectedPrintMonth)).toUpperCase()}`
              : 'LAPORAN REKAPITULASI KETERLAMBATAN SISWA'}
          </h3>
          <p className="text-[10px] font-mono text-black mt-0.5">
            Nomor: {printConfig.nomorSuratPrefix || 'LKP/KTL'}/{new Date().getFullYear()}/{String(new Date().getMonth() + 1).padStart(2, '0')}
          </p>
        </div>

        {/* Metadata Laporan Format Tabel Rapi */}
        <div className="mb-4 text-[11px] text-black">
          <table className="w-auto border-none text-left leading-tight">
            <tbody>
              <tr>
                <td className="pr-4 py-0.5 font-bold">Satuan Pendidikan</td>
                <td className="pr-2 py-0.5">:</td>
                <td className="py-0.5">SMP Budi Mulia Jakarta</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 font-bold">Periode Laporan</td>
                <td className="pr-2 py-0.5">:</td>
                <td className="py-0.5">{formatDateIndo(startDate)} s.d. {formatDateIndo(endDate)}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 font-bold">Filter Kelas</td>
                <td className="pr-2 py-0.5">:</td>
                <td className="py-0.5">{selectedKelas === 'Semua' ? 'Semua Kelas' : `Kelas ${selectedKelas}`}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 font-bold">Total Keterlambatan</td>
                <td className="pr-2 py-0.5">:</td>
                <td className="py-0.5 font-bold">
                  {printMode === 'bulan_tertentu' ? (customMonthData?.totalKejadian || 0) : stats.totalKejadian} Kejadian 
                  ({printMode === 'bulan_tertentu' ? (customMonthData?.uniqueStudents || 0) : stats.uniqueStudents} Siswa)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* DATA TABEL SESUAI MODE PRINT */}

        {/* Mode 1: Rekapan Total Keseluruhan */}
        {printMode === 'seluruh' && (
          <div className="space-y-5">
            {(printTableType === 'rekapan' || printTableType === 'gabungan') && (
              <div>
                <p className="text-[11px] font-bold text-black mb-1">I. REKAPITULASI TOTAL KETERLAMBATAN PER SISWA:</p>
                <ClassBreakdownTable records={presensiData} />
                <PrintAggregatedTable students={aggregatedStudents} />
              </div>
            )}

            {(printTableType === 'detail' || printTableType === 'gabungan') && (
              <div className={printTableType === 'gabungan' ? 'page-break-before pt-2' : ''}>
                <p className="text-[11px] font-bold text-black mb-1">
                  {printTableType === 'gabungan' ? 'II. RINCIAN LOG KEJADIAN HARIAN SISWA TERLAMBAT:' : 'RINCIAN LOG KEJADIAN HARIAN SISWA TERLAMBAT:'}
                </p>
                <PrintDetailLogTable records={presensiData} />
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Rekapan Total + Rekapan Per Bulan */}
        {printMode === 'total_plus_bulan' && (
          <div className="space-y-5">
            {(printTableType === 'rekapan' || printTableType === 'gabungan') && (
              <div className="mb-4">
                <p className="text-[11px] font-bold text-black mb-1">I. REKAPITULASI AKUMULASI TOTAL (SELURUH PERIODE):</p>
                <ClassBreakdownTable records={presensiData} />
                <PrintAggregatedTable students={aggregatedStudents} />
              </div>
            )}

            <div className={`space-y-5 ${pageBreakPerMonth ? 'page-break-before' : ''}`}>
              <p className="text-[11px] font-bold text-black mb-1 keep-with-next">
                II. RINCIAN REKAPITULASI KETERLAMBATAN PER BULAN:
              </p>
              {loadingAllMonths ? (
                <p className="text-xs italic text-black py-4 text-center font-semibold">Sedang memuat data semua bulan...</p>
              ) : allMonthsData.length === 0 ? (
                <p className="text-xs italic text-black py-4 text-center">Belum ada data keterlambatan per bulan.</p>
              ) : (
                allMonthsData.map((mItem, idx) => (
                  <div key={mItem.monthKey} className={`space-y-2 ${pageBreakPerMonth && idx > 0 ? 'page-break-before' : ''}`}>
                    <div className="bg-slate-200 text-black px-3 py-1 font-bold text-xs border border-black flex justify-between items-center keep-with-next">
                      <span>BULAN {mItem.monthLabel.toUpperCase()}</span>
                      <span className="text-[10px]">Total: {mItem.totalKejadian} Kejadian ({mItem.uniqueStudents} Siswa)</span>
                    </div>

                    <ClassBreakdownTable records={mItem.rawItems} />
                    
                    {(printTableType === 'rekapan' || printTableType === 'gabungan') && (
                      <PrintAggregatedTable students={mItem.aggregatedStudents} monthLabel={mItem.monthLabel} />
                    )}

                    {(printTableType === 'detail' || printTableType === 'gabungan') && (
                      <div className="mt-2">
                        <p className="text-[10.5px] font-semibold text-black mb-1">Rincian Log Harian - Bulan {mItem.monthLabel}:</p>
                        <PrintDetailLogTable records={mItem.rawItems} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Mode 3: Rekapan Bulan Tertentu Saja */}
        {printMode === 'bulan_tertentu' && (
          <div className="space-y-5">
            {loadingCustomMonth ? (
              <p className="text-xs text-center py-6 font-semibold text-black">Memuat data bulan {getMonthYearLabel(selectedPrintMonth)}...</p>
            ) : (() => {
              const mItem = customMonthData || monthlyDataMap.find(m => m.monthKey === selectedPrintMonth)
              if (!mItem || mItem.aggregatedStudents.length === 0) {
                return <p className="text-xs text-center py-6 italic text-black">Tidak ada data keterlambatan untuk bulan yang dipilih.</p>
              }
              return (
                <div className="space-y-4">
                  <div className="bg-slate-200 text-black px-3 py-1 font-bold text-xs border border-black flex justify-between items-center">
                    <span>REKAP KETERLAMBATAN — BULAN {mItem.monthLabel.toUpperCase()}</span>
                    <span className="text-[10px]">Total: {mItem.totalKejadian} Kejadian ({mItem.uniqueStudents} Siswa)</span>
                  </div>

                  <ClassBreakdownTable records={mItem.rawItems} />

                  {(printTableType === 'rekapan' || printTableType === 'gabungan') && (
                    <div>
                      <p className="text-[11px] font-bold text-black mb-1">REKAPITULASI TOTAL SISWA TERLAMBAT - BULAN {mItem.monthLabel.toUpperCase()}:</p>
                      <PrintAggregatedTable students={mItem.aggregatedStudents} monthLabel={mItem.monthLabel} />
                    </div>
                  )}

                  {(printTableType === 'detail' || printTableType === 'gabungan') && (
                    <div className={printTableType === 'gabungan' ? 'mt-4 pt-2 border-t border-black' : ''}>
                      <p className="text-[11px] font-bold text-black mb-1">RINCIAN LOG KEJADIAN HARIAN - BULAN {mItem.monthLabel.toUpperCase()}:</p>
                      <PrintDetailLogTable records={mItem.rawItems} />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Pengesahan & Tanda Tangan Formal MS Word */}
        {printConfig.showSignatures && (
          <div className="mt-10 pt-4 border-t border-black keep-with-next avoid-break">
            <div className="flex justify-between items-start text-center text-xs text-black">
              <div className="w-1/3">
                <p className="font-semibold">Mengetahui,</p>
                <p className="font-bold">Petugas Piket Sekolah</p>
                <div className="h-16"></div>
                <p className="font-bold underline">{printConfig.petugasName || '...................................'}</p>
                <p className="text-[10px] mt-0.5">NIP/NIK: {printConfig.petugasNip || '........................'}</p>
              </div>

              <div className="w-1/3">
                <p className="font-semibold">Menyetujui,</p>
                <p className="font-bold">Tim BK / Kesiswaan</p>
                <div className="h-16"></div>
                <p className="font-bold underline">{printConfig.bkName || '...................................'}</p>
                <p className="text-[10px] mt-0.5">NIP/NIK: {printConfig.bkNip || '........................'}</p>
              </div>

              <div className="w-1/3">
                <p className="font-semibold">Jakarta, {formatDateIndo(todayStr)}</p>
                <p className="font-bold">Kepala SMP Budi Mulia</p>
                <div className="h-16"></div>
                <p className="font-bold underline">{printConfig.kepalaSekolahName || '...................................'}</p>
                <p className="text-[10px] mt-0.5">NIP/NIK: {printConfig.kepalaSekolahNip || '........................'}</p>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
