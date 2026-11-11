import { lazy } from 'react'

const RELOAD_FLAG = 'ebm_chunk_reload_at'

/**
 * Pengganti React.lazy yang tahan terhadap gagal-muat chunk
 * (misal: setelah deploy versi baru, HP siswa masih memegang nama file lama,
 * atau sinyal putus saat membuka menu).
 *
 * 1. Coba ulang hingga 2x dengan jeda singkat.
 * 2. Jika tetap gagal, muat ulang halaman otomatis SEKALI (maks 1x per 60 detik)
 *    agar mendapat versi terbaru, tanpa membuat siswa melihat layar error.
 */
export function lazyRetry(loader, retries = 2, delayMs = 800) {
  return lazy(async () => {
    let lastErr
    for (let i = 0; i <= retries; i++) {
      try {
        return await loader()
      } catch (err) {
        lastErr = err
        if (i < retries) await new Promise(r => setTimeout(r, delayMs * (i + 1)))
      }
    }

    try {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
      if (Date.now() - last > 60000 && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
        window.location.reload()
        return new Promise(() => {})
      }
    } catch {}
    throw lastErr
  })
}

