import React, { useState, useEffect, useRef, useCallback } from 'react'
import katex from 'katex'
import { renderFormattedMath, normalizeMathFormula, latexToFriendlyMath } from './CbtSoalRenderer'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'
import { parseDocxFile, validateQuestionsList } from '../../utils/cbt/cbtDocxParser'
import { downloadSampleDocxTemplate } from '../../utils/cbt/cbtDocxTemplateHelper'
import CbtDuplicateWarningModal from './CbtDuplicateWarningModal'

// ============================================================================
// HELPER VISUAL EQUATION STUDIO (GAYA MS WORD EQUATION EDITOR)
// ============================================================================

let visualBlockCounter = 1
const nextBlockId = () => `vb_${Date.now()}_${visualBlockCounter++}`

/**
 * Ekstraksi seluruh rumus ($...$, $$...$$, atau rumus LaTeX/akar berdiri sendiri) dari suatu teks
 * sehingga guru dapat mengklik rumus mana pun untuk langsung diedit secara visual.
 */
function extractEquationsFromField(text) {
  if (!text || typeof text !== 'string') return []
  const results = []
  // 1. Cari yang terbungkus $$...$$ atau $...$
  const dollarRegex = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g
  let m
  while ((m = dollarRegex.exec(text)) !== null) {
    const inner = (m[1] !== undefined ? m[1] : m[2]).trim()
    if (inner) {
      results.push({
        index: results.length,
        rawMatch: m[0],
        innerFormula: inner,
        friendlyLabel: latexToFriendlyMath(inner),
        start: m.index,
        end: m.index + m[0].length
      })
    }
  }

  // 2. Jika tidak ada simbol $, cari rumus LaTeX telanjang (\frac, \sqrt) atau bentuk akar alami (9√3, √12)
  if (results.length === 0) {
    const bareRegex = /(\\(?:frac\{(?:[^{}]|\{[^{}]*\})+\}\{(?:[^{}]|\{[^{}]*\})+\}|sqrt(?:\[[^\]]+\])?\{(?:[^{}]|\{[^{}]*\})+\})|[+\-]?\d*\s*[√∛∜]\s*(?:\([^()]+\)|[0-9a-zA-Z]+))/g
    while ((m = bareRegex.exec(text)) !== null) {
      const inner = m[0].trim()
      results.push({
        index: results.length,
        rawMatch: m[0],
        innerFormula: normalizeMathFormula(inner),
        friendlyLabel: latexToFriendlyMath(normalizeMathFormula(inner)),
        start: m.index,
        end: m.index + m[0].length
      })
    }
  }

  return results
}

/**
 * Memecah rumus LaTeX (misal: "\sqrt{12} + \sqrt{27} - \sqrt{48}" atau "9\sqrt{3}" atau "{8}^{x+2} = {16}^{x-1}")
 * menjadi deretan Blok Visual Interaktif seperti kotak-kotak Equation di Microsoft Word.
 */
function parseLatexToVisualBlocks(latexStr) {
  let s = normalizeMathFormula(String(latexStr || '').replace(/^\$+|\$+$/g, '').trim())
  if (!s) {
    return [{ id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '12' }]
  }

  const blocks = []
  let safety = 0
  while (s.length > 0 && safety++ < 120) {
    s = s.trim()
    if (!s) break

    // Jika bukan blok pertama dan diawali tanda operasi biner (+, -, =, \times, \div, \pm)
    if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'op') {
      const binOp = s.match(/^([+\-\u2212=]|\\times\b|×|\\div\b|÷|\\pm\b|±|\\le\b|≤|\\ge\b|≥|\\neq\b|≠|\\approx\b|≈|\\cdot\b|·)/)
      if (binOp) {
        const rawOp = binOp[1]
        const opMap = {
          '\\times': '×', '\\div': '÷', '\\pm': '±',
          '\\le': '≤', '\\ge': '≥', '\\neq': '≠', '\\approx': '≈', '\\cdot': '·', '\u2212': '-'
        }
        blocks.push({ id: nextBlockId(), type: 'op', val: opMap[rawOp] || rawOp })
        s = s.slice(binOp[0].length).trim()
        continue
      }
    }

    // 1. Blok Bentuk Akar: [koef]\sqrt[deg]{isi} (contoh: 9\sqrt{3}, -\sqrt{3}, \sqrt{12})
    const radMatch = s.match(/^([+\-]?\d*)\s*\\sqrt(?:\[([^\]]+)\])?\{((?:[^{}]|\{[^{}]*\})*)\}/)
    if (radMatch) {
      blocks.push({
        id: nextBlockId(),
        type: 'akar',
        koef: radMatch[1] || '',
        deg: radMatch[2] || '',
        isi: latexToFriendlyMath(radMatch[3] || '')
      })
      s = s.slice(radMatch[0].length)
      continue
    }

    // 2. Blok Pecahan: \frac{pembilang}{penyebut}
    const fracMatch = s.match(/^([+\-]?\d*)\s*\\frac\{((?:[^{}]|\{[^{}]*\})*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/)
    if (fracMatch) {
      if (fracMatch[1]) {
        blocks.push({ id: nextBlockId(), type: 'teks', val: fracMatch[1] })
      }
      blocks.push({
        id: nextBlockId(),
        type: 'pecahan',
        pembilang: latexToFriendlyMath(fracMatch[2] || ''),
        penyebut: latexToFriendlyMath(fracMatch[3] || '')
      })
      s = s.slice(fracMatch[0].length)
      continue
    }

    // 3. Blok Pangkat: basis^{pangkat} (contoh: {8}^{x+2}, (1/2)^{x}, x^{2})
    const powMatch = s.match(/^(?:\{([^{}]+)\}|(\([^()]+\)|[a-zA-Z0-9\/\.]+))\s*\^\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|\(([^()]+)\)|([+\-]?\d+|[a-zA-Z]))/)
    if (powMatch) {
      const basis = powMatch[1] || powMatch[2] || ''
      const pangkat = powMatch[3] || powMatch[4] || powMatch[5] || ''
      blocks.push({
        id: nextBlockId(),
        type: 'pangkat',
        basis: latexToFriendlyMath(basis),
        pangkat: latexToFriendlyMath(pangkat)
      })
      s = s.slice(powMatch[0].length)
      continue
    }

    // 4. Blok Subskrip / Indeks: variabel_{indeks}
    const subMatch = s.match(/^(?:\{([^{}]+)\}|([a-zA-Z0-9]+))\s*_\s*(?:\{([^{}]+)\}|\(([^()]+)\)|([0-9a-zA-Z]+))/)
    if (subMatch) {
      const variabel = subMatch[1] || subMatch[2] || ''
      const indeks = subMatch[3] || subMatch[4] || subMatch[5] || ''
      blocks.push({
        id: nextBlockId(),
        type: 'subskrip',
        variabel: latexToFriendlyMath(variabel),
        indeks: latexToFriendlyMath(indeks)
      })
      s = s.slice(subMatch[0].length)
      continue
    }

    // 5. Operator Matematika
    const opMatch = s.match(/^([+\-\u2212=]|\\times\b|×|\\div\b|÷|\\pm\b|±|\\le\b|≤|\\ge\b|≥|\\neq\b|≠|\\approx\b|≈|\\cdot\b|·)/)
    if (opMatch) {
      const rawOp = opMatch[1]
      const opMap = {
        '\\times': '×', '\\div': '÷', '\\pm': '±',
        '\\le': '≤', '\\ge': '≥', '\\neq': '≠', '\\approx': '≈', '\\cdot': '·', '\u2212': '-'
      }
      blocks.push({ id: nextBlockId(), type: 'op', val: opMap[rawOp] || rawOp })
      s = s.slice(opMatch[0].length)
      continue
    }

    // 6. Angka / Variabel / Kurung Biasa
    const txtMatch = s.match(/^([a-zA-Z0-9\.\,\(\)\/]+)/)
    if (txtMatch) {
      blocks.push({ id: nextBlockId(), type: 'teks', val: txtMatch[1] })
      s = s.slice(txtMatch[0].length)
      continue
    }

    // Fallback: ambil token LaTeX atau 1 karakter
    const cmdMatch = s.match(/^(\\[a-zA-Z]+(?:\{[^{}]*\})?)/)
    if (cmdMatch) {
      blocks.push({ id: nextBlockId(), type: 'teks', val: latexToFriendlyMath(cmdMatch[1]) })
      s = s.slice(cmdMatch[0].length)
      continue
    }

    blocks.push({ id: nextBlockId(), type: 'teks', val: s[0] })
    s = s.slice(1)
  }

  return blocks.length > 0 ? blocks : [{ id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '12' }]
}

/**
 * Mengubah deretan Blok Visual Interaktif kembali menjadi kode LaTeX murni.
 */
