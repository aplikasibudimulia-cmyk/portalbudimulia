/**
 * Utilitas Enkripsi & Kompresi Lembar Jawaban Darurat (Emergency QR Code)
 * Digunakan jika saat submit koneksi Wi-Fi sekolah padam total.
 */

/**
 * Bentuk string payload ringkas untuk QR Code darurat
 * Struktur minimalis:
 * {
 *   p: peserta_id,
 *   s: sesi_id,
 *   n: nisn,
 *   t: timestamp,
 *   a: { [soal_id]: jawaban }
 * }
 */
export const generateEmergencyQrPayload = (pesertaId, sesiId, nisn, answersMap) => {
  try {
    const compactAnswers = {}
    Object.entries(answersMap || {}).forEach(([soalId, val]) => {
      const jawaban = typeof val === 'object' && val !== null ? val.jawaban : val
      if (jawaban !== undefined && jawaban !== null && jawaban !== '') {
        compactAnswers[soalId] = jawaban
      }
    })

    const payload = {
      p: pesertaId,
      s: sesiId,
      n: nisn,
      t: Date.now(),
      a: compactAnswers
    }

    const jsonStr = JSON.stringify(payload)
    // Encode to Base64 untuk format QR yang aman dibaca scanner
    return btoa(unescape(encodeURIComponent(jsonStr)))
  } catch (err) {
    console.error('[CBT Crypto] Gagal membuat payload QR darurat:', err)
    return ''
  }
}

/**
 * Dekripsi / Parse payload QR yang discan oleh Pengawas
 */
export const decodeEmergencyQrPayload = (rawString) => {
  try {
    if (!rawString) return null
    const jsonStr = decodeURIComponent(escape(atob(rawString.trim())))
    const parsed = JSON.parse(jsonStr)
    if (!parsed.p || !parsed.s || !parsed.a) {
      throw new Error('Format QR darurat tidak valid.')
    }
    return parsed
  } catch (err) {
    console.error('[CBT Crypto] Gagal mem-parse QR darurat:', err)
    return null
  }
}
