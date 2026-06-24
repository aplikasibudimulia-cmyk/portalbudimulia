/**
 * semesterUtils.js
 * Fungsi helper untuk manajemen semester
 */

/**
 * Mendapatkan semester yang sedang aktif berdasarkan tanggal hari ini
 * @param {Array} semesters - Array semester dari database
 * @returns {Object|null} Semester aktif atau null
 */
export function getSemesterAktif(semesters) {
  if (!semesters || semesters.length === 0) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  return semesters.find(s => {
    const start = new Date(s.tanggal_mulai)
    const end = new Date(s.tanggal_selesai)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return today >= start && today <= end
  }) || null
}

/**
 * Format tanggal ke format Indonesia
 * @param {string} dateStr - Tanggal dalam format YYYY-MM-DD
 * @returns {string} Tanggal dalam format DD MMMM YYYY
 */
export function formatTanggal(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Mendapatkan label semester
 * @param {Object} semester 
 * @returns {string}
 */
export function getLabelSemester(semester) {
  if (!semester) return '-'
  return `Semester ${semester.nomor}`
}
