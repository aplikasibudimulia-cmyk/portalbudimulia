import { useState, useEffect } from 'react'
import { getCameraStream } from '../utils/cameraUtils'

// Cek apakah izin sudah pernah diurus sebelumnya
const STORAGE_KEY = 'perm_onboarding_done'

const PERMISSIONS = [
  {
    key: 'camera',
    label: 'Kamera',
    desc: 'Digunakan untuk foto selfie saat presensi masuk/pulang sebagai bukti kehadiran.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'blue',
    request: async () => {
      const stream = await getCameraStream('user')
      if (stream) stream.getTracks().forEach(t => t.stop())
    },
    permName: 'camera',
    notSupported: typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia,
  },
  {
    key: 'geolocation',
    label: 'Lokasi (GPS)',
    desc: 'Digunakan untuk memverifikasi lokasi saat presensi, memastikan kehadiran dari lokasi yang benar.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'emerald',
    request: () => new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
    }),
    permName: 'geolocation',
    notSupported: !('geolocation' in navigator),
  },
  {
    key: 'notifications',
    label: 'Notifikasi',
    desc: 'Digunakan agar orang tua mendapat notifikasi langsung saat siswa telah presensi.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    color: 'purple',
    request: async () => {
      const result = await Notification.requestPermission()
      if (result !== 'granted') throw new Error('Ditolak')
    },
    permName: 'notifications',
    notSupported: !('Notification' in window),
  },
]

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-600',   ring: 'ring-blue-200',   btn: 'bg-blue-600 hover:bg-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-600',ring: 'ring-emerald-200',btn: 'bg-emerald-600 hover:bg-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-600', ring: 'ring-purple-200',  btn: 'bg-purple-600 hover:bg-purple-700',  badge: 'bg-purple-100 text-purple-700' },
}

