/**
 * ekskulService.js
 * Layanan terpadu untuk Modul Ekstrakurikuler (Ekskul) SMP Budi Mulia.
 * Mendukung sinkronisasi Supabase dengan fallback LocalStorage otomatis
 * agar aplikasi tetap berjalan lancar meski tabel database baru belum dimigrasi.
 */
import { supabase } from '../supabaseClient'

// ─── Default Kriteria Predikat Khusus Pramuka (Wajib) ─────────────────────────
export const DEFAULT_KRITERIA_PRAMUKA = [
  {
    predikat: 'A',
    kategori: 'pramuka',
    keterangan: 'Sangat aktif mengikuti latihan kepramukaan, berjiwa Dasa Darma prima, disiplin tinggi, berinisiatif, dan memiliki keterampilan serta jiwa kepemimpinan regu yang sangat memuaskan.'
  },
  {
    predikat: 'B',
    kategori: 'pramuka',
    keterangan: 'Aktif mengikuti kegiatan latihan pramuka, disiplin dalam presensi dan seragam, serta menunjukkan penguasaan SKU/keterampilan kepramukaan yang baik.'
  },
  {
    predikat: 'C',
    kategori: 'pramuka',
    keterangan: 'Cukup aktif dalam latihan kepramukaan, perlu peningkatan kedisiplinan kehadiran latihan dan partisipasi dalam kegiatan beregu.'
  },
  {
    predikat: 'D',
    kategori: 'pramuka',
    keterangan: 'Kurang aktif dalam latihan kepramukaan, kehadiran latihan sangat minim, dan memerlukan bimbingan intensif dari pembina pramuka.'
  }
]

// ─── Default Kriteria Predikat Ekskul Umum / Pilihan ─────────────────────────
export const DEFAULT_KRITERIA_UMUM = [
  {
    predikat: 'A',
    kategori: 'umum',
    keterangan: 'Sangat aktif, berinisiatif tinggi, disiplin, dan menunjukkan penguasaan keterampilan serta kepemimpinan yang sangat memuaskan dalam kegiatan ekskul.'
  },
  {
    predikat: 'B',
    kategori: 'umum',
    keterangan: 'Aktif mengikuti kegiatan latihan ekskul, disiplin, dan menunjukkan perkembangan keterampilan yang baik sesuai target kegiatan.'
  },
  {
    predikat: 'C',
    kategori: 'umum',
    keterangan: 'Cukup aktif dalam kegiatan, perlu peningkatan kedisiplinan, komitmen kehadiran, dan partisipasi aktif dalam latihan.'
  },
  {
    predikat: 'D',
    kategori: 'umum',
    keterangan: 'Kurang aktif mengikuti latihan ekskul dan membutuhkan bimbingan intensif dalam pelaksanaan latihan serta komitmen kehadiran.'
  }
]

// Legacy export compatibility
export const DEFAULT_KRITERIA_EKSKUL = DEFAULT_KRITERIA_UMUM

// ─── Default Master Ekskul List ──────────────────────────────────────────────
export const DEFAULT_MASTER_EKSKUL = [
  { id: 'ekskul-pramuka', nama: 'Pramuka', jenis: 'wajib', pembina: 'Kak Pembina Pramuka', hari: 'Jumat', waktu: '13.30 - 15.00' },
  { id: 'ekskul-futsal', nama: 'Futsal', jenis: 'utama', pembina: 'Coach Futsal', hari: 'Selasa', waktu: '15.30 - 17.00' },
  { id: 'ekskul-basket', nama: 'Basket', jenis: 'utama', pembina: 'Coach Basket', hari: 'Rabu', waktu: '15.30 - 17.00' },
  { id: 'ekskul-padus', nama: 'Paduan Suara (Vocal)', jenis: 'utama', pembina: 'Pelatih Padus', hari: 'Kamis', waktu: '15.30 - 17.00' },
  { id: 'ekskul-tari', nama: 'Tari Tradisional & Modern', jenis: 'utama', pembina: 'Pelatih Tari', hari: 'Senin', waktu: '15.30 - 17.00' },
  { id: 'ekskul-robotik', nama: 'Robotika & Coding', jenis: 'pilihan', pembina: 'Instruktur Robotik', hari: 'Sabtu', waktu: '08.30 - 10.30' },
  { id: 'ekskul-english', nama: 'English Club & Speech', jenis: 'pilihan', pembina: 'Ms. English Club', hari: 'Rabu', waktu: '15.30 - 17.00' },
  { id: 'ekskul-pmr', nama: 'PMR (Palang Merah Remaja)', jenis: 'pilihan', pembina: 'Pembina PMR', hari: 'Kamis', waktu: '15.30 - 17.00' },
  { id: 'ekskul-badminton', nama: 'Bulutangkis', jenis: 'pilihan', pembina: 'Coach Badminton', hari: 'Jumat', waktu: '15.30 - 17.00' },
  { id: 'ekskul-musik', nama: 'Band & Ansambel Musik', jenis: 'pilihan', pembina: 'Pelatih Musik', hari: 'Sabtu', waktu: '10.30 - 12.30' }
]

