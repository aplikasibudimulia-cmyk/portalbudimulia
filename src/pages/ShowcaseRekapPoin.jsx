// src/pages/ShowcaseRekapPoin.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'

// Helper tie-ranking yang adil: Nilai sama = Peringkat sama
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

// Laurel Wreath SVG Component
const GoldenLaurelBranch = ({ side = 'left', className = '' }) => (
  <svg
    className={`w-10 h-20 md:w-14 md:h-28 text-amber-400 shrink-0 ${side === 'right' ? 'scale-x-[-1]' : ''} ${className}`}
    viewBox="0 0 40 80"
    fill="currentColor"
  >
    <path d="M20 5 C15 20 8 35 10 50 C12 65 20 75 20 75" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <path d="M18 10 C12 12 8 8 10 4 C14 6 17 8 18 10 Z"/>
    <path d="M16 22 C9 23 5 18 8 14 C12 17 15 20 16 22 Z"/>
    <path d="M14 34 C6 34 3 28 6 25 C10 28 13 32 14 34 Z"/>
    <path d="M13 46 C5 44 3 38 7 36 C10 39 12 43 13 46 Z"/>
    <path d="M14 58 C7 54 6 48 10 47 C12 50 13 55 14 58 Z"/>
    <path d="M17 68 C12 63 12 57 16 57 C17 60 17 65 17 68 Z"/>
  </svg>
)

