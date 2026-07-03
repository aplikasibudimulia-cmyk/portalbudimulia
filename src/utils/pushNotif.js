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
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.warn('[SW] Gagal register:', err)
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
  if (!('serviceWorker' in navigator)) {
    // Fallback: gunakan Notification API langsung
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/logo.png', ...options })
    }
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
