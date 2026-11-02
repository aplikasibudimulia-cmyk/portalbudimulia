import { get, set, del } from 'idb-keyval'
import { supabase } from '../../supabaseClient'

/**
 * Utilitas Penyimpanan Lokal Instan (Local-First IndexedDB) & Background Sync
 * Memastikan pengalaman ujian 0-latency bagi siswa dan tahan pemadaman jaringan.
 */

export const getStorageKey = (sesiId, nisn, type = 'answers') => {
  return `ebm_cbt_${type}_${sesiId}_${nisn}`
}

/**
 * Simpan jawaban butir soal ke memori lokal secara instan (< 1ms)
 */
export const saveAnswerLocally = async (sesiId, nisn, soalId, jawaban, isRagu = false) => {
  try {
    const key = getStorageKey(sesiId, nisn, 'answers')
    const current = (await get(key)) || {}
    current[soalId] = {
      jawaban,
      isRagu,
      timestamp: Date.now(),
      synced: false
    }
    await set(key, current)
    return current
  } catch (err) {
    console.error('[CBT Storage] Gagal menyimpan jawaban lokal:', err)
    return null
  }
}

/**
 * Ambil seluruh snapshot jawaban lokal siswa untuk sesi tertentu
 */
export const getLocalAnswers = async (sesiId, nisn) => {
  try {
    const key = getStorageKey(sesiId, nisn, 'answers')
    return (await get(key)) || {}
  } catch (err) {
    console.error('[CBT Storage] Gagal membaca jawaban lokal:', err)
    return {}
  }
}

/**
 * Simpan cache paket butir soal secara lokal (agar siswa bisa offline terus)
 */
export const cacheQuestionsLocally = async (sesiId, questions) => {
  try {
    const key = `ebm_cbt_soal_${sesiId}`
    await set(key, questions)
  } catch (err) {
    console.error('[CBT Storage] Gagal meng-cache soal:', err)
  }
}

/**
 * Ambil paket soal dari cache lokal jika jaringan terputus
 */
export const getCachedQuestions = async (sesiId) => {
  try {
    const key = `ebm_cbt_soal_${sesiId}`
    return (await get(key)) || null
  } catch (err) {
    return null
  }
}

/**
 * Sinkronisasi Delta Jawaban yang Belum Tersinkron ke Supabase (Debounced Batch Sync)
 * @param {string} pesertaId - ID rekaman di cbt_peserta_ujian
 * @param {string} sesiId - ID sesi ujian
 * @param {string} nisn - NISN siswa
 * @param {boolean} forceAll - Jika true, paksa sinkronisasi seluruh butir jawaban lokal ke database
 */
export const syncUnsyncedAnswers = async (pesertaId, sesiId, nisn, forceAll = false) => {
  if (!navigator.onLine || !pesertaId) {
    return { syncedCount: 0, status: 'offline' }
  }

  try {
    const key = getStorageKey(sesiId, nisn, 'answers')
    const current = (await get(key)) || {}
    const entriesToSync = forceAll
      ? Object.entries(current)
      : Object.entries(current).filter(([_, val]) => !val.synced)

    if (entriesToSync.length === 0) {
      return { syncedCount: 0, status: 'up_to_date' }
    }

    // Siapkan payload batch untuk upsert ke cbt_jawaban_siswa
    const upsertRows = entriesToSync.map(([soalId, val]) => ({
      peserta_id: pesertaId,
      soal_id: soalId,
      jawaban_terpilih: typeof val.jawaban === 'object' ? JSON.stringify(val.jawaban) : String(val.jawaban ?? ''),
      is_ragu: !!val.isRagu,
      updated_at: new Date(val.timestamp || Date.now()).toISOString()
    }))

    const { error } = await supabase
      .from('cbt_jawaban_siswa')
      .upsert(upsertRows, { onConflict: 'peserta_id,soal_id' })

    if (error) {
      throw error
    }

    // Tandai sudah tersinkronisasi di IndexedDB
    entriesToSync.forEach(([soalId]) => {
      if (current[soalId]) {
        current[soalId].synced = true
      }
    })
    await set(key, current)

    return { syncedCount: upsertRows.length, status: 'success' }
  } catch (err) {
    console.warn('[CBT Storage] Sync tertunda (akan dicoba otomatis di siklus berikutnya):', err.message)
    return { syncedCount: 0, status: 'error', error: err.message }
  }
}

/**
 * Bersihkan data sesi lokal setelah ujian resmi selesai dikumpulkan
 */
export const clearLocalExamSession = async (sesiId, nisn) => {
  try {
    await del(getStorageKey(sesiId, nisn, 'answers'))
    await del(`ebm_cbt_soal_${sesiId}`)
  } catch (err) {
    console.error('[CBT Storage] Gagal membersihkan storage:', err)
  }
}
