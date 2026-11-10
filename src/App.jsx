import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, Component, lazy, Suspense } from 'react'
import { registerPlugin, Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { supabase } from './supabaseClient'
import { showLocalNotif, isNotifGranted, initNativePushNotifications, requestNotifPermission } from './utils/pushNotif'
import { loadAccounts } from './utils/credentialStore'
import { processPresensiQueue } from './utils/presensiQueue'
import AppUpdateModal from './components/AppUpdateModal'
import SecurityInterventionModal from './components/SecurityInterventionModal'
import { AdminRoute, GuruRoute, StudentRoute, ParentRoute } from './components/ProtectedRoute'

const CbtLockTask = Capacitor.Plugins?.CbtLockTask || registerPlugin('CbtLockTask')

/**
 * Pengelola Global Mode Offline & Tombol Back Hardware Android:
 * 1. Menampilkan indikator Mode Offline dan menyinkronkan antrean presensi otomatis saat sinyal kembali.
 * 2. Mengatur perilaku tombol Back bawaan HP Android:
 *    - Menutup pop-up/modal yang sedang terbuka terlebih dahulu.
 *    - Mengembalikan dari sub-menu (Jadwal, Presensi, Kartu Pelajar, dll.) ke tab Beranda.
 *    - Meminta ketukan kedua dalam 2 detik sebelum benar-benar keluar dari aplikasi.
 */
function OfflineAndBackWatcher() {
  const location = useLocation()
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [backOnlineNotice, setBackOnlineNotice] = useState(false)
  const [exitToast, setExitToast] = useState(false)
  const lastBackPressRef = useRef(0)

  useEffect(() => {
    const onOffline = () => {
      setIsOffline(true)
      setBackOnlineNotice(false)
    }
    const onOnline = () => {
      setIsOffline(false)
      setBackOnlineNotice(true)
      processPresensiQueue().catch(() => {})
      setTimeout(() => setBackOnlineNotice(false), 3500)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let backListener = null
    try {
      backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
        const path = window.location.pathname || ''
        // Jangan intervensi tombol back saat ujian CBT berlangsung
        if (path.startsWith('/cbt/ujian')) return

        // 1. Cek apakah ada modal / pop-up (div.fixed.inset-0) yang sedang terbuka (kecuali layar kunci keamanan & dekorasi)
        const openModals = Array.from(document.querySelectorAll('div.fixed.inset-0'))
          .filter(el => {
            const cls = String(el.className || '')
            if (cls.includes('pointer-events-none')) return false
            if (cls.includes('z-[999999]') || cls.includes('z-[99999]') || cls.includes('z-[9999]')) return false
            if (el.offsetWidth === 0 || el.offsetHeight === 0) return false
            const style = window.getComputedStyle(el)
            if (style.pointerEvents === 'none') return false
            return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0
          })

        if (openModals.length > 0) {
          const topModal = openModals[openModals.length - 1]
          const searchScope = topModal.querySelectorAll('button').length > 0
            ? topModal
            : (topModal.parentElement || topModal)
          // Cari tombol tutup (✕ / Tutup / Batal) di dalam modal paling atas
          const buttons = Array.from(searchScope.querySelectorAll('button'))
          const closeBtn = buttons.find(b => {
            const txt = (b.textContent || '').trim().toLowerCase()
            return txt === '✕' || txt === 'x' || txt === 'tutup' || txt === 'batal' || txt === 'kembali'
          })
          if (closeBtn) {
            closeBtn.click()
            return
          }
          // Jika backdrop modal memiliki onClick langsung
          topModal.click()
          return
        }

        // 2. Kirim event ke Dashboard (Siswa / Ortu / Guru / Admin) untuk menutup sidebar mobile atau kembali ke tab Beranda
        const backEvent = new CustomEvent('ebm-hardware-back', { cancelable: true })
        const notCancelled = window.dispatchEvent(backEvent)
        if (!notCancelled) {
          // Sudah ditangani oleh Dashboard (misal kembali dari menu Jadwal ke Beranda)
          return
        }

        // 3. Jika berada di halaman pendukung selain halaman utama, kembali ke halaman sebelumnya
        const isRootDashboard =
          path === '/' ||
          path === '/login' ||
          path === '/dashboard' ||
          path === '/dashboard-orang-tua' ||
          path === '/dashboard-guru' ||
          path === '/admin'

        if (!isRootDashboard && canGoBack) {
          window.history.back()
          return
        }

        // 4. Konfirmasi tekan 2 kali untuk keluar aplikasi
        const now = Date.now()
        if (now - lastBackPressRef.current < 2200) {
          CapApp.exitApp()
        } else {
          lastBackPressRef.current = now
          setExitToast(true)
          setTimeout(() => setExitToast(false), 2200)
        }
      })
    } catch {}

    return () => {
      if (backListener) {
        Promise.resolve(backListener).then(h => h?.remove?.()).catch(() => {})
      }
    }
  }, [location.pathname])

  return (
    <>
      {isOffline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[99990] max-w-md w-[94%] bg-amber-600 text-white px-3.5 py-2 rounded-2xl shadow-lg border border-amber-400 flex items-center gap-2.5 text-xs font-bold animate-fade-in pointer-events-none">
          <span className="text-base shrink-0">📡</span>
          <span className="leading-snug">
            Mode Offline — Data tersimpan tetap dapat dibuka &amp; presensi akan disinkronkan otomatis saat sinyal kembali.
          </span>
        </div>
      )}
      {backOnlineNotice && !isOffline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[99990] max-w-sm w-[90%] bg-emerald-600 text-white px-3.5 py-2 rounded-2xl shadow-lg border border-emerald-400 flex items-center justify-center gap-2 text-xs font-bold animate-fade-in pointer-events-none">
          <span>✅</span>
          <span>Koneksi kembali online — Menyinkronkan data...</span>
        </div>
      )}
      {exitToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99995] bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold border border-slate-700 animate-fade-in pointer-events-none">
          Tekan kembali sekali lagi untuk keluar aplikasi
        </div>
      )}
    </>
  )
}