// Component untuk Kertas Melayang / Falling Confetti Paper (Animation)
function FloatingConfettiPaper() {
  const confettiPieces = useMemo(() => {
    const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6', '#f43f5e', '#06b6d4', '#eab308', '#a855f7']
    return Array.from({ length: 40 }).map((_, i) => {
      const color = colors[i % colors.length]
      const left = Math.random() * 100
      const duration = 5 + Math.random() * 7
      const delay = Math.random() * 7
      const size = 7 + Math.random() * 10
      const isRibbon = i % 4 === 0

      return {
        id: i,
        color,
        left: `${left}%`,
        duration: `${duration}s`,
        delay: `${delay}s`,
        width: isRibbon ? '6px' : `${size}px`,
        height: isRibbon ? '18px' : `${size}px`,
        borderRadius: isRibbon ? '2px' : (i % 3 === 0 ? '50%' : '3px'),
      }
    })
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-20">
      <style>{`
        @keyframes confettiFall {
          0% {
            transform: translateY(-10vh) rotateX(0deg) rotateY(0deg) rotateZ(0deg);
            opacity: 1;
          }
          25% {
            transform: translateY(25vh) translateX(30px) rotateX(180deg) rotateY(90deg) rotateZ(60deg);
          }
          50% {
            transform: translateY(50vh) translateX(-30px) rotateX(360deg) rotateY(180deg) rotateZ(120deg);
          }
          75% {
            transform: translateY(75vh) translateX(30px) rotateX(540deg) rotateY(270deg) rotateZ(180deg);
            opacity: 0.9;
          }
          100% {
            transform: translateY(105vh) translateX(-20px) rotateX(720deg) rotateY(360deg) rotateZ(240deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confettiFall linear infinite;
        }
      `}</style>

      {confettiPieces.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti shadow-xs"
          style={{
            left: p.left,
            top: '-20px',
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  )
}

// Avatar Foto Profil Siswa Lingkaran Sesuai Mockup
function CircularStudentPhotoAvatar({ nisn, nama, activeTaId, size = 'giant', className = '' }) {
  const [imgError, setImgError] = useState(false)
  const [photoUrl, setPhotoUrl] = useState(null)

  useEffect(() => {
    setImgError(false)
    if (!nisn) return

    let isMounted = true
    supabase
      .from('foto')
      .select('cloudinary_url')
      .eq('nisn', nisn)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) {
          if (data?.cloudinary_url) {
            setPhotoUrl(data.cloudinary_url)
          } else {
            const url = activeTaId
              ? `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_550,h_550,g_face/SKL-BM/FOTO_${nisn}_${activeTaId}`
              : `https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_550,h_550,g_face/SKL-BM/FOTO_${nisn}`
            setPhotoUrl(url)
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setPhotoUrl(`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_550,h_550,g_face/SKL-BM/FOTO_${nisn}`)
        }
      })

    return () => { isMounted = false }
  }, [nisn, activeTaId])

  const initials = useMemo(() => {
    if (!nama) return 'S'
    const parts = nama.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }, [nama])

  const sizeClasses = {
    md: 'w-20 h-20 text-2xl',
    lg: 'w-32 h-32 text-4xl',
    xl: 'w-44 h-44 text-5xl',
    giant: 'w-52 h-52 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 text-6xl md:text-8xl',
  }[size] || 'w-52 h-52 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 text-6xl'

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={nama || 'Foto Siswa'}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-full object-cover shadow-2xl border-4 border-amber-400 shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 text-white font-black flex items-center justify-center shadow-2xl border-4 border-amber-400 shrink-0 ${className}`}
    >
      {initials}
    </div>
  )
}

export default function ShowcaseRekapPoin() {
  const [activeTa, setActiveTa] = useState(null)
  const [loading, setLoading] = useState(true)
  const [totalPointsList, setTotalPointsList] = useState([])

  // Mode Animasi: 'slideshow' | 'auto_scroll' | 'static'
  const [animMode, setAnimMode] = useState('slideshow')
  const [slideshowIndex, setSlideshowIndex] = useState(0)
  const [slideDirection, setSlideDirection] = useState('right') // 'right' | 'left'

  // Fullscreen State & Header Auto-Hide State
  const [isFullscreenActive, setIsFullscreenActive] = useState(false)
  const [headerHovered, setHeaderHovered] = useState(false)

  // Listen to browser fullscreen change event
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreenActive(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
    }
  }

  // 1. Fetch Metadata (Tahun Ajaran Aktif)
  useEffect(() => {
    const initMetadata = async () => {
      try {
        const { data: ta } = await supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).maybeSingle()
        if (ta) setActiveTa(ta)
      } catch (err) {
        console.error('Error initMetadata:', err)
      }
    }
    initMetadata()
  }, [])

  // 2. Fetch Total Perolehan Poin Siswa (Full Tahun Ajaran)
  const loadData = useCallback(async () => {
    if (!activeTa?.id) return
    setLoading(true)

    try {
      const start = activeTa?.tanggal_mulai || '2000-01-01'
      const end = activeTa?.tanggal_selesai || '2099-12-31'

      // Fetch point_records
      let q = supabase
        .from('point_records')
        .select('*')
        .gte('tanggal', start)
        .lte('tanggal', end)

      if (activeTa?.id) {
        q = q.or(`tahun_ajaran_id.eq.${activeTa.id},tahun_ajaran_id.is.null`)
      }

      const { data: recs } = await q
      const records = recs || []
      const allNisns = Array.from(new Set(records.map(r => r.nisn)))

      let studentMap = {}
      if (allNisns.length > 0) {
        const { data: sData } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', allNisns)

        if (sData) {
          sData.forEach(s => {
            studentMap[s.nisn] = {
              nama: s.nama_lengkap || s.nama || 'Siswa',
              kelas: s.kelas || '-'
            }
          })
        }
      }

      // Hitung per siswa
      const statsMap = {}
      records.forEach(r => {
        if (!statsMap[r.nisn]) {
          const info = studentMap[r.nisn] || {}
          statsMap[r.nisn] = {
            nisn: r.nisn,
            nama: info.nama || r.nama_siswa || 'Siswa',
            kelas: r.kelas || info.kelas || '-',
            prestasiPoin: 0,
            pelanggaranPoin: 0
          }
        }

        if (r.poin_diberikan < 0) {
          statsMap[r.nisn].pelanggaranPoin += Math.abs(r.poin_diberikan)
        } else {
          statsMap[r.nisn].prestasiPoin += r.poin_diberikan
        }
      })

      const studentList = Object.values(statsMap)

      // Fetch student_points akumulasi
      const { data: spPoints } = await supabase
        .from('student_points')
        .select('nisn, total_poin, poin_default')
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: false })

      if (spPoints && spPoints.length > 0) {
        const spNisns = spPoints.map(s => s.nisn)
        const { data: spSiswaNames } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .in('nisn', spNisns)

        const nameMap = {}
        const classMap = {}
        ;(spSiswaNames || []).forEach(s => {
          nameMap[s.nisn] = s.nama_lengkap
          classMap[s.nisn] = s.kelas
        })

        const kumulatifList = spPoints.map(sp => {
          return {
            nisn: sp.nisn,
            nama: nameMap[sp.nisn] || 'Siswa',
            kelas: classMap[sp.nisn] || '-',
            totalPoinAkhir: sp.total_poin
          }
        })

        setTotalPointsList(assignTieRanks(kumulatifList, s => s.totalPoinAkhir))
      } else {
        const fallbackList = [...studentList]
          .map(s => ({
            ...s,
            totalPoinAkhir: 100 + s.prestasiPoin - s.pelanggaranPoin
          }))
          .sort((a, b) => b.totalPoinAkhir - a.totalPoinAkhir)

        setTotalPointsList(assignTieRanks(fallbackList, s => s.totalPoinAkhir))
      }

    } catch (err) {
      console.error('Error loading showcase data:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTa])

  useEffect(() => {
    if (activeTa?.id) {
      loadData()
    }
  }, [activeTa, loadData])

  // Navigasi Slide
  const handleNextSlide = useCallback(() => {
    if (totalPointsList.length === 0) return
    setSlideDirection('right')
    setSlideshowIndex(idx => (idx + 1) % totalPointsList.length)
  }, [totalPointsList.length])

  const handlePrevSlide = useCallback(() => {
    if (totalPointsList.length === 0) return
    setSlideDirection('left')
    setSlideshowIndex(idx => (idx - 1 + totalPointsList.length) % totalPointsList.length)
  }, [totalPointsList.length])

  // ANIMASI 1: AUTO SCROLL PERLAHAN
  useEffect(() => {
    if (animMode !== 'auto_scroll') return

    const interval = setInterval(() => {
      window.scrollBy({ top: 1.5, behavior: 'smooth' })

      if ((window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 10)) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 30)

    return () => clearInterval(interval)
  }, [animMode])

  // ANIMASI 2: SLIDESHOW PER-SISWA (10 DETIK EXPLICIT TIMER)
  useEffect(() => {
    if (animMode !== 'slideshow' || totalPointsList.length === 0) return

    const timer = setInterval(() => {
      handleNextSlide()
    }, 10000)

    return () => clearInterval(timer)
  }, [animMode, handleNextSlide, totalPointsList.length])

  // Current Slide Student for Slideshow
  const currentSlideStudent = useMemo(() => {
    if (totalPointsList.length === 0) return null
    return totalPointsList[slideshowIndex % totalPointsList.length]
  }, [totalPointsList, slideshowIndex])

  return (
    <div className={`text-slate-900 flex flex-col font-sans selection:bg-amber-500 selection:text-white relative bg-[#f8fafc] ${
      animMode === 'slideshow' ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen overflow-x-hidden'
    }`}>
      
      {/* ANIMASI KERTAS MELAYANG / CONFETTI PAPER ANIMATION */}
      <FloatingConfettiPaper />

      {/* Dynamic Keyframe Slide Animations */}
      <style>{`
        @keyframes slideInRight {
          0% { transform: translateX(60px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          0% { transform: translateX(-60px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-right {
          animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-left {
          animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Invisible Hover Trigger Line at Very Top of Screen for Fullscreen Mode */}
      {isFullscreenActive && (
        <div
          onMouseEnter={() => setHeaderHovered(true)}
          className="fixed top-0 left-0 right-0 h-4 z-50 pointer-events-auto"
        />
      )}

      {/* Decorative Background Dots Pattern */}
      <div className="fixed left-8 top-1/3 opacity-25 pointer-events-none grid grid-cols-6 gap-2.5 z-0">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-slate-400"></div>
        ))}
      </div>
      <div className="fixed right-8 bottom-1/3 opacity-25 pointer-events-none grid grid-cols-6 gap-2.5 z-0">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-slate-400"></div>
        ))}
      </div>

      {/* HEADER KEREN DENGAN LOGO RESMI SMP BUDI MULIA */}
      <header
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        className={`sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-2.5 shrink-0 flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs transition-all duration-300 ease-in-out ${
          isFullscreenActive && !headerHovered
            ? 'opacity-0 -translate-y-full pointer-events-none'
            : 'opacity-100 translate-y-0 pointer-events-auto'
        }`}
      >
        
        {/* Logo Resmi & Title */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.png?v=1784818000"
            alt="Logo SMP Budi Mulia"
            className="w-9 h-9 md:w-11 md:h-11 object-contain shrink-0 drop-shadow-sm"
          />
          <div>
            <h1 className="text-base md:text-lg font-black text-slate-900 tracking-tight">
              TOTAL PEROLEHAN POIN SEMENTARA SISWA
            </h1>
            <p className="text-[10px] md:text-[11px] text-slate-500 font-bold">
              SMP BUDI MULIA JAKARTA • Total Siswa: <strong className="text-indigo-600 font-extrabold">{totalPointsList.length}</strong> Siswa
            </p>
          </div>
        </div>

        {/* CONTROLS ANIMASI & PRESENTASI */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Selector Mode Animasi */}
          <div className="bg-slate-100 p-1 rounded-2xl border border-slate-200 flex items-center gap-1 text-xs font-bold">
            
            {/* Mode Slideshow (10s) */}
            <button
              type="button"
              onClick={() => {
                setAnimMode('slideshow')
                setSlideshowIndex(0)
              }}
              className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                animMode === 'slideshow'
                  ? 'bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 text-white shadow-md shadow-amber-500/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🎬</span> Slideshow (10s/Siswa)
            </button>

            {/* Mode Auto Scroll */}
            <button
              type="button"
              onClick={() => setAnimMode('auto_scroll')}
              className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                animMode === 'auto_scroll'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📜</span> Auto Scroll
            </button>

            {/* Mode Statis */}
            <button
              type="button"
              onClick={() => setAnimMode('static')}
              className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                animMode === 'static'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>⏸️</span> Statis
            </button>

          </div>

          {/* Fullscreen & Close Tab */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer border ${
              isFullscreenActive
                ? 'bg-amber-500 text-white border-amber-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Layar Penuh untuk TV / Presentasi"
          >
            <span>📺</span>
            <span className="hidden sm:inline">{isFullscreenActive ? 'Keluar Layar Penuh' : 'Layar Penuh'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.close()}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>✕</span> Tutup Tab
          </button>
        </div>

      </header>

      {/* FLOATING SIDE NAVIGATIONS */}
      {animMode === 'slideshow' && totalPointsList.length > 0 && (
        <>
          {/* Panah Kiri Tengah Layar */}
          <button
            type="button"
            onClick={handlePrevSlide}
            className="fixed left-4 md:left-8 top-1/2 -translate-y-1/2 z-40 w-14 h-14 md:w-16 md:h-16 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xl font-bold text-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
            title="Siswa Sebelumnya"
          >
            ❮
          </button>

          {/* Panah Kanan Tengah Layar */}
          <button
            type="button"
            onClick={handleNextSlide}
            className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 w-14 h-14 md:w-16 md:h-16 rounded-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xl font-black text-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
            title="Siswa Berikutnya"
          >
            ❯
          </button>
        </>
      )}

      {/* MAIN CONTENT AREA: MEPET ATAS DAN BAWAH MAXIMAL */}
      <main className="flex-1 min-h-0 max-w-6xl w-full mx-auto p-2 md:p-3 flex flex-col justify-center relative z-10 overflow-hidden">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-14 h-14 border-4 border-amber-400/20 border-t-amber-400 rounded-full animate-spin"></div>
            <p className="text-base font-extrabold text-indigo-900 animate-pulse">Memuat Data Poin Siswa SMP Budi Mulia...</p>
          </div>
        ) : totalPointsList.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[32px] border border-slate-200 p-8 space-y-3 shadow-sm">
            <span className="text-6xl">⭐</span>
            <h3 className="text-2xl font-bold text-slate-800">Belum Ada Data Poin</h3>
            <p className="text-sm text-slate-500">Tidak ada data perolehan poin siswa yang tercatat saat ini.</p>
          </div>
        ) : animMode === 'slideshow' ? (
          
          /* 🎬 DISPLAY MODE 2: KARTU SLIDESHOW EKSTRA RAKSASA MEPET ATAS DAN BAWAH */
          <div className="flex flex-col items-center justify-center h-full max-h-full py-0.5 relative z-10">
            {currentSlideStudent && (
              <div
                key={currentSlideStudent.nisn + '-' + slideshowIndex}
                className={`w-full max-w-4xl lg:max-w-5xl h-[92vh] md:h-[94vh] max-h-[94vh] bg-white border-2 border-amber-300/90 rounded-[36px] md:rounded-[44px] p-6 md:p-10 shadow-2xl shadow-amber-500/15 flex flex-col items-center text-center justify-between space-y-2 md:space-y-3 relative overflow-hidden transition-all ${
                  slideDirection === 'right' ? 'animate-slide-right' : 'animate-slide-left'
                }`}
              >
                
                {/* 1. TOP ROW: PILL BADGES PERINGKAT & KELAS */}
                <div className="w-full flex items-center justify-between px-2 pt-1 shrink-0">
                  
                  {/* Left Pill: Peringkat */}
                  <span className="px-6 py-2 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-extrabold text-sm md:text-base flex items-center gap-2 shadow-2xs">
                    👑 PERINGKAT #{currentSlideStudent.displayRank}
                  </span>

                  {/* Right Pill: Kelas */}
                  <span className="px-6 py-2 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 font-extrabold text-sm md:text-base flex items-center gap-2 shadow-2xs">
                    👥 Kelas {currentSlideStudent.kelas}
                  </span>

                </div>

                {/* 2. CENTERPIECE: FOTO PROFIL LINGKARAN RAKSASA + MAHKOTA + DAUN LAUREL + PODIUM 3D */}
                <div className="relative flex flex-col items-center my-auto shrink-0">
                  
                  <div className="relative flex items-center justify-center">
                    {/* Laurel Leaf Left */}
                    <GoldenLaurelBranch side="left" className="translate-x-3 w-12 h-24 md:w-16 md:h-32" />
                    
                    {/* Circular Photo Avatar Raksasa */}
                    <div className="relative">
                      <CircularStudentPhotoAvatar
                        nisn={currentSlideStudent.nisn}
                        nama={currentSlideStudent.nama}
                        activeTaId={activeTa?.id}
                        size="giant"
                      />
                      {/* Mahkota Kanan Atas Foto */}
                      <span className="absolute -top-4 -right-3 text-5xl md:text-6xl transform rotate-12 drop-shadow-md">
                        👑
                      </span>
                    </div>

                    {/* Laurel Leaf Right */}
                    <GoldenLaurelBranch side="right" className="-translate-x-3 w-12 h-24 md:w-16 md:h-32" />
                  </div>

                  {/* Podium Circular Base 3D */}
                  <div className="w-64 md:w-80 h-9 -mt-5 bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 rounded-full border-t-2 border-white shadow-md flex items-center justify-center relative z-0">
                    <div className="w-48 md:w-64 h-3.5 bg-gradient-to-b from-slate-200 to-slate-300 rounded-full flex items-center justify-center">
                      <span className="text-[10px] text-amber-500 font-black">★</span>
                    </div>
                  </div>

                </div>

                {/* 3. NAMA LENGKAP SISWA RAKSASA */}
                <div className="space-y-1 max-w-3xl shrink-0">
                  <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-slate-900 leading-tight tracking-tight">
                    {currentSlideStudent.nama}
                  </h2>
                  <p className="text-xs md:text-sm font-extrabold text-slate-400 tracking-wider">
                    SMP BUDI MULIA JAKARTA
                  </p>
                </div>

                {/* 4. TOTAL POIN SEMENTARA BOX RAKSASA */}
                <div className="w-full max-w-2xl bg-slate-50/90 py-4 md:py-6 px-8 rounded-3xl border border-slate-200/90 shadow-2xs space-y-1 shrink-0">
                  <div className="text-xs md:text-sm text-slate-400 font-black uppercase tracking-widest">
                    TOTAL POIN SEMENTARA
                  </div>
                  
                  <div className="flex items-center justify-center gap-4 my-1">
                    <GoldenLaurelBranch side="left" className="w-9 h-18 text-amber-400" />
                    
                    <div className="text-5xl md:text-7xl lg:text-8xl font-black bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 bg-clip-text text-transparent">
                      {currentSlideStudent.totalPoinAkhir}
                    </div>
                    
                    <span className="text-2xl md:text-4xl lg:text-5xl font-black text-slate-900 ml-2">
                      POIN
                    </span>
                    
                    <GoldenLaurelBranch side="right" className="w-9 h-18 text-amber-400" />
                  </div>
                </div>

                {/* 5. INDIKATOR BOTTOM PILL: SISWA X DARI Y */}
                <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-slate-100 border border-slate-200 text-xs md:text-sm font-black text-slate-600 shadow-2xs shrink-0">
                  <span>👥</span> Siswa {slideshowIndex + 1} dari {totalPointsList.length}
                </div>

              </div>
            )}
          </div>

        ) : (

          /* 🎴 DISPLAY MODE 1: GRID KARTU BESAR (STATIS & AUTO SCROLL) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto max-h-full p-2">
            {totalPointsList.map((s) => {
              const isTopTier = s.displayRank === 1
              return (
                <div
                  key={s.nisn}
                  className={`bg-white border-2 rounded-3xl p-7 flex flex-col items-center text-center justify-between gap-6 transition-all duration-300 hover:scale-[1.02] shadow-sm hover:shadow-xl relative overflow-hidden group ${
                    isTopTier
                      ? 'border-amber-400 shadow-amber-500/10 bg-gradient-to-b from-amber-50/40 via-white to-white'
                      : 'border-slate-200/90 hover:border-indigo-400'
                  }`}
                >
                  {/* Top Bar inside Card: Peringkat Badge & Kelas */}
                  <div className="w-full flex items-center justify-between">
                    <span className="px-4 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs">
                      👑 PERINGKAT #{s.displayRank}
                    </span>
                    
                    <span className="px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs">
                      👥 Kelas {s.kelas}
                    </span>
                  </div>

                  {/* Foto Profil Siswa Besar Lingkaran */}
                  <div className="my-2 relative">
                    <CircularStudentPhotoAvatar
                      nisn={s.nisn}
                      nama={s.nama}
                      activeTaId={activeTa?.id}
                      size="xl"
                      className={isTopTier ? 'border-amber-400 shadow-xl shadow-amber-500/20' : 'border-slate-200 shadow-md'}
                    />
                  </div>

                  {/* Nama Lengkap Siswa */}
                  <div className="w-full space-y-1">
                    <h3 className="font-black text-slate-900 text-lg md:text-xl line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                      {s.nama}
                    </h3>
                  </div>

                  {/* Total Poin Sementara Large Score Pill */}
                  <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-inner">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      TOTAL POIN SEMENTARA
                    </span>
                    <span className={`px-4 py-1.5 rounded-xl text-lg md:text-xl font-black border ${
                      s.totalPoinAkhir >= 100
                        ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
                        : s.totalPoinAkhir >= 75
                        ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                        : 'bg-rose-100 text-rose-900 border-rose-200'
                    }`}>
                      {s.totalPoinAkhir} POIN
                    </span>
                  </div>

                </div>
              )
            })}
          </div>
        )}

      </main>
    </div>
  )
}
