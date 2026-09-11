import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { downloadWorkbook } from './fileDownloader'

const defaultHtml2CanvasOptions = {
  scale: 3,
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  logging: false,
  width: 510,
  height: 322,
  windowWidth: 510,
  windowHeight: 322,
  scrollX: 0,
  scrollY: 0,
  onclone: (clonedDoc) => {
    try {
      // Inject Google Fonts and exact print color adjust into cloned doc
      const fontLink = clonedDoc.createElement('link')
      fontLink.rel = 'stylesheet'
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&display=swap'
      clonedDoc.head?.appendChild(fontLink)

      const style = clonedDoc.createElement('style')
      style.id = 'html2canvas-card-base-styles'
      style.textContent = `
        * {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        [data-card-type="kartu-ujian"] {
          position: relative !important;
          width: 510px !important;
          height: 322px !important;
          min-width: 510px !important;
          min-height: 322px !important;
          max-width: 510px !important;
          max-height: 322px !important;
          overflow: hidden !important;
          display: block !important;
          opacity: 1 !important;
          visibility: visible !important;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
        }
      `
      clonedDoc.head?.appendChild(style)

      // Pastikan parent offscreen container memiliki opacity 1 di cloned document
      clonedDoc.querySelectorAll('*').forEach(el => {
        if (el.style && el.style.opacity === '0') {
          el.style.opacity = '1'
        }
        if (el.style && el.style.visibility === 'hidden') {
          el.style.visibility = 'visible'
        }
      })
    } catch (e) {
      console.warn('Gagal apply print compensation di onclone:', e)
    }
  }
}

export const getActualCardElement = (el) => {
  if (!el) return null
  return el.matches?.('[data-card-type="kartu-ujian"]')
    ? el
    : (el.querySelector?.('[data-card-type="kartu-ujian"]') || el)
}

const ensureFontsReady = async () => {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready
    } catch {
      // ignore
    }
  }
}

/**
 * Ekspor 1 kartu ujian sebagai gambar PNG
 */
export const exportExamCardAsImage = async (cardElement, fileName = 'kartu_ujian.png') => {
  const target = getActualCardElement(cardElement)
  if (!target) return false
  try {
    await ensureFontsReady()
    const canvas = await html2canvas(target, defaultHtml2CanvasOptions)
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return true
  } catch (err) {
    console.error('Gagal mengekspor gambar kartu ujian:', err)
    throw err
  }
}

/**
 * Ekspor 1 kartu ujian sebagai file PDF standar ID Card CR80
 */
export const exportExamCardAsPdf = async (cardElement, fileName = 'kartu_ujian.pdf') => {
  const target = getActualCardElement(cardElement)
  if (!target) return false
  try {
    await ensureFontsReady()
    const canvas = await html2canvas(target, defaultHtml2CanvasOptions)
    const imgData = canvas.toDataURL('image/png')

    // Proporsi eksak kartu + border (8,5 x 6 cm = 85mm x 60mm)
    const cardW = 85.0
    const cardH = 60.0

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [cardW, cardH]
    })

    pdf.addImage(imgData, 'PNG', 0, 0, cardW, cardH)
    pdf.save(fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor PDF kartu ujian:', err)
    throw err
  }
}

/**
 * Bangun instance dokumen jsPDF A4 untuk cetak massal kartu per lembar (Format Gambar 2)
 */
