import { downloadPdf } from './fileDownloader'

let _cachedLogoDataUrl = null

/**
 * Memuat logo sekolah (/logo.png) dan mengonversinya ke Base64 PNG berukuran optimal
 * agar ukuran file PDF tetap ringan dan tajam.
 */
async function getSchoolLogoDataUrl(logoPath = '/logo.png') {
  if (_cachedLogoDataUrl) return _cachedLogoDataUrl
  if (typeof window === 'undefined' || typeof document === 'undefined') return null

  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const maxDim = 180
          const scale = Math.min(maxDim / (img.width || 180), maxDim / (img.height || 180), 1)
          canvas.width = Math.max(1, Math.round((img.width || 180) * scale))
          canvas.height = Math.max(1, Math.round((img.height || 180) * scale))
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          _cachedLogoDataUrl = canvas.toDataURL('image/png')
          resolve(_cachedLogoDataUrl)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = logoPath
    } catch {
      resolve(null)
    }
  })
}

/**
 * Format tanggal ke Bahasa Indonesia resmi (contoh: 11 November 2026)
 */
export function formatTanggalIndo(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return String(dateStr)
  }
}

/**
 * Menentukan predikat & warna berdasarkan skor total poin atau filter poin
 */
function getStudentStatusInfo(student, pointTypeFilter) {
  const total = Number(student.total_poin ?? 100)
  const pos = Number(student.filteredPosPoin ?? student.prestasiPoin ?? 0)
  const neg = Number(student.filteredNegPoin ?? student.pelanggaranPoin ?? 0)

  if (pointTypeFilter === 'positif') {
    if (pos >= 30) return { label: 'Sangat Berprestasi', rgb: [6, 95, 70], bgRgb: [209, 250, 229] }
    if (pos >= 10) return { label: 'Aktif Berprestasi', rgb: [22, 101, 52], bgRgb: [220, 252, 231] }
    if (pos > 0) return { label: 'Apresiasi Positif', rgb: [30, 64, 175], bgRgb: [219, 234, 254] }
    return { label: 'Belum Ada Catatan', rgb: [100, 116, 139], bgRgb: [241, 245, 249] }
  }

  if (pointTypeFilter === 'negatif') {
    if (neg >= 50 || total <= 50) return { label: 'Pembinaan Intensif', rgb: [153, 27, 27], bgRgb: [254, 226, 226] }
    if (neg >= 25 || total <= 75) return { label: 'Peringatan / SP', rgb: [154, 52, 18], bgRgb: [255, 237, 213] }
    if (neg > 0) return { label: 'Perlu Perhatian', rgb: [146, 64, 14], bgRgb: [254, 243, 199] }
    return { label: 'Nihil Pelanggaran', rgb: [22, 101, 52], bgRgb: [220, 252, 231] }
  }

  // Default: Semua Poin
  if (total > 100) return { label: 'Sangat Baik (Prestasi)', rgb: [6, 95, 70], bgRgb: [209, 250, 229] }
  if (total === 100) return { label: 'Baik (Standar)', rgb: [30, 64, 175], bgRgb: [219, 234, 254] }
  if (total >= 75) return { label: 'Perhatian (Waspada)', rgb: [146, 64, 14], bgRgb: [254, 243, 199] }
  if (total >= 50) return { label: 'Peringatan (Pembinaan)', rgb: [154, 52, 18], bgRgb: [255, 237, 213] }
  return { label: 'Kritis (Panggilan Ortu)', rgb: [153, 27, 27], bgRgb: [254, 226, 226] }
}

/**
 * Menggambar Kop Surat Resmi SMP Budi Mulia Jakarta pada dokumen jsPDF
 * Mengembalikan koordinat Y setelah Kop Surat.
 */
