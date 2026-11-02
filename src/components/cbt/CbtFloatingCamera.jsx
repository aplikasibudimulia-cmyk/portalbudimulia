import React, { useRef, useEffect, useState } from 'react'

/**
 * CbtFloatingCamera
 * Widget Kamera Selfie Melayang (Floating & Draggable) untuk Pengawasan Ujian Siswa.
 * - Siswa hanya melihat kamera selfienya sendiri (efek psikologis pengawasan).
 * - Bisa digeser bebas (drag & drop) dengan jari/mouse agar tidak menutupi soal ujian.
 */
export default function CbtFloatingCamera({ stream, isLiveWatched = false }) {
  const videoRef = useRef(null)
  const widgetRef = useRef(null)

  // Posisi default di kanan atas (aman dari tombol navigasi bawah)
  const [position, setPosition] = useState(() => {
    const isMobile = window.innerWidth < 640
    return {
      x: isMobile ? window.innerWidth - 118 : window.innerWidth - 140,
      y: isMobile ? 70 : 80
    }
  })

  const isDraggingRef = useRef(false)
  const dragStartOffsetRef = useRef({ x: 0, y: 0 })

  // Hubungkan stream kamera ke elemen video
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(err => {
        console.warn('[Floating Camera] Autoplay dicegah:', err)
      })
    }
  }, [stream])

  // Mouse / Touch Dragging Handler
  const handleStartDrag = (clientX, clientY) => {
    isDraggingRef.current = true
    if (widgetRef.current) {
      const rect = widgetRef.current.getBoundingClientRect()
      dragStartOffsetRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top
      }
    }
  }

  const handleMoveDrag = (clientX, clientY) => {
    if (!isDraggingRef.current) return
    const width = 110
    const height = 135
    const maxX = window.innerWidth - width - 8
    const maxY = window.innerHeight - height - 8

    let nextX = clientX - dragStartOffsetRef.current.x
    let nextY = clientY - dragStartOffsetRef.current.y

    // Boundary clamp
    nextX = Math.max(8, Math.min(nextX, maxX))
    nextY = Math.max(8, Math.min(nextY, maxY))

    setPosition({ x: nextX, y: nextY })
  }

  const handleEndDrag = () => {
    isDraggingRef.current = false
  }

  // Window resize protection
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        const maxX = window.innerWidth - 120
        const maxY = window.innerHeight - 145
        return {
          x: Math.min(prev.x, Math.max(8, maxX)),
          y: Math.min(prev.y, Math.max(8, maxY))
        }
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      ref={widgetRef}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none'
      }}
      className="fixed z-40 select-none group cursor-grab active:cursor-grabbing transition-shadow"
      onMouseDown={(e) => {
        handleStartDrag(e.clientX, e.clientY)
        const onMouseMove = (ev) => handleMoveDrag(ev.clientX, ev.clientY)
        const onMouseUp = () => {
          handleEndDrag()
          window.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('mouseup', onMouseUp)
        }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
      }}
      onTouchStart={(e) => {
        if (e.touches && e.touches[0]) {
          handleStartDrag(e.touches[0].clientX, e.touches[0].clientY)
        }
      }}
      onTouchMove={(e) => {
        if (e.touches && e.touches[0]) {
          handleMoveDrag(e.touches[0].clientX, e.touches[0].clientY)
        }
      }}
      onTouchEnd={handleEndDrag}
    >
      <div className="relative w-[108px] h-[135px] sm:w-[124px] sm:h-[155px] bg-slate-900 rounded-2xl overflow-hidden border-2 border-indigo-500/90 shadow-2xl ring-2 ring-indigo-500/20 backdrop-blur-xs">
        {/* Stream Video Selfie (Mirrored) */}
        <video
          ref={videoRef}
          id="cbt-student-selfie-video"
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform scale-x-[-1] pointer-events-none"
        />

        {/* Drag Handle Bar di Atas */}
        <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            <span className="text-[9px] font-black text-rose-400 tracking-wider">LIVE</span>
          </div>
          {/* Drag dots icon */}
          <div className="flex gap-0.5 opacity-60">
            <span className="w-1 h-1 bg-white rounded-full"></span>
            <span className="w-1 h-1 bg-white rounded-full"></span>
            <span className="w-1 h-1 bg-white rounded-full"></span>
          </div>
        </div>

        {/* Bottom Badge: Pengawas Aktif */}
        <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center">
          <span className="text-[9px] font-bold text-white tracking-tight flex items-center gap-1 drop-shadow-xs">
            <span>📷</span>
            <span>Pengawas Aktif</span>
          </span>
        </div>

        {/* Highlight border jika guru sedang live melihat */}
        {isLiveWatched && (
          <div className="absolute inset-0 border-2 border-rose-500 rounded-2xl animate-pulse pointer-events-none"></div>
        )}
      </div>
    </div>
  )
}