export const buildBulkExamCardsA4PdfDoc = async (
  cardElements = [],
  onProgress = null,
  layoutOption = null
) => {
  if (!cardElements || cardElements.length === 0) return null

  await ensureFontsReady()

  const preset = layoutOption
    ? resolveBulkPdfPreset(layoutOption)
    : (EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '10-a4-safe') || EXAM_PRINT_LAYOUT_PRESETS[0])

  const isF4 = preset.paperSize === 'f4'
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isF4 ? [210, 330] : 'a4'
  })

  function resolveBulkPdfPreset(opt) {
    if (opt && typeof opt === 'object' && opt.cardsPerPage) return opt
    if (typeof opt === 'string') {
      const aliasMap = {
        '87x56-8': '85x60-8',
        '87x57-8': '85x60-8',
        '87x56-6': '85x60-6',
        '87x57-6': '85x60-6',
        '87x56-4': '85x60-4',
        '87x57-4': '85x60-4',
        '87x56-2': '85x60-2',
        '87x57-2': '85x60-2',
        '87x56-1': '85x60-1',
        '87x57-1': '85x60-1',
      }
      const targetId = aliasMap[opt] || opt
      const found = EXAM_PRINT_LAYOUT_PRESETS.find(p => String(p.id) === targetId || String(p.id) === opt)
      if (found) return found
    }
    const num = Number(opt)
    if (!isNaN(num)) {
      const found = EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === num || p.cardsPerPage === num)
      if (found) return found
    }
    return EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '85x60-8') || EXAM_PRINT_LAYOUT_PRESETS[0]
  }

  const cardsPerPage = preset.cardsPerPage
  const cols = preset.cols
  const rows = preset.rows
  const cellW = preset.cellWidthMm
  const cellH = preset.cellHeightMm
  const cardW = preset.cardWidthMm
  const cardH = preset.cardHeightMm
  const padX = preset.padX
  const padY = preset.padY

  const totalCards = cardElements.length

  for (let i = 0; i < totalCards; i++) {
    if (onProgress) onProgress(i + 1, totalCards)

    const cardSlotIndex = i % cardsPerPage

    // Tambah halaman baru jika masuk kelipatan kartu baru
    if (i > 0 && cardSlotIndex === 0) {
      pdf.addPage(isF4 ? [210, 330] : 'a4', 'portrait')
    }

    const col = cardSlotIndex % cols
    const row = Math.floor(cardSlotIndex / cols)

    const cellX = padX + col * cellW
    const cellY = padY + row * cellH
    const cardX = cellX + (cellW - cardW) / 2
    const cardY = cellY + (cellH - cardH) / 2

    const targetEl = getActualCardElement(cardElements[i])
    const canvas = await html2canvas(targetEl, defaultHtml2CanvasOptions)
    const imgData = canvas.toDataURL('image/png')

    // Gambar kartu
    pdf.addImage(imgData, 'PNG', cardX, cardY, cardW, cardH)

    // Gambar garis potong (cut guide) putus-putus presisi pada batas sel (garis potong)
    pdf.setDrawColor(148, 163, 184)
    pdf.setLineDashPattern([1.5, 1.5], 0)
    pdf.setLineWidth(0.2)
    pdf.rect(cellX, cellY, cellW, cellH)
  }

  return pdf
}

/**
 * Ekspor cetak massal banyak kartu ujian ke file PDF kertas A4
 */
