import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import { parseDocxFile, validateQuestionsList } from '../../utils/cbt/cbtDocxParser'
import { downloadSampleDocxTemplate } from '../../utils/cbt/cbtDocxTemplateHelper'
import { fetchActiveTahunAjaranClasses, DEFAULT_KELAS_LIST } from '../../utils/cbt/cbtKelasHelper'
import CbtEditorSoalSplitScreen from './CbtEditorSoalSplitScreen'
import CbtPilihBankSoalModal from './CbtPilihBankSoalModal'
import CbtDuplicateWarningModal from './CbtDuplicateWarningModal'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'

const DEFAULT_INSTRUCTION = `1. Berdoalah sebelum mulai mengerjakan soal ujian.
2. Periksa dan bacalah setiap soal dengan teliti sebelum menjawab.
3. Dahulukan menjawab soal-soal yang Anda anggap lebih mudah.
4. Dilarang keras keluar dari aplikasi, membuka tab lain, atau bekerja sama.
5. Periksa kembali seluruh pekerjaan Anda sebelum menekan tombol Selesai & Kumpulkan.`

const parseDateString = (isoStr) => {
  if (!isoStr) return new Date().toISOString().split('T')[0]
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return String(isoStr).split('T')[0].split(' ')[0]
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return String(isoStr).split('T')[0].split(' ')[0]
  }
}

const parseTimeString = (isoStr, fallback = '08:00') => {
  if (!isoStr) return fallback
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return fallback
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  } catch {
    return fallback
  }
}

const buildFormDataFromInitial = (initialData) => {
  if (!initialData) {
    return {
      id: null,
      bank_soal_id: null,
      judul: '',
      mapel: 'Matematika',
      kategori: 'formatif',
      kelas_ids: ['7A'],
      tanggal: new Date().toISOString().split('T')[0],
      jam_buka: '08:00',
      jam_tutup: '10:00',
      durasi_menit: 90,
      kkm: 75.0,
      anti_curang: true,
      skema_pg_kompleks: 'parsial',
      acak_soal: false,
      acak_opsi: false,
      tampilkan_nilai: 'manual',
      tampilkan_kunci: false,
      instruksi: DEFAULT_INSTRUCTION
    }
  }

  // Normalisasi kelas_ids atau target_rombel dari database
  let resolvedKelas = ['7A']
  if (Array.isArray(initialData.kelas_ids) && initialData.kelas_ids.length > 0) {
    resolvedKelas = initialData.kelas_ids
  } else if (Array.isArray(initialData.target_rombel) && initialData.target_rombel.length > 0) {
    resolvedKelas = initialData.target_rombel
  } else if (typeof initialData.target_rombel === 'string' && initialData.target_rombel.trim()) {
    resolvedKelas = initialData.target_rombel.split(',').map(s => s.trim()).filter(Boolean)
  }

  // Deduplikasi case-insensitive
  const resolvedMap = new Map()
  for (const k of resolvedKelas) {
    const trimmed = String(k).trim()
    if (trimmed && !['undefined', 'null', '-', '', 'none'].includes(trimmed.toLowerCase())) {
      const lower = trimmed.toLowerCase()
      if (!resolvedMap.has(lower)) resolvedMap.set(lower, trimmed)
    }
  }
  resolvedKelas = Array.from(resolvedMap.values())
  if (resolvedKelas.length === 0) resolvedKelas = ['7A']

  return {
    id: initialData.id || null,
    bank_soal_id: initialData.bank_soal_id || null,
    judul: initialData.judul || '',
    mapel: initialData.mapel || 'Matematika',
    kategori: initialData.kategori || 'formatif',
    kelas_ids: resolvedKelas,
    tanggal: parseDateString(initialData.waktu_buka),
    jam_buka: parseTimeString(initialData.waktu_buka, '08:00'),
    jam_tutup: parseTimeString(initialData.waktu_tutup, '10:00'),
    durasi_menit: initialData.durasi_menit || 90,
    kkm: initialData.kkm !== undefined && initialData.kkm !== null ? initialData.kkm : 75.0,
    anti_curang: initialData.anti_curang !== undefined ? initialData.anti_curang : true,
    skema_pg_kompleks: initialData.skema_pg_kompleks || 'parsial',
    acak_soal: Boolean(initialData.acak_soal),
    acak_opsi: Boolean(initialData.acak_opsi),
    tampilkan_nilai: initialData.tampilkan_nilai || 'manual',
    tampilkan_kunci: Boolean(initialData.tampilkan_kunci),
    instruksi: initialData.instruksi || DEFAULT_INSTRUCTION,
    status: initialData.status || 'draft'
  }
}

