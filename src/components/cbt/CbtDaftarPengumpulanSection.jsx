import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
// ExcelJS di-lazy-load saat export (hemat ~920KB dari initial load)
import { saveAs } from 'file-saver'
import CbtDetailPengerjaanSiswaModal from './CbtDetailPengerjaanSiswaModal'
import { useToast } from '../../utils/useToast'
import { useConfirm } from '../../utils/useConfirm'
import { renderFormattedMath } from './CbtSoalRenderer'
import CbtLiveProctorModal from './CbtLiveProctorModal'

// Helper format label tipe butir soal
const formatTipeSoal = (tipe) => {
  const map = {
    'pilihan_ganda': 'Pilihan Ganda',
    'pilihan_ganda_kompleks': 'Pilihan Ganda Kompleks',
    'menjodohkan': 'Menjodohkan',
    'isian_singkat': 'Isian Singkat',
    'uraian': 'Uraian'
  }
  return map[tipe] || tipe || 'Pilihan Ganda'
}

// Helper badge status tingkat kesukaran
const getDifficultyBadge = (status) => {
  if (status === 'Mudah') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }
  if (status === 'Sedang') {
    return 'bg-amber-50 text-amber-700 border border-amber-200'
  }
  return 'bg-rose-50 text-rose-700 border border-rose-200'
}

// Komponen Grafik Batang Distribusi Nilai Murid
function ScoreDistributionChart({ bins }) {
  const maxCount = Math.max(...bins.map(b => b.count), 5)
  const width = 360
  const height = 240
  const padding = { top: 25, right: 15, bottom: 45, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const yTicks = [0, Math.round(maxCount * 0.25), Math.round(maxCount * 0.5), Math.round(maxCount * 0.75), maxCount]
  const uniqueYTicks = [...new Set(yTicks)].sort((a, b) => a - b)
  const step = chartWidth / bins.length
  const barWidth = step * 0.65

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-700">
          <span className="w-3 h-3 rounded-xs bg-indigo-600 inline-block"></span>
          <span>Distribusi Nilai Murid</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="indigoBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid lines */}
        {uniqueYTicks.map((tick, i) => {
          const y = padding.top + chartHeight - (tick / maxCount) * chartHeight
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray={tick === 0 ? 'none' : '3 3'}
                strokeWidth="1.5"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Y-axis Label */}
        <text
          x={-(padding.top + chartHeight / 2)}
          y={12}
          transform="rotate(-90)"
          textAnchor="middle"
          className="text-[9px] fill-slate-400 font-bold uppercase tracking-wider"
        >
          Jumlah Murid
        </text>

        {/* Bars */}
        {bins.map((bin, i) => {
          const barHeight = maxCount > 0 ? (bin.count / maxCount) * chartHeight : 0
          const x = padding.left + i * step + (step - barWidth) / 2
          const y = padding.top + chartHeight - barHeight

          return (
            <g key={i} className="group">
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                fill="url(#indigoBarGrad)"
                rx="4"
                className="transition-all duration-300 hover:opacity-85"
              />
              {/* Count label on top of bar */}
              {bin.count > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-indigo-700"
                >
                  {bin.count}
                </text>
              )}
              {/* X Axis Label */}
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + 18}
                textAnchor="middle"
                className="text-[10px] font-medium fill-slate-500"
              >
                {bin.label}
              </text>
            </g>
          )
        })}

        {/* X-axis Label */}
        <text
          x={padding.left + chartWidth / 2}
          y={height - 5}
          textAnchor="middle"
          className="text-[9px] fill-slate-400 font-bold uppercase tracking-wider"
        >
          Nilai Murid
        </text>
      </svg>
    </div>
  )
}

