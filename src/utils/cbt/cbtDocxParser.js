import mammoth from 'mammoth'
import JSZip from 'jszip'
import { ommlToLatex } from './cbtOmmlToLatex'

/**
 * Parser Naskah Bank Soal Word (.docx) Kurikulum Merdeka
 * Mendukung ragam soal: PG Tunggal, PG Kompleks, Benar/Salah, Menjodohkan, Isian, & Uraian
 * 
 * Fitur utama:
 * - Gambar inline dari .docx dikonversi menjadi base64 data URI
 * - Tabel HTML dipertahankan utuh dalam teks pertanyaan
 * - Rumus Equation (Word OMML) otomatis terbaca langsung tanpa perlu '$'
 * - Word auto-numbered list (1, 2, 3...) dideteksi sebagai soal baru
 * - Word sub-list (a, b, c, d...) dideteksi sebagai opsi jawaban
 * - Format template sederhana: 1. Soal / A-E. Opsi / Kunci: / Pembahasan:
 */

/**
 * Preprocess file Word (.docx) secara otomatis:
 * 1. Mencari elemen Equation asli bawaan Microsoft Word (m:oMath & m:oMathPara),
 *    mengonversinya menjadi notasi KaTeX ($...$ atau $$...$$), lalu menyisipkannya kembali
 *    sebagai teks biasa Word (<w:r><w:t>).
 * 2. Mencari format penomoran asli Word (<w:numPr>) dan mengonversinya menjadi teks eksplisit
 *    (misal '1. ', '2. ' untuk soal dan 'A. ', 'B. ' untuk opsi), lalu menghapus <w:numPr>
 *    agar Mammoth tidak menghasilkan tag <ol><li> yang menghilangkan huruf opsi dan memecah 4 soal menjadi 20 soal.
 */
export async function preprocessDocxEquations(arrayBuffer) {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer)
    const docXmlFile = zip.file('word/document.xml')
    if (!docXmlFile) return arrayBuffer

    const xmlText = await docXmlFile.async('text')
    
    // Jika tidak ada elemen matematika OMML maupun numbering, lewati pemrosesan
    const hasMath = xmlText.includes('<m:oMath') || xmlText.includes('<m:oMathPara')
    const hasNumbering = xmlText.includes('<w:numPr')
    if (!hasMath && !hasNumbering) {
      return arrayBuffer
    }

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml')

    // 1. Konversi m:oMathPara (Block Equations)
    const oMathParas = Array.from(xmlDoc.getElementsByTagNameNS('*', 'oMathPara'))
    oMathParas.forEach(para => {
      const latex = ommlToLatex(para).trim()
      if (latex) {
        const wR = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r')
        const wT = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t')
        wT.setAttribute('xml:space', 'preserve')
        wT.textContent = ` ${latex} `
        wR.appendChild(wT)
        para.parentNode?.replaceChild(wR, para)
      }
    })

    // 2. Konversi m:oMath (Inline Equations)
    const oMaths = Array.from(xmlDoc.getElementsByTagNameNS('*', 'oMath'))
    oMaths.forEach(math => {
      if (!math.parentNode || !xmlDoc.contains(math)) return
      const latex = ommlToLatex(math).trim()
      if (latex) {
        const wR = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r')
        const wT = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t')
        wT.setAttribute('xml:space', 'preserve')
        wT.textContent = ` ${latex} `
        wR.appendChild(wT)
        math.parentNode?.replaceChild(wR, math)
      }
    })

    // 3. Selesaikan Numbering Word asli (1, 2, 3 untuk soal & A, B, C untuk opsi)
    if (hasNumbering) {
      await resolveDocxNumbering(zip, xmlDoc)
    }

    const serializer = new XMLSerializer()
    const newXmlText = serializer.serializeToString(xmlDoc)

    zip.file('word/document.xml', newXmlText)
    return await zip.generateAsync({ type: 'arraybuffer' })
  } catch (err) {
    console.warn('[CBT Docx Parser] Gagal pra-proses docx, melanjutkan dengan file asli:', err)
    return arrayBuffer
  }
}

/**
 * Membaca word/numbering.xml dari berkas .docx dan menyisipkan prefix nomor/huruf
 * langsung ke dalam teks paragraf Word (<w:p>), lalu menghapus <w:numPr>.
 * Hal ini memastikan Mammoth tidak menghasilkan <ol><li> yang ambigu.
 */
