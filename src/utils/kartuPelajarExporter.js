import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Capacitor } from '@capacitor/core'
import { downloadFile, downloadPdf } from './fileDownloader'

const defaultHtml2CanvasOptions = {
  scale: 3, // 3x scale setara 300 DPI untuk kualitas cetak tajam
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  logging: false,
  ignoreElements: (el) => {
    return Boolean(
      el?.hasAttribute?.('data-html2canvas-ignore') ||
      el?.classList?.contains('glossy-overlay') ||
      el?.classList?.contains('print:hidden')
    )
  },
  onclone: (clonedDoc) => {
    try {
      // 1. Sinkronkan font Plus Jakarta Sans dari dokumen utama ke cloned document
      if (typeof document !== 'undefined' && document.fonts && clonedDoc.fonts) {
        try {
          for (const font of document.fonts) {
            clonedDoc.fonts.add(font)
          }
        } catch {
          // ignore
        }
      }

      const fontLink = clonedDoc.createElement('link')
      fontLink.rel = 'stylesheet'
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700&display=swap'
      clonedDoc.head?.appendChild(fontLink)

      // 2. Base style reset untuk cloned DOM
      const style = clonedDoc.createElement('style')
      style.id = 'html2canvas-card-base-styles'
      style.textContent = `
        * {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        [data-card-side] {
          position: relative !important;
          width: 510px !important;
          height: 322px !important;
          min-width: 510px !important;
          min-height: 322px !important;
          max-width: 510px !important;
          max-height: 322px !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          opacity: 1 !important;
          visibility: visible !important;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        [data-card-side] * {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        [data-card-side] .font-mono, [data-card-side] .font-mono * {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        }
      `
      clonedDoc.head?.appendChild(style)

      // 3. FIX: Badge Sekolah Merah Skewed (misal: "#CERDAS BERKUALITAS!" atau "SMP BUDI MULIA")
      //    html2canvas kesulitan menghitung flexbox centering & baseline pada skewed elements.
      //    Kita TIDAK mengubah lebar/padding shape (agar shape tidak jadi lebar).
      //    Kita HANYA menggeser span teks di dalamnya sedikit ke atas (-1.5px) agar tepat di tengah.
      clonedDoc.querySelectorAll('[data-card-side] .-skew-x-12').forEach(badge => {
        badge.style.transform = 'none'
        badge.style.clipPath = 'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)'
        badge.style.webkitClipPath = 'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)'
        badge.style.overflow = 'visible'
        badge.style.display = 'inline-flex'
        badge.style.alignItems = 'center'
        badge.style.justifyContent = 'center'
        const innerSpan = badge.querySelector('.skew-x-12')
        if (innerSpan) {
          innerSpan.style.transform = 'none'
          innerSpan.style.display = 'inline-block'
          innerSpan.style.lineHeight = 'normal'
        }
      })

      // 4. FIX: Badge Kustom / Pill (misal: "BERLAKU SELAMA MENJADI SISWA")
      //    Pastikan teks tidak terpotong atau hilang, dan vertikal center pas.
      clonedDoc.querySelectorAll('[data-card-side] .rounded-full').forEach(pill => {
        pill.style.overflow = 'visible'
        const spans = pill.querySelectorAll('span')
        spans.forEach(s => {
          s.style.display = 'inline-block'
          s.style.lineHeight = '1.2'
          s.style.transform = 'translateY(-1px)'
        })
      })

      // 5. FIX: Pill Website di Footer Depan ("smpbudimuliajakarta.sch.id")
      clonedDoc.querySelectorAll('[data-card-side="front"] .absolute.bottom-0 .rounded-full').forEach(pill => {
        pill.style.display = 'inline-flex'
        pill.style.alignItems = 'center'
        pill.style.justifyContent = 'center'
        const span = pill.querySelector('span')
        if (span) {
          span.style.display = 'inline-block'
          span.style.lineHeight = '1.2'
          span.style.transform = 'translateY(-1px)'
        }
      })

      // 6. FIX: Blok Pengesahan Kepala Sekolah (Nama Kepsek & TTD Terpotong di Bawah)
      //    Di layar/cetak, container print tidak terpotong. Di export, batas 322px memotong nama.
      //    Dengan menggeser blok kepsek sedikit ke atas (-4px) di clone:
      //    - Nama kepsek (Septian Ruswadi, S.Pd) & NIP tidak akan pernah terpotong di tepi bawah.
      //    - Tanggal terbit ("Jakarta, 1 Juli 2026") juga menjauh dari badge sekolah di atasnya.
      const kepsekBlocks = clonedDoc.querySelectorAll('[data-card-side="front"] .absolute.right-4')
      kepsekBlocks.forEach(k => {
        const curTransform = k.style.transform || ''
        k.style.transform = curTransform ? `${curTransform} translateY(-4px)` : 'translateY(-4px)'
      })

      // 7. FIX: Footer Belakang ("KARTU IDENTITAS RESMI SISWA • SMP BUDI MULIA JAKARTA")
      //    Teks footer di pita gradasi bawah jangan sampai menabrak batas bawah kartu.
      const backFooters = Array.from(clonedDoc.querySelectorAll('[data-card-side="back"] *')).filter(el => 
        el.textContent && el.textContent.includes('KARTU IDENTITAS RESMI SISWA')
      )
      backFooters.forEach(bf => {
        bf.style.paddingBottom = '3px'
        bf.style.lineHeight = '1.3'
        const curTransform = bf.style.transform || ''
        bf.style.transform = curTransform ? `${curTransform} translateY(-2px)` : 'translateY(-2px)'
      })

      // 8. Pastikan container offscreen terlihat di cloned DOM
      const printables = clonedDoc.querySelectorAll('#student-card-printable, #student-card-printable-admin')
      printables.forEach(printable => {
        printable.style.position = 'fixed'
        printable.style.left = '0px'
        printable.style.top = '0px'
        printable.style.opacity = '1'
        printable.style.visibility = 'visible'
        printable.style.zIndex = '999999'
        printable.style.display = 'block'
      })

      clonedDoc.querySelectorAll('#student-card-printable *, #student-card-printable-admin *').forEach(el => {
        if (el.style && el.style.opacity === '0') {
          el.style.opacity = '1'
        }
        if (el.style && el.style.visibility === 'hidden') {
          el.style.visibility = 'visible'
        }
      })
    } catch (e) {
      console.warn('Gagal apply card print compensation di onclone:', e)
    }
  }
}