const STORAGE_KEYS = {
  KRITERIA_PRAMUKA: 'ebudimulia_ekskul_kriteria_pramuka',
  KRITERIA_UMUM: 'ebudimulia_ekskul_kriteria_umum',
  KRITERIA: 'ebudimulia_ekskul_kriteria', // legacy fallback
  MASTER: 'ebudimulia_ekskul_master',
  NILAI: 'ebudimulia_ekskul_nilai'
}

// ─── 0. Cek Status Ketersediaan Tabel Database Supabase ───────────────────────
export async function checkEkskulDatabaseStatus() {
  try {
    const { error: errEkskul } = await supabase.from('ekskul').select('id').limit(1)
    const { error: errKriteria } = await supabase.from('kriteria_nilai_ekskul').select('id').limit(1)
    const { error: errNilai } = await supabase.from('nilai_ekskul_siswa').select('id').limit(1)

    const isReady = !errEkskul && !errKriteria && !errNilai
    return {
      isReady,
      missingTables: [
        errEkskul ? 'ekskul' : null,
        errKriteria ? 'kriteria_nilai_ekskul' : null,
        errNilai ? 'nilai_ekskul_siswa' : null
      ].filter(Boolean)
    }
  } catch (e) {
    return { isReady: false, missingTables: ['ekskul', 'kriteria_nilai_ekskul', 'nilai_ekskul_siswa'] }
  }
}

// ─── 1. Kriteria Nilai Helpers (Pramuka & Umum) ──────────────────────────────
export async function getKriteriaEkskul(tahunAjaranId = null) {
  let pramukaResult = [...DEFAULT_KRITERIA_PRAMUKA]
  let umumResult = [...DEFAULT_KRITERIA_UMUM]

  try {
    let query = supabase.from('kriteria_nilai_ekskul').select('*').order('predikat')
    const { data, error } = await query
    if (!error && data && data.length > 0) {
      const dbPramuka = data.filter(k => k.kategori === 'pramuka')
      const dbUmum = data.filter(k => !k.kategori || k.kategori === 'umum')

      if (dbPramuka.length > 0) pramukaResult = dbPramuka
      if (dbUmum.length > 0) umumResult = dbUmum

      try {
        localStorage.setItem(STORAGE_KEYS.KRITERIA_PRAMUKA, JSON.stringify(pramukaResult))
        localStorage.setItem(STORAGE_KEYS.KRITERIA_UMUM, JSON.stringify(umumResult))
      } catch (e) {}

      return { pramuka: pramukaResult, umum: umumResult }
    }
  } catch (err) {
    // Fallback to localStorage
  }

  // Fallback LocalStorage
  try {
    const rawPramuka = localStorage.getItem(STORAGE_KEYS.KRITERIA_PRAMUKA)
    if (rawPramuka) {
      const parsed = JSON.parse(rawPramuka)
      if (Array.isArray(parsed) && parsed.length > 0) pramukaResult = parsed
    }
    const rawUmum = localStorage.getItem(STORAGE_KEYS.KRITERIA_UMUM) || localStorage.getItem(STORAGE_KEYS.KRITERIA)
    if (rawUmum) {
      const parsed = JSON.parse(rawUmum)
      if (Array.isArray(parsed) && parsed.length > 0) umumResult = parsed
    }
  } catch (e) {}

  return { pramuka: pramukaResult, umum: umumResult }
}

