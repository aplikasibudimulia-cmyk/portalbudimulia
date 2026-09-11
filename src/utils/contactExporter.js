// Utility untuk ekspor kontak Siswa dan Orang Tua ke format vCard (.vcf), Google Contacts (.csv), dan Excel (.xlsx)
import { downloadFile } from './fileDownloader'

/**
 * Format nomor HP ke format standar internasional E.164 (+62...)
 * Mengembalikan string kosong jika nomor tidak valid / tidak ada angka yang cukup
 */
export function formatPhoneNumberE164(phone) {
  if (!phone) return ''
  let cleaned = String(phone).replace(/[^0-9+]/g, '')
  if (!cleaned) return ''
  
  const digitsOnly = cleaned.replace(/[^0-9]/g, '')
  if (digitsOnly.length < 7) return '' // Nomor HP valid minimal 7 digit
  
  if (cleaned.startsWith('+')) {
    return cleaned
  }
  if (cleaned.startsWith('62')) {
    return '+' + cleaned
  }
  if (cleaned.startsWith('0')) {
    return '+62' + cleaned.substring(1)
  }
  return '+62' + cleaned
}

/**
 * Format nama singkat tahun ajaran (contoh: "2026/2027" -> "26/27", "2025/2026" -> "25/26")
 */
export function formatShortTahunAjaran(taName) {
  if (!taName) return ''
  const str = String(taName).trim()
  const match = str.match(/20(\d{2})\s*[\/\-]\s*20(\d{2})/)
  if (match) {
    return `${match[1]}/${match[2]}`
  }
  return str
}

/**
 * Generate formatted contact name based on user template
 */
export function generateContactName({
  type, // 'ortu' | 'siswa' | 'guru'
  studentName = '',
  parentName = '',
  kelas = '',
  taShort = '',
  formatOrtu = 'OT [KELAS] [TA] - [NAMA]',
  formatSiswa = '[KELAS] [TA] - [NAMA]',
  formatGuru = 'GURU - [NAMA]',
  nameStyle = 'uppercase', // 'uppercase' | 'normal' | 'firstname_upper' | 'firstname_normal'
}) {
  let rawName = studentName || ''
  const words = rawName.trim().split(/\s+/)
  const firstName = words[0] || ''

  let processedName = rawName
  if (nameStyle === 'firstname_upper') {
    processedName = firstName.toUpperCase()
  } else if (nameStyle === 'firstname_normal') {
    processedName = firstName
  } else if (nameStyle === 'uppercase') {
    processedName = rawName.toUpperCase()
  } else if (nameStyle === 'normal') {
    processedName = rawName
  }

  const template = type === 'ortu' ? formatOrtu : type === 'guru' ? formatGuru : formatSiswa

  let result = template
    .replace(/\[KELAS\]/g, kelas || '')
    .replace(/\[TA\]/g, taShort || '')
    .replace(/\[NAMA\]/g, processedName)
    .replace(/\[NAMA_ORTU\]/g, (parentName || processedName).toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()

  return result
}

/**
 * Ekspor kontak ke format vCard 3.0 (.vcf) standar yang kompatibel dengan iOS (iPhone), Android, & MacOS
 * HANYA mengekspor kontak yang memiliki nomor telepon
 */
export function generateVCardString(contacts) {
  const validContacts = (contacts || []).filter(c => Boolean(c.phone && String(c.phone).trim()))
  const vcards = validContacts.map(c => {
    const fn = (c.fullName || '').replace(/[\r\n;,]/g, ' ').replace(/\s+/g, ' ').trim()
    const tel = (c.phone || '').trim()
    const org = `SMP Budi Mulia Jakarta`
    const note = `Kelas: ${c.kelas || '-'} | NISN: ${c.nisn || '-'} | Tipe: ${c.typeLabel || '-'}`
    const groupName = c.groupName || 'eBudiMulia'

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//SMP Budi Mulia//eBudiMulia Contacts//EN',
      `FN:${fn}`,
      `N:${fn};;;;`,
      tel ? `TEL;TYPE=CELL,VOICE;TYPE=pref:${tel}` : '',
      `ORG:${org};${c.kelas ? 'Kelas ' + c.kelas : ''}`,
      c.kelas ? `TITLE:Kelas ${c.kelas}` : '',
      `NOTE:${note}`,
      `CATEGORIES:${groupName},SMP Budi Mulia`,
      `X-ABGroup:${groupName}`,
      `X-GROUP-MEMBERSHIP:${groupName}`,
      `X-APPLE-SUBGENRE:${groupName}`,
      `X-ANDROID-CUSTOM:vnd.android.cursor.item/group;${groupName};;;;;;;;;;;;;;`,
      'END:VCARD'
    ].filter(Boolean)

    return lines.join('\r\n')
  })

  // Sesuai standar RFC 2426 vCard: Pemisah antar-kontak adalah \r\n tanpa baris kosong (\r\n\r\n)
  // agar parser iOS (iPhone Contacts) membaca seluruh kontak (multi-contact VCF)
  return vcards.join('\r\n') + '\r\n'
}