export const ensureFontsReady = async () => {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready
    } catch {
      // ignore
    }
  }
}

/**
 * Kompensasi baseline teks html2canvas:
 * Mengimbangi hardcoded +2px baseline di html2canvas (line 6583).
 * Menyesuaikan fillText (-1.5px) dan garis bawah underline (-1.5px)
 * agar teks dan underline bergerak harmonis tanpa saling terpisah.
 */
const withTextBaselineCompensation = async (fn) => {
  if (typeof window === 'undefined' || !window.CanvasRenderingContext2D) {
    return await fn()
  }

  const proto = window.CanvasRenderingContext2D.prototype
  const originalFillText = proto.fillText
  const originalFillRect = proto.fillRect

  try {
    proto.fillText = function (text, x, y, maxWidth) {
      const compensatedY = y - 3.5
      if (maxWidth !== undefined) {
        return originalFillText.call(this, text, x, compensatedY, maxWidth)
      }
      return originalFillText.call(this, text, x, compensatedY)
    }

    // Kompensasi underline (fillRect dengan tinggi 1px dan lebar > 15px)
    proto.fillRect = function (x, y, w, h) {
      if (h === 1 && w > 15) {
        return originalFillRect.call(this, x, y - 3.5, w, h)
      }
      return originalFillRect.call(this, x, y, w, h)
    }

    return await fn()
  } finally {
    proto.fillText = originalFillText
    proto.fillRect = originalFillRect
  }
}

/**
 * Helper untuk render elemen kartu ke Canvas dengan opsi aman
 */
const renderCardElement = async (cardElement) => {
  if (!cardElement) return null
  const rect = cardElement.getBoundingClientRect()
  const width = Math.round(rect.width) || 510
  const height = Math.round(rect.height) || 322

  return await withTextBaselineCompensation(async () => {
    return await html2canvas(cardElement, {
      ...defaultHtml2CanvasOptions,
      width,
      height,
    })
  })
}

/**
 * Ekspor elemen kartu pelajar sebagai gambar PNG berkualitas tinggi (300 DPI).
 * Mendukung Web browser (download file) dan Android/iOS (Capacitor Filesystem + Share).
 */
