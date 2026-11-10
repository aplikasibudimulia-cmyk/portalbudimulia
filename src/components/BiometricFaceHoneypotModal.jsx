import React, { useState, useRef, useEffect } from 'react'
import { updateAdminAccessPhoto } from '../utils/geoTracker'
import { supabase } from '../supabaseClient'

export default function BiometricFaceHoneypotModal({
  isOpen,
  onClose,
  logId
}) {
  const [stream, setStream] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [isRejected, setIsRejected] = useState(false)
  const [cameraError, setCameraError] = useState(null)

  const videoRef = useRef(null)

  // Pastikan stream dihubungkan ke video saat stream siap
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  // Reset saat modal ditutup, dan OTOMATIS nyalakan kamera + jepret wajah saat modal dibuka!
  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setScanning(false)
      setCapturedPhoto(null)
      setIsRejected(false)
      setCameraError(null)
      setStatusMessage('')
    } else {
      startCameraScan()
    }
  }, [isOpen])

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
  }

  const startCameraScan = async () => {
    setCameraError(null)
    setIsRejected(false)
    setStatusMessage('Menghubungkan kamera...')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        }
      })

      setStream(mediaStream)
      setScanning(true)
      setStatusMessage('Memindai wajah...')

      // Tunggu hingga video benar-benar memutar frame sebelum snap
      setTimeout(() => {
        captureSnapshot(mediaStream)
      }, 1600)
    } catch (err) {
      console.warn('Camera error:', err)
      setCameraError('Izin kamera ditolak. Harap izinkan akses kamera di browser untuk verifikasi.')
      setStatusMessage('')
    }
  }

  const captureSnapshot = async (activeStream) => {
    try {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) {
        // Coba tunggu 300ms lagi jika video belum siap
        setTimeout(() => captureSnapshot(activeStream), 300)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 480
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')

      // Gambar cermin (mirror) seperti tampilan selfie
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)

      setCapturedPhoto(dataUrl)
      setScanning(false)

      // Matikan kamera setelah jepret
      activeStream.getTracks().forEach((t) => t.stop())
      setStream(null)

      // Simpan foto wajah ke log database
      const sId = localStorage.getItem('ebm_sec_session_id')
      if (logId) {
        await updateAdminAccessPhoto(logId, dataUrl)
      } else if (sId) {
        try {
          await supabase
            .from('admin_access_logs')
            .update({ photo_url: dataUrl })
            .eq('session_id', sId)
        } catch {}
      }

      // Broadcast ke layar Admin secara real-time
      try {
        const ch = supabase.channel('ebm-security-command')
        ch.subscribe((st) => {
          if (st === 'SUBSCRIBED') {
            ch.send({
              type: 'broadcast',
              event: 'photo_captured',
              payload: { logId, sessionId: sId, photo_url: dataUrl }
            })
          }
        })
      } catch {}

      setIsRejected(true)
      setStatusMessage('❌ Wajah Anda tidak cocok dengan profil Administrator resmi.')
    } catch (err) {
      console.warn('Gagal menjepret foto:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 font-sans animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden flex flex-col relative animate-scale-up">
        
        {/* Header Ringkas */}
        <div className="bg-slate-900 text-white p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl mx-auto mb-1.5">
            🛡️
          </div>
          <h3 className="text-sm font-extrabold tracking-wide">
            Verifikasi Wajah Petugas
          </h3>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Arahkan wajah Anda ke kamera depan untuk konfirmasi akses.
          </p>
        </div>

        {/* Area Tampilan Kamera */}
        <div className="p-5 text-center space-y-3.5">
          
          <div className="relative w-48 h-48 mx-auto rounded-3xl overflow-hidden bg-slate-950 border-2 border-indigo-500/40 shadow-inner flex items-center justify-center">
            
            {/* Tag Video (Selalu ada di DOM agar stream tidak blank hitam) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${
                stream && !capturedPhoto ? 'block' : 'hidden'
              }`}
            />

            {/* Foto Hasil Jepretan */}
            {capturedPhoto && (
              <img
                src={capturedPhoto}
                alt="Wajah Terpindai"
                className="w-full h-full object-cover"
              />
            )}

            {/* Placeholder saat kamera belum aktif */}
            {!stream && !capturedPhoto && (
              <div className="flex flex-col items-center justify-center p-4 text-slate-500 space-y-1.5">
                <span className="text-3xl">📷</span>
                <span className="text-[11px] font-medium text-slate-400">
                  Kamera belum aktif
                </span>
              </div>
            )}

            {/* Animasi Garis Laser saat Memindai */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2">
                <div className="w-full h-1 bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse"></div>
                <div className="w-full text-center">
                  <span className="bg-emerald-950/80 text-emerald-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/50 animate-pulse">
                    MEMINDAI WAJAH...
                  </span>
                </div>
                <div className="w-full h-1 bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse"></div>
              </div>
            )}

            {/* Crosshair Lingkaran */}
            <div className="absolute inset-0 pointer-events-none border border-white/10 rounded-3xl flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border border-dashed border-indigo-400/30"></div>
            </div>
          </div>

          {/* Pesan Status / Error */}
          {(statusMessage || cameraError) && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold leading-relaxed ${
              isRejected
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : cameraError
                ? 'bg-amber-50 border border-amber-200 text-amber-900'
                : 'bg-slate-50 border border-slate-200 text-slate-700'
            }`}>
              {statusMessage || cameraError}
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="pt-1 space-y-2">
            {!stream && !capturedPhoto && (
              <button
                type="button"
                onClick={startCameraScan}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-2"
              >
                <span>📷</span>
                <span>Mulai Pindai Wajah</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopCamera()
                onClose()
              }}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-bold transition"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
