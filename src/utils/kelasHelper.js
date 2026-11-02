/**
 * Utility Pengurutan dan Pemilihan Kelas Siswa SMP Budi Mulia
 */

/**
 * Mengurutkan daftar kelas sekolah dengan urutan alami (natural order):
 * 1. Kelas 7 (7A, 7B, 7C, 7D, ...)
 * 2. Kelas 8 (8A, 8B, 8C, 8D, ...)
 * 3. Kelas 9 (9A, 9B, 9C, 9D, ...)
 * 4. Kelas non-reguler / uji coba / test (10X, Test, Dummy, dll.) diletakkan di paling belakang
 */
export function sortKelasList(classes) {
  if (!Array.isArray(classes)) return []
  return [...classes].sort((a, b) => {
    const cleanA = String(a || '').trim()
    const cleanB = String(b || '').trim()

    // Test / dummy / kelas 10+: dimulai dengan '10', 'test', 'uji', 'dummy', 'trial', 'x'
    const isTestA = /^(10|test|uji|dummy|trial|x\b)/i.test(cleanA)
    const isTestB = /^(10|test|uji|dummy|trial|x\b)/i.test(cleanB)

    if (isTestA && !isTestB) return 1
    if (!isTestA && isTestB) return -1

    return cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/**
 * Mencari kelas default yang paling tepat untuk ditampilkan saat pertama kali dibuka:
 * 1. Jika guru adalah wali kelas dari kelas tertentu, prioritaskan kelas walinya.
 * 2. Jika ada kelas '7A', gunakan '7A'.
 * 3. Jika tidak ada 7A, ambil kelas 7 manapun yang tersedia (7B, 7C, dsb.).
 * 4. Ambil kelas reguler pertama (yang bukan test/10X).
 * 5. Fallback ke kelas pertama apapun.
 */
export function getDefaultKelas(classes = [], session = null) {
  if (!Array.isArray(classes) || classes.length === 0) return '7A'

  if (session?.kelas && session.kelas.length > 0) {
    const waliK = session.kelas.find(k => k.kelas)?.kelas
    if (waliK && classes.includes(waliK)) return waliK
  }

  const class7A = classes.find(c => /^7A$/i.test(c))
  if (class7A) return class7A

  const anyClass7 = classes.find(c => /^7/i.test(c))
  if (anyClass7) return anyClass7

  const regularClass = classes.find(c => !/^(10|test|uji|dummy|trial|x\b)/i.test(c))
  if (regularClass) return regularClass

  return classes[0] || '7A'
}
