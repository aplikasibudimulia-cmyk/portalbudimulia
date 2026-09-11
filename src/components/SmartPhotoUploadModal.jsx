import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

export default function SmartPhotoUploadModal({
  isOpen,
  onClose,
  students = [],
  activeTa,
  tahunAjarans = [],
  onSuccess
}) {
  const [selectedTaId, setSelectedTaId] = useState(activeTa?.id || '')
  const [selectedKelas, setSelectedKelas] = useState('')
  const [rawFiles, setRawFiles] = useState([])
  const [matchedRows, setMatchedRows] = useState([])
  const [selectedRowIndex, setSelectedRowIndex] = useState(0)
  const [zoomScale, setZoomScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 })
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentName: '' })
  const [activeFullScreenZoomUrl, setActiveFullScreenZoomUrl] = useState(null)
  const [searchStudentTerm, setSearchStudentTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'ready', 'empty', 'skipped'
  const [swapSourceIndex, setSwapSourceIndex] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef(null)
  const replaceInputRef = useRef(null)
  const replaceTargetIndexRef = useRef(null)
  const rowRefs = useRef({})

  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  // Update selectedTaId jika activeTa berubah
  useEffect(() => {
    if (activeTa?.id && !selectedTaId) {
      setSelectedTaId(activeTa.id)
    }
  }, [activeTa, selectedTaId])

  // Cari object tahun ajaran aktif terpilih
  const currentTa = useMemo(() => {
    return tahunAjarans.find(t => String(t.id) === String(selectedTaId)) || activeTa
  }, [tahunAjarans, selectedTaId, activeTa])

  // Ambil daftar kelas unik untuk tahun ajaran yang dipilih
  const availableClasses = useMemo(() => {
    const taName = currentTa?.nama
    const filtered = students.filter(s => {
      if (taName && s.tahun_ajaran && s.tahun_ajaran !== taName) return false
      return s.kelas && s.kelas !== '-' && s.kelas !== 'null'
    })
    const classes = [...new Set(filtered.map(s => s.kelas.trim()))].sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })
    return classes
  }, [students, currentTa])

  // Set default kelas jika belum ada
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedKelas) {
      const found7A = availableClasses.find(c => c.toUpperCase() === '7A' || c.toUpperCase() === '7 A')
      setSelectedKelas(found7A || availableClasses[0])
    }
  }, [availableClasses, selectedKelas])

  // Handler Drag & Panning saat foto di-zoom
  const handleMouseDown = (e) => {
    if (zoomScale <= 1) return
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: panOffset.x,
      startPanY: panOffset.y
    }
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setPanOffset({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleResetZoom = () => {
    setZoomScale(1)
    setPanOffset({ x: 0, y: 0 })
  }

  // Preset Fokus Name Tag Seragam (Dada Kiri)
  const handleFocusNameTag = () => {
    setZoomScale(3.2)
    setPanOffset({ x: 70, y: -75 })
  }

  // Fungsi cerdas mengekstrak nomor urut dari nama file (misal: "7A (1).JPG" -> 1, "7B (05).png" -> 5)
  const extractIndexFromFileName = (fileName) => {
    const base = fileName.replace(/\.[^/.]+$/, '').trim()
    const matchParen = base.match(/\((\d+)\)/)
    if (matchParen) return parseInt(matchParen[1], 10)

    const matchEnd = base.match(/[\s_-](\d+)$/)
    if (matchEnd) return parseInt(matchEnd[1], 10)

    const allNumbers = base.match(/\d+/g)
    if (allNumbers && allNumbers.length > 0) {
      const lastNum = allNumbers[allNumbers.length - 1]
      return parseInt(lastNum, 10)
    }
    return null
  }

  // Fungsi cerdas deteksi kelas dari nama file (misal "7A (1).JPG" -> "7A")
  const detectClassFromFiles = (files) => {
    if (!files || files.length === 0) return null
    for (const f of files) {
      const name = f.name.toUpperCase()
      for (const cls of availableClasses) {
        const cleanCls = cls.toUpperCase().replace(/\s+/g, '')
        const cleanName = name.replace(/\s+/g, '')
        if (cleanName.includes(cleanCls)) {
          return cls
        }
      }
    }
    return null
  }

  // Inisialisasi baris matching saat siswaInClass atau rawFiles berubah
  const buildInitialMatches = (files, studentsList) => {
    const filesByIndex = new Map()
    const unindexedFiles = []

    files.forEach(file => {
      const idx = extractIndexFromFileName(file.name)
      if (idx !== null && idx >= 1 && !filesByIndex.has(idx)) {
        filesByIndex.set(idx, file)
      } else {
        unindexedFiles.push(file)
      }
    })

    return studentsList.map((st, index) => {
      const absenNo = index + 1
      const matchedFile = filesByIndex.get(absenNo) || null
      return {
        id: st.nisn || `row-${index}`,
        absenNo,
        student: st,
        file: matchedFile,
        previewUrl: matchedFile ? URL.createObjectURL(matchedFile) : null,
        isSkipped: false
      }
    })
  }

  const handleFilesSelected = (selectedFilesList) => {
    const files = Array.from(selectedFilesList).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return

    setRawFiles(files)

    const detected = detectClassFromFiles(files)
    let targetClass = selectedKelas
    if (detected && detected !== selectedKelas) {
      setSelectedKelas(detected)
      targetClass = detected
    }

    const taName = currentTa?.nama
    const currentStudents = students
      .filter(s => {
        if (taName && s.tahun_ajaran && s.tahun_ajaran !== taName) return false
        return s.kelas && s.kelas.trim().toLowerCase() === targetClass.trim().toLowerCase()
      })
      .sort((a, b) => (a.nama_lengkap || '').localeCompare(b.nama_lengkap || ''))

    const newRows = buildInitialMatches(files, currentStudents)
    setMatchedRows(newRows)
    setSelectedRowIndex(0)
  }

  // Ketika kelas diganti manual oleh user
  const handleClassChange = (newKelas) => {
    setSelectedKelas(newKelas)
    if (rawFiles.length > 0) {
      const taName = currentTa?.nama
      const newStudents = students
        .filter(s => {
          if (taName && s.tahun_ajaran && s.tahun_ajaran !== taName) return false
          return s.kelas && s.kelas.trim().toLowerCase() === newKelas.trim().toLowerCase()
        })
        .sort((a, b) => (a.nama_lengkap || '').localeCompare(b.nama_lengkap || ''))
      setMatchedRows(buildInitialMatches(rawFiles, newStudents))
      setSelectedRowIndex(0)
    }
  }

  // Aksi: Geser Turun (Shift Down) dari baris tertentu
  const handleShiftDown = (fromIndex) => {
    setMatchedRows(prev => {
      const next = [...prev]
      let carryFile = null
      for (let i = fromIndex; i < next.length; i++) {
        const currentFile = next[i].file
        if (i === fromIndex) {
          carryFile = currentFile
          next[i] = { ...next[i], file: null, previewUrl: null, isSkipped: false }
        } else {
          const temp = currentFile
          next[i] = {
            ...next[i],
            file: carryFile,
            previewUrl: carryFile ? URL.createObjectURL(carryFile) : null
          }
          carryFile = temp
        }
      }
      return next
    })
  }

  // Aksi: Geser Naik (Shift Up)
  const handleShiftUp = (fromIndex) => {
    setMatchedRows(prev => {
      const next = [...prev]
      for (let i = fromIndex; i < next.length - 1; i++) {
        const nextFile = next[i + 1].file
        next[i] = {
          ...next[i],
          file: nextFile,
          previewUrl: nextFile ? URL.createObjectURL(nextFile) : null
        }
      }
      next[next.length - 1] = {
        ...next[next.length - 1],
        file: null,
        previewUrl: null
      }
      return next
    })
  }

  // Aksi: Lewati (Toggle Skip)
  const handleToggleSkip = (index) => {
    setMatchedRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], isSkipped: !next[index].isSkipped }
      return next
    })
  }

  // Aksi: Ganti file foto khusus baris ini
  const handleReplaceFileClick = (index) => {
    replaceTargetIndexRef.current = index
    replaceInputRef.current?.click()
  }

  const handleSingleFileReplaced = (e) => {
    const file = e.target.files?.[0]
    const targetIdx = replaceTargetIndexRef.current
    if (file && targetIdx !== null && targetIdx !== undefined) {
      setMatchedRows(prev => {
        const next = [...prev]
        next[targetIdx] = {
          ...next[targetIdx],
          file: file,
          previewUrl: URL.createObjectURL(file),
          isSkipped: false
        }
        return next
      })
      setSelectedRowIndex(targetIdx)
    }
    if (replaceInputRef.current) replaceInputRef.current.value = ''
    replaceTargetIndexRef.current = null
  }

  // Aksi: Tukar posisi foto antar 2 baris (Swap)
  const handleSwapPhotos = (idx1, idx2) => {
    if (idx1 === null || idx2 === null || idx1 === idx2) return
    setMatchedRows(prev => {
      const next = [...prev]
      const file1 = next[idx1].file
      const file2 = next[idx2].file
      next[idx1] = { ...next[idx1], file: file2, previewUrl: file2 ? URL.createObjectURL(file2) : null }
      next[idx2] = { ...next[idx2], file: file1, previewUrl: file1 ? URL.createObjectURL(file1) : null }
      return next
    })
    setSwapSourceIndex(null)
  }

  // Drag & drop handling pada area dropzone
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files)
    }
  }

  // Hitung statistik
  const readyCount = matchedRows.filter(r => r.file && !r.isSkipped).length
  const emptyCount = matchedRows.filter(r => !r.file).length
  const skippedCount = matchedRows.filter(r => r.isSkipped).length

  // Siswa yang sedang dipilih untuk panel inspeksi kiri
  const activeRow = matchedRows[selectedRowIndex] || matchedRows[0] || null

  // Filter baris pencarian & status di tabel kanan
  const displayedRows = useMemo(() => {
    return matchedRows.filter((r, idx) => {
      // Filter status
      if (filterStatus === 'ready' && (!r.file || r.isSkipped)) return false
      if (filterStatus === 'empty' && r.file) return false
      if (filterStatus === 'skipped' && !r.isSkipped) return false

      // Filter search
      if (!searchStudentTerm.trim()) return true
      const q = searchStudentTerm.toLowerCase()
      return (
        (r.student.nama_lengkap || '').toLowerCase().includes(q) ||
        String(r.student.nisn || '').includes(q) ||
        String(r.absenNo).includes(q) ||
        (r.file?.name || '').toLowerCase().includes(q)
      )
    })
  }, [matchedRows, searchStudentTerm, filterStatus])

  // Navigasi siswa berikutnya / sebelumnya
  const handleNextStudent = () => {
    if (selectedRowIndex < matchedRows.length - 1) {
      const nextIdx = selectedRowIndex + 1
      setSelectedRowIndex(nextIdx)
      rowRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const handlePrevStudent = () => {
    if (selectedRowIndex > 0) {
      const prevIdx = selectedRowIndex - 1
      setSelectedRowIndex(prevIdx)
      rowRefs.current[prevIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  // Navigasi menggunakan tombol panah keyboard (ArrowUp, ArrowDown, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen || matchedRows.length === 0) return

    const handleKeyDown = (e) => {
      // Abaikan jika fokus sedang berada di form input / textarea
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedRowIndex(prev => {
          const next = Math.min(matchedRows.length - 1, prev + 1)
          rowRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return next
        })
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedRowIndex(prev => {
          const next = Math.max(0, prev - 1)
          rowRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          return next
        })
      } else if (e.key === 'Escape' && activeFullScreenZoomUrl) {
        setActiveFullScreenZoomUrl(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, matchedRows.length, activeFullScreenZoomUrl])

  // PROSES BATCH UPLOAD KE CLOUDINARY & SUPABASE
  const handleStartUpload = async () => {
    if (readyCount === 0) {
      alert('Tidak ada foto yang siap diunggah.')
      return
    }

    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert('Konfigurasi Cloudinary belum tersedia di .env')
      return
    }

    const confirmed = window.confirm(
      `Yakin ingin mengunggah ${readyCount} foto siswa untuk Kelas ${selectedKelas}?\n` +
      `Foto akan langsung tersimpan ke profil siswa.`
    )
    if (!confirmed) return

    setIsUploading(true)
    let success = 0
    let failed = 0
    const sanitize = (str) => (str || '').replace(/\s+/g, '_')
    const folderName = `foto/${sanitize(currentTa?.nama || 'TA').replace(/\//g, '_')}`

    const rowsToUpload = matchedRows.filter(r => r.file && !r.isSkipped)

    for (let i = 0; i < rowsToUpload.length; i++) {
      const row = rowsToUpload[i]
      setUploadProgress({
        current: i + 1,
        total: rowsToUpload.length,
        currentName: `${row.student.nama_lengkap} (${row.file.name})`
      })

      const formData = new FormData()
      formData.append('file', row.file)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('public_id', `FOTO_${row.student.nisn}_${currentTa.id}`)
      formData.append('folder', folderName)

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) throw new Error('Gagal upload ke Cloudinary')
        const data = await res.json()

        const { error: sbError } = await supabase.from('foto').upsert({
          nisn: row.student.nisn,
          tahun_ajaran_id: currentTa.id,
          cloudinary_url: data.secure_url,
          cloudinary_public_id: data.public_id
        }, { onConflict: 'nisn,tahun_ajaran_id' })

        if (sbError) {
          console.error(sbError)
          failed++
        } else {
          success++
        }
      } catch (err) {
        console.error(err)
        failed++
      }
    }

    setIsUploading(false)
    setUploadProgress({ current: 0, total: 0, currentName: '' })

    alert(`🎉 Upload Foto Kelas ${selectedKelas} Selesai!\n• Berhasil: ${success}\n• Gagal: ${failed}`)
    onSuccess?.()
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-3 md:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-[96vw] h-[96vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header Modal Utama */}
        <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner border border-white/20">
              📸
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">Upload Foto Siswa Cerdas</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wider">
                  Urut Absen / Kelas
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors disabled:opacity-40 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        {/* Toolbar Konfigurasi Kelas & Pilih File */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Tahun Ajaran</label>
              <select
                value={selectedTaId}
                onChange={e => setSelectedTaId(e.target.value)}
                disabled={isUploading}
                className="text-xs font-bold bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {tahunAjarans.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.nama} {t.is_aktif ? '(Aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Pilih Kelas</label>
              <select
                value={selectedKelas}
                onChange={e => handleClassChange(e.target.value)}
                disabled={isUploading}
                className="text-xs font-black bg-indigo-50 text-indigo-950 border border-indigo-300 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                {availableClasses.length === 0 && <option value="">Tidak ada kelas</option>}
                {availableClasses.map(cls => (
                  <option key={cls} value={cls}>Kelas {cls}</option>
                ))}
              </select>
            </div>

            <div className="pt-3">
              <span className="text-xs font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                👥 Total Siswa: <strong className="text-indigo-600">{matchedRows.length}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/jpg"
              className="hidden"
              onChange={e => handleFilesSelected(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>📁</span>
              <span>{rawFiles.length > 0 ? `Ganti File (${rawFiles.length} Terpilih)` : 'Pilih File Foto Kelas'}</span>
            </button>
          </div>
        </div>

        {/* BODY UTAMA: JIKA BELUM ADA FILE, TAMPILKAN DROPZONE */}
        {rawFiles.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`m-8 flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl mb-3 shadow-inner">
              📥
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Drag & Drop File Foto Kelas {selectedKelas || ''} ke Sini
            </h3>
            <p className="text-xs text-slate-500 max-w-md mt-1">
              Atau klik di sini untuk memilih semua file foto dari fotografer (misal: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">7A (1).JPG</code> sampai <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">7A (35).JPG</code>).
            </p>
          </div>
        ) : (
          /* SPLIT-PANE VIEW: KIRI FOTO ZOOMABLE, KANAN DAFTAR SISWA */
          <div className="flex-1 flex overflow-hidden min-h-0 divide-x divide-slate-200 bg-white">
            
            {/* PANEL KIRI: FOTO INSPEKSI & ZOOM */}
            <div className="w-[460px] lg:w-[520px] xl:w-[560px] shrink-0 bg-slate-50 flex flex-col overflow-y-auto p-4 select-none">
              
              {/* Header Panel Kiri: Identitas Siswa Terpilih */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs mb-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Absen #{activeRow?.absenNo || 1} • Kelas {selectedKelas}
                  </span>
                  {activeRow?.isSkipped ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                      DILEWATI
                    </span>
                  ) : activeRow?.file ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                      ✓ SIAP UPLOAD
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">
                      KOSONG
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-black text-slate-900 mt-2 truncate" title={activeRow?.student.nama_lengkap}>
                  {activeRow?.student.nama_lengkap || 'Pilih Siswa'}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                  <span className="font-mono">NISN: {activeRow?.student.nisn || '-'}</span>
                </div>
              </div>

              {/* Area Tampilan Foto Besar dengan Fitur Zoom Interaktif & Drag Panning */}
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 rounded-2xl overflow-hidden relative shadow-inner p-2 min-h-[380px] lg:min-h-[460px]">
                {activeRow?.previewUrl ? (
                  <div 
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className={`w-full h-full flex items-center justify-center overflow-hidden relative ${
                      zoomScale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
                    }`}
                  >
                    <img
                      src={activeRow.previewUrl}
                      alt={activeRow.student.nama_lengkap}
                      style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                        transformOrigin: 'center center',
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                      }}
                      className="max-w-full max-h-[450px] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                    <div className="w-20 h-24 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center mb-2">
                      <span className="text-3xl opacity-40">👤</span>
                      <span className="text-[9px] font-bold text-slate-400 mt-1">BELUM ADA FOTO</span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-[200px]">
                      Siswa ini belum memiliki foto yang dipasangkan.
                    </p>
                  </div>
                )}

                {/* Kontrol Zoom & Tombol Fokus Name Tag */}
                {activeRow?.previewUrl && (
                  <div className="absolute bottom-3 inset-x-3 bg-slate-950/85 backdrop-blur-md rounded-xl p-1.5 flex items-center justify-between border border-white/10 shadow-lg text-white">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setZoomScale(prev => {
                            const next = Math.max(1, +(prev - 0.5).toFixed(2))
                            if (next === 1) setPanOffset({ x: 0, y: 0 })
                            return next
                          })
                        }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                        title="Perkecil"
                      >
                        ➖
                      </button>
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold font-mono cursor-pointer transition-colors"
                        title="Reset 100%"
                      >
                        {Math.round(zoomScale * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoomScale(prev => Math.min(5, +(prev + 0.5).toFixed(2)))}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
                        title="Perbesar"
                      >
                        ➕
                      </button>

                      {/* Tombol Khusus Zoom Name Tag Seragam */}
                      <button
                        type="button"
                        onClick={handleFocusNameTag}
                        className="ml-1.5 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 active:scale-95 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                        title="Zoom otomatis mengarah ke Name Tag di dada baju siswa"
                      >
                        <span>🏷️</span> Zoom Name Tag
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveFullScreenZoomUrl(activeRow.previewUrl)}
                      className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="Lihat Layar Penuh"
                    >
                      <span>🔍</span> Layar Penuh
                    </button>
                  </div>
                )}
              </div>

              {/* Detail File & Tombol Aksi Siswa Ini */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200 mt-3 shadow-2xs">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="text-[11px] font-bold text-slate-500">File Foto:</span>
                  {activeRow?.file ? (
                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 truncate max-w-[190px]">
                      {activeRow.file.name}
                    </span>
                  ) : (
                    <span className="text-amber-600 italic text-xs">Tidak ada</span>
                  )}
                </div>

                {/* Tombol Aksi Cepat Baris Ini */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleShiftDown(selectedRowIndex)}
                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Geser mundur semua foto dari nomor ini ke bawah (misal anak ini sakit)"
                  >
                    <span>⬇️</span> Geser Turun
                  </button>

                  <button
                    type="button"
                    onClick={() => handleShiftUp(selectedRowIndex)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Tarik foto dari bawah maju ke nomor ini"
                  >
                    <span>⬆️</span> Geser Naik
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReplaceFileClick(selectedRowIndex)}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Pilih foto khusus untuk siswa ini dari komputer"
                  >
                    <span>📁</span> Ganti Foto
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSkip(selectedRowIndex)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors border ${
                      activeRow?.isSkipped
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white hover:bg-rose-50 text-rose-600 border-slate-200'
                    }`}
                  >
                    {activeRow?.isSkipped ? '✕ Batal Lewati' : '✕ Lewati Foto'}
                  </button>
                </div>

                {/* Navigasi Siswa Sebelumnya / Berikutnya */}
                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handlePrevStudent}
                    disabled={selectedRowIndex === 0}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl disabled:opacity-40 cursor-pointer transition-colors flex items-center gap-1"
                  >
                    ◀ Sebelumnya
                  </button>
                  <span className="text-[11px] font-mono text-slate-400 font-bold">
                    {selectedRowIndex + 1} / {matchedRows.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextStudent}
                    disabled={selectedRowIndex === matchedRows.length - 1}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl disabled:opacity-40 cursor-pointer transition-colors flex items-center gap-1"
                  >
                    Berikutnya ▶
                  </button>
                </div>
              </div>

            </div>

            {/* PANEL KANAN: DAFTAR SISWA KELAS & TABEL MATCHING */}
            <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
              
              {/* Toolbar Pencarian & Filter Status */}
              <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterStatus === 'all'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    Semua ({matchedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('ready')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterStatus === 'ready'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    ✓ Siap ({readyCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('empty')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterStatus === 'empty'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    Kosong ({emptyCount})
                  </button>
                  {skippedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterStatus('skipped')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        filterStatus === 'skipped'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      Dilewati ({skippedCount})
                    </button>
                  )}
                  {swapSourceIndex !== null && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-xs animate-pulse">
                      Pilih siswa target untuk tukar posisi foto
                      <button onClick={() => setSwapSourceIndex(null)} className="ml-1 text-white/80 hover:text-white">✕</button>
                    </span>
                  )}
                </div>

                {/* Input Pencarian */}
                <div className="relative">
                  <input
                    type="text"
                    value={searchStudentTerm}
                    onChange={e => setSearchStudentTerm(e.target.value)}
                    placeholder="Cari siswa atau absen..."
                    className="w-48 sm:w-60 text-xs bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
                </div>
              </div>

              {/* TABEL DAFTAR SISWA (SCROLLABLE DENGAN HEADER TERKUNCI) */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs table-fixed">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3 w-14 text-center">Absen</th>
                      <th className="py-2.5 px-3 w-16 text-center">Foto</th>
                      <th className="py-2.5 px-4 w-52">Nama Lengkap & NISN</th>
                      <th className="py-2.5 px-4 w-40">File Terpasang</th>
                      <th className="py-2.5 px-3 w-28 text-center">Status</th>
                      <th className="py-2.5 px-4 w-36 text-center">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                          Tidak ada siswa yang sesuai dengan kriteria pencarian.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((row) => {
                        const originalIndex = matchedRows.findIndex(r => r.id === row.id)
                        const isSelected = selectedRowIndex === originalIndex
                        const isSwapping = swapSourceIndex === originalIndex

                        return (
                          <tr
                            key={row.id}
                            ref={el => rowRefs.current[originalIndex] = el}
                            onClick={() => setSelectedRowIndex(originalIndex)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/90 ring-2 ring-indigo-500 ring-inset'
                                : isSwapping
                                ? 'bg-amber-50 ring-2 ring-amber-400 ring-inset'
                                : row.isSkipped
                                ? 'bg-rose-50/30 opacity-60'
                                : !row.file
                                ? 'bg-amber-50/15'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            {/* 1. Absen */}
                            <td className="py-2.5 px-3 text-center font-black">
                              <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center font-mono text-xs ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-slate-100 border border-slate-300 text-slate-700'
                              }`}>
                                {row.absenNo}
                              </span>
                            </td>

                            {/* 2. Thumbnail Foto Mini */}
                            <td className="py-2 px-3 text-center">
                              {row.previewUrl ? (
                                <div className="w-10 h-12 rounded-lg overflow-hidden border border-slate-300 shadow-2xs mx-auto bg-slate-100 relative">
                                  <img
                                    src={row.previewUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-10 h-12 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-300 mx-auto bg-slate-50 text-[7px] font-bold">
                                  KOSONG
                                </div>
                              )}
                            </td>

                            {/* 3. Identitas Siswa */}
                            <td className="py-2.5 px-4 truncate">
                              <div className={`font-black truncate ${isSelected ? 'text-indigo-950 text-sm' : 'text-slate-800'}`}>
                                {row.student.nama_lengkap}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                NISN: {row.student.nisn || '-'}
                              </div>
                            </td>

                            {/* 4. Nama File */}
                            <td className="py-2.5 px-4 truncate">
                              {row.file ? (
                                <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200 inline-block truncate max-w-full">
                                  {row.file.name}
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-600 italic">Belum ada file</span>
                              )}
                            </td>

                            {/* 5. Status */}
                            <td className="py-2.5 px-3 text-center">
                              {row.isSkipped ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  Dilewati
                                </span>
                              ) : row.file ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ Cocok
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  Kosong
                                </span>
                              )}
                            </td>

                            {/* 6. Aksi Cepat */}
                            <td className="py-2.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleShiftDown(originalIndex)}
                                  title="Geser turun semua foto dari nomor ini"
                                  className="p-1 bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded-md text-xs cursor-pointer"
                                >
                                  ⬇️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (swapSourceIndex === null) {
                                      setSwapSourceIndex(originalIndex)
                                    } else {
                                      handleSwapPhotos(swapSourceIndex, originalIndex)
                                    }
                                  }}
                                  title="Tukar posisi foto dengan siswa lain"
                                  className={`p-1 rounded-md border text-xs cursor-pointer ${
                                    isSwapping ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
                                  }`}
                                >
                                  🔄
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReplaceFileClick(originalIndex)}
                                  title="Ganti foto siswa ini"
                                  className="p-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs cursor-pointer"
                                >
                                  📁
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSkip(originalIndex)}
                                  title={row.isSkipped ? 'Batal lewati' : 'Lewati siswa ini'}
                                  className={`p-1 rounded-md border text-xs cursor-pointer ${
                                    row.isSkipped ? 'bg-rose-600 text-white' : 'bg-white hover:bg-rose-50 text-rose-600 border-slate-200'
                                  }`}
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>

          </div>
        )}

        {/* Input Tersembunyi untuk Ganti File Satuan */}
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
          onChange={handleSingleFileReplaced}
        />

        {/* Progress Bar Jika Sedang Upload */}
        {isUploading && (
          <div className="p-4 bg-indigo-950 text-white border-t border-indigo-900 shrink-0">
            <div className="flex items-center justify-between mb-2 text-xs">
              <span className="font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                Mengunggah: <span className="font-mono text-indigo-200">{uploadProgress.currentName}</span>
              </span>
              <span className="font-extrabold text-amber-300">
                {uploadProgress.current} / {uploadProgress.total} (
                {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-indigo-900/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Siap diunggah: <strong className="text-indigo-600">{readyCount}</strong> dari {matchedRows.length} siswa
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Tutup / Batal
            </button>
            <button
              onClick={handleStartUpload}
              disabled={isUploading || readyCount === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>🚀</span>
              <span>{isUploading ? 'Sedang Mengunggah...' : `Mulai Upload (${readyCount} Foto Siswa)`}</span>
            </button>
          </div>
        </div>

      </div>

      {/* Modal Zoom Full Screen Terpisah yang Aman dari Header Tabular */}
      {activeFullScreenZoomUrl && createPortal(
        <div
          onClick={() => setActiveFullScreenZoomUrl(null)}
          className="fixed inset-0 z-[200000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 cursor-zoom-out animate-fade-in"
        >
          <div className="relative max-w-2xl max-h-[90vh] flex flex-col items-center">
            <img
              src={activeFullScreenZoomUrl}
              alt="Foto Penuh"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-2 border-white/20"
            />
            <button
              onClick={() => setActiveFullScreenZoomUrl(null)}
              className="absolute -top-4 -right-4 w-9 h-9 rounded-full bg-white text-slate-900 font-black flex items-center justify-center hover:bg-slate-200 shadow-xl cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  )
}
