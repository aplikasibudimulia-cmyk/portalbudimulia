import React, { useState } from 'react'

/**
 * Komponen Palet Navigasi Nomor Soal Standar ANBK
 * Warna:
 * 🟦 Biru/Ungu Gradien: Nomor Soal Sedang Dibuka (Aktif - Mac OS Dock Magnification)
 * 🟩 Hijau: Sudah dijawab
 * 🟨 Kuning: Ditandai Ragu-ragu
 * ⬜ Putih/Abu: Belum dijawab
 */
export default function CbtNavigasiNomor({
  questions = [],
  currentIndex = 0,
  answers = {},
  onSelectNomor,
  onOpenSubmitModal
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const answeredCount = questions.filter(q => {
    const item = answers[q.id]
    const val = typeof item === 'object' && item !== null ? item.jawaban : item
    return val !== undefined && val !== null && val !== ''
  }).length

  const raguCount = questions.filter(q => {
    const item = answers[q.id]
    return item && item.isRagu
  }).length

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
      {/* Header Info Progres */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Daftar Nomor Soal
          </h3>
          <p className="text-[11px] text-slate-500">
            {answeredCount} dari {questions.length} terjawab
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-indigo-600">
            {Math.round((answeredCount / (questions.length || 1)) * 100)}%
          </span>
        </div>
      </div>

      {/* Grid Nomor Soal dengan Mac OS Dock Zoom Effect */}
      <div 
        onMouseLeave={() => setHoveredIdx(null)}
        className="grid grid-cols-5 gap-2.5 max-h-[360px] overflow-y-auto p-1.5"
      >
        {questions.map((q, idx) => {
          const item = answers[q.id]
          const val = typeof item === 'object' && item !== null ? item.jawaban : item
          const hasAnswer = val !== undefined && val !== null && val !== ''
          const isRagu = item && item.isRagu
          const isCurrent = idx === currentIndex

          let statusStyle = ''
          let dotColor = ''

          if (isCurrent) {
            if (isRagu) {
              statusStyle = 'bg-gradient-to-tr from-amber-400 via-amber-400 to-yellow-300 text-slate-950 font-black border-2 border-amber-200 ring-4 ring-amber-300/60 shadow-lg shadow-amber-400/40 scale-115 -translate-y-1 z-20'
              dotColor = 'bg-amber-500'
            } else if (hasAnswer) {
              statusStyle = 'bg-gradient-to-tr from-emerald-600 via-emerald-600 to-teal-500 text-white font-black border-2 border-emerald-300 ring-4 ring-emerald-400/60 shadow-lg shadow-emerald-500/40 scale-115 -translate-y-1 z-20'
              dotColor = 'bg-emerald-500'
            } else {
              // Sedang dikerjakan & belum dijawab -> Biru/Indigo mencolok!
              statusStyle = 'bg-gradient-to-tr from-indigo-600 via-indigo-600 to-blue-500 text-white font-black border-2 border-indigo-300 ring-4 ring-indigo-400/60 shadow-lg shadow-indigo-500/40 scale-115 -translate-y-1 z-20'
              dotColor = 'bg-indigo-600'
            }
          } else {
            if (isRagu) {
              statusStyle = 'bg-amber-400 text-slate-950 font-bold border border-amber-500 shadow-2xs hover:scale-110 hover:-translate-y-0.5 hover:shadow-md'
            } else if (hasAnswer) {
              statusStyle = 'bg-emerald-500 text-white font-bold border border-emerald-600 shadow-2xs hover:scale-110 hover:-translate-y-0.5 hover:shadow-md'
            } else {
              statusStyle = 'bg-slate-50 text-slate-700 font-semibold border border-slate-200 hover:bg-white hover:border-indigo-300 hover:text-indigo-700 hover:scale-110 hover:-translate-y-0.5 hover:shadow-md'
            }
          }

          return (
            <button
              key={q.id || idx}
              onClick={() => onSelectNomor(idx)}
              onMouseEnter={() => setHoveredIdx(idx)}
              className={`h-10 rounded-xl text-xs flex flex-col items-center justify-center border transition-all duration-200 ease-out relative cursor-pointer select-none ${statusStyle}`}
            >
              <span className={`leading-none ${isCurrent ? 'font-black text-sm' : 'font-bold'}`}>{idx + 1}</span>
              {isRagu && <span className="text-[9px] leading-none mt-0.5 font-black">?</span>}
              {!isRagu && hasAnswer && <span className="text-[9px] leading-none mt-0.5 font-black">✓</span>}

              {/* Indikator Titik Aktif ala Mac OS */}
              {isCurrent && (
                <span className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full ${dotColor} ring-2 ring-white shadow-xs animate-pulse`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Keterangan Warna (Legenda ANBK Modern) */}
      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-gradient-to-tr from-indigo-600 to-blue-500 inline-block shadow-2xs ring-1 ring-indigo-300"></span>
          <span className="font-semibold text-indigo-700">Sedang Dibuka (Aktif)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 inline-block shadow-2xs"></span>
          <span>Sudah Dijawab ({answeredCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-amber-400 inline-block shadow-2xs"></span>
          <span>Ragu-Ragu ({raguCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-slate-50 border border-slate-300 inline-block"></span>
          <span>Belum Dijawab ({questions.length - answeredCount})</span>
        </div>
      </div>

      {/* Tombol Kumpulkan Cepat */}
      {onOpenSubmitModal && (
        <button
          onClick={onOpenSubmitModal}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          Selesai & Kumpulkan
        </button>
      )}
    </div>
  )
}