/**
 * Pengawas Keamanan Lock Task / AAC Global:
 * Memastikan mode terkunci (iOS AAC & Android Pin) HANYA aktif saat berada di halaman /cbt/ujian/:sesiId.
 * Jika pengguna berpindah ke Dashboard, Beranda, Login, dll, AAC langsung dimatikan seketika.
 * Juga menyediakan Emergency 5-Tap Release di pojok kiri atas layar di seluruh menu aplikasi.
 */
function CbtLockSafetyWatcher() {
  const location = useLocation()

  // 1. Matikan AAC / Lock Task setiap kali pengguna berada di luar rute ujian
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const isExamRoute = location.pathname.startsWith('/cbt/ujian')
    if (!isExamRoute) {
      CbtLockTask.stopLock().catch(() => {})
    }
  }, [location.pathname])

  // 2. Listener jika ada event lock aktif di luar rute ujian, langsung matikan seketika
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let handler = null
    try {
      if (CbtLockTask.addListener) {
        handler = CbtLockTask.addListener('cbtLockStateChange', (data) => {
          const isExamRoute = window.location.pathname.startsWith('/cbt/ujian')
          if (data?.locked && !isExamRoute) {
            console.warn('[SafetyWatcher] Terdeteksi AAC/LockTask aktif di luar ujian, mematikan paksa...')
            CbtLockTask.stopLock().catch(() => {})
          }
        })
      }
    } catch {}

    return () => {
      if (handler && handler.remove) handler.remove()
    }
  }, [])

  return null
}

// Route-based Code Splitting (menghemat ukuran unduh awal aplikasi hingga 80%)
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Admin = lazy(() => import('./pages/Admin'))
const LoginAdmin = lazy(() => import('./pages/LoginAdmin'))
const DashboardGuru = lazy(() => import('./pages/DashboardGuru'))
const DashboardOrangTua = lazy(() => import('./pages/DashboardOrangTua'))
const Impersonate = lazy(() => import('./pages/Impersonate'))
const PresensiTV = lazy(() => import('./pages/PresensiTV'))
const LaporanPengumuman = lazy(() => import('./pages/LaporanPengumuman'))
const PresensiManualSiswa = lazy(() => import('./pages/PresensiManualSiswa'))
const ShowcaseRekapPoin = lazy(() => import('./pages/ShowcaseRekapPoin'))
const ValidasiKartuPelajar = lazy(() => import('./pages/ValidasiKartuPelajar'))
const CbtUjianSiswaPage = lazy(() => import('./pages/CbtUjianSiswaPage'))
const RaporDeskripsiTpPage = lazy(() => import('./pages/RaporDeskripsiTpPage'))

