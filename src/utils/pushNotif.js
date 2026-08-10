// utils/pushNotif.js
// Utility untuk registrasi Service Worker dan menampilkan notifikasi lokal

const SW_PATH = '/sw.js'

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
 * Minta izin notifikasi dari user.
 * Return 'granted' | 'denied' | 'default'
 */
export async function requestNotifPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result
}

/**
 * Tampilkan notifikasi lokal via Service Worker (agar bisa muncul dari background).
 * @param {string} title
 * @param {string} body
 * @param {object} options - tag, icon, data
 */
export async function showLocalNotif(title, body, options = {}) {
  // Hanya jalankan jika browser mendukung dan izin notifikasi sudah di-granted
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return
  }

  if (!('serviceWorker' in navigator)) {
    // Fallback: gunakan Notification API langsung
    new Notification(title, { body, icon: '/logo.png', ...options })
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
        tag: options.tag || 'ebudimulia',
        data: options.data || {},
      })
    }
  } catch (err) {
    console.warn('[NOTIF] Gagal tampilkan notif:', err)
  }
}

/**
 * Cek apakah notifikasi sudah diizinkan
 */
export function isNotifGranted() {
  return 'Notification' in window && Notification.permission === 'granted'
}

/**
 * Dispatcher Notifikasi Ganda (Dual-Notification System)
 * Mengirimkan In-App/Browser Push Notification & LINE Flex Message secara paralel tanpa mengganggu satu sama lain.
 */
export async function dispatchDualNotification({
  title,
  body,
  siswaData = null, // { nama, nisn, kelas, status, waktu, tipe, fotoUrl }
  options = {}
}) {
  // 1. Saluran 1: Local / Browser Push Notification
  try {
    showLocalNotif(title, body, options)
  } catch (e) {
    console.warn('[DualNotif] In-App Notif Error:', e)
  }

  // 2. Saluran 2: LINE Push Notification via Supabase Edge Function line-notify
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

