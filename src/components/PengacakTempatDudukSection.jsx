import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'

// ─── Gender heuristic ─────────────────────────────────────────────────────────
const NAMA_L = ['ahmad','muhammad','muhamad','andi','budi','deni','didi','fajar','hendra','ilham','irfan','joko','kevin','luki','made','niko','putra','rafi','raka','rama','reza','rio','rizki','rizky','satria','wahyu','wibowo','yoga','yudi','yusuf','zaki','dimas','galih','gilang','guntur','hafiz','haikal','hanif','ilman','imam','jafar','lutfi','maul','nanda','naufal','okta','pandu','rangga','reno','ridho','rifky','rivan','robby','robi','rohmat','sandi','sony','sultan','surya','tama','taufik','triyo','umar','vino','wafi','widi','willy','yogi']
const NAMA_P = ['aini','aisa','alfi','alya','amelia','ami','annisa','annisya','ayu','bunga','cantika','citra','dea','desi','devi','dewi','diah','dini','elsa','elza','ema','fatimah','fina','fitri','fitria','hana','hani','indah','intan','isna','julia','kania','laila','lela','lena','lia','lina','lisa','mawar','mia','nadia','nadya','nanda','nani','naomi','nisa','nita','noor','novi','novia','nur','nurul','nyoman','oka','olivia','putri','rahma','ranti','rara','ratna','rika','rini','risa','risma','rita','rizka','rohma','sari','sela','selvi','septy','shinta','silvia','sinta','siti','sofi','suci','sulis','sulistya','syifa','tika','tina','titin','tri','triana','ulfa','vina','wahyuni','wati','widya','wuri','yanti','yeni','yesi','yuli','yunita','yusri','zara','zahra']

function guessGender(name) {
  if (!name) return null
  const parts = name.toLowerCase().split(' ')
  for (const part of parts) {
    if (NAMA_L.some(n => part.includes(n) || n.includes(part))) return 'L'
    if (NAMA_P.some(n => part.includes(n) || n.includes(part))) return 'P'
  }
  return null
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconShuffle = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
  </svg>
)
const IconPrint = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
)
const IconLock = ({ cls }) => (
  <svg className={cls || 'w-3.5 h-3.5'} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const IconUnlock = ({ cls }) => (
  <svg className={cls || 'w-3.5 h-3.5'} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
  </svg>
)
const IconEdit = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconPin = () => (
  <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
  </svg>
)
const IconFullscreen = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
)
const IconExitFullscreen = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/>
  </svg>
)

const GENDER_RULES = [
  { id: 'none', label: 'Tanpa aturan gender', sub: 'Semua siswa diacak bebas ke seluruh kursi.' },
  { id: 'left-P-right-L', label: 'Kiri Perempuan – Kanan Laki-laki', sub: 'Sisi kiri tiap meja untuk Perempuan, kanan untuk Laki-laki.' },
  { id: 'left-L-right-P', label: 'Kiri Laki-laki – Kanan Perempuan', sub: 'Sisi kiri tiap meja untuk Laki-laki, kanan untuk Perempuan.' },
]

const emptyCell = () => ({ left: null, right: null, leftFixed: false, rightFixed: false, leftLocked: false, rightLocked: false })

