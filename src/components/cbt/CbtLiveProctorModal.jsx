import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'

/**
 * CbtLiveProctorModal
 * Modal Pemantau Kamera Siswa secara Live On-Demand untuk Guru/Pengawas.
 * Mengalirkan transmisi 1-arah secara efisien via Supabase Realtime Broadcast.
 */
export default function CbtLiveProctorModal({
  isOpen,
  onClose,
  sesiId,
  student,
  onForceSubmit
}) {
  const [streamStatus, setStreamStatus] = useState('connecting') // 'connecting' | 'live' | 'offline'
  const [lastFrame, setLastFrame] = useState(null)
  const [lastReceivedAt, setLastReceivedAt] = useState(null)
  const timeoutTimerRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !sesiId || !student?.nisn) {
      setStreamStatus('connecting')
      setLastFrame(null)
      return
    }

    const channelName = `cbt_live_feed_${sesiId}`
    const channel = supabase.channel(channelName)

    channel
      .on('broadcast', { event: 'student_camera_frame' }, (payload) => {
        if (payload?.payload?.nisn === student.nisn) {
          setLastFrame(payload.payload.image)
          setStreamStatus('live')
          setLastReceivedAt(new Date())

          // Reset watchdog timer
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)
          timeoutTimerRef.current = setTimeout(() => {
            setStreamStatus('offline')
          }, 8000)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Minta siswa memulai transmisi live feed kamera
          channel.send({
            type: 'broadcast',
            event: 'proctor_request_feed',
            payload: { nisn: student.nisn }
          })
        }
      })

    // Timeout jika dalam 7 detik tidak ada respon dari HP siswa
    const initialTimeout = setTimeout(() => {
      setStreamStatus(prev => (prev === 'connecting' ? 'offline' : prev))
    }, 7000)

    return () => {
      clearTimeout(initialTimeout)
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current)

      // Beritahu siswa agar berhenti mentransmisikan video
      channel.send({
        type: 'broadcast',
        event: 'proctor_stop_feed',
        payload: { nisn: student.nisn }
      })

      supabase.removeChannel(channel)
    }
  }, [isOpen, sesiId, student?.nisn])

  if (!isOpen || !student) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
        {/* Header Modal */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-lg shrink-0">
              📹
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-800">
                  {student.nama || student.nama_lengkap}
                </h3>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold text-[10px] rounded-md border border-indigo-200">
                  Kelas {student.kelas}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                NISN: {student.nisn} • Pengawasan Kamera 1-Arah
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold transition-all"
          >
            ✕
          </button>
        </div>

        {/* Video Screen Container */}
        <div className="relative w-full aspect-4/3 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
          {streamStatus === 'live' && lastFrame ? (
            <img
              src={lastFrame}
              alt={`Live Camera ${student.nama || student.nama_lengkap || ''}`}
              className="w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-100"
            />
          ) : streamStatus === 'connecting' ? (
            <div className="text-center space-y-2 p-6">
              <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-semibold text-slate-300">
                Menghubungkan ke kamera selfie siswa...
              </p>
              <p className="text-[10px] text-slate-500">
                Meminta stream kamera HP siswa melalui koneksi terenkripsi
              </p>
            </div>
          ) : (
            <div className="text-center space-y-2 p-6">
              <span className="text-3xl">⚠️</span>
              <p className="text-xs font-bold text-rose-400">
                Kamera Siswa Tidak Merespons
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                HP siswa mungkin sedang kehilangan koneksi internet atau aplikasi diminimalkan ke background.
              </p>
            </div>
          )}

          {/* Status Overlay di Pojok Kiri Atas */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                streamStatus === 'live'
                  ? 'bg-emerald-500 animate-pulse'
                  : streamStatus === 'connecting'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
              }`}
            ></span>
            <span>
              {streamStatus === 'live'
                ? 'LIVE MONITORING'
                : streamStatus === 'connecting'
                  ? 'MENGHUBUNGKAN'
                  : 'OFFLINE'}
            </span>
          </div>

          {/* Timestamp di Pojok Kanan Bawah */}
          {lastReceivedAt && streamStatus === 'live' && (
            <div className="absolute bottom-2 right-3 text-[9px] text-white/70 font-mono bg-black/50 px-2 py-0.5 rounded">
              Frame: {lastReceivedAt.toLocaleTimeString('id-ID')}
            </div>
          )}
        </div>

        {/* Info & Aksi Pengawas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-500 max-w-xs">
            <span className="font-semibold text-slate-700">Catatan:</span> Siswa hanya melihat kamera selfienya sendiri di HP-nya dan tidak mendengar atau melihat pengawas.
          </div>

          <div className="flex items-center gap-2">
            {onForceSubmit && (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onForceSubmit(student.peserta?.id || student.peserta_id, student.nama || student.nama_lengkap)
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-all active:scale-95"
              >
                Paksa Kumpulkan
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all active:scale-95"
            >
              Tutup Pemantau
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
