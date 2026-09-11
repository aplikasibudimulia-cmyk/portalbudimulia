/**
 * studentExcelHelper.js
 * Utility terpusat untuk Download Template Excel Siswa & Alamat (Kartu Pelajar + Multi-Kontak Ortu)
 * serta parsing dan sinkronisasi data ke database Supabase (siswa_permanent & enrollment).
 */
import * as XLSX from 'xlsx'
import { downloadWorkbook } from './fileDownloader'
import { supabase } from '../supabaseClient'

export const STUDENT_EXCEL_HEADERS = [
  'NISN',
  'NAMA LENGKAP',
  'JENIS KELAMIN',
  'KELAS',
  'TEMPAT LAHIR',
  'TANGGAL LAHIR',
  'ALAMAT',
  'RT/RW',
  'KELURAHAN',
  'KECAMATAN',
  'KOTA',
  'NO HP SISWA',
  'NAMA AYAH',
  'NO HP AYAH',
  'NAMA IBU',
  'NO HP IBU',
  'NAMA WALI',
  'NO HP WALI',
  'NO HP ORANG TUA'
]

/**
 * Format string nomor telepon ke format bersih internasional/nasional (diawali 62 atau 08)
 */
export const cleanPhone = (val) => {
  if (!val) return ''
  let cleaned = String(val).replace(/[^0-9]/g, '')
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2)
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.slice(1)
  }
  return cleaned
}

/**
 * Ubah teks menjadi Title Case (Huruf pertama setiap kata besar, sisanya kecil)
 * Contoh: "JAKARTA BARAT" -> "Jakarta Barat", "aditya pratama" -> "Aditya Pratama"
 */
export const toTitleCase = (str) => {
  if (!str) return ''
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s\-\/\.,'’(])[a-z]/g, (m) => m.toUpperCase())
}

/**
 * Format string tanggal dari Excel (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, atau Date Object) ke format standar YYYY-MM-DD
 */
export const parseDateToIso = (val) => {
  if (!val) return ''

  // 1. Jika sudah berformat YYYY-MM-DD (seperti pada Excel user 2014-07-15), langsung kembalikan tanpa pergeseran zona waktu
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }
    // Format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0')
      const month = dmyMatch[2].padStart(2, '0')
      const year = dmyMatch[3]
      return `${year}-${month}-${day}`
    }
  }

  // 2. Jika Date object (bawaan dari XLSX cellDates: true)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const year = val.getFullYear()
    const month = String(val.getMonth() + 1).padStart(2, '0')
    const day = String(val.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 3. Jika nomor serial Excel
  if (typeof val === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(excelEpoch.getTime() + val * 86400000)
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear()
      const month = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  // 4. Fallback jika string tanggal lain
  try {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch {}

  return String(val).trim()
}

/**
 * Format alamat agar rapi dengan huruf kapital di awal kata dan singkatan standar (Jl., No., Gg., RT, RW)
 */
export const formatAlamatJalan = (str) => {
  if (!str) return ''
  const s = String(str).trim()
  // Jika all uppercase atau all lowercase, rapikan dengan Title Case
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    let title = toTitleCase(s)
    title = title
      .replace(/\bJl\b/gi, 'Jl.')
      .replace(/\bJln\b/gi, 'Jl.')
      .replace(/\bNo\b/gi, 'No.')
      .replace(/\bRt\b/gi, 'RT')
      .replace(/\bRw\b/gi, 'RW')
      .replace(/\bGang\b/gi, 'Gg.')
      .replace(/\bGg\b/gi, 'Gg.')
      .replace(/\bKp\b/gi, 'Kp.')
      .replace(/\bBlok\b/gi, 'Blok')
    return title
  }
  return s
}

/**
 * Format string RT/RW ke format resmi standar "RT. 002/RW. 001"
 * Contoh: "2/1", "02/01", "002/001", "RT 02 RW 01", "RT.02/RW.01", "RT/RW 2/1", "2-Jan" -> "RT. 002/RW. 001"
 */

// Peta nama bulan untuk mendeteksi tanggal yang dikonversi otomatis oleh Excel (misal: "2-Jan", "01-Feb", "15-Des")
const MONTH_NAME_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5,
  jun: 6, jul: 7, ags: 8, agu: 8, aug: 8, sep: 9,
  okt: 10, oct: 10, nov: 11, des: 12, dec: 12
}

