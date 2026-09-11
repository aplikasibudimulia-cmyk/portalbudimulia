// utils/pushNotif.js
// Utility untuk registrasi Service Worker, Web Push, dan Android Native Local Notifications

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../supabaseClient'

const SW_PATH = '/sw.js'

// PENTING: Android tidak mengizinkan upgrade importance channel yang sudah ada.
// Jika sebelumnya channel dibuat dengan IMPORTANCE_DEFAULT, maka IMPORTANCE_HIGH tidak akan berlaku.
// Solusinya: gunakan channel ID baru setiap kali ada perubahan importance.
const CHANNEL_ID = 'ebudimulia-notif-v3'

let isChannelInitialized = false

/**
 * Inisialisasi Android Notification Channel (Importance High agar muncul di status bar / heads-up)
 */
export async function initNotificationChannels() {
  if (isChannelInitialized) return
  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[Notif] Creating notification channel:', CHANNEL_ID)
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'eBudiMulia Presensi & Pengumuman',
        description: 'Notifikasi kehadiran presensi dan pengumuman sekolah',
        importance: 5, // IMPORTANCE_HIGH (5) -> heads up banner & status bar
        visibility: 1, // VISIBILITY_PUBLIC (1)
        vibration: true,
        sound: 'default',
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

/**
 * Tampilkan notifikasi ke Android System Notification Tray & Web Notification.
 * @param {string} title
 * @param {string} body
 * @param {object} options - tag, icon, image, data
 */
export async function showLocalNotif(title, body, options = {}) {
  console.log('[showLocalNotif] Called with:', { title, body: body?.substring(0, 50), isNative: Capacitor.isNativePlatform() })
  
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

      const notifId = Math.floor(Math.random() * 900000) + 100000
      
      const notifPayload = {
        title: title || 'eBudiMulia',
        body: body || '',
        id: notifId,
        channelId: CHANNEL_ID,
        smallIcon: 'ic_launcher',
        largeIcon: 'ic_launcher',
        iconColor: '#4F46E5',
        isExactNotification: false,
        extra: {
          targetMenu: 'PRESENSI',
          url: options.data?.url || (options.tag?.includes('ortu') ? '/dashboard-orang-tua?menu=PRESENSI' : '/dashboard?menu=PRESENSI'),
          ...options.data
        },
      }

      // Jika ada gambar/foto selfie, sertakan attachment untuk BigPicture expandable di status bar Android!
      if (options.image) {
        notifPayload.attachments = [
          { id: 'foto_selfie', url: options.image }
        ]
        // Set summaryText ke body agar saat notifikasi diusap/diperluas (expanded) di Android,
        // jam masuk/pulang dan status hadir/terlambat tetap tampil jelas di layar usap
        notifPayload.summaryText = body || options.summaryText || title || 'Presensi Siswa'
      }

      console.log('[showLocalNotif] Scheduling notification:', JSON.stringify(notifPayload))
      
      const result = await LocalNotifications.schedule({
        notifications: [notifPayload]
      })
      
      console.log('[showLocalNotif] ✅ Schedule result:', JSON.stringify(result))
      return
    } catch (err) {
      console.error('[showLocalNotif] ❌ GAGAL schedule native local notification:', err, JSON.stringify(err))
    }
  }

  // 2. Web Browser Fallback (Service Worker & Notification API)
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.log('[showLocalNotif] Web notification permission not granted')
    return
  }

  if (!('serviceWorker' in navigator)) {
    new Notification(title, { body, icon: '/logo.png', image: options.image, ...options })
    return
  }

  try {
    const reg = await navigator.serviceWorker.ready
    if (reg) {
      reg.active?.postMessage({
        type: 'SHOW_LOCAL_NOTIF',
        title,
        body,
        icon: '/logo.png',
        image: options.image || undefined,
        tag: options.tag || 'ebudimulia',
        data: options.data || {},
      })
    }
  } catch (err) {
    console.warn('[NOTIF] Gagal tampilkan web notif:', err)
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

    // 2. Cek izin push notification
    let permStatus = await PushNotifications.checkPermissions()
    if (permStatus.receive === 'prompt') {
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
      if (token?.value && userData?.nisn) {
        try {
          await supabase.from('push_device_tokens').upsert({
            token: token.value,
            nisn: String(userData.nisn),
            role: userData.role || 'Siswa',
            platform: 'android',
            device_info: navigator.userAgent || 'Android APK',
            updated_at: new Date().toISOString()
          }, { onConflict: 'token' })
          console.log('[FCM Push] ✅ Token saved to Supabase for NISN:', userData.nisn)
        } catch (dbErr) {
          console.warn('[FCM Push] Error saving token to Supabase:', dbErr)
        }
      }
    })

    PushNotifications.addListener('registrationError', (error) => {
      console.error('[FCM Push] ❌ Error on registration:', JSON.stringify(error))
    })

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[FCM Push] 📩 Push notification received foreground:', notification)
      // Tampilkan notifikasi di layar jika aplikasi sedang aktif
      showLocalNotif(notification.title, notification.body, {
        data: notification.data,
        summaryText: notification.body
      })
    })

    PushNotifications.addListener('pushNotificationActionPerformed', (notificationAction) => {
      console.log('[FCM Push] 👆 Push action performed:', notificationAction)
      const data = notificationAction.notification?.data
      const targetUrl = data?.url || (userData?.role === 'Orang Tua' ? '/dashboard-orang-tua' : '/dashboard')
      if (window.location.pathname !== targetUrl) {
        window.location.href = targetUrl
      }
    })

  } catch (err) {
    console.error('[FCM Push] Init error:', err)
  }
}
