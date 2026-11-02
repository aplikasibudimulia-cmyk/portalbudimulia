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
      const inner = Array.from(node.childNodes).map(ommlToLatex).join('').replace(/\$/g, '').trim()
      return inner ? `$$ ${inner} $$` : ''
    }
    case 'omath': {
      // Inline math
      const inner = Array.from(node.childNodes).map(ommlToLatex).join('').replace(/\$/g, '').trim()
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
      return `{${base}}^{${sup}}`
    }
    case 'ssub': {
      // Subscript: base (e) and sub
      const baseNode = findChildByTag(node, 'e')
      const subNode = findChildByTag(node, 'sub')
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      return `{${base}}_{${sub}}`
    }
    case 'ssubsup': {
      // Sub-superscript
      const baseNode = findChildByTag(node, 'e')
      const subNode = findChildByTag(node, 'sub')
      const supNode = findChildByTag(node, 'sup')
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      const sub = subNode ? ommlToLatex(subNode).trim() : ''
      const sup = supNode ? ommlToLatex(supNode).trim() : ''
      return `{${base}}_{${sub}}^{${sup}}`
    }
    case 'rad': {
      // Radical (Square root or nth root)
      const degNode = findChildByTag(node, 'deg')
      const baseNode = findChildByTag(node, 'e')
      const deg = degNode ? ommlToLatex(degNode).trim() : ''
      const base = baseNode ? ommlToLatex(baseNode).trim() : ''
      if (deg && deg !== '2') {
        return `\\sqrt[${deg}]{${base}}`
      }
      return `\\sqrt{${base}}`
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

function cleanMathText(txt) {
  if (!txt) return ''
  return txt
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
    .replace(/Δ/g, ' \\Delta ')
    .replace(/∑/g, ' \\sum ')
    .replace(/∫/g, ' \\int ')
    .replace(/√/g, ' \\sqrt ')
}
