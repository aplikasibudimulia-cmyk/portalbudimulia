import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import JSZip from 'jszip'

/**
 * Menormalkan NISN: Menambahkan angka 0 di depan jika digitnya kurang dari 10 (akibat auto-format Excel)
 */
export function normalizeNisn(nisn) {
  if (!nisn) return ''
  const str = String(nisn).trim()
  if (/^\d+$/.test(str) && str.length < 10) {
    return str.padStart(10, '0')
  }
  return str
}

/**
 * Membaca dan mem-parsing file Excel CKG atau Excel data siswa umum
 * dbStudentsMap: Map NISN -> { nama_lengkap, kelas } dari database Manajemen Akun sebagai acuan resmi
 */
export async function parseExcelFile(arrayBuffer, dbStudentsMap = new Map()) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetNames = wb.SheetNames

  // Cek apakah sheet 'DATA UNTUK INPUT' ada (Format CKG Budi Mulia)
  const isCkg = sheetNames.includes('DATA UNTUK INPUT')
  const targetSheetName = isCkg ? 'DATA UNTUK INPUT' : sheetNames[0]
  const ws = wb.Sheets[targetSheetName]

  // Baca dengan raw: false agar nilai seperti HB '12.9' yang diformat Excel tidak terbaca sebagai serial number 46277
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })

  // Ekstraksi data siswa yang tidak masuk jika sheet TIDAK MASUK ada
  let tidakMasukList = []
  if (sheetNames.includes('TIDAK MASUK')) {
    const wsTidak = wb.Sheets['TIDAK MASUK']
    const rowsTidak = XLSX.utils.sheet_to_json(wsTidak, { header: 1, raw: false })
    for (let i = 8; i < rowsTidak.length; i++) {
      const r = rowsTidak[i]
      if (r && r[3] && typeof r[3] === 'string') {
        const trimmed = r[3].trim()
        if (trimmed && !trimmed.startsWith('KELAS') && trimmed !== 'Nama') {
          const rawNisn = String(r[8] || '').trim()
          const nisn = normalizeNisn(rawNisn)
          const dbStudent = dbStudentsMap?.get(nisn)

          tidakMasukList.push({
            no: r[2] || tidakMasukList.length + 1,
            nama: dbStudent?.nama_lengkap || trimmed,
            excelNama: trimmed,
            kelas: dbStudent?.kelas || String(r[7] || '').trim(),
            nisn,
            isDbVerified: Boolean(dbStudent),
            nik: String(r[9] || '').trim(),
            tglLahir: r[10] || '',
            keterangan: 'Tidak Hadir saat Pemeriksaan CKG'
          })
        }
      }
    }
  }

  if (isCkg) {
    return parseCkgSheet(rawRows, sheetNames, tidakMasukList, dbStudentsMap)
  } else {
    return parseGeneralSheet(rawRows, sheetNames, dbStudentsMap)
  }
}

/**
 * Parser khusus untuk format CKG SMP Budi Mulia (multi-header)
 * Menggunakan database manajemen akun sebagai acuan utama nama & kelas siswa
 */
