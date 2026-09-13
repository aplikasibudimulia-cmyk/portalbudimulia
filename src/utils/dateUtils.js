/**
 * dateUtils.js - Utilitas Standar Tanggal & Waktu Waktu Indonesia Barat (WIB / Asia/Jakarta)
 * Dilengkapi dengan Sinkronisasi Waktu Server Otomatis (Anti-Cheat Waktu Perangkat).
 * 
 * Memastikan:
 * 1. Tidak ada perbedaan tanggal akibat konversi UTC (misal jam 00:00 - 06:59 WIB yang di UTC masih tanggal kemarin).
 * 2. Jam presensi tidak dapat dimanipulasi oleh siswa yang mengubah jam di perangkat HP mereka.
 */

export const TIMEZONE_WIB = 'Asia/Jakarta'

const OFFSET_STORAGE_KEY = 'ebudimulia_server_time_offset_ms'
const OFFSET_TIMESTAMP_KEY = 'ebudimulia_server_time_offset_ts'

// Inisialisasi offset dari local storage jika masih fresh (< 12 jam)
let serverTimeOffsetMs = (() => {
  try {
    const savedOffset = localStorage.getItem(OFFSET_STORAGE_KEY)
    const savedTs = localStorage.getItem(OFFSET_TIMESTAMP_KEY)
    if (savedOffset && savedTs) {
      const age = Date.now() - Number(savedTs)
      if (age < 12 * 60 * 60 * 1000) {
        return Number(savedOffset) || 0
      }
    }
  } catch {}
  return 0
})()

let isSyncedOnce = false

/**
 * Memperbarui selisih waktu server dengan waktu perangkat lokal berdasarkan header HTTP Date.
 * @param {string|Date} dateHeader - Header 'Date' dari respons HTTP server Supabase
 * @param {number} [roundTripMs=0] - Waktu tempuh jaringan pulang-pergi
 */
export function updateServerTimeOffset(dateHeader, roundTripMs = 0) {
  if (!dateHeader) return
  try {
    const serverMs = new Date(dateHeader).getTime()
    if (!isNaN(serverMs)) {
      // Estimasi waktu server saat respons diterima (dikurangi separuh roundtrip)
      const estimatedServerNow = serverMs + Math.round(roundTripMs / 2)
      serverTimeOffsetMs = estimatedServerNow - Date.now()
      isSyncedOnce = true

      try {
        localStorage.setItem(OFFSET_STORAGE_KEY, String(serverTimeOffsetMs))
        localStorage.setItem(OFFSET_TIMESTAMP_KEY, String(Date.now()))
      } catch {}


    }
  } catch (err) {
    console.warn('[TimeSync] Gagal memproses date header:', err)
  }
}

/**
 * Sinkronisasi aktif ke server Supabase untuk mendapatkan jam resmi yang presisi.
 * @returns {Promise<boolean>}
 */
export async function syncServerTime() {
  try {
    const start = Date.now()
    const url = import.meta.env.VITE_SUPABASE_URL || 'https://ngdepacckohoxemlauhd.supabase.co'
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: key ? { apikey: key } : {},
      cache: 'no-store'
    })
    const roundTrip = Date.now() - start
    const dateHeader = res.headers.get('date')
    if (dateHeader) {
      updateServerTimeOffset(dateHeader, roundTrip)
      return true
    }
  } catch (err) {
    console.warn('[TimeSync] syncServerTime gagal (fallback ke offset sebelumnya / lokal):', err)
  }
  return false
}

/**
 * Mendapatkan objek Date saat ini yang telah disinkronkan dengan waktu resmi server.
 * Mencegah manipulasi waktu jika siswa memajukan atau memundurkan jam di HP-nya.
 * @returns {Date}
 */
export function getServerNow() {
  return new Date(Date.now() + serverTimeOffsetMs)
}

/**
 * Mengecek apakah jam di perangkat pengguna berselisih signifikan (> 2 menit) dari jam server resmi.
 * @returns {{ isDrifted: boolean, driftSeconds: number }}
 */
export function checkClockDrift() {
  const driftSeconds = Math.round(serverTimeOffsetMs / 1000)
  return {
    isDrifted: Math.abs(serverTimeOffsetMs) > 120000,
    driftSeconds
  }
}

/**
 * Mendapatkan tanggal hari ini dalam format YYYY-MM-DD sesuai zona waktu WIB (Asia/Jakarta).
 * Otomatis menggunakan waktu server resmi (kebal manipulasi jam HP).
 * @param {Date|string|number} [date]
 * @returns {string} Contoh: '2026-09-13'
 */
export function getTodayWIB(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : getServerNow()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_WIB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

/**
 * Mendapatkan jam dan menit saat ini dalam format HH:mm sesuai zona waktu WIB (Asia/Jakarta).
 * Otomatis menggunakan waktu server resmi (kebal manipulasi jam HP).
 * @param {Date|string|number} [date]
 * @returns {string} Contoh: '06:30'
 */
export function getCurrentTimeWIB(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : getServerNow()
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_WIB,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
}

/**
 * Mendapatkan jam, menit, dan detik saat ini dalam format HH:mm:ss sesuai zona waktu WIB (Asia/Jakarta).
 * @param {Date|string|number} [date]
 * @returns {string} Contoh: '06:30:15'
 */
export function getCurrentTimeSecondsWIB(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : getServerNow()
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_WIB,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d)
}

/**
 * Mendapatkan nama hari (Senin - Minggu) dalam zona waktu WIB.
 * @param {Date|string|number} [date]
 * @returns {string} Contoh: 'Rabu'
 */
export function getDayNameWIB(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : getServerNow()
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE_WIB,
    weekday: 'long'
  }).format(d)
}

/**
 * Mendapatkan indeks hari (0 = Minggu, 1 = Senin, ... 6 = Sabtu) dalam zona waktu WIB.
 * @param {Date|string|number} [date]
 * @returns {number}
 */
export function getDayIndexWIB(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : getServerNow()
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE_WIB, weekday: 'short' }).format(d)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[dayName] ?? d.getDay()
}
