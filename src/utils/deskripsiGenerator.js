/**
 * Generator Deskripsi Rapor Kurikulum Merdeka
 * Menghasilkan 1 narasi capaian kompetensi terpadu (merged) per Lingkup Materi / Mapel
 * berdasarkan capaian TP tertinggi (sangat baik) dan TP terendah (perlu bimbingan).
 */

/**
 * Membersihkan awalan deskripsi agar luwes dirangkai ke dalam kalimat narasi
 * Contoh: "Peserta didik mampu memahami..." -> "memahami..."
 *         "Siswa dapat menganalisis..." -> "menganalisis..."
 */
export function sanitizeTpDescription(desc) {
  if (!desc || typeof desc !== 'string') return ''
  let clean = desc.trim()

  // Hapus tanda baca di akhir
  clean = clean.replace(/[.;,]+$/, '')

  // Hapus awalan subjek yang sering ditulis guru
  clean = clean.replace(/^(peserta didik|siswa|murid|ananda)\s+(mampu|dapat|bisa|telah mampu|sudah dapat)\s+/i, '')
  clean = clean.replace(/^(peserta didik|siswa|murid|ananda)\s+/i, '')
  clean = clean.replace(/^(mampu|dapat|bisa|telah mampu|sudah dapat)\s+/i, '')

  // Buat huruf pertama lowercase jika bukan singkatan/nama khusus
  if (clean.length > 0 && !/^[A-Z]{2,}/.test(clean)) {
    clean = clean.charAt(0).toLowerCase() + clean.slice(1)
  }

  return clean
}

/**
 * Generate deskripsi narasi Kurikulum Merdeka dari daftar TP yang dinilai
 * @param {Array<{ nama: string, deskripsi: string, nilai: number|null }>} tpList
 * @param {number} kkm - Kriteria Ketercapaian Tujuan Pembelajaran (default 75)
 * @param {string} fallbackBabName - Nama BAB jika TP tidak memiliki deskripsi
 * @returns {string} Narasi terpadu 1 paragraf untuk Rapor
 */
export function generateDeskripsiKurikulumMerdeka(tpList = [], kkm = 75, fallbackBabName = '') {
  if (!Array.isArray(tpList) || tpList.length === 0) {
    return fallbackBabName ? `Mempelajari materi ${fallbackBabName}.` : '-'
  }

  // Filter TP yang memiliki nilai numerik valid
  const validTps = tpList
    .filter(tp => tp && tp.nilai !== undefined && tp.nilai !== null && tp.nilai !== '' && !isNaN(Number(tp.nilai)))
    .map(tp => ({
      ...tp,
      nilai: Number(tp.nilai),
      cleanDesc: sanitizeTpDescription(tp.deskripsi || tp.nama || '')
    }))
    .filter(tp => tp.cleanDesc.length > 0)

  // Jika belum ada nilai sama sekali
  if (validTps.length === 0) {
    const firstDesc = tpList.find(t => t?.deskripsi?.trim())?.deskripsi?.trim()
    if (firstDesc) return firstDesc
    return fallbackBabName ? `Mempelajari materi ${fallbackBabName}.` : '-'
  }

  // Urutkan berdasarkan nilai tertinggi ke terendah
  validTps.sort((a, b) => b.nilai - a.nilai)

  const highestTp = validTps[0]
  const lowestTp = validTps[validTps.length - 1]

  const isHighestGood = highestTp.nilai >= kkm
  const isLowestNeedHelp = lowestTp.nilai < kkm

  // KASUS 1: Hanya ada 1 TP
  if (validTps.length === 1) {
    if (isHighestGood) {
      return `Menunjukkan penguasaan yang sangat baik dalam ${highestTp.cleanDesc}.`
    } else {
      return `Perlu bimbingan dan latihan lebih lanjut dalam ${highestTp.cleanDesc}.`
    }
  }

  // KASUS 2: Nilai tertinggi dan terendah sama (semua TP nilainya seragam)
  if (highestTp.nilai === lowestTp.nilai) {
    if (isHighestGood) {
      return `Menunjukkan penguasaan materi yang sangat baik pada seluruh tujuan pembelajaran, terutama dalam ${highestTp.cleanDesc}.`
    } else {
      return `Perlu pendampingan dan bimbingan dalam memahami tujuan pembelajaran, khususnya pada ${lowestTp.cleanDesc}.`
    }
  }

  // KASUS 3: Ada TP tuntas dan ada TP di bawah KKM (Perlu Bimbingan)
  if (isHighestGood && isLowestNeedHelp) {
    return `Menunjukkan penguasaan yang sangat baik dalam ${highestTp.cleanDesc}, namun perlu bimbingan dan peningkatan dalam ${lowestTp.cleanDesc}.`
  }

  // KASUS 4: Semua TP di atas KKM (semua tuntas dengan nilai bervariasi)
  if (!isLowestNeedHelp) {
    if (highestTp.nilai - lowestTp.nilai >= 8) {
      return `Menunjukkan penguasaan yang sangat baik dalam ${highestTp.cleanDesc}, serta cukup menguasai dalam ${lowestTp.cleanDesc}.`
    }
    return `Menunjukkan penguasaan yang sangat baik dalam ${highestTp.cleanDesc} dan ${lowestTp.cleanDesc}.`
  }

  // KASUS 5: Semua TP di bawah KKM (perlu bimbingan di semua TP)
  return `Perlu pendampingan intensif dalam memahami capaian pembelajaran, khususnya dalam ${lowestTp.cleanDesc} dan ${highestTp.cleanDesc}.`
}