export async function saveKriteriaEkskul(kriteriaList, kategori = 'umum', tahunAjaranId = null) {
  const storageKey = kategori === 'pramuka' ? STORAGE_KEYS.KRITERIA_PRAMUKA : STORAGE_KEYS.KRITERIA_UMUM
  // Always save to localStorage as backup
  try {
    localStorage.setItem(storageKey, JSON.stringify(kriteriaList))
    if (kategori === 'umum') {
      localStorage.setItem(STORAGE_KEYS.KRITERIA, JSON.stringify(kriteriaList))
    }
  } catch (e) {}

  // Save to Supabase
  try {
    const payload = kriteriaList.map(k => ({
      predikat: k.predikat,
      kategori: kategori || 'umum',
      keterangan: k.keterangan,
      tahun_ajaran_id: tahunAjaranId || null
    }))
    // Attempt upsert on (predikat, kategori)
    const { error } = await supabase.from('kriteria_nilai_ekskul').upsert(payload, { onConflict: 'predikat,kategori' })
    if (error) {
      // If table doesn't have kategori constraint yet, try upsert on predikat
      const { error: errFb } = await supabase.from('kriteria_nilai_ekskul').upsert(payload, { onConflict: 'predikat' })
      if (errFb) throw errFb
    }
  } catch (err) {
    console.warn('Supabase kriteria_nilai_ekskul save fallback to localStorage:', err)
    throw err
  }
}

// ─── 2. Master Ekskul List Helpers ───────────────────────────────────────────
export async function getMasterEkskul(tahunAjaranId = null) {
  let localExtra = {}
  try {
    const rawExtra = localStorage.getItem('ebudimulia_ekskul_guru_assignments')
    if (rawExtra) localExtra = JSON.parse(rawExtra)
  } catch (e) {}

  try {
    let query = supabase.from('ekskul').select('*').order('nama')
    const { data, error } = await query
    if (!error && data && data.length > 0) {
      const merged = data.map(item => {
        const extra = localExtra[item.id] || localExtra[(item.nama || '').trim().toLowerCase()] || {}
        return {
          ...item,
          guru_id: item.guru_id || extra.guru_id || null,
          guru_nama: item.guru_nama || extra.guru_nama || item.pembina || null
        }
      })
      try {
        localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(merged))
      } catch (e) {}
      return merged
    }
  } catch (err) {}

  // Fallback LocalStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {}

  return DEFAULT_MASTER_EKSKUL
}

export async function createMasterEkskulItem(item, tahunAjaranId = null) {
  const payload = {
    nama: item.nama?.trim(),
    jenis: item.jenis || 'pilihan',
    pembina: item.pembina?.trim() || item.guru_nama?.trim() || '',
    hari: item.hari?.trim() || '',
    waktu: item.waktu?.trim() || '',
    tahun_ajaran_id: tahunAjaranId || null
  }

  // Save guru assignment extra
  try {
    const rawExtra = localStorage.getItem('ebudimulia_ekskul_guru_assignments')
    const extraStore = rawExtra ? JSON.parse(rawExtra) : {}
    const key = (item.nama || '').trim().toLowerCase()
    extraStore[key] = {
      guru_id: item.guru_id || null,
      guru_nama: item.guru_nama || item.pembina || null
    }
    localStorage.setItem('ebudimulia_ekskul_guru_assignments', JSON.stringify(extraStore))
  } catch (e) {}

  // Attempt Supabase insert
  try {
    const { data, error } = await supabase.from('ekskul').insert([payload]).select().single()
    if (!error && data) {
      const enriched = {
        ...data,
        guru_id: item.guru_id || null,
        guru_nama: item.guru_nama || item.pembina || null
      }
      // Refresh local storage
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
        const current = raw ? JSON.parse(raw) : [...DEFAULT_MASTER_EKSKUL]
        const updated = [...current.filter(e => e.nama !== payload.nama), enriched]
        localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
      } catch (e) {}
      return enriched
    }
    if (error) {
      console.warn('Supabase insert ekskul error, fallback to local:', error.message)
    }
  } catch (err) {
    console.warn('Supabase insert ekskul exception:', err)
  }

  // Local fallback
  const newItem = {
    id: 'ekskul-' + Date.now(),
    ...payload,
    guru_id: item.guru_id || null,
    guru_nama: item.guru_nama || item.pembina || null
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    const current = raw ? JSON.parse(raw) : [...DEFAULT_MASTER_EKSKUL]
    const updated = [...current.filter(e => e.nama !== payload.nama), newItem]
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
  } catch (e) {}
  return newItem
}

