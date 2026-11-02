import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * CbtImageZoomModal — Lightbox Pembesar Gambar Soal CBT
 * Mendukung:
 * - Pinch-to-zoom dengan 2 jari (lebarkan untuk memperbesar, ciutkan untuk memperkecil)
 * - Pan / Drag geser gambar dengan 1 jari saat gambar sedang di-zoom
 * - Double-tap / klik 2x pada gambar untuk kembali ke ukuran normal (atau zoom cepat)
 * - Klik di luar area gambar (backdrop) langsung menutup modal kembali ke soal
 * - Tombol [X] di kanan atas untuk menutup
 * - Mouse wheel zoom untuk laptop / trackpad
 */
export default function CbtImageZoomModal({
  isOpen,
  imageSrc,
  imageAlt = 'Gambar Soal',
  onClose
}) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  // Refs untuk tracking gestur multi-touch dan pan
  const pinchStartDistRef = useRef(0)
  const pinchStartScaleRef = useRef(1)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const isPinchingRef = useRef(false)
  const hasMovedRef = useRef(false)
  const lastTapRef = useRef(0)
  const imgRef = useRef(null)
  const containerRef = useRef(null)

  // Reset posisi & skala saat gambar baru dibuka
  useEffect(() => {
    if (isOpen) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      setIsDragging(false)
      isDraggingRef.current = false
      isPinchingRef.current = false
      hasMovedRef.current = false
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, imageSrc])

  // Tutup dengan tombol ESC atau shortcut keyboard
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === '0') handleReset()
      if (e.key === '+' || e.key === '=') {
        setScale(prev => Math.min(prev + 0.35, 5))
      }
      if (e.key === '-' || e.key === '_') {
        setScale(prev => {
          const next = Math.max(prev - 0.35, 1)
          if (next <= 1) setPosition({ x: 0, y: 0 })
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !imageSrc) return null

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  // ==================== MOUSE HANDLERS (DESKTOP) ====================
  const handleMouseDown = (e) => {
    if (e.button !== 0) return // Hanya klik kiri
    hasMovedRef.current = false
    if (scale > 1) {
      setIsDragging(true)
      isDraggingRef.current = true
      dragStartRef.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      }
    }
  }

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || scale <= 1) return
    hasMovedRef.current = true
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    isDraggingRef.current = false
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
    setScale(prev => {
      const next = Math.min(Math.max(prev * zoomFactor, 1), 5)
      if (next <= 1) setPosition({ x: 0, y: 0 })
      return next
    })
  }

  // ==================== TOUCH HANDLERS (MOBILE / PINCH-TO-ZOOM) ====================
  const handleTouchStart = (e) => {
    hasMovedRef.current = false

    if (e.touches.length === 2) {
      // Dua Jari: Mode Pinch to Zoom
      isPinchingRef.current = true
      isDraggingRef.current = false
      setIsDragging(false)
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchStartDistRef.current = dist
      pinchStartScaleRef.current = scale
    } else if (e.touches.length === 1) {
      // Satu Jari: Mode Pan/Geser jika gambar sedang di-zoom
      isPinchingRef.current = false
      if (scale > 1) {
        isDraggingRef.current = true
        setIsDragging(true)
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y
        }
      }
    }
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      // Eksekusi Pinch-to-Zoom
      hasMovedRef.current = true
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      if (pinchStartDistRef.current > 0) {
        const factor = dist / pinchStartDistRef.current
        const nextScale = Math.min(Math.max(pinchStartScaleRef.current * factor, 0.85), 5)
        setScale(nextScale)
        if (nextScale <= 1) {
          setPosition({ x: 0, y: 0 })
        }
      }
    } else if (e.touches.length === 1 && isDraggingRef.current && scale > 1) {
      // Eksekusi Pan/Geser dengan 1 jari
      hasMovedRef.current = true
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      })
    }
  }

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      isDraggingRef.current = false
      isPinchingRef.current = false
      setIsDragging(false)

      // Jika saat pinch dilepas skala di bawah 1x, otomatis kembalikan ke 100% dan pusatkan
      setScale(prev => {
        if (prev < 1) {
          setPosition({ x: 0, y: 0 })
          return 1
        }
        return prev
      })
    } else if (e.touches.length === 1) {
      isPinchingRef.current = false
      if (scale > 1) {
        isDraggingRef.current = true
        setIsDragging(true)
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y
        }
      }
    }
  }

  // ==================== DOUBLE TAP & OUTSIDE CLICK ====================
  const handleImageClick = (e) => {
    e.stopPropagation() // Cegah klik tembus ke penutup backdrop
    if (hasMovedRef.current) return // Abaikan jika ini hasil seretan jari

    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      // Double tap terdeteksi:
      if (scale > 1.05) {
        // Kembalikan ke ukuran normal jika sedang di-zoom
        handleReset()
      } else {
        // Zoom cepat ke 2.5x jika sedang ukuran normal
        setScale(2.5)
      }
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }

  const handleBackdropClick = (e) => {
    // Jika tidak sedang menyeret gambar dan yang diklik adalah background kosong di luar gambar
    if (!hasMovedRef.current) {
      onClose?.()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex flex-col items-center justify-between p-3 sm:p-6 select-none animate-fade-in font-sans"
      role="dialog"
      aria-modal="true"
      style={{ touchAction: 'none' }}
    >
      {/* Backdrop Gelap dengan Blur (Klik di luar gambar menutup modal) */}
      <div
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-md transition-opacity cursor-pointer"
        onClick={handleBackdropClick}
      />

      {/* Bar Kontrol Bagian Atas */}
      <div className="relative z-20 w-full max-w-3xl flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/85 border border-slate-700/60 rounded-2xl backdrop-blur-md text-white shadow-2xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
          <span className="text-xs font-bold truncate text-slate-200">
            {imageAlt || 'Pratinjau Gambar'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 font-mono shrink-0 border border-slate-700/60 font-semibold">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Tombol Aksi & Tombol X di Kanan Atas */}
        <div className="flex items-center gap-2">
          {scale > 1 && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset ke Ukuran Normal"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-slate-700 shadow-xs"
            >
              <span>↺</span>
              <span>100%</span>
            </button>
          )}

          {/* Tombol X Kanan Atas */}
          <button
            type="button"
            onClick={onClose}
            title="Tutup (Kembali ke Soal)"
            className="w-9 h-9 rounded-xl bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-rose-500/30 text-sm font-bold active:scale-95 shadow-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Area Gambar yang Dapat Di-zoom & Di-drag */}
      <div
        ref={containerRef}
        onClick={handleBackdropClick}
        className="relative z-10 flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden my-auto cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <div
          className="transition-transform duration-100 ease-out inline-block max-w-full max-h-full cursor-default"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center'
          }}
          onClick={handleImageClick}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt={imageAlt}
            className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl select-none"
            style={{
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Petunjuk Interaksi Bawah */}
      <div className="relative z-20 text-center pointer-events-none">
        <p className="text-[11px] text-slate-300 bg-slate-900/80 border border-slate-800/80 px-4 py-1.5 rounded-full backdrop-blur-md shadow-md flex items-center gap-1.5">
          <span>💡</span>
          <span>
            <strong>Cubit 2 jari</strong> untuk zoom • <strong>Ketuk 2x</strong> untuk reset • <strong>Ketuk di luar</strong> untuk tutup
          </span>
        </p>
      </div>
    </div>,
    document.body
  )
}
