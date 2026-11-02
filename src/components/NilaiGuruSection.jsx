import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { getSemesterAktif } from '../utils/semesterUtils'
import { useConfirm } from '../utils/useConfirm'
import { downloadFile } from '../utils/fileDownloader'
import CbtBuatPenilaianModal from './cbt/CbtBuatPenilaianModal'
import ModalKelolaNilaiKarakter from './ModalKelolaNilaiKarakter'
import { 
  getPredikatKarakter, 
  parseKarakterDeskripsi, 
  RENTANG_NILAI_KARAKTER,
  ELEMEN_KARAKTER
} from '../data/indikatorKarakter'

// ─── Icons ───────────────────────────────────────────────────────────────────
const IconPlus = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconDownload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IconUpload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IconEye = ({ on }) => on
  ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
const IconClose = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
const IconPencil = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
const IconSettings = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>

// ─── BAB color palette ────────────────────────────────────────────────────────
const BAB_BG      = ['bg-indigo-50/70','bg-emerald-50/70','bg-amber-50/70','bg-purple-50/70','bg-rose-50/70','bg-cyan-50/70']
const BAB_TEXT    = ['text-indigo-800','text-emerald-800','text-amber-800','text-purple-800','text-rose-800','text-cyan-800']
const BAB_HOVER   = ['hover:bg-indigo-100/70','hover:bg-emerald-100/70','hover:bg-amber-100/70','hover:bg-purple-100/70','hover:bg-rose-100/70','hover:bg-cyan-100/70']
const BAB_BG_SUB  = ['bg-indigo-50/20','bg-emerald-50/20','bg-amber-50/20','bg-purple-50/20','bg-rose-50/20','bg-cyan-50/20']
const BAB_HOV_SUB = ['hover:bg-indigo-50/50','hover:bg-emerald-50/50','hover:bg-amber-50/50','hover:bg-purple-50/50','hover:bg-rose-50/50','hover:bg-cyan-50/50']

// ─── Local Storage Offline Queue Helpers ─────────────────────────────────────
const PENDING_GRADES_KEY = 'ebudimulia_pending_grades'

