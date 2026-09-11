import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import HallOfFameModal from './HallOfFameModal'
import { downloadFile } from '../utils/fileDownloader'
import { useConfirm } from '../utils/useConfirm'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts'

const CHART_COLORS = ['#3b82f6', '#f97316', '#ef4444', '#10b981', '#6b7280', '#8b5cf6', '#ec4899', '#14b8a6']

// Helper untuk menghitung peringkat dengan poin sama (Tie Ranking)
const assignTieRanks = (items, scoreFn) => {
  let currentRank = 1
  return items.map((item, index) => {
    if (index > 0) {
      const prevScore = scoreFn(items[index - 1])
      const currScore = scoreFn(item)
      if (currScore !== prevScore) {
        currentRank = index + 1
      }
    } else {
      currentRank = 1
    }
    return { ...item, displayRank: currentRank }
  })
}

// Helper untuk mengambil seluruh baris data dari Supabase dengan paginasi (bypass limit 1000 bawaan)
const fetchAllRows = async (queryBuilder, pageSize = 1000) => {
  let allRows = []
  let from = 0
  while (true) {
    const { data, error } = await queryBuilder(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export default function RekapPoinSiswaSection({ session, activeTa }) {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // Filters
  const [periode, setPeriode] = useState('tahun_ajaran') // tahun_ajaran, hari_ini, minggu_ini, bulan_ini, bulan_tertentu, semester, custom
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}`
  })
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1) // Awal bulan ini
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [semester, setSemester] = useState(1)
  const [selectedClasses, setSelectedClasses] = useState([]) // Array of classes

  // Metadata / Options
  const [allClasses, setAllClasses] = useState([])
  const [semesters, setSemesters] = useState([])
  const [guruList, setGuruList] = useState([])

  // Leaderboard Tabs & Data
  const [showHallOfFame, setShowHallOfFame] = useState(false)
  const [leaderboardTab, setLeaderboardTab] = useState('total') // 'total' | 'prestasi' | 'pelanggaran' | 'kumulatif'
  const [topTotalPointsList, setTopTotalPointsList] = useState([])
  const [topPrestasiList, setTopPrestasiList] = useState([])
  const [topPelanggaranList, setTopPelanggaranList] = useState([])

  // Showcase Ranking Selection Modal
  const [showcaseModalOpen, setShowcaseModalOpen] = useState(false)
  const [showcaseTopChoice, setShowcaseTopChoice] = useState('10')
  const [showcaseCustomInput, setShowcaseCustomInput] = useState('')

  // Dashboard Data
  const [loading, setLoading] = useState(false)
  const [summaryStats, setSummaryStats] = useState({
    totalPelanggaranCount: 0,
    totalPelanggaranPoin: 0,
    totalPrestasiCount: 0,
    totalPrestasiPoin: 0
  })
  const [trenData, setTrenData] = useState([])
  const [kelasRankData, setKelasRankData] = useState([])
  const [siswaRankData, setSiswaRankData] = useState([])
  const [breakdownData, setBreakdownData] = useState([])

  // Opsi Pilihan Bulan (12 Bulan Terakhir)
  const monthOptions = React.useMemo(() => {
    const opts = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      opts.push({ value: `${yyyy}-${mm}`, label })
    }
    return opts
  }, [])

  // Drill-down State
  const [drillLevel, setDrillLevel] = useState(1) // 1: Kelas list, 2: Siswa list, 3: Riwayat Siswa
  const [drillKelas, setDrillKelas] = useState(null)
  const [drillSiswa, setDrillSiswa] = useState(null)
  const [drillDataList, setDrillDataList] = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

  // TAB NAVIGASI UTAMA HALAMAN
  const [activeViewTab, setActiveViewTab] = useState('analitik') // 'analitik' | 'daftar_siswa'

  // DAFTAR SELURUH SISWA & TOTAL POIN STATE
  const [allStudentsList, setAllStudentsList] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [daftarKelasFilter, setDaftarKelasFilter] = useState('all')
  const [daftarSearch, setDaftarSearch] = useState('')
  const [daftarSort, setDaftarSort] = useState('all') // 'all' | 'poin_desc' | 'poin_asc' | 'poin_100' | 'prestasi_desc' | 'pelanggaran_desc' | 'nama_asc'

  // POPUP MODAL RIWAYAT POIN SISWA
  const [selectedStudentHistory, setSelectedStudentHistory] = useState(null)
  const [studentHistoryRecords, setStudentHistoryRecords] = useState([])
  const [studentHistoryLoading, setStudentHistoryLoading] = useState(false)
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all') // 'all' | 'pelanggaran' | 'prestasi'
  const [historySearch, setHistorySearch] = useState('')

  // MODAL CATAT POIN
  const [showAddPointModal, setShowAddPointModal] = useState(false)
  const [addPointStudent, setAddPointStudent] = useState(null)
  const [addPointStudentSearch, setAddPointStudentSearch] = useState('')
  const [addPointStudentResults, setAddPointStudentResults] = useState([])
  const [addPointTanggal, setAddPointTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [addPointJam, setAddPointJam] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [addPointPetugas, setAddPointPetugas] = useState('')
  const [addPointKatalogSearch, setAddPointKatalogSearch] = useState('')
  const [addPointKatalogResults, setAddPointKatalogResults] = useState([])
  const [addPointSelectedKatalogs, setAddPointSelectedKatalogs] = useState([])
  const [addPointKeterangan, setAddPointKeterangan] = useState('')
  const [addPointSaving, setAddPointSaving] = useState(false)

  // KHUSUS GURU BK: Mode Pemulihan Poin (Bisa input poin manual di luar katalog)
  const [addPointMode, setAddPointMode] = useState('katalog') // 'katalog' | 'pemulihan_bk'
  const [addPointPemulihanJudul, setAddPointPemulihanJudul] = useState('')
  const [addPointManualPoin, setAddPointManualPoin] = useState('10')

  // Detect if current session is logged in as Petugas Piket
  const isPiket = Boolean(
    session?.role?.toLowerCase()?.includes('piket') ||
    session?.nama_guru?.toLowerCase()?.includes('piket') ||
    session?.username?.toLowerCase()?.includes('piket') ||
    (Array.isArray(session?.roles) && session.roles.some(r => (typeof r === 'string' ? r : r?.nama || '').toLowerCase().includes('piket')))
  )

  // Detect if current session is logged in as Guru BK / Admin
  const isBK = Boolean(
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) ||
    session?.is_admin ||
    session?.role?.toLowerCase()?.includes('bk') ||
    session?.role?.toLowerCase()?.includes('admin') ||
    session?.nama_guru?.toLowerCase()?.includes('bk') ||
    session?.nama_guru?.toLowerCase()?.includes('admin') ||
    session?.username?.toLowerCase()?.includes('bk') ||
    session?.username?.toLowerCase()?.includes('admin') ||
    session?.email?.toLowerCase()?.includes('admin') ||
    (Array.isArray(session?.roles) && session.roles.some(r => {
      const name = (typeof r === 'string' ? r : r?.nama || '').toLowerCase()
      return name.includes('bk') || name.includes('bimbingan') || name.includes('admin') || name.includes('konseling')
    }))
  )

  // Hak akses untuk menghapus riwayat catatan poin siswa
  const canDeletePoint = Boolean(
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) ||
    session?.is_admin ||
    session?.app_role === 'Admin' ||
    session?.role?.toLowerCase()?.includes('admin') ||
    session?.role?.toLowerCase()?.includes('bk') ||
    session?.role?.toLowerCase()?.includes('kesiswaan') ||
    session?.nama_guru?.toLowerCase()?.includes('bk') ||
    session?.nama_guru?.toLowerCase()?.includes('admin') ||
    session?.username?.toLowerCase()?.includes('bk') ||
    session?.username?.toLowerCase()?.includes('admin') ||
    session?.email?.toLowerCase()?.includes('admin') ||
    (Array.isArray(session?.roles) && session.roles.some(r => {
      const name = (typeof r === 'string' ? r : r?.nama || '').toLowerCase()
      return (
        name.includes('admin') ||
        name.includes('bk') ||
        name.includes('bimbingan') ||
        name.includes('konseling') ||
        name.includes('poin') ||
        name.includes('kesiswaan') ||
        name.includes('kepala sekolah')
      )
    }))
  )

  // Fungsi Hapus Catatan Poin Siswa dari Riwayat
  const handleDeletePointRecord = async (rec) => {
    if (!canDeletePoint) {
      alert('Anda tidak memiliki izin / role untuk menghapus catatan poin siswa.')
      return
    }

    const poinVal = rec.poin_diberikan || 0
    const confirmed = await requestConfirm({
      title: 'Hapus Catatan Poin Siswa?',
      message: `Apakah Anda yakin ingin menghapus catatan "${rec.jenis}" (${poinVal > 0 ? '+' : ''}${poinVal} Poin) untuk ${rec.nama_siswa || selectedStudentHistory?.nama_lengkap}?\n\nTotal poin siswa akan otomatis dihitung ulang kembali.`,
      confirmLabel: 'Ya, Hapus Catatan',
      confirmColor: 'red',
      icon: 'danger'
    })

    if (!confirmed) return

    try {
      // 1. Delete from point_records
      const { error: delErr } = await supabase
        .from('point_records')
        .delete()
        .eq('id', rec.id)

      if (delErr) throw delErr

      // 2. Adjust student_points table if it exists
      const taId = rec.tahun_ajaran_id || activeTa?.id
      if (poinVal !== 0 && taId) {
        const { data: spData } = await supabase
          .from('student_points')
          .select('*')
          .eq('nisn', rec.nisn)
          .eq('tahun_ajaran_id', taId)
          .maybeSingle()

        if (spData) {
          const newTotalPoin = spData.total_poin - poinVal
          await supabase
            .from('student_points')
            .update({
              total_poin: newTotalPoin,
              updated_at: new Date().toISOString()
            })
            .eq('nisn', rec.nisn)
            .eq('tahun_ajaran_id', taId)
        }
      }

      // 3. Refresh modal student history live
      if (selectedStudentHistory) {
        await handleOpenStudentHistory(selectedStudentHistory)
      }

      // 4. Refresh main student list & analytics data
      fetchAllStudentsWithPoints()
      fetchData()

    } catch (err) {
      console.error('Error deleting point record:', err)
      alert('Gagal menghapus catatan poin: ' + (err.message || err))
    }
  }

  // Fetch Metadata
  useEffect(() => {
    fetchMetadata()
  }, [activeTa])

  const fetchMetadata = async () => {
    try {
      // 1. Fetch kelas list dari siswa_lengkap
      const { data: kelasData } = await supabase.from('siswa_lengkap').select('kelas').eq('is_aktif', true)
      const uniqueKelas = [...new Set((kelasData || []).map(d => d.kelas).filter(Boolean))].sort()
      setAllClasses(uniqueKelas)

      // 2. Fetch semesters
      if (activeTa?.id) {
        const { data: semData } = await supabase.from('semester').select('*').eq('tahun_ajaran_id', activeTa.id).order('nomor')
        setSemesters(semData || [])
        const today = new Date().toISOString().slice(0, 10)
        const activeSem = (semData || []).find(s => s.tanggal_mulai <= today && s.tanggal_selesai >= today)
        if (activeSem) setSemester(activeSem.nomor)
      }

      // 3. Fetch guru list
      const { data: gData } = await supabase.from('guru').select('id, nama_guru, kode').order('nama_guru', { ascending: true })
      setGuruList(gData || [])
    } catch (err) {
      console.error('Error fetching metadata:', err)
    }
  }

  // Fetch all students and their active total points
  const fetchAllStudentsWithPoints = useCallback(async () => {
    if (!activeTa?.id) return
    setStudentsLoading(true)
    try {
      // 1. Fetch all active students from siswa_lengkap
      const { data: allSiswa, error: siswaErr } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)
        .order('nama_lengkap', { ascending: true })

      if (siswaErr) throw siswaErr

      // 2. Fetch student_points for this active TA
      const { data: allSp, error: spErr } = await supabase
        .from('student_points')
        .select('nisn, total_poin, poin_default, tahap_pembinaan_aktif')
        .eq('tahun_ajaran_id', activeTa.id)
        .limit(10000)

      if (spErr) throw spErr

      // 3. Fetch point_records summary for this active TA (dengan paginasi penuh)
      const allPr = await fetchAllRows((from, to) =>
        supabase
          .from('point_records')
          .select('nisn, poin_diberikan')
          .eq('tahun_ajaran_id', activeTa.id)
          .range(from, to)
      )

      const spMap = new Map((allSp || []).map(sp => [sp.nisn, sp]))
      const prMap = {}
      ;(allPr || []).forEach(r => {
        if (!prMap[r.nisn]) prMap[r.nisn] = { pelCount: 0, pelPoin: 0, presCount: 0, presPoin: 0 }
        if (r.poin_diberikan < 0) {
          prMap[r.nisn].pelCount++
          prMap[r.nisn].pelPoin += Math.abs(r.poin_diberikan)
        } else {
          prMap[r.nisn].presCount++
          prMap[r.nisn].presPoin += r.poin_diberikan
        }
      })

      const merged = (allSiswa || []).map(s => {
        const sp = spMap.get(s.nisn)
        const pr = prMap[s.nisn] || { pelCount: 0, pelPoin: 0, presCount: 0, presPoin: 0 }
        const defaultPoin = sp?.poin_default ?? 100
        const totalPoin = defaultPoin + pr.presPoin - pr.pelPoin
        return {
          nisn: s.nisn,
          nama_lengkap: s.nama_lengkap,
          kelas: s.kelas || '-',
          total_poin: totalPoin,
          poin_default: defaultPoin,
          tahap_pembinaan_aktif: sp?.tahap_pembinaan_aktif,
          pelanggaranCount: pr.pelCount,
          pelanggaranPoin: pr.pelPoin,
          prestasiCount: pr.presCount,
          prestasiPoin: pr.presPoin
        }
      })

      setAllStudentsList(merged)
    } catch (err) {
      console.error('Error fetching all students with points:', err)
    } finally {
      setStudentsLoading(false)
    }
  }, [activeTa])

  useEffect(() => {
    fetchAllStudentsWithPoints()
  }, [fetchAllStudentsWithPoints])

  // Open History Modal for a Student
  const handleOpenStudentHistory = async (student) => {
    setSelectedStudentHistory(student)
    setStudentHistoryLoading(true)
    setHistoryTypeFilter('all')
    setHistorySearch('')
    try {
      let q = supabase
        .from('point_records')
        .select('*')
        .eq('nisn', student.nisn)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })

      if (activeTa?.id) {
        q = q.eq('tahun_ajaran_id', activeTa.id)
      }

      const { data, error } = await q
      if (error) throw error
      const records = data || []
      setStudentHistoryRecords(records)

      // Hitung ulang secara real-time dari data transaksi yang tampil agar selalu akurat & sinkron
      let livePresPoin = 0
      let livePresCount = 0
      let livePelPoin = 0
      let livePelCount = 0
      records.forEach(r => {
        if (r.poin_diberikan < 0) {
          livePelCount++
          livePelPoin += Math.abs(r.poin_diberikan)
        } else {
          livePresCount++
          livePresPoin += (r.poin_diberikan || 0)
        }
      })
      const defaultPoin = student.poin_default ?? 100
      const liveTotalPoin = defaultPoin + livePresPoin - livePelPoin

      setSelectedStudentHistory(prev => ({
        ...prev,
        total_poin: liveTotalPoin,
        prestasiPoin: livePresPoin,
        prestasiCount: livePresCount,
        pelanggaranPoin: livePelPoin,
        pelanggaranCount: livePelCount
      }))
    } catch (err) {
      console.error('Error fetching student history:', err)
    } finally {
      setStudentHistoryLoading(false)
    }
  }

  // BUKA MODAL CATAT POIN
  const openAddPointModal = (student = null) => {
    setAddPointStudent(student)
    setAddPointStudentSearch('')
    setAddPointStudentResults([])
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    setAddPointTanggal(now.toISOString().slice(0, 10))
    setAddPointJam(`${hh}:${mm}`)
    setAddPointSelectedKatalogs([])
    setAddPointKatalogSearch('')
    setAddPointKatalogResults([])
    setAddPointKeterangan('')
    setAddPointPetugas(session?.nama_guru || '')
    // Default mode: jika Guru BK dan poin siswa < 100, bisa default ke katalog atau pemulihan
    setAddPointMode('katalog')
    setAddPointPemulihanJudul('Pemulihan Poin Siswa (Tugas Khusus BK)')
    setAddPointManualPoin('10')
    setShowAddPointModal(true)
  }

  // Search Katalog Poin
  const searchKatalog = async (q) => {
    if (!q || !q.trim()) {
      setAddPointKatalogResults([])
      return
    }
    try {
      const { data } = await supabase
        .from('point_catalog')
        .select('*')
        .or(`kode.ilike.%${q}%,jenis.ilike.%${q}%,kategori.ilike.%${q}%`)
        .limit(10)
      setAddPointKatalogResults(data || [])
    } catch (err) {
      console.error('Error searching katalog:', err)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (addPointKatalogSearch) searchKatalog(addPointKatalogSearch)
    }, 250)
    return () => clearTimeout(timer)
  }, [addPointKatalogSearch])

  // Search Siswa saat Catat Poin Baru
  const searchStudent = (q) => {
    setAddPointStudentSearch(q)
    if (!q || !q.trim()) {
      setAddPointStudentResults([])
      return
    }
    const query = q.toLowerCase().trim()
    const matches = allStudentsList.filter(s =>
      (s.nama_lengkap || '').toLowerCase().includes(query) ||
      (s.nisn || '').toLowerCase().includes(query) ||
      (s.kelas || '').toLowerCase().includes(query)
    ).slice(0, 8)
    setAddPointStudentResults(matches)
  }

  // Pilih Katalog Poin
  const toggleSelectKatalog = (k) => {
    if (addPointSelectedKatalogs.some(item => item.id === k.id)) {
      setAddPointSelectedKatalogs(prev => prev.filter(item => item.id !== k.id))
    } else {
      setAddPointSelectedKatalogs(prev => [...prev, k])
    }
    setAddPointKatalogSearch('')
    setAddPointKatalogResults([])
  }

  // Simpan Catat Poin (Mendukung Katalog & Pemulihan Poin Khusus Guru BK)
  const handleSaveAddPoint = async (e) => {
    e.preventDefault()
    if (!addPointStudent) {
      alert('Pilih siswa terlebih dahulu.')
      return
    }
    if (!activeTa?.id) {
      alert('Tahun Ajaran aktif tidak ditemukan.')
      return
    }
    if (isPiket && !addPointPetugas) {
      alert('Sebagai Petugas Piket, Anda wajib memilih nama guru/petugas yang mencatat.')
      return
    }

    if (addPointMode === 'pemulihan_bk') {
      const poinVal = parseInt(addPointManualPoin)
      if (isNaN(poinVal) || poinVal <= 0) {
        alert('Masukkan jumlah poin pemulihan yang valid (angka positif, contoh: 5, 10, 15).')
        return
      }
      if (!addPointKeterangan || !addPointKeterangan.trim()) {
        alert('Keterangan tugas pemulihan wajib diisi oleh Guru BK.')
        return
      }
    } else {
      if (addPointSelectedKatalogs.length === 0) {
        alert('Pilih minimal 1 kegiatan atau pelanggaran dari katalog.')
        return
      }
    }

    setAddPointSaving(true)
    try {
      const finalPetugas = isPiket ? addPointPetugas : (session?.nama_guru || session?.email || 'Guru BK')
      const combinedCreatedAt = addPointJam ? new Date(`${addPointTanggal}T${addPointJam}:00`).toISOString() : new Date().toISOString()
      
      let recordsToInsert = []
      let totalPoinDelta = 0

      if (addPointMode === 'pemulihan_bk') {
        totalPoinDelta = Math.abs(parseInt(addPointManualPoin))
        recordsToInsert = [{
          nisn: addPointStudent.nisn,
          nama_siswa: addPointStudent.nama_lengkap,
          kelas: addPointStudent.kelas,
          tahun_ajaran_id: activeTa.id,
          semester,
          catalog_id: null,
          kode_katalog: 'PEMULIHAN',
          jenis: addPointPemulihanJudul.trim() || 'Pemulihan Poin Siswa (Tugas Khusus BK)',
          poin_diberikan: totalPoinDelta,
          keterangan: addPointKeterangan.trim(),
          dicatat_oleh: finalPetugas,
          tanggal: addPointTanggal,
          created_at: combinedCreatedAt,
        }]
      } else {
        totalPoinDelta = addPointSelectedKatalogs.reduce((sum, item) => sum + item.poin, 0)
        recordsToInsert = addPointSelectedKatalogs.map(k => ({
          nisn: addPointStudent.nisn,
          nama_siswa: addPointStudent.nama_lengkap,
          kelas: addPointStudent.kelas,
          tahun_ajaran_id: activeTa.id,
          semester,
          catalog_id: k.id,
          kode_katalog: k.kode,
          jenis: k.jenis,
          poin_diberikan: k.poin,
          keterangan: addPointKeterangan,
          dicatat_oleh: finalPetugas,
          tanggal: addPointTanggal,
          created_at: combinedCreatedAt,
        }))
      }

      const { error: recErr } = await supabase.from('point_records').insert(recordsToInsert)
      if (recErr) throw recErr

      // Update student_points
      const { data: spData } = await supabase
        .from('student_points')
        .select('*')
        .eq('nisn', addPointStudent.nisn)
        .eq('tahun_ajaran_id', activeTa.id)
        .maybeSingle()

      const defaultPoin = spData?.poin_default ?? 100
      const currentPoin = spData?.total_poin ?? defaultPoin
      const newPoin = currentPoin + totalPoinDelta

      const { error: spErr } = await supabase.from('student_points').upsert({
        nisn: addPointStudent.nisn,
        tahun_ajaran_id: activeTa.id,
        total_poin: newPoin,
        poin_default: defaultPoin,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'nisn,tahun_ajaran_id' })

      if (spErr) console.error('Gagal update poin:', spErr)

      // Refresh seluruh data
      await fetchAllStudentsWithPoints()
      await fetchData()

      // Refresh Riwayat Siswa jika sedang dibuka
      if (selectedStudentHistory && selectedStudentHistory.nisn === addPointStudent.nisn) {
        handleOpenStudentHistory({
          ...selectedStudentHistory,
          total_poin: newPoin
        })
      }

      setShowAddPointModal(false)
    } catch (err) {
      alert('Gagal menyimpan poin: ' + err.message)
    } finally {
      setAddPointSaving(false)
    }
  }

  // Filtered Students List
  const filteredStudentsList = React.useMemo(() => {
    return allStudentsList.filter(s => {
      // Filter Kelas
      if (daftarKelasFilter !== 'all' && s.kelas !== daftarKelasFilter) return false
      // Filter Search (nama atau nisn)
      if (daftarSearch.trim()) {
        const q = daftarSearch.toLowerCase().trim()
        const matchName = (s.nama_lengkap || '').toLowerCase().includes(q)
        const matchNisn = (s.nisn || '').toLowerCase().includes(q)
        if (!matchName && !matchNisn) return false
      }
      // Filter Status / Range Poin
      if (daftarSort === 'poin_desc') return s.total_poin > 100
      if (daftarSort === 'poin_asc') return s.total_poin < 100
      if (daftarSort === 'poin_100') return s.total_poin === 100
      if (daftarSort === 'prestasi_desc') return s.prestasiPoin > 0
      if (daftarSort === 'pelanggaran_desc') return s.pelanggaranPoin > 0
      return true
    }).sort((a, b) => {
      if (daftarSort === 'poin_desc') return b.total_poin - a.total_poin
      if (daftarSort === 'poin_asc') return a.total_poin - b.total_poin
      if (daftarSort === 'prestasi_desc') return b.prestasiPoin - a.prestasiPoin
      if (daftarSort === 'pelanggaran_desc') return b.pelanggaranPoin - a.pelanggaranPoin
      if (daftarSort === 'nama_asc') return a.nama_lengkap.localeCompare(b.nama_lengkap)
      // Default: urut kelas lalu nama
      if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas)
      return a.nama_lengkap.localeCompare(b.nama_lengkap)
    })
  }, [allStudentsList, daftarKelasFilter, daftarSearch, daftarSort])

  // Filtered History Records in Modal
  const filteredHistoryRecords = React.useMemo(() => {
    return studentHistoryRecords.filter(r => {
      if (historyTypeFilter === 'pelanggaran' && r.poin_diberikan >= 0) return false
      if (historyTypeFilter === 'prestasi' && r.poin_diberikan < 0) return false
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase().trim()
        const matchJenis = (r.jenis || '').toLowerCase().includes(q)
        const matchKet = (r.keterangan || '').toLowerCase().includes(q)
        const matchKode = (r.kode_katalog || '').toLowerCase().includes(q)
        const matchOleh = (r.dicatat_oleh || '').toLowerCase().includes(q)
        const matchTgl = (r.tanggal || '').toLowerCase().includes(q)
        if (!matchJenis && !matchKet && !matchKode && !matchOleh && !matchTgl) return false
      }
      return true
    })
  }, [studentHistoryRecords, historyTypeFilter, historySearch])

  // Fetch Dashboard & Drill-down Data
  const fetchData = useCallback(async () => {
    if (!activeTa?.id) return
    setLoading(true)

    try {
      let start = startDate
      let end = endDate
      const today = new Date().toISOString().slice(0, 10)

      if (periode === 'tahun_ajaran') {
        start = activeTa?.tanggal_mulai || '2000-01-01'
        end = activeTa?.tanggal_selesai || '2099-12-31'
      } else if (periode === 'hari_ini') {
        start = today
        end = today
      } else if (periode === 'minggu_ini') {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        start = d.toISOString().slice(0, 10)
        end = today
      } else if (periode === 'bulan_ini') {
        const d = new Date()
        d.setDate(1)
        start = d.toISOString().slice(0, 10)
        end = today
      } else if (periode === 'bulan_tertentu') {
        const parts = selectedMonth.split('-')
        const year = parseInt(parts[0])
        const month = parseInt(parts[1])
        const firstDay = new Date(year, month - 1, 1)
        const lastDay = new Date(year, month, 0)
        const yyyy = firstDay.getFullYear()
        const mm = String(firstDay.getMonth() + 1).padStart(2, '0')
        const ddLast = String(lastDay.getDate()).padStart(2, '0')
        start = `${yyyy}-${mm}-01`
        end = `${yyyy}-${mm}-${ddLast}`
      } else if (periode === 'semester') {
        const activeSem = semesters.find(s => s.nomor === semester)
        if (activeSem) {
          start = activeSem.tanggal_mulai
          end = activeSem.tanggal_selesai
        }
      }

      // 1. Query point_records (dengan paginasi penuh)
      const filteredRecords = await fetchAllRows((from, to) => {
        let query = supabase.from('point_records').select('*')
          .gte('tanggal', start)
          .lte('tanggal', end)
          .range(from, to)

        if (activeTa?.id) {
          query = query.or(`tahun_ajaran_id.eq.${activeTa.id},tahun_ajaran_id.is.null`)
        }

        if (periode === 'semester') {
          query = query.eq('semester', semester)
        }

        if (selectedClasses.length > 0) {
          query = query.in('kelas', selectedClasses)
        }

        return query
      })

      // 2. Hitung Summary Stats
      let totalPelCount = 0
      let totalPelPoin = 0
      let totalPresCount = 0
      let totalPresPoin = 0

      filteredRecords.forEach(r => {
        if (r.poin_diberikan < 0) {
          totalPelCount++
          totalPelPoin += Math.abs(r.poin_diberikan)
        } else {
          totalPresCount++
          totalPresPoin += r.poin_diberikan
        }
      })

      setSummaryStats({
        totalPelanggaranCount: totalPelCount,
        totalPelanggaranPoin: totalPelPoin,
        totalPrestasiCount: totalPresCount,
        totalPrestasiPoin: totalPresPoin
      })

      // 3. Tren Bulanan
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const trenMap = {}
      filteredRecords.forEach(r => {
        const m = new Date(r.tanggal).getMonth()
        const key = monthNames[m]
        if (!trenMap[key]) {
          trenMap[key] = { name: key, Pelanggaran: 0, Prestasi: 0, monthIndex: m }
        }
        if (r.poin_diberikan < 0) {
          trenMap[key].Pelanggaran += Math.abs(r.poin_diberikan)
        } else {
          trenMap[key].Prestasi += r.poin_diberikan
        }
      })
      const trenList = Object.values(trenMap).sort((a, b) => a.monthIndex - b.monthIndex)
      setTrenData(trenList)

      // 4. Peringkat Pelanggaran Kelas
      const kelasMap = {}
      filteredRecords.forEach(r => {
        if (r.poin_diberikan < 0) {
          kelasMap[r.kelas] = (kelasMap[r.kelas] || 0) + Math.abs(r.poin_diberikan)
        }
      })
      const classList = Object.entries(kelasMap).map(([kelas, poin]) => ({ name: kelas, Pelanggaran: poin }))
      classList.sort((a, b) => b.Pelanggaran - a.Pelanggaran)
      setKelasRankData(classList)

      // 5. Breakdown Kategori
      const { data: catalogData } = await supabase.from('point_catalog').select('id, kategori')
      const catMap = (catalogData || []).reduce((acc, curr) => {
        acc[curr.id] = curr.kategori
        return acc
      }, {})

      const catBreakdown = {}
      filteredRecords.forEach(r => {
        if (r.poin_diberikan < 0) {
          const catName = catMap[r.catalog_id] || 'Lainnya'
          catBreakdown[catName] = (catBreakdown[catName] || 0) + 1
        }
      })
      const catList = Object.entries(catBreakdown).map(([kategori, count]) => ({ name: kategori, value: count }))
      catList.sort((a, b) => b.value - a.value)
      setBreakdownData(catList)

      // 6. LEADERBOARD PERIODE
      const studentStatsMap = {}
      const allNisnsInRecords = Array.from(new Set(filteredRecords.map(r => r.nisn)))
      let studentNameMap = {}
      let studentClassMap = {}

      if (allNisnsInRecords.length > 0) {
        const { data: siswaDataList } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', allNisnsInRecords)

        if (siswaDataList) {
          siswaDataList.forEach(s => {
            studentNameMap[s.nisn] = s.nama_lengkap || s.nama || 'Siswa'
            studentClassMap[s.nisn] = s.kelas || '-'
          })
        }
      }

      filteredRecords.forEach(r => {
        if (!studentStatsMap[r.nisn]) {
          studentStatsMap[r.nisn] = {
            nisn: r.nisn,
            nama: studentNameMap[r.nisn] || r.nama_siswa || 'Siswa',
            kelas: r.kelas || studentClassMap[r.nisn] || '-',
            pelanggaranPoin: 0,
            prestasiPoin: 0,
            pelanggaranCount: 0,
            prestasiCount: 0,
          }
        }

        if (r.poin_diberikan < 0) {
          studentStatsMap[r.nisn].pelanggaranPoin += Math.abs(r.poin_diberikan)
          studentStatsMap[r.nisn].pelanggaranCount++
        } else {
          studentStatsMap[r.nisn].prestasiPoin += r.poin_diberikan
          studentStatsMap[r.nisn].prestasiCount++
        }
      })

      const studentStatsList = Object.values(studentStatsMap)

      // Top Total Poin
      const { data: spTopPoints } = await supabase
        .from('student_points')
        .select('nisn, total_poin, poin_default, tahap_pembinaan_aktif')
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: false })
        .limit(20)

      if (spTopPoints && spTopPoints.length > 0) {
        const spNisns = spTopPoints.map(s => s.nisn)
        const { data: spSiswaNames } = await supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').in('nisn', spNisns)
        const nameMap = {}
        const classMap = {}
        ;(spSiswaNames || []).forEach(s => {
          nameMap[s.nisn] = s.nama_lengkap
          classMap[s.nisn] = s.kelas
        })

        const kumulatifTopTotal = spTopPoints.map(sp => {
          const matchedRecord = studentStatsMap[sp.nisn] || { prestasiPoin: 0, pelanggaranPoin: 0 }
          const defaultPoin = sp.poin_default ?? 100
          const computedTotal = defaultPoin + matchedRecord.prestasiPoin - matchedRecord.pelanggaranPoin
          return {
            nisn: sp.nisn,
            nama: nameMap[sp.nisn] || 'Siswa',
            kelas: classMap[sp.nisn] || '-',
            poinAwal: defaultPoin,
            prestasiPoin: matchedRecord.prestasiPoin,
            pelanggaranPoin: matchedRecord.pelanggaranPoin,
            totalPoinAkhir: computedTotal
          }
        })
        kumulatifTopTotal.sort((a, b) => b.totalPoinAkhir - a.totalPoinAkhir)
        setTopTotalPointsList(assignTieRanks(kumulatifTopTotal, s => s.totalPoinAkhir))
      }

      const topPres = assignTieRanks(
        [...studentStatsList]
          .filter(s => s.prestasiPoin > 0)
          .sort((a, b) => b.prestasiPoin - a.prestasiPoin)
          .slice(0, 20),
        s => s.prestasiPoin
      )

      const topPel = assignTieRanks(
        [...studentStatsList]
          .filter(s => s.pelanggaranPoin > 0)
          .sort((a, b) => b.pelanggaranPoin - a.pelanggaranPoin)
          .slice(0, 20),
        s => s.pelanggaranPoin
      )

      setTopPrestasiList(topPres)
      setTopPelanggaranList(topPel)

      // 7. Peringkat Kumulatif Siswa Pembinaan
      let siswaQuery = supabase.from('student_points')
        .select('nisn, total_poin, poin_default, tahap_pembinaan_aktif')
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: true })

      if (periode === 'semester') {
        siswaQuery = siswaQuery.eq('semester', semester)
      }

      const { data: sPointsRaw } = await siswaQuery.limit(50)
      const sPoints = (sPointsRaw || [])
        .filter(sp => sp.total_poin < (sp.poin_default ?? 100))
        .slice(0, 10)

      const { data: stages } = await supabase.from('guidance_stages').select('id, nama_tahap')
      const stageMap = (stages || []).reduce((acc, curr) => {
        acc[curr.id] = curr.nama_tahap
        return acc
      }, {})

      const { data: enrols } = await supabase.from('enrollment').select('nisn, kelas').eq('tahun_ajaran_id', activeTa.id)
      const enrolMap = (enrols || []).reduce((acc, curr) => {
        acc[curr.nisn] = curr.kelas
        return acc
      }, {})

      const rankNisns = sPoints.map(sp => sp.nisn)
      let siswaNameMap = {}
      if (rankNisns.length > 0) {
        const { data: siswaNames } = await supabase.from('siswa_lengkap')
          .select('nisn, nama_lengkap')
          .in('nisn', rankNisns)
        ;(siswaNames || []).forEach(s => {
          siswaNameMap[s.nisn] = s.nama_lengkap
        })
      }

      const sRankRaw = (sPoints || []).map(sp => ({
        nisn: sp.nisn,
        nama: siswaNameMap[sp.nisn] || 'Tidak Diketahui',
        kelas: enrolMap[sp.nisn] || '—',
        poin: sp.total_poin,
        tahap: stageMap[sp.tahap_pembinaan_aktif] || 'Normal'
      }))
      setSiswaRankData(assignTieRanks(sRankRaw, s => s.poin))

      fetchAllStudentsWithPoints()
    } catch (err) {
      console.error('Error fetching dashboard statistics:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa, periode, startDate, endDate, semester, selectedClasses, semesters, fetchAllStudentsWithPoints])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load Drilldown Data
  const loadDrillData = useCallback(async () => {
    if (!activeTa?.id) return
    setDrillLoading(true)

    try {
      if (drillLevel === 1) {
        const { data: recs } = await supabase.from('point_records')
          .select('kelas, poin_diberikan')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', semester)
          .limit(50000)

        const drillMap = {}
        allClasses.forEach(k => {
          drillMap[k] = { name: k, pelanggaran: 0, prestasi: 0, total_records: 0 }
        })

        recs?.forEach(r => {
          if (!drillMap[r.kelas]) {
            drillMap[r.kelas] = { name: r.kelas, pelanggaran: 0, prestasi: 0, total_records: 0 }
          }
          drillMap[r.kelas].total_records++
          if (r.poin_diberikan < 0) {
            drillMap[r.kelas].pelanggaran += Math.abs(r.poin_diberikan)
          } else {
            drillMap[r.kelas].prestasi += r.poin_diberikan
          }
        })

        const sorted = Object.values(drillMap).sort((a, b) => a.name.localeCompare(b.name))
        setDrillDataList(sorted)

      } else if (drillLevel === 2 && drillKelas) {
        const { data: sPoints } = await supabase.from('student_points')
          .select('nisn, total_poin')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', semester)

        const { data: classSiswa } = await supabase.from('enrollment')
          .select('nisn, kelas')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('kelas', drillKelas)

        const classNisns = new Set((classSiswa || []).map(cs => cs.nisn))

        const { data: recs } = await supabase.from('point_records')
          .select('nisn, poin_diberikan, semester')
          .eq('tahun_ajaran_id', activeTa.id)
          .limit(50000)
          .eq('semester', semester)
          .eq('kelas', drillKelas)

        const pelMap = {}
        const presMap = {}
        recs?.forEach(r => {
          if (r.poin_diberikan < 0) {
            pelMap[r.nisn] = (pelMap[r.nisn] || 0) + Math.abs(r.poin_diberikan)
          } else {
            presMap[r.nisn] = (presMap[r.nisn] || 0) + r.poin_diberikan
          }
        })

        const filteredSPoints = (sPoints || []).filter(sp => classNisns.has(sp.nisn))
        const drillNisns = filteredSPoints.map(sp => sp.nisn)
        let drillNameMap = {}
        if (drillNisns.length > 0) {
          const { data: drillNames } = await supabase.from('siswa_lengkap')
            .select('nisn, nama_lengkap')
            .in('nisn', drillNisns)
          ;(drillNames || []).forEach(s => {
            drillNameMap[s.nisn] = s.nama_lengkap
          })
        }

        const list = filteredSPoints
          .map(sp => ({
            nisn: sp.nisn,
            nama: drillNameMap[sp.nisn] || 'Siswa Tanpa Nama',
            total_poin: sp.total_poin,
            pelanggaran: pelMap[sp.nisn] || 0,
            prestasi: presMap[sp.nisn] || 0
          }))
          .sort((a, b) => a.nama.localeCompare(b.nama))

        setDrillDataList(list)

      } else if (drillLevel === 3 && drillSiswa) {
        const { data: recs, error } = await supabase.from('point_records')
          .select('nisn, nama_siswa, kelas, catalog_id, poin_diberikan, tanggal, semester, keterangan, created_at')
          .eq('tahun_ajaran_id', activeTa.id)
          .limit(50000)
          .eq('semester', semester)
          .eq('nisn', drillSiswa.nisn)
          .order('tanggal', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) throw error
        setDrillDataList(recs || [])
      }
    } catch (err) {
      console.error('Error loading drilldown data:', err)
    } finally {
      setDrillLoading(false)
    }
  }, [activeTa, semester, drillLevel, drillKelas, drillSiswa, allClasses])

  useEffect(() => {
    loadDrillData()
  }, [loadDrillData])

  // Export Data ke Excel
  const handleExportExcel = async () => {
    if (!activeTa?.id) return
    setLoading(true)

    try {
      const ExcelJS = await import('exceljs')
      const { saveAs } = await import('file-saver')
      
      const { data: recs } = await supabase.from('point_records')
        .select('nisn, poin_diberikan, semester, catalog_id')
        .eq('tahun_ajaran_id', activeTa.id)
        .limit(50000)
        .eq('semester', semester)
        .order('kelas').order('nama_siswa').order('tanggal')

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Rekap Poin Sekolah')

      ws.columns = [
        { header: 'Tanggal', key: 'tanggal', width: 14 },
        { header: 'NISN', key: 'nisn', width: 14 },
        { header: 'Nama Siswa', key: 'nama_siswa', width: 30 },
        { header: 'Kelas', key: 'kelas', width: 10 },
        { header: 'Kode Poin', key: 'kode_katalog', width: 12 },
        { header: 'Keterangan Kegiatan', key: 'jenis', width: 40 },
        { header: 'Skor Poin', key: 'poin_diberikan', width: 12 },
        { header: 'Catatan Tambahan', key: 'keterangan', width: 30 },
        { header: 'Dicatat Oleh', key: 'dicatat_oleh', width: 22 }
      ]

      ws.getRow(1).font = { bold: true }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }

      recs?.forEach((r, idx) => {
        const row = ws.addRow({
          tanggal: r.tanggal,
          nisn: r.nisn,
          nama_siswa: r.nama_siswa,
          kelas: r.kelas,
          kode_katalog: r.kode_katalog || 'MANUAL',
          jenis: r.jenis,
          poin_diberikan: r.poin_diberikan,
          keterangan: r.keterangan || '',
          dicatat_oleh: r.dicatat_oleh
        })
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
        row.getCell('poin_diberikan').font = {
          color: { argb: r.poin_diberikan < 0 ? 'FFDC2626' : 'FF16A34A' },
          bold: true
        }
      })

      ws.eachRow(r => {
        r.eachCell(c => {
          c.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
        })
      })

      const buffer = await wb.xlsx.writeBuffer()
      const today = new Date().toISOString().slice(0, 10)
      await downloadFile(buffer, `rekap-analitik-poin-sekolah-${today}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    } catch (err) {
      alert('Gagal mengekspor laporan: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* Header + Ekspor + Catat Poin Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Rekap & Analitik Poin</h2>
          <p className="text-slate-500 text-sm mt-0.5">Analisis tren perilaku, prestasi, dan pembinaan siswa secara menyeluruh</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowcaseModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            <span>Rekap Total Poin (Tab Baru)</span>
          </button>
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Ekspor Excel</span>
          </button>
        </div>
      </div>

      {/* Tab Switcher Utama Halaman */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveViewTab('analitik')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeViewTab === 'analitik'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          <span>Ringkasan & Grafik Analitik</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveViewTab('daftar_siswa')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer relative ${
            activeViewTab === 'daftar_siswa'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          <span>Daftar Poin Seluruh Siswa</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeViewTab === 'daftar_siswa' ? 'bg-white text-indigo-700' : 'bg-slate-200 text-slate-700'}`}>
            {allStudentsList.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RINGKASAN & GRAFIK ANALITIK                                        */}
      {/* ========================================================================= */}
      {activeViewTab === 'analitik' && (
        <div className="space-y-6 animate-fade-in">
          {/* Filter Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="min-w-[160px]">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Periode Evaluasi</label>
                <select
                  value={periode}
                  onChange={e => setPeriode(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                >
                  <option value="tahun_ajaran">Full Tahun Ajaran (Default)</option>
                  <option value="semester">Semester Aktif</option>
                  <option value="bulan_ini">Bulan Ini</option>
                  <option value="bulan_tertentu">Bulan Tertentu</option>
                  <option value="minggu_ini">7 Hari Terakhir</option>
                  <option value="hari_ini">Hari Ini</option>
                  <option value="custom">Rentang Kustom</option>
                </select>
              </div>

              {periode === 'bulan_tertentu' && (
                <div className="min-w-[180px]">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Pilih Bulan</label>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-semibold text-indigo-700"
                  >
                    {monthOptions.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {periode === 'custom' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Selesai</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </>
              )}

              {periode === 'semester' && (
                <div className="min-w-[180px]">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Semester</label>
                  <select
                    value={semester}
                    onChange={e => setSemester(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    {semesters.map(s => (
                      <option key={s.id} value={s.nomor}>Semester {s.nomor} ({s.nama})</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm transition-all border border-slate-200 flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3m0 0l3 3m-3-3v8" />
                </svg>
                <span>Segarkan</span>
              </button>
            </div>

            {/* Filter Kelas Pill */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">Filter Kelas</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedClasses([])}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    selectedClasses.length === 0
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  Semua Kelas
                </button>
                {allClasses.map(k => {
                  const isSelected = selectedClasses.includes(k)
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedClasses(prev => prev.filter(c => c !== k))
                        } else {
                          setSelectedClasses(prev => [...prev, k])
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {k}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Pelanggaran</p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{summaryStats.totalPelanggaranCount} <span className="text-xs font-normal text-slate-400">Kasus</span></h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"/></svg>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Bobot Pelanggaran</p>
                <h3 className="text-2xl font-black text-orange-600 mt-1">-{summaryStats.totalPelanggaranPoin} <span className="text-xs font-normal text-slate-400">Poin</span></h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z"/></svg>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Prestasi</p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">{summaryStats.totalPrestasiCount} <span className="text-xs font-normal text-slate-400">Kasus</span></h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z"/></svg>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Apresiasi Prestasi</p>
                <h3 className="text-2xl font-black text-indigo-600 mt-1">+{summaryStats.totalPrestasiPoin} <span className="text-xs font-normal text-slate-400">Poin</span></h3>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tren Poin Bulanan */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
                <span>Tren Fluktuasi Poin Bulanan</span>
              </h3>
              <div className="h-72">
                {trenData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={trenData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'semibold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 'semibold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      <Line type="monotone" dataKey="Prestasi" stroke="#10b981" strokeWidth={3.5} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="Pelanggaran" stroke="#ef4444" strokeWidth={3.5} dot={{ r: 4, strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Tidak ada data tren pada periode ini.</div>
                )}
              </div>
            </div>

            {/* Peringkat Pelanggaran Kelas */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>Peringkat Pelanggaran Kelas (Bobot Poin)</span>
              </h3>
              <div className="h-72">
                {kelasRankData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={kelasRankData.slice(0, 5)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'semibold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 'semibold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="Pelanggaran" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Tidak ada data pelanggaran kelas.</div>
                )}
              </div>
            </div>

            {/* Breakdown Kategori */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
                <span>Kategori Pelanggaran Terbanyak</span>
              </h3>
              <div className="h-72 flex flex-col sm:flex-row items-center justify-center gap-4">
                {breakdownData.length > 0 ? (
                  <>
                    <div className="w-1/2 h-full min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <PieChart>
                          <Pie
                            data={breakdownData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {breakdownData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2 max-h-[220px] overflow-y-auto text-xs w-full">
                      {breakdownData.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="text-slate-600 font-semibold truncate max-w-[150px]">{item.name}</span>
                          </div>
                          <span className="font-bold text-slate-800 shrink-0">{item.value} Kasus</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-slate-400 text-sm">Tidak ada data pelanggaran kategori.</div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION: LEADERBOARD POIN SISWA */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                  <span>Leaderboard Poin Siswa ({periode === 'bulan_tertentu' ? (monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth) : periode === 'bulan_ini' ? 'Bulan Ini' : periode === 'hari_ini' ? 'Hari Ini' : periode === 'minggu_ini' ? '7 Hari Terakhir' : periode === 'semester' ? `Semester ${semester}` : 'Rentang Kustom'})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Peringkat perolehan poin prestasi dan bobot pelanggaran siswa pada bulan / periode yang dipilih.
                </p>
              </div>

              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0 self-start md:self-auto flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('total')}
                  className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'total'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Top Total Poin ({topTotalPointsList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('prestasi')}
                  className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'prestasi'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Top Prestasi ({topPrestasiList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('pelanggaran')}
                  className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'pelanggaran'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Top Pelanggaran ({topPelanggaranList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('kumulatif')}
                  className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                    leaderboardTab === 'kumulatif'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Butuh Pembinaan</span>
                </button>
              </div>
            </div>

            {/* Tab 0: Top Total Poin */}
            {leaderboardTab === 'total' && (
              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-indigo-50/70 text-indigo-900 font-bold uppercase text-[10px] sticky top-0 border-b border-indigo-100">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">Peringkat</th>
                      <th className="px-4 py-3">Nama Siswa & NISN</th>
                      <th className="px-4 py-3 text-center">Kelas</th>
                      <th className="px-4 py-3 text-center">Formula Poin (Awal + Plus - Negatif)</th>
                      <th className="px-4 py-3 text-center">Total Poin Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topTotalPointsList.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400 font-medium">Belum ada data poin siswa.</td></tr>
                    ) : topTotalPointsList.map((s) => (
                      <tr key={s.nisn} className="hover:bg-indigo-50/40 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-sm text-indigo-700">
                          #{s.displayRank}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{s.nama}</div>
                          <div className="text-[10px] font-mono text-slate-400">NISN: {s.nisn}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-indigo-800">{s.kelas}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-600">
                          <span className="text-slate-500 font-semibold">{s.poinAwal || 100} (Awal)</span>
                          {s.prestasiPoin > 0 && <span className="text-emerald-600 font-bold ml-1">+{s.prestasiPoin}</span>}
                          {s.pelanggaranPoin > 0 && <span className="text-rose-600 font-bold ml-1">-{s.pelanggaranPoin}</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-black rounded-full text-xs border border-emerald-200">
                            {s.totalPoinAkhir} Poin
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 1: Top Prestasi Siswa */}
            {leaderboardTab === 'prestasi' && (
              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-emerald-50/70 text-emerald-900 font-bold uppercase text-[10px] sticky top-0 border-b border-emerald-100">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">Peringkat</th>
                      <th className="px-4 py-3">Nama Siswa & NISN</th>
                      <th className="px-4 py-3 text-center">Kelas</th>
                      <th className="px-4 py-3 text-center">Jumlah Kasus / Kegiatan</th>
                      <th className="px-4 py-3 text-center">Total Poin Diperoleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topPrestasiList.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400 font-medium">Belum ada data prestasi pada bulan/periode yang dipilih.</td></tr>
                    ) : topPrestasiList.map((s) => (
                      <tr key={s.nisn} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-sm text-emerald-700">
                          #{s.displayRank}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{s.nama}</div>
                          <div className="text-[10px] font-mono text-slate-400">NISN: {s.nisn}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-800">{s.kelas}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-600">{s.prestasiCount} Kegiatan</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-black rounded-full text-xs border border-emerald-200">
                            +{s.prestasiPoin} Poin
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: Top Pelanggaran Siswa */}
            {leaderboardTab === 'pelanggaran' && (
              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-rose-50/70 text-rose-900 font-bold uppercase text-[10px] sticky top-0 border-b border-rose-100">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">Peringkat</th>
                      <th className="px-4 py-3">Nama Siswa & NISN</th>
                      <th className="px-4 py-3 text-center">Kelas</th>
                      <th className="px-4 py-3 text-center">Jumlah Kasus</th>
                      <th className="px-4 py-3 text-center">Bobot Poin Terpotong</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topPelanggaranList.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400 font-medium">Belum ada data pelanggaran pada bulan/periode yang dipilih.</td></tr>
                    ) : topPelanggaranList.map((s) => (
                      <tr key={s.nisn} className="hover:bg-rose-50/40 transition-colors">
                        <td className="px-4 py-3 text-center font-black text-sm text-rose-700">
                          #{s.displayRank}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{s.nama}</div>
                          <div className="text-[10px] font-mono text-slate-400">NISN: {s.nisn}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-rose-800">{s.kelas}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-600">{s.pelanggaranCount} Kasus</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-3 py-1 bg-rose-100 text-rose-800 font-black rounded-full text-xs border border-rose-200">
                            -{s.pelanggaranPoin} Poin
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Kumulatif Pembinaan Semester */}
            {leaderboardTab === 'kumulatif' && (
              <div className="overflow-x-auto max-h-[340px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">Peringkat</th>
                      <th className="px-4 py-3">Nama Siswa</th>
                      <th className="px-4 py-3 text-center">Kelas</th>
                      <th className="px-4 py-3 text-center">Skor Poin Sisa</th>
                      <th className="px-4 py-3 text-center">Tahap Pembinaan Aktif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {siswaRankData.length > 0 ? (
                      siswaRankData.map((s) => (
                        <tr key={s.nisn} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-center font-black text-sm text-slate-700">
                            #{s.displayRank}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">{s.nama} <span className="text-[10px] font-mono text-slate-400 font-normal">({s.nisn})</span></td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-500">{s.kelas}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${s.poin <= 50 ? 'bg-red-100 text-red-700' : s.poin <= 75 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {s.poin} Poin
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${s.tahap !== 'Normal' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
                              {s.tahap}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">Seluruh siswa berada dalam batas poin aman semester ini.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Drill-down Table Section */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Eksplorasi Data Poin Sekolah</h3>
                <p className="text-slate-500 text-xs mt-0.5">Klik baris tabel untuk menelusuri detail secara mendalam</p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold">
                <button
                  onClick={() => { setDrillLevel(1); setDrillKelas(null); setDrillSiswa(null) }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${drillLevel === 1 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Semua Kelas
                </button>
                {drillLevel >= 2 && (
                  <>
                    <span className="text-slate-400">/</span>
                    <button
                      onClick={() => { setDrillLevel(2); setDrillSiswa(null) }}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${drillLevel === 2 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      Kelas {drillKelas}
                    </button>
                  </>
                )}
                {drillLevel >= 3 && (
                  <>
                    <span className="text-slate-400">/</span>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">{drillSiswa?.nama}</span>
                  </>
                )}
              </div>
            </div>

            {drillLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                {drillLevel === 1 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-6 py-3 text-left">Nama Kelas</th>
                        <th className="px-6 py-3 text-center">Total Kasus Tercatat</th>
                        <th className="px-6 py-3 text-center">Total Poin Pelanggaran (-)</th>
                        <th className="px-6 py-3 text-center">Total Poin Prestasi (+)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDataList.map(item => (
                        <tr
                          key={item.name}
                          onClick={() => { setDrillKelas(item.name); setDrillLevel(2) }}
                          className="border-b border-slate-100 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-3.5 font-bold text-slate-800">{item.name}</td>
                          <td className="px-6 py-3.5 text-center text-slate-600 font-semibold">{item.total_records}</td>
                          <td className="px-6 py-3.5 text-center text-red-600 font-bold">-{item.pelanggaran}</td>
                          <td className="px-6 py-3.5 text-center text-emerald-600 font-bold">+{item.prestasi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {drillLevel === 2 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-6 py-3 text-left">Nama Lengkap</th>
                        <th className="px-6 py-3 text-center">NISN</th>
                        <th className="px-6 py-3 text-center">Skor Poin Aktif</th>
                        <th className="px-6 py-3 text-center">Total Pelanggaran (-)</th>
                        <th className="px-6 py-3 text-center">Total Prestasi (+)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDataList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-slate-400">Tidak ada data siswa di kelas ini.</td>
                        </tr>
                      ) : (
                        drillDataList.map(s => (
                          <tr
                            key={s.nisn}
                            onClick={() => { setDrillSiswa(s); setDrillLevel(3) }}
                            className="border-b border-slate-100 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                          >
                            <td className="px-6 py-3.5 font-bold text-slate-800">{s.nama}</td>
                            <td className="px-6 py-3.5 text-center text-slate-500 font-mono text-xs">{s.nisn}</td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.total_poin <= 50 ? 'bg-red-100 text-red-700' : s.total_poin <= 75 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {s.total_poin}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-center text-red-600 font-bold">-{s.pelanggaran}</td>
                            <td className="px-6 py-3.5 text-center text-emerald-600 font-bold">+{s.prestasi}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {drillLevel === 3 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-black tracking-wider">
                        <th className="px-6 py-3 text-left">Tanggal</th>
                        <th className="px-6 py-3 text-left">Kode</th>
                        <th className="px-6 py-3 text-left">Kegiatan / Kasus</th>
                        <th className="px-6 py-3 text-center">Skor Poin</th>
                        <th className="px-6 py-3 text-left">Catatan Tambahan</th>
                        <th className="px-6 py-3 text-left">Dicatat Oleh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDataList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400">Belum ada riwayat poin tercatat untuk siswa ini.</td>
                        </tr>
                      ) : (
                        drillDataList.map(r => (
                          <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-6 py-3.5 text-slate-500 text-xs whitespace-nowrap">{r.tanggal}</td>
                            <td className="px-6 py-3.5 font-mono text-xs text-indigo-700 bg-indigo-50/50 font-bold px-2 py-0.5 rounded">{r.kode_katalog || 'MANUAL'}</td>
                            <td className="px-6 py-3.5 text-slate-800 font-medium">{r.jenis}</td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.poin_diberikan < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {r.poin_diberikan > 0 ? '+' : ''}{r.poin_diberikan}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-xs text-slate-500 max-w-[200px] truncate">{r.keterangan || '—'}</td>
                            <td className="px-6 py-3.5 text-xs text-slate-500 whitespace-nowrap">{r.dicatat_oleh}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DAFTAR SELURUH SISWA & TOTAL POIN (FULL PAGE DEDICATED VIEW)       */}
      {/* ========================================================================= */}
      {activeViewTab === 'daftar_siswa' && (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-fade-in">
          {/* Header Section */}
          <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                  <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight">
                    Daftar Poin Seluruh Siswa
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Daftar lengkap seluruh siswa aktif beserta total poin saat ini. <span className="font-bold text-indigo-600">Klik baris siswa</span> untuk melihat riwayat atau mencatat poin.
                </p>
              </div>

              {/* Statistik Ringkas Header */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 shadow-2xs">
                  Total: <span className="text-indigo-600 font-black">{filteredStudentsList.length}</span> / {allStudentsList.length} Siswa
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-bold text-emerald-700 shadow-2xs">
                  Prestasi (&gt;100): <span className="font-black">{allStudentsList.filter(s => s.total_poin > 100).length}</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 font-bold text-red-700 shadow-2xs">
                  Perlu Pembinaan (&lt;100): <span className="font-black">{allStudentsList.filter(s => s.total_poin < 100).length}</span>
                </span>
              </div>
            </div>

            {/* Filter Bar: Kelas + Search + Urutan */}
            <div className="mt-5 space-y-3 pt-4 border-t border-slate-200/70">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                  Filter Kelas:
                </span>
                <button
                  type="button"
                  onClick={() => setDaftarKelasFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    daftarKelasFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  Semua Kelas ({allStudentsList.length})
                </button>
                {allClasses.map(k => {
                  const countInClass = allStudentsList.filter(s => s.kelas === k).length
                  const isSelected = daftarKelasFilter === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDaftarKelasFilter(k)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {k} <span className="opacity-70 text-[10px]">({countInClass})</span>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    value={daftarSearch}
                    onChange={e => setDaftarSearch(e.target.value)}
                    placeholder="Cari nama siswa atau NISN..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none shadow-2xs"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                  {daftarSearch && (
                    <button
                      onClick={() => setDaftarSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={daftarSort}
                    onChange={e => setDaftarSort(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-2xs cursor-pointer"
                  >
                    <option value="all">Urutan Default (Kelas & Nama)</option>
                    <option value="poin_desc">Poin Tertinggi (Prestasi &gt; 100)</option>
                    <option value="poin_asc">Perlu Pembinaan (Poin &lt; 100)</option>
                    <option value="poin_100">Poin Standar (100 Poin)</option>
                    <option value="prestasi_desc">Paling Banyak Prestasi (+)</option>
                    <option value="pelanggaran_desc">Paling Banyak Pelanggaran (-)</option>
                    <option value="nama_asc">Nama Siswa (A - Z)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* DAFTAR SISWA: MOBILE LIST (md:hidden) & DESKTOP TABLE (hidden md:block) */}
          {studentsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
              <p className="font-semibold text-xs text-slate-500">Memuat daftar siswa dan total poin...</p>
            </div>
          ) : filteredStudentsList.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <p className="text-sm font-bold text-slate-700">Tidak ada siswa yang sesuai kriteria filter.</p>
              <p className="text-xs text-slate-400 mt-1">Coba ganti filter kelas atau kata kunci pencarian Anda.</p>
              {(daftarSearch || daftarKelasFilter !== 'all' || daftarSort !== 'all') && (
                <button
                  onClick={() => { setDaftarSearch(''); setDaftarKelasFilter('all'); setDaftarSort('all') }}
                  className="mt-3 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Reset Semua Filter
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 1. TAMPILAN KHUSUS MOBILE (HP) - TIDAK PERLU SCROLL KANAN */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredStudentsList.map((s, idx) => {
                  const poin = s.total_poin
                  const isPrestasi = poin > 100
                  const isNormal = poin === 100
                  const isWaspada = poin >= 75 && poin < 100
                  const isPeringatan = poin >= 50 && poin < 75

                  return (
                    <div
                      key={s.nisn}
                      onClick={() => handleOpenStudentHistory(s)}
                      className="p-3.5 hover:bg-indigo-50/50 active:bg-indigo-100/60 cursor-pointer transition-colors flex items-center justify-between gap-3 group"
                    >
                      {/* Kiri: Avatar & Info Siswa */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs uppercase">
                          {s.nama_lengkap.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-900 text-xs truncate group-hover:text-indigo-600 transition-colors">
                              {s.nama_lengkap}
                            </p>
                            <span className="px-1.5 py-0.5 text-[9px] font-black bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 shrink-0">
                              {s.kelas}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span className="font-mono">NISN: {s.nisn}</span>
                            {s.prestasiPoin > 0 && (
                              <span className="font-bold text-emerald-600">+{s.prestasiPoin}</span>
                            )}
                            {s.pelanggaranPoin > 0 && (
                              <span className="font-bold text-red-600">-{s.pelanggaranPoin}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Kanan: Badge Total Poin & Panah Detail */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${
                            isPrestasi
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : isNormal
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : isWaspada
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : isPeringatan
                              ? 'bg-orange-50 text-orange-700 border-orange-300'
                              : 'bg-red-50 text-red-700 border-red-300'
                          }`}
                        >
                          {poin} Poin
                        </span>
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 2. TAMPILAN DESKTOP & TABLET (TABLE LENGKAP) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200 z-10 shadow-2xs">
                    <tr>
                      <th className="px-5 py-3 w-12 text-center">No</th>
                      <th className="px-5 py-3">Nama Siswa & NISN</th>
                      <th className="px-5 py-3 text-center">Kelas</th>
                      <th className="px-5 py-3 text-center">Total Poin Sekarang</th>
                      <th className="px-5 py-3 text-center">Rincian Perolehan</th>
                      <th className="px-5 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudentsList.map((s, idx) => {
                      const poin = s.total_poin
                      const isPrestasi = poin > 100
                      const isNormal = poin === 100
                      const isWaspada = poin >= 75 && poin < 100
                      const isPeringatan = poin >= 50 && poin < 75

                      return (
                        <tr
                          key={s.nisn}
                          onClick={() => handleOpenStudentHistory(s)}
                          className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                          title="Klik untuk melihat riwayat poin siswa ini"
                        >
                          <td className="px-5 py-3.5 text-center font-bold text-slate-400 text-xs">
                            {idx + 1}
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs uppercase">
                                {s.nama_lengkap.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800 text-xs group-hover:text-indigo-700 transition-colors">
                                  {s.nama_lengkap}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400">NISN: {s.nisn}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <span className="px-2.5 py-1 text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 shadow-2xs">
                              {s.kelas}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${
                                isPrestasi
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : isNormal
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : isWaspada
                                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                                  : isPeringatan
                                  ? 'bg-orange-50 text-orange-700 border-orange-300'
                                  : 'bg-red-50 text-red-700 border-red-300'
                              }`}
                            >
                              <span>{poin} Poin</span>
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {s.prestasiPoin > 0 ? (
                                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                  +{s.prestasiPoin} ({s.prestasiCount})
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">—</span>
                              )}
                              {s.pelanggaranPoin > 0 ? (
                                <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                                  -{s.pelanggaranPoin} ({s.pelanggaranCount})
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">—</span>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <div className="inline-flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleOpenStudentHistory(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-all shadow-2xs cursor-pointer"
                                title="Lihat Riwayat Poin"
                              >
                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                <span>Riwayat</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openAddPointModal(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                                title="Catat Poin Siswa Ini"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                                <span>Catat Poin</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Footer info */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-medium">
            <p>
              Menampilkan <span className="font-bold text-slate-700">{filteredStudentsList.length}</span> dari total <span className="font-bold text-slate-700">{allStudentsList.length}</span> siswa aktif.
            </p>
            <p className="text-[11px] text-slate-400 italic">
              Klik tombol &quot;Riwayat&quot; untuk melihat transaksi atau &quot;Catat Poin&quot; untuk menambah poin siswa.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POP UP MODAL: DETAIL RIWAYAT POIN SISWA (SUPER RAPI & ELEGAN)            */}
      {/* ========================================================================= */}
      {selectedStudentHistory && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] w-screen h-screen flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-5 lg:p-6 animate-fade-in"
          onClick={() => setSelectedStudentHistory(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Pop Up Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black text-base flex items-center justify-center shadow-xs uppercase shrink-0">
                  {selectedStudentHistory.nama_lengkap.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                      {selectedStudentHistory.nama_lengkap}
                    </h3>
                    <span className="px-2.5 py-0.5 text-[10px] font-black bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                      Kelas {selectedStudentHistory.kelas}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">NISN: {selectedStudentHistory.nisn}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Badge Skor Poin */}
                <div className="text-right hidden sm:block mr-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Skor Poin</p>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-black border ${
                      selectedStudentHistory.total_poin > 100
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : selectedStudentHistory.total_poin === 100
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-red-50 text-red-700 border-red-300'
                    }`}
                  >
                    {selectedStudentHistory.total_poin} Poin
                  </span>
                </div>

                {/* Tombol Tutup Silang */}
                <button
                  type="button"
                  onClick={() => setSelectedStudentHistory(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  title="Tutup Pop Up"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* Body Pop Up Modal (Scrollable) */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* 3 Mini Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Skor Poin Aktif</p>
                    <p className="text-2xl font-black text-indigo-950 mt-0.5">{selectedStudentHistory.total_poin}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Poin standar: {selectedStudentHistory.poin_default ?? 100}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-100/60 text-indigo-700 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z"/></svg>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Prestasi (+)</p>
                    <p className="text-2xl font-black text-emerald-700 mt-0.5">+{selectedStudentHistory.prestasiPoin}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{selectedStudentHistory.prestasiCount} kegiatan tercatat</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-700 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-red-50/50 border border-red-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Pelanggaran (-)</p>
                    <p className="text-2xl font-black text-red-700 mt-0.5">-{selectedStudentHistory.pelanggaranPoin}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{selectedStudentHistory.pelanggaranCount} kasus tercatat</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-red-100/60 text-red-700 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"/></svg>
                  </div>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('all')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      historyTypeFilter === 'all'
                        ? 'bg-white text-indigo-700 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({studentHistoryRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('prestasi')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      historyTypeFilter === 'prestasi'
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Prestasi ({studentHistoryRecords.filter(r => r.poin_diberikan > 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTypeFilter('pelanggaran')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      historyTypeFilter === 'pelanggaran'
                        ? 'bg-red-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pelanggaran ({studentHistoryRecords.filter(r => r.poin_diberikan < 0).length})
                  </button>
                </div>

                <div className="relative flex-1 max-w-sm">
                  <input
                    type="text"
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Cari keterangan, kode, atau kasus..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Tabel Riwayat Siswa */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                {studentHistoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 text-slate-400 text-sm">
                    <div className="w-7 h-7 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Memuat riwayat transaksi...</p>
                  </div>
                ) : filteredHistoryRecords.length === 0 ? (
                  <div className="text-center py-12 px-4 text-slate-400">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <p className="text-xs font-bold text-slate-600">Belum ada riwayat transaksi poin</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Siswa ini belum pernah tercatat memiliki catatan pada filter ini.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10 shadow-2xs">
                        <tr>
                          <th className="px-4 py-2.5 w-10 text-center">No</th>
                          <th className="px-4 py-2.5">Tanggal & Waktu</th>
                          <th className="px-4 py-2.5">Kode</th>
                          <th className="px-4 py-2.5">Kasus / Kegiatan</th>
                          <th className="px-4 py-2.5 text-center">Poin</th>
                          <th className="px-4 py-2.5">Keterangan</th>
                          <th className="px-4 py-2.5">Petugas</th>
                          {canDeletePoint && (
                            <th className="px-4 py-2.5 text-center">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredHistoryRecords.map((r, idx) => (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 text-center font-bold text-slate-400 text-xs">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <div className="font-bold text-slate-800">{r.tanggal}</div>
                              {r.created_at && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 font-bold px-2 py-0.5 rounded border border-indigo-100">
                                {r.kode_katalog || 'MANUAL'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800 max-w-[260px] whitespace-normal">
                              {r.jenis}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                                  r.poin_diberikan < 0
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {r.poin_diberikan > 0 ? '+' : ''}{r.poin_diberikan}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 max-w-[200px] whitespace-normal">
                              {r.keterangan || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                              {r.dicatat_oleh || 'Petugas'}
                            </td>
                            {canDeletePoint && (
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePointRecord(r)}
                                  className="inline-flex items-center justify-center p-1.5 text-rose-500 hover:text-white hover:bg-rose-600 rounded-xl transition-all shadow-2xs hover:shadow-sm cursor-pointer"
                                  title="Hapus Catatan Poin Siswa"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Pop Up Modal */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                Total <span className="font-bold text-slate-800">{filteredHistoryRecords.length}</span> transaksi tercatat
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAddPointModal(selectedStudentHistory)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                  <span>Catat Poin Siswa Ini</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentHistory(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* POP UP MODAL: CATAT POIN BARU (FORMULIR INPUT CEPAT)                     */}
      {/* ========================================================================= */}
      {showAddPointModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99999] w-screen h-screen flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-5 lg:p-6 animate-fade-in"
          onClick={() => setShowAddPointModal(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">Catat Poin Siswa</h3>
                  <p className="text-xs text-slate-500">Formulir pencatatan perilaku atau prestasi siswa</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPointModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveAddPoint} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* Pilih / Tampilkan Siswa */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Siswa yang Dituju *</label>
                {addPointStudent ? (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center uppercase">
                        {addPointStudent.nama_lengkap.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm">{addPointStudent.nama_lengkap}</p>
                          <span className="px-2 py-0.5 text-[10px] font-black bg-white text-indigo-700 rounded-full border border-indigo-200">
                            Kelas {addPointStudent.kelas}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500">NISN: {addPointStudent.nisn} | Poin Sekarang: <span className="font-bold text-slate-800">{addPointStudent.total_poin} Poin</span></p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddPointStudent(null)}
                      className="px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-white rounded-lg transition-all cursor-pointer border border-transparent hover:border-indigo-200"
                    >
                      Ganti
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={addPointStudentSearch}
                      onChange={e => searchStudent(e.target.value)}
                      placeholder="Ketik nama siswa atau NISN..."
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </span>

                    {/* Autocomplete Results Siswa */}
                    {addPointStudentResults.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {addPointStudentResults.map(s => (
                          <div
                            key={s.nisn}
                            onClick={() => {
                              setAddPointStudent(s)
                              setAddPointStudentResults([])
                              setAddPointStudentSearch('')
                            }}
                            className="p-3 hover:bg-indigo-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <p className="font-bold text-xs text-slate-900">{s.nama_lengkap}</p>
                              <p className="text-[10px] text-slate-400 font-mono">NISN: {s.nisn} | Kelas: {s.kelas}</p>
                            </div>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded-full">
                              {s.total_poin} Poin
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Baris Tanggal & Jam */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Tanggal Kegiatan *</label>
                  <input
                    type="date"
                    value={addPointTanggal}
                    onChange={e => setAddPointTanggal(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Jam Kegiatan (WIB) *</label>
                  <input
                    type="time"
                    value={addPointJam}
                    onChange={e => setAddPointJam(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Petugas Pengisi (Dropdown jika Piket) */}
              {isPiket ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Guru / Petugas yang Mencatat *</label>
                  <select
                    value={addPointPetugas}
                    onChange={e => setAddPointPetugas(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">-- Pilih Guru / Petugas --</option>
                    {guruList.map(g => (
                      <option key={g.id} value={g.nama_guru}>{g.nama_guru} ({g.kode})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Petugas Pencatat</label>
                  <input
                    type="text"
                    value={session?.nama_guru || session?.email || 'Admin'}
                    disabled
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 outline-none cursor-not-allowed"
                  />
                </div>
              )}

              {/* KHUSUS GURU BK: Tab Switcher Mode Katalog vs Pemulihan Poin */}
              {isBK && (
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-bold gap-1">
                  <button
                    type="button"
                    onClick={() => setAddPointMode('katalog')}
                    className={`flex-1 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      addPointMode === 'katalog'
                        ? 'bg-white text-indigo-700 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                    <span>Pilih dari Katalog</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAddPointMode('pemulihan_bk')}
                    className={`flex-1 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      addPointMode === 'pemulihan_bk'
                        ? 'bg-emerald-600 text-white shadow-xs font-black'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>Pemulihan Poin (Khusus BK)</span>
                  </button>
                </div>
              )}

              {/* TAMPILAN 1: MODE KATALOG (STANDAR) */}
              {addPointMode === 'katalog' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Pilih Poin dari Katalog *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={addPointKatalogSearch}
                      onChange={e => setAddPointKatalogSearch(e.target.value)}
                      placeholder="Ketik nama pelanggaran, prestasi, atau kode (mis: POS-, NEG-)..."
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </span>

                    {/* Dropdown Hasil Pencarian Katalog */}
                    {addPointKatalogResults.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-52 overflow-y-auto divide-y divide-slate-100">
                        {addPointKatalogResults.map(k => (
                          <div
                            key={k.id}
                            onClick={() => toggleSelectKatalog(k)}
                            className="p-3 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                  {k.kode}
                                </span>
                                <span className="text-xs font-bold text-slate-800">{k.jenis}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">Kategori: {k.kategori}</p>
                            </div>
                            <span className={`px-2.5 py-1 text-xs font-black rounded-full ${k.poin > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {k.poin > 0 ? '+' : ''}{k.poin} Poin
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* List Katalog Terpilih */}
                  {addPointSelectedKatalogs.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {addPointSelectedKatalogs.map(k => (
                        <div key={k.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              {k.kode}
                            </span>
                            <span className="text-xs font-semibold text-slate-800">{k.jenis}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-black rounded-full ${k.poin > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {k.poin > 0 ? '+' : ''}{k.poin} Poin
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleSelectKatalog(k)}
                              className="text-slate-400 hover:text-red-600 text-xs font-bold p-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAMPILAN 2: MODE PEMULIHAN POIN KHUSUS GURU BK (MANUAL DI LUAR KATALOG) */}
              {addPointMode === 'pemulihan_bk' && (
                <div className="space-y-3.5 animate-fade-in">
                  {/* Banner Informasi Pemulihan */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-900">Kategori: Pemulihan Poin Siswa (Guru BK)</p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Berikan poin pemulihan bagi siswa yang telah melaksanakan tugas pembinaan. Anda bebas menentukan jumlah poin pemulihan yang diberikan.
                      </p>
                    </div>
                  </div>

                  {/* Judul Kegiatan / Tugas Pemulihan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Tugas / Kegiatan Pemulihan Poin *
                    </label>
                    <input
                      type="text"
                      value={addPointPemulihanJudul}
                      onChange={e => setAddPointPemulihanJudul(e.target.value)}
                      placeholder="Contoh: Tugas Piket Perpustakaan & Merapikan Buku"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  {/* Jumlah Poin Pemulihan Bebas */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jumlah Poin Pemulihan yang Ditambahkan (+) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={addPointManualPoin}
                        onChange={e => setAddPointManualPoin(e.target.value)}
                        placeholder="Contoh: 10"
                        required
                        className="w-full pl-9 pr-4 py-2 bg-emerald-50/60 border border-emerald-300 rounded-xl text-sm font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-700 font-black text-sm">
                        +
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Poin ini akan otomatis menambahkan skor poin aktif siswa.</p>
                  </div>
                </div>
              )}

              {/* Catatan / Berita Acara Pelaksanaan Tugas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {addPointMode === 'pemulihan_bk' ? 'Keterangan Tugas / Berita Acara Pemulihan (Wajib) *' : 'Catatan Tambahan (Opsional)'}
                </label>
                <textarea
                  value={addPointKeterangan}
                  onChange={e => setAddPointKeterangan(e.target.value)}
                  placeholder={
                    addPointMode === 'pemulihan_bk'
                      ? "Jelaskan tugas yang telah dilaksanakan siswa untuk memulihkan poin (misal: Siswa telah menyelesaikan tugas kebersihan perpustakaan selama 3 hari dan berjanji memperbaiki perilakunya)..."
                      : "Ketik keterangan detail kegiatan atau lokasi kejadian..."
                  }
                  required={addPointMode === 'pemulihan_bk'}
                  rows={addPointMode === 'pemulihan_bk' ? 3 : 2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Preview Kalkulasi Skor Poin */}
              {addPointStudent && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-indigo-950">Simulasi Total Poin Baru</p>
                    <p className="text-[10px] text-slate-500">
                      {addPointMode === 'pemulihan_bk' ? (
                        <>Poin Saat Ini ({addPointStudent.total_poin}) + Pemulihan BK (+{parseInt(addPointManualPoin) || 0})</>
                      ) : (
                        <>Poin Saat Ini ({addPointStudent.total_poin}) + Perubahan ({addPointSelectedKatalogs.reduce((s, i) => s + i.poin, 0)})</>
                      )}
                    </p>
                  </div>
                  <span className={`text-sm font-black px-3 py-1 rounded-xl border shadow-2xs ${
                    addPointMode === 'pemulihan_bk'
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-white text-indigo-700 border-indigo-200'
                  }`}>
                    {addPointMode === 'pemulihan_bk'
                      ? `${addPointStudent.total_poin + (parseInt(addPointManualPoin) || 0)} Poin`
                      : `${addPointStudent.total_poin + addPointSelectedKatalogs.reduce((s, i) => s + i.poin, 0)} Poin`
                    }
                  </span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddPointModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addPointSaving}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 ${
                    addPointMode === 'pemulihan_bk'
                      ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300'
                      : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300'
                  }`}
                >
                  {addPointSaving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  <span>
                    {addPointSaving
                      ? 'Menyimpan...'
                      : addPointMode === 'pemulihan_bk'
                      ? 'Simpan Pemulihan Poin'
                      : 'Simpan Poin'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Fullscreen Hall of Fame & Leaderboard */}
      <HallOfFameModal
        isOpen={showHallOfFame}
        onClose={() => setShowHallOfFame(false)}
        activeTa={activeTa}
        semesters={semesters}
        allClasses={allClasses}
        monthOptions={monthOptions}
      />

      {/* Modal Pemilihan Berapa Besar Peringkat Showcase */}
      {showcaseModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl">
                  🏆
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Pilih Rentang Peringkat Showcase</h3>
                  <p className="text-xs text-slate-500">Pilih berapa besar peringkat yang ingin ditampilkan di tab Showcase</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowcaseModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Pilihan Opsi Top N */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Pilih Rentang Peringkat:</label>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { value: 'all', label: '🌟 Semua Siswa' },
                  { value: '3', label: '🥇 3 Besar' },
                  { value: '5', label: '🏆 5 Besar' },
                  { value: '10', label: '🎖️ 10 Besar' },
                  { value: '20', label: '🏅 20 Besar' },
                  { value: '50', label: '🎯 50 Besar' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setShowcaseTopChoice(opt.value)}
                    className={`py-3 px-3 rounded-2xl border text-center transition-all cursor-pointer flex items-center justify-center ${
                      showcaseTopChoice === opt.value
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    <div className="font-extrabold text-xs text-slate-900">{opt.label}</div>
                  </button>
                ))}
              </div>

              {/* Opsi Kustom Input */}
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowcaseTopChoice('custom')}
                  className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    showcaseTopChoice === 'custom'
                      ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <div className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <span>🔢</span> Kustom Input Sendiri (N Besar)
                  </div>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${showcaseTopChoice === 'custom' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                    {showcaseTopChoice === 'custom' && <span className="text-[10px]">✓</span>}
                  </span>
                </button>

                {showcaseTopChoice === 'custom' && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-1.5 animate-slide-up">
                    <label className="text-[10px] font-extrabold text-indigo-900 uppercase">Masukkan Angka Peringkat Teratas:</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Contoh: 15"
                      value={showcaseCustomInput}
                      onChange={(e) => setShowcaseCustomInput(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl bg-white border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowcaseModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetTop = showcaseTopChoice === 'custom'
                    ? (parseInt(showcaseCustomInput, 10) || 10)
                    : showcaseTopChoice
                  const url = targetTop === 'all'
                    ? '/showcase-rekap-poin'
                    : `/showcase-rekap-poin?top=${targetTop}`
                  window.open(url, '_blank')
                  setShowcaseModalOpen(false)
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Buka Showcase di Tab Baru</span>
                <span>↗</span>
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Confirm Modal Dialog */}
      {ConfirmModalComponent}

    </div>
  )
}
