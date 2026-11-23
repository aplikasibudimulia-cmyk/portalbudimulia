/**
 * Utilitas Konversi Word OMML (Office Math Markup Language) ke KaTeX / LaTeX
 * Memungkinkan guru memasukkan rumus langsung via Microsoft Word Equation (Insert > Equation / Alt + =)
 * tanpa perlu repot mengetik simbol '$' atau menghafal sintaks LaTeX.
 */

export function ommlToLatex(node) {
  if (!node) return ''

  const nodeType = node.nodeType
  if (nodeType === 3) { // TEXT_NODE
    return cleanMathText(node.textContent || '')
  }
  if (nodeType !== 1) return '' // ELEMENT_NODE only

  const tag = (node.localName || node.tagName || '').toLowerCase().replace(/^m:/, '')

  switch (tag) {
    case 'omathpara': {
      // Math paragraph (block equation)
      const inner = postProcessOmmlLatex(
        Array.from(node.childNodes).map(ommlToLatex).join('').replace(/\$/g, '').trim()
      )
      return inner ? `$$ ${inner} $$` : ''
    }
    case 'omath': {
      // Inline math
      const inner = postProcessOmmlLatex(
        Array.from(node.childNodes).map(ommlToLatex).join('').replace(/\$/g, '').trim()
      )
      const parentTag = (node.parentNode?.localName || node.parentNode?.tagName || '').toLowerCase().replace(/^m:/, '')
      if (parentTag === 'omathpara') {
        return inner
      }
      return inner ? `$ ${inner} $` : ''
    }
    case 'r': {
      // Math run: contains m:t (text)
      return Array.from(node.childNodes).map(ommlToLatex).join('')
    }
    case 't': {
      // Math text
      return cleanMathText(node.textContent || '')
    }
    case 'f': {
      // Fraction: num (numerator) and den (denominator)
      const numNode = findChildByTag(node, 'num')
      const denNode = findChildByTag(node, 'den')
      const num = numNode ? ommlToLatex(numNode).trim() : ''
      const den = denNode ? ommlToLatex(denNode).trim() : ''
      return `\\frac{${num}}{${den}}`
    }
    case 'num':
    case 'den':
    case 'e': {
      // Generic elements or containers
      return Array.from(node.childNodes).map(ommlToLatex).join('')
    }
    case 'ssup': {
      // Superscript: base (e) and sup
      const baseNode = findChildByTag(node, 'e')
      const supNode = findChildByTag(node, 'sup')
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      const sup = supNode ? ommlToLatex(supNode).trim() : ''
      const cleanBase = /^[a-zA-Z0-9]+$/.test(base) ? base : `{${base}}`
      return `${cleanBase}^{${sup}}`
    }
    case 'ssub': {
      // Subscript: base (e) and sub
      const baseNode = findChildByTag(node, 'e')
      const subNode = findChildByTag(node, 'sub')
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      const cleanBase = /^[a-zA-Z0-9]+$/.test(base) ? base : `{${base}}`
      return `${cleanBase}_{${sub}}`
    }
    case 'ssubsup': {
      // Sub-superscript
      const baseNode = findChildByTag(node, 'e')
      const subNode = findChildByTag(node, 'sub')
      const supNode = findChildByTag(node, 'sup')
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      const sup = supNode ? ommlToLatex(supNode).trim() : ''
      const cleanBase = /^[a-zA-Z0-9]+$/.test(base) ? base : `{${base}}`
      return `${cleanBase}_{${sub}}^{${sup}}`
    }
    case 'spre': {
      // Pre-sub-superscript (sering dipakai di Word untuk akar pangkat n seperti ³√8)
      const subNode = findChildByTag(node, 'sub')
      const supNode = findChildByTag(node, 'sup')
      const eNode = findChildByTag(node, 'e')
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      const sup = supNode ? ommlToLatex(supNode).trim() : ''
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      if (sup && !sub && e.startsWith('\\sqrt{')) {
        return e.replace(/^\\sqrt\{/, `\\sqrt[${sup}]{`)
      }
      return `{}_{${sub}}^{${sup}}${e}`
    }
    case 'rad': {
      // Radical (Square root or nth root)
      const radPr = findChildByTag(node, 'radpr')
      const degHideNode = radPr ? findChildByTag(radPr, 'deghide') : null
      const degHideVal = degHideNode?.getAttribute
        ? (degHideNode.getAttribute('m:val') || degHideNode.getAttribute('val') || '1')
        : null
      const isDegHidden = degHideVal === '1' || degHideVal === 'true' || degHideVal === 'on'

      const degNode = findChildByTag(node, 'deg')
      const baseNode = findChildByTag(node, 'e')
      const deg = (!isDegHidden && degNode) ? ommlToLatex(degNode).trim() : ''
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      if (deg && deg !== '2') {
        return `\\sqrt[${deg}]{${base}}`
      }
      return `\\sqrt{${base}}`
    }
    case 'func': {
      // Math Function (sin, cos, tan, log, ln, lim)
      const fNameNode = findChildByTag(node, 'fname')
      const eNode = findChildByTag(node, 'e')
      let fName = fNameNode ? ommlToLatex(fNameNode).trim() : ''
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      if (/^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|lim|max|min|gcd)$/i.test(fName)) {
        fName = `\\${fName.toLowerCase()}`
      }
      return `${fName} ${e}`.trim()
    }
    case 'eqarr': {
      // Equation Array (Sistem Persamaan Linear / Baris Multi-Persamaan)
      const rows = Array.from(node.childNodes)
        .filter(c => (c.localName || c.tagName || '').toLowerCase().replace(/^m:/, '') === 'e')
        .map(c => ommlToLatex(c).trim())
        .filter(Boolean)
      if (rows.length <= 1) return rows[0] || ''
      return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`
    }
    case 'groupchr': {
      // Overbrace / Underbrace
      const pr = findChildByTag(node, 'groupchrpr')
      const posNode = pr ? findChildByTag(pr, 'pos') : null
      const pos = posNode?.getAttribute ? (posNode.getAttribute('m:val') || posNode.getAttribute('val')) : 'bot'
      const eNode = findChildByTag(node, 'e')
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      return pos === 'top' ? `\\overbrace{${e}}` : `\\underbrace{${e}}`
    }
    case 'box':
    case 'borderbox': {
      const eNode = findChildByTag(node, 'e')
      return eNode ? ommlToLatex(eNode).trim() : ''
    }
    case 'd': {
      // Delimiters (parentheses, brackets, absolute value)
      let begChr = '('
      let endChr = ')'
      const dPr = findChildByTag(node, 'dpr')
      if (dPr) {
        const begNode = findChildByTag(dPr, 'begchr')
        const endNode = findChildByTag(dPr, 'endchr')
        if (begNode && begNode.getAttribute) begChr = begNode.getAttribute('m:val') || begNode.getAttribute('val') || '('
        if (endNode && endNode.getAttribute) endChr = endNode.getAttribute('m:val') || endNode.getAttribute('val') || ')'
      }
      const eNode = findChildByTag(node, 'e')
      const content = eNode ? ommlToLatex(eNode).trim() : ''
      
      // Escape curly braces for LaTeX
      const leftSymbol = begChr === '{' ? '\\{' : begChr === '' ? '.' : begChr
      const rightSymbol = endChr === '}' ? '\\}' : endChr === '' ? '.' : endChr
      return `\\left${leftSymbol} ${content} \\right${rightSymbol}`
    }
    case 'nary': {
      // N-ary: Summation, Integral, Product
      let op = '\\sum'
      const naryPr = findChildByTag(node, 'narypr')
      if (naryPr) {
        const chrNode = findChildByTag(naryPr, 'chr')
        const val = chrNode?.getAttribute ? (chrNode.getAttribute('m:val') || chrNode.getAttribute('val')) : ''
        if (val === '∫') op = '\\int'
        else if (val === '∬') op = '\\iint'
        else if (val === '∭') op = '\\iiint'
        else if (val === '∮') op = '\\oint'
        else if (val === '∏') op = '\\prod'
      }
      const subNode = findChildByTag(node, 'sub')
      const supNode = findChildByTag(node, 'sup')
      const eNode = findChildByTag(node, 'e')
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      const sup = supNode ? ommlToLatex(supNode).trim() : ''
      const e = eNode ? ommlToLatex(eNode).trim() : ''

      let result = op
      if (sub) result += `_{${sub}}`
      if (sup) result += `^{${sup}}`
      if (e) result += ` ${e}`
      return result
    }
    case 'bar': {
      // Overbar / underbar
      const barPr = findChildByTag(node, 'barpr')
      const posNode = barPr ? findChildByTag(barPr, 'pos') : null
      const pos = posNode?.getAttribute ? (posNode.getAttribute('m:val') || posNode.getAttribute('val')) : 'top'
      const eNode = findChildByTag(node, 'e')
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      return pos === 'bot' ? `\\underline{${e}}` : `\\overline{${e}}`
    }
    case 'acc': {
      // Accent (hat, vector arrow, dot)
      let accChar = '\\hat'
      const accPr = findChildByTag(node, 'accpr')
      const chrNode = accPr ? findChildByTag(accPr, 'chr') : null
      const chr = chrNode?.getAttribute ? (chrNode.getAttribute('m:val') || chrNode.getAttribute('val')) : ''
      if (chr === '→' || chr === '⃗') accChar = '\\vec'
      else if (chr === '̇' || chr === '.') accChar = '\\dot'
      else if (chr === '̈') accChar = '\\ddot'
      else if (chr === '̃' || chr === '~') accChar = '\\tilde'

      const eNode = findChildByTag(node, 'e')
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      return `${accChar}{${e}}`
    }
    case 'limlow': {
      // Limits with condition below
      const eNode = findChildByTag(node, 'e')
      const limNode = findChildByTag(node, 'lim')
      const e = eNode ? ommlToLatex(eNode).trim() : ''
      const lim = limNode ? ommlToLatex(limNode).trim() : ''
      return `\\lim_{${lim}} ${e}`
    }
    case 'm': {
      // Matrix
      const rows = Array.from(node.childNodes)
        .filter(c => (c.localName || c.tagName || '').toLowerCase().replace(/^m:/, '') === 'mr')
        .map(row => {
          const cells = Array.from(row.childNodes)
            .filter(c => (c.localName || c.tagName || '').toLowerCase().replace(/^m:/, '') === 'e')
            .map(ommlToLatex)
          return cells.join(' & ')
        })
      return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`
    }
    default: {
      return Array.from(node.childNodes).map(ommlToLatex).join('')
    }
  }
}