export async function updateMasterEkskulItem(id, item, tahunAjaranId = null) {
  const payload = {
    nama: item.nama?.trim(),
    jenis: item.jenis || 'pilihan',
    pembina: item.pembina?.trim() || item.guru_nama?.trim() || '',
    hari: item.hari?.trim() || '',
    waktu: item.waktu?.trim() || ''
  }

  // Save guru assignment extra
  try {
    const rawExtra = localStorage.getItem('ebudimulia_ekskul_guru_assignments')
    const extraStore = rawExtra ? JSON.parse(rawExtra) : {}
    const keyById = String(id || '').trim().toLowerCase()
    const keyByNama = (item.nama || '').trim().toLowerCase()
    const extraData = {
      guru_id: item.guru_id || null,
      guru_nama: item.guru_nama || item.pembina || null
    }
    if (keyById) extraStore[keyById] = extraData
    if (keyByNama) extraStore[keyByNama] = extraData
    localStorage.setItem('ebudimulia_ekskul_guru_assignments', JSON.stringify(extraStore))
  } catch (e) {}

  const isUuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  try {
    if (isUuid) {
      const { data, error } = await supabase.from('ekskul').update(payload).eq('id', id).select().single()
      if (!error && data) {
        const enriched = {
          ...data,
          guru_id: item.guru_id || null,
          guru_nama: item.guru_nama || item.pembina || null
        }
        // Update local storage
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
          const current = raw ? JSON.parse(raw) : [...DEFAULT_MASTER_EKSKUL]
          const updated = current.map(e => e.id === id ? enriched : e)
          localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
        } catch (e) {}
        return enriched
      }
    } else {
      // Fallback update / upsert by nama
      const { data, error } = await supabase.from('ekskul').upsert({ ...payload, nama: item.nama }, { onConflict: 'nama' }).select().single()
      if (!error && data) return data
    }
  } catch (err) {
    console.warn('Supabase update ekskul exception:', err)
  }

  // Local fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    const current = raw ? JSON.parse(raw) : [...DEFAULT_MASTER_EKSKUL]
    const updated = current.map(e => (e.id === id || e.nama === item.nama) ? {
      ...e,
      ...payload,
      guru_id: item.guru_id || e.guru_id || null,
      guru_nama: item.guru_nama || e.guru_nama || item.pembina || null
    } : e)
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
  } catch (e) {}
}

export async function deleteMasterEkskulItem(id, nama) {
  const isUuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  try {
    if (isUuid) {
      await supabase.from('ekskul').delete().eq('id', id)
    } else if (nama) {
      await supabase.from('ekskul').delete().eq('nama', nama)
    }
  } catch (err) {
    console.warn('Supabase delete ekskul failed:', err)
  }

  // Delete from local storage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    const current = raw ? JSON.parse(raw) : [...DEFAULT_MASTER_EKSKUL]
    const updated = current.filter(e => e.id !== id && e.nama !== nama)
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
  } catch (e) {}

  // Delete from guru assignments store
  try {
    const rawExtra = localStorage.getItem('ebudimulia_ekskul_guru_assignments')
    if (rawExtra) {
      const extraStore = JSON.parse(rawExtra)
      if (id) delete extraStore[String(id).toLowerCase()]
      if (nama) delete extraStore[String(nama).trim().toLowerCase()]
      localStorage.setItem('ebudimulia_ekskul_guru_assignments', JSON.stringify(extraStore))
    }
  } catch (e) {}
}

export async function deleteAllMasterEkskul(keepPramuka = false) {
  try {
    const { data, error } = await supabase.from('ekskul').select('id, nama, jenis')
    if (!error && data && data.length > 0) {
      const itemsToDelete = keepPramuka
        ? data.filter(e => e.nama?.toLowerCase() !== 'pramuka' && e.jenis !== 'wajib')
        : data
      
      const idsToDelete = itemsToDelete.map(e => e.id).filter(Boolean)
      if (idsToDelete.length > 0) {
        await supabase.from('ekskul').delete().in('id', idsToDelete)
      }
    }
  } catch (err) {
    console.warn('Supabase deleteAllMasterEkskul failed:', err)
  }

  // Delete from local storage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    const current = raw ? JSON.parse(raw) : []
    const updated = keepPramuka
      ? current.filter(e => e.nama?.toLowerCase() === 'pramuka' || e.jenis === 'wajib')
      : []
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
  } catch (e) {}
}