export const formatRtRw = (raw) => {
  if (raw === undefined || raw === null || raw === '') return ''

  // 1. Jika Excel mengubah "2/1" atau "02/01" menjadi Date object (cellDates: true)
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const d = raw.getDate()
    const m = raw.getMonth() + 1
    return `RT. ${String(d).padStart(3, '0')}/RW. ${String(m).padStart(3, '0')}`
  }

  // 2. Jika nomor serial tanggal Excel (misal 46024 = 2 Jan 2026 saat user mengetik 2/1)
  if (typeof raw === 'number') {
    if (raw >= 1000 && raw <= 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30))
      const d = new Date(excelEpoch.getTime() + Math.round(raw) * 86400000)
      if (!isNaN(d.getTime())) {
        const day = d.getUTCDate()
        const month = d.getUTCMonth() + 1
        return `RT. ${String(day).padStart(3, '0')}/RW. ${String(month).padStart(3, '0')}`
      }
    }
    // Jika angka biasa (misal 2 atau 10)
    return `RT. ${String(Math.round(raw)).padStart(3, '0')}`
  }

  const str = String(raw).trim()
  if (!str) return ''

  // 3. Jika berupa string tanggal dari Excel dengan nama bulan (misal "2-Jan", "02-Jan", "1-Feb", "01-Feb-2026", "15-Des")
  const monthMatch1 = str.match(/^(\d{1,2})[\s\-\/]+([a-zA-Z]{3,4})(?:[\s\-\/]+\d{2,4})?$/)
  const monthMatch2 = str.match(/^([a-zA-Z]{3,4})[\s\-\/]+(\d{1,2})(?:[\s\-\/]+\d{2,4})?$/)
  if (monthMatch1) {
    const day = parseInt(monthMatch1[1], 10)
    const month = MONTH_NAME_MAP[monthMatch1[2].toLowerCase().slice(0, 3)]
    if (day && month) {
      return `RT. ${String(day).padStart(3, '0')}/RW. ${String(month).padStart(3, '0')}`
    }
  } else if (monthMatch2) {
    const month = MONTH_NAME_MAP[monthMatch2[1].toLowerCase().slice(0, 3)]
    const day = parseInt(monthMatch2[2], 10)
    if (day && month) {
      return `RT. ${String(day).padStart(3, '0')}/RW. ${String(month).padStart(3, '0')}`
    }
  }

  // 4. Jika berupa string ISO date dari Excel (misal "2026-01-02" atau "2026-02-01")
  const isoDateMatch = str.match(/^\d{4}-(\d{2})-(\d{2})/)
  if (isoDateMatch) {
    const m = parseInt(isoDateMatch[1], 10)
    const d = parseInt(isoDateMatch[2], 10)
    return `RT. ${String(d).padStart(3, '0')}/RW. ${String(m).padStart(3, '0')}`
  }

  // 5. Jika berupa string tanggal lengkap bawaan JS (misal "Fri Jan 02 2026...")
  if (str.length > 15 && !isNaN(Date.parse(str))) {
    try {
      const d = new Date(str)
      if (!isNaN(d.getTime())) {
        const day = d.getDate()
        const month = d.getMonth() + 1
        return `RT. ${String(day).padStart(3, '0')}/RW. ${String(month).padStart(3, '0')}`
      }
    } catch {}
  }

  // 6. Deteksi pola 2 angka untuk RT dan RW (misal: "2/1", "02/01", "002/001", "RT/RW 2/1", "RT. 02/RW. 01", "2-1")
  const match = str.match(/(?:(?:RT[\/\.]?RW|RT)[\s\.:]*)?(\d+)\s*[\/\-]\s*(?:RW[\s\.:]*)?(\d+)/i)
  if (match) {
    const rtNum = match[1].padStart(3, '0')
    const rwNum = match[2].padStart(3, '0')
    return `RT. ${rtNum}/RW. ${rwNum}`
  }

  // 7. Jika berupa format "RT 02 RW 01" atau "RT 2, RW 1"
  const separatedMatch = str.match(/RT[\s\.:]*(\d+)[\s,]+RW[\s\.:]*(\d+)/i)
  if (separatedMatch) {
    const rtNum = separatedMatch[1].padStart(3, '0')
    const rwNum = separatedMatch[2].padStart(3, '0')
    return `RT. ${rtNum}/RW. ${rwNum}`
  }

  // 8. Jika hanya nomor tunggal RT (misal "2" atau "002" atau "RT 02")
  const singleMatch = str.match(/^(?:RT[\.\s]*)?(\d+)$/i)
  if (singleMatch) {
    return `RT. ${singleMatch[1].padStart(3, '0')}`
  }

  // 9. Jika hanya RW (misal "RW 01" atau "RW 1")
  const singleRwMatch = str.match(/^RW[\.\s]*(\d+)$/i)
  if (singleRwMatch) {
    return `RW. ${singleRwMatch[1].padStart(3, '0')}`
  }

  return str
}