function findChildByTag(parent, tagName) {
  if (!parent || !parent.childNodes) return null
  const target = tagName.toLowerCase()
  for (const child of parent.childNodes) {
    if (child.nodeType === 1) {
      const name = (child.localName || child.tagName || '').toLowerCase().replace(/^m:/, '')
      if (name === target) return child
    }
  }
  return null
}

/**
 * Normalisasi karakter Unicode Mathematical Alphanumeric (misal 𝑥, 𝑦, 𝑎, 𝑏 dari Cambria Math Word)
 * kembali ke huruf/angka ASCII standar agar KaTeX dapat merendernya dengan sempurna.
 */
function normalizeUnicodeMathAlphanumeric(str) {
  if (!str) return ''
  let out = ''
  for (const ch of str) {
    const cp = ch.codePointAt(0)
    // Mathematical Bold, Italic, Bold Italic, Sans-Serif, Monospace (U+1D400 - U+1D7FF)
    if (cp >= 0x1D400 && cp <= 0x1D6A3) {
      // Rentang alfabet A-Z (26) dan a-z (26) = 52 per blok
      const offset = cp - 0x1D400
      const mod = offset % 52
      if (mod < 26) {
        out += String.fromCharCode(65 + mod)
        continue
      } else {
        out += String.fromCharCode(97 + (mod - 26))
        continue
      }
    }
    // Mathematical Digits (U+1D7CE - U+1D7FF)
    if (cp >= 0x1D7CE && cp <= 0x1D7FF) {
      const digit = (cp - 0x1D7CE) % 10
      out += String.fromCharCode(48 + digit)
      continue
    }
    // Exception U+210E (Planck constant / italic h)
    if (cp === 0x210E) {
      out += 'h'
      continue
    }
    out += ch
  }
  return out
}