export async function deleteBatchMasterEkskul(items = []) {
  if (!items || items.length === 0) return
  const ids = items.map(i => i.id).filter(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  const names = items.map(i => i.nama).filter(Boolean)

  try {
    if (ids.length > 0) {
      await supabase.from('ekskul').delete().in('id', ids)
    }
    if (names.length > 0) {
      await supabase.from('ekskul').delete().in('nama', names)
    }
  } catch (err) {
    console.warn('Supabase deleteBatchMasterEkskul failed:', err)
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER)
    const current = raw ? JSON.parse(raw) : []
    const itemIds = new Set(items.map(i => i.id))
    const itemNames = new Set(items.map(i => i.nama))
    const updated = current.filter(e => !itemIds.has(e.id) && !itemNames.has(e.nama))
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(updated))
  } catch (e) {}
}


export async function saveMasterEkskul(ekskulList, tahunAjaranId = null) {
  try {
    localStorage.setItem(STORAGE_KEYS.MASTER, JSON.stringify(ekskulList))
  } catch (e) {}

  try {
    const payload = ekskulList.map(e => ({
      nama: e.nama,
      jenis: e.jenis || 'pilihan',
      pembina: e.pembina || '',
      hari: e.hari || '',
      waktu: e.waktu || '',
      tahun_ajaran_id: tahunAjaranId || null
    }))
    await supabase.from('ekskul').upsert(payload, { onConflict: 'nama' })
  } catch (err) {
    console.warn('Supabase ekskul master save fallback to localStorage')
  }
}

// ─── 3. Nilai Siswa Ekskul Helpers ───────────────────────────────────────────
export async function getNilaiEkskulKelas(kelas, semesterId = null, tahunAjaranId = null) {
  let dbResults = []
  try {
    let query = supabase.from('nilai_ekskul_siswa').select('*').eq('kelas', kelas)
    if (semesterId) query = query.eq('semester_id', semesterId)
    if (tahunAjaranId) query = query.eq('tahun_ajaran_id', tahunAjaranId)
    const { data, error } = await query
    if (!error && data) {
      dbResults = data
    }
  } catch (err) {}

  // Merge with localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NILAI)
    const localStore = raw ? JSON.parse(raw) : {}
    const key = `${kelas}_${semesterId || 'default'}_${tahunAjaranId || 'default'}`
    const localKelasData = localStore[key] || {}

    // Map by siswa_nisn
    const resultMap = {}
    dbResults.forEach(r => {
      resultMap[String(r.siswa_nisn)] = r
    })
    Object.entries(localKelasData).forEach(([nisn, r]) => {
      if (!resultMap[nisn]) {
        resultMap[nisn] = r
      } else {
        resultMap[nisn] = { ...resultMap[nisn], ...r }
      }
    })

    return resultMap
  } catch (e) {
    const resultMap = {}
    dbResults.forEach(r => {
      resultMap[String(r.siswa_nisn)] = r
    })
    return resultMap
  }
}

export async function getAllNilaiEkskul(semesterId = null, tahunAjaranId = null) {
  let dbResults = []
  try {
    let query = supabase.from('nilai_ekskul_siswa').select('*')
    if (semesterId) query = query.eq('semester_id', semesterId)
    if (tahunAjaranId) query = query.eq('tahun_ajaran_id', tahunAjaranId)
    const { data, error } = await query
    if (!error && data) {
      dbResults = data
    }
  } catch (err) {}

  // Merge with localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NILAI)
    const localStore = raw ? JSON.parse(raw) : {}
    const resultMap = {}

    dbResults.forEach(r => {
      resultMap[String(r.siswa_nisn)] = r
    })

    // Search keys matching semester/ta
    Object.entries(localStore).forEach(([k, records]) => {
      if (typeof records === 'object' && records !== null) {
        Object.entries(records).forEach(([nisn, r]) => {
          if (!resultMap[nisn]) {
            resultMap[nisn] = r
          } else {
            resultMap[nisn] = { ...resultMap[nisn], ...r }
          }
        })
      }
    })

    return resultMap
  } catch (e) {
    const resultMap = {}
    dbResults.forEach(r => {
      resultMap[String(r.siswa_nisn)] = r
    })
    return resultMap
  }
}

export async function saveNilaiEkskulSingle(payload) {
  const { kelas, semester_id, tahun_ajaran_id, siswa_nisn } = payload

  // Save to LocalStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NILAI)
    const localStore = raw ? JSON.parse(raw) : {}
    const key = `${kelas}_${semester_id || 'default'}_${tahun_ajaran_id || 'default'}`
    if (!localStore[key]) localStore[key] = {}
    localStore[key][String(siswa_nisn)] = {
      ...(localStore[key][String(siswa_nisn)] || {}),
      ...payload,
      updated_at: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEYS.NILAI, JSON.stringify(localStore))
  } catch (e) {}

  // Attempt Supabase
  try {
    const { error } = await supabase.from('nilai_ekskul_siswa').upsert(payload, {
      onConflict: 'siswa_nisn,tahun_ajaran_id,semester_id'
    })
    if (error) throw error
  } catch (err) {
    console.warn('Supabase nilai_ekskul_siswa save fallback to localStorage')
    throw err
  }
}

