import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { renderFormattedMath } from './CbtSoalRenderer'

/**
 * Modal Pilih Soal dari Bank Soal
 * Alur 2-Langkah:
 * 1. Pilih Bank Soal yang tersedia (filter mapel, tingkat, pencarian)
 * 2. Pilih butir-butir soal yang ingin dimasukkan (checkbox, filter tipe soal, KaTeX preview, pilih semua)
 */

export default function CbtPilihBankSoalModal({
  isOpen,
  onClose,
  session,
  defaultMapel = '',
  onSelectQuestions
}) {
  const [step, setStep] = useState(1) // 1: Pilih Bank, 2: Pilih Butir Soal
  const [bankList, setBankList] = useState([])
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [searchBank, setSearchBank] = useState('')
  const [filterMapel, setFilterMapel] = useState(defaultMapel || 'all')
  const [filterTingkat, setFilterTingkat] = useState('all')

  // Step 2: Soal State
  const [selectedBank, setSelectedBank] = useState(null)
  const [bankQuestions, setBankQuestions] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [selectedQIds, setSelectedQIds] = useState(new Set())
  const [searchQuestion, setSearchQuestion] = useState('')
  const [filterTipeSoal, setFilterTipeSoal] = useState('all')

  const isAdmin = session?.role === 'admin' || session?.is_admin
  const guruId = session?.user?.id || session?.id

  // Load Bank Soal saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setSelectedBank(null)
      setSelectedQIds(new Set())
      fetchBankSoal()
    }
  }, [isOpen])

  // Sinkronisasi defaultMapel
  useEffect(() => {
    if (defaultMapel) {
      setFilterMapel(defaultMapel)
    }
  }, [defaultMapel])

  const fetchBankSoal = async () => {
    setLoadingBanks(true)
    try {
      let query = supabase
        .from('cbt_bank_soal')
        .select('*')
        .order('created_at', { ascending: false })

      if (guruId && !isAdmin) {
        query = query.eq('guru_id', guruId)
      }

      const { data, error } = await query
      if (error) throw error
      setBankList(data || [])
    } catch (err) {
      console.error('Gagal memuat bank soal:', err)
    } finally {
      setLoadingBanks(false)
    }
  }

  // Pilih Bank Soal & Muat Butir Soalnya
  const handleSelectBank = async (bank) => {
    setSelectedBank(bank)
    setLoadingQuestions(true)
    setStep(2)
    setSelectedQIds(new Set())
    setSearchQuestion('')
    setFilterTipeSoal('all')

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

      // Format questions
      const formatted = (data || []).map((q, idx) => {
        let parsedOpsi = []
        try {
          if (Array.isArray(q.opsi)) {
            parsedOpsi = q.opsi
          } else if (typeof q.opsi === 'string') {
            parsedOpsi = JSON.parse(q.opsi || '[]')
          }
        } catch {
          parsedOpsi = []
        }

        // Ekstraksi kunci
        let key = ''
        if (Array.isArray(q.cbt_soal_kunci) && q.cbt_soal_kunci.length > 0) {
          key = q.cbt_soal_kunci[0]?.kunci_jawaban || ''
        } else if (q.cbt_soal_kunci?.kunci_jawaban) {
          key = q.cbt_soal_kunci.kunci_jawaban
        } else {
          const kunciOpt = parsedOpsi.find(o => o.is_kunci)
          if (kunciOpt) key = kunciOpt.key
        }

        // Ekstraksi pembahasan
        let pembahasan = ''
        if (Array.isArray(q.cbt_soal_kunci) && q.cbt_soal_kunci.length > 0) {
          pembahasan = q.cbt_soal_kunci[0]?.pembahasan || ''
        }

        return {
          id: q.id || `q_${idx}`,
          nomor_urut: q.nomor_urut || idx + 1,
          tipe_soal: q.tipe_soal || 'pg',
          pertanyaan: q.pertanyaan || '',
          opsi: parsedOpsi,
          bobot: q.bobot || 1.0,
          kunci_jawaban: key,
          pembahasan: pembahasan
        }
      })

      setBankQuestions(formatted)
      // Default: pilih semua soal
      setSelectedQIds(new Set(formatted.map(q => q.id)))
    } catch (err) {
      console.error('Gagal memuat butir soal bank:', err)
      setBankQuestions([])
    } finally {
      setLoadingQuestions(false)
    }
  }

  // Filter Bank Soal
  const filteredBanks = useMemo(() => {
    return bankList.filter(bank => {
      const matchSearch = searchBank === '' ||
        (bank.judul && bank.judul.toLowerCase().includes(searchBank.toLowerCase())) ||
        (bank.deskripsi && bank.deskripsi.toLowerCase().includes(searchBank.toLowerCase()))

      const matchMapel = filterMapel === 'all' ||
        (bank.mapel && bank.mapel.toLowerCase() === filterMapel.toLowerCase())

      const matchTingkat = filterTingkat === 'all' ||
        String(bank.tingkat) === String(filterTingkat)

      return matchSearch && matchMapel && matchTingkat
    })
  }, [bankList, searchBank, filterMapel, filterTingkat])

  // Filter Butir Soal di Step 2
  const filteredQuestions = useMemo(() => {
    return bankQuestions.filter(q => {
      const matchSearch = searchQuestion === '' ||
        (q.pertanyaan && q.pertanyaan.toLowerCase().includes(searchQuestion.toLowerCase()))

      const matchTipe = filterTipeSoal === 'all' || q.tipe_soal === filterTipeSoal

      return matchSearch && matchTipe
    })
  }, [bankQuestions, searchQuestion, filterTipeSoal])

  // Toggle checklist 1 soal
  const handleToggleQuestion = (id) => {
    setSelectedQIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Pilih Semua / Batalkan Semua untuk soal yang sedang terfilter
  const handleToggleSelectAll = () => {
    const visibleIds = filteredQuestions.map(q => q.id)
    const allSelected = visibleIds.every(id => selectedQIds.has(id))

    setSelectedQIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  // Konfirmasi Masukkan Soal ke Penilaian
  const handleConfirmInsert = () => {
    const chosen = bankQuestions.filter(q => selectedQIds.has(q.id))
    if (chosen.length === 0) return

    // Bersihkan ID unik agar menjadi soal baru di sesi ini
    const cloned = chosen.map((q, idx) => ({
      ...q,
      id: `soal_${Date.now()}_${idx + 1}`,
      nomor_urut: idx + 1
    }))

    onSelectQuestions(cloned, selectedBank)
    onClose()
  }


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* HEADER MODAL */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Pilih Soal dari Bank Soal</span>
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {step === 1 ? 'Langkah 1: Pilih Bank Soal' : 'Langkah 2: Pilih Butir Soal'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {step === 1
                  ? 'Pilih salah satu arsip bank soal yang telah Anda buat sebelumnya.'
                  : `Menampilkan naskah butir soal dari "${selectedBank?.judul}". Tentukan soal yang akan diimpor.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* BODY CONTENT: STEP 1 (PILIH BANK SOAL) */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari judul bank soal..."
                  value={searchBank}
                  onChange={(e) => setSearchBank(e.target.value)}
                  className="w-full text-xs pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-800"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Filter Mapel */}
              <div>
                <select
                  value={filterMapel}
                  onChange={(e) => setFilterMapel(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 font-medium"
                >
                  <option value="all">Semua Mata Pelajaran</option>
                  <option value="Matematika">Matematika</option>
                  <option value="IPA">IPA</option>
                  <option value="IPS">IPS</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="Pendidikan Agama Katolik">Pendidikan Agama Katolik</option>
                  <option value="PPKn">PPKn</option>
                  <option value="Informatika">Informatika</option>
                  <option value="Seni Budaya">Seni Budaya</option>
                  <option value="PJOK">PJOK</option>
                </select>
              </div>

              {/* Filter Tingkat */}
              <div>
                <select
                  value={filterTingkat}
                  onChange={(e) => setFilterTingkat(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 font-medium"
                >
                  <option value="all">Semua Tingkat / Jenjang</option>
                  <option value="7">Kelas 7</option>
                  <option value="8">Kelas 8</option>
                  <option value="9">Kelas 9</option>
                </select>
              </div>
            </div>

            {/* List Bank Soal */}
            {loadingBanks ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Memuat daftar bank soal...</p>
              </div>
            ) : filteredBanks.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-700">Bank Soal Tidak Ditemukan</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchBank || filterMapel !== 'all' || filterTingkat !== 'all'
                    ? 'Tidak ada bank soal yang cocok dengan filter pencarian Anda.'
                    : 'Anda belum memiliki bank soal. Anda dapat mengunggah template Word atau mengetik manual terlebih dahulu.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBanks.map(bank => (
                  <div
                    key={bank.id}
                    onClick={() => handleSelectBank(bank)}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 transition-all cursor-pointer shadow-2xs space-y-3 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
                          {bank.judul}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {bank.deskripsi || `Bank soal ${bank.mapel} kelas ${bank.tingkat || 7}`}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black shrink-0">
                        {bank.total_soal || 0} Soal
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-600">
                          {bank.mapel}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-600">
                          Kelas {bank.tingkat || 7}
                        </span>
                      </div>
                      <span className="text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                        Pilih Soal →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BODY CONTENT: STEP 2 (PILIH BUTIR SOAL DARI BANK) */}
        {step === 2 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
            {/* Header info & Filter */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Kembali ke daftar bank soal"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Ganti Bank</span>
                </button>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">
                    {selectedBank?.judul}
                  </h3>
                  <span className="text-[11px] text-emerald-700">
                    {selectedBank?.mapel} • Kelas {selectedBank?.tingkat || 7} • Total {bankQuestions.length} Butir Soal
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
                >
                  {filteredQuestions.every(q => selectedQIds.has(q.id)) && filteredQuestions.length > 0
                    ? 'Batalkan Semua'
                    : 'Pilih Semua'}
                </button>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black shadow-xs">
                  {selectedQIds.size} Dipilih
                </span>
              </div>
            </div>

            {/* Filter Soal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari pertanyaan soal..."
                  value={searchQuestion}
                  onChange={(e) => setSearchQuestion(e.target.value)}
                  className="w-full text-xs pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-800"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div>
                <select
                  value={filterTipeSoal}
                  onChange={(e) => setFilterTipeSoal(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 font-medium"
                >
                  <option value="all">Semua Tipe Soal</option>
                  <option value="pg">Pilihan Ganda (PG)</option>
                  <option value="pg_kompleks">PG Kompleks</option>
                  <option value="benar_salah">Benar / Salah</option>
                  <option value="menjodohkan">Menjodohkan</option>
                  <option value="isian">Isian Singkat</option>
                </select>
              </div>
            </div>

            {/* List Soal dengan Checkbox */}
            {loadingQuestions ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Memuat butir soal...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl p-6 text-slate-400 text-xs">
                Tidak ada butir soal yang sesuai dengan pencarian atau filter.
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {filteredQuestions.map((q, idx) => {
                  const isChecked = selectedQIds.has(q.id)

                  let badgeTipe = 'PG'
                  if (q.tipe_soal === 'pg_kompleks') badgeTipe = 'PGK'
                  if (q.tipe_soal === 'benar_salah') badgeTipe = 'B/S'
                  if (q.tipe_soal === 'menjodohkan') badgeTipe = 'Jodoh'
                  if (q.tipe_soal === 'isian') badgeTipe = 'Isian'

                  return (
                    <div
                      key={q.id}
                      onClick={() => handleToggleQuestion(q.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                        isChecked
                          ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
                      }`}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by parent onClick
                        className="w-4 h-4 mt-1 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                      />

                      {/* Nomor Soal Pill */}
                      <span className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center shrink-0 ${
                        isChecked ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {idx + 1}
                      </span>

                      {/* Content Soal */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200/60">
                            {badgeTipe}
                          </span>
                          {q.kunci_jawaban && (
                            <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 flex items-center gap-1">
                              ✓ Kunci: <span className="font-extrabold truncate max-w-[120px]">{q.kunci_jawaban}</span>
                            </span>
                          )}
                        </div>

                        {/* Pertanyaan Lengkap Ter-render (KaTeX, Tabel, Gambar) */}
                        <div
                          className="text-xs md:text-sm text-slate-800 leading-relaxed break-words font-medium cbt-rendered-content"
                          dangerouslySetInnerHTML={{ __html: renderFormattedMath(q.pertanyaan || '') }}
                        />

                        {/* Opsi Jawaban Ter-render Lengkap dengan KaTeX */}
                        {q.opsi && q.opsi.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                            {q.opsi.map((op, oIdx) => {
                              const isKey = op.key === q.kunci_jawaban || op.is_kunci
                              return (
                                <div
                                  key={oIdx}
                                  className={`px-3 py-2 rounded-xl text-xs border flex items-center gap-2.5 transition-all ${
                                    isKey
                                      ? 'bg-emerald-100/80 border-emerald-400 text-emerald-950 font-bold ring-1 ring-emerald-500/20'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                    isKey ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {op.key}
                                  </span>
                                  <div
                                    className="flex-1 min-w-0 leading-normal cbt-rendered-content text-xs sm:text-sm"
                                    dangerouslySetInnerHTML={{ __html: renderFormattedMath(op.text || op.content || '') }}
                                  />
                                  {isKey && (
                                    <span className="text-[10px] font-extrabold text-emerald-700 shrink-0 bg-emerald-200/60 px-1.5 py-0.5 rounded">
                                      Kunci
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* FOOTER MODAL */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={step === 2 ? () => setStep(1) : onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {step === 2 ? '← Ganti Bank Soal' : 'Batal'}
          </button>

          {step === 2 && (
            <button
              type="button"
              disabled={selectedQIds.size === 0}
              onClick={handleConfirmInsert}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Masukkan {selectedQIds.size} Soal Terpilih →</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