export const exportBulkExamCardsA4Pdf = async (
  cardElements = [],
  fileName = 'kartu_ujian_massal_A4.pdf',
  onProgress = null,
  layoutOption = null
) => {
  try {
    const pdf = await buildBulkExamCardsA4PdfDoc(cardElements, onProgress, layoutOption)
    if (!pdf) return false
    pdf.save(fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor bulk A4 PDF kartu ujian:', err)
    throw err
  }
}

/**
 * Cetak langsung via PDF tab baru dengan perintah auto-print (Format Gambar 2)
 */
export const printBulkExamCardsA4Pdf = async (cardElements = [], onProgress = null, layoutOption = null) => {
  try {
    const pdf = await buildBulkExamCardsA4PdfDoc(cardElements, onProgress, layoutOption)
    if (!pdf) return false

    pdf.autoPrint({ variant: 'non-conform' })
    const blob = pdf.output('blob')
    const blobUrl = URL.createObjectURL(blob)

    const win = window.open(blobUrl, '_blank')
    if (!win) {
      pdf.save('Kartu_Ujian_Massal_A4.pdf')
    }
    return true
  } catch (err) {
    console.error('Gagal mencetak bulk A4 PDF kartu ujian:', err)
    throw err
  }
}

/**
 * Preset Susunan Cetak Kartu per Lembar A4
 * Menyediakan:
 * 1. Kategori Ukuran 8,7 x 5,7 cm (Sebesar KTP / ID Card pas, jarak garis potong dapat disesuaikan)
 * 2. Kategori Standar Proporsional A4 (1, 2, 4, 6, 8, 10 kartu)
 */
export const EXAM_PRINT_LAYOUT_PRESETS = [
  // --- KATEGORI 1: PRESET UKURAN 8,5 × 6 CM (HASIL KARTU + BORDER) ---
  {
    id: '85x60-8',
    cardsPerPage: 8,
    cols: 2,
    rows: 4,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 1.5,
    cellWidthMm: 88.0,
    cellHeightMm: 63.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 17.0,
    padY: 22.5,
    label: '8 Kartu (A4)',
    sizeLabel: '8,5 × 6 cm (Aman Bebas Terpotong ⭐)',
    badge: 'Rekomendasi A4 ⭐',
    description: '8 Kartu (A4) Kartu 8,5 × 6 cm — Pas kertas A4 tanpa risiko terpotong batas printer (Jarak potong bebas diperlebar)',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true,
    isRecommended: true
  },
  {
    id: '10-f4-exact',
    cardsPerPage: 10,
    cols: 2,
    rows: 5,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 1.0,
    cellWidthMm: 87.0,
    cellHeightMm: 62.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 18.0,
    padY: 10.0,
    label: '10 Kartu (F4)',
    sizeLabel: '8,5 × 6 cm (Folio 33 cm)',
    badge: '10 di Kertas F4',
    description: '10 Kartu (F4 / Folio 33 cm) Kartu 8,5 × 6 cm — Muat 10 kartu penuh tanpa terpotong',
    category: '85x60',
    paperSize: 'f4',
    paperHeightMm: 330.0,
    is85x60: true,
    is87x57: true,
    is87x56: true
  },
  {
    id: '10-a4-safe',
    cardsPerPage: 10,
    cols: 2,
    rows: 5,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 0,
    cellWidthMm: 85.0,
    cellHeightMm: 60.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 20.0,
    padY: 0,
    label: '10 Kartu (A4 Maks)',
    sizeLabel: '8,5 × 6 cm (30 cm > A4 29,7 cm)',
    badge: 'Rentan Terpotong',
    description: '10 Kartu (A4) Kartu 8,5 × 6 cm — Tinggi 5 baris = 30 cm (melebihi A4 29,7 cm), disarankan pilih 8 Kartu (A4) atau 10 Kartu (F4)',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true,
    isRiskyOnA4: true
  },
  {
    id: '85x60-6',
    cardsPerPage: 6,
    cols: 2,
    rows: 3,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 2.0,
    cellWidthMm: 89.0,
    cellHeightMm: 64.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 16.0,
    padY: 52.5,
    label: '6 Kartu (A4)',
    sizeLabel: 'Kartu 8,5 × 6 cm',
    badge: 'Kartu 8,5 × 6 cm',
    description: '6 Kartu (A4) Kartu 8,5 × 6 cm',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true
  },
  {
    id: '85x60-4',
    cardsPerPage: 4,
    cols: 2,
    rows: 2,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 2.0,
    cellWidthMm: 89.0,
    cellHeightMm: 64.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 16.0,
    padY: 84.5,
    label: '4 Kartu (A4)',
    sizeLabel: 'Kartu 8,5 × 6 cm',
    badge: 'Kartu 8,5 × 6 cm',
    description: '4 Kartu (A4) Kartu 8,5 × 6 cm',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true
  },
  {
    id: '85x60-2',
    cardsPerPage: 2,
    cols: 1,
    rows: 2,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 2.0,
    cellWidthMm: 89.0,
    cellHeightMm: 64.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 60.5,
    padY: 84.5,
    label: '2 Kartu (A4)',
    sizeLabel: 'Kartu 8,5 × 6 cm',
    badge: 'Kartu 8,5 × 6 cm',
    description: '2 Kartu (A4) Kartu 8,5 × 6 cm',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true
  },
  {
    id: '85x60-1',
    cardsPerPage: 1,
    cols: 1,
    rows: 1,
    cardWidthMm: 85.0,
    cardHeightMm: 60.0,
    marginMm: 2.0,
    cellWidthMm: 89.0,
    cellHeightMm: 64.0,
    scale: 0.6108,
    scaleX: 0.61076,
    scaleY: 0.67092,
    padX: 60.5,
    padY: 116.5,
    label: '1 Kartu (A4)',
    sizeLabel: 'Kartu 8,5 × 6 cm',
    badge: 'Kartu 8,5 × 6 cm',
    description: '1 Kartu (A4) Kartu 8,5 × 6 cm',
    category: '85x60',
    paperSize: 'a4',
    paperHeightMm: 297.0,
    is85x60: true,
    is87x57: true,
    is87x56: true
  },

  // --- KATEGORI 2: FORMAT STANDAR PROPORSIONAL A4 ---
  {
    id: 10,
    cardsPerPage: 10,
    cols: 2,
    rows: 5,
    cardWidthMm: 79.2,
    cardHeightMm: 48.0,
    marginMm: 2.0,
    cellWidthMm: 84.2,
    cellHeightMm: 51.0,
    scale: 0.5634,
    padX: 20.8,
    padY: 7.0,
    label: '10 Kartu (A4)',
    sizeLabel: '8,4 × 5,1 cm',
    badge: '8,4 × 5,1 cm',
    description: '10 Kartu (A4) 8,4 × 5,1 cm',
    category: 'standard',
    is87x56: false
  },
  {
    id: 8,
    cardsPerPage: 8,
    cols: 2,
    rows: 4,
    cardWidthMm: 92,
    cardHeightMm: 58.09,
    marginMm: 3.5,
    cellWidthMm: 99,
    cellHeightMm: 65.09,
    scale: 0.6818,
    padX: 6.0,
    padY: 18.32,
    label: '8 Kartu (A4)',
    sizeLabel: '9,9 × 6,5 cm',
    badge: '9,9 × 6,5 cm',
    description: '8 Kartu (A4) 9,9 × 6,5 cm',
    category: 'standard',
    is87x56: false
  },
  {
    id: 6,
    cardsPerPage: 6,
    cols: 2,
    rows: 3,
    cardWidthMm: 92,
    cardHeightMm: 58.09,
    marginMm: 4.0,
    cellWidthMm: 100,
    cellHeightMm: 66.09,
    scale: 0.6818,
    padX: 5.0,
    padY: 49.36,
    label: '6 Kartu (A4)',
    sizeLabel: '10 × 6,6 cm',
    badge: '10 × 6,6 cm',
    description: '6 Kartu (A4) 10 × 6,6 cm',
    category: 'standard',
    is87x56: false
  },
  {
    id: 4,
    cardsPerPage: 4,
    cols: 2,
    rows: 2,
    cardWidthMm: 92,
    cardHeightMm: 58.09,
    marginMm: 4.0,
    cellWidthMm: 100,
    cellHeightMm: 66.09,
    scale: 0.6818,
    padX: 5.0,
    padY: 82.41,
    label: '4 Kartu (A4)',
    sizeLabel: '10 × 6,6 cm',
    badge: '10 × 6,6 cm',
    description: '4 Kartu (A4) 10 × 6,6 cm',
    category: 'standard',
    is87x56: false
  },
  {
    id: 2,
    cardsPerPage: 2,
    cols: 1,
    rows: 2,
    cardWidthMm: 135,
    cardHeightMm: 85.23,
    marginMm: 5.0,
    cellWidthMm: 145,
    cellHeightMm: 95.23,
    scale: 1.0,
    padX: 32.5,
    padY: 53.27,
    label: '2 Kartu (A4)',
    sizeLabel: '14,5 × 9,5 cm',
    badge: '14,5 × 9,5 cm',
    description: '2 Kartu (A4) 14,5 × 9,5 cm',
    category: 'standard',
    is87x56: false
  },
  {
    id: 1,
    cardsPerPage: 1,
    cols: 1,
    rows: 1,
    cardWidthMm: 135,
    cardHeightMm: 85.23,
    marginMm: 5.0,
    cellWidthMm: 145,
    cellHeightMm: 95.23,
    scale: 1.0,
    padX: 32.5,
    padY: 100.88,
    label: '1 Kartu (A4)',
    sizeLabel: '14,5 × 9,5 cm',
    badge: '14,5 × 9,5 cm',
    description: '1 Kartu (A4) 14,5 × 9,5 cm',
    category: 'standard',
    is87x56: false
  }
]

/**
 * Cetak langsung 1 kartu di lembar A4 via native print DOM (Sama Persis Gambar 3 di Layar)
 */
export const printSingleExamCardPdf = async (cardElement, layoutOption = '85x60-1') => {
  return await printCardsDirectlyFromDom([cardElement], layoutOption)
}

/**
 * Cetak Langsung Kartu Ujian Menggunakan DOM Asli Browser (100% Persis Gambar 3 di Layar)
 * Mendukung pilihan ukuran presisi 8,5 x 6 cm (Hasil Kartu + Border), kertas F4 / Folio, dan format standar A4,
 * garis pembelah otomatis presisi sama jarak (atas, bawah, kanan, kiri), dan bingkai tebal merah-putih-biru.
 */
export const printCardsDirectlyFromDom = async (cardElements = [], layoutOption = '10-a4-safe') => {
  if (!cardElements || cardElements.length === 0) return false

  const chunkArray = (arr, size) => {
    const res = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  const resolvePreset = (opt) => {
    if (opt && typeof opt === 'object' && opt.cardsPerPage) return opt
    if (typeof opt === 'string') {
      const aliasMap = {
        '87x56-8': '85x60-8',
        '87x56-6': '85x60-6',
        '87x56-4': '85x60-4',
        '87x56-2': '85x60-2',
        '87x56-1': '85x60-1',
        '87x57-8': '85x60-8',
        '87x57-6': '85x60-6',
        '87x57-4': '85x60-4',
        '87x57-2': '85x60-2',
        '87x57-1': '85x60-1',
      }
      const targetId = aliasMap[opt] || opt
      const found = EXAM_PRINT_LAYOUT_PRESETS.find(p => String(p.id) === targetId || String(p.id) === opt)
      if (found) return found
    }
    const num = Number(opt)
    if (!isNaN(num)) {
      const foundById = EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === num)
      if (foundById) return foundById
      const foundByCards = EXAM_PRINT_LAYOUT_PRESETS.find(p => p.cardsPerPage === num)
      if (foundByCards) return foundByCards
    }
    if (opt === 'single') return EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '85x60-1' || p.id === '87x57-1') || EXAM_PRINT_LAYOUT_PRESETS[0]
    return EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '85x60-8') || EXAM_PRINT_LAYOUT_PRESETS.find(p => p.id === '10-a4-safe') || EXAM_PRINT_LAYOUT_PRESETS[0]
  }

  const preset = resolvePreset(layoutOption)

  // Clone seluruh styles, font links, and CSS dari dokumen saat ini
  const headElements = Array.from(document.querySelectorAll('link[rel="stylesheet"], style, link[href*="fonts"]'))
  const headHtml = headElements.map(el => el.outerHTML).join('\n')

  const cardHtmls = cardElements.map(el => {
    const actualCard = getActualCardElement(el) || el
    const clone = actualCard.cloneNode(true)
    clone.style.transform = 'none'
    clone.style.margin = '0'
    clone.style.border = 'none'
    return clone.outerHTML
  })

  const pages = chunkArray(cardHtmls, preset.cardsPerPage)

  const isF4 = preset.paperSize === 'f4'
  const sheetHeightMm = isF4 ? 330 : 297
  const gridWidthMm = preset.cols * preset.cellWidthMm
  const gridHeightMm = preset.rows * preset.cellHeightMm

  const pagesHtml = pages.map((pageGroup, pageIdx) => {
    // Tanda potong presisi 3.5mm di luar kotak grid (tidak melintasi kartu & tidak trigger overflow)
    const cropLinesHtml = `
      ${Array.from({ length: preset.cols + 1 }).map((_, cIdx) => {
        const posX = preset.padX + cIdx * preset.cellWidthMm
        return `
          <div style="position: absolute !important; left: ${posX}mm !important; top: ${Math.max(0, preset.padY - 3.5)}mm !important; width: 0.6px !important; height: 3.5mm !important; background: #64748b !important; z-index: 2 !important;"></div>
          <div style="position: absolute !important; left: ${posX}mm !important; top: ${Math.min(sheetHeightMm - 3.5, preset.padY + gridHeightMm)}mm !important; width: 0.6px !important; height: 3.5mm !important; background: #64748b !important; z-index: 2 !important;"></div>
        `
      }).join('')}
      ${Array.from({ length: preset.rows + 1 }).map((_, rIdx) => {
        const posY = preset.padY + rIdx * preset.cellHeightMm
        return `
          <div style="position: absolute !important; left: ${Math.max(0, preset.padX - 3.5)}mm !important; top: ${posY}mm !important; height: 0.6px !important; width: 3.5mm !important; background: #64748b !important; z-index: 2 !important;"></div>
          <div style="position: absolute !important; left: ${Math.min(210 - 3.5, preset.padX + gridWidthMm)}mm !important; top: ${posY}mm !important; height: 0.6px !important; width: 3.5mm !important; background: #64748b !important; z-index: 2 !important;"></div>
        `
      }).join('')}
    `

    return `
      <div class="print-sheet-page" style="${pageIdx === pages.length - 1 ? 'page-break-after: auto !important; break-after: auto !important;' : 'page-break-after: always !important; break-after: page !important;'}">
        ${cropLinesHtml}
        <div class="print-cut-grid">
          ${pageGroup.map(cardHtml => `
            <div class="print-card-cell">
              <div class="card-box">
                <div class="card-scaler">
                  ${cardHtml}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cetak Kartu Peserta Ujian</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet">
  ${headHtml}
  <style>
    @page {
      size: ${isF4 ? '210mm 330mm' : 'A4 portrait'};
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      width: 210mm !important;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    .print-sheet-page {
      width: 210mm !important;
      height: ${sheetHeightMm}mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      position: relative !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      overflow: hidden !important;
    }
    .print-sheet-page:not(:last-child) {
      page-break-after: always !important;
      break-after: page !important;
    }
    .print-sheet-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .print-cut-grid {
      position: absolute !important;
      top: ${preset.padY}mm !important;
      left: ${preset.padX}mm !important;
      display: grid !important;
      grid-template-columns: repeat(${preset.cols}, ${preset.cellWidthMm}mm) !important;
      grid-template-rows: repeat(${preset.rows}, ${preset.cellHeightMm}mm) !important;
      border: 0.6px solid #64748b !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      z-index: 5 !important;
    }
    .print-card-cell {
      width: ${preset.cellWidthMm}mm !important;
      height: ${preset.cellHeightMm}mm !important;
      border: 0.6px solid #64748b !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      overflow: hidden !important;
    }
    .card-box {
      width: ${preset.cardWidthMm}mm !important;
      height: ${preset.cardHeightMm}mm !important;
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: visible !important;
    }
    .card-scaler {
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      width: 510px !important;
      height: 322px !important;
      transform: translate(-50%, -50%) scale(${preset.scaleX || preset.scale}, ${preset.scaleY || preset.scale}) !important;
      transform-origin: center center !important;
    }
    [data-card-type="kartu-ujian"] {
      border: none !important;
      box-shadow: 0 0 0 2.5px #c8102e, 0 0 0 5px #ffffff, 0 0 0 8px #0a2558 !important;
      border-radius: 0px !important;
      margin: 0 !important;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`

  let printIframe = document.getElementById('exam-card-native-print-iframe')
  if (printIframe) {
    printIframe.remove()
  }
  printIframe = document.createElement('iframe')
  printIframe.id = 'exam-card-native-print-iframe'
  printIframe.style.position = 'fixed'
  printIframe.style.left = '-9999px'
  printIframe.style.top = '0'
  printIframe.style.width = '210mm'
  printIframe.style.height = isF4 ? '330mm' : '297mm'
  printIframe.style.border = '0'
  printIframe.style.zIndex = '-9999'
  document.body.appendChild(printIframe)

  const doc = printIframe.contentDocument || printIframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  if (printIframe.contentWindow.document.fonts) {
    try {
      await printIframe.contentWindow.document.fonts.ready
    } catch {}
  }

  const imgs = Array.from(doc.querySelectorAll('img'))
  await Promise.all(
    imgs.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
        setTimeout(resolve, 800)
      })
    })
  )

  await new Promise(r => setTimeout(r, 300))
  printIframe.contentWindow.focus()
  printIframe.contentWindow.print()
  return true
}

/**
 * Cetak langsung via HTML Iframe Terisolasi (100% Persis Gambar 2 & Pratinjau Gambar 3)
 */
export const printCardsViaIsolatedIframe = async (imageUrls = []) => {
  if (!imageUrls || imageUrls.length === 0) return false

  const chunkArray = (arr, size) => {
    const res = []
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size))
    return res
  }

  const pages = chunkArray(imageUrls, 4)

  const pagesHtml = pages.map((pageGroup, pageIdx) => `
    <div class="print-sheet-a4" style="${pageIdx === pages.length - 1 ? 'page-break-after: auto; break-after: auto;' : ''}">
      ${pageGroup.map(imgUrl => `
        <div class="print-card-box">
          <img src="${imgUrl}" class="print-card-img" />
        </div>
      `).join('')}
    </div>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cetak Kartu Peserta Ujian</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      width: 210mm !important;
    }
    .print-sheet-a4 {
      width: 210mm !important;
      height: 297mm !important;
      max-height: 297mm !important;
      padding: 12mm 10mm 0 10mm !important;
      display: grid !important;
      grid-template-columns: 92mm 92mm !important;
      grid-template-rows: 58.1mm 58.1mm !important;
      column-gap: 6mm !important;
      row-gap: 10mm !important;
      justify-content: start !important;
      align-content: start !important;
      page-break-after: always !important;
      break-after: page !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    .print-card-box {
      width: 92mm !important;
      height: 58.1mm !important;
      border: 1px dashed #94a3b8 !important;
      border-radius: 4px !important;
      overflow: hidden !important;
      background: #ffffff !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .print-card-img {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      object-fit: contain !important;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`

  let printIframe = document.getElementById('exam-card-isolated-print-iframe')
  if (printIframe) {
    printIframe.remove()
  }
  printIframe = document.createElement('iframe')
  printIframe.id = 'exam-card-isolated-print-iframe'
  printIframe.style.position = 'fixed'
  printIframe.style.right = '0'
  printIframe.style.bottom = '0'
  printIframe.style.width = '0'
  printIframe.style.height = '0'
  printIframe.style.border = '0'
  printIframe.style.zIndex = '-9999'
  document.body.appendChild(printIframe)

  const doc = printIframe.contentDocument || printIframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  // Pastikan seluruh gambar dataUrl telah di-decode oleh browser iframe
  const images = Array.from(doc.querySelectorAll('img'))
  await Promise.all(
    images.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
        setTimeout(resolve, 800)
      })
    })
  )

  await new Promise(r => setTimeout(r, 200))
  printIframe.contentWindow.focus()
  printIframe.contentWindow.print()
  return true
}

