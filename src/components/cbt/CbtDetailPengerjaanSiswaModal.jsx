import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { renderFormattedMath } from './CbtSoalRenderer'
import { useToast } from '../../utils/useToast'
import { useConfirm } from '../../utils/useConfirm'

export default function CbtDetailPengerjaanSiswaModal({
  sesi: propSesi,
  sesiId: propSesiId,
  initialPesertaId,
  pesertaId: propPesertaId,
  allPeserta: propAllPeserta = [],
  allPesertaList: propAllPesertaList,
  isFullPage = true,
  onBack,
  onClose,
  onPesertaUpdated,
  onStudentChange,
  onGraded
}) {
  const { showToast, ToastComponent } = useToast()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const [currentPesertaId, setCurrentPesertaId] = useState(propPesertaId || initialPesertaId)
  const [sesi, setSesi] = useState(propSesi || null)
  const [loading, setLoading] = useState(true)
  const [savingScore, setSavingScore] = useState(false)
  const [overrideScoreInput, setOverrideScoreInput] = useState('')

  const [peserta, setPeserta] = useState(null)
  const [soalList, setSoalList] = useState([])
  const [kunciMap, setKunciMap] = useState({}) // soal_id -> { kunci_jawaban, pembahasan }
  const [jawabanMap, setJawabanMap] = useState({}) // soal_id -> { id, jawaban_terpilih, is_ragu, waktu_jawab }
  const [penilaianMap, setPenilaianMap] = useState({}) // jawaban_id -> { id, is_correct, skor, catatan_guru }

  // State untuk edit nilai uraian per butir soal
  const [essayScores, setEssayScores] = useState({}) // soal_id -> score number
  const [savingEssayId, setSavingEssayId] = useState(null)

  // State filter kelas & cari nama
  const [filterKelas, setFilterKelas] = useState('all')
  const [searchStudentQuery, setSearchStudentQuery] = useState('')
  const [enrichedAllPeserta, setEnrichedAllPeserta] = useState([])

  // Enrich allPeserta dengan nama asli dari siswa_lengkap jika siswa_nama masih kosong
  useEffect(() => {
    const rawList = propAllPesertaList || propAllPeserta || []
    if (rawList.length === 0) {
      setEnrichedAllPeserta([])
      return
    }

    const missingNisns = rawList
      .filter(p => !p.siswa_nama || !p.kelas)
      .map(p => p.siswa_nisn)
      .filter(Boolean)

    if (missingNisns.length > 0) {
      supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .in('nisn', missingNisns)
        .then(({ data }) => {
          const map = {}
          ;(data || []).forEach(s => { map[s.nisn] = s })
          const enriched = rawList.map(p => {
            const s = map[p.siswa_nisn]
            return {
              ...p,
              siswa_nama: p.siswa_nama || s?.nama_lengkap || p.siswa_nisn,
              kelas: p.kelas || s?.kelas || ''
            }
          })
          enriched.sort((a, b) => (a.siswa_nama || '').localeCompare(b.siswa_nama || ''))
          setEnrichedAllPeserta(enriched)
        })
    } else {
      const sorted = [...rawList].sort((a, b) => (a.siswa_nama || '').localeCompare(b.siswa_nama || ''))
      setEnrichedAllPeserta(sorted)
    }
  }, [propAllPesertaList, propAllPeserta])

  // List kelas unik yang tersedia
  const availableClasses = useMemo(() => {
    const fromSesi = sesi?.kelas_ids || []
    const fromPeserta = enrichedAllPeserta.map(p => p.kelas).filter(Boolean)
    const set = new Set([...fromSesi, ...fromPeserta])
    return Array.from(set).sort()
  }, [sesi?.kelas_ids, enrichedAllPeserta])

  // Filter siswa berdasarkan Kelas dan Pencarian Nama
  const filteredPeserta = useMemo(() => {
    return enrichedAllPeserta.filter(p => {
      if (filterKelas !== 'all' && p.kelas && p.kelas !== filterKelas) {
        return false
      }
      if (searchStudentQuery.trim() !== '') {
        const q = searchStudentQuery.toLowerCase()
        const nameMatch = (p.siswa_nama || '').toLowerCase().includes(q)
        const nisnMatch = (p.siswa_nisn || '').includes(q)
        return nameMatch || nisnMatch
      }
      return true
    })
  }, [enrichedAllPeserta, filterKelas, searchStudentQuery])

  // Indeks siswa saat ini untuk navigasi cepat
  const currentStudentIndex = useMemo(() => {
    return filteredPeserta.findIndex(p => String(p.id) === String(currentPesertaId))
  }, [filteredPeserta, currentPesertaId])

  const handlePrevStudent = () => {
    if (currentStudentIndex > 0) {
      const prev = filteredPeserta[currentStudentIndex - 1]
      setCurrentPesertaId(prev.id)
      onStudentChange?.(prev.id)
    }
  }

  const handleNextStudent = () => {
    if (currentStudentIndex >= 0 && currentStudentIndex < filteredPeserta.length - 1) {
      const next = filteredPeserta[currentStudentIndex + 1]
      setCurrentPesertaId(next.id)
      onStudentChange?.(next.id)
    }
  }

  // Update currentPesertaId jika prop berubah
  useEffect(() => {
    if (propPesertaId) setCurrentPesertaId(propPesertaId)
  }, [propPesertaId])

  // Update sesi jika propSesi berubah
  useEffect(() => {
    if (propSesi) setSesi(propSesi)
  }, [propSesi])

  // Fetch sesi jika bank_soal_id belum tersedia
  useEffect(() => {
    const targetSesiId = propSesi?.id || propSesiId
    if (!sesi?.bank_soal_id && targetSesiId) {
      supabase
        .from('cbt_sesi_ujian')
        .select('*')
        .eq('id', targetSesiId)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setSesi(data)
          }
        })
    }
  }, [propSesi, propSesiId, sesi?.bank_soal_id])

  // 1. Fetch data lengkap pengerjaan siswa
  useEffect(() => {
    if (!currentPesertaId) return
    fetchStudentDetail(currentPesertaId, sesi?.bank_soal_id)
  }, [currentPesertaId, sesi?.bank_soal_id])

  const fetchStudentDetail = async (targetPesertaId, bankSoalIdOverride) => {
    setLoading(true)
    try {
      // 1. Ambil detail peserta
      const { data: pData, error: pErr } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('id', targetPesertaId)
        .single()

      if (pErr) throw pErr

      // Pastikan nama siswa dan kelas terisi dari siswa_lengkap jika di record peserta kosong
      if (!pData.siswa_nama && pData.siswa_nisn) {
        try {
          const { data: sRow } = await supabase
            .from('siswa_lengkap')
            .select('nama_lengkap, kelas')
            .eq('nisn', pData.siswa_nisn)
            .maybeSingle()
          if (sRow?.nama_lengkap) {
            pData.siswa_nama = sRow.nama_lengkap
            if (!pData.kelas) pData.kelas = sRow.kelas
          }
        } catch (ignored) {}
      }

      setPeserta(pData)
      setOverrideScoreInput(pData.nilai_akhir !== null && pData.nilai_akhir !== undefined ? String(pData.nilai_akhir) : '')

      // Jika bank_soal_id belum ada di state sesi, coba ambil dari sesi peserta
      let targetBankId = bankSoalIdOverride || sesi?.bank_soal_id
      if (!targetBankId && pData?.sesi_id) {
        const { data: sRow } = await supabase
          .from('cbt_sesi_ujian')
          .select('id, judul, mapel, bank_soal_id')
          .eq('id', pData.sesi_id)
          .single()
        if (sRow) {
          targetBankId = sRow.bank_soal_id
          setSesi(sRow)
        }
      }

      // 2. Ambil seluruh butir soal dari bank soal sesi ini
      let qList = []
      if (targetBankId) {
        const { data: sData, error: sErr } = await supabase
          .from('cbt_soal')
          .select('id, nomor_urut, tipe_soal, pertanyaan, opsi, bobot')
          .eq('bank_soal_id', targetBankId)
          .order('nomor_urut', { ascending: true })

        if (sErr) throw sErr
        qList = sData || []
      }
      setSoalList(qList)

      const soalIds = qList.map(q => q.id)

      // 3. Ambil kunci jawaban & pembahasan (hanya guru yang punya hak akses)
      if (soalIds.length > 0) {
        const { data: kData } = await supabase
          .from('cbt_soal_kunci')
          .select('soal_id, kunci_jawaban, pembahasan')
          .in('soal_id', soalIds)

        const kMap = {}
        ;(kData || []).forEach(k => {
          kMap[k.soal_id] = k
        })
        setKunciMap(kMap)
      }

      // 4. Ambil jawaban siswa untuk peserta ini
      const { data: jData, error: jErr } = await supabase
        .from('cbt_jawaban_siswa')
        .select('*')
        .eq('peserta_id', targetPesertaId)

      if (jErr) throw jErr
      const jMap = {}
      const jIds = []
      ;(jData || []).forEach(j => {
        jMap[j.soal_id] = j
        jIds.push(j.id)
      })
      setJawabanMap(jMap)

      // 5. Ambil data penilaian (skor per butir & koreksi uraian)
      if (jIds.length > 0) {
        const { data: penData } = await supabase
          .from('cbt_penilaian_jawaban')
          .select('*')
          .in('jawaban_id', jIds)

        const penMap = {}
        const essayMap = {}
        ;(penData || []).forEach(p => {
          penMap[p.jawaban_id] = p
        })
        setPenilaianMap(penMap)

        // Pre-fill skor uraian
        qList.forEach(q => {
          const j = jMap[q.id]
          if (j && penMap[j.id]) {
            essayMap[q.id] = penMap[j.id].skor ?? 0
          } else {
            essayMap[q.id] = 0
          }
        })
        setEssayScores(essayMap)
      }

    } catch (err) {
      console.error('Gagal memuat detail pengerjaan siswa:', err)
      showToast('Gagal memuat detail pengerjaan: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Helper kalkulasi durasi pengerjaan
  const durasiFormatted = useMemo(() => {
    if (!peserta?.waktu_mulai) return '-'
    const start = new Date(peserta.waktu_mulai).getTime()
    const end = peserta.waktu_selesai ? new Date(peserta.waktu_selesai).getTime() : Date.now()
    const diffSec = Math.max(0, Math.floor((end - start) / 1000))
    const m = Math.floor(diffSec / 60)
    const s = diffSec % 60
    return `${m}m ${s}s`
  }, [peserta])

  // Helper tanggal selesai
  const dikumpulkanFormatted = useMemo(() => {
    if (!peserta?.waktu_selesai) return '-'
    return new Date(peserta.waktu_selesai).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [peserta])

  // Helper parsing opsi soal
  const parseOpsi = (rawOpsi) => {
    if (!rawOpsi) return []
    if (Array.isArray(rawOpsi)) return rawOpsi
    try {
      const parsed = JSON.parse(rawOpsi)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  // Hitung jumlah terjawab, benar, salah, belum dikerjakan, dan total bobot
  const stats = useMemo(() => {
    let totalBobot = 0
    let totalPoinDiperoleh = 0
    let dijawabCount = 0
    let benarCount = 0
    let salahCount = 0
    let belumCount = 0

    soalList.forEach(soal => {
      totalBobot += Number(soal.bobot || 1)
      const j = jawabanMap[soal.id]
      const pen = j ? penilaianMap[j.id] : null
      const studentAns = j?.jawaban_terpilih
      const hasAnswer = studentAns !== null && studentAns !== undefined && studentAns !== '' && studentAns !== '[]' && studentAns !== '{}'

      if (hasAnswer) {
        dijawabCount++
        if (pen) {
          totalPoinDiperoleh += Number(pen.skor || 0)
          if (pen.is_correct || Number(pen.skor) >= Number(soal.bobot || 1)) {
            benarCount++
          } else if (Number(pen.skor) > 0) {
            // Parsial PG Kompleks (hitung sebagai benar parsial)
            benarCount++
          } else {
            salahCount++
          }
        } else {
          if (soal.tipe_soal !== 'uraian') {
            salahCount++
          }
        }
      } else {
        belumCount++
      }
    })

    return {
      totalSoal: soalList.length,
      dijawabCount,
      totalBobot,
      totalPoinDiperoleh: Math.round(totalPoinDiperoleh * 100) / 100,
      benarCount,
      salahCount,
      belumCount
    }
  }, [soalList, jawabanMap, penilaianMap])

  // Scroll halus ke butir soal tertentu dari palet nomor
  const scrollToSoal = (soalIndex) => {
    const el = document.getElementById(`soal-card-${soalIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Simpan nilai manual soal uraian / essay
  const handleSaveEssayScore = async (soal) => {
    const j = jawabanMap[soal.id]
    if (!j) {
      showToast('Siswa tidak mengisi jawaban untuk butir ini.', 'warning')
      return
    }

    const inputScore = Number(essayScores[soal.id] ?? 0)
    const maxBobot = Number(soal.bobot || 1)

    if (isNaN(inputScore) || inputScore < 0 || inputScore > maxBobot) {
      showToast(`Skor harus berupa angka antara 0 dan ${maxBobot}.`, 'error')
      return
    }

    setSavingEssayId(soal.id)
    try {
      const isCorrect = inputScore >= maxBobot
      const { error: penErr } = await supabase
        .from('cbt_penilaian_jawaban')
        .upsert({
          jawaban_id: j.id,
          skor: inputScore,
          is_correct: isCorrect,
          dinilai_oleh: sesi.guru_id || null,
          catatan_guru: 'Koreksi manual uraian oleh guru'
        }, { onConflict: 'jawaban_id' })

      if (penErr) throw penErr

      // Perbarui local state penilaian
      setPenilaianMap(prev => ({
        ...prev,
        [j.id]: {
          ...(prev[j.id] || {}),
          jawaban_id: j.id,
          skor: inputScore,
          is_correct: isCorrect
        }
      }))

      // Hitung ulang total nilai_akhir peserta
      const { data: allPen } = await supabase
        .from('cbt_penilaian_jawaban')
        .select('skor')
        .in('jawaban_id', Object.values(jawabanMap).map(x => x.id))

      const newTotal = (allPen || []).reduce((acc, curr) => acc + Number(curr.skor || 0), 0)
      const finalScore = Math.min(100, Math.round((newTotal / (stats.totalBobot || 1)) * 10000) / 100)

      await supabase
        .from('cbt_peserta_ujian')
        .update({ nilai_akhir: finalScore })
        .eq('id', currentPesertaId)

      setPeserta(prev => ({ ...prev, nilai_akhir: finalScore }))
      setOverrideScoreInput(String(finalScore))
      onPesertaUpdated?.(currentPesertaId, finalScore)

      showToast(`Skor soal nomor ${soal.nomor_urut} berhasil disimpan!`, 'success')
    } catch (err) {
      console.error('Gagal menyimpan skor uraian:', err)
      showToast('Gagal menyimpan skor: ' + err.message, 'error')
    } finally {
      setSavingEssayId(null)
    }
  }

  // Simpan override nilai akhir langsung
  const handleSaveOverrideNilai = async () => {
    const val = parseFloat(overrideScoreInput)
    if (isNaN(val) || val < 0 || val > 100) {
      showToast('Nilai harus berupa angka antara 0 dan 100.', 'error')
      return
    }

    setSavingScore(true)
    try {
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          nilai_akhir: Math.round(val * 100) / 100
        })
        .eq('id', currentPesertaId)

      if (error) throw error

      setPeserta(prev => ({ ...prev, nilai_akhir: val }))
      onPesertaUpdated?.(currentPesertaId, val)
      showToast(`Nilai akhir ${peserta?.siswa_nama || 'siswa'} berhasil disimpan (${val})!`, 'success')
    } catch (err) {
      console.error('Gagal simpan override nilai:', err)
      showToast('Gagal menyimpan nilai: ' + err.message, 'error')
    } finally {
      setSavingScore(false)
    }
  }

  const renderContent = (
    <div className={isFullPage ? "bg-white w-full rounded-2xl shadow-xs border border-slate-200/80 flex flex-col" : "bg-slate-50 w-full max-w-7xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[96vh]"}>
      
      {/* TOP BAR / BREADCRUMB HEADER */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onBack || onClose}
            className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 hover:text-slate-900 font-bold text-xs rounded-xl border border-slate-200/80 shadow-2xs transition-all cursor-pointer group"
            title="Kembali"
          >
            <svg className="w-4 h-4 text-slate-600 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Kembali</span>
          </button>

          <div className="h-7 w-px bg-slate-200 hidden sm:block"></div>

          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold mb-0.5">
              <button
                type="button"
                onClick={onBack || onClose}
                className="hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
              >
                Daftar Pengumpulan
              </button>
              <span>/</span>
              <span className="text-indigo-600 font-bold truncate max-w-[180px] sm:max-w-xs">{peserta?.siswa_nama || 'Detail Pengerjaan'}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight">{sesi?.judul || 'Sesi Ujian'}</h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold shadow-2xs">
                {peserta?.status === 'selesai' ? 'Selesai' : (peserta?.status || 'Aktif')}
              </span>
            </div>
          </div>
        </div>

        {/* STUDENT SWITCHER DROPDOWN (KANAN ATAS) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* 1. Filter Kelas */}
          {availableClasses.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400">Kelas:</span>
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Semua Kelas</option>
                {availableClasses.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          )}

          {/* 2. Cari Nama Siswa */}
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchStudentQuery}
              onChange={(e) => setSearchStudentQuery(e.target.value)}
              placeholder="Cari nama murid..."
              className="w-28 sm:w-36 md:w-44 px-2.5 py-1.5 pl-7 text-xs font-medium rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-2xs"
            />
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchStudentQuery && (
              <button
                type="button"
                onClick={() => setSearchStudentQuery('')}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* 3. Tombol Prev / Next Sesuai Absen */}
          {filteredPeserta.length > 1 && (
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                disabled={currentStudentIndex <= 0}
                onClick={handlePrevStudent}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="Siswa Sebelumnya (Sesuai Absen)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                disabled={currentStudentIndex < 0 || currentStudentIndex >= filteredPeserta.length - 1}
                onClick={handleNextStudent}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                title="Siswa Berikutnya (Sesuai Absen)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}

          {/* 4. Dropdown Pilih Siswa (Nama Sesuai Absen) */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <span>👤</span>
            </span>
            <select
              value={currentPesertaId}
              onChange={(e) => {
                setCurrentPesertaId(e.target.value)
                onStudentChange?.(e.target.value)
              }}
              className="bg-transparent text-xs font-extrabold text-slate-800 outline-none cursor-pointer max-w-[140px] sm:max-w-[200px] md:max-w-xs truncate"
            >
              {filteredPeserta.length === 0 ? (
                <option value="">Tidak ada siswa</option>
              ) : (
                filteredPeserta.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {idx + 1}. {p.siswa_nama} {p.kelas ? `(${p.kelas})` : ''} {p.nilai_akhir !== null ? `[Nilai: ${p.nilai_akhir}]` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {!isFullPage && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* INFO STRIP */}
      <div className="bg-indigo-50/70 border-b border-indigo-100 px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-4 sm:gap-8 text-xs font-semibold text-slate-600 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">📅 Dikumpulkan:</span>
          <strong className="text-slate-800">{dikumpulkanFormatted}</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">⏱️ Durasi:</span>
          <strong className="text-slate-800">{durasiFormatted}</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">📝 Dijawab:</span>
          <strong className="text-slate-800">{stats.dijawabCount} / {stats.totalSoal}</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">📱 Perangkat:</span>
          <span className="text-slate-700">{peserta?.device_info || 'Web Browser'}</span>
        </div>
      </div>

      {/* CONTENT AREA (2 COLUMNS) */}
      <div className={isFullPage ? "p-4 sm:p-6 bg-slate-50/50" : "flex-1 overflow-y-auto p-4 sm:p-6"}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-sm font-semibold">Memuat lembar pengerjaan siswa...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* LEFT COLUMN: LIST SOAL & JAWABAN (8 COLS) */}
              <div className="lg:col-span-8 space-y-6">
                {soalList.map((soal, idx) => {
                  const j = jawabanMap[soal.id]
                  const pen = j ? penilaianMap[j.id] : null
                  const kunciObj = kunciMap[soal.id] || {}
                  const isUraian = soal.tipe_soal === 'uraian'
                  const isPG = soal.tipe_soal === 'pg' || soal.tipe_soal === 'benar_salah'
                  const isPGK = soal.tipe_soal === 'pg_kompleks'
                  const isIsian = soal.tipe_soal === 'isian'
                  const isMenjodohkan = soal.tipe_soal === 'menjodohkan'

                  const studentAnswer = j?.jawaban_terpilih
                  const hasAnswer = studentAnswer !== null && studentAnswer !== undefined && studentAnswer !== '' && studentAnswer !== '[]' && studentAnswer !== '{}'
                  const parsedOptions = parseOpsi(soal.opsi)

                  // Status benar/salah
                  const isCorrect = pen?.is_correct || (Number(pen?.skor) >= Number(soal.bobot || 1))
                  const isPartial = !isCorrect && Number(pen?.skor) > 0

                  return (
                    <div
                      key={soal.id}
                      id={`soal-card-${idx}`}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 transition-all hover:border-indigo-200"
                    >
                      {/* Soal Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-xs flex items-center justify-center border border-indigo-100">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-extrabold text-slate-800">
                            Soal {idx + 1}.
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            ({soal.tipe_soal?.replace('_', ' ')})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!hasAnswer ? (
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-100 text-slate-500 border-slate-200">
                              Belum Dikerjakan • Poin: 0 / {soal.bobot || 1}
                            </span>
                          ) : isUraian ? (
                            <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold">
                              Poin: {pen?.skor ?? 0} / {soal.bobot || 1}
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              isCorrect 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : isPartial 
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              Poin: {pen?.skor ?? 0} / {soal.bobot || 1}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Pertanyaan */}
                      <div
                        className="text-sm text-slate-800 leading-relaxed mb-5 cbt-math-content"
                        dangerouslySetInnerHTML={{ __html: renderFormattedMath(soal.pertanyaan) }}
                      />

                      {/* OPSI & JAWABAN UNTUK PG / BENAR SALAH */}
                      {isPG && (
                        <div className="space-y-2.5 mb-5">
                          {parsedOptions.map((opt, oIdx) => {
                            const optKey = opt.key || String.fromCharCode(65 + oIdx)
                            const isStudentPick = String(studentAnswer).trim().toUpperCase() === optKey.toUpperCase()
                            const isKeyAnswer = String(kunciObj.kunci_jawaban || '').trim().toUpperCase() === optKey.toUpperCase()

                            let cardClass = 'bg-white border-slate-200 text-slate-700'
                            let badgeLabel = null

                            if (isStudentPick && isKeyAnswer) {
                              cardClass = 'bg-emerald-50/70 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                              badgeLabel = '✓ Jawaban Benar'
                            } else if (isStudentPick && !isKeyAnswer) {
                              cardClass = 'bg-rose-50/70 border-rose-500 text-rose-900 ring-1 ring-rose-500'
                              badgeLabel = '✗ Jawaban Siswa (Salah)'
                            } else if (!isStudentPick && isKeyAnswer) {
                              cardClass = 'bg-emerald-50/30 border-emerald-400 text-emerald-800'
                              badgeLabel = '✓ Kunci Jawaban'
                            }

                            return (
                              <div
                                key={optKey}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${cardClass}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-6 h-6 rounded-md font-bold flex items-center justify-center shrink-0 ${
                                    isStudentPick ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {optKey}
                                  </span>
                                  <span
                                    className="leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: renderFormattedMath(opt.text || opt.teks || opt) }}
                                  />
                                </div>
                                {badgeLabel && (
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 ${
                                    badgeLabel.includes('Benar') || badgeLabel.includes('Kunci')
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {badgeLabel}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* OPSI & JAWABAN UNTUK PG KOMPLEKS */}
                      {isPGK && (
                        <div className="space-y-2.5 mb-5">
                          {parsedOptions.map((opt, oIdx) => {
                            const optKey = opt.key || String.fromCharCode(65 + oIdx)
                            const studentArr = Array.isArray(studentAnswer)
                              ? studentAnswer
                              : (typeof studentAnswer === 'string' && studentAnswer.startsWith('[') ? JSON.parse(studentAnswer) : [studentAnswer])
                            const isStudentPick = studentArr.map(x => String(x).toUpperCase()).includes(optKey.toUpperCase())
                            
                            let keyArr = []
                            try {
                              keyArr = Array.isArray(kunciObj.kunci_jawaban)
                                ? kunciObj.kunci_jawaban
                                : JSON.parse(kunciObj.kunci_jawaban || '[]')
                            } catch {
                              keyArr = String(kunciObj.kunci_jawaban || '').split(',').map(s => s.trim())
                            }
                            const isKeyAnswer = keyArr.map(x => String(x).toUpperCase()).includes(optKey.toUpperCase())

                            let cardClass = 'bg-white border-slate-200 text-slate-700'
                            let badgeLabel = null

                            if (isStudentPick && isKeyAnswer) {
                              cardClass = 'bg-emerald-50/70 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                              badgeLabel = '✓ Benar'
                            } else if (isStudentPick && !isKeyAnswer) {
                              cardClass = 'bg-rose-50/70 border-rose-500 text-rose-900 ring-1 ring-rose-500'
                              badgeLabel = '✗ Siswa Pilih (Salah)'
                            } else if (!isStudentPick && isKeyAnswer) {
                              cardClass = 'bg-emerald-50/30 border-emerald-400 text-emerald-800'
                              badgeLabel = '✓ Kunci Jawaban'
                            }

                            return (
                              <div
                                key={optKey}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${cardClass}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-5 h-5 rounded font-bold flex items-center justify-center text-[10px] shrink-0 ${
                                    isStudentPick ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {isStudentPick ? '✓' : ''}
                                  </span>
                                  <span className="font-bold text-slate-600">{optKey}.</span>
                                  <span
                                    className="leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: renderFormattedMath(opt.text || opt.teks || opt) }}
                                  />
                                </div>
                                {badgeLabel && (
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 ${
                                    badgeLabel.includes('Benar') || badgeLabel.includes('Kunci')
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {badgeLabel}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* JAWABAN UNTUK ISIAN SINGKAT */}
                      {isIsian && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-2 text-xs">
                          <div>
                            <span className="text-slate-500 font-semibold block mb-1">Jawaban Siswa:</span>
                            <div className="font-mono font-bold text-sm text-slate-800 bg-white px-3 py-2 rounded-lg border border-slate-300">
                              {studentAnswer || <span className="text-slate-400 italic">Tidak dijawab</span>}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500 font-semibold block mb-1">Kunci Jawaban yang Diharapkan:</span>
                            <div className="font-mono font-bold text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                              {kunciObj.kunci_jawaban || '-'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* JAWABAN UNTUK SOAL URAIAN (ESSAY) & FORM KOREKSI MANUAL */}
                      {isUraian && (
                        <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 mb-5 space-y-3 text-xs">
                          <div>
                            <span className="text-amber-900 font-bold block mb-1">Jawaban Uraian Siswa:</span>
                            <div className="text-slate-800 bg-white p-3 rounded-lg border border-slate-300 whitespace-pre-wrap leading-relaxed text-sm min-h-[70px]">
                              {studentAnswer || <span className="text-slate-400 italic">Siswa tidak menuliskan jawaban uraian.</span>}
                            </div>
                          </div>

                          {/* KOREKSI SKOR MANUAL OLEH GURU */}
                          <div className="bg-white border border-amber-300 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-700">Skor Butir Ini:</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max={soal.bobot || 1}
                                value={essayScores[soal.id] ?? 0}
                                onChange={(e) => setEssayScores(prev => ({ ...prev, [soal.id]: e.target.value }))}
                                className="w-20 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-extrabold text-center text-slate-800 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="text-xs font-bold text-slate-500">/ {soal.bobot || 1}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveEssayScore(soal)}
                              disabled={savingEssayId === soal.id}
                              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {savingEssayId === soal.id ? (
                                <span>Menyimpan...</span>
                              ) : (
                                <>
                                  <span>💾</span>
                                  <span>Simpan Nilai Soal Ini</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* JAWABAN MENJODOHKAN */}
                      {isMenjodohkan && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-xs">
                          <span className="text-slate-500 font-semibold block mb-1">Pasangan Jawaban Siswa:</span>
                          <pre className="font-mono bg-white p-2.5 rounded border border-slate-200 overflow-x-auto text-[11px]">
                            {JSON.stringify(studentAnswer, null, 2) || 'Tidak dijawab'}
                          </pre>
                        </div>
                      )}

                      {/* KOTAK PEMBAHASAN */}
                      <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-xs">
                        <span className="font-bold text-slate-500 block mb-1 text-[11px] uppercase tracking-wider">
                          Pembahasan:
                        </span>
                        <div
                          className="text-slate-600 leading-relaxed italic"
                          dangerouslySetInnerHTML={{
                            __html: kunciObj.pembahasan && kunciObj.pembahasan.trim() !== ''
                              ? renderFormattedMath(kunciObj.pembahasan)
                              : '<span class="text-slate-400 font-normal">Belum ada pembahasan yang dimasukkan.</span>'
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* RIGHT COLUMN: STICKY SIDEBAR (4 COLS) */}
              <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1 scrollbar-thin">
                
                {/* 1. KARTU SKOR & SIMPAN NILAI OVERRIDE */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <span className="text-xs font-bold text-slate-500">Poin Diperoleh:</span>
                    <span className="text-xs font-extrabold text-slate-800">
                      {stats.totalPoinDiperoleh} / {stats.totalBobot}
                    </span>
                  </div>

                  {/* Nilai Akhir Besar */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-600">Nilai Akhir:</span>
                    <span className="text-3xl font-black text-indigo-600 tracking-tight">
                      {peserta?.nilai_akhir !== null && peserta?.nilai_akhir !== undefined ? peserta.nilai_akhir : '-'}
                    </span>
                  </div>

                  {/* Input Simpan Nilai Override */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Simpan / Ubah Nilai:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={overrideScoreInput}
                        onChange={(e) => setOverrideScoreInput(e.target.value)}
                        placeholder="0-100"
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-extrabold text-slate-800 outline-hidden focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleSaveOverrideNilai}
                        disabled={savingScore}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-2xs transition-all disabled:opacity-50 flex items-center gap-1 shrink-0"
                      >
                        {savingScore ? '...' : '💾 Simpan'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. RINGKASAN BENAR / SALAH / KOSONG */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                    <span className="block text-xl font-black text-emerald-700 tracking-tight">
                      {stats.benarCount}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-800">Dijawab benar</span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                    <span className="block text-xl font-black text-rose-700 tracking-tight">
                      {stats.salahCount}
                    </span>
                    <span className="text-[10px] font-bold text-rose-800">Dijawab salah</span>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                    <span className="block text-xl font-black text-slate-700 tracking-tight">
                      {stats.belumCount}
                    </span>
                    <span className="text-[10px] font-bold text-slate-600">Belum dikerjakan</span>
                  </div>
                </div>

                {/* 3. PALET NOMOR SOAL (INTERAKTIF) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-700">Jumlah Soal</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-extrabold">
                      {stats.totalSoal}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-52 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                    {soalList.map((soal, idx) => {
                      const j = jawabanMap[soal.id]
                      const pen = j ? penilaianMap[j.id] : null
                      const studentAns = j?.jawaban_terpilih
                      const hasAnswer = studentAns !== null && studentAns !== undefined && studentAns !== '' && studentAns !== '[]' && studentAns !== '{}'
                      const isCorrect = pen?.is_correct || (Number(pen?.skor) >= Number(soal.bobot || 1))
                      const isPartial = !isCorrect && Number(pen?.skor) > 0
                      const isUraian = soal.tipe_soal === 'uraian'

                      let btnClass = ''
                      let statusText = ''

                      if (!hasAnswer) {
                        // Belum dikerjakan -> ABU-ABU
                        btnClass = 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        statusText = 'Belum Dikerjakan'
                      } else if (isCorrect) {
                        // Benar -> HIJAU
                        btnClass = 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        statusText = 'Benar'
                      } else if (isPartial) {
                        // Parsial -> AMBER
                        btnClass = 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                        statusText = 'Benar Sebagian'
                      } else if (isUraian && (!pen || pen.skor === 0)) {
                        // Uraian belum dinilai -> UNGU
                        btnClass = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        statusText = 'Uraian'
                      } else {
                        // Dijawab salah -> MERAH
                        btnClass = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        statusText = 'Salah'
                      }

                      return (
                        <button
                          key={soal.id}
                          type="button"
                          onClick={() => scrollToSoal(idx)}
                          className={`h-9 rounded-xl font-extrabold text-xs border transition-all active:scale-95 shadow-2xs flex items-center justify-center ${btnClass}`}
                          title={`Lompat ke Soal ${idx + 1} (${statusText})`}
                        >
                          {idx + 1}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Benar</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Salah</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> Belum Dikerjakan</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Uraian</span>
                  </div>
                </div>

                {/* 4. RINCIAN AKSI KECURANGAN */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="text-rose-500">⚠️</span> Rincian Aksi Kecurangan
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      (peserta?.strike_count || 0) > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {peserta?.strike_count || 0}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                    <p className="font-bold text-slate-700 mb-1">
                      Jumlah aksi kecurangan: <span className="text-rose-600">{peserta?.strike_count || 0}</span>
                    </p>
                    <p className="text-slate-500 text-[11px] leading-relaxed">
                      {(peserta?.strike_count || 0) === 0
                        ? 'Tidak ada aksi kecurangan / keluar aplikasi terdeteksi.'
                        : `Siswa terdeteksi keluar dari aplikasi ujian sebanyak ${peserta?.strike_count} kali.`}
                    </p>
                  </div>
                </div>

                {/* 5. RINCIAN PENGUMPULAN */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>🕒</span> Rincian Pengumpulan
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-extrabold">
                      1
                    </span>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-700">Pengumpulan 1</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">Terbaru</span>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Dikumpulkan: <strong className="text-slate-700">{dikumpulkanFormatted}</strong>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      Nilai: <strong className="text-indigo-600 font-extrabold">{peserta?.nilai_akhir ?? '-'}</strong>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

      </div>
  )

  if (isFullPage) {
    return (
      <div className="w-full space-y-6 animate-fadeIn">
        {ToastComponent}
        {ConfirmModalComponent}
        {renderContent}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex flex-col justify-start items-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      {ToastComponent}
      {ConfirmModalComponent}
      {renderContent}
    </div>
  )
}
