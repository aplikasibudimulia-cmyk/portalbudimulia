import { downloadPdf } from './fileDownloader'
import { getSchoolLogoDataUrl, drawOfficialLetterhead, drawAllPageFooters } from './rekapPoinPdfExporter'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const tglPendek = (s) => { const d = parse(s); return `${HARI[d.getUTCDay()].slice(0, 3)}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
export const tglPanjang = (s) => { const d = parse(s); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}` }

/**
 * Membuat PDF "Jurnal Mengajar Guru" resmi (A4 landscape) lengkap kop surat & tanda tangan.
 * @param {Object} p
 * @param {Array}  p.journals  baris jurnal (sudah terurut) dengan field: tanggal, jam_ke_awal, jam_ke_akhir, kelas,
 *                             mata_pelajaran.nama, status, materi, kegiatan, siswa_tidak_hadir, alasan, catatan
 * @param {string} p.guruNama
 * @param {string} p.periodeDari / p.periodeSampai  (YYYY-MM-DD)
 * @param {string} p.tahunAjaran / p.semester
 * @param {string} p.kepsekNama
 * @param {string} p.tempat
 * @param {string} p.tanggalCetak (YYYY-MM-DD)
 */
export async function generateJurnalMengajarPDF({
  journals = [],
  guruNama = '',
  periodeDari,
  periodeSampai,
  tahunAjaran = '',
  semester = '',
  kepsekNama = '',
  tempat = 'Jakarta',
  tanggalCetak
}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const bottomLimit = pageHeight - 16
  const logo = await getSchoolLogoDataUrl()

  let y = drawOfficialLetterhead(doc, {}, logo, pageWidth)

  // Judul
  y += 1.5
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('JURNAL MENGAJAR GURU', pageWidth / 2, y, { align: 'center' })
  const tw = doc.getTextWidth('JURNAL MENGAJAR GURU')
  doc.setLineWidth(0.3)
  doc.line(pageWidth / 2 - tw / 2, y + 1, pageWidth / 2 + tw / 2, y + 1)
  y += 7

  // Identitas
  doc.setFontSize(9.5)
  const info = [
    ['Nama Guru', guruNama || '-'],
    ['Tahun Ajaran / Semester', `${tahunAjaran || '-'} / ${semester || '-'}`],
    ['Periode', `${tglPanjang(periodeDari)} s.d. ${tglPanjang(periodeSampai)}`]
  ]
  info.forEach(([k, v]) => {
    doc.setFont('times', 'bold'); doc.text(k, marginX, y)
    doc.setFont('times', 'normal'); doc.text(`: ${v}`, marginX + 46, y)
    y += 5
  })
  y += 2

  // Tabel
  const cols = [
    { h: 'NO', w: 8, align: 'center' },
    { h: 'TANGGAL', w: 27 },
    { h: 'JAM', w: 13, align: 'center' },
    { h: 'KELAS', w: 14, align: 'center' },
    { h: 'MATA PELAJARAN', w: 32 },
    { h: 'MATERI / TOPIK', w: 62 },
    { h: 'KEGIATAN / METODE', w: 48 },
    { h: 'SISWA TIDAK HADIR', w: 47 },
    { h: 'KET.', w: 18, align: 'center' }
  ]
  const tableW = cols.reduce((a, c) => a + c.w, 0)
  const lineH = 3.7
  const pad = 1.6

  const drawHeader = () => {
    doc.setFillColor(51, 65, 85)
    doc.rect(marginX, y, tableW, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.4)
    doc.setTextColor(255, 255, 255)
    let x = marginX
    cols.forEach(c => {
      const tx = c.align === 'center' ? x + c.w / 2 : x + pad
      doc.text(c.h, tx, y + 4.6, { align: c.align === 'center' ? 'center' : 'left' })
      x += c.w
    })
    y += 7
    doc.setTextColor(15, 23, 42)
  }

  const SIGN_H = 46
  drawHeader()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  if (journals.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100, 116, 139)
    doc.text('Tidak ada jurnal pada periode ini.', pageWidth / 2, y + 8, { align: 'center' })
    y += 14
    doc.setTextColor(15, 23, 42)
  }

  journals.forEach((j, idx) => {
    const tidak = j.status === 'tidak_terlaksana'
    const jam = j.jam_ke_awal === j.jam_ke_akhir || !j.jam_ke_akhir ? `${j.jam_ke_awal ?? '-'}` : `${j.jam_ke_awal}-${j.jam_ke_akhir}`
    const cells = [
      String(idx + 1),
      tglPendek(j.tanggal),
      jam,
      j.kelas || '-',
      j.mata_pelajaran?.nama || '-',
      tidak ? `(Tidak terlaksana) ${j.alasan || ''}` : (j.materi || '-'),
      tidak ? '-' : (j.kegiatan || '-'),
      j.siswa_tidak_hadir || '-',
      tidak ? 'Tidak Terlaksana' : 'Terlaksana'
    ]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const wrapped = cells.map((t, i) => doc.splitTextToSize(String(t), cols[i].w - pad * 2))
    const maxLines = Math.max(...wrapped.map(w => w.length))
    const rowH = maxLines * lineH + pad * 2

    const isLast = idx === journals.length - 1
    const needBreak = y + rowH > bottomLimit || (isLast && y + rowH + SIGN_H > bottomLimit)
    if (needBreak) {
      doc.addPage()
      y = 14
      drawHeader()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(marginX, y, tableW, rowH, 'F')
    }
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.2)
    let x = marginX
    wrapped.forEach((lines, i) => {
      doc.rect(x, y, cols[i].w, rowH)
      const center = cols[i].align === 'center'
      if (i === 8 && tidak) doc.setTextColor(180, 83, 9)
      doc.text(lines, center ? x + cols[i].w / 2 : x + pad, y + pad + 2.7, {
        align: center ? 'center' : 'left',
        lineHeightFactor: lineH / 3.05
      })
      doc.setTextColor(15, 23, 42)
      x += cols[i].w
    })
    y += rowH
  })

  // Rekap singkat
  const total = journals.length
  const tidakCount = journals.filter(j => j.status === 'tidak_terlaksana').length
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(51, 65, 85)
  doc.text(`Total pertemuan: ${total}  •  Terlaksana: ${total - tidakCount}  •  Tidak terlaksana: ${tidakCount}`, marginX, y)
  doc.setTextColor(15, 23, 42)

  // Tanda tangan (selalu 1 halaman dengan isi terakhir tabel)
  let sy = y + 8
  if (sy + SIGN_H - 8 > bottomLimit) { doc.addPage(); sy = 22 }
  const leftX = marginX + 45
  const rightX = pageWidth - marginX - 45
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.text('Mengetahui,', leftX, sy, { align: 'center' })
  doc.text(`${tempat}, ${tglPanjang(tanggalCetak)}`, rightX, sy, { align: 'center' })
  doc.setFont('times', 'bold')
  doc.text('Kepala SMP Budi Mulia Jakarta', leftX, sy + 5, { align: 'center' })
  doc.text('Guru Mata Pelajaran', rightX, sy + 5, { align: 'center' })

  const nameY = sy + 28
  doc.text(kepsekNama || '........................................', leftX, nameY, { align: 'center' })
  doc.text(guruNama || '........................................', rightX, nameY, { align: 'center' })
  doc.setLineWidth(0.3)
  const lw = (t) => Math.max(doc.getTextWidth(t || '........................................'), 40)
  doc.line(leftX - lw(kepsekNama) / 2, nameY + 1, leftX + lw(kepsekNama) / 2, nameY + 1)
  doc.line(rightX - lw(guruNama) / 2, nameY + 1, rightX + lw(guruNama) / 2, nameY + 1)

  drawAllPageFooters(doc, 'Jurnal Mengajar')

  const slug = (guruNama || 'guru').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  await downloadPdf(doc, `Jurnal-Mengajar-${slug}-${periodeDari}_${periodeSampai}.pdf`)
}