/**
 * Download / Share file vCard (.vcf)
 * Khusus iPhone / iOS:
 * - Menggunakan Web Share API jika didukung sehingga muncul Share Sheet bawaan iOS
 * - Pengguna tinggal memilih aplikasi "Kontak" -> "Tambah Semua Kontak", atau "Simpan ke File"
 * - Jika fallback download, menggunakan 'application/octet-stream' agar Safari tidak membuka
 *   preview inline satu kontak, melainkan mengunduh file secara utuh ke menu Unduhan/Files.
 */
export async function downloadVCard(contacts, filename = 'Kontak_eBudiMulia.vcf') {
  const validContacts = (contacts || []).filter(c => Boolean(c.phone && String(c.phone).trim()))
  if (validContacts.length === 0) return { success: false, reason: 'empty' }

  const vcfContent = generateVCardString(validContacts)
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )

  // 1. Coba Web Share API dengan File (Paling mulus di iOS Safari & Android)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([vcfContent], filename, { type: 'text/vcard' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `Daftar kontak (${validContacts.length} kontak)`
        })
        return { success: true, method: 'share' }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Pengguna membatalkan menu share
        return { success: false, reason: 'cancelled' }
      }
      console.warn('Web Share failed, falling back to download:', err)
    }
  }

  // 2. Fallback: Download via Blob
  const mimeType = isIOS ? 'application/octet-stream' : 'text/vcard;charset=utf-8;'
  const blob = new Blob([vcfContent], { type: mimeType })
  await downloadFile(blob, filename, mimeType)
  return { success: true, method: 'download' }
}

/**
 * Ekspor kontak ke format Google Contacts CSV dengan Label / Grup Otomatis
 * HANYA mengekspor kontak yang memiliki nomor telepon
 */
export function generateGoogleContactsCSV(contacts) {
  const validContacts = (contacts || []).filter(c => Boolean(c.phone && String(c.phone).trim()))
  const headers = [
    'Name',
    'Given Name',
    'Family Name',
    'Group Membership',
    'Phone 1 - Type',
    'Phone 1 - Value',
    'E-mail 1 - Type',
    'E-mail 1 - Value',
    'Notes',
    'Organization 1 - Name',
    'Organization 1 - Title'
  ]

  const rows = validContacts.map(c => {
    const name = `"${(c.fullName || '').replace(/"/g, '""')}"`
    const group = `"${(c.groupName || 'eBudiMulia').replace(/"/g, '""')} ::: * myContacts"`
    const phone = `"${(c.phone || '').replace(/"/g, '""')}"`
    const email = `"${(c.email || '').replace(/"/g, '""')}"`
    const notes = `"${(`Kelas ${c.kelas || '-'} - NISN: ${c.nisn || '-'}`).replace(/"/g, '""')}"`
    const org = '"SMP Budi Mulia Jakarta"'
    const title = `"${(c.typeLabel || 'Kontak').replace(/"/g, '""')}"`

    return [
      name,
      name,
      '""',
      group,
      '"Mobile"',
      phone,
      '"Home"',
      email,
      notes,
      org,
      title
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\r\n')
}

/**
 * Download Google Contacts CSV
 */
export async function downloadGoogleContactsCSV(contacts, filename = 'Kontak_Google_eBudiMulia.csv') {
  const validContacts = (contacts || []).filter(c => Boolean(c.phone && String(c.phone).trim()))
  const csvContent = generateGoogleContactsCSV(validContacts)
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  await downloadFile(blob, filename, 'text/csv;charset=utf-8;')
}
