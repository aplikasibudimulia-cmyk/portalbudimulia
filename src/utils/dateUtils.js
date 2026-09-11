/**
 * dateUtils.js - Utilitas Standar Tanggal & Waktu Waktu Indonesia Barat (WIB / Asia/Jakarta)
 * Memastikan tidak ada perbedaan tanggal akibat konversi UTC (misal jam 00:00 - 06:59 WIB
 * yang di UTC masih tanggal kemarin).
 */

export const TIMEZONE_WIB = 'Asia/Jakarta'

/**
 * Mendapatkan tanggal hari ini dalam format YYYY-MM-DD sesuai zona waktu WIB (Asia/Jakarta).
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: '2026-09-09'
 */
export function getTodayWIB(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_WIB,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

/**
 * Mendapatkan jam dan menit saat ini dalam format HH:mm sesuai zona waktu WIB (Asia/Jakarta).
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: '06:30'
 */
export function getCurrentTimeWIB(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_WIB,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
}

/**
 * Mendapatkan jam, menit, dan detik saat ini dalam format HH:mm:ss sesuai zona waktu WIB (Asia/Jakarta).
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: '06:30:15'
 */
export function getCurrentTimeSecondsWIB(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
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
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Contoh: 'Rabu'
 */
export function getDayNameWIB(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE_WIB,
    weekday: 'long'
  }).format(d)
}

/**
 * Mendapatkan indeks hari (0 = Minggu, 1 = Senin, ... 6 = Sabtu) dalam zona waktu WIB.
 * @param {Date|string|number} [date=new Date()]
 * @returns {number}
 */
export function getDayIndexWIB(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE_WIB, weekday: 'short' }).format(d)
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[dayName] ?? d.getDay()
}