function parseCkgSheet(rawRows, sheetNames, tidakMasukList = [], dbStudentsMap = new Map()) {
  const students = []
  const classSet = new Set()
  let countKosong = 0
  let countDbMatched = 0

  for (let i = 6; i < rawRows.length; i++) {
    const r = rawRows[i]
    if (!r || !r[3] || typeof r[3] !== 'string') continue
    const trimmedNama = r[3].trim()
    if (trimmedNama.startsWith('KELAS') || trimmedNama === 'Nama') continue

    const rawNisn = String(r[8] || '').trim()
    const nisn = normalizeNisn(rawNisn)

    // ACUAN UTAMA: Database Manajemen Akun
    const dbStudent = dbStudentsMap?.get(nisn)
    const officialNama = dbStudent?.nama_lengkap || trimmedNama
    const officialKelas = dbStudent?.kelas || String(r[7] || '').trim()
    const isDbVerified = Boolean(dbStudent)
    if (isDbVerified) countDbMatched++

    if (officialKelas) classSet.add(officialKelas)

    const no = r[2] || students.length + 1
    const jk = r[4] === 'P' ? 'P' : (r[5] === 'L' ? 'L' : '')
    const tb = r[11] || ''
    const bb = r[12] || ''
    let imt = r[13] || ''

    // Otomatis hitung IMT jika TB & BB terisi tetapi kolom IMT kosong
    if (!imt && tb && bb) {
      const tbNum = parseFloat(String(tb).replace(',', '.'))
      const bbNum = parseFloat(String(bb).replace(',', '.'))
      if (tbNum > 0 && bbNum > 0) {
        const heightMeters = tbNum / 100
        imt = (bbNum / (heightMeters * heightMeters)).toFixed(1)
      }
    }

    const tensi = r[14] || ''
    const hb = r[15] || ''
    const gds = r[16] || ''

    // Cek apakah data pengukuran fisik kosong sama sekali
    const isDataKosong = !tb && !bb && !tensi
    if (isDataKosong) countKosong++

    // Telinga
    const telinga = r[17] ? 'Tajam pendengaran baik' : 'Dalam batas normal'
    const serumen = r[19] ? 'Ya (Ditemukan)' : (r[18] ? 'Tidak (Bersih)' : '-')
    const infeksiTelinga = r[21] ? 'Ya' : (r[20] ? 'Tidak' : '-')

    // Mata
    const mataLuar = r[23] ? 'Mata tidak sehat' : (r[22] ? 'Mata sehat' : 'Mata sehat')
    const visus = r[25] ? `Gangguan (${r[25]})` : (r[24] ? 'Normal (Visus 6/6 - 6/9)' : 'Normal')
    const kacamata = r[27] ? 'Ya' : (r[26] ? 'Tidak' : 'Tidak')

    // Gigi
    const kariesNum = Number(r[29]) || 0
    const gigi = kariesNum > 0 ? `Ditemukan ${kariesNum} karies` : (r[28] ? 'Tidak ada karies (Bersih)' : 'Bebas karies')

    // Kesimpulan Rujukan
    const rujukCol = String(r[30] || '').trim().toLowerCase()
    const isRujuk = rujukCol === 'ya' || kariesNum > 0 || Boolean(r[25]) || r[19] === 'v' || r[21] === 'v' || r[23] === 'v'
    const statusRekomendasi = isDataKosong ? 'Data Belum Terisi' : (isRujuk ? 'Perlu Rujukan' : 'Normal / Dalam Batas Wajar')

    students.push({
      id: `ckg_${nisn || i}`,
      no,
      nama: officialNama,
      excelNama: trimmedNama,
      kelas: officialKelas,
      nisn,
      rawNisn,
      isDbVerified,
      nik: String(r[9] || '').trim(),
      jk,
      tb,
      bb,
      imt,
      tensi,
      hb,
      gds,
      telinga,
      serumen,
      infeksiTelinga,
      mataLuar,
      visus,
      kacamata,
      gigi,
      karies: kariesNum > 0 ? `${kariesNum} gigi` : 'Tidak ada',
      statusRekomendasi,
      isRujuk,
      isDataKosong,
      // Metadata lengkap untuk mail-merge tag replacement
      rowDict: {
        // Identitas Siswa
        'Nama': officialNama,
        'Nama Siswa': officialNama,
        'Nama Lengkap': officialNama,
        'Kelas': officialKelas,
        'NISN': nisn,
        'No NISN': nisn,
        'Nomor NISN': nisn,
        'NIK': String(r[9] || '').trim(),
        'Jenis Kelamin': jk === 'L' ? 'Laki-laki' : (jk === 'P' ? 'Perempuan' : jk),
        'JK': jk,
        // Antropometri
        'TB': tb,
        'TB (cm)': tb,
        'Tinggi': tb,
        'Tinggi Badan': tb,
        'BB': bb,
        'BB (kg)': bb,
        'Berat': bb,
        'Berat Badan': bb,
        'IMT': imt ? (typeof imt === 'number' ? imt.toFixed(1) : String(imt)) : '',
        'Indeks Massa Tubuh': imt ? (typeof imt === 'number' ? imt.toFixed(1) : String(imt)) : '',
        'Indeks Massa Tubuh (kg/m2)': imt ? (typeof imt === 'number' ? imt.toFixed(1) : String(imt)) : '',
        'Indeks Massa Tubuh (kg/m²)': imt ? (typeof imt === 'number' ? imt.toFixed(1) : String(imt)) : '',
        'BMI': imt ? (typeof imt === 'number' ? imt.toFixed(1) : String(imt)) : '',
        // Tanda Vital & Laboratorium
        'Tekanan Darah': tensi,
        'Tensi': tensi,
        'TD': tensi,
        'HB': hb,
        'Hemoglobin': hb,
        'GDS': gds,
        'Gula Darah': gds,
        'Gula Darah Sewaktu': gds,
        // Indera & Organ
        'Tajam Pendengaran': telinga,
        'Telinga': telinga,
        'Pendengaran': telinga,
        'Serumen': serumen,
        'Serumen Impaksi': serumen,
        'Infeksi Telinga': infeksiTelinga,
        'Tajam Penglihatan': visus,
        'Penglihatan': visus,
        'Mata': visus,
        'Visus': visus,
        'Mata Luar': mataLuar,
        'Penggunaan Kacamata': kacamata,
        'Kacamata': kacamata,
        'Gigi': gigi,
        'Gigi & Mulut': gigi,
        'Karies': kariesNum > 0 ? `${kariesNum} gigi` : 'Tidak ada karies',
        // Kesimpulan
        'Kesimpulan': statusRekomendasi,
        'Rekomendasi': statusRekomendasi,
        'Status Rekomendasi': statusRekomendasi,
        'Hasil': statusRekomendasi
      }
    })
  }

  const availableHeaders = [
    'Nama', 'Kelas', 'NISN', 'Jenis Kelamin', 'TB (cm)', 'BB (kg)', 
    'Indeks Massa Tubuh (kg/m2)', 'Tekanan Darah', 'HB', 'GDS', 
    'Tajam Pendengaran', 'Serumen Impaksi', 'Tajam Penglihatan', 
    'Penggunaan Kacamata', 'Gigi', 'Kesimpulan'
  ]

  return {
    isCkg: true,
    sheetNames,
    students,
    total: students.length,
    classes: Array.from(classSet).sort(),
    headers: availableHeaders,
    tidakMasukList,
    countKosong,
    countTidakMasuk: tidakMasukList.length,
    countDbMatched
  }
}

/**
 * Parser untuk Excel tabel siswa umum (baris 0 = header)
 */