/**
 * Root Router Cerdas:
 * Mengeliminasi lag/delay saat buka aplikasi.
 * Jika pengguna sudah login, langsung alihkan ke Dashboard tanpa perlu
 * mendownload & merender halaman Login terlebih dahulu.
 */
function RootRouter() {
  try {
    const urlParams = new URLSearchParams(window.location.search)
    // Jika ada parameter login khusus (misal link WhatsApp ?u=...&p=... atau tambah akun)
    if (
      urlParams.get('u') ||
      urlParams.get('p') ||
      urlParams.get('add_account') === 'true' ||
      urlParams.get('switch') === 'true'
    ) {
      return <Login />
    }

    if (localStorage.getItem('siswa_session')) {
      return <Navigate to="/dashboard" replace />
    }
    if (localStorage.getItem('guru_session')) {
      return <Navigate to="/dashboard-guru" replace />
    }
    if (localStorage.getItem('orangtua_session')) {
      return <Navigate to="/dashboard-orang-tua" replace />
    }
  } catch {}

  return <Login />
}

// Error Boundary untuk menangkap error dan memulihkan aplikasi secara anggun
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary]', error, errorInfo)
  }
  handleResetAndReload = () => {
    try {
      sessionStorage.clear()
    } catch {}
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }
  render() {
    if (this.state.hasError) {
      const errStr = this.state.error?.toString() || ''
      const isTranslateError = errStr.includes('removeChild') || errStr.includes('not a child') || errStr.includes('NotFoundError')

      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#fef2f2', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 640, width: '100%', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ color: '#b91c1c', margin: '0 0 8px 0', fontSize: 20, fontWeight: 800 }}>
              {isTranslateError ? 'Deteksi Penerjemah Otomatis Peramban' : 'Terjadi Gangguan pada Tampilan'}
            </h2>
            <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 16px 0', lineHeight: 1.5 }}>
              {isTranslateError
                ? 'Fitur Google Translate di peramban sempat memodifikasi elemen tampilan sistem. Anda TIDAK PERLU clear history/cache manual, cukup klik tombol di bawah untuk langsung masuk kembali.'
                : 'Aplikasi mendeteksi gangguan sementara pada sesi ini. Silakan muat ulang untuk memulihkan.'}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={this.handleResetAndReload}
                style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}
              >
                Muat Ulang &amp; Masuk Kembali
              </button>
            </div>
            {errStr && (
              <details style={{ marginTop: 16, textAlign: 'left' }}>
                <summary style={{ fontSize: 11, color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}>
                  Lihat Detail Teknis Gangguan
                </summary>
                <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, color: '#991b1b', background: '#fef2f2', padding: 10, borderRadius: 8, maxHeight: 150, overflow: 'auto' }}>
                  {errStr}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


function App() {
  useEffect(() => {
    // Auto redirect HTTP -> HTTPS (Required for Geolocation and Camera APIs)
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      window.location.href = window.location.href.replace('http:', 'https:')
      return
    }

    // 1. Fetch & Cache Tema Warna (Instan dari localStorage, sinkronisasi background)
    const cachedTheme = localStorage.getItem('ebm_tema_warna')
    if (cachedTheme) {
      document.documentElement.setAttribute('data-theme', cachedTheme)
    }
    const fetchTheme = async () => {
      try {
        const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'tema_warna').maybeSingle()
        if (data && data.setting_value) {
          if (data.setting_value !== cachedTheme) {
            document.documentElement.setAttribute('data-theme', data.setting_value)
            localStorage.setItem('ebm_tema_warna', data.setting_value)
          }
        }
      } catch {}
    }
    fetchTheme()

    // Minta izin notifikasi sejak awal aplikasi dibuka (Android 13+ status bar tray)
    requestNotifPermission().catch(() => {})

    // 2. Pemeliharaan Sesi Auth & Auto-Refresh Token Supabase secara Global
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Normal token refresh by Supabase client
      }
      if (event === 'SIGNED_OUT') {
        // Jangan pernah menghapus sesi lokal jika perangkat sedang offline (tanpa kuota/sinyal)
        if (typeof navigator !== 'undefined' && navigator.onLine === false && !window.__ebudimuliaExplicitLogout) {
          return
        }
        // Hapus sesi lokal dan arahkan ke login jika tidak di halaman auth
        localStorage.removeItem('siswa_session')
        localStorage.removeItem('guru_session')
        localStorage.removeItem('orangtua_session')
        const path = window.location.pathname
        if (path !== '/' && path !== '/login' && path !== '/login-admin' && path !== '/presensi-tv' && path !== '/showcase-rekap-poin' && !path.startsWith('/validasi-kartu') && !path.startsWith('/cbt/ujian')) {
          window.location.href = '/'
        }
      }
    })

    // 3. Multi-Account Realtime Push Notification Listener
    // Mendengarkan notifikasi presensi untuk SEMUA akun/anak yang tersimpan di HP ini sekaligus
    const channels = []
    try {
      // loadAccounts() membaca dari credentialStore — password sudah de-obfuscate, tapi kita tidak butuhnya di sini
      const savedAccounts = loadAccounts()
      
      const targetNisns = new Set()
      savedAccounts.forEach(acc => {
        if (acc.username) {
          const clean = acc.username.split('@')[0].replace('ebm.ortu_', '').replace('ebmsiswa.', '')
          targetNisns.add(clean)
        }
        if (acc.id) {
          const cleanId = String(acc.id).replace('siswa_', '').replace('ortu_', '')
          targetNisns.add(cleanId)
        }
      })

      // Inisialisasi Android Native Push Notification (FCM / Google Services)
      const storedOrtu = localStorage.getItem('orangtua_session')
      const storedSiswa = localStorage.getItem('siswa_session')
      if (storedOrtu) {
        try {
          const ortuObj = JSON.parse(storedOrtu)
          if (ortuObj?.nisn) {
            targetNisns.add(String(ortuObj.nisn))
            initNativePushNotifications({ nisn: ortuObj.nisn, role: 'Orang Tua' })
          }
        } catch {}
      } else if (storedSiswa) {
        try {
          const siswaObj = JSON.parse(storedSiswa)
          if (siswaObj?.nisn) {
            targetNisns.add(String(siswaObj.nisn))
            initNativePushNotifications({ nisn: siswaObj.nisn, role: 'Siswa' })
          }
        } catch {}
      } else {
        initNativePushNotifications({})
      }

      targetNisns.forEach(nisn => {
        if (!nisn) return
        const ch = supabase.channel(`app-notif-${nisn}`, { config: { broadcast: { self: true } } })
          .on('broadcast', { event: 'presensi_update' }, ({ payload }) => {
            if (isNotifGranted()) {
              const lokasiText = payload.lokasi ? ` Lokasi: ${payload.lokasi}` : ""
              const body = `${payload.namaLengkap} - ${payload.tipeLabel} pukul ${payload.waktu} WIB (${payload.statusLabel}).${lokasiText}`
              showLocalNotif(`[Orang Tua] Presensi ${payload.tipeLabel} Siswa (${payload.statusLabel} - ${payload.waktu} WIB)`, body, { 
                tag: `presensi-ortu-${nisn}-${payload.tipe}`,
                image: payload.selfieUrl || undefined,
                summaryText: body,
                data: { url: '/dashboard-orang-tua?menu=PRESENSI', targetMenu: 'PRESENSI', role: 'Orang Tua', nisn }
              })
            }
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'presensi_harian', filter: `siswa_nisn=eq.${nisn}` }, (payload) => {
            const row = payload.new
            if (!row) return
            const tipeLabel = row.tipe === 'pulang' ? 'Pulang' : 'Masuk'
            const statusLabel = row.status === 'H' ? 'Hadir' : row.status === 'T' ? 'Terlambat' : row.status === 'P' ? 'Pulang' : row.status
            if (isNotifGranted()) {
              const lokasiText = row.keterangan ? ` Lokasi: ${row.keterangan}` : ""
              const body = `Siswa (${nisn}) - ${tipeLabel} pukul ${row.waktu} WIB (${statusLabel}).${lokasiText}`
              showLocalNotif(`[Orang Tua] Presensi ${tipeLabel} Siswa (${statusLabel} - ${row.waktu} WIB)`, body, { 
                tag: `presensi-ortu-${nisn}-${row.tipe}`,
                image: row.selfie_url || undefined,
                summaryText: body,
                data: { url: '/dashboard-orang-tua?menu=PRESENSI', targetMenu: 'PRESENSI', role: 'Orang Tua', nisn }
              })
            }
          })
          .on('broadcast', { event: 'pengajuan_poin_update' }, ({ payload }) => {
            if (isNotifGranted()) {
              const baseJudul = payload.judul || 'Status Pengajuan Poin'
              const formattedJudul = baseJudul.startsWith('[Siswa]') ? baseJudul : `[Siswa] ${baseJudul}`
              showLocalNotif(formattedJudul, payload.pesan || 'Ada pembaruan status pengajuan poin Anda.', { 
                tag: `pengajuan-${payload.status}-${nisn}`,
                data: { url: '/dashboard?menu=AJUKAN_POIN&tab=riwayat', targetMenu: 'AJUKAN_POIN', targetTab: 'riwayat', role: 'Siswa', nisn }
              })
            }
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifikasi', filter: `target_nisn=eq.${nisn}` }, (payload) => {
            const row = payload.new
            if (!row) return
            // Abaikan tipe 'presensi' agar siswa tidak menerima notifikasi berulang (karena siswa sudah mendapat konfirmasi langsung)
            if (row.tipe === 'presensi' || row.judul?.toLowerCase().includes('presensi')) return
            if (isNotifGranted()) {
              const baseJudul = row.judul || 'Notifikasi'
              const formattedJudul = (baseJudul.startsWith('[Siswa]') || baseJudul.startsWith('[Orang Tua]')) ? baseJudul : `[Siswa] ${baseJudul}`
              showLocalNotif(formattedJudul, row.pesan, { 
                tag: `notif-${row.id}`,
                data: { 
                  url: row.tipe === 'poin' || row.judul?.toLowerCase().includes('pengajuan') ? '/dashboard?menu=AJUKAN_POIN&tab=riwayat' : '/dashboard', 
                  targetMenu: row.tipe === 'poin' || row.judul?.toLowerCase().includes('pengajuan') ? 'AJUKAN_POIN' : undefined, 
                  targetTab: 'riwayat', 
                  role: 'Siswa',
                  nisn
                }
              })
            }
          })
          .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'tabungan_transaksi', 
            filter: `siswa_nisn=eq.${nisn}` 
          }, (payload) => {
            const row = payload.new
            if (!row) return
            if (row.status_verifikasi === 'VERIFIED') {
              if (payload.old && payload.old.status_verifikasi === 'VERIFIED') return
              
              const isSetor = row.tipe === 'SETOR'
              const nominal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.jumlah)
              const saldo = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(row.saldo_akhir)
              
              const title = isSetor ? '[Orang Tua] Setoran Tabungan Berhasil' : '[Orang Tua] Penarikan Tabungan Berhasil'
              const body = isSetor
                ? `Setoran tabungan sebesar ${nominal} telah diverifikasi. Total tabungan: ${saldo}.`
                : `Penarikan tabungan sebesar ${nominal} berhasil. Total tabungan: ${saldo}.`
                
              if (isNotifGranted()) {
                showLocalNotif(title, body, {
                  tag: `tabungan-${row.id}-${Date.now()}`,
                  summaryText: body,
                  data: { url: '/dashboard-orang-tua?menu=TABUNGAN', targetMenu: 'TABUNGAN', role: 'Orang Tua', nisn }
                })
              }
            }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pengajuan_poin_positif', filter: `nisn=eq.${nisn}` }, (payload) => {
            const row = payload.new
            if (!row) return
            const oldRow = payload.old
            if (oldRow && oldRow.status === row.status) return

            let title = '[Siswa] Pembaruan Status Pengajuan Poin'
            let body = `Pengajuan "${row.jenis || 'Poin Positif'}" Anda telah diperbarui.`

            if (row.status === 'disetujui') {
              title = `[Siswa] Pengajuan Poin Disetujui (+${row.poin_diajukan} Poin)`
              body = `Selamat! Pengajuan "${row.jenis || 'Prestasi'}" Anda telah disetujui.`
            } else if (row.status === 'revisi') {
              title = '[Siswa] Pengajuan Poin Perlu Revisi'
              body = `Pengajuan "${row.jenis || 'Kegiatan'}" memerlukan perbaikan bukti: ${row.catatan_reviewer || 'Silakan cek menu Pengajuan Poin.'}`
            } else if (row.status === 'ditolak') {
              title = '[Siswa] Pengajuan Poin Ditolak'
              body = `Pengajuan "${row.jenis || 'Kegiatan'}" belum dapat disetujui: ${row.catatan_reviewer || '-'}`
            }

            if (isNotifGranted()) {
              showLocalNotif(title, body, {
                tag: `pengajuan-${row.id}-${row.status}`,
                data: { url: '/dashboard?menu=AJUKAN_POIN&tab=riwayat', targetMenu: 'AJUKAN_POIN', targetTab: 'riwayat', role: 'Siswa', nisn }
              })
            }
          })
          .subscribe()
        channels.push(ch)
      })
    } catch (e) {
      console.warn('Error setting up multi-account listener:', e)
    }

    // 4. Handle Notification Tap / Click Action Navigation
    let notifActionListener = null
    const setupNotifClick = async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        notifActionListener = await LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
          try {
            const extra = notificationAction.notification?.extra
            const targetRole = extra?.role
            const targetNisn = extra?.nisn
            if (targetRole) {
              try {
                const { switchToRoleAccount } = await import('./utils/credentialStore')
                await switchToRoleAccount(targetRole, targetNisn)
              } catch (e) {
                console.warn('[LocalNotif] Auto-switch error:', e)
              }
            }

            let targetUrl = extra?.url
            if (!targetUrl) {
              if (extra?.targetMenu === 'AJUKAN_POIN') {
                targetUrl = '/dashboard?menu=AJUKAN_POIN&tab=riwayat'
              } else if (extra?.targetMenu === 'PRESENSI') {
                targetUrl = extra?.role === 'Orang Tua' ? '/dashboard-orang-tua?menu=PRESENSI' : '/dashboard?menu=PRESENSI'
              } else if (extra?.targetMenu === 'POIN') {
                targetUrl = '/dashboard?menu=POIN'
              }
            }
            if (targetUrl) {
              window.location.href = targetUrl
            }
          } catch (e) {
            console.warn('Error navigating on notif click:', e)
          }
        })
      } catch (err) {
        // Not on native
      }
    }
    setupNotifClick()

    return () => {
      subscription.unsubscribe()
      channels.forEach(ch => supabase.removeChannel(ch))
      if (notifActionListener?.remove) notifActionListener.remove()
    }
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CbtLockSafetyWatcher />
        <OfflineAndBackWatcher />
        <AppUpdateModal />
        <SecurityInterventionModal />
        <Suspense fallback={
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 12 }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Memuat halaman...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
          <Routes>
            <Route path="/" element={<RootRouter />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<StudentRoute><Dashboard /></StudentRoute>} />
            <Route path="/dashboard-orang-tua" element={<ParentRoute><DashboardOrangTua /></ParentRoute>} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/login-admin" element={<LoginAdmin />} />
            <Route path="/dashboard-guru" element={<GuruRoute><DashboardGuru /></GuruRoute>} />
            <Route path="/impersonate" element={<Impersonate />} />
            <Route path="/presensi-tv" element={<PresensiTV />} />
            <Route path="/laporan-pengumuman/:typeId" element={<LaporanPengumuman />} />
            <Route path="/presensi-manual-siswa" element={<PresensiManualSiswa />} />
            <Route path="/presensi-susulan-siswa" element={<PresensiManualSiswa isSusulanMode={true} />} />
            <Route path="/showcase-rekap-poin" element={<ShowcaseRekapPoin />} />
            <Route path="/validasi-kartu" element={<ValidasiKartuPelajar />} />
            <Route path="/validasi-kartu/:nisn" element={<ValidasiKartuPelajar />} />
            <Route path="/rapor/deskripsi-tp/:nisn" element={<RaporDeskripsiTpPage />} />
            <Route path="/cbt/ujian/:sesiId" element={<CbtUjianSiswaPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