function visualBlocksToLatex(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return ''
  return blocks
    .map(b => {
      if (b.type === 'akar') {
        const koef = (b.koef || '').trim()
        const deg = (b.deg || '').trim()
        const isi = normalizeMathFormula((b.isi || '').trim() || 'x')
        const radPart = deg && deg !== '2' ? `\\sqrt[${deg}]{${isi}}` : `\\sqrt{${isi}}`
        return `${koef}${radPart}`
      }
      if (b.type === 'pecahan') {
        const num = normalizeMathFormula((b.pembilang || '').trim() || 'a')
        const den = normalizeMathFormula((b.penyebut || '').trim() || 'b')
        return `\\frac{${num}}{${den}}`
      }
      if (b.type === 'pangkat') {
        const rawBase = normalizeMathFormula((b.basis || '').trim() || 'x')
        const exp = normalizeMathFormula((b.pangkat || '').trim() || '2')
        return `${rawBase}^{${exp}}`
      }
      if (b.type === 'subskrip') {
        const v = normalizeMathFormula((b.variabel || '').trim() || 'x')
        const sub = normalizeMathFormula((b.indeks || '').trim() || '1')
        return `${v}_{${sub}}`
      }
      if (b.type === 'op') {
        const opMap = {
          '×': '\\times', '÷': '\\div', '±': '\\pm',
          '≤': '\\le', '≥': '\\ge', '≠': '\\neq', '≈': '\\approx', '·': '\\cdot'
        }
        const v = (b.val || '+').trim()
        return opMap[v] || v
      }
      if (b.type === 'teks') {
        return normalizeMathFormula((b.val || '').trim())
      }
      return ''
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

export default function CbtEditorSoalSplitScreen({
  sesiInfo,
  questions,
  onUpdateQuestions,
  onSaveDraft,
  onPublish,
  onBackToInfo,
  onBackToMenuInput,
  onOpenBankSoalPicker,
  previewModalOpen: propPreviewModalOpen,
  setPreviewModalOpen: propSetPreviewModalOpen,
  isEmbedded = false,
  saving = false
}) {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const { showToast, ToastComponent } = useToast()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [localPreviewModalOpen, setLocalPreviewModalOpen] = useState(false)
  const previewModalOpen = propPreviewModalOpen !== undefined ? propPreviewModalOpen : localPreviewModalOpen
  const setPreviewModalOpen = propSetPreviewModalOpen || setLocalPreviewModalOpen
  const [previewDevice, setPreviewDevice] = useState('desktop') // 'desktop' | 'mobile'

  // Modal Peringatan Soal Duplikat
  const [duplicateModalState, setDuplicateModalState] = useState({
    isOpen: false,
    duplicates: [],
    totalUploaded: 0,
    uniqueCount: 0,
    onSkipDuplicates: null,
    onKeepAll: null,
    onCancel: null
  })

  // Ref untuk rich editor (contentEditable)
  const pertanyaanEditorRef = useRef(null)
  const docxImportInputRef = useRef(null)
  const [docxImporting, setDocxImporting] = useState(false)
  const imageFileInputRef = useRef(null)

  // Mode tampilan: 'render' (pratinjau rapi langsung) atau 'edit' (mode ketik input)
  const [viewMode, setViewMode] = useState('render')

  // State Modal Equation Builder (Pembuat & Pengedit Rumus Visual Gaya MS Word)
  const [equationModalOpen, setEquationModalOpen] = useState(false)
  const [eqType, setEqType] = useState('visual_word') // 'visual_word' | 'ketik_mudah' | 'akar' | 'pecahan' | 'pangkat' | 'subskrip' | 'simbol' | 'bebas'
  const [eqTarget, setEqTarget] = useState('pertanyaan') // 'pertanyaan' | 'opsi_A' | 'opsi_B' | ... | 'pembahasan'
  const [editingEqItem, setEditingEqItem] = useState(null) // Jika sedang mengedit rumus yang sudah ada di dalam soal/opsi
  const [visualBlocks, setVisualBlocks] = useState([
    { id: 'init_1', type: 'akar', koef: '', deg: '', isi: '12' }
  ])
  const [eqFriendlyText, setEqFriendlyText] = useState('√12')
  const [eqPembilang, setEqPembilang] = useState('')
  const [eqPenyebut, setEqPenyebut] = useState('')
  const [eqBasis, setEqBasis] = useState('')
  const [eqPangkat, setEqPangkat] = useState('')
  const [eqDalamAkar, setEqDalamAkar] = useState('')
  const [eqDerajatAkar, setEqDerajatAkar] = useState('')
  const [eqKoefAkar, setEqKoefAkar] = useState('')
  const [eqSubskripVar, setEqSubskripVar] = useState('')
  const [eqSubskripVal, setEqSubskripVal] = useState('')
  const [eqBebas, setEqBebas] = useState('')

  // Helper: Konversi file gambar ke base64 data URI
  const fileToBase64 = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // Ref stabil untuk updateFormAndSync agar bisa diakses dari useCallback tanpa stale closure
  const updateFormAndSyncRef = useRef(null)

  // Draft form untuk butir soal yang sedang diedit di sisi kiri
  const activeSoal = questions[currentIndex] || {
    id: `temp_${Date.now()}`,
    nomor_urut: 1,
    tipe_soal: 'pg',
    pertanyaan: '',
    opsi: [
      { key: 'A', text: '', is_kunci: true },
      { key: 'B', text: '', is_kunci: false },
      { key: 'C', text: '', is_kunci: false },
      { key: 'D', text: '', is_kunci: false }
    ],
    kunci_jawaban: 'A',
    bobot: 1.0,
    pembahasan: ''
  }

  const [formSoal, setFormSoal] = useState({ ...activeSoal })

  // Sinkronkan formSoal saat questions atau currentIndex berubah dari luar
  useEffect(() => {
    if (questions && questions[currentIndex]) {
      setFormSoal({ ...questions[currentIndex] })
    }
  }, [currentIndex, questions?.length, questions?.[currentIndex]?.id])

  // Helper mengambil teks sumber dari target ('pertanyaan', 'opsi_A', 'pembahasan')
  const getTargetFieldText = (target) => {
    if (target === 'pertanyaan') return formSoal.pertanyaan || ''
    if (target === 'pembahasan') return formSoal.pembahasan || ''
    if (target.startsWith('opsi_')) {
      const key = target.replace('opsi_', '')
      const found = (formSoal.opsi || []).find(o => o.key === key)
      return found?.text || ''
    }
    return ''
  }

  // Buka Studio Equation Visual (bisa mode Edit Rumus yang diklik atau Buat Rumus Baru)
  const openEquationStudio = (target = 'pertanyaan', eqItemToEdit = null, defaultTab = 'visual_word') => {
    setEqTarget(target)

    // Jika membuka untuk opsi (misal Opsi A) dan belum menunjuk rumus spesifik,
    // otomatis muat rumus yang ada di opsi tersebut jika opsi hanya berisi 1 rumus!
    let item = eqItemToEdit
    if (!item && target.startsWith('opsi_')) {
      const fieldText = getTargetFieldText(target)
      const list = extractEquationsFromField(fieldText)
      if (list.length === 1) {
        item = list[0]
      }
    }

    if (item) {
      setEditingEqItem(item)
      const parsedBlocks = parseLatexToVisualBlocks(item.innerFormula)
      setVisualBlocks(parsedBlocks)
      setEqFriendlyText(latexToFriendlyMath(item.innerFormula))
      setEqBebas(item.innerFormula)

      // Isi juga field tunggal jika hanya 1 blok
      if (parsedBlocks.length === 1) {
        const b0 = parsedBlocks[0]
        if (b0.type === 'akar') {
          setEqKoefAkar(b0.koef || '')
          setEqDerajatAkar(b0.deg || '')
          setEqDalamAkar(b0.isi || '')
        } else if (b0.type === 'pecahan') {
          setEqPembilang(b0.pembilang || '')
          setEqPenyebut(b0.penyebut || '')
        } else if (b0.type === 'pangkat') {
          setEqBasis(b0.basis || '')
          setEqPangkat(b0.pangkat || '')
        } else if (b0.type === 'subskrip') {
          setEqSubskripVar(b0.variabel || '')
          setEqSubskripVal(b0.indeks || '')
        }
      }
      setEqType('visual_word')
    } else {
      setEditingEqItem(null)
      setVisualBlocks([{ id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '12' }])
      setEqFriendlyText('√12')
      setEqKoefAkar('')
      setEqDerajatAkar('')
      setEqDalamAkar('12')
      setEqPembilang('a')
      setEqPenyebut('b')
      setEqBasis('x')
      setEqPangkat('2')
      setEqSubskripVar('x')
      setEqSubskripVal('1')
      setEqBebas('')
      setEqType(defaultTab)
    }

    setEquationModalOpen(true)
  }

  // Handler saat guru mengklik area pertanyaan/opsi di Tampilan Rapi:
  // Jika yang diklik adalah elemen rumus (.katex), langsung buka Visual Equation Studio untuk rumus tersebut!
  // Jika yang diklik adalah teks biasa, masuk ke Mode Edit teks.
  const handleRenderedContainerClick = (e, targetField) => {
    const katexEl = e.target.closest?.('.katex')
    if (katexEl && e.currentTarget) {
      e.stopPropagation()
      const allKatex = Array.from(e.currentTarget.querySelectorAll('.katex'))
      const clickedIdx = allKatex.indexOf(katexEl)
      const fieldText = getTargetFieldText(targetField)
      const eqList = extractEquationsFromField(fieldText)
      if (eqList.length > 0) {
        const matchedEq = eqList[clickedIdx] || eqList[0]
        openEquationStudio(targetField, matchedEq)
        return
      }
    }
    setViewMode('edit')
  }

  // Ubah seluruh kode LaTeX di soal aktif menjadi simbol ramah guru (√12, 8^(x+2), ×, ÷)
  const handleSimplifyQuestionMath = () => {
    const simplifyStr = (str) => {
      if (!str) return str
      return str.replace(/\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g, (_, b1, b2) => {
        const inner = (b1 !== undefined ? b1 : b2).trim()
        // Jika mengandung pecahan \frac, tetap bungkus $ namun sederhanakan isinya
        if (inner.includes('\\frac')) {
          return `$ ${inner.replace(/\{([a-zA-Z0-9]+)\}\s*\^/g, '$1^')} $`
        }
        return `$ ${latexToFriendlyMath(inner)} $`
      })
    }

    const newPertanyaan = simplifyStr(formSoal.pertanyaan)
    const newOpsi = (formSoal.opsi || []).map(opt => ({
      ...opt,
      text: simplifyStr(opt.text)
    }))
    const newPembahasan = simplifyStr(formSoal.pembahasan)

    updateFormAndSync(prev => ({
      ...prev,
      pertanyaan: newPertanyaan,
      opsi: newOpsi,
      pembahasan: newPembahasan
    }))
    if (pertanyaanEditorRef.current) {
      pertanyaanEditorRef.current.innerHTML = (newPertanyaan || '').replace(/\n/g, '<br />')
    }
    showToast('Kode rumus disederhanakan menjadi simbol matematika mudah (√, ^, ×).', 'success')
  }

  // Helper generate LaTeX dari state modal equation builder
  const getGeneratedLatex = () => {
    if (eqType === 'visual_word') {
      return visualBlocksToLatex(visualBlocks) || '\\sqrt{12}'
    }
    if (eqType === 'ketik_mudah') {
      return normalizeMathFormula(eqFriendlyText) || '\\sqrt{12}'
    }
    if (eqType === 'pecahan') {
      const p = normalizeMathFormula(eqPembilang.trim() || 'a')
      const q = normalizeMathFormula(eqPenyebut.trim() || 'b')
      return `\\frac{${p}}{${q}}`
    }
    if (eqType === 'pangkat') {
      const b = normalizeMathFormula(eqBasis.trim() || 'x')
      const p = normalizeMathFormula(eqPangkat.trim() || '2')
      const cleanB = /^[a-zA-Z0-9]+$/.test(b) ? b : `(${b})`
      return `${cleanB}^{${p}}`
    }
    if (eqType === 'akar') {
      const koef = eqKoefAkar.trim()
      const x = normalizeMathFormula(eqDalamAkar.trim() || 'x')
      const n = eqDerajatAkar.trim()
      const rad = n && n !== '2' ? `\\sqrt[${n}]{${x}}` : `\\sqrt{${x}}`
      return `${koef}${rad}`
    }
    if (eqType === 'subskrip') {
      const v = normalizeMathFormula(eqSubskripVar.trim() || 'x')
      const s = normalizeMathFormula(eqSubskripVal.trim() || '1')
      return `${v}_{${s}}`
    }
    if (eqType === 'simbol' || eqType === 'bebas') {
      return normalizeMathFormula(eqBebas.trim() || 'x')
    }
    return ''
  }

  // Simpan perubahan rumus (in-place) atau sisipkan rumus baru ke target (pertanyaan / opsi / pembahasan)
  const handleInsertEquation = (forceAsNew = false) => {
    const latex = getGeneratedLatex()
    if (!latex) return

    const formulaWithDollars = `$ ${latex} $`
    const isReplacing = Boolean(editingEqItem && !forceAsNew)

    const applyToText = (oldText = '') => {
      if (isReplacing && editingEqItem) {
        const before = oldText.slice(0, editingEqItem.start)
        const after = oldText.slice(editingEqItem.end)
        // Pastikan jika start/end cocok dengan rawMatch, ganti langsung di posisinya
        if (oldText.slice(editingEqItem.start, editingEqItem.end) === editingEqItem.rawMatch) {
          return `${before}${formulaWithDollars}${after}`
        }
        // Fallback replace pertama
        if (oldText.includes(editingEqItem.rawMatch)) {
          return oldText.replace(editingEqItem.rawMatch, formulaWithDollars)
        }
      }
      return oldText ? `${oldText} ${formulaWithDollars}` : formulaWithDollars
    }

    if (eqTarget === 'pertanyaan') {
      const newPertanyaan = applyToText(formSoal.pertanyaan)
      updateFormAndSync(prev => ({ ...prev, pertanyaan: newPertanyaan }))
      if (pertanyaanEditorRef.current) {
        pertanyaanEditorRef.current.innerHTML = newPertanyaan.replace(/\n/g, '<br />')
      }
      showToast(isReplacing ? 'Rumus di pertanyaan berhasil diperbarui.' : 'Rumus berhasil disisipkan ke pertanyaan.', 'success')
    } else if (eqTarget === 'pembahasan') {
      const newPembahasan = applyToText(formSoal.pembahasan)
      updateFormAndSync(prev => ({ ...prev, pembahasan: newPembahasan }))
      showToast(isReplacing ? 'Rumus di pembahasan berhasil diperbarui.' : 'Rumus berhasil disisipkan ke pembahasan.', 'success')
    } else if (eqTarget.startsWith('opsi_')) {
      const targetKey = eqTarget.replace('opsi_', '')
      const newOpsi = (formSoal.opsi || []).map(opt => {
        if (opt.key === targetKey) {
          return { ...opt, text: applyToText(opt.text) }
        }
        return opt
      })
      updateFormAndSync(prev => ({ ...prev, opsi: newOpsi }))
      showToast(isReplacing ? `Rumus di Opsi ${targetKey} berhasil diperbarui.` : `Rumus berhasil disisipkan ke Opsi ${targetKey}.`, 'success')
    }

    setEditingEqItem(null)
    setEquationModalOpen(false)
  }

  // Sisipkan rumus / simbol cepat langsung ke pertanyaan / opsi aktif
  const handleInsertQuickMath = (latexSnippet, target = 'pertanyaan') => {
    const snippetWithDollars = `$${latexSnippet}$`
    if (target === 'pertanyaan') {
      const newPertanyaan = formSoal.pertanyaan
        ? `${formSoal.pertanyaan} ${snippetWithDollars}`
        : snippetWithDollars
      updateFormAndSync(prev => ({ ...prev, pertanyaan: newPertanyaan }))
      if (pertanyaanEditorRef.current) {
        pertanyaanEditorRef.current.innerHTML = newPertanyaan.replace(/\n/g, '<br />')
      }
      showToast('Simbol disisipkan ke pertanyaan.', 'info')
    } else if (target.startsWith('opsi_')) {
      const targetKey = target.replace('opsi_', '')
      const newOpsi = (formSoal.opsi || []).map(opt => {
        if (opt.key === targetKey) {
          return { ...opt, text: opt.text ? `${opt.text} ${snippetWithDollars}` : snippetWithDollars }
        }
        return opt
      })
      updateFormAndSync(prev => ({ ...prev, opsi: newOpsi }))
      showToast(`Simbol disisipkan ke Opsi ${targetKey}.`, 'info')
    }
  }

  // Helper fungsi untuk memperbarui form sekaligus langsung menyinkronkan ke parent questions secara realtime
  const updateFormAndSync = (updater) => {
    setFormSoal(prev => {
      const updatedForm = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      if (onUpdateQuestions && questions && questions.length > 0) {
        const updatedList = [...questions]
        updatedList[currentIndex] = {
          ...updatedList[currentIndex],
          ...updatedForm,
          nomor_urut: currentIndex + 1
        }
        onUpdateQuestions(updatedList)
      }
      return updatedForm
    })
  }

  // Simpan ref terbaru updateFormAndSync agar bisa diakses dari useCallback tanpa stale closure
  useEffect(() => {
    updateFormAndSyncRef.current = updateFormAndSync
  })

  // Helper: Sinkronisasi konten contentEditable ke formSoal.pertanyaan
  const syncEditorContent = useCallback(() => {
    if (pertanyaanEditorRef.current) {
      const htmlContent = pertanyaanEditorRef.current.innerHTML || ''
      // Bersihkan <br> berlebih dan simpan konten, tapi pertahankan <img> tags
      const cleaned = htmlContent
        .replace(/<div><br\s*\/?><\/div>/gi, '\n')
        .replace(/<div>/gi, '\n')
        .replace(/<\/div>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
      if (updateFormAndSyncRef.current) {
        updateFormAndSyncRef.current(prev => ({ ...prev, pertanyaan: cleaned }))
      }
    }
  }, [])

  // Handle paste gambar di editor pertanyaan
  const handleEditorPaste = useCallback(async (e) => {
    const clipboardData = e.clipboardData
    if (!clipboardData) return

    // Cek apakah ada gambar di clipboard
    const items = Array.from(clipboardData.items || [])
    const imageItem = items.find(item => item.type.startsWith('image/'))

    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (!file) return

      try {
        const base64 = await fileToBase64(file)
        // Sisipkan gambar di posisi kursor
        const imgHtml = `<img src="${base64}" alt="Gambar Soal" class="cbt-soal-image" style="max-width:100%;height:auto;border-radius:10px;margin:8px 0;display:block;" />`
        document.execCommand('insertHTML', false, imgHtml)
        syncEditorContent()
        showToast('Gambar berhasil ditempel ke pertanyaan soal.', 'success')
      } catch (err) {
        console.error('[CBT] Gagal paste gambar:', err)
        showToast('Gagal menempel gambar. Coba lagi.', 'error')
      }
      return
    }

    // Jika bukan gambar, biarkan paste teks biasa (strip formatting)
    e.preventDefault()
    const text = clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    syncEditorContent()
  }, [fileToBase64, syncEditorContent, showToast])

  // Handle upload gambar via tombol
  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('Hanya berkas gambar (JPG, PNG, GIF) yang didukung.', 'error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Ukuran gambar maksimal 5MB.', 'error')
      return
    }

    try {
      const base64 = await fileToBase64(file)
      const imgTag = `<img src="${base64}" alt="Gambar Soal" class="cbt-soal-image" style="max-width:100%;height:auto;border-radius:10px;margin:8px 0;display:block;" />`
      
      // Sisipkan gambar di editor
      if (pertanyaanEditorRef.current) {
        pertanyaanEditorRef.current.focus()
        document.execCommand('insertHTML', false, imgTag)
        syncEditorContent()
      } else {
        // Fallback: append ke pertanyaan
        if (updateFormAndSyncRef.current) {
          updateFormAndSyncRef.current(prev => ({ ...prev, pertanyaan: (prev.pertanyaan || '') + imgTag }))
        }
      }
      showToast('Gambar berhasil disisipkan ke pertanyaan soal.', 'success')
    } catch (err) {
      showToast('Gagal memuat gambar: ' + err.message, 'error')
    }

    // Reset file input
    if (imageFileInputRef.current) imageFileInputRef.current.value = ''
  }, [fileToBase64, syncEditorContent, showToast])

  // Sinkronisasi konten editor saat formSoal berubah dari luar
  useEffect(() => {
    if (pertanyaanEditorRef.current && formSoal.pertanyaan !== undefined) {
      const editorHtml = pertanyaanEditorRef.current.innerHTML
      // Hanya update jika konten benar-benar berubah (mencegah cursor jump)
      const currentContentStripped = editorHtml
        .replace(/<div><br\s*\/?><\/div>/gi, '\n')
        .replace(/<div>/gi, '\n')
        .replace(/<\/div>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
      if (currentContentStripped !== formSoal.pertanyaan) {
        // Convert pertanyaan kembali ke HTML untuk editor
        const htmlForEditor = (formSoal.pertanyaan || '')
          .replace(/\n/g, '<br />')
        pertanyaanEditorRef.current.innerHTML = htmlForEditor
      }
    }
  }, [formSoal.pertanyaan, currentIndex])

  // Sinkronkan saat currentIndex berganti
  const handleSelectSoal = (idx) => {
    if (idx === currentIndex) return
    if (questions && questions[currentIndex]) {
      const updated = [...questions]
      updated[currentIndex] = {
        ...updated[currentIndex],
        ...formSoal,
        nomor_urut: currentIndex + 1
      }
      onUpdateQuestions(updated)
      setCurrentIndex(idx)
      setFormSoal({ ...updated[idx] })
    } else {
      setCurrentIndex(idx)
    }
  }

  // Simpan perubahan form sisi kiri ke daftar naskah (Update Soal)
  const handleApplyUpdateSoal = () => {
    if (!formSoal.pertanyaan.trim()) {
      showToast('Pertanyaan soal tidak boleh kosong.', 'error')
      return
    }

    const updated = [...questions]
    updated[currentIndex] = {
      ...formSoal,
      nomor_urut: currentIndex + 1
    }
    onUpdateQuestions(updated)
    showToast(`Soal Nomor ${currentIndex + 1} berhasil diperbarui (Kunci: ${formSoal.kunci_jawaban || '-'}).`, 'success')
  }

  // Tambah Soal Baru Kosong
  const handleAddNewQuestion = () => {
    const flushedList = [...questions]
    if (flushedList[currentIndex]) {
      flushedList[currentIndex] = {
        ...flushedList[currentIndex],
        ...formSoal,
        nomor_urut: currentIndex + 1
      }
    }

    const newNo = flushedList.length + 1
    const newQuestion = {
      id: `soal_${Date.now()}`,
      nomor_urut: newNo,
      tipe_soal: 'pg',
      pertanyaan: '',
      opsi: [
        { key: 'A', text: '', is_kunci: true },
        { key: 'B', text: '', is_kunci: false },
        { key: 'C', text: '', is_kunci: false },
        { key: 'D', text: '', is_kunci: false }
      ],
      kunci_jawaban: 'A',
      bobot: 1.0,
      pembahasan: ''
    }

    const updated = [...flushedList, newQuestion]
    onUpdateQuestions(updated)
    setCurrentIndex(updated.length - 1)
    setFormSoal({ ...newQuestion })
    showToast(`Soal Nomor ${newNo} berhasil ditambahkan.`, 'info')
  }

  // Import Soal dari Template Word (.docx)
  const handleImportDocx = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.docx') && !file.name.endsWith('.doc')) {
      showToast('Hanya berkas Word (.docx) yang didukung. Simpan file Word Anda sebagai .docx lalu coba lagi.', 'error')
      if (docxImportInputRef.current) docxImportInputRef.current.value = ''
      return
    }

    setDocxImporting(true)
    try {
      const parsed = await parseDocxFile(file)
      const importedQuestions = parsed?.questions || []

      if (importedQuestions.length === 0) {
        showToast('Tidak ditemukan butir soal pada berkas Word. Pastikan format penomoran sudah benar (contoh: "1. Teks soal").', 'error')
        return
      }

      // Flush form soal aktif ke daftar sebelum merge
      const flushedList = [...questions]
      if (flushedList[currentIndex]) {
        flushedList[currentIndex] = {
          ...flushedList[currentIndex],
          ...formSoal,
          nomor_urut: currentIndex + 1
        }
      }

      const existingValid = flushedList.filter(q => q?.pertanyaan?.trim())

      // Validasi kualitas & deteksi duplikasi soal (terhadap sesama soal upload & soal yang sudah ada di editor)
      const validation = validateQuestionsList(importedQuestions, existingValid)

      let questionsToProcess = importedQuestions

      // 1. Peringatan Soal Duplikat (jika ada yang isinya sama persis)
      if (validation.hasDuplicates) {
        const userChoice = await new Promise(resolve => {
          setDuplicateModalState({
            isOpen: true,
            duplicates: validation.duplicates,
            totalUploaded: importedQuestions.length,
            uniqueCount: validation.uniqueQuestions.length,
            onSkipDuplicates: () => {
              setDuplicateModalState(prev => ({ ...prev, isOpen: false }))
              resolve('skip')
            },
            onKeepAll: () => {
              setDuplicateModalState(prev => ({ ...prev, isOpen: false }))
              resolve('keep')
            },
            onCancel: () => {
              setDuplicateModalState(prev => ({ ...prev, isOpen: false }))
              resolve('cancel')
            }
          })
        })

        if (userChoice === 'cancel') {
          return
        }

        if (userChoice === 'skip') {
          questionsToProcess = validation.uniqueQuestions
          showToast(`Mengabaikan ${validation.duplicatesCount} soal duplikat. Melanjutkan impor ${questionsToProcess.length} butir soal unik.`, 'info')
        }
      }

      // 2. Validasi kelengkapan format selain duplikasi
      const nonDuplicateIssues = validation.issues.filter(msg => !msg.toLowerCase().includes('sama persis'))
      if (nonDuplicateIssues.length > 0) {
        const confirmImport = await requestConfirm({
          title: `Ditemukan ${nonDuplicateIssues.length} Catatan Format`,
          message: `Soal dari file Word berhasil dibaca (${questionsToProcess.length} butir soal), namun ada beberapa catatan:\n• ${nonDuplicateIssues.slice(0, 5).join('\n• ')}${nonDuplicateIssues.length > 5 ? '\n• ...' : ''}\n\nApakah Anda tetap ingin mengimpor seluruh soal ini?`,
          confirmLabel: 'Ya, Impor Semua',
          confirmColor: 'amber',
          icon: 'warning'
        })
        if (!confirmImport) return
      }

      if (questionsToProcess.length === 0) {
        showToast('Tidak ada butir soal unik yang tersisa untuk diimpor.', 'warning')
        return
      }

      // Pilih mode: tambahkan di akhir (merge) atau ganti semua
      let mergedList
      if (flushedList.length > 0 && flushedList[0]?.pertanyaan?.trim()) {
        const confirmMode = await requestConfirm({
          title: 'Tambahkan atau Ganti Soal?',
          message: `Saat ini sudah ada ${flushedList.length} butir soal di editor.\nApakah Anda ingin menambahkan ${questionsToProcess.length} soal baru di akhir daftar, atau mengganti seluruh soal yang ada?`,
          confirmLabel: `Tambahkan di Akhir (+${questionsToProcess.length} Soal)`,
          cancelLabel: 'Ganti Semua',
          confirmColor: 'indigo',
          icon: 'info'
        })

        if (confirmMode) {
          // Mode Merge: tambahkan di akhir
          mergedList = [
            ...flushedList,
            ...questionsToProcess.map((q, idx) => ({
              ...q,
              id: q.id || `import_${Date.now()}_${idx}`,
              nomor_urut: flushedList.length + idx + 1
            }))
          ]
        } else {
          // Mode Replace: ganti semua
          mergedList = questionsToProcess.map((q, idx) => ({
            ...q,
            id: q.id || `import_${Date.now()}_${idx}`,
            nomor_urut: idx + 1
          }))
        }
      } else {
        // Daftar kosong, langsung replace
        mergedList = questionsToProcess.map((q, idx) => ({
          ...q,
          id: q.id || `import_${Date.now()}_${idx}`,
          nomor_urut: idx + 1
        }))
      }

      onUpdateQuestions(mergedList)
      setCurrentIndex(0)
      setFormSoal({ ...mergedList[0] })

      showToast(`Berhasil mengimpor ${questionsToProcess.length} butir soal dari template Word. Total soal: ${mergedList.length}.`, 'success')
    } catch (err) {
      console.error('[CBT Editor] Gagal import Word:', err)
      showToast('Gagal memproses berkas Word: ' + (err.message || 'Format tidak dikenali.'), 'error')
    } finally {
      setDocxImporting(false)
      if (docxImportInputRef.current) docxImportInputRef.current.value = ''
    }
  }


  // Unduh Template Word
  const handleDownloadTemplate = () => {
    downloadSampleDocxTemplate()
    showToast('Template Word berhasil diunduh. Buka di Word, isi soal, simpan sebagai .docx, lalu impor kembali.', 'info')
  }

  // Hapus Soal Aktif
  const handleDeleteActiveQuestion = async () => {
    if (questions.length <= 1) {
      showToast('Penilaian harus memiliki minimal 1 butir soal.', 'info')
      return
    }

    const confirmed = await requestConfirm({
      title: `Hapus Soal Nomor ${currentIndex + 1}?`,
      message: 'Butir soal ini akan dihapus dari naskah penilaian.',
      confirmLabel: 'Ya, Hapus Soal',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return

    const deletedNo = currentIndex + 1
    const updated = questions
      .filter((_, idx) => idx !== currentIndex)
      .map((q, idx) => ({ ...q, nomor_urut: idx + 1 }))

    onUpdateQuestions(updated)
    const nextIdx = Math.max(0, currentIndex - 1)
    setCurrentIndex(nextIdx)
    setFormSoal({ ...updated[nextIdx] })
    showToast(`Soal Nomor ${deletedNo} berhasil dihapus.`, 'info')
  }

  // Helper render KaTeX di preview (mendukung gambar inline, rumus otomatis, & LaTeX)
  const renderMathContent = (text) => {
    return renderFormattedMath(text)
  }

  // Helper ringkasan pertanyaan untuk kartu sidebar (mencegah tabel/gambar raksasa merusak tata letak kartu)
  const renderQuestionSummary = (text) => {
    if (!text) return '<span class="text-slate-400 italic">(Pertanyaan belum diisi)</span>'

    const hasImg = /<img[^>]*>/i.test(text)
    const hasTable = /<table[\s\S]*?<\/table>/i.test(text)

    // Hapus total tag <img> dan <table>...</table> agar tidak pernah merusak kartu sidebar
    let clean = text
      .replace(/<img[^>]*>/gi, '')
      .replace(/<table[\s\S]*?<\/table>/gi, '')
      // Ganti tag block/break seperti <br>, <p>, </p>, <div>, </div> dengan spasi
      .replace(/<\/?(br|p|div|h[1-6]|li|tr|tbody|thead)[^>]*>/gi, ' ')
      // Hapus tag HTML lainnya yang tersisa
      .replace(/<[^>]+>/g, ' ')
      // Hilangkan spasi berlebih
      .replace(/\s+/g, ' ')
      .trim()

    // Render KaTeX untuk rumus matematika yang tersisa ($...$ atau LaTeX)
    let mathRendered = renderMathContent(clean)

    // Tambahkan badge indikator jika ada gambar atau tabel
    let badges = ''
    if (hasImg) {
      badges += ' <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold shrink-0 align-middle">🖼️ Gambar</span>'
    }
    if (hasTable) {
      badges += ' <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold shrink-0 align-middle">📊 Tabel</span>'
    }

    if (!mathRendered && !badges) {
      return '<span class="text-slate-400 italic">(Pertanyaan belum diisi)</span>'
    }

    return (mathRendered || '<span class="text-slate-500 font-medium">Soal bergambar/tabel</span>') + badges
  }

  return (
    <div className={isEmbedded ? "h-full flex flex-col overflow-y-auto pb-12 bg-slate-50" : "bg-slate-50 min-h-screen pb-12"}>
      {/* HEADER ATAS (HANYA DITAMPILKAN JIKA MODE STANDALONE) */}
      {!isEmbedded && (
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 px-4 md:px-8 py-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBackToMenuInput ? (
              <button
                type="button"
                onClick={onBackToMenuInput}
                className="h-9 px-3 rounded-xl border border-slate-200 flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                title="Kembali ke Menu Pilihan Input Soal"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Menu Input Soal</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onBackToInfo}
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-slate-200 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
              title="Kembali ke Form Informasi Penilaian"
            >
              {!onBackToMenuInput && (
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              )}
              <span className="hidden sm:inline">Form Info</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  STATUS: DRAFT
                </span>
                <span className="text-xs font-semibold text-indigo-600">
                  {sesiInfo.mapel}
                </span>
              </div>
              <h1 className="text-sm md:text-base font-bold text-slate-800 line-clamp-1">
                {sesiInfo.judul || 'Penilaian Baru'}
              </h1>
            </div>
          </div>

          {/* 3 Tombol Utama: Pratinjau, Simpan Draft, Terbitkan */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Pratinjau</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const updated = [...questions]
                updated[currentIndex] = { ...updated[currentIndex], ...formSoal, nomor_urut: currentIndex + 1 }
                onUpdateQuestions(updated)
                if (onSaveDraft) onSaveDraft(updated)
              }}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>Simpan Draft</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const updated = [...questions]
                updated[currentIndex] = { ...updated[currentIndex], ...formSoal, nomor_urut: currentIndex + 1 }
                onUpdateQuestions(updated)
                if (onPublish) onPublish(updated)
              }}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Terbitkan</span>
            </button>
          </div>
        </header>
      )}

      {/* BODY UTAMA (SPLIT-SCREEN) */}
      <main className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* KOLOM KIRI (AREA BESAR): DETAIL SOAL AKTIF */}
        <section className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 md:p-7 space-y-5">
          {/* Header Soal Aktif & Tipe Soal + Mode Switcher & Equation Builder */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                {currentIndex + 1}
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  Detail Soal Nomor {currentIndex + 1}
                </h2>
                <span className="text-[11px] text-slate-400">
                  Total {questions.length} Butir Soal Terdaftar
                </span>
              </div>
            </div>

            {/* Actions: Mode Switcher, Buat Equation, & Dropdown Tipe Soal */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Pill Switcher: Tampilan Rapi vs Mode Edit */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode('render')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === 'render'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Lihat hasil akhir soal dalam format rapi"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  <span>Tampilan Rapi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === 'edit'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ubah teks pertanyaan dan pilihan jawaban"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  <span>Mode Edit</span>
                </button>
              </div>

              {/* Tombol Buat Equation / Rumus Visual */}
              <button
                type="button"
                onClick={() => openEquationStudio('pertanyaan', null)}
                className="px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                title="Buka pembuat & pengedit rumus matematika visual seperti MS Word"
              >
                <span className="text-sm font-black">∑</span>
                <span>Buat Equation</span>
              </button>

              {/* Dropdown Tipe Soal */}
              <div className="flex items-center gap-1.5">
                <select
                  value={formSoal.tipe_soal}
                  onChange={(e) => {
                    const newTipe = e.target.value
                    let defaultKunci = 'A'
                    let defaultOpsi = formSoal.opsi
                    if (newTipe === 'pg_kompleks') defaultKunci = '["A"]'
                    if (newTipe === 'benar_salah') {
                      defaultOpsi = [{ key: 'A', text: 'Pernyataan 1' }, { key: 'B', text: 'Pernyataan 2' }]
                      defaultKunci = 'A=Benar, B=Salah'
                    }
                    if (newTipe === 'menjodohkan') {
                      defaultOpsi = [{ key: 'A', text: 'Premis 1' }]
                      defaultKunci = 'A=Respon 1'
                    }
                    if (newTipe === 'isian') {
                      defaultKunci = ''
                    }
                    updateFormAndSync(prev => ({
                      ...prev,
                      tipe_soal: newTipe,
                      opsi: defaultOpsi,
                      kunci_jawaban: defaultKunci
                    }))
                  }}
                  className="text-xs font-bold px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
                >
                  <option value="pg">PG Tunggal</option>
                  <option value="pg_kompleks">PG Kompleks</option>
                  <option value="benar_salah">Benar / Salah</option>
                  <option value="menjodohkan">Menjodohkan</option>
                  <option value="isian">Isian Singkat</option>
                </select>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAMPILAN 1: MODE RENDER LANGSUNG (DEFAULT - WYSIWYG CANTIK & BERSIH)      */}
          {/* ========================================================================= */}
          {viewMode === 'render' ? (
            <div className="space-y-6 animate-fadeIn">
              {/* Kotak Pertanyaan Ter-render */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Isi Pertanyaan Soal:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEquationStudio('pertanyaan', null)}
                      className="text-xs font-bold text-violet-700 hover:text-violet-900 flex items-center gap-1 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-lg border border-violet-200/70 transition-colors"
                      title="Sisipkan rumus baru ke pertanyaan"
                    >
                      <span className="font-black">∑</span>
                      <span>+ Rumus</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('edit')}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      <span>Edit Pertanyaan</span>
                    </button>
                  </div>
                </div>
                <div
                  onClick={(e) => handleRenderedContainerClick(e, 'pertanyaan')}
                  className="w-full text-sm md:text-base p-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs leading-relaxed text-slate-800 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group relative"
                  title="Klik rumus untuk edit visual (seperti MS Word), atau klik teks untuk edit kalimat"
                >
                  <div
                    className="cbt-rendered-content"
                    dangerouslySetInnerHTML={{ __html: renderMathContent(formSoal.pertanyaan || '<span class="text-slate-400 italic">Pertanyaan belum diisi. Klik untuk mulai menulis.</span>') }}
                  />
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-200">
                    Klik rumus / teks untuk edit
                  </div>
                </div>

                {/* Daftar Chip Rumus di Pertanyaan (Klik untuk Edit Visual seperti MS Word!) */}
                {(() => {
                  const eqList = extractEquationsFromField(formSoal.pertanyaan)
                  if (eqList.length === 0) return null
                  return (
                    <div className="mt-2.5 p-2.5 bg-violet-50/70 border border-violet-200/80 rounded-xl flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold text-violet-800 flex items-center gap-1 shrink-0">
                        <span>∑ Edit Rumus Visual (Klik):</span>
                      </span>
                      {eqList.map((eqItem) => (
                        <button
                          key={eqItem.index}
                          type="button"
                          onClick={() => openEquationStudio('pertanyaan', eqItem)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-violet-100 text-slate-800 border border-violet-300 shadow-2xs text-xs font-medium flex items-center gap-1.5 transition-all hover:scale-[1.02] cursor-pointer"
                          title="Klik untuk mengedit rumus ini secara visual tanpa kode LaTeX"
                        >
                          <span
                            className="pointer-events-none"
                            dangerouslySetInnerHTML={{ __html: renderMathContent(`$${eqItem.innerFormula}$`) }}
                          />
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                            ✏️ Edit
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Pilihan Opsi Ter-render (PG & PG Kompleks) */}
              {(formSoal.tipe_soal === 'pg' || formSoal.tipe_soal === 'pg_kompleks') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Pilihan Jawaban & Kunci Benar:
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Klik tombol huruf untuk kunci • Klik <strong className="text-violet-600">∑ Rumus</strong> untuk edit equation visual
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {(formSoal.opsi || []).map((opt, optIdx) => {
                      const optKey = opt.key || String.fromCharCode(65 + optIdx)
                      const isPgChecked = formSoal.tipe_soal === 'pg' 
                        ? formSoal.kunci_jawaban === optKey 
                        : formSoal.kunci_jawaban?.includes(optKey)
                      const optEquations = extractEquationsFromField(opt.text)

                      return (
                        <div
                          key={optKey}
                          className={`min-h-[62px] px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                            isPgChecked
                              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                              : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            {/* Tombol Huruf Opsi / Kunci */}
                            <button
                              type="button"
                              onClick={() => {
                                if (formSoal.tipe_soal === 'pg') {
                                  updateFormAndSync(prev => ({ ...prev, kunci_jawaban: optKey }))
                                } else {
                                  let currentKeys = []
                                  try {
                                    currentKeys = Array.isArray(JSON.parse(formSoal.kunci_jawaban)) 
                                      ? JSON.parse(formSoal.kunci_jawaban) 
                                      : formSoal.kunci_jawaban.split(',').map(s => s.trim())
                                  } catch {
                                    currentKeys = [formSoal.kunci_jawaban]
                                  }
                                  if (currentKeys.includes(optKey)) {
                                    currentKeys = currentKeys.filter(k => k !== optKey)
                                  } else {
                                    currentKeys.push(optKey)
                                  }
                                  updateFormAndSync(prev => ({ ...prev, kunci_jawaban: JSON.stringify(currentKeys.sort()) }))
                                }
                              }}
                              className={`w-9 h-9 rounded-xl font-black text-xs shrink-0 flex items-center justify-center transition-all ${
                                isPgChecked
                                  ? 'bg-emerald-600 text-white shadow-xs scale-105 ring-2 ring-emerald-400/30'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                              }`}
                              title={isPgChecked ? 'Kunci Jawaban Benar (Klik untuk ubah)' : 'Klik untuk jadikan kunci jawaban'}
                            >
                              {optKey}
                            </button>

                            {/* Teks Opsi Ter-render dengan Rumus KaTeX */}
                            <div
                              className="flex-1 min-w-0 text-sm md:text-base text-slate-800 leading-normal cursor-pointer font-medium cbt-rendered-content py-1"
                              onClick={(e) => handleRenderedContainerClick(e, `opsi_${optKey}`)}
                              title="Klik rumus untuk edit visual (seperti MS Word), atau klik area teks untuk edit opsi"
                              dangerouslySetInnerHTML={{ __html: renderMathContent(opt.text || '<span class="text-slate-400 italic">Opsi belum diisi</span>') }}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isPgChecked && (
                              <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center gap-1.5 border border-emerald-200">
                                <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                                <span>Kunci Benar</span>
                              </span>
                            )}
                            {/* Tombol Edit Rumus Visual langsung di Opsi */}
                            <button
                              type="button"
                              onClick={() => openEquationStudio(`opsi_${optKey}`, optEquations[0] || null)}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1 border cursor-pointer ${
                                optEquations.length > 0
                                  ? 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'
                                  : 'bg-slate-50 hover:bg-violet-50 text-slate-500 hover:text-violet-700 border-slate-200'
                              }`}
                              title={optEquations.length > 0 ? `Edit rumus visual di Opsi ${optKey} (seperti MS Word)` : `Sisipkan rumus ke Opsi ${optKey}`}
                            >
                              <span className="font-black">∑</span>
                              <span>{optEquations.length > 0 ? 'Edit Rumus' : 'Rumus'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewMode('edit')}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                              title="Edit teks pilihan jawaban ini"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Benar / Salah Ter-render */}
              {formSoal.tipe_soal === 'benar_salah' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">Pernyataan & Kunci (Benar / Salah):</label>
                  <div className="space-y-2">
                    {(formSoal.opsi || []).map((opt, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                        <div dangerouslySetInnerHTML={{ __html: renderMathContent(opt.text) }} />
                        <span className="font-mono text-indigo-700 font-bold">Kunci: {formSoal.kunci_jawaban || '-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Menjodohkan Ter-render */}
              {formSoal.tipe_soal === 'menjodohkan' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-slate-700">Pasangan Menjodohkan:</span>
                  <div className="font-mono text-indigo-700 font-bold">{formSoal.kunci_jawaban || 'Belum diisi'}</div>
                </div>
              )}

              {/* Isian Ter-render */}
              {formSoal.tipe_soal === 'isian' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-slate-700">Kunci Jawaban Isian:</span>
                  <div className="font-semibold text-slate-800">{formSoal.kunci_jawaban || 'Belum diisi'}</div>
                </div>
              )}

              {/* Bobot & Pembahasan Ter-render */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-semibold">Bobot Nilai:</span>
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-100">
                    {formSoal.bobot || 1.0} Poin
                  </span>
                </div>
                {formSoal.pembahasan && (
                  <div className="flex-1 min-w-[200px] p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Pembahasan / Solusi:
                    </span>
                    <div
                      className="text-xs text-slate-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMathContent(formSoal.pembahasan) }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* TAMPILAN 2: MODE EDIT (LENGKAP DENGAN TOOLBAR RUMUS & LIVE PREVIEW)       */
            /* ========================================================================= */
            <div className="space-y-5 animate-fadeIn">
              {/* Form Teks Pertanyaan (Rich Editor dengan Dukungan Gambar) */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Isi Pertanyaan Soal:
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSimplifyQuestionMath}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold transition-colors"
                      title="Ubah kode LaTeX seperti \sqrt{12} menjadi simbol ramah guru seperti √12, 8^(x+2), ×, ÷"
                    >
                      <span>🪄 Ubah Kode ke Simbol Mudah (√, ^, ×)</span>
                    </button>
                    {/* Tombol Upload Gambar */}
                    <button
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold transition-colors"
                      title="Sisipkan gambar dari berkas"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Gambar</span>
                    </button>
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Bilah Rumus Cepat (Quick Math Toolbar) */}
                <div className="flex items-center gap-1.5 flex-wrap p-2 bg-slate-50 rounded-xl border border-slate-200 mb-2">
                  <span className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">Sisip Cepat:</span>
                  <button
                    type="button"
                    onClick={() => openEquationStudio('pertanyaan', null, 'akar')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Buat bentuk akar (√x, a√b, ∛x)"
                  >
                    √x
                  </button>
                  <button
                    type="button"
                    onClick={() => openEquationStudio('pertanyaan', null, 'pecahan')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Buat pecahan (a/b)"
                  >
                    a/b
                  </button>
                  <button
                    type="button"
                    onClick={() => openEquationStudio('pertanyaan', null, 'pangkat')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Buat bilangan berpangkat (xⁿ)"
                  >
                    xⁿ
                  </button>
                  <button
                    type="button"
                    onClick={() => openEquationStudio('pertanyaan', null, 'subskrip')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Buat indeks bawah (x₁)"
                  >
                    x₁
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\times')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Simbol kali"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\div')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Simbol bagi"
                  >
                    ÷
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\pm')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Plus minus"
                  >
                    ±
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\pi')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Simbol pi"
                  >
                    π
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('^\\circ')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Simbol derajat"
                  >
                    °
                  </button>
                  <button
                    type="button"
                    onClick={() => openEquationStudio('pertanyaan', null)}
                    className="ml-auto px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <span>∑ Studio Equation (Gaya Word)</span>
                  </button>
                </div>

                {/* Daftar Rumus Terdeteksi di Pertanyaan — Klik untuk Edit Visual! */}
                {(() => {
                  const eqList = extractEquationsFromField(formSoal.pertanyaan)
                  if (eqList.length === 0) return null
                  return (
                    <div className="mb-2 p-2.5 bg-violet-50/80 border border-violet-200 rounded-xl flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold text-violet-800 shrink-0">
                        ✏️ Klik Rumus untuk Edit Visual (Tanpa Kode LaTeX):
                      </span>
                      {eqList.map((eqItem) => (
                        <button
                          key={eqItem.index}
                          type="button"
                          onClick={() => openEquationStudio('pertanyaan', eqItem)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-violet-100 text-slate-800 border border-violet-300 shadow-2xs text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <span
                            className="pointer-events-none"
                            dangerouslySetInnerHTML={{ __html: renderMathContent(`$${eqItem.innerFormula}$`) }}
                          />
                          <span className="text-[10px] font-bold text-violet-600">Edit</span>
                        </button>
                      ))}
                    </div>
                  )
                })()}

                <div
                  ref={pertanyaanEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncEditorContent}
                  onPaste={handleEditorPaste}
                  data-placeholder="Ketikkan teks pertanyaan soal di sini... (Bisa langsung ketik √12, 9√3, x², atau klik Studio Equation)"
                  className="cbt-rich-editor w-full text-xs md:text-sm p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 leading-relaxed font-sans"
                />

                {/* Live KaTeX / Math / Table Preview if equation / rich content exists */}
                {Boolean(formSoal.pertanyaan && (formSoal.pertanyaan.includes('$') || formSoal.pertanyaan.includes('\\') || formSoal.pertanyaan.includes('<table') || formSoal.pertanyaan.includes('<img') || /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱ√∛∜\^]/.test(formSoal.pertanyaan))) && (
                  <div className="mt-2.5 p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-indigo-700 mb-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      <span>Pratinjau Tampilan Rumus / Soal:</span>
                    </div>
                    <div
                      className="text-xs md:text-sm text-slate-800 leading-relaxed bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs"
                      dangerouslySetInnerHTML={{ __html: renderMathContent(formSoal.pertanyaan) }}
                    />
                  </div>
                )}
              </div>

              {/* Form Pilihan Opsi & Kunci Jawaban Berdasarkan Tipe Soal */}
              {/* TIPE 1 & 2: PG dan PG Kompleks */}
              {(formSoal.tipe_soal === 'pg' || formSoal.tipe_soal === 'pg_kompleks') && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Pilihan Jawaban & Kunci Benar:
                  </label>
                  <div className="space-y-2.5">
                    {(formSoal.opsi || []).map((opt, optIdx) => {
                      const optKey = opt.key || String.fromCharCode(65 + optIdx)
                      const isPgChecked = formSoal.tipe_soal === 'pg' 
                        ? formSoal.kunci_jawaban === optKey 
                        : formSoal.kunci_jawaban?.includes(optKey)
                      const optEqList = extractEquationsFromField(opt.text)

                      return (
                        <div key={optKey} className="flex items-start gap-2.5">
                          {/* Checkbox / Radio Kunci */}
                          <button
                            type="button"
                            onClick={() => {
                              if (formSoal.tipe_soal === 'pg') {
                                updateFormAndSync(prev => ({ ...prev, kunci_jawaban: optKey }))
                              } else {
                                let currentKeys = []
                                try {
                                  currentKeys = Array.isArray(JSON.parse(formSoal.kunci_jawaban)) 
                                    ? JSON.parse(formSoal.kunci_jawaban) 
                                    : formSoal.kunci_jawaban.split(',').map(s => s.trim())
                                } catch {
                                  currentKeys = [formSoal.kunci_jawaban]
                                }
                                if (currentKeys.includes(optKey)) {
                                  currentKeys = currentKeys.filter(k => k !== optKey)
                                } else {
                                  currentKeys.push(optKey)
                                }
                                updateFormAndSync(prev => ({ ...prev, kunci_jawaban: JSON.stringify(currentKeys.sort()) }))
                              }
                            }}
                            className={`w-8 h-8 mt-1 rounded-xl font-bold text-xs shrink-0 flex items-center justify-center transition-all ${
                              isPgChecked
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title={isPgChecked ? 'Kunci Jawaban Benar' : 'Klik untuk jadikan kunci'}
                          >
                            {optKey}
                          </button>

                          {/* Input Teks Opsi + Live Math Preview */}
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={opt.text || ''}
                                onChange={(e) => {
                                  const newOpsi = [...formSoal.opsi]
                                  newOpsi[optIdx] = { ...newOpsi[optIdx], key: optKey, text: e.target.value }
                                  updateFormAndSync(prev => ({ ...prev, opsi: newOpsi }))
                                }}
                                placeholder={`Teks pilihan jawaban ${optKey}... (bisa ketik 9√3, x², atau klik ∑ Rumus)`}
                                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => openEquationStudio(`opsi_${optKey}`, optEqList[0] || null)}
                                className="px-2.5 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold transition-colors shrink-0"
                                title={optEqList.length > 0 ? `Edit rumus visual di Opsi ${optKey}` : `Buat rumus visual untuk Opsi ${optKey}`}
                              >
                                ∑ {optEqList.length > 0 ? 'Edit Rumus' : 'Rumus'}
                              </button>
                            </div>
                            {Boolean(opt.text && (opt.text.includes('$') || opt.text.includes('\\') || /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱ√∛∜\^]/.test(opt.text))) && (
                              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-indigo-50/50 rounded-lg border border-indigo-100/70 text-xs text-slate-800">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-indigo-500 shrink-0">Pratinjau {optKey}:</span>
                                  <div dangerouslySetInnerHTML={{ __html: renderMathContent(opt.text) }} />
                                </div>
                                {optEqList.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openEquationStudio(`opsi_${optKey}`, optEqList[0])}
                                    className="text-[10px] font-bold text-violet-700 hover:underline shrink-0"
                                  >
                                    ✏️ Edit Visual
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Klik tombol huruf (A/B/C/D) yang berwarna hijau untuk menentukan kunci jawaban yang benar.
                  </p>
                </div>
              )}

              {/* TIPE 3: Benar / Salah */}
              {formSoal.tipe_soal === 'benar_salah' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Pernyataan & Kunci Jawaban (Benar / Salah):
                  </label>
                  <div className="space-y-2.5">
                    {(formSoal.opsi || []).map((opt, optIdx) => (
                      <div key={optIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <input
                          type="text"
                          value={opt.text || ''}
                          onChange={(e) => {
                            const newOpsi = [...formSoal.opsi]
                            newOpsi[optIdx] = { ...newOpsi[optIdx], text: e.target.value }
                            updateFormAndSync(prev => ({ ...prev, opsi: newOpsi }))
                          }}
                          placeholder={`Pernyataan ${optIdx + 1}...`}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Format Kunci Jawaban:
                    </label>
                    <input
                      type="text"
                      value={formSoal.kunci_jawaban || ''}
                      onChange={(e) => updateFormAndSync(prev => ({ ...prev, kunci_jawaban: e.target.value }))}
                      placeholder="Contoh: A=Benar, B=Salah"
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* TIPE 4: Menjodohkan */}
              {formSoal.tipe_soal === 'menjodohkan' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Pasangan Menjodohkan (Premis & Respon):
                  </label>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Kunci Pasangan:
                    </label>
                    <input
                      type="text"
                      value={formSoal.kunci_jawaban || ''}
                      onChange={(e) => updateFormAndSync(prev => ({ ...prev, kunci_jawaban: e.target.value }))}
                      placeholder="Contoh: A=Indonesia, B=Jepang"
                      className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* TIPE 5: Isian Singkat */}
              {formSoal.tipe_soal === 'isian' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Kunci Jawaban Singkat:
                  </label>
                  <input
                    type="text"
                    value={formSoal.kunci_jawaban || ''}
                    onChange={(e) => updateFormAndSync(prev => ({ ...prev, kunci_jawaban: e.target.value }))}
                    placeholder="Contoh: Indonesia Raya / Fotosintesis"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                  />
                </div>
              )}

              {/* Bobot Nilai & Pembahasan Guru */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bobot Nilai:
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="10"
                    value={formSoal.bobot || 1.0}
                    onChange={(e) => updateFormAndSync(prev => ({ ...prev, bobot: parseFloat(e.target.value) || 1.0 }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-bold"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pembahasan / Rubrik Guru (Opsional):
                  </label>
                  <textarea
                    rows={2}
                    value={formSoal.pembahasan || ''}
                    onChange={(e) => updateFormAndSync(prev => ({ ...prev, pembahasan: e.target.value }))}
                    placeholder="Penjelasan langkah penyelesaian untuk siswa setelah ujian..."
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
              </div>

              {/* Tombol Selesai Edit (Kembali ke Tampilan Rapi) */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewMode('render')}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  <span>Selesai Edit & Lihat Tampilan Rapi</span>
                </button>
              </div>
            </div>
          )}

          {/* TOMBOL UPDATE SOAL */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              onClick={handleApplyUpdateSoal}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Update Soal</span>
            </button>
          </div>
        </section>

        {/* KOLOM KANAN (PANEL DAFTAR SOAL RINGKAS) */}
        <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4 flex flex-col">
          {/* Header Panel Kanan: Tambah Soal & Hapus Soal */}
          <div className="pb-3 border-b border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Daftar Butir Soal
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  {questions.length} Butir Soal Terdaftar
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddNewQuestion}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                  title="Tambah Butir Soal Baru"
                >
                  <span className="text-sm leading-none">+</span>
                  <span>Tambah Soal</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteActiveQuestion}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Hapus Soal Aktif"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tombol Import Word & Unduh Template & Bank Soal */}
            <div className={`grid ${onOpenBankSoalPicker ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 pt-0.5`}>
              <button
                type="button"
                onClick={() => docxImportInputRef.current?.click()}
                disabled={docxImporting}
                className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-emerald-200 disabled:opacity-50"
                title="Impor soal dari file Word (.docx)"
              >
                {docxImporting ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span>Proses...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Word</span>
                  </>
                )}
              </button>

              {onOpenBankSoalPicker && (
                <button
                  type="button"
                  onClick={onOpenBankSoalPicker}
                  className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-indigo-200"
                  title="Pilih dan masukkan soal dari Bank Soal"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>Bank Soal</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-slate-200"
                title="Unduh contoh template naskah soal Word"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Template</span>
              </button>
              <input
                ref={docxImportInputRef}
                type="file"
                accept=".docx,.doc"
                onChange={handleImportDocx}
                className="hidden"
              />
            </div>
          </div>

          {/* Grid / List Soal Ringkas */}
          <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
            {questions.map((q, idx) => {
              const isActive = idx === currentIndex
              const currentQ = isActive ? formSoal : q
              const rawKey = currentQ.kunci_jawaban
              const hasKey = rawKey && String(rawKey).trim() !== ''

              let badgeTipe = 'PG'
              if (currentQ.tipe_soal === 'pg_kompleks') badgeTipe = 'PGK'
              if (currentQ.tipe_soal === 'benar_salah') badgeTipe = 'B/S'
              if (currentQ.tipe_soal === 'menjodohkan') badgeTipe = 'Jodoh'
              if (currentQ.tipe_soal === 'isian') badgeTipe = 'Isian'

              // Ringkasan tampilan kunci
              let displayKey = ''
              if (hasKey) {
                try {
                  if (typeof rawKey === 'string' && rawKey.startsWith('[')) {
                    displayKey = JSON.parse(rawKey).join(', ')
                  } else {
                    displayKey = String(rawKey)
                  }
                } catch {
                  displayKey = String(rawKey)
                }
              }

              return (
                <div
                  key={q.id || idx}
                  onClick={() => handleSelectSoal(idx)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isActive
                      ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center shrink-0 transition-all ${
                    isActive ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 border border-slate-200/80'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200/60">
                        {badgeTipe}
                      </span>
                      {hasKey ? (
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1 shrink-0" title={`Kunci: ${displayKey}`}>
                          <span>✓ Kunci:</span>
                          <span className="max-w-[70px] truncate inline-block font-extrabold">{displayKey}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200/60 shrink-0">
                          Kunci Kosong
                        </span>
                      )}
                    </div>
                    <div
                      className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-medium break-words"
                      dangerouslySetInnerHTML={{ __html: renderQuestionSummary(currentQ.pertanyaan) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </main>

      {/* MODAL PRATINJAU SISWA (DESKTOP / MOBILE TOGGLE) */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] flex flex-col">
            {/* Header Modal Pratinjau */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  Mode Pratinjau Penilaian Siswa
                </span>
                <h3 className="text-base font-bold text-slate-800">
                  {sesiInfo.judul} ({sesiInfo.mapel})
                </h3>
              </div>

              {/* Toggle Desktop vs Mobile */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      previewDevice === 'desktop' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      previewDevice === 'mobile' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    Mobile
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Isi Pratinjau Soal Aktif */}
            <div className={`flex-1 overflow-y-auto p-4 bg-slate-50 rounded-2xl mx-auto w-full transition-all ${
              previewDevice === 'mobile' ? 'max-w-sm border-2 border-slate-800 rounded-3xl shadow-xl' : 'max-w-2xl'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-indigo-600">Soal Nomor {currentIndex + 1} dari {questions.length}</span>
                  <span>Bobot: {formSoal.bobot || 1.0} Poin</span>
                </div>

                <div 
                  className="text-sm md:text-base text-slate-800 leading-relaxed font-sans"
                  dangerouslySetInnerHTML={{ __html: renderMathContent(formSoal.pertanyaan) }}
                />

                {/* Opsi Pratinjau */}
                <div className="space-y-2 pt-2">
                  {(formSoal.opsi || []).map((opt, idx) => {
                    const optKey = (typeof opt === 'object' && opt ? (opt.key || opt.label) : null) || String.fromCharCode(65 + idx)
                    const optText = typeof opt === 'string' ? opt : (opt?.text !== undefined ? opt.text : (opt?.teks !== undefined ? opt.teks : (opt?.content || '-')))
                    const isKey = (() => {
                      if (!formSoal.kunci_jawaban) return false
                      if (typeof formSoal.kunci_jawaban === 'string' && formSoal.kunci_jawaban.startsWith('[')) {
                        try {
                          const parsed = JSON.parse(formSoal.kunci_jawaban)
                          return Array.isArray(parsed) && parsed.includes(optKey)
                        } catch {
                          return false
                        }
                      }
                      return String(formSoal.kunci_jawaban).trim().toUpperCase() === optKey ||
                        String(formSoal.kunci_jawaban).trim().toLowerCase() === String(optText).trim().toLowerCase()
                    })()
                    return (
                      <div
                        key={optKey}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2.5 transition-all ${
                          isKey
                            ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 ring-1 ring-emerald-300 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                            isKey ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {optKey}
                          </span>
                          <span
                            className="truncate"
                            dangerouslySetInnerHTML={{ __html: renderMathContent(optText) }}
                          />
                        </div>
                        {isKey && (
                          <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            Kunci
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL STUDIO EQUATION / RUMUS MATEMATIKA VISUAL (GAYA MICROSOFT WORD)     */}
      {/* ========================================================================= */}
      {equationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-violet-600 text-white font-black text-base flex items-center justify-center shadow-xs">
                  ∑
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">
                      {editingEqItem ? 'Edit Equation Visual (Gaya MS Word)' : 'Studio Equation Visual (Gaya MS Word)'}
                    </h3>
                    {editingEqItem && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                        Mode Edit Rumus
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Isi kotak-kotak rumus langsung seperti di Microsoft Word tanpa perlu kode LaTeX
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEqItem(null)
                  setEquationModalOpen(false)
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {/* Pilihan Target & Daftar Rumus yang Ada di Target Tersebut */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lokasi Rumus:
                  </label>
                  <select
                    value={eqTarget}
                    onChange={(e) => {
                      const newTarget = e.target.value
                      const list = extractEquationsFromField(getTargetFieldText(newTarget))
                      openEquationStudio(newTarget, list[0] || null, eqType)
                    }}
                    className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
                  >
                    <option value="pertanyaan">📝 Isi Pertanyaan Soal</option>
                    {(formSoal.opsi || []).map((opt, idx) => {
                      const key = opt.key || String.fromCharCode(65 + idx)
                      return (
                        <option key={key} value={`opsi_${key}`}>
                          🔘 Pilihan Jawaban ({key})
                        </option>
                      )
                    })}
                    <option value="pembahasan">💡 Pembahasan / Solusi</option>
                  </select>
                </div>

                {/* Pemilih Rumus jika di bagian tersebut sudah ada rumus */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Rumus yang Diedit / Buat Baru:
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const existingList = extractEquationsFromField(getTargetFieldText(eqTarget))
                      return (
                        <>
                          {existingList.map((item) => {
                            const isSelected = editingEqItem && editingEqItem.start === item.start
                            return (
                              <button
                                key={item.index}
                                type="button"
                                onClick={() => openEquationStudio(eqTarget, item, 'visual_word')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                  isSelected
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300'
                                }`}
                                title="Klik untuk mengedit rumus ini"
                              >
                                <span>Rumus #{item.index + 1}:</span>
                                <span className="font-mono">{item.friendlyLabel.slice(0, 14)}</span>
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEqItem(null)
                              setVisualBlocks([{ id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '12' }])
                              setEqFriendlyText('√12')
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              !editingEqItem
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            + Rumus Baru
                          </button>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Tabs Mode Editor Rumus */}
              <div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'visual_word', label: 'Visual Word', icon: '⊞' },
                    { id: 'ketik_mudah', label: 'Ketik Mudah', icon: '√12' },
                    { id: 'akar', label: 'Akar', icon: '√x' },
                    { id: 'pecahan', label: 'Pecahan', icon: 'a/b' },
                    { id: 'pangkat', label: 'Pangkat', icon: 'xⁿ' },
                    { id: 'subskrip', label: 'Indeks', icon: 'x₁' },
                    { id: 'simbol', label: 'Simbol', icon: '± ×' },
                    { id: 'bebas', label: 'LaTeX', icon: '{ }' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        // Sinkronkan antar tab sebelum berpindah
                        const currentLatex = getGeneratedLatex()
                        if (tab.id === 'visual_word' && eqType !== 'visual_word') {
                          setVisualBlocks(parseLatexToVisualBlocks(currentLatex))
                        } else if (tab.id === 'ketik_mudah' && eqType !== 'ketik_mudah') {
                          setEqFriendlyText(latexToFriendlyMath(currentLatex))
                        } else if (tab.id === 'bebas' && eqType !== 'bebas') {
                          setEqBebas(currentLatex)
                        }
                        setEqType(tab.id)
                      }}
                      className={`px-1.5 py-1.5 rounded-lg text-xs font-bold flex flex-col items-center gap-0.5 transition-all cursor-pointer ${
                        eqType === tab.id
                          ? 'bg-white text-violet-700 shadow-xs ring-1 ring-violet-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="font-mono text-xs font-extrabold">{tab.icon}</span>
                      <span className="text-[10px] leading-tight text-center">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ================================================================= */}
              {/* MODE 1: VISUAL WORD (KOTAK INTERAKTIF SEPERTI MICROSOFT WORD)     */}
              {/* ================================================================= */}
              {eqType === 'visual_word' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <span>⊞ Kanvas Kotak Rumus (Klik &amp; Ketik Langsung di Dalam Kotak):</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisualBlocks([{ id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '' }])}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      Reset Kanvas
                    </button>
                  </div>

                  {/* Area Kanvas Kotak-Kotak Rumus Visual */}
                  <div className="p-4 bg-white border-2 border-violet-200 rounded-2xl min-h-[96px] flex items-center flex-wrap gap-3 shadow-inner">
                    {visualBlocks.map((blk, bIdx) => (
                      <div
                        key={blk.id || bIdx}
                        className="relative group bg-slate-50/80 hover:bg-violet-50/40 border border-slate-200 hover:border-violet-300 rounded-xl p-2.5 flex items-center transition-all"
                      >
                        {/* Tombol Hapus Blok (muncul jika lebih dari 1 blok) */}
                        {visualBlocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setVisualBlocks(prev => prev.filter((_, i) => i !== bIdx))}
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
                            title="Hapus bagian ini"
                          >
                            ×
                          </button>
                        )}

                        {/* 1. BLOK BENTUK AKAR VISUAL: [koef] ⁿ√[isi] */}
                        {blk.type === 'akar' && (
                          <div className="flex items-center gap-1">
                            {/* Input Angka Depan / Koefisien (misal 9 pada 9√3) */}
                            <input
                              type="text"
                              value={blk.koef || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, koef: val } : it))
                              }}
                              placeholder="koef"
                              title="Angka di depan akar (opsional, misal 9 untuk 9√3, atau kosongkan)"
                              className="w-11 text-center text-xs font-bold px-1 py-1.5 bg-white border border-dashed border-slate-300 rounded-lg focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-800"
                            />
                            {/* Struktur Simbol Akar & Garis Atap Akar */}
                            <div className="flex items-end">
                              <div className="flex flex-col items-end mr-0.5">
                                {/* Derajat Akar (pangkat akar kecil di kiri atas) */}
                                <input
                                  type="text"
                                  value={blk.deg || ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, deg: val } : it))
                                  }}
                                  placeholder="²"
                                  title="Pangkat/derajat akar (kosongkan untuk akar kuadrat, isi 3 untuk ∛)"
                                  className="w-6 h-5 text-center text-[10px] font-bold bg-white border border-dashed border-slate-300 rounded focus:outline-none focus:border-violet-500 text-slate-600 -mb-1"
                                />
                                <span className="text-2xl font-serif leading-none text-slate-800 select-none font-bold">
                                  √
                                </span>
                              </div>
                              {/* Kotak Isi di Bawah Garis Atap Akar */}
                              <div className="border-t-2 border-slate-800 pt-1 pl-0.5">
                                <input
                                  type="text"
                                  value={blk.isi || ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, isi: val } : it))
                                  }}
                                  placeholder="isi akar"
                                  title="Angka atau aljabar di dalam akar (misal 12, 3, atau x+1)"
                                  className="w-16 sm:w-20 text-center text-xs font-bold px-2 py-1 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 2. BLOK PECAHAN VISUAL: [Atas] / [Bawah] */}
                        {blk.type === 'pecahan' && (
                          <div className="flex flex-col items-center min-w-[76px]">
                            <input
                              type="text"
                              value={blk.pembilang || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, pembilang: val } : it))
                              }}
                              placeholder="atas"
                              title="Pembilang (bagian atas pecahan)"
                              className="w-20 text-center text-xs font-bold px-2 py-1 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                            />
                            <div className="w-full h-0.5 bg-slate-800 my-1 rounded-full" />
                            <input
                              type="text"
                              value={blk.penyebut || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, penyebut: val } : it))
                              }}
                              placeholder="bawah"
                              title="Penyebut (bagian bawah pecahan)"
                              className="w-20 text-center text-xs font-bold px-2 py-1 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                            />
                          </div>
                        )}

                        {/* 3. BLOK PANGKAT VISUAL: [Basis] ^ [Pangkat] */}
                        {blk.type === 'pangkat' && (
                          <div className="flex items-start gap-0.5 pt-2">
                            <input
                              type="text"
                              value={blk.basis || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, basis: val } : it))
                              }}
                              placeholder="basis"
                              title="Bilangan pokok / basis (misal 8, 16, x, atau (1/2))"
                              className="w-14 text-center text-xs font-bold px-1.5 py-1.5 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900 mt-1"
                            />
                            <input
                              type="text"
                              value={blk.pangkat || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, pangkat: val } : it))
                              }}
                              placeholder="pangkat"
                              title="Pangkat / eksponen (misal x+2, 2x-1, atau 2)"
                              className="w-14 text-center text-[11px] font-extrabold px-1.5 py-1 bg-violet-50 border border-violet-400 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 text-violet-900 -mt-2 shadow-2xs"
                            />
                          </div>
                        )}

                        {/* 4. BLOK SUBSKRIP / INDEKS VISUAL: [Var] _ [Indeks] */}
                        {blk.type === 'subskrip' && (
                          <div className="flex items-end gap-0.5 pb-1">
                            <input
                              type="text"
                              value={blk.variabel || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, variabel: val } : it))
                              }}
                              placeholder="var"
                              className="w-12 text-center text-xs font-bold px-1.5 py-1.5 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                            />
                            <input
                              type="text"
                              value={blk.indeks || ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, indeks: val } : it))
                              }}
                              placeholder="idx"
                              className="w-10 text-center text-[10px] font-extrabold px-1 py-0.5 bg-violet-50 border border-violet-400 rounded focus:outline-none focus:ring-2 focus:ring-violet-500 text-violet-900 -mb-1"
                            />
                          </div>
                        )}

                        {/* 5. BLOK TANDA OPERASI (+, -, =, ×, ÷, ±) */}
                        {blk.type === 'op' && (
                          <select
                            value={blk.val || '+'}
                            onChange={(e) => {
                              const val = e.target.value
                              setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, val } : it))
                            }}
                            title="Pilih tanda operasi matematika"
                            className="text-sm font-black px-2 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="+">+</option>
                            <option value="-">−</option>
                            <option value="=">=</option>
                            <option value="×">×</option>
                            <option value="÷">÷</option>
                            <option value="±">±</option>
                            <option value="≤">≤</option>
                            <option value="≥">≥</option>
                            <option value="≠">≠</option>
                            <option value="≈">≈</option>
                            <option value="·">·</option>
                          </select>
                        )}

                        {/* 6. BLOK ANGKA / TEKS / VARIABEL BIASA */}
                        {blk.type === 'teks' && (
                          <input
                            type="text"
                            value={blk.val || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              setVisualBlocks(prev => prev.map((it, i) => i === bIdx ? { ...it, val } : it))
                            }}
                            placeholder="angka/x"
                            className="w-20 text-center text-xs font-bold px-2 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Ribbon Bar: Tambah Bagian Baru ke Kanvas Rumus (Persis Ribbon MS Word) */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 block">
                      ➕ Tambah Bagian ke Rumus Ini (Bisa Gabung Banyak Akar / Pangkat / Pecahan):
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          ...(prev.length > 0 && prev[prev.length - 1].type !== 'op' ? [{ id: nextBlockId(), type: 'op', val: '+' }] : []),
                          { id: nextBlockId(), type: 'akar', koef: '', deg: '', isi: '3' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 border border-slate-200 hover:border-violet-300 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span className="font-serif text-sm font-black text-violet-700">√</span>
                        <span>+ Bentuk Akar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          ...(prev.length > 0 && prev[prev.length - 1].type !== 'op' ? [{ id: nextBlockId(), type: 'op', val: '+' }] : []),
                          { id: nextBlockId(), type: 'pecahan', pembilang: 'a', penyebut: 'b' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 border border-slate-200 hover:border-violet-300 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span className="font-mono text-xs font-black text-violet-700">a/b</span>
                        <span>+ Pecahan</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          ...(prev.length > 0 && prev[prev.length - 1].type !== 'op' ? [{ id: nextBlockId(), type: 'op', val: '=' }] : []),
                          { id: nextBlockId(), type: 'pangkat', basis: 'x', pangkat: '2' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 border border-slate-200 hover:border-violet-300 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span className="font-mono text-xs font-black text-violet-700">xⁿ</span>
                        <span>+ Pangkat</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          { id: nextBlockId(), type: 'op', val: '+' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-slate-800 border border-slate-200 hover:border-indigo-300 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span className="font-black text-indigo-700">+ − =</span>
                        <span>+ Tanda Operasi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          { id: nextBlockId(), type: 'teks', val: '10' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span>+ Angka / Variabel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVisualBlocks(prev => [
                          ...prev,
                          { id: nextBlockId(), type: 'subskrip', variabel: 'x', indeks: '1' }
                        ])}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 border border-slate-200 hover:border-violet-300 text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                      >
                        <span className="font-mono text-xs font-black text-violet-700">x₁</span>
                        <span>+ Indeks</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* MODE 2: KETIK MUDAH (GAYA KALKULATOR / TANPA KODE LATEX)          */}
              {/* ================================================================= */}
              {eqType === 'ketik_mudah' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ketik Rumus dengan Simbol Biasa (Tanpa Perlu Kode \sqrt atau \frac):
                    </label>
                    <input
                      type="text"
                      value={eqFriendlyText}
                      onChange={(e) => setEqFriendlyText(e.target.value)}
                      placeholder="Contoh: √12 + √27 - √48  atau  9√3  atau  8^(x+2) = 16^(x-1)"
                      className="w-full text-sm font-bold px-3.5 py-2.5 bg-white border-2 border-violet-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Contoh ketikan: <strong className="text-slate-700">√12 + √27 - √48</strong>, <strong className="text-slate-700">9√3</strong>, <strong className="text-slate-700">∛27</strong>, <strong className="text-slate-700">8^(x+2) = 16^(x-1)</strong>, <strong className="text-slate-700">x² + 2x + 1 = 0</strong>
                    </p>
                  </div>

                  {/* Papan Tombol Simbol Matematika Cepat */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                      Klik Tombol untuk Menyisipkan Simbol:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { insert: '√', label: '√ (Akar)' },
                        { insert: '√()', label: '√(x+1)' },
                        { insert: '∛', label: '∛ (Akar 3)' },
                        { insert: '∜', label: '∜ (Akar 4)' },
                        { insert: '²', label: 'x²' },
                        { insert: '³', label: 'x³' },
                        { insert: '^()', label: 'x^(n)' },
                        { insert: ' × ', label: '×' },
                        { insert: ' ÷ ', label: '÷' },
                        { insert: ' ± ', label: '±' },
                        { insert: ' ≤ ', label: '≤' },
                        { insert: ' ≥ ', label: '≥' },
                        { insert: ' ≠ ', label: '≠' },
                        { insert: '°', label: '° (Derajat)' },
                        { insert: 'π', label: 'π' },
                        { insert: '∠', label: '∠ (Sudut)' },
                        { insert: '△', label: '△ (Segitiga)' },
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => setEqFriendlyText(prev => `${prev}${btn.insert}`)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-xs font-bold text-slate-800 shadow-2xs transition-all cursor-pointer"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Form Input Sesuai Tipe Rumus Tunggal (Akar, Pecahan, Pangkat, Subskrip, Simbol, LaTeX) */}
              {!['visual_word', 'ketik_mudah'].includes(eqType) && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  {/* 1. PECAHAN */}
                  {eqType === 'pecahan' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Pembilang (Bagian Atas):
                        </label>
                        <input
                          type="text"
                          value={eqPembilang}
                          onChange={(e) => setEqPembilang(e.target.value)}
                          placeholder="Contoh: a^6 b^3 atau 2x + 1 atau √12"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                      <div className="border-t border-slate-200 my-1" />
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Penyebut (Bagian Bawah):
                        </label>
                        <input
                          type="text"
                          value={eqPenyebut}
                          onChange={(e) => setEqPenyebut(e.target.value)}
                          placeholder="Contoh: a^2 b^5 atau 3"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* 2. PANGKAT */}
                  {eqType === 'pangkat' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Basis / Bilangan Pokok:
                        </label>
                        <input
                          type="text"
                          value={eqBasis}
                          onChange={(e) => setEqBasis(e.target.value)}
                          placeholder="Contoh: 8 atau (1/2) atau 2x"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Pangkat / Eksponen:
                        </label>
                        <input
                          type="text"
                          value={eqPangkat}
                          onChange={(e) => setEqPangkat(e.target.value)}
                          placeholder="Contoh: x+2 atau -3"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* 3. AKAR */}
                  {eqType === 'akar' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Angka Depan / Koefisien:
                        </label>
                        <input
                          type="text"
                          value={eqKoefAkar}
                          onChange={(e) => setEqKoefAkar(e.target.value)}
                          placeholder="Opsional (misal: 9 pada 9√3)"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Nilai di Dalam Akar:
                        </label>
                        <input
                          type="text"
                          value={eqDalamAkar}
                          onChange={(e) => setEqDalamAkar(e.target.value)}
                          placeholder="Contoh: 12 atau 3 atau b^2 - 4ac"
                          className="w-full text-xs px-3 py-2 bg-white border border-violet-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-900 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Derajat Akar (Opsional):
                        </label>
                        <input
                          type="text"
                          value={eqDerajatAkar}
                          onChange={(e) => setEqDerajatAkar(e.target.value)}
                          placeholder="Kosong = √, isi 3 = ∛"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* 4. SUBSKRIP */}
                  {eqType === 'subskrip' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Variabel / Teks:
                        </label>
                        <input
                          type="text"
                          value={eqSubskripVar}
                          onChange={(e) => setEqSubskripVar(e.target.value)}
                          placeholder="Contoh: x atau U"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Indeks / Angka Bawah:
                        </label>
                        <input
                          type="text"
                          value={eqSubskripVal}
                          onChange={(e) => setEqSubskripVal(e.target.value)}
                          placeholder="Contoh: 1 atau n"
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* 5. SIMBOL */}
                  {eqType === 'simbol' && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-600 block">
                        Klik salah satu simbol untuk menyalin ke rumus:
                      </span>
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                        {[
                          { sym: '\\times', label: '×' },
                          { sym: '\\div', label: '÷' },
                          { sym: '\\pm', label: '±' },
                          { sym: '\\le', label: '≤' },
                          { sym: '\\ge', label: '≥' },
                          { sym: '\\neq', label: '≠' },
                          { sym: '\\approx', label: '≈' },
                          { sym: '\\pi', label: 'π' },
                          { sym: '\\alpha', label: 'α' },
                          { sym: '\\beta', label: 'β' },
                          { sym: '\\theta', label: 'θ' },
                          { sym: '\\Delta', label: 'Δ' },
                          { sym: '\\infty', label: '∞' },
                          { sym: '^{\\circ}', label: '°' },
                          { sym: '\\cdot', label: '·' },
                          { sym: '\\sum', label: '∑' },
                        ].map(item => (
                          <button
                            key={item.sym}
                            type="button"
                            onClick={() => setEqBebas(prev => (prev ? `${prev} ${item.sym}` : item.sym))}
                            className="h-9 rounded-lg bg-white border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-slate-800 font-bold text-sm transition-all flex items-center justify-center shadow-2xs"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <div className="pt-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Rumus Gabungan:
                        </label>
                        <input
                          type="text"
                          value={eqBebas}
                          onChange={(e) => setEqBebas(e.target.value)}
                          placeholder="Rumus simbol akan tersusun di sini..."
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* 6. BEBAS */}
                  {eqType === 'bebas' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Ketikkan Formula LaTeX / Matematika:
                      </label>
                      <input
                        type="text"
                        value={eqBebas}
                        onChange={(e) => setEqBebas(e.target.value)}
                        placeholder="Contoh: \sqrt{12} + \sqrt{27} - \sqrt{48} atau 9\sqrt{3}"
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Live Preview Rumus */}
              <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-violet-900">
                  <span>👁️ Pratinjau Hasil Equation:</span>
                  <span className="font-mono text-[11px] text-violet-600 bg-white px-2 py-0.5 rounded border border-violet-200 font-semibold">
                    {latexToFriendlyMath(getGeneratedLatex()) || '...'}
                  </span>
                </div>
                <div
                  className="p-4 bg-white rounded-xl border border-violet-200 shadow-2xs text-center min-h-[56px] flex items-center justify-center text-base md:text-lg text-slate-900"
                  dangerouslySetInnerHTML={{ __html: renderMathContent(`$${getGeneratedLatex() || 'a'}$`) }}
                />
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setEditingEqItem(null)
                  setEquationModalOpen(false)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Batal
              </button>
              <div className="flex items-center gap-2">
                {editingEqItem && (
                  <button
                    type="button"
                    onClick={() => handleInsertEquation(true)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold border border-violet-300 bg-white hover:bg-violet-50 text-violet-700 transition-all"
                    title="Jangan timpa rumus lama, tetapi tambahkan sebagai rumus baru di akhir"
                  >
                    + Sisipkan Sebagai Baru
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleInsertEquation(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={editingEqItem ? "M5 13l4 4L19 7" : "M12 4v16m8-8H4"} />
                  </svg>
                  <span>{editingEqItem ? 'Simpan Perubahan Rumus' : 'Sisipkan Rumus ke Soal'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Professional Confirm Modal */}
      {ConfirmModalComponent}

      {/* Modal Peringatan Soal Duplikat */}
      <CbtDuplicateWarningModal
        isOpen={duplicateModalState.isOpen}
        duplicates={duplicateModalState.duplicates}
        totalUploaded={duplicateModalState.totalUploaded}
        uniqueCount={duplicateModalState.uniqueCount}
        onSkipDuplicates={duplicateModalState.onSkipDuplicates}
        onKeepAll={duplicateModalState.onKeepAll}
        onCancel={duplicateModalState.onCancel}
        context="editor"
      />

      {/* Professional Toast Notification */}
      {ToastComponent}
    </div>
  )
}

