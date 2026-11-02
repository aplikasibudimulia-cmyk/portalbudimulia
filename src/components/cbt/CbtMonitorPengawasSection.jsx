import React, { useState, useEffect, useRef } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { supabase } from '../../supabaseClient'
import { decodeEmergencyQrPayload } from '../../utils/cbt/cbtCrypto'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'
import CbtLiveProctorModal from './CbtLiveProctorModal'

export default function CbtMonitorPengawasSection({ sesi, session, onClose }) {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const { showToast, ToastComponent } = useToast()

  const [loading, setLoading] = useState(true)
  const [targetStudents, setTargetStudents] = useState([]) // Seluruh siswa dari kelas target
  const [pesertaMap, setPesertaMap] = useState({}) // Key: nisn -> record cbt_peserta_ujian
  const [answeredCountMap, setAnsweredCountMap] = useState({}) // Key: pesertaId -> count
  const [selectedFilterKelas, setSelectedFilterKelas] = useState('all') // 'all' atau '7A', '7B', dll.
  const [searchKeyword, setSearchKeyword] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Extra Time Modal
  const [extraTimeTarget, setExtraTimeTarget] = useState(null)
  const [inputExtraMinutes, setInputExtraMinutes] = useState(15)

  // Block Modal
  const [blockTarget, setBlockTarget] = useState(null)
  const [inputBlockReason, setInputBlockReason] = useState('Atribut tidak lengkap / Tidak hadir')

  // Retake Modal
  const [retakeTarget, setRetakeTarget] = useState(null)
  const [retakeOption, setRetakeOption] = useState('terakhir')

  // Live Proctoring Modal (Kamera Selfie Siswa On-Demand)
  const [liveProctorTarget, setLiveProctorTarget] = useState(null)

  // QR Scanner Modal
  const [showScannerModal, setShowScannerModal] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState(null)
  const scannerRef = useRef(null)

  const availableKelas = sesi?.kelas_ids || []
  const totalSoal = sesi?.cbt_bank_soal?.total_soal || 30

  // Inisialisasi & Realtime Subscription
  useEffect(() => {
    if (sesi?.id) {
      fetchAllMonitorData()

      // Realtime subscription untuk cbt_peserta_ujian
      const channel = supabase
        .channel(`cbt_monitor_realtime_${sesi.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cbt_peserta_ujian',
          filter: `sesi_id=eq.${sesi.id}`
        }, (payload) => {
          handleRealtimePesertaUpdate(payload)
        })
        .subscribe()

      // Polling cadangan ringan setiap 20 detik
      const interval = setInterval(() => {
        fetchPesertaDataOnly()
      }, 20000)

      return () => {
        supabase.removeChannel(channel)
        clearInterval(interval)
      }
    }
  }, [sesi?.id])

  const fetchAllMonitorData = async () => {
    setLoading(true)
    try {
      // 1. Ambil seluruh siswa aktif yang berada di rombel target sesi
      const { data: siswaData } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .in('kelas', availableKelas)
        .eq('is_aktif', true)
        .order('kelas', { ascending: true })
        .order('nama_lengkap', { ascending: true })

      const seenNisns = new Set()
      const uniqueSiswa = (siswaData || []).filter(s => {
        if (!s.nisn || seenNisns.has(s.nisn)) return false
        seenNisns.add(s.nisn)
        return true
      })
      setTargetStudents(uniqueSiswa)

      // 2. Ambil seluruh data peserta ujian di sesi ini
      await fetchPesertaDataOnly()
    } catch (err) {
      console.error('Gagal memuat data monitoring:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPesertaDataOnly = async () => {
    try {
      const { data: pData } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('sesi_id', sesi.id)

      const map = {}
      const pesertaIds = []
      ;(pData || []).forEach(p => {
        map[p.siswa_nisn] = p
        pesertaIds.push(p.id)
      })
      setPesertaMap(map)

      // Auto-heal nilai: Jika ada peserta yang sudah selesai namun nilai_akhir masih NULL
      const needScoring = (pData || []).filter(p => (p.status === 'selesai' || !!p.waktu_selesai) && (p.nilai_akhir === null || p.nilai_akhir === undefined))
      if (needScoring.length > 0) {
        Promise.all(needScoring.map(async p => {
          try {
            const { data: score, error: scErr } = await supabase.rpc('cbt_internal_score_submission', { p_peserta_id: p.id })
            if (!scErr && score !== null && score !== undefined) {
              map[p.siswa_nisn] = { ...p, nilai_akhir: score }
            }
          } catch (e) {
            console.warn('Auto scoring error in monitor:', e)
          }
        })).then(() => {
          setPesertaMap({ ...map })
        })
      }

      // 3. Ambil progress jawaban siswa yang sedang aktif
      if (pesertaIds.length > 0) {
        const { data: ansData } = await supabase
          .from('cbt_jawaban_siswa')
          .select('peserta_id, jawaban_terpilih')
          .in('peserta_id', pesertaIds)

        const countMap = {}
        ;(ansData || []).forEach(a => {
          if (a.jawaban_terpilih && a.jawaban_terpilih.trim() !== '') {
            countMap[a.peserta_id] = (countMap[a.peserta_id] || 0) + 1
          }
        })
        setAnsweredCountMap(countMap)
      }
    } catch (err) {
      console.error('Gagal fetch peserta:', err)
    }
  }

  const handleRealtimePesertaUpdate = (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const item = payload.new
      setPesertaMap(prev => ({
        ...prev,
        [item.siswa_nisn]: item
      }))
    }
  }

  // Aksi 1: Blokir Siswa Bermasalah
  const handleConfirmBlockStudent = async (e) => {
    e.preventDefault()
    if (!blockTarget) return

    setActionLoading(true)
    try {
      let pesertaRecord = pesertaMap[blockTarget.nisn]

      // Jika siswa belum ada di cbt_peserta_ujian, inisialisasi dulu
      if (!pesertaRecord) {
        const { data: created, error: errCreate } = await supabase
          .from('cbt_peserta_ujian')
          .insert({
            sesi_id: sesi.id,
            siswa_nisn: blockTarget.nisn,
            kelas: blockTarget.kelas,
            status: 'belum_mulai',
            is_blocked: true,
            block_reason: inputBlockReason.trim()
          })
          .select()
          .single()

        if (errCreate) throw errCreate
        pesertaRecord = created
      } else {
        const { error: errUpdate } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            is_blocked: true,
            block_reason: inputBlockReason.trim()
          })
          .eq('id', pesertaRecord.id)

        if (errUpdate) throw errUpdate
      }

      showToast(`Siswa ${blockTarget.nama_lengkap} (${blockTarget.kelas}) berhasil diblokir dari ujian.`, 'success')
      setBlockTarget(null)
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal memblokir siswa: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi 2: Buka Blokir Siswa (Unblock)
  const handleUnblockStudent = async (studentItem, pesertaId) => {
    const confirmed = await requestConfirm({
      title: 'Buka Blokir Ujian?',
      message: `Buka blokir ujian untuk siswa ${studentItem.nama_lengkap}? Siswa akan langsung kembali ke lembar soal ujian.`,
      confirmLabel: 'Buka Blokir',
      confirmColor: 'emerald',
      icon: 'info'
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      const currentStatus = studentItem.peserta?.status
      const targetStatus = currentStatus === 'belum_mulai' ? 'belum_mulai' : 'sedang_mengerjakan'

      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          is_blocked: false,
          block_reason: null,
          status: targetStatus,
          strike_count: 0
        })
        .eq('id', pesertaId)

      if (error) throw error
      showToast(`Blokir siswa ${studentItem.nama_lengkap} berhasil dibuka. Siswa otomatis kembali ke lembar soal.`, 'success')
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal membuka blokir: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi 3: Remote Unlock Siswa Terkunci (Strike 3)
  const handleRemoteUnlock = async (pesertaId, studentName) => {
    const confirmed = await requestConfirm({
      title: 'Buka Kunci Lembar Ujian?',
      message: `Buka kunci lembar ujian siswa ${studentName}? Siswa akan dapat melanjutkan pengerjaan ujian.`,
      confirmLabel: 'Buka Kunci',
      confirmColor: 'emerald',
      icon: 'info'
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      try {
        await supabase.rpc('cbt_proctor_remote_unlock', {
          p_peserta_id: pesertaId
        })
      } catch (rpcErr) {
        console.warn('RPC cbt_proctor_remote_unlock fallback:', rpcErr)
      }

      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          status: 'sedang_mengerjakan',
          is_blocked: false,
          block_reason: null,
          strike_count: 0
        })
        .eq('id', pesertaId)

      if (error) throw error

      showToast(`Kunci lembar ujian ${studentName} berhasil dibuka.`, 'success')
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal membuka kunci: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi 3b: Paksa Kumpulkan Ujian Siswa (Force Submit)
  const handleForceSubmitPeserta = async (pesertaId, studentName) => {
    const confirmed = await requestConfirm({
      title: 'Paksa Kumpulkan Ujian?',
      message: `Paksa kumpulkan lembar ujian siswa ${studentName}? Lembar ujian siswa akan otomatis diselesaikan dan layar di HP siswa akan langsung beralih ke selesai.`,
      confirmLabel: 'Paksa Kumpulkan',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      const nowIso = new Date().toISOString()
      const isInstan = sesi?.tampilkan_nilai === 'instan'

      // 1. Jalankan penskoran otomatis server-side dulu agar nilai akhir terhitung
      let finalScore = null
      try {
        const { data: score } = await supabase.rpc('cbt_internal_score_submission', {
          p_peserta_id: pesertaId
        })
        finalScore = score
      } catch (scoreErr) {
        console.warn('RPC cbt_internal_score_submission error:', scoreErr)
      }

      // 2. Kunci status peserta menjadi selesai dengan nilai_akhir yang sudah terisi
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          status: 'selesai',
          waktu_selesai: nowIso,
          is_blocked: false,
          block_reason: null,
          ...(finalScore !== null && finalScore !== undefined ? { nilai_akhir: finalScore } : {}),
          ...(isInstan ? { is_nilai_shared: true } : {})
        })
        .eq('id', pesertaId)

      if (error) throw error

      showToast(`Lembar ujian ${studentName} berhasil dikumpulkan & dinilai otomatis (Skor: ${finalScore ?? '-'}).`, 'success')
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal paksa kumpulkan: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi 4: Tambah Waktu Individual (+Extra Time)
  const handleAddExtraTime = async () => {
    if (!extraTimeTarget) return
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('cbt_proctor_add_extra_time', {
        p_peserta_id: extraTimeTarget.id,
        p_menit: parseInt(inputExtraMinutes, 10)
      })
      if (error) throw error
      showToast(`Berhasil menambahkan waktu +${inputExtraMinutes} menit.`, 'success')
      setExtraTimeTarget(null)
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal menambah waktu: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi 5: Reset Kunci Perangkat Siswa (Single Device Lock)
  const handleResetDevice = async (pesertaId, studentName) => {
    const confirmed = await requestConfirm({
      title: 'Reset Kunci Perangkat?',
      message: `Reset kunci perangkat untuk ${studentName}? Siswa akan dapat login dan melanjutkan ujian dari HP/perangkat cadangan. Seluruh jawaban yang sudah tersimpan TIDAK akan hilang.`,
      confirmLabel: 'Ya, Reset Perangkat',
      confirmColor: 'amber',
      icon: 'warning'
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      // 1. Coba panggil RPC jika tersedia
      const { error: rpcErr } = await supabase.rpc('cbt_proctor_reset_device', {
        p_peserta_id: pesertaId
      })

      // 2. Fallback update langsung jika RPC belum dieksekusi di database
      if (rpcErr) {
        const { error: updateErr } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            device_id: null,
            device_info: null,
            status: 'belum_melanjutkan',
            is_blocked: false,
            block_reason: null
          })
          .eq('id', pesertaId)

        if (updateErr) throw updateErr
      }

      showToast(`Kunci perangkat untuk ${studentName} berhasil di-reset. Siswa dapat melanjutkan di HP baru.`, 'success')
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal reset perangkat: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi Ujian Ulang Siswa (Pengawas)
  const handleOpenRetakeModal = (studentItem, pesertaRecord) => {
    setRetakeTarget({ student: studentItem, peserta: pesertaRecord })
    setRetakeOption('terakhir')
  }

  const handleConfirmRetakeExam = async () => {
    if (!retakeTarget || !retakeTarget.peserta) return
    const { student, peserta } = retakeTarget
    setActionLoading(true)
    try {
      if (retakeOption === 'awal') {
        // 1. Hapus lembar jawaban siswa sebelumnya
        const { error: errDel } = await supabase
          .from('cbt_jawaban_siswa')
          .delete()
          .eq('peserta_id', peserta.id)
        if (errDel) throw errDel

        // 2. Set status peserta kembali ke belum_mulai (reset total)
        const { error: errUpdate } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            status: 'belum_mulai',
            waktu_mulai: null,
            waktu_selesai: null,
            nilai_akhir: null,
            strike_count: 0,
            total_pelanggaran: 0,
            is_nilai_shared: false,
            is_blocked: false,
            block_reason: null,
            device_id: null,
            device_info: null
          })
          .eq('id', peserta.id)
        if (errUpdate) throw errUpdate

        showToast(`Ujian ulang dari awal aktif untuk ${student.nama_lengkap}. Siswa dapat memulai dari akunnya.`, 'success')
      } else {
        // Opsi 'terakhir': PERTAHANKAN JAWABAN LAMA DI DATABASE
        // Status diset ke 'belum_mulai' dengan waktu_mulai: null agar siswa resmi memulai saat klik Mulai di HP
        const { error: errUpdate } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            status: 'belum_mulai',
            waktu_mulai: null,
            waktu_selesai: null,
            nilai_akhir: null,
            strike_count: 0,
            total_pelanggaran: 0,
            is_nilai_shared: false,
            is_blocked: false,
            block_reason: null,
            device_id: null,
            device_info: null
          })
          .eq('id', peserta.id)
        if (errUpdate) throw errUpdate

        showToast(`Ujian ulang dengan jawaban terakhir aktif untuk ${student.nama_lengkap}. Siswa dapat memulai kembali dari akunnya.`, 'success')
      }

      setRetakeTarget(null)
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal mengaktifkan ujian ulang: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Scanner QR Offline Darurat
  const handleStartScanner = () => {
    setScanResult(null)
    setScanError(null)
    setShowScannerModal(true)
  }

  useEffect(() => {
    if (showScannerModal) {
      const timeout = setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner('qr-reader-proctor', {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          }, false)

          scannerRef.current = scanner
          scanner.render((decodedText) => {
            try {
              const payload = decodeEmergencyQrPayload(decodedText)
              if (!payload || !payload.nisn) throw new Error('Format QR tidak valid.')
              setScanResult(payload)
              scanner.clear().catch(() => {})
            } catch (e) {
              setScanError(e.message)
            }
          }, () => {})
        } catch (e) {
          console.error('Inisialisasi kamera gagal:', e)
        }
      }, 300)

      return () => {
        clearTimeout(timeout)
        if (scannerRef.current) scannerRef.current.clear().catch(() => {})
      }
    }
  }, [showScannerModal])

  const handleSubmitScannedAnswers = async () => {
    if (!scanResult) return
    setActionLoading(true)
    try {
      const proctorId = session?.user?.id || session?.id
      const { data, error } = await supabase.rpc('cbt_submit_emergency_answers', {
        p_sesi_id: sesi.id,
        p_nisn: scanResult.nisn,
        p_answers_json: scanResult.answers,
        p_proctor_id: proctorId
      })
      if (error) throw error
      showToast(`Jawaban darurat siswa NISN ${scanResult.nisn} berhasil dinilai server (Skor: ${data?.final_score || 0}).`, 'success')
      setShowScannerModal(false)
      setScanResult(null)
      fetchPesertaDataOnly()
    } catch (err) {
      showToast('Gagal memproses QR darurat: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Klasifikasikan siswa ke dalam 3 KELOMPOK STATUS
  const listBelumMulai = []
  const listSedangMengerjakan = []
  const listSelesai = []

  targetStudents.forEach(s => {
    // Filter berdasarkan kelas/rombel
    if (selectedFilterKelas !== 'all' && s.kelas !== selectedFilterKelas) return

    // Filter berdasarkan kata kunci pencarian
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase()
      const match = (s.nama_lengkap && s.nama_lengkap.toLowerCase().includes(kw)) ||
                    (s.nisn && s.nisn.toLowerCase().includes(kw)) ||
                    (s.kelas && s.kelas.toLowerCase().includes(kw))
      if (!match) return
    }

    const p = pesertaMap[s.nisn]

    const isActivelyWorking = (p?.status === 'sedang_mengerjakan' || p?.status === 'terkunci') && Boolean(p?.device_id)

    if (!p || p.status === 'belum_mulai' || p?.status === 'belum_melanjutkan' || (!p?.device_id && p?.status !== 'selesai')) {
      listBelumMulai.push({ ...s, peserta: p })
    } else if (isActivelyWorking) {
      listSedangMengerjakan.push({ ...s, peserta: p })
    } else if (p.status === 'selesai') {
      listSelesai.push({ ...s, peserta: p })
    }
  })

  return (
    <div className="space-y-6">
      {/* Header Panel Monitoring */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">
                Panel Monitoring Sesi Berlangsung
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Realtime Aktif</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {sesi?.judul} ({sesi?.mapel}) • Target: <strong>{availableKelas.join(', ')}</strong> • Total {targetStudents.length} Siswa Terdaftar
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Tombol Scan QR Offline Darurat */}
          <button
            type="button"
            onClick={() => {
              setScanResult(null)
              setScanError(null)
              setShowScannerModal(true)
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span>Scan QR Darurat</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Kembali ke Daftar
            </button>
          )}
        </div>
      </div>

      {/* FILTER KELAS / ROMBEL DI BAGIAN ATAS */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-700 shrink-0">
            Filter Rombel:
          </label>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedFilterKelas('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedFilterKelas === 'all'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua Kelas ({targetStudents.length})
            </button>
            {availableKelas.map(cls => {
              const countInCls = targetStudents.filter(s => s.kelas === cls).length
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSelectedFilterKelas(cls)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    selectedFilterKelas === cls
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Kelas {cls} ({countInCls})
                </button>
              )
            })}
          </div>
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Cari siswa atau NISN..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* TAMPILAN 3 KELOMPOK STATUS SISWA */}
      <div className="space-y-6">
        {/* ============================================================ */}
        {/* KELOMPOK 1: 🟡 SEDANG MENGERJAKAN */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
              <h3 className="text-sm font-bold text-slate-800">
                Sedang Mengerjakan ({listSedangMengerjakan.length} Siswa)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Siswa yang sedang aktif mengisi lembar ujian
            </span>
          </div>

          {listSedangMengerjakan.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center italic">
              Belum ada siswa yang sedang mengerjakan saat ini.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {listSedangMengerjakan.map(item => {
                const p = item.peserta
                const answered = answeredCountMap[p.id] || 0
                const isLocked = p.status === 'terkunci' || (p.strike_count >= 3)
                const isBlocked = p.is_blocked

                return (
                  <div
                    key={item.nisn}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      isBlocked
                        ? 'bg-rose-50/60 border-rose-200'
                        : isLocked
                          ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-400'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-800">
                            {item.nama_lengkap}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                            {item.kelas}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          NISN: {item.nisn}
                        </div>
                      </div>

                      {/* Status Tag */}
                      {isBlocked ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                          DIBLOKIR
                        </span>
                      ) : isLocked ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white animate-pulse">
                          TERKUNCI (STRIKE 3)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          Aktif
                        </span>
                      )}
                    </div>

                    {/* Progress Terjawab & Last Sync */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Progres Soal:</span>
                        <span className="font-bold text-indigo-700">
                          {answered} / {totalSoal} Terjawab
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.round((answered / totalSoal) * 100))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>Strike: {p.strike_count || 0}/3 {(p.total_pelanggaran > 0) ? `(Tot: ${p.total_pelanggaran}x)` : ''}</span>
                        <span>Sync: {p.updated_at ? new Date(p.updated_at).toLocaleTimeString('id-ID') : '-'}</span>
                      </div>
                      {p.device_info && (
                        <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 truncate pt-0.5" title={p.device_info}>
                          <span>📱</span>
                          <span className="truncate">{p.device_info}</span>
                        </div>
                      )}
                      {p.block_reason && (
                        <div className="text-[10px] text-rose-600 font-medium truncate pt-0.5" title={p.block_reason}>
                          ⚠️ {p.block_reason}
                        </div>
                      )}
                    </div>

                    {/* Aksi Pengawas */}
                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-1.5 text-xs">
                      {isBlocked ? (
                        <div className="flex items-center justify-between w-full gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleUnblockStudent(item, p.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                          >
                            Buka Blokir
                          </button>
                          <button
                            type="button"
                            onClick={() => handleForceSubmitPeserta(p.id, item.nama_lengkap)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
                            title="Selesaikan dan kumpulkan ujian siswa secara paksa"
                          >
                            Paksa Kumpulkan
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isLocked && (
                              <button
                                type="button"
                                onClick={() => handleRemoteUnlock(p.id, item.nama_lengkap)}
                                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold"
                              >
                                Buka Kunci
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setExtraTimeTarget(p)}
                              className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold"
                              title="Tambah Waktu"
                            >
                              +Waktu
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetDevice(p.id, item.nama_lengkap)}
                              className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
                              title="Reset Kunci Perangkat jika siswa ganti HP"
                            >
                              <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              <span>Reset HP</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLiveProctorTarget({ ...item, peserta: p })}
                              className="px-2 py-1 rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="Pantau Kamera Siswa secara Langsung (On-Demand)"
                            >
                              <span>📹</span>
                              <span>Pantau</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleForceSubmitPeserta(p.id, item.nama_lengkap)}
                              className="px-2 py-1 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold"
                              title="Paksa kumpulkan ujian siswa ini"
                            >
                              Kumpulkan
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenRetakeModal(item, p)}
                              className="px-2 py-1 rounded-lg border border-amber-300 text-amber-700 bg-amber-50/70 hover:bg-amber-100 text-[11px] font-bold shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="Reset status sesi ke Belum Mulai / Izinkan Ujian Ulang"
                            >
                              Ujian Ulang
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setBlockTarget(item)
                              setInputBlockReason('Atribut tidak lengkap / Pelanggaran')
                            }}
                            className="text-[11px] text-rose-600 hover:text-rose-800 font-bold"
                          >
                            Blokir
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* KELOMPOK 2: 🟢 SELESAI */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <h3 className="text-sm font-bold text-slate-800">
                Selesai / Sudah Submit ({listSelesai.length} Siswa)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Nilai akhir otomatis terhitung &amp; final
            </span>
          </div>

          {listSelesai.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center italic">
              Belum ada siswa yang menyelesaikan ujian ini.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {listSelesai.map(item => {
                const p = item.peserta
                const finalScore = p.nilai_akhir !== null ? p.nilai_akhir : 0.00
                const isTuntas = finalScore >= (sesi?.kkm || 75.0)

                return (
                  <div
                    key={item.nisn}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:shadow-xs transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-800">
                            {item.nama_lengkap}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {item.kelas}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          NISN: {item.nisn}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Selesai: {p.waktu_selesai ? new Date(p.waktu_selesai).toLocaleTimeString('id-ID') : '-'} WIB
                        </div>
                      </div>

                      {/* Nilai Akhir Final */}
                      <div className="text-right shrink-0">
                        <div className="text-lg font-extrabold text-slate-800">
                          {finalScore} <span className="text-[10px] text-slate-400 font-normal">/ 100</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isTuntas ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isTuntas ? 'Tuntas KKTP' : 'Remedial'}
                        </span>
                      </div>
                    </div>

                    {/* Tombol Ujian Ulang Pengawas */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenRetakeModal(item, p)}
                        disabled={actionLoading}
                        className="w-full py-1.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Beri Izin Siswa Ujian Ulang"
                      >
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Izinkan Ujian Ulang</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* KELOMPOK 3: 🔘 BELUM MULAI */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400"></span>
              <h3 className="text-sm font-bold text-slate-800">
                Belum Mulai ({listBelumMulai.length} Siswa)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Siswa terdaftar yang belum memasukkan token ujian
            </span>
          </div>

          {listBelumMulai.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center italic">
              Semua siswa yang terdaftar sudah mulai mengerjakan atau selesai.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {listBelumMulai.map(item => {
                const isBlocked = item.peserta?.is_blocked

                return (
                  <div
                    key={item.nisn}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                      isBlocked ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-800 line-clamp-1">
                        {item.nama_lengkap}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>{item.kelas}</span>
                        <span>•</span>
                        <span>{item.nisn}</span>
                      </div>
                      {isBlocked && (
                        <div className="text-[9px] text-rose-600 font-bold mt-0.5">
                          Blokir: {item.peserta?.block_reason || 'Admin'}
                        </div>
                      )}
                    </div>

                    <div>
                      {isBlocked ? (
                        <button
                          type="button"
                          onClick={() => handleUnblockStudent(item, item.peserta.id)}
                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]"
                        >
                          Buka
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBlockTarget(item)
                            setInputBlockReason('Tidak Hadir / Atribut tidak lengkap')
                          }}
                          className="px-2 py-0.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-[10px]"
                          title="Blokir agar tidak bisa masuk"
                        >
                          Blokir
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL BLOKIR SISWA */}
      {blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Blokir Siswa dari Ujian
            </h3>
            <p className="text-xs text-slate-500">
              Siswa yang diblokir tidak akan bisa memasukkan token ujian atau lembar ujiannya akan otomatis terkunci.
            </p>

            <form onSubmit={handleConfirmBlockStudent} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div>Nama: <strong>{blockTarget.nama_lengkap}</strong></div>
                <div>Kelas: <strong>{blockTarget.kelas}</strong> (NISN: {blockTarget.nisn})</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Alasan Pemblokiran:
                </label>
                <input
                  type="text"
                  required
                  value={inputBlockReason}
                  onChange={(e) => setInputBlockReason(e.target.value)}
                  placeholder="Contoh: Atribut tidak lengkap / Belum hadir / Pelanggaran"
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Memproses...' : 'Terapkan Blokir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH WAKTU (+EXTRA TIME) */}
      {extraTimeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Tambah Waktu Ujian Individual
            </h3>
            <p className="text-xs text-slate-500">
              Tambahkan kompensasi menit waktu ujian bagi siswa yang mengalami kendala teknis/jaringan.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jumlah Menit Tambahan:
                </label>
                <div className="flex gap-2">
                  {[10, 15, 20, 30].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setInputExtraMinutes(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        inputExtraMinutes === m
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      +{m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExtraTimeTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddExtraTime}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {actionLoading ? 'Menyimpan...' : 'Tambah Waktu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SCANNER QR DARURAT */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                Scanner QR Jawaban Darurat Siswa
              </h3>
              <button
                type="button"
                onClick={() => setShowScannerModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Arahkan webcam/kamera laptop Anda ke layar perangkat siswa yang menampilkan kode QR darurat offline.
              </p>

              {!scanResult ? (
                <div id="qr-reader-proctor" className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-100" />
              ) : (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                  <div className="font-bold text-emerald-800">Kode QR Berhasil Discan!</div>
                  <div>NISN Siswa: <strong>{scanResult.nisn}</strong></div>
                  <div>Total Jawaban: <strong>{Object.keys(scanResult.answers || {}).length} butir</strong></div>

                  <button
                    type="button"
                    onClick={handleSubmitScannedAnswers}
                    disabled={actionLoading}
                    className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-xs"
                  >
                    {actionLoading ? 'Menyimpan ke Database...' : 'Kirim & Nilai Jawaban Darurat'}
                  </button>
                </div>
              )}

              {scanError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                  {scanError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ujian Ulang Siswa (Pengawas) */}
      {retakeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Aktifkan Ujian Ulang Siswa
                </h3>
                <p className="text-xs text-slate-500">
                  Peserta: <strong className="text-slate-700">{retakeTarget.student?.nama_lengkap}</strong> ({retakeTarget.student?.kelas})
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl text-xs text-amber-800 leading-relaxed">
              Tentukan skema ujian ulang yang diberikan oleh Pengawas untuk peserta ini:
            </div>

            <div className="space-y-2.5">
              {/* Opsi 1: Jawaban Terakhir */}
              <div
                onClick={() => setRetakeOption('terakhir')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  retakeOption === 'terakhir'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="pengawasRetakeOption"
                    checked={retakeOption === 'terakhir'}
                    onChange={() => setRetakeOption('terakhir')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Mulai lagi dengan jawaban terakhir</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Pertahankan</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Jawaban tersimpan tidak dihapus. Siswa dapat melanjutkan pengerjaan atau meninjau lembar ujiannya.
                    </p>
                  </div>
                </div>
              </div>

              {/* Opsi 2: Reset Bersih */}
              <div
                onClick={() => setRetakeOption('awal')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  retakeOption === 'awal'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="pengawasRetakeOption"
                    checked={retakeOption === 'awal'}
                    onChange={() => setRetakeOption('awal')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Mulai ulang dari awal</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Reset Bersih</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Seluruh jawaban sebelumnya akan dihapus bersih. Siswa mengerjakan lembar ujian baru dari butir 1.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRetakeTarget(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRetakeExam}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {actionLoading ? 'Memproses...' : 'Aktifkan Ujian Ulang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Professional Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Professional Toast Notification */}
      {ToastComponent}

      {/* Modal Pemantau Kamera Langsung (Live Proctoring On-Demand) */}
      <CbtLiveProctorModal
        isOpen={!!liveProctorTarget}
        onClose={() => setLiveProctorTarget(null)}
        sesiId={sesi?.id}
        student={liveProctorTarget}
        onForceSubmit={(pesertaId, studentName) => {
          handleForceSubmitPeserta(pesertaId, studentName)
        }}
      />
    </div>
  )
}
