import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { getSemesterAktif } from '../utils/semesterUtils'
import {
  getKriteriaEkskul,
  saveKriteriaEkskul,
  getMasterEkskul,
  saveMasterEkskul,
  createMasterEkskulItem,
  updateMasterEkskulItem,
  deleteMasterEkskulItem,
  deleteAllMasterEkskul,
  deleteBatchMasterEkskul,
  checkEkskulDatabaseStatus,
  getNilaiEkskulKelas,
  getAllNilaiEkskul,
  saveNilaiEkskulBatch,
  getBestEkskulMatch,
  isIgnoredEkskulText,
  DEFAULT_KRITERIA_PRAMUKA,
  DEFAULT_KRITERIA_UMUM,
  DEFAULT_KRITERIA_EKSKUL,
  DEFAULT_MASTER_EKSKUL
} from '../utils/ekskulService'

// ─── Roman Numeral Formatter for Classes ──────────────────────────────────────
const toRomanClass = (kelasStr) => {
  if (!kelasStr) return ''
  const trimmed = String(kelasStr).trim().toUpperCase()
  const match = trimmed.match(/^(9|8|7|IX|VIII|VII)[\s\-_]*([A-Z0-9]+)?$/i)
  if (match) {
    const grade = match[1].toUpperCase()
    const sub = match[2] || ''
    let roman = grade
    if (grade === '9') roman = 'IX'
    else if (grade === '8') roman = 'VIII'
    else if (grade === '7') roman = 'VII'
    return sub ? `${roman}-${sub}` : roman
  }
  return trimmed
}

// ─── Sorter for Students by Class Rank (7A-9D) and Name ────────────────────────
const sortStudentsByClassAndName = (list) => {
  const parseClassNum = (k) => {
    const m = String(k || '').match(/\d+/)
    return m ? parseInt(m[0], 10) : 99
  }
  return list.slice().sort((a, b) => {
    const numA = parseClassNum(a.kelas)
    const numB = parseClassNum(b.kelas)
    if (numA !== numB) return numA - numB
    const classComp = String(a.kelas || '').localeCompare(String(b.kelas || ''))
    if (classComp !== 0) return classComp
    return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))
  })
}

