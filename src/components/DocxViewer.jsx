import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { base64ToArrayBuffer } from '../utils/suratSebaranHelper'

/**
 * Meratakan titik dua (:) pada grup baris data yang menggunakan tab stop
 * agar tegak lurus sejajar persis seperti di Microsoft Word.
 */
function alignColonsInGroups(container) {
  if (!container) return

  const paragraphs = Array.from(container.querySelectorAll('section.docx p'))
  let currentGroup = []

  paragraphs.forEach((p) => {
    const text = p.textContent || ''
    const hasColon = text.includes(':')
    const tabSpans = Array.from(p.querySelectorAll('.docx-tab-stop'))

    if (hasColon && tabSpans.length > 0) {
      currentGroup.push({ p, tabSpans })
    } else {
      if (currentGroup.length > 0) {
        alignSingleOrGroupColons(currentGroup)
      }
      currentGroup = []
    }
  })

  if (currentGroup.length > 0) {
    alignSingleOrGroupColons(currentGroup)
  }
}

function alignSingleOrGroupColons(group) {
  if (!group || group.length === 0) return

  // Default tab size di Word: 36 pt = 48 px pada 96 DPI
  const defaultTabSize = 48

  // Jika grup baris (misal 1. TB, 2. BB, 3. IMT, dst atau Nomor, Lampiran, Perihal)
  if (group.length >= 2) {
    let maxLabelWidth = 0

    group.forEach(({ p, tabSpans }) => {
      const pRect = p.getBoundingClientRect()
      const firstTab = tabSpans[0]
      const tabRect = firstTab.getBoundingClientRect()
      const labelOffset = tabRect.left - pRect.left
      if (labelOffset > maxLabelWidth) {
        maxLabelWidth = labelOffset
      }
    })

    // Hitung posisi kolom target titik dua (kelipatan tab stop terdekat di atas label terpanjang)
    const targetColonX = Math.ceil((maxLabelWidth + 8) / defaultTabSize) * defaultTabSize

    group.forEach(({ p, tabSpans }) => {
      const pRect = p.getBoundingClientRect()
      const firstTab = tabSpans[0]
      const tabRect = firstTab.getBoundingClientRect()
      const currentTabLeft = tabRect.left - pRect.left

      const neededWidth = Math.max(12, targetColonX - currentTabLeft)

      // Tab pertama menampung seluruh jarak agar titik dua tepat di targetColonX
      firstTab.style.display = 'inline-block'
      firstTab.style.width = `${neededWidth}px`
      firstTab.style.minWidth = `${neededWidth}px`
      firstTab.style.textDecoration = 'none'
      firstTab.innerHTML = '&nbsp;'

      // Tab tambahan setelahnya dibuat 0 agar tidak menggeser titik dua
      for (let i = 1; i < tabSpans.length; i++) {
        tabSpans[i].style.display = 'inline-block'
        tabSpans[i].style.width = '0px'
        tabSpans[i].style.minWidth = '0px'
        tabSpans[i].style.textDecoration = 'none'
        tabSpans[i].innerHTML = ''
      }
    })
  } else {
    // Paragraf tunggal yang memiliki tab stop
    const { p, tabSpans } = group[0]
    const pRect = p.getBoundingClientRect()
    tabSpans.forEach((span) => {
      const spanRect = span.getBoundingClientRect()
      const currentOffset = spanRect.left - pRect.left
      if (currentOffset >= 0) {
        const nextStop = Math.ceil((currentOffset + 4) / defaultTabSize) * defaultTabSize
        const neededWidth = Math.max(8, nextStop - currentOffset)
        span.style.display = 'inline-block'
        span.style.width = `${neededWidth}px`
        span.style.minWidth = `${neededWidth}px`
        span.style.textDecoration = 'none'
        span.innerHTML = '&nbsp;'
      }
    })
  }
}

/**
 * Memperbaiki elemen DOM hasil render docx-preview agar logo, cap, tanda tangan,
 * garis pemisah kop, dan penataan halaman tampil 100% presisi.
 */