/**
 * Render elemen kartu ke Data URL (PNG) resolusi tinggi
 */
export const renderCardElementToDataUrl = async (cardElement) => {
  const target = getActualCardElement(cardElement)
  if (!target) return null
  await ensureFontsReady()
  const canvas = await html2canvas(target, defaultHtml2CanvasOptions)
  return canvas.toDataURL('image/png')
}

/**
 * Batch render array kartu menjadi array PNG Data URL
 */
export const renderCardElementsToDataUrls = async (cardElements = [], onProgress = null) => {
  if (!cardElements || cardElements.length === 0) return []
  await ensureFontsReady()
  const results = []
  const total = cardElements.length
  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total)
    const target = getActualCardElement(cardElements[i])
    const canvas = await html2canvas(target, defaultHtml2CanvasOptions)
    results.push(canvas.toDataURL('image/png'))
  }
  return results
}

/**
 * Ekspor rekap data peserta ujian lengkap dengan kode ujian, ruang, dan akun portal ke Excel
 */
export const exportExamStudentsToExcel = async (
  students = [],
  fileName = 'Rekap_Peserta_Ujian.xlsx',
  options = {}
) => {
  if (!Array.isArray(students) || students.length === 0) return false

  const rows = students.map((s, idx) => ({
    'No': idx + 1,
    'Kode Peserta Ujian': s.kodeUjian || '-',
    'Nama Lengkap Siswa': s.nama || s.nama_lengkap || '-',
    'Kelas': s.kelas || '-',
    'Ruang Ujian': s.ruangUjian || s.ruang || '-',
    'No. Absen': s.noAbsen || idx + 1,
    'No. Urut Rombel': s.noUrutRombel || s.noAbsen || idx + 1,
    'No. Urut Sekolah': s.noUrutSekolah || idx + 1,
    'NISN': s.nisn || '-',
    'NIPD': s.nipd || '-',
    'Username Ujian': s.portalUsername || s.username || s.kodeUjian || '-',
    'Password / PIN': s.portalPassword || s.password || '-'
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 30 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 20 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Peserta Ujian')
  await downloadWorkbook(wb, fileName)
  return true
}

/**
 * Unduh Template Excel khusus Pengaturan Ruang & Akun Login Ujian
 */
export const downloadExamAccountTemplateExcel = async (
  students = [],
  fileName = 'Template_Ruang_dan_Akun_Ujian.xlsx'
) => {
  if (!Array.isArray(students) || students.length === 0) return false

  const rows = students.map((s, idx) => ({
    'No': idx + 1,
    'NISN': s.nisn || '-',
    'Nama Siswa': s.nama || s.nama_lengkap || '-',
    'Kelas': s.kelas || '-',
    'Kode Peserta Ujian': s.kodeUjian || '-',
    'Ruang Ujian': s.ruangUjian || s.ruang || '',
    'Username': s.portalUsername || s.username || s.kodeUjian || '',
    'Password / PIN': s.portalPassword || s.password || ''
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 32 },
    { wch: 10 },
    { wch: 22 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 }
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Data Ruang & Akun')
  await downloadWorkbook(wb, fileName)
  return true
}

/**
 * Parsing file Excel unggahan untuk Ruang Ujian, Username, dan Password
 * Mendukung deteksi fleksibel berbagai variasi header kolom.
 */
export const parseExamAccountExcel = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

        if (!json || json.length === 0) {
          return resolve({ success: false, error: 'File Excel kosong atau format tidak valid.' })
        }

        const map = {}
        let count = 0

        json.forEach(row => {
          // Cari kolom NISN
          const nisnKey = Object.keys(row).find(k => /nisn/i.test(k))
          const nisn = nisnKey ? String(row[nisnKey]).trim() : ''

          // Cari kolom Kode Peserta Ujian
          const kodeKey = Object.keys(row).find(k => /(kode|nomor.*peserta)/i.test(k))
          const kode = kodeKey ? String(row[kodeKey]).trim() : ''

          // Cari kolom Nama
          const namaKey = Object.keys(row).find(k => /nama/i.test(k))
          const nama = namaKey ? String(row[namaKey]).trim().toLowerCase() : ''

          // Cari kolom Ruang
          const ruangKey = Object.keys(row).find(k => /ruang/i.test(k))
          const ruang = ruangKey ? String(row[ruangKey]).trim() : ''

          // Cari kolom Username
          const userKey = Object.keys(row).find(k => /(user|username|akun)/i.test(k))
          const username = userKey ? String(row[userKey]).trim() : ''

          // Cari kolom Password / PIN
          const passKey = Object.keys(row).find(k => /(pass|password|pin|sandi)/i.test(k))
          const password = passKey ? String(row[passKey]).trim() : ''

          if (ruang || username || password) {
            const entry = { ruang, username, password }
            if (nisn && nisn !== '-') map[nisn] = entry
            if (kode && kode !== '-') map[kode] = entry
            if (nama) map[`name_${nama}`] = entry
            count++
          }
        })

        resolve({
          success: true,
          count,
          dataMap: map
        })
      } catch (err) {
        console.error('Error saat membaca Excel:', err)
        reject(err)
      }
    }

    reader.onerror = (err) => reject(err)
    reader.readAsArrayBuffer(file)
  })
}