async function resolveDocxNumbering(zip, xmlDoc) {
  try {
    const numberingFile = zip.file('word/numbering.xml')
    if (!numberingFile) return

    const numXmlText = await numberingFile.async('text')
    const parser = new DOMParser()
    const numDoc = parser.parseFromString(numXmlText, 'application/xml')

    const getAttr = (el, name) => {
      if (!el) return null
      return el.getAttribute(`w:${name}`) || 
             el.getAttribute(name) || 
             el.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', name) || 
             null
    }

    // 1. Map abstractNumId -> Map of ilvl -> { numFmt, lvlText, start }
    const abstractNums = {}
    const abstractNodes = Array.from(numDoc.getElementsByTagNameNS('*', 'abstractNum'))
    abstractNodes.forEach(absNode => {
      const absId = getAttr(absNode, 'abstractNumId')
      if (!absId) return
      abstractNums[absId] = {}

      const lvls = Array.from(absNode.getElementsByTagNameNS('*', 'lvl'))
      lvls.forEach(lvl => {
        const ilvl = getAttr(lvl, 'ilvl') || '0'
        const numFmtNode = lvl.getElementsByTagNameNS('*', 'numFmt')[0]
        const lvlTextNode = lvl.getElementsByTagNameNS('*', 'lvlText')[0]
        const startNode = lvl.getElementsByTagNameNS('*', 'start')[0]

        const numFmt = getAttr(numFmtNode, 'val') || 'decimal'
        const lvlText = getAttr(lvlTextNode, 'val') || '%1.'
        const start = parseInt(getAttr(startNode, 'val') || '1', 10) || 1

        abstractNums[absId][ilvl] = { numFmt, lvlText, start }
      })
    })

    // 2. Map numId -> abstractNumId
    const numToAbstract = {}
    const numNodes = Array.from(numDoc.getElementsByTagNameNS('*', 'num'))
    numNodes.forEach(numNode => {
      const numId = getAttr(numNode, 'numId')
      const absIdNode = numNode.getElementsByTagNameNS('*', 'abstractNumId')[0]
      const absId = getAttr(absIdNode, 'val')
      if (numId && absId) {
        numToAbstract[numId] = absId
      }
    })

    // 3. Track running counters for each numId + ilvl
    const counters = {}

    // 4. Proses semua paragraf <w:p>
    const paragraphs = Array.from(xmlDoc.getElementsByTagNameNS('*', 'p'))
    paragraphs.forEach(p => {
      const pPr = p.getElementsByTagNameNS('*', 'pPr')[0]
      if (!pPr) return
      const numPr = pPr.getElementsByTagNameNS('*', 'numPr')[0]
      if (!numPr) return

      const numIdNode = numPr.getElementsByTagNameNS('*', 'numId')[0]
      const ilvlNode = numPr.getElementsByTagNameNS('*', 'ilvl')[0]
      if (!numIdNode) return

      const numId = getAttr(numIdNode, 'val')
      const ilvl = ilvlNode ? (getAttr(ilvlNode, 'val') || '0') : '0'

      const absId = numToAbstract[numId]
      const lvlConfig = absId ? abstractNums[absId]?.[ilvl] : null

      const numFmt = lvlConfig?.numFmt || 'decimal'

      // Jika nomor soal desimal (1, 2, 3...) terdeteksi, reset penghitung huruf (A, B, C...)
      if (numFmt === 'decimal') {
        for (const k in counters) {
          if (k.endsWith('_letter')) {
            delete counters[k]
          }
        }
      }

      const counterKey = (numFmt === 'upperLetter' || numFmt === 'lowerLetter')
        ? `${numId}_${ilvl}_letter`
        : `${numId}_${ilvl}`

      if (counters[counterKey] === undefined) {
        counters[counterKey] = lvlConfig?.start || 1
      } else {
        counters[counterKey]++
      }

      const currentCount = counters[counterKey]

      let formattedPrefix = ''
      if (numFmt === 'upperLetter') {
        formattedPrefix = `${String.fromCharCode(65 + ((currentCount - 1) % 26))}. `
      } else if (numFmt === 'lowerLetter') {
        formattedPrefix = `${String.fromCharCode(97 + ((currentCount - 1) % 26))}. `
      } else if (numFmt === 'decimal') {
        formattedPrefix = `${currentCount}. `
      } else if (numFmt === 'bullet') {
        formattedPrefix = ''
      } else {
        formattedPrefix = `${currentCount}. `
      }

      // Periksa apakah teks paragraf sudah memiliki prefix nomor / opsi
      const textContent = p.textContent.trim()
      const alreadyHasPrefix = /^(?:\d+[\.\:\)]|[A-Ea-e][\.\)])\s/i.test(textContent)

      if (formattedPrefix && !alreadyHasPrefix) {
        const wR = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r')
        const wT = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t')
        wT.setAttribute('xml:space', 'preserve')
        wT.textContent = formattedPrefix
        wR.appendChild(wT)

        if (pPr.nextSibling) {
          p.insertBefore(wR, pPr.nextSibling)
        } else if (p.firstChild) {
          p.insertBefore(wR, p.firstChild)
        } else {
          p.appendChild(wR)
        }
      }

      // Hapus numPr agar Mammoth tidak mengubahnya menjadi <ol><li> yang ambigu
      pPr.removeChild(numPr)
    })
  } catch (err) {
    console.warn('[CBT Docx Parser] Gagal menyelesaikan numbering docx:', err)
  }
}