const savePendingGradeToStorage = (item) => {
  try {
    const existing = JSON.parse(localStorage.getItem(PENDING_GRADES_KEY) || '[]')
    const filtered = existing.filter(x => !(x.komponenId === item.komponenId && x.nisn === item.nisn))
    filtered.push(item)
    localStorage.setItem(PENDING_GRADES_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.warn('LocalStorage error:', e)
  }
}

const removePendingGradeFromStorage = (komponenId, nisn) => {
  try {
    const existing = JSON.parse(localStorage.getItem(PENDING_GRADES_KEY) || '[]')
    const filtered = existing.filter(x => !(x.komponenId === komponenId && x.nisn === nisn))
    if (filtered.length > 0) {
      localStorage.setItem(PENDING_GRADES_KEY, JSON.stringify(filtered))
    } else {
      localStorage.removeItem(PENDING_GRADES_KEY)
    }
  } catch (e) {
    console.warn('LocalStorage error:', e)
  }
}

// Helper to identify character assessment components (Nilai Karakter / NIK / NK / Sikap)
const isKarakterKomponen = (nama, deskripsi = '') => {
  const n = (nama || '').toUpperCase().trim();
  const d = (deskripsi || '').toUpperCase().trim();
  return (
    n.includes('KARAKTER') ||
    n.includes('SIKAP') ||
    n === 'NK' ||
    n.startsWith('NK ') ||
    n.startsWith('NK-') ||
    n.startsWith('NK_') ||
    n.includes('N. KARAKTER') ||
    n.includes('N.KARAKTER') ||
    n.startsWith('N. KARAKTER') ||
    n === 'NIK' ||
    n.startsWith('NIK ') ||
    n.startsWith('NIK-') ||
    n.startsWith('NIK_') ||
    n.includes('N. INDIKATOR') ||
    n.includes('INDIKATOR KARAKTER') ||
    d.includes('KARAKTER') ||
    d.includes('INDIKATOR_KARAKTER')
  );
};

// Helper to identify Sumatif components (PSTS / PSAS / PSAT)
const isSumatif = (name) => {
  const u = (name || '').toUpperCase().trim();
  return u.includes('PSTS') || u.includes('PSAS') || u.includes('PSAT');
};

// ─── NilaiGuruSection ─────────────────────────────────────────────────────────
export default function NilaiGuruSection({ session, activeTa }) {
  // Step state: 1=Pilih Konteks, 2=Kelola BAB/TP, 3=Target Kelas, 4=Input Nilai

  // Context
  const [selectedMapelId, setSelectedMapelId]     = useState('')
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [targetKelasList, setTargetKelasList]     = useState([])
  const [activeTabKelas, setActiveTabKelas]       = useState('')
  const [slideDirection, setSlideDirection] = useState('right')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [filterOnlyMissing, setFilterOnlyMissing] = useState(false)
  const [tableZoom, setTableZoom] = useState(() => Number(localStorage.getItem('nilai_table_zoom')) || 100)
  const isCompactMode = tableZoom < 100

  // Mobile & Fullscreen Table States
  const [isTableFullscreen, setIsTableFullscreen] = useState(false)
  const [showFsFilterDropdown, setShowFsFilterDropdown] = useState(false)
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)
  const [showNisnMobile, setShowNisnMobile] = useState(() => {
    try {
      const saved = localStorage.getItem('ebudimulia_show_nisn')
      return saved !== null ? saved === 'true' : false
    } catch {
      return false
    }
  })

  const handleToggleNisn = (val) => {
    setShowNisnMobile(val)
    try {
      localStorage.setItem('ebudimulia_show_nisn', String(val))
    } catch (e) {
      console.warn(e)
    }
  }
  // Floating Mobile Keypad & D-Pad States
  const [showFloatingKeypad, setShowFloatingKeypad] = useState(false)
  const [isKeypadMinimized, setIsKeypadMinimized] = useState(false)
  const [keypadSize, setKeypadSize] = useState("normal") // "compact" | "normal"
  const [disableNativeKeyboard, setDisableNativeKeyboard] = useState(false)
  const [activeCellInfo, setActiveCellInfo] = useState(null) // { row, col, student, komponen, value }
  const [keypadPos, setKeypadPos] = useState({ x: 16, y: 80 }) // offset from right and bottom

  // Deteksi HP (Mobile / Android APK / Touchscreen smartphone) vs Laptop/PC
  const isMobileDevice = useMemo(() => {
    if (typeof window === 'undefined') return false
    return (
      Capacitor.isNativePlatform() ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    )
  }, [])
  const saveTimeoutRef = useRef({})
  const justFocusedCellRef = useRef(null)

  // Cegah scroll / mouse wheel merubah angka input secara tidak sengaja
  useEffect(() => {
    const handleWheel = (e) => {
      if (document.activeElement?.type === "number") {
        document.activeElement.blur()
      }
    }
    window.addEventListener("wheel", handleWheel, { passive: true })
    return () => window.removeEventListener("wheel", handleWheel)
  }, [])

  // Draggable Handler untuk Floating Keypad dengan Clamping Anti-Tersangkut
  const keypadDragRef = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 16, startPosY: 80 })

  const handleKeypadDragStart = (e) => {
    const point = e.touches ? e.touches[0] : e
    if (!point) return
    keypadDragRef.current = {
      isDragging: true,
      startX: point.clientX,
      startY: point.clientY,
      startPosX: keypadPos.x,
      startPosY: keypadPos.y,
    }
  }

  useEffect(() => {
    const handleDragMove = (e) => {
      if (!keypadDragRef.current.isDragging) return
      const point = e.touches ? e.touches[0] : e
      if (!point) return

      const deltaX = point.clientX - keypadDragRef.current.startX
      const deltaY = point.clientY - keypadDragRef.current.startY

      // Lebar keypad ~225px, Tinggi ~240px
      // Posisi right & bottom harus dijaga agar TIDAK BISA keluar dari layar
      const KEYPAD_WIDTH = 225
      const KEYPAD_HEIGHT = 240
      const maxRight = Math.max(10, window.innerWidth - KEYPAD_WIDTH - 10)
      const maxBottom = Math.max(10, window.innerHeight - KEYPAD_HEIGHT - 60)

      const rawX = keypadDragRef.current.startPosX - deltaX
      const rawY = keypadDragRef.current.startPosY - deltaY

      const newX = Math.max(10, Math.min(maxRight, rawX))
      const newY = Math.max(10, Math.min(maxBottom, rawY))
      setKeypadPos({ x: newX, y: newY })
    }

    const handleDragEnd = () => {
      keypadDragRef.current.isDragging = false
    }

    window.addEventListener("mousemove", handleDragMove)
    window.addEventListener("mouseup", handleDragEnd)
    window.addEventListener("touchmove", handleDragMove, { passive: true })
    window.addEventListener("touchend", handleDragEnd)
    window.addEventListener("touchcancel", handleDragEnd)

    return () => {
      window.removeEventListener("mousemove", handleDragMove)
      window.removeEventListener("mouseup", handleDragEnd)
      window.removeEventListener("touchmove", handleDragMove)
      window.removeEventListener("touchend", handleDragEnd)
      window.removeEventListener("touchcancel", handleDragEnd)
    }
  }, [keypadPos])

  // Auto-clamp jika orientasi HP berubah atau window resize
  useEffect(() => {
    const handleResize = () => {
      setKeypadPos(prev => {
        const KEYPAD_WIDTH = 225
        const KEYPAD_HEIGHT = 240
        const maxRight = Math.max(10, window.innerWidth - KEYPAD_WIDTH - 10)
        const maxBottom = Math.max(10, window.innerHeight - KEYPAD_HEIGHT - 60)
        return {
          x: Math.max(10, Math.min(maxRight, prev.x)),
          y: Math.max(10, Math.min(maxBottom, prev.y))
        }
      })
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Keypad Actions
  const handleKeypadPress = (action) => {
    if (!activeCellInfo) return
    const { row, col, student, komponen } = activeCellInfo
    const currentVal = (nilaiData[komponen.id]?.[student.nisn] !== undefined && nilaiData[komponen.id]?.[student.nisn] !== null)
      ? String(nilaiData[komponen.id]?.[student.nisn])
      : ""

    const isJustFocused = justFocusedCellRef.current === `${row}_${col}`

    let nextVal = currentVal
    if (action === "BACKSPACE") {
      justFocusedCellRef.current = null
      nextVal = currentVal.length > 1 ? currentVal.slice(0, -1) : ""
    } else if (action === "CLEAR") {
      justFocusedCellRef.current = null
      nextVal = ""
    } else if (action === "100") {
      justFocusedCellRef.current = null
      nextVal = "100"
    } else if (action === "KKM") {
      justFocusedCellRef.current = null
      nextVal = String(kkm || 75)
    } else {
      if (isJustFocused || currentVal === "" || currentVal === "0") {
        nextVal = String(action)
      } else {
        const appended = currentVal + String(action)
        nextVal = Number(appended) > 100 ? "100" : appended
      }
      justFocusedCellRef.current = null
    }

    const inputEl = document.querySelector(`input[data-grade-row="${row}"][data-grade-col="${col}"]`)
    if (inputEl) inputEl.value = nextVal
    handleNilaiChange(komponen.id, student.nisn, nextVal)
    setActiveCellInfo(prev => prev ? { ...prev, value: nextVal } : null)
  }

  const handleKeypadNavigate = (dir) => {
    if (!activeCellInfo) return
    const { row, col } = activeCellInfo
    const orderedKomponen = uniqueBabsClass.flatMap(bab => classKomponen.filter(k => (k.bab_nama || "Lainnya") === bab).sort(sortBabKomponen))
    let nextRow = row
    let nextCol = col

    if (dir === "UP") nextRow = Math.max(0, row - 1)
    else if (dir === "DOWN" || dir === "ENTER") nextRow = Math.min(displayStudents.length - 1, row + 1)
    else if (dir === "LEFT") nextCol = Math.max(0, col - 1)
    else if (dir === "RIGHT") nextCol = Math.min(orderedKomponen.length - 1, col + 1)

    const nextStudent = displayStudents[nextRow]
    const nextKomponen = orderedKomponen[nextCol]
    if (!nextStudent || !nextKomponen) return

    justFocusedCellRef.current = `${nextRow}_${nextCol}`

    const targetInput = document.querySelector(`input[data-grade-row="${nextRow}"][data-grade-col="${nextCol}"]`)
    if (targetInput) {
      targetInput.scrollIntoView({ block: "nearest", inline: "nearest" })
      targetInput.focus()
      targetInput.select()
      setTimeout(() => {
        if (document.activeElement === targetInput) {
          targetInput.select()
        }
      }, 15)
    }
    const nextVal = (nilaiData[nextKomponen.id]?.[nextStudent.nisn] !== undefined && nilaiData[nextKomponen.id]?.[nextStudent.nisn] !== null)
      ? String(nilaiData[nextKomponen.id]?.[nextStudent.nisn])
      : ""
    setActiveCellInfo({
      row: nextRow,
      col: nextCol,
      student: nextStudent,
      komponen: nextKomponen,
      value: nextVal
    })
  }

  // Handle lock body scroll saat mode layar penuh aktif
  useEffect(() => {
    if (isTableFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isTableFullscreen])

  // Handle tombol ESC untuk keluar layar penuh / menutup dropdown filter
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showFsFilterDropdown) {
          setShowFsFilterDropdown(false)
        } else if (isTableFullscreen) {
          setIsTableFullscreen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTableFullscreen, showFsFilterDropdown])

  useEffect(() => {
    setFilterOnlyMissing(false)
  }, [activeTabKelas, selectedMapelId, selectedSemesterId])

  // Data
  const [semesters, setSemesters]   = useState([])
  const [komponen, setKomponen]     = useState([])
  const [students, setStudents]     = useState([])
  const [nilaiData, setNilaiData]   = useState({})
  const [savingCells, setSavingCells] = useState(new Set())
  const [errorCells, setErrorCells]   = useState({})
  const [isSyncingPending, setIsSyncingPending] = useState(false)
  const [refreshingNilai, setRefreshingNilai]   = useState(false)

  // BAB/TP form
  const [showAddBab, setShowAddBab]         = useState(false)
  const [newBabNama, setNewBabNama]         = useState('')
  const [newBabRombel, setNewBabRombel]     = useState('')
  const [newBabSemesterId, setNewBabSemesterId] = useState('')
  const [newBabTargetKelas, setNewBabTargetKelas] = useState([])
  const [addingTpToBab, setAddingTpToBab]   = useState(null)
  const [newTpNama, setNewTpNama]           = useState('')
  const [newTpDeskripsi, setNewTpDeskripsi] = useState('')
  const [newTpBobot, setNewTpBobot]         = useState('1')
  const [newTpTargetKelas, setNewTpTargetKelas] = useState([])
  const [addingKomponen, setAddingKomponen] = useState(false)

  // Manage BAB/TP panel
  const [selectedBabToManage, setSelectedBabToManage] = useState(null)
  const [editBabName, setEditBabName]                 = useState('')
  const [selectedTpToManage, setSelectedTpToManage]   = useState(null)
  const [editTpData, setEditTpData]                   = useState({ nama: '', deskripsi: '', bobot: '1', target_kelas: [], instruksi: '', lampiran_urls: [] })
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [editingMetode, setEditingMetode]             = useState(null)

  const [manualBobotPending, setManualBobotPending] = useState(false)
  const [manualBobotValues, setManualBobotValues] = useState({})

  // Upload Excel
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResult, setUploadResult]     = useState(null)
  
  // New injected states
  const [babOpen, setBabOpen] = useState({})
  const [kkm, setKkm] = useState(75)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgressText, setExportProgressText] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportScope, setExportScope] = useState('current') // 'current' | 'all_mapel' | 'master_all'
  const [exportClassScope, setExportClassScope] = useState('guru') // 'guru' | 'school'
  const [allSchoolClasses, setAllSchoolClasses] = useState([])
  const [selectedExportClasses, setSelectedExportClasses] = useState([])
  const [showKelolaSemester, setShowKelolaSemester] = useState(false)
  const [kelolaSemesterRombel, setKelolaSemesterRombel] = useState('')
  const [maxNamaWidth, setMaxNamaWidth] = useState(260)

  // Nilai Karakter (NIK) states
  const [showKarakterModal, setShowKarakterModal] = useState(false)
  const [karakterModalBab, setKarakterModalBab] = useState('')
  const [editingKarakterKomponen, setEditingKarakterKomponen] = useState(null)
  const [savingKarakter, setSavingKarakter] = useState(false)
  const [showRentangInfoModal, setShowRentangInfoModal] = useState(false)

  // CBT Integration State
  const [showTarikCbtModal, setShowTarikCbtModal] = useState(false)
  const [cbtSesiList, setCbtSesiList] = useState([])
  const [selectedCbtSesiId, setSelectedCbtSesiId] = useState('')
  const [selectedCbtTargetKomponenId, setSelectedCbtTargetKomponenId] = useState('')
  const [cbtPesertaPreview, setCbtPesertaPreview] = useState([])
  const [loadingCbtData, setLoadingCbtData] = useState(false)
  const [savingCbtScores, setSavingCbtScores] = useState(false)
  const [selectedPesertaNisns, setSelectedPesertaNisns] = useState([])

  // Modal Buat Penilaian CBT dari TP
  const [showCbtWizardModal, setShowCbtWizardModal] = useState(false)
  const [cbtWizardInitialData, setCbtWizardInitialData] = useState(null)



  // Session data
  const waliKelas  = session?.kelas?.filter(k => activeTa && k.tahun_ajaran_id == activeTa?.id).map(k => k.kelas) || []
  const [localMapelRaw, setLocalMapelRaw] = useState(session?.guru_mapel_raw || [])

  useEffect(() => {
    if (session?.guru_mapel_raw && session.guru_mapel_raw.length > 0) {
      setLocalMapelRaw(session.guru_mapel_raw)
      return
    }
    async function fetchMapelFallback() {
      if (!session?.id) return
      try {
        const { data: dGm } = await supabase
          .from('guru_mapel')
          .select('kelas, tahun_ajaran_id, mata_pelajaran_id, mata_pelajaran(nama)')
          .eq('guru_id', session.id)
        if (dGm && dGm.length > 0) {
          setLocalMapelRaw(dGm)
          return
        }
      } catch (e) {}

      try {
        const { data: rpcGm } = await supabase.rpc('fn_get_guru_mapel', { p_guru_id: session.id })
        if (rpcGm && Array.isArray(rpcGm) && rpcGm.length > 0) {
          setLocalMapelRaw(rpcGm)
        }
      } catch (e) {}
    }
    fetchMapelFallback()
  }, [session?.id, session?.guru_mapel_raw])

  const mapelRaw   = (localMapelRaw.length > 0 ? localMapelRaw : (session?.guru_mapel_raw || [])).filter(m => !m.tahun_ajaran_id || !activeTa || m.tahun_ajaran_id == activeTa?.id)
  const uniqueMapels = mapelRaw.reduce((acc, m) => {
    const id = m.mata_pelajaran_id
    const nama = m.mata_pelajaran?.nama
    if (id && nama && !acc.find(x => x.id === id)) acc.push({ id, nama })
    return acc
  }, [])
  // activeTargetKelas = ONLY from guru's actual assignments (mapelRaw), never from stale component data
  const uniqueClassesForMapel = [...new Set(
    mapelRaw.filter(m => m.mata_pelajaran_id === selectedMapelId).map(m => m.kelas)
  )].filter(Boolean).sort()
  const activeTargetKelas = uniqueClassesForMapel
  // Extract unique rombel numbers (7, 8, 9) from class names like "7A", "7B"
  const uniqueRombels = [...new Set(uniqueClassesForMapel.map(c => c.replace(/\D/g, '')))].sort()
  const currentRombel = activeTabKelas ? activeTabKelas.replace(/\D/g, '') : ''
  const classesForRombel = useMemo(() => {
    return uniqueClassesForMapel.filter(c => c.replace(/\D/g, '') === currentRombel)
  }, [uniqueClassesForMapel, currentRombel])

  useEffect(() => {
    if (!activeTargetKelas || activeTargetKelas.length === 0) return
    const fetchMaxName = async () => {
       const { data } = await supabase.from('siswa_lengkap').select('nama_lengkap').in('kelas', activeTargetKelas)
       if (data && data.length > 0) {
          const maxLen = Math.max(...data.map(d => (d.nama_lengkap || '').length))
          // 1 char ~ 7.5px in standard fonts. Add 40px for padding
          const calculatedWidth = Math.max(200, Math.ceil(maxLen * 7.5 + 40))
          setMaxNamaWidth(calculatedWidth)
       }
    }
    fetchMaxName()
  }, [activeTargetKelas])

  useEffect(() => {
    const fetchSchoolClasses = async () => {
      try {
        let q = supabase.from('siswa_lengkap').select('kelas')
        if (activeTa?.id) q = q.eq('tahun_ajaran_id', activeTa.id)
        const { data } = await q
        if (data && data.length > 0) {
          const unique = [...new Set(data.map(d => (d.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
            const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
            if (numA !== numB) return numA - numB
            return a.localeCompare(b)
          })
          setAllSchoolClasses(unique)
        }
      } catch (err) {
        console.error('Error fetching school classes:', err)
      }
    }
    fetchSchoolClasses()
  }, [activeTa?.id])

  const handleOpenCbtWizard = (k) => {
    const currentMapel = uniqueMapels.find(m => m.id === selectedMapelId)
    setCbtWizardInitialData({
      judul: k?.nama ? `CBT - ${k.nama}` : 'Penilaian CBT',
      mapel: currentMapel?.nama || '',
      kelas_ids: activeTabKelas ? [activeTabKelas] : ['7A'],
      kategori: 'formatif'
    })
    setShowCbtWizardModal(true)
  }

  const [showConfigAkhirModal, setShowConfigAkhirModal] = useState(false)
  const [configAkhir, setConfigAkhir] = useState({ metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: false })

  const [showAddTp, setShowAddTp] = useState(false)

  const uploadRef = useRef(null)
  const tableRef = useRef(null)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // ─── Rapor & Penilaian Settings (pengaturan_sekolah) ─────────────────────
  const [raporSettings, setRaporSettings] = useState({
    status_rapor_pts: 'tutup',
    show_kolom_psts: 'true',
    show_kolom_psas: 'true',
    rapor_max_lingkup: 3,
    rapor_max_tp_per_lingkup: 3
  })
  const [showPtsSelectionModal, setShowPtsSelectionModal] = useState(false)
  const [tempSelectedPtsBabs, setTempSelectedPtsBabs] = useState([])
  const [savingPtsSelection, setSavingPtsSelection] = useState(false)

  const fetchRaporSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'status_rapor_pts',
          'show_kolom_psts',
          'show_kolom_psas',
          'rapor_max_lingkup',
          'rapor_max_tp_per_lingkup'
        ])
      if (data && data.length > 0) {
        const map = {}
        data.forEach(d => { map[d.setting_key] = d.setting_value })
        setRaporSettings({
          status_rapor_pts: map.status_rapor_pts || 'tutup',
          show_kolom_psts: map.show_kolom_psts !== undefined ? map.show_kolom_psts : 'true',
          show_kolom_psas: map.show_kolom_psas !== undefined ? map.show_kolom_psas : 'true',
          rapor_max_lingkup: map.rapor_max_lingkup ? parseInt(map.rapor_max_lingkup, 10) : 3,
          rapor_max_tp_per_lingkup: map.rapor_max_tp_per_lingkup ? parseInt(map.rapor_max_tp_per_lingkup, 10) : 3
        })
      }
    } catch (err) {
      console.error('Error fetching settings in NilaiGuruSection:', err)
    }
  }, [])

  useEffect(() => {
    fetchRaporSettings()
  }, [fetchRaporSettings])

  const isPstsOrPsas = useCallback((babName) => {
    const u = (babName || '').toUpperCase()
    return u.includes('PSTS') || u.includes('PSAS') || u.includes('PSAT')
  }, [])

  // Current semester komponen filtered by active tab kelas and Kurikulum sumatif visibility
  const classKomponen = useMemo(() => {
    if (!activeTabKelas) return []
    const curClass = String(activeTabKelas).trim().toUpperCase()

    // 1. Filter components that belong to activeTabKelas and selectedSemester (matching LegerNilaiKurikulumSection & Rapor)
    const filtered = (komponen || []).filter(k => {
      // Semester check: if component has semester_id, must match selectedSemesterId
      if (k.semester_id && selectedSemesterId && k.semester_id !== selectedSemesterId) {
        return false
      }

      // Class targeting check
      if (!k.target_kelas || k.target_kelas.length === 0) {
        if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
        return true
      }
      if (Array.isArray(k.target_kelas)) {
        return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
      }
      if (typeof k.target_kelas === 'string') {
        try {
          const parsed = JSON.parse(k.target_kelas)
          if (Array.isArray(parsed)) {
            return parsed.some(c => String(c || '').trim().toUpperCase() === curClass)
          }
        } catch (_) {}
        return k.target_kelas.toUpperCase().includes(curClass)
      }
      if (k.kelas) {
        return String(k.kelas).trim().toUpperCase() === curClass
      }
      return true
    })

    // 2. Sumatif visibility from settings
    const hasPsts1Or2 = filtered.some(k => k.bab_nama === 'PSTS 1' || k.bab_nama === 'PSTS 2')
    const hasPsasOrPsat = filtered.some(k => k.bab_nama === 'PSAS' || k.bab_nama === 'PSAT')

    // 3. Prioritize components with actual scores in nilaiData, then descriptions, then urutan
    const sortedFiltered = [...filtered].sort((a, b) => {
      const aScores = nilaiData[a.id] ? Object.values(nilaiData[a.id]).filter(v => v !== undefined && v !== null && v !== '').length : 0
      const bScores = nilaiData[b.id] ? Object.values(nilaiData[b.id]).filter(v => v !== undefined && v !== null && v !== '').length : 0
      if (aScores !== bScores) return bScores - aScores
      if (a.deskripsi && !b.deskripsi) return -1
      if (!a.deskripsi && b.deskripsi) return 1
      return (a.urutan || 0) - (b.urutan || 0)
    })

    // 4. Deduplicate specifically FOR THIS CLASS:
    //    - Drop duplicate PSTS/PSAS
    //    - Ensure at most 1 N. Karakter per BAB for THIS class (never letting other classes block this class)
    const seenSumatifCols = new Set()
    const seenBabKarakter = new Set()

    const deduped = sortedFiltered.filter(k => {
      const isPsts = (k.bab_nama || '').toUpperCase().includes('PSTS') || (k.nama || '').toUpperCase().includes('PSTS')
      const isPsas = (k.bab_nama || '').toUpperCase().includes('PSAS') || (k.bab_nama || '').toUpperCase().includes('PSAT') ||
                     (k.nama || '').toUpperCase().includes('PSAS') || (k.nama || '').toUpperCase().includes('PSAT')
      if (isPsts && raporSettings.show_kolom_psts === 'false') return false
      if (isPsas && raporSettings.show_kolom_psas === 'false') return false

      if (hasPsts1Or2 && k.bab_nama === 'PSTS') return false
      if (hasPsasOrPsat && k.bab_nama === 'PSAS/PSAT') return false
      if (k.bab_nama === 'PSTS' && k.nama === 'Nilai PSTS') return false

      if (isPsts || isPsas) {
        const colKey = `${(k.bab_nama || '').trim().toUpperCase()}_${(k.nama || '').trim().toUpperCase()}`
        if (seenSumatifCols.has(colKey)) return false
        seenSumatifCols.add(colKey)
      }

      if (isKarakterKomponen(k.nama, k.deskripsi)) {
        const babKey = (k.bab_nama || '').trim().toUpperCase()
        if (seenBabKarakter.has(babKey)) return false
        seenBabKarakter.add(babKey)
      }

      return true
    })

    return deduped.sort((a, b) => (a.urutan || 0) - (b.urutan || 0))
  }, [komponen, selectedSemesterId, activeTabKelas, raporSettings.show_kolom_psts, raporSettings.show_kolom_psas, nilaiData])

  // List of BABs in current context that have NO semester assigned
  const unassignedSemesterBabs = useMemo(() => {
    const unassigned = komponen.filter(k => 
      !k.semester_id && 
      !isPstsOrPsas(k.bab_nama || k.nama) &&
      (
        !currentRombel ||
        !k.target_kelas ||
        k.target_kelas.length === 0 ||
        k.target_kelas.some(c => c.replace(/\D/g, '') === currentRombel)
      )
    )
    return [...new Set(unassigned.map(k => k.bab_nama || 'Tanpa Nama'))].filter(Boolean)
  }, [komponen, currentRombel, isPstsOrPsas])

  const uniqueBabs = [...new Set(komponen.map(k => k.bab_nama || 'Lainnya'))]
  const uniqueBabsClass = useMemo(() => {
    return [...new Set(classKomponen.map(k => k.bab_nama || 'Lainnya'))]
      .filter(bab => {
        const isPsts = bab.toUpperCase().includes('PSTS')
        const isPsas = bab.toUpperCase().includes('PSAS') || bab.toUpperCase().includes('PSAT')
        if (isPsts && raporSettings.show_kolom_psts === 'false') return false
        if (isPsas && raporSettings.show_kolom_psas === 'false') return false
        return true
      })
      .sort((a,b) => {
        const isPstsA = a.toUpperCase().includes('PSTS');
        const isPstsB = b.toUpperCase().includes('PSTS');
        const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT');
        const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT');

        if (isPstsA && !isPstsB) return isPsasB ? -1 : 1;
        if (isPstsB && !isPstsA) return isPsasA ? 1 : -1;
        if (isPsasA && !isPsasB) return 1;
        if (isPsasB && !isPsasA) return -1;
        
        const matchA = a.match(/\d+/);
        const matchB = b.match(/\d+/);
        if (matchA && matchB) {
          return parseInt(matchA[0]) - parseInt(matchB[0]);
        }
        return a.localeCompare(b);
      });
  }, [classKomponen, raporSettings.show_kolom_psts, raporSettings.show_kolom_psas])

  // Regular BABs for the active rombel taught by this teacher (excluding PSTS / PSAS / PSAT)
  const rombelRegularBabs = useMemo(() => {
    if (!currentRombel) return uniqueBabsClass.filter(b => !isPstsOrPsas(b))
    const babs = [...new Set(
      komponen
        .filter(k => 
          k.semester_id === selectedSemesterId && 
          !isPstsOrPsas(k.bab_nama) &&
          (k.target_kelas || []).some(c => classesForRombel.includes(c))
        )
        .map(k => k.bab_nama)
        .filter(Boolean)
    )]
    if (babs.length > 0) {
      return babs.sort((a, b) => {
        const matchA = a.match(/\d+/);
        const matchB = b.match(/\d+/);
        if (matchA && matchB) {
          const diff = parseInt(matchA[0]) - parseInt(matchB[0]);
          if (diff !== 0) return diff;
        }
        return a.localeCompare(b);
      })
    }
    return uniqueBabsClass.filter(b => !isPstsOrPsas(b))
  }, [komponen, selectedSemesterId, currentRombel, uniqueBabsClass, isPstsOrPsas])


  // Helper to sort components within a BAB:
  // 1. Regular TPs sorted numerically by TP number (TP 1 < TP 2 < TP 3...)
  // 2. Fallback to urutan
  // 3. Karakter component ALWAYS at the very end (paling kanan)
  const sortBabKomponen = (a, b) => {
    const isKarA = isKarakterKomponen(a.nama);
    const isKarB = isKarakterKomponen(b.nama);
    if (isKarA && !isKarB) return 1;
    if (!isKarA && isKarB) return -1;
    if (isKarA && isKarB) return (a.urutan ?? 0) - (b.urutan ?? 0);

    const matchA = (a.nama || '').match(/^TP\s*(\d+)/i);
    const matchB = (b.nama || '').match(/^TP\s*(\d+)/i);
    if (matchA && matchB) {
      const diff = parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
      if (diff !== 0) return diff;
    }
    return (a.urutan ?? 0) - (b.urutan ?? 0);
  };

  // Ordered components for current active class
  const orderedClassKomponen = useMemo(() => {
    return uniqueBabsClass.flatMap(bab => classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen))
  }, [uniqueBabsClass, classKomponen])

  // Deteksi Nilai Kosong (-) pada TP yang sudah ada deskripsinya (Peringatan Guru)
  const missingDescribedAudit = useMemo(() => {
    if (!students || students.length === 0 || !orderedClassKomponen || orderedClassKomponen.length === 0) {
      return { items: [], count: 0, studentCount: 0, studentNisns: [] }
    }

    const items = []
    orderedClassKomponen.forEach(k => {
      const isDescribed = Boolean(k.deskripsi && k.deskripsi.trim() !== '')
      const isSumatifKomp = isSumatif(k.bab_nama || k.nama)
      const isKarakter = isKarakterKomponen(k.nama)
      if (isDescribed && !isSumatifKomp && !isKarakter) {
        students.forEach(s => {
          const val = nilaiData[k.id]?.[s.nisn]
          const hasVal = val !== undefined && val !== null && val !== '' && String(val).trim() !== '-'
          if (!hasVal) {
            items.push({
              studentNisn: s.nisn,
              studentNama: s.nama_lengkap,
              komponenId: k.id,
              tpNama: k.nama || 'TP',
              babNama: k.bab_nama || 'Materi',
              deskripsi: k.deskripsi
            })
          }
        })
      }
    })

    const uniqueNisns = [...new Set(items.map(it => it.studentNisn))]
    return {
      items,
      count: items.length,
      studentCount: uniqueNisns.length,
      studentNisns: uniqueNisns
    }
  }, [students, orderedClassKomponen, nilaiData])

  // Daftar siswa yang ditampilkan (mendukung filter hanya siswa nilai kosong)
  const displayStudents = useMemo(() => {
    if (filterOnlyMissing && missingDescribedAudit.studentNisns.length > 0) {
      return students.filter(s => missingDescribedAudit.studentNisns.includes(s.nisn))
    }
    return students
  }, [students, filterOnlyMissing, missingDescribedAudit.studentNisns])

  // Existing BABs for the selected rombel in add-bab modal
  const existingBabsForRombel = newBabRombel
    ? [...new Set(komponen.filter(k => k.target_kelas?.some(c => c.replace(/\D/g, '') === newBabRombel)).map(k => k.bab_nama || 'Lainnya'))]
    : []

  // Helper to get available classes for managing a BAB
  const getAvailableClassesForBab = (babName) => {
    if (!babName) return [];
    const currentRombel = activeTabKelas ? activeTabKelas.replace(/\D/g, '') : '';
    const babKomps = (komponen || []).filter(k => k.bab_nama === babName);
    
    // If currently viewing a specific class/rombel, prioritize TPs of that rombel
    const rombelKomps = currentRombel
      ? babKomps.filter(k => (k.target_kelas || []).some(c => c.replace(/\D/g, '') === currentRombel))
      : babKomps;
    const effectiveKomps = rombelKomps.length > 0 ? rombelKomps : babKomps;
    const babClasses = [...new Set(effectiveKomps.flatMap(k => k.target_kelas || []))].filter(Boolean);
    const babRombel = currentRombel || babClasses[0]?.replace(/\D/g, '');

    const assignedClassesForRombel = babRombel
      ? activeTargetKelas.filter(c => c.replace(/\D/g, '') === babRombel)
      : activeTargetKelas;

    if (assignedClassesForRombel.length > 0) return assignedClassesForRombel;
    const pool = babRombel ? babClasses.filter(c => c.replace(/\D/g, '') === babRombel) : babClasses;
    if (pool.length > 0) return pool.sort();
    return activeTabKelas ? [activeTabKelas] : [];
  };

  useEffect(() => {
    if (!activeTabKelas) {
      if (activeTargetKelas.length > 0) setActiveTabKelas(activeTargetKelas[0]);
      else if (targetKelasList.length > 0) setActiveTabKelas(targetKelasList[0]);
    }
  }, [activeTargetKelas, targetKelasList, activeTabKelas]);

  // ─── Auto-select ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (uniqueMapels.length === 1) setSelectedMapelId(uniqueMapels[0].id)
  }, [])

  useEffect(() => {
    if (!activeTa?.id) return
    fetchSemesters()
  }, [activeTa])

  useEffect(() => {
    const aktif = getSemesterAktif(semesters)
    if (aktif) setSelectedSemesterId(aktif.id)
    else if (semesters.length > 0) setSelectedSemesterId(semesters[0].id)
  }, [semesters])



  useEffect(() => {
    if (selectedMapelId && selectedSemesterId) {
      fetchKomponen()
    } else {
      setKomponen([])
    }
  }, [selectedMapelId, selectedSemesterId])

  useEffect(() => {
    if (activeTabKelas && selectedMapelId && selectedSemesterId) {
      fetchStudents()
      fetchConfigAkhir()
    } else {
      setStudents([])
      setNilaiData({})
      setConfigAkhir({ metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: false })
    }
  }, [activeTabKelas, selectedMapelId, selectedSemesterId])

  const classKompIdsStr = classKomponen.map(k => k.id).sort().join(',')
  const studentNisnsStr = students.map(s => String(s.nisn)).sort().join(',')
  useEffect(() => {
    if (classKomponen.length > 0 && students.length > 0) fetchNilai()
  }, [classKompIdsStr, studentNisnsStr])



  // ─── Fetch Functions ──────────────────────────────────────────────────────
  const fetchConfigAkhir = async () => {
    if (!activeTabKelas || !selectedMapelId || !selectedSemesterId || !activeTa?.id) return

    // 1. Fetch Master Settings from Kurikulum / Admin (pengaturan_sekolah)
    let masterMetode = 'rata_rata'
    let masterIncludeKar = false
    try {
      const { data: setts } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', ['metode_hitung_nilai_akhir', 'include_karakter_nilai_akhir'])
      if (setts && setts.length > 0) {
        const smap = {}
        setts.forEach(s => { smap[s.setting_key] = s.setting_value })
        if (smap.metode_hitung_nilai_akhir) masterMetode = smap.metode_hitung_nilai_akhir
        if (smap.include_karakter_nilai_akhir === 'true') masterIncludeKar = true
      }
    } catch (e) {
      console.warn('Gagal memuat pengaturan_sekolah untuk nilai akhir:', e)
    }

    // 2. Fetch specific per-mapel/kelas override from nilai_akhir_config (jika disetel kurikulum)
    const { data } = await supabase.from('nilai_akhir_config')
      .select('*')
      .eq('guru_id', session.id)
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('semester_id', selectedSemesterId)
      .eq('mata_pelajaran_id', selectedMapelId)
      .eq('kelas', activeTabKelas)
      .maybeSingle()
    
    // Check if current class already has PTS selection
    let rombelPtsBabs = data?.bobot_detail?.pts_selected_babs || null
    let rombelPtsConfirmed = data?.bobot_detail?.pts_confirmed ?? false

    // If active class doesn't have PTS selection, look up if any class in the same rombel has it
    if ((!rombelPtsBabs || rombelPtsBabs.length === 0) && activeTabKelas) {
      const rombel = activeTabKelas.replace(/\D/g, '')
      const { data: rombelConfigs } = await supabase.from('nilai_akhir_config')
        .select('kelas, bobot_detail')
        .eq('guru_id', session.id)
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester_id', selectedSemesterId)
        .eq('mata_pelajaran_id', selectedMapelId)

      const siblingMatch = (rombelConfigs || []).find(c => 
        c.kelas && classesForRombel.includes(c.kelas) &&
        c.bobot_detail?.pts_selected_babs && 
        Array.isArray(c.bobot_detail.pts_selected_babs) && 
        c.bobot_detail.pts_selected_babs.length > 0
      )
      if (siblingMatch) {
        rombelPtsBabs = siblingMatch.bobot_detail.pts_selected_babs
        rombelPtsConfirmed = siblingMatch.bobot_detail.pts_confirmed ?? true
      }
    }

    const mergedBobot = {
      ...(data?.bobot_detail || {}),
      ...(rombelPtsBabs ? { pts_selected_babs: rombelPtsBabs, pts_confirmed: rombelPtsConfirmed } : {})
    }

    // Metode hitung ditentukan terpusat oleh Kurikulum / Admin
    // Prioritas: bobot manual per-mapel jika diset kurikulum di nilai_akhir_config, atau default master dari pengaturan_sekolah
    const isBobotManual = data?.metode_hitung === 'bobot_manual'
    const effectiveMetode = isBobotManual ? 'bobot_manual' : masterMetode
    const effectiveIncludeKar = isBobotManual && data?.bobot_detail?.include_karakter !== undefined
      ? Boolean(data.bobot_detail.include_karakter)
      : masterIncludeKar

    setConfigAkhir({ 
      metode_hitung: effectiveMetode, 
      bobot_detail: mergedBobot, 
      include_karakter: effectiveIncludeKar,
      is_visible: data?.is_visible ?? false,
      is_locked: true
    })
  }

  const fetchSemesters = async () => {
    const { data } = await supabase.from('semester')
      .select('*').eq('tahun_ajaran_id', activeTa.id).order('nomor')
    setSemesters(data || [])
  }

  const fetchKomponen = async () => {
    let kompQuery = supabase.from('nilai_komponen')
      .select('*')
      .eq('mata_pelajaran_id', selectedMapelId)
      .order('urutan')

    if (session?.id) {
      kompQuery = kompQuery.or(`guru_id.eq.${session.id},guru_id.is.null`)
    }
    if (activeTa?.id) {
      kompQuery = kompQuery.or(`tahun_ajaran_id.eq.${activeTa.id},tahun_ajaran_id.is.null`)
    }
    let { data } = await kompQuery

    if (!data || data.length === 0) {
      let fbQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('mata_pelajaran_id', selectedMapelId)
        .order('urutan')
      if (session?.id) {
        fbQuery = fbQuery.or(`guru_id.eq.${session.id},guru_id.is.null`)
      }
      const { data: fbData } = await fbQuery
      data = fbData || []
    }
    let d = data || []
    
    // Auto-heal corrupted target_kelas (e.g. from previous bugs where Kelas 9 was mixed with Kelas 8)
    const corruptedIds = d.filter(k => k.target_kelas && k.target_kelas.length > 0 && new Set(k.target_kelas.map(c => c.replace(/\D/g, ''))).size > 1)
    if (corruptedIds.length > 0) {
       d = d.map(k => {
           if (k.target_kelas && k.target_kelas.length > 0) {
               const trueRombel = (k.kelas || k.target_kelas[0]).replace(/\D/g, '');
               return { ...k, target_kelas: k.target_kelas.filter(c => c.replace(/\D/g, '') === trueRombel) }
           }
           return k;
       })
       corruptedIds.forEach(async (corrupted) => {
           const trueRombel = (corrupted.kelas || corrupted.target_kelas[0]).replace(/\D/g, '');
           const newTarget = corrupted.target_kelas.filter(c => c.replace(/\D/g, '') === trueRombel);
           await supabase.from('nilai_komponen').update({ target_kelas: newTarget }).eq('id', corrupted.id);
       })
    }
    
    // Auto-heal Penilaian Sumatif grouping to separate PSTS and PSAS
    const sumatifKomp = d.filter(k => k.bab_nama === 'Penilaian Sumatif' && (k.nama === 'PSTS 1' || k.nama === 'PSTS 2' || k.nama === 'PSAS' || k.nama === 'PSAT'));
    if (sumatifKomp.length > 0) {
      d = d.map(k => {
        if (k.bab_nama === 'Penilaian Sumatif' && (k.nama === 'PSTS 1' || k.nama === 'PSTS 2' || k.nama === 'PSAS' || k.nama === 'PSAT')) {
          return { ...k, bab_nama: k.nama, nama: 'Nilai' };
        }
        return k;
      });
      sumatifKomp.forEach(async (sk) => {
        await supabase.from('nilai_komponen').update({ bab_nama: sk.nama, nama: 'Nilai' }).eq('id', sk.id);
      });
    }
    
    // Auto-generate PSTS and PSAS components if they don't exist
    const currentSem = semesters.find(s => s.id === selectedSemesterId);
    if (currentSem && selectedMapelId) {
      const isSem1 = currentSem.nomor === 1;
      const t1Name = isSem1 ? 'PSTS 1' : 'PSTS 2';
      const t2Name = isSem1 ? 'PSAS' : 'PSAT';
      
      const missingKomp = [];
      const toUpdateKomp = []; // existing PSTS/PSAS that need target_kelas expansion

      uniqueRombels.forEach(rombel => {
        const classesForRombel = uniqueClassesForMapel.filter(c => c.replace(/\D/g, '') === rombel);
        if (classesForRombel.length === 0) return;

        const hasT1 = d.find(k => k.semester_id === selectedSemesterId && (k.nama === t1Name || k.bab_nama === t1Name) && k.target_kelas?.some(c => c.replace(/\D/g, '') === rombel));
        if (!hasT1) {
           missingKomp.push({ bab_nama: t1Name, nama: 'Nilai', bobot: 1, urutan: 998, target_kelas: classesForRombel, kelas: classesForRombel[0], metode_hitung: 'rata_rata', is_nilai_visible: false, guru_id: session.id, tahun_ajaran_id: activeTa.id, semester_id: selectedSemesterId, mata_pelajaran_id: selectedMapelId });
        } else {
          // Heal: add any newly assigned classes missing from existing PSTS
          const missingClasses = classesForRombel.filter(c => !(hasT1.target_kelas || []).includes(c));
          if (missingClasses.length > 0) {
            const newTargetKelas = [...(hasT1.target_kelas || []), ...missingClasses];
            toUpdateKomp.push({ id: hasT1.id, target_kelas: newTargetKelas });
            d = d.map(k => k.id === hasT1.id ? { ...k, target_kelas: newTargetKelas } : k);
          }
        }

        const hasT2 = d.find(k => k.semester_id === selectedSemesterId && (k.nama === t2Name || k.bab_nama === t2Name) && k.target_kelas?.some(c => c.replace(/\D/g, '') === rombel));
        if (!hasT2) {
           missingKomp.push({ bab_nama: t2Name, nama: 'Nilai', bobot: 1, urutan: 999, target_kelas: classesForRombel, kelas: classesForRombel[0], metode_hitung: 'rata_rata', is_nilai_visible: false, guru_id: session.id, tahun_ajaran_id: activeTa.id, semester_id: selectedSemesterId, mata_pelajaran_id: selectedMapelId });
        } else {
          // Heal: add any newly assigned classes missing from existing PSAS
          const missingClasses = classesForRombel.filter(c => !(hasT2.target_kelas || []).includes(c));
          if (missingClasses.length > 0) {
            const newTargetKelas = [...(hasT2.target_kelas || []), ...missingClasses];
            toUpdateKomp.push({ id: hasT2.id, target_kelas: newTargetKelas });
            d = d.map(k => k.id === hasT2.id ? { ...k, target_kelas: newTargetKelas } : k);
          }
        }
      });

      // Insert missing PSTS/PSAS
      if (missingKomp.length > 0) {
        const { data: inserted } = await supabase.from('nilai_komponen').insert(missingKomp).select();
        if (inserted) {
          d = [...d, ...inserted];
          d.sort((a,b) => a.urutan - b.urutan);
        }
      }

      // Update existing PSTS/PSAS with missing classes
      if (toUpdateKomp.length > 0) {
        await Promise.all(toUpdateKomp.map(u =>
          supabase.from('nilai_komponen').update({ target_kelas: u.target_kelas }).eq('id', u.id)
        ));
      }
    }

    // Filter out only obsolete legacy zombie components in-memory (without destructive DB deletion)
    d = d.filter(k => {
      const isZombie = (k.bab_nama === 'PSTS' && k.nama === 'Nilai PSTS') || (k.bab_nama === 'PSAS/PSAT');
      return !isZombie;
    });

    setKomponen(d)
    // Collect all target kelas
    const allKelas = [...new Set(d.flatMap(k => k.target_kelas || []))].sort()
    setTargetKelasList(allKelas)
    if (allKelas.length > 0 && !activeTabKelas) setActiveTabKelas(allKelas[0])
    else if (activeTargetKelas.length > 0 && !activeTabKelas) setActiveTabKelas(activeTargetKelas[0])
  }

  const fetchStudents = async () => {
    const { data } = await supabase.from('siswa_lengkap')
      .select('nisn, nama_lengkap, kelas')
      .eq('kelas', activeTabKelas)
      .eq('tahun_ajaran_id', activeTa.id)
      .order('nama_lengkap')
    setStudents(data || [])
    
    // Slight delay to allow data to render before starting animation
    setTimeout(() => {
        setIsTransitioning(false)
        setAnimKey(prev => prev + 1)
    }, 10)
  }
  const fetchNilai = async (isManual = false) => {
    const ids = classKomponen.map(k => k.id)
    const nisnList = students.map(s => String(s.nisn))
    if (ids.length === 0 || nisnList.length === 0) return
    if (isManual) setRefreshingNilai(true)

    try {
      // Auto-revalidate Supabase session in case JWT expired while tab was sleeping
      const { data: authData } = await supabase.auth.getSession()
      if (!authData?.session) {
        await supabase.auth.refreshSession().catch(() => {})
      }

      let { data, error } = await supabase
        .from('nilai_siswa')
        .select('*')
        .in('komponen_id', ids)
        .in('siswa_nisn', nisnList)

      if (error) {
        console.warn('[NilaiGuru] Error fetching grades, attempting session refresh:', error)
        await supabase.auth.refreshSession().catch(() => {})
        const { data: retryData } = await supabase
          .from('nilai_siswa')
          .select('*')
          .in('komponen_id', ids)
          .in('siswa_nisn', nisnList)
        if (retryData) data = retryData
      }

      const map = {}
      ;(data || []).forEach(n => {
        if (!map[n.komponen_id]) map[n.komponen_id] = {}
        map[n.komponen_id][n.siswa_nisn] = n.nilai
      })
      setNilaiData(map)
    } catch (err) {
      console.error('[NilaiGuru] Exception in fetchNilai:', err)
    } finally {
      if (isManual) setRefreshingNilai(false)
    }
  }

  const fetchNilaiRef = useRef(fetchNilai)
  useEffect(() => {
    fetchNilaiRef.current = fetchNilai
  })

  // ─── Offline Sync & Safety Handlers ────────────────────────────────────────
  const isSyncingRef = useRef(false)
  const syncPendingGrades = useCallback(async () => {
    if (isSyncingRef.current) return
    try {
      const raw = localStorage.getItem(PENDING_GRADES_KEY)
      if (!raw) {
        setIsSyncingPending(false)
        return
      }
      const pendingList = JSON.parse(raw)
      if (!Array.isArray(pendingList) || pendingList.length === 0) {
        setIsSyncingPending(false)
        return
      }

      const myPending = pendingList.filter(item => !item.diinputOleh || item.diinputOleh === session?.id)
      if (myPending.length === 0) {
        setIsSyncingPending(false)
        return
      }

      isSyncingRef.current = true
      setIsSyncingPending(true)
      const remaining = []
      for (const item of myPending) {
        let errResult = null
        try {
          if (session?.akun_id && session?.id) {
            const cleanVal = (item.val === null || item.val === undefined || item.val === '') ? null : Number(item.val)
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_simpan_nilai_guru', {
              p_akun_id: session.akun_id,
              p_guru_id: session.id,
              p_komponen_id: item.komponenId,
              p_siswa_nisn: String(item.nisn).trim(),
              p_nilai: cleanVal
            })
            if (!rpcErr && rpcRes?.ok) {
              errResult = null
            } else if (rpcRes && !rpcRes.ok) {
              errResult = new Error(rpcRes.msg || 'Gagal menyimpan nilai')
            } else if (rpcErr && !rpcErr.message?.includes('function') && rpcErr.code !== 'PGRST202') {
              errResult = rpcErr
            }
          }
          if (errResult === null && (!session?.akun_id || !session?.id)) {
            const { error: upErr } = await supabase.from('nilai_siswa').upsert({
              komponen_id: item.komponenId,
              siswa_nisn: item.nisn,
              nilai: item.val,
              diinput_oleh: item.diinputOleh || session?.id,
              updated_at: new Date().toISOString()
            }, { onConflict: 'komponen_id,siswa_nisn' })
            errResult = upErr
          }
        } catch (e) {
          errResult = e
        }

        if (errResult) {
          console.warn(`[NilaiGuru] Gagal sync sel ${item.komponenId}-${item.nisn}:`, errResult.message)
          remaining.push(item)
        } else {
          const cellKey = `${item.komponenId}-${item.nisn}`
          setErrorCells(prev => {
            const next = { ...prev }
            delete next[cellKey]
            return next
          })
        }
      }

      const otherPending = pendingList.filter(item => item.diinputOleh && item.diinputOleh !== session?.id)
      const newTotalPending = [...otherPending, ...remaining]
      if (newTotalPending.length > 0) {
        localStorage.setItem(PENDING_GRADES_KEY, JSON.stringify(newTotalPending))
      } else {
        localStorage.removeItem(PENDING_GRADES_KEY)
      }

      if (remaining.length < myPending.length) {
        fetchNilaiRef.current?.()
      }
    } catch (err) {
      console.warn('Error syncing pending grades:', err)
    } finally {
      setIsSyncingPending(false)
      isSyncingRef.current = false
    }
  }, [session?.id])

  // Auto-sync when internet comes back online
  useEffect(() => {
    const handleOnline = () => {
      syncPendingGrades()
    }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) {
      syncPendingGrades()
    }
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPendingGrades])

  // Prevent closing tab/window if there are pending saves or errors
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (savingCells.size > 0 || Object.keys(errorCells).length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [savingCells, errorCells])

  const handleRetryAllFailedCells = async () => {
    const failedItems = Object.values(errorCells)
    if (failedItems.length === 0) return
    for (const item of failedItems) {
      await handleNilaiChange(item.komponenId, item.nisn, item.val !== undefined && item.val !== null ? item.val : '')
    }
  }

  useEffect(() => {
    if (showAddBab) {
      if (!newBabSemesterId) {
        setNewBabSemesterId(selectedSemesterId || (semesters[0]?.id || ''))
      }
      if (!newBabRombel && currentRombel) {
        setNewBabRombel(currentRombel)
      }
    }
  }, [showAddBab, selectedSemesterId, semesters, currentRombel])

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleAddBab = async () => {
    const classesForRombel = uniqueClassesForMapel.filter(c => c.replace(/\D/g, '') === newBabRombel)
    
    if (!newBabNama.trim() || !newBabRombel || classesForRombel.length === 0) {
      alert('Nama BAB, tingkat kelas (rombel), dan target kelas harus diisi!');
      return;
    }
    if (!newBabSemesterId) {
      alert('Silakan pilih Semester untuk BAB ini terlebih dahulu!');
      return;
    }
    let finalName = newBabNama.trim()
    
    // Auto format "Bab X:"
    if (!finalName.toLowerCase().startsWith('bab') && !finalName.toUpperCase().includes('PSTS') && !finalName.toUpperCase().includes('PSAS') && !finalName.toUpperCase().includes('PSAT')) {
       const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
       const uniqueBabs = [...new Set(classBabs.filter(k => k.bab_nama?.toLowerCase().startsWith('bab')).map(k => k.bab_nama))]
       const nextNum = uniqueBabs.length + 1
       finalName = `Bab ${nextNum}: ${finalName}`
    }
    
    // Check duplication for specific rombel
    if (!komponen.find(k => k.bab_nama === finalName && k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))) {
      setAddingKomponen(true)
      const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
      
      // Check if N. Karakter already exists for this BAB and this specific rombel
      const hasKar = komponen.some(k => 
        (k.bab_nama || '').trim().toUpperCase() === finalName.trim().toUpperCase() && 
        isKarakterKomponen(k.nama, k.deskripsi) &&
        (k.target_kelas || []).some(c => c.replace(/\D/g, '') === newBabRombel)
      );

      let inserts = [];
      if (!hasKar) {
        inserts.push({
          guru_id: session.id,
          tahun_ajaran_id: activeTa.id,
          semester_id: newBabSemesterId,
          mata_pelajaran_id: selectedMapelId,
          bab_nama: finalName,
          nama: 'N. Karakter',
          deskripsi: '',
          bobot: 1,
          urutan: maxUrutan,
          target_kelas: classesForRombel,
          kelas: classesForRombel[0],
          metode_hitung: 'rata_rata',
          is_nilai_visible: false
        });
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from('nilai_komponen').insert(inserts)
        setAddingKomponen(false)
        if (error) {
          alert('Gagal menambah BAB: ' + error.message)
          return
        }
      } else {
        setAddingKomponen(false)
      }

      const combined = [...new Set([...targetKelasList, ...classesForRombel])].sort();
      setTargetKelasList(combined);
      if (!activeTabKelas && combined.length > 0) setActiveTabKelas(combined[0]);
      fetchKomponen() // Refreshes the list on the right panel automatically
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
    } else {
      alert('BAB tersebut sudah ada di kelas ini.')
    }
    
    // Do NOT close the modal, so user can rapidly add another bab
    setNewBabNama('')
  }
  const handleAddTp = async () => {
    if (!newTpNama.trim() || !addingTpToBab || newTpTargetKelas.length === 0) {
       alert('Nama TP dan kelas target harus diisi!');
       return;
    }
    setAddingKomponen(true)
    
    const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
    const existingInBab = komponen.find(k => k.bab_nama === addingTpToBab)
    const metodeHitung = existingInBab ? (existingInBab.metode_hitung || 'rata_rata') : 'rata_rata'
    const semesterIdForTp = (existingInBab && existingInBab.semester_id) ? existingInBab.semester_id : (selectedSemesterId || null);
    
    const { error } = await supabase.from('nilai_komponen').insert({
      guru_id: session.id,
      tahun_ajaran_id: activeTa.id,
      semester_id: semesterIdForTp,
      mata_pelajaran_id: selectedMapelId,
      bab_nama: addingTpToBab,
      nama: newTpNama.trim(),
      deskripsi: newTpDeskripsi.trim() || null,
      bobot: parseFloat(newTpBobot) || 1,
      urutan: maxUrutan,
      target_kelas: newTpTargetKelas,
      kelas: newTpTargetKelas.length > 0 ? newTpTargetKelas[0] : 'LINTAS',
      metode_hitung: metodeHitung,
      is_nilai_visible: false
    })
    
    setAddingKomponen(false)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      setNewTpNama('')
      setNewTpDeskripsi('')
      setNewTpBobot('1')
      setNewTpTargetKelas([])
      setAddingTpToBab(null)
      fetchKomponen()
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
    }
  }

  // ─── Nilai Karakter Handlers (SMP Budi Mulia) ───────────────────────────────
  const handleOpenAddKarakter = (babNama) => {
    if (!babNama) return
    const currentRombel = activeTabKelas ? activeTabKelas.replace(/\D/g, '') : ''
    const existingKar = (komponen || []).find(k => 
      k.bab_nama === babNama && 
      isKarakterKomponen(k.nama, k.deskripsi) &&
      (!currentRombel || (k.target_kelas || []).some(c => c.replace(/\D/g, '') === currentRombel) || (k.kelas && k.kelas.replace(/\D/g, '') === currentRombel))
    )
    if (existingKar) {
      setEditingKarakterKomponen(existingKar)
      setKarakterModalBab(babNama)
      setShowKarakterModal(true)
      return
    }
    setEditingKarakterKomponen(null)
    setKarakterModalBab(babNama)
    setShowKarakterModal(true)
  }

  // Alias for backward compatibility
  const handleAddKarakter = (babNama) => {
    handleOpenAddKarakter(babNama)
  }

  const handleSaveKarakterConfig = async ({ elemenNama, subIndikatorNama, deskripsi, targetClasses, isEdit, komponenId }) => {
    setSavingKarakter(true)
    try {
      // Check if an N. Karakter already exists in this BAB specifically for current rombel
      const currentRombel = activeTabKelas ? activeTabKelas.replace(/\D/g, '') : ''
      const existingKarInBab = (komponen || []).find(k => 
        k.bab_nama === karakterModalBab &&
        isKarakterKomponen(k.nama, k.deskripsi) &&
        (!currentRombel || (k.target_kelas || []).some(c => c.replace(/\D/g, '') === currentRombel) || (k.kelas && k.kelas.replace(/\D/g, '') === currentRombel))
      )

      const targetId = (isEdit && komponenId) ? komponenId : (existingKarInBab?.id || null)

      if (targetId) {
        // ALWAYS update existing N. Karakter! Never insert duplicate!
        const { error } = await supabase.from('nilai_komponen').update({
          deskripsi: deskripsi,
          target_kelas: targetClasses,
          kelas: targetClasses[0] || 'LINTAS'
        }).eq('id', targetId)
        if (error) throw error
      } else {
        const availableClasses = getAvailableClassesForBab(karakterModalBab)
        const finalClasses = targetClasses && targetClasses.length > 0 ? targetClasses : availableClasses
        const existingInBab = (komponen || []).find(k => 
          k.bab_nama === karakterModalBab &&
          (!currentRombel || (k.target_kelas || []).some(c => c.replace(/\D/g, '') === currentRombel))
        ) || (komponen || []).find(k => k.bab_nama === karakterModalBab)

        const metodeHitung = existingInBab ? (existingInBab.metode_hitung || 'rata_rata') : 'rata_rata'
        const semesterIdForKomp = (existingInBab && existingInBab.semester_id) ? existingInBab.semester_id : (selectedSemesterId || null)
        const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => (typeof k.urutan === 'number' ? k.urutan : 0)), 0) + 100 : 999

        const { error } = await supabase.from('nilai_komponen').insert({
          guru_id: session.id,
          tahun_ajaran_id: activeTa.id,
          semester_id: semesterIdForKomp,
          mata_pelajaran_id: selectedMapelId,
          bab_nama: karakterModalBab,
          nama: 'N. Karakter',
          deskripsi: deskripsi,
          bobot: 1,
          urutan: maxUrutan,
          target_kelas: finalClasses,
          kelas: finalClasses.length > 0 ? finalClasses[0] : (activeTabKelas || 'LINTAS'),
          metode_hitung: metodeHitung,
          is_nilai_visible: false
        })
        if (error) throw error
      }
      setShowKarakterModal(false)
      await fetchKomponen()
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
    } catch (err) {
      alert('Gagal menyimpan Nilai Karakter: ' + err.message)
    } finally {
      setSavingKarakter(false)
    }
  }

  // ─── Reorder TP Handlers (Memindahkan Urutan Slot TP) ───────────────────────
  const handleMoveTp = async (babNama, sourceKompId, targetIndex) => {
    // Regular TPs for this bab sorted in current order
    const pool = classKomponen.length > 0 ? classKomponen : komponen
    const babTps = pool
      .filter(k => k.bab_nama === babNama && !isKarakterKomponen(k.nama))
      .sort(sortBabKomponen)

    const sourceIndex = babTps.findIndex(k => k.id === sourceKompId)
    if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= babTps.length || sourceIndex === targetIndex) {
      return
    }

    const reordered = [...babTps]
    const [movedItem] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, movedItem)

    const minUrutan = babTps.length > 0
      ? Math.min(...babTps.map(k => (typeof k.urutan === 'number' ? k.urutan : 0)))
      : 0

    const updates = reordered.map((k, idx) => ({
      id: k.id,
      nama: `TP ${idx + 1}`,
      urutan: minUrutan + idx
    }))

    setAddingKomponen(true)
    try {
      await Promise.all(
        updates.map(u =>
          supabase.from('nilai_komponen').update({
            nama: u.nama,
            urutan: u.urutan
          }).eq('id', u.id)
        )
      )
      await fetchKomponen()
    } catch (err) {
      alert('Gagal mengubah urutan TP: ' + err.message)
    } finally {
      setAddingKomponen(false)
    }
  }

  // ─── CBT Handlers: Buat CBT dari TP & Tambah TP + Buat CBT ─────────────────
  const handleOpenCreateCbtWizard = (tp) => {
    const mapelObj = uniqueMapels.find(m => m.id === selectedMapelId)
    const initialKelas = tp.target_kelas && tp.target_kelas.length > 0 ? tp.target_kelas : (activeTabKelas ? [activeTabKelas] : [])
    setCbtWizardInitialData({
      judul: `${tp.bab_nama ? tp.bab_nama + ' - ' : ''}${tp.nama}`,
      mapel: mapelObj?.nama || '',
      kelas_ids: initialKelas,
      kategori: 'Formatif',
      komponen_id: tp.id
    })
    setShowCbtWizardModal(true)
  }

  const handleAddTpAndCreateCbt = async () => {
    if (!newTpNama.trim() || !addingTpToBab || newTpTargetKelas.length === 0) {
      alert('Nama TP dan kelas target harus diisi!')
      return
    }
    setAddingKomponen(true)
    const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
    const existingInBab = komponen.find(k => k.bab_nama === addingTpToBab)
    const metodeHitung = existingInBab ? (existingInBab.metode_hitung || 'rata_rata') : 'rata_rata'
    const semesterIdForTp = (existingInBab && existingInBab.semester_id) ? existingInBab.semester_id : (selectedSemesterId || null)

    const tpPayload = {
      guru_id: session.id,
      tahun_ajaran_id: activeTa.id,
      semester_id: semesterIdForTp,
      mata_pelajaran_id: selectedMapelId,
      bab_nama: addingTpToBab,
      nama: newTpNama.trim(),
      deskripsi: newTpDeskripsi.trim() || null,
      bobot: parseFloat(newTpBobot) || 1,
      urutan: maxUrutan,
      target_kelas: newTpTargetKelas,
      kelas: newTpTargetKelas.length > 0 ? newTpTargetKelas[0] : 'LINTAS',
      metode_hitung: metodeHitung,
      is_nilai_visible: false
    }

    const { data: insertedTp, error } = await supabase
      .from('nilai_komponen')
      .insert(tpPayload)
      .select()
      .single()

    setAddingKomponen(false)
    if (error) {
      alert('Gagal menambah TP: ' + error.message)
      return
    }

    const savedBab = addingTpToBab
    const savedNama = newTpNama.trim()
    const savedKelas = [...newTpTargetKelas]

    setNewTpNama('')
    setNewTpDeskripsi('')
    setNewTpBobot('1')
    setNewTpTargetKelas([])
    setAddingTpToBab(null)
    fetchKomponen()

    // Buka CBT Wizard langsung dengan data TP ini
    handleOpenCreateCbtWizard({
      id: insertedTp?.id,
      bab_nama: savedBab,
      nama: savedNama,
      target_kelas: savedKelas
    })
  }

  // ─── Tarik Nilai dari CBT ───────────────────────────────────────────────────
  const handleOpenTarikCbtModal = async () => {
    setShowTarikCbtModal(true)
    setLoadingCbtData(true)
    setSelectedCbtSesiId('')
    setSelectedCbtTargetKomponenId('')
    setCbtPesertaPreview([])
    setSelectedPesertaNisns([])

    try {
      const mapelObj = uniqueMapels.find(m => m.id === selectedMapelId)
      let query = supabase
        .from('cbt_sesi_ujian')
        .select(`
          id,
          judul,
          mapel,
          kategori,
          kelas_ids,
          status,
          waktu_buka,
          waktu_tutup,
          kkm,
          scoped_tokens
        `)
        .order('created_at', { ascending: false })

      if (mapelObj?.nama) {
        query = query.ilike('mapel', `%${mapelObj.nama.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setCbtSesiList(data || [])

      // Auto-pilih komponen default jika ada komponen di kelas aktif
      if (classKomponen.length > 0) {
        setSelectedCbtTargetKomponenId(classKomponen[0].id)
      }
    } catch (err) {
      console.error('Gagal mengambil daftar sesi CBT:', err)
      alert('Gagal memuat sesi CBT: ' + err.message)
    } finally {
      setLoadingCbtData(false)
    }
  }

  const handleSelectCbtSesi = async (sesiId) => {
    setSelectedCbtSesiId(sesiId)
    if (!sesiId) {
      setCbtPesertaPreview([])
      setSelectedPesertaNisns([])
      return
    }

    setLoadingCbtData(true)
    try {
      const { data: pList, error } = await supabase
        .from('cbt_peserta_ujian')
        .select(`
          id,
          siswa_nisn,
          status,
          nilai_akhir,
          strike_count,
          waktu_selesai
        `)
        .eq('sesi_id', sesiId)

      if (error) throw error

      // Gabungkan dengan data siswa di kelas aktif
      const preview = students.map(student => {
        const pRecord = (pList || []).find(p => String(p.siswa_nisn) === String(student.nisn))
        const existingScore = (nilaiData[selectedCbtTargetKomponenId] || {})[student.nisn]

        return {
          student,
          peserta: pRecord || null,
          cbtScore: pRecord?.nilai_akhir !== null && pRecord?.nilai_akhir !== undefined ? pRecord.nilai_akhir : null,
          cbtStatus: pRecord?.status || 'belum_mengerjakan',
          existingScore: existingScore !== undefined ? existingScore : null
        }
      })

      setCbtPesertaPreview(preview)
      const validNisns = preview.filter(item => item.cbtScore !== null).map(item => item.student.nisn)
      setSelectedPesertaNisns(validNisns)
    } catch (err) {
      console.error('Gagal memuat peserta CBT:', err)
      alert('Gagal memuat data peserta CBT: ' + err.message)
    } finally {
      setLoadingCbtData(false)
    }
  }

  const handleSaveTarikCbt = async () => {
    if (!selectedCbtTargetKomponenId) {
      alert('Silakan pilih TP / Komponen tujuan penyimpanan nilai!')
      return
    }
    if (selectedPesertaNisns.length === 0) {
      alert('Pilih minimal satu siswa yang memiliki nilai CBT untuk ditarik!')
      return
    }

    setSavingCbtScores(true)
    try {
      const targetKomponen = komponen.find(k => k.id === selectedCbtTargetKomponenId)
      const rowsToUpsert = []

      for (const nisn of selectedPesertaNisns) {
        const item = cbtPesertaPreview.find(p => p.student.nisn === nisn)
        if (item && item.cbtScore !== null) {
          rowsToUpsert.push({
            komponen_id: selectedCbtTargetKomponenId,
            siswa_nisn: nisn,
            nilai: Number(item.cbtScore),
            guru_id: session.id
          })
        }
      }

      if (rowsToUpsert.length === 0) {
        alert('Tidak ada nilai valid yang siap disimpan.')
        return
      }

      const chunkSize = 50
      for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
        const chunk = rowsToUpsert.slice(i, i + chunkSize)
        const { error: upsertErr } = await supabase
          .from('nilai_siswa')
          .upsert(chunk, { onConflict: 'komponen_id,siswa_nisn' })

        if (upsertErr) throw upsertErr
      }

      await logActivity(supabase, {
        guru_id: session.id,
        action: 'TARIK_NILAI_CBT',
        detail: `Menarik ${rowsToUpsert.length} nilai dari CBT ke TP ${targetKomponen?.nama || ''} kelas ${activeTabKelas}`
      })

      await fetchNilai()
      alert(`Berhasil menarik dan menyimpan ${rowsToUpsert.length} nilai CBT ke TP "${targetKomponen?.nama || ''}"!`)
      setShowTarikCbtModal(false)
    } catch (err) {
      console.error('Gagal menyimpan nilai CBT:', err)
      alert('Gagal menyimpan nilai: ' + err.message)
    } finally {
      setSavingCbtScores(false)
    }
  }

  
  const handleDeleteKomponen = async (id) => {
    const targetKomp = komponen.find(k => k.id === id)
    if (targetKomp && isPstsOrPsas(targetKomp.bab_nama || targetKomp.nama)) {
      alert('Komponen Sumatif dikontrol langsung oleh Kurikulum dan tidak dapat dihapus.')
      return
    }
    const confirmed = await requestConfirm({
      title: 'Hapus Komponen Nilai?',
      message: 'Semua nilai dalam komponen ini juga akan terhapus.',
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('nilai_komponen').delete().eq('id', id)
    if (error) alert('Gagal: ' + error.message)
    else {
      fetchKomponen()
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
    }
  }

  const handleToggleVisible = async (komp) => {
    if (isPstsOrPsas(komp.bab_nama || komp.nama)) {
      alert('Visibilitas kolom Sumatif dikontrol langsung oleh Kurikulum.')
      return
    }
    const willShow = !komp.is_nilai_visible
    if (willShow) {
      const confirmed = await requestConfirm({
        title: 'Tampilkan Nilai ke Siswa?',
        message: `Nilai "${komp.nama}" akan ditampilkan di akun siswa. Apakah Anda yakin?`,
        confirmLabel: 'Ya, Tampilkan',
        confirmColor: 'indigo',
        icon: 'info',
        extraCheckbox: 'Terapkan ke semua TP sejenis di semua kelas',
      })
      if (!confirmed) return
    }
    const { error } = await supabase.from('nilai_komponen')
      .update({ is_nilai_visible: willShow }).eq('id', komp.id)
    if (error) alert('Gagal: ' + error.message)
    else setKomponen(prev => prev.map(k => k.id === komp.id ? { ...k, is_nilai_visible: willShow } : k))
  }

  // Toggle visibility for an entire BAB (all TPs at once)
  const handleToggleBabVisible = async (babNama) => {
    if (isPstsOrPsas(babNama)) {
      alert('Visibilitas BAB Sumatif dikontrol langsung oleh Kurikulum.')
      return
    }
    const babKomps = komponen.filter(k => k.bab_nama === babNama)
    const allVisible = babKomps.every(k => k.is_nilai_visible)
    const willShow = !allVisible

    if (willShow) {
      const confirmed = await requestConfirm({
        title: 'Tampilkan Seluruh BAB ke Siswa?',
        message: `Semua TP dalam "${babNama}" akan ditampilkan di akun siswa. Apakah Anda yakin?`,
        confirmLabel: 'Ya, Tampilkan',
        confirmColor: 'indigo',
        icon: 'info',
      })
      if (!confirmed) return
    }

    const ids = babKomps.map(k => k.id)
    const { error } = await supabase.from('nilai_komponen')
      .update({ is_nilai_visible: willShow }).in('id', ids)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      setKomponen(prev => prev.map(k => ids.includes(k.id) ? { ...k, is_nilai_visible: willShow } : k))
    }
  }

  const handleSaveEditTp = async () => {
    if (!selectedTpToManage) return
    const { error } = await supabase.from('nilai_komponen').update({
      nama: editTpData.nama,
      deskripsi: editTpData.deskripsi,
      instruksi: editTpData.instruksi,
      lampiran_urls: editTpData.lampiran_urls,
      bobot: parseFloat(editTpData.bobot) || 1,
      target_kelas: editTpData.target_kelas,
      kelas: editTpData.target_kelas[0] || 'LINTAS'
    }).eq('id', selectedTpToManage)
    if (error) alert('Gagal: ' + error.message)
    else { setSelectedTpToManage(null); fetchKomponen() }
  }

  const handleUploadAttachment = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5MB")
      return
    }
    setUploadingAttachment(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
    const filePath = `${selectedTpToManage}/${fileName}`

    const { error: uploadError } = await supabase.storage.from('tp_lampiran').upload(filePath, file)
    if (uploadError) {
      alert("Gagal upload file: " + uploadError.message)
      setUploadingAttachment(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('tp_lampiran').getPublicUrl(filePath)
    setEditTpData(prev => ({
      ...prev,
      lampiran_urls: [...(prev.lampiran_urls || []), publicUrl]
    }))
    setUploadingAttachment(false)
  }

  const handleRemoveAttachment = (idxToRemove) => {
    setEditTpData(prev => ({
      ...prev,
      lampiran_urls: (prev.lampiran_urls || []).filter((_, idx) => idx !== idxToRemove)
    }))
  }

  const handleSaveEditBab = async () => {
    if (!selectedBabToManage || !editBabName.trim()) return
    const updates = komponen.filter(k => k.bab_nama === selectedBabToManage)
    for (const k of updates) {
      await supabase.from('nilai_komponen').update({ bab_nama: editBabName.trim() }).eq('id', k.id)
    }
    setSelectedBabToManage(null)
    fetchKomponen()
  }

  const handleDeleteBab = async (babNama) => {
    if (isPstsOrPsas(babNama)) {
      alert('BAB Sumatif dikontrol langsung oleh Kurikulum dan tidak dapat dihapus.')
      return
    }
    const confirmed = await requestConfirm({
       title: "Hapus BAB / Penilaian",
       message: `Yakin ingin menghapus "${babNama}" beserta seluruh TP di dalamnya secara permanen?`,
       confirmText: "Hapus",
       cancelText: "Batal",
       confirmColor: "bg-rose-600 hover:bg-rose-700 text-white"
    });
    if (!confirmed) return;
    
    const ids = komponen.filter(k => k.bab_nama === babNama).map(k => k.id);
    const { error } = await supabase.from('nilai_komponen').delete().in('id', ids);
    if (error) {
      alert('Gagal menghapus: ' + error.message);
    } else {
      setSelectedBabToManage(null);
      fetchKomponen();
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'));
    }
  }

  const handleUpdateMetode = async (babNama, metode) => {
    if (metode === 'bobot_manual') {
      const komp = classKomponen.filter(k => k.bab_nama === babNama);
      const vals = {};
      komp.forEach(k => {
         // Default if previously not set properly
         vals[k.id] = (k.bobot !== undefined && k.bobot !== null) ? k.bobot : (100/komp.length);
      });
      setManualBobotValues(vals);
      setManualBobotPending(true);
      return;
    }
    
    setManualBobotPending(false);
    const ids = komponen.filter(k => k.bab_nama === babNama).map(k => k.id)
    for (const id of ids) {
      await supabase.from('nilai_komponen').update({ metode_hitung: metode }).eq('id', id)
    }
    setEditingMetode(null)
    fetchKomponen()
  }
  
  const handleSaveManualBobot = async (babNama) => {
    let sum = 0;
    Object.values(manualBobotValues).forEach(v => sum += Number(v));
    if (Math.abs(sum - 100) > 0.01) {
       alert(`Total bobot harus 100%. Saat ini: ${sum}%`);
       return;
    }
    
    const ids = classKomponen.filter(k => k.bab_nama === babNama).map(k => k.id);
    for (const id of ids) {
       await supabase.from('nilai_komponen').update({ 
         metode_hitung: 'bobot_manual',
         bobot: Number(manualBobotValues[id])
       }).eq('id', id);
    }
    setManualBobotPending(false);
    fetchKomponen();
  }

  const handleSaveConfigAkhir = async (newConfig) => {
    // Metode hitung & bobot terkunci oleh Kurikulum / Admin. Guru hanya dapat mengubah visibilitas (is_visible).
    try {
      const { error } = await supabase.from('nilai_akhir_config').upsert({
        guru_id: session.id,
        tahun_ajaran_id: activeTa.id,
        semester_id: selectedSemesterId,
        mata_pelajaran_id: selectedMapelId,
        kelas: activeTabKelas,
        metode_hitung: configAkhir.metode_hitung, // Strictly preserve kurikulum method
        bobot_detail: configAkhir.bobot_detail,   // Strictly preserve kurikulum bobot
        is_visible: newConfig.is_visible ?? false,
        updated_at: new Date().toISOString()
      }, { onConflict: 'guru_id,tahun_ajaran_id,semester_id,mata_pelajaran_id,kelas' });
      
      if (error) {
        alert('Gagal menyimpan visibilitas: ' + error.message);
        return false;
      }
      
      setConfigAkhir(prev => ({ ...prev, is_visible: newConfig.is_visible ?? false }));
      setShowConfigAkhirModal(false);
      return true;
    } catch (err) {
      console.error('Error saving config akhir:', err);
      return false;
    }
  }

  const handleSavePtsSelectionRombel = async (selectedBabs) => {
    setSavingPtsSelection(true)
    try {
      const targetClassesToUpdate = classesForRombel.length > 0 ? classesForRombel : (activeTabKelas ? [activeTabKelas] : [])
      if (targetClassesToUpdate.length === 0) {
        alert('Tidak ada kelas yang dapat diperbarui untuk rombel ini.')
        return false
      }

      // Fetch existing configs for all classes in this rombel
      const { data: existingConfigs } = await supabase.from('nilai_akhir_config')
        .select('*')
        .eq('guru_id', session.id)
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester_id', selectedSemesterId)
        .eq('mata_pelajaran_id', selectedMapelId)
        .in('kelas', targetClassesToUpdate)

      const existingByKelas = {}
      ;(existingConfigs || []).forEach(cfg => {
        existingByKelas[cfg.kelas] = cfg
      })

      const upsertRows = targetClassesToUpdate.map(cls => {
        const existing = existingByKelas[cls]
        return {
          guru_id: session.id,
          tahun_ajaran_id: activeTa.id,
          semester_id: selectedSemesterId,
          mata_pelajaran_id: selectedMapelId,
          kelas: cls,
          metode_hitung: existing?.metode_hitung || configAkhir.metode_hitung || 'rata_rata',
          bobot_detail: {
            ...(existing?.bobot_detail || configAkhir.bobot_detail || {}),
            pts_selected_babs: selectedBabs,
            pts_confirmed: true
          },
          is_visible: existing?.is_visible ?? configAkhir.is_visible ?? false,
          updated_at: new Date().toISOString()
        }
      })

      const { error } = await supabase.from('nilai_akhir_config').upsert(
        upsertRows,
        { onConflict: 'guru_id,tahun_ajaran_id,semester_id,mata_pelajaran_id,kelas' }
      )

      if (error) {
        alert('Gagal menyimpan pilihan PTS rombel: ' + error.message)
        return false
      }

      // Update local state for current tab
      setConfigAkhir(prev => ({
        ...prev,
        bobot_detail: {
          ...(prev.bobot_detail || {}),
          pts_selected_babs: selectedBabs,
          pts_confirmed: true
        }
      }))
      setShowPtsSelectionModal(false)
      window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
      return true
    } catch (err) {
      console.error('Error saving PTS selection for rombel:', err)
      alert('Terjadi kesalahan saat menyimpan pilihan PTS: ' + err.message)
      return false
    } finally {
      setSavingPtsSelection(false)
    }
  }

  const handleNilaiChange = useCallback((komponenId, nisn, rawVal, immediate = false) => {
    const cellKey = `${komponenId}-${nisn}`
    let val = rawVal === '' || rawVal === null || rawVal === undefined ? null : Number(rawVal)
    if (val !== null && !isNaN(val)) {
      val = Math.max(0, Math.min(100, val))
    } else if (isNaN(val)) {
      val = null
    }

    setSavingCells(prev => new Set(prev).add(cellKey))
    setErrorCells(prev => {
      const next = { ...prev }
      delete next[cellKey]
      return next
    })

    // Update state React secara instan untuk responsivitas tinggi (0ms lag di UI & rata-rata)
    setNilaiData(prev => ({ ...prev, [komponenId]: { ...(prev[komponenId] || {}), [nisn]: val } }))

    if (saveTimeoutRef.current[cellKey]) {
      clearTimeout(saveTimeoutRef.current[cellKey])
    }

    const doSave = async () => {
      try {
        let saveError = null
        if (session?.akun_id && session?.id) {
          const cleanVal = (val === null || val === undefined || val === '') ? null : Number(val)
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_simpan_nilai_guru', {
            p_akun_id: session.akun_id,
            p_guru_id: session.id,
            p_komponen_id: komponenId,
            p_siswa_nisn: String(nisn).trim(),
            p_nilai: cleanVal
          })
          if (!rpcErr && rpcRes?.ok) {
            saveError = null
          } else if (rpcRes && !rpcRes.ok) {
            saveError = new Error(rpcRes.msg || 'Gagal menyimpan nilai')
          } else if (rpcErr && !rpcErr.message?.includes('function') && rpcErr.code !== 'PGRST202') {
            saveError = rpcErr
          }
        }
        if (saveError === null && (!session?.akun_id || !session?.id)) {
          const { error: upErr } = await supabase.from('nilai_siswa').upsert({
            komponen_id: komponenId,
            siswa_nisn: nisn,
            nilai: val,
            diinput_oleh: session.id,
            updated_at: new Date().toISOString()
          }, { onConflict: 'komponen_id,siswa_nisn' })
          saveError = upErr
        }

        if (saveError) throw saveError

        removePendingGradeFromStorage(komponenId, nisn)
        window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated', { detail: { komponenId, nisn } }))
      } catch (err) {
        console.error(`Gagal menyimpan nilai sel ${cellKey}:`, err)
        savePendingGradeToStorage({
          komponenId,
          nisn,
          val,
          diinputOleh: session.id,
          timestamp: Date.now()
        })
        setErrorCells(prev => ({
          ...prev,
          [cellKey]: {
            errorMsg: err.message || 'Koneksi terganggu',
            val,
            komponenId,
            nisn
          }
        }))
      } finally {
        setSavingCells(prev => {
          const next = new Set(prev)
          next.delete(cellKey)
          return next
        })
        delete saveTimeoutRef.current[cellKey]
      }
    }

    if (immediate) {
      doSave()
    } else {
      saveTimeoutRef.current[cellKey] = setTimeout(doSave, 350)
    }
  }, [session.id])

  const handlePasteGrid = async (e, startRowIdx, startColIdx, orderedKomponen) => {
    const clipboardText = e.clipboardData?.getData('text')
    if (!clipboardText) return

    const rawRows = clipboardText.trimEnd().split(/\r?\n/)
    const grid = rawRows.map(row => row.split('\t'))

    if (grid.length === 1 && grid[0].length === 1) {
      return
    }

    e.preventDefault()

    const upsertPayloads = []
    const newNilaiDataUpdates = {}

    for (let r = 0; r < grid.length; r++) {
      const targetRow = startRowIdx + r
      if (targetRow >= students.length) break

      const student = students[targetRow]
      if (!student) continue

      for (let c = 0; c < grid[r].length; c++) {
        const targetCol = startColIdx + c
        if (targetCol >= orderedKomponen.length) break

        const komponen = orderedKomponen[targetCol]
        if (!komponen) continue

        let valStr = grid[r][c].trim().replace(',', '.')
        let numVal = valStr === '' ? null : Number(valStr)

        if (numVal !== null && (isNaN(numVal) || numVal < 0 || numVal > 100)) {
          if (isNaN(numVal)) continue
          numVal = Math.max(0, Math.min(100, numVal))
        }

        if (!newNilaiDataUpdates[komponen.id]) {
          newNilaiDataUpdates[komponen.id] = {}
        }
        newNilaiDataUpdates[komponen.id][student.nisn] = numVal

        upsertPayloads.push({
          komponen_id: komponen.id,
          siswa_nisn: student.nisn,
          nilai: numVal,
          diinput_oleh: session.id,
          updated_at: new Date().toISOString()
        })

        const inputEl = document.querySelector(`input[data-grade-row="${targetRow}"][data-grade-col="${targetCol}"]`)
        if (inputEl) {
          inputEl.value = numVal !== null ? numVal : ''
        }
      }
    }

    if (upsertPayloads.length > 0) {
      setNilaiData(prev => {
        const next = { ...prev }
        Object.keys(newNilaiDataUpdates).forEach(kompId => {
          next[kompId] = { ...(next[kompId] || {}), ...newNilaiDataUpdates[kompId] }
        })
        return next
      })

      try {
        const { error } = await supabase
          .from('nilai_siswa')
          .upsert(upsertPayloads, { onConflict: 'komponen_id,siswa_nisn' })

        if (error) {
          console.error("Gagal batch save paste nilai:", error)
          alert("Peringatan: Gagal menyimpan data paste ke server (" + error.message + "). Mohon periksa koneksi internet Anda.")
        } else {
          window.dispatchEvent(new CustomEvent('ebudimulia:nilai_updated'))
        }
      } catch (err) {
        console.error("Error batch save paste nilai:", err)
        alert("Peringatan: Terjadi kesalahan saat menyimpan data paste: " + err.message)
      }
    }
  }

  const toggleNewTpTargetKelas = (c) => {
    setNewTpTargetKelas(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const toggleEditTpTargetKelas = (c) => {
    setEditTpData(prev => ({
      ...prev,
      target_kelas: prev.target_kelas.includes(c) ? prev.target_kelas.filter(x => x !== c) : [...prev.target_kelas, c]
    }))
  }

  // ─── Hitung Rata-rata ─────────────────────────────────────────────────────
  const hitungRataRata = (nisn) => {
    const babList = [...new Set(classKomponen.map(k => k.bab_nama || 'Lainnya'))].sort((a,b) => {
      const isPstsA = a.toUpperCase().includes('PSTS');
      const isPstsB = b.toUpperCase().includes('PSTS');
      const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT');
      const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT');
      if (isPstsA && !isPstsB) return isPsasB ? -1 : 1;
      if (isPstsB && !isPstsA) return isPsasA ? 1 : -1;
      if (isPsasA && !isPsasB) return 1;
      if (isPsasB && !isPsasA) return -1;
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      if (matchA && matchB) return parseInt(matchA[0]) - parseInt(matchB[0]);
      return a.localeCompare(b);
    })
    const hitungRataBAB = (bab) => {
      const komp = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab)
      const metode = komp[0]?.metode_hitung || 'rata_rata'
      let totalBobot = 0, totalNilai = 0, hasVal = false
      komp.forEach(k => {
        if (!configAkhir.include_karakter && isKarakterKomponen(k.nama)) return
        const val = nilaiData[k.id]?.[nisn]
        if (val !== undefined && val !== null && val !== '') {
          if (metode === 'bobot_manual') { totalNilai += Number(val) * (k.bobot || 1); totalBobot += (k.bobot || 1) }
          else { totalNilai += Number(val); totalBobot += 1 }
          hasVal = true
        }
      })
      if (!hasVal || totalBobot === 0) return null
      return +(totalNilai / totalBobot).toFixed(1)
    }

    if (configAkhir.metode_hitung === 'rata_rata_langsung') {
      let totalNilai = 0;
      let count = 0;
      const includeKar = configAkhir.include_karakter ?? false;
      classKomponen.forEach(k => {
        if (!includeKar && isKarakterKomponen(k.nama)) return;
        const val = nilaiData[k.id]?.[nisn];
        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && String(val).trim() !== '-') {
          totalNilai += Number(val);
          count += 1;
        }
      });
      if (count === 0) return null;
      return +(totalNilai / count).toFixed(1);
    } else if (configAkhir.metode_hitung === 'bobot_manual') {
      let totalNilai = 0;
      let totalBobot = 0;
      babList.forEach(bab => {
        const rataBab = hitungRataBAB(bab);
        if (rataBab !== null) {
           const bobot = Number(configAkhir.bobot_detail[bab] || 0);
           totalNilai += rataBab * bobot;
           totalBobot += bobot;
        }
      });
      if (totalBobot === 0) return null;
      return (totalNilai / totalBobot).toFixed(1);
    } else {
      const vals = babList.map(bab => hitungRataBAB(bab)).filter(v => v !== null)
      if (vals.length === 0) return null
      return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
    }
  }


  const getPredikat = (nilai) => {
    if (nilai === null || isNaN(nilai)) return '-';
    if (nilai >= 90) return 'A';
    if (nilai >= 80) return 'B';
    if (nilai >= 70) return 'C';
    if (nilai >= 60) return 'D';
    return 'E';
  }



  // ─── Export Excel (Rich Format) ───────────────────────────────────────────
  const generateClassSheet = async (kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb, customMapelNama = null, customSheetName = null) => {
      setIsExporting(true)
      const sem = semesters.find(s => s.id === selectedSemesterId)
      const mapelNama = customMapelNama || (uniqueMapels.find(m => m.id === selectedMapelId)?.nama || 'Mapel')
      const sekolah = 'SMP BUDI MULIA'
      const tahunAjaran = activeTa?.nama || ''

      const babList = [...new Set(classKomp.map(k => k.bab_nama || 'Lainnya'))]
        .filter(bab => {
          const isPsts = bab.toUpperCase().includes('PSTS')
          const isPsas = bab.toUpperCase().includes('PSAS') || bab.toUpperCase().includes('PSAT')
          if (isPsts && raporSettings.show_kolom_psts === 'false') return false
          if (isPsas && raporSettings.show_kolom_psas === 'false') return false
          return true
        })
        .sort((a,b) => {
          const isPstsA = a.toUpperCase().includes('PSTS');
          const isPstsB = b.toUpperCase().includes('PSTS');
          const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT');
          const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT');
          if (isPstsA && !isPstsB) return isPsasB ? -1 : 1;
          if (isPstsB && !isPstsA) return isPsasA ? 1 : -1;
          if (isPsasA && !isPsasB) return 1;
          if (isPsasB && !isPsasA) return -1;
          const matchA = a.match(/\d+/);
          const matchB = b.match(/\d+/);
          if (matchA && matchB) return parseInt(matchA[0]) - parseInt(matchB[0]);
          return a.localeCompare(b);
        })
      const babKomponenMap = {}
      babList.forEach(bab => {
        babKomponenMap[bab] = classKomp.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen)
      })

      const hitungRataAkhir = (nisn) => {
        const hitungRataBAB = (nisn, bab) => {
          const komp = (babKomponenMap[bab] || []).filter(k => !isKarakterKomponen(k.nama))
          const metode = komp[0]?.metode_hitung || 'rata_rata'
          let totalBobot = 0, totalNilai = 0, hasVal = false
          komp.forEach(k => {
            const val = classNilaiData[k.id]?.[nisn]
            if (val !== undefined && val !== null && val !== '') {
              if (metode === 'bobot_manual') { totalNilai += Number(val) * (k.bobot || 1); totalBobot += (k.bobot || 1) }
              else { totalNilai += Number(val); totalBobot += 1 }
              hasVal = true
            }
          })
          if (!hasVal || totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        }

        if (classConfigAkhir.metode_hitung === 'rata_rata_langsung') {
          let totalNilai = 0;
          let count = 0;
          const includeKar = classConfigAkhir.include_karakter ?? false;
          (classKomponen || []).forEach(k => {
            if (!includeKar && isKarakterKomponen(k.nama)) return;
            const val = classNilaiData[k.id]?.[nisn];
            if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val)) && String(val).trim() !== '-') {
              totalNilai += Number(val);
              count += 1;
            }
          });
          if (count === 0) return null;
          return +(totalNilai / count).toFixed(1);
        } else if (classConfigAkhir.metode_hitung === 'bobot_manual') {
          let totalNilai = 0;
          let totalBobot = 0;
          babList.forEach(bab => {
            const rataBab = hitungRataBAB(nisn, bab);
            if (rataBab !== null) {
               const bobot = Number(classConfigAkhir.bobot_detail[bab] || 0);
               totalNilai += rataBab * (bobot / 100);
               totalBobot += bobot;
            }
          });
          if (totalBobot === 0) return null;
          return +(totalNilai).toFixed(1);
        } else {
          const vals = babList.map(bab => hitungRataBAB(nisn, bab)).filter(v => v !== null)
          if (vals.length === 0) return null
          return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        }
      }

      const getKeterangan = (nisn, bab) => {
        const komp = (babKomponenMap[bab] || []).filter(k => !isKarakterKomponen(k.nama))
        const belumDikerjakan = []
        komp.forEach(k => {
          const val = classNilaiData[k.id]?.[nisn]
          if (val !== undefined && val !== null && val !== '' && Number(val) === 0) {
            belumDikerjakan.push(k.nama)
          }
        })
        const parts = []
        if (belumDikerjakan.length > 0) parts.push(`${belumDikerjakan.join(', ')} belum dikerjakan`)
        return parts.join(' | ')
      }

      const isSumatif = (bab) => ['PSTS 1', 'PSTS 2', 'PSAS', 'PSAT'].includes(bab);

      const FIXED = 3
      const babColStart = {}
      let col = FIXED
      babList.forEach(bab => {
        babColStart[bab] = col
        col += (babKomponenMap[bab]?.length || 0) + (isSumatif(bab) ? 1 : 2)
      })
      const nilaiAkhirCol = col
      const predikatCol  = col + 1
      const lingkupStartCol = col + 2

      let maxKomp = 0
      babList.forEach(bab => {
        if (babKomponenMap[bab]?.length > maxKomp) maxKomp = babKomponenMap[bab].length
      })
      
      const totalCols = lingkupStartCol + (babList.length * 2)
      const requiredLingkupRows = 15 + (maxKomp * 4)
      const dataRows = 13 + classStudents.length // Data starts at idx 13 (Row 14)
      const totalRows = Math.max(dataRows, requiredLingkupRows)

      const colLetter = (n) => {
        let s = ''
        n += 1
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
        return s
      }

      const BORDER = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
      
      const styleTitle = { font: { bold: true, sz: 22 }, alignment: { horizontal: 'center', vertical: 'center' } }
      const styleInfo = { font: { sz: 12, bold: true } }
      const styleHeader = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER, fill: { fgColor: { rgb: "F2F2F2" } } }
      const styleDataCenter = { font: { sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER }
      const styleDataLeft = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BORDER }
      const styleLingkupTitle = { font: { bold: true, sz: 12 } }
      const styleLingkupItalic = { font: { italic: true, sz: 12 } }
      const styleLingkupDesc = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BORDER }

      // Initialize with NULL
      const aoa2 = Array.from({ length: totalRows }, () => Array.from({ length: totalCols }, () => null))

      const getColLetter = (colIndex) => {
         let letter = '';
         let temp = colIndex;
         while (temp >= 0) {
            letter = String.fromCharCode((temp % 26) + 65) + letter;
            temp = Math.floor(temp / 26) - 1;
         }
         return letter;
      }

      const setCell = (r, c, val, style, t = null, f = null) => {
        if (aoa2[r]) {
          const cellType = t ? t : (typeof val === 'number' ? 'n' : 's')
          aoa2[r][c] = { v: val, t: cellType, s: JSON.parse(JSON.stringify(style || {})), f: f }
        }
      }

      // Title
      setCell(0, 0, 'DAFTAR NILAI PESERTA DIDIK', styleTitle)
      setCell(1, 0, sekolah, styleTitle)
      setCell(2, 0, `TAHUN AJARAN ${tahunAjaran}`, styleTitle)
      
      // Info
      setCell(3, 0, 'Mata Pelajaran', styleInfo); setCell(3, 2, `: ${mapelNama}`, styleInfo)
      setCell(4, 0, 'Kelas', styleInfo);          setCell(4, 2, `: ${kelas}`, styleInfo)
      setCell(5, 0, 'Semester', styleInfo);       setCell(5, 2, `: ${sem?.nomor || '-'}`, styleInfo)
      setCell(6, 0, 'Tahun Ajaran', styleInfo);   setCell(6, 2, `: ${tahunAjaran}`, styleInfo)
      setCell(7, 0, 'KKM', styleInfo);            setCell(7, 2, `: ${kkm}`, styleInfo)
      setCell(8, 0, 'Guru Pengampu', styleInfo);  setCell(8, 2, `: ${session?.nama || 'Guru'}`, styleInfo)

      const fillEmptyBorders = (rStart, rEnd, cStart, cEnd, style) => {
        for(let r=rStart; r<=rEnd; r++) {
          for(let c=cStart; c<=cEnd; c++) {
             if (!aoa2[r][c]) setCell(r, c, '', style, 's');
          }
        }
      }

      // Row 11 (idx 10): Main Headers & Bab
      setCell(10, 0, 'No', styleHeader)
      setCell(10, 1, 'NISN', styleHeader)
      setCell(10, 2, 'Nama Siswa', styleHeader)
      babList.forEach(bab => { 
        setCell(10, babColStart[bab], bab, styleHeader) 
      })
      setCell(10, nilaiAkhirCol, 'Nilai Akhir', styleHeader)
      setCell(10, predikatCol, 'Predikat', styleHeader)

      // Row 12 (idx 11): TP sub-headers
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const metode = komp[0]?.metode_hitung || 'rata_rata'
        komp.forEach((k, ki) => { setCell(11, start + ki, k.nama, styleHeader) })
        if (isSumatif(bab)) {
          setCell(11, start + komp.length, 'Keterangan (Belum Tuntas)', styleHeader)
          setCell(12, start + komp.length, '', styleDataCenter)
        } else {
          const rataHeaderName = (metode === 'bobot_manual') ? 'Nilai Akhir BAB' : 'Rata-rata BAB'
          setCell(11, start + komp.length, rataHeaderName, styleHeader)
          setCell(11, start + komp.length + 1, 'Keterangan (Belum Tuntas)', styleHeader)
          // White cells below them
          setCell(12, start + komp.length, '', styleDataCenter)
          setCell(12, start + komp.length + 1, '', styleDataCenter)
        }
      })

      // Row 13 (idx 12): Bobot
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const metode = komp[0]?.metode_hitung || 'rata_rata'
        
        komp.forEach((k, ki) => { 
          let bobot = ''
          if (metode === 'bobot_sama') {
             bobot = 100
          } else if (metode === 'bobot_manual') {
             bobot = (k.bobot !== undefined && k.bobot !== null) ? k.bobot : 100
          } else {
             bobot = '' // rata_rata dibiarkan kosong baris bobotnya
          }
          setCell(12, start + ki, bobot, styleDataCenter, 'n') 
        })
      })

      // Fill header borders for main table (idx 10 to 12)
      fillEmptyBorders(10, 12, 0, 2, styleHeader)
      fillEmptyBorders(10, 12, nilaiAkhirCol, predikatCol, styleHeader)
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
        fillEmptyBorders(10, 12, start, end, styleHeader)
      })

      // Lingkup Materi Headers
      babList.forEach((bab, bi) => {
        const startLCol = lingkupStartCol + bi * 2
        setCell(10, startLCol, `Lingkup Materi ${bi + 1} :`, styleLingkupTitle)
        setCell(11, startLCol, 'Materi yang diajarkan :', styleLingkupTitle)
        setCell(12, startLCol, bab, styleLingkupItalic)
      })

      // Data Rows
      classStudents.forEach((s, idx) => {
        const r = 13 + idx
        const excelRow = r + 1
        setCell(r, 0, idx + 1, styleDataCenter)
        setCell(r, 1, s.nisn, styleDataCenter, 's')
        setCell(r, 2, s.nama_lengkap, styleDataLeft)
        
        const rataBabFormulaRefs = [];

        babList.forEach(bab => {
          const komp = babKomponenMap[bab] || []
          const start = babColStart[bab]
          
          const tpKomp = komp.filter(k => !isKarakterKomponen(k.nama));
          const tpColLetters = tpKomp.map((k) => getColLetter(start + komp.indexOf(k)))
          
          komp.forEach((k, ki) => {
            const val = classNilaiData[k.id]?.[s.nisn]
            setCell(r, start + ki, val !== undefined && val !== null && val !== '' ? Number(val) : '', styleDataCenter, 'n')
          })
          
          const metode = komp[0]?.metode_hitung || 'rata_rata'
          let formulaRata = ""
          
          if (!isSumatif(bab)) {
            if (tpColLetters.length > 0) {
               const rangeNilai = `${tpColLetters[0]}${excelRow}:${tpColLetters[tpColLetters.length-1]}${excelRow}`
               const rangeBobot = `${tpColLetters[0]}13:${tpColLetters[tpColLetters.length-1]}13`
               
               if (metode === 'rata_rata') {
                  formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(AVERAGE(${rangeNilai}), 2), ""))`
               } else {
                  formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(SUMPRODUCT(${rangeNilai}, ${rangeBobot}) / SUMIF(${rangeNilai}, ">=0", ${rangeBobot}), 2), ""))`
               }
            }
            
            const rataCol = start + komp.length
            const rataColLetter = getColLetter(rataCol)
            if (formulaRata) {
               rataBabFormulaRefs.push(`${rataColLetter}${excelRow}`)
            }
            
            setCell(r, rataCol, null, styleDataCenter, 'n', formulaRata)
            
            // Keterangan formula
            let formulaKeterangan = `""`
            if (tpColLetters.length > 0) {
               const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
               const concatExpr = parts.join(' & ')
               formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
            }
            setCell(r, start + komp.length + 1, null, styleDataLeft, 's', formulaKeterangan)
          } else {
            if (tpColLetters.length > 0) {
               rataBabFormulaRefs.push(`${tpColLetters[0]}${excelRow}`)
            }
            let formulaKeterangan = `""`
            if (tpColLetters.length > 0) {
               const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
               const concatExpr = parts.join(' & ')
               formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
            }
            setCell(r, start + komp.length, null, styleDataLeft, 's', formulaKeterangan)
          }
        })
        
        // Rata Rata Sumatif Formula
        let formulaRataSumatif = `""`
        if (rataBabFormulaRefs.length > 0) {
           if (classConfigAkhir.metode_hitung === 'bobot_manual') {
              let numParts = []
              let denParts = []
              babList.forEach((bab, idx) => {
                 const bobot = Number(classConfigAkhir.bobot_detail[bab] || 0)
                 if (bobot > 0) {
                    numParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[idx]}), ${rataBabFormulaRefs[idx]} * ${bobot}, 0)`)
                    denParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[idx]}), ${bobot}, 0)`)
                 }
              })
              if (numParts.length > 0) {
                 formulaRataSumatif = `IF((${denParts.join(' + ')})=0, "", IFERROR(ROUND((${numParts.join(' + ')}) / (${denParts.join(' + ')}), 1), ""))`
              }
           } else {
              formulaRataSumatif = `IFERROR(ROUND(AVERAGE(${rataBabFormulaRefs.join(',')}), 1), "")`
           }
        }
        setCell(r, nilaiAkhirCol, null, styleDataCenter, 'n', formulaRataSumatif)
        
        // Predikat formula (A >= 90, B >= 80, C >= 70, D >= 60, E < 60)
        const akhirColLetter = getColLetter(nilaiAkhirCol)
        const formulaPredikat = `IF(OR(${akhirColLetter}${excelRow}="", ${akhirColLetter}${excelRow}=0), "", IF(${akhirColLetter}${excelRow}>=90, "A", IF(${akhirColLetter}${excelRow}>=80, "B", IF(${akhirColLetter}${excelRow}>=70, "C", IF(${akhirColLetter}${excelRow}>=60, "D", "E")))))`
        setCell(r, predikatCol, null, styleDataCenter, 's', formulaPredikat)
      })

      // Lingkup Materi Descriptions
      babList.forEach((bab, bi) => {
        const komp = babKomponenMap[bab] || []
        const startLCol = lingkupStartCol + bi * 2
        
        komp.forEach((k, ki) => {
           const rowStart = 13 + (ki * 4)
           setCell(rowStart, startLCol, k.nama, styleDataCenter)
           setCell(rowStart, startLCol + 1, k.deskripsi || '', styleLingkupDesc)
           fillEmptyBorders(rowStart, rowStart+3, startLCol, startLCol, styleDataCenter)
           fillEmptyBorders(rowStart, rowStart+3, startLCol+1, startLCol+1, styleLingkupDesc)
        })
      })

      const rawSheetName = customSheetName || `Nilai ${kelas} Sem${sem?.nomor || '-'}`;
      let cleanSheetName = rawSheetName.replace(/[\\/*?[\]:]/g, '_').substring(0, 31);
      let sheetName = cleanSheetName;
      let counter = 1;
      while (wb.getWorksheet(sheetName)) {
        const suffix = ` (${counter})`;
        sheetName = `${cleanSheetName.slice(0, 31 - suffix.length)}${suffix}`;
        counter++;
      }
      const ws = wb.addWorksheet(sheetName, {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 13, showGridLines: false }]
      });

      // Write values and styles
      for(let r = 0; r < totalRows; r++) {
         const row = ws.getRow(r + 1);
         for(let c = 0; c < totalCols; c++) {
            const cell = row.getCell(c + 1);
            if (aoa2[r] && aoa2[r][c] !== null && aoa2[r][c] !== undefined) {
               const val = aoa2[r][c].v;
               const f = aoa2[r][c].f;
               if (f) {
                 cell.value = { formula: f };
               } else {
                 if (val !== undefined && val !== null) cell.value = val;
               }
               
               // Translate style
               const s = aoa2[r][c].s;
               if (s) {
                 if (s.font) {
                    cell.font = {
                       bold: s.font.bold,
                       italic: s.font.italic,
                       size: s.font.sz,
                       name: 'Times New Roman'
                    };
                 }
                 if (s.alignment) {
                    cell.alignment = {
                       horizontal: s.alignment.horizontal,
                       vertical: s.alignment.vertical === 'center' ? 'middle' : s.alignment.vertical,
                       wrapText: s.alignment.wrapText
                    };
                 }
                 if (s.border) {
                    const borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
                    const cellBorder = {};
                    if (s.border.top) cellBorder.top = borderStyle;
                    if (s.border.bottom) cellBorder.bottom = borderStyle;
                    if (s.border.left) cellBorder.left = borderStyle;
                    if (s.border.right) cellBorder.right = borderStyle;
                    if (Object.keys(cellBorder).length > 0) cell.border = cellBorder;
                 }
                 if (s.fill && s.fill.fgColor && s.fill.fgColor.rgb) {
                    cell.fill = {
                       type: 'pattern',
                       pattern: 'solid',
                       fgColor: { argb: 'FF' + s.fill.fgColor.rgb }
                    };
                 }
               }
            }
         }
      }

const merges = [];
      [0, 1, 2].forEach(r => {
        if (predikatCol > 1) merges.push({ s: { r, c: 0 }, e: { r, c: predikatCol } })
      });
      [4, 5, 6, 7, 8].forEach(r => {
        if (predikatCol > 2) merges.push({ s: { r, c: 2 }, e: { r, c: predikatCol } })
      });
      
      // Merge Bab titles across their components horizontally
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
        if (end > start) merges.push({ s: { r: 10, c: start }, e: { r: 10, c: end } })
        
        // Merge Nilai Akhir BAB & Keterangan vertically from row 11 to 12
        if (!isSumatif(bab)) {
          const rataCol = start + komp.length;
          const ketCol = start + komp.length + 1;
          merges.push({ s: { r: 11, c: rataCol }, e: { r: 12, c: rataCol } });
          merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } });
        } else {
          const ketCol = start + komp.length;
          merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } });
        }
      });

      // Merge No, NISN, Nama vertically
      [0, 1, 2].forEach(c => merges.push({ s: { r: 10, c }, e: { r: 12, c } }));
      // Merge End Columns vertically
      [nilaiAkhirCol, predikatCol].forEach(c => {
        merges.push({ s: { r: 10, c }, e: { r: 12, c } })
      });

      // Lingkup Materi vertical merges
      babList.forEach((bab, bi) => {
         const startLCol = lingkupStartCol + bi * 2
         const komp = babKomponenMap[bab] || []
         komp.forEach((k, ki) => {
            const rowStart = 13 + (ki * 4)
            merges.push({ s: { r: rowStart, c: startLCol }, e: { r: rowStart + 3, c: startLCol } })
            merges.push({ s: { r: rowStart, c: startLCol + 1 }, e: { r: rowStart + 3, c: startLCol + 1 } })
         })
      });

      // Translate merges

      for (const m of merges) {
         ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
      }

const colWidths = Array(totalCols).fill({ wch: 10 })
      for (let c = 0; c < totalCols; c++) {
        let maxLen = 5
        for (let r = 0; r < totalRows; r++) {
          if (aoa2[r] && aoa2[r][c] && aoa2[r][c].v !== undefined && aoa2[r][c].v !== null) {
             // Ignore title rows for column width calculation (since they are merged and long)
             if (c === 0 && r < 4) continue; 
             // Ignore Bab group headers in row 10
             if (r === 10 && c > 2 && c < nilaiAkhirCol) continue;
             // Ignore Lingkup Materi Headers that span columns
             if (c >= lingkupStartCol && r >= 10 && r <= 12) continue;
             
             let valStr = String(aoa2[r][c].v)
             // Handle newline characters if any
             let lines = valStr.split('\n')
             for (let line of lines) {
               if (line.length > maxLen) maxLen = line.length
             }
          }
        }
        
        // Apply Caps and Padding
        if (c === 0) maxLen = 3.71 // No
        else if (c === 1) maxLen = 16.29 // NISN
        else if (c === 2) {
           const maxNamaLength = Math.max(...students.map(s => (s.nama_lengkap || '').length), 15);
           maxLen = maxNamaLength + 2; // Nama Siswa full length across all classes
        }
        else if (c >= lingkupStartCol) {
           // Lingkup Materi section
           const isDesc = (c - lingkupStartCol) % 2 !== 0
           if (isDesc) maxLen = 60 // Deskripsi always 60 to wrap nicely
           else maxLen = 15 // TP Name always 15
        }
        else {
           // TP columns, Rata-rata, Keterangan
           maxLen = Math.min(Math.max(maxLen + 2, 8), 35) // Cap at 35 to force wrap
        }

        colWidths[c] = { wch: maxLen }
      }

      // Translate col widths

      for (let c = 0; c < colWidths.length; c++) {
         if (colWidths[c]) {
            ws.getColumn(c + 1).width = colWidths[c].wch;
         }
      }

      // Apply row heights (Title rows)
      ws.getRow(1).height = 34.5;
      ws.getRow(2).height = 34.5;
      ws.getRow(3).height = 34.5;
      
      // Apply row heights (Lingkup Materi)
      babList.forEach((bab, bi) => {
        const komp = babKomponenMap[bab] || []
        komp.forEach((k, ki) => {
           const rowStart = 13 + (ki * 4)
           const descLen = (k.deskripsi || '').length
           const lines = Math.ceil(descLen / 60)
           if (lines > 4) {
              const extraLines = lines - 4
              const hpt = 15 + Math.ceil((extraLines * 15) / 4)
              ws.getRow(rowStart).height = hpt
              ws.getRow(rowStart+1).height = hpt
              ws.getRow(rowStart+2).height = hpt
              ws.getRow(rowStart+3).height = hpt
           }
        })
      })

      // Custom BAB Colors
      const babHexColors = ['FFEEF2FF', 'FFECFDF5', 'FFFFFBEB', 'FFFAF5FF', 'FFFFF1F2', 'FFECFEFF'];
      babList.forEach((bab, bi) => {
         const start = babColStart[bab];
         const komp = babKomponenMap[bab] || [];
         const end = start + komp.length + (isSumatif(bab) ? 0 : 1); 
         const color = babHexColors[bi % babHexColors.length];
         
         // Apply to headers (Row 11 and Row 12)
         for (let r = 10; r <= 11; r++) {
            for (let c = start; c <= end; c++) {
               const cell = ws.getRow(r + 1).getCell(c + 1);
               // Ensure there is a border on these headers
               cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
         }

         // Apply color to Bobot row (Row 13 / idx 12) only for cells that have values
         for (let c = start; c <= end; c++) {
            const cell = ws.getRow(13).getCell(c + 1);
            if (aoa2[12] && aoa2[12][c] && aoa2[12][c].v !== undefined && aoa2[12][c].v !== null && aoa2[12][c].v !== '') {
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
         }
      });
      
      // Apply Student Row Colors (Odd/Even)
      classStudents.forEach((s, idx) => {
         const r = 13 + idx;
         // Visual Ganjil (idx 0, 2, 4) = Putih, Visual Genap (idx 1, 3, 5) = Biru muda FFF0F9FF
         const isGanjilVisual = (idx % 2 === 0);
         const rowColor = isGanjilVisual ? 'FFFFFFFF' : 'FFF0F9FF';
         for(let c = 0; c < totalCols; c++) {
            // Only color up to Predikat col, ignore Lingkup on the right for now
            if (c > predikatCol) break; 
            
            const cell = ws.getRow(r + 1).getCell(c + 1);
            if (aoa2[r] && aoa2[r][c] && aoa2[r][c].s && aoa2[r][c].s.border) {
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } };
            }
         }
      });

            // Worksheet Protection
      await ws.protect(session?.id?.substring(0, 8) || 'sklbm123', {
         selectLockedCells: true,
         selectUnlockedCells: true,
         formatCells: false,
         formatColumns: false,
         formatRows: false,
      });

      // Unlock TP and N. Karakter input cells, and apply Conditional Formatting
      for(let r = 13; r < totalRows; r++) {
         const excelRow = r + 1;
         babList.forEach(bab => {
            const start = babColStart[bab];
            const komp = babKomponenMap[bab] || [];
            komp.forEach((k, ki) => {
               const cell = ws.getRow(excelRow).getCell(start + ki + 1);
               cell.protection = { locked: false };
               
               // Conditional Formatting for TP cells
               ws.addConditionalFormatting({
                  ref: cell.address,
                  rules: [
                     {
                        type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}<${kkm})`],
                        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                     },
                     {
                        type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}>=${kkm})`],
                        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                     }
                  ]
               });
            });
            
            // Conditional formatting for Rata-rata BAB
            const rataCell = ws.getRow(excelRow).getCell(start + komp.length + 1);
            ws.addConditionalFormatting({
               ref: rataCell.address,
               rules: [
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}<${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                  },
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}>=${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                  }
               ]
            });
         });
         
         // Conditional formatting for Nilai Akhir
         const nilaiAkhirColCell = ws.getRow(excelRow).getCell(nilaiAkhirCol + 1);
         [nilaiAkhirColCell].forEach(cell => {
            ws.addConditionalFormatting({
               ref: cell.address,
               rules: [
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}<${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                  },
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}>=${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                  }
               ]
            });
         });
      }

      
  }

  const handleDownloadExcel = async () => {
    try {
      if (selectedExportClasses.length === 0) return;
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan data...')
      
      const sem = semesters.find(s => s.id === selectedSemesterId)
      const mapelNama = uniqueMapels.find(m => m.id === selectedMapelId)?.nama || 'Mapel'
      const sekolah = 'SMP BUDI MULIA'
      const tahunAjaran = activeTa?.nama || ''
      
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook();
      wb.creator = session?.user?.user_metadata?.full_name || session?.nama || 'Guru';
      wb.created = new Date();

      for (let i = 0; i < selectedExportClasses.length; i++) {
        const kelas = selectedExportClasses[i];
        setExportProgressText(`Mengekspor ${mapelNama} - Kelas ${kelas} (${i + 1}/${selectedExportClasses.length})...`)
        // Fetch specific class data
        const { data: studentsData } = await supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('kelas', kelas).eq('tahun_ajaran_id', activeTa.id).order('nama_lengkap', { ascending: true })
        const classStudents = studentsData || []
        
        let classKomp = komponen.filter(k => 
          k.semester_id === selectedSemesterId && 
          (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.includes(kelas))
        )
        // If not found in current teacher components, fetch from database for this mapel & class
        if (classKomp.length === 0) {
          let dbKompQuery = supabase.from('nilai_komponen')
            .select('*')
            .eq('semester_id', selectedSemesterId)
            .eq('mata_pelajaran_id', selectedMapelId)
          if (activeTa?.id) dbKompQuery = dbKompQuery.eq('tahun_ajaran_id', activeTa.id)
          const { data: dbKomp } = await dbKompQuery.order('urutan')
          if (dbKomp) {
            classKomp = dbKomp.filter(k => 
              (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.includes(kelas))
            )
          }
        }
        
        let classNilaiData = {}
        const kompIds = classKomp.map(k => k.id)
        const nisnList = classStudents.map(s => String(s.nisn))
        if (kompIds.length > 0 && nisnList.length > 0) {
           const { data: nData } = await supabase.from('nilai_siswa').select('*').in('komponen_id', kompIds).in('siswa_nisn', nisnList)
           if (nData) {
              nData.forEach(n => {
                 if (!classNilaiData[n.komponen_id]) classNilaiData[n.komponen_id] = {}
                 classNilaiData[n.komponen_id][n.siswa_nisn] = n.nilai
              })
           }
        }
        
        // Fetch config akhir specific to this class (master method Kurikulum automatically applies)
        let classConfigAkhir = { 
          metode_hitung: configAkhir.metode_hitung || 'rata_rata', 
          bobot_detail: {}, 
          include_karakter: configAkhir.include_karakter ?? false,
          is_visible: false 
        };
        let cfgQuery = supabase.from('nilai_akhir_config')
          .select('*')
          .eq('semester_id', selectedSemesterId)
          .eq('mata_pelajaran_id', selectedMapelId)
          .eq('kelas', kelas)
        if (activeTa?.id) cfgQuery = cfgQuery.eq('tahun_ajaran_id', activeTa.id)
        const { data: configData } = await cfgQuery.maybeSingle();
        if (configData) {
           classConfigAkhir = { 
             metode_hitung: configData.metode_hitung || configAkhir.metode_hitung || 'rata_rata', 
             bobot_detail: configData.bobot_detail || {}, 
             include_karakter: configData.bobot_detail?.include_karakter ?? configAkhir.include_karakter ?? false,
             is_visible: configData.is_visible ?? false 
           };
        }
        
        await generateClassSheet(kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb, mapelNama, `Nilai ${kelas} Sem${sem?.nomor || '-'}`);
      }

      const buffer = await wb.xlsx.writeBuffer()
      const clsName = selectedExportClasses.length > 1 ? 'MultiKelas' : selectedExportClasses[0];
      const filename = `Nilai_${mapelNama.replace(/[\\/*?[\]:]/g, '_')}_${clsName}_Sem${sem?.nomor || '-'}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error export excel:', err);
      alert('Gagal mengekspor data: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Export Seluruh Mapel (Multi-Mapel & Multi-Kelas) ──────────────────────
  const handleDownloadAllMapelsExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan data semua mapel...')

      const sem = semesters.find(s => s.id === selectedSemesterId)
      const tahunAjaran = activeTa?.nama || ''

      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = session?.user?.user_metadata?.full_name || session?.nama || 'Guru'
      wb.created = new Date()

      // Fetch all components for all teacher's subjects in this TA & semester
      const { data: allTeacherKomponen } = await supabase.from('nilai_komponen')
        .select('*')
        .eq('guru_id', session.id)
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester_id', selectedSemesterId)
        .order('urutan')

      const allKomp = allTeacherKomponen || []

      let totalSheetsCreated = 0
      for (let mIdx = 0; mIdx < uniqueMapels.length; mIdx++) {
        const mapel = uniqueMapels[mIdx]
        const classesForThisMapel = [...new Set(
          mapelRaw.filter(m => m.mata_pelajaran_id === mapel.id).map(m => m.kelas)
        )].filter(Boolean).sort()

        for (let cIdx = 0; cIdx < classesForThisMapel.length; cIdx++) {
          const kelas = classesForThisMapel[cIdx]
          setExportProgressText(`Mengekspor ${mapel.nama} - Kelas ${kelas} (${mIdx + 1}/${uniqueMapels.length})...`)

          // Fetch students
          const { data: studentsData } = await supabase.from('siswa_lengkap')
            .select('nisn, nama_lengkap, kelas')
            .eq('kelas', kelas)
            .eq('tahun_ajaran_id', activeTa.id)
            .order('nama_lengkap', { ascending: true })
          const classStudents = studentsData || []

          // Filter komponen for this mapel & kelas
          const classKomp = allKomp.filter(k => 
            k.mata_pelajaran_id === mapel.id &&
            (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.includes(kelas))
          )

          let classNilaiData = {}
          const kompIds = classKomp.map(k => k.id)
          const nisnList = classStudents.map(s => String(s.nisn))
          if (kompIds.length > 0 && nisnList.length > 0) {
            const { data: nData } = await supabase.from('nilai_siswa')
              .select('*')
              .in('komponen_id', kompIds)
              .in('siswa_nisn', nisnList)
            if (nData) {
              nData.forEach(n => {
                if (!classNilaiData[n.komponen_id]) classNilaiData[n.komponen_id] = {}
                classNilaiData[n.komponen_id][n.siswa_nisn] = n.nilai
              })
            }
          }

          // Fetch config akhir (master method Kurikulum automatically applies)
          let classConfigAkhir = { 
            metode_hitung: configAkhir.metode_hitung || 'rata_rata', 
            bobot_detail: {}, 
            include_karakter: configAkhir.include_karakter ?? false,
            is_visible: false 
          }
          const { data: configData } = await supabase.from('nilai_akhir_config')
            .select('*')
            .eq('guru_id', session.id)
            .eq('tahun_ajaran_id', activeTa.id)
            .eq('semester_id', selectedSemesterId)
            .eq('mata_pelajaran_id', mapel.id)
            .eq('kelas', kelas)
            .maybeSingle()
          if (configData) {
            classConfigAkhir = { 
              metode_hitung: configData.metode_hitung || configAkhir.metode_hitung || 'rata_rata', 
              bobot_detail: configData.bobot_detail || {}, 
              include_karakter: configData.bobot_detail?.include_karakter ?? configAkhir.include_karakter ?? false,
              is_visible: configData.is_visible ?? false 
            }
          }

          const shortMapel = mapel.nama.length > 15 ? mapel.nama.slice(0, 14) : mapel.nama
          const sheetName = `${shortMapel} - ${kelas}`
          await generateClassSheet(kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb, mapel.nama, sheetName)
          totalSheetsCreated++
        }
      }

      if (totalSheetsCreated === 0) {
        alert('Tidak ada data nilai atau kelas yang dapat diexport.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      const buffer = await wb.xlsx.writeBuffer()
      const filename = `Nilai_Semua_Mapel_SMP_Budi_Mulia_${tahunAjaran.replace(/\//g, '-')}_Sem${sem?.nomor || '-'}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error downloading all mapels excel:', err)
      alert('Gagal mengekspor data seluruh mapel: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Export Master Leger Seluruh Mapel Sekolah + Seluruh Kelas (1 File Excel) ─────
  const handleDownloadMasterLegerSchoolExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan data seluruh mapel sekolah...')

      const sem = semesters.find(s => s.id === selectedSemesterId)
      const taId = activeTa?.id
      const tahunAjaran = activeTa?.nama || ''
      const sekolah = 'SMP BUDI MULIA'

      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = session?.user?.user_metadata?.full_name || session?.nama || 'SMP Budi Mulia'
      wb.created = new Date()

      // 1. Fetch All Mata Pelajaran
      const { data: rawMapels } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
      const allSchoolMapels = rawMapels || []
      if (allSchoolMapels.length === 0) {
        alert('Data mata pelajaran tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // 2. Fetch All Students in Active TA
      let stdQuery = supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas')
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      const { data: rawStudents } = await stdQuery.order('nama_lengkap', { ascending: true })
      const allStudents = rawStudents || []
      if (allStudents.length === 0) {
        alert('Data siswa tidak ditemukan untuk tahun ajaran ini.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // Extract unique classes sorted naturally
      const allClassesList = [...new Set(allStudents.map(s => (s.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
        if (numA !== numB) return numA - numB
        return a.localeCompare(b)
      })

      // 3. Fetch All Components for Active TA & Semester
      let kompQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
      const { data: rawKomponen } = await kompQuery.order('urutan', { ascending: true })
      const allKomponen = rawKomponen || []

      // 4. Fetch All Nilai Siswa for these components
      const kompIds = allKomponen.map(k => k.id)
      let allNilaiData = {} // { [komponen_id]: { [nisn]: nilai } }
      if (kompIds.length > 0) {
        const chunkSize = 400
        for (let i = 0; i < kompIds.length; i += chunkSize) {
          const chunk = kompIds.slice(i, i + chunkSize)
          const { data: nData } = await supabase.from('nilai_siswa')
            .select('komponen_id, siswa_nisn, nilai')
            .in('komponen_id', chunk)
          if (nData) {
            nData.forEach(n => {
              if (!allNilaiData[n.komponen_id]) allNilaiData[n.komponen_id] = {}
              allNilaiData[n.komponen_id][String(n.siswa_nisn)] = n.nilai
            })
          }
        }
      }

      // 5. Fetch Config Akhir
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
      const { data: rawConfigs } = await cfgQuery
      const configMap = {}
      ;(rawConfigs || []).forEach(c => {
        configMap[`${c.mata_pelajaran_id}_${c.kelas}`] = c
      })

      // Helper to calculate student's final score in a subject
      const calcStudentSubjectScore = (studentNisn, kelas, mapelId) => {
        const curClass = String(kelas).trim().toUpperCase()
        const mKomps = allKomponen.filter(k => {
          if (k.mata_pelajaran_id !== mapelId) return false
          if (!k.target_kelas || k.target_kelas.length === 0) {
            if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
            return true
          }
          if (Array.isArray(k.target_kelas)) {
            return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
          }
          return true
        })

        if (mKomps.length === 0) return null

        const babs = [...new Set(mKomps.map(k => k.bab_nama || 'Lainnya'))]
        const cfg = configMap[`${mapelId}_${kelas}`] || { metode_hitung: 'rata_rata', bobot_detail: {} }

        const hitungRataBAB = (bab) => {
          const bKomps = mKomps.filter(k => (k.bab_nama || 'Lainnya') === bab && !isKarakterKomponen(k.nama))
          if (bKomps.length === 0) return null
          const metode = bKomps[0]?.metode_hitung || 'rata_rata'
          let totalBobot = 0, totalNilai = 0, hasVal = false
          bKomps.forEach(k => {
            const val = allNilaiData[k.id]?.[String(studentNisn)]
            if (val !== undefined && val !== null && val !== '') {
              const num = Number(val)
              if (metode === 'bobot_manual') {
                totalNilai += num * (k.bobot || 1)
                totalBobot += (k.bobot || 1)
              } else {
                totalNilai += num
                totalBobot += 1
              }
              hasVal = true
            }
          })
          if (!hasVal || totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        }

        if (cfg.metode_hitung === 'bobot_manual') {
          let totalNilai = 0, totalBobot = 0
          babs.forEach(bab => {
            const rBab = hitungRataBAB(bab)
            if (rBab !== null) {
              const b = Number(cfg.bobot_detail?.[bab] || 0)
              totalNilai += rBab * b
              totalBobot += b
            }
          })
          if (totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        } else {
          const vals = babs.map(b => hitungRataBAB(b)).filter(v => v !== null)
          if (vals.length === 0) return null
          return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        }
      }

      const BORDER_THIN = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'CBD5E1' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      }
      const BORDER_DOUBLE_BOTTOM = {
        top: { style: 'thin', color: { argb: 'CBD5E1' } },
        bottom: { style: 'double', color: { argb: '334155' } },
        left: { style: 'thin', color: { argb: 'CBD5E1' } },
        right: { style: 'thin', color: { argb: 'CBD5E1' } }
      }

      const getColLetter = (colNum) => {
        let letter = ''
        let n = colNum
        while (n > 0) {
          const m = (n - 1) % 26
          letter = String.fromCharCode(65 + m) + letter
          n = Math.floor((n - 1) / 26)
        }
        return letter
      }

      // Add Rekapitulasi Sekolah summary sheet first if more than 1 class
      const wsSummary = allClassesList.length > 1 ? wb.addWorksheet('Rekapitulasi Sekolah', {
        views: [{ showGridLines: true }]
      }) : null
      const schoolClassSummaries = []

      // 6. Generate a Leger Sheet for EACH class
      for (let cIdx = 0; cIdx < allClassesList.length; cIdx++) {
        const kelas = allClassesList[cIdx]
        setExportProgressText(`Menghitung Leger Kelas ${kelas} (${cIdx + 1}/${allClassesList.length})...`)

        const classStudents = allStudents.filter(s => s.kelas === kelas)
        if (classStudents.length === 0) continue

        const ws = wb.addWorksheet(`Leger ${kelas}`.substring(0, 31), {
          views: [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: true }]
        })

        const headers = ['No', 'NISN', 'Nama Siswa', ...allSchoolMapels.map(m => m.singkatan || m.nama), 'Total Nilai', 'Rata-rata', 'Peringkat']
        const lastColLetter = getColLetter(headers.length)

        // Title Header
        ws.mergeCells(`A1:${lastColLetter}1`)
        const titleCell = ws.getCell('A1')
        titleCell.value = 'LEGER NILAI HASIL BELAJAR PESERTA DIDIK'
        titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '1E293B' } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

        ws.mergeCells(`A2:${lastColLetter}2`)
        const subTitleCell = ws.getCell('A2')
        subTitleCell.value = `${sekolah} | KELAS: ${kelas} | SEMESTER: ${sem?.nomor || '-'} | TAHUN AJARAN: ${tahunAjaran}`
        subTitleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '64748B' } }
        subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }

        // Table Header Row 5
        const headerRow = ws.getRow(5)
        headerRow.values = headers
        headerRow.height = 28

        headerRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFF' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: colNum > allSchoolMapels.length + 3 ? '0F172A' : colNum <= 3 ? '334155' : '4338CA' }
          }
          cell.border = BORDER_THIN
        })

        // Compute scores for all students in this class
        const studentRowsData = classStudents.map(s => {
          let totalScore = 0
          let scoredCount = 0
          const mapelScores = allSchoolMapels.map(m => {
            const score = calcStudentSubjectScore(s.nisn, kelas, m.id)
            if (score !== null && !isNaN(score)) {
              totalScore += score
              scoredCount++
              return score
            }
            return null
          })

          const avgScore = scoredCount > 0 ? +(totalScore / scoredCount).toFixed(1) : null

          return {
            nisn: s.nisn,
            nama: s.nama_lengkap,
            mapelScores,
            totalScore: scoredCount > 0 ? +(totalScore).toFixed(1) : null,
            avgScore
          }
        })

        // Assign rankings based on avgScore
        const sortedScores = [...studentRowsData]
          .filter(s => s.avgScore !== null)
          .map(s => s.avgScore)
          .sort((a, b) => b - a)

        studentRowsData.forEach(s => {
          if (s.avgScore !== null) {
            s.rank = sortedScores.indexOf(s.avgScore) + 1
          } else {
            s.rank = '-'
          }
        })

        // Write student rows
        studentRowsData.forEach((sData, sIdx) => {
          const row = ws.getRow(6 + sIdx)
          row.height = 20
          const isEven = sIdx % 2 === 1

          const rowValues = [
            sIdx + 1,
            sData.nisn,
            sData.nama,
            ...sData.mapelScores.map(v => v !== null ? v : '-'),
            sData.totalScore !== null ? sData.totalScore : '-',
            sData.avgScore !== null ? sData.avgScore : '-',
            sData.rank
          ]
          row.values = rowValues

          row.eachCell((cell, colNum) => {
            cell.font = { name: 'Arial', size: 9, bold: colNum >= headers.length - 2 }
            cell.alignment = {
              horizontal: colNum === 3 ? 'left' : 'center',
              vertical: 'middle'
            }
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: isEven ? 'F8FAFC' : 'FFFFFF' }
            }
            cell.border = BORDER_THIN

            if (colNum > 3 && colNum <= 3 + allSchoolMapels.length) {
              const val = cell.value
              if (typeof val === 'number') {
                if (val < kkm) {
                  cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'DC2626' } }
                } else if (val >= 90) {
                  cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '059669' } }
                }
              }
            }
          })
        })

        // Summary Row: Rata-rata Kelas
        const summaryRowIdx = 6 + studentRowsData.length
        const sumRow = ws.getRow(summaryRowIdx)
        sumRow.height = 22
        const classAvgValues = ['Rata-rata Kelas', '', '']
        allSchoolMapels.forEach((_, mIdx) => {
          const vals = studentRowsData.map(s => s.mapelScores[mIdx]).filter(v => v !== null)
          if (vals.length > 0) {
            classAvgValues.push(+(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
          } else {
            classAvgValues.push('-')
          }
        })
        const totalAvgs = studentRowsData.map(s => s.totalScore).filter(v => v !== null)
        classAvgValues.push(totalAvgs.length > 0 ? +(totalAvgs.reduce((a, b) => a + b, 0) / totalAvgs.length).toFixed(1) : '-')
        const generalAvgs = studentRowsData.map(s => s.avgScore).filter(v => v !== null)
        const classAvgValue = generalAvgs.length > 0 ? +(generalAvgs.reduce((a, b) => a + b, 0) / generalAvgs.length).toFixed(1) : null
        classAvgValues.push(classAvgValue !== null ? classAvgValue : '-')
        classAvgValues.push('')

        sumRow.values = classAvgValues
        ws.mergeCells(`A${summaryRowIdx}`, `C${summaryRowIdx}`)

        sumRow.eachCell((cell, colNum) => {
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '1E293B' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } }
          cell.border = BORDER_DOUBLE_BOTTOM
        })

        // Column widths
        ws.getColumn(1).width = 5
        ws.getColumn(2).width = 15
        ws.getColumn(3).width = 30
        for (let c = 4; c <= 3 + allSchoolMapels.length; c++) {
          ws.getColumn(c).width = 13
        }
        ws.getColumn(4 + allSchoolMapels.length).width = 13
        ws.getColumn(5 + allSchoolMapels.length).width = 13
        ws.getColumn(6 + allSchoolMapels.length).width = 11

        schoolClassSummaries.push({
          kelas,
          studentCount: classStudents.length,
          highestScore: sortedScores.length > 0 ? sortedScores[0] : null,
          lowestScore: sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : null,
          classAvg: classAvgValue,
          rank1Student: studentRowsData.find(s => s.rank === 1)?.nama || '-'
        })
      }

      // Populate Rekapitulasi Sekolah if it exists
      if (wsSummary && schoolClassSummaries.length > 0) {
        wsSummary.mergeCells('A1:G1')
        const tCell = wsSummary.getCell('A1')
        tCell.value = 'REKAPITULASI LEGER NILAI SELURUH KELAS'
        tCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: '1E293B' } }
        tCell.alignment = { horizontal: 'center', vertical: 'middle' }

        wsSummary.mergeCells('A2:G2')
        const stCell = wsSummary.getCell('A2')
        stCell.value = `${sekolah} | SEMESTER: ${sem?.nomor || '-'} | TAHUN AJARAN: ${tahunAjaran}`
        stCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '64748B' } }
        stCell.alignment = { horizontal: 'center', vertical: 'middle' }

        const sHeaders = ['No', 'Kelas', 'Jumlah Siswa', 'Rata-rata Kelas', 'Nilai Tertinggi', 'Nilai Terendah', 'Siswa Peringkat 1']
        const sHeaderRow = wsSummary.getRow(4)
        sHeaderRow.values = sHeaders
        sHeaderRow.height = 26
        sHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }
          cell.border = BORDER_THIN
        })

        schoolClassSummaries.forEach((cs, idx) => {
          const sRow = wsSummary.getRow(5 + idx)
          sRow.height = 22
          sRow.values = [
            idx + 1,
            `Kelas ${cs.kelas}`,
            cs.studentCount,
            cs.classAvg !== null ? cs.classAvg : '-',
            cs.highestScore !== null ? cs.highestScore : '-',
            cs.lowestScore !== null ? cs.lowestScore : '-',
            cs.rank1Student
          ]
          sRow.eachCell((cell, col) => {
            cell.font = { name: 'Arial', size: 9, bold: col === 2 || col === 4 }
            cell.alignment = { horizontal: col === 7 ? 'left' : 'center', vertical: 'middle' }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF' } }
            cell.border = BORDER_THIN
          })
        })

        wsSummary.getColumn(1).width = 6
        wsSummary.getColumn(2).width = 15
        wsSummary.getColumn(3).width = 16
        wsSummary.getColumn(4).width = 18
        wsSummary.getColumn(5).width = 18
        wsSummary.getColumn(6).width = 18
        wsSummary.getColumn(7).width = 32
      }

      // Download workbook
      const buffer = await wb.xlsx.writeBuffer()
      const filename = `Master_Leger_Nilai_Seluruh_Mapel_dan_Kelas_Sem${sem?.nomor || '-'}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error generating master leger excel:', err)
      alert('Gagal mengekspor Master Leger: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Export Detail Seluruh Mapel Sekolah & Kelas (Multi-Sheet BAB, PSTS, PSAS) ───
  const handleDownloadAllSchoolDetailExcel = async () => {
    try {
      setIsExporting(true)
      setShowExportModal(false)
      setExportProgressText('Mempersiapkan detail seluruh mapel sekolah...')

      const sem = semesters.find(s => s.id === selectedSemesterId)
      const taId = activeTa?.id

      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = session?.user?.user_metadata?.full_name || session?.nama || 'SMP Budi Mulia'
      wb.created = new Date()

      // 1. Fetch All Mapel
      const { data: rawMapels } = await supabase.from('mata_pelajaran').select('id, nama, singkatan').order('nama')
      const allSchoolMapels = rawMapels || []
      if (allSchoolMapels.length === 0) {
        alert('Data mata pelajaran tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // 2. Fetch All Students in Active TA
      let stdQuery = supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas')
      if (taId) stdQuery = stdQuery.eq('tahun_ajaran_id', taId)
      const { data: rawStudents } = await stdQuery.order('nama_lengkap', { ascending: true })
      const allStudents = rawStudents || []
      if (allStudents.length === 0) {
        alert('Data siswa tidak ditemukan.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      // Unique classes
      const allClassesList = [...new Set(allStudents.map(s => (s.kelas || '').trim()).filter(Boolean))].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.replace(/\D/g, '') || '0', 10)
        if (numA !== numB) return numA - numB
        return a.localeCompare(b)
      })

      // 3. Fetch All Components for Active TA & Semester
      let kompQuery = supabase.from('nilai_komponen')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) kompQuery = kompQuery.eq('tahun_ajaran_id', taId)
      const { data: rawKomponen } = await kompQuery.order('urutan', { ascending: true })
      const allKomponen = rawKomponen || []

      // 4. Fetch All Nilai Siswa
      const kompIds = allKomponen.map(k => k.id)
      let allNilaiData = {}
      if (kompIds.length > 0) {
        const chunkSize = 400
        for (let i = 0; i < kompIds.length; i += chunkSize) {
          const chunk = kompIds.slice(i, i + chunkSize)
          const { data: nData } = await supabase.from('nilai_siswa')
            .select('komponen_id, siswa_nisn, nilai')
            .in('komponen_id', chunk)
          if (nData) {
            nData.forEach(n => {
              if (!allNilaiData[n.komponen_id]) allNilaiData[n.komponen_id] = {}
              allNilaiData[n.komponen_id][String(n.siswa_nisn)] = n.nilai
            })
          }
        }
      }

      // 5. Fetch Config Akhir
      let cfgQuery = supabase.from('nilai_akhir_config')
        .select('*')
        .eq('semester_id', selectedSemesterId)
      if (taId) cfgQuery = cfgQuery.eq('tahun_ajaran_id', taId)
      const { data: rawConfigs } = await cfgQuery
      const configMap = {}
      ;(rawConfigs || []).forEach(c => {
        configMap[`${c.mata_pelajaran_id}_${c.kelas}`] = c
      })

      let totalSheets = 0
      for (let mIdx = 0; mIdx < allSchoolMapels.length; mIdx++) {
        const mapel = allSchoolMapels[mIdx]
        for (let cIdx = 0; cIdx < allClassesList.length; cIdx++) {
          const kelas = allClassesList[cIdx]
          const classStudents = allStudents.filter(s => s.kelas === kelas)
          if (classStudents.length === 0) continue

          const curClass = String(kelas).trim().toUpperCase()
          const classKomp = allKomponen.filter(k => {
            if (k.mata_pelajaran_id !== mapel.id) return false
            if (!k.target_kelas || k.target_kelas.length === 0) {
              if (k.kelas) return String(k.kelas).trim().toUpperCase() === curClass
              return true
            }
            if (Array.isArray(k.target_kelas)) {
              return k.target_kelas.some(c => String(c || '').trim().toUpperCase() === curClass)
            }
            return true
          })
          if (classKomp.length === 0) continue

          setExportProgressText(`Mengekspor ${mapel.singkatan || mapel.nama} - Kelas ${kelas}...`)

          const cfg = configMap[`${mapel.id}_${kelas}`]
          const classConfigAkhir = {
            metode_hitung: cfg?.metode_hitung || configAkhir.metode_hitung || 'rata_rata',
            bobot_detail: cfg?.bobot_detail || {},
            include_karakter: cfg?.bobot_detail?.include_karakter ?? configAkhir.include_karakter ?? false,
            is_visible: cfg?.is_visible ?? false
          }
          const shortMapel = mapel.singkatan || (mapel.nama.length > 15 ? mapel.nama.slice(0, 14) : mapel.nama)
          const sheetName = `${shortMapel} - ${kelas}`.substring(0, 31)

          await generateClassSheet(kelas, classStudents, classKomp, allNilaiData, classConfigAkhir, wb, mapel.nama, sheetName)
          totalSheets++
        }
      }

      if (totalSheets === 0) {
        alert('Tidak ada komponen penilaian yang ditemukan untuk kelas manapun.')
        setIsExporting(false)
        setExportProgressText('')
        return
      }

      const buffer = await wb.xlsx.writeBuffer()
      const filename = `Detail_Nilai_Seluruh_Mapel_dan_Kelas_Sem${sem?.nomor || '-'}.xlsx`
      await downloadFile(buffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      setIsExporting(false)
      setExportProgressText('')
    } catch (err) {
      console.error('Error downloading all school detail excel:', err)
      alert('Gagal mengekspor detail seluruh mapel: ' + (err.message || 'Terjadi kesalahan'))
      setIsExporting(false)
      setExportProgressText('')
    }
  }

  // ─── Import Excel ─────────────────────────────────────────────────────────
  const handleUploadExcel = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploadResult(null); setUploadProgress({ status: 'reading' })
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      
      let success = 0, failed = 0, skipped = 0, ignoredBlanks = 0
      const upserts = []

      // If it's a single sheet (old format) or the sheet name doesn't match our classes, we process it against activeTabKelas.
      // We will loop through all sheets.
      for (const sheetName of wb.SheetNames) {
          let kelas = activeTabKelas;
          // Try to guess class from sheetName (e.g. "Nilai 8A Sem1")
          const matchedClass = activeTargetKelas.find(c => sheetName.includes(c));
          if (matchedClass) {
              kelas = matchedClass;
          }
          
          const ws = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!raw || raw.length < 2) continue;

          let headerIdx = -1;
          for (let i = 0; i < raw.length; i++) {
            const row = raw[i];
            if (row && row.some(cell => String(cell).trim().toUpperCase() === 'NISN')) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx === -1) continue;

          let tpRowIdx = headerIdx;
          let maxMatchCount = 0;
          
          // Use sheet specific components
          const sheetKomp = komponen.filter(k => k.semester_id === selectedSemesterId && (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.some(c => kelas && c.replace(/\D/g, '') === kelas.replace(/\D/g, ''))));

          for (let i = headerIdx; i <= Math.min(headerIdx + 5, raw.length - 1); i++) {
            const row = raw[i];
            if (!row) continue;
            let matchCount = 0;
            sheetKomp.forEach(k => {
              if (row.some(cell => String(cell).trim() === k.nama)) matchCount++;
            });
            if (matchCount > maxMatchCount) {
              maxMatchCount = matchCount;
              tpRowIdx = i;
            }
          }
          
          const tpRow = raw[tpRowIdx].map(h => String(h).trim())
          const nisnIdx = raw[headerIdx].findIndex(h => String(h).trim().toUpperCase() === 'NISN')
          
          let actualDataStart = tpRowIdx + 1;
          for(let i = tpRowIdx + 1; i < raw.length; i++) {
              if (raw[i] && String(raw[i][nisnIdx]).trim() !== '' && !isNaN(Number(raw[i][0]))) {
                  actualDataStart = i;
                  break;
              }
          }

          const babRowIdx = tpRowIdx - 1;
          const babRow = babRowIdx >= 0 ? raw[babRowIdx].map(h => String(h).trim()) : [];
          const komponenCols = [];
          let currentBab = null;
          for (let c = 0; c < tpRow.length; c++) {
             const babVal = babRow[c];
             if (babVal && babVal !== '') {
                const matchedBab = sheetKomp.find(k => babVal.includes(k.bab_nama));
                if (matchedBab) currentBab = matchedBab.bab_nama;
             }
             const tpName = tpRow[c];
             if (tpName && currentBab) {
                const k = sheetKomp.find(x => x.bab_nama === currentBab && x.nama === tpName);
                if (k) {
                   komponenCols.push({ colIdx: c, komponen: k });
                }
             }
          }

          if (komponenCols.length === 0) continue;

          // Fetch students for this sheet's class
          const { data: sheetStudentsData } = await supabase.from('siswa_lengkap').select('nisn').eq('kelas', kelas).eq('tahun_ajaran_id', activeTa.id);
          const sheetStudents = sheetStudentsData || [];
          const sMap = Object.fromEntries(sheetStudents.map(s => [String(s.nisn).trim(), true]));
          
          const nisnKeys = Object.keys(sMap);
          const kompIds = sheetKomp.map(k => k.id);
          
          let existingDataMap = {};
          if (nisnKeys.length > 0 && kompIds.length > 0) {
             const { data: existingData } = await supabase.from('nilai_siswa').select('komponen_id, siswa_nisn, nilai').in('komponen_id', kompIds).in('siswa_nisn', nisnKeys);
             if (existingData) {
                existingData.forEach(ed => {
                   existingDataMap[`${ed.komponen_id}_${ed.siswa_nisn}`] = ed.nilai;
                });
             }
          }

          for (let i = actualDataStart; i < raw.length; i++) {
            const row = raw[i]; const nisn = String(row[nisnIdx]||'').trim()
            if (!nisn) continue
            if (!sMap[nisn]) { skipped++; continue }
            komponenCols.forEach(({ komponen: k, colIdx }) => {
              const rawVal = row[colIdx]; const val = rawVal === '' ? null : Number(rawVal)
              if (rawVal !== '' && isNaN(val)) { failed++; return }
              
              const key = `${k.id}_${nisn}`;
              const existingVal = existingDataMap[key] !== undefined ? existingDataMap[key] : null;

              // Smart Skip: Jika di Excel selnya kosong (val === null) tapi di sistem sudah ada nilai lama (existingVal !== null),
              // jangan timpa nilai lama! Abaikan sel kosong ini demi menjaga nilai yang sudah ada.
              if (val === null && existingVal !== null) {
                ignoredBlanks++;
                return;
              }
              
              // Only push if the value has actually changed
              if (val !== existingVal) {
                 upserts.push({ komponen_id: k.id, siswa_nisn: nisn, nilai: val, diinput_oleh: session.id, updated_at: new Date().toISOString() })
              }
            })
          }
      }


      // Deduplicate upserts to prevent PostgreSQL 500 error on ON CONFLICT DO UPDATE
      const uniqueUpsertsMap = {};
      for (const u of upserts) {
          uniqueUpsertsMap[`${u.komponen_id}_${u.siswa_nisn}`] = u;
      }
      const finalUpserts = Object.values(uniqueUpsertsMap);

      if (finalUpserts.length === 0 && failed === 0 && skipped > 0 && false) { 
          // Kept false just in case skipped logic causes weirdness, but we handle it generally below
      } 
      
      if (finalUpserts.length === 0) {
          if (ignoredBlanks > 0) {
            setUploadResult({ success: 0, filled: 0, failed, skipped, ignoredBlanks, message: `Tidak ada nilai baru. Sebanyak ${ignoredBlanks} sel kosong diabaikan sehingga nilai lama di sistem tetap aman.` });
          } else {
            setUploadResult({ error: 'Data sama persis dengan sistem. Tidak ada perubahan baru yang perlu disimpan.' });
          }
          setUploadProgress(null);
          return;
      }

      setUploadProgress({ status: 'saving', total: finalUpserts.length })
      let useBulkRpc = Boolean(session?.akun_id && session?.id)
      if (useBulkRpc) {
        try {
          const payload = finalUpserts.map(u => ({
            komponen_id: u.komponen_id,
            siswa_nisn: String(u.siswa_nisn).trim(),
            nilai: (u.nilai === null || u.nilai === undefined || u.nilai === '') ? null : Number(u.nilai),
            catatan: u.catatan || null
          }))
          const { data: bRes, error: bErr } = await supabase.rpc('fn_bulk_simpan_nilai_guru', {
            p_akun_id: session.akun_id,
            p_guru_id: session.id,
            p_items: payload
          })
          if (bErr && (bErr.code === 'PGRST202' || bErr.message?.includes('function'))) {
            useBulkRpc = false
          } else if (bErr) {
            throw bErr
          } else if (bRes && !bRes.ok) {
            throw new Error(bRes.msg || 'Gagal menyimpan nilai secara massal')
          }
        } catch (e) {
          if (e.message?.includes('function') || e.code === 'PGRST202') {
            useBulkRpc = false
          } else {
            throw e
          }
        }
      }

      if (!useBulkRpc) {
        for (let i = 0; i < finalUpserts.length; i += 100) {
          const chunk = finalUpserts.slice(i, i + 100)
          const { error } = await supabase.from('nilai_siswa').upsert(chunk, { onConflict: 'komponen_id,siswa_nisn' })
          if (error) throw error
          setUploadProgress(p => ({ ...p, current: Math.min(i + 100, finalUpserts.length) }))
        }
      }

      const filledCount = finalUpserts.filter(u => u.nilai !== null).length;
      setUploadResult({ success: finalUpserts.length, filled: filledCount, failed, skipped, ignoredBlanks }); fetchNilai()
    } catch (err) { setUploadResult({ error: err.message }) }
    setUploadProgress(null)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const handleClearTP = async (e, k) => {
    e.stopPropagation();
    if (isPstsOrPsas(k.bab_nama || k.nama)) {
      alert('Nilai Sumatif dikontrol langsung oleh Kurikulum.');
      return;
    }
    const confirmed = await requestConfirm({
      title: `Kosongkan nilai ${k.nama}?`,
      message: `Apakah Anda yakin ingin menghapus SEMUA nilai siswa untuk ${k.nama} pada kelas ${activeTabKelas}? Aksi ini tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Kosongkan',
      confirmColor: 'red',
      icon: 'danger'
    });
    if (!confirmed) return;
    
    try {
      const nisnList = students.map(s => String(s.nisn).trim());
      if (nisnList.length === 0) return;
      let clearError = null;
      if (session?.akun_id && session?.id) {
        try {
          const { data: cRes, error: cErr } = await supabase.rpc('fn_hapus_nilai_komponen_guru', {
            p_akun_id: session.akun_id,
            p_guru_id: session.id,
            p_komponen_id: k.id,
            p_nisn_list: nisnList
          });
          if (!cErr && cRes?.ok) {
            clearError = null;
          } else if (cRes && !cRes.ok) {
            clearError = new Error(cRes.msg || 'Gagal mengosongkan nilai');
          } else if (cErr && !cErr.message?.includes('function') && cErr.code !== 'PGRST202') {
            clearError = cErr;
          }
        } catch (e) {
          if (!e.message?.includes('function') && e.code !== 'PGRST202') clearError = e;
        }
      }
      if (clearError === null && (!session?.akun_id || !session?.id)) {
        const { error } = await supabase.from('nilai_siswa').delete().eq('komponen_id', k.id).in('siswa_nisn', nisnList);
        clearError = error;
      }
      if (clearError) throw clearError;
      fetchNilai();
    } catch (err) {
      alert("Gagal mengosongkan nilai: " + err.message);
    }
  }

  const handleClearBab = async (e, babName) => {
    e.stopPropagation();
    if (isPstsOrPsas(babName)) {
      alert('BAB Sumatif dikontrol langsung oleh Kurikulum.');
      return;
    }
    const confirmed = await requestConfirm({
      title: `Kosongkan nilai Bab ${babName}?`,
      message: `Apakah Anda yakin ingin menghapus SEMUA nilai siswa untuk Bab ini pada kelas ${activeTabKelas}? Aksi ini tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Kosongkan',
      confirmColor: 'red',
      icon: 'danger'
    });
    if (!confirmed) return;

    try {
      const kompIds = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === babName).map(k => k.id);
      if (kompIds.length === 0) return;
      const nisnList = students.map(s => String(s.nisn).trim());
      if (nisnList.length === 0) return;

      let clearError = null;
      if (session?.akun_id && session?.id) {
        try {
          for (const kId of kompIds) {
            const { data: cRes, error: cErr } = await supabase.rpc('fn_hapus_nilai_komponen_guru', {
              p_akun_id: session.akun_id,
              p_guru_id: session.id,
              p_komponen_id: kId,
              p_nisn_list: nisnList
            });
            if (cErr && (cErr.code === 'PGRST202' || cErr.message?.includes('function'))) {
              clearError = 'fallback';
              break;
            } else if (cErr) {
              throw cErr;
            } else if (cRes && !cRes.ok) {
              throw new Error(cRes.msg || 'Gagal mengosongkan nilai');
            }
          }
        } catch (e) {
          if (e.message?.includes('function') || e.code === 'PGRST202') {
            clearError = 'fallback';
          } else {
            throw e;
          }
        }
      } else {
        clearError = 'fallback';
      }

      if (clearError === 'fallback') {
        const { error } = await supabase.from('nilai_siswa').delete().in('komponen_id', kompIds).in('siswa_nisn', nisnList);
        if (error) throw error;
      }
      fetchNilai();
    } catch (err) {
      alert("Gagal mengosongkan nilai BAB: " + err.message);
    }
  }

  const selectedMapelNama = uniqueMapels.find(m => m.id === selectedMapelId)?.nama || ''
  const selectedSemesterObj = semesters.find(s => s.id === selectedSemesterId)
  const contextReady = selectedMapelId && selectedSemesterId
  const hasKomponen = classKomponen.length > 0

  // ─── RENDER TABEL NILAI (RESPONSIF NORMAL & FULLSCREEN) ─────────────────────
  const renderTableContent = (isFullscreen = false) => {
    if (!selectedMapelId || !selectedSemesterId) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 p-4 text-center">
          <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
            <IconEye on={false} />
          </div>
          <h3 className="font-bold text-slate-700 text-lg">Pilih Mapel dan Semester</h3>
          <p className="text-slate-500 text-sm mt-1 mb-5">Anda perlu mengatur konteks terlebih dahulu.</p>
        </div>
      )
    }

    if (activeTargetKelas.length === 0) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 p-4 text-center">
          <div className="w-16 h-16 bg-indigo-50 border-2 border-indigo-200 rounded-full flex items-center justify-center mb-4 text-indigo-500 shadow-sm">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <h3 className="font-bold text-slate-800 text-xl mb-1">Mulai Kelola Nilai</h3>
          <p className="text-slate-500 text-sm max-w-md text-center mb-6">Pilih kelas yang Anda ajar untuk mata pelajaran ini, lalu buat BAB pertama.</p>
          <button onClick={() => setShowAddBab(true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2">
            <IconPlus /> Tentukan Target Kelas & Kelola Bab
          </button>
        </div>
      )
    }

    if (!activeTabKelas) {
      return <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 text-slate-400">Pilih Tab Kelas</div>
    }

    if (!hasKomponen) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 p-4 text-center">
          <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
            <IconPlus />
          </div>
          <h3 className="font-bold text-slate-700 text-lg">Belum ada materi bab di Kelas {activeTabKelas}</h3>
          <p className="text-slate-500 text-sm mt-1 mb-5">Silakan tambahkan bab untuk semester ini.</p>
          <button onClick={() => {
            setNewBabTargetKelas([activeTabKelas])
            setShowAddBab(true)
          }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 text-sm">
            Kelola Bab
          </button>
        </div>
      )
    }

    if (students.length === 0) {
      return <div className="absolute inset-0 flex items-center justify-center bg-white z-20 text-slate-400">Memuat siswa...</div>
    }

    return (
      <div 
        className="overflow-auto flex-1 custom-scrollbar touch-auto overscroll-contain select-none sm:select-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <table 
          className="w-full min-w-max text-xs whitespace-nowrap"
          style={{ zoom: `${tableZoom}%` }}
        >
          <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-xs uppercase tracking-wider font-extrabold">
              <th className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top" rowSpan={2} style={{ position: "sticky", top: 0, left: 0, zIndex: 20, minWidth: 36, maxWidth: 36, width: 36 }}>
                <div className="pt-2 sm:pt-3 flex items-start justify-center h-full text-[11px]">No</div>
              </th>
              <th className={`border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top mobile-nama-col shadow-[2px_0_5px_-1px_rgba(0,0,0,0.12)] ${showNisnMobile ? 'sm:shadow-none' : ''}`} rowSpan={2} style={{ position: "sticky", top: 0, left: 36, zIndex: 20, minWidth: maxNamaWidth, maxWidth: maxNamaWidth, width: maxNamaWidth }}>
                <div className="pt-2 sm:pt-3 px-2 flex items-start justify-center h-full text-[11px]">Nama Siswa</div>
              </th>
              <th className={`border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top mobile-unsticky sm:shadow-[2px_0_5px_-1px_rgba(0,0,0,0.12)] ${showNisnMobile ? 'table-cell' : 'hidden'}`} rowSpan={2} style={{ position: "sticky", top: 0, left: 36 + maxNamaWidth, zIndex: 20, minWidth: 85, maxWidth: 85, width: 85 }}>
                <div className="pt-2 sm:pt-3 flex items-start justify-center h-full text-[11px]">NISN</div>
              </th>
              {uniqueBabsClass.map((bab, bIdx) => {
                const babKomps = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab)
                const babCount = babKomps.length
                const isBabVisible = babKomps.some(k => k.is_nilai_visible)
                const isAllBabHidden = babKomps.length > 0 && babKomps.every(k => !k.is_nilai_visible)
                const cleanBabName = bab.replace(/^(?:lingkup\s*(?:materi)?\s*\d*\s*[:\-]\s*|bab\s*\d*\s*[:\-]\s*)/i, '').trim() || bab
                const isSumatif = isPstsOrPsas(bab)

                return (
                  <th key={bab} colSpan={babCount}
                    onClick={() => {
                      if (isSumatif) return
                      setEditBabName(bab)
                      setSelectedBabToManage(bab)
                    }}
                    className={`text-center px-2 py-1.5 border-r border-slate-200 transition-colors whitespace-normal break-words leading-snug align-middle ${
                      isSumatif ? 'cursor-default' : 'cursor-pointer'
                    } ${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]} ${BAB_HOVER[bIdx % BAB_HOVER.length]} ${isAllBabHidden ? 'opacity-50' : ''}`}
                    title={isSumatif ? 'Kolom Sumatif dikontrol oleh Kurikulum' : 'Klik untuk kelola BAB (Ubah nama, Metode Hitung, Tambah TP)'}>
                    <div className="flex items-center justify-center gap-1 text-center whitespace-normal break-words max-w-full mx-auto">
                      <span className="text-center">{cleanBabName}</span>
                      {isSumatif ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100/90 text-indigo-700 border border-indigo-200 shadow-2xs" title="Dikontrol oleh Kurikulum">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                          <span>Kurikulum</span>
                        </span>
                      ) : (
                        <>
                          <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleBabVisible(bab) }}
                            className={`p-0.5 rounded transition-colors shrink-0 ${isBabVisible ? 'opacity-70 hover:opacity-100' : 'opacity-40 hover:opacity-100'}`}
                            title={isAllBabHidden ? 'Tampilkan BAB ke siswa' : 'Sembunyikan BAB dari siswa'}
                          >
                            <IconEye on={isBabVisible} />
                          </button>
                          <button onClick={(e) => handleClearBab(e, bab)} className="p-0.5 text-slate-400 hover:text-rose-500 hover:bg-rose-100 rounded transition-colors shrink-0" title="Kosongkan semua nilai di Bab ini">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </th>
                )
              })}
              <th className={`px-3 py-2 min-w-[120px] bg-indigo-50 border-l border-indigo-200 text-center text-indigo-800 align-middle ${configAkhir.is_visible === false ? 'opacity-50' : ''}`} rowSpan={2}>
                <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                  <div className="flex items-center justify-center gap-1.5 w-full">
                    <div className="font-extrabold leading-snug">Nilai Akhir</div>
                    <button onClick={async (e) => { 
                       e.stopPropagation(); 
                       const willShow = configAkhir.is_visible === false ? true : false;
                       if (willShow) {
                         const confirmed = await requestConfirm({
                           title: 'Tampilkan Nilai Akhir ke Siswa?',
                           message: 'Nilai Akhir akan ditampilkan di akun siswa. Apakah Anda yakin?',
                           confirmLabel: 'Ya, Tampilkan',
                           confirmColor: 'indigo',
                           icon: 'info',
                         });
                         if (!confirmed) return;
                       }
                       handleSaveConfigAkhir({...configAkhir, is_visible: willShow}) 
                    }} className={`p-0.5 rounded transition-colors ${configAkhir.is_visible !== false ? 'text-indigo-400 hover:text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title={configAkhir.is_visible !== false ? 'Sembunyikan dari siswa' : 'Tampilkan ke siswa'}>
                      <IconEye on={configAkhir.is_visible !== false} />
                    </button>
                  </div>
                  <div 
                    onClick={() => setShowConfigAkhirModal(true)}
                    className="w-full bg-white/80 hover:bg-white border border-indigo-200 text-indigo-900 font-extrabold text-[9.5px] tracking-wider rounded-lg px-2 py-1.5 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all select-none"
                    title="Metode perhitungan nilai akhir terkunci dan ditetapkan oleh Kurikulum / Admin. Klik untuk melihat detail status."
                  >
                    <svg className="w-3 h-3 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span className="truncate">
                      {configAkhir.metode_hitung === 'rata_rata_langsung' 
                        ? 'RATA-RATA LANGSUNG' 
                        : configAkhir.metode_hitung === 'bobot_manual' 
                        ? 'BOBOT MANUAL' 
                        : 'RATA-RATA BAB'}
                    </span>
                  </div>
                </div>
              </th>
            </tr>
            <tr className="bg-slate-50 border-b border-slate-300 text-slate-600 text-xs">
              {uniqueBabsClass.flatMap((bab, bIdx) => {
                const isSumatif = isPstsOrPsas(bab)
                return classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen).map(k => {
                  const isKarakter = isKarakterKomponen(k.nama)
                  const parsedKar = isKarakter ? parseKarakterDeskripsi(k.deskripsi) : null
                  const tooltipText = isSumatif 
                    ? "Kolom Sumatif dikontrol oleh Kurikulum" 
                    : isKarakter 
                      ? `Nilai Karakter (NIK): ${parsedKar?.elemenNama ? `[${parsedKar.elemenNama}] ` : ''}${parsedKar?.subIndikatorNama || ''}\n${parsedKar?.catatan || k.deskripsi || ''}\n(Klik untuk kelola elemen & indikator)`
                      : k.deskripsi ? "Klik untuk kelola TP" : "Deskripsi belum diisi! Klik untuk mengisi."

                  return (
                    <th key={k.id} 
                      className={`text-center px-1.5 py-1.5 min-w-[65px] sm:min-w-[75px] max-w-[100px] whitespace-normal break-words border-r border-slate-200 font-bold align-middle ${!k.is_nilai_visible ? 'opacity-50' : ''} ${isSumatif ? 'cursor-default' : 'cursor-pointer'} transition-colors ${isKarakter ? 'bg-indigo-50/50 text-indigo-900 hover:bg-indigo-100/50' : `${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]} ${BAB_HOVER[bIdx % BAB_HOVER.length]}`}`} 
                      title={tooltipText}
                      onClick={(e) => {
                          if (isSumatif) return;
                          if (e.target.closest('button')) return;
                          if (isKarakter) {
                            setEditingKarakterKomponen(k)
                            setKarakterModalBab(k.bab_nama || selectedBabToManage)
                            setShowKarakterModal(true)
                            return
                          }
                          setEditTpData({ nama: k.nama, deskripsi: k.deskripsi || '', bobot: k.bobot, target_kelas: k.target_kelas || [], instruksi: k.instruksi || '', lampiran_urls: k.lampiran_urls || [] })
                          setSelectedTpToManage(k.id)
                      }}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5 h-full">
                        <div className="flex items-center justify-center gap-1 w-full">
                          {!isSumatif && !k.deskripsi && <span className="text-rose-500 font-bold bg-rose-100 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0" title="Deskripsi kosong!">!</span>}
                          {!isSumatif && !isKarakter && k.deskripsi && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title={`Deskripsi terisi: ${k.deskripsi}`} />
                          )}
                          <span className="font-extrabold text-[11px] sm:text-xs text-slate-800 truncate" title={k.deskripsi || k.nama}>{k.nama}</span>
                          {!isSumatif && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleVisible(k);
                                }}
                                className={`p-0.5 rounded transition-colors shrink-0 ${
                                  k.is_nilai_visible
                                    ? 'text-indigo-600 hover:text-indigo-800 opacity-80 hover:opacity-100'
                                    : 'text-slate-400 hover:text-slate-600 opacity-40 hover:opacity-100'
                                }`}
                                title={k.is_nilai_visible ? 'Nilai TP ini tampil ke siswa (Klik untuk sembunyikan)' : 'Nilai TP ini tersembunyi dari siswa (Klik untuk tampilkan)'}
                              >
                                <IconEye on={k.is_nilai_visible} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCbtWizard(k);
                                }}
                                className="p-0.5 rounded text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 transition-colors shrink-0"
                                title="Buat CBT Otomatis dari TP ini"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                        {isKarakter && (parsedKar?.subIndikatorNama || parsedKar?.elemenNama) && (
                          <div className="flex flex-col items-center gap-0.5 mt-0.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[85px]" title={`${parsedKar?.elemenNama ? `[${parsedKar.elemenNama}] ` : ''}${parsedKar?.subIndikatorNama || ''}`}>
                              {parsedKar?.subIndikatorNama || parsedKar?.elemenNama}
                            </span>
                          </div>
                        )}
                      </div>
                    </th>
                  )
                })
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayStudents.map((s, idx) => {
              const rataRata = hitungRataRata(s.nisn)
              const rataColor = rataRata === null ? 'text-slate-300' : Number(rataRata) >= kkm ? 'text-emerald-700' : 'text-rose-600'
              const orderedKomponen = uniqueBabsClass.flatMap(bab => classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort(sortBabKomponen))
              
              return (
                <tr key={s.nisn} className={`hover:bg-slate-200 transition-colors group ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"}`}>
                  <td className={`text-center px-1.5 ${isCompactMode ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} text-slate-400 border-r border-slate-100 font-medium ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 0, zIndex: 10, minWidth: 36, maxWidth: 36, width: 36 }}>{idx + 1}</td>
                  <td className={`px-2.5 sm:px-3 ${isCompactMode ? 'py-1 text-xs' : 'py-1.5 text-xs sm:text-[13px]'} font-bold text-slate-800 leading-tight border-r border-slate-100 mobile-nama-col shadow-[2px_0_5px_-1px_rgba(0,0,0,0.12)] ${showNisnMobile ? 'sm:shadow-none' : ''} ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 36, zIndex: 10, minWidth: maxNamaWidth, maxWidth: maxNamaWidth, width: maxNamaWidth }}>
                    <div className="truncate w-full h-full" title={s.nama_lengkap}>{s.nama_lengkap}</div>
                  </td>
                  <td className={`px-2 ${isCompactMode ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} text-slate-500 font-mono leading-none border-r border-slate-100 mobile-unsticky sm:shadow-[2px_0_5px_-1px_rgba(0,0,0,0.12)] ${showNisnMobile ? 'table-cell' : 'hidden'} ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 36 + maxNamaWidth, zIndex: 10, minWidth: 85, maxWidth: 85, width: 85 }}>{s.nisn}</td>
                  {orderedKomponen.map((k, kIdx) => {
                    const cellKey = `${k.id}-${s.nisn}`
                    const val = nilaiData[k.id]?.[s.nisn]
                    const hasVal = val !== undefined && val !== null && val !== '' && String(val).trim() !== '-'
                    const isSaving = savingCells.has(cellKey)
                    const cellError = errorCells[cellKey]
                    const isKarakter = isKarakterKomponen(k.nama)
                    const karPred = isKarakter && hasVal ? getPredikatKarakter(val) : null
                    const isDescribed = Boolean(k.deskripsi && k.deskripsi.trim() !== '')
                    const isMissingWithDesc = !hasVal && isDescribed && !isSumatif(k.bab_nama || k.nama) && !isKarakter
                    
                    const valColor = !hasVal 
                      ? 'text-slate-800' 
                      : isKarakter
                        ? karPred?.predikat === 'A' ? 'text-emerald-700' : karPred?.predikat === 'B' ? 'text-sky-700' : karPred?.predikat === 'C' ? 'text-amber-700' : 'text-rose-600'
                        : Number(val) >= kkm 
                          ? 'text-emerald-600' 
                          : 'text-rose-600';
                    
                    return (
                      <td key={k.id} className={`text-center px-1.5 ${isCompactMode ? 'py-0.5' : 'py-1'} border-r border-slate-100 ${cellError ? 'bg-rose-50/60' : isMissingWithDesc ? 'bg-rose-50/30' : isKarakter ? 'bg-amber-50/20' : ''}`}>
                        <div className="relative flex flex-col items-center justify-center">
                          <div className="relative flex justify-center w-full">
                            <input
                              type="text"
                              readOnly={isMobileDevice}
                              inputMode={isMobileDevice ? "none" : "numeric"}
                              data-grade-row={idx}
                              data-grade-col={kIdx}
                              value={val !== undefined && val !== null ? val : ''}
                              key={cellKey}
                              onWheel={(e) => e.target.blur()}
                              onFocus={e => {
                                e.target.select()
                                justFocusedCellRef.current = `${idx}_${kIdx}`
                                setActiveCellInfo({
                                  row: idx,
                                  col: kIdx,
                                  student: s,
                                  komponen: k,
                                  value: val !== undefined && val !== null ? String(val) : ""
                                })
                                if (isMobileDevice) {
                                  setShowFloatingKeypad(true)
                                }
                              }}
                              onMouseUp={e => {
                                if (e.target.selectionStart === e.target.selectionEnd) {
                                  e.target.select()
                                }
                              }}
                              onClick={e => {
                                e.target.select()
                                justFocusedCellRef.current = `${idx}_${kIdx}`
                                setActiveCellInfo({
                                  row: idx,
                                  col: kIdx,
                                  student: s,
                                  komponen: k,
                                  value: val !== undefined && val !== null ? String(val) : ""
                                })
                                if (isMobileDevice) {
                                  setShowFloatingKeypad(true)
                                }
                              }}
                              onChange={e => {
                                if (isMobileDevice) return
                                justFocusedCellRef.current = null
                                const raw = e.target.value
                                if (raw === '') {
                                  handleNilaiChange(k.id, s.nisn, '')
                                  setActiveCellInfo(prev => prev ? { ...prev, value: '' } : null)
                                  return
                                }
                                const clean = raw.replace(/\D/g, '')
                                if (clean === '') {
                                  handleNilaiChange(k.id, s.nisn, '')
                                  setActiveCellInfo(prev => prev ? { ...prev, value: '' } : null)
                                  return
                                }
                                let num = parseInt(clean, 10)
                                if (num > 100) num = 100
                                const finalStr = String(num)
                                handleNilaiChange(k.id, s.nisn, finalStr)
                                setActiveCellInfo(prev => prev ? { ...prev, value: finalStr } : null)
                              }}
                              onPaste={e => handlePasteGrid(e, idx, kIdx, orderedKomponen)}
                              onBlur={e => {
                                const newVal = e.target.value
                                const oldVal = val !== undefined && val !== null ? String(val) : ''
                                if (newVal !== oldVal) {
                                  handleNilaiChange(k.id, s.nisn, newVal, true)
                                }
                              }}
                              onKeyDown={e => {
                                if (isMobileDevice) {
                                  if (e.key >= '0' && e.key <= '9') {
                                    e.preventDefault()
                                    handleKeypadPress(Number(e.key))
                                  } else if (e.key === 'Backspace' || e.key === 'Delete') {
                                    e.preventDefault()
                                    handleKeypadPress('BACKSPACE')
                                  } else if (['Enter', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
                                    e.preventDefault()
                                    if (e.key === 'Enter') handleKeypadNavigate(e.shiftKey ? 'UP' : 'DOWN')
                                    else if (e.key === 'ArrowDown') handleKeypadNavigate('DOWN')
                                    else if (e.key === 'ArrowUp') handleKeypadNavigate('UP')
                                    else if (e.key === 'ArrowRight') handleKeypadNavigate('RIGHT')
                                    else if (e.key === 'ArrowLeft') handleKeypadNavigate('LEFT')
                                  }
                                  return
                                }

                                // Khusus Laptop / Komputer: Jika baru masuk ke kolom yang sudah ada isinya dan langsung ketik angka (0-9),
                                // langsung gantikan nilainya dengan angka baru tersebut (tanpa perlu tekan delete / backspace dulu)
                                if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                  if (justFocusedCellRef.current === `${idx}_${kIdx}`) {
                                    justFocusedCellRef.current = null
                                    e.preventDefault()
                                    const newDigit = e.key
                                    handleNilaiChange(k.id, s.nisn, newDigit)
                                    setActiveCellInfo(prev => prev ? { ...prev, value: newDigit } : null)
                                    return
                                  }
                                } else if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                  justFocusedCellRef.current = null
                                }

                                // Khusus Laptop / Komputer: Input keyboard fisik lancar
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                  handleKeypadNavigate(e.shiftKey ? 'UP' : 'DOWN')
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                  handleKeypadNavigate(e.shiftKey ? 'LEFT' : 'RIGHT')
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                  handleKeypadNavigate('DOWN')
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                  handleKeypadNavigate('UP')
                                } else if (e.key === 'ArrowRight') {
                                  const isAtEnd = e.target.selectionEnd === e.target.value.length
                                  const isAllSelected = e.target.selectionStart === 0 && e.target.selectionEnd === e.target.value.length
                                  if (isAtEnd || isAllSelected) {
                                    e.preventDefault()
                                    handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                    handleKeypadNavigate('RIGHT')
                                  }
                                } else if (e.key === 'ArrowLeft') {
                                  const isAtStart = e.target.selectionStart === 0
                                  const isAllSelected = e.target.selectionStart === 0 && e.target.selectionEnd === e.target.value.length
                                  if (isAtStart || isAllSelected) {
                                    e.preventDefault()
                                    handleNilaiChange(k.id, s.nisn, e.target.value, true)
                                    handleKeypadNavigate('LEFT')
                                  }
                                }
                              }}
                              className={`${isCompactMode ? 'w-14 sm:w-16 py-0.5 text-xs' : 'w-16 sm:w-20 py-1 text-xs sm:text-sm'} mx-auto text-center font-bold px-1.5 border rounded-lg outline-none transition-all ${
                                cellError 
                                  ? 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-200' 
                                  : isMissingWithDesc
                                    ? 'border-dashed border-rose-400 bg-rose-50/40 focus:bg-white focus:border-solid focus:border-indigo-500'
                                    : isSaving 
                                      ? 'border-amber-400 bg-amber-50 text-amber-700' 
                                      : 'border-slate-200 bg-white hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                              } ${valColor}`}
                              placeholder={isMissingWithDesc ? '-' : ''}
                            />
                            {isSaving && (
                              <span
                                className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white animate-ping pointer-events-none"
                                title="Sedang menyimpan..."
                              />
                            )}
                            {isMissingWithDesc && !isSaving && !cellError && (
                              <span
                                className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-white animate-pulse pointer-events-none"
                                title="Nilai belum diisi padahal TP sudah memiliki deskripsi capaian"
                              />
                            )}
                            {cellError && !isSaving && (
                              <button
                                type="button"
                                onClick={() => handleNilaiChange(k.id, s.nisn, val !== undefined && val !== null ? val : '')}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center text-[10px] font-black shadow cursor-pointer transition-transform hover:scale-110 z-20"
                                title={`Gagal menyimpan ke server (${cellError.errorMsg}). Klik untuk mencoba simpan lagi.`}
                              >
                                !
                              </button>
                            )}
                          </div>
                          {karPred && (
                            <div className="mt-1 flex items-center justify-center">
                              <span 
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded border leading-none tracking-tight shadow-2xs ${karPred.bgBadge}`}
                                title={`${karPred.kriteria} (${karPred.rentang}): ${karPred.deskripsiKriteria}`}
                              >
                                {karPred.predikat} • {karPred.kriteria}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className={`text-center px-2 sm:px-3 ${isCompactMode ? 'py-0.5' : 'py-1'} border-l border-indigo-100 bg-indigo-50/30 ${configAkhir.is_visible === false ? 'opacity-50' : ''}`}>
                    {rataRata !== null ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                         <span className={`font-black text-sm ${rataColor}`}>{rataRata}</span>
                         <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${getPredikat(rataRata) === 'A' || getPredikat(rataRata) === 'B' ? 'bg-emerald-100 text-emerald-700' : getPredikat(rataRata) === 'C' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{getPredikat(rataRata)}</span>
                      </div>
                    ) : (
                      <span className="font-black text-sm text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="animate-slide-up flex flex-col h-full flex-1 min-h-0">

      {/* ─── MODAL PILIH LINGKUP RAPOR PTS (ROMBEL) ─────────────────────── */}
      {showPtsSelectionModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Pilih Lingkup Materi Rapor PTS</h3>
                  <p className="text-[11px] text-indigo-200">
                    Rombel Kelas {currentRombel || activeTabKelas} {classesForRombel.length > 0 ? `(${classesForRombel.join(', ')})` : ''} &bull; {selectedMapelNama}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowPtsSelectionModal(false)} className="text-indigo-300 hover:text-white p-1 rounded-lg hover:bg-indigo-800 transition-colors">
                <IconClose />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              {(() => {
                const regularBabs = rombelRegularBabs
                const maxLimit = raporSettings.rapor_max_lingkup || 3
                const isUnderOrEqual = regularBabs.length <= maxLimit

                return (
                  <>
                    <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-900 space-y-1.5">
                      <div className="font-bold text-xs flex items-center justify-between">
                        <span>Batas Maksimal Rapor: {maxLimit} BAB</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          tempSelectedPtsBabs.length === maxLimit
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          Terpilih: {tempSelectedPtsBabs.length} / {maxLimit}
                        </span>
                      </div>
                      <p className="text-[11px] text-indigo-700 leading-relaxed">
                        {isUnderOrEqual
                          ? `Total BAB yang tersedia (${regularBabs.length}) tidak melebihi batas maksimal (${maxLimit}). Pilihan ini berlaku untuk seluruh kelas yang Anda ajar di Rombel Kelas ${currentRombel || activeTabKelas} (${classesForRombel.join(', ')}).`
                          : `Terdapat ${regularBabs.length} BAB pada Rombel Kelas ${currentRombel || activeTabKelas}. Silakan pilih maksimal ${maxLimit} BAB yang akan dimasukkan ke Rapor PTS untuk seluruh kelas yang Anda ajar (${classesForRombel.join(', ')}).`}
                      </p>
                    </div>

                    {isUnderOrEqual && (
                      <button
                        type="button"
                        onClick={() => setTempSelectedPtsBabs([...regularBabs])}
                        className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        <span>Pilih / Konfirmasi Semua BAB ({regularBabs.length} BAB)</span>
                      </button>
                    )}

                    <div className="space-y-2 pt-1">
                      <label className="font-bold text-slate-700 block text-xs uppercase tracking-wide">
                        Daftar BAB / Lingkup Materi:
                      </label>
                      {regularBabs.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          Belum ada BAB materi yang dibuat untuk rombel ini.
                        </div>
                      ) : (
                        regularBabs.map(bab => {
                          const isChecked = tempSelectedPtsBabs.includes(bab)
                          const disabled = !isChecked && tempSelectedPtsBabs.length >= maxLimit
                          return (
                            <label
                              key={bab}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                isChecked
                                  ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold'
                                  : disabled
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={disabled}
                                  onChange={() => {
                                    if (isChecked) {
                                      setTempSelectedPtsBabs(prev => prev.filter(b => b !== bab))
                                    } else {
                                      if (tempSelectedPtsBabs.length < maxLimit) {
                                        setTempSelectedPtsBabs(prev => [...prev, bab])
                                      }
                                    }
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                />
                                <span className="text-xs">{bab}</span>
                              </div>
                              {isChecked && (
                                <span className="text-[10px] bg-indigo-200/70 text-indigo-800 px-2 py-0.5 rounded-md font-bold">
                                  Masuk Rapor
                                </span>
                              )}
                            </label>
                          )
                        })
                      )}
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPtsSelectionModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={savingPtsSelection || tempSelectedPtsBabs.length === 0}
                onClick={() => handleSavePtsSelectionRombel(tempSelectedPtsBabs)}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-all shadow-xs flex items-center gap-2"
              >
                {savingPtsSelection && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Simpan Pilihan PTS (Rombel {currentRombel ? `Kelas ${currentRombel}` : activeTabKelas})</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Config Akhir (Terkunci oleh Kurikulum / Admin) */}
      {showConfigAkhirModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <h3 className="font-bold text-slate-800 text-sm">Status Perhitungan Nilai Akhir</h3>
              </div>
              <button onClick={() => setShowConfigAkhirModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 bg-slate-50/50 overflow-y-auto space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong className="font-bold">Pengaturan Terkunci:</strong>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    Metode perhitungan nilai akhir ditetapkan oleh <strong>Kurikulum / Admin</strong> dan tidak dapat diubah oleh guru mapel. Standar ini otomatis ter-apply ke seluruh perhitungan nilai akhir (Leger Nilai, Nilai Guru, dan Rapor Siswa).
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Metode Perhitungan Aktif</label>
                <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 pointer-events-none">
                  <div
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg text-center transition-colors ${configAkhir.metode_hitung === 'rata_rata' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Rata-rata BAB
                  </div>
                  <div
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg text-center transition-colors ${configAkhir.metode_hitung === 'rata_rata_langsung' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Rata-rata Langsung
                  </div>
                  <div
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg text-center transition-colors ${configAkhir.metode_hitung === 'bobot_manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Bobot Manual
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {configAkhir.metode_hitung === 'rata_rata'
                    ? 'Nilai akhir adalah rata-rata bertingkat dari setiap BAB, PSTS, dan PSAS.'
                    : configAkhir.metode_hitung === 'rata_rata_langsung'
                    ? 'Nilai akhir adalah rata-rata langsung seluruh komponen nilai yang terisi tanpa dirata per bab.'
                    : 'Bobot persentase masing-masing BAB, PSTS, dan PSAS diatur terpusat oleh Kurikulum.'}
                </p>
              </div>

              {configAkhir.metode_hitung === 'bobot_manual' && (
                <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-100">
                  {uniqueBabsClass.map((bab) => (
                    <div key={bab} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{bab}</span>
                      <div className="relative w-24">
                        <input 
                          type="number" 
                          disabled
                          className="w-full pl-3 pr-8 py-1.5 text-sm font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg text-right cursor-not-allowed"
                          value={configAkhir.bobot_detail[bab] || ''}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                      </div>
                    </div>
                  ))}
                  
                  {(() => {
                    const sum = Object.values(configAkhir.bobot_detail).reduce((a, b) => a + Number(b || 0), 0)
                    return (
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-3">
                        <span className="text-sm font-bold text-slate-700">Total Bobot</span>
                        <span className={`text-sm font-bold ${sum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{sum}%</span>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setShowConfigAkhirModal(false)} 
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-2xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Export */}
      {showExportModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg sm:max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <IconDownload />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Export Nilai ke Excel</h3>
                  <p className="text-[11px] text-slate-500">Pilih cakupan data nilai yang ingin diekspor</p>
                </div>
              </div>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"><IconClose /></button>
            </div>

            {/* Scope Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
              <button
                type="button"
                onClick={() => setExportScope('current')}
                className={`flex-1 py-3 px-2 text-center border-b-2 transition-all cursor-pointer ${
                  exportScope === 'current'
                    ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs font-extrabold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Mapel Ini ({selectedMapelNama || 'Mapel'})
              </button>
              {uniqueMapels.length > 1 && (
                <button
                  type="button"
                  onClick={() => setExportScope('all_mapel')}
                  className={`flex-1 py-3 px-2 text-center border-b-2 transition-all cursor-pointer ${
                    exportScope === 'all_mapel'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Mapel Saya ({uniqueMapels.length})
                </button>
              )}
            </div>

            <div className="p-5">
              {exportScope === 'current' ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600 uppercase">Pilih Kelas:</span>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          const target = exportClassScope === 'school' && allSchoolClasses.length > 0 ? allSchoolClasses : activeTargetKelas
                          setSelectedExportClasses(target)
                        }}
                        className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                      >✓ Pilih Seluruh ({exportClassScope === 'school' && allSchoolClasses.length > 0 ? allSchoolClasses.length : activeTargetKelas.length})</button>
                      <button 
                        type="button"
                        onClick={() => setSelectedExportClasses([])}
                        className="text-xs text-slate-500 font-medium hover:underline cursor-pointer"
                      >Kosongkan</button>
                    </div>
                  </div>

                  {allSchoolClasses.length > activeTargetKelas.length && (
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          setExportClassScope('guru')
                          setSelectedExportClasses(activeTargetKelas)
                        }}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                          exportClassScope === 'guru' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Kelas yang Saya Ampu ({activeTargetKelas.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExportClassScope('school')
                          setSelectedExportClasses(allSchoolClasses)
                        }}
                        className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                          exportClassScope === 'school' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Semua Kelas Sekolah ({allSchoolClasses.length})
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {(exportClassScope === 'school' && allSchoolClasses.length > 0 ? allSchoolClasses : activeTargetKelas).map(kelas => (
                      <label key={kelas} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer border border-slate-100 hover:border-indigo-200 transition-colors">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={selectedExportClasses.includes(kelas)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedExportClasses(prev => [...prev, kelas])
                            else setSelectedExportClasses(prev => prev.filter(c => c !== kelas))
                          }}
                        />
                        <span className="text-sm font-bold text-slate-700">Kelas {kelas}</span>
                        {activeTargetKelas.includes(kelas) && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 font-semibold px-1.5 py-0.5 rounded-md ml-auto">Diampu</span>
                        )}
                      </label>
                    ))}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">Batal</button>
                    <button 
                      onClick={handleDownloadExcel} 
                      disabled={selectedExportClasses.length === 0 || isExporting}
                      className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                    >
                      {isExporting ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> {exportProgressText || 'Mengekspor...'}</> : <>Download Excel ({selectedExportClasses.length} Kelas)</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                    Sistem akan mengekspor <strong>seluruh data nilai</strong> dari semua mata pelajaran dan kelas yang Anda ampu ke dalam <strong>1 file Excel multi-sheet</strong> terformat rapi.
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 max-h-48 overflow-y-auto space-y-2">
                    {uniqueMapels.map(m => {
                      const cList = [...new Set(mapelRaw.filter(x => x.mata_pelajaran_id === m.id).map(x => x.kelas))].filter(Boolean).sort()
                      return (
                        <div key={m.id} className="text-xs">
                          <span className="font-bold text-slate-800">{m.nama}:</span>
                          <span className="text-slate-500 ml-1.5 font-medium">{cList.length > 0 ? cList.map(c => `Kelas ${c}`).join(', ') : 'Belum ada kelas'}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                    <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer">Batal</button>
                    <button 
                      onClick={handleDownloadAllMapelsExcel} 
                      disabled={isExporting}
                      className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                    >
                      {isExporting ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> {exportProgressText || 'Mengekspor...'}</> : <>Download Rekap Mapel Saya</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {ConfirmModalComponent}
      <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadExcel} />
      
      {/* Header */}
      <div className="mb-2.5 shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Input Nilai Guru</h2>
          <span className="hidden md:inline text-xs text-slate-400 font-medium">| Input Berbasis Target Kelas</span>
        </div>
        
        <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-xl shadow-2xs border border-slate-200">
          {uniqueMapels.length > 1 ? (
            <select value={selectedMapelId} onChange={e => setSelectedMapelId(e.target.value)} className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none bg-slate-50 cursor-pointer">
              <option value="">-- Pilih Mapel --</option>
              {uniqueMapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          ) : (
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-xs border border-indigo-100">{selectedMapelNama}</span>
          )}
          
          <div className="w-px h-5 bg-slate-200"></div>
          
          <select value={selectedSemesterId} onChange={e => setSelectedSemesterId(e.target.value)} className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none bg-slate-50 cursor-pointer" disabled={semesters.length === 0}>
            {semesters.map(s => (
              <option key={s.id} value={s.id}>Semester {s.nomor}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* MAIN VIEW */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-0 animate-fade-in">
        {/* ─── DESKTOP VIEW: Baris 1 (Pilihan Kelas, Layar Penuh, Kelola Bab, Nilai Akhir) ─── */}
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl shadow-2xs border border-slate-200/90 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <span>🏫</span>
              <span>Kelas:</span>
            </span>
            {activeTargetKelas.length === 0 ? (
              <div className="text-xs font-bold text-slate-400 italic">Belum ada kelas target</div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeTargetKelas.map(c => {
                  const isActive = activeTabKelas === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveTabKelas(c)} 
                      className={`px-3.5 py-1.5 rounded-lg font-black text-xs transition-all whitespace-nowrap border shrink-0 cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-200' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-white hover:text-indigo-600'
                      }`}
                    >
                      Kelas {c}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Tombol Layar Penuh Desktop */}
            <button
              type="button"
              onClick={() => setIsTableFullscreen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border border-indigo-600 text-xs font-extrabold rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Buka Tabel Nilai dalam Mode Layar Penuh"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
              </svg>
              <span>Layar Penuh</span>
            </button>
            <button 
              type="button"
              onClick={() => setShowConfigAkhirModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all shadow-2xs cursor-pointer"
              title="Metode Nilai Akhir ditetapkan oleh Kurikulum / Admin. Klik untuk melihat status."
            >
              <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Nilai Akhir: <strong className="text-slate-900">{configAkhir.metode_hitung === 'rata_rata_langsung' ? 'Rata-rata Langsung' : configAkhir.metode_hitung === 'bobot_manual' ? 'Bobot Manual' : 'Rata-rata BAB'}</strong></span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewBabTargetKelas(activeTabKelas ? [activeTabKelas] : [])
                setShowAddBab(true)
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer"
            >
              <IconPlus /> Kelola Bab
            </button>
            <button
              type="button"
              onClick={() => fetchNilai(true)}
              disabled={refreshingNilai || classKomponen.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Muat ulang nilai siswa langsung dari server"
            >
              <svg className={`w-3.5 h-3.5 text-slate-600 ${refreshingNilai ? 'animate-spin text-indigo-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{refreshingNilai ? 'Memuat...' : 'Muat Ulang'}</span>
            </button>
          </div>
        </div>

        {/* ─── DESKTOP VIEW: Baris 2 (KKM, Skala Zoom, Tombol Aksi) ─────────── */}
        <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl shadow-2xs border border-slate-200/90 shrink-0">
          {/* Kiri: KKM & Zoom Controller */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase">KKM:</span>
              <input 
                type="number" 
                value={kkm} 
                onChange={(e) => setKkm(e.target.value)}
                className="w-12 px-1.5 py-0.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-md outline-none focus:border-indigo-500"
              />
            </div>

            {/* Kontrol Zoom In / Zoom Out */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 shadow-2xs" title="Atur Zoom / Skala Tampilan Tabel Nilai">
              <span className="text-[10px] font-bold text-slate-400 uppercase px-1.5 select-none">Skala:</span>
              <button
                type="button"
                onClick={() => {
                  setTableZoom(prev => {
                    const next = Math.max(70, prev - 10)
                    localStorage.setItem('nilai_table_zoom', String(next))
                    return next
                  })
                }}
                disabled={tableZoom <= 70}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-700 hover:bg-white hover:text-indigo-600 font-bold text-sm disabled:opacity-30 cursor-pointer transition-colors"
                title="Zoom Out (Perkecil agar muat lebih banyak baris di layar 720p)"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableZoom(100)
                  localStorage.setItem('nilai_table_zoom', '100')
                }}
                className="px-1.5 py-0.5 text-xs font-black text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer transition-colors"
                title="Klik untuk reset zoom ke 100%"
              >
                {tableZoom}%
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableZoom(prev => {
                    const next = Math.min(130, prev + 10)
                    localStorage.setItem('nilai_table_zoom', String(next))
                    return next
                  })
                }}
                disabled={tableZoom >= 130}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-700 hover:bg-white hover:text-indigo-600 font-bold text-sm disabled:opacity-30 cursor-pointer transition-colors"
                title="Zoom In (Perbesar teks dan ukuran sel)"
              >
                +
              </button>
            </div>
          </div>

          {/* Kanan: Tombol Aksi */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenTarikCbtModal}
              disabled={activeTargetKelas.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Tarik nilai langsung dari pengerjaan CBT peserta didik"
            >
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Tarik CBT</span>
            </button>
            <button 
              type="button"
              onClick={() => { setSelectedExportClasses(activeTargetKelas); setShowExportModal(true); }} 
              disabled={isExporting || activeTargetKelas.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Export Nilai ke Excel"
            >
              {isExporting ? <><div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/> <span className="max-w-[100px] truncate">{exportProgressText || 'Mengekspor...'}</span></> : <><IconDownload /> Export</>}
            </button>
            <button 
              type="button"
              onClick={() => uploadRef.current?.click()} 
              disabled={activeTargetKelas.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <IconUpload /> Upload
            </button>
            <button
              type="button"
              onClick={() => setShowRentangInfoModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer"
              title="Panduan Penilaian Karakter (Afektif) SMP Budi Mulia"
            >
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>NIK</span>
            </button>
          </div>
        </div>

        {/* ─── MOBILE VIEW: Kompak Dropdown Kelas & Kontrol Layar Penuh (sm:hidden) ─── */}
        <div className="sm:hidden flex flex-col gap-2 shrink-0 bg-white p-2.5 rounded-xl shadow-2xs border border-slate-200/90">
          <div className="flex items-center justify-between gap-2">
            {/* Kiri: Pilihan Kelas Dropdown */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-bold text-slate-500 shrink-0">🏫</span>
              {activeTargetKelas.length > 0 ? (
                <select
                  value={activeTabKelas || ''}
                  onChange={(e) => setActiveTabKelas(e.target.value)}
                  className="px-2.5 py-1.5 bg-indigo-600 text-white font-extrabold text-xs rounded-xl shadow-xs border border-indigo-700 outline-none cursor-pointer max-w-[130px] truncate"
                >
                  {activeTargetKelas.map(c => (
                    <option key={c} value={c} className="bg-white text-slate-900 font-bold">
                      Kelas {c}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-400 italic">Belum ada kelas</span>
              )}

              {/* Muat Ulang Cepat */}
              <button
                type="button"
                onClick={() => fetchNilai(true)}
                disabled={refreshingNilai || classKomponen.length === 0}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200 cursor-pointer disabled:opacity-40"
                title="Muat Ulang Nilai"
              >
                <svg className={`w-3.5 h-3.5 ${refreshingNilai ? 'animate-spin text-indigo-600' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Kanan: Buka/Tutup Menu & Tombol Layar Penuh */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMobileControlsOpen(prev => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border cursor-pointer ${
                  isMobileControlsOpen
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 ring-1 ring-indigo-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>⚙️ Menu</span>
                {missingDescribedAudit.count > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                    {missingDescribedAudit.studentCount}
                  </span>
                )}
                <svg className={`w-3 h-3 transition-transform ${isMobileControlsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
              </button>

              <button
                type="button"
                onClick={() => setIsTableFullscreen(true)}
                className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer border border-indigo-700"
                title="Buka Tabel Nilai Layar Penuh"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                </svg>
                <span>Layar Penuh</span>
              </button>
            </div>
          </div>

          {/* Drawer Kolaps Menu & Opsi Nilai di Mobile */}
          {isMobileControlsOpen && (
            <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5 animate-slide-up text-xs">
              {/* Baris Status Nilai Akhir & Kelola Bab */}
              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={() => setShowConfigAkhirModal(true)}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg truncate cursor-pointer shadow-2xs"
                  title="Metode Nilai Akhir"
                >
                  <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">Nilai Akhir</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewBabTargetKelas(activeTabKelas ? [activeTabKelas] : [])
                    setShowAddBab(true)
                  }}
                  className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg cursor-pointer shadow-2xs"
                >
                  <IconPlus /> <span>Kelola Bab</span>
                </button>
              </div>

              {/* Baris KKM & Zoom Skala */}
              <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">KKM:</span>
                  <input 
                    type="number" 
                    value={kkm} 
                    onChange={(e) => setKkm(e.target.value)}
                    className="w-12 px-1.5 py-0.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-md outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase px-1 select-none">Skala:</span>
                  <button
                    type="button"
                    onClick={() => setTableZoom(prev => Math.max(70, prev - 10))}
                    disabled={tableZoom <= 70}
                    className="w-5 h-5 flex items-center justify-center rounded text-slate-700 hover:bg-slate-100 font-bold text-xs disabled:opacity-30 cursor-pointer"
                  >−</button>
                  <button
                    type="button"
                    onClick={() => setTableZoom(100)}
                    className="px-1 text-xs font-black text-indigo-700 cursor-pointer"
                  >{tableZoom}%</button>
                  <button
                    type="button"
                    onClick={() => setTableZoom(prev => Math.min(130, prev + 10))}
                    disabled={tableZoom >= 130}
                    className="w-5 h-5 flex items-center justify-center rounded text-slate-700 hover:bg-slate-100 font-bold text-xs disabled:opacity-30 cursor-pointer"
                  >+</button>
                </div>
              </div>

              {/* Baris Tombol Aksi (Tarik CBT, Export, Upload, NIK) */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenTarikCbtModal}
                  disabled={activeTargetKelas.length === 0}
                  className="flex flex-col items-center justify-center p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold gap-1 cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Tarik CBT</span>
                </button>
                <button 
                  type="button"
                  onClick={() => { setSelectedExportClasses(activeTargetKelas); setShowExportModal(true); }} 
                  disabled={isExporting || activeTargetKelas.length === 0}
                  className="flex flex-col items-center justify-center p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold gap-1 cursor-pointer disabled:opacity-50"
                >
                  <IconDownload />
                  <span>Export</span>
                </button>
                <button 
                  type="button"
                  onClick={() => uploadRef.current?.click()} 
                  disabled={activeTargetKelas.length === 0}
                  className="flex flex-col items-center justify-center p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold gap-1 cursor-pointer disabled:opacity-50"
                >
                  <IconUpload />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRentangInfoModal(true)}
                  className="flex flex-col items-center justify-center p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold gap-1 cursor-pointer"
                >
                  <span>📖 NIK</span>
                  <span>Panduan</span>
                </button>
              </div>

              {/* Opsi Tampilkan NISN */}
              <div className="pt-1 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showNisnMobile}
                    onChange={(e) => handleToggleNisn(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-700">Tampilkan Kolom NISN</span>
                </label>
              </div>
            </div>
          )}
        </div>


        
        {/* Upload Progress/Result Messages */}
        {uploadProgress && (
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-semibold text-indigo-700 shadow-sm shrink-0">
            <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
            {uploadProgress === 'reading' ? 'Membaca file...' : `Menyimpan ${0 || 0}/${0}...`}
          </div>
        )}
        
        {/* Error Cells Alert Banner */}
        {Object.keys(errorCells).length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 shadow-sm shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-rose-600 text-lg">⚠️</span>
              <div>
                <span className="font-bold">Koneksi Terganggu:</span> Ada <span className="font-bold underline">{Object.keys(errorCells).length}</span> sel nilai yang gagal tersimpan ke server. Data telah dicadangkan di perangkat ini.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetryAllFailedCells}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0"
            >
              Coba Simpan Semua Ulang
            </button>
          </div>
        )}

        {/* Syncing Pending Grades Banner */}
        {isSyncingPending && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-xs font-semibold text-sky-700 shadow-sm shrink-0 animate-in fade-in duration-200">
            <div className="w-3.5 h-3.5 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin"/>
            <span>Sedang menyinkronkan data nilai cadangan offline ke server...</span>
          </div>
        )}

        {uploadResult && (
          <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-bold shadow-sm shrink-0 ${uploadResult.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              {uploadResult.error ? '⚠️' : '✅'}
              {uploadResult.error ? uploadResult.error : (uploadResult.message || `Sinkronisasi selesai! ${uploadResult.success} sel nilai berhasil diperbarui.${uploadResult.ignoredBlanks > 0 ? ` (${uploadResult.ignoredBlanks} sel kosong diabaikan agar nilai lama tetap aman)` : ''} | Gagal: ${uploadResult.failed} | Dilewati: ${uploadResult.skipped}`)}
            </div>
            <button onClick={() => setUploadResult(null)} className="p-1 rounded-md hover:bg-black/5"><IconClose /></button>
          </div>
        )}

        {/* ─── BANNER PERINGATAN RAPOR PTS (COMPACT) ───────────────────────── */}
        {raporSettings.status_rapor_pts === 'buka' && activeTabKelas && (
          <div className={`flex items-center justify-between gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl border transition-all shrink-0 ${
            configAkhir?.bobot_detail?.pts_confirmed
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900 shadow-2xs'
              : 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">
                {configAkhir?.bobot_detail?.pts_confirmed ? '✅' : '⚠️'}
              </span>
              <div className="text-xs truncate">
                <strong className="uppercase">
                  {configAkhir?.bobot_detail?.pts_confirmed
                    ? `Rapor PTS: Rombel ${currentRombel || activeTabKelas} Terkonfirmasi`
                    : 'Perhatian: Rapor PTS Sedang Dibuka Kurikulum'}
                </strong>
                <span className="hidden md:inline ml-1.5 opacity-80 text-[11px]">
                  {configAkhir?.bobot_detail?.pts_confirmed
                    ? `(${(configAkhir.bobot_detail.pts_selected_babs || []).length} BAB dipilih)`
                    : `(Pilih maks. ${raporSettings.rapor_max_lingkup} BAB)`}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                const currentSelected = configAkhir?.bobot_detail?.pts_selected_babs || []
                if (currentSelected.length > 0) {
                  setTempSelectedPtsBabs(currentSelected)
                } else {
                  setTempSelectedPtsBabs(rombelRegularBabs.slice(0, raporSettings.rapor_max_lingkup))
                }
                setShowPtsSelectionModal(true)
              }}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 transition-all shadow-2xs cursor-pointer ${
                configAkhir?.bobot_detail?.pts_confirmed
                  ? 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100/60'
                  : 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
              }`}
            >
              {configAkhir?.bobot_detail?.pts_confirmed ? 'Ubah Pilihan BAB' : 'Pilih Lingkup PTS'}
            </button>
          </div>
        )}

        {/* ─── BANNER AUDIT NILAI KOSONG PADA TP BERDESKRIPSI (COMPACT) ───── */}
        {missingDescribedAudit.count > 0 && (
          <div className="flex items-center justify-between gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl border border-rose-300 bg-rose-50/90 text-rose-950 shadow-2xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">🚨</span>
              <div className="text-xs truncate">
                <span className="font-extrabold text-rose-800">
                  Audit Nilai: Ditemukan {missingDescribedAudit.count} nilai kosong (-) pada TP berdeskripsi
                </span>
                <span className="hidden lg:inline ml-1.5 text-rose-600 text-[11px]">
                  (Sel kosong bergaris merah putus-putus)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilterOnlyMissing(prev => !prev)}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 transition-all shadow-2xs cursor-pointer flex items-center gap-1.5 border ${
                  filterOnlyMissing
                    ? 'bg-rose-600 text-white border-rose-700 ring-1 ring-rose-300'
                    : 'bg-white hover:bg-rose-50 text-rose-800 border-rose-300'
                }`}
                title="Filter tabel agar hanya menampilkan siswa yang ada nilai kosong"
              >
                <span>{filterOnlyMissing ? '✓ Filter Aktif' : '🔍 Filter Belum Lengkap'}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${filterOnlyMissing ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-900'}`}>
                  {missingDescribedAudit.studentCount}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ─── BANNER PERINGATAN BAB TANPA SEMESTER (COMPACT) ─────────────── */}
        {unassignedSemesterBabs.length > 0 && (
          <div className="flex items-center justify-between gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl border border-rose-400 bg-rose-50 text-rose-900 shadow-2xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">⚠️</span>
              <div className="text-xs truncate">
                <span className="font-extrabold text-rose-800">
                  Perhatian: Ada BAB belum ditentukan semesternya ({unassignedSemesterBabs.join(', ')})
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setNewBabTargetKelas(activeTabKelas ? [activeTabKelas] : [])
                setShowAddBab(true)
              }}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer"
            >
              Atur Semester
            </button>
          </div>
        )}
        
        {/* Tabel Nilai */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden flex-1 flex flex-col min-h-0 relative">
          {!isTableFullscreen ? renderTableContent(false) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 text-xs p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mb-2 shadow-xs">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
              <span className="font-bold text-slate-700 text-sm">Mode Layar Penuh Sedang Aktif</span>
              <p className="mt-1 text-slate-500 text-xs max-w-xs">Tabel nilai ditampilkan secara penuh di layar Anda untuk kemudahan pengisian nilai.</p>
              <button 
                type="button" 
                onClick={() => setIsTableFullscreen(false)} 
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
              >
                Kembalikan Tampilan Normal
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* MODALS */}
      
      {showAddBab && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col md:flex-row max-h-[90vh]">
            
            {/* KIRI: Input Form */}
            <div className="w-full md:w-3/5 flex flex-col border-r border-slate-100">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center bg-white">
                <h3 className="font-bold text-slate-800 text-lg">Kelola Bab</h3>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 flex-1 bg-white">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">1. Pilih Rombel (Tingkat Kelas)</label>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(uniqueClassesForMapel.map(c => c.replace(/\D/g, '')))].filter(Boolean).map(r => {
                      const isSelected = newBabRombel === r
                      return (
                        <button key={r} onClick={() => setNewBabRombel(r)}
                          className={`px-6 py-2.5 rounded-xl text-sm font-bold border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-indigo-300'}`}>
                          Kelas {r}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                    2. Pilih Semester <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {semesters.map(s => {
                      const isSelected = String(newBabSemesterId) === String(s.id)
                      return (
                        <button key={s.id} type="button" onClick={() => setNewBabSemesterId(s.id)}
                          className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                            isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-indigo-300'
                          }`}>
                          Semester {s.nomor}
                        </button>
                      )
                    })}
                  </div>
                  {!newBabSemesterId && (
                    <p className="text-xs text-rose-500 mt-1.5 font-semibold flex items-center gap-1">
                      <span>⚠️</span> Semester wajib dipilih agar BAB dapat dinilai dan muncul di rapor.
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">3. Topik / Nama BAB</label>
                  <div className="flex items-stretch border border-indigo-200 rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all bg-white">
                    <div className="bg-slate-50 border-r border-indigo-100 px-4 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                      {(() => {
                        if (!newBabRombel) return 'Bab ?:'
                        const isAutoGenerated = (n) => ['PSTS','PSAS','PSAT'].some(k => n?.toUpperCase().includes(k))
                        const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
                        const uniqueBabs = [...new Set(classBabs.filter(k => k.bab_nama?.toLowerCase().startsWith('bab') && !isAutoGenerated(k.bab_nama)).map(k => k.bab_nama))]
                        return `Bab ${uniqueBabs.length + 1}:`
                      })()}
                    </div>
                    <input value={newBabNama} onChange={e => setNewBabNama(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddBab()}
                      placeholder="Contoh: Bilangan Bulat"
                      className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none" autoFocus disabled={!newBabRombel} />
                  </div>
                  <p className="text-xs text-slate-400 mt-2 italic">Format otomatis: Bab X: [Topik]</p>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-white border-t border-slate-100 flex gap-3 justify-end shrink-0">
                <button onClick={() => { setShowAddBab(false); setNewBabNama('') }}
                  className="px-5 py-2.5 text-slate-600 bg-white hover:bg-slate-50 text-sm font-bold rounded-xl border border-slate-200 transition-colors shadow-sm cursor-pointer">
                  Batal
                </button>
                <button onClick={handleAddBab} disabled={!newBabNama.trim() || !newBabRombel || !newBabSemesterId || addingKomponen}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2 cursor-pointer">
                  {addingKomponen ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : null}
                  Simpan Bab
                </button>
              </div>
            </div>

            {/* KANAN: Daftar BAB + Setting Semester */}
            <div className="w-full md:w-2/5 flex flex-col bg-slate-50 relative">
              <button onClick={() => { setShowAddBab(false); setNewBabNama('') }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 rounded-lg p-1 shadow-sm cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between pr-14">
                <h3 className="font-bold text-slate-700 text-sm">
                  {newBabRombel ? `Daftar BAB Kelas ${newBabRombel}` : 'Daftar BAB'}
                </h3>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                {!newBabRombel ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    Pilih kelas untuk melihat daftar BAB.
                  </div>
                ) : (() => {
                  const isAutoGenerated = (n) => ['PSTS','PSAS','PSAT'].some(k => n?.toUpperCase().includes(k))
                  const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
                  const uniqueBabs = [...new Set(classBabs.filter(k => !isAutoGenerated(k.bab_nama)).map(k => k.bab_nama || 'Lainnya'))].sort((a,b) => {
                    const isPstsA = a.toUpperCase().includes('PSTS');
                    const isPstsB = b.toUpperCase().includes('PSTS');
                    const isPsasA = a.toUpperCase().includes('PSAS') || a.toUpperCase().includes('PSAT');
                    const isPsasB = b.toUpperCase().includes('PSAS') || b.toUpperCase().includes('PSAT');
                    if (isPstsA && !isPstsB) return isPsasB ? -1 : 1;
                    if (isPstsB && !isPstsA) return isPsasA ? 1 : -1;
                    if (isPsasA && !isPsasB) return 1;
                    if (isPsasB && !isPsasA) return -1;
                    const matchA = a.match(/\d+/);
                    const matchB = b.match(/\d+/);
                    if (matchA && matchB) return parseInt(matchA[0]) - parseInt(matchB[0]);
                    return a.localeCompare(b);
                  });
                  
                  if (uniqueBabs.length === 0) {
                    return (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                        Belum ada BAB untuk Kelas {newBabRombel}.
                      </div>
                    )
                  }

                  const unassignedInRombel = uniqueBabs.filter(b => !komponen.find(k => k.bab_nama === b)?.semester_id)
                  
                  return (
                    <div className="flex flex-col gap-2">
                      {unassignedInRombel.length > 0 && (
                        <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-rose-900 text-xs font-semibold flex items-start gap-2 shadow-2xs">
                          <span className="text-base">⚠️</span>
                          <div className="leading-snug">
                            Ada <strong>{unassignedInRombel.length} BAB</strong> yang belum memiliki semester! Silakan tentukan semester di bawah.
                          </div>
                        </div>
                      )}
                      {uniqueBabs.map((bab, idx) => {
                        const babSemesterId = komponen.find(k => k.bab_nama === bab)?.semester_id
                        const isMissingSem = !babSemesterId
                        return (
                          <div key={idx} className={`p-3 rounded-xl border shadow-sm flex flex-col gap-2 animate-fade-in transition-all group ${
                            isMissingSem 
                              ? 'bg-rose-50/70 border-2 border-rose-400' 
                              : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-md'
                          }`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm font-bold text-slate-700 leading-tight truncate">{bab}</span>
                                {isMissingSem && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-200 text-rose-800 shrink-0 animate-pulse">
                                    ⚠️ Belum Diset
                                  </span>
                                )}
                              </div>
                              <button onClick={() => handleDeleteBab(bab)} className="p-1.5 opacity-0 group-hover:opacity-100 text-rose-500 hover:bg-rose-100 hover:text-rose-700 rounded-lg transition-all shrink-0 cursor-pointer" title={`Hapus ${bab}`}>
                                <IconTrash />
                              </button>
                            </div>
                            <select
                              value={babSemesterId || ''}
                              onChange={async (e) => {
                                const newSemId = e.target.value
                                const ids = komponen.filter(k => k.bab_nama === bab).map(k => k.id)
                                await supabase.from('nilai_komponen').update({ semester_id: newSemId }).in('id', ids)
                                fetchKomponen()
                              }}
                              className={`w-full px-3 py-1.5 border rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500 cursor-pointer ${
                                isMissingSem ? 'text-rose-700 border-2 border-rose-500 bg-rose-50' : 'text-indigo-700 border-slate-200 bg-slate-50'
                              }`}
                            >
                              <option value="" disabled hidden>⚠️ Pilih Semester Disini</option>
                              {semesters.map(s => <option key={s.id} value={s.id} className="text-slate-700">Semester {s.nomor}</option>)}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
            
          </div>
        </div>
      , document.body)}
      
            {selectedBabToManage && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg">Kelola BAB: {selectedBabToManage}</h3>
              <button onClick={() => { setSelectedBabToManage(null); setAddingTpToBab(null) }} className="text-slate-400 hover:text-slate-600 p-1"><IconClose /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative">
              
              <div className="flex flex-col sm:flex-row gap-6 border-b border-slate-100 pb-5">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nama BAB</label>
                  <div className="flex gap-2">
                    <input value={editBabName} onChange={e => setEditBabName(e.target.value)} className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={handleSaveEditBab} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-sm transition-colors">Simpan</button>
                    <button onClick={() => handleDeleteBab(selectedBabToManage)} className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl font-bold transition-colors" title="Hapus Bab ini"><IconTrash /></button>
                  </div>
                </div>
                <div className="sm:w-1/3">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Metode Hitung</label>
                  <select 
                    value={manualBobotPending ? 'bobot_manual' : (komponen.find(k => k.bab_nama === selectedBabToManage)?.metode_hitung === 'bobot_manual' ? 'bobot_manual' : 'rata_rata')} 
                    onChange={e => handleUpdateMetode(selectedBabToManage, e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="rata_rata">Rata-rata / Bobot sama</option>
                    <option value="bobot_manual">Atur Bobot Manual</option>
                  </select>
                </div>
              </div>
              
              {(manualBobotPending || komponen.find(k => k.bab_nama === selectedBabToManage)?.metode_hitung === 'bobot_manual') && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-4 mb-4">
                  <h4 className="font-bold text-amber-800 text-sm mb-3">Atur Bobot Manual (Total harus 100%)</h4>
                  <div className="flex flex-col gap-2">
                    {classKomponen.filter(k => k.bab_nama === selectedBabToManage).sort(sortBabKomponen).map(k => (
                      <div key={k.id} className="flex items-center justify-between gap-4">
                        <div className="text-xs font-semibold text-slate-700">{k.nama}</div>
                        <div className="flex items-center gap-2">
                          <input 
                             type="number" min="0" max="100" step="0.1"
                             value={manualBobotValues[k.id] ?? (k.bobot || 0)} 
                             onChange={e => {
                               if(!manualBobotPending) {
                                  // Switch to pending mode if they start typing but hadn't clicked dropdown
                                  const komp = classKomponen.filter(k => k.bab_nama === selectedBabToManage);
                                  const vals = {};
                                  komp.forEach(x => vals[x.id] = (x.bobot || 0));
                                  vals[k.id] = e.target.value;
                                  setManualBobotValues(vals);
                                  setManualBobotPending(true);
                               } else {
                                  setManualBobotValues({...manualBobotValues, [k.id]: e.target.value})
                               }
                             }} 
                             className="w-20 px-2 py-1 text-center border border-slate-300 rounded-lg text-sm font-mono outline-none focus:border-amber-500" 
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-between items-center border-t border-amber-200 pt-3">
                     <div className="text-xs font-bold text-amber-900">Total: {Object.values(manualBobotPending ? manualBobotValues : classKomponen.filter(k => k.bab_nama === selectedBabToManage).reduce((acc, curr) => ({...acc, [curr.id]: curr.bobot||0}), {})).reduce((sum, v) => sum + Number(v), 0)}%</div>
                     {manualBobotPending && (
                       <button onClick={() => handleSaveManualBobot(selectedBabToManage)} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors">Simpan Bobot</button>
                     )}
                  </div>
                </div>
              )}
              
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Daftar Tujuan Pembelajaran (TP)</label>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const currentRombel = activeTabKelas ? activeTabKelas.replace(/\D/g, '') : ''
                      const hasKarInBab = (komponen || []).some(k => 
                        k.bab_nama === selectedBabToManage && 
                        isKarakterKomponen(k.nama, k.deskripsi) &&
                        (!currentRombel || (k.target_kelas || []).some(c => c.replace(/\D/g, '') === currentRombel) || (k.kelas && k.kelas.replace(/\D/g, '') === currentRombel))
                      )
                      return !hasKarInBab ? (
                        <button 
                          type="button"
                          onClick={() => handleOpenAddKarakter(selectedBabToManage)}
                          disabled={addingKomponen}
                          className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                          title="Tambahkan kolom Nilai Karakter di posisi paling kanan"
                        >
                          <IconPlus /> <span>Tambah Nilai Karakter</span>
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => handleOpenAddKarakter(selectedBabToManage)}
                          className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors" 
                          title="Nilai Karakter sudah aktif di BAB ini. Klik untuk mengelola elemen & sub-indikator"
                        >
                          <span>Nilai Karakter Aktif</span>
                          <span className="text-[10px] bg-white text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-semibold">Ubah</span>
                        </button>
                      )
                    })()}
                    <button onClick={() => {
                       setAddingTpToBab(selectedBabToManage);
                       const existingTpNumbers = (komponen || [])
                         .filter(k => k.bab_nama === selectedBabToManage && !isKarakterKomponen(k.nama))
                         .map(k => {
                           const match = (k.nama || '').match(/^TP\s*(\d+)/i);
                           return match ? parseInt(match[1], 10) : null;
                         })
                         .filter(n => n !== null);
                       let nextTpNum = 1;
                       while (existingTpNumbers.includes(nextTpNum)) {
                         nextTpNum++;
                       }
                       setNewTpNama('TP ' + nextTpNum);
                       setNewTpDeskripsi('');
                       setNewTpBobot('1');
                       const availableClasses = getAvailableClassesForBab(selectedBabToManage);
                       setNewTpTargetKelas(availableClasses);
                    }} className="px-3.5 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-1.5 shadow-2xs"><IconPlus/> Tambah TP</button>
                  </div>
                </div>
                
                {addingTpToBab === selectedBabToManage && (
                  <div className="bg-slate-50 border border-indigo-100 p-5 rounded-xl mb-4 relative">
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Target Kelas</label>
                      <div className="flex flex-wrap gap-2">
                        {getAvailableClassesForBab(selectedBabToManage).map(c => {
                          const isSelected = newTpTargetKelas.includes(c)
                          return (
                            <button key={c} type="button" onClick={() => toggleNewTpTargetKelas(c)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                              {c}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block">Nama TP (Slot Rapor)</label>
                          <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                            <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                            Otomatis urut untuk Rapor
                          </span>
                        </div>
                        <input value={newTpNama} readOnly className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700 outline-none cursor-not-allowed select-none" />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Deskripsi Rapor</label>
                      <textarea value={newTpDeskripsi} onChange={e => setNewTpDeskripsi(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500 resize-none h-20" placeholder="Opsional..." />
                    </div>
                    <div className="flex justify-end gap-2 flex-wrap">
                      <button onClick={() => setAddingTpToBab(null)} className="px-5 py-2.5 text-sm font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
                      <button
                        type="button"
                        onClick={handleAddTpAndCreateCbt}
                        disabled={newTpTargetKelas.length === 0 || !newTpNama.trim()}
                        className="px-5 py-2.5 text-sm font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        title="Simpan TP lalu langsung buka pembuat penilaian CBT"
                      >
                        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Simpan & Buat CBT</span>
                      </button>
                      <button onClick={handleAddTp} disabled={newTpTargetKelas.length === 0 || !newTpNama.trim()} className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50">Simpan TP</button>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-3">
                  {(() => {
                    const sortedBabs = classKomponen
                      .filter(k => k.bab_nama === selectedBabToManage)
                      .sort(sortBabKomponen);
                    const regularTpsInBab = sortedBabs.filter(k => !isKarakterKomponen(k.nama));
                    const totalTps = regularTpsInBab.length;
                    const babHasKarakter = (komponen || []).some(k => k.bab_nama === selectedBabToManage && isKarakterKomponen(k.nama));

                    return (
                      <>
                        {!babHasKarakter && (
                          <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex items-center justify-between gap-3 text-slate-600 text-xs">
                            <div>
                              <span>Bab ini belum memiliki <strong>Nilai Karakter</strong>. Kolom ini otomatis diletakkan di posisi paling kanan.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenAddKarakter(selectedBabToManage)}
                              disabled={addingKomponen}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shrink-0 shadow-xs transition-colors cursor-pointer text-xs flex items-center gap-1"
                            >
                              <IconPlus /> Tambah Nilai Karakter
                            </button>
                          </div>
                        )}
                        {sortedBabs.map((k) => {
                          const isKarakter = isKarakterKomponen(k.nama);
                          const tpIndex = !isKarakter ? regularTpsInBab.findIndex(x => x.id === k.id) : -1;
                          const parsedKar = isKarakter ? parseKarakterDeskripsi(k.deskripsi) : null;

                          return (
                            <div key={k.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl shadow-sm gap-4 ${isKarakter ? 'bg-indigo-50/30 border-indigo-200' : 'bg-white border-slate-200'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`font-bold text-sm ${isKarakter ? 'text-indigo-900' : 'text-slate-800'}`}>{k.nama}</span>
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold rounded uppercase border border-slate-200">Bobot: {k.bobot}</span>
                                  
                                  {/* Reorder controls for regular TPs */}
                                  {!isKarakter && totalTps > 1 && (
                                    <div className="inline-flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                      <button
                                        type="button"
                                        disabled={tpIndex <= 0 || addingKomponen}
                                        onClick={() => handleMoveTp(selectedBabToManage, k.id, tpIndex - 1)}
                                        className="p-1 rounded text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-600 transition-colors"
                                        title="Pindahkan TP ke atas"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={tpIndex >= totalTps - 1 || addingKomponen}
                                        onClick={() => handleMoveTp(selectedBabToManage, k.id, tpIndex + 1)}
                                        className="p-1 rounded text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-600 transition-colors"
                                        title="Pindahkan TP ke bawah"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                                      </button>
                                      <select
                                        value={tpIndex}
                                        onChange={(e) => handleMoveTp(selectedBabToManage, k.id, Number(e.target.value))}
                                        disabled={addingKomponen}
                                        className="text-[10px] font-bold bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 outline-none cursor-pointer hover:border-indigo-300"
                                        title="Ubah posisi slot TP langsung (misal TP 3 jadi TP 1)"
                                      >
                                        {regularTpsInBab.map((_, idx) => (
                                          <option key={idx} value={idx}>
                                            Posisi {idx + 1} (TP {idx + 1})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  {isKarakter && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      Posisi Paling Kanan
                                    </span>
                                  )}
                                </div>
                                {k.target_kelas && k.target_kelas.length > 0 && (
                                  <div className="flex gap-1 flex-wrap mb-1.5">
                                    {k.target_kelas.map(c => <span key={c} className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-100">{c}</span>)}
                                  </div>
                                )}
                                {isKarakter && parsedKar && (parsedKar.elemenNama || parsedKar.subIndikatorNama) && (
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    {parsedKar.elemenNama && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                        {parsedKar.elemenNama}
                                      </span>
                                    )}
                                    {parsedKar.subIndikatorNama && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {parsedKar.subIndikatorNama}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className={`text-xs line-clamp-2 ${isKarakter ? 'text-slate-600 font-medium' : 'text-slate-500'}`}>
                                  {isKarakter ? (
                                    parsedKar?.catatan || k.deskripsi || <span className="italic opacity-50">Belum ada keterangan observasi</span>
                                  ) : (
                                    k.deskripsi || <span className="italic opacity-50">Belum ada deskripsi</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 flex-wrap border-slate-100">
                                {!isKarakter && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCreateCbtWizard(k)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                    title="Buat Penilaian CBT dari TP ini"
                                  >
                                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                    <span>Buat CBT</span>
                                  </button>
                                )}
                                <button onClick={() => handleToggleVisible(k)} className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 text-xs font-bold ${k.is_nilai_visible ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                                   <IconEye on={k.is_nilai_visible} />
                                </button>
                                <button onClick={() => handleDeleteKomponen(k.id)} className="p-1.5 text-rose-500 border border-transparent hover:border-rose-200 bg-white hover:bg-rose-50 rounded-lg transition-colors"><IconTrash/></button>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                  {classKomponen.filter(k => k.bab_nama === selectedBabToManage).length === 0 && (
                    <div className="text-center p-6 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-sm">Tidak ada TP untuk kelas ini di BAB ini.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {selectedTpToManage && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-slate-800">
                  {isKarakterKomponen(editTpData.nama) ? 'Edit Nilai Karakter' : 'Edit Tujuan Pembelajaran'}
                </h3>
                {(() => {
                  const currentKomp = komponen.find(k => k.id === selectedTpToManage);
                  if (!currentKomp) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => handleToggleVisible(currentKomp)}
                      className={`px-2 py-0.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        currentKomp.is_nilai_visible
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={currentKomp.is_nilai_visible ? 'Nilai TP ini tampil ke siswa (Klik untuk sembunyikan)' : 'Nilai TP ini tersembunyi dari siswa (Klik untuk tampilkan)'}
                    >
                      <IconEye on={currentKomp.is_nilai_visible} />
                      <span>{currentKomp.is_nilai_visible ? 'Tampil di Siswa' : 'Disembunyikan'}</span>
                    </button>
                  );
                })()}
              </div>
              <button onClick={() => setSelectedTpToManage(null)} className="text-slate-400 hover:text-slate-600 p-1 bg-white rounded-md shadow-sm border border-slate-200"><IconClose /></button>
            </div>
            <div className="p-5 flex flex-col gap-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Target Kelas</label>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const tpBab = komponen.find(k => k.id === selectedTpToManage)?.bab_nama;
                    const editClasses = getAvailableClassesForBab(tpBab || selectedBabToManage);
                    return editClasses.map(c => {
                      const isSelected = editTpData.target_kelas.includes(c)
                      return (
                        <button key={c} type="button" onClick={() => toggleEditTpTargetKelas(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                          {c}
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Nama Komponen</label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    Terkunci untuk format Rapor
                  </span>
                </div>
                <input 
                  value={editTpData.nama} 
                  readOnly 
                  className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none cursor-not-allowed select-none" 
                />
                <p className="text-[11px] text-slate-400 mt-1">Nama komponen ini terikat ke sistem Rapor. Untuk mengubah urutan slot (misal TP 3 dipindah ke TP 1), gunakan tombol navigasi posisi pada modal Kelola BAB.</p>
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Deskripsi Rapor</label>
                <textarea value={editTpData.deskripsi} onChange={e => setEditTpData({...editTpData, deskripsi: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm min-h-[100px] resize-none outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Instruksi TP (Siswa)</label>
                <textarea value={editTpData.instruksi || ''} onChange={e => setEditTpData({...editTpData, instruksi: e.target.value})} placeholder="Instruksi tambahan, materi atau penjelasan untuk siswa..." className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm min-h-[100px] resize-none outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Lampiran (Gambar/PDF)</label>
                <div className="flex flex-col gap-3">
                  {(editTpData.lampiran_urls || []).map((url, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50">
                      <a href={url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:underline truncate max-w-[200px]">Lampiran {idx + 1}</a>
                      <button onClick={() => handleRemoveAttachment(idx)} className="text-rose-500 hover:text-rose-700 p-1">
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                  
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      onChange={handleUploadAttachment} 
                      disabled={uploadingAttachment}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                    />
                    <div className={`w-full py-2.5 px-4 border border-dashed rounded-xl text-center text-sm font-semibold transition-colors ${uploadingAttachment ? 'bg-slate-100 border-slate-300 text-slate-400' : 'bg-white border-indigo-300 text-indigo-600 hover:bg-indigo-50'}`}>
                      {uploadingAttachment ? 'Mengunggah...' : '+ Tambah Lampiran'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <button onClick={handleSaveEditTp} disabled={editTpData.target_kelas.length === 0} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
      
      {showTarikCbtModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-slide-up border border-slate-200 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Tarik Nilai dari Penilaian Digital (CBT)</h3>
                  <p className="text-xs text-slate-500">
                    Sinkronkan nilai hasil pengerjaan CBT peserta didik ke dalam kolom Tujuan Pembelajaran (TP)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTarikCbtModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Filter / Seleksi Sesi dan TP Tujuan */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                {/* 1. Pilih Sesi CBT */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-500 tracking-wider mb-1.5">
                    1. Pilih Penilaian CBT Sumber:
                  </label>
                  <select
                    value={selectedCbtSesiId}
                    onChange={(e) => handleSelectCbtSesi(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 shadow-2xs"
                  >
                    <option value="">-- Pilih Sesi Penilaian Digital --</option>
                    {cbtSesiList.map(sesi => (
                      <option key={sesi.id} value={sesi.id}>
                        {sesi.judul} ({sesi.mapel} • {sesi.kategori} • {sesi.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Pilih TP / Komponen Tujuan */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-500 tracking-wider mb-1.5">
                    2. Masukkan ke Tujuan Pembelajaran (TP):
                  </label>
                  <select
                    value={selectedCbtTargetKomponenId}
                    onChange={(e) => setSelectedCbtTargetKomponenId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 shadow-2xs"
                  >
                    <option value="">-- Pilih TP / Komponen Nilai --</option>
                    {classKomponen.map(k => (
                      <option key={k.id} value={k.id}>
                        {k.bab_nama ? `${k.bab_nama} - ` : ''}{k.nama} (Bobot: {k.bobot})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview Tabel Siswa & Nilai CBT */}
              {loadingCbtData ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="w-7 h-7 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                  <div>Memuat data peserta dan rekapan nilai CBT...</div>
                </div>
              ) : !selectedCbtSesiId ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Silakan pilih penilaian CBT di atas untuk melihat daftar nilai siswa.
                </div>
              ) : cbtPesertaPreview.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Tidak ada peserta didik di kelas {activeTabKelas} yang terdaftar pada sesi ujian ini.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-bold text-slate-700">
                      Daftar Peserta Didik ({cbtPesertaPreview.length} Siswa di Kelas {activeTabKelas}):
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPesertaNisns(cbtPesertaPreview.filter(p => p.cbtScore !== null).map(p => p.student.nisn))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                      >
                        Pilih Semua yang Ada Nilai
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedPesertaNisns([])}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                selectedPesertaNisns.length > 0 &&
                                selectedPesertaNisns.length === cbtPesertaPreview.filter(p => p.cbtScore !== null).length
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPesertaNisns(cbtPesertaPreview.filter(p => p.cbtScore !== null).map(p => p.student.nisn))
                                } else {
                                  setSelectedPesertaNisns([])
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </th>
                          <th className="p-3 w-12 text-center">No</th>
                          <th className="p-3">Nama Siswa</th>
                          <th className="p-3 w-28">NISN</th>
                          <th className="p-3 w-36 text-center">Status CBT</th>
                          <th className="p-3 w-28 text-center">Nilai CBT</th>
                          <th className="p-3 w-32 text-center">Nilai Saat Ini</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {cbtPesertaPreview.map((item, idx) => {
                          const hasScore = item.cbtScore !== null
                          const isChecked = selectedPesertaNisns.includes(item.student.nisn)
                          const willOverwrite = item.existingScore !== null && item.existingScore !== undefined

                          return (
                            <tr
                              key={item.student.nisn}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isChecked ? 'bg-indigo-50/30' : ''
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!hasScore}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPesertaNisns(prev => [...prev, item.student.nisn])
                                    } else {
                                      setSelectedPesertaNisns(prev => prev.filter(n => n !== item.student.nisn))
                                    }
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                                />
                              </td>
                              <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                              <td className="p-3 font-bold text-slate-800">{item.student.nama_lengkap}</td>
                              <td className="p-3 font-mono text-slate-500">{item.student.nisn}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  item.cbtStatus === 'selesai'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : item.cbtStatus === 'sedang_mengerjakan'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {item.cbtStatus === 'selesai' ? 'Selesai' : item.cbtStatus === 'sedang_mengerjakan' ? 'Sedang Tes' : 'Belum Mulai'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {hasScore ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs font-mono shadow-2xs">
                                    {item.cbtScore}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-mono">-</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {willOverwrite ? (
                                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-mono text-xs font-bold" title="Nilai lama akan diperbarui">
                                    {item.existingScore}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">Kosong</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                {selectedPesertaNisns.length} siswa terpilih untuk disinkronkan
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTarikCbtModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTarikCbt}
                  disabled={savingCbtScores || selectedPesertaNisns.length === 0 || !selectedCbtTargetKomponenId}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {savingCbtScores ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan Nilai...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Tarik & Simpan Nilai</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCbtWizardModal && (
        <CbtBuatPenilaianModal
          initialData={cbtWizardInitialData}
          onClose={() => {
            setShowCbtWizardModal(false)
            setCbtWizardInitialData(null)
          }}
          onSuccess={() => {
            setShowCbtWizardModal(false)
            setCbtWizardInitialData(null)
            alert('Penilaian CBT berhasil dibuat dan ditautkan ke TP!')
          }}
        />
      )}

      {/* Modal Kelola Nilai Karakter (NIK) SMP Budi Mulia */}
      {showKarakterModal && (
        <ModalKelolaNilaiKarakter
          isOpen={showKarakterModal}
          onClose={() => {
            setShowKarakterModal(false)
            setEditingKarakterKomponen(null)
          }}
          babNama={karakterModalBab}
          existingKomponen={editingKarakterKomponen}
          allKomponen={komponen}
          availableClasses={getAvailableClassesForBab(karakterModalBab)}
          onSave={handleSaveKarakterConfig}
          saving={savingKarakter}
        />
      )}

      {/* Modal Bantuan Panduan Penilaian Karakter (Afektif) SMP Budi Mulia */}
      {showRentangInfoModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Panduan Penilaian Karakter (Afektif)</h3>
                <p className="text-xs text-slate-500 font-medium">Pedoman resmi SMP Budi Mulia</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowRentangInfoModal(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 bg-white rounded-md shadow-2xs border border-slate-200 transition-colors cursor-pointer"
              >
                <IconClose />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-xs text-slate-700">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-700">
                <p className="font-bold text-slate-800 text-xs">Ketentuan Penilaian:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600 text-xs leading-relaxed">
                  <li>Penilaian karakter diobservasi saat pembelajaran di kelas dan dikaitkan dengan materi Bab.</li>
                  <li>Penilaian karakter cukup <strong>1 saja setiap BAB</strong>.</li>
                  <li>Usahakan setiap BAB memilih indikator sikap yang <strong>berbeda</strong>.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  Tabel B: Rentang Penilaian Sikap (Afektif)
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                        <th className="py-2 px-3 w-16">Predikat</th>
                        <th className="py-2 px-3 w-24">Rentang</th>
                        <th className="py-2 px-3 w-28">Kriteria</th>
                        <th className="py-2 px-3">Deskripsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {RENTANG_NILAI_KARAKTER.map(r => (
                        <tr key={r.predikat} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-bold text-slate-800">{r.predikat}</td>
                          <td className="py-2 px-3 font-mono font-semibold">{r.rentang}</td>
                          <td className="py-2 px-3 font-semibold text-slate-700">{r.kriteria}</td>
                          <td className="py-2 px-3 text-slate-500">{r.deskripsiKriteria}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">
                  8 Dimensi Karakter SMP Budi Mulia
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ELEMEN_KARAKTER.map(e => (
                    <div key={e.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-800 text-xs">
                        {e.nomor}. {e.nama}
                      </div>
                      <ul className="text-[11px] text-slate-600 space-y-0.5 pl-4 list-disc">
                        {e.subIndikator.map(s => (
                          <li key={s.id}>
                            <span className="font-semibold text-slate-700">{s.kode}. {s.nama}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button 
                type="button" 
                onClick={() => setShowRentangInfoModal(false)} 
                className="px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* ─── MODAL / OVERLAY TABLE FULLSCREEN ─────────────────────── */}
      {isTableFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9990] flex flex-col bg-slate-900 animate-fade-in select-none sm:select-auto pb-[env(safe-area-inset-bottom,0px)]">
          {/* Header Bar Layar Penuh */}
          <div className="px-3 sm:px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between shrink-0 gap-2 ios-fullscreen-header">
            {/* Kiri: Title & Context info */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs">
                ⛶
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-xs sm:text-sm text-white truncate">
                    {selectedMapelNama || 'Nilai Guru'}
                  </span>
                  <span className="text-[10px] sm:text-xs text-indigo-300 font-semibold px-1.5 py-0.2 bg-indigo-950/80 border border-indigo-800 rounded">
                    Sem. {selectedSemesterObj?.nomor || '1'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate hidden xs:block">
                  Mode Layar Penuh Tabel &bull; Tekan ESC untuk keluar
                </div>
              </div>
            </div>

            {/* Tengah/Kanan: Cepat ganti kelas + Zoom + Filter dropdown + Tombol Keluar */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Dropdown Pemilihan Kelas Cepat */}
              {activeTargetKelas.length > 0 && (
                <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                  <span className="text-[10px] font-bold text-slate-400 pl-2 pr-1 hidden sm:inline">Kelas:</span>
                  <select
                    value={activeTabKelas}
                    onChange={(e) => setActiveTabKelas(e.target.value)}
                    className="bg-transparent text-white font-bold text-xs py-1 px-2 rounded outline-none cursor-pointer"
                  >
                    {activeTargetKelas.map(c => (
                      <option key={c} value={c} className="bg-slate-900 text-white">
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Refresh Nilai */}
              <button
                type="button"
                onClick={() => fetchNilai(true)}
                disabled={refreshingNilai}
                className="p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                title="Muat ulang data nilai"
              >
                <div className={refreshingNilai ? 'animate-spin text-indigo-400' : ''}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <span className="hidden md:inline">Refresh</span>
              </button>

              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(70, tableZoom - 10)
                    setTableZoom(next)
                    localStorage.setItem('nilai_table_zoom', next)
                  }}
                  className="px-2 py-1 hover:bg-slate-700 rounded-l-lg cursor-pointer"
                  title="Perkecil Tabel"
                >
                  -
                </button>
                <span className="px-1 text-[11px] font-bold text-slate-200">{tableZoom}%</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(130, tableZoom + 10)
                    setTableZoom(next)
                    localStorage.setItem('nilai_table_zoom', next)
                  }}
                  className="px-2 py-1 hover:bg-slate-700 rounded-r-lg cursor-pointer"
                  title="Perbesar Tabel"
                >
                  +
                </button>
              </div>

              {/* Tombol Filter & Opsi Lengkap (Popover) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowFsFilterDropdown(prev => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    showFsFilterDropdown
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Buka menu filter dan kontrol tabel"
                >
                  <span>⚙️ Filter & Opsi</span>
                  {missingDescribedAudit.count > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                  <svg className={`w-3.5 h-3.5 transition-transform ${showFsFilterDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu Popover */}
                {showFsFilterDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3.5 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span>⚙️ Filter & Pengaturan</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFsFilterDropdown(false)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                      >
                        <IconClose />
                      </button>
                    </div>

                    {/* Toggle NISN di Layar Penuh */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-bold text-slate-700">Tampilkan Kolom NISN</span>
                        <input
                          type="checkbox"
                          checked={showNisnMobile}
                          onChange={(e) => handleToggleNisn(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </label>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Sembunyikan NISN agar kolom nilai memiliki ruang lebih luas di layar.
                      </p>
                    </div>

                    {/* KKM & Zoom Skala */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">KKM:</label>
                        <input
                          type="number"
                          value={kkm}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setKkm(val)
                            localStorage.setItem('nilai_kkm', val)
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-black text-center text-slate-800"
                        />
                      </div>
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Skala Zoom:</label>
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(70, tableZoom - 10)
                              setTableZoom(next)
                              localStorage.setItem('nilai_table_zoom', next)
                            }}
                            className="w-7 h-6 bg-white border border-slate-200 hover:bg-slate-100 rounded text-xs font-bold flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold font-mono text-indigo-700">{tableZoom}%</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(130, tableZoom + 10)
                              setTableZoom(next)
                              localStorage.setItem('nilai_table_zoom', next)
                            }}
                            className="w-7 h-6 bg-white border border-slate-200 hover:bg-slate-100 rounded text-xs font-bold flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Filter Audit Nilai Kosong */}
                    {missingDescribedAudit.count > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setFilterOnlyMissing(prev => !prev)}
                          className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between border transition-all cursor-pointer ${
                            filterOnlyMissing
                              ? 'bg-rose-600 text-white border-rose-700'
                              : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          <span>🔍 Filter Siswa Belum Lengkap</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-white text-rose-700 shadow-2xs">
                            {missingDescribedAudit.studentCount}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Rapor PTS Rombel */}
                    {raporSettings.status_rapor_pts === 'buka' && activeTabKelas && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const currentSelected = configAkhir?.bobot_detail?.pts_selected_babs || []
                            if (currentSelected.length > 0) {
                              setTempSelectedPtsBabs(currentSelected)
                            } else {
                              setTempSelectedPtsBabs(rombelRegularBabs.slice(0, raporSettings.rapor_max_lingkup))
                            }
                            setShowPtsSelectionModal(true)
                            setShowFsFilterDropdown(false)
                          }}
                          className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between border cursor-pointer ${
                            configAkhir?.bobot_detail?.pts_confirmed
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-500 text-white border-amber-600'
                          }`}
                        >
                          <span className="truncate">Rapor PTS: {configAkhir?.bobot_detail?.pts_confirmed ? 'Terkonfirmasi' : 'Pilih Lingkup PTS'}</span>
                          <span className="text-[10px] underline ml-1 shrink-0">Ubah</span>
                        </button>
                      </div>
                    )}

                    {/* Kelola Bab & Nilai Akhir */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNewBabTargetKelas(activeTabKelas ? [activeTabKelas] : [])
                          setShowAddBab(true)
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <IconPlus />
                        <span>Kelola Bab</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowConfigAkhirModal(true)
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span>Nilai Akhir</span>
                      </button>
                    </div>

                    {/* Tombol Aksi Tambahan: Tarik CBT, Export, Upload, Panduan NIK */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenTarikCbtModal()
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Tarik CBT</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExportClasses(activeTargetKelas)
                          setShowExportModal(true)
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <IconDownload />
                        <span>Export</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          uploadRef.current?.click()
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <IconUpload />
                        <span>Upload</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRentangInfoModal(true)
                          setShowFsFilterDropdown(false)
                        }}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>📖 NIK</span>
                        <span>Panduan</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tombol Keluar Layar Penuh */}
              <button
                type="button"
                onClick={() => setIsTableFullscreen(false)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari mode layar penuh (ESC)"
              >
                <span>✕</span>
                <span className="hidden xs:inline">Keluar</span>
              </button>
            </div>
          </div>

          {/* Body Tabel Layar Penuh */}
          <div className="flex-1 min-h-0 bg-white flex flex-col relative overflow-hidden">
            {/* Banner Error / Syncing jika ada */}
            {Object.keys(errorCells).length > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span><strong>{Object.keys(errorCells).length} sel</strong> gagal tersimpan.</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetryAllFailedCells}
                  className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  Coba Simpan Ulang
                </button>
              </div>
            )}
            {isSyncingPending && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 border-b border-sky-200 text-[11px] font-semibold text-sky-700 shrink-0">
                <div className="w-3 h-3 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
                <span>Menyinkronkan data nilai offline...</span>
              </div>
            )}

            {/* Tabel Konten Render */}
            {renderTableContent(true)}
          </div>
        </div>,
        document.body
      )}

      {/* ─── FLOATING LAUNCHER BUTTON (SAAT KEYPAD DITUTUP) ───────── */}
      {!showFloatingKeypad && activeTargetKelas.length > 0 && typeof document !== 'undefined' && createPortal(
        <button
          type="button"
          onClick={() => {
            setShowFloatingKeypad(true)
            setIsKeypadMinimized(false)
          }}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] z-[9992] px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-95 text-white rounded-2xl shadow-xl border border-indigo-400 font-extrabold text-xs flex items-center gap-2 cursor-pointer transition-all select-none"
          title="Buka Keypad Layar & Navigasi Panah"
        >
          <span className="text-base">🔢</span>
          <span>Keypad Nilai</span>
        </button>,
        document.body
      )}

      {/* ─── FLOATING KEYPAD & D-PAD WIDGET (PORTAL) ───────────────── */}
      {showFloatingKeypad && typeof document !== 'undefined' && createPortal(
        isKeypadMinimized ? (
          /* Tampilan Minimized (Pill Mini) */
          <div
            style={{ right: `${keypadPos.x}px`, bottom: `${keypadPos.y}px` }}
            className="fixed z-[9995] bg-slate-900/95 text-white backdrop-blur-xl border border-slate-700/80 rounded-2xl px-2.5 py-1.5 shadow-2xl flex items-center gap-2 cursor-grab active:cursor-grabbing select-none active:scale-95 transition-transform"
            onMouseDown={handleKeypadDragStart}
            onTouchStart={handleKeypadDragStart}
            onDoubleClick={() => setKeypadPos({ x: 16, y: 80 })}
            onClick={() => setIsKeypadMinimized(false)}
          >
            <span className="text-slate-400 font-black text-xs">⋮⋮</span>
            <span className="text-[11px] font-bold text-slate-300 truncate max-w-[80px]">
              {activeCellInfo ? activeCellInfo.student.nama_lengkap.split(' ')[0] : 'Nilai'}
            </span>
            <span className="font-mono font-black text-xs px-1.5 py-0.2 rounded bg-amber-400 text-slate-900">
              {activeCellInfo?.value ? activeCellInfo.value : '—'}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsKeypadMinimized(false); }}
              className="text-[10px] text-indigo-400 hover:text-white font-bold ml-0.5 cursor-pointer"
            >
              ▲
            </button>
          </div>
        ) : (
          /* Tampilan Kompak Ramping: Langsung Nama & Nilai di Header, Numpad 4 Kolom, D (Delete) samping 9, Panah di bawah */
          <div
            style={{ right: `${keypadPos.x}px`, bottom: `${keypadPos.y}px` }}
            className="fixed z-[9995] w-[215px] sm:w-[225px] bg-slate-900/95 text-white backdrop-blur-2xl border border-slate-700/80 rounded-2xl p-2 shadow-2xl flex flex-col select-none transition-shadow"
          >
            {/* Header Ramping: Drag Handle + Nama Siswa + Nilai + Minimize + Close */}
            <div
              className="flex items-center justify-between gap-1 pb-1.5 mb-1.5 border-b border-slate-800 cursor-grab active:cursor-grabbing touch-none"
              onMouseDown={handleKeypadDragStart}
              onTouchStart={handleKeypadDragStart}
              onDoubleClick={() => setKeypadPos({ x: 16, y: 80 })}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-black text-xs cursor-grab shrink-0">⋮⋮</span>
                <span className="font-bold text-[11px] text-white truncate max-w-[95px]" title={activeCellInfo ? `${activeCellInfo.student.nama_lengkap} (${activeCellInfo.komponen.nama})` : 'Pilih Sel'}>
                  {activeCellInfo ? `${activeCellInfo.student.nama_lengkap.split(' ')[0]} • ${activeCellInfo.komponen.nama}` : 'Pilih Sel'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono font-black text-xs px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 leading-none shadow-2xs">
                  {activeCellInfo?.value ? activeCellInfo.value : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => setKeypadPos({ x: 16, y: 80 })}
                  className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 text-[11px] font-bold cursor-pointer"
                  title="Kembalikan Posisi Keypad ke Semula (Reset)"
                >
                  ↺
                </button>
                <button
                  type="button"
                  onClick={() => setIsKeypadMinimized(true)}
                  className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[10px] font-bold cursor-pointer"
                  title="Kecilkan"
                >
                  🗕
                </button>
                <button
                  type="button"
                  onClick={() => setShowFloatingKeypad(false)}
                  className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 text-[11px] font-bold cursor-pointer"
                  title="Tutup"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tombol Angka (4 Kolom Ramping) */}
            <div className="grid grid-cols-4 gap-1 mb-1">
              {[
                { label: '7', val: 7 },
                { label: '8', val: 8 },
                { label: '9', val: 9 },
                { label: 'D', val: 'BACKSPACE', cls: 'bg-rose-950/70 hover:bg-rose-900 text-rose-300 border-rose-800' },
                { label: '4', val: 4 },
                { label: '5', val: 5 },
                { label: '6', val: 6 },
                { label: 'C', val: 'CLEAR', cls: 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' },
                { label: '1', val: 1 },
                { label: '2', val: 2 },
                { label: '3', val: 3 },
                { label: '100', val: '100', cls: 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border-emerald-800 text-[10px] font-black' },
                { label: '0', val: 0 },
                { label: 'KKM', val: 'KKM', cls: 'bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border-indigo-800 text-[10px] font-bold' },
                { label: '—', val: 'CLEAR', cls: 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700 text-xs' },
                { label: '↵', val: 'ENTER', isNav: true, cls: 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 font-black text-xs' },
              ].map((btn, bIdx) => (
                <button
                  key={bIdx}
                  type="button"
                  onClick={() => {
                    if (btn.isNav) {
                      handleKeypadNavigate('DOWN');
                    } else {
                      handleKeypadPress(btn.val);
                    }
                  }}
                  className={`h-8 flex items-center justify-center rounded-lg font-bold border transition-all active:scale-95 cursor-pointer shadow-xs select-none ${
                    btn.cls || 'bg-slate-800/90 hover:bg-slate-700 text-white border-slate-700 text-sm'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Navigasi Panah (4 Tombol Sejajar: Kiri, Atas, Bawah, Kanan) */}
            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleKeypadNavigate('LEFT')}
                className="h-7 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-black cursor-pointer active:scale-95 shadow-xs"
                title="TP Sebelumnya (Kiri)"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => handleKeypadNavigate('UP')}
                className="h-7 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-black cursor-pointer active:scale-95 shadow-xs"
                title="Siswa Sebelumnya (Atas)"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleKeypadNavigate('DOWN')}
                className="h-7 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white rounded-lg flex items-center justify-center text-xs font-black cursor-pointer active:scale-95 shadow-xs"
                title="Siswa Berikutnya (Bawah / Enter)"
              >
                ▼
              </button>
              <button
                type="button"
                onClick={() => handleKeypadNavigate('RIGHT')}
                className="h-7 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center text-xs font-black cursor-pointer active:scale-95 shadow-xs"
                title="TP Berikutnya (Kanan)"
              >
                ▶
              </button>
            </div>
          </div>
        ),
        document.body
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; border: 3px solid #f8fafc; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #94a3b8; }
                input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.3s ease-out forwards; }
      `}} />
    </div>
  )
}

// FORCE HMR 2

// FORCE HMR 1782522827.4436662