export default function CbtDaftarPengumpulanSection({
  sesi: propSesi,
  currentSesi,
  sesiList,
  onSelectSesi,
  onBack,
  session
}) {
  const sesi = propSesi || currentSesi
  const { showToast, ToastComponent } = useToast()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const [viewMode, setViewMode] = useState('list') // 'list' | 'analisis'
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'selesai' | 'mengerjakan' | 'belum'
  const [loading, setLoading] = useState(true)
  const [pesertaList, setPesertaList] = useState([])
  const [allSiswaTarget, setAllSiswaTarget] = useState([]) // Seluruh siswa di kelas target

  // Filter
  const [selectedKelas, setSelectedKelas] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')

  // Modal Detail Pengerjaan Siswa
  const [selectedPesertaId, setSelectedPesertaId] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Modal Live Proctoring (Kamera Selfie On-Demand)
  const [liveProctorTarget, setLiveProctorTarget] = useState(null)

  // Item Analysis Data
  const [analisisData, setAnalisisData] = useState([])
  const [loadingAnalisis, setLoadingAnalisis] = useState(false)

  // Fetch data peserta & siswa
  useEffect(() => {
    if (!sesi?.id) return
    fetchData()
  }, [sesi?.id])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Ambil seluruh peserta ujian di sesi ini
      const { data: pData, error: pErr } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('sesi_id', sesi.id)

      if (pErr) throw pErr

      // 2. Ambil seluruh siswa aktif di kelas target
      const availableKelas = sesi.kelas_ids || []
      let sData = []
      if (availableKelas.length > 0) {
        const { data } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .in('kelas', availableKelas)
          .eq('is_aktif', true)
          .order('kelas', { ascending: true })
          .order('nama_lengkap', { ascending: true })

        // Pastikan hanya 1 record per NISN
        const seenNisns = new Set()
        sData = (data || []).filter(s => {
          if (!s.nisn || seenNisns.has(s.nisn)) return false
          seenNisns.add(s.nisn)
          return true
        })
        setAllSiswaTarget(sData)
      }

      // Map nama siswa berdasarkan NISN
      const siswaMapByNisn = {}
      sData.forEach(s => {
        siswaMapByNisn[s.nisn] = s
      })

      // Lengkapi data peserta dengan nama lengkap & kelas asli
      const enrichedPeserta = (pData || []).map(p => {
        const s = siswaMapByNisn[p.siswa_nisn]
        return {
          ...p,
          siswa_nama: p.siswa_nama || s?.nama_lengkap || p.siswa_nisn,
          kelas: p.kelas || s?.kelas || ''
        }
      })

      // Urutkan sesuai nama siswa (urutan absen)
      enrichedPeserta.sort((a, b) => (a.siswa_nama || '').localeCompare(b.siswa_nama || ''))
      setPesertaList(enrichedPeserta)

      // Auto-heal nilai: Jika ada peserta yang sudah selesai namun nilai_akhir masih NULL (misal akibat paksa kumpul sebelumnya)
      const needScoring = enrichedPeserta.filter(
        p => (p.status === 'selesai' || !!p.waktu_selesai) && (p.nilai_akhir === null || p.nilai_akhir === undefined)
      )
      if (needScoring.length > 0) {
        Promise.all(needScoring.map(async p => {
          try {
            const { data: score, error: scErr } = await supabase.rpc('cbt_internal_score_submission', { p_peserta_id: p.id })
            if (!scErr && score !== null && score !== undefined) {
              p.nilai_akhir = score
            }
          } catch (e) {
            console.warn('Auto scoring error for peserta:', p.id, e)
          }
        })).then(() => {
          setPesertaList([...enrichedPeserta])
        })
      }
    } catch (err) {
      console.error('Gagal memuat daftar pengumpulan:', err)
      showToast('Gagal memuat data: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // List kelas yang tersedia dari sesi
  const availableClasses = useMemo(() => {
    return sesi?.kelas_ids || []
  }, [sesi])

  // Map peserta by nisn
  const pesertaByNisn = useMemo(() => {
    const map = {}
    pesertaList.forEach(p => {
      map[p.siswa_nisn] = p
    })
    return map
  }, [pesertaList])

  // Filtered list siswa sudah dikumpulkan (submitted) untuk modal detail & batch share
  const submittedList = useMemo(() => {
    return pesertaList.filter(p => p.status === 'selesai' || !!p.waktu_selesai)
  }, [pesertaList])

  // Unified list seluruh siswa (target kelas + peserta)
  const unifiedStudentList = useMemo(() => {
    const list = []
    const seenNisns = new Set()

    allSiswaTarget.forEach(s => {
      const p = pesertaByNisn[s.nisn]
      seenNisns.add(s.nisn)
      const isSelesai = p?.status === 'selesai' || !!p?.waktu_selesai
      const isMengerjakan = p?.status === 'sedang_mengerjakan' && !p?.waktu_selesai
      const status = isSelesai ? 'selesai' : isMengerjakan ? 'mengerjakan' : 'belum'

      list.push({
        nisn: s.nisn,
        nama: s.nama_lengkap || p?.siswa_nama || s.nisn,
        kelas: s.kelas || p?.kelas || '-',
        status,
        isSelesai,
        isMengerjakan,
        isBelumMulai: !isSelesai && !isMengerjakan,
        peserta: p || null
      })
    })

    pesertaList.forEach(p => {
      if (!seenNisns.has(p.siswa_nisn)) {
        seenNisns.add(p.siswa_nisn)
        const isSelesai = p.status === 'selesai' || !!p.waktu_selesai
        const isMengerjakan = p.status === 'sedang_mengerjakan' && !p.waktu_selesai
        const status = isSelesai ? 'selesai' : isMengerjakan ? 'mengerjakan' : 'belum'

        list.push({
          nisn: p.siswa_nisn,
          nama: p.siswa_nama || p.siswa_nisn,
          kelas: p.kelas || '-',
          status,
          isSelesai,
          isMengerjakan,
          isBelumMulai: !isSelesai && !isMengerjakan,
          peserta: p
        })
      }
    })

    list.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))
    return list
  }, [allSiswaTarget, pesertaList, pesertaByNisn])

  // Filtered by selectedKelas untuk tab & tampilan
  const classFilteredList = useMemo(() => {
    return unifiedStudentList.filter(s => {
      if (selectedKelas !== 'all' && s.kelas !== selectedKelas) return false
      return true
    })
  }, [unifiedStudentList, selectedKelas])

  // Hitungan tab berdasarkan filter kelas aktif
  const tabCounts = useMemo(() => {
    let semua = classFilteredList.length
    let selesai = 0
    let mengerjakan = 0
    let belum = 0
    let belumDinilai = 0

    classFilteredList.forEach(s => {
      if (s.isSelesai) {
        selesai++
        if (s.peserta?.nilai_akhir === null || s.peserta?.nilai_akhir === undefined) {
          belumDinilai++
        }
      } else if (s.isMengerjakan) {
        mengerjakan++
      } else {
        belum++
      }
    })

    return { semua, selesai, mengerjakan, belum, belumDinilai }
  }, [classFilteredList])

  // List akhir yang ditampilkan sesuai tab dan search keyword
  const displayList = useMemo(() => {
    return classFilteredList.filter(s => {
      if (activeTab === 'selesai' && !s.isSelesai) return false
      if (activeTab === 'mengerjakan' && !s.isMengerjakan) return false
      if (activeTab === 'belum' && !s.isBelumMulai) return false

      if (searchKeyword.trim() !== '') {
        const q = searchKeyword.toLowerCase()
        return s.nama.toLowerCase().includes(q) || s.nisn.includes(q)
      }
      return true
    })
  }, [classFilteredList, activeTab, searchKeyword])

  // Counter status global untuk metrik sesi
  const counts = useMemo(() => {
    const totalAssigned = unifiedStudentList.length
    const totalSubmitted = pesertaList.filter(p => p.status === 'selesai' || !!p.waktu_selesai).length
    const selesaiCount = pesertaList.filter(p => (p.status === 'selesai' || !!p.waktu_selesai) && p.nilai_akhir !== null).length
    const belumDinilaiCount = totalSubmitted - selesaiCount
    return {
      totalAssigned,
      totalSubmitted,
      selesaiCount,
      belumDinilaiCount
    }
  }, [unifiedStudentList, pesertaList])

  // Nilai siswa yang sudah dinilai untuk analisis distribusi
  const scores = useMemo(() => {
    return (pesertaList || [])
      .filter(p => (p.status === 'selesai' || p.waktu_selesai) && p.nilai_akhir !== null && p.nilai_akhir !== undefined)
      .map(p => Number(p.nilai_akhir))
  }, [pesertaList])

  // Statistik nilai murid & binning grafik batang
  const scoreStats = useMemo(() => {
    if (scores.length === 0) {
      return {
        rataRata: '0.00',
        tertinggi: 0,
        terendah: 0,
        bins: [
          { label: '0-20', count: 0 },
          { label: '21-40', count: 0 },
          { label: '41-60', count: 0 },
          { label: '61-80', count: 0 },
          { label: '81-100', count: 0 }
        ]
      }
    }
    const sum = scores.reduce((a, b) => a + b, 0)
    const rataRata = (sum / scores.length).toFixed(2)
    const tertinggi = Math.max(...scores)
    const terendah = Math.min(...scores)

    const bins = [
      { label: '0-20', count: 0 },
      { label: '21-40', count: 0 },
      { label: '41-60', count: 0 },
      { label: '61-80', count: 0 },
      { label: '81-100', count: 0 }
    ]

    scores.forEach(s => {
      if (s <= 20) bins[0].count++
      else if (s <= 40) bins[1].count++
      else if (s <= 60) bins[2].count++
      else if (s <= 80) bins[3].count++
      else bins[4].count++
    })

    return { rataRata, tertinggi, terendah, bins }
  }, [scores])

  // Jumlah butir soal per tingkat kesukaran
  const difficultyCounts = useMemo(() => {
    let mudah = 0
    let sedang = 0
    let sulit = 0
    analisisData.forEach(item => {
      if (item.statusKesukaran === 'Mudah') mudah++
      else if (item.statusKesukaran === 'Sedang') sedang++
      else if (item.statusKesukaran === 'Sulit') sulit++
    })
    return { mudah, sedang, sulit }
  }, [analisisData])

  // Helper format durasi
  const formatDuration = (start, end) => {
    if (!start) return '-'
    const s = new Date(start).getTime()
    const e = end ? new Date(end).getTime() : Date.now()
    const diffSec = Math.max(0, Math.floor((e - s) / 1000))
    const m = Math.floor(diffSec / 60)
    const sec = diffSec % 60
    return `${m}m ${sec}s`
  }

  // Helper format tanggal
  const formatDate = (isoString) => {
    if (!isoString) return '-'
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Buka detail pengerjaan siswa
  const handleOpenDetail = (pesertaId) => {
    setSelectedPesertaId(pesertaId)
    setIsDetailOpen(true)
  }

  // Update nilai peserta di local state setelah guru mengoreksi
  const handlePesertaUpdated = (pesertaId, newScore) => {
    setPesertaList(prev => prev.map(p => {
      if (p.id === pesertaId) {
        return { ...p, nilai_akhir: newScore }
      }
      return p
    }))
  }

  // Hitung ulang nilai lembar ujian siswa via RPC internal
  const handleRecalculateScore = async (pesertaId, e) => {
    e?.stopPropagation()
    try {
      showToast('Menghitung ulang nilai lembar ujian...', 'info')
      const { data: score, error } = await supabase.rpc('cbt_internal_score_submission', { p_peserta_id: pesertaId })
      if (error) throw error
      handlePesertaUpdated(pesertaId, score)
      showToast(`Nilai berhasil dihitung: ${score}`, 'success')
    } catch (err) {
      showToast('Gagal menghitung nilai: ' + err.message, 'error')
    }
  }

  // Bagikan hasil ujian ke satu siswa (toggle is_nilai_shared)
  const handleToggleShareResult = async (peserta, e) => {
    e?.stopPropagation()
    const nextState = !peserta.is_nilai_shared
    try {
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({ is_nilai_shared: nextState })
        .eq('id', peserta.id)

      if (error) throw error

      setPesertaList(prev => prev.map(p => p.id === peserta.id ? { ...p, is_nilai_shared: nextState } : p))
      showToast(nextState ? `Hasil ujian dibagikan ke ${peserta.siswa_nama}!` : `Hasil ujian disembunyikan dari ${peserta.siswa_nama}.`, 'success')
    } catch (err) {
      showToast('Gagal mengubah status bagikan: ' + err.message, 'error')
    }
  }

  // Bagikan hasil ujian massal ke semua siswa yang sudah mengumpulkan
  const handleShareAllResults = async () => {
    const submittedPesertaIds = submittedList.map(p => p.id)
    if (submittedPesertaIds.length === 0) {
      showToast('Belum ada siswa yang mengumpulkan ujian.', 'warning')
      return
    }

    const confirmed = await requestConfirm({
      title: 'Bagikan Hasil ke Semua Siswa?',
      message: `Rilis nilai dan hasil ujian ke seluruh ${submittedPesertaIds.length} siswa yang sudah mengumpulkan? Siswa akan dapat melihat nilainya di portal masing-masing.`,
      confirmLabel: 'Ya, Bagikan Semua',
      confirmColor: 'indigo'
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({ is_nilai_shared: true })
        .in('id', submittedPesertaIds)

      if (error) throw error

      setPesertaList(prev => prev.map(p => submittedPesertaIds.includes(p.id) ? { ...p, is_nilai_shared: true } : p))
      showToast(`Berhasil membagikan hasil ke ${submittedPesertaIds.length} siswa!`, 'success')
    } catch (err) {
      showToast('Gagal membagikan hasil massal: ' + err.message, 'error')
    }
  }

  // Ekspor Rekap Nilai ke Excel (.xlsx) - Request No 6
  const handleExportExcel = async () => {
    try {
      showToast('Menyiapkan berkas Excel rekap nilai...', 'info')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'eBudiMulia CBT'
      const sheet = workbook.addWorksheet('Rekap Nilai CBT')

      // Title & School Header
      sheet.mergeCells('A1:J1')
      sheet.getCell('A1').value = 'SMP BUDI MULIA JAKARTA - REKAPITULASI PENILAIAN CBT'
      sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FF1E293B' } }
      sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }

      sheet.mergeCells('A2:J2')
      sheet.getCell('A2').value = `Judul: ${sesi.judul} | Mata Pelajaran: ${sesi.mapel || '-'} | KKM/KKTP: ${sesi.kkm || 75}`
      sheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF64748B' } }
      sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

      sheet.addRow([]) // blank row

      // Table Header
      const headerRow = sheet.addRow([
        'No',
        'NISN',
        'Nama Lengkap Siswa',
        'Kelas',
        'Status Ujian',
        'Waktu Selesai',
        'Durasi',
        'Aksi Keluar (Strike)',
        'Nilai Akhir',
        'Status Ketuntasan'
      ])

      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' } // Indigo-600
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
      })

      // Table Data
      allSiswaTarget.forEach((s, idx) => {
        const p = pesertaByNisn[s.nisn]
        const isSelesai = p?.status === 'selesai' || !!p?.waktu_selesai
        const nilai = p?.nilai_akhir !== null && p?.nilai_akhir !== undefined ? Number(p.nilai_akhir) : null
        const kkm = Number(sesi.kkm || 75)
        let tuntasLabel = '-'
        if (nilai !== null) {
          tuntasLabel = nilai >= kkm ? 'TUNTAS' : 'BELUM TUNTAS'
        }

        const dataRow = sheet.addRow([
          idx + 1,
          s.nisn,
          s.nama_lengkap,
          s.kelas || p?.kelas || '-',
          isSelesai ? 'Selesai' : (p?.status === 'sedang_mengerjakan' ? 'Mengerjakan' : 'Belum Mulai'),
          p?.waktu_selesai ? formatDate(p.waktu_selesai) : '-',
          p?.waktu_mulai ? formatDuration(p.waktu_mulai, p.waktu_selesai) : '-',
          (p?.total_pelanggaran ?? p?.strike_count ?? 0),
          nilai !== null ? nilai : '-',
          tuntasLabel
        ])

        dataRow.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
          if (colNumber === 1 || colNumber === 4 || colNumber === 5 || colNumber === 7 || colNumber === 8 || colNumber === 9 || colNumber === 10) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
          }
          if (colNumber === 9 && nilai !== null) {
            cell.font = { bold: true }
          }
          if (colNumber === 10) {
            if (tuntasLabel === 'TUNTAS') {
              cell.font = { bold: true, color: { argb: 'FF059669' } } // Emerald
            } else if (tuntasLabel === 'BELUM TUNTAS') {
              cell.font = { bold: true, color: { argb: 'FFDC2626' } } // Red
            }
          }
        })
      })

      // Column widths
      sheet.columns = [
        { width: 6 },
        { width: 15 },
        { width: 32 },
        { width: 10 },
        { width: 16 },
        { width: 22 },
        { width: 14 },
        { width: 20 },
        { width: 14 },
        { width: 18 }
      ]

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const safeTitle = (sesi.judul || 'CBT').replace(/[^a-zA-Z0-9_-]/g, '_')
      saveAs(blob, `Rekap_Nilai_${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      showToast('Berkas Excel berhasil diunduh!', 'success')
    } catch (err) {
      console.error('Gagal ekspor excel:', err)
      showToast('Gagal membuat berkas Excel: ' + err.message, 'error')
    }
  }

  // Buka Analisis Soal (Dedicated Full View)
  const handleOpenAnalisis = async () => {
    setViewMode('analisis')
    setLoadingAnalisis(true)
    try {
      // Ambil seluruh soal
      const { data: qData, error: qErr } = await supabase
        .from('cbt_soal')
        .select('id, nomor_urut, tipe_soal, pertanyaan, bobot')
        .eq('bank_soal_id', sesi.bank_soal_id)
        .order('nomor_urut', { ascending: true })

      if (qErr) throw qErr

      const soalIds = (qData || []).map(q => q.id)
      if (soalIds.length === 0) {
        setAnalisisData([])
        return
      }

      // Ambil seluruh jawaban untuk sesi ini dari siswa yang sudah mengumpulkan
      const submittedPesertaIds = (pesertaList || [])
        .filter(p => p.status === 'selesai' || p.waktu_selesai)
        .map(p => p.id)

      if (submittedPesertaIds.length === 0) {
        setAnalisisData((qData || []).map(q => ({
          ...q,
          totalJawab: 0,
          benarCount: 0,
          salahCount: 0,
          persentaseBenar: 0,
          difficultyIndex: '0.00',
          statusKesukaran: 'Sedang'
        })))
        return
      }

      const { data: jData, error: jErr } = await supabase
        .from('cbt_jawaban_siswa')
        .select('id, soal_id, peserta_id, jawaban_terpilih')
        .in('peserta_id', submittedPesertaIds)

      if (jErr) throw jErr

      const jIds = (jData || []).map(j => j.id)

      // Ambil penilaian jawaban
      let penMap = {}
      if (jIds.length > 0) {
        const { data: penData } = await supabase
          .from('cbt_penilaian_jawaban')
          .select('jawaban_id, is_correct, skor')
          .in('jawaban_id', jIds)

        ;(penData || []).forEach(p => {
          penMap[p.jawaban_id] = p
        })
      }

      // Hitung statistik per butir soal
      const totalSiswaSelesai = submittedPesertaIds.length
      const analysis = (qData || []).map(soal => {
        const answersForQ = (jData || []).filter(j => j.soal_id === soal.id)
        const totalJawab = answersForQ.length
        let benarCount = 0

        answersForQ.forEach(j => {
          const pen = penMap[j.id]
          if (pen && (pen.is_correct || Number(pen.skor) >= Number(soal.bobot || 1))) {
            benarCount++
          }
        })

        // Indeks kesukaran: P = benar / total
        const denominator = totalJawab > 0 ? totalJawab : totalSiswaSelesai
        const ratio = denominator > 0 ? benarCount / denominator : 0
        const persentaseBenar = Math.round(ratio * 100)
        const difficultyIndex = ratio.toFixed(2)

        let statusKesukaran = 'Sedang'
        if (ratio > 0.70) statusKesukaran = 'Mudah'
        else if (ratio < 0.30) statusKesukaran = 'Sulit'

        return {
          ...soal,
          totalJawab: denominator,
          benarCount,
          salahCount: Math.max(0, denominator - benarCount),
          persentaseBenar,
          difficultyIndex,
          statusKesukaran
        }
      })

      setAnalisisData(analysis)
    } catch (err) {
      console.error('Gagal memuat analisis soal:', err)
      showToast('Gagal analisis butir soal: ' + err.message, 'error')
    } finally {
      setLoadingAnalisis(false)
    }
  }

  // Ekspor Matriks Analisis Soal ke Excel (.xlsx)
  const handleExportAnalisisMatrix = async () => {
    if (analisisData.length === 0) {
      showToast('Tidak ada data analisis butir soal untuk diekspor.', 'warning')
      return
    }

    try {
      showToast('Menyiapkan berkas Excel Analisis Butir Soal...', 'info')
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'eBudiMulia CBT'
      const sheet = workbook.addWorksheet('Analisis Butir Soal')

      // Title & School Header
      sheet.mergeCells('A1:G1')
      sheet.getCell('A1').value = 'SMP BUDI MULIA JAKARTA - ANALISIS BUTIR SOAL (ITEM ANALYSIS)'
      sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FF1E293B' } }
      sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }

      sheet.mergeCells('A2:G2')
      sheet.getCell('A2').value = `Judul: ${sesi?.judul || '-'} | Mapel: ${sesi?.mapel || '-'} | KKM: ${sesi?.kkm || 75}`
      sheet.getCell('A2').font = { size: 11, bold: true, color: { argb: 'FF4338CA' } }
      sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' }

      sheet.addRow([]) // Baris kosong

      // Header Kolom Tabel
      const headerRow = sheet.addRow([
        'No.',
        'Soal',
        'Tipe',
        'Total Murid Menjawab',
        'Total Murid Benar',
        'Indeks Kesukaran',
        'Tingkat Kesulitan'
      ])
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      // Isi Data Soal
      analisisData.forEach(item => {
        const cleanPrompt = (item.pertanyaan || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim()
        const row = sheet.addRow([
          item.nomor_urut,
          cleanPrompt,
          formatTipeSoal(item.tipe_soal),
          item.totalJawab,
          item.benarCount,
          Number(item.difficultyIndex || 0),
          item.statusKesukaran
        ])
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
        row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' }
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'top' }
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'top' }
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'top' }
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'top' }
      })

      sheet.columns = [
        { width: 8 },
        { width: 55 },
        { width: 24 },
        { width: 20 },
        { width: 18 },
        { width: 18 },
        { width: 18 }
      ]

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const safeTitle = (sesi?.judul || 'Analisis_Soal').replace(/[^a-zA-Z0-9_-]/g, '_')
      saveAs(blob, `Analisis_Soal_${safeTitle}.xlsx`)
      showToast('Matriks analisis soal berhasil diunduh ke Excel!', 'success')
    } catch (err) {
      console.error('Gagal ekspor matriks:', err)
      showToast('Gagal mengekspor: ' + err.message, 'error')
    }
  }

  // Jika sedang membuka rincian pengerjaan siswa, tampilkan sebagai halaman baru penuh (bukan pop up)
  if (isDetailOpen && selectedPesertaId) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <CbtDetailPengerjaanSiswaModal
          sesi={sesi}
          initialPesertaId={selectedPesertaId}
          allPeserta={submittedList}
          isFullPage={true}
          onBack={() => setIsDetailOpen(false)}
          onClose={() => setIsDetailOpen(false)}
          onPesertaUpdated={handlePesertaUpdated}
        />
        {ConfirmModalComponent}
        {ToastComponent}
      </div>
    )
  }

  // Jika sedang membuka Analisis Soal, tampilkan sebagai halaman penuh terdedikasi sesuai referensi pengguna
  if (viewMode === 'analisis') {
    return (
      <div className="space-y-6 animate-fadeIn">
        {ToastComponent}
        {ConfirmModalComponent}

        {/* TOP HEADER & BREADCRUMB */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all flex items-center justify-center shrink-0"
              title="Kembali ke Daftar Pengumpulan Murid"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-0.5">
                <span>Penilaian</span>
                <span>/</span>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="hover:text-indigo-600 transition-colors"
                >
                  Daftar Pengumpulan Murid
                </button>
                <span>/</span>
                <span className="text-indigo-600 font-bold">Analisis Soal</span>
              </div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  {sesi?.judul || 'Sesi Ujian'}
                </h2>
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
                  {sesi?.mapel || 'Mapel'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportAnalisisMatrix}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-2 active:scale-95"
              title="Unduh rekapitulasi matriks analisis butir soal ke Excel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Ekspor Matriks</span>
            </button>
          </div>
        </div>

        {/* MAIN ANALYSIS LAYOUT (12 COLUMNS) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SECTION (8 COLUMNS) */}
          <div className="xl:col-span-8 space-y-5">
            
            {/* Header Card Dokumen Sesi */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-800 tracking-tight truncate uppercase">
                  {sesi?.judul || 'Analisis Butir Soal'}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Mata Pelajaran: <strong className="text-slate-700">{sesi?.mapel || '-'}</strong> • Target Kelas: <strong className="text-slate-700">{(sesi?.kelas_ids || []).join(', ') || 'Semua Kelas'}</strong>
                </p>
              </div>
            </div>

            {/* Top Stat Cards: Jumlah Murid, Jumlah Dinilai, Komponen Tingkat Kesulitan */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* Jumlah Murid */}
              <div className="sm:col-span-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-center text-center">
                <div className="text-2xl sm:text-3xl font-black text-indigo-600">
                  {allSiswaTarget.length || counts.totalAssigned || 0}
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Jumlah Murid
                </div>
              </div>

              {/* Jumlah Murid Dinilai */}
              <div className="sm:col-span-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-center text-center">
                <div className="text-2xl sm:text-3xl font-black text-emerald-600">
                  {counts.totalSubmitted || 0}
                </div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  Jumlah Murid Dinilai
                </div>
              </div>

              {/* Komponen Tingkat Kesulitan */}
              <div className="sm:col-span-6 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                  <span className="text-slate-400">☁️</span>
                  <span>Komponen Tingkat Kesulitan</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {/* Mudah */}
                  <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-xl p-2 text-center">
                    <div className="text-lg font-black text-emerald-700">{difficultyCounts.mudah}</div>
                    <div className="text-[11px] font-bold text-emerald-800">Mudah</div>
                  </div>
                  {/* Sedang */}
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-2 text-center">
                    <div className="text-lg font-black text-amber-700">{difficultyCounts.sedang}</div>
                    <div className="text-[11px] font-bold text-amber-800">Sedang</div>
                  </div>
                  {/* Sulit */}
                  <div className="bg-rose-50/90 border border-rose-200/80 rounded-xl p-2 text-center">
                    <div className="text-lg font-black text-rose-700">{difficultyCounts.sulit}</div>
                    <div className="text-[11px] font-bold text-rose-800">Sulit</div>
                  </div>
                </div>
              </div>
            </div>

            {/* TABEL BUTIR SOAL */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5 text-center w-12">No.</th>
                      <th className="py-3 px-4 min-w-[280px]">Soal</th>
                      <th className="py-3 px-3 text-center w-36">Tipe</th>
                      <th className="py-3 px-3 text-center w-36">
                        <span className="inline-flex items-center gap-1" title="Jumlah siswa yang menjawab benar pada butir ini">
                          <span>Total Murid Benar</span>
                          <span className="text-slate-400">ⓘ</span>
                        </span>
                      </th>
                      <th className="py-3 px-4 text-center w-36">Tingkat Kesulitan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingAnalisis ? (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="font-semibold text-xs">Memuat analisis butir soal...</span>
                          </div>
                        </td>
                      </tr>
                    ) : analisisData.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-slate-400">
                          Belum ada data pengerjaan untuk dianalisis pada sesi ini.
                        </td>
                      </tr>
                    ) : (
                      analisisData.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-3 text-center font-bold text-slate-700 align-top">
                            {item.nomor_urut}
                          </td>
                          <td className="py-3.5 px-4 text-slate-800 align-top">
                            <div
                              className="font-medium text-xs leading-relaxed max-w-xl overflow-x-auto"
                              dangerouslySetInnerHTML={{ __html: renderFormattedMath(item.pertanyaan) }}
                            />
                          </td>
                          <td className="py-3.5 px-3 text-center align-top">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200">
                              {formatTipeSoal(item.tipe_soal)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-center font-extrabold text-slate-800 align-top text-xs">
                            {item.benarCount}
                            <span className="text-[10px] font-normal text-slate-400 block mt-0.5">
                              {item.persentaseBenar}% benar
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center align-top">
                            <div className="inline-flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-slate-700">
                                {item.difficultyIndex}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${getDifficultyBadge(item.statusKesukaran)}`}>
                                {item.statusKesukaran}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (4 COLUMNS): Distribusi Nilai Murid */}
          <div className="xl:col-span-4 space-y-5">
            
            {/* Card Distribusi Nilai Murid */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <span className="text-base">📊</span>
                <h3 className="text-sm font-extrabold text-slate-800">
                  Distribusi Nilai Murid
                </h3>
              </div>

              {/* 3 Metrik Nilai: Rata-Rata, Tertinggi, Terendah */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-center">
                <div>
                  <div className="text-base sm:text-lg font-black text-indigo-600">
                    {scoreStats.rataRata}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    Nilai Rata-Rata
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-lg font-black text-emerald-600">
                    {scoreStats.tertinggi}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    Nilai Tertinggi
                  </div>
                </div>
                <div>
                  <div className="text-base sm:text-lg font-black text-rose-600">
                    {scoreStats.terendah}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    Nilai Terendah
                  </div>
                </div>
              </div>

              {/* Grafik Batang SVG */}
              <ScoreDistributionChart bins={scoreStats.bins} />
            </div>

            {/* Pedoman Indeks Kesukaran */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 text-xs space-y-2.5">
              <div className="font-bold text-slate-700 flex items-center gap-1.5">
                <span>💡</span>
                <span>Pedoman Indeks Kesukaran</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-500">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-700">&gt; 0.70</span>
                  <span className="font-medium text-slate-600">Mudah (Mayoritas benar)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-700">0.30 - 0.70</span>
                  <span className="font-medium text-slate-600">Sedang (Daya pembeda optimal)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-700">&lt; 0.30</span>
                  <span className="font-medium text-slate-600">Sulit (Perlu pendalaman)</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {ToastComponent}
      {ConfirmModalComponent}

      {/* TOP HEADER & BREADCRUMB */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="Kembali ke Manajemen Sesi Ujian"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mb-0.5">
              <span>Dashboard</span>
              <span>/</span>
              <span>Sesi Ujian</span>
              <span>/</span>
              <span className="text-indigo-600 font-bold">Daftar Pengumpulan Murid</span>
            </div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">{sesi?.judul || 'Sesi Ujian'}</h2>
              <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
                {sesi?.mapel || 'Mapel'}
              </span>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS (TOP RIGHT) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleShareAllResults}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-2 active:scale-95"
            title="Rilis nilai ke seluruh siswa yang sudah mengumpulkan"
          >
            <span>📢</span>
            <span>Bagikan hasil ke semua</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAnalisis}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-300 font-bold rounded-xl text-xs shadow-2xs transition-all flex items-center gap-2"
          >
            <span>📊</span>
            <span>Analisis Soal</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-2 active:scale-95"
            title="Unduh rekapitulasi nilai kelas ke format Microsoft Excel"
          >
            <span>📥</span>
            <span>Unduh Rekap Excel</span>
          </button>
        </div>
      </div>

      {/* TABS & FILTERS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* TAB SWITCHER */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 pt-3 gap-y-3">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 overflow-x-auto">
            {/* Tab: Semua */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`pb-3 px-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
                activeTab === 'all'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span>Semua</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {tabCounts.semua}
              </span>
            </button>

            {/* Tab: Sudah Selesai */}
            <button
              type="button"
              onClick={() => setActiveTab('selesai')}
              className={`pb-3 px-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
                activeTab === 'selesai'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span>Sudah Selesai</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {tabCounts.selesai}
              </span>
            </button>

            {/* Tab: Sedang Mengerjakan */}
            <button
              type="button"
              onClick={() => setActiveTab('mengerjakan')}
              className={`pb-3 px-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
                activeTab === 'mengerjakan'
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Sedang Mengerjakan</span>
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'mengerjakan' ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'
              }`}>
                {tabCounts.mengerjakan}
              </span>
            </button>

            {/* Tab: Belum Mulai */}
            <button
              type="button"
              onClick={() => setActiveTab('belum')}
              className={`pb-3 px-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all shrink-0 ${
                activeTab === 'belum'
                  ? 'border-slate-600 text-slate-700'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span>Belum Mulai</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'belum' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {tabCounts.belum}
              </span>
            </button>
          </div>

          {/* STATUS BADGES (RIGHT) */}
          <div className="hidden sm:flex items-center gap-2.5 text-xs font-bold pb-2">
            {tabCounts.belumDinilai > 0 && (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                Belum Dinilai: <strong>{tabCounts.belumDinilai}</strong>
              </span>
            )}
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
              Selesai Dinilai: <strong>{tabCounts.selesai - tabCounts.belumDinilai}</strong>
            </span>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Kelas */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Kelas:</span>
              <select
                value={selectedKelas}
                onChange={(e) => setSelectedKelas(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-hidden focus:border-indigo-500 shadow-2xs"
              >
                <option value="all">Semua Kelas</option>
                {availableClasses.map(c => (
                  <option key={c} value={c}>Kelas {c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Cari siswa / NISN..."
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-7 py-1.5 text-xs text-slate-700 font-medium outline-hidden focus:border-indigo-500 shadow-2xs"
            />
            <span className="absolute left-3 top-2 text-slate-400 text-xs">🔍</span>
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* STUDENT LIST CONTENT */}
        <div className="p-4 sm:p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-xs font-semibold">Memuat daftar siswa...</p>
            </div>
          ) : displayList.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <span className="text-4xl block mb-2">
                {activeTab === 'selesai' ? '📭' : activeTab === 'mengerjakan' ? '⏳' : activeTab === 'belum' ? '🎉' : '👥'}
              </span>
              <h4 className="text-sm font-bold text-slate-700 mb-1">
                {searchKeyword ? 'Tidak Ada Hasil' :
                 activeTab === 'selesai' ? 'Belum Ada yang Selesai' :
                 activeTab === 'mengerjakan' ? 'Tidak Ada yang Sedang Mengerjakan' :
                 activeTab === 'belum' ? 'Semua Siswa Telah Mulai / Selesai' :
                 'Tidak Ada Siswa Ditemukan'}
              </h4>
              <p className="text-xs text-slate-400">
                {searchKeyword ? `Tidak ada siswa yang cocok dengan "${searchKeyword}".` :
                 activeTab === 'selesai' ? 'Belum ada siswa yang mengumpulkan ujian pada sesi ini.' :
                 activeTab === 'mengerjakan' ? 'Saat ini tidak ada siswa yang berstatus sedang aktif mengerjakan.' :
                 activeTab === 'belum' ? 'Semua siswa yang ditugaskan telah mulai atau mengumpulkan ujian.' :
                 'Tidak ada data siswa untuk kelas yang dipilih.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayList.map((item, idx) => {
                const p = item.peserta

                if (item.isSelesai) {
                  return (
                    <div
                      key={item.nisn}
                      onClick={() => p?.id && handleOpenDetail(p.id)}
                      className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
                    >
                      {/* Left: Number & Student Info */}
                      <div className="flex items-center gap-3.5">
                        <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-xl border border-indigo-100 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="text-sm font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors">
                              {item.nama}
                            </h4>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">
                              Selesai
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                              Kelas {item.kelas}
                            </span>
                            {(p?.total_pelanggaran ?? p?.strike_count ?? 0) > 0 ? (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                                <span>⚠️</span> {(p?.total_pelanggaran ?? p?.strike_count)}x Pindah Layar
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                                <span>🛡️</span> 0 Pelanggaran
                              </span>
                            )}
                            {p?.is_nilai_shared && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                                <span>✓</span> Nilai Dibagikan
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 font-medium">
                            <span>⏱️ Durasi: <strong className="text-slate-700">{formatDuration(p?.waktu_mulai, p?.waktu_selesai)}</strong></span>
                            <span>•</span>
                            <span>📅 Dikirim: <strong className="text-slate-700">{formatDate(p?.waktu_selesai)}</strong></span>
                            <span>•</span>
                            <span>📱 {p?.device_info || 'Perangkat Belum Terdata'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Bagikan Hasil & Score Badge */}
                      <div className="flex items-center gap-3 shrink-0">
                        {p && (
                          <button
                            type="button"
                            onClick={(e) => handleToggleShareResult(p, e)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border flex items-center gap-1.5 shadow-2xs ${
                              p.is_nilai_shared
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            }`}
                            title="Bagikan atau sembunyikan nilai untuk siswa ini"
                          >
                            <span>📢</span>
                            <span>{p.is_nilai_shared ? 'Telah Dibagikan' : 'Bagikan Hasil'}</span>
                          </button>
                        )}

                        {/* Skor Badge */}
                        <button
                          type="button"
                          onClick={(e) => p?.id && handleRecalculateScore(p.id, e)}
                          className={`w-14 h-10 rounded-xl border flex items-center justify-center font-black text-base shadow-2xs transition-all active:scale-95 cursor-pointer ${
                            p?.nilai_akhir !== null && p?.nilai_akhir !== undefined
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/70'
                              : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 animate-pulse'
                          }`}
                          title="Klik untuk menghitung ulang nilai otomatis lembar ujian"
                        >
                          {p?.nilai_akhir !== null && p?.nilai_akhir !== undefined ? p.nilai_akhir : '🔄 -'}
                        </button>
                      </div>
                    </div>
                  )
                }

                if (item.isMengerjakan) {
                  return (
                    <div
                      key={item.nisn}
                      onClick={() => p?.id && handleOpenDetail(p.id)}
                      className={`bg-white border border-amber-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 transition-all shadow-2xs ${
                        p?.id ? 'cursor-pointer hover:border-amber-400 hover:bg-amber-50/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="text-sm font-extrabold text-slate-800">
                              {item.nama}
                            </h4>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Sedang Mengerjakan
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                              Kelas {item.kelas}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 font-medium">
                            <span>⏱️ Mulai: <strong className="text-slate-700">{formatDate(p?.waktu_mulai)}</strong></span>
                            <span>•</span>
                            <span>📱 {p?.device_info || 'Perangkat Belum Terdata'}</span>
                            {(p?.total_pelanggaran ?? p?.strike_count ?? 0) > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-rose-600 font-bold">⚠️ {(p?.total_pelanggaran ?? p?.strike_count)}x Keluar Layar</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLiveProctorTarget({ ...item, peserta: p })
                          }}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                          title="Pantau Kamera Siswa secara Langsung (On-Demand)"
                        >
                          <span>📹</span>
                          <span>Pantau Live</span>
                        </button>
                        <span className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                          Sedang Mengerjakan
                        </span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={item.nisn}
                    className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-4 transition-all opacity-85"
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="text-xs font-bold text-slate-400 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-bold text-slate-700">
                            {item.nama}
                          </h4>
                          <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                            Kelas {item.kelas}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                          <span>NISN: {item.nisn}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="px-3 py-1.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-xs font-semibold">
                        Belum Mulai
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Live Proctoring (Kamera Selfie Siswa On-Demand) */}
      <CbtLiveProctorModal
        isOpen={!!liveProctorTarget}
        onClose={() => setLiveProctorTarget(null)}
        sesiId={sesi?.id}
        student={liveProctorTarget}
      />
    </div>
  )
}
