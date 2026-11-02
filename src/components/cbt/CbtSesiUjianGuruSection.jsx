import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import CbtBuatPenilaianModal from './CbtBuatPenilaianModal'
import CbtDaftarPengumpulanSection from './CbtDaftarPengumpulanSection'
import CbtDetailPengerjaanSiswaModal from './CbtDetailPengerjaanSiswaModal'
import CbtLiveProctorModal from './CbtLiveProctorModal'
import { fetchActiveTahunAjaranClasses, DEFAULT_KELAS_LIST } from '../../utils/cbt/cbtKelasHelper'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'

const formatDateTimeDisplay = (isoStr) => {
  if (!isoStr) return '-'
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return String(isoStr)
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB'
  } catch {
    return String(isoStr)
  }
}

// Helper ekstraksi opsi secara aman dari berbagai format data
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
  if (Array.isArray(q.cbt_soal_kunci) && q.cbt_soal_kunci.length > 0 && q.cbt_soal_kunci[0]?.kunci_jawaban) {
    return q.cbt_soal_kunci[0].kunci_jawaban
  }
  if (q.cbt_soal_kunci && typeof q.cbt_soal_kunci === 'object' && q.cbt_soal_kunci.kunci_jawaban) {
    return q.cbt_soal_kunci.kunci_jawaban
  }
  if (q.kunci_jawaban) {
    return q.kunci_jawaban
  }
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

  const kStr = String(kunci).trim().toUpperCase()
  if (optKey === kStr) return true
  if (optText && optText === String(kunci).trim().toLowerCase()) return true
  return false
}