export const exportCardAsImage = async (cardElement, fileName = 'kartu_pelajar.png') => {
  if (!cardElement) return false
  try {
    await ensureFontsReady()
    const canvas = await renderCardElement(cardElement)
    if (!canvas) return false

    const dataUrl = canvas.toDataURL('image/png', 1.0)

    if (Capacitor.isNativePlatform()) {
      // Android / iOS: konversi ke Blob dan gunakan downloadFile (Filesystem + Share)
      const base64 = dataUrl.split(',')[1]
      const byteChars = atob(base64)
      const byteArray = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i)
      }
      const blob = new Blob([byteArray], { type: 'image/png' })
      await downloadFile(blob, fileName, 'image/png')
    } else {
      // Web browser: trigger download via <a> tag
      const link = document.createElement('a')
      link.download = fileName
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    return true
  } catch (err) {
    console.error('Gagal mengekspor gambar kartu:', err)
    throw err
  }
}

/**
 * Ekspor kartu pelajar (depan & belakang) sebagai PDF CR80 (85.6mm x 54mm).
 * Mendukung Web browser dan Android/iOS.
 */
export const exportCardAsPdf = async (frontElement, backElement, fileName = 'kartu_pelajar.pdf') => {
  if (!frontElement && !backElement) return false
  try {
    await ensureFontsReady()
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54],
    })

    if (frontElement) {
      const canvasFront = await renderCardElement(frontElement)
      if (canvasFront) {
        const imgFront = canvasFront.toDataURL('image/png')
        pdf.addImage(imgFront, 'PNG', 0, 0, 85.6, 54)
      }
    }

    if (backElement) {
      if (frontElement) {
        pdf.addPage([85.6, 54], 'landscape')
      }
      const canvasBack = await renderCardElement(backElement)
      if (canvasBack) {
        const imgBack = canvasBack.toDataURL('image/png')
        pdf.addImage(imgBack, 'PNG', 0, 0, 85.6, 54)
      }
    }

    // Gunakan downloadPdf untuk support Web + Native Android/iOS
    await downloadPdf(pdf, fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor PDF kartu:', err)
    throw err
  }
}

/**
 * Ekspor koleksi banyak kartu pelajar sebagai PDF CR80.
 * Mendukung Web browser dan Android/iOS.
 */
export const exportBulkCardsAsPdf = async (cardElements, fileName = 'kartu_pelajar_massal.pdf', onProgress) => {
  if (!cardElements || cardElements.length === 0) return false
  try {
    await ensureFontsReady()
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54],
    })

    for (let i = 0; i < cardElements.length; i++) {
      if (onProgress) onProgress(i + 1, cardElements.length)
      if (i > 0) {
        pdf.addPage([85.6, 54], 'landscape')
      }
      const canvas = await renderCardElement(cardElements[i])
      if (canvas) {
        const imgData = canvas.toDataURL('image/png')
        pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 54)
      }
    }

    await downloadPdf(pdf, fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor bulk PDF kartu:', err)
    throw err
  }
}

/**
 * Fungsi Pintar Cetak Kartu Pelajar:
 * - Pada Browser Desktop: Membuka window.print() standar browser (dengan preview asli).
 * - Pada Android / iOS: Otomatis mengekspor PDF CR80 dan membuka dialog Share / Print sistem
 *   sehingga pengguna dapat langsung mengirim kartu ke printer WiFi/Bluetooth atau simpan ke PDF.
 */
export const printOrShareCard = async (frontElement, backElement, studentName = 'siswa') => {
  if (Capacitor.isNativePlatform()) {
    const fileName = `cetak_kartu_${studentName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`
    return await exportCardAsPdf(frontElement, backElement, fileName)
  } else {
    window.print()
    return true
  }
}

/**
 * Buka dialog cetak browser khusus untuk elemen tertentu
 */
export const printElement = (elementId) => {
  const elem = document.getElementById(elementId)
  if (!elem) {
    window.print()
    return
  }
  
  if (Capacitor.isNativePlatform()) {
    // Pada mobile native, window.open('') tidak didukung WebView. Gunakan PDF export.
    const frontCard = elem.querySelector('[data-card-side="front"]') || elem
    const backCard = elem.querySelector('[data-card-side="back"]')
    exportCardAsPdf(frontCard, backCard, 'cetak_kartu_pelajar.pdf')
    return
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) {
    window.print()
    return
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(style => style.outerHTML)
    .join('\n')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cetak Kartu Pelajar</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: white !important;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .glossy-overlay, [data-html2canvas-ignore="true"] {
            display: none !important;
          }
          .print-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: center;
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${elem.outerHTML}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
