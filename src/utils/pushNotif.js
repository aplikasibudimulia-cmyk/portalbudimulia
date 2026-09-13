// utils/pushNotif.js
// Utility untuk registrasi Service Worker, Web Push, dan Android Native Local Notifications

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../supabaseClient'

const SW_PATH = '/sw.js'

// PENTING: Android tidak mengizinkan upgrade importance channel yang sudah ada.
// Gunakan channel ID ebudimulia_presensi_v5 yang diselaraskan dengan native Android MainActivity.
const CHANNEL_ID = 'ebudimulia_presensi_v5'

let isChannelInitialized = false

/**
 * Inisialisasi Android Notification Channel (Importance High agar muncul di status bar / heads-up)
 */
export async function initNotificationChannels() {
  if (isChannelInitialized) return
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[Notif] Ensuring notification channel:', CHANNEL_ID)
      // Bersihkan channel versi lama
      await LocalNotifications.deleteChannel({ id: 'ebudimulia-notif-v1' }).catch(() => {})
      await LocalNotifications.deleteChannel({ id: 'ebudimulia-notif-v2' }).catch(() => {})
      await LocalNotifications.deleteChannel({ id: 'ebudimulia-notif-v3' }).catch(() => {})
      await LocalNotifications.deleteChannel({ id: 'ebudimulia-notif-v4' }).catch(() => {})

      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'eBudiMulia Presensi & Pengumuman',
        description: 'Notifikasi kehadiran presensi dan pengumuman sekolah',
        importance: 5, // IMPORTANCE_HIGH (5) -> heads up banner & status bar
        visibility: 1, // VISIBILITY_PUBLIC (1)
        vibration: true,
        lights: true,
        lightColor: '#4F46E5',
        // PENTING: Jangan kirim sound: 'default' karena Capacitor Android mencari file res/raw/default.
        // Dikosongkan agar Android menggunakan ringtone notifikasi bawaan sistem secara otomatis!
      })
      isChannelInitialized = true
      console.log('[Notif] Channel created successfully:', CHANNEL_ID)
    } catch (e) {
      console.warn('[Notif] Error creating notification channel:', e)
    }
  }
}

/**
 * Register service worker dan minta izin notifikasi.
 * Return { registration, permission } atau null jika tidak didukung.
 */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null

  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' })
    // Force checking for updates from the server
    reg.update().catch(() => {})
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    const isSslError = err?.name === 'SecurityError' || err?.message?.includes('SSL certificate') || err?.message?.includes('SecurityError')
    if (isSslError) {
      console.info('[SW] ServiceWorker registrasi dilewati (SSL certificate local/untrusted):', err.message)
    } else {
      console.warn('[SW] Gagal register:', err)
    }
    return null
  }
}

// Utility to convert VAPID base64 string to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Subscribe ke Web Push Notifications.
 * Return object subscription atau null.
 */
export async function subscribeToPushNotification() {
  const reg = await registerSW()
  if (!reg) return null
  
  if (!('pushManager' in reg)) return null

  try {
    const existingSub = await reg.pushManager.getSubscription()
    if (existingSub) return existingSub

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!publicKey) throw new Error('VITE_VAPID_PUBLIC_KEY tidak ditemukan')

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })
    return sub
  } catch (err) {
    console.warn('[SW] Gagal subscribe Web Push:', err)
    return null
  }
}

/**
 * Minta izin notifikasi dari user (Mendukung Android Native & Web Browser).
 * Return 'granted' | 'denied' | 'default'
 */
export async function requestNotifPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      await initNotificationChannels()
      const status = await LocalNotifications.requestPermissions()
      console.log('[Native Notif] Permission status:', JSON.stringify(status))
      return status.display === 'granted' ? 'granted' : 'denied'
    } catch (e) {
      console.warn('[Native Notif] Request permission error:', e)
    }
  }

  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

// In-memory cache untuk mencegah notifikasi ganda/spam dalam hitungan milidetik (misal double-click submit)
const recentNotifCache = new Map()

export function clearRecentNotifCache() {
  recentNotifCache.clear()
}

