/**
 * fcmSender — pintu tunggal pengiriman FCM Push Notification dari aplikasi.
 *
 * Pengiriman kini dilakukan oleh Supabase Edge Function `fcm-send` (kunci rahasia
 * Firebase tersimpan aman di Secrets server, tidak lagi di dalam aplikasi/browser).
 *
 * Masa transisi (tanpa downtime): selama Edge Function `fcm-send` BELUM ter-deploy
 * (server membalas 404), pengiriman otomatis memakai jalur lama di
 * `fcmSenderLegacy.js` sehingga notifikasi tetap berjalan seperti sebelumnya.
 * Begitu fungsi ter-deploy, seluruh pengiriman otomatis lewat server.
 *
 * Tanda tangan fungsi & bentuk nilai kembalian SAMA dengan versi sebelumnya.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Diingat selama halaman terbuka agar tidak mengecek berulang bila fungsi belum ada
let serverFunctionMissing = false

/**
 * Panggil Edge Function. Mengembalikan { fallback: true } HANYA jika fungsi belum
 * ter-deploy (404). Error lain (mis. 429 dibatasi, 500) tidak memicu jalur lama
 * agar pembatasan di server tidak bisa dilewati.
 */
async function callServer(payload) {
  if (serverFunctionMissing || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { fallback: true }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/fcm-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  })

  if (res.status === 404) {
    serverFunctionMissing = true
    return { fallback: true }
  }

  let out = null
  try {
    out = await res.json()
  } catch {
    out = null
  }
  return { fallback: false, ok: res.ok, status: res.status, out }
}

function toResult(r) {
  if (r.out && typeof r.out === 'object') return r.out
  return { success: false, error: `Server notifikasi merespons status ${r.status}` }
}

/**
 * Kirim FCM Push Notification ke semua perangkat Siswa / Orang Tua yang terdaftar
 */
export async function sendFCMPushNotification({
  nisn,
  role,
  title,
  body,
  message,
  image,
  targetMenu = 'PRESENSI',
  data = {}
}) {
  if (!nisn) return { success: false, message: 'NISN is required' }
  const notifText = body || message || ''

  try {
    const r = await callServer({
      kind: 'user',
      nisn: String(nisn),
      role,
      title,
      body: notifText,
      image,
      targetMenu,
      data,
    })

    if (r.fallback) {
      const legacy = await import('./fcmSenderLegacy')
      return legacy.sendFCMPushNotification({ nisn, role, title, body, message, image, targetMenu, data })
    }
    return toResult(r)
  } catch (err) {
    console.warn('[FCM Sender] Error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Kirim FCM Push Notification khusus ke Wali Kelas dari suatu kelas tertentu
 */
export async function sendFCMPushToWaliKelas({
  kelas,
  tahunAjaranId,
  title,
  body,
  message,
  data = {}
}) {
  if (!kelas) return { success: false, message: 'Kelas is required' }
  const notifText = body || message || ''

  try {
    const r = await callServer({
      kind: 'wali',
      kelas,
      tahunAjaranId,
      title,
      body: notifText,
      data,
    })

    if (r.fallback) {
      const legacy = await import('./fcmSenderLegacy')
      return legacy.sendFCMPushToWaliKelas({ kelas, tahunAjaranId, title, body, message, data })
    }
    return toResult(r)
  } catch (err) {
    console.warn('[FCM Wali] Error:', err)
    return { success: false, error: err.message }
  }
}

