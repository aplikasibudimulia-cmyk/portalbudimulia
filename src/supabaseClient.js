import { createClient } from '@supabase/supabase-js'
import { updateServerTimeOffset } from './utils/dateUtils'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Mengambil konteks sesi aktif (Guru / Siswa / Orang Tua) dari localStorage
 * untuk menyertakan token otorisasi sesi server pada header x-client-info.
 */
export function getActiveSessionContext() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null
  try {
    const guruRaw = localStorage.getItem('guru_session')
    if (guruRaw) {
      const g = JSON.parse(guruRaw)
      if (g && g.id) {
        return {
          role: 'staff',
          appRole: g.app_role || 'guru',
          actorId: String(g.id),
          akunId: g.akun_id ? String(g.akun_id) : '',
          proof: g.user_name || g.kode || '',
          token: g.session_token || localStorage.getItem('ebm_session_token') || '',
          sessionKey: 'guru_session',
          parsed: g
        }
      }
    }

    const siswaRaw = localStorage.getItem('siswa_session')
    if (siswaRaw) {
      const s = JSON.parse(siswaRaw)
      const nisn = s?.nisn || s?.id
      if (nisn) {
        return {
          role: 'murid',
          appRole: 'murid',
          actorId: String(nisn),
          akunId: s.akun_id ? String(s.akun_id) : '',
          proof: s.username || String(nisn),
          token: s.session_token || localStorage.getItem('ebm_session_token') || '',
          sessionKey: 'siswa_session',
          parsed: s
        }
      }
    }

    const ortuRaw = localStorage.getItem('orangtua_session')
    if (ortuRaw) {
      const o = JSON.parse(ortuRaw)
      const nisn = o?.nisn || o?.id
      if (nisn) {
        return {
          role: 'orang_tua',
          appRole: 'orang_tua',
          actorId: String(nisn),
          akunId: o.akun_id ? String(o.akun_id) : '',
          proof: o.username || String(nisn),
          token: o.session_token || localStorage.getItem('ebm_session_token') || '',
          sessionKey: 'orangtua_session',
          parsed: o
        }
      }
    }
  } catch (_) {}
  return null
}

/**
 * Menyimpan session_token server ke localStorage dan ke objek sesi aktif.
 */
export function persistServerSessionToken(token, sessionKeyHint = null) {
  if (!token || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('ebm_session_token', token)
    const keys = sessionKeyHint ? [sessionKeyHint] : ['guru_session', 'siswa_session', 'orangtua_session']
    for (const k of keys) {
      const raw = localStorage.getItem(k)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.session_token !== token) {
          parsed.session_token = token
          localStorage.setItem(k, JSON.stringify(parsed))
        }
      }
    }
  } catch (_) {}
}

let inflightTokenPromise = null
let lastTokenAttemptAt = 0

/**
 * Memastikan sesi yang sudah login sebelum update otomatis memperoleh session_token
 * dari server tanpa memaksa pengguna login ulang.
 */