export async function clearPresensiNotif(nisn) {
  recentNotifCache.clear()
  if (Capacitor.isNativePlatform() && nisn) {
    try {
      const idMasuk = getCleanTagId(`presensi-siswa-${nisn}-masuk`)
      const idPulang = getCleanTagId(`presensi-siswa-${nisn}-pulang`)
      const idOrtuMasuk = getCleanTagId(`presensi-ortu-${nisn}-masuk`)
      const idOrtuPulang = getCleanTagId(`presensi-ortu-${nisn}-pulang`)
      await LocalNotifications.cancel({
        notifications: [{ id: idMasuk }, { id: idPulang }, { id: idOrtuMasuk }, { id: idOrtuPulang }]
      }).catch(() => {})
    } catch (e) {
      console.warn('[clearPresensiNotif] Error cancelling native notif:', e)
    }
  }
}

function getCleanTagId(str) {
  if (!str) return Math.floor(Math.random() * 800000) + 100000
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 800000) + 100000
}

/**
 * Tampilkan notifikasi ke Android System Notification Tray & Web Notification.
 * @param {string} title
 * @param {string} body
 * @param {object} options - tag, icon, image, data
 */
export async function showLocalNotif(title, body, options = {}) {
  console.log('[showLocalNotif] Called with:', { title, body: body?.substring(0, 50), isNative: Capacitor.isNativePlatform() })
  
  // Deduplikasi kilat: jika notifikasi yang sama (tag atau title) dipanggil dalam 600ms terakhir (anti double-click cepat)
  const dedupeKey = options.tag ? `${options.tag}_${title}` : `${title}_${(body || '').slice(0, 30)}`
  const now = Date.now()
  if (recentNotifCache.has(dedupeKey)) {
    const lastTime = recentNotifCache.get(dedupeKey)
    if (now - lastTime < 600) {
      console.log('[showLocalNotif] ⚡ Duplikat notifikasi dicegah (dalam 600ms):', dedupeKey)
      return
    }
  }
  recentNotifCache.set(dedupeKey, now)
  if (recentNotifCache.size > 50) {
    for (const [k, v] of recentNotifCache.entries()) {
      if (now - v > 10000) recentNotifCache.delete(k)
    }
  }

  // 1. Android Native Notification (Capacitor) -> Muncul di Status Bar & Tray Notifikasi HP
  if (Capacitor.isNativePlatform()) {
    try {
      await initNotificationChannels()
      
      // Periksa permission terlebih dahulu
      const permCheck = await LocalNotifications.checkPermissions()
      console.log('[showLocalNotif] Permission check:', JSON.stringify(permCheck))
      
      if (permCheck.display !== 'granted') {
        console.warn('[showLocalNotif] Permission NOT granted, requesting...')
        const reqResult = await LocalNotifications.requestPermissions()
        console.log('[showLocalNotif] Permission request result:', JSON.stringify(reqResult))
        if (reqResult.display !== 'granted') {
          console.error('[showLocalNotif] Permission DENIED by user. Cannot show notification.')
          return
        }
      }

      // Gunakan ID deterministik berdasarkan tag agar event yang sama merefresh kartu notifikasi
      const notifId = options.id || (options.tag ? getCleanTagId(options.tag) : Math.floor(Math.random() * 800000) + 100000)
      
      // Batalkan notifikasi lama dengan ID yang sama agar Android memicu heads-up banner baru
      await LocalNotifications.cancel({ notifications: [{ id: notifId }] }).catch(() => {})

      const notifPayload = {
        title: title || 'eBudiMulia',
        body: body || '',
        largeBody: body || '',
        summaryText: title || 'Presensi Siswa',
        id: notifId,
        channelId: CHANNEL_ID,
        smallIcon: 'ic_stat_logo',
        iconColor: '#4F46E5',
        isExactNotification: false,
        extra: {
          targetMenu: 'PRESENSI',
          url: options.data?.url || (options.tag?.includes('ortu') ? '/dashboard-orang-tua?menu=PRESENSI' : '/dashboard?menu=PRESENSI'),
          imageUrl: options.image || undefined,
          ...options.data
        },
        // Attachments untuk menampilkan foto siswa di kartu notifikasi Android (BigPictureStyle)
        attachments: options.image ? [{ id: 'selfie', url: options.image }] : undefined,
      }

      console.log('[showLocalNotif] Scheduling notification:', JSON.stringify(notifPayload))
      
      try {
        const result = await LocalNotifications.schedule({
          notifications: [notifPayload]
        })
        console.log('[showLocalNotif] ✅ Schedule result:', JSON.stringify(result))
      } catch (scheduleErr) {
        console.warn('[showLocalNotif] Schedule with attachments failed, retrying without attachments:', scheduleErr)
        delete notifPayload.attachments
        const fallbackResult = await LocalNotifications.schedule({
          notifications: [notifPayload]
        })
        console.log('[showLocalNotif] ✅ Fallback schedule result:', JSON.stringify(fallbackResult))
      }
      return
    } catch (err) {
      console.error('[showLocalNotif] ❌ GAGAL schedule native local notification:', err, JSON.stringify(err))
    }
  }

  // 2. Web Browser (Desktop Mac/Windows & Mobile Web)
  if (!('Notification' in window)) {
    console.log('[showLocalNotif] Browser does not support Notification API')
    return
  }

  if (Notification.permission !== 'granted') {
    console.log('[showLocalNotif] Web notification permission is:', Notification.permission)
    return
  }

  // Generate tag unik dengan timestamp agar OS/browser tidak men-suppress banner ketika user mencoba berulang kali
  const uniqueTag = options.tag ? `${options.tag}_${Date.now()}` : `notif_${Date.now()}`
  const webPayload = {
    body: body || '',
    icon: options.icon || '/logo.png',
    badge: '/logo.png',
    image: options.image || undefined,
    tag: uniqueTag,
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: options.data || {},
  }

  // Metode A: Langsung buat new Notification() di browser (Instan 0ms delay, tidak menunggu ServiceWorker)
  try {
    const notif = new Notification(title || 'eBudiMulia', webPayload)
    notif.onclick = () => {
      window.focus()
      if (options.data?.url) {
        window.location.href = options.data.url
      }
      notif.close()
    }
    console.log('[showLocalNotif] ✅ Web notification ditampilkan langsung via new Notification() (0ms)')
    return
  } catch (directErr) {
    console.warn('[showLocalNotif] Direct Notification failed, mencoba ServiceWorker registration:', directErr)
  }

  // Metode B: Fallback ke ServiceWorker registration jika direct constructor dilarang (misal di beberapa browser mobile)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout (500ms)')), 500))
      ])
      if (reg?.showNotification) {
        await reg.showNotification(title || 'eBudiMulia', webPayload)
        console.log('[showLocalNotif] ✅ Web notification ditampilkan via ServiceWorker registration')
      }
    } catch (swErr) {
      console.warn('[showLocalNotif] ServiceWorker showNotification fallback gagal:', swErr)
    }
  }
}

