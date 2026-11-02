import React, { useState, useMemo, useRef, useEffect } from 'react'

/**
 * CbtMobileBottomNav — Bilah Navigasi Nomor Soal Khusus Layar HP / Mobile
 * 
 * Fitur:
 * 1. Mode Bilah Geser Horizontal (Swipeable Strip): Siswa dapat menggeser kanan-kiri nomor soal langsung tanpa popup.
 * 2. Auto-Center ke Nomor Aktif: Otomatis menggeser agar nomor soal yang sedang dibuka berada di tengah.
 * 3. Mode Sembunyikan (Hide/Collapse): Siswa dapat menyembunyikan bilah sepenuhnya agar layar bersih.
 * 4. Mode Lembar Penuh (Bottom Sheet Grid): Tetap tersedia lewat tombol [Grid] jika ingin melihat rangkuman 54 soal sekaligus.
 */
export default function CbtMobileBottomNav({
  questions = [],
  currentIndex = 0,
  answers = {},
  onSelectNomor,
  onSubmit,
  isExpanded = false,
  setIsExpanded,
  isVisible = true,
  setIsVisible
}) {
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'belum' | 'ragu' | 'sudah'
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const activeBtnRef = useRef(null)
  const scrollContainerRef = useRef(null)

  // Auto-scroll ke nomor soal aktif saat berpindah soal
  useEffect(() => {
    if (activeBtnRef.current) {
      activeBtnRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      })
    }
  }, [currentIndex])

  // Perhitungan status kelengkapan
  const { answeredCount, raguCount, unansweredCount, questionStatusList } = useMemo(() => {
    let answered = 0
    let ragu = 0
    let unanswered = 0

    const list = questions.map((q, idx) => {
      const item = answers[q.id]
      const val = typeof item === 'object' && item !== null ? item.jawaban : item
      let hasAns = false
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val)) {
          hasAns = val.length > 0
        } else if (typeof val === 'string' && val.startsWith('[')) {
          try {
            const arr = JSON.parse(val)
            hasAns = Array.isArray(arr) && arr.length > 0
          } catch {
            hasAns = true
          }
        } else {
          hasAns = true
        }
      }

      const isRagu = Boolean(item && item.isRagu)

      if (isRagu) ragu++
      if (hasAns) answered++
      else unanswered++

      return {
        q,
        idx,
        nomor: idx + 1,
        hasAns,
        isRagu
      }
    })

    return {
      answeredCount: answered,
      raguCount: ragu,
      unansweredCount: unanswered,
      questionStatusList: list
    }
  }, [questions, answers])

  // Filter butir nomor soal untuk grid
  const filteredQuestions = useMemo(() => {
    if (filterMode === 'belum') return questionStatusList.filter(item => !item.hasAns)
    if (filterMode === 'ragu') return questionStatusList.filter(item => item.isRagu)
    if (filterMode === 'sudah') return questionStatusList.filter(item => item.hasAns)
    return questionStatusList
  }, [questionStatusList, filterMode])

  // KONDISI 1: Bilah Disembunyikan Sepenuhnya -> Tampilkan Floating Pill
  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsVisible(true)
          setIsExpanded(true)
        }}
        title="Tampilkan Daftar Nomor Soal"
        className="lg:hidden fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] right-4 z-40 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-full shadow-2xl border-2 border-white flex items-center gap-2 text-xs font-bold transition-all cursor-pointer animate-fade-in"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span>No. {currentIndex + 1}/{questions.length}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      </button>
    )
  }

  return (
    <>
      {/* KONDISI 2: Mode Dock Bawah Horizontal Swipeable (Tampilan Utama di HP) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] shadow-xl flex flex-col gap-1.5 animate-slide-up">
        {/* Bar Atas Dock: Info Nomor Aktif, Status Terjawab, Tombol Grid & Tutup */}
        <div className="flex items-center justify-between gap-2">
          {/* Info Nomor Aktif */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <span className="text-slate-400 font-normal text-[11px]">Soal:</span>
            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black font-mono text-xs">
              {currentIndex + 1} / {questions.length}
            </span>
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
              ({Math.round((answeredCount / (questions.length || 1)) * 100)}%)
            </span>
          </div>

          {/* Indikator Status Warna Ringkas */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md" title="Sudah Terjawab">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {answeredCount}
            </span>

            {raguCount > 0 && (
              <span className="flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md" title="Ragu-Ragu">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {raguCount}
              </span>
            )}

            <span className="flex items-center gap-1 text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md" title="Belum Terjawab">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              {unansweredCount}
            </span>
          </div>

          {/* Tombol Buka Grid Seluruh Soal & Sembunyikan */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
              title="Lihat Grid Rangkuman Seluruh Nomor Soal"
            >
              <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Sembunyikan Bilah Bawah"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bar Bawah: Deretan Nomor Soal Horizontal Geser Kanan-Kiri Langsung (Mac OS Dock Magnification Wave) */}
        <div
          ref={scrollContainerRef}
          onMouseLeave={() => setHoveredIndex(null)}
          className="flex items-end gap-2 overflow-x-auto no-scrollbar scroll-smooth pt-4 pb-2.5 px-3 touch-pan-x"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {questionStatusList.map((item) => {
            const isCurrent = item.idx === currentIndex
            const targetIndex = hoveredIndex !== null ? hoveredIndex : currentIndex
            const dist = Math.abs(item.idx - targetIndex)

            // Efek Zoom / Pembesaran Mengikuti Mac OS Dock
            let scaleStyle = 'scale-100 translate-y-0 z-0'
            if (dist === 0) {
              scaleStyle = 'scale-[1.3] -translate-y-2.5 z-30 shadow-xl'
            } else if (dist === 1) {
              scaleStyle = 'scale-[1.14] -translate-y-1.5 z-20 shadow-md'
            } else if (dist === 2) {
              scaleStyle = 'scale-[1.05] -translate-y-0.5 z-10'
            }

            // Desain Kontras Warna & Status Nomor Soal
            let statusStyle = ''
            let dotColor = ''

            if (isCurrent) {
              if (item.isRagu) {
                statusStyle = 'bg-gradient-to-tr from-amber-400 via-amber-400 to-yellow-300 text-slate-950 font-black border-2 border-amber-200 ring-4 ring-amber-300/60 shadow-amber-400/40'
                dotColor = 'bg-amber-500'
              } else if (item.hasAns) {
                statusStyle = 'bg-gradient-to-tr from-emerald-600 via-emerald-600 to-teal-500 text-white font-black border-2 border-emerald-300 ring-4 ring-emerald-400/60 shadow-emerald-500/40'
                dotColor = 'bg-emerald-500'
              } else {
                // Sedang dikerjakan & belum dijawab -> Biru/Indigo mencolok, BUKAN abu-abu lagi!
                statusStyle = 'bg-gradient-to-tr from-indigo-600 via-indigo-600 to-blue-500 text-white font-black border-2 border-indigo-300 ring-4 ring-indigo-400/60 shadow-indigo-500/40'
                dotColor = 'bg-indigo-600'
              }
            } else {
              if (item.isRagu) {
                statusStyle = 'bg-amber-400 text-slate-950 font-bold border-amber-500 shadow-2xs hover:bg-amber-300'
              } else if (item.hasAns) {
                statusStyle = 'bg-emerald-500 text-white font-bold border-emerald-600 shadow-2xs hover:bg-emerald-600'
              } else {
                // Belum dijawab & bukan nomor aktif
                statusStyle = 'bg-slate-50 text-slate-700 font-semibold border border-slate-200/90 hover:bg-white hover:border-indigo-300 hover:text-indigo-700'
              }
            }

            return (
              <button
                key={item.q.id || item.idx}
                ref={isCurrent ? activeBtnRef : null}
                type="button"
                onClick={() => onSelectNomor(item.idx)}
                onMouseEnter={() => setHoveredIndex(item.idx)}
                className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xs flex flex-col items-center justify-center border transition-all duration-200 ease-out cursor-pointer origin-bottom relative select-none ${statusStyle} ${scaleStyle}`}
              >
                <span className={`leading-none ${isCurrent ? 'font-black text-sm' : 'font-bold'}`}>
                  {item.nomor}
                </span>
                {item.isRagu && <span className="text-[8px] font-black leading-none mt-0.5">?</span>}
                {!item.isRagu && item.hasAns && <span className="text-[8px] font-black leading-none mt-0.5">✓</span>}

                {/* Indikator Titik Aktif ala Mac OS Dock */}
                {isCurrent && (
                  <span className={`absolute -bottom-1.5 w-1.5 h-1.5 rounded-full ${dotColor} ring-2 ring-white shadow-xs animate-pulse`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* KONDISI 3: Mode Lembar Penuh (Expanded Bottom Sheet) */}
      {isExpanded && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end animate-fade-in">
          {/* Backdrop Gelap */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsExpanded(false)}
          />

          {/* Laci Lembar Bawah */}
          <div className="relative z-10 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 max-h-[82vh] flex flex-col animate-slide-up overflow-hidden">
            {/* Header Laci & Drag Handle */}
            <div className="px-5 pt-3 pb-3 border-b border-slate-100 flex flex-col gap-2">
              <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Daftar Nomor Soal
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {answeredCount} dari {questions.length} soal terjawab ({Math.round((answeredCount / (questions.length || 1)) * 100)}%)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExpanded(false)
                      setIsVisible(false)
                    }}
                    className="px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Sembunyikan
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Filter Tabs Cepat */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    filterMode === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua ({questions.length})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('belum')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    filterMode === 'belum'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Belum ({unansweredCount})
                </button>

                {raguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterMode('ragu')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                      filterMode === 'ragu'
                        ? 'bg-amber-400 text-slate-900 shadow-xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    Ragu ({raguCount})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setFilterMode('sudah')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    filterMode === 'sudah'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  Terjawab ({answeredCount})
                </button>
              </div>
            </div>

            {/* Grid Butir Nomor Soal */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-5 gap-2.5">
                {filteredQuestions.map((item) => {
                  const isCurrent = item.idx === currentIndex
                  let statusStyle = ''

                  if (isCurrent) {
                    if (item.isRagu) {
                      statusStyle = 'bg-gradient-to-tr from-amber-400 via-amber-400 to-yellow-300 text-slate-950 font-black border-2 border-amber-200 ring-4 ring-amber-300/60 shadow-lg shadow-amber-400/40 scale-110 z-20'
                    } else if (item.hasAns) {
                      statusStyle = 'bg-gradient-to-tr from-emerald-600 via-emerald-600 to-teal-500 text-white font-black border-2 border-emerald-300 ring-4 ring-emerald-400/60 shadow-lg shadow-emerald-500/40 scale-110 z-20'
                    } else {
                      statusStyle = 'bg-gradient-to-tr from-indigo-600 via-indigo-600 to-blue-500 text-white font-black border-2 border-indigo-300 ring-4 ring-indigo-400/60 shadow-lg shadow-indigo-500/40 scale-110 z-20'
                    }
                  } else {
                    if (item.isRagu) {
                      statusStyle = 'bg-amber-400 text-slate-950 font-bold border-amber-500 shadow-2xs hover:scale-105'
                    } else if (item.hasAns) {
                      statusStyle = 'bg-emerald-500 text-white font-bold border-emerald-600 shadow-2xs hover:scale-105'
                    } else {
                      statusStyle = 'bg-slate-50 text-slate-700 font-semibold border border-slate-200 hover:bg-white hover:border-indigo-300 hover:scale-105'
                    }
                  }

                  return (
                    <button
                      key={item.q.id || item.idx}
                      type="button"
                      onClick={() => {
                        onSelectNomor(item.idx)
                        setIsExpanded(false)
                      }}
                      className={`h-11 rounded-xl text-xs flex flex-col items-center justify-center border transition-all duration-200 relative cursor-pointer active:scale-95 ${statusStyle}`}
                    >
                      <span className={`font-bold ${isCurrent ? 'text-sm font-black' : ''}`}>{item.nomor}</span>
                      {item.isRagu && <span className="text-[9px] leading-none">?</span>}
                      {!item.isRagu && item.hasAns && <span className="text-[9px] leading-none">✓</span>}
                      {isCurrent && (
                        <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 bg-indigo-900 text-[8px] text-white font-black rounded-full uppercase tracking-tighter shadow-xs">
                          Aktif
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {filteredQuestions.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Tidak ada soal pada kategori ini.
                </div>
              )}
            </div>

            {/* Footer Laci */}
            <div className="p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all text-center"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false)
                  onSubmit?.()
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs transition-all shadow-sm text-center"
              >
                Kumpulkan Ujian
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