// ==============================================================================
// UTILITAS EKSTRAKSI KONTEN HTML (Termasuk Gambar, Tabel, & Equation)
// ==============================================================================

/**
 * Ekstraksi teks + gambar + tabel dari elemen HTML secara rekursif.
 * Mempertahankan <img>, <table>, <sup>, <sub>, <strong>, <em> tag.
 * TIDAK memproses <ol>/<ul>/<li> — itu ditangani oleh processTopElement.
 */
const extractRichContent = (element) => {
  if (!element) return ''
  let result = ''

  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName?.toUpperCase()

      // Skip nested lists — mereka ditangani terpisah oleh processTopElement
      if (tag === 'OL' || tag === 'UL') return

      if (tag === 'IMG') {
        const src = node.getAttribute('src') || ''
        const alt = node.getAttribute('alt') || ''
        if (src) {
          result += `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:6px 0;" />`
        }
      } else if (tag === 'TABLE') {
        // Pertahankan seluruh tabel sebagai HTML mentah
        result += '\n' + sanitizeTableHtml(node.outerHTML) + '\n'
      } else if (tag === 'BR') {
        result += '\n'
      } else if (tag === 'SUP') {
        const supText = node.textContent.trim()
        if (supText && /^[\d\w\+\-\.\,\/\(\)]+$/.test(supText)) {
          result += `^{${supText}}`
        } else {
          result += `<sup>${extractRichContent(node)}</sup>`
        }
      } else if (tag === 'SUB') {
        const subText = node.textContent.trim()
        if (subText && /^[\d\w\+\-\.\,\/\(\)]+$/.test(subText)) {
          result += `_{${subText}}`
        } else {
          result += `<sub>${extractRichContent(node)}</sub>`
        }
      } else if (tag === 'STRONG' || tag === 'B') {
        result += `<strong>${extractRichContent(node)}</strong>`
      } else if (tag === 'EM' || tag === 'I') {
        result += `<em>${extractRichContent(node)}</em>`
      } else {
        // Rekursif untuk elemen lainnya (div, span, p, dll.)
        result += extractRichContent(node)
      }
    }
  })
  return result
}

/**
 * Bersihkan dan standardisasi HTML tabel agar aman dan konsisten
 */
const sanitizeTableHtml = (html) => {
  if (!html) return ''
  let cleaned = html
    .replace(/\s+class="[^"]*"/gi, '')
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+width="[^"]*"/gi, '')
    .replace(/\s+height="[^"]*"/gi, '')
    .replace(/\s+valign="[^"]*"/gi, '')
    .replace(/\s+align="[^"]*"/gi, '')
    .replace(/\s+border="[^"]*"/gi, '')
    .replace(/\s+cellpadding="[^"]*"/gi, '')
    .replace(/\s+cellspacing="[^"]*"/gi, '')

  cleaned = cleaned.replace(/<table/gi, '<table class="cbt-soal-table" style="width:100%;border-collapse:separate;border-spacing:0;margin:12px 0;font-size:13px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"')
  cleaned = cleaned.replace(/<td/gi, '<td style="border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:8px 12px;text-align:center;"')
  cleaned = cleaned.replace(/<th/gi, '<th style="border-right:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;padding:8px 12px;text-align:center;font-weight:bold;background:#f8fafc;"')

  return cleaned
}

// ==============================================================================
// FUNGSI UTAMA: PARSE FILE .DOCX
// ==============================================================================

