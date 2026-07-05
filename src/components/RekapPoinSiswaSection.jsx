import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const CHART_COLORS = ['#3b82f6', '#f97316', '#ef4444', '#10b981', '#6b7280', '#8b5cf6', '#ec4899', '#14b8a6']

export default function RekapPoinSiswaSection({ session, activeTa }) {
  // Filters
  const [periode, setPeriode] = useState('bulan_ini') // hari_ini, minggu_ini, bulan_ini, semester, custom
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1) // Awal bulan ini
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [semester, setSemester] = useState(1)
  const [selectedClasses, setSelectedClasses] = useState([]) // Array of classes
  const [selectedPoinType, setSelectedPoinType] = useState('all') // all, pelanggaran, prestasi

  // Metadata / Options
  const [allClasses, setAllClasses] = useState([])
  const [semesters, setSemesters] = useState([])

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

  // Drill-down State
  const [drillLevel, setDrillLevel] = useState(1) // 1: Kelas list, 2: Siswa list, 3: Riwayat Siswa
  const [drillKelas, setDrillKelas] = useState(null)
  const [drillSiswa, setDrillSiswa] = useState(null)
  const [drillDataList, setDrillDataList] = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

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
    } catch (err) {
      console.error('Error fetching metadata:', err)
    }
  }

  // Fetch Dashboard & Drill-down Data
  const fetchData = useCallback(async () => {
    if (!activeTa?.id) return
    setLoading(true)

    try {
      // Tentukan range tanggal berdasarkan filter periode
      let start = startDate
      let end = endDate
      const today = new Date().toISOString().slice(0, 10)

      if (periode === 'hari_ini') {
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
      } else if (periode === 'semester') {
        const activeSem = semesters.find(s => s.nomor === semester)
        if (activeSem) {
          start = activeSem.tanggal_mulai
          end = activeSem.tanggal_selesai
        }
      }

      // 1. Buat Query Dasar untuk point_records
      let query = supabase.from('point_records').select('*')
        .eq('tahun_ajaran_id', activeTa.id)
        .gte('tanggal', start)
        .lte('tanggal', end)

      if (periode === 'semester') {
        query = query.eq('semester', semester)
      }

      if (selectedClasses.length > 0) {
        query = query.in('kelas', selectedClasses)
      }

      const { data: records, error: recErr } = await query
      if (recErr) throw recErr

      const filteredRecords = records || []

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

      // 3. Proses Data Tren Bulanan (Line Chart)
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

      // 5. Breakdown Kategori Pelanggaran (Pie Chart)
      // Kita perlu join point_catalog. Tapi karena catalog_id ada di point_records, kita bisa query point_catalog
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

      // 6. Peringkat Siswa Pelanggaran Terbanyak
      // Diambil langsung dari student_points yang memiliki total_poin terkecil (artinya pelanggaran terbesar)
      let siswaQuery = supabase.from('student_points')
        .select(`
          nisn,
          total_poin,
          tahap_pembinaan_aktif,
          siswa_lengkap (nama_lengkap)
        `)
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: true })

      if (periode === 'semester') {
        siswaQuery = siswaQuery.eq('semester', semester)
      }

      const { data: sPoints } = await siswaQuery.limit(10)

      // Fetch nama tahap pembinaan untuk peringkat
      const { data: stages } = await supabase.from('guidance_stages').select('id, nama_tahap')
      const stageMap = (stages || []).reduce((acc, curr) => {
        acc[curr.id] = curr.nama_tahap
        return acc
      }, {})

      // Dapatkan data kelas untuk siswa dari enrollment
      const { data: enrols } = await supabase.from('enrollment').select('nisn, kelas').eq('tahun_ajaran_id', activeTa.id)
      const enrolMap = (enrols || []).reduce((acc, curr) => {
        acc[curr.nisn] = curr.kelas
        return acc
      }, {})

      const sRank = (sPoints || []).map(sp => ({
        nisn: sp.nisn,
        nama: sp.siswa_lengkap?.nama_lengkap || 'Tidak Diketahui',
        kelas: enrolMap[sp.nisn] || '—',
        poin: sp.total_poin,
        tahap: stageMap[sp.tahap_pembinaan_aktif] || 'Normal'
      }))
      setSiswaRankData(sRank)

    } catch (err) {
      console.error('Error fetching dashboard statistics:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa, periode, startDate, endDate, semester, selectedClasses, semesters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load Drilldown Data berdasarkan drillLevel, drillKelas, dan drillSiswa
  const loadDrillData = useCallback(async () => {
    if (!activeTa?.id) return
    setDrillLoading(true)

    try {
      if (drillLevel === 1) {
        // LEVEL 1: Daftar Kelas dengan Total Pelanggaran & Prestasi
        const { data: recs } = await supabase.from('point_records')
          .select('kelas, poin_diberikan')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', semester)

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
        // LEVEL 2: Daftar Siswa di Kelas Terpilih
        const { data: sPoints } = await supabase.from('student_points')
          .select(`
            nisn,
            total_poin,
            siswa_lengkap (nama_lengkap)
          `)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', semester)

        const { data: classSiswa } = await supabase.from('enrollment')
          .select('nisn, kelas')
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('kelas', drillKelas)

        const classNisns = new Set((classSiswa || []).map(cs => cs.nisn))

        const { data: recs } = await supabase.from('point_records')
          .select('nisn, poin_diberikan')
          .eq('tahun_ajaran_id', activeTa.id)
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

        const list = (sPoints || [])
          .filter(sp => classNisns.has(sp.nisn))
          .map(sp => ({
            nisn: sp.nisn,
            nama: sp.siswa_lengkap?.nama_lengkap || 'Siswa Tanpa Nama',
            total_poin: sp.total_poin,
            pelanggaran: pelMap[sp.nisn] || 0,
            prestasi: presMap[sp.nisn] || 0
          }))
          .sort((a, b) => a.nama.localeCompare(b.nama))

        setDrillDataList(list)

      } else if (drillLevel === 3 && drillSiswa) {
        // LEVEL 3: Riwayat Lengkap point_records Siswa Terpilih
        const { data: recs, error } = await supabase.from('point_records')
          .select('*')
          .eq('tahun_ajaran_id', activeTa.id)
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
      const { data: recs } = await supabase.from('point_records')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)
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
      saveAs(new Blob([buffer]), `rekap-analitik-poin-sekolah-${today}.xlsx`)

    } catch (err) {
      alert('Gagal mengekspor laporan: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* Header + Ekspor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Rekap & Analitik Poin</h2>
          <p className="text-slate-500 text-sm mt-0.5">Analisis tren perilaku, prestasi, dan pembinaan siswa secara menyeluruh</p>
        </div>
        <button
          onClick={handleExportExcel}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl shadow-sm transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Ekspor Laporan Excel
        </button>
      </div>

      {/* Filter Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Pilihan Periode */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Periode Evaluasi</label>
            <select
              value={periode}
              onChange={e => setPeriode(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            >
              <option value="hari_ini">Hari Ini</option>
              <option value="minggu_ini">7 Hari Terakhir</option>
              <option value="bulan_ini">Bulan Ini</option>
              <option value="semester">Semester Aktif</option>
              <option value="custom">Rentang Kustom</option>
            </select>
          </div>

          {/* Rincian Kustom / Semester */}
          {periode === 'custom' && (
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Mulai</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal Selesai</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          {periode === 'semester' && (
            <div>
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

          {/* Filter Kelas (Checklist/Multi-select Sederhana) */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Filter Kelas</label>
            <div className="border border-slate-200 rounded-xl px-3 py-2 text-sm max-h-24 overflow-y-auto bg-slate-50 space-y-1">
              {allClasses.map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedClasses.includes(k)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedClasses(prev => [...prev, k])
                      } else {
                        setSelectedClasses(prev => prev.filter(c => c !== k))
                      }
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  {k}
                </label>
              ))}
            </div>
          </div>

          {/* Tombol Refresh */}
          <div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm transition-all border border-slate-200 flex items-center justify-center gap-2"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3m0 0l3 3m-3-3v8" />
              </svg>
              Segarkan Data
            </button>
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
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
        
        {/* Tren Poin Bulanan (Line Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
            Tren Fluktuasi Poin Bulanan
          </h3>
          <div className="h-72">
            {trenData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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

        {/* Peringkat Pelanggaran Kelas (Bar Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Peringkat Pelanggaran Kelas (Bobot Poin)
          </h3>
          <div className="h-72">
            {kelasRankData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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

        {/* Breakdown Kategori Pelanggaran (Pie Chart) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
            Kategori Pelanggaran Terbanyak
          </h3>
          <div className="h-72 flex flex-col sm:flex-row items-center justify-center gap-4">
            {breakdownData.length > 0 ? (
              <>
                <div className="w-1/2 h-full min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
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

        {/* Peringkat Siswa dengan Pelanggaran Terbanyak (Poin Terendah) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Ranking Siswa Butuh Pembinaan Khusus
          </h3>
          <div className="flex-1 overflow-auto max-h-[240px]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2 text-center">Kelas</th>
                  <th className="px-3 py-2 text-center">Skor Poin</th>
                  <th className="px-3 py-2 text-center">Tahap Pembinaan</th>
                </tr>
              </thead>
              <tbody>
                {siswaRankData.length > 0 ? (
                  siswaRankData.map((s, idx) => (
                    <tr key={s.nisn} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-bold text-slate-800">{s.nama}</td>
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-500">{s.kelas}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${s.poin <= 50 ? 'bg-red-100 text-red-700' : s.poin <= 75 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {s.poin}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${s.tahap !== 'Normal' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
                          {s.tahap}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">Semua siswa berada dalam kondisi aman.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Drill-down Table Section */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Eksplorasi Data Poin Sekolah</h3>
            <p className="text-slate-500 text-xs mt-0.5">Klik baris tabel untuk menelusuri detail secara mendalam</p>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <button
              onClick={() => { setDrillLevel(1); setDrillKelas(null); setDrillSiswa(null) }}
              className={`px-2.5 py-1 rounded-lg transition-colors ${drillLevel === 1 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Semua Kelas
            </button>
            {drillLevel >= 2 && (
              <>
                <span className="text-slate-400">/</span>
                <button
                  onClick={() => { setDrillLevel(2); setDrillSiswa(null) }}
                  className={`px-2.5 py-1 rounded-lg transition-colors ${drillLevel === 2 ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
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
                        <td className="px-6 py-3.5 font-mono text-xs text-slate-400">{r.kode_katalog || 'MANUAL'}</td>
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
  )
}