export default function PengacakTempatDudukSection({ waliStudents = [], activeTaData, session }) {
  // ─── Load Google Fonts Kalam & Caveat dynamically ─────────────────────────
  useEffect(() => {
    const linkId = 'google-fonts-chalkboard'
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Caveat:wght@600;700&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  // ─── Kelas filter ──────────────────────────────────────────────────────────
  const uniqueKelas = useMemo(() => [...new Set(waliStudents.map(s => s.kelas).filter(Boolean))].sort(), [waliStudents])
  const [selectedKelas, setSelectedKelas] = useState('')

  useEffect(() => {
    if (uniqueKelas.length > 0 && !selectedKelas) setSelectedKelas(uniqueKelas[0])
  }, [uniqueKelas, selectedKelas])

  const storageKey = `pengacak_v3_${session?.id || 'x'}_${selectedKelas}`

  // ─── Core state ───────────────────────────────────────────────────────────
  const [students, setStudents] = useState([]) // { id, nisn, name, gender, nickname }
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(5)
  const [genderRule, setGenderRule] = useState('none')
  const [seatGrid, setSeatGrid] = useState(null)
  const [leftoverIds, setLeftoverIds] = useState([])
  const [displayMode, setDisplayMode] = useState('name') // 'name' | 'absen'
  const [animating, setAnimating] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Nickname edit
  const [editingNickname, setEditingNickname] = useState(null)
  const [nicknameInput, setNicknameInput] = useState('')

  // Seat modal
  const [seatModal, setSeatModal] = useState(null)
  const [popSearch, setPopSearch] = useState('')

  // ─── Computed ─────────────────────────────────────────────────────────────
  const studentsById = useMemo(() => { const m = {}; students.forEach(s => { m[s.id] = s }); return m }, [students])

  const absenMap = useMemo(() => {
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, 'id'))
    const m = {}; sorted.forEach((s, i) => { m[s.nisn] = i + 1 }); return m
  }, [students])

  const availableSeats = useMemo(() => {
    if (!seatGrid) return rows * cols * 2
    let locked = 0
    seatGrid.forEach(row => row.forEach(cell => {
      if (cell.leftLocked) locked++
      if (cell.rightLocked) locked++
    }))
    return rows * cols * 2 - locked
  }, [seatGrid, rows, cols])

  const filteredStudents = useMemo(() => {
    if (!searchQ) return students
    const q = searchQ.toLowerCase()
    return students.filter(s => s.name.toLowerCase().includes(q) || s.nisn.includes(q) || (s.nickname || '').toLowerCase().includes(q))
  }, [students, searchQ])

  const popStudents = useMemo(() => {
    if (!popSearch) return students
    const q = popSearch.toLowerCase()
    return students.filter(s => s.name.toLowerCase().includes(q) || s.nisn.includes(q) || (s.nickname || '').toLowerCase().includes(q))
  }, [students, popSearch])

  // ─── Load from localStorage ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedKelas) return
    const kelasStudents = waliStudents.filter(s => s.kelas === selectedKelas)
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const p = JSON.parse(saved)
        const savedMap = {}
        ;(p.students || []).forEach(s => { savedMap[s.nisn] = s })
        const merged = kelasStudents.map(s => ({
          id: s.nisn, nisn: s.nisn, name: s.nama_lengkap,
          gender: savedMap[s.nisn]?.gender !== undefined ? savedMap[s.nisn].gender : (s.jenis_kelamin || guessGender(s.nama_lengkap)),
          nickname: savedMap[s.nisn]?.nickname || ''
        }))
        setStudents(merged)
        setCols(p.cols ?? 4)
        setRows(p.rows ?? Math.max(1, Math.ceil(merged.length / 8)))
        setGenderRule(p.genderRule ?? 'none')
        setSeatGrid(p.seatGrid ?? null)
        setLeftoverIds(p.leftoverIds ?? [])
        setDisplayMode(p.displayMode ?? 'name')
        return
      } catch { /* fall through */ }
    }
    const fresh = kelasStudents.map(s => ({
      id: s.nisn, nisn: s.nisn, name: s.nama_lengkap,
      gender: s.jenis_kelamin || guessGender(s.nama_lengkap),
      nickname: ''
    }))
    setStudents(fresh)
    setCols(4)
    setRows(Math.max(1, Math.ceil(fresh.length / 8)))
    setGenderRule('none')
    setSeatGrid(null)
    setLeftoverIds([])
    setDisplayMode('name')
  }, [selectedKelas, waliStudents, storageKey])

  // ─── Save to localStorage ─────────────────────────────────────────────────
  const save = useCallback(() => {
    if (!selectedKelas || !students.length) return
    localStorage.setItem(storageKey, JSON.stringify({ students, cols, rows, genderRule, seatGrid, leftoverIds, displayMode }))
  }, [storageKey, students, cols, rows, genderRule, seatGrid, leftoverIds, displayMode, selectedKelas])

  useEffect(() => { save() }, [save])

  // ─── Student handlers ─────────────────────────────────────────────────────
  const setGender = (nisn, val) => setStudents(prev => prev.map(s => s.nisn === nisn ? { ...s, gender: val } : s))
  const startEditNickname = s => { setEditingNickname(s.nisn); setNicknameInput(s.nickname || '') }
  const saveNickname = nisn => {
    setStudents(prev => prev.map(s => s.nisn === nisn ? { ...s, nickname: nicknameInput.trim() } : s))
    setEditingNickname(null)
  }
  const autoRows = () => setRows(Math.max(1, Math.ceil(students.length / (cols * 2))))

  // ─── Ensure seatGrid matches dimensions ──────────────────────────────────
  const ensureGrid = useCallback((r, c, existing) => {
    return Array.from({ length: r }, (_, ri) =>
      Array.from({ length: c }, (_, ci) => existing?.[ri]?.[ci] || emptyCell())
    )
  }, [])

  // ─── Seat grid helpers ────────────────────────────────────────────────────
  const getCell = (r, c) => seatGrid?.[r]?.[c] || emptyCell()

  const pinStudent = (r, c, side, studentId) => {
    setSeatGrid(prev => {
      const grid = ensureGrid(rows, cols, prev)
      if (studentId) {
        for (let ri = 0; ri < grid.length; ri++) {
          for (let ci = 0; ci < grid[ri].length; ci++) {
            const cell = grid[ri][ci]
            if (cell.left === studentId) grid[ri][ci] = { ...cell, left: null, leftFixed: false }
            if (cell.right === studentId) grid[ri][ci] = { ...cell, right: null, rightFixed: false }
          }
        }
      }
      const cell = grid[r][c]
      if (side === 'left') grid[r][c] = { ...cell, left: studentId, leftFixed: !!studentId }
      else grid[r][c] = { ...cell, right: studentId, rightFixed: !!studentId }
      return grid
    })
    setLeftoverIds(prev => prev.filter(id => id !== studentId))
  }

  const toggleLock = (r, c, side) => {
    setSeatGrid(prev => {
      const grid = ensureGrid(rows, cols, prev)
      const cell = grid[r][c]
      if (side === 'left') {
        const willLock = !cell.leftLocked
        grid[r][c] = { ...cell, leftLocked: willLock, left: willLock ? null : cell.left, leftFixed: willLock ? false : cell.leftFixed }
      } else {
        const willLock = !cell.rightLocked
        grid[r][c] = { ...cell, rightLocked: willLock, right: willLock ? null : cell.right, rightFixed: willLock ? false : cell.rightFixed }
      }
      return grid
    })
  }

  // ─── Generate seating ─────────────────────────────────────────────────────
  const generateSeating = useCallback(() => {
    const grid = ensureGrid(rows, cols, seatGrid)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c]
        grid[r][c] = {
          left: cell.leftFixed ? cell.left : null,
          right: cell.rightFixed ? cell.right : null,
          leftFixed: cell.leftFixed,
          rightFixed: cell.rightFixed,
          leftLocked: cell.leftLocked,
          rightLocked: cell.rightLocked,
        }
      }
    }

    const fixedIds = new Set()
    grid.forEach(row => row.forEach(cell => {
      if (cell.leftFixed && cell.left) fixedIds.add(cell.left)
      if (cell.rightFixed && cell.right) fixedIds.add(cell.right)
    }))

    let remaining = students.filter(s => !fixedIds.has(s.id))

    const emptySeats = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c].leftFixed && !grid[r][c].leftLocked) emptySeats.push({ r, c, side: 'left' })
        if (!grid[r][c].rightFixed && !grid[r][c].rightLocked) emptySeats.push({ r, c, side: 'right' })
      }

    let leftover = []

    if (genderRule === 'none') {
      const pool = shuffle(remaining)
      const seats = shuffle(emptySeats)
      const n = Math.min(pool.length, seats.length)
      for (let i = 0; i < n; i++) {
        const seat = seats[i]
        if (seat.side === 'left') grid[seat.r][seat.c].left = pool[i].id
        else grid[seat.r][seat.c].right = pool[i].id
      }
      leftover = pool.slice(n)
    } else {
      const leftG = genderRule === 'left-P-right-L' ? 'P' : 'L'
      const rightG = leftG === 'P' ? 'L' : 'P'
      const leftSeats = shuffle(emptySeats.filter(s => s.side === 'left'))
      const rightSeats = shuffle(emptySeats.filter(s => s.side === 'right'))
      const leftPool = shuffle(remaining.filter(s => s.gender === leftG))
      const rightPool = shuffle(remaining.filter(s => s.gender === rightG))
      const otherPool = shuffle(remaining.filter(s => s.gender !== leftG && s.gender !== rightG))

      let li = 0, ri = 0
      for (; li < leftSeats.length && li < leftPool.length; li++) grid[leftSeats[li].r][leftSeats[li].c].left = leftPool[li].id
      for (; ri < rightSeats.length && ri < rightPool.length; ri++) grid[rightSeats[ri].r][rightSeats[ri].c].right = rightPool[ri].id

      const remSeats = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!grid[r][c].left && !grid[r][c].leftFixed && !grid[r][c].leftLocked) remSeats.push({ r, c, side: 'left' })
        if (!grid[r][c].right && !grid[r][c].rightFixed && !grid[r][c].rightLocked) remSeats.push({ r, c, side: 'right' })
      }
      const remPool = shuffle([...leftPool.slice(li), ...rightPool.slice(ri), ...otherPool])
      const seats2 = shuffle(remSeats)
      const n = Math.min(remPool.length, seats2.length)
      for (let i = 0; i < n; i++) {
        if (seats2[i].side === 'left') grid[seats2[i].r][seats2[i].c].left = remPool[i].id
        else grid[seats2[i].r][seats2[i].c].right = remPool[i].id
      }
      leftover = remPool.slice(n)
    }

    setSeatGrid(grid)
    setLeftoverIds(leftover.map(s => s.id))
  }, [rows, cols, seatGrid, students, genderRule, ensureGrid])

  // ESC Listener to exit Fullscreen
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  // Ref tracking seatModal state for the Enter key listener
  const seatModalRef = useRef(seatModal)
  useEffect(() => {
    seatModalRef.current = seatModal
  }, [seatModal])

  // Keydown & Keyup Event Listener for holding Enter
  const generateRef = useRef(generateSeating)
  useEffect(() => {
    generateRef.current = generateSeating
  }, [generateSeating])

  useEffect(() => {
    let intervalId = null
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        if (seatModalRef.current) return // Ignore if student modal is open
        e.preventDefault()
        if (intervalId) return
        setAnimating(true)
        generateRef.current()
        intervalId = setInterval(() => {
          generateRef.current()
        }, 90)
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Enter') {
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
        setAnimating(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  // ─── Display name helper ──────────────────────────────────────────────────
  const getDisplayName = (studentId) => {
    const s = studentsById[studentId]
    if (!s) return '?'
    if (displayMode === 'absen') return `No. ${absenMap[s.nisn] || '?'}`
    return s.nickname || s.name
  }

  // ─── Seat Modal helpers ───────────────────────────────────────────────────
  const openModal = (r, c, side) => { setSeatModal({ r, c, side }); setPopSearch('') }
  const closeModal = () => setSeatModal(null)

  const modalCell = seatModal ? getCell(seatModal.r, seatModal.c) : null
  const modalStudentId = seatModal
    ? (seatModal.side === 'left' ? modalCell?.left : modalCell?.right) || null
    : null
  const modalFixed = seatModal
    ? (seatModal.side === 'left' ? modalCell?.leftFixed : modalCell?.rightFixed)
    : false
  const modalLocked = seatModal
    ? (seatModal.side === 'left' ? modalCell?.leftLocked : modalCell?.rightLocked)
    : false

  // ─── SeatCard (Sized dynamically for massive projection visibility) ───────
  const SeatCard = ({ r, c, side }) => {
    const cell = getCell(r, c)
    const locked = side === 'left' ? cell.leftLocked : cell.rightLocked
    const fixed = side === 'left' ? cell.leftFixed : cell.rightFixed
    const studentId = side === 'left' ? cell.left : cell.right

    // Locked Seat (Chalkboard style)
    if (locked) return (
      <button onClick={() => openModal(r, c, side)}
        className={`flex-1 rounded bg-white/10 hover:bg-white/20 border border-dashed border-white/20 flex flex-col items-center justify-center gap-0.5 transition-all group ${
          isFullscreen ? 'min-h-[82px] py-2' : 'min-h-[58px] py-1.5'
        }`}
      >
        <IconLock cls={`${isFullscreen ? 'w-5 h-5' : 'w-3.5 h-3.5'} text-white/55 group-hover:text-white`} />
        <span className={`${isFullscreen ? 'text-xs' : 'text-[9px]'} text-white/45 group-hover:text-white/80 font-medium font-sans`}>Locked</span>
      </button>
    )

    // Empty Seat
    if (!studentId) return (
      <button onClick={() => openModal(r, c, side)}
        className={`flex-1 rounded bg-white/5 hover:bg-white/15 border border-dashed border-white/10 flex items-center justify-center transition-colors group ${
          isFullscreen ? 'min-h-[82px]' : 'min-h-[58px]'
        }`}
      >
        <span className={`text-white/20 group-hover:text-white/60 font-bold leading-none ${
          isFullscreen ? 'text-2xl' : 'text-lg'
        }`}>+</span>
      </button>
    )

    const s = studentsById[studentId]
    if (!s) return null
    const displayName = getDisplayName(studentId)
    // Less aggressive truncation in fullscreen
    const maxLen = isFullscreen ? 16 : 11
    const shortName = displayName.length > maxLen ? displayName.slice(0, maxLen - 1) + '…' : displayName

    return (
      <button onClick={() => openModal(r, c, side)}
        style={{ backgroundColor: '#fffdf7', color: '#2a2a26' }}
        className={`flex-1 rounded shadow flex flex-col items-center justify-center gap-0.5 hover:scale-[1.03] transition-all group relative ${
          isFullscreen ? 'min-h-[82px] px-2 py-2.5' : 'min-h-[58px] px-1.5 py-1.5'
        }`}
      >
        {fixed && (
          <div className={`absolute top-0.5 right-1 font-bold ${isFullscreen ? 'scale-125 top-1 right-1.5' : ''}`}>
            <IconPin />
          </div>
        )}
        <span className={`font-bold text-center leading-tight tracking-wide ${
          isFullscreen ? 'text-[14px] md:text-[15px]' : 'text-[11.5px]'
        }`}>{shortName}</span>
        {displayMode === 'name' && s.gender && (
          <span
            style={{
              backgroundColor: s.gender === 'L' ? '#8fbdd8' : '#e9a3b8',
              color: s.gender === 'L' ? '#1b3c50' : '#5b2333'
            }}
            className={`font-bold rounded leading-none shrink-0 ${
              isFullscreen ? 'text-[10px] px-2 py-0.5 mt-1' : 'text-[8.5px] px-1.5 py-px mt-0.5'
            }`}>
            {s.gender}
          </span>
        )}
      </button>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pengacak Tempat Duduk</h2>
          <p className="text-slate-500 text-sm mt-1">Sistem denah interaktif bergaya papan tulis kelas.</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
          <button onClick={() => setDisplayMode('name')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${displayMode === 'name' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Tampilkan Nama
          </button>
          <button onClick={() => setDisplayMode('absen')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${displayMode === 'absen' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            No. Absen
          </button>
        </div>
      </div>

      {/* Kelas selector */}
      {uniqueKelas.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pilih Kelas</p>
          <div className="flex flex-wrap gap-2">
            {uniqueKelas.map(k => (
              <button key={k} onClick={() => setSelectedKelas(k)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${selectedKelas === k ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ATAS: Panel Pengaturan ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {/* Card 1: Data Siswa */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              Data Siswa
            </h3>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${students.length > availableSeats ? 'bg-red-100 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {availableSeats} kursi
            </span>
          </div>

          <div className="relative mb-2">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Cari siswa..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50" />
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-50">
                {filteredStudents.map(s => (
                  <tr key={s.nisn} className="hover:bg-slate-50/70 group">
                    <td className="px-2 py-1.5 text-slate-400 w-6">{absenMap[s.nisn]}</td>
                    <td className="px-2 py-1.5">
                      {editingNickname === s.nisn ? (
                        <div className="flex gap-1 items-center">
                          <input autoFocus value={nicknameInput} onChange={e => setNicknameInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveNickname(s.nisn); if (e.key === 'Escape') setEditingNickname(null) }}
                            placeholder="Panggilan..." maxLength={20}
                            className="flex-1 px-1.5 py-0.5 text-xs rounded border border-indigo-300 focus:outline-none" />
                          <button onClick={() => saveNickname(s.nisn)} className="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">✓</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="truncate">
                            <div className="font-medium text-slate-800 truncate">{s.name}</div>
                            {s.nickname && <div className="text-indigo-500 text-[10px]">"{s.nickname}"</div>}
                          </div>
                          <button onClick={() => startEditNickname(s)}
                            className="ml-auto opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-500">
                            <IconEdit />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 w-16">
                      <div className="flex gap-0.5">
                        <button onClick={() => setGender(s.nisn, s.gender === 'L' ? null : 'L')}
                          style={{
                            backgroundColor: s.gender === 'L' ? '#8fbdd8' : '',
                            color: s.gender === 'L' ? '#1b3c50' : '#cbd5e1'
                          }}
                          className={`px-1 py-0.5 rounded text-[9px] font-bold border transition-all ${s.gender === 'L' ? 'border-blue-300' : 'bg-white border-slate-200'}`}>L</button>
                        <button onClick={() => setGender(s.nisn, s.gender === 'P' ? null : 'P')}
                          style={{
                            backgroundColor: s.gender === 'P' ? '#e9a3b8' : '',
                            color: s.gender === 'P' ? '#5b2333' : '#cbd5e1'
                          }}
                          className={`px-1 py-0.5 rounded text-[9px] font-bold border transition-all ${s.gender === 'P' ? 'border-pink-300' : 'bg-white border-slate-200'}`}>P</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Tata Letak Meja */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">2</span>
              Tata Letak Meja
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Jumlah Kolom</label>
                <input type="number" min="1" max="12" value={cols} onChange={e => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Jumlah Baris</label>
                <input type="number" min="1" max="15" value={rows} onChange={e => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
            </div>
          </div>
          <div>
            <button onClick={autoRows}
              className="w-full py-2 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
              ⚡ Hitung Otomatis Baris Meja
            </button>
            {students.length > availableSeats && (
              <div className="mt-2 text-[10px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-2 py-1 leading-tight">
                ⚠️ Siswa ({students.length}) melebihi kursi ({availableSeats}).
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Aturan & Shuffle Trigger */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
              Aturan Gender
            </h3>
            <select value={genderRule} onChange={e => setGenderRule(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {GENDER_RULES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <button onClick={generateSeating} disabled={students.length === 0}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2">
              <IconShuffle />
              Acak Denah (Tahan Enter)
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              💡 Tekan & **Tahan Tombol Enter** di keyboard untuk efek acak terus-menerus!
            </p>
          </div>
        </div>
      </div>

      {/* ── BAWAH: Denah Chalkboard Kelas ── */}
      <div className="flex flex-col gap-4">
        <div
          style={{
            background: 'linear-gradient(180deg, #2d5445 0%, #1e3a2f 100%)',
            border: '8px solid #7d5228',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
          }}
          className="rounded-2xl p-4 select-none relative"
          id="seating-chart-print"
        >
          {/* Header Denah / Fullscreen open */}
          <div className="w-full flex justify-between items-center mb-6 max-w-4xl px-2">
            <span
              style={{ fontFamily: "'Caveat', cursive", color: '#e8c468' }}
              className="text-lg font-bold tracking-wide"
            >
              ✏️ Denah Tempat Duduk Kelas {selectedKelas}
            </span>
            
            <button
              onClick={() => setIsFullscreen(true)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold text-white transition flex items-center gap-1.5 font-sans"
            >
              <IconFullscreen /> Fullscreen
            </button>
          </div>

          {/* Papan Tulis */}
          <div
            style={{
              fontFamily: "'Kalam', cursive",
              letterSpacing: '2px',
              color: '#1e3a2f',
              backgroundColor: '#eef4ef',
              border: '3px solid #cfd9d2'
            }}
            className="rounded-lg text-center py-2 text-sm font-bold shadow-inner mb-6 w-full max-w-xs mx-auto"
          >
            — PAPAN TULIS DEPAN —
          </div>

          {/* Seating Grid */}
          <div className="w-full overflow-x-auto pb-4 flex justify-center">
            <div className="inline-block">
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex gap-4 mb-3.5 justify-center items-center">
                  <span
                    style={{ fontFamily: "'Caveat', cursive", color: '#e8c468' }}
                    className="text-lg font-bold w-6 text-right shrink-0 select-none"
                  >
                    B{r + 1}
                  </span>
                  {Array.from({ length: cols }, (_, c) => (
                    <div
                      key={c}
                      style={{
                        backgroundColor: '#a9713f',
                        boxShadow: '0 3px 0 #7d5228'
                      }}
                      className="flex gap-1.5 rounded-lg p-1.5 min-w-[145px] max-w-[175px] border border-[#7d5228]"
                    >
                      <SeatCard r={r} c={c} side="left" />
                      <SeatCard r={r} c={c} side="right" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {!seatGrid && (
            <div
              style={{ fontFamily: "'Caveat', cursive", color: 'rgba(255,255,255,0.6)' }}
              className="text-center py-10 text-xl"
            >
              Belum ada denah. Tekan "Acak" atau klik kursi untuk mulai mengatur.
            </div>
          )}

          {/* Leftover */}
          {leftoverIds.length > 0 && (
            <div
              style={{ backgroundColor: '#fbeae6', border: '1.5px solid #f0cfc6', color: '#c15a4a' }}
              className="mt-4 rounded-lg px-4 py-2 w-full max-w-xl mx-auto font-sans"
            >
              <p className="text-xs font-bold mb-1">⚠️ Siswa belum mendapat kursi:</p>
              <p className="text-xs font-semibold">{leftoverIds.map(id => { const s = studentsById[id]; return s?.nickname || s?.name || '?' }).join(', ')}</p>
            </div>
          )}
        </div>

        {/* Fullscreen Modal Portal under body to prevent layout offsets */}
        {isFullscreen && createPortal(
          <div className="fixed inset-0 z-[99] flex flex-col items-center justify-center p-4 bg-[#1e3a2f] overflow-auto select-none animate-fade-in">
            {/* Floating Topbar */}
            <div className="w-full flex justify-between items-center mb-6 max-w-7xl px-4 border-b border-white/10 pb-4">
              <span
                style={{ fontFamily: "'Caveat', cursive", color: '#e8c468' }}
                className="text-2xl font-bold tracking-wide animate-fade-in"
              >
                ✏️ Denah Tempat Duduk Kelas {selectedKelas} (Mode Proyeksi)
              </span>
              <div className="flex items-center gap-4">
                <span className="text-white/70 text-xs font-sans font-semibold bg-white/5 border border-white/15 px-3 py-1 rounded-full">
                  💡 Tekan & Tahan **Enter** untuk Mengacak Dinamis
                </span>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 font-sans shadow-md"
                >
                  <IconExitFullscreen /> Keluar Fullscreen (Esc)
                </button>
              </div>
            </div>

            {/* Blackboard Board (Enlarged) */}
            <div
              style={{
                background: 'linear-gradient(180deg, #2d5445 0%, #1e3a2f 100%)',
                border: '14px solid #7d5228',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                width: '96%',
                maxWidth: '1440px'
              }}
              className="rounded-3xl p-6 md:p-8 flex flex-col justify-center items-center"
            >
              {/* Papan Tulis */}
              <div
                style={{
                  fontFamily: "'Kalam', cursive",
                  letterSpacing: '3px',
                  color: '#1e3a2f',
                  backgroundColor: '#eef4ef',
                  border: '4px solid #cfd9d2'
                }}
                className="rounded-xl text-center py-3 text-xl font-bold shadow-inner mb-8 w-full max-w-lg"
              >
                — PAPAN TULIS DEPAN —
              </div>

              {/* Seating Grid (Scaled up for maximum legibility) */}
              <div className="w-full overflow-x-auto pb-4 flex justify-center">
                <div className="inline-block scale-[1.20] origin-center py-8 px-12">
                  {Array.from({ length: rows }, (_, r) => (
                    <div key={r} className="flex gap-5 mb-4 justify-center items-center">
                      <span
                        style={{ fontFamily: "'Caveat', cursive", color: '#e8c468' }}
                        className="text-2xl font-bold w-8 text-right shrink-0 select-none"
                      >
                        B{r + 1}
                      </span>
                      {Array.from({ length: cols }, (_, c) => (
                        <div
                          key={c}
                          style={{
                            backgroundColor: '#a9713f',
                            boxShadow: '0 4px 0 #7d5228'
                          }}
                          className="flex gap-2 rounded-xl p-2 min-w-[195px] max-w-[240px] border border-[#7d5228]"
                        >
                          <SeatCard r={r} c={c} side="left" />
                          <SeatCard r={r} c={c} side="right" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Action buttons (only when not in fullscreen) */}
        {!isFullscreen && (
          <div className="flex gap-2">
            {seatGrid && (
              <button onClick={generateSeating}
                className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 font-semibold text-sm hover:bg-indigo-50 transition flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.7"/></svg>
                Acak Ulang
              </button>
            )}
            <button onClick={() => {
              const el = document.getElementById('seating-chart-print')
              const s = document.createElement('style')
              s.innerHTML = `@media print{body>*:not(#pw){display:none!important}#pw{display:block!important}#pw #seating-chart-print{border:none !important;box-shadow:none !important;}}`
              document.head.appendChild(s)
              const pw = document.createElement('div'); pw.id = 'pw'
              pw.appendChild(el.cloneNode(true)); document.body.appendChild(pw)
              window.print()
              document.body.removeChild(pw); document.head.removeChild(s)
            }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2">
              <IconPrint /> Cetak Denah
            </button>
          </div>
        )}

        {/* Legend (only when not in fullscreen) */}
        {!isFullscreen && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Keterangan</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <span className="flex items-center gap-1.5"><span style={{ backgroundColor: '#8fbdd8' }} className="w-3.5 h-3.5 rounded border border-blue-400"/><span className="text-slate-600">Laki-laki</span></span>
              <span className="flex items-center gap-1.5"><span style={{ backgroundColor: '#e9a3b8' }} className="w-3.5 h-3.5 rounded border border-pink-400"/><span className="text-slate-600">Perempuan</span></span>
              <span className="flex items-center gap-1.5"><IconPin /><span className="text-slate-600">Kursi tetap</span></span>
              <span className="flex items-center gap-1.5"><IconLock cls="w-3.5 h-3.5 text-slate-400"/><span className="text-slate-600">Kursi terkunci</span></span>
              <span className="flex items-center gap-1.5 w-full text-slate-400">💡 Klik kursi pada denah untuk menetapkan posisi atau mengunci kursi. Tahan tombol Enter untuk acak berkelanjutan!</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Seat Modal (with strong whole-page background blur via portal) ── */}
      {seatModal && createPortal(
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Atur Kursi</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-sans">
                  Baris {seatModal.r + 1}, Kolom {seatModal.c + 1} — Sisi {seatModal.side === 'left' ? 'Kiri' : 'Kanan'}
                </p>
              </div>
              <button onClick={closeModal} className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2 text-sm ${
                modalLocked ? 'bg-slate-100 text-slate-600' :
                modalStudentId ? 'bg-indigo-50 text-indigo-800' :
                'bg-slate-50 text-slate-400'
              }`}>
                {modalLocked ? (
                  <><IconLock cls="w-4 h-4 shrink-0" /><span className="font-medium">Kursi terkunci</span></>
                ) : modalStudentId ? (
                  <>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${studentsById[modalStudentId]?.gender === 'L' ? 'bg-blue-400' : studentsById[modalStudentId]?.gender === 'P' ? 'bg-pink-400' : 'bg-slate-300'}`}/>
                    <span className="font-semibold">{getDisplayName(modalStudentId)}</span>
                    {studentsById[modalStudentId]?.nickname && displayMode === 'name' && (
                      <span className="text-xs text-slate-500 ml-auto">"{studentsById[modalStudentId].nickname}"</span>
                    )}
                    {modalFixed && <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">📌 Tetap</span>}
                  </>
                ) : (
                  <span>Kursi kosong</span>
                )}
              </div>

              <button
                onClick={() => { toggleLock(seatModal.r, seatModal.c, seatModal.side); closeModal() }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  modalLocked
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    : 'border-slate-200 text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700'
                }`}>
                {modalLocked
                  ? <IconUnlock cls="w-4 h-4 shrink-0" />
                  : <IconLock cls="w-4 h-4 shrink-0" />}
                <div>
                  <div className="text-sm font-semibold">{modalLocked ? 'Buka Kunci Kursi' : 'Kunci Kursi (Selalu Kosong)'}</div>
                  <div className="text-xs opacity-70">{modalLocked ? 'Izinkan siswa ditempatkan di sini' : 'Kursi tidak akan terisi saat pengacakan'}</div>
                </div>
              </button>

              {!modalLocked && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tetapkan Siswa ke Kursi Ini</p>
                  <div className="relative mb-2">
                    <svg className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input placeholder="Cari nama siswa..." value={popSearch} onChange={e => setPopSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50" />
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
                    {modalStudentId && (
                      <button onClick={() => { pinStudent(seatModal.r, seatModal.c, seatModal.side, null); closeModal() }}
                        className="w-full px-3 py-2.5 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 font-semibold">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Hapus Penempatan
                      </button>
                    )}
                    {popStudents.map(s => (
                      <button key={s.nisn}
                        onClick={() => { pinStudent(seatModal.r, seatModal.c, seatModal.side, s.id); closeModal() }}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 transition-colors flex items-center gap-2.5 ${modalStudentId === s.id ? 'bg-indigo-50' : ''}`}>
                        <span className={`w-3.5 h-3.5 rounded-full shrink-0 border ${s.gender === 'L' ? 'bg-blue-100 border-blue-200' : s.gender === 'P' ? 'bg-pink-100 border-pink-200' : 'bg-slate-100 border-slate-200'}`}/>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                          {s.nickname && <div className="text-indigo-500 text-[10px]">"{s.nickname}"</div>}
                        </div>
                        <span className="text-slate-400 text-[10px] shrink-0 font-sans">No. {absenMap[s.nisn]}</span>
                        {modalStudentId === s.id && (
                          <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