export default function CbtBuatPenilaianModal({
  isOpen,
  onClose,
  session,
  initialData = null,
  onSuccess
}) {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const { showToast, ToastComponent } = useToast()

  const [step, setStep] = useState(() => initialData?.step || 1) // 1: Info, 2: Pilihan Input, 3: Editor Split-Screen
  const [saving, setSaving] = useState(false)
  const [docxLoading, setDocxLoading] = useState(false)
  const [docxError, setDocxError] = useState(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [bankSoalModalOpen, setBankSoalModalOpen] = useState(false)
  const [duplicateModalState, setDuplicateModalState] = useState({
    isOpen: false,
    duplicates: [],
    totalUploaded: 0,
    uniqueCount: 0,
    onSkipDuplicates: null,
    onKeepAll: null,
    onCancel: null
  })

  // Guru Profile
  const guruId = session?.user?.id || session?.id
  const guruNama = session?.nama_guru || session?.user?.email || 'Guru Pengampu'

  const [availableKelas, setAvailableKelas] = useState(DEFAULT_KELAS_LIST)
  const [activeTahunAjaran, setActiveTahunAjaran] = useState(null)

  // FASE 1: Form State & Soal State
  const [formData, setFormData] = useState(() => buildFormDataFromInitial(initialData))
  const [questions, setQuestions] = useState(() => initialData?.questions || [])
  const [questionsDirty, setQuestionsDirty] = useState(() => !initialData?.id)

  const wasOpenRef = useRef(false)
  const prevDataIdRef = useRef(null)

  // Sinkronisasi data saat modal dibuka atau initialData berbeda (hindari reset di tengah navigasi wizard)
  useEffect(() => {
    if (isOpen) {
      const isFirstOpen = !wasOpenRef.current
      const isDifferentId = prevDataIdRef.current !== (initialData?.id || null)

      if (isFirstOpen || isDifferentId) {
        setFormData(buildFormDataFromInitial(initialData))
        setQuestions(initialData?.questions || [])
        setQuestionsDirty(!initialData?.id)
        setStep(initialData?.step || 1)
        setDocxError(null)
        prevDataIdRef.current = initialData?.id || null
      }
    }
    wasOpenRef.current = isOpen
  }, [isOpen, initialData])

  useEffect(() => {
    let isMounted = true
    fetchActiveTahunAjaranClasses().then(({ activeTa, classes }) => {
      if (isMounted) {
        if (activeTa) setActiveTahunAjaran(activeTa)
        if (classes && classes.length > 0) {
          setAvailableKelas(classes)
        }
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (!isOpen) return null

  // Gabungkan kelas dari active TA + kelas yang sudah ada di penilaian (misal kelas Test)
  const allClassOptions = useMemo(() => {
    const uniqueMap = new Map()
    for (const c of [...availableKelas, ...(formData.kelas_ids || [])]) {
      const trimmed = String(c).trim()
      if (trimmed && !['undefined', 'null', '-', '', 'none'].includes(trimmed.toLowerCase())) {
        const lower = trimmed.toLowerCase()
        if (!uniqueMap.has(lower)) {
          uniqueMap.set(lower, trimmed)
        }
      }
    }
    return Array.from(uniqueMap.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )
  }, [availableKelas, formData.kelas_ids])

  // Toggle pilihan target rombel/kelas
  const handleToggleKelas = (cls) => {
    setFormData(prev => {
      const clsLower = cls.toLowerCase()
      const exists = prev.kelas_ids.some(c => c.toLowerCase() === clsLower)
      if (exists) {
        if (prev.kelas_ids.length <= 1) return prev // Minimal 1 kelas
        return {
          ...prev,
          kelas_ids: prev.kelas_ids.filter(c => c.toLowerCase() !== clsLower)
        }
      } else {
        return {
          ...prev,
          kelas_ids: [...prev.kelas_ids, cls]
        }
      }
    })
  }

  // Validasi Kelengkapan Form Informasi (Fase 1)
  const validateFormInfo = () => {
    if (!formData.judul || !formData.judul.trim()) {
      showToast('Judul penilaian wajib diisi.', 'error')
      return false
    }
    if (!formData.mapel) {
      showToast('Mata pelajaran wajib dipilih.', 'error')
      return false
    }
    if (!formData.kelas_ids || formData.kelas_ids.length === 0) {
      showToast('Pilih minimal 1 target rombel/kelas.', 'error')
      return false
    }
    if (!formData.tanggal) {
      showToast('Tanggal pelaksanaan ujian wajib diisi.', 'error')
      return false
    }
    if (!formData.jam_buka || !formData.jam_tutup) {
      showToast('Jam buka dan jam tutup ujian wajib diisi.', 'error')
      return false
    }
    return true
  }

  // FASE 1 -> FASE 2: Validasi Form Info lalu masuk ke Menu Input Soal
  const handleNextToQuestions = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!validateFormInfo()) return
    setStep(2)
  }

  // FASE 2A: Upload & Parse File Word (.docx)
  const handleUploadDocx = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setDocxLoading(true)
    setDocxError(null)
    try {
      const parsed = await parseDocxFile(file)
      const importedQuestions = parsed?.questions || []
      if (!importedQuestions || importedQuestions.length === 0) {
        throw new Error('Tidak ditemukan butir soal yang valid dalam berkas Word ini. Pastikan format nomor diawali angka (misal: "1. ").')
      }

      // Validasi & Cek Soal Duplikat
      const validation = validateQuestionsList(importedQuestions)
      let questionsToUse = importedQuestions

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
          questionsToUse = validation.uniqueQuestions
          showToast(`Mengabaikan ${validation.duplicatesCount} butir soal duplikat. Melanjutkan dengan ${questionsToUse.length} soal unik.`, 'info')
        }
      }

      setQuestions(questionsToUse)
      setQuestionsDirty(true)
      // Langsung melompat ke Fase 3 (Editor Split-Screen) dengan soal terpopulasi
      setStep(3)
    } catch (err) {
      setDocxError(err.message || 'Gagal memproses berkas Word.')
    } finally {
      setDocxLoading(false)
      e.target.value = ''
    }
  }


  // FASE 2B: Tambah Soal Manual (Mulai dari Kosong)
  const handleStartManual = () => {
    setQuestions([
      {
        id: `soal_${Date.now()}`,
        nomor_urut: 1,
        tipe_soal: 'pg',
        pertanyaan: '',
        opsi: [
          { key: 'A', text: '' },
          { key: 'B', text: '' },
          { key: 'C', text: '' },
          { key: 'D', text: '' }
        ],
        kunci_jawaban: 'A',
        bobot: 1.0,
        pembahasan: ''
      }
    ])
    setQuestionsDirty(true)
    setStep(3)
  }

  // FASE 2C: Ambil & Pilih Butir Soal dari Bank Soal
  const handleSelectQuestionsFromBank = async (selectedQuestions, bank) => {
    if (!selectedQuestions || selectedQuestions.length === 0) return

    // Cek apakah draf saat ini sudah memiliki butir soal yang bermakna
    const hasExistingValidQuestions = questions.length > 0 && questions.some(q => q.pertanyaan && q.pertanyaan.trim() !== '')

    if (hasExistingValidQuestions) {
      const shouldAppend = await requestConfirm({
        title: 'Tambahkan atau Gantikan Soal?',
        message: `Saat ini sudah ada ${questions.length} butir soal di draf. Apakah Anda ingin menambahkan ${selectedQuestions.length} butir soal baru ini ke draf yang ada, atau menggantikan seluruh naskah soal draf?`,
        confirmLabel: 'Tambahkan ke Soal Ada',
        cancelLabel: 'Gantikan Semua Soal',
        confirmColor: 'emerald',
        icon: 'help'
      })

      if (shouldAppend) {
        // Tambahkan ke belakang (Append) dengan penomoran urut lanjutan
        const startNumber = questions.length + 1
        const reindexed = selectedQuestions.map((q, idx) => ({
          ...q,
          id: `soal_${Date.now()}_${idx + 1}`,
          nomor_urut: startNumber + idx
        }))
        setQuestions(prev => [...prev, ...reindexed])
        setQuestionsDirty(true)
        showToast(`Berhasil menambahkan ${selectedQuestions.length} butir soal dari "${bank?.judul || 'Bank Soal'}".`, 'success')
      } else {
        // Gantikan seluruh soal (Replace)
        setQuestions(selectedQuestions)
        setQuestionsDirty(true)
        showToast(`Berhasil memuat ${selectedQuestions.length} butir soal dari "${bank?.judul || 'Bank Soal'}".`, 'success')
      }
    } else {
      // Draf masih kosong atau hanya 1 soal template kosong -> langsung replace
      setQuestions(selectedQuestions)
      setQuestionsDirty(true)
      showToast(`Berhasil memuat ${selectedQuestions.length} butir soal dari "${bank?.judul || 'Bank Soal'}".`, 'success')
    }

    // Otomatis melangkah ke Fase 3 (Editor Split-Screen)
    setStep(3)
  }

  // Simpan ke Supabase (Draft atau Terbitkan)
  // options.skipQuestionsUpdate: jika true, hanya update metadata & waktu tanpa menyentuh cbt_soal (sangat cepat, <200ms)
  // options.forceUpdateQuestions: jika true, paksa re-write cbt_soal & cbt_soal_kunci secara batch
  const handlePersistAssessment = async (targetStatus = 'draft', questionsOverride = null, options = {}) => {
    const activeQuestions = Array.isArray(questionsOverride) ? questionsOverride : questions
    if (targetStatus === 'mendatang' && activeQuestions.length === 0) {
      showToast('Penilaian harus memiliki minimal 1 butir soal untuk diterbitkan.', 'error')
      return
    }

    setSaving(true)
    try {
      // 1. Hitung Waktu Buka & Waktu Tutup
      const waktuBukaIso = new Date(`${formData.tanggal}T${formData.jam_buka}:00`).toISOString()
      const waktuTutupIso = new Date(`${formData.tanggal}T${formData.jam_tutup}:00`).toISOString()

      // Tentukan status sebenarnya jika bukan 'draft':
      // Jika waktu tutup sudah lewat -> 'selesai'
      // Jika waktu buka sudah lewat dan waktu tutup belum lewat -> 'berlangsung'
      // Jika waktu buka belum tiba -> 'mendatang'
      let finalStatus = targetStatus
      if (targetStatus !== 'draft') {
        const now = new Date()
        const buka = new Date(waktuBukaIso)
        const tutup = new Date(waktuTutupIso)
        if (now >= tutup) {
          finalStatus = 'selesai'
        } else if (now >= buka) {
          finalStatus = 'berlangsung'
        } else {
          finalStatus = 'mendatang'
        }
      }

      // 2. Simpan / Buat Bank Soal Terlebih Dahulu
      let bankId = formData.bank_soal_id
      let tingkatKelas = 7
      if (Array.isArray(formData.kelas_ids)) {
        for (const cls of formData.kelas_ids) {
          if (!cls) continue
          const s = String(cls).trim()
          const m = s.match(/(?:kelas\s*)?([789])/i)
          if (m) {
            const parsed = parseInt(m[1], 10)
            if ([7, 8, 9].includes(parsed)) {
              tingkatKelas = parsed
              break
            }
          }
          if (/\bVII\b/i.test(s)) { tingkatKelas = 7; break; }
          if (/\bVIII\b/i.test(s)) { tingkatKelas = 8; break; }
          if (/\bIX\b/i.test(s)) { tingkatKelas = 9; break; }
          if (/\b1[012]\b|10x/i.test(s)) { tingkatKelas = 9; break; }
        }
      }

      if (!bankId) {
        const { data: newBank, error: errBank } = await supabase
          .from('cbt_bank_soal')
          .insert({
            guru_id: guruId,
            mapel: formData.mapel,
            tingkat: tingkatKelas,
            judul: formData.judul.trim(),
            deskripsi: `Naskah untuk ${formData.judul}`,
            total_soal: activeQuestions.length
          })
          .select()
          .single()

        if (errBank) throw errBank
        bankId = newBank.id
      } else {
        await supabase
          .from('cbt_bank_soal')
          .update({
            mapel: formData.mapel,
            judul: formData.judul.trim(),
            total_soal: activeQuestions.length,
            updated_at: new Date().toISOString()
          })
          .eq('id', bankId)
      }

      // 3. Simpan Butir Soal & Kunci (DIPERCEPAT DENGAN BATCH INSERT & SMART SKIP)
      // Cek apakah butir soal perlu disimpan ulang:
      // - Jika options.skipQuestionsUpdate bernilai true, lewati penyimpanan soal.
      // - Jika options.forceUpdateQuestions bernilai true, atau questionsDirty, atau ada questionsOverride, atau penilaian baru (!formData.id), simpan soal.
      const shouldUpdateQuestions = !options.skipQuestionsUpdate && (
        options.forceUpdateQuestions ||
        questionsDirty ||
        Boolean(questionsOverride) ||
        !formData.id
      )

      if (shouldUpdateQuestions && activeQuestions.length > 0) {
        // Hapus butir soal lama bank ini jika ada (cbt_soal_kunci terhapus otomatis via foreign key CASCADE)
        const { error: errDel } = await supabase.from('cbt_soal').delete().eq('bank_soal_id', bankId)
        if (errDel) console.warn('[CBT] Buat penilaian notice bersihkan soal lama:', errDel.message)

        // Siapkan batch data cbt_soal
        const soalBatch = activeQuestions.map((q, i) => {
          const preparedOpsi = (q.opsi || []).map(opt => {
            const optKey = String(opt?.key || '').trim().toUpperCase()
            const kStr = String(q.kunci_jawaban || '').trim().toUpperCase()
            let isKunci = false
            if (q.tipe_soal === 'pg_kompleks') {
              try {
                const keys = Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban : JSON.parse(q.kunci_jawaban)
                isKunci = keys.map(k => String(k).toUpperCase()).includes(optKey)
              } catch {
                isKunci = String(q.kunci_jawaban || '').includes(optKey)
              }
            } else {
              isKunci = optKey === kStr || (opt?.text && String(opt.text).trim().toLowerCase() === String(q.kunci_jawaban || '').trim().toLowerCase())
            }
            return {
              key: opt.key,
              text: opt.text !== undefined ? opt.text : (opt.teks !== undefined ? opt.teks : (opt.content || '')),
              is_kunci: isKunci
            }
          })

          return {
            bank_soal_id: bankId,
            nomor_urut: i + 1,
            tipe_soal: q.tipe_soal || 'pg',
            pertanyaan: q.pertanyaan,
            opsi: preparedOpsi,
            bobot: q.bobot || 1.0
          }
        })

        // Batch insert cbt_soal dalam chunk 50 butir (menggantikan ratusan request beruntun)
        const CHUNK_SIZE = 50
        const insertedSoalList = []

        for (let c = 0; c < soalBatch.length; c += CHUNK_SIZE) {
          const chunk = soalBatch.slice(c, c + CHUNK_SIZE)
          const { data: chunkInserted, error: errQ } = await supabase
            .from('cbt_soal')
            .insert(chunk)
            .select('id, nomor_urut')

          if (errQ) throw errQ
          if (chunkInserted) insertedSoalList.push(...chunkInserted)
        }

        // Siapkan batch cbt_soal_kunci dari ID soal yang berhasil diinsert
        if (insertedSoalList.length > 0) {
          const kunciBatch = []
          for (const s of insertedSoalList) {
            const orig = activeQuestions[s.nomor_urut - 1]
            if (orig && (orig.kunci_jawaban || orig.pembahasan)) {
              kunciBatch.push({
                soal_id: s.id,
                kunci_jawaban: typeof orig.kunci_jawaban === 'object' ? JSON.stringify(orig.kunci_jawaban) : String(orig.kunci_jawaban || ''),
                pembahasan: orig.pembahasan || ''
              })
            }
          }

          if (kunciBatch.length > 0) {
            for (let c = 0; c < kunciBatch.length; c += CHUNK_SIZE) {
              const chunkKunci = kunciBatch.slice(c, c + CHUNK_SIZE)
              const { error: errKunci } = await supabase
                .from('cbt_soal_kunci')
                .insert(chunkKunci)

              if (errKunci) console.warn('[CBT] Buat penilaian kunci batch notice:', errKunci.message)
            }
          }
        }

        // Tandai soal sudah tersimpan / tidak dirty lagi
        setQuestionsDirty(false)
      }

      // 4. Simpan / Buat Sesi Ujian (cbt_sesi_ujian)
      // Pertahankan token yang sudah ada jika mode edit, buat baru untuk rombel yang belum punya
      const scopedTokens = initialData?.scoped_tokens ? { ...initialData.scoped_tokens } : {}
      formData.kelas_ids.forEach(cls => {
        if (!scopedTokens[cls]) {
          const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
          let token = ''
          for (let t = 0; t < 6; t++) token += chars.charAt(Math.floor(Math.random() * chars.length))
          scopedTokens[cls] = `${cls}-${token}`
        }
      })

      const sesiPayload = {
        bank_soal_id: bankId,
        guru_id: guruId,
        judul: formData.judul.trim(),
        mapel: formData.mapel,
        kategori: formData.kategori,
        kelas_ids: formData.kelas_ids,
        waktu_buka: waktuBukaIso,
        waktu_tutup: waktuTutupIso,
        durasi_menit: parseInt(formData.durasi_menit, 10),
        kkm: parseFloat(formData.kkm) || 75.0,
        status: finalStatus,
        anti_curang: formData.anti_curang,
        skema_pg_kompleks: formData.skema_pg_kompleks,
        acak_soal: formData.acak_soal,
        acak_opsi: formData.acak_opsi,
        tampilkan_nilai: formData.tampilkan_nilai,
        tampilkan_kunci: formData.tampilkan_kunci,
        instruksi: formData.instruksi,
        scoped_tokens: scopedTokens
      }

      if (formData.id) {
        const { error: errUpdateSesi } = await supabase
          .from('cbt_sesi_ujian')
          .update(sesiPayload)
          .eq('id', formData.id)
        if (errUpdateSesi) throw errUpdateSesi
      } else {
        const { error: errInsertSesi } = await supabase
          .from('cbt_sesi_ujian')
          .insert(sesiPayload)
        if (errInsertSesi) throw errInsertSesi
      }

      showToast(
        formData.id
          ? (finalStatus === 'draft'
              ? 'Draf penilaian berhasil diperbarui.'
              : finalStatus === 'berlangsung'
                ? 'Penilaian berhasil diperbarui dan SEDANG BERLANGSUNG!'
                : 'Penilaian berhasil diperbarui (Status: MENDATANG).')
          : (finalStatus === 'draft'
              ? 'Penilaian berhasil disimpan sebagai Draft.'
              : finalStatus === 'berlangsung'
                ? 'Penilaian berhasil diterbitkan dan sekarang SEDANG BERLANGSUNG!'
                : 'Penilaian berhasil diterbitkan dengan status MENDATANG.'),
        'success'
      )

      onSuccess && onSuccess()
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err) {
      console.error('Gagal menyimpan penilaian:', err)
      showToast('Gagal menyimpan penilaian: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // RENDER MODAL WIZARD LENGKAP: FASE 1, FASE 2, DAN FASE 3
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-100 flex flex-col overflow-hidden animate-fade-in font-sans">
      {/* ============================================================ */}
      {/* TOP PINNED WIZARD HEADER & PHASE STEPPER (ALWAYS VISIBLE)     */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-8 py-3 shadow-xs flex items-center justify-between gap-4 shrink-0">
        {/* Sisi Kiri: Tombol Kembali & Info Penilaian */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
            CBT
          </div>

          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                {formData.mapel}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                {formData.id ? 'Edit Draf' : 'Penilaian Baru'}
              </span>
            </div>
            <h1 className="text-xs md:text-sm font-bold text-slate-800 truncate">
              {formData.judul || 'Penilaian Baru'}
            </h1>
          </div>
        </div>

        {/* Tengah: Interactive Phase Stepper (Fase 1 -> Fase 2 -> Fase 3) */}
        <nav aria-label="Progress Alur Penilaian" className="hidden md:flex items-center gap-1.5 lg:gap-3">
          {/* Fase 1 */}
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all text-xs font-bold cursor-pointer ${
              step === 1
                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300/80 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
              step === 1
                ? 'bg-indigo-600 text-white'
                : step > 1
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-600'
            }`}>
              {step > 1 ? '✓' : '1'}
            </span>
            <span>Fase 1: Informasi</span>
          </button>

          <svg className={`w-4 h-4 shrink-0 ${step > 1 ? 'text-emerald-500' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>

          {/* Fase 2 */}
          <button
            type="button"
            onClick={() => {
              if (step >= 2 || (formData.judul && formData.judul.trim())) {
                setStep(2)
              } else {
                handleNextToQuestions()
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all text-xs font-bold cursor-pointer ${
              step === 2
                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300/80 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
              step === 2
                ? 'bg-indigo-600 text-white'
                : step > 2
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-600'
            }`}>
              {step > 2 ? '✓' : '2'}
            </span>
            <span>Fase 2: Metode Input</span>
          </button>

          <svg className={`w-4 h-4 shrink-0 ${step > 2 ? 'text-emerald-500' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>

          {/* Fase 3 */}
          <button
            type="button"
            onClick={() => {
              if (questions && questions.length > 0) {
                setStep(3)
              } else {
                handleStartManual()
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all text-xs font-bold cursor-pointer ${
              step === 3
                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300/80 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
              step === 3
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              3
            </span>
            <span>Fase 3: Editor Soal</span>
          </button>
        </nav>

        {/* Sisi Kanan: Tombol Aksi & Tutup */}
        <div className="flex items-center gap-2 min-w-[200px] justify-end">
          {/* Aksi Cepat Fase 1 & Fase 2: Simpan langsung tanpa perlu masuk ke Fase 3 */}
          {step < 3 && (
            <>
              {formData.id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!validateFormInfo()) return
                    const currentStatus = initialData?.status || formData.status || 'draft'
                    handlePersistAssessment(currentStatus, null, { skipQuestionsUpdate: !questionsDirty })
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 active:scale-98 transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Simpan langsung dari fase ini tanpa harus ke Fase 3"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
              )}

              {/* Jika masih draft dan sudah ada soal di draf, sediakan opsi Terbitkan langsung */}
              {(initialData?.status === 'draft' || !initialData?.status) && questions && questions.length > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!validateFormInfo()) return
                    handlePersistAssessment('mendatang', null, { skipQuestionsUpdate: !questionsDirty })
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white active:scale-98 transition-all disabled:opacity-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Terbitkan penilaian langsung"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{saving ? 'Menerbitkan...' : 'Terbitkan'}</span>
                </button>
              )}
            </>
          )}

          {/* Aksi Fase 3: Editor Soal */}
          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-98 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="hidden sm:inline">Pratinjau</span>
              </button>

              <button
                type="button"
                onClick={() => handlePersistAssessment('draft')}
                disabled={saving}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:scale-98 transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span className="hidden sm:inline">Simpan Draft</span>
              </button>

              <button
                type="button"
                onClick={() => handlePersistAssessment('mendatang')}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white active:scale-98 transition-all disabled:opacity-50 shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{formData.id && initialData?.status !== 'draft' ? 'Perbarui & Terbitkan' : 'Terbitkan'}</span>
              </button>
            </>
          )}

          {/* Tombol Close Wizard */}
          <button
            type="button"
            onClick={async () => {
              if (step === 3) {
                const confirmed = await requestConfirm({
                  title: 'Tutup Wizard Penilaian?',
                  message: 'Pastikan Anda sudah menyimpan draf jika ada perubahan pada form atau butir soal.',
                  confirmLabel: 'Tutup Wizard',
                  cancelLabel: 'Lanjut Mengedit',
                  confirmColor: 'red',
                  icon: 'warning',
                })
                if (confirmed) {
                  onClose()
                }
              } else {
                onClose()
              }
            }}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0 ml-1 shadow-2xs cursor-pointer"
            title="Tutup Wizard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* WIZARD CONTENT AREA (SLIDING / NEXT PAGE EXPERIENCE)         */}
      {/* ============================================================ */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ============================================================ */}
        {/* STEP 1: FORM INFORMASI PENILAIAN                             */}
        {/* ============================================================ */}
        {step === 1 && (
          <div className="max-w-4xl mx-auto my-6 px-4 pb-12 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                    FASE 1: IDENTITAS & ATURAN PENILAIAN
                  </span>
                  <h2 className="text-base md:text-lg font-bold text-slate-800 mt-0.5">
                    {formData.id ? 'Edit Informasi Penilaian' : 'Buat Penilaian Baru'}
                  </h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Langkah 1 dari 3
                </span>
              </div>

              <form
                noValidate
                onSubmit={handleNextToQuestions}
                className="space-y-6"
              >
              {/* 1. Judul & Mapel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Judul Penilaian / Asesmen:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.judul}
                    onChange={(e) => setFormData(prev => ({ ...prev, judul: e.target.value }))}
                    placeholder="Contoh: Asesmen Sumatif Bab 1: Bilangan Bulat"
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mata Pelajaran:
                  </label>
                  <select
                    value={formData.mapel}
                    onChange={(e) => setFormData(prev => ({ ...prev, mapel: e.target.value }))}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  >
                    <option value="Matematika">Matematika</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                    <option value="Bahasa Inggris">Bahasa Inggris</option>
                    <option value="IPA (Ilmu Pengetahuan Alam)">IPA (Ilmu Pengetahuan Alam)</option>
                    <option value="IPS (Ilmu Pengetahuan Sosial)">IPS (Ilmu Pengetahuan Sosial)</option>
                    <option value="PPKn / Pendidikan Pancasila">PPKn / Pendidikan Pancasila</option>
                    <option value="Informatika">Informatika</option>
                    <option value="Seni Budaya">Seni Budaya</option>
                    <option value="PJOK">PJOK</option>
                    <option value="Pendidikan Agama Katolik">Pendidikan Agama Katolik</option>
                    <option value="Pendidikan Agama Kristen">Pendidikan Agama Kristen</option>
                    <option value="Pendidikan Agama Islam">Pendidikan Agama Islam</option>
                    <option value="Pendidikan Agama Buddha">Pendidikan Agama Buddha</option>
                    <option value="Bahasa Mandarin">Bahasa Mandarin</option>
                    <option value="Bimbingan Konseling (BK)">Bimbingan Konseling (BK)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori Penilaian:
                  </label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData(prev => ({ ...prev, kategori: e.target.value }))}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  >
                    <option value="formatif">Formatif (Ulangan Harian / Kuis)</option>
                    <option value="sumatif_materi">Sumatif Lingkup Materi (TP/Bab)</option>
                    <option value="sts">PSTS / STS (Sumatif Tengah Semester)</option>
                    <option value="sumatif_akhir">SAS (Sumatif Akhir Semester) / ASAS</option>
                    <option value="tryout">Tryout Asesmen Standar</option>
                  </select>
                </div>
              </div>

              {/* 2. Target Kelas / Rombel (Bukan Ruang) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Target Kelas / Rombel:
                    </label>
                    {activeTahunAjaran && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        T.A. {activeTahunAjaran.nama}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Pilih satu atau lebih rombel peserta
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allClassOptions.map((cls) => {
                    const selected = formData.kelas_ids.some(
                      c => c.toLowerCase() === cls.toLowerCase()
                    )
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => handleToggleKelas(cls)}
                        className={`py-1.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? 'bg-indigo-600 text-white shadow-xs scale-[1.02]'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {cls.toLowerCase().startsWith('kelas') ? cls : `Kelas ${cls}`}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Catatan: Guru hanya menentukan rombel target belajar. Penempatan ruang fisik diatur terpisah oleh Admin.
                </p>
              </div>

              {/* 3. Tanggal, Jam Buka & Jam Tutup, Durasi, KKM */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Pelaksanaan:
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tanggal}
                    onChange={(e) => setFormData(prev => ({ ...prev, tanggal: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jam Buka:
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.jam_buka}
                    onChange={(e) => setFormData(prev => ({ ...prev, jam_buka: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jam Tutup:
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.jam_tutup}
                    onChange={(e) => setFormData(prev => ({ ...prev, jam_tutup: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alokasi Waktu (Menit):
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    required
                    value={formData.durasi_menit}
                    onChange={(e) => setFormData(prev => ({ ...prev, durasi_menit: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Target KKTP / KKM:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="50"
                    max="100"
                    required
                    value={formData.kkm}
                    onChange={(e) => setFormData(prev => ({ ...prev, kkm: e.target.value }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700"
                  />
                </div>
              </div>

              {/* 4. Instruksi Penilaian (Kop Sekolah & Petunjuk Bernomor) */}
              <div className="border border-slate-200/80 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Instruksi & Petunjuk Ujian (Tampil ke Siswa):
                  </label>
                  <span className="text-[10px] text-indigo-600 font-bold">
                    Format Kop Resmi Sekolah
                  </span>
                </div>

                {/* Preview Kop Sekolah Mini */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center space-y-0.5 text-xs text-slate-800">
                  <div className="font-bold tracking-wide uppercase text-[11px] text-slate-500">YAYASAN BUDI MULIA JAKARTA</div>
                  <div className="font-extrabold text-sm text-indigo-900 uppercase">SMP BUDI MULIA</div>
                  <div className="font-bold text-[11px] text-slate-700 uppercase">{formData.judul || 'PENILAIAN DIGITAL'}</div>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex justify-center gap-4">
                    <span>Mapel: <strong>{formData.mapel}</strong></span>
                    <span>Guru: <strong>{guruNama}</strong></span>
                    <span>Kelas: <strong>{formData.kelas_ids.join(', ')}</strong></span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Daftar Petunjuk Pengerjaan Bernomor:
                  </label>
                  <textarea
                    rows={4}
                    value={formData.instruksi}
                    onChange={(e) => setFormData(prev => ({ ...prev, instruksi: e.target.value }))}
                    className="w-full text-xs p-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 leading-relaxed font-sans"
                  />
                </div>
              </div>

              {/* 5. Saklar Anti-Curang & Skema Penskoran */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Anti-Curang */}
                <label className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5 cursor-pointer hover:bg-slate-100/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.anti_curang}
                    onChange={(e) => setFormData(prev => ({ ...prev, anti_curang: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Aktifkan Fitur Anti-Curang
                    </span>
                    <span className="text-[10px] text-slate-500 leading-tight block">
                      Deteksi 3-strike bila siswa berpindah tab/aplikasi selama ujian.
                    </span>
                  </div>
                </label>

                {/* Penskoran PG Kompleks */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Skema Nilai PG Kompleks:
                  </label>
                  <select
                    value={formData.skema_pg_kompleks}
                    onChange={(e) => setFormData(prev => ({ ...prev, skema_pg_kompleks: e.target.value }))}
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none text-slate-700 font-semibold"
                  >
                    <option value="parsial">Parsial (Nilai proporsional benar)</option>
                    <option value="all_or_nothing">All-or-Nothing (Wajib semua benar)</option>
                  </select>
                </div>
              </div>

              {/* 6. Opsi Tambahan: Acak Soal, Acak Opsi, Tampilkan Nilai/Kunci */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acak_soal}
                    onChange={(e) => setFormData(prev => ({ ...prev, acak_soal: e.target.checked }))}
                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                  />
                  <span className="text-[11px] text-slate-700 font-medium">Acak Soal</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.acak_opsi}
                    onChange={(e) => setFormData(prev => ({ ...prev, acak_opsi: e.target.checked }))}
                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                  />
                  <span className="text-[11px] text-slate-700 font-medium">Acak Pilihan</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.tampilkan_kunci}
                    onChange={(e) => setFormData(prev => ({ ...prev, tampilkan_kunci: e.target.checked }))}
                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                  />
                  <span className="text-[11px] text-slate-700 font-medium">Rilis Kunci</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.tampilkan_nilai === 'instan'}
                    onChange={(e) => setFormData(prev => ({ ...prev, tampilkan_nilai: e.target.checked ? 'instan' : 'manual' }))}
                    className="w-3.5 h-3.5 text-indigo-600 rounded"
                  />
                  <span className="text-[11px] text-slate-700 font-medium">Nilai Instan</span>
                </label>
              </div>

                {/* Footer Tombol Aksi Step 1 */}
                <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>

                  <div className="w-full sm:w-auto flex flex-wrap items-center justify-end gap-2.5">
                    {/* Tombol Simpan Perubahan Langsung dari Fase 1 jika Mode Edit */}
                    {formData.id && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (!validateFormInfo()) return
                          const currentStatus = initialData?.status || formData.status || 'draft'
                          handlePersistAssessment(currentStatus, null, { skipQuestionsUpdate: !questionsDirty })
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                      </button>
                    )}

                    {/* Jika status saat ini masih draft dan butir soal sudah ada di draf, beri opsi langsung Simpan & Terbitkan */}
                    {(initialData?.status === 'draft' || !initialData?.status) && questions && questions.length > 0 && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (!validateFormInfo()) return
                          handlePersistAssessment('mendatang', null, { skipQuestionsUpdate: !questionsDirty })
                        }}
                        className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{saving ? 'Menerbitkan...' : 'Simpan & Terbitkan'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleNextToQuestions}
                      className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Lanjut ke Fase 2: Metode Input Soal →</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 2: PILIHAN METODE INPUT SOAL (MENU INPUT SOAL)         */}
        {/* ============================================================ */}
        {step === 2 && (
          <div className="max-w-4xl mx-auto my-6 px-4 pb-12 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                    FASE 2: METODE INPUT SOAL
                  </span>
                  <h2 className="text-base md:text-lg font-bold text-slate-800 mt-0.5">
                    Pilih Cara Memasukkan Naskah Soal
                  </h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Langkah 2 dari 3
                </span>
              </div>

              {/* Status Soal Tersimpan jika mode edit draft */}
              {questions && questions.length > 0 && (
                <div className="p-4 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-indigo-900">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      {questions.length}
                    </span>
                    <div>
                      <span className="font-bold block">
                        Tersimpan {questions.length} Butir Soal
                      </span>
                      <span className="text-[11px] text-indigo-700">
                        Naskah soal sudah ada di draf penilaian ini dan siap diedit.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shrink-0 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Buka Editor Soal →</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* OPSI A: UPLOAD TEMPLATE DOCX */}
                <div className="p-5 md:p-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/70 transition-all space-y-4 flex flex-col justify-between shadow-2xs">
                  <div className="space-y-2.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                      A. Upload Template (.docx)
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Unduh template soal Word resmi, ketik naskah di Microsoft Word laptop Anda, lalu unggah kembali untuk diparsing otomatis menjadi butir soal CBT.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={downloadSampleDocxTemplate}
                      className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Unduh Format Template (.docx)</span>
                    </button>

                    <label className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs text-center">
                      {docxLoading ? (
                        <span>Memproses Dokumen...</span>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span>Pilih & Upload File .docx</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept=".docx"
                        disabled={docxLoading}
                        onChange={handleUploadDocx}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {docxError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px]">
                      {docxError}
                    </div>
                  )}
                </div>

                {/* OPSI B: TAMBAH SOAL MANUAL / EDITOR SOAL */}
                <div className="p-5 md:p-6 rounded-2xl border-2 border-slate-200 bg-white hover:border-indigo-300 transition-all space-y-4 flex flex-col justify-between shadow-2xs">
                  <div className="space-y-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shadow-xs">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                      B. {questions && questions.length > 0 ? 'Buka Editor Soal' : 'Tambah Soal Manual'}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {questions && questions.length > 0
                        ? `Lanjutkan proses pengetikan dan penataan ${questions.length} butir soal di editor interaktif split-screen.`
                        : 'Ketik langsung butir soal satu per satu di editor split-screen dengan 1 butir soal kosong siap isi.'}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    {questions && questions.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setStep(3)}
                          className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                        >
                          <span>Lanjut ke Editor ({questions.length} Soal) →</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const confirmed = await requestConfirm({
                              title: 'Mulai Ulang Soal Kosong?',
                              message: 'Seluruh butir soal yang saat ini ada di draf akan diganti dengan 1 butir soal kosong baru.',
                              confirmLabel: 'Ya, Mulai Ulang',
                              confirmColor: 'amber',
                              icon: 'warning',
                            })
                            if (confirmed) {
                              handleStartManual()
                            }
                          }}
                          className="w-full py-1.5 px-3 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          Mulai Ulang dari Soal Kosong
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartManual}
                        className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                      >
                        <span>Mulai Ketik Soal Manual →</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* OPSI C: PILIH DARI BANK SOAL */}
                <div className="p-5 md:p-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70 transition-all space-y-4 flex flex-col justify-between shadow-2xs">
                  <div className="space-y-2.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">
                      C. Pilih dari Bank Soal
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Pilih naskah dari Bank Soal yang telah Anda buat, lalu tentukan butir-butir soal mana saja yang ingin dimasukkan ke sesi penilaian ini.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setBankSoalModalOpen(true)}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span>Pilih dari Bank Soal →</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Pinned Footer Step 2 */}
              <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer"
                >
                  <span>← Kembali ke Form Informasi</span>
                </button>

                <div className="w-full sm:w-auto flex flex-wrap items-center justify-end gap-2.5">
                  {/* Tombol Simpan Perubahan Langsung dari Fase 2 */}
                  {(formData.id || (questions && questions.length > 0)) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        if (!validateFormInfo()) {
                          setStep(1)
                          return
                        }
                        const currentStatus = initialData?.status || formData.status || 'draft'
                        handlePersistAssessment(currentStatus, null, { skipQuestionsUpdate: !questionsDirty })
                      }}
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>{saving ? 'Menyimpan...' : 'Simpan Langsung'}</span>
                    </button>
                  )}

                  {questions && questions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Lanjut ke Fase 3: Editor Soal ({questions.length} Soal) →</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 3: EDITOR SOAL SPLIT-SCREEN                             */}
        {/* ============================================================ */}
        {step === 3 && (
          <div className="h-full animate-fade-in">
            <CbtEditorSoalSplitScreen
              isEmbedded={true}
              sesiInfo={formData}
              questions={questions}
              onUpdateQuestions={(updatedQ) => {
                setQuestionsDirty(true)
                setQuestions(updatedQ)
              }}
              onSaveDraft={(updatedQ) => handlePersistAssessment('draft', updatedQ)}
              onPublish={(updatedQ) => handlePersistAssessment('mendatang', updatedQ)}
              onBackToInfo={() => setStep(1)}
              onBackToMenuInput={() => setStep(2)}
              onOpenBankSoalPicker={() => setBankSoalModalOpen(true)}
              previewModalOpen={previewModalOpen}
              setPreviewModalOpen={setPreviewModalOpen}
              saving={saving}
            />
          </div>
        )}
      </div>

      {/* Modal Pilih Soal dari Bank Soal */}
      <CbtPilihBankSoalModal
        isOpen={bankSoalModalOpen}
        onClose={() => setBankSoalModalOpen(false)}
        session={session}
        defaultMapel={formData.mapel}
        onSelectQuestions={handleSelectQuestionsFromBank}
      />

      {/* Modal Peringatan Soal Duplikat */}
      <CbtDuplicateWarningModal
        isOpen={duplicateModalState.isOpen}
        duplicates={duplicateModalState.duplicates}
        totalUploaded={duplicateModalState.totalUploaded}
        uniqueCount={duplicateModalState.uniqueCount}
        onSkipDuplicates={duplicateModalState.onSkipDuplicates}
        onKeepAll={duplicateModalState.onKeepAll}
        onCancel={duplicateModalState.onCancel}
        context="penilaian"
      />

      {/* Professional Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Professional Toast Notification */}
      {ToastComponent}
    </div>,
    document.body
  )
}