export default function CbtSesiUjianGuruSection({ session, onNavigate }) {
  const { requestConfirm, requestAlert, ConfirmModalComponent } = useConfirm()
  const { showToast, ToastComponent } = useToast()

  // State Sesi Penilaian (Section 1 - Kiri)
  const [loading, setLoading] = useState(true)
  const [sesiList, setSesiList] = useState([])
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'berlangsung', 'mendatang', 'selesai', 'draft'
  const [filterRombel, setFilterRombel] = useState('all') // 'all' atau '7A', '7B', dll.
  const [searchKeyword, setSearchKeyword] = useState('')
  const [availableKelasList, setAvailableKelasList] = useState(DEFAULT_KELAS_LIST)
  const [selectedSesiId, setSelectedSesiId] = useState(null)
  const [collapsedSesiMap, setCollapsedSesiMap] = useState({})
  const [activeSubView, setActiveSubView] = useState(null) // null | { type: 'pengumpulan', sesi: ... }
  const [detailPesertaId, setDetailPesertaId] = useState(null)

  // Navigasi langsung ke menu Bank Soal (pembuatan soal)
  const handleNavigateToBankSoal = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('cbt_bank_soal')
    } else {
      const url = new URL(window.location.href)
      url.searchParams.set('menu', 'cbt_bank_soal')
      window.history.pushState({}, '', url.toString())
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.location.href = url.toString()
    }
  }

  // Toggle buka / tutup dropdown kelas target pada kartu sesi penilaian di Section Kiri
  const handleToggleSesiExpand = (sesiId) => {
    if (selectedSesiId !== sesiId) {
      setSelectedSesiId(sesiId)
      setMonitoringFilterKelas('all')
      setCollapsedSesiMap(prev => ({ ...prev, [sesiId]: false }))
    } else {
      setCollapsedSesiMap(prev => ({ ...prev, [sesiId]: !prev[sesiId] }))
    }
  }

  // Menu Titik Tiga (Dropdown Aksi Kartu Sesi)
  const [activeMenuId, setActiveMenuId] = useState(null)

  // Wizard Modal Buat / Edit Penilaian
  const [showWizardModal, setShowWizardModal] = useState(false)
  const [wizardInitialData, setWizardInitialData] = useState(null)

  // Modal Atur Ruang Ujian (Admin Role)
  const [showRuangModal, setShowRuangModal] = useState(false)
  const [targetSesiRuang, setTargetSesiRuang] = useState(null)
  const [ruangForm, setRuangForm] = useState({})
  const [ruangSaving, setRuangSaving] = useState(false)

  // State Monitoring Siswa (Section 2 - Kanan)
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [targetStudents, setTargetStudents] = useState([])
  const [pesertaMap, setPesertaMap] = useState({}) // Key: nisn -> cbt_peserta_ujian
  const [answeredCountMap, setAnsweredCountMap] = useState({}) // Key: pesertaId -> count
  const [monitoringFilterTab, setMonitoringFilterTab] = useState('semua') // 'semua', 'belum_mulai', 'sedang_mengerjakan', 'sudah_dikumpulkan'
  const [actualSoalCount, setActualSoalCount] = useState(null)
  const [monitoringFilterKelas, setMonitoringFilterKelas] = useState('all') // 'all' atau '7A', '7B', dll.
  const [studentSearchQuery, setStudentSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [liveSyncPulse, setLiveSyncPulse] = useState(false)

  // Modals Pengawas
  const [extraTimeTarget, setExtraTimeTarget] = useState(null)
  const [inputExtraMinutes, setInputExtraMinutes] = useState(15)
  const [detailAnswersTarget, setDetailAnswersTarget] = useState(null)
  const [detailAnswersList, setDetailAnswersList] = useState([])
  const [loadingAnswers, setLoadingAnswers] = useState(false)
  const [showExamInfoModal, setShowExamInfoModal] = useState(false)
  const [blockTarget, setBlockTarget] = useState(null) // { student, peserta }
  const [inputBlockReason, setInputBlockReason] = useState('Pelanggaran tata tertib ujian')
  const [retakeTarget, setRetakeTarget] = useState(null) // { student, peserta }
  const [retakeOption, setRetakeOption] = useState('terakhir') // 'terakhir' or 'awal'
  const [liveProctorTarget, setLiveProctorTarget] = useState(null)
  const [activeStudentMenuNisn, setActiveStudentMenuNisn] = useState(null)
  const [menuTarget, setMenuTarget] = useState(null) // { student, peserta, rect }
  const [isMonitoringFullscreen, setIsMonitoringFullscreen] = useState(false)
  const roomChannelRef = useRef(null)

  // ESC, Click Outside, Scroll, & Resize Listener untuk Modal / Dropdown / Fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (menuTarget) {
          setMenuTarget(null)
        } else if (isMonitoringFullscreen) {
          setIsMonitoringFullscreen(false)
        }
      }
    }
    const handleScroll = () => {
      if (menuTarget) setMenuTarget(null)
    }
    const handleResize = () => {
      if (menuTarget) setMenuTarget(null)
    }
    const handleClickOutside = () => {
      setActiveMenuId(null)
      setActiveStudentMenuNisn(null)
      setMenuTarget(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    window.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('click', handleClickOutside)
    }
  }, [isMonitoringFullscreen, menuTarget])

  const isAdmin = session?.role === 'admin' || session?.is_admin

  // 1. Ambil Data Penilaian & Kelas Aktif
  useEffect(() => {
    fetchSesiList()
    fetchActiveTahunAjaranClasses().then(({ classes }) => {
      if (classes && classes.length > 0) {
        setAvailableKelasList(classes)
      }
    })

    // Auto re-check status setiap 30 detik agar sesi yang melewati batas waktu otomatis berpindah ke 'selesai'
    const intervalId = setInterval(() => {
      fetchSesiList(true)
    }, 30000)

    return () => clearInterval(intervalId)
  }, [session])

  const fetchSesiList = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const guruId = session?.user?.id || session?.id

      let qSesi = supabase
        .from('cbt_sesi_ujian')
        .select('*, cbt_bank_soal(judul, total_soal)')
        .order('created_at', { ascending: false })

      if (guruId && !isAdmin) {
        qSesi = qSesi.eq('guru_id', guruId)
      }
      const { data: sesiData, error: errSesi } = await qSesi
      if (errSesi) throw errSesi

      const now = new Date()
      const expiredSessionIds = []
      const activatedSessionIds = []

      // Evaluasi status dinamis berdasarkan waktu_buka & waktu_tutup
      const processedSesiData = (sesiData || []).map(s => {
        if (s.status === 'draft') return s
        const waktuTutup = s.waktu_tutup || s.waktu_selesai
        const waktuBuka = s.waktu_buka || s.waktu_mulai

        let effectiveStatus = s.status

        // Jika batas waktu selesai sudah lewat, status otomatis 'selesai'
        if (waktuTutup && new Date(waktuTutup) <= now) {
          effectiveStatus = 'selesai'
          if (s.status !== 'selesai') {
            expiredSessionIds.push(s.id)
          }
        } else if (waktuBuka && new Date(waktuBuka) <= now) {
          // Jika waktu buka sudah tiba dan belum tutup
          if (s.status === 'mendatang' || s.status === 'terjadwal') {
            effectiveStatus = 'berlangsung'
            activatedSessionIds.push(s.id)
          }
        } else if (waktuBuka && new Date(waktuBuka) > now) {
          // Jika waktu buka belum tiba
          if (s.status !== 'selesai' && s.status !== 'draft') {
            effectiveStatus = 'mendatang'
          }
        }

        return { ...s, status: effectiveStatus }
      })

      // Sinkronisasi status ke Supabase di background jika ada yang berubah
      if (expiredSessionIds.length > 0) {
        supabase
          .from('cbt_sesi_ujian')
          .update({ status: 'selesai' })
          .in('id', expiredSessionIds)
          .then(({ error }) => {
            if (error) console.warn('[CBT] Gagal auto-update sesi selesai:', error.message)
          })
      }
      if (activatedSessionIds.length > 0) {
        supabase
          .from('cbt_sesi_ujian')
          .update({ status: 'berlangsung' })
          .in('id', activatedSessionIds)
          .then(({ error }) => {
            if (error) console.warn('[CBT] Gagal auto-update sesi berlangsung:', error.message)
          })
      }

      setSesiList(processedSesiData)
    } catch (err) {
      console.error('Gagal mengambil daftar sesi:', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Filter Penilaian di Section 1 (Kiri)
  const filteredSesiList = sesiList.filter(s => {
    // 1. Filter Status
    if (filterStatus === 'draft' && s.status !== 'draft') return false
    if (filterStatus === 'mendatang' && s.status !== 'mendatang' && s.status !== 'terjadwal') return false
    if (filterStatus === 'berlangsung' && s.status !== 'berlangsung' && s.status !== 'aktif') return false
    if (filterStatus === 'selesai' && s.status !== 'selesai') return false

    // 2. Filter Rombel Kelas Target
    if (filterRombel !== 'all') {
      const kelasList = s.kelas_ids || []
      if (!kelasList.includes(filterRombel)) return false
    }

    // 3. Search Kata Kunci
    if (!searchKeyword) return true
    const kw = searchKeyword.toLowerCase()
    return (
      (s.judul && s.judul.toLowerCase().includes(kw)) ||
      (s.mapel && s.mapel.toLowerCase().includes(kw)) ||
      (s.kelas_ids && s.kelas_ids.join(' ').toLowerCase().includes(kw))
    )
  })

  // Penilaian yang sedang dipilih untuk dimonitor di Section 2 (Kanan)
  const selectedSesi = sesiList.find(s => s.id === selectedSesiId) || filteredSesiList[0] || null

  const cleanedSelectedKelasList = useMemo(() => {
    const uniqueMap = new Map()
    for (const k of (selectedSesi?.kelas_ids || [])) {
      const trimmed = String(k).trim()
      if (trimmed && !['undefined', 'null', '-', '', 'none'].includes(trimmed.toLowerCase())) {
        const lower = trimmed.toLowerCase()
        if (!uniqueMap.has(lower)) {
          uniqueMap.set(lower, trimmed)
        }
      }
    }
    return Array.from(uniqueMap.values())
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [selectedSesi?.kelas_ids])

  // Otomatis pilih sesi pertama bila belum ada yang dipilih
  useEffect(() => {
    if (!selectedSesiId && filteredSesiList.length > 0) {
      // Prioritaskan sesi yang sedang berlangsung, jika ada
      const activeOne = filteredSesiList.find(s => s.status === 'berlangsung' || s.status === 'aktif')
      setSelectedSesiId(activeOne ? activeOne.id : filteredSesiList[0].id)
    }
  }, [filteredSesiList, selectedSesiId])

  // =========================================================================
  // 2. Monitoring Realtime Siswa Saat Sesi Terpilih Berganti
  // =========================================================================
  useEffect(() => {
    if (!selectedSesi?.id) {
      setTargetStudents([])
      setPesertaMap({})
      setAnsweredCountMap({})
      setActualSoalCount(null)
      return
    }

    fetchMonitoringData(selectedSesi)

    // Setup Supabase Realtime Subscription untuk cbt_peserta_ujian & Room Broadcast Instan (<50ms)
    // Catatan: Tidak menggunakan filter di level server agar perubahan selalu tertangkap tanpa terpengaruh REPLICA IDENTITY
    const roomChannel = supabase
      .channel(`cbt_exam_room_${selectedSesi.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cbt_peserta_ujian'
      }, (payload) => {
        const item = payload.new || payload.old
        // Filter di level JS agar aman: hanya proses jika sesi sesuai atau siswa terdaftar di target sesi ini
        if (item && item.sesi_id && String(item.sesi_id) !== String(selectedSesi.id)) {
          return
        }
        setLiveSyncPulse(true)
        setTimeout(() => setLiveSyncPulse(false), 800)
        handleRealtimePesertaUpdate(payload)
      })
      .on('broadcast', { event: 'student_started_exam' }, (payload) => {
        const data = payload?.payload
        if (data?.siswa_nisn) {
          setLiveSyncPulse(true)
          setTimeout(() => setLiveSyncPulse(false), 800)
          setPesertaMap(prev => ({
            ...prev,
            [data.siswa_nisn]: {
              ...(prev[data.siswa_nisn] || {}),
              id: data.peserta_id || prev[data.siswa_nisn]?.id,
              siswa_nisn: data.siswa_nisn,
              status: 'sedang_mengerjakan',
              waktu_mulai: data.waktu_mulai || new Date().toISOString()
            }
          }))
          fetchPesertaDataOnly(selectedSesi.id)
        }
      })
      .on('broadcast', { event: 'student_submitted_exam' }, (payload) => {
        const data = payload?.payload
        if (data?.siswa_nisn) {
          setLiveSyncPulse(true)
          setTimeout(() => setLiveSyncPulse(false), 800)
          setPesertaMap(prev => ({
            ...prev,
            [data.siswa_nisn]: {
              ...(prev[data.siswa_nisn] || {}),
              id: data.peserta_id || prev[data.siswa_nisn]?.id,
              siswa_nisn: data.siswa_nisn,
              status: 'selesai',
              waktu_selesai: data.waktu_selesai || new Date().toISOString(),
              ...(data.nilai_akhir !== null && data.nilai_akhir !== undefined ? { nilai_akhir: data.nilai_akhir } : {})
            }
          }))
          fetchPesertaDataOnly(selectedSesi.id)
        }
      })
      .on('broadcast', { event: 'student_progress_update' }, (payload) => {
        const data = payload?.payload
        if (data?.peserta_id && data.answered_count !== undefined) {
          setAnsweredCountMap(prev => ({
            ...prev,
            [data.peserta_id]: data.answered_count
          }))
        }
      })
      .subscribe()

    roomChannelRef.current = roomChannel

    // Polling adaptif setiap 3 detik untuk sinkronisasi cadangan
    const interval = setInterval(() => {
      fetchPesertaDataOnly(selectedSesi.id)
    }, 3000)

    // Re-sync seketika saat window/tab kembali aktif (mencegah Chrome throttle saat background)
    const handleWindowFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchPesertaDataOnly(selectedSesi.id)
      }
    }
    window.addEventListener('focus', handleWindowFocusOrVisible)
    document.addEventListener('visibilitychange', handleWindowFocusOrVisible)

    return () => {
      roomChannelRef.current = null
      supabase.removeChannel(roomChannel)
      clearInterval(interval)
      window.removeEventListener('focus', handleWindowFocusOrVisible)
      document.removeEventListener('visibilitychange', handleWindowFocusOrVisible)
    }
  }, [selectedSesi?.id])

  const fetchMonitoringData = async (sesi) => {
    setMonitoringLoading(true)
    try {
      const kelasTarget = sesi.kelas_ids || []
      if (kelasTarget.length === 0) {
        setTargetStudents([])
        setMonitoringLoading(false)
        return
      }

      // Ambil seluruh siswa aktif di kelas target pada tahun ajaran aktif
      const { data: siswaData, error: errSiswa } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas, is_aktif')
        .in('kelas', kelasTarget)
        .eq('is_aktif', true)
        .order('kelas', { ascending: true })
        .order('nama_lengkap', { ascending: true })

      if (errSiswa) throw errSiswa
      setTargetStudents(siswaData || [])

      // Ambil jumlah soal aktual dari cbt_soal berdasarkan bank_soal_id
      if (sesi.bank_soal_id) {
        const { count, error: errCount } = await supabase
          .from('cbt_soal')
          .select('id', { count: 'exact', head: true })
          .eq('bank_soal_id', sesi.bank_soal_id)

        if (!errCount && count !== null) {
          setActualSoalCount(count)
          // Jika total_soal di bank_soal belum sinkron, update di background
          if (sesi.cbt_bank_soal?.total_soal !== count) {
            supabase
              .from('cbt_bank_soal')
              .update({ total_soal: count })
              .eq('id', sesi.bank_soal_id)
              .then(() => {})
          }
        }
      }

      // Ambil data peserta ujian sesi ini
      await fetchPesertaDataOnly(sesi.id)
    } catch (err) {
      console.error('Gagal memuat data monitoring:', err)
    } finally {
      setMonitoringLoading(false)
    }
  }

  const fetchPesertaDataOnly = async (sesiId) => {
    try {
      const { data: pData, error: errP } = await supabase
        .from('cbt_peserta_ujian')
        .select('*')
        .eq('sesi_id', sesiId)

      if (errP) throw errP

      const map = {}
      const pesertaIds = []
      const durasiMenit = selectedSesi?.durasi_menit || 90
      const nowMs = Date.now()
      const staleExpiredList = []

      ;(pData || []).forEach(p => {
        // Cek jika siswa sudah melewati batas waktu ujian (waktu_mulai + durasi_menit)
        const totalDurasi = durasiMenit + (p.extra_waktu_menit || 0)
        const isExpired = p.waktu_mulai && (
          nowMs > (new Date(p.waktu_mulai).getTime() + (totalDurasi + 2) * 60 * 1000)
        )

        if ((p.status === 'sedang_mengerjakan' || p.status === 'terkunci') && isExpired) {
          const expiredEndIso = new Date(new Date(p.waktu_mulai).getTime() + totalDurasi * 60 * 1000).toISOString()
          map[p.siswa_nisn] = {
            ...p,
            status: 'selesai',
            waktu_selesai: p.waktu_selesai || expiredEndIso,
            isAutoExpired: true
          }
          staleExpiredList.push(p)
        } else {
          map[p.siswa_nisn] = p
        }
        pesertaIds.push(p.id)
      })
      setPesertaMap(map)

      // Auto-finalize sesi siswa yang telah kadaluarsa ke database secara hening
      if (staleExpiredList.length > 0) {
        Promise.all(staleExpiredList.map(async (stale) => {
          try {
            const totalDurasi = durasiMenit + (stale.extra_waktu_menit || 0)
            const expiredEndIso = new Date(new Date(stale.waktu_mulai).getTime() + totalDurasi * 60 * 1000).toISOString()
            await supabase
              .from('cbt_peserta_ujian')
              .update({
                status: 'selesai',
                waktu_selesai: expiredEndIso,
                is_blocked: false
              })
              .eq('id', stale.id)
            await supabase.rpc('cbt_internal_score_submission', { p_peserta_id: stale.id })
          } catch (e) {
            console.warn('[Auto Finalize Stale] Error:', e)
          }
        }))
      }

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
            console.warn('Auto scoring error in teacher monitoring:', e)
          }
        })).then(() => {
          setPesertaMap({ ...map })
        })
      }

      // Ambil progress jawaban siswa
      if (pesertaIds.length > 0) {
        const { data: ansData, error: errAns } = await supabase
          .from('cbt_jawaban_siswa')
          .select('peserta_id, jawaban_terpilih')
          .in('peserta_id', pesertaIds)

        if (!errAns && ansData) {
          const countMap = {}
          ansData.forEach(a => {
            if (a.jawaban_terpilih && a.jawaban_terpilih.trim() !== '') {
              countMap[a.peserta_id] = (countMap[a.peserta_id] || 0) + 1
            }
          })
          setAnsweredCountMap(countMap)
        }
      }
    } catch (err) {
      console.error('Gagal fetch peserta data:', err)
    }
  }

  const handleRealtimePesertaUpdate = (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const item = payload.new
      setPesertaMap(prev => ({
        ...prev,
        [item.siswa_nisn]: item
      }))
      // Segarkan jumlah jawaban & nilai terbaru dari server
      if (selectedSesi?.id) {
        fetchPesertaDataOnly(selectedSesi.id)
      }
    } else if (payload.eventType === 'DELETE') {
      const oldItem = payload.old
      setPesertaMap(prev => {
        const next = { ...prev }
        delete next[oldItem.siswa_nisn]
        return next
      })
    }
  }

  // =========================================================================
  // 3. Aksi Pengawas Siswa (Section 2)
  // =========================================================================

  // Helper Pengawas: Kirim sinyal Realtime Broadcast instan (<30ms) ke HP siswa & Ruang Ujian
  const broadcastProctorSignal = (pesertaId, eventName, payload = {}) => {
    try {
      const fullPayload = { peserta_id: pesertaId, sesi_id: selectedSesi?.id, ...payload }

      // 1. Kirim via active Room Channel utama yang persisten (instan <20ms, saluran aktif)
      if (roomChannelRef.current) {
        roomChannelRef.current.send({
          type: 'broadcast',
          event: eventName,
          payload: fullPayload
        }).catch(err => console.warn('[CBT Proctor Broadcast] Room send error:', err))
      }

      // 2. Jalur ganda redundan langsung ke personal channel siswa (peserta_sync_${pesertaId})
      if (pesertaId) {
        const directCh = supabase.channel(`peserta_sync_${pesertaId}`)
        directCh.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            directCh.send({ type: 'broadcast', event: eventName, payload: fullPayload }).catch(() => {})
            setTimeout(() => {
              try { supabase.removeChannel(directCh) } catch {}
            }, 3000)
          }
        })
      }
    } catch (e) {
      console.warn('[CBT Proctor Broadcast] Failover broadcast error:', e)
    }
  }

  // Aksi A: Reset Kunci Perangkat Siswa (Single Device Lock / jika ganti HP / HP macet)
  const handleResetPesertaLogin = async (pesertaRecord, studentName, studentNisn) => {
    let pRecord = pesertaRecord
    if (!pRecord && studentNisn && selectedSesi?.id) {
      try {
        const { data } = await supabase
          .from('cbt_peserta_ujian')
          .select('*')
          .eq('sesi_id', selectedSesi.id)
          .eq('siswa_nisn', studentNisn)
          .maybeSingle()
        pRecord = data
      } catch (err) {
        console.warn('Cari peserta error:', err)
      }
    }

    if (!pRecord) {
      showToast(`Siswa ${studentName} belum pernah memulai ujian ini, perangkat belum terkunci.`, 'info')
      return
    }

    const confirmed = await requestConfirm({
      title: 'Reset Kunci Perangkat Siswa?',
      message: `Reset kunci perangkat untuk siswa ${studentName}? Siswa akan dapat login kembali dan melanjutkan ujian dari HP/perangkat cadangan. Seluruh jawaban yang sudah tersimpan TIDAK akan hilang.`,
      confirmLabel: 'Ya, Reset Perangkat',
      confirmColor: 'amber',
      icon: 'warning',
    })
    if (!confirmed) return

    const newStatus = pRecord.waktu_mulai ? 'belum_melanjutkan' : 'belum_mulai'

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms)
    setPesertaMap(prev => ({
      ...prev,
      [pRecord.siswa_nisn]: {
        ...(prev[pRecord.siswa_nisn] || pRecord),
        device_id: null,
        device_info: null,
        status: newStatus,
        is_blocked: false,
        block_reason: null
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN (<30ms)
    broadcastProctorSignal(pRecord.id, 'device_reset_student', {
      siswa_nisn: pRecord.siswa_nisn,
      device_id: null,
      status: newStatus
    })

    setActionLoading(true)
    try {
      // 1. Coba via RPC jika sudah dideploy
      const { error: rpcErr } = await supabase.rpc('cbt_proctor_reset_device', {
        p_peserta_id: pRecord.id
      })

      // 2. Fallback update langsung jika RPC belum tersedia
      if (rpcErr) {
        const { error: updateErr } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            device_id: null,
            device_info: null,
            status: newStatus,
            is_blocked: false,
            block_reason: null
          })
          .eq('id', pRecord.id)

        if (updateErr) throw updateErr
      }

      showToast(`Kunci perangkat untuk ${studentName} berhasil di-reset. Siswa dapat login di HP baru.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal reset perangkat siswa: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi B: Tambah Waktu Individual
  const handleConfirmAddExtraTime = async () => {
    if (!extraTimeTarget) return
    const extraMinutes = parseInt(inputExtraMinutes, 10)

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms)
    const curExtra = extraTimeTarget.extra_waktu_menit || 0
    setPesertaMap(prev => ({
      ...prev,
      [extraTimeTarget.siswa_nisn]: {
        ...(prev[extraTimeTarget.siswa_nisn] || extraTimeTarget),
        extra_waktu_menit: curExtra + extraMinutes
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN (<30ms)
    broadcastProctorSignal(extraTimeTarget.id, 'extra_time_student', {
      siswa_nisn: extraTimeTarget.siswa_nisn,
      minutes: extraMinutes
    })

    const targetPeserta = extraTimeTarget
    setExtraTimeTarget(null)
    setActionLoading(true)
    try {
      const { error } = await supabase.rpc('cbt_proctor_add_extra_time', {
        p_peserta_id: targetPeserta.id,
        p_menit: extraMinutes
      })
      if (error) throw error

      showToast(`Waktu tambahan +${inputExtraMinutes} menit berhasil diberikan.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal menambah waktu: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi C: Tambah Waktu Massal ke Seluruh Siswa yang Sedang Mengerjakan
  const handleBulkAddExtraTime = async () => {
    const minutes = 15
    const confirmed = await requestConfirm({
      title: 'Tambah Waktu Massal?',
      message: `Berikan tambahan waktu +${minutes} menit untuk SEMUA siswa yang sedang mengerjakan ujian ini?`,
      confirmLabel: `+${minutes} Menit`,
      confirmColor: 'indigo',
      icon: 'info',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      const activePesertaList = Object.values(pesertaMap).filter(p => p.status === 'sedang_mengerjakan' || p.status === 'terkunci')
      if (activePesertaList.length === 0) {
        showToast('Tidak ada siswa yang berstatus sedang mengerjakan.', 'info')
        setActionLoading(false)
        return
      }

      for (const p of activePesertaList) {
        await supabase.rpc('cbt_proctor_add_extra_time', {
          p_peserta_id: p.id,
          p_menit: minutes
        })
      }

      broadcastProctorSignal(null, 'bulk_extra_time', { minutes })
      showToast(`Berhasil menambahkan waktu +${minutes} menit ke ${activePesertaList.length} siswa aktif.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal menambah waktu massal: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi D: Paksa Kumpulkan (Force Submit)
  const handleForceSubmitPeserta = async (pesertaRecord, studentName) => {
    const confirmed = await requestConfirm({
      title: 'Paksa Kumpulkan Ujian?',
      message: `Paksa kumpulkan lembar ujian siswa ${studentName}? Ujian siswa akan otomatis diselesaikan dan disimpan ke server.`,
      confirmLabel: 'Paksa Kumpulkan',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return

    const nowIso = new Date().toISOString()
    const isInstan = selectedSesi?.tampilkan_nilai === 'instan'

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms): Siswa langsung berpindah ke tab 'Sudah Dikumpulkan' di layar Admin
    setPesertaMap(prev => ({
      ...prev,
      [pesertaRecord.siswa_nisn]: {
        ...(prev[pesertaRecord.siswa_nisn] || pesertaRecord),
        status: 'selesai',
        waktu_selesai: nowIso,
        is_blocked: false,
        block_reason: null
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN KE HP SISWA (<30ms): Segera alihkan layar siswa tanpa menunggu RPC server
    broadcastProctorSignal(pesertaRecord.id, 'force_submit_student', {
      siswa_nisn: pesertaRecord.siswa_nisn,
      status: 'selesai',
      is_nilai_shared: isInstan
    })

    setActionLoading(true)
    try {
      // 3. Jalankan penskoran otomatis server-side di background
      let finalScore = null
      try {
        const { data: score } = await supabase.rpc('cbt_internal_score_submission', {
          p_peserta_id: pesertaRecord.id
        })
        if (score !== null && score !== undefined) finalScore = score
      } catch (scoreErr) {
        console.warn('RPC cbt_internal_score_submission error:', scoreErr)
      }

      // 4. Kunci status peserta di database
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
        .eq('id', pesertaRecord.id)

      if (error) throw error

      // 5. Update skor di map lokal dan broadcast pembaruan skor
      if (finalScore !== null && finalScore !== undefined) {
        setPesertaMap(prev => ({
          ...prev,
          [pesertaRecord.siswa_nisn]: {
            ...(prev[pesertaRecord.siswa_nisn] || {}),
            nilai_akhir: finalScore
          }
        }))
        broadcastProctorSignal(pesertaRecord.id, 'force_submit_student', {
          siswa_nisn: pesertaRecord.siswa_nisn,
          status: 'selesai',
          nilai_akhir: finalScore,
          is_nilai_shared: isInstan
        })
      }

      showToast(`Lembar ujian ${studentName} berhasil dikumpulkan & dinilai otomatis (Skor: ${finalScore ?? '-'}).`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal paksa kumpulkan: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi E: Buka Blokir (Unblock / Remote Unlock)
  const handleUnblockPeserta = async (pesertaRecord, studentName) => {
    const confirmed = await requestConfirm({
      title: 'Buka Kunci Ujian?',
      message: `Buka kunci ujian untuk siswa ${studentName}? Siswa akan dapat melanjutkan pengerjaan ujian.`,
      confirmLabel: 'Buka Kunci',
      confirmColor: 'emerald',
      icon: 'info',
    })
    if (!confirmed) return

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms)
    setPesertaMap(prev => ({
      ...prev,
      [pesertaRecord.siswa_nisn]: {
        ...(prev[pesertaRecord.siswa_nisn] || pesertaRecord),
        is_blocked: false,
        block_reason: null,
        status: 'sedang_mengerjakan',
        strike_count: 0
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN (<30ms)
    broadcastProctorSignal(pesertaRecord.id, 'unblock_student', {
      siswa_nisn: pesertaRecord.siswa_nisn,
      status: 'sedang_mengerjakan',
      is_blocked: false
    })

    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          is_blocked: false,
          block_reason: null,
          status: pesertaRecord?.status === 'terkunci' ? 'sedang_mengerjakan' : (pesertaRecord?.status || 'sedang_mengerjakan'),
          strike_count: 0
        })
        .eq('id', pesertaRecord.id)

      if (error) throw error

      showToast(`Kunci / blokir ujian untuk ${studentName} berhasil dibuka.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal membuka kunci: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi Blokir & Buka Blokir Siswa dari Penilaian (Tab Belum Mulai & Semua)
  const handleOpenBlockModal = (studentItem, pesertaRecord) => {
    setBlockTarget({ student: studentItem, peserta: pesertaRecord })
    setInputBlockReason('Pelanggaran tata tertib ujian')
  }

  const handleConfirmBlockStudent = async (e) => {
    if (e) e.preventDefault()
    if (!blockTarget || !selectedSesi) return

    const { student, peserta } = blockTarget

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms)
    setPesertaMap(prev => ({
      ...prev,
      [student.nisn]: {
        ...(prev[student.nisn] || peserta || {}),
        is_blocked: true,
        block_reason: inputBlockReason.trim() || 'Diblokir oleh pengawas'
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN (<30ms)
    broadcastProctorSignal(peserta?.id, 'block_student', {
      siswa_nisn: student.nisn,
      is_blocked: true,
      reason: inputBlockReason.trim() || 'Diblokir oleh pengawas'
    })

    setBlockTarget(null)
    setActionLoading(true)
    try {
      let targetPesertaId = peserta?.id
      if (!peserta) {
        // Siswa belum ada record di cbt_peserta_ujian, insert baru
        const { data: newRow, error } = await supabase
          .from('cbt_peserta_ujian')
          .insert({
            sesi_id: selectedSesi.id,
            siswa_nisn: student.nisn,
            kelas: student.kelas,
            status: 'belum_mulai',
            is_blocked: true,
            block_reason: inputBlockReason.trim() || 'Diblokir oleh pengawas'
          })
          .select('id')
          .single()
        if (error) throw error
        targetPesertaId = newRow?.id
      } else {
        const { error } = await supabase
          .from('cbt_peserta_ujian')
          .update({
            is_blocked: true,
            block_reason: inputBlockReason.trim() || 'Diblokir oleh pengawas'
          })
          .eq('id', peserta.id)
        if (error) throw error
      }

      showToast(`Siswa ${student.nama_lengkap} (${student.kelas}) berhasil diblokir dari penilaian.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal memblokir siswa: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnblockStudent = async (studentItem, pesertaRecord) => {
    if (!pesertaRecord) return
    const confirmed = await requestConfirm({
      title: 'Buka Blokir Ujian?',
      message: `Buka blokir ujian untuk siswa ${studentItem.nama_lengkap}? Siswa akan dapat mengakses ujian kembali.`,
      confirmLabel: 'Buka Blokir',
      confirmColor: 'emerald',
      icon: 'info',
    })
    if (!confirmed) return

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms)
    setPesertaMap(prev => ({
      ...prev,
      [studentItem.nisn]: {
        ...(prev[studentItem.nisn] || pesertaRecord),
        is_blocked: false,
        block_reason: null,
        status: 'sedang_mengerjakan',
        strike_count: 0
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN (<30ms)
    broadcastProctorSignal(pesertaRecord.id, 'unblock_student', {
      siswa_nisn: pesertaRecord.siswa_nisn || studentItem?.nisn,
      status: 'sedang_mengerjakan',
      is_blocked: false
    })

    setActionLoading(true)
    try {
      const { error } = await supabase
        .from('cbt_peserta_ujian')
        .update({
          is_blocked: false,
          block_reason: null,
          status: pesertaRecord.status === 'terkunci' ? 'sedang_mengerjakan' : pesertaRecord.status,
          strike_count: 0
        })
        .eq('id', pesertaRecord.id)

      if (error) throw error

      showToast(`Blokir ujian untuk siswa ${studentItem.nama_lengkap} berhasil dibuka.`, 'success')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal membuka blokir: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi Ujian Ulang Siswa (Retake Exam)
  const handleOpenRetakeModal = (studentItem, pesertaRecord) => {
    setRetakeTarget({ student: studentItem, peserta: pesertaRecord })
    setRetakeOption('terakhir')
  }

  const handleConfirmRetakeExam = async () => {
    if (!retakeTarget || !retakeTarget.peserta) return
    const { student, peserta } = retakeTarget

    // 1. UPDATE OPTIMIS LANGSUNG (<1ms): Siswa langsung berpindah ke tab 'Belum Mulai' di layar Admin
    setPesertaMap(prev => ({
      ...prev,
      [student.nisn]: {
        ...(prev[student.nisn] || peserta),
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
      }
    }))
    setLiveSyncPulse(true)
    setTimeout(() => setLiveSyncPulse(false), 800)

    // 2. BROADCAST INSTAN KE HP SISWA (<30ms)
    broadcastProctorSignal(peserta.id, 'retake_student', {
      siswa_nisn: student.nisn || peserta.siswa_nisn,
      status: 'belum_mulai'
    })

    setRetakeTarget(null)
    setActionLoading(true)
    try {
      if (retakeOption === 'awal') {
        // 1. Hapus lembar jawaban siswa sebelumnya
        const { error: errDel } = await supabase
          .from('cbt_jawaban_siswa')
          .delete()
          .eq('peserta_id', peserta.id)
        if (errDel) throw errDel

        // 2. Set status peserta kembali ke belum_mulai
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

      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } catch (err) {
      showToast('Gagal mengaktifkan ujian ulang: ' + err.message, 'error')
      if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
    } finally {
      setActionLoading(false)
    }
  }

  // Aksi F: Lihat Rincian Lembar Jawaban Siswa (Modal Detail Pengerjaan)
  const handleOpenDetailAnswers = async (student, pesertaRecord) => {
    if (!pesertaRecord) {
      showToast('Siswa belum mulai ujian, belum ada rekaman jawaban.', 'info')
      return
    }
    setDetailPesertaId(pesertaRecord.id)
  }

  const handleCloseDetailAnswers = () => {
    setDetailPesertaId(null)
    setDetailAnswersTarget(null)
    setDetailAnswersList([])
  }

  // Navigasi cepat ke editor Bank Soal untuk penilaian terakhir / yang sedang dipilih
  const handleEditSoalPenilaian = async () => {
    const targetSesi = selectedSesi || (sesiList && sesiList[0])
    if (!targetSesi) return

    // Jika penilaian memiliki bank_soal_id terhubung, bawa id tersebut ke Bank Soal
    const targetBankId = targetSesi.bank_soal_id || null

    if (typeof onNavigate === 'function') {
      onNavigate('cbt_bank_soal', { bankId: targetBankId })
    } else {
      const url = new URL(window.location.href)
      url.searchParams.set('menu', 'cbt_bank_soal')
      if (targetBankId) {
        url.searchParams.set('bank_id', targetBankId)
      } else {
        url.searchParams.delete('bank_id')
      }
      window.history.pushState({}, '', url.toString())
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.location.href = url.toString()
    }
  }

  // =========================================================================
  // 4. Aksi Penilaian di Section 1 (Edit, Move to Draft, Toggle Status, Hapus)
  // =========================================================================
  // Buka wizard modal untuk edit penilaian yang sudah dibuat
  const handleOpenEditWizard = async (sesi, stepNumber = 1) => {
    try {
      if (!sesi) {
        showToast('Data penilaian tidak ditemukan.', 'error')
        return
      }

      // Ambil bank_soal_id dari sesi, atau fetch jika belum ter-populate
      let targetBankId = sesi.bank_soal_id
      if (!targetBankId && sesi.id) {
        const { data: sData } = await supabase
          .from('cbt_sesi_ujian')
          .select('bank_soal_id')
          .eq('id', sesi.id)
          .maybeSingle()
        targetBankId = sData?.bank_soal_id
      }

      // Ambil naskah soal lengkap dari database berdasarkan bank_soal_id
      let qData = []
      if (targetBankId) {
        const { data, error: qErr } = await supabase
          .from('cbt_soal')
          .select('*, cbt_soal_kunci(kunci_jawaban, pembahasan)')
          .eq('bank_soal_id', targetBankId)
          .order('nomor_urut', { ascending: true })

        if (qErr) throw qErr
        qData = data || []
      }

      // Format opsi dan kunci secara terstruktur untuk editor
      const formattedQuestions = (qData || []).map((q, idx) => {
        const kunci = extractKunciJawaban(q)
        const pembahasan = extractPembahasan(q)
        const parsedOpsi = parseQuestionOptions(q.opsi)

        const preparedOpsi = parsedOpsi.map(opt => ({
          ...opt,
          is_kunci: isOptionMatchKey(opt, kunci, q.tipe_soal) || Boolean(opt.is_kunci)
        }))

        return {
          ...q,
          nomor_urut: idx + 1,
          opsi: preparedOpsi,
          kunci_jawaban: kunci,
          pembahasan: pembahasan
        }
      })

      // Tentukan target step: jika step >= 2 dan sudah ada butir soal, langsung buka step 3 (Editor Split-Screen)
      let resolvedStep = stepNumber
      if (stepNumber >= 2) {
        resolvedStep = formattedQuestions.length > 0 ? 3 : 2
      }

      setWizardInitialData({
        ...sesi,
        bank_soal_id: targetBankId,
        step: resolvedStep,
        questions: formattedQuestions
      })
      setShowWizardModal(true)
    } catch (err) {
      showToast('Gagal memuat detail penilaian: ' + err.message, 'error')
    }
  }

  const handleMoveToDraft = async (sesiId) => {
    const confirmed = await requestConfirm({
      title: 'Kembalikan ke Draft?',
      message: 'Pindahkan penilaian ini kembali ke Draft? Seluruh form dan naskah soal akan terbuka kembali untuk Anda edit.',
      confirmLabel: 'Kembalikan ke Draft',
      confirmColor: 'amber',
      icon: 'warning',
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_sesi_ujian')
        .update({ status: 'draft' })
        .eq('id', sesiId)

      if (error) throw error
      showToast('Penilaian berhasil dipindahkan ke Draft.', 'success')
      fetchSesiList()
    } catch (err) {
      showToast('Gagal memindahkan ke draft: ' + err.message, 'error')
    }
  }

  const handleQuickUpdateStatus = async (sesiId, nextStatus) => {
    const isActivating = nextStatus === 'berlangsung' || nextStatus === 'aktif'
    const confirmed = await requestConfirm({
      title: isActivating ? 'Mulai Ujian Sekarang?' : 'Tutup Sesi Ujian?',
      message: isActivating
        ? 'Mulai dan buka ujian sekarang untuk seluruh siswa peserta?'
        : 'Tutup sesi ujian ini sekarang? Siswa tidak akan dapat masuk kembali.',
      confirmLabel: isActivating ? 'Buka Ujian' : 'Tutup Ujian',
      confirmColor: isActivating ? 'emerald' : 'red',
      icon: isActivating ? 'info' : 'warning',
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_sesi_ujian')
        .update({ status: nextStatus })
        .eq('id', sesiId)

      if (error) throw error
      showToast(`Status penilaian berhasil diubah menjadi "${nextStatus}".`, 'success')
      fetchSesiList()
    } catch (err) {
      showToast('Gagal memperbarui status: ' + err.message, 'error')
    }
  }

  const handleDeleteSesi = async (sesiId) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Penilaian Permanen?',
      message: 'Hapus penilaian ini secara permanen dari basis data? Seluruh riwayat dan pengaturan sesi akan terhapus.',
      confirmLabel: 'Hapus Permanen',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_sesi_ujian')
        .delete()
        .eq('id', sesiId)

      if (error) throw error
      showToast('Penilaian berhasil dihapus.', 'success')
      fetchSesiList()
      if (selectedSesiId === sesiId) setSelectedSesiId(null)
    } catch (err) {
      showToast('Gagal menghapus penilaian: ' + err.message, 'error')
    }
  }

  // Modal Kelola Ruang (Admin)
  const handleOpenRuangModal = (sesi) => {
    setTargetSesiRuang(sesi)
    setRuangForm(sesi.ruang_mapping && Object.keys(sesi.ruang_mapping).length > 0 
      ? sesi.ruang_mapping 
      : {
          'Ruang 01': { kelas: sesi.kelas_ids || [], token: 'R1-88K' }
        }
    )
    setShowRuangModal(true)
  }

  const handleSaveRuangMapping = async (e) => {
    e.preventDefault()
    setRuangSaving(true)
    try {
      const { error } = await supabase
        .from('cbt_sesi_ujian')
        .update({ ruang_mapping: ruangForm })
        .eq('id', targetSesiRuang.id)

      if (error) throw error
      showToast('Pengaturan ruang ujian berhasil disimpan.', 'success')
      setShowRuangModal(false)
      fetchSesiList()
    } catch (err) {
      showToast('Gagal menyimpan ruang: ' + err.message, 'error')
    } finally {
      setRuangSaving(false)
    }
  }

  // =========================================================================
  // 5. Klasifikasi Siswa ke dalam 4 TAB Monitoring (Section 2)
  // =========================================================================
  const totalTargetCount = targetStudents.length
  const totalSoal = actualSoalCount || selectedSesi?.cbt_bank_soal?.total_soal || 30

  // Filter siswa berdasarkan rombel di dalam Section 2 & kata kunci pencarian nama
  const filteredStudents = targetStudents.filter(s => {
    if (monitoringFilterKelas !== 'all' && s.kelas !== monitoringFilterKelas) return false
    if (studentSearchQuery) {
      const kw = studentSearchQuery.toLowerCase()
      const match = (s.nama_lengkap && s.nama_lengkap.toLowerCase().includes(kw)) ||
                    (s.nisn && s.nisn.toLowerCase().includes(kw)) ||
                    (s.kelas && s.kelas.toLowerCase().includes(kw))
      if (!match) return false
    }
    return true
  })

  const listBelumMulai = []
  const listSedangMengerjakan = []
  const listSelesai = []

  filteredStudents.forEach(s => {
    const p = pesertaMap[s.nisn]
    const durasiMenit = selectedSesi?.durasi_menit || 90
    const isExpired = p?.waktu_mulai && (
      Date.now() > (new Date(p.waktu_mulai).getTime() + ((durasiMenit + (p.extra_waktu_menit || 0) + 2) * 60 * 1000))
    )

    const isFinished = p?.status === 'selesai' || isExpired
    // Siswa dikatakan aktif sedang mengerjakan HANYA jika status sedang_mengerjakan/terkunci DAN memiliki device_id aktif
    const isActivelyWorking = (p?.status === 'sedang_mengerjakan' || p?.status === 'terkunci') && Boolean(p?.device_id)

    if (isFinished) {
      listSelesai.push({ ...s, peserta: { ...p, status: 'selesai', isAutoExpired: isExpired } })
    } else if (isActivelyWorking && !isExpired) {
      listSedangMengerjakan.push({ ...s, peserta: p })
    } else {
      // Masuk ke Belum Mulai / Belum Melanjutkan
      listBelumMulai.push({ ...s, peserta: p })
    }
  })

  // Siswa yang akan ditampilkan sesuai TAB aktif
  let activeTabStudents = []
  if (monitoringFilterTab === 'semua') {
    activeTabStudents = filteredStudents.map(s => ({ ...s, peserta: pesertaMap[s.nisn] }))
  } else if (monitoringFilterTab === 'belum_mulai') {
    activeTabStudents = listBelumMulai
  } else if (monitoringFilterTab === 'sedang_mengerjakan') {
    activeTabStudents = listSedangMengerjakan
  } else if (monitoringFilterTab === 'sudah_dikumpulkan') {
    activeTabStudents = listSelesai
  }

  // Sub-view: Lembar Daftar Pengumpulan Murid (Screenshot 1)
  if (activeSubView?.type === 'pengumpulan') {
    return (
      <div className="space-y-6">
        <CbtDaftarPengumpulanSection
          sesi={activeSubView.sesi || selectedSesi}
          currentSesi={activeSubView.sesi || selectedSesi}
          sesiList={sesiList}
          onSelectSesi={(newSesi) => {
            setSelectedSesiId(newSesi.id)
            setActiveSubView({ type: 'pengumpulan', sesi: newSesi })
          }}
          onBack={() => setActiveSubView(null)}
        />
        {ConfirmModalComponent}
        {ToastComponent}
      </div>
    )
  }

  // Sub-view: Detail Lembar Jawaban Siswa (Halaman Penuh, Bukan Pop-up)
  if (detailPesertaId) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <CbtDetailPengerjaanSiswaModal
          pesertaId={detailPesertaId}
          initialPesertaId={detailPesertaId}
          sesi={selectedSesi}
          sesiId={selectedSesi?.id}
          allPesertaList={targetStudents.map(s => pesertaMap[s.nisn]).filter(Boolean)}
          allPeserta={targetStudents.map(s => pesertaMap[s.nisn]).filter(Boolean)}
          isFullPage={true}
          onBack={() => setDetailPesertaId(null)}
          onClose={() => setDetailPesertaId(null)}
          onStudentChange={(newId) => setDetailPesertaId(newId)}
          onGraded={() => {
            if (selectedSesi) fetchPesertaDataOnly(selectedSesi.id)
          }}
        />
        {ConfirmModalComponent}
        {ToastComponent}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Global Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">
                Jadwal &amp; Sesi Ujian (Monitoring Terpadu)
              </h2>
              {isAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                  Akses Administrator
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih penilaian di sebelah kiri untuk melihat dan memantau ruang ujian siswa secara realtime di sebelah kanan.
            </p>
          </div>
        </div>

        {/* Tombol Buat Penilaian Baru */}
        <button
          onClick={() => {
            setWizardInitialData(null)
            setShowWizardModal(true)
          }}
          className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 self-start md:self-auto cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Buat Penilaian Baru</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2-SECTION SIDE-BY-SIDE LAYOUT                                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ======================================================================= */}
        {/* SECTION 1: KIRI (LIST SELURUH PENILAIAN)                                */}
        {/* ======================================================================= */}
        <div className="lg:col-span-4 space-y-3">
          
          {/* Filter Status Penilaian (Semua, Berlangsung, Mendatang, Selesai, Draft) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua ({sesiList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('berlangsung')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === 'berlangsung' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Berlangsung ({sesiList.filter(s => s.status === 'berlangsung' || s.status === 'aktif').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('mendatang')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === 'mendatang' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Mendatang ({sesiList.filter(s => s.status === 'mendatang' || s.status === 'terjadwal').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('selesai')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === 'selesai' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Selesai ({sesiList.filter(s => s.status === 'selesai').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('draft')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === 'draft' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Draft ({sesiList.filter(s => s.status === 'draft').length})
            </button>
          </div>

          {/* Search Bar Sederhana Penilaian */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari penilaian / mapel..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full text-xs px-3.5 py-2 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-medium text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* List Kartu Penilaian Vertikal */}
          <div className="space-y-2.5 max-h-[calc(100vh-230px)] overflow-y-auto pr-1">
            {loading ? (
              <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-200">
                Memuat daftar penilaian...
              </div>
            ) : filteredSesiList.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 text-xs">
                <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>Tidak ada penilaian yang sesuai filter.</span>
              </div>
            ) : (
              filteredSesiList.map(sesi => {
                const isSelected = selectedSesi?.id === sesi.id
                const isOngoing = sesi.status === 'berlangsung' || sesi.status === 'aktif'
                const isDraft = sesi.status === 'draft'
                const isFinished = sesi.status === 'selesai'
                const isExpanded = isSelected && !collapsedSesiMap[sesi.id]

                const uniqueKelasMap = new Map()
                for (const k of (sesi.kelas_ids || [])) {
                  const trimmed = String(k).trim()
                  if (trimmed && !['undefined', 'null', '-', '', 'none'].includes(trimmed.toLowerCase())) {
                    const lower = trimmed.toLowerCase()
                    if (!uniqueKelasMap.has(lower)) {
                      uniqueKelasMap.set(lower, trimmed)
                    }
                  }
                }
                const cleanedKelasList = Array.from(uniqueKelasMap.values())
                  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

                return (
                  <div
                    key={sesi.id}
                    className={`rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-400/20 shadow-xs'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                    }`}
                  >
                    {/* Header Kartu Penilaian */}
                    <div
                      onClick={() => handleToggleSesiExpand(sesi.id)}
                      className="p-3.5 flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isOngoing ? 'bg-emerald-500 animate-pulse' :
                          isDraft ? 'bg-amber-400' :
                          isFinished ? 'bg-slate-300' : 'bg-blue-500'
                        }`} />
                        <span className={`text-xs font-bold truncate transition-colors ${
                          isSelected ? 'text-indigo-900 font-extrabold' : 'text-slate-700 group-hover:text-indigo-600'
                        }`}>
                          {sesi.judul}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                          isOngoing ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          isDraft ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          isFinished ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {sesi.status}
                        </span>

                        {/* Tombol Panah Expand / Collapse */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleSesiExpand(sesi.id)
                          }}
                          className={`p-1 rounded-lg transition-all cursor-pointer ${
                            isExpanded
                              ? 'text-indigo-600 hover:bg-indigo-100/80 bg-indigo-50/50'
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                          }`}
                          title={isExpanded ? "Sembunyikan daftar rombel" : "Tampilkan daftar rombel"}
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600' : 'rotate-0 text-slate-400 group-hover:text-indigo-500'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Dropdown / Sub-list Kelas Target Penilaian saat Diklik */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-indigo-100/70 space-y-1.5 animate-fade-in">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 px-1 pt-1 flex items-center justify-between">
                          <span>Pilih Rombel Target:</span>
                          <span className="text-[9px] text-slate-400 font-medium font-mono">
                            {monitoringFilterKelas === 'all' ? 'Semua Ditampilkan' : `Kelas ${monitoringFilterKelas}`}
                          </span>
                        </div>

                        <div className="space-y-1">
                          {/* Pilihan: Semua Siswa dari Semua Kelas Target */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMonitoringFilterKelas('all')
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                              monitoringFilterKelas === 'all'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-white/80 text-slate-600 hover:bg-white hover:text-indigo-600 border border-indigo-100/60'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${monitoringFilterKelas === 'all' ? 'bg-white' : 'bg-indigo-300'}`} />
                              Semua Rombel Target
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${monitoringFilterKelas === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {cleanedKelasList.join(', ') || '-'}
                            </span>
                          </button>

                          {/* List Pilihan Kelas Individual */}
                          {cleanedKelasList.map(k => {
                            const isClassActive = monitoringFilterKelas === k
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMonitoringFilterKelas(k)
                                }}
                                className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                  isClassActive
                                    ? 'bg-indigo-600 text-white shadow-2xs'
                                    : 'bg-white/80 text-slate-600 hover:bg-white hover:text-indigo-600 border border-indigo-100/60'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isClassActive ? 'bg-white' : 'bg-indigo-400'}`} />
                                  Kelas {k}
                                </span>
                                <span className={`text-[10px] font-mono ${isClassActive ? 'text-indigo-100 font-bold' : 'text-slate-400'}`}>
                                  Tampilkan Siswa →
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* SECTION 2: KANAN (MONITORING SISWA TARGET - 4 TAB STATUS)               */}
        {/* ======================================================================= */}
        <div className={
          isMonitoringFullscreen
            ? "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-hidden flex flex-col items-center justify-center animate-in fade-in duration-200"
            : "lg:col-span-8 space-y-4"
        }>
          
          {!selectedSesi ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200/80 shadow-xs text-center text-slate-400 space-y-3 w-full">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-700">Pilih Salah Satu Penilaian</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Klik salah satu penilaian di sebelah kiri untuk melihat daftar seluruh siswa target dan memantau status ujian mereka secara langsung.
              </p>
            </div>
          ) : (
            <div className={`bg-white rounded-3xl border border-slate-200/90 transition-all ${
              isMonitoringFullscreen
                ? "w-full max-w-[1700px] h-full p-4 sm:p-6 md:p-7 flex flex-col shadow-2xl overflow-hidden"
                : "p-6 space-y-5 shadow-xs"
            }`}>
              
              {/* Header Informasi Penilaian Terpilih */}
              <div className="border-b border-slate-100 pb-4">
                {/* Baris 1: Judul Penilaian, Info Pokok, & Toolbar Aksi Pengawas */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10.5px] font-black uppercase text-indigo-600 tracking-wider">
                        MONITORING RUANG SISWA
                      </span>
                      {liveSyncPulse && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-700 animate-pulse">
                          Sync Realtime
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate" title={selectedSesi.judul}>
                      {selectedSesi.judul}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{selectedSesi.mapel}</span>
                      <span>•</span>
                      <span>Target: <strong className="text-indigo-700 font-mono font-bold">{cleanedSelectedKelasList.join(', ') || '-'}</strong></span>
                      <span>•</span>
                      <span>Durasi: <strong className="text-slate-700">{selectedSesi.durasi_menit || 90} Menit</strong></span>
                    </div>
                  </div>

                  {/* Toolbar Tombol Aksi Pengawas */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Tombol Full Screen Mode */}
                    <button
                      type="button"
                      onClick={() => setIsMonitoringFullscreen(prev => !prev)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isMonitoringFullscreen
                          ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-200'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90 shadow-2xs hover:border-slate-300'
                      }`}
                      title={isMonitoringFullscreen ? 'Keluar dari Mode Layar Penuh (ESC)' : 'Tampilkan Monitoring dalam Layar Penuh'}
                    >
                      {isMonitoringFullscreen ? (
                        <>
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Keluar Layar Penuh</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                          <span>Layar Penuh</span>
                        </>
                      )}
                    </button>

                    {/* Tombol Daftar Pengumpulan Murid */}
                    <button
                      type="button"
                      onClick={() => setActiveSubView({ type: 'pengumpulan', sesi: selectedSesi })}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      title="Buka Daftar Pengumpulan & Hasil Pengerjaan Siswa"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      <span>Daftar Pengumpulan Murid</span>
                    </button>

                    {/* Tombol Lihat Informasi Ujian */}
                    <button
                      type="button"
                      onClick={() => setShowExamInfoModal(true)}
                      className="px-3 py-2 bg-slate-50 hover:bg-indigo-50 active:scale-98 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 1 0 0118 0z" />
                      </svg>
                      <span>Informasi Ujian</span>
                    </button>

                    {/* Tombol Edit Soal */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditWizard(selectedSesi || filteredSesiList[0] || sesiList[0], 3)}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 active:scale-98 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      title="Buka Halaman Editor Soal Penilaian Ini"
                    >
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span>Edit Soal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fetchPesertaDataOnly(selectedSesi.id)}
                      disabled={monitoringLoading}
                      title="Perbarui Data Realtime"
                      className="p-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      <svg className={`w-4 h-4 ${monitoringLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>

                    {/* Tambah Waktu Massal */}
                    {(selectedSesi.status === 'berlangsung' || selectedSesi.status === 'aktif') && (
                      <button
                        type="button"
                        onClick={handleBulkAddExtraTime}
                        disabled={actionLoading}
                        className="px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 active:scale-98 text-amber-800 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 1 0 0118 0z" />
                        </svg>
                        <span>+15 Mnt</span>
                      </button>
                    )}

                    {/* Tombol Tutup Ujian */}
                    {(selectedSesi.status === 'berlangsung' || selectedSesi.status === 'aktif') && (
                      <button
                        type="button"
                        onClick={() => handleQuickUpdateStatus(selectedSesi.id, 'selesai')}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                      >
                        Tutup Ujian
                      </button>
                    )}
                  </div>
                </div>

                {/* Baris 2: Strip Akses Langsung Siswa (Tanpa Token) */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-700 shrink-0">
                    <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">⚡</span>
                    <span>Akses Siswa:</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-1 text-xs text-slate-600 font-semibold">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                      ✓ Akses Langsung Tanpa Token
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Siswa kelas <strong className="text-slate-800 font-bold">{selectedSesi.kelas_ids?.join(', ') || selectedSesi.target_rombel || '-'}</strong> dapat langsung klik "Mulai Mengerjakan" tanpa perlu mengetik token.
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 TAB MONITORING RESMI SESUAI PERMINTAAN */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-auto overflow-x-auto text-xs">
                  <button
                    type="button"
                    onClick={() => setMonitoringFilterTab('semua')}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      monitoringFilterTab === 'semua'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Semua ({filteredStudents.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonitoringFilterTab('belum_mulai')}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      monitoringFilterTab === 'belum_mulai'
                        ? 'bg-white text-amber-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Belum Mulai ({listBelumMulai.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonitoringFilterTab('sedang_mengerjakan')}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      monitoringFilterTab === 'sedang_mengerjakan'
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Sedang Mengerjakan ({listSedangMengerjakan.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonitoringFilterTab('sudah_dikumpulkan')}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                      monitoringFilterTab === 'sudah_dikumpulkan'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Sudah Dikumpulkan ({listSelesai.length})
                  </button>
                </div>

                {/* Search Siswa Saja (Dropdown filter kelas di section kanan dihapus sesuai permintaan) */}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Cari nama siswa..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium placeholder:text-slate-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* TABLE HEADER (LEBIH BESAR & TERTATA RAPI) */}
              <div className="hidden md:flex items-center px-4 py-3 bg-slate-50/90 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-500 uppercase tracking-wider">
                {monitoringFilterTab === 'belum_mulai' ? (
                  <>
                    <div className="w-12 text-center shrink-0">No</div>
                    <div className="flex-1 min-w-0 pr-4">Nama Siswa</div>
                    <div className="w-36 shrink-0 text-center">Status Akses</div>
                    <div className="w-44 shrink-0 text-right pr-2">Aksi</div>
                  </>
                ) : monitoringFilterTab === 'sedang_mengerjakan' ? (
                  <>
                    <div className="w-12 text-center shrink-0">No</div>
                    <div className="flex-1 min-w-0 pr-4">Nama Siswa</div>
                    <div className="w-44 shrink-0 text-center">Progress Pengerjaan</div>
                    <div className="w-32 shrink-0 text-center">Pelanggaran</div>
                    <div className="w-60 shrink-0 text-right pr-2">Aksi Pengawas</div>
                  </>
                ) : monitoringFilterTab === 'sudah_dikumpulkan' ? (
                  <>
                    <div className="w-12 text-center shrink-0">No</div>
                    <div className="flex-1 min-w-0 pr-4">Nama Siswa</div>
                    <div className="w-44 shrink-0 text-center">Hasil Ujian (Nilai)</div>
                    <div className="w-56 shrink-0 text-right pr-2">Aksi Siswa</div>
                  </>
                ) : (
                  /* Tab 'semua' */
                  <>
                    <div className="w-12 text-center shrink-0">No</div>
                    <div className="flex-1 min-w-0 pr-4">Nama Siswa</div>
                    <div className="w-36 shrink-0 text-center">Status</div>
                    <div className="w-40 shrink-0 text-center">Hasil / Progress</div>
                    <div className="w-56 shrink-0 text-right pr-2">Aksi</div>
                  </>
                )}
              </div>

              {/* LIST DAFTAR SISWA (TABEL LEBIH BESAR & LUAS) */}
              <div className={`space-y-2.5 overflow-y-auto pr-1 pb-24 ${
                isMonitoringFullscreen
                  ? 'flex-1 min-h-0'
                  : 'max-h-[calc(100vh-250px)] min-h-[420px]'
              }`}>
                {monitoringLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Memuat data peserta siswa...
                  </div>
                ) : activeTabStudents.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    Tidak ada siswa pada tab ini.
                  </div>
                ) : (
                  activeTabStudents.map((item, idx) => {
                    const p = item.peserta
                    const isMengerjakan = p && (p.status === 'sedang_mengerjakan' || p.status === 'terkunci') && Boolean(p.device_id)
                    const isBelumMelanjutkan = p && (p.status === 'belum_melanjutkan' || (Boolean(p.waktu_mulai) && !p.device_id && p.status !== 'selesai'))
                    const isSelesai = p && p.status === 'selesai'
                    const isBlocked = p && p.is_blocked
                    const answeredCount = p ? (answeredCountMap[p.id] || 0) : 0
                    const strikes = p?.pelanggaran_count || p?.strikes || 0

                    return (
                      <div
                        key={item.nisn}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 sm:gap-4 ${
                          activeStudentMenuNisn === item.nisn ? 'relative z-40' : 'relative z-10'
                        } ${
                          isBlocked
                            ? 'bg-rose-50/50 border-rose-200'
                            : isBelumMelanjutkan
                            ? 'bg-amber-50/40 border-amber-200/80 shadow-2xs'
                            : isMengerjakan
                            ? 'bg-blue-50/30 border-blue-200/80 shadow-2xs'
                            : isSelesai
                            ? 'bg-emerald-50/30 border-emerald-200/80'
                            : 'bg-white border-slate-200/70 hover:border-slate-300 shadow-2xs'
                        }`}
                      >
                        {/* ======================================================= */}
                        {/* 1. TAB BELUM MULAI                                      */}
                        {/* ======================================================= */}
                        {monitoringFilterTab === 'belum_mulai' ? (
                          <>
                            {/* No */}
                            <div className="w-12 text-xs font-bold text-slate-400 text-center shrink-0">
                              {idx + 1}
                            </div>

                            {/* Nama Siswa (Tanpa Kelas, NISN, Foto) */}
                            <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
                              <span className="text-sm font-bold text-slate-800 truncate" title={item.nama_lengkap}>
                                {item.nama_lengkap}
                              </span>
                              {(p?.status === 'belum_melanjutkan' || (p?.waktu_mulai && !p?.device_id)) && (
                                <span className="text-[10.5px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Perangkat di-reset • Menunggu siswa login kembali
                                </span>
                              )}
                            </div>

                            {/* Status Akses */}
                            <div className="w-36 shrink-0 flex items-center justify-center">
                              {isBlocked ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Terblokir
                                </span>
                              ) : (p?.status === 'belum_melanjutkan' || (p?.waktu_mulai && !p?.device_id)) ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200" title="Perangkat telah di-reset. Siswa belum melanjutkan di perangkat baru.">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Belum Melanjutkan
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Siap Ujian
                                </span>
                              )}
                            </div>

                            {/* Aksi Blokir / Buka Blokir & Titik Tiga */}
                            <div className="w-44 shrink-0 flex items-center justify-end gap-1.5 pr-2">
                              {isBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblockStudent(item, p)}
                                  disabled={actionLoading}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                                  title="Buka blokir siswa agar dapat mengikuti penilaian"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                  </svg>
                                  <span>Buka Blokir</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenBlockModal(item, p)}
                                  disabled={actionLoading}
                                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                                  title="Blokir siswa ini dari penilaian"
                                >
                                  <svg className="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                  <span>Blokir</span>
                                </button>
                              )}

                              {/* Dropdown Menu Opsi Tambahan (•••) */}
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (menuTarget?.student?.nisn === item.nisn) {
                                      setMenuTarget(null)
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setMenuTarget({ student: item, peserta: p, rect })
                                    }
                                  }}
                                  className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                    menuTarget?.student?.nisn === item.nisn
                                      ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                  }`}
                                  title="Menu Opsi Lainnya"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </>
                        ) : monitoringFilterTab === 'sedang_mengerjakan' ? (
                          /* ======================================================= */
                          /* 2. TAB SEDANG MENGERJAKAN                               */
                          /* ======================================================= */
                          <>
                            {/* No */}
                            <div className="w-12 text-xs font-bold text-slate-400 text-center shrink-0">
                              {idx + 1}
                            </div>

                            {/* Nama Siswa (Tanpa Kelas, NISN, Foto) */}
                            <div className="flex-1 min-w-0 pr-4 flex items-center">
                              <span className="text-sm font-bold text-slate-800 truncate" title={item.nama_lengkap}>
                                {item.nama_lengkap}
                              </span>
                            </div>

                            {/* Progress Pengerjaan */}
                            <div className="w-44 shrink-0 px-2">
                              <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
                                <span>Terjawab</span>
                                <strong className="text-slate-800 font-mono font-bold">{answeredCount} / {totalSoal} Soal</strong>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, (answeredCount / totalSoal) * 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Pelanggaran */}
                            <div className="w-32 shrink-0 text-center flex items-center justify-center">
                              {selectedSesi.anti_curang ? (
                                strikes > 0 ? (
                                  <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold inline-flex items-center gap-1 ${
                                    strikes >= 3 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}>
                                    ⚠️ {strikes}x Pindah
                                  </span>
                                ) : (
                                  <span className="text-xs text-emerald-600 font-bold inline-flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    0 Pelanggaran
                                  </span>
                                )
                              ) : (
                                <span className="text-slate-300 text-xs font-mono">-</span>
                              )}
                            </div>

                            {/* Aksi Pengawas */}
                            <div className="w-60 shrink-0 flex items-center justify-end gap-1.5 pr-1 relative">
                              {/* 1. Tombol Utama (Buka Kunci atau + Waktu) */}
                              {(isBlocked || (p && p.status === 'terkunci')) ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnblockPeserta(p, item.nama_lengkap)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                                  title="Buka Kunci Layar Ujian Siswa"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                  </svg>
                                  <span>Buka Kunci</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setExtraTimeTarget(p)}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                                  title="Beri Tambahan Waktu Siswa Ini"
                                >
                                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 1 0 0118 0z" />
                                  </svg>
                                  <span>+ Wkt</span>
                                </button>
                              )}

                              {/* 2. Tombol Kumpulkan Paksa */}
                              <button
                                type="button"
                                onClick={() => handleForceSubmitPeserta(p, item.nama_lengkap)}
                                disabled={actionLoading}
                                className="px-2.5 py-1.5 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                                title="Paksa Kumpulkan Ujian Siswa Ini"
                              >
                                Kumpulkan
                              </button>

                              {/* 3. Dropdown Menu Opsi Tambahan (•••) */}
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (menuTarget?.student?.nisn === item.nisn) {
                                      setMenuTarget(null)
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setMenuTarget({ student: item, peserta: p, rect })
                                    }
                                  }}
                                  className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                    menuTarget?.student?.nisn === item.nisn
                                      ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                  }`}
                                  title="Menu Opsi Lainnya"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </>
                        ) : monitoringFilterTab === 'sudah_dikumpulkan' ? (
                          /* ======================================================= */
                          /* 3. TAB SUDAH DIKUMPULKAN                                */
                          /* ======================================================= */
                          <>
                            {/* No */}
                            <div className="w-12 text-xs font-bold text-slate-400 text-center shrink-0">
                              {idx + 1}
                            </div>

                            {/* Nama Siswa (Tanpa Kelas, NISN, Foto) */}
                            <div className="flex-1 min-w-0 pr-4 flex items-center">
                              <span className="text-sm font-bold text-slate-800 truncate" title={item.nama_lengkap}>
                                {item.nama_lengkap}
                              </span>
                            </div>

                            {/* Hasil Ujian (Nilai) */}
                            <div className="w-44 shrink-0 flex items-center justify-center">
                              {p?.nilai_akhir !== null && p?.nilai_akhir !== undefined ? (
                                <span className="px-3.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 text-sm font-black inline-flex items-center gap-1.5 shadow-2xs">
                                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 1 0 0118 0z" />
                                  </svg>
                                  Nilai: {p.nilai_akhir}
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold">
                                  Belum Dinilai
                                </span>
                              )}
                            </div>

                            {/* Aksi Selesai (Ujian Ulang, Rincian, & Opsi Lainnya) */}
                            <div className="w-56 shrink-0 flex items-center justify-end gap-1.5 pr-2">
                              <button
                                type="button"
                                onClick={() => handleOpenRetakeModal(item, p)}
                                disabled={actionLoading}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                                title="Beri Izin Siswa Ujian Ulang"
                              >
                                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Ujian Ulang</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDetailAnswers(item, p)}
                                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                                title="Lihat Lembar Jawaban & Analisis Butir Soal"
                              >
                                <span>Rincian</span>
                              </button>
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (menuTarget?.student?.nisn === item.nisn) {
                                      setMenuTarget(null)
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setMenuTarget({ student: item, peserta: p, rect })
                                    }
                                  }}
                                  className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                    menuTarget?.student?.nisn === item.nisn
                                      ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                  }`}
                                  title="Menu Opsi Lainnya"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          /* ======================================================= */
                          /* 4. TAB SEMUA                                            */
                          /* ======================================================= */
                          <>
                            {/* No */}
                            <div className="w-12 text-xs font-bold text-slate-400 text-center shrink-0">
                              {idx + 1}
                            </div>

                            {/* Nama Siswa (Tanpa Kelas, NISN, Foto) */}
                            <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
                              <span className="text-sm font-bold text-slate-800 truncate" title={item.nama_lengkap}>
                                {item.nama_lengkap}
                              </span>
                              {(p?.status === 'belum_melanjutkan' || (p?.waktu_mulai && !p?.device_id)) && (
                                <span className="text-[10.5px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Perangkat di-reset • Menunggu siswa login kembali
                                </span>
                              )}
                            </div>

                            {/* Status */}
                            <div className="w-36 shrink-0 flex items-center justify-center">
                              {isBlocked ? (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                  Terblokir
                                </span>
                              ) : isSelesai ? (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                  </svg>
                                  Selesai
                                </span>
                              ) : (isMengerjakan && p?.device_id) ? (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                  Mengerjakan
                                </span>
                              ) : (p?.status === 'belum_melanjutkan' || (p?.waktu_mulai && !p?.device_id)) ? (
                                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Belum Melanjutkan
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                  Belum Mulai
                                </span>
                              )}
                            </div>

                            {/* Hasil / Progress */}
                            <div className="w-40 shrink-0 text-center">
                              {isSelesai && p?.nilai_akhir !== null && p?.nilai_akhir !== undefined ? (
                                <span className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold inline-block">
                                  Nilai: {p.nilai_akhir}
                                </span>
                              ) : isMengerjakan || isBelumMelanjutkan ? (
                                <div className="px-2">
                                  <div className="text-xs text-slate-600 font-mono mb-1 font-bold">
                                    {answeredCount} / {totalSoal} Soal
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-300 ${isBelumMelanjutkan ? 'bg-amber-500' : 'bg-indigo-600'}`}
                                      style={{ width: `${Math.min(100, (answeredCount / totalSoal) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs font-mono">-</span>
                              )}
                            </div>

                            {/* Aksi */}
                            <div className="w-56 shrink-0 flex items-center justify-end gap-1.5 pr-1">
                              {isBlocked ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUnblockStudent(item, p)}
                                    disabled={actionLoading}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    title="Buka blokir siswa"
                                  >
                                    Buka Blokir
                                  </button>
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (menuTarget?.student?.nisn === item.nisn) {
                                          setMenuTarget(null)
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect()
                                          setMenuTarget({ student: item, peserta: p, rect })
                                        }
                                      }}
                                      className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                        menuTarget?.student?.nisn === item.nisn
                                          ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                      }`}
                                      title="Opsi Lainnya"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : !p || p.status === 'belum_mulai' ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBlockModal(item, p)}
                                    disabled={actionLoading}
                                    className="px-3 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    title="Blokir dari penilaian"
                                  >
                                    Blokir
                                  </button>
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (menuTarget?.student?.nisn === item.nisn) {
                                          setMenuTarget(null)
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect()
                                          setMenuTarget({ student: item, peserta: p, rect })
                                        }
                                      }}
                                      className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                        menuTarget?.student?.nisn === item.nisn
                                          ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                      }`}
                                      title="Opsi Lainnya"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : isMengerjakan ? (
                                <div className="flex items-center gap-1.5 relative">
                                  <button
                                    type="button"
                                    onClick={() => setExtraTimeTarget(p)}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    title="Beri Tambahan Waktu"
                                  >
                                    + Wkt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDetailAnswers(item, p)}
                                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    title="Lihat Jawaban"
                                  >
                                    Rincian
                                  </button>
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (menuTarget?.student?.nisn === item.nisn) {
                                          setMenuTarget(null)
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect()
                                          setMenuTarget({ student: item, peserta: p, rect })
                                        }
                                      }}
                                      className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                        menuTarget?.student?.nisn === item.nisn
                                          ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200'
                                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs'
                                      }`}
                                      title="Opsi Lainnya"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : isSelesai ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRetakeModal(item, p)}
                                    disabled={actionLoading}
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                    title="Beri Izin Siswa Ujian Ulang"
                                  >
                                    <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Ulang</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDetailAnswers(item, p)}
                                    className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    title="Lihat Lembar Jawaban"
                                  >
                                    Rincian
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: WIZARD BUAT / EDIT PENILAIAN & NASKAH SOAL                      */}
      {/* ========================================================================= */}
      {showWizardModal && (
        <CbtBuatPenilaianModal
          isOpen={showWizardModal}
          session={session}
          initialData={wizardInitialData}
          onClose={() => {
            setShowWizardModal(false)
            setWizardInitialData(null)
            fetchSesiList()
          }}
          onSuccess={() => {
            setShowWizardModal(false)
            setWizardInitialData(null)
            fetchSesiList()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ATUR RUANG UJIAN (ADMIN)                                         */}
      {/* ========================================================================= */}
      {showRuangModal && targetSesiRuang && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                Pemetaan Ruang Ujian &amp; Token
              </h3>
              <button
                type="button"
                onClick={() => setShowRuangModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Admin dapat memetakan rombel ke dalam ruang ujian tertentu beserta token unik per ruang.
            </p>

            <form onSubmit={handleSaveRuangMapping} className="space-y-4">
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {Object.entries(ruangForm).map(([ruangName, config], idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-900">{ruangName}</span>
                      <span className="text-[11px] text-slate-400">Token Ruang: {config.token || '-'}</span>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Rombel yang masuk ke ruang ini (pisahkan koma):</label>
                      <input
                        type="text"
                        value={Array.isArray(config.kelas) ? config.kelas.join(', ') : config.kelas}
                        onChange={(e) => {
                          const updated = { ...ruangForm }
                          updated[ruangName] = {
                            ...config,
                            kelas: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          }
                          setRuangForm(updated)
                        }}
                        placeholder="Contoh: 7A, 7B"
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRuangModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ruangSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {ruangSaving ? 'Menyimpan...' : 'Simpan Pemetaan Ruang'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TAMBAH WAKTU INDIVIDUAL SISWA                                    */}
      {/* ========================================================================= */}
      {extraTimeTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-800">
              Beri Waktu Tambahan Siswa
            </h3>
            <p className="text-xs text-slate-500">
              Masukkan jumlah menit tambahan pengerjaan untuk siswa ini:
            </p>
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[10, 15, 30].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setInputExtraMinutes(m)}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                      inputExtraMinutes === m
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    +{m} Menit
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={inputExtraMinutes}
                onChange={(e) => setInputExtraMinutes(e.target.value)}
                min="1"
                max="180"
                className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExtraTimeTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAddExtraTime}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
              >
                Simpan Waktu
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL UJIAN ULANG SISWA (RETAKE EXAM)                                     */}
      {/* ========================================================================= */}
      {retakeTarget && createPortal(
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
              Siswa ini telah mengumpulkan lembar ujian. Tentukan skema ujian ulang yang diberikan:
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
                    name="retakeOption"
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
                      Jawaban tersimpan tidak dihapus. Siswa dapat melanjutkan pengerjaan atau meninjau jawaban sebelumnya.
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
                    name="retakeOption"
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
                      Seluruh rekaman jawaban sebelumnya akan dihapus bersih. Siswa mengerjakan lembar ujian baru dari butir 1.
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
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL BLOKIR SISWA DARI PENILAIAN                                        */}
      {/* ========================================================================= */}
      {blockTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  Blokir Siswa Dari Penilaian
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 text-xs text-rose-800 space-y-1">
              <div className="font-bold">Siswa: {blockTarget.student.nama_lengkap}</div>
              <div className="text-[11px] text-rose-600 font-semibold">
                Kelas: {blockTarget.student.kelas}
              </div>
              <p className="text-[11px] text-rose-700 pt-1">
                Siswa yang diblokir tidak akan dapat masuk ke ruang ujian atau mengerjakan lembar soal hingga status blokir dibuka oleh pengawas.
              </p>
            </div>

            <form onSubmit={handleConfirmBlockStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Alasan Pemblokiran:
                </label>
                <textarea
                  rows={3}
                  value={inputBlockReason}
                  onChange={(e) => setInputBlockReason(e.target.value)}
                  placeholder="Tulis alasan pemblokiran (misal: Pelanggaran tata tertib ujian)..."
                  required
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-slate-800 resize-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Memproses...' : 'Konfirmasi Blokir Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}



      {/* ========================================================================= */}
      {/* MODAL 5: LIHAT INFORMASI LENGKAP PENILAIAN / UJIAN                       */}
      {/* ========================================================================= */}
      {showExamInfoModal && selectedSesi && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-600 tracking-wider">
                    INFORMASI LENGKAP UJIAN
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                    selectedSesi.status === 'berlangsung' || selectedSesi.status === 'aktif'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : selectedSesi.status === 'draft'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : selectedSesi.status === 'selesai'
                      ? 'bg-slate-100 text-slate-500 border border-slate-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {selectedSesi.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mt-1">
                  {selectedSesi.judul}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExamInfoModal(false)
                    handleOpenEditWizard(selectedSesi || filteredSesiList[0] || sesiList[0], 3)
                  }}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Buka Halaman Editor Soal Penilaian Ini"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit Soal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowExamInfoModal(false)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Card 1: Data Pokok Akademik */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  DATA POKOK PENILAIAN
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">Mata Pelajaran</span>
                    <span className="text-xs font-bold text-slate-800">{selectedSesi.mapel || '-'}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">Kategori</span>
                    <span className="text-xs font-bold text-slate-800 capitalize">{selectedSesi.kategori || 'Formatif'}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">Target Rombel</span>
                    <span className="text-xs font-bold text-indigo-700 font-mono">
                      {selectedSesi.kelas_ids?.join(', ') || '-'}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">Durasi Pengerjaan</span>
                    <span className="text-xs font-bold text-slate-800">{selectedSesi.durasi_menit || 90} Menit</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">KKM / KKTP</span>
                    <span className="text-xs font-bold text-slate-800">{selectedSesi.kkm ?? 75}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 block">Total Butir Soal</span>
                    <span className="text-xs font-bold text-indigo-700">
                      {actualSoalCount || selectedSesi.total_soal || selectedSesi.cbt_bank_soal?.total_soal || '-'} Soal
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Jadwal Pelaksanaan */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  JADWAL & WAKTU AKSES
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Waktu Buka Ujian</span>
                      <span className="text-xs font-bold text-slate-800">
                        {formatDateTimeDisplay(selectedSesi.waktu_buka || selectedSesi.waktu_mulai)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 shadow-2xs flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 1 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Batas Waktu Selesai</span>
                      <span className="text-xs font-bold text-slate-800">
                        {formatDateTimeDisplay(selectedSesi.waktu_tutup || selectedSesi.waktu_selesai)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Akses Langsung Siswa: Tanpa Perlu Token */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    AKSES LANGSUNG PENILAIAN (TANPA TOKEN)
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    Siswa Langsung Masuk
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Siswa yang terdaftar di kelas <strong className="text-indigo-800 font-bold">{selectedSesi.kelas_ids?.join(', ') || selectedSesi.target_rombel || '-'}</strong> dapat langsung mengklik tombol <strong>"Mulai Mengerjakan Soal"</strong> di portal siswa tanpa perlu repot mengetik token.
                </p>
              </div>

              {/* Card 3: Pengaturan Keamanan & Pengerjaan */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  KEAMANAN & ATURAN PENGERJAAN
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Acak Urutan Soal:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                      selectedSesi.acak_soal ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedSesi.acak_soal ? 'Aktif' : 'Tidak'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Acak Opsi Pilihan:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                      selectedSesi.acak_opsi ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedSesi.acak_opsi ? 'Aktif' : 'Tidak'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Proteksi Anti-Curang:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                      selectedSesi.anti_curang !== false ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedSesi.anti_curang !== false ? 'Ketat (Maks. 3x Pindah Tab)' : 'Standar'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Skema PG Kompleks:</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedSesi.skema_pg_kompleks || 'Parsial'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Rilis Nilai Siswa:</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedSesi.tampilkan_nilai === 'langsung' ? 'Langsung' : 'Manual Guru'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60">
                    <span className="text-slate-600">Rilis Kunci Jawaban:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                      selectedSesi.tampilkan_kunci ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedSesi.tampilkan_kunci ? 'Ditampilkan' : 'Disembunyikan'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Instruksi Peserta */}
              {selectedSesi.instruksi && (
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-1.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                    PETUNJUK / INSTRUKSI UJIAN
                  </span>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/60 text-slate-600 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-line text-[11px]">
                    {selectedSesi.instruksi}
                  </div>
                </div>
              )}

              {/* Card 5: Aksi Kelola Penilaian */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block">
                  AKSI KELOLA PENILAIAN
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowExamInfoModal(false)
                      setActiveSubView({ type: 'pengumpulan', sesi: selectedSesi })
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span>Buka Lembar Pengumpulan Murid</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowExamInfoModal(false)
                      handleOpenEditWizard(selectedSesi, 1)
                    }}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit Form & Naskah Soal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowExamInfoModal(false)
                      handleNavigateToBankSoal()
                    }}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 active:scale-95 text-amber-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    title="Buka Menu Bank Soal"
                  >
                    <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Buka Bank Soal</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExamInfoModal(false)
                        handleOpenRuangModal(selectedSesi)
                      }}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 active:scale-95 text-indigo-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>Atur Ruang & Token</span>
                    </button>
                  )}

                  {selectedSesi.status !== 'draft' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExamInfoModal(false)
                        handleMoveToDraft(selectedSesi.id)
                      }}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 active:scale-95 text-amber-800 font-bold rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Pindah ke Draft
                    </button>
                  )}

                  {selectedSesi.status !== 'berlangsung' && selectedSesi.status !== 'aktif' && selectedSesi.status !== 'selesai' && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExamInfoModal(false)
                        handleQuickUpdateStatus(selectedSesi.id, 'berlangsung')
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
                    >
                      Buka & Mulai Ujian
                    </button>
                  )}

                  {(selectedSesi.status === 'berlangsung' || selectedSesi.status === 'aktif') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExamInfoModal(false)
                        handleQuickUpdateStatus(selectedSesi.id, 'selesai')
                      }}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
                    >
                      Tutup Ujian
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowExamInfoModal(false)
                      handleDeleteSesi(selectedSesi.id)
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 active:scale-95 text-rose-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Hapus Penilaian
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowExamInfoModal(false)
                  handleOpenEditWizard(selectedSesi, 1)
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Form & Naskah Soal</span>
              </button>
              <button
                type="button"
                onClick={() => setShowExamInfoModal(false)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* FLOATING ACTION PORTAL UNTUK TITIK TIGA SISWA (TIDAK AKAN TERCROP) */}
      {menuTarget && typeof document !== 'undefined' && createPortal(
        (() => {
          const { student, peserta, rect } = menuTarget
          if (!rect) return null

          const menuWidth = 264
          const margin = 8

          // Posisi horizontal: merapat ke kanan tombol, diapit aman dalam viewport
          const right = Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - menuWidth - 12))

          const spaceBelow = window.innerHeight - rect.bottom
          const spaceAbove = rect.top
          const menuEstimate = 350
          const openAbove = spaceBelow < menuEstimate && spaceAbove > spaceBelow

          const style = {
            position: 'fixed',
            right: `${right}px`,
            width: `${menuWidth}px`,
            zIndex: 99999,
            ...(openAbove
              ? {
                  bottom: `${window.innerHeight - rect.top + margin}px`,
                  maxHeight: `${Math.max(200, spaceAbove - 24)}px`
                }
              : {
                  top: `${rect.bottom + margin}px`,
                  maxHeight: `${Math.max(200, spaceBelow - 24)}px`
                })
          }

          const isStudentBlocked = peserta?.is_blocked
          const isStudentLocked = peserta?.status === 'terkunci'
          const isStudentSelesai = peserta?.status === 'selesai'
          const isStudentMengerjakan = peserta?.status === 'sedang_mengerjakan' || isStudentLocked

          return (
            <div className="fixed inset-0 z-[99990] overflow-hidden" onClick={() => setMenuTarget(null)}>
              {/* Backdrop transparan untuk dismiss outside click */}
              <div className="absolute inset-0 bg-transparent" />

              {/* Floating Menu Card */}
              <div
                style={style}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200/95 py-1.5 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 text-left font-normal select-none"
              >
                {/* Header Siswa */}
                <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/80">
                  <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Aksi Pengawas</p>
                  <p className="text-xs font-bold text-slate-800 truncate" title={student.nama_lengkap}>
                    {student.nama_lengkap}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-md ${
                      isStudentBlocked
                        ? 'bg-rose-100 text-rose-700'
                        : isStudentSelesai
                        ? 'bg-emerald-100 text-emerald-700'
                        : (isStudentMengerjakan && peserta?.device_id)
                        ? 'bg-blue-100 text-blue-700'
                        : (peserta?.status === 'belum_melanjutkan' || (peserta?.waktu_mulai && !peserta?.device_id))
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isStudentBlocked ? 'Terblokir' : isStudentLocked ? 'Terkunci' : isStudentSelesai ? 'Selesai' : (isStudentMengerjakan && peserta?.device_id) ? 'Mengerjakan' : (peserta?.status === 'belum_melanjutkan' || (peserta?.waktu_mulai && !peserta?.device_id)) ? 'Belum Melanjutkan' : 'Belum Mulai'}
                    </span>
                    {peserta?.extra_waktu_menit > 0 && (
                      <span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        +{peserta.extra_waktu_menit}m
                      </span>
                    )}
                  </div>
                </div>

                <div className="py-1">
                  {/* 1. Pantau Kamera Live */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuTarget(null)
                      setLiveProctorTarget({ student, peserta })
                    }}
                    className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Pantau Kamera (Live)</span>
                  </button>

                  {/* 2. Rincian Jawaban */}
                  {peserta && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        handleOpenDetailAnswers(student, peserta)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Lihat Rincian Jawaban</span>
                    </button>
                  )}

                  {/* 3. Tambah Waktu Ujian */}
                  {peserta && !isStudentSelesai && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        setExtraTimeTarget(peserta)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 1 0 0118 0z" />
                      </svg>
                      <span>+ Tambah Waktu Ujian</span>
                    </button>
                  )}

                  {/* 4. Reset Kunci Perangkat (Single Device Lock / Ganti HP) */}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuTarget(null)
                      handleResetPesertaLogin(peserta, student.nama_lengkap, student.nisn)
                    }}
                    className="w-full px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div className="flex flex-col text-left">
                      <span className="font-bold">Reset Kunci Perangkat</span>
                      <span className="text-[10px] text-amber-600/80 font-normal">Izinkan siswa ganti HP / HP macet</span>
                    </div>
                  </button>

                  {/* 5. Buka Kunci / Unblock (jika terblokir atau terkunci) */}
                  {(isStudentBlocked || isStudentLocked) && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        handleUnblockStudent(student, peserta)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      <span>Buka Kunci / Unblock</span>
                    </button>
                  )}

                  {/* 6. Izinkan Ujian Ulang */}
                  {peserta && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        handleOpenRetakeModal(student, peserta)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <div className="flex flex-col text-left">
                        <span className="font-bold">Izinkan Ujian Ulang</span>
                        <span className="text-[10px] text-amber-600/80 font-normal">Reset pengerjaan agar siswa bisa mengulang</span>
                      </div>
                    </button>
                  )}

                  {/* 7. Paksa Kumpulkan (jika belum selesai) */}
                  {peserta && !isStudentSelesai && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        handleForceSubmitPeserta(peserta, student.nama_lengkap)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="flex flex-col text-left">
                        <span className="font-bold">Paksa Kumpulkan</span>
                        <span className="text-[10px] text-rose-500/80 font-normal">Selesaikan lembar ujian sekarang</span>
                      </div>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100" />

                  {/* 8. Blokir Akses Siswa */}
                  {!isStudentBlocked ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuTarget(null)
                        handleOpenBlockModal(student, peserta)
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Blokir Akses Siswa</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}

      {/* Live Selfie Camera Proctor Modal */}
      <CbtLiveProctorModal
        isOpen={!!liveProctorTarget}
        onClose={() => setLiveProctorTarget(null)}
        sesiId={selectedSesi?.id}
        student={liveProctorTarget?.student}
        onForceSubmit={() => {
          if (liveProctorTarget?.peserta) {
            handleForceSubmitPeserta(liveProctorTarget.peserta, liveProctorTarget.student?.nama_lengkap)
            setLiveProctorTarget(null)
          }
        }}
      />

      {/* Professional Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Professional Toast Notification */}
      {ToastComponent}
    </div>
  )
}