/**
 * Ekstrak nilai RT/RW secara cerdas dan fleksibel dari objek baris Excel
 * Menangani berbagai variasi nama kolom: RT/RW, RT / RW, RT_RW, RT-RW, maupun kolom RT dan RW terpisah
 */
export const extractRtRwFromRow = (row) => {
  if (!row || typeof row !== 'object') return ''

  const keys = Object.keys(row)

  // 1. Cek kolom gabungan RT/RW dengan normalisasi lengkap
  const combinedKey = keys.find(k => {
    const norm = k.toLowerCase().replace(/[\s_\-\.\/]/g, '')
    return norm === 'rtrw' || norm.includes('rtrw')
  })
  if (combinedKey && row[combinedKey] !== undefined && row[combinedKey] !== null && String(row[combinedKey]).trim()) {
    return row[combinedKey]
  }

  // 1b. Cek variasi yang menyertakan 'rt/rw' atau 'rt / rw'
  const slashKey = keys.find(k => {
    const lk = k.toLowerCase()
    return lk.includes('rt/rw') || lk.includes('rt / rw') || lk.includes('rt /rw') || lk.includes('rt/ rw')
  })
  if (slashKey && row[slashKey] !== undefined && row[slashKey] !== null && String(row[slashKey]).trim()) {
    return row[slashKey]
  }

  // 2. Cek kolom RT dan RW terpisah
  const rtKey = keys.find(k => {
    const norm = k.toLowerCase().trim()
    return norm === 'rt' || norm === 'no rt' || norm === 'no. rt' || norm === 'rt.' || norm === 'nomor rt'
  })
  const rwKey = keys.find(k => {
    const norm = k.toLowerCase().trim()
    return norm === 'rw' || norm === 'no rw' || norm === 'no. rw' || norm === 'rw.' || norm === 'nomor rw'
  })

  const rtVal = rtKey && row[rtKey] !== undefined && row[rtKey] !== null ? String(row[rtKey]).trim() : ''
  const rwVal = rwKey && row[rwKey] !== undefined && row[rwKey] !== null ? String(row[rwKey]).trim() : ''

  if (rtVal && rwVal) {
    return `${rtVal}/${rwVal}`
  }
  if (rtVal) {
    return rtVal
  }
  if (rwVal) {
    return rwVal
  }

  return ''
}

/**
 * Pisahkan string alamat menjadi nama jalan dan RT/RW jika ada
 * Mendukung format database lama ("..., RT/RW 13/7"), format resmi ("..., RT. 002/RW. 001"),
 * maupun format angka murni (", 002/001", ", 2/1")
 */
