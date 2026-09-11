import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const defaultHtml2CanvasOptions = {
  scale: 3, // 3x scale setara 300 DPI untuk kualitas cetak tajam
  useCORS: true,
  allowTaint: false,
  backgroundColor: '#ffffff',
  ignoreElements: (el) => {
    return Boolean(
      el?.hasAttribute?.('data-html2canvas-ignore') ||
      el?.classList?.contains('glossy-overlay') ||
      el?.classList?.contains('print:hidden')
    )
  },
  logging: false,
}

/**
 * Ekspor elemen kartu pelajar sebagai gambar PNG berkualitas tinggi (300 DPI)
 */
export const exportCardAsImage = async (cardElement, fileName = 'kartu_pelajar.png') => {
  if (!cardElement) return false
  try {
    const canvas = await html2canvas(cardElement, defaultHtml2CanvasOptions)
    const image = canvas.toDataURL('image/png', 1.0)
    const link = document.createElement('a')
    link.download = fileName
    link.href = image
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return true
  } catch (err) {
    console.error('Gagal mengekspor gambar kartu:', err)
    throw err
  }
}

/**
 * Ekspor kartu pelajar (depan & belakang) sebagai PDF dengan ukuran standar ID Card CR80 (85.6mm x 54mm)
 */
export const exportCardAsPdf = async (frontElement, backElement, fileName = 'kartu_pelajar.pdf') => {
  if (!frontElement && !backElement) return false
  try {
    // Ukuran standar kartu CR80 (85.6mm x 54mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54],
    })

    if (frontElement) {
      const canvasFront = await html2canvas(frontElement, defaultHtml2CanvasOptions)
      const imgFront = canvasFront.toDataURL('image/png')
      pdf.addImage(imgFront, 'PNG', 0, 0, 85.6, 54)
    }

    if (backElement) {
      if (frontElement) {
        pdf.addPage([85.6, 54], 'landscape')
      }
      const canvasBack = await html2canvas(backElement, defaultHtml2CanvasOptions)
      const imgBack = canvasBack.toDataURL('image/png')
      pdf.addImage(imgBack, 'PNG', 0, 0, 85.6, 54)
    }

    pdf.save(fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor PDF kartu:', err)
    throw err
  }
}

/**
 * Ekspor koleksi banyak kartu pelajar langsung sebagai file PDF standar ID Card CR80
 */
export const exportBulkCardsAsPdf = async (cardElements, fileName = 'kartu_pelajar_massal.pdf', onProgress) => {
  if (!cardElements || cardElements.length === 0) return false
  try {
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
      const canvas = await html2canvas(cardElements[i], defaultHtml2CanvasOptions)
      const imgData = canvas.toDataURL('image/png')
      pdf.addImage(imgData, 'PNG', 0, 0, 85.6, 54)
    }

    pdf.save(fileName)
    return true
  } catch (err) {
    console.error('Gagal mengekspor bulk PDF kartu:', err)
    throw err
  }
}

/**
 * Buka dialog cetak browser khusus untuk kartu pelajar
 */
export const printElement = (elementId) => {
  const elem = document.getElementById(elementId)
  if (!elem) {
    window.print()
    return
  }
  
  // Clone element to print window
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
