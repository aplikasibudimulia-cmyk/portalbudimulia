import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { downloadWorkbook } from '../utils/fileDownloader'
import { splitAlamatAndRtRw } from '../utils/studentExcelHelper'

export default function ModalKelengkapanDataSiswa({
  isOpen,
  onClose,
  students = [],
  activeTa = null,
  masterKelas = [],
  onEditStudent
}) {
  const [selectedKelas, setSelectedKelas] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'incomplete', 'complete'
  const [searchQuery, setSearchQuery] = useState('')
  
  // State untuk Filter per Kolom (Header Dropdowns)
  const [columnFilters, setColumnFilters] = useState({})
  const [openDropdownKey, setOpenDropdownKey] = useState(null)
  const dropdownRef = useRef(null)

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdownKey(null)
      }
    }
    if (openDropdownKey) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openDropdownKey])

  // Analisis kelengkapan untuk setiap siswa aktif
  const auditedStudents = useMemo(() => {
    return (students || []).map(student => {
      const raw = student.rawStudent || student || {}
      
      const nisn = String(student.nisn || raw.nisn || '').trim()
      const nama = String(student.nama || raw.nama_lengkap || raw.nama || '').trim()
      const kelas = String(student.kelas || raw.kelas || '-').trim()
      
      // Jenis Kelamin
      const rawJk = String(raw.jenis_kelamin || raw.gender || '').trim().toUpperCase()
      const jk = rawJk.startsWith('L') ? 'L' : rawJk.startsWith('P') ? 'P' : ''

      const tempatLahir = String(raw.tempat_lahir || '').trim()
      let tanggalLahir = ''
      if (raw.tanggal_lahir) {
        try {
          tanggalLahir = new Date(raw.tanggal_lahir).toISOString().split('T')[0]
        } catch {
          tanggalLahir = String(raw.tanggal_lahir).trim()
        }
      }

      // Alamat & RT/RW
      const { jalan, rtRw } = splitAlamatAndRtRw(raw.alamat, raw.rt_rw)
      const kelurahan = String(raw.kelurahan || '').trim()
      const kecamatan = String(raw.kecamatan || '').trim()
      const kota = String(raw.kota || '').trim()

      const kelLabel = kelurahan ? (kelurahan.toLowerCase().startsWith('kel') ? kelurahan : `Kel. ${kelurahan}`) : ''
      const kecLabel = kecamatan ? (kecamatan.toLowerCase().startsWith('kec') ? kecamatan : `Kec. ${kecamatan}`) : ''

      // Rangkai Alamat Lengkap: Jalan, RT/RW, Kelurahan, Kecamatan, Kota
      const alamatParts = []
      if (jalan) alamatParts.push(jalan)
      if (rtRw && !jalan.toLowerCase().includes(rtRw.toLowerCase())) alamatParts.push(rtRw)
      if (kelLabel && !jalan.toLowerCase().includes(kelurahan.toLowerCase())) alamatParts.push(kelLabel)
      if (kecLabel && !jalan.toLowerCase().includes(kecamatan.toLowerCase())) alamatParts.push(kecLabel)
      if (kota && !jalan.toLowerCase().includes(kota.toLowerCase())) alamatParts.push(kota)
      const fullAlamat = alamatParts.join(', ')

      // No HP Siswa
      const noHp = String(raw.no_hp || raw.no_whatsapp || student.no_hp || '').trim()

      // Kontak Ortu (mendukung array multi-kontak maupun legacy)
      let ortuTag = ''
      let ortuNama = ''
      let ortuNoHp = ''
      let ortuText = ''
      if (Array.isArray(raw.kontak_ortu) && raw.kontak_ortu.length > 0) {
        const validContacts = raw.kontak_ortu.filter(k => k && (k.nomor || k.nama))
        if (validContacts.length > 0) {
          ortuText = validContacts.map(k => `${k.tag || 'Ortu'}: ${k.nama ? k.nama + ' ' : ''}(${k.nomor || '-'})`).join(' • ')
          const first = validContacts[0]
          ortuTag = first.tag || 'Ortu'
          ortuNama = first.nama || ''
          ortuNoHp = first.nomor || ''
        }
      } else if (raw.no_hp_ortu || raw.nama_ortu) {
        ortuTag = 'Ortu'
        ortuNama = raw.nama_ortu || ''
        ortuNoHp = raw.no_hp_ortu || ''
        ortuText = `${ortuNama ? ortuNama + ' ' : ''}(${ortuNoHp || '-'})`
      }

      // Foto
      const fotoUrl = student.foto_url || raw.foto_url || null

      // Evaluasi kelengkapan 9 pilar data utama
      const fields = [
        { key: 'nisn', label: 'NISN', filled: Boolean(nisn && nisn !== '-') },
        { key: 'nama', label: 'Nama Lengkap', filled: Boolean(nama && nama !== '-') },
        { key: 'jk', label: 'Jenis Kelamin (L/P)', filled: Boolean(jk) },
        { key: 'tempatLahir', label: 'Tempat Lahir', filled: Boolean(tempatLahir && tempatLahir !== '-') },
        { key: 'tanggalLahir', label: 'Tanggal Lahir', filled: Boolean(tanggalLahir && tanggalLahir !== '-') },
        { key: 'alamat', label: 'Alamat Lengkap', filled: Boolean(fullAlamat && fullAlamat !== '-') },
        { key: 'rtRw', label: 'RT/RW', filled: Boolean(rtRw && rtRw !== '-') },
        { key: 'noHp', label: 'No HP Siswa', filled: Boolean(noHp && noHp !== '-') },
        { key: 'ortu', label: 'Kontak Ortu', filled: Boolean(ortuText) },
        { key: 'foto', label: 'Foto Kartu Pelajar', filled: Boolean(fotoUrl) }
      ]

      const filledCount = fields.filter(f => f.filled).length
      const totalFields = fields.length
      const percent = Math.round((filledCount / totalFields) * 100)
      const isComplete = percent === 100
      const missingCount = totalFields - filledCount

      return {
        originalRow: student,
        nisn,
        nama,
        kelas,
        jk,
        tempatLahir,
        tanggalLahir,
        jalan,
        rtRw,
        kelurahan,
        kecamatan,
        kota,
        fullAlamat,
        noHp,
        ortuTag,
        ortuNama,
        ortuNoHp,
        ortuText,
        fotoUrl,
        fields,
        filledCount,
        totalFields,
        missingCount,
        percent,
        isComplete
      }
    })
  }, [students])

  // Filter daftar siswa (Global Filter + Per-Column Header Filter)
  const filteredStudents = useMemo(() => {
    return auditedStudents.filter(item => {
      // 1. Filter Kelas
      if (selectedKelas !== 'all' && item.kelas !== selectedKelas) {
        return false
      }

      // 2. Filter Status Global
      if (statusFilter === 'incomplete' && item.isComplete) {
        return false
      }
      if (statusFilter === 'complete' && !item.isComplete) {
        return false
      }

      // 3. Filter per Kolom (Header Filters)
      for (const [colKey, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal || filterVal === 'all') continue

        if (colKey === 'nisn') {
          if (filterVal === 'incomplete' && item.nisn) return false
          if (filterVal === 'complete' && !item.nisn) return false
        } else if (colKey === 'nama') {
          if (filterVal === 'incomplete' && item.nama) return false
          if (filterVal === 'complete' && !item.nama) return false
        } else if (colKey === 'jk') {
          if (filterVal === 'incomplete' && item.jk) return false
          if (filterVal === 'complete' && !item.jk) return false
          if (filterVal === 'L' && item.jk !== 'L') return false
          if (filterVal === 'P' && item.jk !== 'P') return false
        } else if (colKey === 'tempatLahir') {
          if (filterVal === 'incomplete' && item.tempatLahir) return false
          if (filterVal === 'complete' && !item.tempatLahir) return false
        } else if (colKey === 'tanggalLahir') {
          if (filterVal === 'incomplete' && item.tanggalLahir) return false
          if (filterVal === 'complete' && !item.tanggalLahir) return false
        } else if (colKey === 'alamat') {
          if (filterVal === 'incomplete' && item.fullAlamat) return false
          if (filterVal === 'complete' && !item.fullAlamat) return false
        } else if (colKey === 'rtRw') {
          if (filterVal === 'incomplete' && item.rtRw) return false
          if (filterVal === 'complete' && !item.rtRw) return false
        } else if (colKey === 'noHp') {
          if (filterVal === 'incomplete' && item.noHp) return false
          if (filterVal === 'complete' && !item.noHp) return false
        } else if (colKey === 'ortu') {
          if (filterVal === 'incomplete' && item.ortuText) return false
          if (filterVal === 'complete' && !item.ortuText) return false
        } else if (colKey === 'foto') {
          if (filterVal === 'incomplete' && item.fotoUrl) return false
          if (filterVal === 'complete' && !item.fotoUrl) return false
        }
      }

      // 4. Pencarian Nama / NISN
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchNama = item.nama.toLowerCase().includes(q)
        const matchNisn = item.nisn.toLowerCase().includes(q)
        const matchKelas = item.kelas.toLowerCase().includes(q)
        if (!matchNama && !matchNisn && !matchKelas) return false
      }

      return true
    })
  }, [auditedStudents, selectedKelas, statusFilter, columnFilters, searchQuery])

  // Ringkasan Statistik
  const stats = useMemo(() => {
    const total = auditedStudents.length
    const complete = auditedStudents.filter(s => s.isComplete).length
    const incomplete = total - complete
    const avgPercent = total > 0 
      ? Math.round(auditedStudents.reduce((acc, s) => acc + s.percent, 0) / total) 
      : 0
    return { total, complete, incomplete, avgPercent }
  }, [auditedStudents])

  // Hitung berapa filter kolom yang sedang aktif
  const activeColFilterCount = useMemo(() => {
    return Object.values(columnFilters).filter(v => v && v !== 'all').length
  }, [columnFilters])

  const handleSetColumnFilter = (colKey, val) => {
    setColumnFilters(prev => ({ ...prev, [colKey]: val }))
    setOpenDropdownKey(null)
  }

  const handleResetAllFilters = () => {
    setColumnFilters({})
    setStatusFilter('all')
    setSelectedKelas('all')
    setSearchQuery('')
  }

  // Export Excel Data yang Ditampilkan
  const handleExportExcel = async () => {
    if (filteredStudents.length === 0) return

    const exportRows = filteredStudents.map((s, idx) => ({
      'No': idx + 1,
      'NISN': s.nisn || '-',
      'Nama Siswa': s.nama || '-',
      'Kelas': s.kelas || '-',
      'Kelengkapan (%)': `${s.percent}%`,
      'Status': s.isComplete ? 'Lengkap' : `Belum Lengkap (${s.missingCount} data kosong)`,
      'Jenis Kelamin': s.jk || 'KOSONG',
      'Tempat Lahir': s.tempatLahir || 'KOSONG',
      'Tanggal Lahir': s.tanggalLahir || 'KOSONG',
      'Alamat Lengkap': s.fullAlamat || 'KOSONG',
      'RT/RW': s.rtRw || 'KOSONG',
      'No HP Siswa': s.noHp || 'KOSONG',
      'Kontak Orang Tua': s.ortuText || 'KOSONG',
      'Foto Siswa': s.fotoUrl ? 'ADA' : 'KOSONG'
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    ws['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 10 }, { wch: 14 },
      { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 45 },
      { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 12 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Kelengkapan Siswa')
    const taLabel = activeTa?.nama ? `_TA_${activeTa.nama.replace(/\//g, '_')}` : ''
    const fileName = `Audit_Kelengkapan_Siswa${taLabel}_${selectedKelas !== 'all' ? `Kelas_${selectedKelas}` : 'Semua_Kelas'}.xlsx`
    await downloadWorkbook(wb, fileName)
  }

  // Helper Header Filter Component
  const renderHeaderFilter = (key, title, customOptions = null, alignRight = false) => {
    const activeVal = columnFilters[key] || 'all'
    const isFiltered = activeVal !== 'all'
    const isOpen = openDropdownKey === key
    const isRightAligned = alignRight || ['rtRw', 'noHp', 'ortu', 'foto'].includes(key)

    const getBadgeLabel = () => {
      if (!isFiltered) return '▼'
      if (activeVal === 'incomplete') return '⚠️ Kosong'
      if (activeVal === 'complete') return '✅ Lengkap'
      return activeVal
    }

    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpenDropdownKey(isOpen ? null : key)
          }}
          className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer select-none text-left ${
            isFiltered 
              ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300 shadow-2xs' 
              : isOpen
              ? 'bg-indigo-100 text-indigo-900 font-bold shadow-2xs'
              : 'hover:bg-slate-200/90 text-slate-700 font-bold'
          }`}
          title={`Klik untuk filter kolom ${title} (Semua / Belum Lengkap / Sudah Lengkap)`}
        >
          <span className="text-[11px] uppercase tracking-wider">{title}</span>
          <span className={`text-[9px] px-1 py-0.5 rounded-md transition-transform font-black ${
            isFiltered
              ? 'bg-rose-200 text-rose-900'
              : 'bg-slate-200 text-slate-600 group-hover:bg-indigo-200 group-hover:text-indigo-800'
          } ${isOpen ? 'rotate-180' : ''}`}>
            {getBadgeLabel()}
          </span>
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className={`absolute top-full mt-1.5 w-52 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-40 animate-fade-in text-left text-xs font-normal normal-case ${
              isRightAligned ? 'right-0' : 'left-0'
            }`}
          >
            <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
              <span>Filter {title}</span>
              {isFiltered && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSetColumnFilter(key, 'all')
                  }}
                  className="text-[10px] text-indigo-600 hover:underline normal-case font-bold"
                >
                  Reset
                </button>
              )}
            </div>

            {customOptions ? (
              customOptions.map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSetColumnFilter(key, opt.val)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    activeVal === opt.val ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{opt.label}</span>
                  {activeVal === opt.val && <span className="font-bold text-indigo-600">✓</span>}
                </button>
              ))
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSetColumnFilter(key, 'all')}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    activeVal === 'all' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>🌐</span>
                    <span>Tampilkan Semua</span>
                  </div>
                  {activeVal === 'all' && <span className="font-bold text-indigo-600">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetColumnFilter(key, 'incomplete')}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    activeVal === 'incomplete' ? 'bg-rose-50 text-rose-700 font-bold' : 'text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Belum Lengkap (Kosong)</span>
                  </div>
                  {activeVal === 'incomplete' && <span className="font-bold text-rose-600">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetColumnFilter(key, 'complete')}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    activeVal === 'complete' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>✅</span>
                    <span>Sudah Lengkap</span>
                  </div>
                  {activeVal === 'complete' && <span className="font-bold text-emerald-600">✓</span>}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      {/* MODAL CONTAINER DENGAN LEBAR LEGA (W-[96VW] MAX-W-[1600PX]) */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-[96vw] max-w-[1600px] max-h-[95vh] flex flex-col overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl text-indigo-700 shadow-2xs shrink-0">
              📋
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-800">
                  Tabel Audit Kelengkapan Biodata Siswa
                </h3>
                {activeTa?.nama && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                    Tahun Ajaran {activeTa.nama}
                  </span>
                )}
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Data Kosong = Merah
                </span>
                {activeColFilterCount > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                    {activeColFilterCount} Filter Kolom Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengecekan data siswa aktif. Klik tombol filter (▼) pada header kolom mana saja untuk menyaring data kosong atau lengkap.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors text-lg font-bold shadow-2xs shrink-0"
            title="Tutup Modal"
          >
            &times;
          </button>
        </div>

        {/* SUMMARY STATS STRIP */}
        <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3.5 shrink-0 text-xs">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-slate-500 font-semibold block text-[11px]">Siswa Aktif ({activeTa?.nama || 'Aktif'})</span>
              <span className="text-xl font-black text-slate-800">{stats.total} <span className="text-xs font-normal text-slate-500">siswa</span></span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg">
              👥
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-emerald-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-emerald-50/30 to-white">
            <div>
              <span className="text-emerald-700 font-semibold block text-[11px]">Data Lengkap (100%)</span>
              <span className="text-xl font-black text-emerald-700">{stats.complete} <span className="text-xs font-normal text-emerald-600">siswa</span></span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg">
              ✅
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-rose-50/30 to-white">
            <div>
              <span className="text-rose-700 font-semibold block text-[11px]">Belum Lengkap</span>
              <span className="text-xl font-black text-rose-700">{stats.incomplete} <span className="text-xs font-normal text-rose-600">siswa</span></span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-lg">
              ⚠️
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-indigo-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-indigo-50/30 to-white">
            <div>
              <span className="text-indigo-700 font-semibold block text-[11px]">Rata-rata Kelengkapan</span>
              <span className="text-xl font-black text-indigo-700">{stats.avgPercent}%</span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
              {stats.avgPercent}%
            </div>
          </div>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Kelas */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-500">Kelas:</label>
              <select
                value={selectedKelas}
                onChange={e => setSelectedKelas(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              >
                <option value="all">Semua Kelas ({stats.total})</option>
                {masterKelas.map(k => (
                  <option key={k} value={k}>Kelas {k}</option>
                ))}
              </select>
            </div>

            {/* Filter Status Global */}
            <div className="flex items-center gap-1.5 ml-1">
              <label className="text-xs font-bold text-slate-500">Status:</label>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${statusFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Semua ({stats.total})
                </button>
                <button
                  onClick={() => setStatusFilter('incomplete')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${statusFilter === 'incomplete' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700 hover:text-rose-900'}`}
                >
                  <span>⚠️ Belum Lengkap</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black">{stats.incomplete}</span>
                </button>
                <button
                  onClick={() => setStatusFilter('complete')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${statusFilter === 'complete' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:text-emerald-900'}`}
                >
                  <span>✅ Lengkap 100%</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-black">{stats.complete}</span>
                </button>
              </div>
            </div>

            {/* Tombol Reset Filter Kolom jika ada filter aktif */}
            {(activeColFilterCount > 0 || statusFilter !== 'all' || selectedKelas !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                title="Reset Semua Filter dan Tampilkan Seluruh Siswa"
              >
                <span>↺</span>
                <span>Reset Filter</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari Nama / NISN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 font-bold text-xs">
                  &times;
                </button>
              )}
            </div>

            {/* Tombol Export Excel */}
            <button
              onClick={handleExportExcel}
              disabled={filteredStudents.length === 0}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
              title="Download Data Kelengkapan dalam Format Excel"
            >
              <span>📊</span>
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* TABLE CONTAINER - EXTRA WIDE LEGA WITH HORIZONTAL SCROLL & NO CLIPPING */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/95 text-slate-700 text-[11px] font-bold uppercase tracking-wider sticky top-0 z-20 border-b border-slate-200 backdrop-blur-xs">
                <tr>
                  <th className="p-3 text-center w-10 shrink-0">No</th>
                  <th className="p-3 w-32 whitespace-nowrap">
                    {renderHeaderFilter('nisn', 'NISN')}
                  </th>
                  <th className="p-3 min-w-[200px] whitespace-nowrap">
                    {renderHeaderFilter('nama', 'Nama Lengkap')}
                  </th>
                  <th className="p-3 text-center w-20 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Kelas</span>
                  </th>
                  <th className="p-3 text-center w-32 whitespace-nowrap">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Kelengkapan</span>
                  </th>

                  {/* HEADER WITH COLUMN FILTER */}
                  <th className="p-3 text-center min-w-[100px] whitespace-nowrap">
                    {renderHeaderFilter('jk', 'L/P', [
                      { val: 'all', label: 'Semua L/P' },
                      { val: 'incomplete', label: '⚠️ Kosong' },
                      { val: 'L', label: 'Laki-laki (L)' },
                      { val: 'P', label: 'Perempuan (P)' }
                    ])}
                  </th>

                  <th className="p-3 min-w-[150px] whitespace-nowrap">
                    {renderHeaderFilter('tempatLahir', 'Tempat Lahir')}
                  </th>

                  <th className="p-3 min-w-[140px] whitespace-nowrap">
                    {renderHeaderFilter('tanggalLahir', 'Tgl Lahir')}
                  </th>

                  <th className="p-3 min-w-[320px] max-w-[420px] whitespace-nowrap">
                    {renderHeaderFilter('alamat', 'Alamat Lengkap')}
                  </th>

                  {/* RT/RW DIPERLEBAR DENGAN MIN-W-[160PX] TANPA KETUTUPAN */}
                  <th className="p-3 min-w-[160px] whitespace-nowrap">
                    {renderHeaderFilter('rtRw', 'RT/RW', null, true)}
                  </th>

                  {/* NO HP SISWA */}
                  <th className="p-3 min-w-[150px] whitespace-nowrap">
                    {renderHeaderFilter('noHp', 'No HP Siswa', null, true)}
                  </th>

                  {/* KONTAK ORANG TUA */}
                  <th className="p-3 min-w-[240px] max-w-[320px] whitespace-nowrap">
                    {renderHeaderFilter('ortu', 'Kontak Ortu', null, true)}
                  </th>

                  {/* FOTO KARTU PELAJAR */}
                  <th className="p-3 text-center min-w-[95px] whitespace-nowrap">
                    {renderHeaderFilter('foto', 'Foto', null, true)}
                  </th>

                  {/* STICKY AKSI */}
                  <th className="p-3 text-center sticky right-0 bg-slate-100 z-30 w-24 border-l border-slate-200 whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.03)]">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="text-4xl">🔍</span>
                        <p className="font-semibold text-slate-600">Tidak ada data siswa aktif yang cocok dengan filter ini.</p>
                        <p className="text-xs text-slate-400">Coba klik tombol <strong>Reset Filter</strong> untuk melihat kembali seluruh siswa.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s, idx) => (
                    <tr key={s.nisn || idx} className="hover:bg-indigo-50/25 transition-colors">
                      {/* 1. NO */}
                      <td className="p-3 text-center font-mono text-slate-400 font-semibold">{idx + 1}</td>

                      {/* 2. NISN */}
                      <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {s.nisn ? (
                          s.nisn
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 3. NAMA LENGKAP */}
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                        {s.nama ? (
                          s.nama
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 4. KELAS */}
                      <td className="p-3 text-center font-bold text-slate-600 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700">
                          {s.kelas}
                        </span>
                      </td>

                      {/* 5. PERSENTASE KELENGKAPAN */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black border shadow-2xs ${
                            s.percent === 100 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : s.percent >= 70 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {s.percent === 100 ? '✅ 100%' : `${s.percent}%`}
                          </span>
                          {s.missingCount > 0 && (
                            <span className="text-[10px] text-rose-600 font-semibold">
                              {s.missingCount} kosong
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. JENIS KELAMIN */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {s.jk ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                            s.jk === 'L' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-pink-50 text-pink-700 border border-pink-200'
                          }`}>
                            {s.jk}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]" title="Jenis Kelamin Kosong">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 7. TEMPAT LAHIR */}
                      <td className="p-3 whitespace-nowrap">
                        {s.tempatLahir ? (
                          <span className="text-slate-700">{s.tempatLahir}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 8. TANGGAL LAHIR */}
                      <td className="p-3 whitespace-nowrap">
                        {s.tanggalLahir ? (
                          <span className="font-mono text-slate-700 text-[11px]">{s.tanggalLahir}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 9. ALAMAT LENGKAP - TIDAK ENTER KEBAWAH, MENGHILANG KE KANAN DENGAN ELLIPSIS */}
                      <td className="p-3 min-w-[320px] max-w-[420px]">
                        {s.fullAlamat ? (
                          <div 
                            className="whitespace-nowrap overflow-hidden text-ellipsis text-slate-700 font-medium cursor-help"
                            title={s.fullAlamat}
                          >
                            {s.fullAlamat}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 10. RT/RW - DIPERLEBAR DENGAN LEGA (MIN-W-[160PX]), TIDAK AKAN KETUTUPAN */}
                      <td className="p-3 whitespace-nowrap min-w-[160px]">
                        {s.rtRw ? (
                          <span className="font-mono text-slate-800 font-bold bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 text-xs whitespace-nowrap inline-flex items-center gap-1">
                            {s.rtRw}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px] whitespace-nowrap" title="RT/RW belum diisi">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 11. NO HP SISWA */}
                      <td className="p-3 whitespace-nowrap min-w-[150px]">
                        {s.noHp ? (
                          <span className="font-mono text-slate-700 text-xs font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block">{s.noHp}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 12. KONTAK ORANG TUA - TIDAK ENTER KEBAWAH, MENGHILANG KE KANAN DENGAN ELLIPSIS */}
                      <td className="p-3 min-w-[240px] max-w-[320px]">
                        {s.ortuText ? (
                          <div 
                            className="whitespace-nowrap overflow-hidden text-ellipsis text-slate-700 cursor-help font-medium text-xs"
                            title={s.ortuText}
                          >
                            {s.ortuText}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 13. FOTO KARTU PELAJAR */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {s.fotoUrl ? (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]" title="Foto Sudah Ada">
                            Ada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px]" title="Foto Belum Ada">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Kosong
                          </span>
                        )}
                      </td>

                      {/* 14. AKSI EDIT LANGSUNG - STICKY RIGHT */}
                      <td className="p-3 text-center sticky right-0 bg-white border-l border-slate-100 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.03)] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            onClose?.()
                            onEditStudent?.(s.originalRow)
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 mx-auto shadow-2xs"
                          title="Buka Form Edit Biodata Siswa Ini"
                        >
                          <span>✏️</span>
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
            <span>Gunakan dropdown <strong>(▼)</strong> di setiap judul kolom untuk langsung menyaring kolom yang masih berlabel merah (kosong).</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-700">Menampilkan {filteredStudents.length} dari {stats.total} siswa aktif</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-colors shadow-2xs"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