function fixDocxRenderedElements(container) {
  if (!container) return

  // 1. Perbaiki posisi Logo Kop Surat agar berada di kiri atas header dan TIDAK menimpa teks kop yang di tengah
  const header = container.querySelector('header')
  if (header) {
    header.style.position = 'relative'
    const headerImgs = header.querySelectorAll('img')
    headerImgs.forEach((hImg) => {
      const wrap = hImg.closest('[style*="position"]') || hImg.parentElement
      if (wrap && wrap !== header) {
        wrap.style.position = 'absolute'
        wrap.style.left = '0px'
        wrap.style.top = '0px'
        wrap.style.width = 'auto'
        wrap.style.height = 'auto'
        wrap.style.display = 'block'
        wrap.style.zIndex = '10'
      }
      hImg.style.maxWidth = 'none'
      hImg.style.maxHeight = 'none'
      hImg.style.display = 'block'
      hImg.style.visibility = 'visible'
    })
  }

  // Cek jika kop berada di 3 paragraf pertama pada halaman 1
  const firstSection = container.querySelector('section.docx')
  if (firstSection) {
    const firstArticle = firstSection.querySelector('article')
    if (firstArticle) {
      const topPs = Array.from(firstArticle.querySelectorAll('p')).slice(0, 3)
      topPs.forEach((p) => {
        const pImg = p.querySelector('img')
        if (pImg) {
          p.style.position = 'relative'
          const wrap = pImg.closest('[style*="position"]') || pImg.parentElement
          if (wrap && wrap !== p) {
            wrap.style.position = 'absolute'
            wrap.style.left = '0px'
            wrap.style.top = '0px'
            wrap.style.width = 'auto'
            wrap.style.height = 'auto'
            wrap.style.display = 'block'
            wrap.style.zIndex = '10'
          }
          pImg.style.maxWidth = 'none'
          pImg.style.maxHeight = 'none'
          pImg.style.display = 'block'
          pImg.style.visibility = 'visible'
        }
      })
    }
  }

  // 2. Pastikan SVG <image> memiliki atribut href & xlink:href yang valid serta dimensi
  const svgImages = container.querySelectorAll('svg image')
  svgImages.forEach((img) => {
    const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (href) {
      if (!img.getAttribute('href')) img.setAttribute('href', href)
      if (!img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href)
      }
    }
    if (!img.getAttribute('width')) img.setAttribute('width', '100%')
    if (!img.getAttribute('height')) img.setAttribute('height', '100%')
    img.style.overflow = 'visible'
  })

  // 3. Perbaiki SVG pembungkus garis dan bentuk
  const svgs = container.querySelectorAll('svg')
  svgs.forEach((svg) => {
    svg.style.overflow = 'visible'

    const hasImage = svg.querySelector('image')
    if (hasImage) {
      const sw = svg.style.width
      const sh = svg.style.height
      if (svg.getAttribute('width') === '0') {
        if (sw && sw !== '0px') svg.setAttribute('width', sw)
        else svg.removeAttribute('width')
      }
      if (svg.getAttribute('height') === '0') {
        if (sh && sh !== '0px') svg.setAttribute('height', sh)
        else svg.removeAttribute('height')
      }
    }

    const hasLine = svg.querySelector('line, polyline, path')
    if (hasLine) {
      if (svg.getAttribute('height') === '0') {
        svg.removeAttribute('height')
        svg.style.minHeight = '3px'
      }
    }
  })

  // 4. Pastikan garis pemisah kop (SVG line/polyline) hitam pekat dan terlihat
  const lines = container.querySelectorAll('svg line, svg polyline')
  lines.forEach((line) => {
    const stroke = line.getAttribute('stroke')
    if (!stroke || stroke === 'none' || stroke === 'transparent') {
      line.setAttribute('stroke', '#000000')
    }
    const strokeWidth = line.getAttribute('stroke-width')
    if (!strokeWidth || strokeWidth === '0px' || strokeWidth === '0') {
      line.setAttribute('stroke-width', '1.5px')
    }
    line.style.visibility = 'visible'
  })

  // 5. Pastikan rect SVG (garis tebal pemisah kop) berwarna hitam
  const rects = container.querySelectorAll('svg rect')
  rects.forEach((rect) => {
    const fill = rect.getAttribute('fill')
    if (!fill || fill === 'none' || fill === 'transparent') {
      rect.setAttribute('fill', '#000000')
    }
    rect.style.visibility = 'visible'
  })

  // 6. Pastikan seluruh gambar (Logo, Cap/Stempel, Tanda Tangan) tidak 0px
  const imgs = container.querySelectorAll('img')
  imgs.forEach((img) => {
    img.style.maxWidth = 'none'
    img.style.maxHeight = 'none'
    img.style.display = 'inline-block'
    img.style.visibility = 'visible'
    if (img.parentElement) {
      img.parentElement.style.overflow = 'visible'
    }
  })

  // 7. Sejajarkan seluruh titik dua (:) yang menggunakan tab stops
  alignColonsInGroups(container)
}