function cleanMathText(txt) {
  if (!txt) return ''
  return normalizeUnicodeMathAlphanumeric(txt)
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/±/g, ' \\pm ')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\neq ')
    .replace(/≈/g, ' \\approx ')
    .replace(/∞/g, ' \\infty ')
    .replace(/π/g, ' \\pi ')
    .replace(/θ/g, ' \\theta ')
    .replace(/α/g, ' \\alpha ')
    .replace(/β/g, ' \\beta ')
    .replace(/γ/g, ' \\gamma ')
    .replace(/λ/g, ' \\lambda ')
    .replace(/μ/g, ' \\mu ')
    .replace(/σ/g, ' \\sigma ')
    .replace(/ω/g, ' \\omega ')
    .replace(/[Δ∆]/g, ' \\Delta ')
    .replace(/△/g, ' \\triangle ')
    .replace(/∠/g, ' \\angle ')
    .replace(/⊥/g, ' \\perp ')
    .replace(/∥/g, ' \\parallel ')
    .replace(/[·⋅∙]/g, ' \\cdot ')
    .replace(/°/g, '^{\\circ}')
    .replace(/∑/g, ' \\sum ')
    .replace(/∫/g, ' \\int ')
    .replace(/∛\s*\(([^()]+)\)/g, '\\sqrt[3]{$1}')
    .replace(/∛\s*([0-9a-zA-Z]+)/g, '\\sqrt[3]{$1}')
    .replace(/∜\s*\(([^()]+)\)/g, '\\sqrt[4]{$1}')
    .replace(/∜\s*([0-9a-zA-Z]+)/g, '\\sqrt[4]{$1}')
    .replace(/√\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/√\s*([0-9a-zA-Z]+)/g, '\\sqrt{$1}')
    .replace(/√/g, ' \\sqrt ')
}

/**
 * Post-processing hasil LaTeX dari satu blok m:oMath / m:oMathPara:
 * Memastikan jika ada simbol √ dan angka di node <m:t> terpisah (misal "\sqrt 12" atau "\sqrt (x+1)"),
 * otomatis dibungkus kurung kurawal menjadi "\sqrt{12}" atau "\sqrt{x+1}".
 */
function postProcessOmmlLatex(latex) {
  if (!latex) return ''
  return latex
    .replace(/\\sqrt\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/\\sqrt\s+([0-9]+(?:\.[0-9]+)?|[a-zA-Z]+)(?!\s*\{)/g, '\\sqrt{$1}')
    .replace(/\s+/g, ' ')
    .trim()
}