function parseGeneralSheet(rawRows, sheetNames) {
  if (rawRows.length < 2) {
    return { isCkg: false, sheetNames, students: [], total: 0, classes: [], headers: [] }
  }

  const headers = (rawRows[0] || []).map(h => String(h || '').trim()).filter(Boolean)
  const students = []
  const classSet = new Set()

  // Cari index NISN, Nama, Kelas
  const nisnIdx = headers.findIndex(h => /nisn|no.*induk/i.test(h))
  const namaIdx = headers.findIndex(h => /nama/i.test(h))
  const kelasIdx = headers.findIndex(h => /kelas/i.test(h))

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!row || row.length === 0) continue

    const rowDict = {}
    headers.forEach((h, idx) => {
      rowDict[h] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : ''
    })

    const nama = namaIdx !== -1 ? rowDict[headers[namaIdx]] : (row[0] || `Siswa ${i}`)
    const nisn = nisnIdx !== -1 ? normalizeNisn(rowDict[headers[nisnIdx]]) : ''
    const kelas = kelasIdx !== -1 ? rowDict[headers[kelasIdx]] : ''
    if (kelas) classSet.add(kelas)

    // Lengkapi rowDict dengan alias standar
    rowDict['Nama'] = nama
    rowDict['Nama Siswa'] = nama
    rowDict['Kelas'] = kelas
    rowDict['NISN'] = nisn

    students.push({
      id: `gen_${nisn || i}`,
      no: i,
      nama,
      kelas,
      nisn,
      rowDict,
      statusRekomendasi: 'Normal'
    })
  }

  return {
    isCkg: false,
    sheetNames,
    students,
    total: students.length,
    classes: Array.from(classSet).sort(),
    headers
  }
}

/**
 * Parser file Word (.docx) untuk mengekstrak HTML dan tag <<...>>
 */
export async function parseDocxTemplate(arrayBuffer) {
  try {
    const { value: rawHtml } = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(function (image) {
          return image.read('base64').then(function (imageBuffer) {
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`
            }
          })
        })
      }
    )

    // Temukan semua tag <<...>>, {{...}}, atau &lt;&lt;...&gt;&gt;
    const placeholders = new Set()
    
    // Scan dari HTML
    const regex = /(?:<<|{{|&lt;&lt;)([\s\S]*?)(?:>>|}}|&gt;&gt;)/g
    let match
    while ((match = regex.exec(rawHtml)) !== null) {
      const tag = match[1].replace(/<[^>]*>/g, '').trim()
      if (tag) placeholders.add(tag)
    }

    // Scan juga langsung dari XML file Word (termasuk Header & Footer)
    try {
      const zip = await JSZip.loadAsync(arrayBuffer)
      for (const filename of Object.keys(zip.files)) {
        if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(filename)) {
          const xml = await zip.file(filename).async('string')
          let xmlMatch
          const xmlRegex = /(?:<<|{{|&lt;&lt;)([\s\S]*?)(?:>>|}}|&gt;&gt;)/g
          while ((xmlMatch = xmlRegex.exec(xml)) !== null) {
            const clean = xmlMatch[1].replace(/<[^>]*>/g, '').trim()
            if (clean) placeholders.add(clean)
          }
        }
      }
    } catch (zipErr) {
      console.warn('Scan zip placeholders error:', zipErr)
    }

    return {
      success: true,
      rawHtml,
      arrayBuffer,
      placeholders: Array.from(placeholders)
    }
  } catch (err) {
    console.error('Error parseDocxTemplate:', err)
    return {
      success: false,
      error: err.message,
      placeholders: []
    }
  }
}

/**
 * Konversi ArrayBuffer ke Base64
 */
export function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

/**
 * Konversi Base64 ke ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Merge file .docx secara presisi langsung pada struktur XML dokumen & header
 * Menghasilkan file .docx biner utuh yang mempertahankan seluruh font, margin, kop, logo, dan tanda tangan
 */
export async function mergeDocxTemplate(docxBuffer, rowDict = {}, extraMeta = {}) {
  if (!docxBuffer) return null

  try {
    const zip = await JSZip.loadAsync(docxBuffer)

    const fullDict = {
      ...rowDict,
      'Judul': extraMeta.judul || '',
      'Judul Surat': extraMeta.judul || '',
      'Nomor': extraMeta.nomorSurat || '',
      'Nomor Surat': extraMeta.nomorSurat || '',
      'No Surat': extraMeta.nomorSurat || '',
      'Tanggal': extraMeta.tanggalSurat || '',
      'Tanggal Surat': extraMeta.tanggalSurat || ''
    }

    const escapeXml = (unsafe) => {
      return String(unsafe ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }

    const normalizeKey = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const normMap = new Map()
    Object.keys(fullDict).forEach(key => {
      const val = fullDict[key] !== undefined && fullDict[key] !== null ? String(fullDict[key]) : ''
      normMap.set(normalizeKey(key), val)
    })

    const replacePlaceholdersInXml = (xmlString) => {
      if (!xmlString) return xmlString

      let res = xmlString
      // 1. Penggantian langsung jika tag utuh
      for (const [key, rawVal] of Object.entries(fullDict)) {
        const val = escapeXml(rawVal)
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(?:<<|&lt;&lt;)\\s*${escapedKey}\\s*(?:>>|&gt;&gt;)`, 'gi')
        res = res.replace(regex, val)
      }

      // 2. Penggantian cerdas jika tag terpecah di antara <w:r><w:t> dalam <w:p>
      res = res.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (pXml) => {
        if (!pXml.includes('<<') && !pXml.includes('&lt;&lt;')) return pXml

        const tRegex = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g
        let combined = ''
        let match
        while ((match = tRegex.exec(pXml)) !== null) {
          combined += match[2]
        }

        let newCombined = combined
        const tagRegex = /(?:<<|&lt;&lt;)([\s\S]*?)(?:>>|&gt;&gt;)/gi
        newCombined = newCombined.replace(tagRegex, (m, innerKey) => {
          const cleanKey = innerKey.replace(/<[^>]*>/g, '').trim()
          const norm = normalizeKey(cleanKey)
          if (normMap.has(norm)) {
            return escapeXml(normMap.get(norm))
          }
          for (const [k, v] of normMap.entries()) {
            if (k === norm || (k.length > 3 && norm.includes(k)) || (norm.length > 3 && k.includes(norm))) {
              return escapeXml(v)
            }
          }
          return m
        })

        if (newCombined !== combined) {
          let first = true
          return pXml.replace(tRegex, (m, openTag, text, closeTag) => {
            if (first) {
              first = false
              return openTag + newCombined + closeTag
            }
            return openTag + closeTag
          })
        }
        return pXml
      })

      return res
    }

    const targetXmlFiles = Object.keys(zip.files).filter(filename => {
      return /^word\/(document|header\d+|footer\d+)\.xml$/.test(filename)
    })

    for (const filename of targetXmlFiles) {
      const file = zip.file(filename)
      if (file) {
        let xml = await file.async('string')
        // Pastikan pemisahan halaman asli dari Word selalu dihormati oleh semua mesin render
        xml = xml.replace(/<w:lastRenderedPageBreak\/>/g, '<w:br w:type="page"/>')
        const replacedXml = replacePlaceholdersInXml(xml)
        zip.file(filename, replacedXml)
      }
    }

    return await zip.generateAsync({ type: 'arraybuffer' })
  } catch (err) {
    console.error('Error mergeDocxTemplate:', err)
    return docxBuffer
  }
}

