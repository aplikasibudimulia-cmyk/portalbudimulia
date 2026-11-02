import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { downloadFile } from '../utils/fileDownloader'

export default function AdminJadwalPelajaranSection({ session, activeTa }) {
  // Tabs & Views
  const [activeTab, setActiveTab] = useState('grid') // 'grid', 'beban', 'catatan_ekskul', 'import'
  const [activeSemester, setActiveSemester] = useState(1)
  const [schoolActiveSemester, setSchoolActiveSemester] = useState(1)
  const [activeHari, setActiveHari] = useState('Senin')
  
  // Grade Filter & View Mode
  const [gradeFilter, setGradeFilter] = useState('ALL') // 'ALL', '7', '8', '9'
  const [adminViewMode, setAdminViewMode] = useState('grid') // 'grid' (Matrix) or 'card' (Mobile-Friendly)
  const [selectedCardClass, setSelectedCardClass] = useState('7A')
  const [cellInputValues, setCellInputValues] = useState({})

  // Master Data
  const [gurus, setGurus] = useState([])
  const [mapels, setMapels] = useState([])
  const [classes, setClasses] = useState([])
  
  // Jadwal & Pendukung States
  const [slots, setSlots] = useState([])
  const [jadwals, setJadwals] = useState([])
  const [bebanMengajar, setBebanMengajar] = useState([])
  const [piketList, setPiketList] = useState([])
  const [catatanList, setCatatanList] = useState([])
  const [ekskulList, setEkskulList] = useState([])
  
  // Loadings & Savers
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Guru & Kode Reference Sidebar Panel States
  const [showGuruRef, setShowGuruRef] = useState(false)
  const [guruRefSearch, setGuruRefSearch] = useState('')
  
  // Modal States
  const [showCellModal, setShowCellModal] = useState(false)
  const [selectedCell, setSelectedCell] = useState(null)
  const [cellForm, setCellForm] = useState({
    id: '',
    guru_id: '',
    mata_pelajaran_id: '',
    is_blok: false,
    keterangan_blok: ''
  })
  const [cellGuruSearch, setCellGuruSearch] = useState('')
  const [cellMapelSearch, setCellMapelSearch] = useState('')

  // State Inisialisasi Jam Pelajaran Awal Harian
  const [initForm, setInitForm] = useState({
    start_time: '06:30',
    total_jam: 9,
    start_jam_ke: 0,
    total_istirahat: 2,
    durasi_pelajaran: 40,
    durasi_istirahat_1: 30,
    durasi_istirahat_2: 20
  })
  
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false)
  const [showCopySemModal, setShowCopySemModal] = useState(false)
  const [copySourceSem, setCopySourceSem] = useState(1)
  
  // Setup Jam Modal
  const [showJamModal, setShowJamModal] = useState(false)
  const [jamForm, setJamForm] = useState({
    id: '',
    tipe: 'pelajaran',
    label: '',
    jam_ke: '',
    durasi_menit: 40,
    keterangan_blok: '',
    waktu_mulai: '06:30'
  })

  // Guru Detail untuk Setup Beban
  const [selectedGuruBeban, setSelectedGuruBeban] = useState(null)
  const [guruBebanMapels, setGuruBebanMapels] = useState([])
  const [bebanForm, setBebanForm] = useState({
    mata_pelajaran_id: '',
    jam_per_minggu: 2,
    maks_jam_per_hari: 2,
    kode_guru: ''
  })

  const [guruKodeInput, setGuruKodeInput] = useState('')

  // Piket & Catatan States
  const [piketFormGuruId, setPiketFormGuruId] = useState('')
  const [newCatatan, setNewCatatan] = useState('')
  const [newEkskul, setNewEkskul] = useState({
    nama: '',
    hari: 'Senin',
    waktu: '14:30 - 15:30',
    pembina: ''
  })

  const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']

  const calculateSlotTimes = (slotList, defaultStartTime = '06:30') => {
    let currentHour = parseInt(defaultStartTime.split(':')[0])
    let currentMin = parseInt(defaultStartTime.split(':')[1])

    return slotList.map(slot => {
      const hh = String(currentHour).padStart(2, '0')
      const mm = String(currentMin).padStart(2, '0')
      const startTimeStr = `${hh}:${mm}:00`

      currentMin += slot.durasi_menit
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60)
        currentMin = currentMin % 60
      }
      currentHour = currentHour % 24

      return {
        ...slot,
        waktu_mulai: startTimeStr
      }
    })
  }

  const reorderJamKe = (slotList, startJamKe = 0) => {
    let currentJamKe = parseInt(startJamKe)

    return slotList.map((slot, index) => {
      const updated = { ...slot, urutan: index }
      if (slot.tipe === 'pelajaran') {
        updated.jam_ke = currentJamKe
        updated.label = String(currentJamKe)
        currentJamKe++
      } else if (slot.tipe === 'persiapan' || (index === 0 && slot.tipe !== 'istirahat')) {
        updated.jam_ke = 0
        updated.label = '0'
      } else {
        updated.jam_ke = null
        updated.label = '-'
      }
      return updated
    })
  }

  const formatJamDisplay = (slot, index) => {
    if (!slot) return '-'
    // 1. Break / Istirahat
    if (
      slot.tipe === 'istirahat' ||
      slot.isBreak ||
      String(slot.label || '').toUpperCase().includes('ISTIRAHAT') ||
      String(slot.keterangan_blok || '').toUpperCase().includes('ISTIRAHAT')
    ) {
      return '-'
    }
    // 2. Slot 0 (Persiapan / awal hari)
    if (index === 0 || slot.urutan === 0 || slot.tipe === 'persiapan' || slot.jam_ke === 0 || slot.label === '0') {
      return '0'
    }
    // 3. Explicit numeric jam_ke
    if (slot.jam_ke !== null && slot.jam_ke !== undefined && !isNaN(Number(slot.jam_ke))) {
      return String(slot.jam_ke)
    }
    // 4. Roman numerals
    const romanMap = {
      '0': '0', 'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
      'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10', 'XI': '11', 'XII': '12'
    }
    const cleanLabel = String(slot.label || '').trim().toUpperCase()
    if (romanMap[cleanLabel] !== undefined) {
      return romanMap[cleanLabel]
    }
    if (cleanLabel && !isNaN(parseInt(cleanLabel)) && cleanLabel.length <= 2) {
      return String(parseInt(cleanLabel))
    }
    // 5. Non-lesson slots should never show text in Jam column
    if (slot.tipe !== 'pelajaran') {
      return '-'
    }
    return String(index)
  }

  // Helper: Dapatkan semua mapel dan kode untuk seorang guru (termasuk sub-kode seperti 11.1 untuk PSBM)
  const getTeacherSubjectsWithCodes = (guru) => {
    if (!guru) return []

    // 1. Kumpulkan semua mapel yang diajar guru ini dari bebanMengajar dan guru_mapel
    const subjectMap = new Map()

    // Dari bebanMengajar
    const teacherBebans = bebanMengajar.filter(b => b.guru_id === guru.id)
    teacherBebans.forEach(b => {
      if (b.mata_pelajaran_id && !subjectMap.has(b.mata_pelajaran_id)) {
        const mObj = mapels.find(m => m.id === b.mata_pelajaran_id) || b.mata_pelajaran
        subjectMap.set(b.mata_pelajaran_id, {
          mata_pelajaran_id: b.mata_pelajaran_id,
          nama: mObj?.nama || 'Mapel',
          singkatan: mObj?.singkatan || mObj?.nama || 'Mapel',
          explicitCode: b.kode_guru ? String(b.kode_guru).trim() : null
        })
      } else if (b.mata_pelajaran_id && b.kode_guru) {
        const existing = subjectMap.get(b.mata_pelajaran_id)
        if (existing && !existing.explicitCode) {
          existing.explicitCode = String(b.kode_guru).trim()
        }
      }
    })

    // Dari guru_mapel
    if (guru.guru_mapel && Array.isArray(guru.guru_mapel)) {
      guru.guru_mapel.forEach(gm => {
        if (gm.mata_pelajaran_id && !subjectMap.has(gm.mata_pelajaran_id)) {
          const mObj = mapels.find(m => m.id === gm.mata_pelajaran_id) || gm.mata_pelajaran
          subjectMap.set(gm.mata_pelajaran_id, {
            mata_pelajaran_id: gm.mata_pelajaran_id,
            nama: mObj?.nama || 'Mapel',
            singkatan: mObj?.singkatan || mObj?.nama || 'Mapel',
            explicitCode: null
          })
        }
      })
    }

    const subjects = Array.from(subjectMap.values())
    if (subjects.length === 0) return []

    // Urutkan subject: Mapel reguler/nasional (IPS, IPA, Mat, B.Indo, B.Ingg, PPKn, Agama, PJOK, dsb) di depan (index 0 / base code),
    // Mapel muatan lokal/keterampilan/PSBM di belakang (sub-code seperti 11.1)
    const isSecondary = (s) => {
      const text = `${s.singkatan || ''} ${s.nama || ''}`.toUpperCase()
      return text.includes('PSBM') || text.includes('PRAKARYA') || text.includes('MULOK') || 
             text.includes('MANDARIN') || text.includes('PLUS') || text.includes('SENI') ||
             text.includes('KETERAMPILAN') || text.includes('ELEKTIF')
    }

    subjects.sort((a, b) => {
      const baseCode = String(guru.kode || '').trim().toLowerCase()
      if (a.explicitCode && a.explicitCode.toLowerCase() === baseCode && (!b.explicitCode || b.explicitCode.toLowerCase() !== baseCode)) return -1
      if (b.explicitCode && b.explicitCode.toLowerCase() === baseCode && (!a.explicitCode || a.explicitCode.toLowerCase() !== baseCode)) return 1
      
      const secA = isSecondary(a) ? 1 : 0
      const secB = isSecondary(b) ? 1 : 0
      return secA - secB
    })

    const baseCode = String(guru.kode || '').trim()
    
    return subjects.map((sub, idx) => {
      let code = sub.explicitCode
      if (!code) {
        if (idx === 0) {
          code = baseCode || String(idx + 1)
        } else {
          code = baseCode ? `${baseCode}.${idx}` : String(idx + 1)
        }
      }
      return {
        ...sub,
        code
      }
    })
  }

  // Helper untuk mendapatkan kode guru yang ditampilkan pada sel jadwal
  const getScheduleDisplayCode = (sched) => {
    if (!sched || !sched.guru_id) return ''
    
    // 1. Cek explicit kode_guru di bebanMengajar untuk guru & mapel ini
    const matchBeban = bebanMengajar.find(b => 
      b.guru_id === sched.guru_id && 
      b.mata_pelajaran_id === sched.mata_pelajaran_id &&
      b.kode_guru
    )
    if (matchBeban?.kode_guru) {
      return String(matchBeban.kode_guru).trim()
    }

    // 2. Cari dari daftar guru dan kalkulasi kode mapelnya
    const g = gurus.find(guru => guru.id === sched.guru_id) || sched.guru
    if (g) {
      const subjects = getTeacherSubjectsWithCodes(g)
      const matchSub = subjects.find(s => s.mata_pelajaran_id === sched.mata_pelajaran_id)
      if (matchSub?.code) {
        return matchSub.code
      }
      if (g.kode) return String(g.kode).trim()
    }

    return ''
  }

  const resolveTeacherCode = (code, cls) => {
    if (!code || !code.trim()) return null
    const cleanCode = code.trim().toLowerCase()

    // 1. Match bebanMengajar specifically for this class with exact kode_guru
    const bebanForClass = bebanMengajar.find(b => 
      b.kelas === cls && 
      String(b.kode_guru || '').trim().toLowerCase() === cleanCode
    )
    if (bebanForClass) {
      return {
        guru_id: bebanForClass.guru_id,
        mata_pelajaran_id: bebanForClass.mata_pelajaran_id
      }
    }

    // 2. Match bebanMengajar across any class with exact kode_guru
    const anyBeban = bebanMengajar.find(b => 
      String(b.kode_guru || '').trim().toLowerCase() === cleanCode
    )
    if (anyBeban) {
      return {
        guru_id: anyBeban.guru_id,
        mata_pelajaran_id: anyBeban.mata_pelajaran_id
      }
    }

    // 3. Sub-code format like "11.1", "11.2", "14.1"
    if (cleanCode.includes('.')) {
      const parts = cleanCode.split('.')
      const basePart = parts[0]
      const subIdx = parseInt(parts[1], 10)

      // Cari guru dengan kode utama basePart
      const teacher = gurus.find(g => 
        String(g.kode || '').trim().toLowerCase() === basePart ||
        bebanMengajar.some(b => b.guru_id === g.id && String(b.kode_guru || '').trim().toLowerCase() === basePart)
      )

      if (teacher) {
        const subjects = getTeacherSubjectsWithCodes(teacher)
        // a. Cocokkan langsung berdasarkan code
        const matchByCode = subjects.find(s => s.code.toLowerCase() === cleanCode)
        if (matchByCode) {
          return {
            guru_id: teacher.id,
            mata_pelajaran_id: matchByCode.mata_pelajaran_id
          }
        }
        // b. Cocokkan berdasarkan index subIdx
        if (!isNaN(subIdx) && subjects[subIdx]) {
          return {
            guru_id: teacher.id,
            mata_pelajaran_id: subjects[subIdx].mata_pelajaran_id
          }
        }
        // c. Jika subIdx === 1, cari mapel muatan khusus / PSBM
        const psbmSub = subjects.find(s => 
          (s.singkatan || '').toUpperCase().includes('PSBM') || 
          (s.nama || '').toUpperCase().includes('PSBM')
        )
        if (psbmSub) {
          return {
            guru_id: teacher.id,
            mata_pelajaran_id: psbmSub.mata_pelajaran_id
          }
        }
        // d. Fallback: jika ada subject lain selain primary
        if (subjects.length > 1) {
          return {
            guru_id: teacher.id,
            mata_pelajaran_id: subjects[1].mata_pelajaran_id
          }
        }
      }
    }

    // 4. Base code match in gurus (misal "11", "7", "2")
    const matchedGuru = gurus.find(g => String(g.kode || '').trim().toLowerCase() === cleanCode)
    if (matchedGuru) {
      const subjects = getTeacherSubjectsWithCodes(matchedGuru)
      // Cocokkan mapel yang kodenya persis cleanCode (biasanya subject[0] / primary)
      const primary = subjects.find(s => s.code.toLowerCase() === cleanCode) || subjects[0]
      if (primary) {
        return {
          guru_id: matchedGuru.id,
          mata_pelajaran_id: primary.mata_pelajaran_id
        }
      }
      const gm = matchedGuru.guru_mapel?.find(m => m.kelas === cls)
      return {
        guru_id: matchedGuru.id,
        mata_pelajaran_id: gm?.mata_pelajaran_id || matchedGuru.guru_mapel?.[0]?.mata_pelajaran_id || null
      }
    }

    // 5. Fallback match guru?.kode in bebanMengajar (jika kode_guru kosong tapi guru.kode ada)
    const anyBebanGuruKode = bebanMengajar.find(b => 
      String(b.guru?.kode || '').trim().toLowerCase() === cleanCode
    )
    if (anyBebanGuruKode) {
      const g = gurus.find(guru => guru.id === anyBebanGuruKode.guru_id)
      if (g) {
        const subjects = getTeacherSubjectsWithCodes(g)
        const primary = subjects.find(s => s.code.toLowerCase() === cleanCode) || subjects[0]
        if (primary) {
          return {
            guru_id: g.id,
            mata_pelajaran_id: primary.mata_pelajaran_id
          }
        }
      }
      return {
        guru_id: anyBebanGuruKode.guru_id,
        mata_pelajaran_id: anyBebanGuruKode.mata_pelajaran_id
      }
    }

    return null
  }

  const handleInlineCodeBlur = async (slot, cls, rawValue) => {
    const code = (rawValue || '').trim()
    const cellKey = `${slot.id}_${cls}`
    const sched = jadwals.find(j => j.kelas === cls && j.jam_ke === slot.jam_ke)
    
    const currentCode = getScheduleDisplayCode(sched)

    if (code === currentCode) return

    if (!code) {
      if (sched) {
        await handleDeleteCell(sched.id)
        setCellInputValues(prev => {
          const next = { ...prev }
          delete next[cellKey]
          return next
        })
      }
      return
    }

    const resolved = resolveTeacherCode(code, cls)
    if (!resolved || !resolved.guru_id) {
      alert(`Kode guru "${code}" tidak ditemukan dalam daftar guru atau beban mengajar.`)
      setCellInputValues(prev => ({ ...prev, [cellKey]: currentCode }))
      return
    }

    try {
      const startTime = slot.waktu_mulai?.slice(0, 5) || '07:00'
      const [h, m] = startTime.split(':').map(Number)
      let endM = (m || 0) + (slot.durasi_menit || 40)
      let endH = (h || 0) + Math.floor(endM / 60)
      endM = endM % 60
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`

      const payload = {
        tahun_ajaran_id: activeTa?.id,
        semester: activeSemester,
        hari: activeHari,
        kelas: cls,
        jam_ke: slot.jam_ke,
        waktu_mulai: slot.waktu_mulai,
        waktu_selesai: endTime,
        guru_id: resolved.guru_id,
        mata_pelajaran_id: resolved.mata_pelajaran_id || null
      }

      if (sched?.id) {
        await supabase.from('jadwal_pelajaran').update(payload).eq('id', sched.id)
      } else {
        await supabase.from('jadwal_pelajaran').insert([payload])
      }

      await fetchDailyData(true)
      setCellInputValues(prev => {
        const next = { ...prev }
        delete next[cellKey]
        return next
      })
    } catch (err) {
      console.error('Error saving inline cell:', err)
    }
  }

  const handleCellKeyDown = (e, rowIdx, colIdx, slot, cls) => {
    if (['Enter', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
      let nextRow = rowIdx
      let nextCol = colIdx

      if (e.key === 'Enter') {
        e.preventDefault()
        handleInlineCodeBlur(slot, cls, e.target.value)
        nextRow = e.shiftKey ? rowIdx - 1 : rowIdx + 1
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        handleInlineCodeBlur(slot, cls, e.target.value)
        nextRow = rowIdx + 1
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        handleInlineCodeBlur(slot, cls, e.target.value)
        nextRow = rowIdx - 1
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleInlineCodeBlur(slot, cls, e.target.value)
        nextCol = colIdx + 1
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleInlineCodeBlur(slot, cls, e.target.value)
        nextCol = colIdx - 1
      }

      if (nextRow < 0) nextRow = 0
      if (nextRow >= slots.length) nextRow = slots.length - 1
      if (nextCol < 0) nextCol = 0
      if (nextCol >= filteredClasses.length) nextCol = filteredClasses.length - 1

      setTimeout(() => {
        let target = document.querySelector(`input[data-sched-row="${nextRow}"][data-sched-col="${nextCol}"]`)
        if (!target && e.key === 'ArrowDown') {
          for (let step = nextRow + 1; step < slots.length; step++) {
            target = document.querySelector(`input[data-sched-row="${step}"][data-sched-col="${nextCol}"]`)
            if (target) break
          }
        } else if (!target && e.key === 'ArrowUp') {
          for (let step = nextRow - 1; step >= 0; step--) {
            target = document.querySelector(`input[data-sched-row="${step}"][data-sched-col="${nextCol}"]`)
            if (target) break
          }
        }
        if (target) {
          target.focus()
          target.select()
        }
      }, 15)
    }
  }

  const handleExportTemplateExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
      const wb = new ExcelJS.Workbook()
      wb.creator = 'SMP Budi Mulia'

      // 1. Ambil slot waktu dan jadwal KBM aktif dari database
      const { data: allDbSlots } = await supabase
        .from('jadwal_slot_waktu')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', schoolActiveSemester)
        .order('urutan')

      const { data: allDbJadwals } = await supabase
        .from('jadwal_pelajaran')
        .select(`
          *,
          guru ( id, nama_guru, kode ),
          mata_pelajaran ( id, nama, singkatan )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', schoolActiveSemester)

      // Sheet 1: CETAK JADWAL
      const wsJadwal = wb.addWorksheet('CETAK JADWAL')
      const allClassList = classes && classes.length > 0 ? classes : ['7A', '7B', '7C', '7D', '8A', '8B', '8C', '8D', '9A', '9B', '9C', '9D']
      
      const columnsDef = [
        { key: 'jam', width: 8 },
        { key: 'waktu', width: 18 },
        ...allClassList.map(cls => ({ key: cls, width: 11 }))
      ]
      wsJadwal.columns = columnsDef

      const thinBorder = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      }

      HARI_LIST.forEach((hari) => {
        // A. Header Nama Hari (Full Width)
        const dayHeaderRow = wsJadwal.addRow({ jam: hari.toUpperCase() })
        dayHeaderRow.height = 26
        dayHeaderRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        dayHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
        dayHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
        wsJadwal.mergeCells(dayHeaderRow.number, 1, dayHeaderRow.number, columnsDef.length)

        // B. Header Kolom (JAM, WAKTU, 7A, 7B, ...)
        const colHeaderData = { jam: 'JAM', waktu: 'WAKTU' }
        allClassList.forEach(c => { colHeaderData[c] = c })
        const subHeaderRow = wsJadwal.addRow(colHeaderData)
        subHeaderRow.height = 22
        subHeaderRow.font = { bold: true, size: 10, color: { argb: 'FF1E293B' } }
        subHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
        subHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
        for (let c = 1; c <= columnsDef.length; c++) {
          subHeaderRow.getCell(c).border = thinBorder
        }

        // C. Tentukan daftar slot waktu untuk hari ini
        let daySlots = (allDbSlots || []).filter(s => s.hari === hari)
        if (!daySlots || daySlots.length === 0) {
          const anyDay = (allDbSlots || []).filter(s => s.hari === activeHari)
          if (anyDay.length > 0) {
            daySlots = anyDay.map(s => ({ ...s, hari }))
          } else if (slots.length > 0) {
            daySlots = slots.map(s => ({ ...s, hari }))
          } else {
            // Default slot jika belum ada konfigurasi:
            // Jam 0 Doa/Persiapan, Jam 1-3 KBM, Istirahat 1, Jam 4-6 KBM, Istirahat 2, Jam 7-8 KBM
            daySlots = [
              { urutan: 0, jam_ke: 0, tipe: 'persiapan', keterangan_blok: 'DOA', durasi_menit: 30, waktu_mulai: '06:30:00' },
              { urutan: 1, jam_ke: 1, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '07:00:00' },
              { urutan: 2, jam_ke: 2, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '07:40:00' },
              { urutan: 3, jam_ke: 3, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '08:20:00' },
              { urutan: 4, jam_ke: null, tipe: 'istirahat', keterangan_blok: 'ISTIRAHAT 1', durasi_menit: 30, waktu_mulai: '09:00:00' },
              { urutan: 5, jam_ke: 4, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '09:30:00' },
              { urutan: 6, jam_ke: 5, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '10:10:00' },
              { urutan: 7, jam_ke: 6, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '10:50:00' },
              { urutan: 8, jam_ke: null, tipe: 'istirahat', keterangan_blok: 'ISTIRAHAT 2', durasi_menit: 20, waktu_mulai: '11:30:00' },
              { urutan: 9, jam_ke: 7, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '11:50:00' },
              { urutan: 10, jam_ke: 8, tipe: 'pelajaran', durasi_menit: 40, waktu_mulai: '12:30:00' }
            ]
          }
        }

        const calculatedDaySlots = calculateSlotTimes(daySlots, daySlots[0]?.waktu_mulai ? daySlots[0].waktu_mulai.slice(0, 5) : '06:30')

        // D. Tulis setiap baris slot
        calculatedDaySlots.forEach((s, sIdx) => {
          const sStart = s.waktu_mulai ? s.waktu_mulai.slice(0, 5) : '07:00'
          const [sh, sm] = sStart.split(':').map(Number)
          let em = (sm || 0) + (s.durasi_menit || 40)
          let eh = (sh || 7) + Math.floor(em / 60)
          em = em % 60
          const sEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
          const waktuStr = `${sStart} - ${sEnd}`
          const jamStr = formatJamDisplay(s, sIdx)

          const isBlock = s.tipe !== 'pelajaran' || Boolean(s.keterangan_blok)

          if (isBlock) {
            // Baris Kegiatan / Blok / Istirahat (otomatis terisi dan dimerge melintasi semua kelas)
            let actText = s.keterangan_blok
            if (!actText) {
              if (s.tipe === 'istirahat') actText = 'ISTIRAHAT'
              else if (s.tipe === 'persiapan' || s.jam_ke === 0) actText = 'DOA'
              else actText = 'KEGIATAN'
            }
            actText = String(actText).toUpperCase()

            const rowData = {
              jam: jamStr,
              waktu: waktuStr
            }
            rowData[allClassList[0]] = actText

            const r = wsJadwal.addRow(rowData)
            r.height = 24

            // Merge kolom kelas dari kolom 3 sampai akhir
            wsJadwal.mergeCells(r.number, 3, r.number, columnsDef.length)

            const jamCell = r.getCell(1)
            jamCell.alignment = { horizontal: 'center', vertical: 'middle' }
            jamCell.font = { bold: true, size: 10, color: { argb: 'FF334155' } }
            jamCell.border = thinBorder
            jamCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }

            const waktuCell = r.getCell(2)
            waktuCell.alignment = { horizontal: 'center', vertical: 'middle' }
            waktuCell.font = { size: 9, color: { argb: 'FF64748B' } }
            waktuCell.border = thinBorder
            waktuCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }

            for (let c = 3; c <= columnsDef.length; c++) {
              const cell = r.getCell(c)
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
              cell.font = { bold: true, size: 10, color: { argb: 'FF334155' } }
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              cell.border = thinBorder
            }
          } else {
            // Baris KBM Pelajaran biasa
            const rowData = {
              jam: jamStr,
              waktu: waktuStr
            }
            allClassList.forEach(cls => {
              const sched = (allDbJadwals || []).find(j => j.hari === hari && j.kelas === cls && j.jam_ke === s.jam_ke)
              if (sched) {
                rowData[cls] = getScheduleDisplayCode(sched)
              } else {
                rowData[cls] = ''
              }
            })

            const r = wsJadwal.addRow(rowData)
            r.height = 22

            for (let c = 1; c <= columnsDef.length; c++) {
              const cell = r.getCell(c)
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              cell.border = thinBorder
              if (c === 1) {
                cell.font = { bold: true, size: 10, color: { argb: 'FF1E293B' } }
              } else if (c === 2) {
                cell.font = { size: 9, color: { argb: 'FF64748B' } }
              } else {
                cell.font = { bold: Boolean(cell.value), size: 10, color: { argb: 'FF1E293B' } }
              }
            }
          }
        })

        const spacer = wsJadwal.addRow({})
        spacer.height = 12
      })

      // Sheet 2: DAFTAR KODE GURU
      const wsGuru = wb.addWorksheet('DAFTAR KODE GURU')
      wsGuru.columns = [
        { header: 'KODE GURU', key: 'kode', width: 14 },
        { header: 'NAMA GURU', key: 'nama', width: 35 },
        { header: 'MATA PELAJARAN', key: 'mapel', width: 30 },
        { header: 'KELAS YG DIAJAR', key: 'kelas', width: 25 }
      ]
      const guruHead = wsGuru.getRow(1)
      guruHead.height = 24
      guruHead.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      guruHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      guruHead.alignment = { horizontal: 'center', vertical: 'middle' }
      for (let c = 1; c <= 4; c++) {
        guruHead.getCell(c).border = thinBorder
      }

      gurus.forEach(g => {
        const subjects = getTeacherSubjectsWithCodes(g)
        const kelasList = [...new Set(g.guru_mapel?.map(m => m.kelas).filter(Boolean))].sort().join(', ')

        if (subjects.length > 0) {
          subjects.forEach(sub => {
            const gr = wsGuru.addRow({
              kode: sub.code || '-',
              nama: g.nama_guru,
              mapel: sub.nama ? `${sub.nama}${sub.singkatan && sub.singkatan !== sub.nama ? ` (${sub.singkatan})` : ''}` : '-',
              kelas: kelasList || '-'
            })
            gr.height = 20
            for (let c = 1; c <= 4; c++) {
              const cell = gr.getCell(c)
              cell.border = thinBorder
              if (c === 1) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' }
                cell.font = { bold: true }
              } else {
                cell.alignment = { vertical: 'middle' }
              }
            }
          })
        } else {
          const gr = wsGuru.addRow({
            kode: g.kode || '-',
            nama: g.nama_guru,
            mapel: '-',
            kelas: kelasList || '-'
          })
          gr.height = 20
          for (let c = 1; c <= 4; c++) {
            const cell = gr.getCell(c)
            cell.border = thinBorder
            if (c === 1) {
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              cell.font = { bold: true }
            } else {
              cell.alignment = { vertical: 'middle' }
            }
          }
        }
      })

      const buffer = await wb.xlsx.writeBuffer()
      const fileName = `Template_Jadwal_Pelajaran_SMP_Budi_Mulia_Sem${schoolActiveSemester}.xlsx`
      await downloadFile(buffer, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (err) {
      console.error('Export template error:', err)
      alert('Gagal mengunduh template Excel: ' + err.message)
    }
  }

  const fetchMasterData = async () => {
    try {
      // 0. School active semester
      const { data: semSetting } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'jadwal_semester_aktif')
        .maybeSingle()
      if (semSetting?.setting_value) {
        const val = parseInt(semSetting.setting_value) || 1
        setSchoolActiveSemester(val)
        setActiveSemester(val)
      }

      // 1. Gurus
      const { data: gurusData } = await supabase
        .from('guru')
        .select('*, guru_mapel(mata_pelajaran_id, kelas, tahun_ajaran_id, mata_pelajaran(id, nama, singkatan))')
        .order('nama_guru')
      setGurus(gurusData || [])

      // 2. Mapels
      const { data: mapelsData } = await supabase
        .from('mata_pelajaran')
        .select('*')
        .order('nama')
      setMapels(mapelsData || [])

      // 3. Classes
      const { data: enrolls } = await supabase
        .from('enrollment')
        .select('kelas')
        .eq('tahun_ajaran_id', activeTa?.id)
      
      let listMaster = []
      try {
        const { data: masterKls, error: masterKlsErr } = await supabase
          .from('master_kelas')
          .select('nama_kelas')
          .eq('tahun_ajaran_id', activeTa?.id)
        if (!masterKlsErr && masterKls) {
          listMaster = masterKls.map(mk => mk.nama_kelas).filter(Boolean)
        }
      } catch (err) {
        console.warn('Tabel master_kelas belum dimigrasikan:', err)
      }
      
      const listEnroll = enrolls ? enrolls.map(e => e.kelas).filter(Boolean) : []
      let uniqueClasses = [...new Set([...listEnroll, ...listMaster])].filter(c => c !== 'Test').sort()

      if (uniqueClasses.length === 0) {
        uniqueClasses = ['7A', '7B', '7C', '7D', '8A', '8B', '8C', '8D', '9A', '9B', '9C', '9D']
      }
      setClasses(uniqueClasses)
      if (uniqueClasses.length > 0 && !selectedCardClass) {
        setSelectedCardClass(uniqueClasses[0])
      }

      // 4. Beban Mengajar
      const { data: bebanData } = await supabase
        .from('jadwal_beban_mengajar')
        .select(`
          *,
          guru ( id, nama_guru ),
          mata_pelajaran ( id, nama )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
      setBebanMengajar(bebanData || [])

      // 5. Catatan
      const { data: catatanData } = await supabase
        .from('jadwal_catatan')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .order('urutan')
      setCatatanList(catatanData || [])

      // 6. Ekskul
      const { data: ekskulData } = await supabase
        .from('jadwal_ekskul')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .order('urutan')
      setEkskulList(ekskulData || [])
    } catch (error) {
      console.error('Error fetching master data:', error)
    }
  }

  const fetchDailyData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data: slotsData } = await supabase
        .from('jadwal_slot_waktu')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
        .order('urutan')

      if (slotsData && slotsData.length > 0) {
        const baseStartTime = slotsData[0].waktu_mulai ? slotsData[0].waktu_mulai.slice(0, 5) : '06:30'
        const calculated = calculateSlotTimes(slotsData, baseStartTime)
        setSlots(calculated)
      } else {
        setSlots([])
      }

      const { data: jadwalData } = await supabase
        .from('jadwal_pelajaran')
        .select(`
          *,
          guru ( id, nama_guru, kode ),
          mata_pelajaran ( id, nama, singkatan )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
      setJadwals(jadwalData || [])

      const { data: piketData } = await supabase
        .from('jadwal_piket')
        .select(`
          *,
          guru ( id, nama_guru )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
        .order('urutan')
      setPiketList(piketData || [])
    } catch (error) {
      console.error('Error fetching daily data:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTa?.id) {
      const loadAll = async () => {
        setLoading(true)
        await fetchMasterData()
        await fetchDailyData(true)
        setLoading(false)
      }
      loadAll()
    }
  }, [activeTa?.id])

  useEffect(() => {
    if (activeTa?.id) {
      fetchDailyData(true)
    }
  }, [activeSemester, activeHari])

  const fetchInitialData = async (silent = false) => {
    await fetchDailyData(silent)
  }

  const filteredClasses = useMemo(() => {
    if (gradeFilter === 'ALL') return classes
    return classes.filter(cls => cls.startsWith(gradeFilter))
  }, [classes, gradeFilter])

  // Conflict detection
  const conflictsBySlot = useMemo(() => {
    const map = {}
    const counts = {}

    jadwals.forEach(j => {
      if (!j.jam_ke || !j.guru_id) return
      const key = `${j.jam_ke}-${j.guru_id}`
      counts[key] = (counts[key] || 0) + 1
    })

    Object.entries(counts).forEach(([key, count]) => {
      if (count > 1) {
        const [jam_ke, guru_id] = key.split('-')
        if (!map[jam_ke]) map[jam_ke] = new Set()
        map[jam_ke].add(guru_id)
      }
    })

    return map
  }, [jadwals])

  const totalConflictsCount = useMemo(() => {
    let sum = 0
    Object.values(conflictsBySlot).forEach(set => { sum += set.size })
    return sum
  }, [conflictsBySlot])

  const handleSetSchoolActiveSemester = async (semNum) => {
    if (!window.confirm(`Aktifkan Semester ${semNum} sebagai semester resmi sekolah untuk seluruh Siswa, Guru, dan Orang Tua?`)) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('pengaturan_sekolah')
        .upsert({
          setting_key: 'jadwal_semester_aktif',
          setting_value: String(semNum)
        }, { onConflict: 'setting_key' })
      if (error) throw error
      setSchoolActiveSemester(semNum)
      alert(`Berhasil! Semester ${semNum} sekarang aktif untuk seluruh portal.`)
    } catch (err) {
      alert('Gagal mengubah semester aktif: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopySemester = async () => {
    const targetSem = activeSemester
    const sourceSem = copySourceSem
    if (sourceSem === targetSem) {
      alert('Semester asal dan semester tujuan tidak boleh sama.')
      return
    }

    if (!window.confirm(`Salin seluruh slot waktu dan jadwal pelajaran dari Semester ${sourceSem} ke Semester ${targetSem}? Data di Semester ${targetSem} akan ditimpa.`)) {
      return
    }

    setSaving(true)
    try {
      const { data: srcSlots, error: errSlot } = await supabase
        .from('jadwal_slot_waktu')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', sourceSem)
      if (errSlot) throw errSlot

      const { data: srcJadwals, error: errJadwal } = await supabase
        .from('jadwal_pelajaran')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', sourceSem)
      if (errJadwal) throw errJadwal

      if ((!srcSlots || srcSlots.length === 0) && (!srcJadwals || srcJadwals.length === 0)) {
        alert(`Tidak ada data jadwal di Semester ${sourceSem} untuk disalin.`)
        setSaving(false)
        return
      }

      await supabase.from('jadwal_pelajaran').delete().eq('tahun_ajaran_id', activeTa.id).eq('semester', targetSem)
      await supabase.from('jadwal_slot_waktu').delete().eq('tahun_ajaran_id', activeTa.id).eq('semester', targetSem)

      if (srcSlots && srcSlots.length > 0) {
        const slotInserts = srcSlots.map(s => ({
          tahun_ajaran_id: activeTa.id,
          semester: targetSem,
          hari: s.hari,
          urutan: s.urutan,
          jam_ke: s.jam_ke,
          label: s.label,
          tipe: s.tipe,
          keterangan_blok: s.keterangan_blok,
          waktu_mulai: s.waktu_mulai,
          durasi_menit: s.durasi_menit
        }))
        const { error: insSlotErr } = await supabase.from('jadwal_slot_waktu').insert(slotInserts)
        if (insSlotErr) throw insSlotErr
      }

      if (srcJadwals && srcJadwals.length > 0) {
        const jadwalInserts = srcJadwals.map(j => ({
          tahun_ajaran_id: activeTa.id,
          semester: targetSem,
          hari: j.hari,
          kelas: j.kelas,
          jam_ke: j.jam_ke,
          waktu_mulai: j.waktu_mulai,
          waktu_selesai: j.waktu_selesai,
          guru_id: j.guru_id,
          mata_pelajaran_id: j.mata_pelajaran_id
        }))
        const { error: insJadwalErr } = await supabase.from('jadwal_pelajaran').insert(jadwalInserts)
        if (insJadwalErr) throw insJadwalErr
      }

      alert(`Sukses menyalin jadwal dari Semester ${sourceSem} ke Semester ${targetSem}!`)
      setShowCopySemModal(false)
      await fetchInitialData()
    } catch (err) {
      alert('Gagal menyalin jadwal: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicateSlotsToAllDays = async () => {
    if (slots.length === 0) {
      alert('Belum ada slot waktu pada hari ini untuk diduplikasi.')
      return
    }

    if (!window.confirm(`Duplikasi struktur jam (${slots.length} slot) dari hari ${activeHari} ke seluruh hari lainnya (Senin - Jumat) pada Semester ${activeSemester}?`)) {
      return
    }

    setSaving(true)
    try {
      const otherDays = HARI_LIST.filter(h => h !== activeHari)

      for (const targetDay of otherDays) {
        await supabase
          .from('jadwal_slot_waktu')
          .delete()
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', activeSemester)
          .eq('hari', targetDay)

        const inserts = slots.map(s => ({
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          hari: targetDay,
          urutan: s.urutan,
          jam_ke: s.jam_ke,
          label: s.label,
          tipe: s.tipe,
          keterangan_blok: s.keterangan_blok,
          durasi_menit: s.durasi_menit,
          waktu_mulai: s.waktu_mulai
        }))

        const { error } = await supabase.from('jadwal_slot_waktu').insert(inserts)
        if (error) throw error
      }

      alert(`Berhasil menduplikasi struktur jam ke seluruh hari (${otherDays.join(', ')})!`)
    } catch (err) {
      alert('Gagal menduplikasi slot jam: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleInitializeSlots = async (e) => {
    e.preventDefault()
    if (!activeTa?.id) return
    setSaving(true)

    try {
      const { start_time, total_jam, start_jam_ke, total_istirahat, durasi_pelajaran, durasi_istirahat_1, durasi_istirahat_2 } = initForm
      const newSlots = []
      let currentUrutan = 0
      const istirahat1After = 3
      const istirahat2After = 7
      let jamKeCounter = parseInt(start_jam_ke)

      for (let i = 0; i <= parseInt(total_jam); i++) {
        if (i === 0 && parseInt(start_jam_ke) === 0) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: 'P',
            tipe: 'persiapan',
            keterangan_blok: 'PERSIAPAN KBM & DOA / GLS',
            durasi_menit: 30
          })
          continue
        }

        const currentJamKe = jamKeCounter++
        newSlots.push({
          urutan: currentUrutan++,
          jam_ke: currentJamKe,
          label: String(currentJamKe),
          tipe: 'pelajaran',
          keterangan_blok: null,
          durasi_menit: parseInt(durasi_pelajaran)
        })

        if (parseInt(total_istirahat) >= 1 && currentJamKe === istirahat1After) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: '-',
            tipe: 'istirahat',
            keterangan_blok: 'ISTIRAHAT 1',
            durasi_menit: parseInt(durasi_istirahat_1)
          })
        }

        if (parseInt(total_istirahat) >= 2 && currentJamKe === istirahat2After) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: '-',
            tipe: 'istirahat',
            keterangan_blok: 'ISTIRAHAT 2',
            durasi_menit: parseInt(durasi_istirahat_2)
          })
        }
      }

      const orderedSlots = reorderJamKe(newSlots, start_jam_ke)
      const calculated = calculateSlotTimes(orderedSlots, start_time)
      const inserts = calculated.map(s => ({
        tahun_ajaran_id: activeTa.id,
        semester: activeSemester,
        hari: activeHari,
        urutan: s.urutan,
        jam_ke: s.jam_ke,
        label: s.label,
        tipe: s.tipe,
        keterangan_blok: s.keterangan_blok,
        durasi_menit: s.durasi_menit,
        waktu_mulai: s.waktu_mulai
      }))

      await supabase
        .from('jadwal_slot_waktu')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)

      const { error } = await supabase.from('jadwal_slot_waktu').insert(inserts)
      if (error) throw error

      await fetchInitialData()
    } catch (error) {
      alert('Gagal menginisialisasi jam pelajaran: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleMoveSlot = async (index, direction) => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === slots.length - 1) return

    const newSlots = [...slots]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    const tempUrutan = newSlots[index].urutan
    newSlots[index].urutan = newSlots[targetIndex].urutan
    newSlots[targetIndex].urutan = tempUrutan

    const tempObj = newSlots[index]
    newSlots[index] = newSlots[targetIndex]
    newSlots[targetIndex] = tempObj

    const firstPelajaran = slots.find(s => s.tipe === 'pelajaran')
    const startJamKe = firstPelajaran ? (firstPelajaran.jam_ke !== null ? firstPelajaran.jam_ke : 0) : 0

    const ordered = reorderJamKe(newSlots, startJamKe)
    const baseStartTime = ordered[0].waktu_mulai ? ordered[0].waktu_mulai.slice(0, 5) : '06:30'
    const calculated = calculateSlotTimes(ordered, baseStartTime)
    setSlots(calculated)

    try {
      for (let i = 0; i < calculated.length; i++) {
        await supabase
          .from('jadwal_slot_waktu')
          .update({ urutan: -999 - i })
          .eq('id', calculated[i].id)
      }

      for (let i = 0; i < calculated.length; i++) {
        await supabase
          .from('jadwal_slot_waktu')
          .update({ 
            urutan: calculated[i].urutan,
            jam_ke: calculated[i].jam_ke,
            label: calculated[i].label
          })
          .eq('id', calculated[i].id)
      }
      
      await fetchInitialData(true)
    } catch (error) {
      console.error('Gagal swap urutan:', error)
    }
  }

  const handleSaveJamSlot = async (e) => {
    e.preventDefault()
    if (!activeTa?.id) return
    setSaving(true)

    try {
      const payload = {
        tipe: jamForm.tipe,
        label: jamForm.label || (jamForm.tipe === 'istirahat' ? '-' : jamForm.jam_ke ? String(jamForm.jam_ke) : '-'),
        jam_ke: jamForm.tipe === 'pelajaran' ? (parseInt(jamForm.jam_ke) || null) : null,
        durasi_menit: parseInt(jamForm.durasi_menit) || 40,
        keterangan_blok: jamForm.tipe !== 'pelajaran' ? jamForm.keterangan_blok : null
      }

      if (jamForm.id) {
        if (slots[0]?.id === jamForm.id && jamForm.waktu_mulai) {
          payload.waktu_mulai = `${jamForm.waktu_mulai}:00`
        }

        const { error } = await supabase
          .from('jadwal_slot_waktu')
          .update(payload)
          .eq('id', jamForm.id)
        if (error) throw error
      } else {
        const lastUrutan = slots.length > 0 ? Math.max(...slots.map(s => s.urutan)) + 1 : 0
        const { error } = await supabase
          .from('jadwal_slot_waktu')
          .insert([{
            tahun_ajaran_id: activeTa.id,
            semester: activeSemester,
            hari: activeHari,
            urutan: lastUrutan,
            waktu_mulai: '07:00:00',
            ...payload
          }])
        if (error) throw error
      }

      await fetchInitialData()
      setShowJamModal(false)
    } catch (error) {
      alert('Gagal menyimpan slot jam: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSlot = async (id) => {
    if (!window.confirm('Hapus baris jam/istirahat ini? Pelajaran di jam ini pada semua kelas akan ikut terhapus.')) return
    setSaving(true)
    try {
      const targetSlot = slots.find(s => s.id === id)
      if (targetSlot && targetSlot.jam_ke !== null) {
        await supabase
          .from('jadwal_pelajaran')
          .delete()
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', activeSemester)
          .eq('hari', activeHari)
          .eq('jam_ke', targetSlot.jam_ke)
      }

      const { error } = await supabase.from('jadwal_slot_waktu').delete().eq('id', id)
      if (error) throw error

      await fetchInitialData()
    } catch (error) {
      alert('Gagal menghapus slot: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCell = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !selectedCell) return
    setSaving(true)

    try {
      if (cellForm.is_blok) {
        const { error } = await supabase
          .from('jadwal_slot_waktu')
          .update({ 
            tipe: 'blok_khusus',
            keterangan_blok: cellForm.keterangan_blok || 'KEGIATAN KHUSUS'
          })
          .eq('id', selectedCell.slotId)
        if (error) throw error

        await supabase
          .from('jadwal_pelajaran')
          .delete()
          .eq('hari', activeHari)
          .eq('jam_ke', selectedCell.jam_ke)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', activeSemester)
      } else {
        const payload = {
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          hari: activeHari,
          kelas: selectedCell.kelas,
          jam_ke: selectedCell.jam_ke,
          waktu_mulai: selectedCell.waktu_mulai,
          waktu_selesai: selectedCell.waktu_selesai,
          guru_id: cellForm.guru_id || null,
          mata_pelajaran_id: cellForm.mata_pelajaran_id || null
        }

        if (cellForm.id) {
          const { error } = await supabase.from('jadwal_pelajaran').update(payload).eq('id', cellForm.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('jadwal_pelajaran').insert([payload])
          if (error) throw error
        }
      }

      await fetchInitialData(true)
      setShowCellModal(false)
    } catch (error) {
      alert('Gagal menyimpan jadwal: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCell = async (id) => {
    if (!window.confirm('Hapus pelajaran di sel ini?')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('jadwal_pelajaran').delete().eq('id', id)
      if (error) throw error
      await fetchInitialData(true)
      setShowCellModal(false)
    } catch (error) {
      alert('Gagal menghapus: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // BEBAN MENGAJAR
  const handleSelectGuruBeban = (guru) => {
    setSelectedGuruBeban(guru)
    setGuruKodeInput(guru.kode || '')
    let autoMapelId = ''
    
    if (guru.guru_mapel) {
      const mapelIds = [...new Set(guru.guru_mapel.map(gm => gm.mata_pelajaran_id))]
      const filteredMapels = mapels.filter(m => mapelIds.includes(m.id))
      setGuruBebanMapels(filteredMapels)
      
      if (filteredMapels.length === 1) {
        autoMapelId = filteredMapels[0].id
      }
    } else {
      setGuruBebanMapels([])
    }

    if (autoMapelId) {
      handleMapelChange(autoMapelId, guru)
    } else {
      setBebanForm({
        mata_pelajaran_id: '',
        jam_per_minggu: 2,
        maks_jam_per_hari: 2,
        kode_guru: ''
      })
    }
  }

  const handleMapelChange = (mapelId, guruObj = null) => {
    const activeGuru = guruObj || selectedGuruBeban
    if (!activeGuru) return

    const existing = bebanMengajar.find(b => 
      b.guru_id === activeGuru.id && 
      b.mata_pelajaran_id === mapelId
    )

    if (existing && existing.kode_guru) {
      setBebanForm({
        mata_pelajaran_id: mapelId,
        jam_per_minggu: existing.jam_per_minggu,
        maks_jam_per_hari: existing.maks_jam_per_hari,
        kode_guru: existing.kode_guru || ''
      })
    } else {
      const subjects = getTeacherSubjectsWithCodes(activeGuru)
      const matchSub = subjects.find(s => s.mata_pelajaran_id === mapelId)
      const suggestedKode = matchSub?.code || (existing?.kode_guru || activeGuru.kode || '')

      setBebanForm({
        mata_pelajaran_id: mapelId,
        jam_per_minggu: existing?.jam_per_minggu || 2,
        maks_jam_per_hari: existing?.maks_jam_per_hari || 2,
        kode_guru: suggestedKode
      })
    }
  }

  const getKelasKandidat = () => {
    if (!selectedGuruBeban || !bebanForm.mata_pelajaran_id) return []
    const kandidat = selectedGuruBeban.guru_mapel
      .filter(gm => 
        gm.tahun_ajaran_id === activeTa?.id && 
        gm.mata_pelajaran_id === bebanForm.mata_pelajaran_id
      )
      .map(gm => gm.kelas)
      .filter(Boolean)
    return [...new Set(kandidat)].sort()
  }

  const handleAddBeban = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !selectedGuruBeban || !bebanForm.mata_pelajaran_id) return
    setSaving(true)

    try {
      const targetClasses = selectedGuruBeban.guru_mapel
        .filter(gm => 
          gm.tahun_ajaran_id === activeTa.id && 
          gm.mata_pelajaran_id === bebanForm.mata_pelajaran_id
        )
        .map(gm => gm.kelas)
        .filter(Boolean)

      if (targetClasses.length === 0) {
        alert('Guru ini belum diset mengajar kelas mana pun untuk mapel terpilih di menu Manajemen Akun.')
        setSaving(false)
        return
      }

      const inserts = []
      targetClasses.forEach(cls => {
        inserts.push({
          tahun_ajaran_id: activeTa.id,
          semester: 1,
          guru_id: selectedGuruBeban.id,
          mata_pelajaran_id: bebanForm.mata_pelajaran_id,
          kelas: cls,
          jam_per_minggu: parseInt(bebanForm.jam_per_minggu),
          maks_jam_per_hari: parseInt(bebanForm.maks_jam_per_hari),
          kode_guru: bebanForm.kode_guru ? bebanForm.kode_guru.trim() : null
        })
        inserts.push({
          tahun_ajaran_id: activeTa.id,
          semester: 2,
          guru_id: selectedGuruBeban.id,
          mata_pelajaran_id: bebanForm.mata_pelajaran_id,
          kelas: cls,
          jam_per_minggu: parseInt(bebanForm.jam_per_minggu),
          maks_jam_per_hari: parseInt(bebanForm.maks_jam_per_hari),
          kode_guru: bebanForm.kode_guru ? bebanForm.kode_guru.trim() : null
        })
      })

      const { error } = await supabase
        .from('jadwal_beban_mengajar')
        .upsert(inserts, { onConflict: 'tahun_ajaran_id, semester, guru_id, mata_pelajaran_id, kelas' })
      
      if (error) throw error
      alert(`Berhasil menyimpan beban mengajar untuk kelas: ${targetClasses.join(', ')}`)
      await fetchInitialData(true)
      
      setBebanForm({
        mata_pelajaran_id: '',
        jam_per_minggu: 2,
        maks_jam_per_hari: 2,
        kode_guru: ''
      })
      setSelectedGuruBeban(null)
    } catch (error) {
      alert('Gagal menyimpan beban mengajar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // PIKET & CATATAN & EKSKUL
  const handleAddPiket = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !piketFormGuruId) return
    setSaving(true)
    
    try {
      const lastUrutan = piketList.length > 0 ? Math.max(...piketList.map(p => p.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_piket')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          hari: activeHari,
          guru_id: piketFormGuruId,
          urutan: lastUrutan
        }])
      
      if (error) throw error
      await fetchInitialData(true)
      setPiketFormGuruId('')
    } catch (error) {
      alert('Gagal menambahkan piket: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePiket = async (id) => {
    try {
      await supabase.from('jadwal_piket').delete().eq('id', id)
      await fetchInitialData(true)
    } catch (error) {
      alert('Gagal menghapus piket: ' + error.message)
    }
  }

  const handleAddCatatan = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !newCatatan) return
    setSaving(true)

    try {
      const lastUrutan = catatanList.length > 0 ? Math.max(...catatanList.map(c => c.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_catatan')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          isi_catatan: newCatatan,
          urutan: lastUrutan
        }])
      if (error) throw error
      await fetchInitialData(true)
      setNewCatatan('')
    } catch (error) {
      alert('Gagal menyimpan catatan: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddEkskul = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !newEkskul.nama) return
    setSaving(true)

    try {
      const lastUrutan = ekskulList.length > 0 ? Math.max(...ekskulList.map(el => el.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_ekskul')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          nama: newEkskul.nama,
          hari: newEkskul.hari,
          waktu: newEkskul.waktu,
          pembina: newEkskul.pembina,
          urutan: lastUrutan
        }])
      if (error) throw error
      await fetchInitialData(true)
      setNewEkskul({ nama: '', hari: 'Senin', waktu: '14:30 - 15:30', pembina: '' })
    } catch (error) {
      alert('Gagal menyimpan ekskul: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClearJadwal = () => {
    setShowClearConfirmModal(true)
  }

  const executeClearJadwal = async () => {
    if (!activeTa?.id) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('jadwal_pelajaran')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
      
      if (error) throw error
      await fetchDailyData(true)
    } catch (error) {
      alert('Gagal mengosongkan jadwal: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAutoGenerateJadwal = async () => {
    if (!activeTa?.id) return
    if (bebanMengajar.length === 0) {
      alert('Silakan setup Target Beban Mengajar terlebih dahulu di tab sebelah.')
      return
    }

    if (!window.confirm('Peringatan: Auto-generate akan menghapus seluruh jadwal reguler hari ini untuk digantikan dengan yang baru. Lanjutkan?')) return
    setLoading(true)

    try {
      const pelajaranSlots = slots.filter(s => s.tipe === 'pelajaran' && s.jam_ke !== null)
      if (pelajaranSlots.length === 0) {
        alert('Belum ada slot pelajaran reguler yang diset untuk hari ini. Silakan inisialisasi jam terlebih dahulu.')
        setLoading(false)
        return
      }

      await supabase
        .from('jadwal_pelajaran')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)

      const localJadwals = []
      const bebanKerja = bebanMengajar.map(b => ({
        ...b,
        sisa_minggu: b.jam_per_minggu
      }))

      for (const slot of pelajaranSlots) {
        for (const cls of classes) {
          const kandidatBeban = bebanKerja
            .filter(b => b.kelas === cls && b.sisa_minggu > 0)
            .sort(() => Math.random() - 0.5)

          for (const beban of kandidatBeban) {
            const guruTabrakan = localJadwals.some(j => j.guru_id === beban.guru_id && j.jam_ke === slot.jam_ke)
            if (guruTabrakan) continue

            const jamHariIni = localJadwals.filter(j => j.kelas === cls && j.mata_pelajaran_id === beban.mata_pelajaran_id).length
            if (jamHariIni >= beban.maks_jam_per_hari) continue

            localJadwals.push({
              tahun_ajaran_id: activeTa.id,
              semester: activeSemester,
              hari: activeHari,
              kelas: cls,
              jam_ke: slot.jam_ke,
              waktu_mulai: slot.waktu_mulai,
              waktu_selesai: '00:00:00',
              guru_id: beban.guru_id,
              mata_pelajaran_id: beban.mata_pelajaran_id
            })

            beban.sisa_minggu--
            break
          }
        }
      }

      if (localJadwals.length > 0) {
        const { error } = await supabase.from('jadwal_pelajaran').insert(localJadwals)
        if (error) throw error
        alert(`Sukses generate otomatis ${localJadwals.length} jam pelajaran untuk hari ${activeHari}!`)
      } else {
        alert('Tidak ada slot pelajaran yang berhasil dipasangkan. Silakan periksa setup beban mengajar.')
      }

      await fetchInitialData()
    } catch (error) {
      alert('Gagal generate jadwal: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const getSisaBeban = () => {
    const res = []
    bebanMengajar.forEach(b => {
      const terjadwalCount = jadwals.filter(j => 
        j.guru_id === b.guru_id && 
        j.mata_pelajaran_id === b.mata_pelajaran_id && 
        j.kelas === b.kelas
      ).length

      const sisa = b.jam_per_minggu - terjadwalCount
      if (sisa > 0) {
        res.push({
          ...b,
          terjadwal: terjadwalCount,
          sisa
        })
      }
    })
    return res
  }

  const sisaBebanList = getSisaBeban()

  const filteredGurus = gurus.filter(g => {
    if (!guruRefSearch.trim()) return true
    const searchVal = guruRefSearch.toLowerCase()
    const matchName = g.nama_guru?.toLowerCase().includes(searchVal)
    const subjects = getTeacherSubjectsWithCodes(g)
    const matchCode = subjects.some(s => s.code.toLowerCase().includes(searchVal)) || g.kode?.toLowerCase().includes(searchVal)
    const matchMapel = subjects.some(s => s.nama?.toLowerCase().includes(searchVal) || s.singkatan?.toLowerCase().includes(searchVal))
    return matchName || matchCode || matchMapel
  })

  const cellModalGurus = useMemo(() => {
    if (!cellGuruSearch.trim()) return gurus
    const q = cellGuruSearch.toLowerCase()
    return gurus.filter(g => {
      const matchName = g.nama_guru?.toLowerCase().includes(q)
      const subjects = getTeacherSubjectsWithCodes(g)
      const matchCode = subjects.some(s => s.code.toLowerCase().includes(q)) || g.kode?.toLowerCase().includes(q)
      const matchMapel = subjects.some(s => s.nama?.toLowerCase().includes(q) || s.singkatan?.toLowerCase().includes(q))
      return matchName || matchCode || matchMapel
    })
  }, [gurus, bebanMengajar, mapels, cellGuruSearch])

  const cellModalMapels = useMemo(() => {
    if (!cellMapelSearch.trim()) return mapels
    const q = cellMapelSearch.toLowerCase()
    return mapels.filter(m => m.nama?.toLowerCase().includes(q) || m.singkatan?.toLowerCase().includes(q))
  }, [mapels, cellMapelSearch])

  return (
    <div className="animate-slide-up text-slate-800 space-y-6">
      
      {/* 1. STANDAR HEADER EB (Sesuai Desain Asli Aplikasi) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h2 className="text-2xl font-bold text-slate-900">Jadwal Pelajaran</h2>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
              T.A {activeTa?.nama || 'Aktif'}
            </span>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-100">
              Semester {schoolActiveSemester} (Aktif)
            </span>
            {totalConflictsCount > 0 && (
              <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-xs font-semibold rounded-full border border-rose-200 animate-pulse">
                {totalConflictsCount} Bentrok Guru
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm">
            Kelola susunan jadwal KBM mingguan, target beban mengajar, dan slot waktu sekolah
          </p>
        </div>

        {/* Controls: Quick Tools */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold shadow-xs">
            Semester {schoolActiveSemester} (Aktif)
          </div>

          <button
            type="button"
            onClick={handleExportTemplateExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
            title="Unduh template Excel untuk diedit dan diimpor kembali"
          >
            Unduh Template Excel
          </button>

          <button
            type="button"
            onClick={() => {
              setCopySourceSem(schoolActiveSemester === 1 ? 2 : 1)
              setShowCopySemModal(true)
            }}
            className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            Salin Antar Sem
          </button>
        </div>
      </div>

      {/* 2. CARD UTAMA DENGAN TAB NAVIGASI STANDAR APLIKASI */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Tab Navigation Header */}
        <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
          <button 
            onClick={() => setActiveTab('grid')}
            className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'grid' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Grid & Jadwal
          </button>
          <button 
            onClick={() => setActiveTab('beban')}
            className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'beban' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Target Beban Mengajar
          </button>
          <button 
            onClick={() => setActiveTab('catatan_ekskul')}
            className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'catatan_ekskul' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Catatan & Ekskul
          </button>
          <button 
            onClick={() => setActiveTab('import')}
            className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'import' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Import Excel
          </button>
        </div>

        {/* Contents Area */}
        <div className="p-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* TAB 1: GRID & JADWAL */}
              {activeTab === 'grid' && (
                <div className="space-y-4">
                  {/* Sub-bar Controls: Hari Pills + View Mode + Grade Filter */}
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-200/60">
                    
                    {/* Hari Pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide w-full xl:w-auto">
                      {HARI_LIST.map(hari => (
                        <button
                          key={hari}
                          onClick={() => setActiveHari(hari)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                            activeHari === hari 
                              ? 'bg-indigo-600 text-white shadow-xs font-bold' 
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                          }`}
                        >
                          {hari}
                        </button>
                      ))}
                    </div>

                    {/* View Mode & Filter Controls */}
                    <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-between xl:justify-end">
                      {/* View Mode (PC Matrix vs HP Card) */}
                      <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setAdminViewMode('grid')}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            adminViewMode === 'grid' 
                              ? 'bg-indigo-50 text-indigo-700 font-bold' 
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Matriks (PC)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdminViewMode('card')}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            adminViewMode === 'card' 
                              ? 'bg-indigo-50 text-indigo-700 font-bold' 
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Per Kelas (HP)
                        </button>
                      </div>

                      {/* Grade Filter (Grid Mode) */}
                      {adminViewMode === 'grid' && (
                        <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
                          {['ALL', '7', '8', '9'].map(g => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setGradeFilter(g)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                gradeFilter === g 
                                  ? 'bg-indigo-50 text-indigo-700 font-bold' 
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {g === 'ALL' ? 'Semua' : `Kls ${g}`}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Class Picker (Card Mode) */}
                      {adminViewMode === 'card' && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600">Pilih Kelas:</label>
                          <select
                            value={selectedCardClass}
                            onChange={e => setSelectedCardClass(e.target.value)}
                            className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          >
                            {classes.map(c => (
                              <option key={c} value={c}>Kelas {c}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {slots.length > 0 && (
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleAutoGenerateJadwal}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          Generate Otomatis
                        </button>
                        <button
                          onClick={() => {
                            setJamForm({
                              id: '',
                              tipe: 'pelajaran',
                              label: '',
                              jam_ke: '',
                              durasi_menit: 40,
                              keterangan_blok: '',
                              waktu_mulai: ''
                            })
                            setShowJamModal(true)
                          }}
                          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          Tambah Jam/Slot
                        </button>
                        <button
                          onClick={handleDuplicateSlotsToAllDays}
                          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          Duplikat Jam ke Semua Hari
                        </button>
                        <button
                          onClick={handleExportTemplateExcel}
                          className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                          title="Unduh template Excel untuk diedit dan diimpor"
                        >
                          Unduh Template Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGuruRef(true)}
                          className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                          title="Lihat daftar guru dan kode pengajar"
                        >
                          Daftar Guru & Kode
                        </button>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleClearJadwal}
                          className="px-3.5 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          Kosongkan Hari Ini
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-colors shadow-sm"
                        >
                          Cetak
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SLOTS EMPTY: FORM INISIALISASI */}
                  {slots.length === 0 ? (
                    <div className="max-w-xl mx-auto bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm my-6">
                      <div className="mb-4">
                        <h3 className="font-bold text-slate-900 text-base">Inisialisasi Jam Pelajaran Hari {activeHari}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tentukan waktu mulai, durasi per jam, dan jumlah istirahat untuk memunculkan tabel jadwal.</p>
                      </div>

                      <form onSubmit={handleInitializeSlots} className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1.5">Mulai Jam Pelajaran</label>
                            <input 
                              type="time"
                              required
                              value={initForm.start_time}
                              onChange={e => setInitForm(prev => ({ ...prev, start_time: e.target.value }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1.5">Dimulai Dari Jam Ke</label>
                            <select
                              value={initForm.start_jam_ke}
                              onChange={e => setInitForm(prev => ({ ...prev, start_jam_ke: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white font-semibold"
                            >
                              <option value="0">Jam Ke-0 (Persiapan KBM / Doa)</option>
                              <option value="1">Jam Ke-I Langsung</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1.5">Total Jam Pelajaran</label>
                            <input 
                              type="number"
                              required
                              min="1"
                              max="12"
                              value={initForm.total_jam}
                              onChange={e => setInitForm(prev => ({ ...prev, total_jam: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1.5">Jumlah Istirahat</label>
                            <select
                              value={initForm.total_istirahat}
                              onChange={e => setInitForm(prev => ({ ...prev, total_istirahat: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white font-semibold"
                            >
                              <option value="0">Tidak Ada</option>
                              <option value="1">1 Kali Istirahat</option>
                              <option value="2">2 Kali Istirahat</option>
                            </select>
                          </div>
                        </div>

                        <div className="border-t border-slate-200 pt-4 space-y-3">
                          <h4 className="font-semibold text-slate-700">Durasi (Menit)</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-slate-500 mb-1">KBM Reguler</label>
                              <input 
                                type="number"
                                required
                                min="5"
                                value={initForm.durasi_pelajaran}
                                onChange={e => setInitForm(prev => ({ ...prev, durasi_pelajaran: parseInt(e.target.value) }))}
                                className="w-full px-3 py-1.5 border rounded-xl bg-white text-center font-bold"
                              />
                            </div>
                            {initForm.total_istirahat >= 1 && (
                              <div>
                                <label className="block text-slate-500 mb-1">Istirahat 1</label>
                                <input 
                                  type="number"
                                  required
                                  min="5"
                                  value={initForm.durasi_istirahat_1}
                                  onChange={e => setInitForm(prev => ({ ...prev, durasi_istirahat_1: parseInt(e.target.value) }))}
                                  className="w-full px-3 py-1.5 border rounded-xl bg-white text-center font-bold"
                                />
                              </div>
                            )}
                            {initForm.total_istirahat >= 2 && (
                              <div>
                                <label className="block text-slate-500 mb-1">Istirahat 2</label>
                                <input 
                                  type="number"
                                  required
                                  min="5"
                                  value={initForm.durasi_istirahat_2}
                                  onChange={e => setInitForm(prev => ({ ...prev, durasi_istirahat_2: parseInt(e.target.value) }))}
                                  className="w-full px-3 py-1.5 border rounded-xl bg-white text-center font-bold"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={saving}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-colors mt-4"
                        >
                          {saving ? 'Menyimpan...' : 'Terapkan Jam Pelajaran'}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="w-full">
                      
                      {/* A. MODE MATRIKS (DESKTOP) */}
                      {adminViewMode === 'grid' && (
                        <div className="w-full border border-slate-200 rounded-xl shadow-xs bg-white overflow-hidden">
                          <table className="w-full table-fixed border-collapse text-xs text-left">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                                <th className="py-2.5 px-1 text-center w-10 border-r border-slate-200 bg-slate-50 font-bold text-[11px]">Jam</th>
                                <th className="py-2.5 px-1 text-center w-[74px] border-r border-slate-200 bg-slate-50 font-bold text-[11px]">Waktu</th>
                                {filteredClasses.map(cls => (
                                  <th key={cls} className="py-2.5 px-0.5 text-center border-r border-slate-200 bg-slate-50 font-bold text-[11px]">
                                    {cls}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {slots.map((slot, index) => {
                                const startTime = slot.waktu_mulai.slice(0, 5)
                                const [h, m] = startTime.split(':').map(Number)
                                let endM = m + slot.durasi_menit
                                let endH = h + Math.floor(endM / 60)
                                endM = endM % 60
                                const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

                                // Non-lesson row (Break, Prep, Special)
                                if (slot.tipe !== 'pelajaran') {
                                  return (
                                    <tr key={slot.id} className="bg-slate-50/70 font-semibold text-slate-700 hover:bg-slate-100/50 transition-colors">
                                      <td className="py-2 px-1 text-center border-r border-slate-200 font-bold bg-slate-50/95 text-slate-800 text-[11px]">
                                        {formatJamDisplay(slot, index)}
                                      </td>
                                      <td 
                                        onClick={() => {
                                          setJamForm({
                                            id: slot.id,
                                            tipe: slot.tipe,
                                            label: slot.label,
                                            jam_ke: slot.jam_ke || '',
                                            durasi_menit: slot.durasi_menit,
                                            keterangan_blok: slot.keterangan_blok || '',
                                            waktu_mulai: startTime
                                          })
                                          setShowJamModal(true)
                                        }}
                                        className="py-1.5 px-1 text-center border-r border-slate-200 text-slate-600 font-medium cursor-pointer hover:bg-slate-100 transition-all font-mono leading-tight bg-slate-50/95"
                                      >
                                        <span className="font-semibold text-[10px] block whitespace-nowrap">{startTime}-{endTime}</span>
                                        <span className="text-[9px] text-slate-400 block font-normal">({slot.durasi_menit}m)</span>
                                      </td>

                                      <td colSpan={filteredClasses.length} className="py-2 px-3 text-center text-slate-700 bg-slate-50/80">
                                        <div className="flex items-center justify-center gap-2">
                                          <span className="uppercase tracking-wider font-semibold text-xs text-slate-700">
                                            {slot.keterangan_blok || slot.label}
                                          </span>
                                          <button
                                            onClick={() => {
                                              setSelectedCell({
                                                slotId: slot.id,
                                                jam_ke: slot.jam_ke,
                                                waktu_mulai: slot.waktu_mulai,
                                                waktu_selesai: endTime
                                              })
                                              setCellForm({
                                                id: '',
                                                guru_id: '',
                                                mata_pelajaran_id: '',
                                                is_blok: true,
                                                keterangan_blok: slot.keterangan_blok || ''
                                              })
                                              setShowCellModal(true)
                                            }}
                                            className="text-[10px] text-indigo-600 hover:underline font-semibold ml-1.5"
                                          >
                                            [Ubah]
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                }

                                // Regular lesson row
                                return (
                                  <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2 px-1 text-center font-bold border-r border-slate-200 bg-slate-50 text-slate-700 text-[11px]">
                                      {formatJamDisplay(slot, index)}
                                    </td>
                                    <td 
                                      onClick={() => {
                                        setJamForm({
                                          id: slot.id,
                                          tipe: slot.tipe,
                                          label: slot.label,
                                          jam_ke: slot.jam_ke || '',
                                          durasi_menit: slot.durasi_menit,
                                          keterangan_blok: slot.keterangan_blok || '',
                                          waktu_mulai: startTime
                                        })
                                        setShowJamModal(true)
                                      }}
                                      className="py-1.5 px-1 text-center border-r border-slate-200 text-slate-600 font-medium cursor-pointer hover:bg-slate-100 hover:text-indigo-600 transition-all font-mono leading-tight bg-white"
                                    >
                                      <span className="font-semibold text-[10px] block whitespace-nowrap">{startTime}-{endTime}</span>
                                      <span className="text-[9px] text-slate-400 block font-normal">({slot.durasi_menit}m)</span>
                                    </td>
                                    
                                    {filteredClasses.map((cls, colIndex) => {
                                      const sched = jadwals.find(j => j.kelas === cls && j.jam_ke === slot.jam_ke)
                                      const isClashing = sched?.guru_id && conflictsBySlot[slot.jam_ke]?.has(sched.guru_id)
                                      const cellKey = `${slot.id}_${cls}`
                                      
                                      const currentCode = getScheduleDisplayCode(sched)

                                      const val = cellInputValues[cellKey] !== undefined ? cellInputValues[cellKey] : currentCode

                                      return (
                                        <td
                                          key={`${cls}-${slot.id}`}
                                          onDoubleClick={() => {
                                            setSelectedCell({
                                              kelas: cls,
                                              slotId: slot.id,
                                              slotLabel: slot.label,
                                              jam_ke: slot.jam_ke,
                                              waktu_mulai: slot.waktu_mulai,
                                              waktu_selesai: endTime
                                            })
                                            setCellForm({
                                              id: sched?.id || '',
                                              guru_id: sched?.guru_id || '',
                                              mata_pelajaran_id: sched?.mata_pelajaran_id || '',
                                              is_blok: false,
                                              keterangan_blok: ''
                                            })
                                            setCellGuruSearch('')
                                            setCellMapelSearch('')
                                            setShowCellModal(true)
                                          }}
                                          className={`py-1 px-0.5 border-r border-slate-200 text-center transition-all ${
                                            isClashing 
                                              ? 'bg-rose-50/80 ring-1 ring-inset ring-rose-400' 
                                              : sched 
                                              ? 'bg-white' 
                                              : 'bg-slate-50/30'
                                          }`}
                                        >
                                          <div className="flex flex-col items-center justify-center gap-0.5 w-full">
                                            <input
                                              type="text"
                                              data-sched-row={index}
                                              data-sched-col={colIndex}
                                              value={val}
                                              placeholder="-"
                                              onFocus={e => e.target.select()}
                                              onChange={e => {
                                                const newVal = e.target.value
                                                setCellInputValues(prev => ({ ...prev, [cellKey]: newVal }))
                                              }}
                                              onBlur={e => handleInlineCodeBlur(slot, cls, e.target.value)}
                                              onKeyDown={e => handleCellKeyDown(e, index, colIndex, slot, cls)}
                                              className={`w-full max-w-[46px] text-center font-mono font-bold text-xs py-0.5 px-0.5 border rounded-md transition-all outline-none ${
                                                isClashing
                                                  ? 'border-rose-400 bg-rose-50 text-rose-800 focus:ring-2 focus:ring-rose-300'
                                                  : sched
                                                  ? 'border-slate-300 bg-slate-50/80 text-slate-800 hover:border-indigo-400 hover:bg-white focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                                                  : 'border-dashed border-slate-200 bg-transparent text-slate-400 hover:border-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                                              }`}
                                              title="Ketik kode guru (contoh: 7, 6, 13, 2). Geser sel dengan tombol panah (↑ ↓ ← → / Enter). Klik ganda untuk buka detail."
                                            />

                                            {sched && (
                                              <div className="flex flex-col items-center gap-0.5 w-full">
                                                <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded truncate max-w-[95%] block" title={sched.mata_pelajaran?.nama}>
                                                  {sched.mata_pelajaran?.singkatan || sched.mata_pelajaran?.nama}
                                                </span>
                                                {isClashing && (
                                                  <span className="text-[7.5px] font-bold text-rose-600 leading-none">
                                                    Bentrok
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* B. MODE PER KELAS (CARD TIMELINE UNTUK HP) */}
                      {adminViewMode === 'card' && (
                        <div className="space-y-3">
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Mode Mobile-Card</span>
                              <h3 className="text-base font-bold text-slate-900">
                                Jadwal Kelas {selectedCardClass} ({activeHari})
                              </h3>
                            </div>
                            <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                              Semester {activeSemester}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {slots.map((slot, index) => {
                              const startTime = slot.waktu_mulai.slice(0, 5)
                              const [h, m] = startTime.split(':').map(Number)
                              let endM = m + slot.durasi_menit
                              let endH = h + Math.floor(endM / 60)
                              endM = endM % 60
                              const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

                              if (slot.tipe !== 'pelajaran') {
                                return (
                                  <div 
                                    key={slot.id}
                                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                                  >
                                    <div>
                                      <h4 className="font-semibold text-slate-800 uppercase">{slot.keterangan_blok || slot.label}</h4>
                                      <span className="text-[10px] text-slate-400">{slot.durasi_menit} menit</span>
                                    </div>
                                    <span className="font-mono font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                      {startTime} - {endTime}
                                    </span>
                                  </div>
                                )
                              }

                              const sched = jadwals.find(j => j.kelas === selectedCardClass && j.jam_ke === slot.jam_ke)
                              const isClashing = sched?.guru_id && conflictsBySlot[slot.jam_ke]?.has(sched.guru_id)

                              return (
                                <div
                                  key={slot.id}
                                  onClick={() => {
                                    setSelectedCell({
                                      kelas: selectedCardClass,
                                      slotId: slot.id,
                                      slotLabel: slot.label,
                                      jam_ke: slot.jam_ke,
                                      waktu_mulai: slot.waktu_mulai,
                                      waktu_selesai: endTime
                                    })
                                    setCellForm({
                                      id: sched?.id || '',
                                      guru_id: sched?.guru_id || '',
                                      mata_pelajaran_id: sched?.mata_pelajaran_id || '',
                                      is_blok: false,
                                      keterangan_blok: ''
                                    })
                                    setCellGuruSearch('')
                                    setCellMapelSearch('')
                                    setShowCellModal(true)
                                  }}
                                  className={`p-3.5 rounded-xl border bg-white transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                    isClashing 
                                      ? 'border-rose-300 bg-rose-50/50' 
                                      : sched 
                                      ? 'border-slate-200 hover:border-indigo-300 shadow-xs' 
                                      : 'border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex flex-col items-center justify-center font-bold text-slate-700 shrink-0">
                                      <span className="text-[9px] uppercase opacity-75">Jam</span>
                                      <span className="text-xs">{formatJamDisplay(slot, index)}</span>
                                    </div>

                                    <div>
                                      {sched ? (
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-900 text-sm">
                                              {sched.mata_pelajaran?.nama || sched.mata_pelajaran?.singkatan}
                                            </h4>
                                            {isClashing && (
                                              <span className="text-[9px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded">
                                                Bentrok
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-xs text-slate-500 mt-0.5">
                                            {sched.guru?.nama_guru} {(getScheduleDisplayCode(sched) || sched.guru?.kode) ? `[Kode ${getScheduleDisplayCode(sched) || sched.guru?.kode}]` : ''}
                                          </p>
                                        </div>
                                      ) : (
                                        <div>
                                          <h4 className="font-semibold text-slate-400 text-xs">Belum Diisi</h4>
                                          <p className="text-[11px] text-indigo-600 font-semibold">+ Ketuk untuk atur mapel</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-semibold text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 block">
                                      {startTime} - {endTime}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TARGET BEBAN MENGAJAR */}
              {activeTab === 'beban' && (
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-xl p-4 overflow-y-auto max-h-[70vh] shadow-xs">
                    <h3 className="font-bold text-sm text-slate-900 mb-3 border-b pb-2">Pilih Guru Pengajar</h3>
                    <div className="space-y-1">
                      {gurus.map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleSelectGuruBeban(g)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                            selectedGuruBeban?.id === g.id 
                              ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {g.nama_guru}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-5">
                    {selectedGuruBeban ? (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
                        <div className="flex justify-between items-start border-b pb-3">
                          <div>
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Set Beban Mengajar</span>
                            <h3 className="font-bold text-base text-slate-900 mt-0.5">{selectedGuruBeban.nama_guru}</h3>
                          </div>
                          <button 
                            onClick={() => setSelectedGuruBeban(null)}
                            className="text-xs font-bold text-slate-400 hover:text-slate-600"
                          >
                            ✕ Tutup
                          </button>
                        </div>

                        <form onSubmit={handleAddBeban} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Mata Pelajaran</label>
                            {guruBebanMapels.length > 1 ? (
                              <select
                                required
                                value={bebanForm.mata_pelajaran_id}
                                onChange={e => handleMapelChange(e.target.value)}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold"
                              >
                                <option value="">-- Pilih Mapel --</option>
                                {guruBebanMapels.map(m => (
                                  <option key={m.id} value={m.id}>{m.nama}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="px-3 py-2 border rounded-xl bg-slate-50 text-xs font-semibold text-slate-700">
                                {guruBebanMapels[0]?.nama || 'Mapel tidak diset'}
                              </div>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Target Kelas</label>
                            <div className="px-3 py-2 border rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 truncate">
                              {getKelasKandidat().length > 0 ? getKelasKandidat().join(', ') : 'Belum diset'}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Jam/Mgg</label>
                              <input 
                                type="number" 
                                required 
                                min="1" 
                                value={bebanForm.jam_per_minggu}
                                onChange={e => setBebanForm(prev => ({ ...prev, jam_per_minggu: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white text-center font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Maks/Hari</label>
                              <input 
                                type="number" 
                                required 
                                min="1" 
                                value={bebanForm.maks_jam_per_hari}
                                onChange={e => setBebanForm(prev => ({ ...prev, maks_jam_per_hari: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white text-center font-bold"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Kode Guru</label>
                            <input 
                              type="text" 
                              required
                              placeholder="Misal: 8.1"
                              value={bebanForm.kode_guru}
                              onChange={e => setBebanForm(prev => ({ ...prev, kode_guru: e.target.value }))}
                              className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-mono font-bold"
                            />
                          </div>

                          <button 
                            type="submit" 
                            disabled={saving || getKelasKandidat().length === 0}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium shadow-sm transition-colors"
                          >
                            + Terapkan
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-medium">
                        Silakan pilih nama guru di panel sebelah kiri untuk mengatur beban mengajar.
                      </div>
                    )}

                    {/* Sisa Beban */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5">
                      <h3 className="font-bold text-sm text-slate-900 mb-3">
                        Sisa Jam Beban Belum Terjadwal
                      </h3>

                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                            <tr>
                              <th className="p-3">Nama Guru</th>
                              <th className="p-3">Mapel</th>
                              <th className="p-3">Kelas</th>
                              <th className="p-3 text-center">Target</th>
                              <th className="p-3 text-center">Terjadwal</th>
                              <th className="p-3 text-center">Sisa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sisaBebanList.length === 0 ? (
                              <tr>
                                <td colSpan="6" className="p-5 text-center text-emerald-600 font-semibold">
                                  Semua beban mengajar guru telah sukses dijadwalkan.
                                </td>
                              </tr>
                            ) : (
                              sisaBebanList.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-3 font-semibold text-slate-800">{item.guru?.nama_guru.split(',')[0]}</td>
                                  <td className="p-3 text-slate-600">{item.mata_pelajaran?.nama}</td>
                                  <td className="p-3 font-mono font-semibold">{item.kelas}</td>
                                  <td className="p-3 text-center">{item.jam_per_minggu} jam</td>
                                  <td className="p-3 text-center">{item.terjadwal} jam</td>
                                  <td className="p-3 text-center">
                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded border border-rose-200 text-[10px]">
                                      {item.sisa} jam
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CATATAN & EKSKUL */}
              {activeTab === 'catatan_ekskul' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Catatan Kurikulum */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-sm text-slate-900">
                      Catatan Kurikulum
                    </h3>
                    
                    <form onSubmit={handleAddCatatan} className="flex gap-2">
                      <input 
                        type="text"
                        required
                        value={newCatatan}
                        onChange={e => setNewCatatan(e.target.value)}
                        placeholder="Ketik catatan kurikulum baru..."
                        className="flex-1 px-3 py-2 border rounded-xl text-xs bg-slate-50 focus:bg-white"
                      />
                      <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors shadow-sm">
                        Simpan
                      </button>
                    </form>

                    <div className="space-y-2">
                      {catatanList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Belum ada catatan kurikulum.</p>
                      ) : (
                        catatanList.map((c, index) => (
                          <div key={c.id} className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between text-xs">
                            <span className="text-slate-700">{index + 1}. {c.isi_catatan}</span>
                            <button 
                              onClick={async () => {
                                await supabase.from('jadwal_catatan').delete().eq('id', c.id)
                                await fetchInitialData(true)
                              }}
                              className="text-rose-500 hover:text-rose-700 font-bold ml-2 shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Jadwal Ekskul */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-sm text-slate-900">
                      Jadwal Ekstrakurikuler
                    </h3>

                    <form onSubmit={handleAddEkskul} className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border text-xs">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Nama Ekskul</label>
                        <input 
                          type="text"
                          required
                          value={newEkskul.nama}
                          onChange={e => setNewEkskul(prev => ({ ...prev, nama: e.target.value }))}
                          placeholder="Misal: Pramuka, Basket"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Hari</label>
                        <select
                          value={newEkskul.hari}
                          onChange={e => setNewEkskul(prev => ({ ...prev, hari: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        >
                          {HARI_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Waktu</label>
                        <input 
                          type="text"
                          required
                          value={newEkskul.waktu}
                          onChange={e => setNewEkskul(prev => ({ ...prev, waktu: e.target.value }))}
                          placeholder="Misal: 14:30 - 15:30"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Pembina/Pelatih</label>
                        <input 
                          type="text"
                          value={newEkskul.pembina}
                          onChange={e => setNewEkskul(prev => ({ ...prev, pembina: e.target.value }))}
                          placeholder="Nama Pembina"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <button type="submit" className="col-span-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm">
                        + Tambah Ekskul
                      </button>
                    </form>

                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 font-semibold text-slate-600">
                          <tr>
                            <th className="p-2.5">Nama</th>
                            <th className="p-2.5">Hari & Waktu</th>
                            <th className="p-2.5">Pembina</th>
                            <th className="p-2.5 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ekskulList.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-4 text-center text-slate-400 italic">Belum ada ekskul.</td>
                            </tr>
                          ) : (
                            ekskulList.map(el => (
                              <tr key={el.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-semibold text-slate-800">{el.nama}</td>
                                <td className="p-2.5 text-slate-600">{el.hari}, {el.waktu}</td>
                                <td className="p-2.5 text-slate-600">{el.pembina || '-'}</td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={async () => {
                                      await supabase.from('jadwal_ekskul').delete().eq('id', el.id)
                                      await fetchInitialData(true)
                                    }}
                                    className="text-rose-500 hover:text-rose-700 font-bold"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: IMPORT EXCEL */}
              {activeTab === 'import' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Import Jadwal Pelajaran (Excel)
                      </h3>
                      <p className="text-xs text-slate-500 max-w-xl mt-0.5">
                        Unduh template Excel resmi, isi susunan jadwal per kelas, lalu unggah kembali berkasnya. Sistem otomatis membaca sheet <strong className="text-slate-800">"CETAK JADWAL"</strong> dan memetakan kode guru ke Semester <strong className="text-indigo-600 font-bold">{schoolActiveSemester}</strong>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportTemplateExcel}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shrink-0"
                    >
                      Unduh Template Excel (.xlsx)
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/60 transition-colors flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm mb-2 shadow-xs">
                      XLSX
                    </div>
                    
                    <input 
                      type="file" 
                      id="excel-upload"
                      accept=".xlsx, .xls"
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files[0]
                        if (!file) return
                        setSaving(true)
                        
                        try {
                          const XLSX = await import('xlsx')
                          const reader = new FileReader()
                          reader.onload = async (evt) => {
                            try {
                              const bstr = evt.target.result
                              const wb = XLSX.read(bstr, { type: 'binary' })
                              const sheetName = wb.SheetNames.find(s => s.toUpperCase().includes('CETAK'))
                              
                              if (!sheetName) {
                                alert('Sheet "CETAK JADWAL" tidak ditemukan di berkas Excel.')
                                setSaving(false)
                                return
                              }

                              const ws = wb.Sheets[sheetName]
                              const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
                              
                              let totalParsedCount = 0
                              const allImports = []
                              const HARI_MAP = {
                                'Senin': 'SENIN',
                                'Selasa': 'SELASA',
                                'Rabu': 'RABU',
                                'Kamis': 'KAMIS',
                                'Jumat': 'JUMAT'
                              }

                              const { data: dbSlots } = await supabase
                                .from('jadwal_slot_waktu')
                                .select('*')
                                .eq('tahun_ajaran_id', activeTa.id)
                                .eq('semester', schoolActiveSemester)

                              for (const [hariName, targetLabel] of Object.entries(HARI_MAP)) {
                                let dayRowIdx = -1
                                let dayColIdx = -1

                                for (let r = 0; r < data.length; r++) {
                                  const row = data[r]
                                  for (let c = 0; c < row.length; c++) {
                                    const val = String(row[c]).toUpperCase().trim()
                                    if (val === targetLabel) {
                                      dayRowIdx = r
                                      dayColIdx = c
                                      break
                                    }
                                  }
                                  if (dayRowIdx !== -1) break
                                }

                                if (dayRowIdx === -1) continue

                                let headerRowIdx = -1
                                for (let r = dayRowIdx + 1; r < Math.min(dayRowIdx + 5, data.length); r++) {
                                  const row = data[r]
                                  const val1 = String(row[dayColIdx]).toLowerCase().trim()
                                  const val2 = String(row[dayColIdx + 1]).toLowerCase().trim()
                                  if (val1 === 'jam' || val2 === 'jam') {
                                    headerRowIdx = r
                                    break
                                  }
                                }

                                if (headerRowIdx === -1) continue
                                const headerRow = data[headerRowIdx]
                                let jamColIdx = dayColIdx
                                if (String(headerRow[dayColIdx + 1]).toLowerCase().trim() === 'jam') {
                                  jamColIdx = dayColIdx + 1
                                }

                                const classCols = {}
                                for (let c = jamColIdx + 2; c < headerRow.length; c++) {
                                  const clsName = String(headerRow[c]).toUpperCase().trim()
                                  if (classes.includes(clsName)) {
                                    classCols[clsName] = c
                                  }
                                }

                                for (let r = headerRowIdx + 1; r < data.length; r++) {
                                  const row = data[r]
                                  if (!row || row.length === 0) continue

                                  const firstFew = row.slice(0, 5).map(v => String(v || '').toUpperCase().trim())
                                  if (firstFew.some(v => HARI_LIST.map(h => h.toUpperCase()).includes(v))) {
                                    break
                                  }

                                  const jamVal = String(row[jamColIdx] ?? '').trim()
                                  if (!jamVal || isNaN(parseInt(jamVal))) {
                                    continue
                                  }

                                  const jamNum = parseInt(jamVal)
                                  for (const [cls, colIdx] of Object.entries(classCols)) {
                                    const cellVal = String(row[colIdx] || '').trim()
                                    if (!cellVal) continue

                                    // Abaikan teks nama kegiatan/blok/istirahat
                                    const upperVal = cellVal.toUpperCase()
                                    if (['DOA', 'ISTIRAHAT', 'UPACARA', 'PERWALIAN', 'LIBUR', 'KEGIATAN', 'PERSIAPAN'].some(act => upperVal.includes(act))) {
                                      continue
                                    }

                                    const resolved = resolveTeacherCode(cellVal, cls)
                                    if (resolved?.guru_id) {
                                      const matchedSlot = (dbSlots || []).find(s => s.hari === hariName && s.jam_ke === jamNum)
                                      let wMulai = '07:00:00'
                                      let wSelesai = '07:40:00'
                                      if (matchedSlot?.waktu_mulai) {
                                        wMulai = matchedSlot.waktu_mulai
                                        const [sh, sm] = matchedSlot.waktu_mulai.slice(0, 5).split(':').map(Number)
                                        let em = (sm || 0) + (matchedSlot.durasi_menit || 40)
                                        let eh = (sh || 7) + Math.floor(em / 60)
                                        em = em % 60
                                        wSelesai = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`
                                      }

                                      allImports.push({
                                        tahun_ajaran_id: activeTa.id,
                                        semester: schoolActiveSemester,
                                        hari: hariName,
                                        kelas: cls,
                                        jam_ke: jamNum,
                                        guru_id: resolved.guru_id,
                                        mata_pelajaran_id: resolved.mata_pelajaran_id || null,
                                        waktu_mulai: wMulai,
                                        waktu_selesai: wSelesai
                                      })
                                      totalParsedCount++
                                    }
                                  }
                                }
                              }

                              if (allImports.length > 0) {
                                const importedDays = [...new Set(allImports.map(i => i.hari))]
                                await supabase
                                  .from('jadwal_pelajaran')
                                  .delete()
                                  .eq('tahun_ajaran_id', activeTa.id)
                                  .eq('semester', schoolActiveSemester)
                                  .in('hari', importedDays)

                                const { error: insErr } = await supabase.from('jadwal_pelajaran').insert(allImports)
                                if (insErr) throw insErr
                                alert(`Sukses mengimpor ${totalParsedCount} jadwal pelajaran ke Semester ${schoolActiveSemester}!`)
                                await fetchInitialData()
                              } else {
                                alert('Tidak ada baris jadwal yang cocok untuk diimpor. Pastikan Anda mengisi kode guru sesuai lembar DAFTAR KODE GURU.')
                              }
                            } catch (err) {
                              alert('Gagal memproses excel: ' + err.message)
                            } finally {
                              setSaving(false)
                            }
                          }
                          reader.readAsBinaryString(file)
                        } catch (err) {
                          alert('Gagal membaca file: ' + err.message)
                          setSaving(false)
                        }
                      }}
                    />
                    
                    <label 
                      htmlFor="excel-upload"
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors shadow-sm cursor-pointer"
                    >
                      {saving ? 'Sedang Memproses...' : 'Pilih Berkas Excel'}
                    </label>
                    <span className="text-[11px] text-slate-400 mt-2">Format .xlsx atau .xls</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODAL 1: CELL JADWAL (STANDAR MODAL APP) */}
      {showCellModal && selectedCell && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCell} className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Atur Jadwal: {selectedCell.kelas || 'Semua Kelas'} ({activeHari})
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Jam Ke-{selectedCell.jam_ke || selectedCell.slotLabel} ({selectedCell.waktu_mulai?.slice(0, 5)} - {selectedCell.waktu_selesai})
                </p>
              </div>
              <button type="button" onClick={() => setShowCellModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <input 
                  type="checkbox"
                  id="is_blok"
                  checked={cellForm.is_blok}
                  onChange={e => setCellForm(prev => ({ ...prev, is_blok: e.target.checked }))}
                  className="rounded text-indigo-600 h-4 w-4"
                />
                <label htmlFor="is_blok" className="font-semibold text-slate-700 select-none cursor-pointer">
                  Jadikan Blok Khusus Seluruh Kelas (Upacara / Doa / dsb)
                </label>
              </div>

              {cellForm.is_blok ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Kegiatan Blok</label>
                  <input 
                    type="text"
                    required
                    value={cellForm.keterangan_blok}
                    onChange={e => setCellForm(prev => ({ ...prev, keterangan_blok: e.target.value }))}
                    placeholder="Misal: IBADAT / UPACARA, ISTIRAHAT"
                    className="w-full px-3 py-2 border rounded-xl text-xs bg-white"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                    <input
                      type="text"
                      placeholder="Cari mata pelajaran..."
                      value={cellMapelSearch}
                      onChange={e => setCellMapelSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-1.5 border rounded-xl bg-slate-50 text-xs"
                    />
                    <select
                      value={cellForm.mata_pelajaran_id}
                      onChange={e => setCellForm(prev => ({ ...prev, mata_pelajaran_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold"
                    >
                      <option value="">-- Pilih Mapel --</option>
                      {cellModalMapels.map(m => (
                        <option key={m.id} value={m.id}>{m.nama} ({m.singkatan})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Guru Pengajar</label>
                    <input
                      type="text"
                      placeholder="Cari nama guru / kode..."
                      value={cellGuruSearch}
                      onChange={e => setCellGuruSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-1.5 border rounded-xl bg-slate-50 text-xs"
                    />
                    <select
                      value={cellForm.guru_id}
                      onChange={e => setCellForm(prev => ({ ...prev, guru_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold"
                    >
                      <option value="">-- Pilih Guru --</option>
                      {cellModalGurus.map(g => {
                        const subjects = getTeacherSubjectsWithCodes(g)
                        const codesStr = subjects.map(s => `${s.code} (${s.singkatan})`).join(', ')
                        return (
                          <option key={g.id} value={g.id}>
                            {g.nama_guru} {codesStr ? `[Kode: ${codesStr}]` : (g.kode ? `[Kode ${g.kode}]` : '')}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs">
              {cellForm.id ? (
                <button
                  type="button"
                  onClick={() => handleDeleteCell(cellForm.id)}
                  disabled={saving}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-semibold rounded-xl transition-colors"
                >
                  Hapus
                </button>
              ) : <div />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCellModal(false)}
                  className="px-4 py-2 border hover:bg-white text-slate-700 font-medium rounded-xl shadow-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: SETUP JAM / SLOT WAKTU */}
      {showJamModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveJamSlot} className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-sm text-slate-800">
              Atur Slot Jam Pelajaran
            </div>

            <div className="p-5 space-y-4 text-xs">
              {slots[0]?.id === jamForm.id && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Waktu Mulai Awal Hari ({activeHari})</label>
                  <input 
                    type="time"
                    required
                    value={jamForm.waktu_mulai}
                    onChange={e => setJamForm(prev => ({ ...prev, waktu_mulai: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipe Slot</label>
                <select
                  value={jamForm.tipe}
                  onChange={e => setJamForm(prev => ({ ...prev, tipe: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold"
                >
                  <option value="pelajaran">Jam Pelajaran Reguler</option>
                  <option value="istirahat">Istirahat</option>
                  <option value="persiapan">Persiapan KBM (Doa / GLS)</option>
                  <option value="penutup">Penutup / Pulang</option>
                  <option value="blok_khusus">Blok Kegiatan Khusus</option>
                </select>
              </div>

              {jamForm.tipe === 'pelajaran' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nomor Jam</label>
                    <input 
                      type="number"
                      required
                      placeholder="Contoh: 1"
                      value={jamForm.jam_ke}
                      onChange={e => setJamForm(prev => ({ ...prev, jam_ke: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Label Tampilan</label>
                    <input 
                      type="text"
                      required
                      placeholder="Contoh: I"
                      value={jamForm.label}
                      onChange={e => setJamForm(prev => ({ ...prev, label: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Keterangan Kegiatan</label>
                  <input 
                    type="text"
                    required
                    placeholder="Contoh: ISTIRAHAT 1, UPACARA"
                    value={jamForm.keterangan_blok}
                    onChange={e => setJamForm(prev => ({ ...prev, keterangan_blok: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
                <input 
                  type="number"
                  required
                  min="5"
                  value={jamForm.durasi_menit}
                  onChange={e => setJamForm(prev => ({ ...prev, durasi_menit: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setShowJamModal(false)} className="px-4 py-2 border hover:bg-white text-slate-700 font-medium rounded-xl shadow-xs">Batal</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: SALIN JADWAL ANTAR SEMESTER */}
      {showCopySemModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6 border border-slate-100 space-y-4 animate-scale-up">
            <div>
              <h3 className="font-bold text-base text-slate-900">Salin Jadwal Antar Semester</h3>
              <p className="text-xs text-slate-500 mt-0.5">Duplikasi seluruh susunan jam dan jadwal pelajaran dari satu semester ke semester lain.</p>
            </div>

            <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Semester Sumber (Asal)</label>
                <select
                  value={copySourceSem}
                  onChange={e => setCopySourceSem(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl bg-white font-bold"
                >
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
              </div>

              <div className="text-center font-bold text-indigo-600 text-xs">
                Akan disalin ke
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Semester Target (Tujuan)</label>
                <div className="px-3 py-2 bg-white border border-indigo-200 rounded-xl font-bold text-indigo-900">
                  Semester {activeSemester} (Sedang Aktif Dibuka)
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => setShowCopySemModal(false)}
                className="px-4 py-2 border rounded-xl font-medium hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCopySemester}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-colors"
              >
                {saving ? 'Sedang Menyalin...' : 'Mulai Salin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: KONFIRMASI KOSONGKAN JADWAL */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                !
              </div>
              <h3 className="text-base font-bold text-slate-900">Kosongkan Jadwal Pelajaran</h3>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Apakah Anda yakin ingin mengosongkan seluruh jadwal pelajaran untuk hari <strong className="text-slate-800">{activeHari}</strong> Semester <strong className="text-slate-800">{activeSemester}</strong>?
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Catatan: Slot waktu (jam & istirahat) tidak akan terhapus, hanya isi guru & mapel yang dibersihkan.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 text-xs">
              <button 
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 border bg-white hover:bg-slate-100 text-slate-700 font-medium rounded-xl"
              >
                Batalkan
              </button>
              <button 
                onClick={async () => {
                  setShowClearConfirmModal(false)
                  await executeClearJadwal()
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl shadow-sm transition-colors"
              >
                Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: REFERENSI DAFTAR GURU & KODE */}
      {showGuruRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Daftar Guru & Kode Pengajar</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Referensi kode guru untuk pengisian jadwal pelajaran</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowGuruRef(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold text-sm p-1 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-slate-100 bg-white">
              <input 
                type="text"
                autoFocus
                placeholder="Cari guru atau kode..."
                value={guruRefSearch}
                onChange={e => setGuruRefSearch(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="p-3 overflow-y-auto space-y-1.5 flex-1 scrollbar-thin">
              {filteredGurus.length === 0 ? (
                <p className="text-slate-400 italic text-center py-6 text-xs">Tidak ditemukan guru yang cocok.</p>
              ) : (
                filteredGurus.map(g => {
                  const subjects = getTeacherSubjectsWithCodes(g)
                  const kelasList = [...new Set(g.guru_mapel?.map(m => m.kelas).filter(Boolean))].sort().join(', ')

                  return (
                    <div key={g.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:bg-indigo-50/50 transition-colors">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 text-xs truncate">{g.nama_guru}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {kelasList ? `Kelas: ${kelasList}` : 'Semua Kelas'}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                        {subjects.length > 0 ? (
                          subjects.map(sub => (
                            <div 
                              key={sub.mata_pelajaran_id || sub.code}
                              className="flex items-center gap-1 bg-white border border-indigo-200 px-2 py-1 rounded-lg shadow-2xs"
                              title={`${sub.nama} (${sub.singkatan})`}
                            >
                              <span className="font-mono font-bold text-xs text-indigo-700">{sub.code}</span>
                              <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-50 px-1 py-0.2 rounded">
                                {sub.singkatan || sub.nama}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="font-mono font-bold text-xs text-indigo-700 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg shadow-2xs block">
                            {g.kode || '-'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuruRef(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
