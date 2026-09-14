import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, Component, lazy, Suspense } from 'react'
import { supabase } from './supabaseClient'
import { showLocalNotif, isNotifGranted, initNativePushNotifications, requestNotifPermission } from './utils/pushNotif'
import { loadAccounts } from './utils/credentialStore'

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

// Error Boundary untuk menangkap error dan menampilkan pesan, bukan layar putih
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
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', background: '#fee2e2', minHeight: '100vh' }}>
          <h2 style={{ color: '#dc2626' }}>⚠️ Terjadi Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#991b1b', background: '#fff', padding: 12, borderRadius: 8 }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            style={{ marginTop: 12, padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Reload Aplikasi
          </button>
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

    // 1. Fetch Tema Warna
    const fetchTheme = async () => {
      const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'tema_warna').maybeSingle()
      if (data && data.setting_value) {
        document.documentElement.setAttribute('data-theme', data.setting_value)
      }
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
        // Hapus sesi lokal dan arahkan ke login jika tidak di halaman auth
        localStorage.removeItem('siswa_session')
        localStorage.removeItem('guru_session')
        localStorage.removeItem('orangtua_session')
        const path = window.location.pathname
        if (path !== '/' && path !== '/login' && path !== '/login-admin' && path !== '/presensi-tv' && path !== '/showcase-rekap-poin' && !path.startsWith('/validasi-kartu')) {
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
        <Suspense fallback={
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', gap: 12 }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Memuat halaman...</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard-orang-tua" element={<DashboardOrangTua />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/login-admin" element={<LoginAdmin />} />
            <Route path="/dashboard-guru" element={<DashboardGuru />} />
            <Route path="/impersonate" element={<Impersonate />} />
            <Route path="/presensi-tv" element={<PresensiTV />} />
            <Route path="/laporan-pengumuman/:typeId" element={<LaporanPengumuman />} />
            <Route path="/presensi-manual-siswa" element={<PresensiManualSiswa />} />
            <Route path="/presensi-susulan-siswa" element={<PresensiManualSiswa isSusulanMode={true} />} />
            <Route path="/showcase-rekap-poin" element={<ShowcaseRekapPoin />} />
            <Route path="/validasi-kartu" element={<ValidasiKartuPelajar />} />
            <Route path="/validasi-kartu/:nisn" element={<ValidasiKartuPelajar />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
