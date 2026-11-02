import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

/**
 * Memformat nomor telepon ke format internasional standar WhatsApp (diawali 62).
 */
export function formatWhatsAppNumber(phone) {
  if (!phone) return ''
  let clean = String(phone).replace(/\D/g, '')
  if (clean.startsWith('6208')) {
    clean = '628' + clean.substring(4)
  } else if (clean.startsWith('08')) {
    clean = '628' + clean.substring(2)
  } else if (clean.startsWith('8')) {
    clean = '628' + clean.substring(1)
  }
  return clean
}

/**
 * Menghasilkan URL WhatsApp Web / Universal Link.
 */
export function getWhatsAppWebUrl(phone, message = '') {
  const clean = formatWhatsAppNumber(phone)
  const encoded = encodeURIComponent(message || '')
  return clean ? `https://wa.me/${clean}?text=${encoded}` : `https://wa.me/?text=${encoded}`
}

/**
 * Menghasilkan Deep Link skema native WhatsApp (whatsapp://).
 */
export function getWhatsAppDeepLink(phone, message = '') {
  const clean = formatWhatsAppNumber(phone)
  const encoded = encodeURIComponent(message || '')
  return clean ? `whatsapp://send?phone=${clean}&text=${encoded}` : `whatsapp://send?text=${encoded}`
}

/**
 * Mengirim pesan WhatsApp secara lintas platform (Desktop Web, iOS WKWebView, Android Capacitor).
 * 
 * Di iOS Capacitor, window.open(..., '_blank') diblokir oleh popup blocker WKWebView
 * terutama jika dipanggil setelah operasi async (seperti await supabase...).
 * Menggunakan window.location.href ke universal link / deep link akan ditangkap oleh
 * Capacitor WebViewDelegationHandler dan diteruskan ke UIApplication.shared.open,
 * sehingga WhatsApp terbuka secara langsung dan mulus tanpa terblokir.
 */
export async function sendWhatsAppMessage(phone, message = '') {
  const cleanPhone = formatWhatsAppNumber(phone)
  const waUrl = getWhatsAppWebUrl(cleanPhone, message)
  const deepLink = getWhatsAppDeepLink(cleanPhone, message)

  // Salin pesan ke clipboard terlebih dahulu sebagai cadangan yang nyaman
  try {
    if (navigator?.clipboard?.writeText && message) {
      await navigator.clipboard.writeText(message)
    }
  } catch (err) {
    console.warn('Gagal menyalin pesan ke clipboard:', err)
  }

  if (Capacitor.isNativePlatform()) {
    // Pada perangkat mobile native (iOS / Android Capacitor)
    try {
      // Buka via universal link https://wa.me/...
      // Capacitor WebViewDelegationHandler akan menangkap navigasi top-level eksternal ini
      // dan mendelegasikannya ke UIApplication.shared.open / launchIntent.
      window.location.href = waUrl
    } catch (e) {
      console.warn('Gagal membuka waUrl via window.location.href, mencoba deep link:', e)
      try {
        window.location.href = deepLink
      } catch (e2) {
        // Fallback terakhir: buka native Share sheet jika tersedia
        try {
          await Share.share({
            title: 'Informasi Login e-BudiMulia',
            text: message,
            url: waUrl,
            dialogTitle: 'Kirim Informasi Login via WhatsApp'
          })
        } catch (shareErr) {
          console.error('Gagal membuka Share sheet:', shareErr)
        }
      }
    }
  } else {
    // Pada browser desktop / web biasa
    window.open(waUrl, '_blank')
  }
}