export async function saveNilaiEkskulBatch(records, kelas, semesterId = null, tahunAjaranId = null) {
  // Save to LocalStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NILAI)
    const localStore = raw ? JSON.parse(raw) : {}
    const key = `${kelas}_${semesterId || 'default'}_${tahunAjaranId || 'default'}`
    if (!localStore[key]) localStore[key] = {}

    records.forEach(rec => {
      localStore[key][String(rec.siswa_nisn)] = {
        ...(localStore[key][String(rec.siswa_nisn)] || {}),
        ...rec,
        updated_at: new Date().toISOString()
      }
    })
    localStorage.setItem(STORAGE_KEYS.NILAI, JSON.stringify(localStore))
  } catch (e) {}

  // Attempt Supabase batch upsert
  try {
    const { error } = await supabase.from('nilai_ekskul_siswa').upsert(records, {
      onConflict: 'siswa_nisn,tahun_ajaran_id,semester_id'
    })
    if (error) {
      console.warn('Supabase batch nilai_ekskul_siswa save error:', error.message)
      throw error
    }
  } catch (err) {
    console.warn('Supabase batch nilai_ekskul_siswa save fallback to localStorage')
    throw err
  }
}

// ─── 4. Smart Ekskul Normalizer & Alias Matcher Engine ────────────────────────
export const COMMON_EKSKUL_ALIASES = [
  {
    targetKeywords: ['pmr', 'palang merah'],
    keywords: ['pmr', 'palang merah', 'palang merah remaja', 'p.m.r', 'p.m.r.'],
    defaultCanonical: 'Palang Merah Remaja (PMR)'
  },
  {
    targetKeywords: ['tik', 'komputer'],
    keywords: ['tik', 'komputer', 'tik/komputer', 'tik / komputer', 'it', 'informatika', 't.i.k', 'computer', 'komp'],
    defaultCanonical: 'TIK/Komputer'
  },
  {
    targetKeywords: ['bulu tangkis', 'bulutangkis', 'badminton'],
    keywords: ['bulutangkis', 'bulu tangkis', 'badminton', 'balu tangkis', 'b tangkis', 'bulu tagkis', 'badminto', 'bulutangis'],
    defaultCanonical: 'Bulu Tangkis'
  },
  {
    targetKeywords: ['voli', 'volly'],
    keywords: ['voli', 'bola voli', 'volly', 'volleyball', 'voli putri', 'voli putra'],
    defaultCanonical: 'Voli'
  },
  {
    targetKeywords: ['basket'],
    keywords: ['basket', 'bola basket', 'basket putri', 'basket putra', 'baskeg', 'baskeg putri', 'baskeg putra', 'bsket', 'baskt'],
    defaultCanonical: 'Basket'
  },
  {
    targetKeywords: ['futsal', 'sepak bola'],
    keywords: ['futsal', 'sepak bola', 'sepakbola', 'futsal putra', 'futsal putri', 'futsall'],
    defaultCanonical: 'Futsal'
  },
  {
    targetKeywords: ['paduan suara', 'padus', 'vocal', 'vokal'],
    keywords: ['padus', 'paduan suara', 'vocal', 'vokal', 'paduan suara (vocal)', 'choir', 'paduan suara vokal'],
    defaultCanonical: 'Paduan Suara'
  },
  {
    targetKeywords: ['modern dance', 'dance'],
    keywords: ['modern dance', 'dance', 'md', 'm.d', 'm.d.', 'moderndance', 'moderdance'],
    defaultCanonical: 'Modern Dance'
  },
  {
    targetKeywords: ['tari'],
    keywords: ['tari', 'tari kreasi', 'tari tradisional', 'tari modern', 'seni tari'],
    defaultCanonical: 'Tari Kreasi'
  },
  {
    targetKeywords: ['band'],
    keywords: ['band', 'grup band', 'music band'],
    defaultCanonical: 'Band'
  },
  {
    targetKeywords: ['ansambel'],
    keywords: ['ansambel', 'ansambel musik', 'ensemble'],
    defaultCanonical: 'Ansambel'
  },
  {
    targetKeywords: ['melukis', 'lukis'],
    keywords: ['melukis', 'lukis', 'seni lukis', 'menggambar', 'seni rupa', 'gambar'],
    defaultCanonical: 'Melukis'
  },
  {
    targetKeywords: ['karate', 'silat', 'taekwondo'],
    keywords: ['karate', 'silat', 'taekwondo', 'bela diri'],
    defaultCanonical: 'Karate'
  },
  {
    targetKeywords: ['teater', 'drama'],
    keywords: ['teater', 'drama', 'theatre', 'seni peran'],
    defaultCanonical: 'Teater'
  },
  {
    targetKeywords: ['jurnalistik', 'jurnalis'],
    keywords: ['jurnalistik', 'jurnalis', 'wartawan', 'mading'],
    defaultCanonical: 'Jurnalistik'
  },
  {
    targetKeywords: ['bina iman', 'iman katolik'],
    keywords: ['bina iman', 'bina iman katolik', 'bik', 'iman katolik'],
    defaultCanonical: 'Bina Iman Katolik'
  },
  {
    targetKeywords: ['katekumen'],
    keywords: ['katekumen', 'katekisasi', 'katekese'],
    defaultCanonical: 'Katekumen'
  },
  {
    targetKeywords: ['coding', 'robotik'],
    keywords: ['coding', 'robotik', 'robotika', 'robotika & coding', 'pemrograman'],
    defaultCanonical: 'Coding'
  },
  {
    targetKeywords: ['cooking', 'boga'],
    keywords: ['cooking', 'tata boga', 'masak', 'memasak', 'kuliner'],
    defaultCanonical: 'Cooking'
  },
  {
    targetKeywords: ['english'],
    keywords: ['english', 'english club', 'speech', 'bahasa inggris', 'inggris'],
    defaultCanonical: 'English Club & Speech'
  },
  {
    targetKeywords: ['pramuka'],
    keywords: ['pramuka', 'scout'],
    defaultCanonical: 'Pramuka'
  }
]

