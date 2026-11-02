import { supabase } from '../../supabaseClient'

/**
 * Daftar Rombel Standar SMP Budi Mulia (Lengkap Rombel A sampai D)
 */
export const DEFAULT_KELAS_LIST = [
  '7A', '7B', '7C', '7D',
  '8A', '8B', '8C', '8D',
  '9A', '9B', '9C', '9D',
  'Test'
]

/**
 * Mengambil daftar seluruh kelas yang terdaftar pada Tahun Ajaran yang sedang Aktif.
 * Memadukan data dari tabel `enrollment` & `master_kelas`, dengan fallback lengkap A-D.
 */
export async function fetchActiveTahunAjaranClasses() {
  try {
    // 1. Ambil Tahun Ajaran Aktif
    const { data: activeTa, error: taErr } = await supabase
      .from('tahun_ajaran')
      .select('id, nama')
      .eq('is_aktif', true)
      .maybeSingle()

    if (taErr || !activeTa) {
      return { activeTa: null, classes: DEFAULT_KELAS_LIST }
    }

    // 2. Ambil kelas dari enrollment pada tahun ajaran aktif
    const { data: enrolls } = await supabase
      .from('enrollment')
      .select('kelas')
      .eq('tahun_ajaran_id', activeTa.id)

    // 3. Ambil kelas dari master_kelas jika tersedia
    let listMaster = []
    try {
      const { data: masterKls } = await supabase
        .from('master_kelas')
        .select('nama_kelas')
        .eq('tahun_ajaran_id', activeTa.id)

      if (masterKls) {
        listMaster = masterKls.map(mk => mk.nama_kelas).filter(Boolean)
      }
    } catch {
      // Abaikan jika master_kelas belum ada
    }

    const listEnroll = enrolls ? enrolls.map(e => e.kelas).filter(Boolean) : []
    const combined = [...new Set([...listEnroll, ...listMaster])].filter(Boolean)

    if (combined.length > 0) {
      // Pastikan kelas valid dari tahun ajaran aktif dikembalikan (tanpa memfilter kelas 'Test')
      const uniqueMap = new Map()
      combined.forEach(c => {
        const trimmed = String(c).trim()
        if (trimmed && !['undefined', 'null', '-', '', 'none'].includes(trimmed.toLowerCase())) {
          const lower = trimmed.toLowerCase()
          if (!uniqueMap.has(lower)) {
            uniqueMap.set(lower, trimmed)
          }
        }
      })

      const cleaned = Array.from(uniqueMap.values())
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

      return { activeTa, classes: cleaned.length > 0 ? cleaned : DEFAULT_KELAS_LIST }
    }

    return { activeTa, classes: DEFAULT_KELAS_LIST }
  } catch (err) {
    console.warn('[cbtKelasHelper] Gagal mengambil kelas tahun ajaran aktif:', err)
    return { activeTa: null, classes: DEFAULT_KELAS_LIST }
  }
}