export default function DocxViewer({ docxData, className = '' }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isCancelled = false
    if (!containerRef.current || !docxData) return

    setLoading(true)
    setError(null)
    containerRef.current.innerHTML = ''

    let buffer = docxData
    if (typeof docxData === 'string') {
      try {
        buffer = base64ToArrayBuffer(docxData)
      } catch (err) {
        console.error('Failed to convert base64 to buffer:', err)
      }
    }

    renderAsync(buffer, containerRef.current, null, {
      inWrapper: true,
      hideWrapperOnPrint: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false, // Wajib false: menghormati pembagian halaman asli dari Word
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: false, // Wajib false: memuat gambar instan via URL.createObjectURL
      experimental: true, // Dukungan tab stops
      trimXmlDeclaration: true
    })
      .then(() => {
        if (!isCancelled) {
          fixDocxRenderedElements(containerRef.current)
          setTimeout(() => {
            if (!isCancelled && containerRef.current) {
              fixDocxRenderedElements(containerRef.current)
            }
          }, 60)
          setTimeout(() => {
            if (!isCancelled && containerRef.current) {
              fixDocxRenderedElements(containerRef.current)
            }
          }, 250)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Error in docx-preview renderAsync:', err)
        if (!isCancelled) {
          setError(err.message || 'Gagal menampilkan pratinjau dokumen Word.')
          setLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [docxData])

  return (
    <div className={`docx-viewer-root relative ${className}`}>
      <style>{`
        /* 1. Paksa SEMUA teks menggunakan Times New Roman persis seperti Microsoft Word */
        .docx-viewer-root,
        .docx-viewer-root .docx-wrapper,
        .docx-viewer-root section.docx,
        .docx-viewer-root section.docx *,
        .docx-viewer-root p,
        .docx-viewer-root span,
        .docx-viewer-root table,
        .docx-viewer-root td,
        .docx-viewer-root th {
          font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
        }

        /* 2. Reset Tailwind Preflight agar gambar Word (Logo, Cap, Tanda Tangan) tidak 0px */
        .docx-viewer-root img,
        .docx-viewer-root section.docx img {
          max-width: none !important;
          max-height: none !important;
          display: inline-block !important;
          visibility: visible !important;
        }

        /* 3. Kontainer floating gambar (Word Behind/In front of text) tidak memotong konten */
        .docx-viewer-root [style*="position: relative"],
        .docx-viewer-root [style*="position: absolute"] {
          overflow: visible !important;
        }

        /* 4. Kop Surat: teks kop tetap berada di tengah */
        .docx-viewer-root header p {
          text-align: center !important;
        }

        /* 5. SVG Shape, Garis Kop, dan Gambar VML */
        .docx-viewer-root svg,
        .docx-viewer-root section.docx svg {
          overflow: visible !important;
        }

        .docx-viewer-root svg line,
        .docx-viewer-root svg polyline {
          stroke: #000000 !important;
          stroke-width: 1.5px !important;
          visibility: visible !important;
        }

        .docx-viewer-root svg rect:not([fill="none"]) {
          fill: #000000 !important;
          visibility: visible !important;
        }

        /* 6. Border Kop Surat Word (garis ganda / tebal) */
        .docx-viewer-root section.docx p[style*="border-bottom"],
        .docx-viewer-root section.docx [style*="border-bottom"] {
          border-bottom-color: #000000 !important;
          display: block !important;
        }

        /* 7. Tab stop colons */
        .docx-viewer-root .docx-tab-stop {
          text-decoration: none !important;
        }

        /* 8. Tata letak lembar dokumen pada layar */
        .docx-viewer-root .docx-wrapper {
          background: transparent !important;
          padding: 0 !important;
          display: flex !important;
          flex-flow: column !important;
          align-items: center !important;
          width: 100% !important;
        }
        .docx-viewer-root .docx-wrapper > section.docx {
          background: white !important;
          box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04) !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 4px !important;
          margin-bottom: 24px !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        /* 9. Pengaturan Cetak Bersih (Print Media) */
        @media print {
          .docx-viewer-root,
          .docx-viewer-root .docx-render-target,
          .docx-viewer-root .docx-wrapper {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }
          .docx-viewer-root .docx-wrapper > section.docx {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            margin: 0 auto !important;
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>

      {loading && (
        <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Menyiapkan lembar surat persis sesuai file Word (Times New Roman, Kop, TTD)...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl">
          ⚠️ Gagal merender tampilan Word presisi: {error}. Menampilkan teks alternatif di bawah.
        </div>
      )}

      <div ref={containerRef} className="docx-render-target w-full flex flex-col items-center" />
    </div>
  )
}