// Panduan cara mengaktifkan di browser (jika ditolak)
function DeniedGuide({ perm }) {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

  const labelName = perm.key === 'camera' ? 'Kamera' : perm.key === 'geolocation' ? 'Lokasi / Location' : 'Notifikasi / Notifications'

  return (
    <div className="mt-4 space-y-3 text-left">
      <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl space-y-1">
        <p className="font-bold flex items-center gap-1.5">
          <span>💡</span> Tips Sangat Penting:
        </p>
        <p className="leading-relaxed">
          Gunakan browser <strong>Google Chrome</strong> (Android) atau <strong>Safari</strong> (iPhone). Browser bawaan HP (seperti Mi Browser, Vivo/Oppo Browser) atau membuka link langsung di dalam aplikasi WhatsApp seringkali memblokir akses lokasi/GPS.
        </p>
      </div>

      <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl text-center">
        ⛔ Izin diblokir. Aktifkan manual sesuai panduan di bawah ini:
      </p>

      {/* Android Chrome (browser biasa) */}
      {!isPWA && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <span>🤖</span> Android – Chrome / Browser
          </p>
          <ol className="space-y-3.5">
            <li className="flex gap-2.5 items-start text-xs text-slate-600">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
              <div className="space-y-1.5">
                <span>Klik lambang setelan di sebelah kiri nama domain alamat browser:</span>
                <div className="p-1.5 bg-slate-100 border border-slate-200 rounded-lg w-fit">
                  <img src="/chrome_tune_icon.png" className="h-5 object-contain" alt="Chrome Tune Icon" />
                </div>
              </div>
            </li>
            <li className="flex gap-2.5 items-start text-xs text-slate-600">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
              <span className="leading-relaxed">Pilih <strong>Izin / Permissions</strong>, lalu centang / aktifkan <strong>Lokasi (Location)</strong> dan <strong>Kamera</strong>.</span>
            </li>
            <li className="flex gap-2.5 items-start text-xs text-slate-600">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
              <span className="leading-relaxed">Buka opsi <strong>Notifikasi / Pemberitahuan</strong>.</span>
            </li>
            <li className="flex gap-2.5 items-start text-xs text-slate-600">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">4</span>
              <span className="leading-relaxed">Centang / aktifkan <strong>Izinkan Notifikasi (Allow notifications)</strong>.</span>
            </li>
            <li className="flex gap-2.5 items-start text-xs text-slate-650 border-t border-slate-200 pt-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">5</span>
              <span className="leading-relaxed">Klik <strong>Muat Ulang / Reload</strong> halaman, lalu klik <strong>"Coba Lagi"</strong>.</span>
            </li>
          </ol>
        </div>
      )}

      {/* Android PWA (sudah terinstall) */}
      {isPWA && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>📱</span> Android – Aplikasi Terinstal (PWA)
          </p>
          <ol className="space-y-2">
            {[
              <>Keluar dari aplikasi, lalu ke <strong>Layar Utama</strong> HP.</>,
              <><strong>Tekan lama</strong> ikon <strong>eBudiMulia</strong> hingga muncul menu.</>,
              <>Pilih <strong>"Info Aplikasi" / ⓘ</strong>.</>,
              <>Buka <strong>"Izin" / "Permissions"</strong>, aktifkan <strong>"{labelName}"</strong>.</>,
              <>Buka lagi aplikasi, tekan <strong>"Coba Lagi"</strong>.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2 items-start text-xs text-slate-600">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">{i+1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* iPhone / iOS */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <span>🍎</span> iPhone / iOS – Safari
        </p>
        <ol className="space-y-2">
          {[
            <>Buka <strong>Pengaturan (⚙️)</strong> di HP, scroll ke bawah cari <strong>Safari</strong>.</>,
            <>Buka <strong>"Kamera"</strong> atau <strong>"Lokasi"</strong> atau <strong>"Notifikasi"</strong>.</>,
            <>Ubah ke <strong>"Izinkan" / "Allow"</strong>.</>,
            <>Kembali ke browser Safari dan tekan <strong>"Coba Lagi"</strong>.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-2 items-start text-xs text-slate-600">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">{i+1}</span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default function PermissionOnboarding({ types = ['camera', 'geolocation', 'notifications'], onDone }) {
  const activePermissions = PERMISSIONS.filter(p => types.includes(p.key))

  // Cek apakah sudah pernah menyelesaikan onboarding
  const [phase, setPhase] = useState('intro') // 'intro' | 'requesting' | 'done'
  const [currentIdx, setCurrentIdx] = useState(0)
  const [statuses, setStatuses] = useState({}) // { camera: 'idle'|'granted'|'denied'|'requesting', ... }
  const [showDeniedGuide, setShowDeniedGuide] = useState(false)

  // Jika tidak ada izin yang diminta, langsung panggil onDone
  useEffect(() => {
    if (activePermissions.length === 0) {
      onDone()
    }
  }, [activePermissions])

  if (activePermissions.length === 0) return null

  const current = activePermissions[currentIdx]
  const c = current ? COLOR_MAP[current.color] : null

  const setStatus = (key, val) => setStatuses(prev => ({ ...prev, [key]: val }))

  const requestCurrent = async () => {
    if (!current) return
    setShowDeniedGuide(false)
    setStatus(current.key, 'requesting')
    try {
      await current.request()
      setStatus(current.key, 'granted')
      // Otomatis lanjut ke izin berikutnya setelah 900ms
      setTimeout(() => moveNext(), 900)
    } catch (e) {
      setStatus(current.key, 'denied')
      setShowDeniedGuide(true)
    }
  }

  const moveNext = () => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= activePermissions.length) {
      finishOnboarding()
    } else {
      setCurrentIdx(nextIdx)
      setShowDeniedGuide(false)
    }
  }

  const finishOnboarding = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setPhase('done')
    setTimeout(() => onDone(), 800)
  }

  const skipAll = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    onDone()
  }

  // ─── PHASE: INTRO ────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="fixed inset-0 z-[500] bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 w-full max-w-sm space-y-6 text-center">
          {/* Icon */}
          <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center mx-auto shadow-2xl ring-4 ring-indigo-500/30">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Izin Akses Perangkat</h1>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Aplikasi memerlukan beberapa izin agar fitur presensi dan notifikasi berjalan dengan baik.
            </p>
          </div>

          {/* Permission list preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 text-left">
            {activePermissions.map((p) => (
              <div key={p.key} className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${COLOR_MAP[p.color].bg} ${COLOR_MAP[p.color].text} flex items-center justify-center shrink-0`}>
                  {p.icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{p.label}</p>
                  <p className="text-[11px] text-slate-400 leading-tight">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setPhase('requesting')}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-indigo-900/50"
            >
              Lanjutkan & Aktifkan Izin →
            </button>
            <button
              onClick={skipAll}
              className="w-full py-2.5 text-slate-500 hover:text-slate-300 font-medium text-xs transition-colors"
            >
              Lewati untuk sekarang
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: DONE ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="fixed inset-0 z-[500] bg-indigo-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto animate-bounce shadow-xl">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-bold text-lg">Siap!</p>
          <p className="text-slate-400 text-sm">Membuka halaman login...</p>
        </div>
      </div>
    )
  }

  // ─── PHASE: REQUESTING ───────────────────────────────────────────────────────
  const currentStatus = statuses[current?.key] || 'idle'
  const allDone = currentIdx >= activePermissions.length

  return (
    <div className="fixed inset-0 z-[500] bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-white/10">
        <div className="flex gap-1.5">
          {activePermissions.map((p, i) => (
            <div
              key={p.key}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < currentIdx
                  ? 'bg-emerald-400 w-8'
                  : i === currentIdx
                  ? `w-8 ${statuses[p.key] === 'denied' ? 'bg-rose-400' : 'bg-indigo-400'}`
                  : 'bg-white/20 w-8'
              }`}
            />
          ))}
        </div>
        <span className="text-slate-400 text-xs ml-auto">{currentIdx + 1} / {activePermissions.length}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-sm mx-auto space-y-5">
          {/* Icon & Title */}
          <div className="text-center pt-4">
            <div className={`w-20 h-20 rounded-3xl ${c.bg} ${c.text} flex items-center justify-center mx-auto mb-4 shadow-lg ring-4 ${c.ring} ring-opacity-30`}>
              <div className="scale-150">{current.icon}</div>
            </div>
            <h2 className="text-xl font-black text-white">Izin {current.label}</h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">{current.desc}</p>
          </div>

          {/* Status indicator */}
          <div className="flex justify-center">
            {currentStatus === 'idle' && (
              <span className="px-4 py-1.5 rounded-full bg-white/10 text-slate-300 text-xs font-semibold border border-white/10">
                ⏳ Menunggu persetujuan...
              </span>
            )}
            {currentStatus === 'requesting' && (
              <span className="px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30 animate-pulse">
                🔄 Meminta izin...
              </span>
            )}
            {currentStatus === 'granted' && (
              <span className="px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
                ✅ Diizinkan! Lanjut...
              </span>
            )}
            {currentStatus === 'denied' && (
              <span className="px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-400/30">
                ❌ Izin ditolak / diblokir
              </span>
            )}
          </div>

          {/* Panduan jika ditolak */}
          {currentStatus === 'denied' && showDeniedGuide && (
            <div className="bg-white rounded-2xl p-4 shadow-2xl">
              <DeniedGuide perm={current} />
            </div>
          )}

          {/* Info tambahan untuk 'idle' */}
          {currentStatus === 'idle' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <p className="text-slate-300 text-xs leading-relaxed">
                Setelah Anda menekan tombol di bawah, browser akan menampilkan popup izin.
                Pilih <strong className="text-white">"Izinkan" / "Allow"</strong> untuk melanjutkan.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-400/20 text-amber-300 text-[11px] font-semibold px-3 py-2 rounded-xl">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Popup izin mungkin muncul di bagian atas layar
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="p-5 border-t border-white/10 space-y-2 max-w-sm mx-auto w-full">
        {currentStatus !== 'granted' && (
          <button
            onClick={requestCurrent}
            disabled={currentStatus === 'requesting'}
            className={`w-full py-4 ${c.btn} disabled:opacity-60 text-white font-bold rounded-2xl text-sm transition-all shadow-xl active:scale-[0.98]`}
          >
            {currentStatus === 'denied'
              ? `🔄 Coba Lagi – Aktifkan ${current.label}`
              : `Aktifkan ${current.label} Sekarang →`}
          </button>
        )}

        {/* Lewati izin ini */}
        {currentStatus !== 'requesting' && currentStatus !== 'granted' && (
          <button
            onClick={moveNext}
            className="w-full py-2.5 text-slate-500 hover:text-slate-300 font-medium text-xs transition-colors"
          >
            Lewati izin {current.label} →
          </button>
        )}

        {/* Selesai semuanya */}
        {currentStatus === 'denied' && (
          <button
            onClick={skipAll}
            className="w-full py-2 text-rose-400/70 hover:text-rose-300 font-medium text-xs transition-colors"
          >
            Lewati semua & lanjut ke login
          </button>
        )}
      </div>
    </div>
  )
}