export function calculateLevenshteinSimilarity(str1, str2) {
  if (!str1 || !str2) return 0
  const s1 = String(str1).toLowerCase().trim()
  const s2 = String(str2).toLowerCase().trim()
  if (s1 === s2) return 1.0

  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0 || len2 === 0) return 0

  const track = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null))

  for (let i = 0; i <= len1; i += 1) track[0][i] = i
  for (let j = 0; j <= len2; j += 1) track[j][0] = j

  for (let j = 1; j <= len2; j += 1) {
    for (let i = 1; i <= len1; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      )
    }
  }

  const distance = track[len2][len1]
  const maxLen = Math.max(len1, len2)
  return 1 - (distance / maxLen)
}

function matchesTargetKeywords(mNama, targetKeywords) {
  const mLower = (mNama || '').toLowerCase()
  const tokens = mLower.split(/[\s\/\(\),.-]+/).filter(Boolean)
  return targetKeywords.some(tk => {
    if (tk.length <= 3) {
      return tokens.includes(tk)
    }
    return mLower.includes(tk)
  })
}

export function isIgnoredEkskulText(rawVal) {
  if (rawVal === undefined || rawVal === null) return true
  const clean = String(rawVal).trim()
  if (!clean || clean === '' || clean === '0' || clean === '-' || clean === '--') return true
  const lower = clean.toLowerCase()
  const ignorePhrases = ['tidak ada', 'kosong', 'none', 'null', 'tdk ikut', 'tidak ikut', 'tdk', 'tidak', '0']
  if (ignorePhrases.includes(lower) || lower.startsWith('tdk jd') || lower.startsWith('tidak ikut') || /^0+$/.test(lower)) {
    return true
  }
  return false
}

