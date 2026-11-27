import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { renderFormattedMath } from './CbtSoalRenderer'

export default function SiswaCbtPembahasanModal({
  pesertaId,
  sesi,
  isOpen,
  onClose
}) {
  const [loading, setLoading] = useState(true)
  const [reviewItems, setReviewItems] = useState([])
  const [selectedNumber, setSelectedNumber] = useState(0)
  const [showMobileGridModal, setShowMobileGridModal] = useState(false)
  const mobilePillRef = useRef(null)

  useEffect(() => {
    if (isOpen && pesertaId && sesi) {
      setSelectedNumber(0)
      fetchReviewData()
    }
  }, [isOpen, pesertaId, sesi])

  // Keyboard navigation (Panah Kiri / Kanan)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        setSelectedNumber(prev => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight') {
        setSelectedNumber(prev => Math.min(reviewItems.length - 1, prev + 1))
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, reviewItems.length, onClose])

  // Scroll active mobile pill into view smoothly
  useEffect(() => {
    if (mobilePillRef.current) {
      const activeEl = mobilePillRef.current.children[selectedNumber]
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [selectedNumber])

  const fetchReviewData = async () => {
    setLoading(true)
    try {
      // 1. Utamakan RPC aman fn_cbt_get_student_review (sudah menyertakan pembahasan guru, kunci, & skor)
      const { data: rpcReview, error: rpcErr } = await supabase.rpc('fn_cbt_get_student_review', {
        p_peserta_id: pesertaId
      })

      if (!rpcErr && Array.isArray(rpcReview) && rpcReview.length > 0) {
        setReviewItems(rpcReview)
        return
      }

      // 2. Fallback: Ambil soal & jawaban peserta jika RPC belum dibuat
      const { data: soalList, error: errSoal } = await supabase
        .from('cbt_soal')
        .select(`
          id,
          nomor_urut,
          tipe_soal,
          pertanyaan,
          opsi,
          bobot
        `)
        .eq('bank_soal_id', sesi.bank_soal_id)
        .order('nomor_urut', { ascending: true })

      if (errSoal) throw errSoal

      // Ambil jawaban siswa khusus peserta ini
      const { data: jawabanList, error: errJwb } = await supabase
        .from('cbt_jawaban_siswa')
        .select(`
          id,
          soal_id,
          jawaban_terpilih,
          is_ragu
        `)
        .eq('peserta_id', pesertaId)

      if (errJwb) throw errJwb

      // Ambil hasil penilaian
      const jawabanIds = (jawabanList || []).map(j => j.id).filter(Boolean)
      let nilaiList = []
      if (jawabanIds.length > 0) {
        const { data: nData } = await supabase
          .from('cbt_penilaian_jawaban')
          .select('*')
          .in('jawaban_id', jawabanIds)
        nilaiList = nData || []
      }

      const jwbMap = {}
      jawabanList?.forEach(j => { jwbMap[j.soal_id] = j })
      const nilaiMap = {}
      nilaiList?.forEach(n => { nilaiMap[n.jawaban_id] = n })

      const combined = (soalList || []).map(soal => {
        const jwb = jwbMap[soal.id]
        const pen = jwb ? nilaiMap[jwb.id] : null
        return {
          ...soal,
          jawaban_siswa: jwb?.jawaban_terpilih || null,
          is_correct: pen?.is_correct ?? null,
          skor: pen?.skor ?? 0
        }
      })

      setReviewItems(combined)
    } catch (err) {
      console.error('Gagal memuat pembahasan:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const currentItem = reviewItems[selectedNumber]

  // Hitung ringkasan statistik
  const totalScore = reviewItems.reduce((acc, curr) => acc + (Number(curr.skor) || 0), 0)
  const totalBobot = reviewItems.reduce((acc, curr) => acc + (Number(curr.bobot) || 1), 0)
  const countBenar = reviewItems.filter(i => i.is_correct === true).length
  const countSalah = reviewItems.filter(i => i.is_correct === false).length
  const percentScore = totalBobot > 0 ? Math.round((totalScore / totalBobot) * 100) : 0

  // Ekstraksi opsi untuk soal pilihan ganda
  const getParsedOptions = (soal) => {
    if (!soal || !soal.opsi) return []
    let opts = soal.opsi
    if (typeof opts === 'string') {
      try {
        opts = JSON.parse(opts)
      } catch (_) {
        return []
      }
    }
    if (Array.isArray(opts)) {
      return opts.map((opt, idx) => {
        const key = opt?.key || String.fromCharCode(65 + idx)
        const text = typeof opt === 'object' ? (opt?.text || opt?.teks || opt?.content || '') : String(opt || '')
        return { key, text }
      })
    }
    if (typeof opts === 'object' && opts !== null) {
      return Object.entries(opts).map(([k, v]) => ({
        key: k,
        text: typeof v === 'object' ? (v?.text || v?.teks || '') : String(v || '')
      }))
    }
    return []
  }

  const parsedOptions = getParsedOptions(currentItem)
  const isPG = currentItem?.tipe_soal === 'pilihan_ganda' || currentItem?.tipe_soal === 'pg' || (!currentItem?.tipe_soal && parsedOptions.length > 0)
  const isPGK = currentItem?.tipe_soal === 'pilihan_ganda_kompleks' || currentItem?.tipe_soal === 'pg_kompleks'
  const isBenarSalah = currentItem?.tipe_soal === 'benar_salah'
  const isIsian = currentItem?.tipe_soal === 'isian_singkat' || currentItem?.tipe_soal === 'isian'
  const isUraian = currentItem?.tipe_soal === 'uraian' || currentItem?.tipe_soal === 'essay'
  const isMenjodohkan = currentItem?.tipe_soal === 'menjodohkan'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white md:rounded-3xl w-full max-w-5xl h-full md:h-[92vh] flex flex-col shadow-2xl border-0 md:border border-slate-100 overflow-hidden animate-scale-up">
        
        {/* HEADER MODAL PEMBAHASAN */}
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-[10px] md:text-[11px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Pembahasan & Evaluasi Ujian
              </span>
              <span className="text-[10px] md:text-[11px] font-bold text-slate-500">
                {sesi.mapel || 'Mata Pelajaran'}
              </span>
            </div>
            <h3 className="text-sm md:text-base font-bold text-slate-900 truncate" title={sesi.judul}>
              {sesi.judul}
            </h3>
          </div>

          {/* Quick Score Badge & Close Button */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold">
              <span className="text-emerald-600 font-extrabold">{countBenar} Benar</span>
              <span className="text-slate-300">•</span>
              <span className="text-rose-600 font-extrabold">{countSalah} Salah</span>
              <span className="text-slate-300">•</span>
              <span className="text-indigo-600 font-extrabold">Nilai: {percentScore}</span>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all active:scale-95"
              title="Tutup Pembahasan (Esc)"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* STRIP NOMOR SOAL KHUSUS HP (Horizontal Scroll - Menghemat Tinggi Layar!) */}
        {!loading && reviewItems.length > 0 && (
          <div className="md:hidden bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
            <div 
              ref={mobilePillRef}
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1"
            >
              {reviewItems.map((item, idx) => {
                let badgeColor = 'bg-slate-200 text-slate-700'
                if (item.is_correct === true) {
                  badgeColor = 'bg-emerald-500 text-white'
                } else if (item.is_correct === false) {
                  badgeColor = 'bg-rose-500 text-white'
                }

                const isActive = selectedNumber === idx

                return (
                  <button
                    key={item.id || idx}
                    onClick={() => setSelectedNumber(idx)}
                    className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-bold shrink-0 transition-all ${badgeColor} ${
                      isActive 
                        ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105 shadow-xs font-black' 
                        : 'opacity-90 hover:opacity-100'
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>

            {/* Tombol Grid Popup untuk HP jika ingin melompat jauh */}
            <button
              onClick={() => setShowMobileGridModal(true)}
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 shrink-0 shadow-2xs text-xs font-bold flex items-center gap-1"
              title="Buka Palet Semua Nomor"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              <span className="hidden xs:inline">Daftar</span>
            </button>
          </div>
        )}

        {/* BODY UTAMA: SIDEBAR DESKTOP + KONTEN SOAL LAPANG */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <span className="animate-spin inline-block text-3xl mb-3 text-indigo-600">⟳</span>
            <p className="text-sm font-semibold text-slate-600">Memuat lembar pembahasan & evaluasi...</p>
            <p className="text-xs text-slate-400 mt-1">Mengambil kunci jawaban, penskoran, dan rubrik guru</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* SIDEBAR PALET NOMOR KHUSUS DESKTOP */}
            <div className="hidden md:flex md:w-60 flex-col border-r border-slate-100 bg-slate-50/60 p-4 overflow-y-auto shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700">
                  Daftar Soal ({reviewItems.length})
                </span>
                <span className="text-[11px] font-mono font-bold text-indigo-600">
                  {selectedNumber + 1}/{reviewItems.length}
                </span>
              </div>

              {/* Grid Nomor */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {reviewItems.map((item, idx) => {
                  let badge = 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  if (item.is_correct === true) {
                    badge = 'bg-emerald-500 text-white hover:bg-emerald-600'
                  } else if (item.is_correct === false) {
                    badge = 'bg-rose-500 text-white hover:bg-rose-600'
                  }

                  const isActive = selectedNumber === idx

                  return (
                    <button
                      key={item.id || idx}
                      onClick={() => setSelectedNumber(idx)}
                      className={`h-9 rounded-xl text-xs font-bold transition-all shadow-2xs ${badge} ${
                        isActive 
                          ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105 font-black z-10' 
                          : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>

              {/* Legend Status Nilai */}
              <div className="mt-auto pt-4 border-t border-slate-200 space-y-2 text-[11px] font-medium text-slate-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span>Jawaban Benar</span>
                  </div>
                  <span className="font-bold text-emerald-700">{countBenar}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span>Jawaban Salah</span>
                  </div>
                  <span className="font-bold text-rose-700">{countSalah}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold text-slate-800">
                  <span>Total Poin:</span>
                  <span className="text-indigo-600 font-mono">{totalScore} / {totalBobot}</span>
                </div>
              </div>
            </div>

            {/* MAIN CONTENT STAGE: SOAL, OPSI, & PEMBAHASAN GURU */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col justify-between">
              {currentItem ? (
                <div className="max-w-3xl mx-auto w-full space-y-6">
                  
                  {/* Top Bar Informasi Butir Soal */}
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                        {selectedNumber + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          Soal Nomor {selectedNumber + 1}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {currentItem.tipe_soal ? currentItem.tipe_soal.replace(/_/g, ' ') : 'Pilihan Ganda'}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge & Poin */}
                    <div className="flex items-center gap-2">
                      {currentItem.is_correct === true && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-extrabold shadow-2xs">
                          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Benar (+{currentItem.skor ?? currentItem.bobot} Poin)</span>
                        </div>
                      )}

                      {currentItem.is_correct === false && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-extrabold shadow-2xs">
                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Salah (0 / {currentItem.bobot || 1} Poin)</span>
                        </div>
                      )}

                      {currentItem.is_correct === null && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs font-extrabold shadow-2xs">
                          <span>Belum Dinilai ({currentItem.skor || 0} / {currentItem.bobot || 1} Poin)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KONTEN TEKS PERTANYAAN (Besar, Jelas, & Math Rendered) */}
                  <div className="bg-white rounded-2xl p-4 md:p-6 border border-slate-200/80 shadow-2xs">
                    <div 
                      className="text-sm md:text-base text-slate-900 leading-relaxed font-normal"
                      dangerouslySetInnerHTML={{ __html: renderFormattedMath(currentItem.pertanyaan) }}
                    />
                  </div>

                  {/* PILIHAN JAWABAN PERSIS SEPERTI MODE UJIAN */}
                  {isPG && parsedOptions.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Pilihan Jawaban:</span>
                        <span className="text-[11px] font-normal text-slate-400">Status evaluasi pilihan Anda</span>
                      </div>

                      {parsedOptions.map((opt, oIdx) => {
                        const optKey = (opt.key || String.fromCharCode(65 + oIdx)).toUpperCase()
                        const studentPick = String(currentItem.jawaban_siswa || '').trim().toUpperCase()
                        const keyAnswer = String(currentItem.kunci_jawaban || '').trim().toUpperCase()

                        const isStudentPick = studentPick === optKey
                        const isKeyAnswer = keyAnswer ? keyAnswer === optKey : (currentItem.is_correct === true && isStudentPick)

                        let cardClass = 'bg-white border-slate-200 text-slate-700'
                        let badgeLabel = null
                        let badgeClass = ''

                        if (isStudentPick && (isKeyAnswer || currentItem.is_correct === true)) {
                          cardClass = 'bg-emerald-50/90 border-2 border-emerald-500 text-emerald-950 shadow-xs'
                          badgeLabel = '✓ Jawaban Anda (Benar)'
                          badgeClass = 'bg-emerald-600 text-white'
                        } else if (isStudentPick && !isKeyAnswer) {
                          cardClass = 'bg-rose-50/90 border-2 border-rose-500 text-rose-950 shadow-xs'
                          badgeLabel = '✗ Pilihan Anda (Salah)'
                          badgeClass = 'bg-rose-600 text-white'
                        } else if (!isStudentPick && isKeyAnswer) {
                          cardClass = 'bg-emerald-50/50 border-2 border-emerald-400 border-dashed text-emerald-900'
                          badgeLabel = '✓ Kunci Jawaban Benar'
                          badgeClass = 'bg-emerald-100 text-emerald-800'
                        }

                        return (
                          <div
                            key={optKey}
                            className={`p-3.5 md:p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs md:text-sm transition-all ${cardClass}`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className={`w-7 h-7 rounded-xl font-bold flex items-center justify-center text-xs shrink-0 transition-all ${
                                isStudentPick 
                                  ? (isKeyAnswer || currentItem.is_correct ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white')
                                  : (isKeyAnswer ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600')
                              }`}>
                                {optKey}
                              </span>
                              <div
                                className="leading-relaxed flex-1 break-words font-medium"
                                dangerouslySetInnerHTML={{ __html: renderFormattedMath(opt.text || opt.teks || opt) }}
                              />
                            </div>

                            {badgeLabel && (
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] md:text-xs font-black shrink-0 ${badgeClass}`}>
                                {badgeLabel}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* JAWABAN ISIAN SINGKAT / URAIAN */}
                  {(isIsian || isUraian) && (
                    <div className="space-y-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1.5 text-xs">
                        <span className="text-slate-500 font-bold block">Jawaban yang Anda Tulis:</span>
                        <div className="font-mono text-sm md:text-base text-slate-900 bg-white p-3 rounded-xl border border-slate-200">
                          {currentItem.jawaban_siswa || <span className="text-slate-400 italic font-sans">(Tidak dijawab)</span>}
                        </div>
                      </div>

                      {currentItem.kunci_jawaban && (
                        <div className="bg-emerald-50/60 border border-emerald-300 rounded-2xl p-4 space-y-1.5 text-xs text-emerald-900">
                          <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                            <span>✓</span>
                            <span>Kunci Jawaban yang Diharapkan:</span>
                          </span>
                          <div className="font-mono font-bold text-sm text-emerald-950 bg-white p-3 rounded-xl border border-emerald-200">
                            {currentItem.kunci_jawaban}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KOTAK PEMBAHASAN / SOLUSI DARI GURU (Prominent & Elegan) */}
                  <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-indigo-50/30 border border-indigo-200 rounded-2xl p-5 md:p-6 shadow-xs space-y-2.5">
                    <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs md:text-sm">
                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0">
                        💡
                      </span>
                      <span>Pembahasan & Penjelasan Guru:</span>
                    </div>

                    {currentItem.pembahasan && currentItem.pembahasan.trim() !== '' ? (
                      <div 
                        className="text-xs md:text-sm text-slate-800 leading-relaxed font-normal bg-white/90 p-4 rounded-xl border border-indigo-100/80"
                        dangerouslySetInnerHTML={{ __html: renderFormattedMath(currentItem.pembahasan) }}
                      />
                    ) : (
                      <div className="text-xs text-slate-500 italic bg-white/60 p-3 rounded-xl border border-slate-200/60">
                        Belum ada catatan pembahasan khusus yang dimasukkan oleh guru untuk butir soal ini.
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="text-center text-slate-400 py-16">
                  Pilih salah satu nomor soal untuk menelaah evaluasi.
                </div>
              )}
            </div>
          </div>
        )}

        {/* FOOTER BAR NAVIGASI (Sticky di Bawah) */}
        {!loading && reviewItems.length > 0 && (
          <div className="px-4 py-3 md:px-6 md:py-3.5 bg-white border-t border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={() => setSelectedNumber(prev => Math.max(0, prev - 1))}
              disabled={selectedNumber === 0}
              className="py-2 px-3.5 md:px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs md:text-sm font-bold transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Sebelumnya</span>
            </button>

            {/* Nomor Aktif & Tombol Buka Sheet di HP */}
            <button
              onClick={() => setShowMobileGridModal(true)}
              className="px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs md:text-sm font-extrabold text-slate-800"
            >
              <span>Soal {selectedNumber + 1}</span>
              <span className="text-slate-400 font-normal">dari {reviewItems.length}</span>
              <svg className="w-3.5 h-3.5 text-slate-400 ml-1 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              onClick={() => setSelectedNumber(prev => Math.min(reviewItems.length - 1, prev + 1))}
              disabled={selectedNumber === reviewItems.length - 1}
              className="py-2 px-3.5 md:px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs md:text-sm font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>Selanjutnya</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* MOBILE BOTTOM SHEET MODAL (PALET SEMUA NOMOR UNTUK HP) */}
        {showMobileGridModal && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs md:hidden animate-fade-in">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Daftar Nomor Soal</h4>
                  <p className="text-[11px] text-slate-400">Pilih nomor untuk langsung membuka pembahasan</p>
                </div>
                <button
                  onClick={() => setShowMobileGridModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-5 gap-2">
                  {reviewItems.map((item, idx) => {
                    let badge = 'bg-slate-200 text-slate-700'
                    if (item.is_correct === true) {
                      badge = 'bg-emerald-500 text-white'
                    } else if (item.is_correct === false) {
                      badge = 'bg-rose-500 text-white'
                    }

                    const isActive = selectedNumber === idx

                    return (
                      <button
                        key={item.id || idx}
                        onClick={() => {
                          setSelectedNumber(idx)
                          setShowMobileGridModal(false)
                        }}
                        className={`h-11 rounded-xl text-xs font-bold transition-all ${badge} ${
                          isActive ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105 font-black shadow-sm' : ''
                        }`}
                      >
                        {idx + 1}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-around text-xs text-slate-600 font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Benar ({countBenar})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span> Salah ({countSalah})
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