export const parseDocxFile = async (file) => {
  try {
    let arrayBuffer = await file.arrayBuffer()

    // Otomatis deteksi & ubah Equation Word bawaan (m:oMath) ke KaTeX
    // serta selesaikan numbering Word (1, 2, 3 & A, B, C) menjadi teks eksplisit
    arrayBuffer = await preprocessDocxEquations(arrayBuffer)

    // Mammoth: konversi .docx ke HTML dengan dukungan gambar base64 inline
    const { value: rawHtml, messages } = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(function (image) {
          return image.read('base64').then(function (imageBuffer) {
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`,
              alt: 'Gambar Soal',
              style: 'max-width:100%;height:auto;border-radius:8px;margin:6px 0;'
            }
          })
        }),
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh"
        ]
      }
    )

    console.log('[CBT Docx Parser] Raw HTML from mammoth:', rawHtml.substring(0, 2000))

    // Parse HTML ke DOM virtual
    const container = document.createElement('div')
    container.innerHTML = rawHtml

    // ──────────────────────────────────────────────────────────────────────
    // LANGKAH 1: Ekstraksi konten — menangani <ol>/<li> dari Word list
    // ──────────────────────────────────────────────────────────────────────
    const lines = []
    let autoQuestionNum = 0 // Counter auto-numbering untuk butir soal
    let optionCounter = 0   // Counter opsi (A, B, C, D) untuk list tanpa prefix

    /**
     * Proses satu elemen top-level (atau nested) menjadi baris-baris teks.
     * Menangani <ol>, <ul>, <li>, <table>, <p>, dll.
     */
    const processElement = (el, listDepth = 0) => {
      const tag = el.tagName?.toUpperCase()

      if (tag === 'TABLE') {
        lines.push(sanitizeTableHtml(el.outerHTML))
        return
      }

      if (tag === 'OL' || tag === 'UL') {
        const items = Array.from(el.children).filter(c => c.tagName?.toUpperCase() === 'LI')
        if (items.length === 0) return

        let localOptionIndex = 0

        items.forEach((li) => {
          const directText = extractRichContent(li).trim()
          if (!directText) return

          const hasNumberPrefix = /^\d+[\.\:\)]\s/.test(directText)
          const hasOptionPrefix = /^[A-Ea-e][\.\)]\s/.test(directText)
          const isKunciOrPembahasan = /^(?:kunci|jawaban|kunci\s+jawaban|pembahasan|penjelasan|key|answer|explanation|solusi)\s*[:=]/i.test(directText)
          const hasQuestionTag = /^\[(?:pg|pgk|pg\s*kompleks|bs|benar\s*salah|jodoh|menjodohkan|isian|uraian)\]/i.test(directText)

          if (hasNumberPrefix || hasOptionPrefix || isKunciOrPembahasan) {
            lines.push(directText)
            if (hasNumberPrefix) {
              const m = directText.match(/^(\d+)/)
              if (m) autoQuestionNum = Math.max(autoQuestionNum, parseInt(m[1], 10))
              localOptionIndex = 0
            } else if (hasOptionPrefix) {
              const m = directText.match(/^([A-Ea-e])/i)
              if (m) localOptionIndex = m[1].toUpperCase().charCodeAt(0) - 65 + 1
            } else if (isKunciOrPembahasan) {
              localOptionIndex = 0
            }
          } else if (hasQuestionTag) {
            autoQuestionNum++
            localOptionIndex = 0
            lines.push(`${autoQuestionNum}. ${directText}`)
          } else if (listDepth > 0) {
            // Nested list: pasti opsi jawaban
            const letter = String.fromCharCode(65 + (localOptionIndex++ % 26))
            lines.push(`${letter}. ${directText}`)
          } else {
            // Top-level list item tanpa prefix
            // Jika kita sudah memiliki soal (autoQuestionNum > 0) dan items berjumlah <= 6 (standar opsi A-E):
            // ini adalah opsi jawaban, BUKAN soal baru!
            if (autoQuestionNum > 0 && localOptionIndex < 6 && items.length <= 6 && directText.length < 300) {
              const letter = String.fromCharCode(65 + (localOptionIndex++ % 26))
              lines.push(`${letter}. ${directText}`)
            } else {
              autoQuestionNum++
              localOptionIndex = 0
              lines.push(`${autoQuestionNum}. ${directText}`)
            }
          }

          // Proses nested lists (jika ada)
          const nestedLists = Array.from(li.children).filter(c => {
            const ct = c.tagName?.toUpperCase()
            return ct === 'OL' || ct === 'UL'
          })
          nestedLists.forEach(nl => processElement(nl, listDepth + 1))
        })
        return
      }

      // Regular element: <p>, <h1>, <h2>, <div>, dll.
      const content = extractRichContent(el).trim()
      if (content) {
        // Sync auto counter jika paragraf punya nomor soal
        const numMatch = content.match(/^(\d+)[\.\:\)]\s/)
        if (numMatch) {
          autoQuestionNum = Math.max(autoQuestionNum, parseInt(numMatch[1], 10))
          optionCounter = 0
        }
        lines.push(content)
      }
    }

    // Proses semua elemen level atas
    const topElements = container.children
    if (topElements.length > 0) {
      for (let i = 0; i < topElements.length; i++) {
        processElement(topElements[i])
      }
    } else {
      // Fallback jika HTML tidak terstruktur
      const content = extractRichContent(container)
      content.split('\n').forEach(l => {
        const trimmed = l.trim()
        if (trimmed) lines.push(trimmed)
      })
    }

    console.log('[CBT Docx Parser] Extracted lines:', lines.slice(0, 30))

    // ──────────────────────────────────────────────────────────────────────
    // LANGKAH 2: Parse baris-baris teks menjadi butir-butir soal terstruktur
    // ──────────────────────────────────────────────────────────────────────
    return parseRawTextToQuestions(lines.join('\n'), messages)
  } catch (err) {
    console.error('[CBT Docx Parser] Gagal membaca berkas docx:', err)
    throw new Error('Berkas Word tidak dapat diproses: ' + (err.message || 'Format tidak dikenali.'))
  }
}

// ==============================================================================
// PARSER BARIS TEKS → OBJEK BUTIR SOAL TERSTRUKTUR
// ==============================================================================

/**
 * Parser Baris Teks Naskah Soal menjadi Array Objek Butir Soal Terstruktur
 * Format yang didukung:
 *   1. Teks pertanyaan soal...
 *   A. Opsi A
 *   B. Opsi B
 *   C. Opsi C
 *   D. Opsi D
 *   Kunci: D
 *   Pembahasan: Penjelasan opsional...
 */
export const parseRawTextToQuestions = (rawText, extractionMessages = []) => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const questions = []

  let currentSoal = null
  // Track posisi terakhir: 'pertanyaan', 'opsi', 'kunci', 'pembahasan'
  let lastSection = 'pertanyaan'

  const isQuestionStart = (line) => {
    if (line.startsWith('<table') || line.startsWith('<TABLE') || line.startsWith('<img') || line.startsWith('<IMG')) return false
    if (/^(?:(?:soal|no\.?)\s+)?(\d+)[\.\:\)]\s*(.*)/i.test(line)) return true
    if (/^\[(?:pg|pgk|pg\s*kompleks|bs|benar\s*salah|jodoh|menjodohkan|isian|uraian)\]/i.test(line)) return true
    return false
  }

  const isOptionLine = (line) => {
    // Pola: "A. Opsi", "B) Opsi", "C . Opsi", "a. opsi"
    if (line.startsWith('<table') || line.startsWith('<TABLE') || line.startsWith('<img')) return false
    return /^[A-Ea-e][\.\)]\s*(.*)/i.test(line)
  }

  lines.forEach((line) => {
    // ───────── Deteksi Nomor Soal Baru ─────────
    const qMatch = line.match(/^(?:(?:soal|no\.?)\s+)?(\d+)[\.\:\)]\s*(.*)/i)
    const tagMatch = !qMatch && line.match(/^(\[(?:pg|pgk|pg\s*kompleks|bs|benar\s*salah|jodoh|menjodohkan|isian|uraian)\])\s*(.*)/i)

    if ((qMatch || tagMatch) && isQuestionStart(line)) {
      // Simpan soal sebelumnya
      if (currentSoal) {
        questions.push(finalizeQuestion(currentSoal))
      }

      const nomorUrut = qMatch ? parseInt(qMatch[1], 10) : (questions.length + 1)
      const isiAwal = qMatch ? (qMatch[2] || '') : line

      // Deteksi Tag Tipe Soal: [PG], [PGK], [BS], [JODOH], [ISIAN], [URAIAN]
      let tipeSoal = 'pg'
      let cleanText = isiAwal

      if (/\[(?:pgk|pg\s*kompleks)\]/i.test(cleanText)) {
        tipeSoal = 'pg_kompleks'
        cleanText = cleanText.replace(/\[(?:pgk|pg\s*kompleks)\]/ig, '').trim()
      } else if (/\[(?:bs|benar\s*salah)\]/i.test(cleanText)) {
        tipeSoal = 'benar_salah'
        cleanText = cleanText.replace(/\[(?:bs|benar\s*salah)\]/ig, '').trim()
      } else if (/\[(?:jodoh|menjodohkan)\]/i.test(cleanText)) {
        tipeSoal = 'menjodohkan'
        cleanText = cleanText.replace(/\[(?:jodoh|menjodohkan)\]/ig, '').trim()
      } else if (/\[isian\]/i.test(cleanText)) {
        tipeSoal = 'isian'
        cleanText = cleanText.replace(/\[isian\]/ig, '').trim()
      } else if (/\[uraian\]/i.test(cleanText)) {
        tipeSoal = 'uraian'
        cleanText = cleanText.replace(/\[uraian\]/ig, '').trim()
      } else if (/\[pg\]/i.test(cleanText)) {
        tipeSoal = 'pg'
        cleanText = cleanText.replace(/\[pg\]/ig, '').trim()
      }

      currentSoal = {
        nomor_urut: nomorUrut,
        tipe_soal: tipeSoal,
        pertanyaan: cleanText,
        opsi: [],
        kunci_jawaban: '',
        pembahasan: '',
        bobot: 1.0
      }
      lastSection = 'pertanyaan'
      return
    }

    if (!currentSoal) return

    // ───────── Deteksi Kunci Jawaban ─────────
    const keyMatch = line.match(/^(?:kunci|jawaban|kunci\s+jawaban|key|answer)\s*[:=]\s*(.*)/i)
    if (keyMatch) {
      currentSoal.kunci_jawaban = keyMatch[1].trim()
      lastSection = 'kunci'
      return
    }

    // ───────── Deteksi Pembahasan ─────────
    const pembMatch = line.match(/^(?:pembahasan|penjelasan|explanation|solusi)\s*[:=]\s*(.*)/i)
    if (pembMatch) {
      currentSoal.pembahasan = pembMatch[1].trim()
      lastSection = 'pembahasan'
      return
    }

    // ───────── Deteksi Opsi A, B, C, D, E ─────────
    const optMatch = line.match(/^([A-Ea-e])[\.\)]\s*(.*)/i)
    if (optMatch && isOptionLine(line)) {
      currentSoal.opsi.push({
        key: optMatch[1].toUpperCase(),
        text: optMatch[2].trim()
      })
      lastSection = 'opsi'
      return
    }

    // ───────── Tabel HTML: sisipkan ke pertanyaan ─────────
    if (line.startsWith('<table') || line.startsWith('<TABLE')) {
      currentSoal.pertanyaan += (currentSoal.pertanyaan ? '\n' : '') + line
      return
    }

    // ───────── Gambar inline: sisipkan ke pertanyaan ─────────
    if (line.startsWith('<img')) {
      if (lastSection === 'opsi' && currentSoal.opsi.length > 0) {
        const lastOpt = currentSoal.opsi[currentSoal.opsi.length - 1]
        lastOpt.text += '\n' + line
      } else {
        currentSoal.pertanyaan += (currentSoal.pertanyaan ? '\n' : '') + line
      }
      return
    }

    // ───────── Sambungan teks (Continuation Lines) ─────────
    if (lastSection === 'pembahasan') {
      currentSoal.pembahasan += ' ' + line
    } else if (lastSection === 'kunci') {
      currentSoal.kunci_jawaban += ' ' + line
    } else if (lastSection === 'opsi' && currentSoal.opsi.length > 0) {
      const lastOpt = currentSoal.opsi[currentSoal.opsi.length - 1]
      lastOpt.text += ' ' + line
    } else if (lastSection === 'pertanyaan') {
      currentSoal.pertanyaan += (currentSoal.pertanyaan ? '\n' : '') + line
    }
  })

  // Simpan soal terakhir
  if (currentSoal) {
    questions.push(finalizeQuestion(currentSoal))
  }

  return {
    questions,
    totalSoal: questions.length,
    validation: validateQuestionsList(questions),
    messages: extractionMessages
  }
}

// ==============================================================================
// FINALISASI OBJEK BUTIR SOAL
// ==============================================================================

const finalizeQuestion = (q) => {
  // Auto-detect tipe soal jika belum ditentukan secara eksplisit
  if (q.tipe_soal === 'pg' && q.opsi.length === 0) {
    if (q.kunci_jawaban && q.kunci_jawaban.length > 30) {
      q.tipe_soal = 'uraian'
    } else if (q.kunci_jawaban) {
      q.tipe_soal = 'isian'
    }
  }

  // Format kunci jawaban PG Kompleks: "A, C" → JSON string '["A","C"]'
  if (q.tipe_soal === 'pg_kompleks' && q.kunci_jawaban && q.kunci_jawaban.includes(',')) {
    const arr = q.kunci_jawaban.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    q.kunci_jawaban = JSON.stringify(arr)
  }

  // Tandai opsi yang merupakan kunci jawaban (is_kunci flag)
  if (q.opsi && q.opsi.length > 0 && q.kunci_jawaban) {
    const kunciStr = q.kunci_jawaban.trim().toUpperCase()
    let kunciKeys = [kunciStr]

    if (kunciStr.startsWith('[')) {
      try {
        kunciKeys = JSON.parse(kunciStr).map(k => String(k).trim().toUpperCase())
      } catch {
        kunciKeys = [kunciStr]
      }
    } else if (kunciStr.includes(',')) {
      kunciKeys = kunciStr.split(',').map(k => k.trim())
    }

    q.opsi = q.opsi.map(opt => ({
      ...opt,
      is_kunci: kunciKeys.includes(opt.key.toUpperCase())
    }))
  }

  return {
    nomor_urut: q.nomor_urut,
    tipe_soal: q.tipe_soal,
    pertanyaan: q.pertanyaan.trim(),
    opsi: q.opsi.length > 0 ? q.opsi : null,
    kunci_jawaban: q.kunci_jawaban.trim(),
    pembahasan: q.pembahasan.trim(),
    bobot: q.bobot || 1.0
  }
}

// ==============================================================================
// UTILITAS NORMALISASI & DETEKSI DUPLIKASI SOAL
// ==============================================================================

/**
 * Membersihkan teks untuk perbandingan kesamaan isi:
 * - Menghapus seluruh tag HTML (<p>, <b>, <div>, <img>, <table>, dll.)
 * - Menghapus entitas HTML (&nbsp;, &amp;, dll.)
 * - Menormalkan spasi ganda / enter menjadi spasi tunggal
 * - Lowercase dan pembersihan tanda baca penutup (. , : ; ?)
 */
export const normalizeTextForDuplicateCheck = (text = '') => {
  if (!text) return ''
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\.\,\:\;\?]+$/, '')
    .trim()
}

/**
 * Menormalkan kumpulan opsi butir soal menjadi signature string terurut
 */
export const normalizeOptionsForDuplicateCheck = (options = []) => {
  if (!Array.isArray(options) || options.length === 0) return ''
  return options
    .map(opt => {
      const txt = typeof opt === 'string' ? opt : (opt?.text || opt?.jawaban || '')
      return normalizeTextForDuplicateCheck(txt)
    })
    .filter(Boolean)
    .sort()
    .join('|||')
}

/**
 * Menghasilkan cuplikan teks pendek untuk ditampilkan pada modal peringatan
 */
export const getQuestionSnippet = (text = '', maxLength = 90) => {
  if (!text) return '(Teks pertanyaan kosong)'
  const clean = String(text)
    .replace(/<img[^>]*>/gi, '[Gambar]')
    .replace(/<table[^>]*>[\s\S]*?<\/table>/gi, '[Tabel]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= maxLength) return clean
  return clean.substring(0, maxLength).trim() + '...'
}

// ==============================================================================
// PRE-FLIGHT VALIDATOR: CEK KUALITAS NASKAH SOAL SEBELUM DISIMPAN
// ==============================================================================

/**
 * Validasi daftar soal:
 * - Pengecekan kelengkapan teks pertanyaan, kunci jawaban, dan opsi
 * - Pengecekan butir soal yang sama persis (baik internal file maupun terhadap soal yang sudah ada)
 * 
 * @param {Array} questions - Daftar soal baru yang diunggah
 * @param {Array} existingQuestions - Daftar soal yang sudah ada di editor/bank (opsional)
 * @returns {Object} Hasil validasi lengkap beserta daftar duplikat & soal unik
 */
export const validateQuestionsList = (questions = [], existingQuestions = []) => {
  const issues = []
  const duplicates = []
  const duplicateIndices = new Set()

  // 1. Simpan index soal yang sudah ada untuk pengecekan eksternal
  const existingMap = new Map() // normPrompt -> { no, idx, optSig, q }
  if (Array.isArray(existingQuestions) && existingQuestions.length > 0) {
    existingQuestions.forEach((eq, eqIdx) => {
      const promptNorm = normalizeTextForDuplicateCheck(eq.pertanyaan)
      if (promptNorm && promptNorm.length > 5) {
        const optSig = normalizeOptionsForDuplicateCheck(eq.opsi)
        if (!existingMap.has(promptNorm)) {
          existingMap.set(promptNorm, {
            no: eq.nomor_urut || (eqIdx + 1),
            idx: eqIdx,
            optSig,
            q: eq
          })
        }
      }
    })
  }

  // 2. Map untuk melacak soal dalam batch yang sama (internal duplicate)
  const internalMap = new Map() // normPrompt -> { no, idx, optSig, q }

  questions.forEach((q, idx) => {
    const no = q.nomor_urut || (idx + 1)

    // Validasi dasar
    if (!q.pertanyaan || q.pertanyaan.trim().length < 5) {
      issues.push(`Nomor ${no}: Pertanyaan terlalu pendek atau kosong.`)
    }

    if (!q.kunci_jawaban && q.tipe_soal !== 'uraian') {
      issues.push(`Nomor ${no}: Kunci jawaban belum ditentukan.`)
    }

    if (['pg', 'pg_kompleks'].includes(q.tipe_soal)) {
      if (!q.opsi || q.opsi.length < 2) {
        issues.push(`Nomor ${no}: Tipe soal pilihan ganda wajib memiliki minimal 2 pilihan opsi (A, B).`)
      }
    }

    // Pengecekan Duplikasi
    const normPrompt = normalizeTextForDuplicateCheck(q.pertanyaan)
    const normOpts = normalizeOptionsForDuplicateCheck(q.opsi)

    if (normPrompt && normPrompt.length > 5) {
      // A. Cek duplikasi terhadap soal yang sudah ada di editor (eksternal)
      if (existingMap.has(normPrompt)) {
        const matched = existingMap.get(normPrompt)
        const isExact = !normOpts || !matched.optSig || normOpts === matched.optSig
        duplicates.push({
          index: idx,
          nomor: no,
          duplicateOfNomor: matched.no,
          duplicateOfIndex: matched.idx,
          isExisting: true,
          snippet: getQuestionSnippet(q.pertanyaan),
          type: isExact ? 'exact' : 'prompt_only',
          typeLabel: isExact ? 'Sama Persis dengan Soal di Editor' : 'Teks Pertanyaan Sama dengan Soal di Editor'
        })
        duplicateIndices.add(idx)
        issues.push(`Nomor ${no}: Sama persis dengan Soal Nomor ${matched.no} yang sudah ada di editor.`)
      }
      // B. Cek duplikasi dengan soal sebelumnya dalam berkas yang sama (internal)
      else if (internalMap.has(normPrompt)) {
        const matched = internalMap.get(normPrompt)
        const isExact = !normOpts || !matched.optSig || normOpts === matched.optSig
        duplicates.push({
          index: idx,
          nomor: no,
          duplicateOfNomor: matched.no,
          duplicateOfIndex: matched.idx,
          isExisting: false,
          snippet: getQuestionSnippet(q.pertanyaan),
          type: isExact ? 'exact' : 'prompt_only',
          typeLabel: isExact ? 'Sama Persis dengan Soal Nomor ' + matched.no : 'Teks Pertanyaan Sama dengan Soal Nomor ' + matched.no
        })
        duplicateIndices.add(idx)
        issues.push(`Nomor ${no}: Sama persis dengan butir Soal Nomor ${matched.no} di berkas yang sama.`)
      } else {
        // Catat pertama kali
        internalMap.set(normPrompt, {
          no,
          idx,
          optSig: normOpts,
          q
        })
      }
    }
  })

  // Saring hanya soal yang unik (bukan duplikat)
  const uniqueQuestions = questions.filter((_, idx) => !duplicateIndices.has(idx))

  return {
    isValid: issues.length === 0,
    issuesCount: issues.length,
    issues,
    errors: issues, // alias untuk kompatibilitas ke belakang
    hasDuplicates: duplicates.length > 0,
    duplicatesCount: duplicates.length,
    duplicates,
    uniqueQuestions
  }
}

/**
 * Filter pembantu untuk langsung mengambil butir soal yang unik tanpa duplikasi
 */
export const filterDuplicateQuestions = (questions = [], existingQuestions = []) => {
  const result = validateQuestionsList(questions, existingQuestions)
  return result.uniqueQuestions
}

