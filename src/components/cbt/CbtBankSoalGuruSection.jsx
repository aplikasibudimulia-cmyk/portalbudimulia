import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../supabaseClient'
import { parseDocxFile, validateQuestionsList } from '../../utils/cbt/cbtDocxParser'
import { renderFormattedMath } from './CbtSoalRenderer'
import CbtEditorSoalSplitScreen from './CbtEditorSoalSplitScreen'
import CbtDuplicateWarningModal from './CbtDuplicateWarningModal'
import { useConfirm } from '../../utils/useConfirm'

// Helper ekstraksi opsi secara aman dari berbagai format data (mencegah munculnya raw JSON string)
const parseQuestionOptions = (rawOpsi) => {
  if (!rawOpsi) return []
  let list = rawOpsi
  if (typeof rawOpsi === 'string') {
    try {
      list = JSON.parse(rawOpsi)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []

  return list.map((op, idx) => {
    const fallbackKey = String.fromCharCode(65 + idx)
    if (op === null || op === undefined) {
      return { key: fallbackKey, text: '', is_kunci: false }
    }
    if (typeof op === 'string') {
      const trimmed = op.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed)
          return {
            key: parsed.key || parsed.label || fallbackKey,
            text: parsed.text !== undefined ? parsed.text : (parsed.teks !== undefined ? parsed.teks : (parsed.content || parsed.pilihan || parsed.val || '')),
            is_kunci: Boolean(parsed.is_kunci || parsed.is_correct)
          }
        } catch {
          return { key: fallbackKey, text: op, is_kunci: false }
        }
      }
      return { key: fallbackKey, text: op, is_kunci: false }
    }
    if (typeof op === 'object') {
      return {
        key: op.key || op.label || fallbackKey,
        text: op.text !== undefined ? op.text : (op.teks !== undefined ? op.teks : (op.content || op.pilihan || op.val || '')),
        is_kunci: Boolean(op.is_kunci || op.is_correct)
      }
    }
    return { key: fallbackKey, text: String(op), is_kunci: false }
  })
}

// Helper ekstraksi kunci jawaban dengan proteksi ganda (cbt_soal_kunci + fallback opsi is_kunci)
const extractKunciJawaban = (q) => {
  if (!q) return ''
  // 1. Relasi cbt_soal_kunci
  if (Array.isArray(q.cbt_soal_kunci) && q.cbt_soal_kunci.length > 0 && q.cbt_soal_kunci[0]?.kunci_jawaban) {
    return q.cbt_soal_kunci[0].kunci_jawaban
  }
  if (q.cbt_soal_kunci && typeof q.cbt_soal_kunci === 'object' && q.cbt_soal_kunci.kunci_jawaban) {
    return q.cbt_soal_kunci.kunci_jawaban
  }
  // 2. Field langsung jika ada
  if (q.kunci_jawaban) {
    return q.kunci_jawaban
  }
  // 3. Fallback cerdas dari opsi yang bertanda is_kunci / is_correct
  const rawOpsi = q.opsi
  if (Array.isArray(rawOpsi) && rawOpsi.length > 0) {
    const parsed = parseQuestionOptions(rawOpsi)
    const kunciOpts = parsed.filter(op => op?.is_kunci)
    if (kunciOpts.length > 0) {
      if (q.tipe_soal === 'pg_kompleks') {
        return JSON.stringify(kunciOpts.map(o => o.key).sort())
      }
      return kunciOpts[0]?.key || ''
    }
  }
  return ''
}

// Helper ekstraksi pembahasan
const extractPembahasan = (q) => {
  if (Array.isArray(q.cbt_soal_kunci) && q.cbt_soal_kunci.length > 0) {
    return q.cbt_soal_kunci[0]?.pembahasan || ''
  }
  if (q.cbt_soal_kunci && typeof q.cbt_soal_kunci === 'object') {
    return q.cbt_soal_kunci.pembahasan || ''
  }
  return q.pembahasan || ''
}

// Helper cek apakah suatu opsi merupakan kunci jawaban
const isOptionMatchKey = (opt, kunci, tipeSoal) => {
  if (!kunci) return false
  const optKey = String(opt.key).trim().toUpperCase()
  const optText = String(opt.text).trim().toLowerCase()

  if (tipeSoal === 'pg_kompleks') {
    let keys = []
    if (Array.isArray(kunci)) {
      keys = kunci
    } else if (typeof kunci === 'string') {
      if (kunci.trim().startsWith('[')) {
        try { keys = JSON.parse(kunci) } catch { keys = [kunci] }
      } else {
        keys = kunci.split(/[,;|]/).map(s => s.trim())
      }
    }
    const upperKeys = keys.map(k => String(k).trim().toUpperCase())
    return upperKeys.includes(optKey)
  }

  // PG Tunggal
  const kStr = String(kunci).trim().toUpperCase()
  if (optKey === kStr) return true
  if (optText && optText === String(kunci).trim().toLowerCase()) return true
  return false
}

