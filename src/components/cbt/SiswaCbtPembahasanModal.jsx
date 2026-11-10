import React, { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (isOpen && pesertaId && sesi) {
      fetchReviewData()
    }
  }, [isOpen, pesertaId, sesi])

  const fetchReviewData = async () => {
    setLoading(true)
    try {
      // 1. Utamakan RPC aman fn_cbt_get_student_review (sudah menyertakan pembahasan guru & filter jawaban milik siswa ini saja)
      const { data: rpcReview, error: rpcErr } = await supabase.rpc('fn_cbt_get_student_review', {
        p_peserta_id: pesertaId
      })

      if (!rpcErr && Array.isArray(rpcReview) && rpcReview.length > 0) {
        setReviewItems(rpcReview)
        return
      }

      // 2. Fallback: Ambil seluruh soal untuk bank soal ini
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

      // Ambil hasil penilaian HANYA untuk jawaban milik peserta ini (tidak mengunduh seluruh sekolah)
      const jawabanIds = (jawabanList || []).map(j => j.id).filter(Boolean)
      let nilaiList = []
      if (jawabanIds.length > 0) {
        const { data: nData } = await supabase
          .from('cbt_penilaian_jawaban')
          .select('*')
          .in('jawaban_id', jawabanIds)
        nilaiList = nData || []
      }

      // Mapping gabungan
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-scale-up">
        {/* Header Modal */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              Pembahasan & Evaluasi Ujian
            </span>
            <h3 className="text-base md:text-lg font-bold text-slate-800">
              {sesi.judul} ({sesi.mapel})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <span className="animate-spin inline-block text-2xl mb-2">⟳</span>
            <p className="text-xs">Memuat lembar pembahasan soal...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Kolom Kiri: Palet Nomor */}
            <div className="w-full md:w-56 p-4 border-r border-slate-100 bg-slate-50/50 overflow-y-auto">
              <div className="text-xs font-bold text-slate-700 mb-2">
                Nomor Soal ({reviewItems.length})
              </div>
              <div className="grid grid-cols-5 md:grid-cols-4 gap-1.5">
                {reviewItems.map((item, idx) => {
                  let badge = 'bg-slate-200 text-slate-700'
                  if (item.is_correct === true) {
                    badge = 'bg-emerald-500 text-white'
                  } else if (item.is_correct === false) {
                    badge = 'bg-rose-500 text-white'
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedNumber(idx)}
                      className={`h-8 rounded-lg text-xs font-bold transition-all ${badge} ${
                        selectedNumber === idx ? 'ring-2 ring-indigo-500 ring-offset-2' : 'hover:opacity-80'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 space-y-1 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500"></span> Benar
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-500"></span> Salah / Kurang Tepat
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Detail Soal & Jawaban */}
            <div className="flex-1 p-5 md:p-6 overflow-y-auto space-y-4">
              {currentItem ? (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-indigo-600">
                      Soal Nomor {selectedNumber + 1}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      currentItem.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {currentItem.is_correct ? 'Jawaban Benar' : 'Jawaban Salah / Parsial'}
                    </span>
                  </div>

                  {/* Konten Pertanyaan */}
                  <div 
                    className="text-sm md:text-base text-slate-800 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderFormattedMath(currentItem.pertanyaan) }}
                  />

                  {/* Jawaban Siswa */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                    <span className="text-slate-400 font-semibold block">Jawaban yang Anda Pilih:</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {currentItem.jawaban_siswa || '(Tidak dijawab)'}
                    </span>
                  </div>

                  {/* Pembahasan Guru */}
                  {currentItem.pembahasan && (
                    <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5 text-xs text-indigo-900">
                      <span className="font-bold flex items-center gap-1.5 text-indigo-700">
                        <svg className="w-4 h-4 shrink-0 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Penjelasan / Rubrik Guru:
                      </span>
                      <div 
                        className="leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderFormattedMath(currentItem.pembahasan) }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-slate-400 py-12">Pilih nomor soal untuk menelaah.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