/**
 * Render HTML surat dengan mengganti placeholder <<Tag>> dengan data siswa secara fleksibel & case-insensitive
 */
export function renderLetterHtml(templateHtml, rowDict = {}, extraMeta = {}) {
  if (!templateHtml) return ''

  // Gabungkan rowDict dengan metadata surat
  const fullDict = {
    ...rowDict,
    'Judul': extraMeta.judul || '',
    'Judul Surat': extraMeta.judul || '',
    'Nomor': extraMeta.nomorSurat || '',
    'Nomor Surat': extraMeta.nomorSurat || '',
    'No Surat': extraMeta.nomorSurat || '',
    'Tanggal': extraMeta.tanggalSurat || '',
    'Tanggal Surat': extraMeta.tanggalSurat || ''
  }

  // Buat mapping normalisasi untuk pencarian yang toleran terhadap spasi, simbol, huruf besar/kecil
  const normalizeKey = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const normMap = new Map()

  Object.keys(fullDict).forEach(key => {
    const val = fullDict[key] !== undefined && fullDict[key] !== null ? String(fullDict[key]) : ''
    normMap.set(normalizeKey(key), val)
  })

  let rendered = templateHtml

  // 1. Ganti semua pola tag <<...>>, {{...}}, atau &lt;&lt;...&gt;&gt;
  const tagRegex = /(?:<<|{{|&lt;&lt;)([\s\S]*?)(?:>>|}}|&gt;&gt;)/gi
  rendered = rendered.replace(tagRegex, (match, innerContent) => {
    const cleanKey = innerContent.replace(/<[^>]*>/g, '').trim()
    const normClean = normalizeKey(cleanKey)

    if (normMap.has(normClean)) {
      return normMap.get(normClean)
    }

    // Jika tag tidak langsung sama persis, cocokkan secara parsial
    for (const [k, v] of normMap.entries()) {
      if (k === normClean || (k.length > 3 && normClean.includes(k)) || (normClean.length > 3 && k.includes(normClean))) {
        return v
      }
    }

    return match
  })

  // 2. Fallback penggantian langsung untuk setiap key
  Object.keys(fullDict).forEach(key => {
    const val = fullDict[key] !== undefined && fullDict[key] !== null ? String(fullDict[key]) : ''
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?:<<|{{|&lt;&lt;)\\s*${escapedKey}\\s*(?:>>|}}|&gt;&gt;)`, 'gi')
    rendered = rendered.replace(regex, val)
  })

  // 3. Bersihkan bagian tanda tangan & cap stempel lama di akhir dokumen (jika ada),
  // karena akan otomatis digantikan secara presisi oleh Kop & TTD resmi sistem eBudimulia
  let cleaned = rendered.replace(/<p>[^<]*Jakarta,[\s\S]*$/i, '')
  if (cleaned.length === rendered.length) {
    cleaned = rendered.replace(/<p>[^<]*Mengetahui[\s\S]*$/i, '')
  }
  if (cleaned.length === rendered.length) {
    cleaned = rendered.replace(/<p>[^<]*Kepala SMP[\s\S]*$/i, '')
  }
  // Hapus gambar base64 inline drawing dari mammoth
  cleaned = cleaned.replace(/<img[^>]*data:image[^>]*>/gi, '')

  // Isi nomor surat jika baris Nomor masih kosong
  if (extraMeta.nomorSurat) {
    cleaned = cleaned.replace(/(<p[^>]*>\s*Nomor\s*:?\s*)<\/p>/gi, `$1${extraMeta.nomorSurat}</p>`)
  }

  // 4. Deteksi Judul Sub-Bagian (I. DATA PEMERIKSAAN FISIK, II. PEMERIKSAAN INDERA, III. KESIMPULAN)
  // Menjamin angka Romawi I., II., III. selalu tampil tegas dan rapi
  cleaned = cleaned.replace(/<(?:li|p)>\s*<strong>([\s\S]*?)<\/strong>\s*<\/(?:li|p)>/gi, (match, inner) => {
    const text = inner.replace(/<[^>]*>/g, '').trim()
    if (/data\s*pemeriksaan\s*fisik/i.test(text)) {
      const cleanTitle = text.replace(/^[ivx0-9\.\s-]+/i, '').trim()
      return `<div class="surat-section-heading">I. ${cleanTitle || 'DATA PEMERIKSAAN FISIK & VITAL'}</div>`
    }
    if (/pemeriksaan\s*indera/i.test(text)) {
      const cleanTitle = text.replace(/^[ivx0-9\.\s-]+/i, '').trim()
      return `<div class="surat-section-heading">II. ${cleanTitle || 'PEMERIKSAAN INDERA & ORGAN'}</div>`
    }
    if (/kesimpulan/i.test(text)) {
      const cleanTitle = text.replace(/^[ivx0-9\.\s-]+/i, '').trim()
      return `<div class="surat-section-heading">III. ${cleanTitle || 'KESIMPULAN & ANJURAN TINDAK LANJUT'}</div>`
    }
    // Jika pengguna menulis format Sub atau Romawi sendiri (misal: "Sub I.", "A.", "1.")
    if (/^(?:sub\s+[a-z0-9ivx]+|[ivx0-9]+[\.\)])/i.test(text)) {
      return `<div class="surat-section-heading">${text}</div>`
    }
    return match
  })

  // 5. Ratakan titik dua (colon alignment) secara presisi untuk baris key-value (Nomor, TB, BB, dll)
  // Hindari salah format pada kalimat seperti "Bapak/Ibu... dari:", "Catatan Bagi Orang Tua:", atau catatan "Apabila..."
  cleaned = cleaned.replace(/<(p|li)>([\s\S]*?)<\/\1>/gi, (match, tag, content) => {
    const colonIdx = content.indexOf(':')
    if (colonIdx === -1) return match
    
    const before = content.substring(0, colonIdx)
    const after = content.substring(colonIdx + 1)
    const cleanBefore = before.replace(/<[^>]*>/g, '').replace(/\t/g, '').trim()
    const cleanAfter = after.replace(/<[^>]*>/g, '').replace(/\t/g, '').trim()
    
    // Jangan ubah jika:
    // a. Nilai setelah titik dua kosong (misal "Bapak/Ibu Orang Tua / Wali Murid dari:")
    if (!cleanAfter) return match
    // b. Label terlalu panjang atau kalimat deskriptif
    if (cleanBefore.length > 32 || cleanBefore.length < 2) return match
    // c. Merupakan kata pengantar/catatan
    if (/dari$|berikut$|catatan|^apabila/i.test(cleanBefore)) return match

    const isSub = /^(?:[a-z]\.|\([a-z]\)|[0-9]+\.|\([0-9]+\)|sub\b)/i.test(cleanBefore)
    const isIdentitas = /^(?:nama|kelas|nisn)/i.test(cleanBefore)
    const isHeader = /^(?:nomor|lampiran|perihal)/i.test(cleanBefore)

    const indentClass = (isSub || isIdentitas) ? 'surat-indent' : ''
    const groupType = isHeader ? 'header' : (isIdentitas ? 'identitas' : (isSub ? 'sub' : 'default'))

    if (tag.toLowerCase() === 'li') {
      return `<li class="${indentClass}" style="display: list-item !important; margin-bottom: 0.25rem;"><div class="surat-colon-row surat-type-${groupType}" style="display: inline-grid;"><div class="surat-colon-label">${before.replace(/\t+/g, '').trim()}</div><div class="surat-colon-sep">:</div><div class="surat-colon-val">${after.trim()}</div></div></li>`
    }

    return `<div class="surat-colon-row ${indentClass} surat-type-${groupType}"><div class="surat-colon-label">${before.replace(/\t+/g, '').trim()}</div><div class="surat-colon-sep">:</div><div class="surat-colon-val">${after.trim()}</div></div>`
  })

  // 6. Pastikan tag <ol> dan <ul> dari Mammoth memiliki class dan inline styles agar penomoran/bullet tidak pernah hilang
  cleaned = cleaned.replace(/<ol\b[^>]*>/gi, '<ol class="surat-numbered-list" style="list-style-type: decimal !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">')
  cleaned = cleaned.replace(/<ul\b[^>]*>/gi, '<ul class="surat-bullet-list" style="list-style-type: disc !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">')
  cleaned = cleaned.replace(/<li\b(?![^>]*style=)[^>]*>/gi, '<li style="display: list-item !important; margin-bottom: 0.25rem; line-height: 1.6;">')

  return cleaned
}

/**
 * Konfigurasi Default Form Penyusun Surat Visual (Visual Letter Builder)
 */
export const DEFAULT_SURAT_BUILDER_STATE = {
  nomorSurat: '084/SMP-BM/KES/IX/2026',
  lampiran: '1 (satu) Berkas Hasil Skrining',
  perihal: 'Pemberitahuan Hasil Cek Kesehatan Berkala (CKG) Siswa T.A. 2026/2027',
  tujuanTipe: 'Bapak/Ibu Orang Tua / Wali Murid dari:',
  tujuanBaris: [
    { label: 'Nama Siswa', tag: 'Nama', suffix: '' },
    { label: 'Kelas', tag: 'Kelas', suffix: '' },
    { label: 'NISN', tag: 'NISN', suffix: '' }
  ],
  diMana: 'di Tempat',
  paragrafPembuka: [
    'Dengan hormat,',
    'Teriring salam dan doa semoga Bapak/Ibu beserta keluarga senantiasa berada dalam lindungan Tuhan Yang Maha Esa serta diberikan kesehatan dan berkat yang melimpah. Dalam rangka mendukung tumbuh kembang optimal serta memantau status kesehatan murid, SMP Budi Mulia telah menyelenggarakan kegiatan Cek Kesehatan Gratis (CKG) / Skrining Kesehatan Berkala Tahun Ajaran 2026/2027.',
    'Melalui surat ini, pihak sekolah bermaksud menyampaikan laporan hasil pemeriksaan kesehatan ananda sebagai berikut:'
  ],
  sections: [
    {
      id: 'sec_1',
      title: 'DATA PEMERIKSAAN FISIK & VITAL',
      items: [
        { label: 'Tinggi Badan (TB)', tag: 'TB (cm)', suffix: 'cm' },
        { label: 'Berat Badan (BB)', tag: 'BB (kg)', suffix: 'kg' },
        { label: 'Indeks Massa Tubuh (IMT)', tag: 'Indeks Massa Tubuh (kg/m2)', suffix: 'kg/m²' },
        { label: 'Tekanan Darah', tag: 'Tekanan Darah', suffix: 'mmHg' },
        { label: 'Kadar Hemoglobin (Hb)', tag: 'HB', suffix: 'g/dL' },
        { label: 'Gula Darah Sewaktu (GDS)', tag: 'GDS', suffix: 'mg/dL' }
      ]
    },
    {
      id: 'sec_2',
      title: 'PEMERIKSAAN INDERA & ORGAN',
      items: [
        { label: 'Telinga & Pendengaran', tag: 'Tajam Pendengaran', suffix: '/ Serumen: <<Serumen Impaksi>>' },
        { label: 'Mata & Penglihatan', tag: 'Tajam Penglihatan', suffix: '(Kacamata: <<Penggunaan Kacamata>>)' },
        { label: 'Gigi & Rongga Mulut', tag: 'Gigi', suffix: '' }
      ]
    },
    {
      id: 'sec_3',
      title: 'KESIMPULAN & ANJURAN TINDAK LANJUT',
      items: [
        { label: 'Status Rekomendasi Medis', tag: 'Kesimpulan', suffix: '' }
      ]
    }
  ],
  catatanJudul: 'Catatan Bagi Orang Tua:',
  catatanPoin: [
    'Apabila hasil pemeriksaan dalam batas NORMAL: Mohon agar ananda tetap didampingi untuk menjaga pola makan bergizi seimbang, asupan air putih yang cukup, menjaga kebersihan gigi, serta membatasi durasi penggunaan gawai (gadget).',
    'Apabila tercatat PERLU RUJUKAN: Kami menyarankan Bapak/Ibu untuk mendampingi ananda memeriksakan diri lebih lanjut ke Fasilitas Kesehatan / Puskesmas terdekat (Poli Gigi / Poli Mata / Dokter Umum) dengan membawa salinan lembar surat pemberitahuan ini.'
  ],
  catatanListType: 'bullet', // 'bullet' | 'number'
  paragrafPenutup: [
    'Demikian pemberitahuan ini kami sampaikan. Atas perhatian, kerja sama yang baik, dan perhatian Bapak/Ibu terhadap kesehatan putra-putri kita, kami mengucapkan terima kasih.'
  ],
  pengesahan: {
    kota: 'Jakarta',
    mengetahui: 'Mengetahui,',
    jabatan: 'Kepala SMP Budi Mulia,',
    nama: '( Septian Ruswadi, S.Pd )'
  }
}

/**
 * Merender HTML Surat Lengkap dari Form Penyusun Surat Visual
 */
export function renderStructuredLetterHtml(builder, rowDict = {}, meta = {}) {
  if (!builder) return ''

  const replaceTags = (text) => {
    if (!text) return ''
    let str = String(text)
    const fullDict = {
      ...rowDict,
      'Nomor': meta.nomorSurat || builder.nomorSurat || '',
      'Nomor Surat': meta.nomorSurat || builder.nomorSurat || '',
      'Perihal': meta.judul || builder.perihal || '',
      'Tanggal': meta.tanggalSurat || builder.tanggalSurat || ''
    }

    // Ganti tag <<...>>, {{...}}, &lt;&lt;...&gt;&gt;
    const regex = /(?:<<|{{|&lt;&lt;)([\s\S]*?)(?:>>|}}|&gt;&gt;)/gi
    str = str.replace(regex, (match, inner) => {
      const cleanKey = inner.replace(/<[^>]*>/g, '').trim()
      for (const k of Object.keys(fullDict)) {
        if (k.toLowerCase() === cleanKey.toLowerCase()) {
          return fullDict[k] !== undefined && fullDict[k] !== null ? String(fullDict[k]) : ''
        }
      }
      return match
    })

    return str
  }

  const getSubLetter = (index) => String.fromCharCode(97 + index) + '.'
  const getRomanNumeral = (index) => {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    return (roman[index] || (index + 1)) + '.'
  }

  let html = ''

  // 1. Nomor, Lampiran, Perihal (Grup Header: colon sejajar sendiri tanpa jarak berlebih)
  html += `<div class="surat-group-grid mb-4 text-[13px]">`
  html += `<div class="surat-col-label font-medium">Nomor</div><div class="surat-col-sep">:</div><div class="surat-col-val">${replaceTags(builder.nomorSurat || meta.nomorSurat || '')}</div>`
  if (builder.lampiran) {
    html += `<div class="surat-col-label font-medium">Lampiran</div><div class="surat-col-sep">:</div><div class="surat-col-val">${replaceTags(builder.lampiran)}</div>`
  }
  html += `<div class="surat-col-label font-medium">Perihal</div><div class="surat-col-sep">:</div><div class="surat-col-val font-bold">${replaceTags(builder.perihal || meta.judul || '')}</div>`
  html += `</div>`

  // 2. Tujuan & Identitas Penerima (Induk di kiri, baris anak identitas menjorok ke kanan)
  html += `<div class="mb-4 text-[13px] leading-relaxed">`
  html += `<p>Kepada Yth.</p>`
  html += `<p class="font-medium">${replaceTags(builder.tujuanTipe || 'Bapak/Ibu Orang Tua / Wali Murid dari:')}</p>`
  if (builder.tujuanBaris && builder.tujuanBaris.length > 0) {
    html += `<div class="surat-group-grid surat-indent mt-1 mb-1">`
    builder.tujuanBaris.forEach(tb => {
      const tagContent = tb.tag ? `<<${tb.tag}>>` : ''
      const rawVal = `${tagContent} ${tb.suffix || ''}`.trim()
      const val = replaceTags(rawVal)
      html += `<div class="surat-col-label font-medium">${tb.label}</div><div class="surat-col-sep">:</div><div class="surat-col-val font-semibold uppercase">${val}</div>`
    })
    html += `</div>`
  }
  html += `<p class="mt-1">${replaceTags(builder.diMana || 'di Tempat')}</p>`
  html += `</div>`

  // Helper untuk merender paragraf teks dengan deteksi penomoran otomatis (1. 2. 3... atau •)
  const formatParagraphText = (rawText) => {
    if (!rawText || !rawText.trim()) return ''
    const lines = rawText.split('\n')
    let inList = false
    let listType = null // 'ol' | 'ul'
    let result = ''
    let listItems = []

    const flushList = () => {
      if (listItems.length > 0) {
        if (listType === 'ol') {
          result += `<ol class="surat-numbered-list space-y-1 my-2" style="list-style-type: decimal !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">`
          listItems.forEach(li => {
            result += `<li style="list-style-type: decimal !important; display: list-item !important; margin-bottom: 0.25rem; line-height: 1.6;">${li}</li>`
          })
          result += `</ol>`
        } else {
          result += `<ul class="surat-bullet-list space-y-1 my-2" style="list-style-type: disc !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">`
          listItems.forEach(li => {
            result += `<li style="list-style-type: disc !important; display: list-item !important; margin-bottom: 0.25rem; line-height: 1.6;">${li}</li>`
          })
          result += `</ul>`
        }
        listItems = []
        inList = false
        listType = null
      }
    }

    lines.forEach(line => {
      const trimmed = line.trim()
      const numMatch = trimmed.match(/^([0-9]+|[a-z])[\.\)]\s+(.*)$/i)
      const bulletMatch = trimmed.match(/^[-•*]\s+(.*)$/)

      if (numMatch) {
        if (inList && listType !== 'ol') flushList()
        inList = true
        listType = 'ol'
        listItems.push(replaceTags(numMatch[2]))
      } else if (bulletMatch) {
        if (inList && listType !== 'ul') flushList()
        inList = true
        listType = 'ul'
        listItems.push(replaceTags(bulletMatch[1]))
      } else {
        flushList()
        if (trimmed) {
          result += `<p class="mb-3 text-[13px] leading-relaxed text-justify" style="white-space: pre-line;">${replaceTags(line)}</p>`
        } else {
          result += `<div class="h-2"></div>`
        }
      }
    })
    flushList()
    return result
  }

  // 3. Paragraf Pembuka
  if (builder.paragrafPembuka && builder.paragrafPembuka.length > 0) {
    builder.paragrafPembuka.forEach(p => {
      if (p && p.trim()) {
        html += formatParagraphText(p)
      }
    })
  }

  // 4. Sub-Bagian Romawi (I, II, III...) dengan Sub-Poin (a, b, c...)
  // Induk I., II., III. tetap di kiri, sub-poin a., b., c. menjorok ke kanan (.surat-indent)
  // Titik dua sejajar rapi khusus di dalam grup masing-masing poin
  if (builder.sections && builder.sections.length > 0) {
    builder.sections.forEach((sec, sIdx) => {
      const roman = getRomanNumeral(sIdx)
      const cleanTitle = (sec.title || '').replace(/^[ivx0-9\.\s-]+/i, '').trim()
      html += `<div class="surat-section-heading mt-4 mb-1 font-bold text-[13px] uppercase">${roman} ${cleanTitle}</div>`
      
      if (sec.items && sec.items.length > 0) {
        html += `<div class="surat-group-grid surat-indent text-[13px] mb-2">`
        sec.items.forEach((item, iIdx) => {
          const letter = getSubLetter(iIdx)
          const tagContent = item.tag ? `<<${item.tag}>>` : ''
          const suffix = item.suffix ? ` ${item.suffix}` : ''
          const fullVal = replaceTags(`${tagContent}${suffix}`.trim())
          const isBoldVal = sIdx === (builder.sections.length - 1) && (item.label.toLowerCase().includes('status') || item.label.toLowerCase().includes('kesimpulan'))
          html += `<div class="surat-col-label">${letter} ${item.label}</div><div class="surat-col-sep">:</div><div class="surat-col-val ${isBoldVal ? 'font-bold' : 'font-medium'}">${fullVal}</div>`
        })
        html += `</div>`
      }
    })
  }

  // 5. Catatan / Poin Tambahan (Numbering / Bullet)
  if (builder.catatanPoin && builder.catatanPoin.length > 0) {
    html += `<div class="mt-3 mb-3 text-[12px] leading-relaxed text-justify">`
    if (builder.catatanJudul) {
      html += `<p class="font-semibold italic mb-1">${replaceTags(builder.catatanJudul)}</p>`
    }
    const isNumber = builder.catatanListType === 'number'
    if (isNumber) {
      html += `<ol class="surat-numbered-list space-y-1 my-1" style="list-style-type: decimal !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">`
      builder.catatanPoin.forEach(cp => {
        if (cp && cp.trim()) {
          html += `<li style="list-style-type: decimal !important; display: list-item !important; margin-bottom: 0.25rem; line-height: 1.6;">${replaceTags(cp)}</li>`
        }
      })
      html += `</ol>`
    } else {
      html += `<ul class="surat-bullet-list space-y-1 my-1" style="list-style-type: disc !important; padding-left: 1.75rem !important; margin: 0.35rem 0 0.65rem 0;">`
      builder.catatanPoin.forEach(cp => {
        if (cp && cp.trim()) {
          html += `<li style="list-style-type: disc !important; display: list-item !important; margin-bottom: 0.25rem; line-height: 1.6;">${replaceTags(cp)}</li>`
        }
      })
      html += `</ul>`
    }
    html += `</div>`
  }

  // 6. Paragraf Penutup
  if (builder.paragrafPenutup && builder.paragrafPenutup.length > 0) {
    builder.paragrafPenutup.forEach(p => {
      if (p && p.trim()) {
        html += formatParagraphText(p)
      }
    })
  }

  return html
}

/**
 * Menghasilkan file .docx resmi SMP Budi Mulia berisi tag Mail Merge CKG untuk diunduh pengguna
 * Template ini hanya berisi ISI SURAT saja, karena Kop & TTD resmi otomatis dipasang oleh sistem.
 */
export async function downloadCkgSampleDocx() {
  const zip = new JSZip()

  // [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  )

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  )

  // word/document.xml (Hanya Isi Surat Saja - Kop & TTD Dikelola Sistem)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>[ KOP SURAT RESMI SMP BUDI MULIA &amp; TTD/CAP AKAN OTOMATIS DITAMBAHKAN OLEH SISTEM ]</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Nomor		: &lt;&lt;Nomor Surat&gt;&gt;</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Lampiran	: 1 (satu) Berkas Hasil Skrining</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Perihal		: Pemberitahuan Hasil Cek Kesehatan Berkala (CKG) Siswa T.A. 2026/2027</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>Kepada Yth.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bapak/Ibu Orang Tua / Wali Murid dari:</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nama Siswa	: &lt;&lt;Nama&gt;&gt;</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Kelas / NISN	: &lt;&lt;Kelas&gt;&gt; / &lt;&lt;NISN&gt;&gt;</w:t></w:r></w:p>
    <w:p><w:r><w:t>di Tempat</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>Dengan hormat,</w:t></w:r></w:p>
    <w:p><w:r><w:t>Teriring salam dan doa semoga Bapak/Ibu beserta keluarga senantiasa berada dalam lindungan Tuhan Yang Maha Esa serta diberikan kesehatan dan berkat yang melimpah. Dalam rangka mendukung tumbuh kembang optimal serta memantau status kesehatan murid, SMP Budi Mulia telah menyelenggarakan kegiatan Cek Kesehatan Gratis (CKG) / Skrining Kesehatan Berkala Tahun Ajaran 2026/2027.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Melalui surat ini, pihak sekolah bermaksud menyampaikan laporan hasil pemeriksaan kesehatan ananda sebagai berikut:</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>DATA PEMERIKSAAN FISIK &amp; VITAL</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tinggi Badan (TB)		: &lt;&lt;TB (cm)&gt;&gt; cm</w:t></w:r></w:p>
    <w:p><w:r><w:t>Berat Badan (BB)		: &lt;&lt;BB (kg)&gt;&gt; kg</w:t></w:r></w:p>
    <w:p><w:r><w:t>Indeks Massa Tubuh (IMT)	: &lt;&lt;Indeks Massa Tubuh (kg/m2)&gt;&gt; kg/m²</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tekanan Darah		: &lt;&lt;Tekanan Darah&gt;&gt; mmHg</w:t></w:r></w:p>
    <w:p><w:r><w:t>Kadar Hemoglobin (Hb)	: &lt;&lt;HB&gt;&gt; g/dL</w:t></w:r></w:p>
    <w:p><w:r><w:t>Gula Darah Sewaktu (GDS)	: &lt;&lt;GDS&gt;&gt; mg/dL</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>PEMERIKSAAN INDERA &amp; ORGAN</w:t></w:r></w:p>
    <w:p><w:r><w:t>Telinga &amp; Pendengaran	: &lt;&lt;Tajam Pendengaran&gt;&gt; (Serumen: &lt;&lt;Serumen Impaksi&gt;&gt;)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Mata &amp; Penglihatan	: &lt;&lt;Tajam Penglihatan&gt;&gt; (Kacamata: &lt;&lt;Penggunaan Kacamata&gt;&gt;)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Gigi &amp; Rongga Mulut	: &lt;&lt;Gigi&gt;&gt;</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>KESIMPULAN &amp; ANJURAN TINDAK LANJUT</w:t></w:r></w:p>
    <w:p><w:r><w:t>Status Rekomendasi Medis	: &lt;&lt;Kesimpulan&gt;&gt;</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Catatan Bagi Orang Tua:</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Apabila hasil pemeriksaan dalam batas NORMAL: Mohon agar ananda tetap didampingi untuk menjaga pola makan bergizi seimbang, asupan air putih yang cukup, menjaga kebersihan gigi, serta membatasi durasi penggunaan gawai (gadget).</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Apabila tercatat PERLU RUJUKAN: Kami menyarankan Bapak/Ibu untuk mendampingi ananda memeriksakan diri lebih lanjut ke Fasilitas Kesehatan / Puskesmas terdekat (Poli Gigi / Poli Mata / Dokter Umum) dengan membawa salinan lembar surat pemberitahuan ini.</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t>Demikian pemberitahuan ini kami sampaikan. Atas perhatian, kerja sama yang baik, dan perhatian Bapak/Ibu terhadap kesehatan putra-putri kita, kami mengucapkan terima kasih.</w:t></w:r></w:p>
  </w:body>
</w:document>`

  zip.file('word/document.xml', documentXml)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Template_Surat_CKG_SMP_Budi_Mulia.docx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