export function getBestEkskulMatch(rawVal, masterEkskulList = []) {
  if (isIgnoredEkskulText(rawVal)) {
    return { target: '', isIgnore: true, label: 'Kosong / Tidak Ikut', isAuto: true, confidence: 'high', needsReview: false }
  }

  const clean = String(rawVal).trim()
  const lower = clean.toLowerCase()
  const cleanWords = lower.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim()

  // 1. Exact match in masterEkskulList
  const exact = masterEkskulList.find(m => (m.nama || '').trim().toLowerCase() === lower)
  if (exact) {
    return { target: exact.nama, isIgnore: false, isAuto: true, confidence: 'high', matchType: 'exact', needsReview: false }
  }

  // 2. Direct exact alias match (e.g. acronyms or direct keyword like 'md', 'pmr', 'tik', 'baskeg putri')
  for (const group of COMMON_EKSKUL_ALIASES) {
    const hasExactKeyword = group.keywords.some(k => k === lower || k === cleanWords)
    if (hasExactKeyword) {
      const foundInMaster = masterEkskulList.find(m => matchesTargetKeywords(m.nama, group.targetKeywords))
      if (foundInMaster) {
        // If the exact keyword matched was a known typo (e.g. baskeg putri, balu tangkis), mark as needsReview: true
        const isKnownTypo = ['baskeg', 'baskeg putri', 'baskeg putra', 'balu tangkis', 'bulu tagkis', 'futsall'].includes(lower)
        return {
          target: foundInMaster.nama,
          isIgnore: false,
          isAuto: true,
          confidence: isKnownTypo ? 'medium' : 'high',
          matchType: 'alias-exact',
          isTypoCandidate: isKnownTypo,
          needsReview: isKnownTypo
        }
      }
      return {
        target: group.defaultCanonical,
        isIgnore: false,
        isAuto: false,
        confidence: 'medium',
        matchType: 'alias-default',
        needsReview: true
      }
    }
  }

  // 3. Multi-word phrase or substring in alias keywords
  for (const group of COMMON_EKSKUL_ALIASES) {
    const hasPhrase = group.keywords.some(k => {
      if (k.length < 3) return false
      return lower.includes(k) || (k.length >= 4 && k.includes(lower))
    })
    if (hasPhrase) {
      const foundInMaster = masterEkskulList.find(m => matchesTargetKeywords(m.nama, group.targetKeywords))
      if (foundInMaster) {
        return {
          target: foundInMaster.nama,
          isIgnore: false,
          isAuto: true,
          confidence: 'high',
          matchType: 'alias-phrase',
          needsReview: false
        }
      }
    }
  }

  // 4. Substring match directly against masterEkskulList (min length 4)
  if (lower.length >= 4) {
    const substring = masterEkskulList.find(m => {
      const mLower = (m.nama || '').trim().toLowerCase()
      return mLower.includes(lower) || (mLower.length >= 4 && lower.includes(mLower))
    })
    if (substring) {
      return {
        target: substring.nama,
        isIgnore: false,
        isAuto: true,
        confidence: 'high',
        matchType: 'substring',
        needsReview: false
      }
    }
  }

  // 5. Fuzzy / Levenshtein Typo Matcher against masterEkskulList and alias keywords
  let bestCandidate = null
  let highestSimilarity = 0

  for (const m of masterEkskulList) {
    const mNamaLower = (m.nama || '').trim().toLowerCase()
    const simFull = calculateLevenshteinSimilarity(lower, mNamaLower)
    const rawParts = lower.split(/\s+/)
    const mParts = mNamaLower.split(/\s+/)
    let maxPartSim = 0
    for (const rp of rawParts) {
      for (const mp of mParts) {
        if (rp.length >= 3 && mp.length >= 3) {
          const sim = calculateLevenshteinSimilarity(rp, mp)
          if (sim > maxPartSim) maxPartSim = sim
        }
      }
    }
    const score = Math.max(simFull, maxPartSim)
    if (score > highestSimilarity) {
      highestSimilarity = score
      bestCandidate = m
    }
  }

  // Also check similarity against group keywords
  for (const group of COMMON_EKSKUL_ALIASES) {
    for (const kw of group.keywords) {
      if (kw.length >= 4) {
        const sim = calculateLevenshteinSimilarity(lower, kw)
        if (sim > highestSimilarity) {
          const found = masterEkskulList.find(m => matchesTargetKeywords(m.nama, group.targetKeywords))
          if (found) {
            highestSimilarity = sim
            bestCandidate = found
          }
        }
      }
    }
  }

  if (bestCandidate && highestSimilarity >= 0.70) {
    return {
      target: bestCandidate.nama,
      isIgnore: false,
      isAuto: highestSimilarity >= 0.85,
      confidence: highestSimilarity >= 0.85 ? 'medium' : 'low',
      matchType: 'fuzzy-typo',
      isTypoCandidate: true,
      similarity: highestSimilarity,
      needsReview: true
    }
  }

  // 6. Unmatched - NO fallback capitalization into master!
  return {
    target: '',
    isIgnore: false,
    isAuto: false,
    confidence: 'none',
    matchType: 'unmatched',
    isUnmatched: true,
    needsReview: true
  }
}