function drawOfficialLetterhead(doc, config, logoDataUrl, pageWidth) {
  const marginX = 14
  const startY = 11

  // Logo Sekolah di sisi kiri
  if (logoDataUrl && config.showLogo !== false) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginX + 2, startY, 21, 21)
    } catch {
      // Abaikan jika gagal render gambar
    }
  }

  const centerX = pageWidth / 2 + (logoDataUrl && config.showLogo !== false ? 6 : 0)

  // Baris 1: Yayasan / Perkumpulan
  doc.setFont('times', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(51, 65, 85)
  doc.text(
    (config.yayasanName || 'PERKUMPULAN PERGURUAN BUDI MULIA JAKARTA').toUpperCase(),
    centerX,
    startY + 4.5,
    { align: 'center' }
  )

  // Baris 2: Nama Sekolah Utama
  doc.setFont('times', 'bold')
  doc.setFontSize(14.5)
  doc.setTextColor(15, 23, 42)
  doc.text(
    (config.schoolName || 'SEKOLAH MENENGAH PERTAMA (SMP) BUDI MULIA JAKARTA').toUpperCase(),
    centerX,
    startY + 10.5,
    { align: 'center' }
  )

  // Baris 3: Akreditasi & Alamat
  doc.setFont('times', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text(
    config.schoolAddress || 'Jl. Mangga Besar Raya No. 135, Mangga Dua Selatan, Kec. Sawah Besar, Jakarta Pusat 10730',
    centerX,
    startY + 15.2,
    { align: 'center' }
  )

  // Baris 4: Kontak & Portal Resmi
  doc.setFontSize(8)
  doc.text(
    config.schoolContact || 'Telp. (021) 6291767 • Email: smpbudimulia51@gmail.com • Portal Akademik: edu.smpbudimuliajakarta.sch.id',
    centerX,
    startY + 19.3,
    { align: 'center' }
  )

  // Garis Ganda Kop Surat (Tebal + Tipis)
  const lineY = startY + 23.5
  doc.setDrawColor(15, 23, 42)
  doc.setLineWidth(0.75)
  doc.line(marginX, lineY, pageWidth - marginX, lineY)
  doc.setLineWidth(0.25)
  doc.line(marginX, lineY + 1.1, pageWidth - marginX, lineY + 1.1)

  return lineY + 6
}

/**
 * Menggambar Footer Resmi & Nomor Halaman di seluruh lembar PDF
 */
function drawAllPageFooters(doc, documentTitle) {
  const totalPages = doc.internal.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const printTimeStr = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const footerLineY = pageHeight - 11
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.25)
    doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.2)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `Dokumen Resmi eBudiMulia SMP Budi Mulia Jakarta • Dicetak pada ${printTimeStr} WIB`,
      marginX,
      footerLineY + 4
    )

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(51, 65, 85)
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - marginX,
      footerLineY + 4,
      { align: 'right' }
    )
  }
}

/**
 * Menggambar Blok Tanda Tangan / Pengesahan Resmi
 */
function drawSignatureBlock(doc, curY, config, pageWidth, pageHeight) {
  if (config.showSignature === false) return curY

  const neededHeight = 42
  const bottomLimit = pageHeight - 15
  if (curY + neededHeight > bottomLimit) {
    doc.addPage()
    curY = 20
  } else {
    curY += 7
  }

  const marginX = 14
  const leftCenterX = marginX + 42
  const rightCenterX = pageWidth - marginX - 45

  const kota = config.kotaSurat || 'Jakarta'
  const tanggalCetak = formatTanggalIndo(config.tanggalSurat || new Date())

  doc.setFont('times', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)

  // Sisi Kiri: Mengetahui Kepala Sekolah
  doc.text('Mengetahui,', leftCenterX, curY, { align: 'center' })
  doc.setFont('times', 'bold')
  doc.text(config.leftSignerTitle || 'Kepala SMP Budi Mulia Jakarta', leftCenterX, curY + 4.8, { align: 'center' })

  // Sisi Kanan: Koordinator BK / Kesiswaan / Petugas
  doc.setFont('times', 'normal')
  doc.text(`${kota}, ${tanggalCetak}`, rightCenterX, curY, { align: 'center' })
  doc.setFont('times', 'bold')
  doc.text(config.rightSignerTitle || 'Koordinator BK / Kesiswaan', rightCenterX, curY + 4.8, { align: 'center' })

  // Ruang Tanda Tangan
  const nameY = curY + 26

  // Nama Kepala Sekolah
  doc.setFont('times', 'bold')
  const leftName = config.leftSignerName || 'Septian Ruswadi, S.Pd.'
  doc.text(leftName, leftCenterX, nameY, { align: 'center' })
  const leftNameWidth = Math.max(doc.getTextWidth(leftName) + 4, 42)
  doc.setDrawColor(15, 23, 42)
  doc.setLineWidth(0.3)
  doc.line(leftCenterX - leftNameWidth / 2, nameY + 1, leftCenterX + leftNameWidth / 2, nameY + 1)

  if (config.leftSignerNip) {
    doc.setFont('times', 'normal')
    doc.setFontSize(8.5)
    doc.text(`NIP/NIK: ${config.leftSignerNip}`, leftCenterX, nameY + 4.8, { align: 'center' })
  }

  // Nama Penyusun / Guru BK
  doc.setFont('times', 'bold')
  doc.setFontSize(9.5)
  const rightName = config.rightSignerName || '................................................'
  doc.text(rightName, rightCenterX, nameY, { align: 'center' })
  const rightNameWidth = Math.max(doc.getTextWidth(rightName) + 4, 42)
  doc.line(rightCenterX - rightNameWidth / 2, nameY + 1, rightCenterX + rightNameWidth / 2, nameY + 1)

  if (config.rightSignerNip) {
    doc.setFont('times', 'normal')
    doc.setFontSize(8.5)
    doc.text(`NIP/NIK: ${config.rightSignerNip}`, rightCenterX, nameY + 4.8, { align: 'center' })
  }

  return nameY + 10
}

