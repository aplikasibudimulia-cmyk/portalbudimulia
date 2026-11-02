import React, { useMemo } from 'react'
import katex from 'katex'

/**
 * Komponen Renderer Butir Soal CBT
 * Mendukung KaTeX equations ($..$ dan $$..$$), gambar soal, dan 5 varian tipe soal.
 */

// Helper untuk parse teks campuran dengan KaTeX Math Equations dan gambar inline
export function renderFormattedMath(text) {
  if (!text) return ''

  // 1. Replace $$block math$$
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: true, throwOnError: false })
    } catch {
      return match
    }
  })

  // 2. Replace $inline math$
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: false, throwOnError: false })
    } catch {
      return match
    }
  })

  // 3. Auto-detect LaTeX commands yang tidak terbungkus $ (misal: \frac{a}{b}, \sqrt{16}, \times, \pm, dll)
  // Ini membuat guru tidak wajib mengetik simbol '$' jika menyalin rumus matematika
  processed = processed.replace(/(\\(?:frac\{[^{}]+\}\{[^{}]+\}|sqrt(?:\[[^\]]+\])?\{[^{}]+\}|(?:times|div|pm|le|ge|neq|approx|alpha|beta|gamma|delta|pi|theta|sigma|omega|infty|sum|int|cdot)\b[^{}\$]*))/g, (match) => {
    try {
      return katex.renderToString(match.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return match
    }
  })

  // 4. Auto-convert Unicode superscripts & common exponents (x², x³, dll)
  processed = processed.replace(/([a-zA-Z0-9\)])([²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱ]+)/g, (match, base, sup) => {
    const supMap = { '²':'2', '³':'3', '⁴':'4', '⁵':'5', '⁶':'6', '⁷':'7', '⁸':'8', '⁹':'9', '⁰':'0', '⁺':'+', '⁻':'-', 'ⁿ':'n', 'ⁱ':'i' }
    const mapped = sup.split('').map(c => supMap[c] || c).join('')
    try {
      return katex.renderToString(`${base}^{${mapped}}`, { displayMode: false, throwOnError: false })
    } catch {
      return `${base}<sup>${mapped}</sup>`
    }
  })

  // Pastikan semua <img> tag memiliki styling responsif yang konsisten dan interaktif untuk di-zoom
  processed = processed.replace(/<img\s+([^>]*?)>/gi, (match, attrs) => {
    if (!attrs.includes('class=')) {
      return `<img class="cbt-soal-image cursor-pointer hover:opacity-95 active:scale-[0.99] transition-transform rounded-xl border border-slate-200/90 shadow-2xs max-w-full my-2 inline-block" title="Tahan atau ketuk untuk memperbesar gambar" ${attrs} />`
    }
    return match
  })

  // Convert newlines ke <br> untuk tampilan multi-baris
  processed = processed.replace(/\n/g, '<br />')

  return processed
}

