import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Custom fetch with auto-retry & exponential backoff.
 * Menangani error connection pool (PGRST003) & gateway timeout (504)
 * yang sering terjadi saat jam sibuk presensi pagi (06:30 - 07:00).
 */
const fetchWithRetry = (url, options = {}) => {
  const MAX_RETRIES = 3
  const BASE_DELAY = 800 // ms

  const attempt = async (retryCount) => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Retry pada 502, 503, 504 (gateway/pool timeout) dan 500 dengan PGRST003
      if (retryCount < MAX_RETRIES && (response.status === 502 || response.status === 503 || response.status === 504)) {
        const delay = BASE_DELAY * Math.pow(2, retryCount) + Math.random() * 300
        console.warn(`[Supabase] HTTP ${response.status}, retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms...`)
        await new Promise(r => setTimeout(r, delay))
        return attempt(retryCount + 1)
      }

      // Retry pada error PGRST003 (connection pool timeout) yang ada di body
      if (retryCount < MAX_RETRIES && response.status === 500) {
        const cloned = response.clone()
        try {
          const body = await cloned.json()
          if (body?.code === 'PGRST003' || body?.message?.includes('connection pool') || body?.code === '57014') {
            const delay = BASE_DELAY * Math.pow(2, retryCount) + Math.random() * 300
            console.warn(`[Supabase] ${body.code || 'pool timeout'}, retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms...`)
            await new Promise(r => setTimeout(r, delay))
            return attempt(retryCount + 1)
          }
        } catch (_) {
          // body bukan JSON, skip retry
        }
      }

      return response
    } catch (err) {
      // Jangan retry jika device offline / jaringan unreachable — tidak ada gunanya
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw err
      }
      // Hanya retry pada AbortError (timeout 15s kita), bukan network error umum
      if (retryCount < MAX_RETRIES && err.name === 'AbortError') {
        const delay = BASE_DELAY * Math.pow(2, retryCount) + Math.random() * 300
        console.warn(`[Supabase] Request timeout, retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms...`)
        await new Promise(r => setTimeout(r, delay))
        return attempt(retryCount + 1)
      }
      throw err
    }
  }

  return attempt(0)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithRetry,
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})