/**
 * Fungsi Utama Generator PDF Rekap Poin Resmi & Profesional
 *
 * @param {Object} params
 * @param {Array} params.students - Daftar siswa yang sudah difilter & diurutkan
 * @param {Object} params.recordsByNisn - Map { [nisn]: Array<point_record> } yang sudah difilter jenis poin & periodenya
 * @param {Object} params.config - Konfigurasi ekspor dari modal user
 * @param {Object} params.activeTa - Tahun Ajaran aktif
 */
export async function generateOfficialRekapPoinPDF({
  students = [],
  recordsByNisn = {},
  config = {},
  activeTa = null
}) {
  const { jsPDF } = await import('jspdf')
  const orientation = config.orientation === 'landscape' ? 'landscape' : 'portrait'
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const contentWidth = pageWidth - marginX * 2
  const bottomMargin = 16

  const logoDataUrl = await getSchoolLogoDataUrl('/logo.png')

  // Judul Utama Berdasarkan Filter Jenis Poin
  const pointTypeFilter = config.pointTypeFilter || 'semua' // 'semua' | 'positif' | 'negatif'
  const reportMode = config.reportMode || 'total_only' // 'total_only' | 'detailed'

  let defaultDocTitle = 'LAPORAN REKAPITULASI POIN KEDISIPLINAN & PRESTASI SISWA'
  if (pointTypeFilter === 'positif') {
    defaultDocTitle = 'LAPORAN REKAPITULASI POIN PRESTASI & KEBAIKAN (POSITIF) SISWA'
  } else if (pointTypeFilter === 'negatif') {
    defaultDocTitle = 'LAPORAN REKAPITULASI POIN PELANGGARAN & PEMBINAAN (NEGATIF) SISWA'
  }
  const docTitle = (config.customTitle || defaultDocTitle).toUpperCase()

  // Label Urutan
  const sortLabels = {
    absen_per_kelas: 'Sesuai Urutan Absen / Abjad Nama per Kelas (A - Z)',
    absen_global: 'Sesuai Abjad Nama Seluruh Siswa (A - Z)',
    poin_desc: 'Total Poin Tertinggi ke Terendah (Peringkat Atas)',
    poin_asc: 'Total Poin Terendah ke Tertinggi (Prioritas Pembinaan)',
    positif_desc: 'Perolehan Poin Positif (+) Terbanyak ke Terendah',
    negatif_desc: 'Bobot Poin Pelanggaran (-) Terbanyak ke Terendah'
  }
  const sortLabel = sortLabels[config.sortBy] || sortLabels.absen_per_kelas

  // Label Cakupan Kelas / Siswa
  let kelasLabel = 'Seluruh Kelas (Semua Tingkat)'
  if (config.kelasScope === 'custom_students') {
    kelasLabel = `${students.length} Siswa Pilihan Khusus`
  } else if (config.kelasScope === 'single_student' && config.selectedClasses?.[0]) {
    kelasLabel = config.selectedClasses[0]
  } else if (config.selectedClasses && config.selectedClasses.length > 0 && config.kelasScope !== 'all') {
    kelasLabel = `Kelas ${config.selectedClasses.join(', ')}`
  }

  // Label Jenis Laporan
  const modeLabel =
    reportMode === 'detailed'
      ? 'Rekapitulasi Total + Rincian Riwayat Poin per Siswa'
      : 'Rekapitulasi Total Poin Siswa (Ringkasan)'

  // Label Filter Poin
  const pointFilterLabel =
    pointTypeFilter === 'positif'
      ? 'Khusus Poin Positif / Prestasi (+)'
      : pointTypeFilter === 'negatif'
      ? 'Khusus Poin Negatif / Pelanggaran (-)'
      : 'Semua Poin (Positif & Negatif)'

  // Hitung Statistik Ringkasan dari daftar siswa yang diekspor
  const totalStudents = students.length
  let sumTotalPoin = 0
  let sumPosPoin = 0
  let sumPosCount = 0
  let sumNegPoin = 0
  let sumNegCount = 0

  students.forEach((s) => {
    sumTotalPoin += Number(s.total_poin ?? 100)
    sumPosPoin += Number(s.filteredPosPoin ?? s.prestasiPoin ?? 0)
    sumPosCount += Number(s.filteredPosCount ?? s.prestasiCount ?? 0)
    sumNegPoin += Number(s.filteredNegPoin ?? s.pelanggaranPoin ?? 0)
    sumNegCount += Number(s.filteredNegCount ?? s.pelanggaranCount ?? 0)
  })
  const avgTotalPoin = totalStudents > 0 ? (sumTotalPoin / totalStudents).toFixed(1) : '0.0'

  // Fungsi untuk menggambar Header Dokumen Lengkap (Kop + Judul + Metadata + Ringkasan)
  const drawDocumentHeader = (classSubtitle = null) => {
    let y = drawOfficialLetterhead(doc, config, logoDataUrl, pageWidth)

    // Judul Dokumen
    doc.setFont('times', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(15, 23, 42)
    doc.text(docTitle, pageWidth / 2, y + 1, { align: 'center' })
    const titleW = doc.getTextWidth(docTitle)
    doc.setDrawColor(15, 23, 42)
    doc.setLineWidth(0.35)
    doc.line((pageWidth - titleW) / 2, y + 2.2, (pageWidth + titleW) / 2, y + 2.2)

    // Nomor Surat / Dokumen
    const now = new Date()
    const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    const defaultNo = `RKP-POIN/SMP-BM/${romanMonths[now.getMonth()]}/${now.getFullYear()}`
    doc.setFont('times', 'normal')
    doc.setFontSize(8.8)
    doc.setTextColor(71, 85, 105)
    doc.text(`Nomor Dokumen: ${config.nomorDokumen || defaultNo}`, pageWidth / 2, y + 6.5, { align: 'center' })

    y += 11

    // Kotak Metadata Informasi Laporan (2 Kolom)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.25)
    doc.roundedRect(marginX, y, contentWidth, 21, 1.8, 1.8, 'FD')

    const col1LabelX = marginX + 3.5
    const col1ColonX = marginX + 35
    const col1ValX = marginX + 37.5

    const col2LabelX = marginX + contentWidth / 2 + 2
    const col2ColonX = col2LabelX + 30
    const col2ValX = col2ColonX + 2.5

    const metaRows = [
      {
        l1: 'Tahun Ajaran',
        v1: `${activeTa?.nama || '2026/2027'}${config.periodeLabel ? ` (${config.periodeLabel})` : ''}`,
        l2: 'Format Laporan',
        v2: modeLabel
      },
      {
        l1: 'Cakupan Kelas',
        v1: classSubtitle ? `Kelas ${classSubtitle}` : kelasLabel,
        l2: 'Kategori Poin',
        v2: pointFilterLabel
      },
      {
        l1: 'Urutan Data',
        v1: sortLabel,
        l2: 'Tanggal Cetak',
        v2: formatTanggalIndo(config.tanggalSurat || new Date())
      }
    ]

    metaRows.forEach((row, idx) => {
      const rowY = y + 5.2 + idx * 5.2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.8)
      doc.setTextColor(71, 85, 105)
      doc.text(row.l1, col1LabelX, rowY)
      doc.text(':', col1ColonX, rowY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(15, 23, 42)
      doc.text(doc.splitTextToSize(String(row.v1), contentWidth / 2 - 42)[0] || '', col1ValX, rowY)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(71, 85, 105)
      doc.text(row.l2, col2LabelX, rowY)
      doc.text(':', col2ColonX, rowY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(15, 23, 42)
      doc.text(doc.splitTextToSize(String(row.v2), contentWidth / 2 - 36)[0] || '', col2ValX, rowY)
    })

    y += 24

    // Kotak Ringkasan Statistik (4 Kartu Sejajar) jika di halaman pertama dan bukan sub-kelas
    if (!classSubtitle) {
      const boxGap = 2.5
      const boxW = (contentWidth - boxGap * 3) / 4
      const boxH = 13.5

      const statCards = [
        {
          title: 'TOTAL SISWA TERCATAT',
          value: `${totalStudents} Siswa`,
          borderRgb: [148, 163, 184],
          bgRgb: [248, 250, 252],
          textRgb: [15, 23, 42]
        },
        {
          title: 'RATA-RATA SKOR POIN',
          value: `${avgTotalPoin} Poin`,
          borderRgb: [129, 140, 248],
          bgRgb: [238, 242, 255],
          textRgb: [49, 46, 129]
        },
        {
          title: 'TOTAL POIN POSITIF (+)',
          value: `+${sumPosPoin} Poin (${sumPosCount}x)`,
          borderRgb: [110, 231, 183],
          bgRgb: [236, 253, 245],
          textRgb: [6, 95, 70]
        },
        {
          title: 'TOTAL POIN NEGATIF (-)',
          value: `-${sumNegPoin} Poin (${sumNegCount}x)`,
          borderRgb: [252, 165, 165],
          bgRgb: [254, 242, 242],
          textRgb: [153, 27, 27]
        }
      ]

      statCards.forEach((c, idx) => {
        const bx = marginX + idx * (boxW + boxGap)
        doc.setFillColor(...c.bgRgb)
        doc.setDrawColor(...c.borderRgb)
        doc.setLineWidth(0.25)
        doc.roundedRect(bx, y, boxW, boxH, 1.5, 1.5, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(100, 116, 139)
        doc.text(c.title, bx + 3, y + 4.5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(...c.textRgb)
        doc.text(c.value, bx + 3, y + 10.5)
      })

      y += boxH + 4.5
    }

    return y
  }

  // ============================================================================
  // MODE 1: REKAPITULASI TOTAL POIN SAJA (TABEL RINGKAS & PRESISI)
  // ============================================================================
  if (reportMode === 'total_only') {
    // Susun definisi kolom sesuai pointTypeFilter dan lebar halaman
    const getColumns = () => {
      if (pointTypeFilter === 'positif') {
        return [
          { key: 'no', label: 'NO', width: 10, align: 'center' },
          { key: 'nisn', label: 'NISN', width: 24, align: 'center' },
          { key: 'nama', label: 'NAMA LENGKAP SISWA', width: contentWidth - 134, align: 'left' },
          { key: 'kelas', label: 'KELAS', width: 16, align: 'center' },
          { key: 'posCount', label: 'JML KEGIATAN', width: 22, align: 'center' },
          { key: 'posPoin', label: 'POIN POSITIF (+)', width: 24, align: 'center' },
          { key: 'totalPoin', label: 'TOTAL POIN', width: 18, align: 'center' },
          { key: 'status', label: 'KETERANGAN / PREDIKAT', width: 20, align: 'center' }
        ]
      }
      if (pointTypeFilter === 'negatif') {
        return [
          { key: 'no', label: 'NO', width: 10, align: 'center' },
          { key: 'nisn', label: 'NISN', width: 24, align: 'center' },
          { key: 'nama', label: 'NAMA LENGKAP SISWA', width: contentWidth - 134, align: 'left' },
          { key: 'kelas', label: 'KELAS', width: 16, align: 'center' },
          { key: 'negCount', label: 'JML KASUS', width: 20, align: 'center' },
          { key: 'negPoin', label: 'POIN NEGATIF (-)', width: 24, align: 'center' },
          { key: 'totalPoin', label: 'SISA POIN', width: 18, align: 'center' },
          { key: 'status', label: 'STATUS PEMBINAAN', width: 22, align: 'center' }
        ]
      }
      // Semua Poin (Positif + Negatif + Total Akhir)
      return [
        { key: 'no', label: 'NO', width: 9, align: 'center' },
        { key: 'nisn', label: 'NISN', width: 22, align: 'center' },
        { key: 'nama', label: 'NAMA LENGKAP SISWA', width: contentWidth - 139, align: 'left' },
        { key: 'kelas', label: 'KELAS', width: 14, align: 'center' },
        { key: 'poinAwal', label: 'POIN AWAL', width: 16, align: 'center' },
        { key: 'posPoin', label: 'POSITIF (+)', width: 20, align: 'center' },
        { key: 'negPoin', label: 'NEGATIF (-)', width: 20, align: 'center' },
        { key: 'totalPoin', label: 'TOTAL AKHIR', width: 18, align: 'center' },
        { key: 'status', label: 'PREDIKAT / STATUS', width: 20, align: 'center' }
      ]
    }

    const columns = getColumns()

    const drawTableHeader = (yPos, classHeaderLabel = null) => {
      if (classHeaderLabel) {
        doc.setFillColor(224, 231, 255)
        doc.setDrawColor(165, 180, 252)
        doc.setLineWidth(0.25)
        doc.rect(marginX, yPos, contentWidth, 6.8, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.2)
        doc.setTextColor(30, 58, 138)
        doc.text(`DAFTAR SISWA KELAS ${classHeaderLabel}`, marginX + 3, yPos + 4.6)
        yPos += 6.8
      }

      const headerH = 7.5
      doc.setFillColor(30, 41, 59) // Slate-800 resmi
      doc.setDrawColor(30, 41, 59)
      doc.setLineWidth(0.25)
      doc.rect(marginX, yPos, contentWidth, headerH, 'FD')

      let curX = marginX
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.2)
      doc.setTextColor(255, 255, 255)

      columns.forEach((col) => {
        const textX =
          col.align === 'center'
            ? curX + col.width / 2
            : col.align === 'right'
            ? curX + col.width - 2
            : curX + 2.5
        doc.text(col.label, textX, yPos + 5, { align: col.align })
        curX += col.width
      })

      return yPos + headerH
    }

    // Jika pageBreakPerClass aktif, kelompokkan berdasarkan kelas
    const groups = []
    if (config.pageBreakPerClass) {
      const classMap = new Map()
      students.forEach((s) => {
        const k = s.kelas || '-'
        if (!classMap.has(k)) classMap.set(k, [])
        classMap.get(k).push(s)
      })
      classMap.forEach((list, k) => groups.push({ kelas: k, list }))
    } else {
      groups.push({ kelas: null, list: students })
    }

    let curY = 0
    groups.forEach((group, gIdx) => {
      if (gIdx > 0) {
        doc.addPage()
      }
      curY = drawDocumentHeader(group.kelas)
      curY = drawTableHeader(curY, group.kelas)

      if (group.list.length === 0) {
        doc.setDrawColor(203, 213, 225)
        doc.rect(marginX, curY, contentWidth, 10)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8.5)
        doc.setTextColor(100, 116, 139)
        doc.text('Tidak ada data siswa yang memenuhi kriteria filter.', pageWidth / 2, curY + 6.2, { align: 'center' })
        curY += 12
        return
      }

      group.list.forEach((s, idx) => {
        const rowH = 6.8
        if (curY + rowH > pageHeight - bottomMargin) {
          doc.addPage()
          curY = 16
          curY = drawTableHeader(curY, group.kelas ? `${group.kelas} (Lanjutan)` : null)
        }

        // Zebra striping
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252)
          doc.rect(marginX, curY, contentWidth, rowH, 'F')
        }

        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.rect(marginX, curY, contentWidth, rowH, 'S')

        const posPoin = Number(s.filteredPosPoin ?? s.prestasiPoin ?? 0)
        const posCount = Number(s.filteredPosCount ?? s.prestasiCount ?? 0)
        const negPoin = Number(s.filteredNegPoin ?? s.pelanggaranPoin ?? 0)
        const negCount = Number(s.filteredNegCount ?? s.pelanggaranCount ?? 0)
        const totalPoin = Number(s.total_poin ?? 100)
        const poinAwal = Number(s.poin_default ?? 100)
        const statusInfo = getStudentStatusInfo(s, pointTypeFilter)

        let curX = marginX
        columns.forEach((col) => {
          // Garis vertikal pemisah kolom
          doc.setDrawColor(226, 232, 240)
          doc.line(curX, curY, curX, curY + rowH)

          const textY = curY + 4.6
          const centerX = curX + col.width / 2

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.8)
          doc.setTextColor(30, 41, 59)

          if (col.key === 'no') {
            doc.text(String(idx + 1), centerX, textY, { align: 'center' })
          } else if (col.key === 'nisn') {
            doc.setFont('courier', 'normal')
            doc.setFontSize(7.5)
            doc.text(String(s.nisn || '-'), centerX, textY, { align: 'center' })
          } else if (col.key === 'nama') {
            doc.setFont('helvetica', 'bold')
            const maxChars = Math.floor((col.width - 4) / 1.65)
            const nameStr = String(s.nama_lengkap || '-')
            const clipped = nameStr.length > maxChars ? nameStr.slice(0, maxChars - 1) + '…' : nameStr
            doc.text(clipped, curX + 2.2, textY)
          } else if (col.key === 'kelas') {
            doc.setFont('helvetica', 'bold')
            doc.text(String(s.kelas || '-'), centerX, textY, { align: 'center' })
          } else if (col.key === 'poinAwal') {
            doc.text(String(poinAwal), centerX, textY, { align: 'center' })
          } else if (col.key === 'posCount') {
            doc.text(`${posCount}x`, centerX, textY, { align: 'center' })
          } else if (col.key === 'negCount') {
            doc.text(`${negCount}x`, centerX, textY, { align: 'center' })
          } else if (col.key === 'posPoin') {
            if (posPoin > 0) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(6, 95, 70)
              doc.text(`+${posPoin}`, centerX, textY, { align: 'center' })
            } else {
              doc.setTextColor(148, 163, 184)
              doc.text('0', centerX, textY, { align: 'center' })
            }
          } else if (col.key === 'negPoin') {
            if (negPoin > 0) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(185, 28, 28)
              doc.text(`-${negPoin}`, centerX, textY, { align: 'center' })
            } else {
              doc.setTextColor(148, 163, 184)
              doc.text('0', centerX, textY, { align: 'center' })
            }
          } else if (col.key === 'totalPoin') {
            doc.setFont('helvetica', 'bold')
            if (totalPoin > 100) doc.setTextColor(6, 95, 70)
            else if (totalPoin < 75) doc.setTextColor(185, 28, 28)
            else if (totalPoin < 100) doc.setTextColor(180, 83, 9)
            else doc.setTextColor(15, 23, 42)
            doc.text(String(totalPoin), centerX, textY, { align: 'center' })
          } else if (col.key === 'status') {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(6.5)
            doc.setTextColor(...statusInfo.rgb)
            doc.text(statusInfo.label, centerX, textY, { align: 'center' })
          }

          curX += col.width
        })

        curY += rowH
      })
    })

    // Gambar Blok Tanda Tangan di bagian akhir
    drawSignatureBlock(doc, curY, config, pageWidth, pageHeight)
  } else {
    // ============================================================================
    // MODE 2: REKAP TOTAL + RINCIAN POIN YANG DIDAPATKAN PER SISWA
    // ============================================================================
    const detailCols = [
      { key: 'no', label: 'NO', width: 9, align: 'center' },
      { key: 'tanggal', label: 'TANGGAL', width: 22, align: 'center' },
      { key: 'kode', label: 'KODE', width: 18, align: 'center' },
      { key: 'jenis', label: 'RINCIAN KEGIATAN / PRESTASI / PELANGGARAN', width: contentWidth - 115, align: 'left' },
      { key: 'poin', label: 'POIN', width: 16, align: 'center' },
      { key: 'keterangan', label: 'CATATAN', width: 26, align: 'left' },
      { key: 'petugas', label: 'PENCATAT', width: 24, align: 'left' }
    ]

    let curY = drawDocumentHeader(null)
    let currentClassGroup = null

    if (students.length === 0) {
      doc.setDrawColor(203, 213, 225)
      doc.rect(marginX, curY, contentWidth, 12)
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text('Tidak ada data siswa yang sesuai kriteria filter.', pageWidth / 2, curY + 7.5, { align: 'center' })
      curY += 15
    }

    students.forEach((s, sIdx) => {
      // Cek apakah ganti kelas & opsi pageBreakPerClass aktif
      if (config.pageBreakPerClass && currentClassGroup !== null && currentClassGroup !== s.kelas) {
        doc.addPage()
        curY = drawDocumentHeader(s.kelas)
      }
      currentClassGroup = s.kelas

      const rawRecords = recordsByNisn[s.nisn] || []
      const posPoin = Number(s.filteredPosPoin ?? s.prestasiPoin ?? 0)
      const negPoin = Number(s.filteredNegPoin ?? s.pelanggaranPoin ?? 0)
      const totalPoin = Number(s.total_poin ?? 100)
      const statusInfo = getStudentStatusInfo(s, pointTypeFilter)

      // Estimasi tinggi minimum kartu siswa + minimal 1 baris rincian
      const minNeededH = rawRecords.length > 0 ? 22 : 14
      if (curY + minNeededH > pageHeight - bottomMargin) {
        doc.addPage()
        curY = 15
      }

      // 1. Header Bar Siswa (Indigo/Slate lembut)
      const studentHeaderH = 7.8
      doc.setFillColor(238, 242, 255) // Indigo-50
      doc.setDrawColor(165, 180, 252) // Indigo-300
      doc.setLineWidth(0.3)
      doc.rect(marginX, curY, contentWidth, studentHeaderH, 'FD')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.2)
      doc.setTextColor(30, 41, 59)
      const leftStudentTitle = `${sIdx + 1}. ${s.nama_lengkap || '-'}  (NISN: ${s.nisn || '-'})  •  Kelas ${s.kelas || '-'}`
      doc.text(leftStudentTitle, marginX + 2.5, curY + 5.1)

      // Ringkasan Poin Siswa di sisi kanan bar
      let rightSummaryText = ''
      if (pointTypeFilter === 'positif') {
        rightSummaryText = `Positif: +${posPoin} Poin (${rawRecords.length} Kegiatan)  |  Total Poin: ${totalPoin}`
      } else if (pointTypeFilter === 'negatif') {
        rightSummaryText = `Pelanggaran: -${negPoin} Poin (${rawRecords.length} Kasus)  |  Sisa Poin: ${totalPoin}`
      } else {
        rightSummaryText = `Awal: ${s.poin_default ?? 100}  |  Positif: +${posPoin}  |  Negatif: -${negPoin}  |  Total: ${totalPoin} Poin (${statusInfo.label})`
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.4)
      doc.setTextColor(...statusInfo.rgb)
      doc.text(rightSummaryText, pageWidth - marginX - 2.5, curY + 5.1, { align: 'right' })

      curY += studentHeaderH

      // 2. Tabel Rincian Poin untuk Siswa Ini
      if (rawRecords.length === 0) {
        const emptyH = 6.2
        doc.setFillColor(255, 255, 255)
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.2)
        doc.rect(marginX, curY, contentWidth, emptyH, 'FD')
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7.3)
        doc.setTextColor(148, 163, 184)
        doc.text(
          '— Tidak ada rincian catatan poin pada kategori/periode ini —',
          marginX + 4,
          curY + 4.2
        )
        curY += emptyH + 3.5
      } else {
        const drawSubTableHeader = (yPos) => {
          const subH = 6.2
          doc.setFillColor(51, 65, 85) // Slate-700
          doc.setDrawColor(51, 65, 85)
          doc.rect(marginX, yPos, contentWidth, subH, 'FD')
          let cx = marginX
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(6.8)
          doc.setTextColor(255, 255, 255)
          detailCols.forEach((col) => {
            const tx = col.align === 'center' ? cx + col.width / 2 : cx + 2
            doc.text(col.label, tx, yPos + 4.3, { align: col.align })
            cx += col.width
          })
          return yPos + subH
        }

        curY = drawSubTableHeader(curY)

        rawRecords.forEach((rec, rIdx) => {
          const jenisLines = doc.splitTextToSize(String(rec.jenis || '-'), detailCols[3].width - 4)
          const ketLines = doc.splitTextToSize(String(rec.keterangan || '—'), detailCols[5].width - 3)
          const maxLines = Math.min(3, Math.max(jenisLines.length, ketLines.length, 1))
          const rowH = Math.max(6.2, maxLines * 3.8 + 2.2)

          if (curY + rowH > pageHeight - bottomMargin) {
            doc.addPage()
            curY = 15
            // Tampilkan nama siswa lanjutan
            doc.setFillColor(241, 245, 249)
            doc.setDrawColor(203, 213, 225)
            doc.rect(marginX, curY, contentWidth, 6, 'FD')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7.5)
            doc.setTextColor(51, 65, 85)
            doc.text(`Lanjutan Rincian Poin: ${s.nama_lengkap} (${s.kelas})`, marginX + 2.5, curY + 4.2)
            curY += 6
            curY = drawSubTableHeader(curY)
          }

          if (rIdx % 2 === 1) {
            doc.setFillColor(248, 250, 252)
            doc.rect(marginX, curY, contentWidth, rowH, 'F')
          }

          doc.setDrawColor(226, 232, 240)
          doc.setLineWidth(0.2)
          doc.rect(marginX, curY, contentWidth, rowH, 'S')

          const pVal = Number(rec.poin_diberikan || 0)
          let cx = marginX
          detailCols.forEach((col) => {
            doc.setDrawColor(226, 232, 240)
            doc.line(cx, curY, cx, curY + rowH)

            const ty = curY + 4.2
            const centerX = cx + col.width / 2

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.3)
            doc.setTextColor(30, 41, 59)

            if (col.key === 'no') {
              doc.text(String(rIdx + 1), centerX, ty, { align: 'center' })
            } else if (col.key === 'tanggal') {
              doc.text(String(rec.tanggal || '-'), centerX, ty, { align: 'center' })
            } else if (col.key === 'kode') {
              doc.setFont('courier', 'bold')
              doc.setFontSize(6.8)
              doc.setTextColor(67, 56, 202)
              doc.text(String(rec.kode_katalog || 'MANUAL').slice(0, 10), centerX, ty, { align: 'center' })
            } else if (col.key === 'jenis') {
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(15, 23, 42)
              doc.text(jenisLines.slice(0, maxLines), cx + 2, ty)
            } else if (col.key === 'poin') {
              doc.setFont('helvetica', 'bold')
              if (pVal >= 0) {
                doc.setTextColor(6, 95, 70)
                doc.text(`+${pVal}`, centerX, ty, { align: 'center' })
              } else {
                doc.setTextColor(185, 28, 28)
                doc.text(`${pVal}`, centerX, ty, { align: 'center' })
              }
            } else if (col.key === 'keterangan') {
              doc.setFontSize(6.8)
              doc.setTextColor(71, 85, 105)
              doc.text(ketLines.slice(0, maxLines), cx + 1.5, ty)
            } else if (col.key === 'petugas') {
              doc.setFontSize(6.8)
              doc.setTextColor(71, 85, 105)
              const petStr = String(rec.dicatat_oleh || '-')
              const petClipped = petStr.length > 16 ? petStr.slice(0, 15) + '…' : petStr
              doc.text(petClipped, cx + 1.5, ty)
            }

            cx += col.width
          })

          curY += rowH
        })

        curY += 4
      }
    })

    // Gambar Blok Tanda Tangan di bagian akhir
    drawSignatureBlock(doc, curY, config, pageWidth, pageHeight)
  }

  // Gambar Footer & Nomor Halaman di semua lembar
  drawAllPageFooters(doc, docTitle)

  // Simpan / Unduh File PDF atau Buka Dialog Print Langsung
  const todayStr = new Date().toISOString().slice(0, 10)
  const kelasSlug =
    config.kelasScope === 'all' || !config.selectedClasses || config.selectedClasses.length === 0
      ? 'semua-kelas'
      : `kelas-${config.selectedClasses.join('-').toLowerCase()}`
  const filename = config.customFilename || `Laporan-Rekap-Poin-${kelasSlug}-${todayStr}.pdf`

  if (config.action === 'print') {
    doc.autoPrint({ variant: 'non-conform' })
    const blob = doc.output('blob')
    const blobUrl = URL.createObjectURL(blob)

    // Buka tab cetak langsung dengan PDF auto-print
    const printWindow = window.open(blobUrl, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        try {
          printWindow.focus()
          printWindow.print()
        } catch (_) {}
      }
    } else {
      // Fallback menggunakan hidden iframe jika popup tab baru diblokir oleh browser
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.src = blobUrl
      document.body.appendChild(iframe)
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.focus()
            iframe.contentWindow?.print()
          } catch (_) {
            doc.save(filename)
          }
        }, 500)
      }
    }
  } else {
    await downloadPdf(doc, filename)
  }
}