async function ensureServerSessionToken(ctx) {
  if (!ctx || ctx.token) return ctx?.token || ''
  const now = Date.now()
  if (inflightTokenPromise) return inflightTokenPromise
  if (now - lastTokenAttemptAt < 3000) return ''
  lastTokenAttemptAt = now

  inflightTokenPromise = (async () => {
    try {
      const proofHeader = `supabase-js-web|ebm_v2:1|ebm_role:${ctx.role}|ebm_actor:${ctx.actorId}|ebm_akun:${ctx.akunId}|ebm_proof:${encodeURIComponent(ctx.proof || '')}`

      // 1. Handshake via fn_verify_session jika akunId tersedia
      if (ctx.akunId && ctx.actorId) {
        const verifyRes = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_verify_session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'x-client-info': proofHeader
          },
          body: JSON.stringify({
            p_akun_id: ctx.akunId,
            p_role: ctx.role,
            p_foreign_id: ctx.actorId
          })
        })
        if (verifyRes.ok) {
          const data = await verifyRes.json()
          if (data?.ok && data?.session_token) {
            persistServerSessionToken(data.session_token, ctx.sessionKey)
            return data.session_token
          }
        }
      }

      // 2. Fallback: Gunakan kredensial tersimpan di ebudimulia_saved_accounts jika ada
      const savedRaw = localStorage.getItem('ebudimulia_saved_accounts')
      if (savedRaw) {
        const savedList = JSON.parse(savedRaw)
        if (Array.isArray(savedList)) {
          const match = savedList.find(a => {
            if (!a?.username || !a?.password) return false
            if (ctx.role === 'staff' && a.role === 'Guru / Staff') {
              return a.id === `guru_${ctx.actorId}` || a.username === ctx.proof || a.displayName === ctx.parsed?.nama_guru
            }
            if (ctx.role === 'murid' && a.role === 'Siswa') {
              return String(a.nisn) === ctx.actorId
            }
            if (ctx.role === 'orang_tua' && a.role === 'Orang Tua') {
              return String(a.nisn) === ctx.actorId
            }
            return false
          })

          if (match) {
            const loginRes = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'x-client-info': proofHeader
              },
              body: JSON.stringify({
                p_username: match.username,
                p_password: match.password,
                p_role: ctx.role
              })
            })
            if (loginRes.ok) {
              const loginData = await loginRes.json()
              if (loginData?.ok && loginData?.session_token) {
                persistServerSessionToken(loginData.session_token, ctx.sessionKey)
                return loginData.session_token
              }
            }
          }
        }
      }
    } catch (_) {
      // Abaikan error jaringan saat handshake background
    } finally {
      inflightTokenPromise = null
    }
    return ''
  })()

  return inflightTokenPromise
}

/**
 * Custom fetch with auto-retry & exponential backoff.
 * Menangani error connection pool (PGRST003) & gateway timeout (504)
 * yang sering terjadi saat jam sibuk presensi pagi (06:30 - 07:00),
 * sekaligus menyertakan token keamanan sesi pada x-client-info.
 */
const fetchWithRetry = (url, options = {}) => {
  const MAX_RETRIES = 3
  const BASE_DELAY = 800 // ms

  const attempt = async (retryCount) => {
    try {
      const urlStr = String(url || '')
      const method = String(options.method || 'GET').toUpperCase()
      const isHandshakeRpc =
        urlStr.includes('/rpc/fn_login') ||
        urlStr.includes('/rpc/fn_verify_session') ||
        urlStr.includes('/rpc/fn_consume_impersonate_token') ||
        urlStr.includes('/auth/v1/')

      const isReadRpc =
        urlStr.includes('/rpc/fn_get_') ||
        urlStr.includes('/rpc/fn_check_')

      let ctx = getActiveSessionContext()
      if (ctx && !ctx.token && !isHandshakeRpc && urlStr.includes('/rest/v1/')) {
        const isWriteOrProtectedRead =
          (method !== 'GET' && !isReadRpc) || urlStr.includes('/rest/v1/akun_pengguna')
        if (isWriteOrProtectedRead) {
          const newToken = await ensureServerSessionToken(ctx)
          if (newToken) ctx = getActiveSessionContext() || { ...ctx, token: newToken }
        } else {
          ensureServerSessionToken(ctx).catch(() => {})
        }
      }

      const headers = new Headers(options.headers || {})
      if (ctx) {
        const clientInfo = [
          'supabase-js-web',
          'ebm_v2:1',
          `ebm_role:${ctx.role}`,
          `ebm_actor:${ctx.actorId}`,
          `ebm_akun:${ctx.akunId}`,
          `ebm_token:${ctx.token || ''}`,
          `ebm_proof:${encodeURIComponent(ctx.proof || '')}`
        ].join('|')
        headers.set('x-client-info', clientInfo)
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout agar retry lebih responsif saat sinyal lemah

      const response = await fetch(url, {
        ...options,
        headers,
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

      // Tangani 401 (Invalid / Expired JWT): bersihkan stale auth token agar tidak loop 401
      if (response.status === 401) {
        try {
          const authKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
          if (authKey) {
            console.warn('[Supabase] Auth token kadaluarsa (401), membersihkan sesi auth lokal...')
            localStorage.removeItem(authKey)
          }
        } catch (_) {}
      }

      const dateHeader = response.headers?.get ? response.headers.get('date') : null
      if (dateHeader) {
        updateServerTimeOffset(dateHeader)
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
