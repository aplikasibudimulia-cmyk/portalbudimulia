import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import CbtSoalRenderer from '../components/cbt/CbtSoalRenderer'
import CbtNavigasiNomor from '../components/cbt/CbtNavigasiNomor'
import CbtMobileBottomNav from '../components/cbt/CbtMobileBottomNav'
import CbtImageZoomModal from '../components/cbt/CbtImageZoomModal'
import {
  getLocalAnswers,
  saveAnswerLocally,
  cacheQuestionsLocally,
  getCachedQuestions,
  syncUnsyncedAnswers,
  clearLocalExamSession
} from '../utils/cbt/cbtStorage'
import { generateEmergencyQrPayload } from '../utils/cbt/cbtCrypto'
import { getOrCreateDeviceId } from '../utils/cbt/cbtDeviceHelper'
import { getCameraStream } from '../utils/cameraUtils'
import { getServerNow } from '../utils/dateUtils'
import CbtFloatingCamera from '../components/cbt/CbtFloatingCamera'
import { App as CapApp } from '@capacitor/app'
import { registerPlugin, Capacitor } from '@capacitor/core'

const CbtLockTask = Capacitor.Plugins?.CbtLockTask || registerPlugin('CbtLockTask')

// Modal Pengawas / Admin untuk Membuka Kunci Layar (Kiosk Mode) & Reset Sesi Siswa
function AdminUnlockModal({
  isOpen,
  onClose,
  adminCodeInput,
  setAdminCodeInput,
  adminCodeError,
  isAdminUnlocked,
  onVerify,
  onUnlockScreenOnly,
  onUnlockAndExit,
  onResetStrikes,
  isBlocked
}) {
  const [showPassword, setShowPassword] = useState(false)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-up">
        {/* Header Modal */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                Otorisasi Khusus
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Kunci Pengawas / Admin CBT
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isAdminUnlocked ? (
          <form onSubmit={onVerify} className="space-y-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              Masukkan <strong>PIN Otorisasi Pengawas</strong> atau <strong>Kode Sesi Ujian</strong> untuk membuka kuncian layar atau mengelola sesi siswa ini.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wider">
                Kode / PIN Pengawas:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={adminCodeInput}
                  onChange={(e) => setAdminCodeInput(e.target.value)}
                  placeholder="Ketik PIN atau Token Ujian..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-widest uppercase pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {adminCodeError && (
                <p className="text-[11px] text-rose-600 font-medium">
                  {adminCodeError}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-md"
              >
                Buka Kunci
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-900">Otorisasi Diterima</div>
                <div className="text-[11px] text-emerald-700">Pilih tindakan pengawas yang ingin dijalankan:</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onUnlockScreenOnly}
                className="w-full p-3 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">1. Lepas Kuncian Layar Saja</div>
                  <div className="text-[11px] text-slate-500">Matikan Kiosk Mode Android tanpa keluar dari lembar ujian siswa.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onUnlockAndExit}
                className="w-full p-3 rounded-2xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 text-left transition-all group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">2. Buka Kunci & Keluar Aplikasi</div>
                  <div className="text-[11px] text-slate-500">Lepas kuncian dan tutup/keluar dari aplikasi portal eBudiMulia.</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onResetStrikes}
                className="w-full p-3 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition-all group flex items-start gap-3 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">3. Reset Pelanggaran & Pulihkan Ujian</div>
                  <div className="text-[11px] text-slate-500">Buka blokir status siswa dan izinkan melanjutkan pengerjaan soal.</div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
            >
              Tutup Menu
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CbtUjianSiswaPage() {
  const { sesiId } = useParams()
  const [searchParams] = useSearchParams()
  const pesertaId = searchParams.get('peserta_id')
  const navigate = useNavigate()

  // Session Student Data from localStorage
  const student = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('siswa_session') || '{}')
    } catch {
      return {}
    }
  }, [])

  // Sesi & Soal State
  const [loading, setLoading] = useState(true)
  const [sesi, setSesi] = useState(null)
  const [peserta, setPeserta] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})

  // Fase 6: Instruksi & Orientasi
  const [hasReadInstruction, setHasReadInstruction] = useState(false)
  const [showInstructionModal, setShowInstructionModal] = useState(false)
  const [startingExam, setStartingExam] = useState(false)
  const [retakeNotice, setRetakeNotice] = useState(null)

  // Timer State
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const [extraTimeAlert, setExtraTimeAlert] = useState(null)

  // Strike & Integritas Anti-Curang State
  const [strikeCount, setStrikeCount] = useState(0)
  const [totalPelanggaran, setTotalPelanggaran] = useState(0)
  const [isLocked, setIsLocked] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [showStrikeWarning, setShowStrikeWarning] = useState(false)
  const [isDeviceLocked, setIsDeviceLocked] = useState(Capacitor.isNativePlatform() ? false : true)
  const [isActivatingLock, setIsActivatingLock] = useState(false)
  const [graceSeconds, setGraceSeconds] = useState(5)

  // Camera Proctoring State
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [isLiveWatched, setIsLiveWatched] = useState(false)

  // Single Device Lock State
  const [isDeviceConflict, setIsDeviceConflict] = useState(false)
  const [conflictDeviceInfo, setConflictDeviceInfo] = useState('')

  // Admin / Pengawas Hidden Unlock State
  const [showAdminUnlockModal, setShowAdminUnlockModal] = useState(false)
  const [adminCodeInput, setAdminCodeInput] = useState('')
  const [adminCodeError, setAdminCodeError] = useState('')
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false)

  // Status Perangkat & Jaringan
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('saved')

  // Submit Modal & Emergency QR
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [emergencyQrData, setEmergencyQrData] = useState(null)
  const [submitResult, setSubmitResult] = useState(null)

  // Aksesibilitas: Ukuran Tulisan
  const [fontSize, setFontSize] = useState(() => {
    try {
      return localStorage.getItem('cbt_font_size') || 'normal'
    } catch {
      return 'normal'
    }
  })
  const handleFontSizeChange = (size) => {
    setFontSize(size)
    try {
      localStorage.setItem('cbt_font_size', size)
    } catch {}
  }

  // Lightbox Zoom Gambar & Navigasi Bawah
  const [activeZoomImage, setActiveZoomImage] = useState(null)
  const [isBottomNavExpanded, setIsBottomNavExpanded] = useState(false)
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true)

  // Refs
  const hasReadInstructionRef = useRef(false)
  const timerRef = useRef(null)
  const handleAutoSubmitRef = useRef(null)
  const handleRetakeResetRef = useRef(null)
  const sesiRef = useRef(null)
  const pesertaRef = useRef(null)
  const roomChannelRef = useRef(null)
  const isLiveWatchedRef = useRef(false)
  const liveFrameTimerRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const graceTimerRef = useRef(null)
  const lastStrikeTimeRef = useRef(0)
  const blurTimeoutRef = useRef(null)
  const unblockGraceUntilRef = useRef(0)
  const cameraGraceUntilRef = useRef(0)
  const initialGraceUntilRef = useRef(Date.now() + 8000)
  const isRequestingCameraRef = useRef(false)
  const tapHistoryRef = useRef([])
  const adminUnlockedRef = useRef(false)
  const hasLockedTaskRef = useRef(false)

  // Helper Broadcast Instan (<30ms) ke Ruang Pengawas Ujian
  const broadcastToExamRoom = useCallback((eventName, payload = {}) => {
    try {
      const fullPayload = {
        sesi_id: sesiId,
        peserta_id: pesertaId || pesertaRef.current?.id,
        siswa_nisn: student?.nisn || pesertaRef.current?.siswa_nisn,
        ...payload
      }
      const sendPayload = (ch) => {
        if (!ch) return
        ch.send({
          type: 'broadcast',
          event: eventName,
          payload: fullPayload
        }).catch(() => {})
      }

      if (roomChannelRef.current && roomChannelRef.current.state === 'joined') {
        sendPayload(roomChannelRef.current)
      } else {
        // Redundan: Kirim jika channel sedang connecting / joining
        setTimeout(() => sendPayload(roomChannelRef.current), 500)
        setTimeout(() => sendPayload(roomChannelRef.current), 1500)
      }
    } catch (e) {
      console.warn('[CBT Room Broadcast Error]', e)
    }
  }, [sesiId, pesertaId, student?.nisn])

  // Auto-dismiss alert tambahan waktu setelah 8 detik
  useEffect(() => {
    if (!extraTimeAlert) return
    const timer = setTimeout(() => {
      setExtraTimeAlert(null)
    }, 8000)
    return () => clearTimeout(timer)
  }, [extraTimeAlert])

  // 2. Hitung Sisa Waktu Ujian (Menggunakan waktu server getServerNow agar kebal manipulasi jam HP)
  const calculateRemainingTime = useCallback((pData, sesiData) => {
    if (!pData || !sesiData) return
    clearInterval(timerRef.current)
    const serverNowMs = getServerNow().getTime()
    const waktuMulai = new Date(pData.waktu_mulai || serverNowMs).getTime()
    const extraMs = (pData.extra_waktu_menit || 0) * 60 * 1000
    const durasiMs = (sesiData.durasi_menit || 90) * 60 * 1000
    let targetAkhir = waktuMulai + durasiMs + extraMs

    // Batasi targetAkhir agar tidak melebihi batas waktu tutup sesi jika ditentukan
    // PENTING: Jika siswa mendapatkan extra_waktu_menit, batas penutupan sesi juga ikut
    // diperpanjang secara individual sebesar extraMs agar kompensasi waktu dari guru tidak terpotong!
    const waktuTutupStr = sesiData.waktu_tutup || sesiData.waktu_selesai
    if (waktuTutupStr) {
      const hardDeadline = new Date(waktuTutupStr).getTime() + extraMs
      if (hardDeadline < targetAkhir) {
        targetAkhir = hardDeadline
      }
    }

    const updateTimer = () => {
      const now = getServerNow().getTime()
      const diffSec = Math.max(0, Math.floor((targetAkhir - now) / 1000))
      setRemainingSeconds(diffSec)

      if (diffSec <= 0) {
        clearInterval(timerRef.current)
        if (handleAutoSubmitRef.current) {
          handleAutoSubmitRef.current()
        }
      }
    }

    updateTimer()
    timerRef.current = setInterval(updateTimer, 1000)
  }, [])

  // Helper cek apakah sistem sedang dalam masa transisi/izin (Grace Period)
  const isSecurityGracePeriod = () => {
    const now = Date.now()
    return (
      now < unblockGraceUntilRef.current ||
      now < cameraGraceUntilRef.current ||
      now < initialGraceUntilRef.current ||
      isRequestingCameraRef.current
    )
  }

  // Fungsi Inisialisasi Kamera Selfie Siswa
  const initCamera = async () => {
    isRequestingCameraRef.current = true
    // Beri grace period 15 detik selama dialog izin kamera native/browser aktif
    cameraGraceUntilRef.current = Date.now() + 15000
    setCameraLoading(true)
    setCameraError(null)

    // Bersihkan track lama sebelum mengambil track baru
    if (cameraStreamRef.current) {
      try {
        cameraStreamRef.current.getTracks().forEach(t => t.stop())
      } catch {}
      cameraStreamRef.current = null
    }

    try {
      const stream = await getCameraStream('user')
      setCameraStream(stream)
      cameraStreamRef.current = stream
      setCameraActive(true)

      // Watchdog jika kamera terputus secara fisik atau ter-mute oleh background OS
      const track = stream.getVideoTracks()[0]
      if (track) {
        track.onended = () => {
          console.warn('[CBT Camera] Track kamera terputus (ended)!')
          setCameraActive(false)
          setCameraStream(null)
          cameraStreamRef.current = null
        }
        track.onmute = () => {
          console.warn('[CBT Camera] Track kamera ter-mute oleh sistem operasi!')
          setCameraActive(false)
        }
        track.onunmute = () => {
          console.log('[CBT Camera] Track kamera unmuted kembali.')
          setCameraActive(true)
        }
      }

      // Beri grace period tambahan 5 detik setelah kamera siap agar fokus layar stabil
      cameraGraceUntilRef.current = Date.now() + 5000
      return stream
    } catch (err) {
      console.warn('[CBT Camera] Akses kamera gagal/ditolak:', err)
      const msg = err.userMessage || 'Izin kamera ditolak. Kamera selfie depan wajib aktif untuk pengawasan ujian.'
      setCameraError(msg)
      setCameraActive(false)
      cameraGraceUntilRef.current = Date.now() + 4000
      return null
    } finally {
      setCameraLoading(false)
      setTimeout(() => {
        isRequestingCameraRef.current = false
      }, 4000)
    }
  }

  // Fungsi Pengecekan & Pemulihan Otomatis Kamera Selfie jika Muted/Dead setelah dari Background
  const checkAndRestoreCamera = useCallback(async () => {
    if (!hasReadInstructionRef.current || submitResult) return

    const currentStream = cameraStreamRef.current
    const track = currentStream?.getVideoTracks()?.[0]
    const isDead = !track || track.readyState === 'ended' || track.muted

    if (isDead) {
      console.log('[CBT Camera] Track kamera tidak aktif / ter-mute. Menginisialisasi ulang...')
      if (currentStream) {
        try {
          currentStream.getTracks().forEach(t => t.stop())
        } catch {}
      }
      setCameraStream(null)
      cameraStreamRef.current = null
      setCameraActive(false)
      await initCamera()
    }
  }, [submitResult])

  // Cleanup kamera saat keluar halaman ujian
  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (liveFrameTimerRef.current) {
        clearInterval(liveFrameTimerRef.current)
      }
    }
  }, [])

  const handleSecretTrigger = useCallback(() => {
    const now = Date.now()
    const recentTaps = [...tapHistoryRef.current.filter(t => now - t < 2500), now]
    tapHistoryRef.current = recentTaps
    if (recentTaps.length >= 5) {
      tapHistoryRef.current = []
      setShowAdminUnlockModal(true)
      setAdminCodeInput('')
      setAdminCodeError('')
      setIsAdminUnlocked(false)
    }
  }, [])

  const handleVerifyAdminCode = (e) => {
    e?.preventDefault()
    const cleanInput = adminCodeInput.trim().toUpperCase()
    const cleanToken = (sesi?.token_ujian || '').trim().toUpperCase()
    const masterPin = '8888'
    const masterPass = 'EBUDIMULIA'

    if (!cleanInput) {
      setAdminCodeError('Silakan masukkan PIN atau Kode Pengawas.')
      return
    }

    if (cleanInput === masterPin || cleanInput === masterPass || (cleanToken && cleanInput === cleanToken)) {
      setIsAdminUnlocked(true)
      setAdminCodeError('')
    } else {
      setAdminCodeError('Kode Keamanan Pengawas tidak sesuai! Silakan hubungi Pengawas Ruang.')
    }
  }

  const handleAdminUnlockScreenOnly = async () => {
    adminUnlockedRef.current = true
    hasLockedTaskRef.current = false
    if (Capacitor.isNativePlatform()) {
      try {
        await CbtLockTask.stopLock()
      } catch (e) {
        console.warn('stopLock error:', e)
      }
    }
    setShowAdminUnlockModal(false)
    alert('Kuncian layar (Kiosk Mode / AAC iOS) berhasil dinonaktifkan oleh Pengawas.')
  }

  const handleAdminUnlockAndExit = async () => {
    adminUnlockedRef.current = true
    hasLockedTaskRef.current = false
    if (Capacitor.isNativePlatform()) {
      try {
        await CbtLockTask.stopLock()
        await CapApp.exitApp()
      } catch (e) {
        console.warn('exitApp error:', e)
        navigate('/dashboard?menu=CBT')
      }
    } else {
      navigate('/dashboard?menu=CBT')
    }
    setShowAdminUnlockModal(false)
  }

  const handleAdminResetStrikes = async () => {
    try {
      unblockGraceUntilRef.current = Date.now() + 15000
      lastStrikeTimeRef.current = Date.now() + 15000
      if (pesertaId) {
        const { error: rpcErr } = await supabase.rpc('fn_cbt_proctor_unlock_peserta', {
          p_peserta_id: pesertaId,
          p_pin: adminCodeInput.trim() || '8888'
        })
        if (rpcErr) {
          await supabase
            .from('cbt_peserta_ujian')
            .update({
              status: 'sedang_mengerjakan',
              strike_count: 0,
              is_blocked: false,
              block_reason: null
            })
            .eq('id', pesertaId)
        }
      }
      setShowAdminUnlockModal(false)
      setStrikeCount(0)
      setIsBlocked(false)
      setIsLocked(false)
      setShowStrikeWarning(false)
      setBlockReason('')
      if (Capacitor.isNativePlatform()) {
        try {
          await CbtLockTask.startLock()
          setIsDeviceLocked(true)
          hasLockedTaskRef.current = true
        } catch (e) {
          console.warn('startLock error on reset strikes:', e)
          setIsDeviceLocked(false)
          hasLockedTaskRef.current = false
        }
      }
      // Pulihkan kamera selfie
      checkAndRestoreCamera()
    } catch (e) {
      alert('Gagal mereset status peserta: ' + e.message)
    }
  }

  // Deterministic Seeded PRNG (Mulberry32)
  const createSeededRandom = (seedStr) => {
    let h = 1779033703 ^ (seedStr?.length || 0)
    const str = String(seedStr || 'ebudimulia_cbt_seed')
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
      h = (h << 13) | (h >>> 19)
    }
    return function() {
      h = Math.imul(h ^ (h >>> 16), 2246822507)
      h = Math.imul(h ^ (h >>> 13), 3266489909)
      return ((h ^= h >>> 16) >>> 0) / 4294967296
    }
  }

  const shuffleArrayWithSeed = (array, rng) => {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  // Perhitungan Status Kelengkapan Soal (Terjawab, Ragu, Belum)
  const { answeredList, unansweredList, raguList } = useMemo(() => {
    const answered = []
    const unanswered = []
    const ragu = []

    questions.forEach((q, idx) => {
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

      if (isRagu) {
        ragu.push({ q, idx, nomor: idx + 1, hasAns })
      }

      if (hasAns) {
        answered.push({ q, idx, nomor: idx + 1, isRagu })
      } else {
        unanswered.push({ q, idx, nomor: idx + 1, isRagu })
      }
    })

    return { answeredList: answered, unansweredList: unanswered, raguList: ragu }
  }, [questions, answers])


  const activeNisn = student?.nisn || peserta?.siswa_nisn

  const proctorCanvasRef = useRef(null)
  const isSendingFrameRef = useRef(false)

  // Live Feed Broadcast Handler (Pengawas Memantau Kamera On-Demand)
  const sendProctorFrame = useCallback((channel) => {
    if (isSendingFrameRef.current) return
    try {
      if (!cameraStreamRef.current) return
      const videoEl = document.getElementById('cbt-student-selfie-video') || document.querySelector('video')
      if (!videoEl || !videoEl.videoWidth || videoEl.readyState < 2) return

      if (!proctorCanvasRef.current) {
        const c = document.createElement('canvas')
        c.width = 300
        c.height = 225
        proctorCanvasRef.current = c
      }

      const canvas = proctorCanvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/webp', 0.42)
      isSendingFrameRef.current = true
      channel.send({
        type: 'broadcast',
        event: 'student_camera_frame',
        payload: {
          nisn: activeNisn,
          image: dataUrl,
          timestamp: Date.now()
        }
      }).finally(() => {
        isSendingFrameRef.current = false
      })
    } catch (err) {
      isSendingFrameRef.current = false
      console.warn('[Live Proctor] Gagal kirim frame:', err)
    }
  }, [activeNisn])

  useEffect(() => {
    if (!sesiId || !activeNisn) return

    const feedChannel = supabase.channel(`cbt_live_feed_${sesiId}`)

    feedChannel
      .on('broadcast', { event: 'proctor_request_feed' }, (payload) => {
        if (payload?.payload?.nisn === activeNisn) {
          console.log('[Live Proctor] Pengawas mengaktifkan live preview untuk siswa:', activeNisn)
          setIsLiveWatched(true)
          isLiveWatchedRef.current = true

          sendProctorFrame(feedChannel)
          if (liveFrameTimerRef.current) clearInterval(liveFrameTimerRef.current)
          liveFrameTimerRef.current = setInterval(() => {
            if (isLiveWatchedRef.current) {
              sendProctorFrame(feedChannel)
            }
          }, 250) // 250ms = 4 FPS (mulus & responsif, hanya ~20 KB/detik saat dipantau)
        }
      })
      .on('broadcast', { event: 'proctor_stop_feed' }, (payload) => {
        if (payload?.payload?.nisn === activeNisn) {
          console.log('[Live Proctor] Pengawas menutup live preview.')
          setIsLiveWatched(false)
          isLiveWatchedRef.current = false
          if (liveFrameTimerRef.current) {
            clearInterval(liveFrameTimerRef.current)
            liveFrameTimerRef.current = null
          }
        }
      })
      .subscribe()

    return () => {
      if (liveFrameTimerRef.current) {
        clearInterval(liveFrameTimerRef.current)
        liveFrameTimerRef.current = null
      }
      supabase.removeChannel(feedChannel)
    }
  }, [sesiId, activeNisn, sendProctorFrame])

  // Auto-init camera jika ujian sedang berlangsung tetapi kamera belum aktif
  useEffect(() => {
    if (hasReadInstruction && !cameraStream && !loading && !isBlocked && !isLocked && !submitResult) {
      initCamera()
    }
  }, [hasReadInstruction, cameraStream, loading, isBlocked, isLocked, submitResult])

  // =========================================================================
  // HANDLER PUSAT UPDATE STATUS PESERTA (REALTIME BROADCAST + DB CHANGES + POLLING)
  // =========================================================================
  // HANDLER PUSAT UPDATE STATUS PESERTA (REALTIME BROADCAST + DB CHANGES + POLLING)
  // Menjamin responsivitas sub-detik (<50ms via WebSocket, <2.5s via Polling failover)
  // =========================================================================
  const applyPesertaStatusUpdate = useCallback((latestData) => {
    if (!latestData) return

    const cur = pesertaRef.current || {}

    // 1. Cek apakah ada perubahan nyata (deep check field utama) agar tidak memicu loop re-render
    const statusChanged = latestData.status !== undefined && latestData.status !== cur.status
    const blockedChanged = latestData.is_blocked !== undefined && Boolean(latestData.is_blocked) !== Boolean(cur.is_blocked)
    const blockReasonChanged = latestData.block_reason !== undefined && latestData.block_reason !== cur.block_reason
    const extraTimeChanged = latestData.extra_waktu_menit !== undefined && Number(latestData.extra_waktu_menit || 0) !== Number(cur.extra_waktu_menit || 0)
    const scoreChanged = latestData.nilai_akhir !== undefined && latestData.nilai_akhir !== cur.nilai_akhir
    const nilaiSharedChanged = latestData.is_nilai_shared !== undefined && Boolean(latestData.is_nilai_shared) !== Boolean(cur.is_nilai_shared)
    const deviceChanged = latestData.device_id !== undefined && latestData.device_id !== cur.device_id

    const hasRealChange = statusChanged || blockedChanged || blockReasonChanged || extraTimeChanged || scoreChanged || nilaiSharedChanged || deviceChanged

    if (!hasRealChange) {
      return
    }

    console.log('[CBT Sync] Menerapkan status peserta:', latestData)

    const merged = { ...cur, ...latestData }
    pesertaRef.current = merged
    setPeserta(prev => ({ ...(prev || {}), ...latestData }))

    // 2. KASUS UJIAN SELESAI / PAKSA KUMPULKAN
    if (latestData.status === 'selesai') {
      if (submitResult) return
      console.log('[CBT Sync] Status selesai terdeteksi! Mengalihkan ke lembar hasil...')
      if (Capacitor.isNativePlatform()) {
        try { CbtLockTask.stopLock().catch(() => {}) } catch {}
      }
      setIsBlocked(false)
      setIsLocked(false)
      setBlockReason('')
      setShowSubmitModal(false)

      let score = latestData.nilai_akhir ?? null
      const targetId = latestData.id || pesertaId
      if (score === null && targetId) {
        supabase.rpc('cbt_internal_score_submission', { p_peserta_id: targetId })
          .then(({ data: calcScore }) => {
            if (calcScore !== null && calcScore !== undefined) {
              setSubmitResult(prev => prev ? { ...prev, total_skor_sementara: calcScore } : prev)
              setPeserta(prev => ({ ...prev, nilai_akhir: calcScore }))
            }
          })
          .catch(() => {})
      }

      setSubmitResult({
        total_skor_sementara: score,
        is_nilai_shared: !!latestData.is_nilai_shared
      })
      return
    }

    // 3. KASUS IZINKAN UJIAN ULANG (RESET KE BELUM MULAI)
    // HANYA dijalankan jika siswa sebelumnya sedang dalam ujian aktif atau status sebelumnya bukan 'belum_mulai'
    if (latestData.status === 'belum_mulai') {
      const wasInExam = hasReadInstructionRef.current || Boolean(cur.status && cur.status !== 'belum_mulai') || isBlocked || isLocked

      if (wasInExam) {
        console.log('[CBT Sync] Status belum_mulai terdeteksi dari ujian aktif! Mengalihkan ke petunjuk awal...')
        hasReadInstructionRef.current = false
        if (Capacitor.isNativePlatform()) {
          try { CbtLockTask.stopLock().catch(() => {}) } catch {}
        }
        setIsBlocked(false)
        setIsLocked(false)
        setBlockReason('')
        setStrikeCount(0)
        setSubmitResult(null)
        setShowSubmitModal(false)
        setHasReadInstruction(false)
        setRemainingSeconds(null)
        if (timerRef.current) clearInterval(timerRef.current)
        setRetakeNotice('Ujian Anda telah diizinkan untuk diulang oleh pengawas. Silakan baca petunjuk kembali dan klik tombol "Mulai Kerjakan Ujian" di bawah.')
        initExam()
      }
      return
    }

    // 4. KASUS BLOKIR / BUKA BLOKIR
    const wasBlockedOrLocked = Boolean(cur.is_blocked || cur.status === 'terkunci' || isBlocked || isLocked)
    if (latestData.is_blocked !== undefined) {
      setIsBlocked(!!latestData.is_blocked)
      if (latestData.is_blocked) {
        setBlockReason(latestData.block_reason || 'Akses ujian dinonaktifkan sementara oleh pengawas.')
      } else {
        setBlockReason('')
      }
    }

    // 5. KASUS STATUS TERKUNCI / SEDANG MENGERJAKAN
    if (latestData.status === 'terkunci') {
      setIsLocked(true)
    } else if (latestData.status === 'sedang_mengerjakan' && !latestData.is_blocked) {
      setIsLocked(false)
      setIsBlocked(false)
      setBlockReason('')
      if (wasBlockedOrLocked) {
        setStrikeCount(0)
      }
    }

    // 6. KASUS BUKA KUNCI (TRANSISI DARI BLOCKED/TERKUNCI -> AKTIF): AKTIFKAN GRACE PERIOD & PULIHKAN PENGUNCIAN
    const isNowUnblocked = !latestData.is_blocked && latestData.status !== 'terkunci'
    if (wasBlockedOrLocked && isNowUnblocked && latestData.status === 'sedang_mengerjakan') {
      unblockGraceUntilRef.current = Date.now() + 10000
      lastStrikeTimeRef.current = Date.now() + 10000
      setIsBlocked(false)
      setIsLocked(false)
      setBlockReason('')
      if (Capacitor.isNativePlatform()) {
        CbtLockTask.isLocked()
          .then(res => {
            const locked = Boolean(res?.locked)
            setIsDeviceLocked(locked)
            if (!locked) {
              CbtLockTask.startLock()
                .then(() => setIsDeviceLocked(true))
                .catch(() => setIsDeviceLocked(false))
            }
          })
          .catch(() => {})
      }
      checkAndRestoreCamera()
    }

    // 7. KASUS SINGLE DEVICE LOCK
    const currentDevId = getOrCreateDeviceId()
    if (latestData.device_id && latestData.device_id !== currentDevId && latestData.status !== 'selesai') {
      setIsDeviceConflict(true)
      setConflictDeviceInfo(latestData.device_info || 'Perangkat Lain')
    } else if (latestData.device_id === null && isDeviceConflict) {
      setIsDeviceConflict(false)
      initExam()
    }

    // 8. KASUS TAMBAHAN WAKTU
    const oldExtra = cur.extra_waktu_menit || 0
    const newExtra = latestData.extra_waktu_menit || 0
    if (newExtra > oldExtra) {
      const diffMin = newExtra - oldExtra
      console.log(`[CBT Sync] Tambahan waktu terdeteksi: +${diffMin} menit (Total: ${newExtra} menit)`)
      setExtraTimeAlert({
        minutes: diffMin,
        totalExtra: newExtra,
        timestamp: Date.now()
      })
      if (sesiRef.current) {
        calculateRemainingTime(merged, sesiRef.current)
      }
    }
  }, [pesertaId, isDeviceConflict, submitResult, isBlocked, isLocked, calculateRemainingTime])

  // Inisialisasi Data Ujian
  useEffect(() => {
    if (!sesiId || !pesertaId) {
      alert('Sesi ujian tidak valid.')
      navigate('/dashboard')
      return
    }

    initExam()
  }, [sesiId, pesertaId])

  // Online/Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setSyncStatus('saved')
      const activeNisn = student?.nisn || pesertaRef.current?.siswa_nisn || peserta?.siswa_nisn
      if (activeNisn && pesertaId) {
        syncUnsyncedAnswers(pesertaId, sesiId, activeNisn).catch(() => {})
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Auto-Retry Queue setiap 8 detik: memastikan jawaban yang tertunda saat sinyal putus-nyambung otomatis terkirim ke server
    const retryTimer = setInterval(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      const curNisn = student?.nisn || pesertaRef.current?.siswa_nisn || peserta?.siswa_nisn
      const curPesertaId = pesertaId || pesertaRef.current?.id
      if (!curNisn || !curPesertaId || !sesiId) return
      try {
        await syncUnsyncedAnswers(curPesertaId, sesiId, curNisn)
        setSyncStatus('saved')
      } catch {}
    }, 8000)

    return () => {
      clearInterval(retryTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [pesertaId, sesiId, student?.nisn])

  const applyPesertaStatusUpdateRef = useRef(applyPesertaStatusUpdate)
  useEffect(() => {
    applyPesertaStatusUpdateRef.current = applyPesertaStatusUpdate
  })

  // 1. SUPABASE REALTIME SUBSCRIPTION (BROADCAST INSTAN + POSTGRES CHANGES)
  useEffect(() => {
    if (!sesiId || !pesertaId) return

    // A. Channel Personal Peserta
    const personalChannel = supabase
      .channel(`peserta_sync_${pesertaId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cbt_peserta_ujian',
          filter: `id=eq.${pesertaId}`
        },
        (payload) => {
          if (payload.new) applyPesertaStatusUpdateRef.current?.(payload.new)
        }
      )
      .on('broadcast', { event: 'force_submit_student' }, (payload) => {
        console.log('[CBT Realtime Broadcast] Force submit sinyal diterima:', payload)
        applyPesertaStatusUpdateRef.current?.({
          status: 'selesai',
          nilai_akhir: payload.payload?.nilai_akhir ?? null,
          is_nilai_shared: !!payload.payload?.is_nilai_shared
        })
      })
      .on('broadcast', { event: 'retake_student' }, () => {
        console.log('[CBT Realtime Broadcast] Retake sinyal diterima')
        applyPesertaStatusUpdateRef.current?.({ status: 'belum_mulai' })
      })
      .on('broadcast', { event: 'unblock_student' }, () => {
        applyPesertaStatusUpdateRef.current?.({ is_blocked: false, status: 'sedang_mengerjakan' })
      })
      .on('broadcast', { event: 'block_student' }, (payload) => {
        applyPesertaStatusUpdateRef.current?.({ is_blocked: true, block_reason: payload.payload?.reason })
      })
      .on('broadcast', { event: 'extra_time_student' }, (payload) => {
        if (payload.payload?.minutes) {
          const cur = pesertaRef.current?.extra_waktu_menit || 0
          applyPesertaStatusUpdateRef.current?.({ extra_waktu_menit: cur + payload.payload.minutes })
        }
      })
      .on('broadcast', { event: 'device_reset_student' }, () => {
        applyPesertaStatusUpdateRef.current?.({ device_id: null })
      })
      .subscribe()

    const isTargetPeserta = (payload) => {
      if (!payload?.payload) return false
      const targetPId = payload.payload.peserta_id
      const targetNisn = payload.payload.siswa_nisn
      if (targetPId && String(targetPId) === String(pesertaId)) return true
      const myNisn = student?.nisn || pesertaRef.current?.siswa_nisn || peserta?.siswa_nisn
      if (targetNisn && myNisn && String(targetNisn) === String(myNisn)) return true
      return false
    }

    // B. Channel Room Sesi Ujian (Broadcast Komando Massal & Cadangan)
    const roomChannel = supabase
      .channel(`cbt_exam_room_${sesiId}`)
      .on('broadcast', { event: 'force_submit_student' }, (payload) => {
        if (isTargetPeserta(payload)) {
          applyPesertaStatusUpdateRef.current?.({
            status: 'selesai',
            nilai_akhir: payload.payload?.nilai_akhir ?? null,
            is_nilai_shared: !!payload.payload?.is_nilai_shared
          })
        }
      })
      .on('broadcast', { event: 'retake_student' }, (payload) => {
        if (isTargetPeserta(payload)) {
          applyPesertaStatusUpdateRef.current?.({ status: 'belum_mulai' })
        }
      })
      .on('broadcast', { event: 'unblock_student' }, (payload) => {
        if (isTargetPeserta(payload)) {
          applyPesertaStatusUpdateRef.current?.({ is_blocked: false, status: 'sedang_mengerjakan' })
        }
      })
      .on('broadcast', { event: 'block_student' }, (payload) => {
        if (isTargetPeserta(payload)) {
          applyPesertaStatusUpdateRef.current?.({ is_blocked: true, block_reason: payload.payload?.reason })
        }
      })
      .on('broadcast', { event: 'extra_time_student' }, (payload) => {
        if (isTargetPeserta(payload) && payload.payload?.minutes) {
          const cur = pesertaRef.current?.extra_waktu_menit || 0
          applyPesertaStatusUpdateRef.current?.({ extra_waktu_menit: cur + payload.payload.minutes })
        }
      })
      .on('broadcast', { event: 'device_reset_student' }, (payload) => {
        if (isTargetPeserta(payload)) {
          applyPesertaStatusUpdateRef.current?.({ device_id: null })
        }
      })
      .on('broadcast', { event: 'bulk_extra_time' }, (payload) => {
        if (payload?.payload?.minutes) {
          const cur = pesertaRef.current?.extra_waktu_menit || 0
          applyPesertaStatusUpdateRef.current?.({ extra_waktu_menit: cur + payload.payload.minutes })
        }
      })
      .subscribe()

    roomChannelRef.current = roomChannel

    return () => {
      roomChannelRef.current = null
      supabase.removeChannel(personalChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [sesiId, pesertaId, student?.nisn])

  // 2. POLLING STATUS RESILIEN SETIAP 2.5 DETIK (FAILOVER TANPA HENTI)
  // Menjamin jika WebSocket terputus / di-sleep Android, perubahan dari admin
  // terdeteksi dalam waktu maksimal 2.5 detik tanpa ada peluang macet.
  useEffect(() => {
    if (!sesiId || !pesertaId) return
    if (submitResult || peserta?.status === 'selesai') return

    let isPolling = false
    const checkPesertaStatus = async () => {
      if (isPolling || !navigator.onLine) return
      if (submitResult || pesertaRef.current?.status === 'selesai') return

      isPolling = true
      try {
        const { data: pLatest, error } = await supabase
          .from('cbt_peserta_ujian')
          .select('id, status, is_blocked, block_reason, extra_waktu_menit, nilai_akhir, is_nilai_shared, device_id')
          .eq('id', pesertaId)
          .maybeSingle()

        if (!error && pLatest) {
          applyPesertaStatusUpdate(pLatest)
        }
      } catch (err) {
        // Silent catch agar polling tidak pernah crash
      } finally {
        isPolling = false
      }
    }

    const pollIntervalId = setInterval(checkPesertaStatus, 12000)

    // Deteksi cepat saat tab / HP kembali aktif
    const handleFocus = () => checkPesertaStatus()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkPesertaStatus()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(pollIntervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [sesiId, pesertaId, submitResult, peserta?.status, applyPesertaStatusUpdate])

  // 3. BACKGROUND SYNC JAWABAN LOCAL-FIRST (SETIAP 10 DETIK)
  useEffect(() => {
    if (!sesiId || !pesertaId) return
    if (submitResult || peserta?.status === 'selesai') return

    const syncIntervalId = setInterval(async () => {
      if (navigator.onLine && !submitResult && pesertaRef.current?.status !== 'selesai') {
        const activeNisn = student?.nisn || pesertaRef.current?.siswa_nisn || peserta?.siswa_nisn
        if (activeNisn) {
          try {
            await syncUnsyncedAnswers(pesertaId, sesiId, activeNisn)
          } catch {}
        }
      }
    }, 10000)

    return () => clearInterval(syncIntervalId)
  }, [sesiId, pesertaId, submitResult, peserta?.status, student?.nisn])

  // Helper Deteksi Perangkat Siswa (Aplikasi iOS / Android / Samsung Tab / Web)
  const detectDeviceInfo = () => {
    const ua = navigator.userAgent || ''
    const isNative = Capacitor.isNativePlatform()
    let platform = ''
    try {
      platform = Capacitor.getPlatform()
    } catch {
      platform = 'web'
    }

    const isIos = platform === 'ios' || /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isAndroid = platform === 'android' || /Android/i.test(ua)
    
    // Deteksi model tablet/perangkat
    let model = ''
    if (/iPad/i.test(ua) || (isIos && navigator.maxTouchPoints > 1 && !/iPhone/i.test(ua))) {
      model = 'iPad'
    } else if (/iPhone/i.test(ua) || isIos) {
      model = 'iPhone'
    } else if (/SM-[A-Z0-9]+/i.test(ua)) {
      model = ua.match(/SM-[A-Z0-9]+/i)[0] // Samsung Galaxy Tab / Phone model
    } else if (/Samsung/i.test(ua)) {
      model = 'Samsung Tab'
    } else if (/Redmi|Xiaomi|POCO/i.test(ua)) {
      const m = ua.match(/(Redmi[^\s;]+|POCO[^\s;]+|Xiaomi[^\s;]+)/i)
      model = m ? m[0] : 'Xiaomi'
    } else if (/OPPO|CPH[0-9]+/i.test(ua)) {
      model = 'OPPO'
    } else if (/vivo/i.test(ua)) {
      model = 'Vivo'
    }

    const isTablet = /Tablet|iPad/i.test(ua) || (isIos && model === 'iPad') || (isAndroid && !/Mobile/i.test(ua))

    // JIKA NATIVE APP (CAPACITOR)
    if (isNative) {
      if (isIos) {
        return `Aplikasi iOS (${model || 'iPhone'})`
      }
      if (isTablet || /SM-X|SM-T/i.test(ua) || /Samsung/i.test(ua)) {
        return `Aplikasi Android ${model ? `(${model})` : '(Samsung Tab)'}`.trim()
      }
      return `Aplikasi Android ${model ? `(${model})` : ''}`.trim()
    }

    // JIKA BROWSER SAFARI / CHROME
    if (isIos) {
      return `Apple ${model || 'iPhone'} (Browser)`
    }

    if (isTablet || /SM-X|SM-T/i.test(ua)) {
      return `Samsung Tab / Tablet ${model ? `(${model})` : ''}`.trim()
    }

    if (isAndroid) {
      return `Android ${model ? `(${model})` : 'Device'} (Browser)`
    }

    if (/Windows/i.test(ua)) return 'Laptop / PC Windows'
    if (/Macintosh|Mac OS/i.test(ua)) return 'MacBook / Mac OS'
    if (/Linux/i.test(ua)) return 'PC Linux'

    return 'Web Browser'
  }

  async function initExam() {
    setLoading(true)
    try {
      // Ambil detail sesi
      const { data: sesiData, error: errSesi } = await supabase
        .from('cbt_sesi_ujian')
        .select('*')
        .eq('id', sesiId)
        .single()

      if (errSesi) throw errSesi
      sesiRef.current = sesiData
      setSesi(sesiData)

      // Ambil detail peserta
      const { data: pData, error: errPeserta } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('id', pesertaId)
        .single()

      if (errPeserta) throw errPeserta
      pesertaRef.current = pData
      setPeserta(pData)
      setStrikeCount(pData.strike_count || 0)

      // Deteksi device_info untuk state lokal (Aplikasi Android / Samsung Tab, dsb.)
      const detectedDev = detectDeviceInfo()
      const currentDeviceId = getOrCreateDeviceId()
      setPeserta(prev => ({ ...prev, device_info: pData.device_info || detectedDev }))

      // ─── VALIDASI SINGLE DEVICE LOCK ─────────────────────────────
      // Jika ujian sudah terikat ke device_id lain, blokir akses pengerjaan dari perangkat ini sampai di-reset oleh pengawas.
      if (pData.device_id && pData.device_id !== currentDeviceId && pData.status !== 'selesai') {
        setIsDeviceConflict(true)
        setConflictDeviceInfo(pData.device_info || 'Perangkat Lain')
        setLoading(false)
        return
      } else {
        setIsDeviceConflict(false)
      }

      // Jika ujian belum terikat device_id (misal baru mulai atau baru di-reset pengawas),
      // langsung ikat ke perangkat fisik ini sejak lembar ujian pertama kali dibuka.
      if (!pData.device_id && pData.status !== 'selesai') {
        const updatePayload = {
          device_id: currentDeviceId,
          device_info: detectedDev
        }
        if (pData.waktu_mulai && pData.status !== 'belum_mulai') {
          updatePayload.status = 'sedang_mengerjakan'
        }
        supabase
          .from('cbt_peserta_ujian')
          .update(updatePayload)
          .eq('id', pesertaId)
          .then(({ error: devErr }) => {
            if (devErr && devErr.code !== '42703') {
              console.warn('[CBT Device Lock] Note binding device on init:', devErr.message)
            }
          })
      }

      // Pastikan nama siswa terisi di state lokal jika belum ada
      if (student?.nama_lengkap) {
        setPeserta(prev => ({ ...prev, siswa_nama: student.nama_lengkap }))
      } else if (pData.siswa_nisn) {
        supabase
          .from('siswa_lengkap')
          .select('nama_lengkap, kelas')
          .eq('nisn', pData.siswa_nisn)
          .eq('is_aktif', true)
          .maybeSingle()
          .then(({ data: sRow }) => {
            if (sRow?.nama_lengkap) {
              setPeserta(prev => ({ ...prev, siswa_nama: sRow.nama_lengkap, kelas: sRow.kelas || prev.kelas }))
            }
          })
      }

      if (pData.is_blocked) {
        setIsBlocked(true)
        setBlockReason(pData.block_reason || 'Akses ujian ditangguhkan oleh pengawas.')
      }

      if (pData.status === 'terkunci') {
        setIsLocked(true)
      } else if (pData.status === 'selesai') {
        if (Capacitor.isNativePlatform()) {
          CbtLockTask.stopLock().catch(() => {})
        }
        setIsBlocked(false)
        setIsLocked(false)
        setSubmitResult({
          total_skor_sementara: pData.nilai_akhir ?? null,
          is_nilai_shared: !!pData.is_nilai_shared
        })
        setLoading(false)
        return
      }

      // Periksa apakah sesi sudah selesai atau melewati batas waktu tutup (menggunakan waktu server getServerNow)
      const waktuTutup = sesiData.waktu_tutup ? new Date(sesiData.waktu_tutup) : (sesiData.waktu_selesai ? new Date(sesiData.waktu_selesai) : null)
      const extraMs = (pData.extra_waktu_menit || 0) * 60 * 1000
      const effectiveWaktuTutup = waktuTutup ? new Date(waktuTutup.getTime() + extraMs) : null
      if ((sesiData.status === 'selesai' || (effectiveWaktuTutup && getServerNow() > effectiveWaktuTutup)) && pData.status !== 'selesai') {
        alert('Batas waktu pengerjaan untuk penilaian ini telah berakhir.')
        navigate('/dashboard')
        return
      }

      // Jika siswa sudah pernah mulai mengerjakan sebelumnya, atau statusnya sedang terkunci/diblokir
      if ((pData.waktu_mulai && pData.status !== 'belum_mulai') || pData.is_blocked || pData.status === 'terkunci') {
        initialGraceUntilRef.current = Date.now() + 5000
        if (pData.waktu_mulai && pData.status !== 'belum_mulai') {
          setHasReadInstruction(true)
          hasReadInstructionRef.current = true
          calculateRemainingTime(pData, sesiData)
        }
        if (Capacitor.isNativePlatform() && pData.status !== 'selesai') {
          CbtLockTask.isLocked()
            .then(res => {
              const locked = Boolean(res?.locked)
              setIsDeviceLocked(locked)
              hasLockedTaskRef.current = locked
              if (!locked && !adminUnlockedRef.current) {
                CbtLockTask.startLock()
                  .then(() => {
                    setIsDeviceLocked(true)
                    hasLockedTaskRef.current = true
                  })
                  .catch(() => {
                    setIsDeviceLocked(false)
                    hasLockedTaskRef.current = false
                  })
              }
            })
            .catch(() => {
              setIsDeviceLocked(false)
              hasLockedTaskRef.current = false
            })
        } else {
          setIsDeviceLocked(true)
        }
      } else {
        // Belum mulai, wajib baca instruksi (Fase 6)
        setHasReadInstruction(false)
        hasReadInstructionRef.current = false
        if (Capacitor.isNativePlatform()) {
          setIsDeviceLocked(false)
        }
      }

      // Helper sanitasi untuk memastikan tidak ada atribut is_kunci / kunci_jawaban di objek soal sisi siswa
      const sanitizeQuestionsForStudent = (rawList) => {
        if (!Array.isArray(rawList)) return []
        return rawList.map(q => {
          if (!q) return q
          const { cbt_soal_kunci, kunci_jawaban, pembahasan, ...cleanQ } = q
          if (!cleanQ.opsi) return cleanQ
          let parsedOpsi = cleanQ.opsi
          if (typeof parsedOpsi === 'string') {
            try { parsedOpsi = JSON.parse(parsedOpsi) } catch { return cleanQ }
          }
          if (!Array.isArray(parsedOpsi)) return cleanQ
          const cleanOpsi = parsedOpsi.map((opt, idx) => {
            if (typeof opt === 'object' && opt !== null) {
              const { is_kunci, is_correct, kunci, ...rest } = opt
              return {
                ...rest,
                key: opt.key || opt.label || String.fromCharCode(65 + idx),
                text: opt.text !== undefined ? opt.text : (opt.teks !== undefined ? opt.teks : (opt.content || ''))
              }
            }
            return opt
          })
          return { ...cleanQ, opsi: cleanOpsi }
        })
      }

      // Ambil Soal: Utamakan RPC aman fn_cbt_get_exam_questions atau fetch tabel cbt_soal, fallback ke Cache Lokal jika offline
      let qList = []
      try {
        let fetchedQ = null
        let errQ = null
        const { data: rpcQ, error: rpcErr } = await supabase.rpc('fn_cbt_get_exam_questions', {
          p_sesi_id: sesiId,
          p_peserta_id: pesertaId
        })
        if (!rpcErr && Array.isArray(rpcQ) && rpcQ.length > 0) {
          fetchedQ = rpcQ
        } else {
          const resQ = await supabase
            .from('cbt_soal')
            .select('id, nomor_urut, tipe_soal, pertanyaan, opsi, bobot')
            .eq('bank_soal_id', sesiData.bank_soal_id)
            .order('nomor_urut', { ascending: true })
          fetchedQ = resQ.data
          errQ = resQ.error
        }

        if (errQ) throw errQ
        if (fetchedQ && fetchedQ.length > 0) {
          qList = sanitizeQuestionsForStudent(fetchedQ)
          await cacheQuestionsLocally(sesiId, qList)
        } else {
          qList = sanitizeQuestionsForStudent((await getCachedQuestions(sesiId)) || [])
        }
      } catch (errQ) {
        console.warn('[CBT] Gagal memuat soal dari server, mencoba dari cache lokal:', errQ)
        qList = sanitizeQuestionsForStudent((await getCachedQuestions(sesiId)) || [])
        if (qList.length === 0) {
          throw errQ
        }
      }

      // Terapkan Pengacakan Soal (Berdasarkan Opsi Guru & Seed Peserta)
      let finalQuestions = [...qList]
      if (sesiData.acak_soal) {
        const rngSoal = createSeededRandom(`${pesertaId || pData?.id || 'peserta'}_soal_order`)
        finalQuestions = shuffleArrayWithSeed(finalQuestions, rngSoal)
      }

      // Terapkan Pengacakan Opsi Pilihan Ganda (Berdasarkan Opsi Guru & Seed Peserta)
      if (sesiData.acak_opsi) {
        finalQuestions = finalQuestions.map(q => {
          if (!q.opsi || !['pg', 'pg_kompleks'].includes(q.tipe_soal)) return q
          let parsedOpsi = q.opsi
          if (typeof parsedOpsi === 'string') {
            try { parsedOpsi = JSON.parse(parsedOpsi) } catch { return q }
          }
          if (!Array.isArray(parsedOpsi) || parsedOpsi.length <= 1) return q

          // Pastikan setiap opsi mempertahankan original key
          const formattedOpsi = parsedOpsi.map((opt, idx) => {
            if (typeof opt === 'string') {
              return { key: String.fromCharCode(65 + idx), text: opt }
            }
            if (typeof opt === 'object' && opt !== null) {
              return {
                ...opt,
                key: opt.key || opt.label || String.fromCharCode(65 + idx)
              }
            }
            return opt
          })

          const rngOpsi = createSeededRandom(`${pesertaId || pData?.id || 'peserta'}_${q.id}_opsi_order`)
          const shuffledOpsi = shuffleArrayWithSeed(formattedOpsi, rngOpsi)
          return { ...q, opsi: shuffledOpsi }
        })
      }

      setQuestions(finalQuestions)

      // Ambil Jawaban Lokal yang Sudah Tersimpan atau Pulihkan dari Database (Ujian Ulang)
      const activeNisn = student?.nisn || pData?.siswa_nisn
      let localAns = {}
      if (pData.status !== 'belum_mulai') {
        localAns = (await getLocalAnswers(sesiId, activeNisn)) || {}
      } else {
        await clearLocalExamSession(sesiId, activeNisn)
      }

      // Jika jawaban lokal kosong dan ada jawaban di server (misal: ujian ulang dengan jawaban terakhir atau sinkronisasi perangkat)
      if (Object.keys(localAns).length === 0) {
        const { data: remoteAns } = await supabase
          .from('cbt_jawaban_siswa')
          .select('soal_id, jawaban_terpilih, is_ragu')
          .eq('peserta_id', pesertaId)

        if (remoteAns && remoteAns.length > 0) {
          const restored = {}
          for (const r of remoteAns) {
            let parsedJawab = r.jawaban_terpilih
            try {
              if (parsedJawab && (parsedJawab.startsWith('[') || parsedJawab.startsWith('{'))) {
                parsedJawab = JSON.parse(parsedJawab)
              }
            } catch {
              // fallback raw string
            }
            restored[r.soal_id] = {
              jawaban: parsedJawab,
              isRagu: !!r.is_ragu,
              timestamp: Date.now(),
              synced: true
            }
            await saveAnswerLocally(sesiId, activeNisn, r.soal_id, parsedJawab, !!r.is_ragu)
          }
          localAns = restored
        }
      }
      setAnswers(localAns)

      // Pastikan seluruh jawaban lokal yang sudah ada langsung tersinkron ke database Supabase
      const targetPesertaId = pesertaId || pData?.id
      if (targetPesertaId && activeNisn && Object.keys(localAns).length > 0) {
        syncUnsyncedAnswers(targetPesertaId, sesiId, activeNisn, true).catch(() => {})
      }
    } catch (err) {
      console.error('[CBT Exam Page] Gagal memuat data ujian:', err)
      alert('Gagal memuat ujian: ' + err.message)
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  // (Fungsi calculateRemainingTime sudah dideklarasikan di bagian atas dengan useCallback)

  // Handle Mulai Ujian setelah membaca petunjuk (Fase 6)
  const handleStartExamAfterInstruction = async () => {
    setStartingExam(true)
    cameraGraceUntilRef.current = Date.now() + 12000
    try {
      // 1. Validasi Kamera Selfie Wajib
      if (!cameraActive) {
        const stream = await initCamera()
        if (!stream) {
          setStartingExam(false)
          return
        }
      }
      cameraGraceUntilRef.current = Date.now() + 8000

      // 2. Kiosk Mode / Lock Task Mode di Android & iOS (AAC) WAJIB AKTIF SEBELUM SOAL DIBUKA!
      if (Capacitor.isNativePlatform()) {
        try {
          await CbtLockTask.startLock()
          hasLockedTaskRef.current = true
          setIsDeviceLocked(true)
        } catch (lockError) {
          console.warn('[CBT] Native LockTask start error / student declined:', lockError)
          setStartingExam(false)
          hasLockedTaskRef.current = false
          setIsDeviceLocked(false)
          const isIos = Capacitor.getPlatform() === 'ios'
          const alertMsg = isIos
            ? '⚠️ Izin Kunci Layar Diperlukan (AAC)!\n\nUntuk mengerjakan ujian, Anda WAJIB menekan tombol "Izinkan" / "Yes" pada jendela konfirmasi "Confirm App Self-Lock".\n\nLembar soal ujian TIDAK DAPAT DIBUKA tanpa mengaktifkan mode terkunci.'
            : '⚠️ Izin Kunci Layar Diperlukan!\n\nUntuk memulai ujian, Anda wajib mengizinkan aplikasi mengunci layar.'
          alert(alertMsg)
          return // STOP: hasReadInstruction tetap false, status peserta tetap belum_mulai, soal TIDAK TAMPIL!
        }
      } else {
        // Fallback Web Browser: request Fullscreen jika diizinkan
        try {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {})
          }
        } catch (e) {}
      }

      // 3. Setelah Kunci Layar Berhasil Dikonfirmasi, baru ikat sesi dan buka lembar soal!
      const nowIso = new Date().toISOString()
      const detectedDev = detectDeviceInfo()
      const currentDeviceId = getOrCreateDeviceId()

      // Ikat sesi ujian ke perangkat fisik ini (Single Device Lock)
      let { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          waktu_mulai: nowIso,
          status: 'sedang_mengerjakan',
          device_id: currentDeviceId,
          device_info: detectedDev
        })
        .eq('id', pesertaId)

      // Fallback jika kolom device_id belum dimigrasi di database (misal PostgREST schema cache / missing column)
      const isMissingDeviceColumn = (err) => {
        if (!err) return false
        const msg = String(err.message || '').toLowerCase()
        const code = String(err.code || '')
        return (
          code === '42703' ||
          code === 'PGRST204' ||
          msg.includes('device_id') ||
          msg.includes('schema cache')
        )
      }

      if (error && isMissingDeviceColumn(error)) {
        console.warn('[CBT Device Lock] Kolom device_id belum ada di database, melanjutkan pengerjaan normal...')
        const fallbackRes = await supabase
          .from('cbt_peserta_ujian')
          .update({
            waktu_mulai: nowIso,
            status: 'sedang_mengerjakan'
          })
          .eq('id', pesertaId)
        error = fallbackRes.error
      }

      if (error) throw error

      const updatedPeserta = { ...peserta, waktu_mulai: nowIso, status: 'sedang_mengerjakan', device_id: currentDeviceId, device_info: detectedDev }
      pesertaRef.current = updatedPeserta
      setPeserta(updatedPeserta)
      setHasReadInstruction(true)
      hasReadInstructionRef.current = true
      calculateRemainingTime(updatedPeserta, sesi || sesiRef.current)

      // Broadcast instan (<30ms) ke pengawas di ruang ujian bahwa siswa telah mulai mengerjakan
      broadcastToExamRoom('student_started_exam', {
        status: 'sedang_mengerjakan',
        waktu_mulai: nowIso
      })
    } catch (err) {
      console.error('Gagal memulai sesi ujian:', err)
      alert('Terjadi kesalahan saat memulai sesi ujian: ' + err.message)
    } finally {
      setStartingExam(false)
    }
  }

  // Pastikan Lock Mode dilepas saat keluar dari halaman ujian
  useEffect(() => {
    return () => {
      if (Capacitor.isNativePlatform()) {
        CbtLockTask.stopLock().catch(() => {})
      }
    }
  }, [])

  // Listener perubahan status LockTask / AAC dari Native Plugin iOS / Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    CbtLockTask.isLocked()
      .then(res => {
        if (typeof res?.locked === 'boolean') {
          setIsDeviceLocked(res.locked)
        }
      })
      .catch(() => {})

    let handler = null
    try {
      if (CbtLockTask.addListener) {
        handler = CbtLockTask.addListener('cbtLockStateChange', (data) => {
          if (typeof data?.locked === 'boolean') {
            setIsDeviceLocked(data.locked)
            if (!data.locked) {
              hasLockedTaskRef.current = false
            }
          }
        })
      }
    } catch (e) {}

    return () => {
      if (handler && handler.remove) handler.remove()
    }
  }, [])

  // Pastikan Lock Task / AAC dihentikan jika ujian telah selesai dikumpulkan
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (submitResult || peserta?.status === 'selesai') {
        hasLockedTaskRef.current = false
        CbtLockTask.stopLock().catch(() => {})
      }
    }
  }, [submitResult, peserta?.status])

  // Otomatis arahkan kembali ke menu utama penilaian setelah 4 detik di layar selesai
  useEffect(() => {
    if (submitResult || peserta?.status === 'selesai') {
      const redirectTimer = setTimeout(() => {
        if (Capacitor.isNativePlatform()) {
          CbtLockTask.stopLock().catch(() => {})
        }
        navigate('/dashboard?menu=CBT')
      }, 4000)
      return () => clearTimeout(redirectTimer)
    }
  }, [submitResult, peserta?.status, navigate])

  // 3A. Proteksi Navigasi Keluar & Deteksi Unpin (TETAP AKTIF Saat Ujian Berlangsung MAUPUN Saat Layar Terkunci / Diblokir!)
  useEffect(() => {
    if (loading || submitResult || peserta?.status === 'selesai') return
    if (!hasReadInstruction && !isLocked && !isBlocked) return

    // Kunci riwayat browser (cegah swipe back / tombol back keluar ke /dashboard)
    try {
      window.history.pushState(null, '', window.location.href)
    } catch {}

    const handlePopState = () => {
      if (adminUnlockedRef.current || submitResult || pesertaRef.current?.status === 'selesai') return
      try {
        window.history.pushState(null, '', window.location.href)
      } catch {}
    }

    const handleUnpinAttempt = async () => {
      if (adminUnlockedRef.current) return
      console.warn('[CBT Security] Terdeteksi melepas sematan layar Android (Unpin).')
      setIsLocked(true)
      setIsBlocked(true)
      setIsDeviceLocked(false)
      hasLockedTaskRef.current = false
      setBlockReason('Akses ujian dinonaktifkan: Terdeteksi melepas sematan layar Android (Unpin). Hanya Pengawas/Admin yang dapat membuka kembali.')
      if (pesertaId) {
        try {
          await supabase
            .from('cbt_peserta_ujian')
            .update({
              status: 'terkunci',
              is_blocked: true,
              block_reason: 'Terdeteksi melepas sematan layar Android (Unpin).'
            })
            .eq('id', pesertaId)
        } catch (err) {
          console.error('[CBT Security] Gagal update status terkunci saat unpin:', err)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('cbt_unpin_attempt', handleUnpinAttempt)

    let backButtonHandle = null
    try {
      backButtonHandle = CapApp.addListener('backButton', () => {
        // Blokir total tombol/gesture Back selama ujian aktif maupun saat layar terkunci/diblokir
        console.log('[CBT Security] Tombol/gesture Back ditahan.')
      })
    } catch {}

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('cbt_unpin_attempt', handleUnpinAttempt)
      if (backButtonHandle && typeof backButtonHandle.then === 'function') {
        backButtonHandle.then(h => h.remove?.())
      }
    }
  }, [loading, hasReadInstruction, isLocked, isBlocked, submitResult, peserta?.status, pesertaId])

  // 3B. Deteksi Anti-Curang (Strike System Adaptif & Debounced)
  useEffect(() => {
    // Abaikan jika proteksi anti_curang dinonaktifkan oleh pembuat ujian
    if (sesi?.anti_curang === false) return
    // Jangan deteksi strike tambahan jika belum mulai atau sedang terkunci/selesai
    if (loading || !hasReadInstruction || isLocked || isBlocked || submitResult) return

    const handleVisibilityChange = () => {
      if (!navigator.onLine) return
      if (isSecurityGracePeriod()) return
      if (document.hidden) {
        triggerStrike('Aplikasi diminimalkan / Tab disembunyikan')
      } else {
        checkAndRestoreCamera()
      }
    }

    const handleWindowBlur = () => {
      if (!navigator.onLine) return
      if (isSecurityGracePeriod()) return
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)

      // Debounce 1.5 detik: cegah false-positive saat keyboard smartphone muncul atau tarikan status bar
      blurTimeoutRef.current = setTimeout(() => {
        if (isSecurityGracePeriod()) return
        if (document.hidden || !document.hasFocus()) {
          triggerStrike('Fokus layar beralih ke aplikasi lain')
        }
      }, 1500)
    }

    const handleWindowFocus = () => {
      // Jika siswa kembali fokus dalam 1.5 detik, batalkan strike
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
        blurTimeoutRef.current = null
      }
      checkAndRestoreCamera()
    }

    const handleNativeFocusLost = (e) => {
      if (isSecurityGracePeriod()) return
      const reason = e?.detail?.reason || 'Fokus layar teralihkan ke aplikasi melayang / overlay'
      console.warn('[CBT Security] Terdeteksi native focus lost:', reason)
      triggerStrike(reason)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('cbt_focus_lost', handleNativeFocusLost)

    // Capacitor Native Android & iOS Listeners
    let appStateHandle = null
    let backgroundTimestamp = 0
    try {
      appStateHandle = CapApp.addListener('appStateChange', async (state) => {
        if (isSecurityGracePeriod()) {
          console.log('[CBT Security] Mengabaikan appStateChange selama grace period (izin kamera/transisi).')
          return
        }
        if (!state.isActive) {
          backgroundTimestamp = Date.now()
          console.warn('[CBT Security] Aplikasi beralih ke background/inaktif!')
          triggerStrike('Aplikasi diminimalkan ke background saat ujian aktif')
        } else {
          // Ketika aplikasi kembali aktif setelah dari background
          if (backgroundTimestamp && (Date.now() - backgroundTimestamp > 700)) {
            if (!isSecurityGracePeriod()) {
              console.warn('[CBT Security] Kembali dari background setelah', Date.now() - backgroundTimestamp, 'ms')
              triggerStrike('Fokus layar beralih ke aplikasi lain')
            }
          }
          backgroundTimestamp = 0
          checkAndRestoreCamera()
        }
      })
    } catch {
      // Browser desktop fallback
    }

    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('cbt_focus_lost', handleNativeFocusLost)
      if (appStateHandle && typeof appStateHandle.then === 'function') {
        appStateHandle.then(h => h.remove?.())
      }
    }
  }, [loading, hasReadInstruction, isLocked, isBlocked, submitResult, strikeCount, totalPelanggaran, sesi, peserta, pesertaId])

  async function triggerStrike(reason = 'Pindah Tab / Layar') {
    const now = Date.now()
    if (isSecurityGracePeriod()) {
      console.log('[CBT Security] Mengabaikan trigger strike selama grace period (izin kamera / unblock / transisi).')
      return
    }
    // Cooldown 3 detik untuk mencegah lonjakan strike ganda
    if (now - lastStrikeTimeRef.current < 3000) {
      return
    }
    lastStrikeTimeRef.current = now

    const nextStrike = strikeCount + 1
    const nextTotalPelanggaran = (totalPelanggaran || 0) + 1
    setStrikeCount(nextStrike)
    setTotalPelanggaran(nextTotalPelanggaran)

    try {
      setPeserta(prev => prev ? ({ ...prev, strike_count: nextStrike, total_pelanggaran: nextTotalPelanggaran, block_reason: reason }) : prev)

      if (pesertaId) {
        // Coba update dengan total_pelanggaran
        const { error: updErr } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            strike_count: nextStrike,
            total_pelanggaran: nextTotalPelanggaran,
            block_reason: reason
          })
          .eq('id', pesertaId)

        if (updErr && String(updErr.message || '').includes('total_pelanggaran')) {
          await supabase
            .from('cbt_peserta_ujian')
            .update({
              strike_count: nextStrike,
              block_reason: reason
            })
            .eq('id', pesertaId)
        }
      }
    } catch (err) {
      console.error('[CBT Security] Gagal update strike:', err)
    }

    if (nextStrike >= 3) {
      setIsLocked(true)
      setIsBlocked(true)
      setBlockReason(`Telah terdeteksi keluar dari layar ujian sebanyak 3 kali (${reason}).`)
      if (pesertaId) {
        try {
          await supabase
            .from('cbt_peserta_ujian')
            .update({
              status: 'terkunci',
              is_blocked: true,
              block_reason: `Telah terdeteksi keluar dari layar ujian sebanyak 3 kali (${reason}).`,
              strike_count: nextStrike,
              total_pelanggaran: nextTotalPelanggaran
            })
            .eq('id', pesertaId)
        } catch (err) {
          console.error('[CBT Security] Gagal lock strike 3:', err)
        }
      }
    } else {
      setShowStrikeWarning(true)
      setGraceSeconds(5)
      clearInterval(graceTimerRef.current)
      graceTimerRef.current = setInterval(() => {
        setGraceSeconds(prev => {
          if (prev <= 1) {
            clearInterval(graceTimerRef.current)
            setShowStrikeWarning(false)
            return 5
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  // 4. Perubahan Jawaban Siswa (Local-First Instan + Real-time Cloud Sync)
  const handleAnswerChange = async (newJawaban) => {
    const currentQ = questions[currentIndex]
    if (!currentQ) return

    const currentItem = answers[currentQ.id] || {}
    const isRagu = currentItem.isRagu || false

    const activeNisn = student?.nisn || peserta?.siswa_nisn
    const updated = await saveAnswerLocally(sesiId, activeNisn, currentQ.id, newJawaban, isRagu)
    if (updated) {
      setAnswers({ ...updated })
    }

    // Real-time Cloud Sync ke Supabase agar admin/guru memantau progres jawaban secara langsung
    const targetPesertaId = pesertaId || pesertaRef.current?.id || peserta?.id
    if (targetPesertaId && navigator.onLine) {
      setSyncStatus('saving')
      const valStr = typeof newJawaban === 'object' ? JSON.stringify(newJawaban) : String(newJawaban ?? '')
      supabase
        .from('cbt_jawaban_siswa')
        .upsert([{
          peserta_id: targetPesertaId,
          soal_id: currentQ.id,
          jawaban_terpilih: valStr,
          is_ragu: isRagu,
          updated_at: new Date().toISOString()
        }], { onConflict: 'peserta_id,soal_id' })
        .then(({ error }) => {
          if (error) {
            console.warn('[CBT Cloud Sync] Pending sync error:', error.message)
            setSyncStatus('offline')
          } else {
            setSyncStatus('saved')
            setAnswers(prev => prev?.[currentQ.id] ? { ...prev, [currentQ.id]: { ...prev[currentQ.id], synced: true } } : prev)
          }
        }, err => {
          console.warn('[CBT Cloud Sync] Pending sync reject:', err?.message || err)
          setSyncStatus('offline')
        })
    } else {
      setSyncStatus('offline')
    }

    // Broadcast instan progress jumlah soal terjawab ke pengawas di ruang ujian
    if (updated && targetPesertaId) {
      const answeredCount = Object.values(updated).filter(a => a && a.jawaban !== undefined && a.jawaban !== null && a.jawaban !== '' && (typeof a.jawaban !== 'object' || Object.keys(a.jawaban).length > 0)).length
      broadcastToExamRoom('student_progress_update', {
        peserta_id: targetPesertaId,
        answered_count: answeredCount
      })
    }
  }

  const handleToggleRagu = async (newIsRagu) => {
    const currentQ = questions[currentIndex]
    if (!currentQ) return

    const currentItem = answers[currentQ.id] || {}
    const jawaban = currentItem.jawaban ?? ''

    const activeNisn = student?.nisn || peserta?.siswa_nisn
    const updated = await saveAnswerLocally(sesiId, activeNisn, currentQ.id, jawaban, newIsRagu)
    if (updated) {
      setAnswers({ ...updated })
    }

    const targetPesertaId = pesertaId || pesertaRef.current?.id || peserta?.id
    if (targetPesertaId && navigator.onLine) {
      const valStr = typeof jawaban === 'object' ? JSON.stringify(jawaban) : String(jawaban ?? '')
      supabase
        .from('cbt_jawaban_siswa')
        .upsert([{
          peserta_id: targetPesertaId,
          soal_id: currentQ.id,
          jawaban_terpilih: valStr,
          is_ragu: newIsRagu,
          updated_at: new Date().toISOString()
        }], { onConflict: 'peserta_id,soal_id' })
        .then(({ error }) => {
          if (error) console.warn('[CBT Cloud Sync] Pending ragu sync error:', error.message)
        }, err => console.warn('[CBT Cloud Sync] Pending ragu sync reject:', err?.message || err))
    }
  }

  // 5. Submit Ujian
  const handleFinalSubmit = async () => {
    setSubmitting(true)
    try {
      const activeNisn = student?.nisn || peserta?.siswa_nisn
      const targetPesertaId = pesertaId || pesertaRef.current?.id || peserta?.id
      if (targetPesertaId) {
        // 1. Paksa sinkronisasi 100% seluruh lembar jawaban lokal ke Supabase
        if (activeNisn) {
          await syncUnsyncedAnswers(targetPesertaId, sesiId, activeNisn, true)
        }
        // 2. Proteksi lapis ganda: push langsung dari state memori React 'answers' jika ada
        if (answers && Object.keys(answers).length > 0) {
          try {
            const directUpsertRows = Object.entries(answers).map(([sId, val]) => ({
              peserta_id: targetPesertaId,
              soal_id: sId,
              jawaban_terpilih: typeof val.jawaban === 'object' ? JSON.stringify(val.jawaban) : String(val.jawaban ?? ''),
              is_ragu: !!val.isRagu,
              updated_at: new Date(val.timestamp || Date.now()).toISOString()
            }))
            await supabase
              .from('cbt_jawaban_siswa')
              .upsert(directUpsertRows, { onConflict: 'peserta_id,soal_id' })
          } catch (eMemSync) {
            console.warn('[CBT Submit] Fallback memSync warning:', eMemSync.message)
          }
        }
      }

      let submitData = null
      // 1. Coba eksekusi cbt_submit_exam dengan parameter p_nisn
      const { data, error } = await supabase.rpc('cbt_submit_exam', {
        p_peserta_id: targetPesertaId || pesertaId,
        p_nisn: activeNisn || null
      })

      if (error) {
        console.warn('RPC cbt_submit_exam error/fallback:', error.message)
        // Fallback: jalankan alur submit mandiri yang kompatibel dengan akun custom siswa
        const nowIso = new Date().toISOString()
        const { error: updErr } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            status: 'selesai',
            waktu_selesai: nowIso
          })
          .eq('id', pesertaId)

        if (updErr) throw updErr

        // Jalankan penskoran internal server-side
        const { data: scoreData } = await supabase.rpc('cbt_internal_score_submission', {
          p_peserta_id: pesertaId
        })

        const isInstan = sesi?.tampilkan_nilai === 'instan'
        if (isInstan) {
          await supabase
            .from('cbt_peserta_ujian')
            .update({ is_nilai_shared: true })
            .eq('id', pesertaId)
        }

        submitData = {
          success: true,
          status: 'selesai',
          waktu_selesai: nowIso,
          total_skor_sementara: isInstan ? scoreData : null,
          is_nilai_shared: isInstan
        }
      } else {
        submitData = data
      }

      if (activeNisn) {
        await clearLocalExamSession(sesiId, activeNisn)
      }
      setSubmitResult(submitData)
      setPeserta(prev => ({ ...prev, status: 'selesai', nilai_akhir: submitData?.total_skor_sementara ?? prev?.nilai_akhir }))
      setShowSubmitModal(false)
      adminUnlockedRef.current = true
      hasLockedTaskRef.current = false

      // Broadcast instan (<30ms) ke pengawas di ruang ujian bahwa siswa telah selesai mengumpulkan
      broadcastToExamRoom('student_submitted_exam', {
        status: 'selesai',
        waktu_selesai: submitData?.waktu_selesai || new Date().toISOString(),
        nilai_akhir: submitData?.total_skor_sementara ?? null
      })

      // Lepaskan Lock Task Mode saat ujian selesai
      if (Capacitor.isNativePlatform()) {
        try {
          await CbtLockTask.stopLock()
        } catch (e) {
          console.warn('[CBT] Native LockTask stop error:', e)
        }
      }
    } catch (err) {
      console.warn('Gagal submit online, menyiapkan lembar jawaban darurat QR:', err.message)
      const activeNisn = student?.nisn || peserta?.siswa_nisn || 'SISWA'
      const qrPayload = generateEmergencyQrPayload(pesertaId, sesiId, activeNisn, answers)
      setEmergencyQrData(qrPayload)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAutoSubmitTimeUp = () => {
    alert('WAKTU UJIAN TELAH HABIS: Lembar jawaban Anda otomatis dikumpulkan.')
    handleFinalSubmit()
  }
  handleAutoSubmitRef.current = handleAutoSubmitTimeUp

  const handleRetakeResetDetected = () => {
    console.log('[CBT] Sesi ujian di-reset ke Belum Mulai oleh pengawas (Izinkan Ujian Ulang).')
    if (Capacitor.isNativePlatform()) {
      try {
        CbtLockTask.stopLock().catch(() => {})
      } catch (e) {
        console.warn('[CBT] stopLock error on retake reset:', e)
      }
    }
    setIsBlocked(false)
    setIsLocked(false)
    setBlockReason('')
    setStrikeCount(0)
    setSubmitResult(null)
    setShowSubmitModal(false)
    setHasReadInstruction(false)
    setRemainingSeconds(null)
    if (timerRef.current) clearInterval(timerRef.current)
    setRetakeNotice('Pemberitahuan Pengawas: Ujian Anda telah diizinkan untuk diulang oleh pengawas. Anda dialihkan kembali ke petunjuk awal. Silakan baca petunjuk dan klik tombol "Mulai Kerjakan Ujian" untuk memulai kembali.')
    initExam()
  }
  handleRetakeResetRef.current = handleRetakeResetDetected

  const formatTimer = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined) return '--:--:--'
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Helper untuk konten Instruksi
  const renderInstruksiKonten = () => {
    if (sesi?.instruksi && sesi.instruksi.trim() !== '') {
      return (
        <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line space-y-2">
          {sesi.instruksi}
        </div>
      )
    }

    return (
      <ol className="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
        <li>Berdoalah menurut agama dan keyakinan masing-masing sebelum memulai ujian.</li>
        <li><strong>Mode Jangan Ganggu (DND):</strong> Sangat disarankan mengaktifkan mode <em>Jangan Ganggu / Do Not Disturb</em> pada perangkat Anda agar notifikasi aplikasi / telepon tidak menyebabkan layar teralihkan.</li>
        <li>Bacalah setiap butir soal dengan saksama sebelum menentukan pilihan jawaban Anda.</li>
        <li>Tersedia fitur <strong>Ragu-Ragu (Kuning)</strong> untuk menandai butir soal yang ingin Anda tinjau kembali nanti.</li>
        <li>Dilarang membuka tab browser baru, beralih ke aplikasi lain, atau melakukan tangkapan layar (screenshot).</li>
        <li>Jika sistem mendeteksi Anda berpindah layar, peringatan <em>Strike</em> akan tercatat otomatis. Ujian terkunci pada Strike ke-3.</li>
        <li>Bila terjadi kendala teknis atau koneksi internet terputus, segera angkat tangan dan lapor ke <strong>Pengawas Ruang</strong>.</li>
        <li>Pastikan semua jawaban telah terisi dan terperiksa dengan baik sebelum menekan tombol <strong>Kumpulkan</strong>.</li>
      </ol>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 space-y-3">
        <svg className="w-9 h-9 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div className="text-sm font-bold text-slate-700">Mempersiapkan Lembar Ujian...</div>
      </div>
    )
  }

  // JIKA SISWA MENCOBA LOGIN / BUKA UJIAN DI PERANGKAT KEDUA (SINGLE DEVICE LOCK)
  if (isDeviceConflict) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6 select-none relative">
        <div className="bg-white border border-amber-200 rounded-3xl max-w-md w-full p-8 text-center space-y-5 shadow-xl animate-scale-up">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Ujian Aktif di Perangkat Lain</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Akun Anda terdeteksi sedang mengerjakan ujian ini pada perangkat lain. 1 akun siswa hanya diperbolehkan membuka lembar ujian pada 1 perangkat.
            </p>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl text-left space-y-1">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Perangkat yang Terkunci:</span>
            <p className="text-xs text-amber-900 font-bold flex items-center gap-1.5">
              <span>📱</span>
              <span>{conflictDeviceInfo || 'Perangkat Siswa Sebelumnya'}</span>
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 text-left space-y-1.5">
            <p className="font-semibold text-slate-800">Perangkat Anda Rusak atau Mati?</p>
            <p className="text-[11px] leading-relaxed">
              Silakan <strong>lapor ke Pengawas Ruang</strong> untuk melakukan <em>Reset Perangkat</em>. Seluruh jawaban yang sudah Anda isi tetap aman di server dan otomatis dipulihkan.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
            >
              Kembali ke Portal
            </button>
            <button
              type="button"
              onClick={() => initExam()}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>Periksa Ulang ⟳</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // JIKA UJIAN SUDAH SELESAI DIKUMPULKAN (PRIORITAS TINGGI: SEGERA TAMPILKAN MESKIPUN SEBELUMNYA BLOCKED/LOCKED)
  if (submitResult || peserta?.status === 'selesai') {
    const res = submitResult || {
      total_skor_sementara: peserta?.nilai_akhir ?? null,
      is_nilai_shared: !!peserta?.is_nilai_shared
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6 relative select-none">
        {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
        <div
          onClick={handleSecretTrigger}
          className="fixed top-0 left-0 w-24 h-24 z-50 opacity-0 cursor-default select-none pointer-events-auto"
          title=""
          aria-hidden="true"
        />

        <div className="bg-white border border-slate-200/90 rounded-3xl max-w-md w-full p-8 text-center space-y-5 shadow-xl animate-scale-up relative z-10">
          <div 
            onClick={handleSecretTrigger}
            title="Ketuk 5x untuk menu darurat pengawas"
            className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-2xs cursor-pointer select-none active:scale-95 transition-transform"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-800">Ujian Berhasil Dikumpulkan!</h2>
            <p className="text-xs text-slate-500">
              Seluruh jawaban Anda telah tersimpan resmi dan aman di database sekolah.
            </p>
          </div>

          {res.is_nilai_shared && res.total_skor_sementara !== null ? (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Skor Perolehan:</span>
              <div className="text-3xl font-extrabold text-emerald-600">
                {res.total_skor_sementara} <span className="text-sm text-slate-400 font-normal">/ 100</span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl text-amber-800 text-xs leading-relaxed flex items-start gap-2.5 text-left">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Nilai Anda akan diumumkan serentak oleh guru pengampu mata pelajaran setelah seluruh kelas menyelesaikan penilaian.</span>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                if (Capacitor.isNativePlatform()) {
                  try {
                    await CbtLockTask.stopLock()
                  } catch {}
                }
                navigate('/dashboard?menu=CBT')
              }}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Kembali ke Menu Utama Penilaian</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            {Capacitor.isNativePlatform() && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await CbtLockTask.stopLock()
                  } catch {}
                  try {
                    await CapApp.exitApp()
                  } catch {
                    navigate('/dashboard?menu=CBT')
                  }
                }}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all border border-slate-200 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🚪 Keluar Aplikasi Sekarang</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Otomatis kembali ke menu utama dalam 4 detik...
          </p>
        </div>

        {/* Modal Buka Kunci Pengawas / Admin */}
        <AdminUnlockModal
          isOpen={showAdminUnlockModal}
          onClose={() => setShowAdminUnlockModal(false)}
          adminCodeInput={adminCodeInput}
          setAdminCodeInput={setAdminCodeInput}
          adminCodeError={adminCodeError}
          isAdminUnlocked={isAdminUnlocked}
          onVerify={handleVerifyAdminCode}
          onUnlockScreenOnly={handleAdminUnlockScreenOnly}
          onUnlockAndExit={handleAdminUnlockAndExit}
          onResetStrikes={handleAdminResetStrikes}
          isBlocked={false}
        />
      </div>
    )
  }

  // JIKA SISWA DIBLOKIR OLEH PENGAWAS / ADMIN
  if (isBlocked) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6 select-none relative">
        {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
        <div
          onClick={handleSecretTrigger}
          className="fixed top-0 left-0 w-20 h-20 z-50 opacity-0 cursor-default select-none pointer-events-auto"
          title=""
          aria-hidden="true"
        />

        <div className="bg-white border border-rose-200 rounded-3xl max-w-md w-full p-8 text-center space-y-5 shadow-xl animate-shake">
          <div 
            onClick={handleSecretTrigger}
            className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 cursor-pointer active:scale-95 transition-transform"
            title="Ketuk 5 kali untuk membuka otorisasi pengawas"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Akses Ujian Dinonaktifkan</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Status kepesertaan ujian Anda saat ini ditangguhkan oleh Pengawas atau Administrator Ujian.
            </p>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 p-4 rounded-2xl text-left space-y-1">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Alasan Penangguhan:</span>
            <p className="text-xs text-rose-800 font-medium">{blockReason || 'Melakukan aktivitas mencurigakan di ruang ujian.'}</p>
          </div>

          {Capacitor.isNativePlatform() && !isDeviceLocked && (
            <button
              type="button"
              onClick={() => {
                CbtLockTask.startLock()
                  .then(() => {
                    setIsDeviceLocked(true)
                    hasLockedTaskRef.current = true
                  })
                  .catch(() => {})
              }}
              className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-2xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>🔒</span>
              <span>Sematkan Layar Kembali (Wajib sebelum Dibuka Pengawas)</span>
            </button>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600">
            Silakan <strong>angkat tangan Anda</strong> dan lapor langsung kepada Pengawas Ruang untuk klarifikasi dan pengaktifan kembali.
          </div>
        </div>

        <AdminUnlockModal
          isOpen={showAdminUnlockModal}
          onClose={() => setShowAdminUnlockModal(false)}
          adminCodeInput={adminCodeInput}
          setAdminCodeInput={setAdminCodeInput}
          adminCodeError={adminCodeError}
          isAdminUnlocked={isAdminUnlocked}
          onVerify={handleVerifyAdminCode}
          onUnlockScreenOnly={handleAdminUnlockScreenOnly}
          onUnlockAndExit={handleAdminUnlockAndExit}
          onResetStrikes={handleAdminResetStrikes}
          isBlocked={true}
        />
      </div>
    )
  }

  // JIKA UJIAN TERKUNCI OLEH STRIKE 3
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6 select-none relative">
        {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
        <div
          onClick={handleSecretTrigger}
          className="fixed top-0 left-0 w-20 h-20 z-50 opacity-0 cursor-default select-none pointer-events-auto"
          title=""
          aria-hidden="true"
        />

        <div className="bg-white border-2 border-rose-300 rounded-3xl max-w-md w-full p-8 text-center space-y-5 shadow-xl animate-shake">
          <div 
            onClick={handleSecretTrigger}
            className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 cursor-pointer active:scale-95 transition-transform"
            title="Ketuk 5 kali untuk membuka otorisasi pengawas"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-rose-700">Lembar Ujian Terkunci!</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {blockReason || 'Anda telah terdeteksi keluar dari layar ujian sebanyak 3 kali (Strike 3). Sesuai tata tertib digital sekolah, lembar ujian terkunci otomatis.'}
            </p>
          </div>

          {Capacitor.isNativePlatform() && !isDeviceLocked && (
            <button
              type="button"
              onClick={() => {
                CbtLockTask.startLock()
                  .then(() => {
                    setIsDeviceLocked(true)
                    hasLockedTaskRef.current = true
                  })
                  .catch(() => {})
              }}
              className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-2xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>🔒</span>
              <span>Sematkan Layar Kembali (Wajib sebelum Dibuka Pengawas)</span>
            </button>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600">
            Silakan <strong>angkat tangan Anda</strong> dan lapor ke Pengawas Ruang untuk membuka kunci lembar ujian (<em>Remote Unlock</em>).
          </div>
        </div>

        <AdminUnlockModal
          isOpen={showAdminUnlockModal}
          onClose={() => setShowAdminUnlockModal(false)}
          adminCodeInput={adminCodeInput}
          setAdminCodeInput={setAdminCodeInput}
          adminCodeError={adminCodeError}
          isAdminUnlocked={isAdminUnlocked}
          onVerify={handleVerifyAdminCode}
          onUnlockScreenOnly={handleAdminUnlockScreenOnly}
          onUnlockAndExit={handleAdminUnlockAndExit}
          onResetStrikes={handleAdminResetStrikes}
          isBlocked={true}
        />
      </div>
    )
  }


  // FASE 6: TAMPILAN INSTRUKSI PENILAIAN SEBELUM UJIAN DIMULAI
  if (!hasReadInstruction) {
    const targetKelasText = Array.isArray(sesi?.target_rombel)
      ? sesi.target_rombel.join(', ')
      : sesi?.target_rombel || student.kelas || '-'

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col p-4 md:p-8 relative select-none">
        {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
        <div
          onClick={handleSecretTrigger}
          className="fixed top-0 left-0 w-20 h-20 z-50 opacity-0 cursor-default select-none pointer-events-auto"
          title=""
          aria-hidden="true"
        />

        {/* Navigasi Keluar / Batal ke Beranda */}
        <div className="max-w-3xl w-full mx-auto mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={async () => {
              if (Capacitor.isNativePlatform()) {
                await CbtLockTask.stopLock().catch(() => {})
              }
              navigate('/dashboard?menu=CBT')
            }}
            className="py-2 px-3.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>←</span>
            <span>Kembali ke Beranda Penilaian</span>
          </button>
        </div>

        <div className="max-w-3xl w-full mx-auto bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden animate-scale-up">
          {/* KOP SEKOLAH RESMI */}
          <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-4 border-b-2 border-slate-800 pb-4">
              <div 
                onClick={handleSecretTrigger}
                title="Budi Mulia"
                className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-md cursor-pointer select-none active:scale-95 transition-transform"
              >
                BM
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Yayasan Perguruan Budi Mulia
                </div>
                <h1 className="text-lg md:text-xl font-black text-slate-900 uppercase tracking-tight">
                  SMP Budi Mulia Jakarta
                </h1>
                <p className="text-[11px] text-slate-500">
                  Jl. Mangga Besar VIII No. 35, Jakarta Pusat • Akreditasi A
                </p>
              </div>
            </div>
            <div className="border-b border-slate-800 mt-1"></div>

            <div className="text-center mt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {sesi?.kategori || 'ASESMEN DIGITAL'}
              </span>
              <h2 className="text-base md:text-lg font-bold text-slate-800 mt-2">
                {sesi?.judul || 'Petunjuk Teknis Penilaian'}
              </h2>
            </div>
          </div>

          {/* METADATA PENILAIAN */}
          <div className="p-6 md:p-8 space-y-6">
            {retakeNotice && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-4 rounded-2xl flex items-start gap-3 animate-fade-in shadow-xs">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-indigo-950">Izin Ujian Ulang Diberikan</p>
                  <p className="mt-0.5 text-indigo-800 leading-relaxed">{retakeNotice}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Mata Pelajaran:</span>
                <span className="font-bold text-slate-800">{sesi?.mapel || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Guru Pengampu:</span>
                <span className="font-bold text-slate-800">{sesi?.guru_nama || 'Guru Mapel'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Target Rombel:</span>
                <span className="font-bold text-slate-800">{targetKelasText}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Durasi Pengerjaan:</span>
                <span className="font-bold text-indigo-600">{sesi?.durasi_menit || 90} Menit</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Target KKTP / KKM:</span>
                <span className="font-bold text-emerald-600">{sesi?.kkm || 75}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Jumlah Butir Soal:</span>
                <span className="font-bold text-slate-800">{questions.length} Butir</span>
              </div>
            </div>

            {/* IDENTITAS SISWA AKTIF */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  ID
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">{student.nama_lengkap || 'Peserta Ujian'}</div>
                  <div className="text-[11px] text-slate-500">NISN: {student.nisn || '-'} • Kelas {student.kelas || '-'}</div>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100/60 px-2.5 py-1 rounded-lg">
                Terverifikasi
              </span>
            </div>

            {/* DAFTAR PETUNJUK & INSTRUKSI */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Petunjuk Pengerjaan & Tata Tertib:
              </h3>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60">
                {renderInstruksiKonten()}
              </div>
            </div>

            {/* PERINGATAN ANTI-CURANG */}
            {sesi?.anti_curang !== false && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <strong className="font-semibold block">Sistem Proteksi Anti-Curang Aktif:</strong>
                    Perpindahan jendela browser atau aplikasi akan dideteksi dan dicatat ke catatan pengawas (Maksimal 3 Strike sebelum ujian terkunci otomatis).
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-2 border-t border-amber-200/70 text-[11px] text-amber-900">
                  <span className="text-base leading-none">🔕</span>
                  <span>
                    <strong>Anjuran Pengawas:</strong> Aktifkan mode <em>Jangan Ganggu (Do Not Disturb / DND)</em> pada perangkat Anda agar notifikasi aplikasi atau panggilan tidak memicu deteksi keluar ujian.
                  </span>
                </div>
              </div>
            )}

            {/* VALIDASI KAMERA PENGAWASAN WAJIB */}
            <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-xs shrink-0">
                    📹
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Kamera Pengawasan Wajib Aktif
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Kamera selfie depan wajib diaktifkan untuk pengawasan ujian
                    </p>
                  </div>
                </div>
                {cameraActive ? (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Kamera Siap</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={initCamera}
                    disabled={cameraLoading}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs shrink-0 flex items-center gap-1.5"
                  >
                    {cameraLoading ? (
                      <>
                        <span className="animate-spin text-xs">⟳</span>
                        <span>Mengaktifkan...</span>
                      </>
                    ) : (
                      <>
                        <span>📷</span>
                        <span>Aktifkan Kamera</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {cameraError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">⚠️</span>
                    <div>{cameraError}</div>
                  </div>
                  {Capacitor.isNativePlatform() && (
                    <button
                      type="button"
                      onClick={() => {
                        CbtLockTask.openAppSettings().catch(() => {})
                      }}
                      className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>⚙️</span>
                      <span>Buka Pengaturan Izin HP Sekarang</span>
                    </button>
                  )}
                </div>
              )}

              {cameraActive && (
                <div className="flex items-center gap-2 text-[11px] text-indigo-900 bg-white/90 p-2.5 rounded-xl border border-indigo-100">
                  <span className="text-sm">👁️</span>
                  <span>Kamera selfie aktif. Selama ujian, widget kamera melayang di layar dapat Anda geser dengan jari agar tidak menghalangi lembar soal.</span>
                </div>
              )}
            </div>

            {/* CTA MULAI */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStartExamAfterInstruction}
                disabled={startingExam}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-2xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                {startingExam ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Mempersiapkan Lembar Soal...</span>
                  </>
                ) : (
                  <>
                    <span>Saya Mengerti, Mulai Mengerjakan Ujian</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <AdminUnlockModal
          isOpen={showAdminUnlockModal}
          onClose={() => setShowAdminUnlockModal(false)}
          adminCodeInput={adminCodeInput}
          setAdminCodeInput={setAdminCodeInput}
          adminCodeError={adminCodeError}
          isAdminUnlocked={isAdminUnlocked}
          onVerify={handleVerifyAdminCode}
          onUnlockScreenOnly={handleAdminUnlockScreenOnly}
          onUnlockAndExit={handleAdminUnlockAndExit}
          onResetStrikes={handleAdminResetStrikes}
          isBlocked={false}
        />
      </div>
    )
  }

  // JIKA APLIKASI NATIVE (IOS/ANDROID) BELUM/TIDAK DALAM MODE TERKUNCI (AAC/LOCK TASK)
  if (Capacitor.isNativePlatform() && !isDeviceLocked && !adminUnlockedRef.current && !submitResult && peserta?.status !== 'selesai') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 select-none relative">
        {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
        <div
          onClick={handleSecretTrigger}
          className="fixed top-0 left-0 w-24 h-24 z-50 opacity-0 cursor-default select-none pointer-events-auto"
          title=""
          aria-hidden="true"
        />

        <div className="bg-slate-800 border-2 border-amber-400/80 rounded-3xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl animate-shake">
          <div 
            onClick={handleSecretTrigger}
            className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/30 text-3xl cursor-pointer active:scale-95 transition-transform"
            title="Ketuk 5 kali untuk membuka otorisasi pengawas"
          >
            🔒
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-amber-300">
              {Capacitor.getPlatform() === 'ios' ? 'Mode Terkunci (AAC) Wajib Aktif' : 'Sematan Layar (Kiosk Mode) Wajib Aktif'}
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {Capacitor.getPlatform() === 'ios'
                ? 'Soal ujian disembunyikan untuk menjaga kejujuran dan integritas ujian digital. Silakan izinkan Confirm App Self-Lock pada perangkat Anda agar dapat melihat dan mengerjakan soal.'
                : 'Layar ponsel belum disematkan (unpinned). Soal ujian disembunyikan agar layar tidak dapat diusap/dialihkan. Silakan sematkan layar kembali untuk melanjutkan pengerjaan soal.'}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={isActivatingLock}
              onClick={async () => {
                try {
                  setIsActivatingLock(true)
                  await CbtLockTask.startLock()
                  setIsDeviceLocked(true)
                  hasLockedTaskRef.current = true
                  checkAndRestoreCamera()
                } catch (err) {
                  console.warn('Gagal mengaktifkan mode terkunci:', err)
                  const isIos = Capacitor.getPlatform() === 'ios'
                  const errMsg = isIos
                    ? '⚠️ Izin Penguncian Ditolak / Dibatalkan:\n\nAnda harus memilih "Yes / Izinkan" pada konfirmasi sistem iOS agar lembar soal ujian dapat dibuka.'
                    : '⚠️ Sematan Layar Diperlukan:\n\nSilakan izinkan penyematan layar pada jendela dialog Android agar lembar soal dapat dibuka.'
                  alert(errMsg)
                } finally {
                  setIsActivatingLock(false)
                }
              }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {isActivatingLock ? (
                <>
                  <span className="animate-spin text-base">⟳</span>
                  <span>Menunggu Konfirmasi Kunci...</span>
                </>
              ) : (
                <>
                  <span>🔒</span>
                  <span>{Capacitor.getPlatform() === 'ios' ? 'Izinkan Kunci Layar & Buka Soal' : 'Sematkan Layar & Lanjutkan Ujian'}</span>
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-400">
            Jika ingin keluar atau ada kendala pada perangkat, silakan angkat tangan dan hubungi Pengawas Ruang.
          </div>
        </div>

        <AdminUnlockModal
          isOpen={showAdminUnlockModal}
          onClose={() => setShowAdminUnlockModal(false)}
          adminCodeInput={adminCodeInput}
          setAdminCodeInput={setAdminCodeInput}
          adminCodeError={adminCodeError}
          isAdminUnlocked={isAdminUnlocked}
          onVerify={handleVerifyAdminCode}
          onUnlockScreenOnly={handleAdminUnlockScreenOnly}
          onUnlockAndExit={handleAdminUnlockAndExit}
          onResetStrikes={handleAdminResetStrikes}
          isBlocked={false}
        />
      </div>
    )
  }

  const currentQ = questions[currentIndex]
  const currentAnswerItem = currentQ ? answers[currentQ.id] : null
  const currentJawabanVal = currentAnswerItem ? currentAnswerItem.jawaban : ''
  const currentIsRaguVal = currentAnswerItem ? currentAnswerItem.isRagu : false

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-800 flex flex-col select-none relative">
      {/* Toast Alert Tambahan Waktu dari Pengawas */}
      {extraTimeAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-md w-[92%] bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="text-2xl shrink-0">⏳</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Tambahan Waktu Diberikan</p>
            <p className="text-xs sm:text-sm font-semibold">Pengawas menambahkan waktu ujian Anda sebesar +{extraTimeAlert.minutes} menit.</p>
          </div>
          <button 
            type="button"
            onClick={() => setExtraTimeAlert(null)} 
            className="text-white/80 hover:text-white text-base font-bold p-1 shrink-0 cursor-pointer"
            title="Tutup Notifikasi"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hidden Proctor Hotspot (Pojok Kiri Atas - 5 Ketukan Cepat) */}
      <div
        onClick={handleSecretTrigger}
        className="fixed top-0 left-0 w-20 h-20 z-50 opacity-0 cursor-default select-none pointer-events-auto"
        title=""
        aria-hidden="true"
      />

      {/* Top Bar Header Imersif */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-4 md:px-7 py-2.5 sm:py-3 sticky top-0 z-40 flex items-center justify-between gap-2 shadow-xs">
        {/* Identitas Ujian (min-w-0 & truncate agar tidak mendorong elemen kanan) */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-1">
          <div 
            onClick={handleSecretTrigger}
            title="CBT Budi Mulia"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-xs cursor-pointer select-none active:scale-95 transition-transform shrink-0"
          >
            CBT
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs md:text-sm font-bold text-slate-800 truncate leading-tight">
              {sesi?.judul || 'Ujian Digital'}
            </h1>
            <div className="text-[10px] md:text-[11px] text-slate-400 flex items-center gap-1.5 truncate leading-tight mt-0.5">
              <span className="truncate">{sesi?.mapel}</span>
              <span className="shrink-0">•</span>
              <span className="truncate">{student.nama_lengkap || student.nama} ({student.kelas})</span>
            </div>
          </div>
        </div>

        {/* Timer, Petunjuk (!), & Status (shrink-0 agar UTUH dan TIDAK TERPOTONG) */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
          {/* Indikator Real-Time Sinkronisasi Jawaban (Tampil di HP & Laptop) */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-[10px] sm:text-[11px] font-bold transition ${
              !isOnline || syncStatus === 'offline'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : syncStatus === 'saving'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
            title={
              !isOnline || syncStatus === 'offline'
                ? 'Sinyal terputus sementara. Jawaban tetap aman tersimpan di memori HP dan otomatis terkirim saat sinyal kembali.'
                : 'Seluruh jawaban Anda telah tersimpan aman di server.'
            }
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              !isOnline || syncStatus === 'offline'
                ? 'bg-amber-500 animate-ping'
                : syncStatus === 'saving'
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-emerald-500'
            }`}></span>
            <span className="hidden sm:inline">
              {!isOnline || syncStatus === 'offline'
                ? 'Offline (Aman di HP)'
                : syncStatus === 'saving'
                  ? 'Menyimpan...'
                  : 'Tersimpan'}
            </span>
          </div>

          {/* Sisa Waktu Countdown */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-200 shrink-0">
            <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`font-mono text-xs sm:text-sm font-bold shrink-0 ${
              remainingSeconds !== null && remainingSeconds < 300 ? 'text-rose-500 animate-pulse' : 'text-indigo-600'
            }`}>
              {formatTimer(remainingSeconds)}
            </span>
            {peserta?.extra_waktu_menit > 0 && (
              <span 
                className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-1 py-0.2 rounded-md border border-amber-300 shrink-0 animate-pulse" 
                title={`Mendapatkan tambahan waktu +${peserta.extra_waktu_menit} menit dari pengawas`}
              >
                +{peserta.extra_waktu_menit}m
              </span>
            )}
          </div>

          {/* Tombol Floating / Header (!) Petunjuk Ujian (Fase 6) */}
          <button
            type="button"
            onClick={() => setShowInstructionModal(true)}
            title="Buka Petunjuk & Tata Tertib Ujian"
            className="p-1.5 sm:p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors flex items-center gap-1 text-xs font-semibold shrink-0 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden lg:inline text-[11px]">Petunjuk</span>
          </button>

          {/* Tombol Kumpulkan (Pasti tampil utuh tanpa terpotong) */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="py-1.5 px-3 sm:px-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 whitespace-nowrap cursor-pointer inline-flex items-center justify-center"
          >
            Kumpulkan
          </button>
        </div>
      </header>

      {/* Main Container: Split-Pane Soal + Palet Nomor (Desktop) + Bottom Nav (HP) */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-7xl mx-auto w-full min-w-0 grid grid-cols-1 lg:grid-cols-4 gap-6 pb-32 lg:pb-6">
        {/* Kolom Kiri / Utama: Renderer Butir Soal */}
        <div className="lg:col-span-3 min-w-0 max-w-full">
          <CbtSoalRenderer
            soal={currentQ}
            currentIndex={currentIndex}
            totalSoal={questions.length}
            currentJawaban={currentJawabanVal}
            isRagu={currentIsRaguVal}
            onAnswerChange={handleAnswerChange}
            onToggleRagu={handleToggleRagu}
            onPrev={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            onNext={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
            hasPrev={currentIndex > 0}
            hasNext={currentIndex < questions.length - 1}
            onSubmit={() => setShowSubmitModal(true)}
            fontSize={fontSize}
            onFontSizeChange={handleFontSizeChange}
            onImageClick={(src, alt) => setActiveZoomImage({ src, alt })}
          />
        </div>

        {/* Kolom Kanan: Palet Nomor ANBK (Desktop/Tablet Besar) */}
        <div className="hidden lg:block lg:col-span-1">
          <CbtNavigasiNomor
            questions={questions}
            currentIndex={currentIndex}
            answers={answers}
            onSelectNomor={(idx) => setCurrentIndex(idx)}
            onOpenSubmitModal={() => setShowSubmitModal(true)}
          />
        </div>
      </main>

      {/* Bilah Navigasi Bawah Khusus Layar HP / Android */}
      <CbtMobileBottomNav
        questions={questions}
        currentIndex={currentIndex}
        answers={answers}
        onSelectNomor={(idx) => setCurrentIndex(idx)}
        onSubmit={() => setShowSubmitModal(true)}
        isExpanded={isBottomNavExpanded}
        setIsExpanded={setIsBottomNavExpanded}
        isVisible={isBottomNavVisible}
        setIsVisible={setIsBottomNavVisible}
      />

      {/* Modal Pembesar Gambar (Zoom In / Out / Pan) */}
      <CbtImageZoomModal
        isOpen={Boolean(activeZoomImage)}
        imageSrc={activeZoomImage?.src}
        imageAlt={activeZoomImage?.alt}
        onClose={() => setActiveZoomImage(null)}
      />


      {/* MODAL PETUNJUK PENILAIAN (Fase 6 — Dibuka lewat tombol (!)) */}
      {showInstructionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-scale-up overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Petunjuk & Tata Tertib Ujian</h3>
                  <div className="text-[11px] text-slate-400">{sesi?.judul} • SMP Budi Mulia</div>
                </div>
              </div>
              <button
                onClick={() => setShowInstructionModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
                {renderInstruksiKonten()}
              </div>

              {sesi?.anti_curang !== false && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Anti-Curang Aktif: Jangan berpindah tab atau aplikasi untuk menghindari pencatatan Strike pelanggaran.</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowInstructionModal(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Kembali ke Soal Ujian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Peringatan Strike (Pelanggaran Layar) */}
      {showStrikeWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border-2 border-amber-500 space-y-4 animate-scale-up">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-amber-600">
                Peringatan Pelanggaran Layar!
              </h3>
              <p className="text-xs text-slate-600">
                Anda terdeteksi keluar dari lembar ujian. Kesempatan tersisa: <strong>{3 - strikeCount} kali</strong> lagi.
              </p>
            </div>
            <div className="py-2 px-3 bg-amber-50 rounded-xl text-xs font-bold text-amber-800">
              Menutup otomatis dalam: {graceSeconds} detik
            </div>
            <button
              onClick={() => setShowStrikeWarning(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-all"
            >
              Saya Mengerti, Kembali Ujian
            </button>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Submit dengan Peringatan Soal Kosong / Ragu */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-up max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header Modal */}
            <div className="flex items-start gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                unansweredList.length > 0
                  ? 'bg-rose-100 text-rose-600'
                  : raguList.length > 0
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}>
                {unansweredList.length > 0 ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : raguList.length > 0 ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800">
                  {unansweredList.length > 0
                    ? `Perhatian: Ada ${unansweredList.length} Soal Belum Dijawab!`
                    : raguList.length > 0
                    ? `Ada ${raguList.length} Soal Masih Ragu-Ragu`
                    : 'Kumpulkan Lembar Ujian?'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {unansweredList.length > 0
                    ? 'Jawaban yang kosong tidak akan mendapatkan poin nilai.'
                    : 'Pastikan seluruh jawaban telah Anda periksa kembali dengan teliti.'}
                </p>
              </div>
            </div>

            {/* Status Grid Badges */}
            <div className="grid grid-cols-3 gap-2 py-1">
              <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-center">
                <div className="text-base font-extrabold text-emerald-700 font-mono">
                  {answeredList.length}
                </div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                  Terjawab
                </div>
              </div>

              <div className={`p-2.5 rounded-2xl text-center border ${
                raguList.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-base font-extrabold font-mono ${raguList.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {raguList.length}
                </div>
                <div className={`text-[10px] font-bold uppercase tracking-wide ${raguList.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  Ragu-Ragu
                </div>
              </div>

              <div className={`p-2.5 rounded-2xl text-center border ${
                unansweredList.length > 0 ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`text-base font-extrabold font-mono ${unansweredList.length > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                  {unansweredList.length}
                </div>
                <div className={`text-[10px] font-bold uppercase tracking-wide ${unansweredList.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  Belum Diisi
                </div>
              </div>
            </div>

            {/* Daftar Chip Nomor Soal Kosong / Ragu */}
            {(unansweredList.length > 0 || raguList.length > 0) && (
              <div className="space-y-2.5 overflow-y-auto max-h-48 pr-1">
                {unansweredList.length > 0 && (
                  <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-200/80 space-y-1.5">
                    <div className="text-[11px] font-bold text-rose-800 flex items-center justify-between">
                      <span>Nomor yang belum dijawab:</span>
                      <span className="text-[10px] text-rose-600 font-normal">Klik untuk langsung ke nomor</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {unansweredList.map(item => (
                        <button
                          key={item.nomor}
                          type="button"
                          onClick={() => {
                            setCurrentIndex(item.idx)
                            setShowSubmitModal(false)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-600 hover:text-white transition-all shadow-2xs cursor-pointer"
                        >
                          No. {item.nomor}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {raguList.length > 0 && (
                  <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-1.5">
                    <div className="text-[11px] font-bold text-amber-800 flex items-center justify-between">
                      <span>Nomor yang masih ragu-ragu:</span>
                      <span className="text-[10px] text-amber-600 font-normal">Klik untuk langsung ke nomor</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {raguList.map(item => (
                        <button
                          key={item.nomor}
                          type="button"
                          onClick={() => {
                            setCurrentIndex(item.idx)
                            setShowSubmitModal(false)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 text-xs font-bold hover:bg-amber-500 hover:text-slate-900 transition-all shadow-2xs cursor-pointer"
                        >
                          No. {item.nomor} ?
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tombol Aksi */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (unansweredList.length > 0) {
                    setCurrentIndex(unansweredList[0].idx)
                  } else if (raguList.length > 0) {
                    setCurrentIndex(raguList[0].idx)
                  }
                  setShowSubmitModal(false)
                }}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs transition-all text-center cursor-pointer ${
                  unansweredList.length > 0 || raguList.length > 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs order-1 sm:order-2'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {unansweredList.length > 0
                  ? `← Kerjakan Soal No. ${unansweredList[0]?.nomor || 1}`
                  : raguList.length > 0
                  ? `← Periksa Soal No. ${raguList[0]?.nomor || 1}`
                  : 'Periksa Lagi'}
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                  unansweredList.length > 0
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 order-2 sm:order-1'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                }`}
              >
                {submitting
                  ? 'Mengumpulkan...'
                  : unansweredList.length > 0
                  ? `Tetap Kumpulkan (${answeredList.length}/${questions.length} Soal)`
                  : 'Ya, Kumpulkan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal Penyerahan Darurat via QR Code (Jika Submit Offline) */}
      {emergencyQrData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-slate-200 space-y-4 animate-scale-up">
            <div className="space-y-1">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                MODE DARURAT OFFLINE
              </span>
              <h3 className="text-base font-bold text-slate-800">
                Lembar Jawaban Darurat (QR Code)
              </h3>
              <p className="text-xs text-slate-500">
                Koneksi internet sekolah terputus. Tunjukkan QR Code ini ke <strong>Guru Pengawas</strong> di ruangan untuk dipindai secara resmi.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl inline-block border-2 border-slate-800 shadow-md">
              <QRCodeSVG value={emergencyQrData} size={220} level="M" />
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Peserta: {student.nisn} • Sesi: {sesiId.substring(0, 8)}
            </div>

            <button
              onClick={() => {
                setEmergencyQrData(null)
                navigate('/dashboard')
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
            >
              Pengawas Sudah Scan (Selesai)
            </button>
          </div>
        </div>
      )}

      {/* Modal Buka Kunci Pengawas / Admin */}
      <AdminUnlockModal
        isOpen={showAdminUnlockModal}
        onClose={() => setShowAdminUnlockModal(false)}
        adminCodeInput={adminCodeInput}
        setAdminCodeInput={setAdminCodeInput}
        adminCodeError={adminCodeError}
        isAdminUnlocked={isAdminUnlocked}
        onVerify={handleVerifyAdminCode}
        onUnlockScreenOnly={handleAdminUnlockScreenOnly}
        onUnlockAndExit={handleAdminUnlockAndExit}
        onResetStrikes={handleAdminResetStrikes}
        isBlocked={isBlocked || isLocked}
      />

      {/* Widget Kamera Selfie Melayang (Floating Draggable) */}
      {hasReadInstruction && cameraStream && (
        <CbtFloatingCamera
          stream={cameraStream}
          isLiveWatched={isLiveWatched}
        />
      )}

      {/* Blocker Jika Kamera Terputus di Tengah Ujian */}
      {hasReadInstruction && !cameraActive && !submitResult && !isBlocked && !isLocked && !loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 text-2xl flex items-center justify-center mx-auto">
              📷
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">
                Kamera Pengawasan Tidak Aktif
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Kamera selfie depan wajib aktif selama ujian berlangsung. Lembar soal dijeda sementara sampai kamera diaktifkan kembali.
              </p>
            </div>
            {cameraError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium text-left space-y-2">
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0">⚠️</span>
                  <span>{cameraError}</span>
                </div>
                {Capacitor.isNativePlatform() && (
                  <button
                    type="button"
                    onClick={() => {
                      CbtLockTask.openAppSettings().catch(() => {})
                    }}
                    className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>⚙️</span>
                    <span>Buka Pengaturan Izin HP</span>
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={initCamera}
                disabled={cameraLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-98 cursor-pointer"
              >
                {cameraLoading ? 'Mengaktifkan Kamera...' : 'Aktifkan Kamera Kembali'}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all border border-slate-200 cursor-pointer"
              >
                Muat Ulang Tampilan (Jika Layar Gelap / Macet)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
