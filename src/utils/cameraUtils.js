import { Capacitor } from '@capacitor/core'

/**
 * Safe camera utility helper for mobile & desktop browsers (Chrome, Safari, iOS WebKit) and Capacitor Apps.
 */

/**
 * Safely requests a camera stream with multi-tiered constraint fallbacks
 * to support iOS Safari, iOS Chrome, Android Chrome, and WebViews.
 * 
 * @param {'user'|'environment'} facingMode 
 * @returns {Promise<MediaStream>}
 */
export async function getCameraStream(facingMode = 'user') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const error = new Error('HARDWARE_UNSUPPORTED')
    error.userMessage = 'Akses kamera tidak didukung atau memerlukan koneksi aman (HTTPS).'
    throw error
  }

  // Tier 1: facingMode with ideal resolution
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
    })
  } catch (e1) {
    // Tier 2: simple facingMode
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      })
    } catch (e2) {
      // Tier 3: generic video constraint
      try {
        return await navigator.mediaDevices.getUserMedia({ video: true })
      } catch (err) {
        let userMessage = 'Tidak dapat mengakses kamera perangkat.'
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          if (Capacitor.isNativePlatform()) {
            const isIos = Capacitor.getPlatform() === 'ios'
            userMessage = isIos
              ? 'Izin kamera ditolak di HP Anda. Silakan buka Pengaturan iPhone/iPad > eBudimulia > aktifkan izin Kamera.'
              : 'Izin kamera ditolak di HP Anda. Silakan buka Pengaturan HP Android > Aplikasi > eBudimulia > Izin > aktifkan Kamera.'
          } else {
            userMessage = 'Izin kamera ditolak oleh browser. Silakan klik ikon gembok/kamera di bilah alamat browser lalu pilih Izinkan.'
          }
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          userMessage = 'Kamera tidak ditemukan pada perangkat ini.'
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          userMessage = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi kamera lain dan coba lagi.'
        } else if (err.name === 'OverconstrainedError') {
          userMessage = 'Resolusi kamera tidak didukung oleh perangkat.'
        }
        const customErr = new Error(err.name || 'CAMERA_ERROR')
        customErr.userMessage = userMessage
        customErr.originalError = err
        throw customErr
      }
    }
  }
}

/**
 * Processes an uploaded image or camera snapshot File into a compressed DataURL and Blob
 * 
 * @param {File} file 
 * @param {number} maxDimension 
 * @param {number} quality 
 * @returns {Promise<{ dataUrl: string, blob: Blob }>}
 */
export function processFileToSelfie(file, maxDimension = 480, quality = 0.55) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan gambar'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Gagal memuat gambar'))
      img.onload = () => {
        let origW = img.width || maxDimension
        let origH = img.height || maxDimension
        let targetW = origW
        let targetH = origH

        if (origW > maxDimension || origH > maxDimension) {
          if (origW > origH) {
            targetW = maxDimension
            targetH = Math.round((origH / origW) * maxDimension)
          } else {
            targetH = maxDimension
            targetW = Math.round((origW / origH) * maxDimension)
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context tidak tersedia'))
          return
        }

        ctx.drawImage(img, 0, 0, targetW, targetH)

        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        canvas.toBlob((blob) => {
          resolve({ dataUrl, blob: blob || file })
        }, 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