// Metadata label & badge tipe soal
const TIPE_SOAL_META = {
  pg: { label: 'Pilihan Ganda', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80' },
  pg_kompleks: { label: 'PG Kompleks', badge: 'bg-purple-50 text-purple-700 border-purple-200/80' },
  benar_salah: { label: 'Benar / Salah', badge: 'bg-amber-50 text-amber-700 border-amber-200/80' },
  menjodohkan: { label: 'Menjodohkan', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80' },
  isian: { label: 'Isian Singkat', badge: 'bg-sky-50 text-sky-700 border-sky-200/80' },
  uraian: { label: 'Uraian (Essay)', badge: 'bg-rose-50 text-rose-700 border-rose-200/80' }
}

export default function CbtBankSoalGuruSection({ session }) {
  const [loading, setLoading] = useState(true)
  const [bankList, setBankList] = useState([])
  const [selectedBank, setSelectedBank] = useState(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewQuestions, setPreviewQuestions] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSearch, setPreviewSearch] = useState('')
  const [previewFilterType, setPreviewFilterType] = useState('all')
  const [showAnswerKey, setShowAnswerKey] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTingkat, setFilterTingkat] = useState('all')

  // State Editor Bank Soal (Split-Screen)
  const [editingBank, setEditingBank] = useState(null)
  const [editingQuestions, setEditingQuestions] = useState([])
  const [savingBank, setSavingBank] = useState(false)
  const [editorPreviewModalOpen, setEditorPreviewModalOpen] = useState(false)

  // Professional Confirmation Modal & Toast
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev))
    }, 3500)
  }, [])

  // State Import Word .docx
  const [showImportModal, setShowImportModal] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [duplicateModalState, setDuplicateModalState] = useState({
    isOpen: false,
    duplicates: [],
    totalUploaded: 0,
    uniqueCount: 0,
    onSkipDuplicates: null,
    onKeepAll: null,
    onCancel: null
  })
  const [metaForm, setMetaForm] = useState({
    judul: '',
    mapel: '',
    tingkat: 7,
    deskripsi: ''
  })
  const [availableMapels] = useState([
    'Matematika', 'IPA', 'IPS', 'Bahasa Indonesia', 'Bahasa Inggris',
    'Pendidikan Agama Katolik', 'PPKn', 'Informatika', 'Seni Budaya', 'PJOK'
  ])

  const isAdmin = session?.role === 'admin' || session?.is_admin

  useEffect(() => {
    fetchBankSoal()
  }, [session])

  const fetchBankSoal = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('cbt_bank_soal')
        .select('*')
        .order('created_at', { ascending: false })

      // Jika guru reguler (bukan admin), filter bank soal miliknya
      const guruId = session?.user?.id || session?.id
      if (guruId && !isAdmin) {
        query = query.eq('guru_id', guruId)
      }

      const { data, error } = await query
      if (error) throw error
      setBankList(data || [])
    } catch (err) {
      console.error('Gagal memuat bank soal:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle Drag & Drop / File Input Word
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.docx')) {
      showToast('Hanya berkas Word berformat .docx yang didukung.', 'error')
      return
    }

    setImportLoading(true)
    setImportResult(null)

    try {
      const parsed = await parseDocxFile(file)
      setImportResult(parsed)
      
      // Auto-populate nama bank soal jika kosong
      if (!metaForm.judul) {
        setMetaForm(prev => ({
          ...prev,
          judul: file.name.replace('.docx', '').replace(/[-_]/g, ' ')
        }))
      }
    } catch (err) {
      showToast('Gagal memproses dokumen Word: ' + err.message, 'error')
    } finally {
      setImportLoading(false)
    }
  }

  // Simpan Bank Soal & Butir Soal ke Supabase
  const handleSaveImportedBank = async (e) => {
    e.preventDefault()
    if (!importResult || importResult.questions.length === 0) {
      showToast('Tidak ada butir soal yang valid ditemukan di berkas Word.', 'error')
      return
    }

    // Pre-flight validation & duplicate check
    const validation = validateQuestionsList(importResult.questions)
    let questionsToSave = importResult.questions

    // 1. Peringatan Soal Duplikat (jika ada yang isinya sama persis)
    if (validation.hasDuplicates) {
      const userChoice = await new Promise(resolve => {
        setDuplicateModalState({
          isOpen: true,
          duplicates: validation.duplicates,
          totalUploaded: importResult.questions.length,
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

      if (userChoice === 'cancel') return

      if (userChoice === 'skip') {
        questionsToSave = validation.uniqueQuestions
        showToast(`Mengabaikan ${validation.duplicatesCount} butir soal duplikat. Melanjutkan simpan ${questionsToSave.length} soal unik.`, 'info')
      }
    }

    // 2. Validasi format selain duplikat
    const nonDuplicateIssues = (validation.issues || validation.errors || []).filter(msg => !msg.toLowerCase().includes('sama persis'))
    if (nonDuplicateIssues.length > 0) {
      const confirmSave = await requestConfirm({
        title: 'Peringatan Format Naskah',
        message: `Ditemukan beberapa catatan pada format naskah:\n• ${nonDuplicateIssues.slice(0, 5).join('\n• ')}${nonDuplicateIssues.length > 5 ? '\n• ...' : ''}\n\nApakah Anda tetap ingin melanjutkan penyimpanan bank soal ini?`,
        confirmLabel: 'Tetap Simpan',
        cancelLabel: 'Batal & Periksa',
        confirmColor: 'indigo',
        icon: 'warning'
      })
      if (!confirmSave) return
    }

    setImportLoading(true)
    try {
      const guruId = session?.user?.id || session?.id
      if (!guruId) throw new Error('ID Pengguna tidak terdeteksi. Silakan muat ulang halaman.')

      // 1. Simpan Header Bank Soal
      const { data: bankData, error: errBank } = await supabase
        .from('cbt_bank_soal')
        .insert({
          guru_id: guruId,
          mapel: metaForm.mapel || 'Umum',
          tingkat: parseInt(metaForm.tingkat, 10),
          judul: metaForm.judul.trim(),
          deskripsi: metaForm.deskripsi.trim() || null,
          total_soal: questionsToSave.length
        })
        .select()
        .single()

      if (errBank) throw errBank

      // 2. Simpan Butir Soal ke cbt_soal & Kunci ke cbt_soal_kunci
      for (const [idx, q] of questionsToSave.entries()) {
        const preparedOpsi = (q.opsi || []).map(opt => ({
          key: opt.key,
          text: opt.text !== undefined ? opt.text : (opt.teks !== undefined ? opt.teks : (opt.content || '')),
          is_kunci: isOptionMatchKey(opt, q.kunci_jawaban, q.tipe_soal)
        }))

        const { data: soalRow, error: errSoal } = await supabase
          .from('cbt_soal')
          .insert({
            bank_soal_id: bankData.id,
            nomor_urut: idx + 1,
            tipe_soal: q.tipe_soal,
            pertanyaan: q.pertanyaan,
            opsi: preparedOpsi,
            bobot: q.bobot || 1.0
          })
          .select()
          .single()

        if (errSoal) throw errSoal

        // Simpan Kunci Jawaban di tabel terpisah cbt_soal_kunci (Isolasi Mutlak)
        if (q.kunci_jawaban) {
          const { error: errKunci } = await supabase
            .from('cbt_soal_kunci')
            .insert({
              soal_id: soalRow.id,
              kunci_jawaban: typeof q.kunci_jawaban === 'object' ? JSON.stringify(q.kunci_jawaban) : String(q.kunci_jawaban),
              pembahasan: q.pembahasan || null
            })

          if (errKunci) console.warn('[CBT] Kunci insert warning:', errKunci.message)
        }
      }

      showToast(`Bank soal "${metaForm.judul}" berhasil disimpan (${questionsToSave.length} butir soal).`)
      setShowImportModal(false)
      setImportResult(null)
      setMetaForm({ judul: '', mapel: '', tingkat: 7, deskripsi: '' })
      fetchBankSoal()
    } catch (err) {
      showToast('Gagal menyimpan bank soal: ' + err.message, 'error')
    } finally {
      setImportLoading(false)
    }
  }


  // Preview Soal di Bank Soal
  const handlePreviewBank = async (bank) => {
    setSelectedBank(bank)
    setShowPreviewModal(true)
    setPreviewLoading(true)
    setPreviewSearch('')
    setPreviewFilterType('all')
    try {
      const { data, error } = await supabase
        .from('cbt_soal')
        .select(`
          id,
          nomor_urut,
          tipe_soal,
          pertanyaan,
          opsi,
          bobot,
          cbt_soal_kunci (
            kunci_jawaban,
            pembahasan
          )
        `)
        .eq('bank_soal_id', bank.id)
        .order('nomor_urut', { ascending: true })

      if (error) throw error
      setPreviewQuestions(data || [])
    } catch (err) {
      console.error('Gagal memuat soal dengan relasi kunci:', err)
      try {
        const { data: fallbackData } = await supabase
          .from('cbt_soal')
          .select('*')
          .eq('bank_soal_id', bank.id)
          .order('nomor_urut', { ascending: true })
        setPreviewQuestions(fallbackData || [])
      } catch (e2) {
        console.error(e2)
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // Buka Editor Split-Screen untuk Bank Soal
  const handleOpenEditBank = async (bank) => {
    if (bank.is_locked) {
      const proceed = await requestConfirm({
        title: 'Bank Soal Sedang Digunakan',
        message: 'Bank soal ini sedang aktif digunakan pada sesi ujian. Perubahan naskah butir soal akan langsung memengaruhi ujian siswa secara realtime. Lanjutkan ke editor?',
        confirmLabel: 'Ya, Buka Editor',
        cancelLabel: 'Batal',
        confirmColor: 'indigo',
        icon: 'warning'
      })
      if (!proceed) return
    }

    try {
      const { data: soalList, error } = await supabase
        .from('cbt_soal')
        .select('*, cbt_soal_kunci(kunci_jawaban, pembahasan)')
        .eq('bank_soal_id', bank.id)
        .order('nomor_urut', { ascending: true })

      if (error) throw error

      const formatted = (soalList || []).map((q, idx) => {
        const parsedOpsi = parseQuestionOptions(q.opsi)
        const extractedKey = extractKunciJawaban({ ...q, opsi: parsedOpsi })
        const extractedPembahasan = extractPembahasan(q)

        return {
          id: q.id || `soal_${idx + 1}`,
          nomor_urut: q.nomor_urut || idx + 1,
          tipe_soal: q.tipe_soal || 'pg',
          pertanyaan: q.pertanyaan || '',
          opsi: parsedOpsi,
          bobot: q.bobot || 1.0,
          kunci_jawaban: extractedKey,
          pembahasan: extractedPembahasan
        }
      })

      // Sediakan minimal 1 butir soal jika bank masih kosong
      if (formatted.length === 0) {
        formatted.push({
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
        })
      }

      setEditingBank(bank)
      setEditingQuestions(formatted)
      setShowPreviewModal(false)
    } catch (err) {
      showToast('Gagal memuat butir soal untuk diedit: ' + err.message, 'error')
    }
  }

  // Simpan Perubahan Butir Soal ke Bank Soal
  const handleSaveEditingBank = async (passedQuestions) => {
    if (!editingBank) return
    setSavingBank(true)
    try {
      const questionsToSave = Array.isArray(passedQuestions) ? passedQuestions : editingQuestions
      if (!questionsToSave || questionsToSave.length === 0) {
        showToast('Naskah bank soal minimal memiliki 1 butir soal.', 'error')
        return
      }

      // 1. Hapus soal lama pada bank ini
      await supabase.from('cbt_soal').delete().eq('bank_soal_id', editingBank.id)

      // 2. Masukkan butir soal baru beserta kuncinya
      let rlsNoticeGiven = false
      for (let i = 0; i < questionsToSave.length; i++) {
        const q = questionsToSave[i]

        // Format opsi dengan menyertakan penanda is_kunci sebagai proteksi berlapis
        const parsedOpsi = parseQuestionOptions(q.opsi)
        const preparedOpsi = parsedOpsi.map(opt => ({
          key: opt.key,
          text: opt.text || '',
          is_kunci: isOptionMatchKey(opt, q.kunci_jawaban, q.tipe_soal)
        }))

        const { data: insertedSoal, error: errQ } = await supabase
          .from('cbt_soal')
          .insert({
            bank_soal_id: editingBank.id,
            nomor_urut: i + 1,
            tipe_soal: q.tipe_soal || 'pg',
            pertanyaan: q.pertanyaan || '',
            opsi: preparedOpsi,
            bobot: q.bobot || 1.0
          })
          .select()
          .single()

        if (errQ) throw errQ

        // Simpan ke tabel cbt_soal_kunci
        if (q.kunci_jawaban || q.pembahasan) {
          const { error: errKunci } = await supabase.from('cbt_soal_kunci').insert({
            soal_id: insertedSoal.id,
            kunci_jawaban: typeof q.kunci_jawaban === 'object' ? JSON.stringify(q.kunci_jawaban) : String(q.kunci_jawaban || ''),
            pembahasan: q.pembahasan || ''
          })
          if (errKunci && !rlsNoticeGiven) {
            console.warn('[CBT] Peringatan simpan cbt_soal_kunci:', errKunci.message)
            rlsNoticeGiven = true
          }
        }
      }

      // 3. Update total_soal di cbt_bank_soal
      await supabase
        .from('cbt_bank_soal')
        .update({
          total_soal: editingQuestions.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingBank.id)

      showToast(`Perubahan naskah soal "${editingBank.judul}" berhasil disimpan (${editingQuestions.length} butir soal).`)
      setEditingBank(null)
      fetchBankSoal()
    } catch (err) {
      showToast('Gagal menyimpan perubahan bank soal: ' + err.message, 'error')
    } finally {
      setSavingBank(false)
    }
  }

  // Konfirmasi Profesional Saat Menutup Editor Bank Soal
  const handleRequestCloseEditor = async () => {
    const confirmed = await requestConfirm({
      title: 'Tutup Editor Bank Soal?',
      message: 'Pastikan seluruh perubahan naskah butir soal sudah Anda simpan sebelum keluar dari editor.',
      confirmLabel: 'Tutup Editor',
      cancelLabel: 'Lanjut Mengedit',
      confirmColor: 'red',
      icon: 'warning'
    })
    if (confirmed) {
      setEditingBank(null)
    }
  }

  // Hapus Bank Soal (Jika belum terkunci sesi aktif)
  const handleDeleteBank = async (bank) => {
    if (bank.is_locked) {
      await requestConfirm({
        title: 'Bank Soal Terkunci',
        message: 'Bank soal ini sedang digunakan dalam sesi ujian aktif dan tidak dapat dihapus.',
        confirmLabel: 'Mengerti',
        cancelLabel: null,
        confirmColor: 'red',
        icon: 'danger'
      })
      return
    }

    const confirmed = await requestConfirm({
      title: 'Hapus Bank Soal?',
      message: `Apakah Anda yakin ingin menghapus bank soal "${bank.judul}" secara permanen? Seluruh naskah butir soal di dalamnya akan terhapus.`,
      confirmLabel: 'Ya, Hapus',
      cancelLabel: 'Batal',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_bank_soal')
        .delete()
        .eq('id', bank.id)

      if (error) throw error
      setBankList(prev => prev.filter(b => b.id !== bank.id))
      showToast('Bank soal berhasil dihapus.')
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error')
    }
  }

  // Duplikasi Bank Soal
  const handleCloneBank = async (bank) => {
    const confirmed = await requestConfirm({
      title: 'Duplikasi Bank Soal?',
      message: `Buat salinan baru dari bank soal "${bank.judul}" beserta seluruh butir soalnya?`,
      confirmLabel: 'Ya, Salin',
      cancelLabel: 'Batal',
      confirmColor: 'indigo',
      icon: 'info'
    })
    if (!confirmed) return

    setLoading(true)
    try {
      const guruId = session?.user?.id || session?.id
      const { data: newBank, error: errBank } = await supabase
        .from('cbt_bank_soal')
        .insert({
          guru_id: guruId,
          mapel: bank.mapel,
          tingkat: bank.tingkat,
          judul: `${bank.judul} (Salinan)`,
          deskripsi: bank.deskripsi,
          total_soal: bank.total_soal
        })
        .select()
        .single()

      if (errBank) throw errBank

      const { data: oldSoalList, error: errOld } = await supabase
        .from('cbt_soal')
        .select('*, cbt_soal_kunci(*)')
        .eq('bank_soal_id', bank.id)

      if (errOld) throw errOld

      for (const item of (oldSoalList || [])) {
        const parsedOpsi = parseQuestionOptions(item.opsi)
        const kunci = extractKunciJawaban({ ...item, opsi: parsedOpsi })
        const pembahasan = extractPembahasan(item)

        const preparedOpsi = parsedOpsi.map(opt => ({
          key: opt.key,
          text: opt.text || '',
          is_kunci: isOptionMatchKey(opt, kunci, item.tipe_soal)
        }))

        const { data: newSoalRow, error: errNewSoal } = await supabase
          .from('cbt_soal')
          .insert({
            bank_soal_id: newBank.id,
            nomor_urut: item.nomor_urut,
            tipe_soal: item.tipe_soal,
            pertanyaan: item.pertanyaan,
            opsi: preparedOpsi,
            bobot: item.bobot
          })
          .select()
          .single()

        if (errNewSoal) throw errNewSoal

        if (kunci || pembahasan) {
          const { error: errKunci } = await supabase.from('cbt_soal_kunci').insert({
            soal_id: newSoalRow.id,
            kunci_jawaban: typeof kunci === 'object' ? JSON.stringify(kunci) : String(kunci || ''),
            pembahasan: pembahasan || null
          })
          if (errKunci) console.warn('[CBT] Clone bank kunci notice:', errKunci.message)
        }
      }

      showToast(`Bank soal berhasil diduplikasi: "${newBank.judul}".`)
      fetchBankSoal()
    } catch (err) {
      showToast('Gagal menduplikasi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const filteredBanks = bankList.filter(b => {
    if (filterTingkat !== 'all' && String(b.tingkat) !== String(filterTingkat)) return false
    if (!searchQuery) return true
    const kw = searchQuery.toLowerCase()
    return (
      (b.judul && b.judul.toLowerCase().includes(kw)) ||
      (b.mapel && b.mapel.toLowerCase().includes(kw)) ||
      (b.deskripsi && b.deskripsi.toLowerCase().includes(kw))
    )
  })

  // Filter butir soal pada modal pratinjau
  const filteredPreviewQuestions = useMemo(() => {
    return previewQuestions.filter(q => {
      if (previewFilterType !== 'all' && q.tipe_soal !== previewFilterType) {
        return false
      }
      if (previewSearch.trim()) {
        const query = previewSearch.toLowerCase()
        const textMatch = q.pertanyaan && q.pertanyaan.toLowerCase().includes(query)
        const options = parseQuestionOptions(q.opsi)
        const optionMatch = options.some(op => op.text && op.text.toLowerCase().includes(query))
        return textMatch || optionMatch
      }
      return true
    })
  }, [previewQuestions, previewFilterType, previewSearch])

  const totalBobotPreview = useMemo(() => {
    return previewQuestions.reduce((acc, q) => acc + (Number(q.bobot) || 1), 0)
  }, [previewQuestions])

  const typeCounts = useMemo(() => {
    const counts = { all: previewQuestions.length }
    for (const q of previewQuestions) {
      counts[q.tipe_soal] = (counts[q.tipe_soal] || 0) + 1
    }
    return counts
  }, [previewQuestions])

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">
                  Bank Soal Asesmen CBT
                </h2>
                {isAdmin && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Akses Administrator
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin 
                  ? 'Unggah berkas Word (.docx), tinjau seluruh bank naskah soal mata pelajaran sekolah, dan kelola butir evaluasi.'
                  : 'Import naskah Word (.docx) secara otomatis, tinjau butir soal, dan siapkan bank soal sebelum diterbitkan ke jadwal ujian.'}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowImportModal(true)}
          className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 self-start md:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Unggah Naskah Word (.docx)</span>
        </button>
      </div>

      {/* Filter & Pencarian Bank Soal */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setFilterTingkat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterTingkat === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Semua Tingkat ({bankList.length})
          </button>
          <button
            onClick={() => setFilterTingkat('7')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterTingkat === '7' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Kelas 7
          </button>
          <button
            onClick={() => setFilterTingkat('8')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterTingkat === '8' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Kelas 8
          </button>
          <button
            onClick={() => setFilterTingkat('9')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterTingkat === '9' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Kelas 9
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari judul atau mata pelajaran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Daftar Kartu Bank Soal */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 space-y-2">
          <div className="animate-spin inline-block text-2xl font-bold">⟳</div>
          <p className="text-xs">Memuat daftar bank soal...</p>
        </div>
      ) : filteredBanks.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-800">
            Belum Ada Bank Soal Ditemukan
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Mulai susun naskah soal dengan mengunggah template Word (.docx). Sistem mengekstrak soal, opsi, dan kunci jawaban secara instan.
          </p>
          <button
            onClick={() => setShowImportModal(true)}
            className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2"
          >
            <span>+</span>
            <span>Unggah Berkas Word Pertama</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBanks.map((bank) => (
            <div
              key={bank.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                    {bank.mapel}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    Kelas {bank.tingkat}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-800 line-clamp-1">
                    {bank.judul}
                  </h3>
                  {bank.deskripsi && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {bank.deskripsi}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-slate-800">{bank.total_soal}</span> Butir Soal
                  </div>
                  <span>•</span>
                  <div>
                    {bank.is_locked ? (
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        Terkunci di Sesi
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold">
                        Siap Digunakan
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handlePreviewBank(bank)}
                  className="py-2 px-2 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  title="Pratinjau Butir Soal"
                >
                  Lihat
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditBank(bank)}
                  className="py-2 px-2 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  title="Buka Editor Naskah Soal"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleCloneBank(bank)}
                  className="py-2 px-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  title="Duplikasi Bank Soal"
                >
                  Salin
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteBank(bank)}
                  disabled={bank.is_locked}
                  className="py-2 px-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-xl text-xs font-bold transition-all text-center disabled:opacity-40 cursor-pointer"
                  title={bank.is_locked ? 'Terkunci karena ada ujian aktif' : 'Hapus Bank Soal'}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Import Word .docx */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Import Naskah Soal Word (.docx)
                </h3>
                <p className="text-xs text-slate-500">
                  Sistem otomatis mendeteksi tag [PG], [PGK], [BS], [JODOH], [ISIAN], dan kunci jawaban.
                </p>
              </div>
              <button 
                onClick={() => setShowImportModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveImportedBank} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Judul Bank Soal:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Asesmen Sumatif IPA - Ekosistem"
                    value={metaForm.judul}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, judul: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tingkat Kelas:
                  </label>
                  <select
                    value={metaForm.tingkat}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, tingkat: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                  >
                    <option value={7}>Kelas 7</option>
                    <option value={8}>Kelas 8</option>
                    <option value={9}>Kelas 9</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mata Pelajaran:
                  </label>
                  <select
                    value={metaForm.mapel}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, mapel: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                    required
                  >
                    <option value="">-- Pilih Mata Pelajaran --</option>
                    {availableMapels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Deskripsi Singkat (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 30 PG + 5 PGK + 5 Isian"
                    value={metaForm.deskripsi}
                    onChange={(e) => setMetaForm(prev => ({ ...prev, deskripsi: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-indigo-400 bg-slate-50/50 transition-colors">
                <input
                  type="file"
                  id="docx-file-input"
                  accept=".docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="docx-file-input" className="cursor-pointer block space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-600 hover:underline">
                      Pilih berkas Word (.docx)
                    </span>
                    <span className="text-xs text-slate-500"> atau seret ke sini</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Mendukung rumus matematika, equation, tabel Benar/Salah, dan opsi pilihan ganda
                  </p>
                </label>
              </div>

              {/* Hasil Parsing */}
              {importLoading && (
                <div className="p-4 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-medium text-center animate-pulse">
                  Menganalisis format naskah soal dan kunci jawaban...
                </div>
              )}

              {importResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>Hasil Ekstraksi Dokumen:</span>
                    <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-md text-[11px]">
                      {importResult.questions.length} Butir Soal Terdeteksi
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800 space-y-1">
                    <p>• Tipe Soal: {Object.entries(importResult.summary || {}).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(', ')}</p>
                    <p>• Rumus matematika &amp; equation berhasil dikonversi ke format KaTeX.</p>
                  </div>

                  {importResult.validation?.hasDuplicates && (
                    <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center justify-between gap-2 text-amber-800 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-1.5 font-bold text-[11px]">
                        <span>⚠️ Terdeteksi {importResult.validation.duplicatesCount} soal duplikat (isi sama persis)</span>
                      </div>
                      <span className="text-[10px] bg-amber-200/80 px-2 py-0.5 rounded text-amber-900 font-semibold">
                        Akan dikonfirmasi saat simpan
                      </span>
                    </div>
                  )}
                </div>
              )}


              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !importResult}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
                >
                  {importLoading ? 'Menyimpan...' : 'Simpan ke Bank Soal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL PRATINJAU BUTIR SOAL PREMIUM                           */}
      {/* ============================================================ */}
      {showPreviewModal && selectedBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in font-sans">
          <div className="bg-slate-50/95 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Header Modal */}
            <div className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase tracking-wider">
                      {selectedBank.mapel}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      Tingkat {selectedBank.tingkat}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      {previewQuestions.length} Soal
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60">
                      Total Bobot: {totalBobotPreview}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate mt-0.5" title={selectedBank.judul}>
                    Pratinjau Bank Soal: {selectedBank.judul}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle Kunci Jawaban */}
                <button
                  type="button"
                  onClick={() => setShowAnswerKey(!showAnswerKey)}
                  className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    showAnswerKey
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                  title={showAnswerKey ? 'Sembunyikan tanda kunci jawaban' : 'Tampilkan tanda kunci jawaban'}
                >
                  <svg className={`w-4 h-4 ${showAnswerKey ? 'text-emerald-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{showAnswerKey ? 'Kunci: Tampil' : 'Kunci: Tutup'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Tutup Pratinjau (Esc)"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter Bar & Quick Search */}
            <div className="bg-white/90 border-b border-slate-200/80 px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setPreviewFilterType('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    previewFilterType === 'all'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  Semua ({previewQuestions.length})
                </button>
                {Object.entries(TIPE_SOAL_META).map(([key, meta]) => {
                  const count = typeCounts[key] || 0
                  if (count === 0) return null
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreviewFilterType(key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        previewFilterType === key
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                      }`}
                    >
                      {meta.label} ({count})
                    </button>
                  )
                })}
              </div>

              <div className="relative min-w-[200px] sm:w-64">
                <input
                  type="text"
                  placeholder="Cari teks butir soal..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Scrollable Question Cards List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {previewLoading ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-medium">Memuat butir soal...</p>
                </div>
              ) : filteredPreviewQuestions.length === 0 ? (
                <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200/80 space-y-2">
                  <p className="text-sm font-semibold text-slate-600">Tidak ada butir soal yang sesuai.</p>
                  <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau filter tipe soal.</p>
                </div>
              ) : (
                filteredPreviewQuestions.map((q, idx) => {
                  const options = parseQuestionOptions(q.opsi)
                  const kunci = extractKunciJawaban(q)
                  const pembahasan = extractPembahasan(q)
                  const meta = TIPE_SOAL_META[q.tipe_soal] || { label: q.tipe_soal?.toUpperCase(), badge: 'bg-slate-100 text-slate-700 border-slate-200' }

                  return (
                    <div
                      key={q.id || idx}
                      className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-shadow space-y-4"
                    >
                      {/* Top Bar Butir Soal */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                            {q.nomor_urut || idx + 1}
                          </span>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60 font-mono">
                            Bobot: {q.bobot || 1.0}
                          </span>
                        </div>
                      </div>

                      {/* Teks Pertanyaan */}
                      <div
                        className="text-slate-900 text-sm md:text-base leading-relaxed break-words font-medium"
                        dangerouslySetInnerHTML={{ __html: renderFormattedMath(q.pertanyaan) }}
                      />

                      {/* Pilihan Ganda / PG Kompleks */}
                      {(q.tipe_soal === 'pg' || q.tipe_soal === 'pg_kompleks' || (!q.tipe_soal && options.length > 0)) && options.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          {options.map((op) => {
                            const isCorrect = isOptionMatchKey(op, kunci, q.tipe_soal)
                            const highlightKey = showAnswerKey && isCorrect

                            return (
                              <div
                                key={op.key}
                                className={`p-3 sm:p-3.5 rounded-xl border text-sm transition-all flex items-start gap-3 ${
                                  highlightKey
                                    ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400/50 shadow-xs'
                                    : 'bg-slate-50/70 border-slate-200/80 text-slate-800 hover:bg-slate-100/60'
                                }`}
                              >
                                <span
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                                    highlightKey
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'bg-white border border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {op.key}
                                </span>
                                <div
                                  className="pt-0.5 leading-relaxed flex-1 break-words text-xs sm:text-sm font-medium"
                                  dangerouslySetInnerHTML={{ __html: renderFormattedMath(op.text) }}
                                />
                                {highlightKey && (
                                  <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md self-center">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Kunci
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Benar / Salah */}
                      {q.tipe_soal === 'benar_salah' && (
                        <div className="grid grid-cols-2 gap-3 pt-1 max-w-xs">
                          {['Benar', 'Salah'].map(val => {
                            const isCorrect = String(kunci).trim().toLowerCase() === val.toLowerCase()
                            const highlight = showAnswerKey && isCorrect
                            return (
                              <div
                                key={val}
                                className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                                  highlight
                                    ? 'bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-400 shadow-xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                              >
                                <span>{val.toUpperCase()}</span>
                                {highlight && <span className="block text-[10px] font-normal opacity-90">✓ Kunci</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Isian Singkat / Uraian / Menjodohkan Kunci */}
                      {(q.tipe_soal === 'isian' || q.tipe_soal === 'uraian' || q.tipe_soal === 'menjodohkan') && showAnswerKey && kunci && (
                        <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-indigo-900 block">
                            🔑 Kunci Jawaban / Kata Kunci:
                          </span>
                          <p className="text-indigo-800 font-medium whitespace-pre-wrap">{kunci}</p>
                        </div>
                      )}

                      {/* Pembahasan / Solusi (Jika ada) */}
                      {pembahasan && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-amber-900 block flex items-center gap-1.5">
                            💡 Pembahasan / Penjelasan:
                          </span>
                          <div
                            className="text-amber-800 leading-relaxed font-medium"
                            dangerouslySetInnerHTML={{ __html: renderFormattedMath(pembahasan) }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Sticky Footer */}
            <div className="bg-white border-t border-slate-200/80 px-6 py-3.5 flex items-center justify-between gap-4 shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                Menampilkan <strong className="text-slate-800">{filteredPreviewQuestions.length}</strong> dari <strong className="text-slate-800">{previewQuestions.length}</strong> butir soal
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEditBank(selectedBank)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Buka Editor Soal untuk Bank Ini"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit Soal di Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Tutup Pratinjau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FULL-SCREEN SPLIT-SCREEN EDITOR SOAL UNTUK BANK SOAL         */}
      {/* ============================================================ */}
      {editingBank && (
        <div className="fixed inset-0 z-[9999] bg-slate-100 flex flex-col overflow-hidden animate-fade-in font-sans">
          {/* Top Bar Editor */}
          <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-8 py-3 shadow-xs flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 min-w-[200px]">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                CBT
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    {editingBank.mapel}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                    Edit Bank Soal (Kelas {editingBank.tingkat})
                  </span>
                </div>
                <h1 className="text-xs md:text-sm font-bold text-slate-800 truncate">
                  {editingBank.judul}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEditingBank}
                disabled={savingBank}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{savingBank ? 'Menyimpan...' : 'Simpan Perubahan Soal'}</span>
              </button>

              <button
                type="button"
                onClick={handleRequestCloseEditor}
                className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                title="Tutup Editor"
              >
                ✕
              </button>
            </div>
          </header>

          {/* Body Editor Soal Split-Screen */}
          <div className="flex-1 overflow-hidden">
            <CbtEditorSoalSplitScreen
              isEmbedded={true}
              sesiInfo={{
                id: editingBank.id,
                bank_soal_id: editingBank.id,
                judul: editingBank.judul,
                mapel: editingBank.mapel,
                tingkat: editingBank.tingkat
              }}
              questions={editingQuestions}
              onUpdateQuestions={setEditingQuestions}
              onSaveDraft={handleSaveEditingBank}
              onPublish={handleSaveEditingBank}
              onBackToInfo={handleRequestCloseEditor}
              onBackToMenuInput={handleRequestCloseEditor}
              previewModalOpen={editorPreviewModalOpen}
              setPreviewModalOpen={setEditorPreviewModalOpen}
              saving={savingBank}
            />
          </div>
        </div>
      )}

      {/* Professional Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Professional Toast Notification */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[999999] animate-slide-down pointer-events-none">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-slate-900/90 text-white shadow-xl backdrop-blur-md border border-slate-700/60 pointer-events-auto text-xs font-semibold">
            {toast.type === 'success' && (
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            {toast.type === 'error' && (
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            )}
            {toast.type === 'info' && (
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal Peringatan Soal Duplikat */}
      <CbtDuplicateWarningModal
        isOpen={duplicateModalState.isOpen}
        duplicates={duplicateModalState.duplicates}
        totalUploaded={duplicateModalState.totalUploaded}
        uniqueCount={duplicateModalState.uniqueCount}
        onSkipDuplicates={duplicateModalState.onSkipDuplicates}
        onKeepAll={duplicateModalState.onKeepAll}
        onCancel={duplicateModalState.onCancel}
        context="bank"
      />
    </div>
  )
}