export default function CbtSoalRenderer({
  soal,
  currentIndex = 0,
  totalSoal = 1,
  currentJawaban,
  isRagu = false,
  onAnswerChange,
  onToggleRagu,
  onPrev,
  onNext,
  hasPrev = true,
  hasNext = true,
  onSubmit,
  fontSize = 'normal', // 'normal' | 'medium' | 'large'
  onFontSizeChange,
  onImageClick
}) {
  const holdTimerRef = React.useRef(null)
  const touchStartPos = React.useRef({ x: 0, y: 0, time: 0 })
  const isSwipingRef = React.useRef(false)

  const handleContainerClick = (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault()
      e.stopPropagation()
      onImageClick?.(e.target.src, e.target.alt || 'Gambar Soal')
    }
  }

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      }
      isSwipingRef.current = true
    }

    if (e.target.tagName === 'IMG') {
      const img = e.target
      holdTimerRef.current = setTimeout(() => {
        onImageClick?.(img.src, img.alt || 'Gambar Soal')
      }, 350)
    }
  }

  const handleTouchEnd = (e) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    if (!isSwipingRef.current) return
    isSwipingRef.current = false

    // Abaikan swipe jika siswa sedang berinteraksi dengan kolom input/textarea (isian/uraian)
    const targetTag = e.target?.tagName?.toUpperCase()
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || e.target?.isContentEditable) {
      return
    }

    if (e.changedTouches && e.changedTouches.length === 1) {
      const touchEnd = e.changedTouches[0]
      const deltaX = touchEnd.clientX - touchStartPos.current.x
      const deltaY = touchEnd.clientY - touchStartPos.current.y
      const elapsed = Date.now() - touchStartPos.current.time

      // Kriteria swipe horizontal yang valid:
      // 1. Jarak geser minimal 55px
      // 2. Arah dominan horizontal (horizontal > 1.3x vertikal)
      // 3. Durasi sentuhan maksimal 750ms (gestur cepat, bukan scrolling panjang)
      if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && elapsed < 750) {
        if (deltaX < 0) {
          // Geser ke Kiri -> Soal Berikutnya
          if (hasNext) {
            onNext?.()
            if (navigator?.vibrate) navigator.vibrate(15)
          }
        } else {
          // Geser ke Kanan -> Soal Sebelumnya
          if (hasPrev) {
            onPrev?.()
            if (navigator?.vibrate) navigator.vibrate(15)
          }
        }
      }
    }
  }

  if (!soal) {
    return (
      <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
        Memuat butir soal...
      </div>
    )
  }

  const tipeLabels = {
    pg: 'Pilihan Ganda',
    pg_kompleks: 'Pilihan Ganda Kompleks (Bisa > 1 Jawaban)',
    benar_salah: 'Benar / Salah',
    menjodohkan: 'Menjodohkan Pasangan',
    isian: 'Isian Singkat',
    uraian: 'Uraian (Essay)'
  }

  // Parse Opsi jika dalam format JSON string
  const opsiList = useMemo(() => {
    if (!soal.opsi) return []
    if (Array.isArray(soal.opsi)) return soal.opsi
    try {
      return JSON.parse(soal.opsi)
    } catch {
      return []
    }
  }, [soal.opsi])

  // Handler untuk PG Single
  const handleSelectSingle = (key) => {
    onAnswerChange(key)
  }

  // Handler untuk PG Kompleks (Multi-checkbox)
  const handleTogglePgKompleks = (key) => {
    let currentArr = []
    if (Array.isArray(currentJawaban)) {
      currentArr = [...currentJawaban]
    } else if (typeof currentJawaban === 'string' && currentJawaban.startsWith('[')) {
      try {
        currentArr = JSON.parse(currentJawaban)
      } catch {
        currentArr = [currentJawaban]
      }
    } else if (currentJawaban) {
      currentArr = [currentJawaban]
    }

    if (currentArr.includes(key)) {
      currentArr = currentArr.filter(k => k !== key)
    } else {
      currentArr.push(key)
    }
    currentArr.sort()
    onAnswerChange(currentArr)
  }

  // Cek apakah opsi terpilih untuk PG Kompleks
  const isPgKompleksSelected = (key) => {
    if (!currentJawaban) return false
    if (Array.isArray(currentJawaban)) return currentJawaban.includes(key)
    if (typeof currentJawaban === 'string') {
      try {
        const arr = JSON.parse(currentJawaban)
        return Array.isArray(arr) && arr.includes(key)
      } catch {
        return currentJawaban === key
      }
    }
    return false
  }

  // Kelas ukuran teks dinamis
  const fontClasses = {
    normal: {
      pertanyaan: 'text-sm md:text-base leading-relaxed',
      opsi: 'text-xs md:text-sm',
      input: 'text-sm'
    },
    medium: {
      pertanyaan: 'text-base md:text-lg leading-relaxed font-medium',
      opsi: 'text-sm md:text-base',
      input: 'text-base'
    },
    large: {
      pertanyaan: 'text-lg md:text-xl leading-relaxed font-semibold',
      opsi: 'text-base md:text-lg',
      input: 'text-lg'
    }
  }[fontSize] || {
    pertanyaan: 'text-sm md:text-base leading-relaxed',
    opsi: 'text-xs md:text-sm',
    input: 'text-sm'
  }

  return (
    <div
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 md:p-7 shadow-xs flex flex-col justify-between min-h-[520px] space-y-6"
    >
      <div className="space-y-5">
        {/* Header Butir Soal & Kontrol Ukuran Font */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">
              SOAL NO. {currentIndex + 1}
            </span>
            <span className="text-xs text-slate-400">
              dari {totalSoal} Soal
            </span>
            {/* Indikator Gesture Geser */}
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md">
              <span>↔ Geser layar ganti soal</span>
            </span>
            <span className="sm:hidden text-[10px] text-slate-400 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded-md">
              ↔ Geser
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Kontrol Ukuran Huruf A- / A / A+ */}
            {onFontSizeChange && (
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onFontSizeChange('normal')}
                  title="Ukuran Tulisan Standar"
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                    fontSize === 'normal'
                      ? 'bg-white text-indigo-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => onFontSizeChange('medium')}
                  title="Ukuran Tulisan Sedang"
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                    fontSize === 'medium'
                      ? 'bg-white text-indigo-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => onFontSizeChange('large')}
                  title="Ukuran Tulisan Besar"
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                    fontSize === 'large'
                      ? 'bg-white text-indigo-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  A+
                </button>
              </div>
            )}

            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-semibold">
              {tipeLabels[soal.tipe_soal] || 'Soal'}
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Bobot: {soal.bobot || 1.0}
            </span>
          </div>
        </div>

        {/* Konten Pertanyaan */}
        <div 
          className={`text-slate-800 break-words font-normal ${fontClasses.pertanyaan}`}
          dangerouslySetInnerHTML={{ __html: renderFormattedMath(soal.pertanyaan) }}
        />

        {/* Variasi Pilihan Jawaban */}
        <div className="pt-2">
          {/* TIPE 1: Pilihan Ganda Tunggal */}
          {soal.tipe_soal === 'pg' && (
            <div className="space-y-2.5">
              {opsiList.map((opt, idx) => {
                const displayLabel = String.fromCharCode(65 + idx)
                const optKey = opt.key || displayLabel
                const isSelected = currentJawaban === optKey

                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleSelectSingle(optKey)}
                    className={`w-full text-left p-3.5 rounded-xl border text-sm transition-all duration-150 flex items-start gap-3 ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {displayLabel}
                    </span>
                    <div 
                      className="pt-0.5 leading-relaxed flex-1"
                      dangerouslySetInnerHTML={{ __html: renderFormattedMath(opt.text || opt) }}
                    />
                  </button>
                )
              })}
            </div>
          )}

          {/* TIPE 2: Pilihan Ganda Kompleks */}
          {soal.tipe_soal === 'pg_kompleks' && (
            <div className="space-y-2.5">
              <div className="p-2.5 bg-blue-50 rounded-xl text-blue-700 text-xs font-medium mb-3 flex items-center gap-2 border border-blue-100">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Petunjuk: Centang semua jawaban yang benar (bisa lebih dari satu).</span>
              </div>
              {opsiList.map((opt, idx) => {
                const displayLabel = String.fromCharCode(65 + idx)
                const optKey = opt.key || displayLabel
                const isSelected = isPgKompleksSelected(optKey)

                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleTogglePgKompleks(optKey)}
                    className={`w-full text-left p-3.5 rounded-xl border text-sm transition-all duration-150 flex items-start gap-3 ${
                      isSelected
                        ? 'bg-indigo-50/90 border-indigo-500 text-indigo-950 ring-1 ring-indigo-500 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 transition-colors border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-400 border-slate-300'
                    }`}>
                      {isSelected ? '✓' : ''}
                    </div>
                    <span className="font-bold text-xs text-slate-500 pt-0.5">{displayLabel}.</span>
                    <div 
                      className="pt-0.5 leading-relaxed flex-1"
                      dangerouslySetInnerHTML={{ __html: renderFormattedMath(opt.text || opt) }}
                    />
                  </button>
                )
              })}
            </div>
          )}

          {/* TIPE 3: Benar / Salah */}
          {soal.tipe_soal === 'benar_salah' && (
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <button
                type="button"
                onClick={() => handleSelectSingle('Benar')}
                className={`p-4 rounded-xl border text-center font-bold text-sm transition-all ${
                  currentJawaban === 'Benar'
                    ? 'bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-400 shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                BENAR
              </button>
              <button
                type="button"
                onClick={() => handleSelectSingle('Salah')}
                className={`p-4 rounded-xl border text-center font-bold text-sm transition-all ${
                  currentJawaban === 'Salah'
                    ? 'bg-rose-500 text-white border-rose-600 ring-2 ring-rose-400 shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                SALAH
              </button>
            </div>
          )}

          {/* TIPE 4: Isian Singkat */}
          {soal.tipe_soal === 'isian' && (
            <div className="space-y-2 max-w-md">
              <label className="block text-xs font-semibold text-slate-600">
                Tulis Jawaban Singkat Anda:
              </label>
              <input
                type="text"
                value={currentJawaban || ''}
                onChange={(e) => onAnswerChange(e.target.value)}
                placeholder="Ketik jawaban di sini..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* TIPE 5: Uraian / Essay */}
          {soal.tipe_soal === 'uraian' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600">
                Lembar Jawaban Uraian / Penjelasan:
              </label>
              <textarea
                rows={5}
                value={currentJawaban || ''}
                onChange={(e) => onAnswerChange(e.target.value)}
                placeholder="Tuliskan penjelasan dan uraian lengkap Anda..."
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed resize-y"
              />
            </div>
          )}
        </div>
      </div>

      {/* Kontrol Navigasi & Checkbox Ragu-Ragu */}
      <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Tombol Checkbox Ragu-Ragu */}
        <label className="flex items-center gap-2 cursor-pointer select-none bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl text-amber-900 text-xs font-semibold hover:bg-amber-100/70 transition-colors">
          <input
            type="checkbox"
            checked={!!isRagu}
            onChange={(e) => onToggleRagu(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
          />
          <span>Ragu-Ragu</span>
        </label>

        {/* Tombol Sebelumnya & Selanjutnya */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              hasPrev
                ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                : 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-transparent'
            }`}
          >
            ← Sebelumnya
          </button>

          {hasNext ? (
            <button
              type="button"
              onClick={onNext}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              Selanjutnya →
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              Selesai & Kumpulkan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
