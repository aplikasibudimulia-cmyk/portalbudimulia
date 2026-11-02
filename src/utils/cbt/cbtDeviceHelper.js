import { Capacitor } from '@capacitor/core'

const CBT_DEVICE_STORAGE_KEY = 'ebudimulia_cbt_device_id'

/**
 * Mengambil atau membuat ID unik perangkat yang persisten di local storage browser / webview.
 * ID ini digunakan untuk mengunci sesi ujian CBT ke 1 perangkat fisik saja (Single Device Lock).
 */
export const getOrCreateDeviceId = () => {
  try {
    let devId = localStorage.getItem(CBT_DEVICE_STORAGE_KEY)
    if (!devId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        devId = 'dev_' + crypto.randomUUID()
      } else {
        devId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36)
      }
      localStorage.setItem(CBT_DEVICE_STORAGE_KEY, devId)
    }
    return devId
  } catch (e) {
    console.warn('[CBT] LocalStorage error while getting device id:', e)
    return 'dev_fallback_' + Date.now()
  }
}

/**
 * Menghapus device ID lokal (jika diperlukan untuk pengujian atau pembersihan data).
 */
export const clearLocalDeviceId = () => {
  try {
    localStorage.removeItem(CBT_DEVICE_STORAGE_KEY)
  } catch (e) {
    console.warn('[CBT] LocalStorage error while clearing device id:', e)
  }
}

/**
 * Deteksi nama & jenis perangkat siswa (iOS / Android / Model HP / Browser).
 */
export const detectDeviceInfo = () => {
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''
  let platform = 'web'
  try {
    if (Capacitor.isNativePlatform()) {
      platform = Capacitor.getPlatform()
    }
  } catch {
    platform = 'web'
  }

  const isIos = platform === 'ios' || /iPhone|iPad|iPod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = platform === 'android' || /Android/i.test(ua)
  
  let model = ''
  if (/iPad/i.test(ua) || (isIos && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && !/iPhone/i.test(ua))) {
    model = 'iPad'
  } else if (/iPhone/i.test(ua) || isIos) {
    model = 'iPhone'
  } else if (/SM-[A-Z0-9]+/i.test(ua)) {
    model = ua.match(/SM-[A-Z0-9]+/i)[0]
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

  if (platform === 'ios') {
    return model ? `Apple ${model} (Aplikasi iOS)` : 'Apple iOS App'
  }
  if (platform === 'android') {
    return model ? `Android (${model})` : 'Aplikasi Android'
  }
  if (isIos) {
    return model ? `Apple ${model} (Browser)` : 'Apple iOS (Browser)'
  }
  if (isAndroid) {
    return model ? `Android (${model} - Browser)` : 'Android Device (Browser)'
  }
  return 'Komputer / Laptop (Web Browser)'
}