export default function AdminEkskulSection({ session, activeTa }) {
  // ─── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('nilai') // 'nilai' | 'kriteria' | 'master'

  // ─── Filter States ─────────────────────────────────────────────────────────
  const [allKelasList, setAllKelasList] = useState([])
  const [selectedKelas, setSelectedKelas] = useState('')
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // ─── Tampilan Kelas Biasa vs Kelas Ekskul States ────────────────────────────
  const [viewMode, setViewMode] = useState('kelas') // 'kelas' | 'ekskul'
  const [selectedEkskulFilter, setSelectedEkskulFilter] = useState('')
  const [selectedEkskulSubKelas, setSelectedEkskulSubKelas] = useState('ALL')
  const [allStudents, setAllStudents] = useState([])
  const [allNilaiMap, setAllNilaiMap] = useState({})
  const [showClearDropdown, setShowClearDropdown] = useState(false)

  // ─── Filter Siswa Belum Dinilai States ─────────────────────────────────────
  const [filterMissingMode, setFilterMissingMode] = useState('all') // 'all' | 'missing_any' | 'missing_ekskul' | 'missing_pramuka' | 'complete'
  const [filterEkskulMissingOnly, setFilterEkskulMissingOnly] = useState(false)
  const [showUnassignedModal, setShowUnassignedModal] = useState(false)
  const [unassignedSearchQuery, setUnassignedSearchQuery] = useState('')
  const [unassignedClassFilter, setUnassignedClassFilter] = useState('ALL')
  const [savingUnassigned, setSavingUnassigned] = useState(false)

  // ─── Data States ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [students, setStudents] = useState([])
  const [kriteriaPramuka, setKriteriaPramuka] = useState(DEFAULT_KRITERIA_PRAMUKA)
  const [kriteriaUmum, setKriteriaUmum] = useState(DEFAULT_KRITERIA_UMUM)
  const [activeKriteriaKategori, setActiveKriteriaKategori] = useState('pramuka') // 'pramuka' | 'umum'
  const [masterEkskul, setMasterEkskul] = useState(DEFAULT_MASTER_EKSKUL)
  const [guruList, setGuruList] = useState(() => {
    try {
      const raw = localStorage.getItem('ebudimulia_guru_list')
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  })
  const [nilaiMap, setNilaiMap] = useState({}) // { [nisn]: { pramuka_nilai, ... } }
  const [hasChanges, setHasChanges] = useState(false)
  const [alertInfo, setAlertInfo] = useState(null)
  const [dbStatus, setDbStatus] = useState({ isReady: true, missingTables: [] })

  // ─── Modal States ──────────────────────────────────────────────────────────
  const [showEkskulModal, setShowEkskulModal] = useState(false)
  const [editingEkskul, setEditingEkskul] = useState(null)
  const [ekskulForm, setEkskulForm] = useState({ nama: '', jenis: 'utama', pembina: '', guru_id: '', guru_nama: '', hari: '', waktu: '' })

  // ─── Export Modal States ───────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScope, setExportScope] = useState('full') // 'full' | 'master_only' | 'nilai_current' | 'nilai_all' | 'template'
  const [exportFormat, setExportFormat] = useState('multi_sheet') // 'multi_sheet' | 'single_sheet'
  const [exportSelectedClasses, setExportSelectedClasses] = useState([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  // ─── Excel Import States ───────────────────────────────────────────────────
  const fileInputRef = useRef(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importSummary, setImportSummary] = useState({ total: 0, classes: [], validCount: 0 })
  const [rawEkskulList, setRawEkskulList] = useState([])
  const [ekskulMapping, setEkskulMapping] = useState({})
  const [rawRowsCache, setRawRowsCache] = useState([])

  // ─── Selected items for bulk deletion ──────────────────────────────────────
  const [selectedEkskulIds, setSelectedEkskulIds] = useState([])

  // ─── Professional Confirm Modal State ──────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    submessage: '',
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    type: 'danger',
    showKeepPramukaOption: false,
    keepPramuka: true,
    isProcessing: false,
    onConfirm: null
  })

  // ─── Toast alert timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (alertInfo) {
      const timer = setTimeout(() => setAlertInfo(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [alertInfo])

  // ─── 1. Fetch Master Metadata (Classes, Semesters, Kriteria, Master Ekskul) ─
  useEffect(() => {
    const initData = async () => {
      setLoading(true)
      try {
        // Cek apakah tabel modul ekskul sudah dimigrasi di Supabase
        const status = await checkEkskulDatabaseStatus()
        setDbStatus(status)

        let taId = activeTa?.id
        if (!taId) {
          const { data: taData } = await supabase.from('tahun_ajaran').select('id, nama').eq('is_aktif', true).maybeSingle()
          taId = taData?.id
        }

        // Semesters
        let semQuery = supabase.from('semester').select('*').order('nomor')
        if (taId) semQuery = semQuery.eq('tahun_ajaran_id', taId)
        const { data: semData } = await semQuery
        if (semData && semData.length > 0) {
          setSemesters(semData)
          const aktif = getSemesterAktif(semData) || semData[0]
          setSelectedSemesterId(aktif.id)
        }

        // Classes
        let classQuery = supabase.from('siswa_lengkap').select('kelas')
        if (taId) classQuery = classQuery.eq('tahun_ajaran_id', taId)
        let { data: classData } = await classQuery
        if (!classData || classData.length === 0) {
          const { data: fbData } = await supabase.from('siswa_lengkap').select('kelas')
          classData = fbData || []
        }

        if (classData && classData.length > 0) {
          const unique = [...new Set(classData.map(c => (c.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
            const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
            if (numA !== numB) return numA - numB
            return a.localeCompare(b)
          })
          setAllKelasList(unique)
          setExportSelectedClasses(unique)
          if (!selectedKelas && unique.length > 0) {
            setSelectedKelas(unique[0])
          }
        }

        // Kriteria Predikat (Khusus Pramuka & Umum)
        const loadedKriteria = await getKriteriaEkskul(taId)
        if (loadedKriteria) {
          if (loadedKriteria.pramuka && loadedKriteria.umum) {
            setKriteriaPramuka(loadedKriteria.pramuka)
            setKriteriaUmum(loadedKriteria.umum)
          } else if (Array.isArray(loadedKriteria)) {
            const p = loadedKriteria.filter(k => k.kategori === 'pramuka')
            const u = loadedKriteria.filter(k => !k.kategori || k.kategori === 'umum')
            if (p.length > 0) setKriteriaPramuka(p)
            if (u.length > 0) setKriteriaUmum(u)
          }
        }

        // Master Ekskul
        const loadedMaster = await getMasterEkskul(taId)
        if (loadedMaster) setMasterEkskul(loadedMaster)

        // Guru List (untuk penugasan Guru Pengampu Ekskul)
        try {
          const { data: gData } = await supabase.from('guru').select('id, nama_guru, kode').order('nama_guru')
          if (gData && gData.length > 0) {
            setGuruList(gData)
            try {
              localStorage.setItem('ebudimulia_guru_list', JSON.stringify(gData))
            } catch (e) {}
          }
        } catch (e) {
          console.warn('Fetch guru list for ekskul fallback to cache')
        }

      } catch (err) {
        console.error('Error init master ekskul:', err)
      } finally {
        setLoading(false)
      }
    }
    initData()
  }, [activeTa?.id])

  // ─── 2. Fetch Students and Nilai for Selected Class (or All Classes) ──────
  useEffect(() => {
    if (!selectedKelas) return

    const loadClassNilai = async () => {
      setLoading(true)
      try {
        const taId = activeTa?.id

        if (selectedKelas === 'ALL') {
          // Fetch all active students across all classes
          let stdQuery = supabase.from('siswa_lengkap')
            .select('nisn, nipd, nama_lengkap, kelas')
            .eq('is_aktif', true)
          if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
          let { data: stdData } = await stdQuery

          if (!stdData || stdData.length === 0) {
            const { data: fbStds } = await supabase.from('siswa_lengkap')
              .select('nisn, nipd, nama_lengkap, kelas')
              .eq('is_aktif', true)
            stdData = fbStds || []
          }
          setStudents(sortStudentsByClassAndName(stdData || []))

          // Fetch all existing ekskul grades across all classes
          const grades = await getAllNilaiEkskul(selectedSemesterId, taId)
          setNilaiMap(grades || {})
          setHasChanges(false)
        } else {
          // Fetch students in single selected class
          let stdQuery = supabase.from('siswa_lengkap')
            .select('nisn, nipd, nama_lengkap, kelas')
            .eq('kelas', selectedKelas)
          if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
          let { data: stdData } = await stdQuery.order('nama_lengkap', { ascending: true })

          if (!stdData || stdData.length === 0) {
            const { data: fbStds } = await supabase.from('siswa_lengkap')
              .select('nisn, nipd, nama_lengkap, kelas')
              .eq('kelas', selectedKelas)
              .order('nama_lengkap', { ascending: true })
            stdData = fbStds || []
          }
          setStudents(stdData || [])

          // Fetch existing ekskul grades for this class
          const grades = await getNilaiEkskulKelas(selectedKelas, selectedSemesterId, taId)
          setNilaiMap(grades || {})
          setHasChanges(false)
        }
      } catch (err) {
        console.error('Error loading class ekskul grades:', err)
      } finally {
        setLoading(false)
      }
    }

    loadClassNilai()
  }, [selectedKelas, selectedSemesterId, activeTa?.id])

  // ─── Audit Kelengkapan Nilai Siswa (Mode Kelas) ─────────────────────────────
  const auditStatsKelas = useMemo(() => {
    let total = students.length
    let completeCount = 0
    let missingAnyCount = 0
    let missingEkskulCount = 0
    let missingPramukaCount = 0
    let unassignedEkskulCount = 0

    students.forEach(s => {
      const nisn = String(s.nisn)
      const g = nilaiMap[nisn] || {}
      const hasPramuka = Boolean(g.pramuka_nilai && String(g.pramuka_nilai).trim() !== '')
      const hasEkskulNama = Boolean(g.ekskul_utama_nama && String(g.ekskul_utama_nama).trim() !== '')
      const hasEkskulNilai = Boolean(g.ekskul_utama_nilai && String(g.ekskul_utama_nilai).trim() !== '')
      const isEkskulComplete = hasEkskulNama && hasEkskulNilai

      if (hasPramuka && isEkskulComplete) {
        completeCount++
      } else {
        missingAnyCount++
      }

      if (!hasPramuka) missingPramukaCount++
      if (!isEkskulComplete) missingEkskulCount++
      if (!hasEkskulNama) unassignedEkskulCount++
    })

    return {
      total,
      completeCount,
      missingAnyCount,
      missingEkskulCount,
      missingPramukaCount,
      unassignedEkskulCount
    }
  }, [students, nilaiMap])

  // ─── Filtered Students (Mode Kelas) ─────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    let list = students

    if (filterMissingMode === 'missing_any') {
      list = list.filter(s => {
        const g = nilaiMap[String(s.nisn)] || {}
        const hasPramuka = Boolean(g.pramuka_nilai && String(g.pramuka_nilai).trim() !== '')
        const hasEkskul = Boolean(g.ekskul_utama_nama && g.ekskul_utama_nilai && String(g.ekskul_utama_nilai).trim() !== '')
        return !hasPramuka || !hasEkskul
      })
    } else if (filterMissingMode === 'missing_ekskul') {
      list = list.filter(s => {
        const g = nilaiMap[String(s.nisn)] || {}
        const hasEkskul = Boolean(g.ekskul_utama_nama && g.ekskul_utama_nilai && String(g.ekskul_utama_nilai).trim() !== '')
        return !hasEkskul
      })
    } else if (filterMissingMode === 'missing_pramuka') {
      list = list.filter(s => {
        const g = nilaiMap[String(s.nisn)] || {}
        const hasPramuka = Boolean(g.pramuka_nilai && String(g.pramuka_nilai).trim() !== '')
        return !hasPramuka
      })
    } else if (filterMissingMode === 'complete') {
      list = list.filter(s => {
        const g = nilaiMap[String(s.nisn)] || {}
        const hasPramuka = Boolean(g.pramuka_nilai && String(g.pramuka_nilai).trim() !== '')
        const hasEkskul = Boolean(g.ekskul_utama_nama && g.ekskul_utama_nilai && String(g.ekskul_utama_nilai).trim() !== '')
        return hasPramuka && hasEkskul
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(s =>
        (s.nama_lengkap || '').toLowerCase().includes(q) ||
        String(s.nisn || '').includes(q) ||
        (s.kelas || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [students, nilaiMap, filterMissingMode, searchQuery])

  // ─── Teacher Session & Assignment Detection ─────────────────────────────────
  const activeSession = useMemo(() => {
    if (session && (session.nama_guru || session.id || session.role || session.is_admin)) {
      return session
    }
    try {
      return JSON.parse(localStorage.getItem('guru_session') || '{}')
    } catch (e) {
      return {}
    }
  }, [session])

  const isTeacherSession = useMemo(() => {
    if (!activeSession) return false
    if (activeSession.is_admin === true || activeSession.role === 'admin' || activeSession.app_role === 'admin') {
      return false
    }
    return !!(activeSession.nama_guru || activeSession.id)
  }, [activeSession])

  const teacherAssignedEkskuls = useMemo(() => {
    if (!isTeacherSession) return []
    const myName = (activeSession.nama_guru || '').toLowerCase().trim()
    const myId = String(activeSession.id || '')
    const myKode = (activeSession.kode || '').toLowerCase().trim()

    if (!myName && !myId && !myKode) return []

    const assigned = []
    masterEkskul.forEach(m => {
      const pembinaStr = (m.pembina || '').toLowerCase().trim()
      const guruIdStr = String(m.guru_id || '')
      const guruNamaStr = (m.guru_nama || '').toLowerCase().trim()

      const isMatch =
        (myId && guruIdStr === myId) ||
        (myName && (pembinaStr === myName || guruNamaStr === myName || pembinaStr.includes(myName))) ||
        (myKode && (pembinaStr.includes(myKode) || (m.guru_kode && String(m.guru_kode).toLowerCase() === myKode)))

      if (isMatch && m.nama && (m.nama.toLowerCase() !== 'pramuka' || m.jenis !== 'wajib')) {
        assigned.push(m.nama.trim())
      }
    })

    return Array.from(new Set(assigned))
  }, [isTeacherSession, activeSession, masterEkskul])

  // Available list for selects (Ekstrakurikuler selain Pramuka)
  const ekskulOptions = useMemo(() => {
    let list = masterEkskul.filter(e => (e.nama || '').toLowerCase() !== 'pramuka' && e.jenis !== 'wajib')
    // Jika guru mendapatkan ekskul khusus, hanya tampilkan ekskul yang diampu!
    // Jika tidak ada secara khusus, tampilkan semuanya!
    if (isTeacherSession && teacherAssignedEkskuls.length > 0) {
      const assignedSet = new Set(teacherAssignedEkskuls.map(n => n.toLowerCase()))
      list = list.filter(e => assignedSet.has((e.nama || '').toLowerCase()))
    }
    return list
  }, [masterEkskul, isTeacherSession, teacherAssignedEkskuls])

  // Master ekskul list filtered for teacher session
  const displayedMasterEkskul = useMemo(() => {
    if (isTeacherSession && teacherAssignedEkskuls.length > 0) {
      const assignedSet = new Set(teacherAssignedEkskuls.map(n => n.toLowerCase()))
      return masterEkskul.filter(m => assignedSet.has((m.nama || '').toLowerCase()))
    }
    return masterEkskul
  }, [masterEkskul, isTeacherSession, teacherAssignedEkskuls])

  // ─── Description lookup for predicate (Pramuka vs Umum) ────────────────────
  const getDescForPredikat = (predikat, kategori = 'umum') => {
    if (!predikat) return ''
    const list = kategori === 'pramuka' ? kriteriaPramuka : kriteriaUmum
    const match = list.find(k => String(k.predikat).toUpperCase() === String(predikat).toUpperCase())
    return match ? match.keterangan : ''
  }

  // ─── Fetch All Students and All Nilai Across School for Ekskul View ─────────
  const loadAllStudentsAndNilai = async () => {
    try {
      const taId = activeTa?.id

      // 1. All Active Students
      let stdQuery = supabase.from('siswa_lengkap')
        .select('nisn, nipd, nama_lengkap, kelas')
        .eq('is_aktif', true)
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      let { data: allStds } = await stdQuery.order('nama_lengkap', { ascending: true })
      if (!allStds || allStds.length === 0) {
        const { data: fbStds } = await supabase.from('siswa_lengkap')
          .select('nisn, nipd, nama_lengkap, kelas')
          .order('nama_lengkap', { ascending: true })
        allStds = fbStds || []
      }
      setAllStudents(allStds || [])

      // 2. All Nilai for active semester
      if (selectedSemesterId) {
        const allGrades = await getAllNilaiEkskul(selectedSemesterId, taId)
        setAllNilaiMap(allGrades || {})
      }
    } catch (err) {
      console.error('Error loading all students & nilai for ekskul mode:', err)
    }
  }

  useEffect(() => {
    loadAllStudentsAndNilai()
  }, [activeTa?.id, selectedSemesterId])

  // ─── Available Ekskul List for "Kelas Ekskul" Selector ──────────────────────
  const availableEkskulOptions = useMemo(() => {
    const map = new Map()

    // 1. Dari master kegiatan
    masterEkskul.forEach(m => {
      if (m.nama && m.nama.toLowerCase() !== 'pramuka' && m.jenis !== 'wajib') {
        const trimmed = m.nama.trim()
        map.set(trimmed.toLowerCase(), trimmed)
      }
    })

    // 2. Dari data riil siswa di database (ekskul_utama_nama & ekskul_pilihan_nama)
    Object.values(allNilaiMap).forEach(rec => {
      if (rec.ekskul_utama_nama) {
        const trimmed = rec.ekskul_utama_nama.trim()
        if (!map.has(trimmed.toLowerCase())) {
          map.set(trimmed.toLowerCase(), trimmed)
        }
      }
      if (rec.ekskul_pilihan_nama) {
        const trimmed = rec.ekskul_pilihan_nama.trim()
        if (!map.has(trimmed.toLowerCase())) {
          map.set(trimmed.toLowerCase(), trimmed)
        }
      }
    })

    let allList = Array.from(map.values()).sort((a, b) => a.localeCompare(b))

    // JIKA GURU MENDAPAT EKSKUL KHUSUS, MAKA HANYA TAMPIL EKSKUL YANG DIAMPU!
    // JIKA TIDAK ADA SECARA KHUSUS, MAKA TAMPILKAN SEMUANYA!
    if (isTeacherSession && teacherAssignedEkskuls.length > 0) {
      const assignedSet = new Set(teacherAssignedEkskuls.map(n => n.toLowerCase()))
      allList = allList.filter(name => assignedSet.has(name.toLowerCase()))
      // Pastikan semua ekskul yang diampu tetap ada di opsi
      teacherAssignedEkskuls.forEach(assignedName => {
        if (!allList.some(n => n.toLowerCase() === assignedName.toLowerCase())) {
          allList.push(assignedName)
        }
      })
      allList.sort((a, b) => a.localeCompare(b))
    }

    return allList
  }, [masterEkskul, allNilaiMap, isTeacherSession, teacherAssignedEkskuls])

  // Pastikan ada ekskul default terpilih jika viewMode ekskul
  useEffect(() => {
    if (availableEkskulOptions.length > 0) {
      if (!selectedEkskulFilter || !availableEkskulOptions.includes(selectedEkskulFilter)) {
        setSelectedEkskulFilter(availableEkskulOptions[0])
      }
    }
  }, [availableEkskulOptions, selectedEkskulFilter])

  // Otomatis aktifkan mode kelas ekskul dan pilih ekskul pertama guru pengampu saat login
  useEffect(() => {
    if (isTeacherSession && teacherAssignedEkskuls.length > 0) {
      setViewMode('ekskul')
      if (!selectedEkskulFilter || !teacherAssignedEkskuls.includes(selectedEkskulFilter)) {
        setSelectedEkskulFilter(teacherAssignedEkskuls[0])
      }
    }
  }, [isTeacherSession, teacherAssignedEkskuls])

  // ─── List Siswa Berdasarkan Ekskul Terpilih (Diurutkan Kelas 7A-9D lalu Abjad) ─
  const ekskulStudentsList = useMemo(() => {
    if (!selectedEkskulFilter) return []
    const targetLower = selectedEkskulFilter.trim().toLowerCase()

    const matched = []

    allStudents.forEach(s => {
      const nisn = String(s.nisn)
      const grade = allNilaiMap[nisn] || {}
      const utama = (grade.ekskul_utama_nama || '').trim().toLowerCase()
      const pilihan = (grade.ekskul_pilihan_nama || '').trim().toLowerCase()

      if (utama === targetLower) {
        matched.push({
          ...s,
          ekskulRole: 'utama',
          grade
        })
      } else if (pilihan === targetLower) {
        matched.push({
          ...s,
          ekskulRole: 'pilihan',
          grade
        })
      }
    })

    // Pengurutan: Kelas 7A - 9D, kemudian Nama Siswa Abjad (A-Z)
    const parseClassNum = (k) => {
      const m = String(k || '').match(/\d+/)
      return m ? parseInt(m[0], 10) : 99
    }

    matched.sort((a, b) => {
      const numA = parseClassNum(a.kelas)
      const numB = parseClassNum(b.kelas)
      if (numA !== numB) return numA - numB
      const classComp = String(a.kelas || '').localeCompare(String(b.kelas || ''))
      if (classComp !== 0) return classComp
      return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))
    })

    return matched
  }, [selectedEkskulFilter, allStudents, allNilaiMap])

  // Hitung jumlah siswa per kelas di dalam ekskul ini
  const ekskulClassCounts = useMemo(() => {
    const counts = {}
    ekskulStudentsList.forEach(s => {
      const k = s.kelas || 'Lainnya'
      counts[k] = (counts[k] || 0) + 1
    })
    return counts
  }, [ekskulStudentsList])

  // ─── Audit Kelengkapan Nilai Peserta (Mode Ekskul) ──────────────────────────
  const auditStatsEkskul = useMemo(() => {
    let total = ekskulStudentsList.length
    let completeCount = 0
    let missingNilaiCount = 0

    ekskulStudentsList.forEach(s => {
      const nisn = String(s.nisn)
      const g = allNilaiMap[nisn] || {}
      const isPilihan = s.ekskulRole === 'pilihan'
      const nilai = isPilihan ? g.ekskul_pilihan_nilai : g.ekskul_utama_nilai
      if (nilai && String(nilai).trim() !== '') {
        completeCount++
      } else {
        missingNilaiCount++
      }
    })

    return {
      total,
      completeCount,
      missingNilaiCount
    }
  }, [ekskulStudentsList, allNilaiMap])

  // Siswa sekolah yang belum terdaftar di ekskul manapun
  const unassignedAllStudents = useMemo(() => {
    return allStudents.filter(s => {
      const g = allNilaiMap[String(s.nisn)] || {}
      const hasUtama = Boolean(g.ekskul_utama_nama && g.ekskul_utama_nama.trim() !== '')
      const hasPilihan = Boolean(g.ekskul_pilihan_nama && g.ekskul_pilihan_nama.trim() !== '')
      return !hasUtama && !hasPilihan
    })
  }, [allStudents, allNilaiMap])

  // Filtered list setelah sub-kelas, filter belum dinilai, dan pencarian nama/NISN
  const filteredEkskulStudents = useMemo(() => {
    let list = ekskulStudentsList

    if (filterEkskulMissingOnly) {
      list = list.filter(s => {
        const g = allNilaiMap[String(s.nisn)] || {}
        const isPilihan = s.ekskulRole === 'pilihan'
        const nilai = isPilihan ? g.ekskul_pilihan_nilai : g.ekskul_utama_nilai
        return !nilai || String(nilai).trim() === ''
      })
    }

    if (selectedEkskulSubKelas && selectedEkskulSubKelas !== 'ALL') {
      list = list.filter(s => String(s.kelas).trim() === selectedEkskulSubKelas.trim())
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(s =>
        (s.nama_lengkap || '').toLowerCase().includes(q) ||
        String(s.nisn || '').includes(q)
      )
    }
    return list
  }, [ekskulStudentsList, filterEkskulMissingOnly, selectedEkskulSubKelas, searchQuery, allNilaiMap])

  // ─── Unassigned Students Helpers (Modal) ────────────────────────────────────
  const unassignedClasses = useMemo(() => {
    const setClasses = new Set(unassignedAllStudents.map(s => s.kelas).filter(Boolean))
    return Array.from(setClasses).sort()
  }, [unassignedAllStudents])

  const filteredUnassignedStudents = useMemo(() => {
    let list = unassignedAllStudents
    if (unassignedClassFilter && unassignedClassFilter !== 'ALL') {
      list = list.filter(s => String(s.kelas).trim() === unassignedClassFilter.trim())
    }
    if (unassignedSearchQuery.trim()) {
      const q = unassignedSearchQuery.toLowerCase().trim()
      list = list.filter(s =>
        (s.nama_lengkap || '').toLowerCase().includes(q) ||
        String(s.nisn || '').includes(q)
      )
    }
    return list
  }, [unassignedAllStudents, unassignedClassFilter, unassignedSearchQuery])

  const handleAssignEkskulFromModal = (nisn, ekskulNama) => {
    const sNisn = String(nisn)
    const studentObj = allStudents.find(s => String(s.nisn) === sNisn)
    const studentClass = studentObj?.kelas || '7A'

    setAllNilaiMap(prev => {
      const current = prev[sNisn] || {
        siswa_nisn: sNisn,
        kelas: studentClass,
        semester_id: selectedSemesterId,
        tahun_ajaran_id: activeTa?.id || null
      }
      return {
        ...prev,
        [sNisn]: {
          ...current,
          ekskul_utama_nama: ekskulNama
        }
      }
    })

    setNilaiMap(prev => {
      const current = prev[sNisn] || {
        siswa_nisn: sNisn,
        kelas: studentClass,
        semester_id: selectedSemesterId,
        tahun_ajaran_id: activeTa?.id || null
      }
      return {
        ...prev,
        [sNisn]: {
          ...current,
          ekskul_utama_nama: ekskulNama
        }
      }
    })

    setHasChanges(true)
  }

  const handleSaveUnassignedAssignments = async () => {
    setSavingUnassigned(true)
    try {
      const recordsToSave = []
      allStudents.forEach(s => {
        const nisn = String(s.nisn)
        const g = allNilaiMap[nisn]
        if (g && (g.ekskul_utama_nama || g.ekskul_pilihan_nama)) {
          recordsToSave.push({
            siswa_nisn: nisn,
            kelas: s.kelas || '7A',
            semester_id: selectedSemesterId,
            tahun_ajaran_id: activeTa?.id || null,
            ekskul_utama_nama: g.ekskul_utama_nama || null,
            ekskul_utama_nilai: g.ekskul_utama_nilai || null,
            ekskul_utama_keterangan: g.ekskul_utama_keterangan || (g.ekskul_utama_nilai ? getDescForPredikat(g.ekskul_utama_nilai, 'umum') : null),
            pramuka_nilai: g.pramuka_nilai || null,
            pramuka_keterangan: g.pramuka_keterangan || (g.pramuka_nilai ? getDescForPredikat(g.pramuka_nilai, 'pramuka') : null)
          })
        }
      })

      const grouped = {}
      recordsToSave.forEach(rec => {
        const k = rec.kelas || '7A'
        if (!grouped[k]) grouped[k] = []
        grouped[k].push(rec)
      })

      for (const [k, recs] of Object.entries(grouped)) {
        await saveNilaiEkskulBatch(recs, k, selectedSemesterId, activeTa?.id)
      }

      setAlertInfo({ type: 'success', message: 'Penugasan kegiatan ekskul siswa berhasil disimpan ke database!' })
      setHasChanges(false)
      setShowUnassignedModal(false)
    } catch (err) {
      console.error('Save unassigned error:', err)
      setAlertInfo({ type: 'error', message: 'Gagal menyimpan penugasan ekskul: ' + err.message })
    } finally {
      setSavingUnassigned(false)
    }
  }

  // ─── Change Handlers ───────────────────────────────────────────────────────
  const handleStudentFieldChange = (nisn, field, value) => {
    const sNisn = String(nisn)
    const studentObj = students.find(s => String(s.nisn) === sNisn)
    const studentClass = studentObj?.kelas || (selectedKelas === 'ALL' ? '7A' : selectedKelas)

    setNilaiMap(prev => {
      const current = prev[sNisn] || {
        siswa_nisn: sNisn,
        kelas: studentClass,
        semester_id: selectedSemesterId,
        tahun_ajaran_id: activeTa?.id || null,
        pramuka_nilai: '',
        pramuka_keterangan: ''
      }

      const updated = { ...current, [field]: value }

      // Auto update keterangan if predikat changes
      if (field === 'pramuka_nilai') {
        updated.pramuka_keterangan = value ? getDescForPredikat(value, 'pramuka') : ''
      } else if (field === 'ekskul_utama_nilai') {
        updated.ekskul_utama_keterangan = value ? getDescForPredikat(value, 'umum') : ''
      }

      return { ...prev, [sNisn]: updated }
    })

    // Synchronize to allNilaiMap
    setAllNilaiMap(prev => {
      const current = prev[sNisn] || {
        siswa_nisn: sNisn,
        kelas: studentClass,
        semester_id: selectedSemesterId,
        tahun_ajaran_id: activeTa?.id || null
      }
      const updated = { ...current, [field]: value }
      if (field === 'pramuka_nilai') {
        updated.pramuka_keterangan = value ? getDescForPredikat(value, 'pramuka') : ''
      } else if (field === 'ekskul_utama_nilai') {
        updated.ekskul_utama_keterangan = value ? getDescForPredikat(value, 'umum') : ''
      }
      return { ...prev, [sNisn]: updated }
    })

    setHasChanges(true)
  }

  // ─── Change Handler in Ekskul View ──────────────────────────────────────────
  const handleEkskulStudentGradeChange = (nisn, field, value) => {
    const sNisn = String(nisn)
    setAllNilaiMap(prev => {
      const current = prev[sNisn] || {
        siswa_nisn: sNisn,
        semester_id: selectedSemesterId,
        tahun_ajaran_id: activeTa?.id || null
      }

      const updated = { ...current, [field]: value }

      if (field === 'ekskul_utama_nilai' || field === 'ekskul_pilihan_nilai') {
        const ketField = field === 'ekskul_utama_nilai' ? 'ekskul_utama_keterangan' : 'ekskul_pilihan_keterangan'
        updated[ketField] = value ? getDescForPredikat(value, 'umum') : ''
      } else if (field === 'pramuka_nilai') {
        updated.pramuka_keterangan = value ? getDescForPredikat(value, 'pramuka') : ''
      }

      return { ...prev, [sNisn]: updated }
    })

    // Sync to nilaiMap if present
    setNilaiMap(prev => {
      if (!prev[sNisn]) return prev
      const current = prev[sNisn]
      const updated = { ...current, [field]: value }
      if (field === 'ekskul_utama_nilai' || field === 'ekskul_pilihan_nilai') {
        const ketField = field === 'ekskul_utama_nilai' ? 'ekskul_utama_keterangan' : 'ekskul_pilihan_keterangan'
        updated[ketField] = value ? getDescForPredikat(value, 'umum') : ''
      } else if (field === 'pramuka_nilai') {
        updated.pramuka_keterangan = value ? getDescForPredikat(value, 'pramuka') : ''
      }
      return { ...prev, [sNisn]: updated }
    })

    setHasChanges(true)
  }

  // ─── Bulk Action: Set All Pramuka 'A' ───────────────────────────────────────
  const handleBulkSetPramukaA = () => {
    if (students.length === 0) return
    const descA = getDescForPredikat('A', 'pramuka')
    setNilaiMap(prev => {
      const copy = { ...prev }
      students.forEach(s => {
        const nisn = String(s.nisn)
        const current = copy[nisn] || {
          siswa_nisn: nisn,
          kelas: s.kelas || (selectedKelas === 'ALL' ? '7A' : selectedKelas),
          semester_id: selectedSemesterId,
          tahun_ajaran_id: activeTa?.id || null
        }
        copy[nisn] = {
          ...current,
          pramuka_nilai: 'A',
          pramuka_keterangan: descA
        }
      })
      return copy
    })
    setHasChanges(true)
    const targetMsg = selectedKelas === 'ALL'
      ? 'Semua nilai Pramuka seluruh kelas diset ke predikat "A"!'
      : `Semua nilai Pramuka kelas ${selectedKelas} diset ke predikat "A"!`
    setAlertInfo({ type: 'success', message: targetMsg })
  }

  // ─── Save All Grades For Active Class ──────────────────────────────────────
  const handleSaveAllGrades = async () => {
    if (students.length === 0) return
    setSaving(true)
    try {
      const recordsToSave = students.map(s => {
        const nisn = String(s.nisn)
        const grade = nilaiMap[nisn] || {}
        return {
          siswa_nisn: nisn,
          kelas: s.kelas || (selectedKelas === 'ALL' ? '7A' : selectedKelas),
          semester_id: selectedSemesterId,
          tahun_ajaran_id: activeTa?.id || null,
          pramuka_nilai: grade.pramuka_nilai || null,
          pramuka_keterangan: grade.pramuka_keterangan || (grade.pramuka_nilai ? getDescForPredikat(grade.pramuka_nilai, 'pramuka') : null),
          ekskul_utama_nama: grade.ekskul_utama_nama || null,
          ekskul_utama_nilai: grade.ekskul_utama_nilai || null,
          ekskul_utama_keterangan: grade.ekskul_utama_keterangan || (grade.ekskul_utama_nilai ? getDescForPredikat(grade.ekskul_utama_nilai, 'umum') : null),
          ekskul_pilihan_nama: grade.ekskul_pilihan_nama || null,
          ekskul_pilihan_nilai: grade.ekskul_pilihan_nilai || null,
          ekskul_pilihan_keterangan: grade.ekskul_pilihan_keterangan || (grade.ekskul_pilihan_nilai ? getDescForPredikat(grade.ekskul_pilihan_nilai, 'umum') : null)
        }
      })

      if (selectedKelas === 'ALL') {
        const grouped = {}
        recordsToSave.forEach(rec => {
          const k = rec.kelas || '7A'
          if (!grouped[k]) grouped[k] = []
          grouped[k].push(rec)
        })
        for (const [k, recs] of Object.entries(grouped)) {
          await saveNilaiEkskulBatch(recs, k, selectedSemesterId, activeTa?.id)
        }
        setAlertInfo({ type: 'success', message: `Nilai ekstrakurikuler seluruh kelas (${recordsToSave.length} siswa) berhasil disimpan!` })
      } else {
        await saveNilaiEkskulBatch(recordsToSave, selectedKelas, selectedSemesterId, activeTa?.id)
        setAlertInfo({ type: 'success', message: `Nilai ekstrakurikuler kelas ${selectedKelas} berhasil disimpan!` })
      }
      setHasChanges(false)
    } catch (err) {
      console.error('Save grades error:', err)
      setAlertInfo({ type: 'error', message: 'Gagal menyimpan nilai: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // ─── Save Grades For Active Ekskul Mode ────────────────────────────────────
  const handleSaveEkskulModeGrades = async () => {
    if (ekskulStudentsList.length === 0) return
    setSaving(true)
    try {
      const taId = activeTa?.id
      const recordsToSave = ekskulStudentsList.map(s => {
        const nisn = String(s.nisn)
        const g = allNilaiMap[nisn] || {}
        const fallback = nilaiMap[nisn] || {}
        const pNilai = g.pramuka_nilai !== undefined ? g.pramuka_nilai : (fallback.pramuka_nilai || null)
        const pKet = g.pramuka_keterangan !== undefined ? g.pramuka_keterangan : (fallback.pramuka_keterangan || (pNilai ? getDescForPredikat(pNilai, 'pramuka') : null))

        return {
          siswa_nisn: nisn,
          kelas: s.kelas,
          semester_id: selectedSemesterId,
          tahun_ajaran_id: taId || null,
          pramuka_nilai: pNilai,
          pramuka_keterangan: pKet,
          ekskul_utama_nama: g.ekskul_utama_nama || fallback.ekskul_utama_nama || null,
          ekskul_utama_nilai: g.ekskul_utama_nilai !== undefined ? g.ekskul_utama_nilai : (fallback.ekskul_utama_nilai || null),
          ekskul_utama_keterangan: g.ekskul_utama_keterangan !== undefined ? g.ekskul_utama_keterangan : (fallback.ekskul_utama_keterangan || (g.ekskul_utama_nilai ? getDescForPredikat(g.ekskul_utama_nilai, 'umum') : null)),
          ekskul_pilihan_nama: g.ekskul_pilihan_nama || fallback.ekskul_pilihan_nama || null,
          ekskul_pilihan_nilai: g.ekskul_pilihan_nilai !== undefined ? g.ekskul_pilihan_nilai : (fallback.ekskul_pilihan_nilai || null),
          ekskul_pilihan_keterangan: g.ekskul_pilihan_keterangan !== undefined ? g.ekskul_pilihan_keterangan : (fallback.ekskul_pilihan_keterangan || (g.ekskul_pilihan_nilai ? getDescForPredikat(g.ekskul_pilihan_nilai, 'umum') : null))
        }
      })

      // Group by class to call saveNilaiEkskulBatch
      const grouped = {}
      recordsToSave.forEach(rec => {
        const k = rec.kelas || 'default'
        if (!grouped[k]) grouped[k] = []
        grouped[k].push(rec)
      })

      for (const k of Object.keys(grouped)) {
        await saveNilaiEkskulBatch(grouped[k], k, selectedSemesterId, taId)
      }

      if (selectedKelas && grouped[selectedKelas]) {
        const refreshed = await getNilaiEkskulKelas(selectedKelas, selectedSemesterId, taId)
        setNilaiMap(refreshed || {})
      }

      setHasChanges(false)
      setAlertInfo({
        type: 'success',
        message: `Nilai peserta kegiatan ${selectedEkskulFilter} (${recordsToSave.length} siswa lintas kelas) berhasil disimpan!`
      })
    } catch (err) {
      console.error('Save ekskul mode error:', err)
      setAlertInfo({ type: 'error', message: 'Gagal menyimpan nilai ekskul: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // ─── Batch Set Grade For Selected Ekskul ────────────────────────────────────
  const handleBatchSetEkskulGrade = (targetGrade) => {
    const desc = targetGrade ? getDescForPredikat(targetGrade, 'umum') : ''
    setAllNilaiMap(prev => {
      const copy = { ...prev }
      ekskulStudentsList.forEach(s => {
        const nisn = String(s.nisn)
        const current = copy[nisn] || {
          siswa_nisn: nisn,
          kelas: s.kelas,
          semester_id: selectedSemesterId,
          tahun_ajaran_id: activeTa?.id || null
        }
        if (s.ekskulRole === 'pilihan') {
          copy[nisn] = {
            ...current,
            ekskul_pilihan_nilai: targetGrade || null,
            ekskul_pilihan_keterangan: desc || null
          }
        } else {
          copy[nisn] = {
            ...current,
            ekskul_utama_nilai: targetGrade || null,
            ekskul_utama_keterangan: desc || null
          }
        }
      })
      return copy
    })
    setHasChanges(true)
    setAlertInfo({
      type: 'success',
      message: targetGrade
        ? `Seluruh nilai kegiatan ${selectedEkskulFilter} diset ke predikat '${targetGrade}'. Klik 'Simpan Nilai Ekskul' untuk menyimpan permanen.`
        : `Seluruh nilai kegiatan ${selectedEkskulFilter} dikosongkan (-). Klik 'Simpan Nilai Ekskul' untuk menyimpan permanen.`
    })
  }

  // ─── Export Single Ekskul Roster to Excel ──────────────────────────────────
  const handleExportSingleEkskul = () => {
    if (ekskulStudentsList.length === 0) return
    const rows = ekskulStudentsList.map((s, i) => {
      const nisn = String(s.nisn)
      const g = allNilaiMap[nisn] || {}
      const nilai = g.ekskul_utama_nilai || g.ekskul_pilihan_nilai || ''
      const ket = g.ekskul_utama_keterangan || g.ekskul_pilihan_keterangan || ''
      return {
        'NO': i + 1,
        'NISN': s.nisn || '',
        'NAMA PESERTA DIDIK': s.nama_lengkap || '',
        'KELAS': s.kelas || '',
        'KEGIATAN EKSKUL': selectedEkskulFilter,
        'PREDIKAT (A/B/C/D)': nilai || '-',
        'KETERANGAN / CAPAIAN': ket || (nilai ? getDescForPredikat(nilai, 'umum') : '-')
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, selectedEkskulFilter.slice(0, 30))
    const cleanName = selectedEkskulFilter.replace(/[^a-zA-Z0-9]/g, '_')
    XLSX.writeFile(wb, `Daftar_Siswa_Ekskul_${cleanName}_Semua_Kelas.xlsx`)
    setAlertInfo({ type: 'success', message: `Berhasil mengekspor daftar siswa ekskul ${selectedEkskulFilter}!` })
  }

  // ─── Clear All Predikat Prompt (Reset to Belum Dinilai) ────────────────────
  const handleClearPredikatPrompt = (scope = 'current') => {
    setShowClearDropdown(false)
    const isKelas = viewMode === 'kelas'
    const targetName = (scope === 'all' || (isKelas && selectedKelas === 'ALL'))
      ? (isKelas ? 'Seluruh Siswa (Semua Kelas)' : 'Seluruh Peserta Ekskul Pilihan (Semua Kegiatan Non-Pramuka)')
      : isKelas
        ? `Kelas ${selectedKelas}`
        : `Ekskul ${selectedEkskulFilter}`

    const modalSub = isKelas
      ? 'Pilihan nama kegiatan ekskul siswa TETAP TERSIMPAN. Hanya predikat nilai yang akan diubah menjadi Belum Dinilai (-). Nilai Pramuka Wajib akan dipertahankan jika opsi di bawah dicentang.'
      : `Pilihan kegiatan ekskul siswa TETAP TERSIMPAN. Hanya predikat nilai ${scope === 'all' ? 'seluruh ekskul pilihan/non-pramuka' : `kegiatan "${selectedEkskulFilter}"`} yang akan dikosongkan (-). Nilai Pramuka Wajib otomatis AMAN dan TIDAK AKAN DIHAPUS.`

    setConfirmModal({
      isOpen: true,
      title: 'Kosongkan Nilai Predikat',
      message: `Kosongkan semua nilai predikat (A/B/C/D) untuk ${targetName}?`,
      submessage: modalSub,
      confirmText: 'Ya, Kosongkan Nilai',
      cancelText: 'Batal',
      type: 'warning',
      showKeepPramukaOption: isKelas,
      keepPramuka: true,
      keepPramukaLabel: 'Pertahankan Nilai Pramuka (Wajib)',
      keepPramukaSub: 'Nilai predikat dan capaian Pramuka tetap tersimpan utuh dan tidak akan dikosongkan.',
      pramukaSafeNote: !isKelas ? 'Nilai Pramuka (Wajib) dilindungi & tidak akan ikut terhapus.' : null,
      onConfirm: async (keepPramukaOpt) => {
        try {
          setConfirmModal(prev => ({ ...prev, isProcessing: true }))
          const taId = activeTa?.id
          const keepPramuka = isKelas ? (keepPramukaOpt !== false) : true

          if (!isKelas) {
            // ─── Ekskul Mode: JANGAN PERNAH HAPUS PRAMUKA! ───────────────────────
            if (scope === 'all') {
              // Kosongkan seluruh nilai ekskul umum/pilihan tanpa menyentuh Pramuka
              let qAll = supabase.from('nilai_ekskul_siswa')
                .update({
                  ekskul_utama_nilai: null,
                  ekskul_utama_keterangan: null,
                  ekskul_pilihan_nilai: null,
                  ekskul_pilihan_keterangan: null,
                  updated_at: new Date().toISOString()
                })
              if (selectedSemesterId) qAll = qAll.eq('semester_id', selectedSemesterId)
              if (taId) qAll = qAll.eq('tahun_ajaran_id', taId)
              const { error: errAll } = await qAll
              if (errAll) throw errAll
            } else {
              // Kosongkan HANYA nilai untuk ekskul terpilih (selectedEkskulFilter)
              // 1. Update siswa yang mengambil ekskul ini sebagai ekskul_utama
              let q1 = supabase.from('nilai_ekskul_siswa')
                .update({
                  ekskul_utama_nilai: null,
                  ekskul_utama_keterangan: null,
                  updated_at: new Date().toISOString()
                })
                .eq('ekskul_utama_nama', selectedEkskulFilter)
              if (selectedSemesterId) q1 = q1.eq('semester_id', selectedSemesterId)
              if (taId) q1 = q1.eq('tahun_ajaran_id', taId)
              const { error: err1 } = await q1
              if (err1) throw err1

              // 2. Update siswa yang mengambil ekskul ini sebagai ekskul_pilihan
              let q2 = supabase.from('nilai_ekskul_siswa')
                .update({
                  ekskul_pilihan_nilai: null,
                  ekskul_pilihan_keterangan: null,
                  updated_at: new Date().toISOString()
                })
                .eq('ekskul_pilihan_nama', selectedEkskulFilter)
              if (selectedSemesterId) q2 = q2.eq('semester_id', selectedSemesterId)
              if (taId) q2 = q2.eq('tahun_ajaran_id', taId)
              const { error: err2 } = await q2
              if (err2) throw err2
            }
          } else {
            // ─── Kelas Mode ─────────────────────────────────────────────────────
            const updatePayload = {
              ekskul_utama_nilai: null,
              ekskul_utama_keterangan: null,
              ekskul_pilihan_nilai: null,
              ekskul_pilihan_keterangan: null,
              updated_at: new Date().toISOString()
            }
            if (!keepPramuka) {
              updatePayload.pramuka_nilai = null
              updatePayload.pramuka_keterangan = null
            }

            let query = supabase.from('nilai_ekskul_siswa').update(updatePayload)
            if (scope === 'all' || selectedKelas === 'ALL') {
              if (selectedSemesterId) query = query.eq('semester_id', selectedSemesterId)
              if (taId) query = query.eq('tahun_ajaran_id', taId)
            } else {
              query = query.eq('kelas', selectedKelas)
              if (selectedSemesterId) query = query.eq('semester_id', selectedSemesterId)
              if (taId) query = query.eq('tahun_ajaran_id', taId)
            }

            const { error } = await query
            if (error) throw error
          }

          // Sinkronisasi LocalStorage cache agar nilai lama tidak muncul kembali
          try {
            const raw = localStorage.getItem('ebudimulia_ekskul_nilai')
            if (raw) {
              const localStore = JSON.parse(raw)
              Object.keys(localStore).forEach(key => {
                const records = localStore[key]
                if (records && typeof records === 'object') {
                  Object.keys(records).forEach(nisn => {
                    const rec = records[nisn]
                    if (!rec) return
                    if (!isKelas) {
                      // Ekskul mode: PRAMUKA JANGAN PERNAH DISENTUH!
                      if (scope === 'all') {
                        rec.ekskul_utama_nilai = null
                        rec.ekskul_utama_keterangan = null
                        rec.ekskul_pilihan_nilai = null
                        rec.ekskul_pilihan_keterangan = null
                      } else {
                        if (rec.ekskul_utama_nama === selectedEkskulFilter) {
                          rec.ekskul_utama_nilai = null
                          rec.ekskul_utama_keterangan = null
                        }
                        if (rec.ekskul_pilihan_nama === selectedEkskulFilter) {
                          rec.ekskul_pilihan_nilai = null
                          rec.ekskul_pilihan_keterangan = null
                        }
                      }
                    } else {
                      // Kelas mode
                      if (scope === 'all' || selectedKelas === 'ALL' || rec.kelas === selectedKelas) {
                        rec.ekskul_utama_nilai = null
                        rec.ekskul_utama_keterangan = null
                        rec.ekskul_pilihan_nilai = null
                        rec.ekskul_pilihan_keterangan = null
                        if (!keepPramuka) {
                          rec.pramuka_nilai = null
                          rec.pramuka_keterangan = null
                        }
                      }
                    }
                  })
                }
              })
              localStorage.setItem('ebudimulia_ekskul_nilai', JSON.stringify(localStore))
            }
          } catch (e) {
            console.warn('LocalStorage clear sync warning:', e)
          }

          await loadAllStudentsAndNilai()
          if (selectedKelas === 'ALL') {
            const refreshed = await getAllNilaiEkskul(selectedSemesterId, taId)
            setNilaiMap(refreshed || {})
          } else if (selectedKelas) {
            const refreshed = await getNilaiEkskulKelas(selectedKelas, selectedSemesterId, taId)
            setNilaiMap(refreshed || {})
          }
          setHasChanges(false)
          setAlertInfo({
            type: 'success',
            message: `Nilai predikat untuk ${targetName} berhasil dikosongkan (-).${(!isKelas || keepPramuka) ? ' Nilai Pramuka Wajib tetap aman terjaga.' : ''} Pembagian kegiatan ekskul siswa tetap tersimpan rapi.`
          })
        } catch (err) {
          console.error('Error clearing predikat:', err)
          setAlertInfo({ type: 'error', message: 'Gagal mengosongkan nilai: ' + err.message })
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false, isProcessing: false }))
        }
      }
    })
  }

  // ─── Save Kriteria List (Pramuka vs Umum) ──────────────────────────────────
  const handleSaveKriteria = async (kategoriToSave = activeKriteriaKategori) => {
    setSaving(true)
    try {
      const listToSave = kategoriToSave === 'pramuka' ? kriteriaPramuka : kriteriaUmum
      await saveKriteriaEkskul(listToSave, kategoriToSave, activeTa?.id)
      setAlertInfo({
        type: 'success',
        message: `Kriteria predikat ${kategoriToSave === 'pramuka' ? 'Khusus Pramuka (Wajib)' : 'Ekstrakurikuler Umum'} berhasil disimpan!`
      })
      const status = await checkEkskulDatabaseStatus()
      setDbStatus(status)
    } catch (err) {
      setAlertInfo({
        type: 'error',
        message: 'Kriteria tersimpan sementara di browser, namun belum masuk ke cloud database: ' + (err.message || 'Tabel database belum dibuat.')
      })
    } finally {
      setSaving(false)
    }
  }

  const handleResetKriteria = (kategoriToReset = activeKriteriaKategori) => {
    const isPramuka = kategoriToReset === 'pramuka'
    const name = isPramuka ? 'Khusus Pramuka' : 'Ekskul Umum'
    setConfirmModal({
      isOpen: true,
      title: 'Reset Kriteria Predikat',
      message: `Kembalikan seluruh deskripsi kriteria nilai ${name} ke standar awal?`,
      submessage: 'Deskripsi kriteria yang saat ini tampil akan diganti dengan rumusan narasi standar awal aplikasi.',
      confirmText: 'Ya, Reset Kriteria',
      cancelText: 'Batal',
      type: 'warning',
      showKeepPramukaOption: false,
      onConfirm: async () => {
        const def = isPramuka ? DEFAULT_KRITERIA_PRAMUKA : DEFAULT_KRITERIA_UMUM
        if (isPramuka) setKriteriaPramuka(def)
        else setKriteriaUmum(def)

        try {
          await saveKriteriaEkskul(def, kategoriToReset, activeTa?.id)
          setAlertInfo({ type: 'success', message: `Kriteria ${name} berhasil direset ke standar!` })
        } catch (e) {
          setAlertInfo({ type: 'success', message: `Kriteria ${name} direset ke standar (tersimpan di browser).` })
        }
      }
    })
  }

  // ─── Helper: Build Excel Rows For Students ─────────────────────────────────
  const buildStudentExcelRows = (studentList, gradesMap, className, isTemplate = false) => {
    return studentList.map((s, idx) => {
      const nisn = String(s.nisn)
      const g = gradesMap[nisn] || {}
      return {
        'NO': idx + 1,
        'NISN': s.nisn,
        'NIPD': s.nipd || '',
        'NAMA SISWA': s.nama_lengkap,
        'KELAS': className || s.kelas || '',
        'PREDIKAT PRAMUKA (A/B/C/D)': isTemplate ? '' : (g.pramuka_nilai || ''),
        'KETERANGAN PRAMUKA': isTemplate ? '' : (g.pramuka_keterangan || (g.pramuka_nilai ? getDescForPredikat(g.pramuka_nilai, 'pramuka') : '')),
        'NAMA EKSTRAKURIKULER': g.ekskul_utama_nama || '',
        'PREDIKAT (A/B/C/D)': isTemplate ? '' : (g.ekskul_utama_nilai || ''),
        'KETERANGAN CAPAIAN': isTemplate ? '' : (g.ekskul_utama_keterangan || (g.ekskul_utama_nilai ? getDescForPredikat(g.ekskul_utama_nilai, 'umum') : ''))
      }
    })
  }

  const studentColWidths = [
    { wch: 6 },  // NO
    { wch: 14 }, // NISN
    { wch: 10 }, // NIPD
    { wch: 30 }, // NAMA SISWA
    { wch: 8 },  // KELAS
    { wch: 28 }, // PREDIKAT PRAMUKA
    { wch: 45 }, // KET PRAMUKA
    { wch: 26 }, // NAMA EKSTRAKURIKULER
    { wch: 22 }, // PREDIKAT
    { wch: 45 }  // KETERANGAN CAPAIAN
  ]

  // ─── Helper: Create Master & Kriteria Sheets ────────────────----------------
  const appendMasterAndKriteriaSheets = (wb) => {
    // 1. Sheet Kriteria Khusus Pramuka
    const guidePramukaRows = kriteriaPramuka.map(k => ({
      'KODE PREDIKAT': k.predikat,
      'KATEGORI': 'Pramuka (Wajib)',
      'DESKRIPSI CAPAIAN KHUSUS PRAMUKA': k.keterangan
    }))
    const wsPramuka = XLSX.utils.json_to_sheet(guidePramukaRows)
    wsPramuka['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 90 }]
    XLSX.utils.book_append_sheet(wb, wsPramuka, 'Kriteria_Pramuka')

    // 2. Sheet Kriteria Ekstrakurikuler Umum
    const guideUmumRows = kriteriaUmum.map(k => ({
      'KODE PREDIKAT': k.predikat,
      'KATEGORI': 'Ekstrakurikuler Umum',
      'DESKRIPSI CAPAIAN EKSKUL UMUM': k.keterangan
    }))
    const wsUmum = XLSX.utils.json_to_sheet(guideUmumRows)
    wsUmum['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 90 }]
    XLSX.utils.book_append_sheet(wb, wsUmum, 'Kriteria_Ekskul_Umum')

    // 3. Sheet Master Daftar Kegiatan Ekskul
    const ekskulRows = masterEkskul.map(e => ({
      'NAMA EKSKUL': e.nama,
      'JENIS': (e.jenis || '').toUpperCase(),
      'PEMBINA / PELATIH': e.pembina || '-',
      'JADWAL LATIHAN': `${e.hari || '-'} (${e.waktu || '-'})`
    }))
    const wsEkskul = XLSX.utils.json_to_sheet(ekskulRows)
    wsEkskul['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 25 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, wsEkskul, 'Daftar_Master_Ekskul')
  }

  // ─── Master Export Engine (Multi-Scope) ─────────────────────────────────────
  const executeExport = async (scope = exportScope, format = exportFormat) => {
    setIsExporting(true)
    setExportProgress('Mempersiapkan data ekspor...')

    try {
      const taId = activeTa?.id
      const taNama = activeTa?.nama ? activeTa.nama.replace(/\//g, '-') : '2025-2026'
      const semName = semesters.find(s => s.id === selectedSemesterId)?.nomor || 1
      const wb = XLSX.utils.book_new()

      // OPSI 2: HANYA MASTER EKSKUL & KRITERIA
      if (scope === 'master_only') {
        setExportProgress('Menyusun lembar Master Ekskul dan Kriteria...')
        appendMasterAndKriteriaSheets(wb)
        const filename = `Master_Ekskul_dan_Kriteria_SMPBM_${taNama}_${new Date().toISOString().slice(0, 10)}.xlsx`
        XLSX.writeFile(wb, filename)
        setShowExportModal(false)
        setAlertInfo({ type: 'success', message: 'Master kegiatan dan kriteria ekskul berhasil diekspor!' })
        return
      }

      // Tentukan daftar kelas yang akan diekspor
      let targetClasses = []
      if (scope === 'nilai_current') {
        targetClasses = selectedKelas === 'ALL' ? allKelasList : [selectedKelas]
      } else {
        // 'full', 'nilai_all', 'template'
        targetClasses = exportSelectedClasses.length > 0 ? exportSelectedClasses : allKelasList
      }

      if (targetClasses.length === 0) {
        setAlertInfo({ type: 'error', message: 'Tidak ada kelas yang dipilih untuk diekspor.' })
        return
      }

      // OPSI 1: FULL SELURUH DATA EKSKUL (Master & Kriteria diletakkan di sheet awal)
      if (scope === 'full') {
        setExportProgress('Menyusun Master Ekskul dan Kriteria...')
        appendMasterAndKriteriaSheets(wb)
      }

      // Kumpulkan data nilai per kelas
      let allCombinedRows = []

      for (let i = 0; i < targetClasses.length; i++) {
        const kName = targetClasses[i]
        setExportProgress(`Mengambil data siswa & nilai Kelas ${kName} (${i + 1}/${targetClasses.length})...`)

        let stdData = []
        let classGrades = {}

        if (kName === selectedKelas) {
          stdData = students
          classGrades = nilaiMap
        } else if (selectedKelas === 'ALL') {
          stdData = students.filter(s => s.kelas === kName)
          classGrades = nilaiMap
        } else {
          // Fetch students
          let stdQuery = supabase.from('siswa_lengkap')
            .select('nisn, nipd, nama_lengkap, kelas')
            .eq('kelas', kName)
          if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
          let { data: resStds } = await stdQuery.order('nama_lengkap', { ascending: true })
          if (!resStds || resStds.length === 0) {
            const { data: fb } = await supabase.from('siswa_lengkap')
              .select('nisn, nipd, nama_lengkap, kelas')
              .eq('kelas', kName)
              .order('nama_lengkap', { ascending: true })
            resStds = fb || []
          }
          stdData = resStds || []
          classGrades = await getNilaiEkskulKelas(kName, selectedSemesterId, taId)
        }

        const isTemplate = scope === 'template'
        const rows = buildStudentExcelRows(stdData, classGrades, kName, isTemplate)

        if (format === 'single_sheet' && (scope === 'nilai_all' || scope === 'template')) {
          allCombinedRows.push(...rows)
        } else {
          // Multi-sheet: 1 sheet per kelas
          const sheetName = `Nilai_${kName}`
          const ws = XLSX.utils.json_to_sheet(rows)
          ws['!cols'] = studentColWidths
          XLSX.utils.book_append_sheet(wb, ws, sheetName)
        }
      }

      // Jika single-sheet, tambahkan sheet gabungan
      if (format === 'single_sheet' && (scope === 'nilai_all' || scope === 'template')) {
        const wsCombined = XLSX.utils.json_to_sheet(allCombinedRows)
        wsCombined['!cols'] = studentColWidths
        XLSX.utils.book_append_sheet(wb, wsCombined, scope === 'template' ? 'Template_Nilai_Semua_Kelas' : 'Nilai_Ekskul_Semua_Kelas')
      }

      // Tambahkan panduan kriteria di sheet akhir jika belum disertakan
      if (scope !== 'full') {
        appendMasterAndKriteriaSheets(wb)
      }

      // Generate Nama File yang Informatif
      let scopeLabel = 'Nilai_Ekskul'
      if (scope === 'full') scopeLabel = 'FULL_Data_Ekskul_Lengkap'
      else if (scope === 'template') scopeLabel = selectedKelas === 'ALL' ? 'Template_Import_Ekskul_Semua_Kelas' : `Template_Import_Ekskul_${selectedKelas}`
      else if (scope === 'nilai_current') scopeLabel = selectedKelas === 'ALL' ? 'Nilai_Ekskul_Semua_Kelas' : `Nilai_Ekskul_${selectedKelas}`
      else scopeLabel = `Nilai_Ekskul_Semua_Kelas`

      const filename = `${scopeLabel}_SMPBM_Sem${semName}_${taNama}_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, filename)

      setShowExportModal(false)
      setAlertInfo({ type: 'success', message: `Berhasil mengekspor data ekskul (${filename})!` })
    } catch (err) {
      console.error('Export error:', err)
      setAlertInfo({ type: 'error', message: 'Gagal mengekspor data: ' + err.message })
    } finally {
      setIsExporting(false)
      setExportProgress('')
    }
  }

  // ─── Mapping Change Handler ────────────────────────────────────────────────
  const handleMappingChange = (rawText, newTarget) => {
    const updatedMapping = { ...ekskulMapping, [rawText]: newTarget }
    setEkskulMapping(updatedMapping)

    // Recalculate preview rows with updated mapping
    const updatedPreview = rawRowsCache.map(r => {
      const targetUtama = r.rawUtama ? (updatedMapping[r.rawUtama] || '') : ''
      const hasUtama = !!targetUtama

      return {
        ...r,
        utamaNama: targetUtama,
        utamaNilai: hasUtama && ['A', 'B', 'C', 'D'].includes(r.utamaNilai) ? r.utamaNilai : '',
        utamaKet: hasUtama && r.utamaNilai ? getDescForPredikat(r.utamaNilai, 'umum') : '',
        pramukaKet: r.pramukaNilai ? getDescForPredikat(r.pramukaNilai, 'pramuka') : ''
      }
    })

    setImportPreviewData(updatedPreview)
  }

  // ─── Master Import File Parser (Smart Auto-Normalizer & Name Matcher) ──────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAlertInfo({ type: 'info', message: 'Membaca dan menyelaraskan data Excel...' })

    // 1. Fetch active students for name-based lookup
    const studentNameMap = {}
    const studentNisnMap = {}
    try {
      const { data: dbStudents } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)

      const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
      if (dbStudents) {
        dbStudents.forEach(s => {
          if (s.nama_lengkap) studentNameMap[clean(s.nama_lengkap)] = s
          if (s.nisn) studentNisnMap[String(s.nisn).trim()] = s
        })
      }
    } catch (err) {
      console.warn('Student prefetch error:', err)
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })

        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setAlertInfo({ type: 'error', message: 'File Excel kosong atau rusak.' })
          return
        }

        const rawRows = []
        const classesFound = new Set()
        const rawEkskulFreq = {}

        const addFreq = (val) => {
          if (!val) return
          const cleanVal = String(val).trim()
          if (!cleanVal || isIgnoredEkskulText(cleanVal)) return
          rawEkskulFreq[cleanVal] = (rawEkskulFreq[cleanVal] || 0) + 1
        }

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()

        wb.SheetNames.forEach(sheetName => {
          const lowerSheet = sheetName.toLowerCase()
          if (lowerSheet.includes('kriteria') || lowerSheet.includes('daftar_master') || lowerSheet.includes('panduan')) {
            return
          }

          const ws = wb.Sheets[sheetName]
          const sheetData = XLSX.utils.sheet_to_json(ws)
          if (Array.isArray(sheetData) && sheetData.length > 0) {
            sheetData.forEach((row, rowIdx) => {
              // Extract NISN if available
              let nisn = String(row['NISN'] || row['nisn'] || row['Nisn'] || '').trim()

              // Extract Name
              const rawNama = String(
                row['NAMA PESERTA DIDIK'] ||
                row['Nama Peserta Didik'] ||
                row['Nama Peserta didik'] ||
                row['NAMA SISWA'] ||
                row['Nama Siswa'] ||
                row['NAMA'] ||
                row['Nama'] ||
                row['nama'] ||
                ''
              ).trim()

              let matchedStudent = null
              if (nisn && studentNisnMap[nisn]) {
                matchedStudent = studentNisnMap[nisn]
              } else if (rawNama) {
                const cName = clean(rawNama)
                if (studentNameMap[cName]) {
                  matchedStudent = studentNameMap[cName]
                } else {
                  // Substring search in students
                  const candidateKey = Object.keys(studentNameMap).find(k => k === cName || k.includes(cName) || cName.includes(k))
                  if (candidateKey) matchedStudent = studentNameMap[candidateKey]
                }
              }

              if (matchedStudent) {
                nisn = matchedStudent.nisn
              } else if (!nisn && rawNama) {
                nisn = 'SWS-' + String(rowIdx + 1).padStart(4, '0')
              }

              const finalNama = matchedStudent ? matchedStudent.nama_lengkap : rawNama
              if (!finalNama && !nisn) return // Skip empty rows

              // Determine Class
              let rowKelas = String(row['KELAS'] || row['kelas'] || row['Kelas'] || '').trim()
              if (!rowKelas && matchedStudent?.kelas) rowKelas = matchedStudent.kelas
              if (!rowKelas && sheetName.includes('_')) {
                rowKelas = sheetName.split('_')[1]?.trim() || ''
              }
              if (!rowKelas) rowKelas = selectedKelas || '7A'
              classesFound.add(rowKelas)

              // 1. Pramuka (Wajib)
              const rawPramuka = (
                row['PREDIKAT PRAMUKA (A/B/C/D)'] ||
                row['PREDIKAT PRAMUKA'] ||
                row['Pramuka'] ||
                row['PRAMUKA'] ||
                ''
              ).toString().trim().toUpperCase()
              const validPramuka = ['A', 'B', 'C', 'D'].includes(rawPramuka) ? rawPramuka : ''

              // 2. Ekstrakurikuler (Mendukung format baru maupun template lama)
              let rawUtama = String(
                row['KEGIATAN EKSKUL'] ||
                row['Kegiatan Ekskul'] ||
                row['NAMA EKSTRAKURIKULER'] ||
                row['Nama Ekstrakurikuler'] ||
                row['EKSTRAKURIKULER'] ||
                row['Ekstrakurikuler'] ||
                row['EKSKUL UTAMA'] ||
                row['Ekskul Utama'] ||
                row['NAMA EKSKUL UTAMA'] ||
                row['Nama Ekskul Utama'] ||
                row['Ekskul'] ||
                row['EKSKUL'] ||
                row['Utama'] ||
                row['EKSKUL PILIHAN'] ||
                row['Ekskul Pilihan'] ||
                row['NAMA EKSKUL PILIHAN'] ||
                row['EKSKUL MINAT'] ||
                row['Ekskul Minat'] ||
                ''
              ).trim()

              // Fallback jika ekskul ada di kolom mandiri seperti Coding/Cooking
              if (isIgnoredEkskulText(rawUtama)) {
                if (row['Coding'] && String(row['Coding']).trim() && !isIgnoredEkskulText(row['Coding'])) {
                  rawUtama = 'Coding'
                } else if (row['Cooking'] && String(row['Cooking']).trim() && !isIgnoredEkskulText(row['Cooking'])) {
                  rawUtama = 'Cooking'
                }
              }
              addFreq(rawUtama)

              const rawUtamaNilai = (
                row['PREDIKAT (A/B/C/D)'] ||
                row['PREDIKAT'] ||
                row['Predikat'] ||
                row['PREDIKAT EKSKUL UTAMA (A/B/C/D)'] ||
                row['PREDIKAT UTAMA'] ||
                row['Nilai Utama'] ||
                row['PREDIKAT EKSKUL PILIHAN (A/B/C/D)'] ||
                row['PREDIKAT PILIHAN'] ||
                row['Nilai Pilihan'] ||
                ''
              ).toString().trim().toUpperCase()
              const validUtamaNilai = ['A', 'B', 'C', 'D'].includes(rawUtamaNilai) ? rawUtamaNilai : ''

              rawRows.push({
                nisn,
                nama: finalNama,
                isMatchedInDb: !!matchedStudent,
                kelas: rowKelas,
                pramukaNilai: validPramuka,
                rawUtama,
                utamaNilai: validUtamaNilai
              })
            })
          }
        })

        if (rawRows.length === 0) {
          setAlertInfo({
            type: 'error',
            message: 'Tidak ditemukan baris data siswa pada file Excel yang diunggah. Pastikan kolom Nama Peserta Didik atau NISN terisi.'
          })
          return
        }

        // Build Initial Smart Mapping for detected raw ekskul values
        const initialMapping = {}
        const detectedList = Object.entries(rawEkskulFreq).map(([raw, count]) => {
          const matchResult = getBestEkskulMatch(raw, masterEkskul)
          const target = matchResult.target || ''
          initialMapping[raw] = target
          const isMasterKnown = masterEkskul.some(m => m.nama === target)
          const needsReview = matchResult.needsReview || !target || !isMasterKnown

          return {
            raw,
            count,
            target,
            isIgnore: matchResult.isIgnore,
            isAuto: matchResult.isAuto,
            confidence: matchResult.confidence,
            matchType: matchResult.matchType,
            isTypoCandidate: matchResult.isTypoCandidate,
            isUnmatched: matchResult.isUnmatched || !target,
            needsReview,
            similarity: matchResult.similarity
          }
        }).sort((a, b) => {
          if (a.isIgnore && !b.isIgnore) return 1
          if (!a.isIgnore && b.isIgnore) return -1
          if (a.needsReview && !b.needsReview) return -1
          if (!a.needsReview && b.needsReview) return 1
          return b.count - a.count
        })

        // Generate Preview Rows using Initial Mapping
        const previewRows = rawRows.map(r => {
          const targetUtama = r.rawUtama ? (initialMapping[r.rawUtama] || '') : ''
          const hasUtama = !!targetUtama

          return {
            ...r,
            utamaNama: targetUtama,
            utamaNilai: hasUtama && ['A', 'B', 'C', 'D'].includes(r.utamaNilai) ? r.utamaNilai : '',
            utamaKet: (hasUtama && r.utamaNilai) ? getDescForPredikat(r.utamaNilai, 'umum') : '',
            pramukaKet: r.pramukaNilai ? getDescForPredikat(r.pramukaNilai, 'pramuka') : ''
          }
        })

        const detectedClasses = Array.from(classesFound).sort()
        setRawRowsCache(rawRows)
        setRawEkskulList(detectedList)
        setEkskulMapping(initialMapping)
        setImportSummary({
          total: previewRows.length,
          classes: detectedClasses,
          validCount: previewRows.filter(p => p.isMatchedInDb).length
        })
        setImportPreviewData(previewRows)
        setShowImportModal(true)
      } catch (err) {
        console.error('Error reading Excel:', err)
        setAlertInfo({ type: 'error', message: 'Gagal membaca file Excel: ' + err.message })
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  // ─── Apply Imported Data (Batch Database Save - No Typo Creation) ─────────
  const applyImportData = async () => {
    if (importPreviewData.length === 0) return
    setIsImporting(true)
    setImportProgress('Menyinkronkan master kegiatan dan nilai siswa...')

    try {
      const taId = activeTa?.id

      // 1. Sanitize against masterEkskul so raw typos NEVER create new master records
      const existingLower = new Set(masterEkskul.map(m => (m.nama || '').trim().toLowerCase()))

      importPreviewData.forEach(item => {
        if (item.utamaNama && !existingLower.has(item.utamaNama.trim().toLowerCase())) {
          console.warn(`Mengabaikan ekskul utama yang tidak dikenal di master: ${item.utamaNama}`)
          item.utamaNama = null
          item.utamaNilai = null
          item.utamaKet = null
        }
      })

      // 2. Group records by kelas
      const groupedByClass = {}
      importPreviewData.forEach(item => {
        const k = item.kelas || selectedKelas || '7A'
        if (!groupedByClass[k]) groupedByClass[k] = []

        const existingRec = allNilaiMap[String(item.nisn)] || nilaiMap[String(item.nisn)] || {}
        const pNilai = item.pramukaNilai || existingRec.pramuka_nilai || null
        const pKet = item.pramukaKet || (item.pramukaNilai ? getDescForPredikat(item.pramukaNilai, 'pramuka') : (existingRec.pramuka_keterangan || null))

        groupedByClass[k].push({
          siswa_nisn: item.nisn,
          kelas: k,
          semester_id: selectedSemesterId,
          tahun_ajaran_id: taId || null,
          pramuka_nilai: pNilai,
          pramuka_keterangan: pKet,
          ekskul_utama_nama: item.utamaNama || existingRec.ekskul_utama_nama || null,
          ekskul_utama_nilai: item.utamaNilai !== undefined && item.utamaNilai !== null ? item.utamaNilai : (existingRec.ekskul_utama_nilai || null),
          ekskul_utama_keterangan: item.utamaKet || (item.utamaNilai ? getDescForPredikat(item.utamaNilai, 'umum') : (existingRec.ekskul_utama_keterangan || null)),
          ekskul_pilihan_nama: existingRec.ekskul_pilihan_nama || null,
          ekskul_pilihan_nilai: existingRec.ekskul_pilihan_nilai || null,
          ekskul_pilihan_keterangan: existingRec.ekskul_pilihan_keterangan || null
        })
      })

      // Batch save each class
      const classKeys = Object.keys(groupedByClass)
      for (let i = 0; i < classKeys.length; i++) {
        const k = classKeys[i]
        setImportProgress(`Menyimpan nilai Kelas ${k} (${i + 1}/${classKeys.length})...`)
        await saveNilaiEkskulBatch(groupedByClass[k], k, selectedSemesterId, taId)
      }

      // Update local state if active class is included
      if (groupedByClass[selectedKelas]) {
        setNilaiMap(prev => {
          const copy = { ...prev }
          groupedByClass[selectedKelas].forEach(rec => {
            copy[rec.siswa_nisn] = rec
          })
          return copy
        })
        setHasChanges(false)
      }

      setShowImportModal(false)
      setAlertInfo({
        type: 'success',
        message: `Berhasil mengimpor & menyelaraskan ${importPreviewData.length} nilai ekskul siswa untuk ${classKeys.length} kelas (${classKeys.join(', ')})!`
      })
    } catch (err) {
      console.error('Import save error:', err)
      setAlertInfo({ type: 'error', message: 'Terjadi kesalahan saat menyimpan data import: ' + err.message })
    } finally {
      setIsImporting(false)
      setImportProgress('')
    }
  }

  // ─── Save Master Ekskul ────────────────────────────────────────────────────
  const handleSaveEkskulItem = async (e) => {
    e.preventDefault()
    if (!ekskulForm.nama.trim()) return

    setSaving(true)
    try {
      if (editingEkskul) {
        await updateMasterEkskulItem(editingEkskul.id, ekskulForm, activeTa?.id)
      } else {
        await createMasterEkskulItem(ekskulForm, activeTa?.id)
      }
      const refreshed = await getMasterEkskul(activeTa?.id)
      setMasterEkskul(refreshed)
      setShowEkskulModal(false)
      setEditingEkskul(null)
      setEkskulForm({ nama: '', jenis: 'utama', pembina: '', guru_id: '', guru_nama: '', hari: '', waktu: '' })
      setAlertInfo({ type: 'success', message: 'Master kegiatan ekstrakurikuler berhasil diperbarui!' })
      const status = await checkEkskulDatabaseStatus()
      setDbStatus(status)
    } catch (err) {
      setAlertInfo({ type: 'error', message: 'Gagal menyimpan master ekskul: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEkskulItem = (id, nama, jenis) => {
    const isWajib = jenis === 'wajib'
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Kegiatan Ekstrakurikuler',
      message: `Apakah Anda yakin ingin menghapus kegiatan "${nama}"?`,
      submessage: isWajib
        ? 'Perhatian: Kegiatan ini berjenis Wajib (Pramuka). Menghapus kegiatan ini akan menghilangkannya dari daftar master.'
        : 'Data kegiatan ekstrakurikuler ini akan dihapus dari daftar master di database.',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal',
      type: 'danger',
      showKeepPramukaOption: false,
      onConfirm: async () => {
        setSaving(true)
        try {
          await deleteMasterEkskulItem(id, nama)
          const refreshed = await getMasterEkskul(activeTa?.id)
          setMasterEkskul(refreshed)
          setSelectedEkskulIds(prev => prev.filter(itemX => itemX !== id))
          setAlertInfo({ type: 'success', message: `Ekstrakurikuler "${nama}" berhasil dihapus!` })
        } catch (err) {
          setAlertInfo({ type: 'error', message: 'Gagal menghapus: ' + err.message })
        } finally {
          setSaving(false)
        }
      }
    })
  }

  const handleDeleteAllEkskuls = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Semua Kegiatan Ekstrakurikuler',
      message: 'Apakah Anda yakin ingin menghapus seluruh kegiatan ekstrakurikuler?',
      submessage: 'Semua daftar kegiatan ekstrakurikuler akan dibersihkan dari database Supabase dan memori aplikasi. Anda dapat mencentang opsi di bawah jika ingin tetap mempertahankan Pramuka.',
      confirmText: 'Ya, Hapus Semua',
      cancelText: 'Batal',
      type: 'danger',
      showKeepPramukaOption: true,
      keepPramuka: true,
      onConfirm: async (keepPramuka) => {
        setSaving(true)
        try {
          await deleteAllMasterEkskul(keepPramuka)
          const refreshed = await getMasterEkskul(activeTa?.id)
          setMasterEkskul(refreshed)
          setSelectedEkskulIds([])
          setAlertInfo({
            type: 'success',
            message: keepPramuka
              ? 'Seluruh kegiatan ekskul (kecuali Pramuka Wajib) berhasil dibersihkan!'
              : 'Seluruh kegiatan ekstrakurikuler berhasil dibersihkan dari sistem!'
          })
        } catch (err) {
          setAlertInfo({ type: 'error', message: 'Gagal membersihkan data: ' + err.message })
        } finally {
          setSaving(false)
        }
      }
    })
  }

  const handleDeleteSelectedEkskuls = () => {
    if (selectedEkskulIds.length === 0) return
    const count = selectedEkskulIds.length
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Kegiatan Terpilih',
      message: `Apakah Anda yakin ingin menghapus ${count} kegiatan ekstrakurikuler yang dipilih?`,
      submessage: 'Semua kegiatan yang dicentang akan dihapus permanen dari daftar master.',
      confirmText: `Ya, Hapus (${count})`,
      cancelText: 'Batal',
      type: 'danger',
      showKeepPramukaOption: false,
      onConfirm: async () => {
        setSaving(true)
        try {
          const selectedItems = masterEkskul.filter(m => selectedEkskulIds.includes(m.id))
          await deleteBatchMasterEkskul(selectedItems)
          const refreshed = await getMasterEkskul(activeTa?.id)
          setMasterEkskul(refreshed)
          setSelectedEkskulIds([])
          setAlertInfo({ type: 'success', message: `Sebanyak ${count} kegiatan ekskul berhasil dihapus!` })
        } catch (err) {
          setAlertInfo({ type: 'error', message: 'Gagal menghapus kegiatan terpilih: ' + err.message })
        } finally {
          setSaving(false)
        }
      }
    })
  }

  return (
    <div className="space-y-5 animate-fade-in text-slate-800 pb-16">
      {/* ─── Header Card ────────────────────────────────────────────────────── */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#004e85]/10 text-[#004e85]">
                Koordinator Ekskul
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                Tahun Ajaran {activeTa?.nama || '2025/2026'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 flex items-center gap-2">
              Manajemen & Penilaian Ekstrakurikuler
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Input predikat Pramuka (Wajib) dan Ekstrakurikuler, kelola kriteria predikat (A, B, C, D), serta ekspor/impor Excel per kelas.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl self-start lg:self-center">
            <button
              onClick={() => setActiveTab('nilai')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'nilai'
                  ? 'bg-white text-[#004e85] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nilai Siswa Per Kelas
            </button>
            <button
              onClick={() => setActiveTab('kriteria')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'kriteria'
                  ? 'bg-white text-[#004e85] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kriteria Predikat
            </button>
            <button
              onClick={() => setActiveTab('master')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'master'
                  ? 'bg-white text-[#004e85] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Master Kegiatan Ekskul
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {alertInfo && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
              alertInfo.type === 'error'
                ? 'bg-rose-50 border border-rose-200 text-rose-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{alertInfo.message}</span>
            <button onClick={() => setAlertInfo(null)} className="text-xs opacity-70 hover:opacity-100 font-bold ml-4">
              ✕
            </button>
          </div>
        )}

        {/* Database Migration Status Notice */}
        {!dbStatus.isReady && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <span className="font-bold block text-slate-900">Tabel Database Modul Ekskul Belum Dimigrasi di Supabase</span>
                <span className="text-amber-900 text-[11px] leading-relaxed">
                  Perubahan Anda saat ini baru tersimpan sementara di memori browser ini (localStorage). Agar data tersimpan permanen di server/cloud dan bisa diakses dari semua perangkat/laptop guru, jalankan skrip SQL <code className="font-mono font-bold bg-amber-200/70 px-1 py-0.5 rounded">supabase/create_modul_ekskul_and_role.sql</code> di Supabase SQL Editor.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Guru Penugasan Ekskul Khusus Notice */}
        {isTeacherSession && teacherAssignedEkskuls.length > 0 && (
          <div className="mt-4 p-3.5 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">👨‍🏫</span>
              <div>
                <span className="font-bold block text-blue-950">
                  Login Guru Pengampu: {activeSession.nama_guru || 'Guru'}
                </span>
                <span className="text-blue-800 text-[11px] leading-relaxed">
                  Anda ditugaskan secara khusus untuk mengampu kegiatan:{' '}
                  <strong className="font-bold text-blue-950">{teacherAssignedEkskuls.join(', ')}</strong>.
                  Tampilan menu dan rombel ekskul disaring otomatis untuk mempermudah penilaian ekskul Anda.
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-[11px] font-bold shrink-0">
              Mode Ekskul Khusus Aktif
            </span>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: INPUT & KELOLA NILAI PER KELAS ATAU ROMBEL EKSKUL
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'nilai' && (
        <div className="space-y-4">
          {/* ─── Mode Tampilan Switcher (Kelas Biasa vs Kelas Ekskul) ───────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setViewMode('kelas')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  viewMode === 'kelas'
                    ? 'bg-white text-[#004e85] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Kelas Reguler (Kelas Biasa)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ekskul')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  viewMode === 'ekskul'
                    ? 'bg-[#004e85] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
                <span>Kelas Ekskul (Rombel Ekskul)</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {viewMode === 'kelas'
                ? `Tampilan per kelas reguler (${students.length} siswa${selectedKelas === 'ALL' ? ' seluruh kelas' : ` kelas ${selectedKelas}`})`
                : `Tampilan per rombel ekskul (${ekskulStudentsList.length} siswa lintas kelas)`}
            </div>
          </div>

          {/* ─── Controls & Filter Bar ────────────────────────────────────────── */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200">
            {viewMode === 'kelas' ? (
              /* Filter Mode: Kelas Biasa */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pilih Kelas</label>
                  <select
                    value={selectedKelas}
                    onChange={(e) => setSelectedKelas(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  >
                    <option value="ALL">Semua Kelas ({allKelasList.length} Kelas)</option>
                    {allKelasList.map((k) => (
                      <option key={k} value={k}>
                        Kelas {k} ({toRomanClass(k)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Semester</label>
                  <select
                    value={selectedSemesterId}
                    onChange={(e) => setSelectedSemesterId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  >
                    {semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        Semester {s.nomor} ({s.nomor % 2 !== 0 ? 'Ganjil' : 'Genap'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cari Siswa</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ketik nama atau NISN siswa..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  />
                </div>
              </div>
            ) : (
              /* Filter Mode: Kelas Ekskul */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {/* 1. Pilih Ekskul */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pilih Kegiatan Ekskul</label>
                  <select
                    value={selectedEkskulFilter}
                    onChange={(e) => {
                      setSelectedEkskulFilter(e.target.value)
                      setSelectedEkskulSubKelas('ALL')
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  >
                    {availableEkskulOptions.map((opt) => {
                      const count = allStudents.filter(s => {
                        const g = allNilaiMap[String(s.nisn)] || {}
                        return (g.ekskul_utama_nama || '').toLowerCase() === opt.toLowerCase() ||
                               (g.ekskul_pilihan_nama || '').toLowerCase() === opt.toLowerCase()
                      }).length
                      return (
                        <option key={opt} value={opt}>
                          {opt} ({count} Siswa)
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* 2. Filter Kelas di dalam Ekskul */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Filter Kelas di Ekskul</label>
                  <select
                    value={selectedEkskulSubKelas}
                    onChange={(e) => setSelectedEkskulSubKelas(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  >
                    <option value="ALL">Semua Kelas (7A - 9D) — {ekskulStudentsList.length} Siswa</option>
                    {Object.keys(ekskulClassCounts).sort().map(k => (
                      <option key={k} value={k}>
                        Kelas {k} ({ekskulClassCounts[k]} Siswa)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Semester */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Semester</label>
                  <select
                    value={selectedSemesterId}
                    onChange={(e) => setSelectedSemesterId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  >
                    {semesters.map((s) => (
                      <option key={s.id} value={s.id}>
                        Semester {s.nomor} ({s.nomor % 2 !== 0 ? 'Ganjil' : 'Genap'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Cari Siswa */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cari Peserta Ekskul</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nama atau NISN..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 bg-slate-50 outline-none focus:ring-2 focus:ring-[#004e85]"
                  />
                </div>
              </div>
            )}

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                {viewMode === 'kelas' ? (
                  /* Actions Kelas Biasa */
                  <>
                    <button
                      onClick={() => setShowExportModal(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 transition-all shadow-sm"
                      title="Ekspor Data Ekskul (Full Lengkap, Kelas Ini, Seluruh Kelas, Master, dll)"
                    >
                      <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Export Ekskul</span>
                    </button>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".xlsx, .xls"
                      className="hidden"
                    />
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border border-sky-600/30 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 transition-all shadow-sm"
                      title="Unggah dan impor file Excel nilai ekskul siswa"
                    >
                      <svg className="w-4 h-4 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Import Excel</span>
                    </button>

                    <button
                      onClick={() => executeExport('template', 'single_sheet')}
                      disabled={students.length === 0 || isExporting}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 transition-all"
                      title={selectedKelas === 'ALL' ? 'Unduh template Excel kosong untuk seluruh kelas' : `Unduh template Excel kosong untuk kelas ${selectedKelas}`}
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                      <span>Template {selectedKelas === 'ALL' ? 'Semua Kelas' : `Kelas ${selectedKelas}`}</span>
                    </button>

                    <button
                      onClick={handleBulkSetPramukaA}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70 transition-all flex items-center gap-1.5"
                      title="Set semua Pramuka di kelas ini ke predikat 'A'"
                    >
                      <svg className="w-3.5 h-3.5 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Set Pramuka 'A'</span>
                    </button>
                  </>
                ) : (
                  /* Actions Kelas Ekskul */
                  <>
                    <button
                      onClick={handleExportSingleEkskul}
                      disabled={ekskulStudentsList.length === 0}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 transition-all shadow-sm"
                      title="Unduh daftar siswa dan nilai peserta ekskul ini"
                    >
                      <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Export Siswa Ekskul Ini</span>
                    </button>

                    <button
                      onClick={() => setShowImportModal(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold border border-sky-600/30 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 transition-all shadow-sm"
                      title="Impor file Excel nilai ekskul siswa"
                    >
                      <svg className="w-4 h-4 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>Import Excel</span>
                    </button>

                    <button
                      onClick={() => handleBatchSetEkskulGrade('A')}
                      disabled={ekskulStudentsList.length === 0}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70 transition-all flex items-center gap-1.5"
                      title="Set semua nilai peserta ekskul ini ke predikat 'A'"
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Set Semua 'A'</span>
                    </button>

                    <button
                      onClick={() => handleBatchSetEkskulGrade('B')}
                      disabled={ekskulStudentsList.length === 0}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/70 transition-all flex items-center gap-1.5"
                      title="Set semua nilai peserta ekskul ini ke predikat 'B'"
                    >
                      <svg className="w-3.5 h-3.5 text-blue-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Set Semua 'B'</span>
                    </button>
                  </>
                )}

                {/* Reset / Kosongkan Nilai Popover Trigger (Tersedia di kedua mode) */}
                <div className="relative inline-block text-left">
                  <button
                    type="button"
                    onClick={() => setShowClearDropdown(!showClearDropdown)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all flex items-center gap-1.5"
                    title="Kosongkan nilai predikat menjadi belum dinilai (-)"
                  >
                    <svg className="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Kosongkan Predikat...</span>
                    <svg className="w-3 h-3 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {showClearDropdown && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowClearDropdown(false)}></div>
                      <div className="absolute left-0 mt-1 w-72 rounded-xl bg-white shadow-xl border border-slate-200 z-30 py-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => handleClearPredikatPrompt('current')}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-700 font-semibold flex items-center justify-between"
                        >
                          <span>{viewMode === 'kelas' ? (selectedKelas === 'ALL' ? 'Kosongkan Semua Siswa' : `Kosongkan Kelas ${selectedKelas}`) : `Kosongkan Ekskul ${selectedEkskulFilter}`}</span>
                        </button>
                        <div className="border-t border-slate-100 my-1"></div>
                        <button
                          type="button"
                          onClick={() => handleClearPredikatPrompt('all')}
                          className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-800 font-bold flex items-center justify-between"
                        >
                          <span>{viewMode === 'kelas' ? 'Kosongkan Seluruh Siswa (Semua Kelas)' : 'Kosongkan Seluruh Ekskul (Kecuali Pramuka)'}</span>
                        </button>
                        <p className="px-3.5 py-1.5 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-100 mt-1">
                          {viewMode === 'ekskul'
                            ? '🛡️ Nilai Pramuka Wajib aman dan tidak akan terhapus.'
                            : 'Hanya menghapus predikat nilai; nama kegiatan ekskul siswa tetap tersimpan.'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Save Button */}
              {viewMode === 'kelas' ? (
                <button
                  onClick={handleSaveAllGrades}
                  disabled={saving || students.length === 0}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-all ${
                    hasChanges
                      ? 'bg-rose-600 hover:bg-rose-700 animate-pulse'
                      : 'bg-[#004e85] hover:bg-[#003d68]'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>{saving ? 'Menyimpan...' : hasChanges ? 'Simpan Perubahan Nilai' : 'Simpan Semua Nilai'}</span>
                </button>
              ) : (
                <button
                  onClick={handleSaveEkskulModeGrades}
                  disabled={saving || ekskulStudentsList.length === 0}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-all ${
                    hasChanges
                      ? 'bg-rose-600 hover:bg-rose-700 animate-pulse'
                      : 'bg-[#004e85] hover:bg-[#003d68]'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>{saving ? 'Menyimpan...' : `Simpan Nilai Ekskul ${selectedEkskulFilter}`}</span>
                </button>
              )}
            </div>
          </div>

          {/* ─── Audit Status & Quick Filter Toolbar ─────────────────────────── */}
          {viewMode === 'kelas' ? (
            /* AUDIT STATUS: MODE KELAS REGULER */
            <div className="bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Ringkasan Kelengkapan */}
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg shadow-2xs ${
                    auditStatsKelas.missingAnyCount > 0
                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}>
                    {auditStatsKelas.missingAnyCount > 0 ? '⚠️' : '✓'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                        Audit Nilai Ekstrakurikuler {selectedKelas === 'ALL' ? 'Semua Kelas' : `Kelas ${selectedKelas}`}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        auditStatsKelas.missingAnyCount > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {auditStatsKelas.missingAnyCount === 0
                          ? '100% Lengkap'
                          : `${auditStatsKelas.completeCount}/${auditStatsKelas.total} Lengkap`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {auditStatsKelas.missingAnyCount > 0 ? (
                        <>
                          Terdapat <strong className="text-amber-700 font-bold">{auditStatsKelas.missingAnyCount} siswa</strong> yang belum memiliki nilai lengkap ({auditStatsKelas.missingEkskulCount} ekskul belum ada nilai, {auditStatsKelas.missingPramukaCount} pramuka belum dinilai).
                        </>
                      ) : (
                        'Seluruh siswa di kelas ini sudah memiliki nilai Pramuka dan Ekstrakurikuler lengkap!'
                      )}
                    </p>
                  </div>
                </div>

                {/* Tombol Utama Filter Siswa Belum Lengkap */}
                <div className="flex items-center gap-2 self-start md:self-center shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterMissingMode(prev => prev === 'missing_any' ? 'all' : 'missing_any')}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 border ${
                      filterMissingMode === 'missing_any'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 ring-2 ring-amber-300'
                        : 'bg-white hover:bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                    title="Saring tabel agar hanya menampilkan siswa yang nilai ekskul atau pramukanya belum lengkap"
                  >
                    <span>{filterMissingMode === 'missing_any' ? '✓ Filter Belum Lengkap Aktif' : '🔍 Filter Siswa Belum Lengkap'}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      filterMissingMode === 'missing_any' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {auditStatsKelas.missingAnyCount}
                    </span>
                  </button>

                  {/* Pills Filter Detail */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setFilterMissingMode('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterMissingMode === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({auditStatsKelas.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMissingMode('missing_ekskul')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterMissingMode === 'missing_ekskul'
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-orange-700'
                      }`}
                      title="Hanya tampilkan siswa dengan nilai ekskul kosong"
                    >
                      Ekskul Kosong ({auditStatsKelas.missingEkskulCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMissingMode('missing_pramuka')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterMissingMode === 'missing_pramuka'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-amber-700'
                      }`}
                      title="Hanya tampilkan siswa dengan nilai pramuka kosong"
                    >
                      Pramuka Kosong ({auditStatsKelas.missingPramukaCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMissingMode('complete')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterMissingMode === 'complete'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-emerald-700'
                      }`}
                      title="Hanya tampilkan siswa yang sudah lengkap nilainya"
                    >
                      Lengkap ({auditStatsKelas.completeCount})
                    </button>
                  </div>
                </div>
              </div>

              {/* Banner saat filter aktif */}
              {filterMissingMode !== 'all' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-900 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">⚡</span>
                    <span>
                      Menampilkan <strong className="font-extrabold text-amber-950">{filteredStudents.length} siswa</strong>{' '}
                      {filterMissingMode === 'missing_any' && 'yang nilainya belum lengkap (Pramuka atau Ekskul belum diisi).'}
                      {filterMissingMode === 'missing_ekskul' && 'yang nilai ekstrakurikuler pilihannya masih kosong.'}
                      {filterMissingMode === 'missing_pramuka' && 'yang nilai Pramuka wajibnya masih kosong.'}
                      {filterMissingMode === 'complete' && 'yang nilainya sudah lengkap.'}
                      {' '}Silakan langsung isi nilai pada dropdown tabel di bawah ini, lalu klik <strong className="text-[#004e85]">Simpan Semua Nilai</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterMissingMode('all')}
                    className="text-amber-800 hover:text-amber-950 font-bold underline shrink-0 cursor-pointer self-end sm:self-center"
                  >
                    ✕ Tampilkan Semua Siswa
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* AUDIT STATUS: MODE ROMBEL EKSKUL */
            <div className="bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Ringkasan Kelengkapan Ekskul */}
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg shadow-2xs ${
                    auditStatsEkskul.missingNilaiCount > 0
                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}>
                    {auditStatsEkskul.missingNilaiCount > 0 ? '⚠️' : '✓'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                        Audit Nilai Peserta Ekskul: {selectedEkskulFilter}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        auditStatsEkskul.missingNilaiCount > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {auditStatsEkskul.missingNilaiCount === 0
                          ? '100% Dinilai'
                          : `${auditStatsEkskul.completeCount}/${auditStatsEkskul.total} Sudah Dinilai`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {auditStatsEkskul.missingNilaiCount > 0 ? (
                        <>
                          Terdapat <strong className="text-amber-700 font-bold">{auditStatsEkskul.missingNilaiCount} peserta</strong> yang belum memiliki predikat nilai di ekskul ini.
                        </>
                      ) : (
                        'Seluruh peserta di rombel ekskul ini sudah memiliki nilai predikat lengkap!'
                      )}
                    </p>
                  </div>
                </div>

                {/* Quick Buttons Mode Ekskul */}
                <div className="flex items-center gap-2 self-start md:self-center shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterEkskulMissingOnly(prev => !prev)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition-all shadow-xs cursor-pointer flex items-center gap-1.5 border ${
                      filterEkskulMissingOnly
                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 ring-2 ring-amber-300'
                        : 'bg-white hover:bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                    title="Filter tabel agar hanya menampilkan peserta yang belum memiliki nilai predikat"
                  >
                    <span>{filterEkskulMissingOnly ? '✓ Filter Belum Dinilai Aktif' : '🔍 Filter Siswa Belum Ada Nilai'}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      filterEkskulMissingOnly ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {auditStatsEkskul.missingNilaiCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUnassignedModal(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Lihat siswa di sekolah yang belum memilih / terdaftar di ekskul manapun"
                  >
                    <span>👥 Siswa Tanpa Ekskul</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                      {unassignedAllStudents.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Banner jika filter ekskul aktif */}
              {filterEkskulMissingOnly && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-900 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">⚡</span>
                    <span>
                      Menampilkan <strong className="font-extrabold text-amber-950">{filteredEkskulStudents.length} peserta</strong> yang belum memiliki nilai predikat ({selectedEkskulFilter}). Silakan langsung pilih nilai predikat pada dropdown di tabel bawah ini, lalu klik <strong className="text-[#004e85]">Simpan Nilai Ekskul</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterEkskulMissingOnly(false)}
                    className="text-amber-800 hover:text-amber-950 font-bold underline shrink-0 cursor-pointer self-end sm:self-center"
                  >
                    ✕ Tampilkan Semua Peserta
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── Table of Students and Grades ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {viewMode === 'kelas' ? (
              /* TABEL TAMPILAN: KELAS REGULER */
              loading ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-8 h-8 border-4 border-[#004e85]/20 border-t-[#004e85] rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs font-bold">Memuat data nilai ekskul {selectedKelas === 'ALL' ? 'seluruh kelas' : `kelas ${selectedKelas}`}...</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <p className="text-sm font-bold">Tidak ada siswa ditemukan.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">No</th>
                        <th className="py-3 px-3 w-28">NISN</th>
                        <th className="py-3 px-3 min-w-[180px]">Nama Siswa</th>
                        {selectedKelas === 'ALL' && (
                          <th className="py-3 px-3 w-20 text-center bg-slate-100/70 border-x border-slate-200">
                            Kelas
                          </th>
                        )}
                        <th className="py-3 px-3 min-w-[170px] bg-amber-50/50 border-x border-slate-200">
                          Pramuka (Wajib)
                        </th>
                        <th className="py-3 px-3 min-w-[280px]">
                          Ekstrakurikuler
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredStudents.map((s, idx) => {
                        const nisn = String(s.nisn)
                        const g = nilaiMap[nisn] || {}
                        const pramukaNilai = g.pramuka_nilai || ''
                        const utamaNama = g.ekskul_utama_nama || ''
                        const utamaNilai = g.ekskul_utama_nilai || ''
                        const hasPramuka = Boolean(pramukaNilai && String(pramukaNilai).trim() !== '')
                        const hasEkskulNama = Boolean(utamaNama && String(utamaNama).trim() !== '')
                        const hasEkskulNilai = Boolean(utamaNilai && String(utamaNilai).trim() !== '')
                        const isEkskulComplete = hasEkskulNama && hasEkskulNilai
                        const isRowIncomplete = !hasPramuka || !isEkskulComplete

                        return (
                          <tr
                            key={nisn}
                            className={`transition-colors ${
                              isRowIncomplete
                                ? 'bg-amber-50/25 hover:bg-amber-50/50'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {s.nisn}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2 max-w-[240px]">
                                <span className="font-bold text-slate-900 truncate" title={s.nama_lengkap}>
                                  {s.nama_lengkap}
                                </span>
                                {isRowIncomplete && (
                                  <span
                                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200/80"
                                    title="Nilai siswa belum lengkap"
                                  >
                                    {!hasPramuka && !isEkskulComplete
                                      ? 'Belum Lengkap'
                                      : !hasPramuka
                                      ? 'Pramuka -'
                                      : !hasEkskulNama
                                      ? 'Ekskul Belum Dipilih'
                                      : 'Nilai Ekskul -'}
                                  </span>
                                )}
                              </div>
                            </td>
                            {selectedKelas === 'ALL' && (
                              <td className="py-2.5 px-3 text-center border-x border-slate-200 bg-slate-50/50">
                                <span className="px-2 py-0.5 rounded-md bg-slate-200/80 font-bold text-[#004e85] text-[11px]">
                                  {s.kelas}
                                </span>
                              </td>
                            )}

                            {/* Pramuka Wajib */}
                            <td className="py-2.5 px-3 bg-amber-50/30 border-x border-slate-200">
                              <div className="flex items-center gap-2">
                                <select
                                  value={pramukaNilai}
                                  onChange={(e) => handleStudentFieldChange(nisn, 'pramuka_nilai', e.target.value)}
                                  className={`px-2 py-1 rounded-lg font-bold text-slate-800 bg-white shadow-xs outline-none focus:ring-1 focus:ring-[#004e85] ${
                                    !hasPramuka
                                      ? 'border-amber-400 bg-amber-50/60 text-amber-900 ring-1 ring-amber-200'
                                      : 'border-slate-200'
                                  }`}
                                >
                                  <option value="">- Belum Diisi -</option>
                                  <option value="A">A (Sangat Baik)</option>
                                  <option value="B">B (Baik)</option>
                                  <option value="C">C (Cukup)</option>
                                  <option value="D">D (Kurang)</option>
                                </select>
                                <span className="text-[10px] text-slate-500 italic truncate max-w-[120px]" title={pramukaNilai ? (g.pramuka_keterangan || getDescForPredikat(pramukaNilai, 'pramuka')) : 'Belum dinilai'}>
                                  {pramukaNilai ? (g.pramuka_keterangan || getDescForPredikat(pramukaNilai, 'pramuka')) : (
                                    <span className="text-amber-700 font-semibold not-italic">Belum dinilai</span>
                                  )}
                                </span>
                              </div>
                            </td>

                            {/* Ekstrakurikuler */}
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <select
                                  value={utamaNama}
                                  onChange={(e) => handleStudentFieldChange(nisn, 'ekskul_utama_nama', e.target.value)}
                                  className={`px-2 py-1 rounded-lg text-xs text-slate-800 bg-white shadow-xs outline-none focus:ring-1 focus:ring-[#004e85] min-w-[160px] max-w-[220px] ${
                                    !hasEkskulNama
                                      ? 'border-amber-300 bg-amber-50/40 text-amber-900'
                                      : 'border-slate-200'
                                  }`}
                                >
                                  <option value="">-- Pilih Ekskul --</option>
                                  {utamaNama && !ekskulOptions.some(opt => opt.nama?.toLowerCase() === utamaNama.toLowerCase()) && (
                                    <option value={utamaNama}>{utamaNama}</option>
                                  )}
                                  {ekskulOptions.map((opt) => (
                                    <option key={opt.id} value={opt.nama}>
                                      {opt.nama}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  value={utamaNilai}
                                  onChange={(e) => handleStudentFieldChange(nisn, 'ekskul_utama_nilai', e.target.value)}
                                  className={`px-2 py-1 rounded-lg font-bold text-slate-800 bg-white shadow-xs outline-none focus:ring-1 focus:ring-[#004e85] ${
                                    hasEkskulNama && !hasEkskulNilai
                                      ? 'border-amber-400 bg-amber-50/60 text-amber-900 ring-1 ring-amber-200'
                                      : 'border-slate-200'
                                  }`}
                                >
                                  <option value="">-</option>
                                  <option value="A">A</option>
                                  <option value="B">B</option>
                                  <option value="C">C</option>
                                  <option value="D">D</option>
                                </select>
                                <span className="text-[10px] text-slate-500 italic truncate max-w-[160px]" title={utamaNilai ? (g.ekskul_utama_keterangan || getDescForPredikat(utamaNilai, 'umum')) : ''}>
                                  {utamaNilai ? (g.ekskul_utama_keterangan || getDescForPredikat(utamaNilai, 'umum')) : (
                                    hasEkskulNama ? (
                                      <span className="text-amber-700 font-semibold not-italic">Belum dinilai</span>
                                    ) : (
                                      <span className="text-slate-400 italic">-</span>
                                    )
                                  )}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* TABEL TAMPILAN: KELAS EKSKUL (ROMBEL EKSKUL LINTAS KELAS 7A-9D) */
              filteredEkskulStudents.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <p className="text-sm font-bold text-slate-700">Tidak ada siswa yang terdaftar di ekskul "{selectedEkskulFilter}".</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Pastikan siswa sudah dipetakan ke ekskul ini melalui import Excel atau input per kelas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">No</th>
                        <th className="py-3 px-3 w-28">NISN</th>
                        <th className="py-3 px-3 min-w-[180px]">Nama Peserta Didik</th>
                        <th className="py-3 px-3 w-24 text-center">Kelas</th>
                        <th className="py-3 px-3 w-24 text-center bg-amber-50/50 border-x border-slate-200">Pramuka</th>
                        <th className="py-3 px-3 w-32 border-r border-slate-200 bg-sky-50/40 text-center">
                          Nilai {selectedEkskulFilter}
                        </th>
                        <th className="py-3 px-3 min-w-[260px]">
                          Capaian / Keterangan Kompetensi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredEkskulStudents.map((s, idx) => {
                        const nisn = String(s.nisn)
                        const g = allNilaiMap[nisn] || {}
                        const isPilihan = s.ekskulRole === 'pilihan'
                        const nilai = isPilihan ? (g.ekskul_pilihan_nilai || '') : (g.ekskul_utama_nilai || '')
                        const ket = isPilihan ? (g.ekskul_pilihan_keterangan || '') : (g.ekskul_utama_keterangan || '')
                        const pramukaNilai = g.pramuka_nilai || ''
                        const isMissingGrade = !nilai || String(nilai).trim() === ''

                        return (
                          <tr
                            key={nisn}
                            className={`transition-colors ${
                              isMissingGrade
                                ? 'bg-amber-50/25 hover:bg-amber-50/50'
                                : 'hover:bg-slate-50/70'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {s.nisn}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2 max-w-[240px]">
                                <span className="font-bold text-slate-900 truncate" title={s.nama_lengkap}>
                                  {s.nama_lengkap}
                                </span>
                                {isMissingGrade && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200/80">
                                    Belum Dinilai
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-50 text-[#004e85] border border-blue-200/80">
                                {s.kelas || '-'}
                              </span>
                            </td>

                            {/* Pramuka Nilai */}
                            <td className="py-2.5 px-3 text-center bg-amber-50/20 border-x border-slate-200">
                              <span className={`inline-block font-mono font-bold text-xs ${
                                pramukaNilai ? 'text-amber-700' : 'text-slate-400'
                              }`}>
                                {pramukaNilai || '-'}
                              </span>
                            </td>

                            {/* Predikat Nilai Ekskul Ini */}
                            <td className="py-2.5 px-3 text-center border-r border-slate-200 bg-sky-50/20">
                              <select
                                value={nilai}
                                onChange={(e) => handleEkskulStudentGradeChange(
                                  nisn,
                                  isPilihan ? 'ekskul_pilihan_nilai' : 'ekskul_utama_nilai',
                                  e.target.value
                                )}
                                className={`px-2.5 py-1 rounded-lg font-bold outline-none focus:ring-1 focus:ring-[#004e85] shadow-xs ${
                                  isMissingGrade
                                    ? 'border-amber-400 bg-amber-50/60 text-amber-900 ring-1 ring-amber-200'
                                    : 'border-slate-200 text-slate-900 bg-white'
                                }`}
                              >
                                <option value="">-</option>
                                <option value="A">A (Sangat Baik)</option>
                                <option value="B">B (Baik)</option>
                                <option value="C">C (Cukup)</option>
                                <option value="D">D (Kurang)</option>
                              </select>
                            </td>

                            {/* Narasi Capaian */}
                            <td className="py-2.5 px-3">
                              <p className="text-[11px] text-slate-600 line-clamp-2" title={ket || (nilai ? getDescForPredikat(nilai, 'umum') : 'Belum dinilai')}>
                                {nilai ? (ket || getDescForPredikat(nilai, 'umum')) : (
                                  <span className="text-amber-700 font-semibold not-italic">Belum ada nilai predikat (-)</span>
                                )}
                              </p>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: MASTER KRITERIA PREDIKAT (PRAMUKA VS UMUM)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'kriteria' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
          {/* Header & Global Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Pengaturan Kriteria & Deskripsi Predikat Ekstrakurikuler
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kriteria ini akan otomatis mengisi kolom narasi capaian di rapor siswa saat predikat A/B/C/D dipilih.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResetKriteria(activeKriteriaKategori)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                title="Kembalikan narasi kriteria ke template bawaan sistem"
              >
                Reset Standar
              </button>
              <button
                onClick={() => handleSaveKriteria(activeKriteriaKategori)}
                disabled={saving}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-[#004e85] hover:bg-[#003d68] shadow-sm transition-all flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Kriteria</span>
                )}
              </button>
            </div>
          </div>

          {/* Sub-Tabs: Pramuka (Wajib) vs Ekskul Umum / Pilihan */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="inline-flex bg-slate-100 p-1.5 rounded-xl gap-1 self-start">
              <button
                type="button"
                onClick={() => setActiveKriteriaKategori('pramuka')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeKriteriaKategori === 'pramuka'
                    ? 'bg-white text-[#004e85] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Khusus Pramuka (Wajib)
              </button>
              <button
                type="button"
                onClick={() => setActiveKriteriaKategori('umum')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeKriteriaKategori === 'umum'
                    ? 'bg-white text-[#004e85] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ekstrakurikuler Umum
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              {activeKriteriaKategori === 'pramuka'
                ? 'Kategori: Pendidikan Kepramukaan (Ekskul Wajib)'
                : 'Kategori: Ekstrakurikuler Minat & Bakat'}
            </div>
          </div>

          {/* Context Info Note */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#004e85] shrink-0"></span>
              <span>
                {activeKriteriaKategori === 'pramuka'
                  ? 'Narasi capaian khusus Pramuka yang berfokus pada Trisatya, Dasa Darma, dan kecakapan kepramukaan (SKU).'
                  : 'Narasi capaian ekskul umum yang berfokus pada penguasaan materi/teknik, keaktifan, dan sportivitas.'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">
              Narasi otomatis mengisi rapor saat predikat dipilih
            </span>
          </div>

          {/* 4 Predikat Cards (A, B, C, D) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(activeKriteriaKategori === 'pramuka' ? kriteriaPramuka : kriteriaUmum).map((k, idx) => {
              const badgeStyles = {
                A: {
                  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  label: 'Sangat Baik',
                  tag: 'bg-emerald-50 text-emerald-700'
                },
                B: {
                  badge: 'bg-blue-50 text-blue-700 border-blue-200',
                  label: 'Baik',
                  tag: 'bg-blue-50 text-blue-700'
                },
                C: {
                  badge: 'bg-amber-50 text-amber-700 border-amber-200',
                  label: 'Cukup',
                  tag: 'bg-amber-50 text-amber-700'
                },
                D: {
                  badge: 'bg-rose-50 text-rose-700 border-rose-200',
                  label: 'Kurang',
                  tag: 'bg-rose-50 text-rose-700'
                }
              }
              const style = badgeStyles[k.predikat] || {
                badge: 'bg-slate-50 text-slate-700 border-slate-200',
                label: '-',
                tag: 'bg-slate-50 text-slate-700'
              }

              return (
                <div
                  key={k.predikat}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all space-y-3.5 flex flex-col justify-between"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-xl font-black text-sm border flex items-center justify-center ${style.badge}`}>
                        {k.predikat}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Predikat {k.predikat} ({style.label})
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Narasi deskripsi rapor
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${style.tag}`}>
                      {style.label}
                    </span>
                  </div>

                  {/* Card Body: Textarea */}
                  <div className="space-y-1.5 flex-1 flex flex-col">
                    <label className="text-[11px] font-semibold text-slate-600 block">
                      Deskripsi Capaian / Keterangan Rapor:
                    </label>
                    <textarea
                      rows={4}
                      value={k.keterangan}
                      placeholder={`Tuliskan deskripsi narasi capaian predikat ${k.predikat}...`}
                      onChange={(e) => {
                        const val = e.target.value
                        if (activeKriteriaKategori === 'pramuka') {
                          setKriteriaPramuka(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, keterangan: val } : item))
                          )
                        } else {
                          setKriteriaUmum(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, keterangan: val } : item))
                          )
                        }
                      }}
                      className="w-full flex-1 p-3.5 border border-slate-200 rounded-xl text-xs text-slate-800 bg-slate-50/50 focus:bg-white focus:border-[#004e85] focus:ring-2 focus:ring-[#004e85]/15 outline-none transition-all resize-none leading-relaxed"
                    />
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>{k.keterangan?.length || 0} karakter</span>
                    <span>Tersedia untuk buku rapor</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 3: MASTER KEGIATAN EKSTRAKURIKULER
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'master' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Master Daftar Kegiatan Ekstrakurikuler
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar kegiatan ekstrakurikuler yang aktif diselenggarakan di sekolah.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {/* Tombol Hapus Terpilih (jika ada checkbox yang dicentang dan bukan sesi guru terbatas) */}
              {selectedEkskulIds.length > 0 && !isTeacherSession && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedEkskuls}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Hapus Terpilih ({selectedEkskulIds.length})</span>
                </button>
              )}

              {/* Tombol Hapus Semua (hanya untuk Admin) */}
              {displayedMasterEkskul.length > 0 && !isTeacherSession && (
                <button
                  type="button"
                  onClick={handleDeleteAllEkskuls}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex items-center gap-1.5 transition-all"
                  title="Hapus seluruh kegiatan ekstrakurikuler"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Hapus Semua</span>
                </button>
              )}

              {/* Tombol Tambah Kegiatan Ekskul */}
              <button
                type="button"
                onClick={() => {
                  setEditingEkskul(null)
                  setEkskulForm({ nama: '', jenis: 'utama', pembina: '', guru_id: '', guru_nama: '', hari: '', waktu: '' })
                  setShowEkskulModal(true)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#004e85] hover:bg-[#003d68] shadow-sm flex items-center gap-1.5 transition-all"
              >
                <span>+ Tambah Kegiatan Ekskul</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua ekstrakurikuler"
                      checked={displayedMasterEkskul.length > 0 && selectedEkskulIds.length === displayedMasterEkskul.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEkskulIds(displayedMasterEkskul.map(m => m.id))
                        } else {
                          setSelectedEkskulIds([])
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-[#004e85] focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-10 text-center">No</th>
                  <th className="py-3 px-3">Nama Ekstrakurikuler</th>
                  <th className="py-3 px-3">Jenis Kegiatan</th>
                  <th className="py-3 px-3">Pembina / Pelatih</th>
                  <th className="py-3 px-3">Jadwal Latihan</th>
                  <th className="py-3 px-3 text-right w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {displayedMasterEkskul.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-1">
                        <p className="font-bold text-slate-600">Belum ada kegiatan ekstrakurikuler</p>
                        <p className="text-[11px] text-slate-400">
                          {isTeacherSession && teacherAssignedEkskuls.length > 0
                            ? 'Tidak ada kegiatan ekskul khusus yang ditugaskan kepada akun Anda.'
                            : 'Klik "+ Tambah Kegiatan Ekskul" untuk mulai menambahkan ekskul sekolah.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedMasterEkskul.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${item.nama}`}
                          checked={selectedEkskulIds.includes(item.id)}
                          onChange={() => {
                            setSelectedEkskulIds(prev =>
                              prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                            )
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-[#004e85] focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {item.nama}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            item.jenis === 'wajib'
                              ? 'bg-rose-100 text-rose-800'
                              : item.jenis === 'utama'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.jenis}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-medium text-slate-800">{item.pembina || item.guru_nama || '-'}</span>
                          {(item.guru_nama || item.guru_id) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                              👨‍🏫 Pengampu: {item.guru_nama || 'Guru Terpilih'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {item.hari ? `${item.hari} (${item.waktu || '-'})` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            const matchedGuru = guruList.find(g =>
                              (item.guru_id && String(g.id) === String(item.guru_id)) ||
                              (item.guru_nama && g.nama_guru?.trim().toLowerCase() === item.guru_nama?.trim().toLowerCase()) ||
                              (item.pembina && g.nama_guru?.trim().toLowerCase() === item.pembina?.trim().toLowerCase())
                            )
                            setEditingEkskul(item)
                            setEkskulForm({
                              nama: item.nama || '',
                              jenis: item.jenis || 'utama',
                              pembina: item.pembina || '',
                              guru_id: item.guru_id || matchedGuru?.id || '',
                              guru_nama: item.guru_nama || matchedGuru?.nama_guru || '',
                              hari: item.hari || '',
                              waktu: item.waktu || ''
                            })
                            setShowEkskulModal(true)
                          }}
                          className="text-xs font-bold text-[#004e85] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEkskulItem(item.id, item.nama, item.jenis)}
                          className="text-xs font-bold text-rose-600 hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: TAMBAH / EDIT EKSKUL
      ══════════════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: TAMBAH / EDIT EKSKUL (PORTAL & FULL-PAGE BLUR)
      ══════════════════════════════════════════════════════════════════════════ */}
      {showEkskulModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto font-sans animate-fade-in">
          {/* Full Page Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
            onClick={() => setShowEkskulModal(false)}
          />

          {/* Modal Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-100 z-10 my-8 overflow-hidden animate-slide-up flex flex-col">
            <div className="p-5 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50/80 rounded-t-2xl">
              <h3 className="text-base font-bold text-slate-800">
                {editingEkskul ? 'Edit Kegiatan Ekstrakurikuler' : 'Tambah Kegiatan Ekstrakurikuler'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEkskulModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Tutup"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveEkskulItem} className="p-5 sm:p-6 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Kegiatan *</label>
                <input
                  type="text"
                  required
                  value={ekskulForm.nama}
                  onChange={(e) => setEkskulForm({ ...ekskulForm, nama: e.target.value })}
                  placeholder="Contoh: Futsal, Basket, Robotika"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Kategori / Jenis *</label>
                <select
                  value={ekskulForm.jenis}
                  onChange={(e) => setEkskulForm({ ...ekskulForm, jenis: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85]"
                >
                  <option value="utama">Ekstrakurikuler (Reguler)</option>
                  <option value="wajib">Wajib (Pramuka)</option>
                </select>
              </div>

              {/* Guru Penanggung Jawab / Pengampu */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Guru Penanggung Jawab / Pengampu Nilai</label>
                  <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">Akses Khusus Guru</span>
                </div>
                <select
                  value={ekskulForm.guru_id || ''}
                  onChange={(e) => {
                    const selId = e.target.value
                    if (!selId) {
                      setEkskulForm(prev => ({ ...prev, guru_id: '', guru_nama: '' }))
                    } else {
                      const selGuru = guruList.find(g => String(g.id) === String(selId))
                      const gNama = selGuru?.nama_guru || ''
                      setEkskulForm(prev => ({
                        ...prev,
                        guru_id: selId,
                        guru_nama: gNama,
                        pembina: prev.pembina ? prev.pembina : gNama
                      }))
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85] bg-white"
                >
                  <option value="">-- Bebas Diisi Semua Guru (Tanpa Batasan) --</option>
                  {guruList.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nama_guru} {g.kode ? `(${g.kode})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  Jika guru di-set, maka saat guru tersebut login hanya akan tampil ekskul yang diampunya. Jika dibebaskan (kosong), maka semua guru dapat mengaksesnya.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pembina / Pelatih Lapangan</label>
                <input
                  type="text"
                  value={ekskulForm.pembina}
                  onChange={(e) => setEkskulForm({ ...ekskulForm, pembina: e.target.value })}
                  placeholder="Contoh: Coach David / Nama Pembina"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Hari Latihan</label>
                  <input
                    type="text"
                    value={ekskulForm.hari}
                    onChange={(e) => setEkskulForm({ ...ekskulForm, hari: e.target.value })}
                    placeholder="Contoh: Jumat"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Waktu / Jam</label>
                  <input
                    type="text"
                    value={ekskulForm.waktu}
                    onChange={(e) => setEkskulForm({ ...ekskulForm, waktu: e.target.value })}
                    placeholder="Contoh: 15.30 - 17.00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-[#004e85]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEkskulModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#004e85] hover:bg-[#003d68] rounded-xl shadow-xs transition-all"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: EKSPOR DATA EKSKUL KE EXCEL (PORTAL & FULL-PAGE BLUR)
      ══════════════════════════════════════════════════════════════════════════ */}
      {showExportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto font-sans animate-fade-in">
          {/* Full Page Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
            onClick={() => setShowExportModal(false)}
          />

          {/* Modal Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-100 z-10 my-8 overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50/80 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#004e85]/10 text-[#004e85] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Ekspor Data Ekstrakurikuler ke Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih cakupan data dan format lembar Excel yang ingin diunduh.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Tutup"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0 text-slate-800 text-xs">
              {/* Scope Options */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Pilih Cakupan Data:
                </label>

                {/* 1. Full Data Lengkap */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    exportScope === 'full'
                      ? 'border-[#004e85] bg-sky-50/40 ring-1 ring-[#004e85]/20 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'full'}
                    onChange={() => setExportScope('full')}
                    className="mt-0.5 text-[#004e85] focus:ring-[#004e85]"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">Full Data Lengkap</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Rekomendasi Rekap
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      Mengekspor seluruh nilai siswa dari semua kelas dalam sheet terpisah, disertai sheet Master Kegiatan dan Panduan Kriteria Predikat.
                    </p>
                  </div>
                </label>

                {/* 2. Nilai Kelas Aktif Saja */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    exportScope === 'nilai_current'
                      ? 'border-[#004e85] bg-sky-50/40 ring-1 ring-[#004e85]/20 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'nilai_current'}
                    onChange={() => setExportScope('nilai_current')}
                    className="mt-0.5 text-[#004e85] focus:ring-[#004e85]"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">Nilai Siswa Kelas {selectedKelas} Saja</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                        Kelas Aktif
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      Mengekspor data nilai siswa kelas {selectedKelas} saat ini beserta keterangan narasi capaian.
                    </p>
                  </div>
                </label>

                {/* 3. Nilai Beberapa / Seluruh Kelas */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    exportScope === 'nilai_all'
                      ? 'border-[#004e85] bg-sky-50/40 ring-1 ring-[#004e85]/20 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'nilai_all'}
                    onChange={() => setExportScope('nilai_all')}
                    className="mt-0.5 text-[#004e85] focus:ring-[#004e85]"
                  />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-slate-900 block">Nilai Pilihan / Seluruh Kelas</span>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      Mengekspor data nilai siswa untuk kelas-kelas yang dipilih ke dalam file Excel.
                    </p>
                  </div>
                </label>

                {/* 4. Hanya Master & Kriteria */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    exportScope === 'master_only'
                      ? 'border-[#004e85] bg-sky-50/40 ring-1 ring-[#004e85]/20 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'master_only'}
                    onChange={() => setExportScope('master_only')}
                    className="mt-0.5 text-[#004e85] focus:ring-[#004e85]"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">Hanya Master Kegiatan & Kriteria Predikat</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                        Format & Panduan
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      Daftar kegiatan ekstrakurikuler (pelatih/jadwal) dan rincian kriteria A, B, C, D tanpa data nilai siswa.
                    </p>
                  </div>
                </label>

                {/* 5. Template Kosong Siap Isi */}
                <label
                  className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    exportScope === 'template'
                      ? 'border-[#004e85] bg-sky-50/40 ring-1 ring-[#004e85]/20 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'template'}
                    onChange={() => setExportScope('template')}
                    className="mt-0.5 text-[#004e85] focus:ring-[#004e85]"
                  />
                  <div className="flex-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">Template Excel Kosong Siap Isi</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-[#004e85]">
                        Siap Input Guru
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      Daftar siswa & NISN tanpa nilai, siap dibagikan untuk diisi guru/pembina lalu diimpor kembali.
                    </p>
                  </div>
                </label>
              </div>

              {/* Sub-Option: Checklist Kelas (Ketika pilih nilai_all atau template) */}
              {(exportScope === 'nilai_all' || exportScope === 'template') && (
                <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Pilih Kelas yang Diekspor:</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (exportSelectedClasses.length === allKelasList.length) {
                          setExportSelectedClasses([])
                        } else {
                          setExportSelectedClasses([...allKelasList])
                        }
                      }}
                      className="text-[11px] font-bold text-[#004e85] hover:underline"
                    >
                      {exportSelectedClasses.length === allKelasList.length ? 'Batalkan Semua' : 'Pilih Semua Kelas'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {allKelasList.map(k => {
                      const isChecked = exportSelectedClasses.length === 0 || exportSelectedClasses.includes(k)
                      return (
                        <label key={k} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let current = exportSelectedClasses.length === 0 ? [...allKelasList] : [...exportSelectedClasses]
                              if (e.target.checked) {
                                if (!current.includes(k)) current.push(k)
                              } else {
                                current = current.filter(x => x !== k)
                              }
                              setExportSelectedClasses(current)
                            }}
                            className="rounded text-[#004e85] focus:ring-[#004e85]"
                          />
                          <span className="font-semibold">Kelas {k}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sub-Option: Format Lembar Excel */}
              {['full', 'nilai_all', 'template'].includes(exportScope) && (
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Format Lembar Excel (Worksheet):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-all ${
                      exportFormat === 'multi_sheet' ? 'border-[#004e85] bg-white text-[#004e85] font-bold shadow-xs' : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="exportFormat"
                        checked={exportFormat === 'multi_sheet'}
                        onChange={() => setExportFormat('multi_sheet')}
                        className="text-[#004e85] focus:ring-[#004e85]"
                      />
                      <span>1 Sheet Terpisah per Kelas</span>
                    </label>
                    <label className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-all ${
                      exportFormat === 'single_sheet' ? 'border-[#004e85] bg-white text-[#004e85] font-bold shadow-xs' : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="exportFormat"
                        checked={exportFormat === 'single_sheet'}
                        onChange={() => setExportFormat('single_sheet')}
                        className="text-[#004e85] focus:ring-[#004e85]"
                      />
                      <span>1 Sheet Gabungan Seluruh Kelas</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Progress Message */}
              {isExporting && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#004e85]/30 border-t-[#004e85] rounded-full animate-spin"></div>
                  <span>{exportProgress || 'Sedang memproses dan menyusun file Excel...'}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => executeExport(exportScope, exportFormat)}
                className="px-5 py-2 text-xs font-bold text-white bg-[#004e85] hover:bg-[#003d68] rounded-xl shadow-xs transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{isExporting ? 'Memproses Ekspor...' : 'Unduh File Excel'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: IMPOR NILAI EKSKUL DARI EXCEL (PORTAL & FULL-PAGE BLUR)
      ══════════════════════════════════════════════════════════════════════════ */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 overflow-y-auto font-sans animate-fade-in">
          {/* Full Page Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
            onClick={() => {
              setShowImportModal(false)
              setImportPreviewData([])
            }}
          />

          {/* Modal Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-100 z-10 my-8 overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 shrink-0 flex justify-between items-center bg-slate-50/80 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-[#004e85] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Impor Nilai Ekstrakurikuler dari Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    {importPreviewData.length === 0
                      ? 'Pilih atau unggah file Excel (.xlsx / .xls) yang berisi nilai siswa.'
                      : `Ditemukan ${importPreviewData.length} baris data siswa siap disimpan.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false)
                  setImportPreviewData([])
                }}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Tutup"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0 text-slate-800 text-xs">
              {/* STATE 1: BELUM ADA FILE TERPILIH (UPLOAD ZONE) */}
              {importPreviewData.length === 0 ? (
                <div className="space-y-4">
                  {/* Drag & Drop Upload Zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#004e85] hover:bg-sky-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#004e85] flex items-center justify-center mx-auto shadow-xs">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">
                        Klik untuk Memilih File Excel (.xlsx / .xls)
                      </span>
                      <span className="text-xs text-slate-500 mt-1 block">
                        Mendukung format satu lembar (Single Sheet) maupun multi lembar (Sheet per kelas).
                      </span>
                    </div>
                  </div>

                  {/* Petunjuk Format Kolom */}
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 block">Panduan Format Kolom Excel:</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px] leading-relaxed">
                      <li>Kolom Wajib: <strong>NISN</strong>, <strong>NAMA SISWA</strong>, dan <strong>KELAS</strong>.</li>
                      <li>Nilai Pramuka: Kolom <strong>PREDIKAT PRAMUKA (A/B/C/D)</strong> (terisi huruf A, B, C, atau D).</li>
                      <li>Ekstrakurikuler: Kolom <strong>NAMA EKSTRAKURIKULER</strong> dan <strong>PREDIKAT</strong>.</li>
                      <li>Kolom keterangan capaian dapat dikosongkan — sistem akan otomatis mengisi narasi sesuai kriteria predikat.</li>
                    </ul>
                  </div>

                  {/* Quick Link Download Template */}
                  <div className="flex items-center justify-between p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 text-xs">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>Belum memiliki format file? Unduh template kosong siap pakai:</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => executeExport('template', 'single_sheet')}
                      className="px-3.5 py-1.5 bg-[#004e85] hover:bg-[#003d68] text-white font-bold rounded-lg text-xs shadow-xs transition-all whitespace-nowrap"
                    >
                      Unduh Template
                    </button>
                  </div>
                </div>
              ) : (
                /* STATE 2: PREVIEW DATA IMPORT */
                <div className="space-y-4">
                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-700">Total Siswa Terbaca:</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-[#004e85]/10 text-[#004e85] font-bold">
                        {importPreviewData.length} Siswa
                      </span>
                      {importSummary.validCount > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                          {importSummary.validCount} Teridentifikasi di Database
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-bold text-slate-700 mr-1">Kelas Terdeteksi:</span>
                      {importSummary.classes.map(c => (
                        <span key={c} className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 font-bold text-[11px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Smart Normalizer Section */}
                  {rawEkskulList.length > 0 && (() => {
                    const unmappedList = rawEkskulList.filter(item => {
                      if (item.isIgnore) return false
                      const mapped = ekskulMapping[item.raw]
                      return !mapped || !masterEkskul.some(m => m.nama === mapped)
                    })
                    const typoCount = rawEkskulList.filter(item => !item.isIgnore && item.isTypoCandidate).length

                    return (
                      <div className="space-y-3">
                        {/* Warning Alert Banner (if any unmapped/typo ekskuls detected) */}
                        {unmappedList.length > 0 ? (
                          <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs animate-fade-in">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-xs font-bold text-amber-900">
                                  Perhatian: Ditemukan {unmappedList.length} Penulisan Ekskul yang Belum Terhubung
                                </h4>
                                <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-bold text-[10px]">
                                  Perlu Penyesuaian
                                </span>
                              </div>
                              <p className="text-[11px] text-amber-800/90 mt-1 leading-relaxed">
                                Terdapat penulisan dari guru/file Excel yang tidak cocok langsung dengan Master Ekskul sekolah (contoh: singkatan atau typo seperti <em>MD, Baskeg Putri, Balu Tangkis</em>). Silakan pilih nama ekskul tujuan yang sesuai pada daftar di bawah agar nama kegiatan rapi dan tidak membuat ekskul baru yang salah.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-center justify-between gap-2.5 text-xs text-emerald-800 shadow-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                              <span className="font-semibold text-[11px]">
                                Semua penulisan ekskul ({rawEkskulList.filter(x => !x.isIgnore).length} jenis) telah selaras dengan Master Ekskul sekolah.
                              </span>
                            </div>
                            {typoCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold text-[10px] shrink-0">
                                {typoCount} singkatan/typo diselaraskan
                              </span>
                            )}
                          </div>
                        )}

                        {/* Interactive Alignment Grid */}
                        <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-200/80">
                            <div>
                              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#004e85]"></span>
                                Penyelarasan Nama Ekskul ({rawEkskulList.length} Ditemukan)
                              </span>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Sesuaikan ekskul tujuan untuk setiap penulisan dari berkas Excel. Data yang belum terhubung atau kosong tidak akan membuat ekskul baru di sistem.
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                            {rawEkskulList.map((item) => {
                              const currentMapped = ekskulMapping[item.raw] ?? ''
                              const isTargetInMaster = masterEkskul.some(m => m.nama === currentMapped)
                              const isUnlinked = !item.isIgnore && (!currentMapped || !isTargetInMaster)
                              const isTypoAuto = !item.isIgnore && item.isTypoCandidate && isTargetInMaster

                              return (
                                <div
                                  key={item.raw}
                                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                                    isUnlinked
                                      ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                                      : isTypoAuto
                                        ? 'bg-sky-50/40 border-sky-200'
                                        : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-800 truncate block max-w-[125px]" title={item.raw}>
                                        {item.raw}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-semibold shrink-0">
                                        {item.count}x
                                      </span>
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1">
                                      {isUnlinked ? (
                                        <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                          Belum terhubung
                                        </span>
                                      ) : isTypoAuto ? (
                                        <span className="text-[10px] text-sky-700 font-semibold flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                                          Saran typo ({item.similarity ? `${Math.round(item.similarity * 100)}%` : 'alias'})
                                        </span>
                                      ) : item.isIgnore ? (
                                        <span className="text-[10px] text-slate-400">Diabaikan / Kosong</span>
                                      ) : (
                                        <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                          Terselaraskan
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-slate-300 text-xs">➔</span>
                                    <select
                                      value={currentMapped}
                                      onChange={(e) => handleMappingChange(item.raw, e.target.value)}
                                      className={`px-2.5 py-1.5 text-xs border rounded-lg outline-none font-semibold truncate transition-all max-w-[175px] ${
                                        isUnlinked
                                          ? 'border-amber-400 bg-white text-amber-900 focus:border-amber-600 ring-1 ring-amber-200'
                                          : 'border-slate-200 bg-slate-50/90 focus:bg-white focus:border-[#004e85] text-slate-800'
                                      }`}
                                    >
                                      <option value="">— Kosongkan / Abaikan —</option>
                                      <optgroup label="Pilih Master Ekskul:">
                                        {masterEkskul.map((m) => (
                                          <option key={m.id || m.nama} value={m.nama}>
                                            {m.nama}
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Preview Table */}
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold text-[10px] uppercase sticky top-0 border-b border-slate-200">
                          <th className="py-2.5 px-3 w-10 text-center">No</th>
                          <th className="py-2.5 px-3 w-24">NISN</th>
                          <th className="py-2.5 px-3 min-w-[140px]">Nama Peserta Didik</th>
                          <th className="py-2.5 px-3 w-16 text-center">Kelas</th>
                          <th className="py-2.5 px-3 bg-amber-50/70 text-center w-24">Pramuka</th>
                          <th className="py-2.5 px-3 min-w-[150px]">Kegiatan Ekstrakurikuler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800 text-[11px]">
                        {importPreviewData.slice(0, 30).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-center text-slate-400 font-bold">{i + 1}</td>
                            <td className="py-2 px-3 font-mono text-slate-600">{row.nisn}</td>
                            <td className="py-2 px-3 font-bold truncate max-w-[160px]">
                              {row.nama || '-'}
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-[#004e85]">{row.kelas || selectedKelas}</td>
                            <td className="py-2 px-3 text-center font-black text-amber-700 bg-amber-50/40">
                              {row.pramukaNilai || '-'}
                            </td>
                            <td className="py-2 px-3">
                              {row.utamaNama ? (
                                <span className="font-semibold text-slate-900">
                                  {row.utamaNama}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importPreviewData.length > 30 && (
                    <p className="text-[11px] text-slate-500 italic">
                      Menampilkan 30 data teratas dari total {importPreviewData.length} baris siswa yang siap disimpan.
                    </p>
                  )}

                  {/* Progress Indicator */}
                  {isImporting && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></div>
                      <span>{importProgress || 'Sedang menyimpan data ke server...'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex justify-between items-center shrink-0">
              {importPreviewData.length > 0 ? (
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => {
                    setImportPreviewData([])
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  Pilih File Lain
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => {
                    setShowImportModal(false)
                    setImportPreviewData([])
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all"
                >
                  Batal
                </button>
                {importPreviewData.length > 0 && (
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={applyImportData}
                    className="px-5 py-2 text-xs font-bold text-white bg-[#004e85] hover:bg-[#003d68] rounded-xl shadow-xs transition-all flex items-center gap-2"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <span>Terapkan & Simpan ke Database</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: KONFIRMASI PROFESIONAL (PORTAL & FULL-PAGE BLUR)
      ══════════════════════════════════════════════════════════════════════════ */}
      {confirmModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 overflow-y-auto font-sans animate-fade-in">
          {/* Full Page Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
            onClick={() => !confirmModal.isProcessing && setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />

          {/* Modal Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-100 z-10 my-8 overflow-hidden animate-slide-up flex flex-col">
            <div className="p-6">
              {/* Badge Icon */}
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.type === 'danger'
                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                    : 'bg-amber-50 text-amber-600 border border-amber-100'
                }`}>
                  {confirmModal.type === 'danger' ? (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                    {confirmModal.message}
                  </p>
                </div>
              </div>

              {/* Submessage box if provided */}
              {confirmModal.submessage && (
                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                  {confirmModal.submessage}
                </div>
              )}

              {/* Pramuka Safe Badge if non-pramuka mode */}
              {confirmModal.pramukaSafeNote && (
                <div className="flex items-center gap-2.5 mt-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 text-xs font-semibold text-emerald-800">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>{confirmModal.pramukaSafeNote}</span>
                </div>
              )}

              {/* Keep Pramuka checkbox if showKeepPramukaOption */}
              {confirmModal.showKeepPramukaOption && (
                <label className="flex items-start gap-2.5 mt-3.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 cursor-pointer text-xs font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmModal.keepPramuka}
                    onChange={(e) => setConfirmModal(prev => ({ ...prev, keepPramuka: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 rounded text-[#004e85] focus:ring-0 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold">{confirmModal.keepPramukaLabel || 'Pertahankan Ekskul Wajib Pramuka'}</span>
                    <p className="text-[10px] text-amber-700 font-normal mt-0.5">
                      {confirmModal.keepPramukaSub || 'Hanya menghapus kegiatan ekskul non-wajib (Pramuka tetap tersimpan di daftar).'}
                    </p>
                  </div>
                </label>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={confirmModal.isProcessing}
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors disabled:opacity-50"
                >
                  {confirmModal.cancelText || 'Batal'}
                </button>
                <button
                  type="button"
                  disabled={confirmModal.isProcessing}
                  onClick={async () => {
                    if (confirmModal.onConfirm) {
                      setConfirmModal(prev => ({ ...prev, isProcessing: true }))
                      try {
                        await confirmModal.onConfirm(confirmModal.keepPramuka)
                        setConfirmModal(prev => ({ ...prev, isOpen: false, isProcessing: false }))
                      } catch (err) {
                        setConfirmModal(prev => ({ ...prev, isProcessing: false }))
                        setAlertInfo({ type: 'error', message: 'Terjadi kesalahan: ' + err.message })
                      }
                    } else {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }))
                    }
                  }}
                  className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 ${
                    confirmModal.type === 'danger'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {confirmModal.isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <span>{confirmModal.confirmText || 'Ya, Hapus'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL: DAFTAR SISWA BELUM TERDAFTAR DI EKSKUL MANAPUN
      ══════════════════════════════════════════════════════════════════════════ */}
      {showUnassignedModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-amber-50/40 border-b border-slate-200/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 text-lg shrink-0">
                  ⚠️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      Siswa Belum Memiliki Ekstrakurikuler
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                      {unassignedAllStudents.length} Siswa
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Daftar siswa sekolah yang belum terdaftar di kegiatan ekskul manapun. Anda dapat langsung memilihkan ekskul untuk mereka di sini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUnassignedModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Filter Bar dalam Modal */}
            <div className="p-3 sm:px-5 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                {/* Filter Kelas */}
                <select
                  value={unassignedClassFilter}
                  onChange={(e) => setUnassignedClassFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-[#004e85]"
                >
                  <option value="ALL">Semua Kelas ({unassignedAllStudents.length})</option>
                  {unassignedClasses.map(k => {
                    const cnt = unassignedAllStudents.filter(s => s.kelas === k).length
                    return (
                      <option key={k} value={k}>
                        Kelas {k} ({cnt})
                      </option>
                    )
                  })}
                </select>

                {/* Pencarian Nama / NISN */}
                <input
                  type="text"
                  value={unassignedSearchQuery}
                  onChange={(e) => setUnassignedSearchQuery(e.target.value)}
                  placeholder="Cari nama atau NISN..."
                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-[#004e85]"
                />
              </div>

              <div className="text-xs font-semibold text-slate-500 text-right shrink-0">
                Menampilkan <strong className="text-slate-800">{filteredUnassignedStudents.length}</strong> dari {unassignedAllStudents.length} siswa
              </div>
            </div>

            {/* Tabel Siswa Tanpa Ekskul */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {filteredUnassignedStudents.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
                    ✓
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {unassignedAllStudents.length === 0
                      ? 'Luar biasa! Seluruh siswa sekolah sudah memiliki kegiatan ekstrakurikuler.'
                      : 'Tidak ada siswa yang cocok dengan filter pencarian.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {unassignedAllStudents.length === 0
                      ? 'Semua siswa terdaftar di kegiatan ekskul utama maupun pilihan.'
                      : 'Coba ubah kata kunci pencarian atau pilih filter kelas lain.'}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-10 text-center">No</th>
                        <th className="py-2.5 px-3 w-28">NISN</th>
                        <th className="py-2.5 px-3 min-w-[160px]">Nama Siswa</th>
                        <th className="py-2.5 px-3 w-20 text-center">Kelas</th>
                        <th className="py-2.5 px-3 min-w-[220px]">Pilihkan Ekstrakurikuler Utama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredUnassignedStudents.map((s, idx) => {
                        const nisn = String(s.nisn)
                        const g = allNilaiMap[nisn] || {}
                        const curEkskul = g.ekskul_utama_nama || ''

                        return (
                          <tr key={nisn} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {s.nisn}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {s.nama_lengkap}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-black bg-blue-50 text-[#004e85] border border-blue-200/80">
                                {s.kelas || '-'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                value={curEkskul}
                                onChange={(e) => handleAssignEkskulFromModal(nisn, e.target.value)}
                                className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-[#004e85] shadow-xs cursor-pointer ${
                                  curEkskul
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-200 bg-white text-slate-700'
                                }`}
                              >
                                <option value="">-- Pilih Kegiatan Ekskul --</option>
                                {availableEkskulOptions.map(opt => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                💡 Setelah memilih ekskul, klik tombol <strong>Simpan Penugasan</strong> agar tersimpan ke sistem.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnassignedModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={savingUnassigned}
                  onClick={handleSaveUnassignedAssignments}
                  className="px-5 py-2 rounded-xl bg-[#004e85] hover:bg-[#003d68] text-white font-bold text-xs transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingUnassigned ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Penugasan Ekskul</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