export const splitAlamatAndRtRw = (rawAlamat = '', rawRtRw = '') => {
  if (rawRtRw && String(rawRtRw).trim()) {
    return {
      jalan: String(rawAlamat || '').trim(),
      rtRw: formatRtRw(rawRtRw)
    }
  }

  const str = String(rawAlamat || '').trim()
  if (!str) return { jalan: '', rtRw: '' }

  // 1. Pola RT/RW lengkap dengan prefix RT atau RT/RW
  // Contoh: ", RT. 002/RW. 001", ", RT/RW 13/7", ", RT 02 RW 01", ", RT.02/RW.01"
  const p1 = /(?:,\s*|\s+)(?:(?:RT[\/\.]?RW|RT)[\s\.:]*(\d+)\s*[\/\-]\s*(?:RW[\s\.:]*)?(\d+)|RT[\s\.:]*(\d+)[\s,]+RW[\s\.:]*(\d+))/i
  const m1 = str.match(p1)
  if (m1) {
    const rt = (m1[1] || m1[3]).padStart(3, '0')
    const rw = (m1[2] || m1[4]).padStart(3, '0')
    const jalan = str.replace(m1[0], '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim()
    return {
      jalan,
      rtRw: `RT. ${rt}/RW. ${rw}`
    }
  }

  // 2. Pola angka murni setelah koma: ", 002/001" atau ", 2/1"
  const p2 = /(?:,\s*)(?:RT[\/\.]?RW[\s\.:]*)?(\d{1,3})\s*[\/\-]\s*(\d{1,3})(?=\s*,|\s*$)/i
  const m2 = str.match(p2)
  if (m2) {
    const rt = m2[1].padStart(3, '0')
    const rw = m2[2].padStart(3, '0')
    const jalan = str.replace(m2[0], '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim()
    return {
      jalan,
      rtRw: `RT. ${rt}/RW. ${rw}`
    }
  }

  // 3. Pola hanya RT tunggal: ", RT. 002" atau ", RT 2"
  const p3 = /(?:,\s*|\s+)RT[\s\.:]*(\d{1,3})(?=\s*,|\s*$)/i
  const m3 = str.match(p3)
  if (m3) {
    const rt = m3[1].padStart(3, '0')
    const jalan = str.replace(m3[0], '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim()
    return {
      jalan,
      rtRw: `RT. ${rt}`
    }
  }

  return {
    jalan: str,
    rtRw: ''
  }
}

/**
 * Gabungkan nama jalan dan RT/RW menjadi alamat lengkap yang rapi dan aman untuk database
 */
export const combineAlamatAndRtRw = (jalan = '', rtRw = '') => {
  const cleanJalan = String(jalan || '').trim()
  if (rtRw === undefined || rtRw === null || rtRw === '') return cleanJalan

  const formattedRt = formatRtRw(rtRw)
  if (!formattedRt) return cleanJalan

  // Cek apakah di dalam jalan SUDAH ADA pola RT/RW sungguhan (hindari salah deteksi kata seperti Jakarta, Kartini, Kertajaya)
  const rtRwPattern = /(?:(?:RT[\/\.]?RW|RT)[\s\.:]*\d+\s*[\/\-]\s*(?:RW[\s\.:]*)?(\d+)?|\bRT[\s\.:]*\d+|\bRW[\s\.:]*\d+)/i
  if (rtRwPattern.test(cleanJalan)) {
    // Jika jalan sudah ada tulisan RT/RW, gantikan dengan formattedRt yang baru
    return cleanJalan.replace(rtRwPattern, formattedRt)
  }

  // Jika jalan belum memiliki RT/RW, selalu sambungkan dengan formattedRt
  if (!cleanJalan) return formattedRt
  return `${cleanJalan}, ${formattedRt}`
}

/**
 * Download file Template Excel Siswa & Alamat
 * @param {Array} sampleStudents - Array siswa aktif untuk dijadikan baris sampel
 * @param {string} filename - Nama file yang diunduh
 */
export const downloadStudentTemplateExcel = async (sampleStudents = [], filename = 'Template_Siswa_Dan_Alamat.xlsx') => {
  const sampleRows = []

  if (sampleStudents && sampleStudents.length > 0) {
    // Filter dan deduplikasi siswa berdasarkan NISN agar tidak ada data berulang
    const seenNisns = new Set()
    const uniqueStudents = sampleStudents.filter(s => {
      const nisn = String(s.nisn || s.id || '').trim()
      if (!nisn) return true
      if (seenNisns.has(nisn)) return false
      seenNisns.add(nisn)
      return true
    })

    // Urutkan siswa berdasarkan Kelas lalu Nama
    const sortedStudents = [...uniqueStudents].sort((a, b) => {
      const classA = a.kelas || ''
      const classB = b.kelas || ''
      if (classA !== classB) return classA.localeCompare(classB)
      return (a.nama_lengkap || a.nama || '').localeCompare(b.nama_lengkap || b.nama || '')
    })

    // Masukkan seluruh siswa dengan data asli terpisah (kolom kosong siap diisi user)
    sortedStudents.forEach(s => {
      const kontakList = Array.isArray(s.kontak_ortu) ? s.kontak_ortu : []
      const kontakAyah = kontakList.find(k => k.tag?.toLowerCase() === 'ayah')
      const kontakIbu  = kontakList.find(k => k.tag?.toLowerCase() === 'ibu')
      const kontakWali = kontakList.find(k => k.tag?.toLowerCase() === 'wali')
      const kontakOrtu = kontakList.find(k => k.tag?.toLowerCase() === 'orang tua')

      const namaAyah = kontakAyah?.nama || ''
      const noHpAyah = cleanPhone(kontakAyah?.nomor) || ''
      const namaIbu  = kontakIbu?.nama  || ''
      const noHpIbu  = cleanPhone(kontakIbu?.nomor)  || ''
      const namaWali = kontakWali?.nama || ''
      const noHpWali = cleanPhone(kontakWali?.nomor) || ''
      const noHpOrtu = cleanPhone(kontakOrtu?.nomor || s.no_hp_ortu) || ''

      let tglStr = ''
      if (s.tanggal_lahir) {
        try {
          tglStr = new Date(s.tanggal_lahir).toISOString().split('T')[0]
        } catch {
          tglStr = String(s.tanggal_lahir)
        }
      }

      // Format Jenis Kelamin (L / P)
      const rawJk = String(s.jenis_kelamin || s.gender || '').trim().toUpperCase()
      const jkVal = rawJk.startsWith('L') ? 'L' : rawJk.startsWith('P') ? 'P' : (s.jenis_kelamin || '')

      // Pisahkan Alamat dan RT/RW jika ada
      const { jalan, rtRw } = splitAlamatAndRtRw(s.alamat, s.rt_rw)

      sampleRows.push([
        s.nisn || '',
        s.nama_lengkap || s.nama || '',
        jkVal,
        s.kelas || '',
        s.tempat_lahir || '',
        tglStr || '',
        jalan || '',
        rtRw || '',
        s.kelurahan || '',
        s.kecamatan || '',
        s.kota || '',
        cleanPhone(s.no_whatsapp || s.no_hp) || '',
        namaAyah,
        noHpAyah,
        namaIbu,
        noHpIbu,
        namaWali,
        noHpWali,
        noHpOrtu
      ])
    })
  } else {
    // Contoh dummy jika belum ada data
    sampleRows.push([
      '0098765432',
      'ADITYA PRATAMA',
      'L',
      '7A',
      'Jakarta',
      '2010-08-15',
      'Jl. Pangeran Tubagus Angke No.13',
      '06/02',
      'Jembatan Lima',
      'Tambora',
      'Jakarta Barat',
      '081234567890',
      'Hendra Pratama',
      '081398765432',
      'Siti Rahayu',
      '081387654321',
      '',
      '',
      '081398765432'
    ])
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([STUDENT_EXCEL_HEADERS, ...sampleRows])

  // Lebar kolom yang nyaman
  ws['!cols'] = [
    { wch: 14 }, // NISN
    { wch: 28 }, // NAMA LENGKAP
    { wch: 15 }, // JENIS KELAMIN
    { wch: 10 }, // KELAS
    { wch: 16 }, // TEMPAT LAHIR
    { wch: 14 }, // TANGGAL LAHIR
    { wch: 32 }, // ALAMAT
    { wch: 12 }, // RT/RW
    { wch: 18 }, // KELURAHAN
    { wch: 18 }, // KECAMATAN
    { wch: 18 }, // KOTA
    { wch: 16 }, // NO HP SISWA
    { wch: 22 }, // NAMA AYAH
    { wch: 16 }, // NO HP AYAH
    { wch: 22 }, // NAMA IBU
    { wch: 16 }, // NO HP IBU
    { wch: 20 }, // NAMA WALI
    { wch: 16 }, // NO HP WALI
    { wch: 18 }  // NO HP ORANG TUA
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa & Ortu')
  await downloadWorkbook(wb, filename)
}

/**
 * Download file Template Excel khusus untuk Update NISN Siswa
 * Kolom: NISN Lama, NISN Baru, Nama Siswa, Kelas
 * Format header ini 100% kompatibel dan langsung terbaca oleh fitur Update NISN Massal di Admin
 * @param {Array} studentsList - Array siswa yang dipilih
 * @param {string} filename - Nama file yang diunduh
 */
export const downloadUpdateNisnTemplateExcel = async (studentsList = [], filename = 'Template_Update_NISN.xlsx') => {
  const sampleRows = []

  if (studentsList && studentsList.length > 0) {
    // Deduplikasi berdasarkan NISN
    const seenNisns = new Set()
    const uniqueStudents = studentsList.filter(s => {
      const nisn = String(s.nisn || s.foreign_id || s.id || '').trim()
      if (!nisn) return false
      if (seenNisns.has(nisn)) return false
      seenNisns.add(nisn)
      return true
    })

    // Urutkan siswa berdasarkan Kelas lalu Nama Siswa
    const sortedStudents = [...uniqueStudents].sort((a, b) => {
      const classA = a.kelas || ''
      const classB = b.kelas || ''
      if (classA !== classB) return classA.localeCompare(classB)
      return (a.nama_lengkap || a.nama || '').localeCompare(b.nama_lengkap || b.nama || '')
    })

    sortedStudents.forEach(s => {
      sampleRows.push([
        String(s.nisn || s.foreign_id || s.id || '').trim(),
        '', // Kolom NISN Baru kosong siap diisi user
        s.nama_lengkap || s.nama || '',
        s.kelas || ''
      ])
    })
  }

  const wb = XLSX.utils.book_new()
  const headers = ['NISN Lama', 'NISN Baru', 'Nama Siswa', 'Kelas']
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])

  // Pastikan format teks dan lebar kolom optimal
  ws['!cols'] = [
    { wch: 18 }, // NISN Lama
    { wch: 18 }, // NISN Baru
    { wch: 34 }, // Nama Siswa
    { wch: 12 }  // Kelas
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Update NISN')
  await downloadWorkbook(wb, filename)
}

/**
 * Sinkronkan NISN di seluruh tabel aplikasi yang mereferensikan siswa:
 * Tabungan Siswa, Akun Pengguna, Tagihan SPP, Presensi, Nilai, Poin, BK, Foto, Enrollment, dll.
 * @param {string} oldNisn 
 * @param {string} newNisn 
 */
export async function syncAllTablesNisn(oldNisn, newNisn) {
  const oNisn = String(oldNisn || '').trim()
  const nNisn = String(newNisn || '').trim()
  if (!oNisn || !nNisn || oNisn === nNisn) return

  await Promise.allSettled([
    // 1. Akun Pengguna
    supabase.from('akun_pengguna').update({ foreign_id: nNisn }).eq('foreign_id', oNisn),
    
    // 2. Tabungan Siswa (Rekening, Transaksi Setoran/Penarikan, dan Bendahara Penginput)
    supabase.from('tabungan_transaksi').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('tabungan_transaksi').update({ diinput_oleh_nisn: nNisn }).eq('diinput_oleh_nisn', oNisn),
    supabase.from('tabungan_rekening').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('bendahara_kelas').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),

    // 3. Tagihan SPP & Keuangan
    supabase.from('tagihan_spp').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('tarif_spp_siswa').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('transaksi_bca_log').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),

    // 4. Akademik, Presensi, Nilai, Poin, BK, Prestasi, Foto, Push Notif
    supabase.from('enrollment').update({ nisn: nNisn }).eq('nisn', oNisn),
    supabase.from('presensi_harian').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('nilai_siswa').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('point_records').update({ nisn: nNisn }).eq('nisn', oNisn),
    supabase.from('student_points').update({ nisn: nNisn }).eq('nisn', oNisn),
    supabase.from('prestasi_siswa').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('bk_konsultasi').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('bk_konsultasi_booking').update({ siswa_nisn: nNisn }).eq('siswa_nisn', oNisn),
    supabase.from('foto').update({ nisn: nNisn }).eq('nisn', oNisn),
    supabase.from('push_device_tokens').update({ nisn: nNisn }).eq('nisn', oNisn),
    supabase.from('berkas_pengumuman').update({ kode_siswa: nNisn }).eq('kode_siswa', oNisn),
    supabase.from('impersonate_tokens').update({ target_user_id: nNisn }).eq('target_user_id', oNisn)
  ])
}

/**
 * Parsing array baris mentah dari XLSX.sheet_to_json
 * @param {Array} rawRows
 * @returns {Array} parsedRows
 */
export const parseStudentExcelRows = (rawRows = []) => {
  return rawRows.map(row => {
    const getVal = (...keys) => {
      for (const k of keys) {
        const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase())
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          return String(row[foundKey]).trim()
        }
      }
      return ''
    }

    const nisn = getVal('NISN', 'nisn', 'No Induk', 'no_induk')
    const nama = toTitleCase(getVal('NAMA LENGKAP', 'NAMA', 'nama_lengkap', 'nama', 'Nama Lengkap', 'Nama Siswa'))
    
    // Jenis Kelamin
    const jkRaw = getVal('JENIS KELAMIN', 'Jenis Kelamin', 'jenis_kelamin', 'JK', 'jk', 'gender', 'Jenis_Kelamin')
    let jk = ''
    if (jkRaw) {
      const u = jkRaw.toUpperCase()
      if (u.startsWith('L')) jk = 'L'
      else if (u.startsWith('P')) jk = 'P'
      else jk = jkRaw
    }

    const kelas = getVal('KELAS', 'kelas', 'Kelas', 'Kelas Sekarang', 'kelas sekarang')
    const tempatLahir = toTitleCase(getVal('TEMPAT LAHIR', 'tempat_lahir', 'tempat', 'Tempat Lahir'))

    // Tanggal lahir
    const tglLahir = parseDateToIso(getVal('TANGGAL LAHIR', 'tanggal_lahir', 'tgl_lahir', 'tgl', 'Tanggal Lahir'))

    const rawAlamat = getVal('ALAMAT', 'alamat', 'alamat_rumah', 'jalan', 'Alamat', 'Alamat Lengkap')
    const alamat = formatAlamatJalan(rawAlamat)
    const rtRw = extractRtRwFromRow(row)
    const kelurahan = toTitleCase(getVal('KELURAHAN', 'kelurahan', 'desa', 'kel', 'Kelurahan'))
    const kecamatan = toTitleCase(getVal('KECAMATAN', 'kecamatan', 'kec', 'Kecamatan'))
    const kota = toTitleCase(getVal('KOTA', 'kota', 'kabupaten', 'kab_kota', 'Kota', 'Kota / Kabupaten'))
    const noHpSiswa = cleanPhone(getVal('NO HP SISWA', 'NO HP', 'no_hp', 'no_whatsapp', 'telepon_siswa', 'No WhatsApp Siswa', 'WA'))

    // Kontak Ortu
    const namaAyah = toTitleCase(getVal('NAMA AYAH', 'nama_ayah', 'ayah', 'Nama Ayah'))
    const noHpAyah = cleanPhone(getVal('NO HP AYAH', 'no_hp_ayah', 'hp_ayah', 'wa_ayah', 'No HP Ayah'))
    const namaIbu = toTitleCase(getVal('NAMA IBU', 'nama_ibu', 'ibu', 'Nama Ibu'))
    const noHpIbu = cleanPhone(getVal('NO HP IBU', 'no_hp_ibu', 'hp_ibu', 'wa_ibu', 'No HP Ibu'))
    const namaWali = toTitleCase(getVal('NAMA WALI', 'nama_wali', 'wali', 'Nama Wali'))
    const noHpWali = cleanPhone(getVal('NO HP WALI', 'no_hp_wali', 'hp_wali', 'No HP Wali'))
    const noHpOrtuUmum = cleanPhone(getVal('NO HP ORANG TUA', 'no_hp_ortu', 'hp_ortu', 'no_telepon_ortu', 'No HP Orang Tua'))
    const namaOrtuUmum = toTitleCase(getVal('NAMA ORANG TUA', 'nama_ortu', 'Nama Orang Tua'))
    const emailOrtu = getVal('EMAIL ORANG TUA', 'email_ortu', 'Email Orang Tua')

    return {
      nisn,
      nama,
      jk,
      jenis_kelamin: jk,
      kelas,
      tempat_lahir: tempatLahir,
      tanggal_lahir: tglLahir,
      alamat,
      rt_rw: rtRw,
      kelurahan,
      kecamatan,
      kota,
      no_hp: noHpSiswa,
      nama_ayah: namaAyah,
      no_hp_ayah: noHpAyah,
      nama_ibu: namaIbu,
      no_hp_ibu: noHpIbu,
      nama_wali: namaWali,
      no_hp_wali: noHpWali,
      no_hp_ortu_umum: noHpOrtuUmum,
      nama_ortu_umum: namaOrtuUmum,
      email_ortu: emailOrtu
    }
  }).filter(r => r.nisn)
}