/**
 * Cek apakah notifikasi sudah diizinkan
 */
export function isNotifGranted() {
  if (Capacitor.isNativePlatform()) {
    // Di native, selalu return true agar showLocalNotif dipanggil,
    // dan showLocalNotif sendiri yang akan check + request permission
    return true
  }
  return 'Notification' in window && Notification.permission === 'granted'
}

/**
 * Dispatcher Notifikasi Ganda (Dual-Notification System)
 */
export async function dispatchDualNotification({
  title,
  body,
  siswaData = null,
  options = {}
}) {
  try {
    showLocalNotif(title, body, options)
  } catch (e) {
    console.warn('[DualNotif] In-App Notif Error:', e)
  }

  if (siswaData?.nisn) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (supabaseUrl && supabaseAnonKey) {
        fetch(`${supabaseUrl}/functions/v1/line-notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({
            nisn: siswaData.nisn,
            nama: siswaData.nama,
            kelas: siswaData.kelas,
            status: siswaData.status,
            waktu: siswaData.waktu,
            tipe: siswaData.tipe,
            fotoUrl: siswaData.fotoUrl,
            keterangan: siswaData.keterangan || '-'
          }),
        }).catch(err => console.warn('[DualNotif] LINE Notify Fetch Error:', err))
      }
    } catch (e) {
      console.warn('[DualNotif] LINE Notif Error:', e)
    }
  }
}

/**
 * Inisialisasi izin notifikasi saat pengguna membuka aplikasi
 */
export async function requestAllInitialPermissions() {
  const results = { notif: false, location: false, camera: false }
  
  // Hanya minta izin Notifikasi saat aplikasi pertama kali dibuka
  // Izin Kamera & Lokasi diminta on-demand saat user mengakses fitur presensi / QR scanner
  try {
    const notifStatus = await requestNotifPermission()
    results.notif = notifStatus === 'granted'
  } catch (e) {
    console.warn('[Perms] Notif request error:', e)
  }

  return results
}

/**
 * Inisialisasi Android Native Push Notification (FCM / Google Services)
 * Mendaftarkan FCM device token ke Supabase agar server bisa kirim notifikasi saat aplikasi mati.
 */
export async function initNativePushNotifications(userData = {}) {
  if (!Capacitor.isNativePlatform()) return null

  try {
    // 1. Pastikan channel sudah dibuat
    await initNotificationChannels()

    // 2. Cek izin push notification (termasuk Android 13+ prompt-with-rationale)
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive !== 'granted') {
      permStatus = await PushNotifications.requestPermissions()
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[FCM Push] Permission not granted:', permStatus)
      return null
    }

    // 3. Register ke Google FCM
    await PushNotifications.register()

    // 4. Listen token FCM
    PushNotifications.removeAllListeners()

    PushNotifications.addListener('registration', async (token) => {
      console.log('[FCM Push] ✅ FCM Token Registered:', token.value)
      if (token?.value) {
        localStorage.setItem('ebudimulia_fcm_token', token.value)
        await syncMultiAccountPushTokens(token.value, userData)
      }
    })

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[FCM Push] ❌ Error on registration:', JSON.stringify(error))
    })

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[FCM Push] 📩 Push notification received foreground:', notification)
      // Tampilkan notifikasi di layar usap jika aplikasi sedang aktif di latar depan
      const notifTitle = notification.title || notification.notification?.title || notification.data?.title || 'eBudiMulia'
      const notifBody = notification.body || notification.notification?.body || notification.data?.body || ''
      const notifImage = notification.notification?.image || notification.data?.imageUrl || notification.data?.image || undefined
      const notifData = { ...(notification.data || {}) }
      if (notifData.targetMenu === 'AJUKAN_POIN' && !notifData.url) {
        notifData.url = '/dashboard?menu=AJUKAN_POIN&tab=riwayat'
        notifData.targetTab = 'riwayat'
      }
      showLocalNotif(notifTitle, notifBody, {
        image: notifImage,
        tag: notifData.tag || `fcm-${notifData.role || ''}-${notifData.nisn || ''}-${notifData.targetMenu || ''}`,
        data: notifData,
        summaryText: notifBody
      })
    })

    PushNotifications.addListener('pushNotificationActionPerformed', async (notificationAction) => {
      console.log('[FCM Push] 👆 Push action performed:', notificationAction)
      const data = notificationAction.notification?.data
      const targetRole = data?.role
      const targetNisn = data?.nisn
      if (targetRole) {
        try {
          const { switchToRoleAccount } = await import('./credentialStore')
          await switchToRoleAccount(targetRole, targetNisn)
        } catch (e) {
          console.warn('[FCM Push] Auto-switch error:', e)
        }
      }

      let targetUrl = data?.url
      if (!targetUrl) {
        if (data?.targetMenu === 'AJUKAN_POIN') {
          targetUrl = '/dashboard?menu=AJUKAN_POIN&tab=riwayat'
        } else if (data?.targetMenu === 'PRESENSI') {
          targetUrl = (targetRole === 'Orang Tua' || userData?.role === 'Orang Tua') ? '/dashboard-orang-tua?menu=PRESENSI' : '/dashboard?menu=PRESENSI'
        } else if (data?.targetMenu === 'POIN') {
          targetUrl = '/dashboard?menu=POIN'
        } else {
          targetUrl = (targetRole === 'Orang Tua' || userData?.role === 'Orang Tua') ? '/dashboard-orang-tua' : '/dashboard'
        }
      }
      if (targetUrl) {
        window.location.href = targetUrl
      }
    })

  } catch (err) {
    console.error('[FCM Push] Init error:', err)
  }
}

/**
 * Sinkronisasi token FCM untuk SEMUA akun yang tersimpan di perangkat ini (Multi-Account).
 * Memastikan semua akun (Siswa, Orang Tua, atau multi anak) tetap menerima push notification.
 */
export async function syncMultiAccountPushTokens(tokenValue = null, currentAccount = {}) {
  if (!Capacitor.isNativePlatform()) return
  const token = tokenValue || localStorage.getItem('ebudimulia_fcm_token')
  if (!token) return

  try {
    const { loadAccounts } = await import('./credentialStore')
    const saved = loadAccounts() || []
    
    // Kumpulkan semua akun unik di perangkat ini
    const accountList = []

    if (currentAccount?.nisn) {
      accountList.push({
        nisn: String(currentAccount.nisn),
        role: currentAccount.role || 'Siswa'
      })
    }

    // Periksa session aktif di localStorage
    try {
      const storedOrtu = localStorage.getItem('orangtua_session')
      if (storedOrtu) {
        const obj = JSON.parse(storedOrtu)
        if (obj?.nisn) accountList.push({ nisn: String(obj.nisn), role: 'Orang Tua' })
      }
      const storedSiswa = localStorage.getItem('siswa_session')
      if (storedSiswa) {
        const obj = JSON.parse(storedSiswa)
        if (obj?.nisn) accountList.push({ nisn: String(obj.nisn), role: 'Siswa' })
      }
      const storedGuru = localStorage.getItem('guru_session')
      if (storedGuru) {
        const obj = JSON.parse(storedGuru)
        if (obj?.id) accountList.push({ nisn: String(obj.id), role: 'Guru' })
      }
    } catch {}

    // Masukkan semua akun dari savedAccounts (Multi-Account Switcher)
    saved.forEach(acc => {
      const nisn = acc.nisn || (acc.username ? acc.username.split('@')[0].replace('ebm.ortu_', '').replace('ebmsiswa.', '') : null) || acc.id
      if (nisn) {
        const cleanRole = (acc.role?.toLowerCase().includes('ortu') || acc.role?.toLowerCase().includes('orang tua'))
          ? 'Orang Tua'
          : (acc.role?.toLowerCase().includes('guru') || acc.role?.toLowerCase().includes('staff'))
            ? 'Guru'
            : 'Siswa'
        accountList.push({ nisn: String(nisn), role: cleanRole })
      }
    })

    // Deduplikasi
    const uniqueAccounts = []
    accountList.forEach(item => {
      if (!item.nisn) return
      if (!uniqueAccounts.some(u => u.nisn === item.nisn && u.role === item.role)) {
        uniqueAccounts.push(item)
      }
    })

    console.log('[FCM Push] 📲 Mendaftarkan token untuk semua akun tersimpan:', uniqueAccounts)

    for (const acc of uniqueAccounts) {
      try {
        // Coba upsert dengan composite key (token, nisn, role)
        const { error } = await supabase.from('push_device_tokens').upsert({
          token: token,
          nisn: acc.nisn,
          role: acc.role,
          platform: 'android',
          device_info: navigator.userAgent || 'Android APK',
          updated_at: new Date().toISOString()
        }, { onConflict: 'token,nisn,role' })

        if (error) {
          // Fallback jika constraint komposit belum dibuat di Supabase
          await supabase.from('push_device_tokens').upsert({
            token: token,
            nisn: acc.nisn,
            role: acc.role,
            platform: 'android',
            device_info: navigator.userAgent || 'Android APK',
            updated_at: new Date().toISOString()
          }, { onConflict: 'token' })
        }
      } catch (err) {
        console.warn('[FCM Push] Error saving token for', acc, err)
      }
    }
  } catch (e) {
    console.warn('[FCM Push] syncMultiAccountPushTokens error:', e)
  }
}

/**
 * Hapus token akun yang dihapus dari perangkat
 */
export async function removeAccountPushToken(nisn, role) {
  if (!Capacitor.isNativePlatform() || !nisn) return
  const token = localStorage.getItem('ebudimulia_fcm_token')
  if (!token) return
  try {
    let q = supabase.from('push_device_tokens').delete().eq('token', token).eq('nisn', String(nisn))
    if (role) q = q.eq('role', role)
    await q
  } catch (e) {
    console.warn('[FCM Push] removeAccountPushToken error:', e)
  }
}
