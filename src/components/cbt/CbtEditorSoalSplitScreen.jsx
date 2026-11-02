import React, { useState, useEffect, useRef, useCallback } from 'react'
import katex from 'katex'
import { renderFormattedMath } from './CbtSoalRenderer'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'
import { parseDocxFile, validateQuestionsList } from '../../utils/cbt/cbtDocxParser'
import { downloadSampleDocxTemplate } from '../../utils/cbt/cbtDocxTemplateHelper'
import CbtDuplicateWarningModal from './CbtDuplicateWarningModal'

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

  // State Modal Equation Builder (Pembuat Rumus Visual)
  const [equationModalOpen, setEquationModalOpen] = useState(false)
  const [eqType, setEqType] = useState('pecahan') // 'pecahan' | 'pangkat' | 'akar' | 'subskrip' | 'simbol' | 'bebas'
  const [eqTarget, setEqTarget] = useState('pertanyaan') // 'pertanyaan' | 'opsi_A' | 'opsi_B' | ...
  const [eqPembilang, setEqPembilang] = useState('')
  const [eqPenyebut, setEqPenyebut] = useState('')
  const [eqBasis, setEqBasis] = useState('')
  const [eqPangkat, setEqPangkat] = useState('')
  const [eqDalamAkar, setEqDalamAkar] = useState('')
  const [eqDerajatAkar, setEqDerajatAkar] = useState('')
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

  // Helper generate LaTeX dari state modal equation builder
  const getGeneratedLatex = () => {
    if (eqType === 'pecahan') {
      const p = eqPembilang.trim() || 'a'
      const q = eqPenyebut.trim() || 'b'
      return `\\frac{${p}}{${q}}`
    }
    if (eqType === 'pangkat') {
      const b = eqBasis.trim() || 'x'
      const p = eqPangkat.trim() || '2'
      return `(${b})^{${p}}`
    }
    if (eqType === 'akar') {
      const x = eqDalamAkar.trim() || 'x'
      const n = eqDerajatAkar.trim()
      return n ? `\\sqrt[${n}]{${x}}` : `\\sqrt{${x}}`
    }
    if (eqType === 'subskrip') {
      const v = eqSubskripVar.trim() || 'x'
      const s = eqSubskripVal.trim() || '1'
      return `${v}_{${s}}`
    }
    if (eqType === 'simbol' || eqType === 'bebas') {
      return eqBebas.trim() || 'x'
    }
    return ''
  }

  // Sisipkan rumus dari modal ke target (pertanyaan atau opsi)
  const handleInsertEquation = () => {
    const latex = getGeneratedLatex()
    if (!latex) return

    const formulaWithDollars = `$${latex}$`

    if (eqTarget === 'pertanyaan') {
      const newPertanyaan = formSoal.pertanyaan
        ? `${formSoal.pertanyaan} ${formulaWithDollars}`
        : formulaWithDollars
      updateFormAndSync(prev => ({ ...prev, pertanyaan: newPertanyaan }))
      if (pertanyaanEditorRef.current) {
        pertanyaanEditorRef.current.innerHTML = newPertanyaan.replace(/\n/g, '<br />')
      }
      showToast('Rumus berhasil disisipkan ke pertanyaan.', 'success')
    } else if (eqTarget.startsWith('opsi_')) {
      const targetKey = eqTarget.replace('opsi_', '')
      const newOpsi = (formSoal.opsi || []).map(opt => {
        if (opt.key === targetKey) {
          const newText = opt.text ? `${opt.text} ${formulaWithDollars}` : formulaWithDollars
          return { ...opt, text: newText }
        }
        return opt
      })
      updateFormAndSync(prev => ({ ...prev, opsi: newOpsi }))
      showToast(`Rumus berhasil disisipkan ke Opsi ${targetKey}.`, 'success')
    }

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
                onClick={() => {
                  setEqTarget('pertanyaan')
                  setEquationModalOpen(true)
                }}
                className="px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                title="Buka pembuat rumus matematika & simbol visual"
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
                  <button
                    type="button"
                    onClick={() => setViewMode('edit')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    <span>Edit Pertanyaan</span>
                  </button>
                </div>
                <div
                  onClick={() => setViewMode('edit')}
                  className="w-full text-sm md:text-base p-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs leading-relaxed text-slate-800 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group relative"
                  title="Klik untuk mengedit pertanyaan"
                >
                  <div
                    className="cbt-rendered-content"
                    dangerouslySetInnerHTML={{ __html: renderMathContent(formSoal.pertanyaan || '<span class="text-slate-400 italic">Pertanyaan belum diisi. Klik untuk mulai menulis.</span>') }}
                  />
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-200">
                    Klik untuk edit
                  </div>
                </div>
              </div>

              {/* Pilihan Opsi Ter-render (PG & PG Kompleks) */}
              {(formSoal.tipe_soal === 'pg' || formSoal.tipe_soal === 'pg_kompleks') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Pilihan Jawaban & Kunci Benar:
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Klik tombol huruf untuk menentukan kunci jawaban
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {(formSoal.opsi || []).map((opt, optIdx) => {
                      const optKey = opt.key || String.fromCharCode(65 + optIdx)
                      const isPgChecked = formSoal.tipe_soal === 'pg' 
                        ? formSoal.kunci_jawaban === optKey 
                        : formSoal.kunci_jawaban?.includes(optKey)

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
                              onClick={() => setViewMode('edit')}
                              title="Klik untuk mengedit opsi"
                              dangerouslySetInnerHTML={{ __html: renderMathContent(opt.text || '<span class="text-slate-400 italic">Opsi belum diisi</span>') }}
                            />
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isPgChecked && (
                              <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center gap-1.5 border border-emerald-200">
                                <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                                <span>Kunci Benar</span>
                              </span>
                            )}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Isi Pertanyaan Soal:
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      Rumus: Langsung ketik / Equation Word (tanpa wajib $) • Paste gambar: Ctrl+V
                    </span>
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
                  <span className="text-[10px] font-bold text-slate-500 px-1 uppercase tracking-wider">Sisip Rumus:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\frac{a}{b}')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Sisipkan pecahan aljabar"
                  >
                    \frac{'{a}'}{'{b}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('x^{2}')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Sisipkan pangkat kuadrat"
                  >
                    x²
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('\\sqrt{x}')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Sisipkan akar kuadrat"
                  >
                    √x
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertQuickMath('x_{1}')}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-2xs"
                    title="Sisipkan subskrip / indeks"
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
                    onClick={() => {
                      setEqTarget('pertanyaan')
                      setEquationModalOpen(true)
                    }}
                    className="ml-auto px-2.5 py-1 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <span>➕ Bantuan Visual</span>
                  </button>
                </div>

                <div
                  ref={pertanyaanEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncEditorContent}
                  onPaste={handleEditorPaste}
                  data-placeholder="Ketikkan teks pertanyaan soal di sini... (Ctrl+V untuk paste gambar)"
                  className="cbt-rich-editor w-full text-xs md:text-sm p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 leading-relaxed font-sans"
                />

                {/* Live KaTeX / Math / Table Preview if equation / rich content exists */}
                {Boolean(formSoal.pertanyaan && (formSoal.pertanyaan.includes('$') || formSoal.pertanyaan.includes('\\') || formSoal.pertanyaan.includes('<table') || formSoal.pertanyaan.includes('<img') || /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱ]/.test(formSoal.pertanyaan))) && (
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
                                placeholder={`Teks pilihan jawaban ${optKey}...`}
                                className="flex-1 text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEqTarget(`opsi_${optKey}`)
                                  setEquationModalOpen(true)
                                }}
                                className="px-2 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl text-xs font-bold transition-colors"
                                title={`Buat rumus untuk Opsi ${optKey}`}
                              >
                                ∑ Rumus
                              </button>
                            </div>
                            {Boolean(opt.text && (opt.text.includes('$') || opt.text.includes('\\') || /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱ]/.test(opt.text))) && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50/50 rounded-lg border border-indigo-100/70 text-xs text-slate-800">
                                <span className="text-[10px] font-bold text-indigo-500 shrink-0">Pratinjau {optKey}:</span>
                                <div dangerouslySetInnerHTML={{ __html: renderMathContent(opt.text) }} />
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
      {/* MODAL PEMBUAT EQUATION / RUMUS MATEMATIKA VISUAL                          */}
      {/* ========================================================================= */}
      {equationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-violet-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                  ∑
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Pembuat Rumus Matematika & Sains (Equation)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Susun rumus dengan mudah tanpa perlu mengetik kode manual
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEquationModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Pilihan Target Penyisipan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Sisipkan Rumus ke Mana?
                </label>
                <select
                  value={eqTarget}
                  onChange={(e) => setEqTarget(e.target.value)}
                  className="w-full text-xs font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-800"
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
                </select>
              </div>

              {/* Tabs Tipe Rumus */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Format Rumus:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'pecahan', label: 'Pecahan', icon: 'a/b' },
                    { id: 'pangkat', label: 'Pangkat', icon: 'xⁿ' },
                    { id: 'akar', label: 'Akar', icon: '√x' },
                    { id: 'subskrip', label: 'Indeks', icon: 'x₁' },
                    { id: 'simbol', label: 'Simbol', icon: '± ×' },
                    { id: 'bebas', label: 'Bebas', icon: 'LaTeX' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEqType(tab.id)}
                      className={`px-2 py-2 rounded-lg text-xs font-bold flex flex-col items-center gap-0.5 transition-all ${
                        eqType === tab.id
                          ? 'bg-white text-violet-700 shadow-xs ring-1 ring-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <span className="font-mono text-xs">{tab.icon}</span>
                      <span className="text-[10px]">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Input Sesuai Tipe Rumus */}
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
                        placeholder="Contoh: a^6 b^3 atau 2x + 1"
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
                        placeholder="Contoh: 2x^3 y^-2"
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
                        placeholder="Contoh: 2 atau -3"
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                      />
                    </div>
                  </div>
                )}

                {/* 3. AKAR */}
                {eqType === 'akar' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Derajat Akar (Opsional):
                      </label>
                      <input
                        type="text"
                        value={eqDerajatAkar}
                        onChange={(e) => setEqDerajatAkar(e.target.value)}
                        placeholder="Kosongkan jika akar kuadrat"
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Nilai di Dalam Akar:
                      </label>
                      <input
                        type="text"
                        value={eqDalamAkar}
                        onChange={(e) => setEqDalamAkar(e.target.value)}
                        placeholder="Contoh: b^2 - 4ac atau 16"
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
                        placeholder="Contoh: x atau H"
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
                        placeholder="Contoh: 1 atau 2"
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
                      Ketikkan Formula LaTeX Bebas:
                    </label>
                    <input
                      type="text"
                      value={eqBebas}
                      onChange={(e) => setEqBebas(e.target.value)}
                      placeholder="Contoh: ax^2 + bx + c = 0 atau \frac{1}{2}mv^2"
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* Live Preview Rumus */}
              <div className="p-4 bg-violet-50/70 border border-violet-100 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-violet-800">
                  <span>Pratinjau Hasil Rumus:</span>
                  <span className="font-mono text-[11px] text-violet-500 font-normal">
                    ${getGeneratedLatex() || '...'}$
                  </span>
                </div>
                <div
                  className="p-3 bg-white rounded-lg border border-violet-200 shadow-2xs text-center min-h-[48px] flex items-center justify-center text-sm md:text-base text-slate-900"
                  dangerouslySetInnerHTML={{ __html: renderMathContent(`$${getGeneratedLatex() || 'a'}$`) }}
                />
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEquationModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleInsertEquation}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white transition-all shadow-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                <span>Sisipkan Rumus ke Soal</span>
              </button>
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