/**
 * Susun payload update untuk siswa_permanent dengan penggabungan kontak_ortu array (Ayah, Ibu, Wali, Orang Tua)
 * @param {Array} parsedRows
 * @param {Map} existingMap - Map NISN -> row siswa_permanent yang sudah ada
 * @returns {Array} payloadList
 */
export const buildStudentDatabasePayloads = (parsedRows = [], existingMap = new Map()) => {
  return parsedRows.map(row => {
    const cleanNisn = String(row.nisn).trim()
    const old = existingMap.get(cleanNisn) || {}

    // Kloning atau inisialisasi kontak_ortu array
    let kontakList = Array.isArray(old.kontak_ortu) ? [...old.kontak_ortu] : []

    // Helper update atau tambah kontak sesuai tag
    const addOrUpdateKontak = (tag, nama, nomor) => {
      if (!nomor && !nama) return
      const cleanNum = cleanPhone(nomor)
      const idx = kontakList.findIndex(k => k.tag?.toLowerCase() === tag.toLowerCase())
      if (idx >= 0) {
        kontakList[idx] = {
          tag,
          nama: nama || kontakList[idx].nama || '',
          nomor: cleanNum || kontakList[idx].nomor || ''
        }
      } else {
        kontakList.push({
          tag,
          nama: nama || '',
          nomor: cleanNum || ''
        })
      }
    }

    if (row.no_hp_ayah || row.nama_ayah) addOrUpdateKontak('Ayah', row.nama_ayah, row.no_hp_ayah)
    if (row.no_hp_ibu || row.nama_ibu) addOrUpdateKontak('Ibu', row.nama_ibu, row.no_hp_ibu)
    if (row.no_hp_wali || row.nama_wali) addOrUpdateKontak('Wali', row.nama_wali, row.no_hp_wali)
    if ((row.no_hp_ortu_umum || row.nama_ortu_umum) && !row.no_hp_ayah && !row.no_hp_ibu && !row.no_hp_wali) {
      addOrUpdateKontak('Orang Tua', row.nama_ortu_umum || 'Orang Tua', row.no_hp_ortu_umum)
    }

    // Kontak utama untuk backward-compatibility no_hp_ortu & nama_ortu
    const primaryOrtuPhone = cleanPhone(row.no_hp_ayah || row.no_hp_ibu || row.no_hp_wali || row.no_hp_ortu_umum) || old.no_hp_ortu || null
    const primaryOrtuName = row.nama_ayah || row.nama_ibu || row.nama_wali || row.nama_ortu_umum || old.nama_ortu || null
    const cleanHpSiswa = cleanPhone(row.no_hp) || old.no_whatsapp || old.no_hp || null

    const baseAlamat = row.alamat || old.alamat || ''
    const combinedAlamat = combineAlamatAndRtRw(baseAlamat, row.rt_rw) || old.alamat || null

    return {
      nisn: cleanNisn,
      nama_lengkap: row.nama || old.nama_lengkap || 'Siswa',
      ...(row.jk ? { jenis_kelamin: row.jk } : (old.jenis_kelamin ? { jenis_kelamin: old.jenis_kelamin } : {})),
      tempat_lahir: row.tempat_lahir || old.tempat_lahir || null,
      tanggal_lahir: row.tanggal_lahir || old.tanggal_lahir || null,
      alamat: combinedAlamat,
      kelurahan: row.kelurahan || old.kelurahan || null,
      kecamatan: row.kecamatan || old.kecamatan || null,
      kota: row.kota || old.kota || null,
      no_whatsapp: cleanHpSiswa,
      no_hp: cleanHpSiswa,
      kontak_ortu: kontakList,
      no_hp_ortu: primaryOrtuPhone,
      nama_ortu: primaryOrtuName,
      ...(row.email_ortu ? { email_ortu: row.email_ortu } : {})
    }
  })
}
