import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import { sendFCMPushNotification } from '../utils/fcmSender'

const StudentAvatar = ({ student, fotos, className }) => {
  const [imgError, setImgError] = useState(false)
  const fotoObj = fotos?.find(f => f.nisn === student?.nisn)
  const fotoUrl = fotoObj?.url_foto || student?.foto_url || student?.foto

  if (!fotoUrl || imgError) {
    const initial = student?.nama_lengkap ? student.nama_lengkap.charAt(0).toUpperCase() : '?'
    return (
      <div className={`bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center ${className}`}>
        {initial}
      </div>
    )
  }

  return (
    <img
      src={fotoUrl}
      alt={student?.nama_lengkap || 'Siswa'}
      onError={() => setImgError(true)}
      className={className}
    />
  )
}

export default function TabunganSiswaSection({ session, activeTa, mode = 'guru', studentData = null, isOrangTuaView = false, fotos = [] }) {
  // mode: 'guru' | 'admin' | 'siswa'
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const channelRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [internalFotos, setInternalFotos] = useState(fotos || [])
  
  // Professional Custom Notification Dialog State
  const [notifModal, setNotifModal] = useState(null) // { type: 'success' | 'error', title: string, message: string }
  
  // Data states
  const [semuaKelas, setSemuaKelas] = useState([])
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [selectedKelas, setSelectedKelas] = useState('')
  const [rekeningMap, setRekeningMap] = useState({}) // { nisn: { id, saldo } }
  const [transaksiList, setTransaksiList] = useState([])
  const [bendaharaClassMap, setBendaharaClassMap] = useState({}) // { kelas: { siswa_nisn, nama } }
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('daftar') // 'daftar' | 'pending' | 'riwayat' | 'kolektif'
  const [filterSaldo, setFilterSaldo] = useState('semua') // 'semua' | 'ada_saldo' | 'saldo_nol' (tab daftar)
  const [filterStatusMutasi, setFilterStatusMutasi] = useState('semua') // 'semua' | 'VERIFIED' | 'PENDING' | 'REJECTED' (tab riwayat)
  const [filterTipeMutasi, setFilterTipeMutasi] = useState('semua') // 'semua' | 'SETOR' | 'TARIK' (tab riwayat)
  const [selectedPendingIds, setSelectedPendingIds] = useState([]) // Array of transaction IDs for multi-select
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const initialClassSetRef = useRef(false)

  // Modal states
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [targetSiswa, setTargetSiswa] = useState(null)
  const [transTipe, setTransTipe] = useState('SETOR') // 'SETOR' | 'TARIK'
  const [transNominal, setTransNominal] = useState('')
  const [transKeterangan, setTransKeterangan] = useState('')

  // Modal Bendahara
  const [showBendaharaModal, setShowBendaharaModal] = useState(false)
  const [selectedBendaharaNisn, setSelectedBendaharaNisn] = useState('')

  // Kolektif / Mass Input State
  const [kolektifData, setKolektifData] = useState({}) // { nisn: nominal }

  // Check if current user/student is a Bendahara Kelas
  const [isBendaharaActive, setIsBendaharaActive] = useState(false)
  const [bendaharaKelasAssigned, setBendaharaKelasAssigned] = useState('')

  // Modal Detail Mutasi Transaksi Siswa
  const [detailSiswaTabungan, setDetailSiswaTabungan] = useState(null)
  const [detailStudentTxList, setDetailStudentTxList] = useState([])
  const [loadingDetailTx, setLoadingDetailTx] = useState(false)

  const handleOpenDetailSiswa = async (siswa) => {
    setDetailSiswaTabungan(siswa)
    setLoadingDetailTx(true)
    try {
      const { data, error } = await supabase
        .from('tabungan_transaksi')
        .select('*')
        .eq('siswa_nisn', siswa.nisn)
        .order('created_at', { ascending: false })
      if (!error && data) {
        setDetailStudentTxList(data)
      } else {
        setDetailStudentTxList(transaksiList.filter(t => t.siswa_nisn === siswa.nisn))
      }
    } catch (e) {
      setDetailStudentTxList(transaksiList.filter(t => t.siswa_nisn === siswa.nisn))
    } finally {
      setLoadingDetailTx(false)
    }
  }

  // Admin Feature Visibility Toggles
  const [showTabunganOrtuSiswa, setShowTabunganOrtuSiswa] = useState(true)
  const [showTabunganWaliKelas, setShowTabunganWaliKelas] = useState(true)
  const [isTogglingSettings, setIsTogglingSettings] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', ['show_tabungan_ortu_siswa', 'show_tabungan_wali_kelas'])

      if (data) {
        data.forEach(item => {
          if (item.setting_key === 'show_tabungan_ortu_siswa') {
            setShowTabunganOrtuSiswa(item.setting_value === 'true')
          }
          if (item.setting_key === 'show_tabungan_wali_kelas') {
            setShowTabunganWaliKelas(item.setting_value === 'true')
          }
        })
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
    }
  }, [])

  const handleToggleAccess = async (key, currentValue) => {
    const newValue = !currentValue
    if (key === 'show_tabungan_ortu_siswa') setShowTabunganOrtuSiswa(newValue)
    if (key === 'show_tabungan_wali_kelas') setShowTabunganWaliKelas(newValue)

    setIsTogglingSettings(true)
    try {
      // Send instant broadcast on shared global WebSocket channel
      supabase.channel('ebudimulia-global-settings-broadcast').send({
        type: 'broadcast',
        event: 'toggle_tabungan_feature',
        payload: { key, value: newValue }
      })

      const { error } = await supabase
        .from('pengaturan_sekolah')
        .upsert({
          setting_key: key,
          setting_value: newValue.toString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' })

      if (error) throw error

      setNotifModal({
        type: 'success',
        title: 'Pengaturan Disimpan',
        message: `Fitur Tabungan untuk ${key === 'show_tabungan_ortu_siswa' ? 'Orang Tua & Siswa' : 'Wali Kelas'} berhasil ${newValue ? 'DITAMPILKAN' : 'DISEMBUNYIKAN'}!`
      })
    } catch (err) {
      console.error('Error updating settings:', err)
      setNotifModal({
        type: 'error',
        title: 'Gagal Menyimpan',
        message: err.message
      })
      fetchSettings()
    } finally {
      setIsTogglingSettings(false)
    }
  }

  // Determine Wali Kelas classes
  const waliClassesForActiveTa = useMemo(() => {
    if (!session?.kelas || session.kelas.length === 0) return []
    if (activeTa?.id) {
      const filtered = session.kelas.filter(k => k.tahun_ajaran_id == activeTa.id)
      if (filtered.length > 0) return filtered.map(k => k.kelas).filter(Boolean)
    }
    return session.kelas.map(k => k.kelas).filter(Boolean)
  }, [session, activeTa])

  const isWaliOnly = useMemo(() => {
    if (mode !== 'guru') return false
    if (waliClassesForActiveTa.length === 0) return false
    const roleStr = String(session?.role || session?.app_role || '').toLowerCase()
    if (roleStr.includes('admin') || roleStr.includes('superadmin')) return false

    const hasAdminOrPiketRole = session?.roles?.some(r => {
      const n = String(r.nama || r || '').toLowerCase()
      return n.includes('admin') || n.includes('superadmin') || n.includes('piket') || n.includes('tata usaha')
    })

    return !hasAdminOrPiketRole
  }, [mode, session, waliClassesForActiveTa])

  // Load initial data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch Students
      let studentQuery = supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas, is_aktif')
        .eq('is_aktif', true)
        .order('kelas')
        .order('nama_lengkap')

      if (mode === 'siswa' && studentData?.nisn) {
        studentQuery = studentQuery.eq('nisn', studentData.nisn)
      } else if (isWaliOnly && waliClassesForActiveTa.length > 0) {
        studentQuery = studentQuery.in('kelas', waliClassesForActiveTa)
      }

      const { data: siswaRes, error: siswaErr } = await studentQuery
      if (siswaErr) throw siswaErr

      const siswaList = siswaRes || []
      setSemuaSiswa(siswaList)

      // Set unique classes
      const uniqueClasses = [...new Set(siswaList.map(s => s.kelas).filter(Boolean))].sort()
      setSemuaKelas(uniqueClasses)

      if (!initialClassSetRef.current && uniqueClasses.length > 0) {
        initialClassSetRef.current = true
        if (isWaliOnly && waliClassesForActiveTa.length > 0) {
          setSelectedKelas(waliClassesForActiveTa[0])
        } else if (mode === 'siswa' && studentData?.kelas) {
          setSelectedKelas(studentData.kelas)
        } else if (mode === 'admin') {
          setSelectedKelas('Semua Kelas')
        } else {
          setSelectedKelas(uniqueClasses[0])
        }
      }

      // 2. Fetch Rekening Saldo
      const nisnList = siswaList.map(s => s.nisn)
      if (nisnList.length > 0) {
        const { data: rekRes } = await supabase
          .from('tabungan_rekening')
          .select('id, siswa_nisn, saldo')
          .in('siswa_nisn', nisnList)

        const rMap = {}
        rekRes?.forEach(r => {
          rMap[r.siswa_nisn] = { id: r.id, saldo: parseFloat(r.saldo || 0) }
        })
        setRekeningMap(rMap)
      }

      // 3. Fetch Bendahara Kelas Penunjukan
      const { data: benRes } = await supabase
        .from('bendahara_kelas')
        .select('*')
      
      const bMap = {}
      benRes?.forEach(b => {
        const s = siswaList.find(x => x.nisn === b.siswa_nisn)
        bMap[b.kelas] = { siswa_nisn: b.siswa_nisn, nama: s?.nama_lengkap || b.siswa_nisn }
      })
      setBendaharaClassMap(bMap)

      // Check if current logged-in student is Bendahara (only in student login, not parent view)
      if (mode === 'siswa' && studentData?.nisn && !isOrangTuaView) {
        const benRecord = benRes?.find(b => b.siswa_nisn === studentData.nisn)
        if (benRecord) {
          setIsBendaharaActive(true)
          setBendaharaKelasAssigned(benRecord.kelas)
        } else {
          setIsBendaharaActive(false)
        }
      } else {
        setIsBendaharaActive(false)
      }

      // 4. Fetch Transaksi Riwayat
      let transQuery = supabase
        .from('tabungan_transaksi')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (mode === 'siswa' && !isBendaharaActive) {
        transQuery = transQuery.eq('siswa_nisn', studentData.nisn)
      } else if (isWaliOnly && waliClassesForActiveTa.length > 0) {
        transQuery = transQuery.in('kelas', waliClassesForActiveTa)
      }

      const { data: transRes } = await transQuery
      setTransaksiList(transRes || [])

    } catch (err) {
      console.error('Error fetching tabungan data:', err)
    } finally {
      setLoading(false)
    }
  }, [mode, studentData, isWaliOnly, waliClassesForActiveTa, isBendaharaActive])

  useEffect(() => {
    fetchData()
    fetchSettings()

    // Supabase Realtime Subscription (Dedicated unique channel for TabunganSiswaSection)
    const channel = supabase
      .channel(`tabungan-siswa-section-realtime-${Math.random().toString(36).substring(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabungan_transaksi' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabungan_rekening' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan_sekolah' }, () => {
        fetchSettings()
      })
      .on('broadcast', { event: 'toggle_tabungan_feature' }, (payload) => {
        if (payload?.payload?.key === 'show_tabungan_ortu_siswa') {
          setShowTabunganOrtuSiswa(payload.payload.value)
        }
        if (payload?.payload?.key === 'show_tabungan_wali_kelas') {
          setShowTabunganWaliKelas(payload.payload.value)
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [fetchData, fetchSettings])

  // Filter students based on selected class, search query & saldo filter
  const filteredStudents = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    return semuaSiswa.filter(s => {
      const matchKelas = !selectedKelas || 
        selectedKelas === 'Semua Kelas' || 
        selectedKelas === 'all' || 
        (s.kelas && s.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase())

      const matchSearch = !q || 
        (s.nama_lengkap || '').toLowerCase().includes(q) || 
        (s.nisn || '').toLowerCase().includes(q) ||
        (s.kelas || '').toLowerCase().includes(q)

      const saldo = rekeningMap[s.nisn]?.saldo || 0
      const matchSaldo = filterSaldo === 'semua' || 
        (filterSaldo === 'ada_saldo' ? saldo > 0 : saldo === 0)

      return matchKelas && matchSearch && matchSaldo
    })
  }, [semuaSiswa, selectedKelas, searchQuery, filterSaldo, rekeningMap])

  // Filter transactions for Tab 4 (Riwayat Mutasi)
  const filteredTransactions = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    return transaksiList.filter(t => {
      // 1. Filter Kelas
      const matchKelas = !selectedKelas || 
        selectedKelas === 'Semua Kelas' || 
        selectedKelas === 'all' || 
        (t.kelas && t.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase())

      // 2. Filter Status Mutasi
      const matchStatus = filterStatusMutasi === 'semua' || t.status_verifikasi === filterStatusMutasi

      // 3. Filter Tipe Mutasi
      const matchTipe = filterTipeMutasi === 'semua' || t.tipe === filterTipeMutasi

      // 4. Filter Search
      let matchSearch = true
      if (q) {
        const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
        const penginput = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)
        const studentName = (student?.nama_lengkap || '').toLowerCase()
        const studentNisn = (t.siswa_nisn || '').toLowerCase()
        const studentKelas = (t.kelas || '').toLowerCase()
        const keterangan = (t.keterangan || '').toLowerCase()
        const penginputName = (penginput?.nama_lengkap || t.diinput_oleh_nisn || '').toLowerCase()

        matchSearch = studentName.includes(q) || 
          studentNisn.includes(q) || 
          studentKelas.includes(q) || 
          keterangan.includes(q) || 
          penginputName.includes(q)
      }

      return matchKelas && matchStatus && matchTipe && matchSearch
    })
  }, [transaksiList, selectedKelas, searchQuery, filterStatusMutasi, filterTipeMutasi, semuaSiswa])

  // Filter pending transactions for Tab 3 (Verifikasi Bendahara)
  const pendingTransactions = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    return transaksiList.filter(t => {
      if (t.status_verifikasi !== 'PENDING') return false

      const matchKelas = !selectedKelas || 
        selectedKelas === 'Semua Kelas' || 
        selectedKelas === 'all' || 
        (t.kelas && t.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase())

      if (!q) return matchKelas

      const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
      const penginput = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)
      const studentName = (student?.nama_lengkap || '').toLowerCase()
      const studentNisn = (t.siswa_nisn || '').toLowerCase()
      const studentKelas = (t.kelas || '').toLowerCase()
      const keterangan = (t.keterangan || '').toLowerCase()
      const penginputName = (penginput?.nama_lengkap || t.diinput_oleh_nisn || '').toLowerCase()

      const matchSearch = studentName.includes(q) || 
        studentNisn.includes(q) || 
        studentKelas.includes(q) || 
        keterangan.includes(q) || 
        penginputName.includes(q)

      return matchKelas && matchSearch
    })
  }, [transaksiList, selectedKelas, searchQuery, semuaSiswa])

  // Stats calculation for current view
  const classStats = useMemo(() => {
    const isSemua = !selectedKelas || selectedKelas === 'Semua Kelas' || selectedKelas === 'all'
    const studentsInCurrentView = !isSemua
      ? semuaSiswa.filter(s => s.kelas && s.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase())
      : semuaSiswa

    let totalSaldo = 0
    studentsInCurrentView.forEach(s => {
      totalSaldo += (rekeningMap[s.nisn]?.saldo || 0)
    })

    const nisnSet = new Set(studentsInCurrentView.map(s => s.nisn))
    const currentClassTrans = transaksiList.filter(t => 
      (isSemua || (t.kelas && t.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase()) || nisnSet.has(t.siswa_nisn)) && 
      t.status_verifikasi === 'VERIFIED'
    )

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const totalSetorBulanIni = currentClassTrans
      .filter(t => t.tipe === 'SETOR' && t.created_at >= startOfMonth)
      .reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)

    const totalTarikBulanIni = currentClassTrans
      .filter(t => t.tipe === 'TARIK' && t.created_at >= startOfMonth)
      .reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)

    // Calculate pending count for current class or all
    const pendingCount = transaksiList.filter(t => 
      (isSemua || (t.kelas && t.kelas.trim().toLowerCase() === selectedKelas.trim().toLowerCase()) || nisnSet.has(t.siswa_nisn)) && 
      t.status_verifikasi === 'PENDING'
    ).length

    return {
      totalSaldo,
      totalSetorBulanIni,
      totalTarikBulanIni,
      totalSiswa: studentsInCurrentView.length,
      pendingCount
    }
  }, [semuaSiswa, selectedKelas, rekeningMap, transaksiList])

  // Multi-select helpers for pending verification
  const isAllPendingSelected = pendingTransactions.length > 0 && selectedPendingIds.length === pendingTransactions.length

  const handleToggleSelectPending = (id) => {
    setSelectedPendingIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleToggleSelectAllPending = () => {
    if (isAllPendingSelected) {
      setSelectedPendingIds([])
    } else {
      setSelectedPendingIds(pendingTransactions.map(t => t.id))
    }
  }

  // Handle Batch Verification / Approval / Rejection
  const handleBatchVerifikasi = async (approve = true) => {
    const selectedList = pendingTransactions.filter(t => selectedPendingIds.includes(t.id))
    if (selectedList.length === 0) {
      setNotifModal({
        type: 'error',
        title: 'Pilih Transaksi',
        message: 'Silakan centang minimal satu transaksi yang ingin diproses!'
      })
      return
    }

    const actionLabel = approve ? 'menyetujui' : 'menolak'
    const confirmed = await requestConfirm({
      title: approve ? `Setujui ${selectedList.length} Transaksi Sekaligus` : `Tolak ${selectedList.length} Transaksi`,
      message: `Apakah Anda yakin ingin ${actionLabel} ${selectedList.length} transaksi setoran tabungan yang dipilih?`,
      confirmLabel: approve ? `Ya, Setujui (${selectedList.length})` : `Ya, Tolak (${selectedList.length})`,
      confirmColor: approve ? 'emerald' : 'red'
    })

    if (!confirmed) return

    setIsBatchProcessing(true)
    let successCount = 0
    const rpcName = approve ? 'verifikasi_transaksi_tabungan' : 'tolak_transaksi_tabungan'

    for (const tx of selectedList) {
      try {
        const { data, error } = await supabase.rpc(rpcName, {
          p_transaksi_id: tx.id,
          p_user_id: session?.id || null
        })

        if (!error && data?.success) {
          successCount++
          if (approve) {
            const nominalStr = `Rp ${parseFloat(tx.jumlah || 0).toLocaleString('id-ID')}`
            const student = semuaSiswa.find(s => s.nisn === tx.siswa_nisn)
            const nama = tx.nama_lengkap || student?.nama_lengkap || 'Siswa'

            sendFCMPushNotification({
              nisn: tx.siswa_nisn,
              title: `Setoran Tabungan ${nama}`,
              body: `${nama} telah menabung sebesar ${nominalStr}. Transaksi setoran berhasil diverifikasi.`,
              targetMenu: 'TABUNGAN'
            }).catch(e => console.warn('[FCM batch error]:', e))
          }
        }
      } catch (err) {
        console.error('Batch verify error:', tx.id, err)
      }
    }

    setIsBatchProcessing(false)
    setSelectedPendingIds([])
    setNotifModal({
      type: 'success',
      title: approve ? 'Verifikasi Selesai' : 'Penolakan Selesai',
      message: `Berhasil ${actionLabel} ${successCount} dari ${selectedList.length} transaksi setoran!`
    })
    fetchData()
  }

  // Quick Reset Filter helper
  const handleResetFilter = () => {
    setSearchQuery('')
    if (mode === 'admin') setSelectedKelas('Semua Kelas')
    setFilterSaldo('semua')
    setFilterStatusMutasi('semua')
    setFilterTipeMutasi('semua')
    setSelectedPendingIds([])
  }

  const isFilterActive = (searchQuery.trim() !== '') || 
    (mode === 'admin' && selectedKelas !== 'Semua Kelas' && selectedKelas !== '') || 
    (filterSaldo !== 'semua') || 
    (filterStatusMutasi !== 'semua') || 
    (filterTipeMutasi !== 'semua')

  // Open transaction modal
  const handleOpenTransaction = (siswa, tipe = 'SETOR') => {
    setTargetSiswa(siswa)
    setTransTipe(tipe)
    setTransNominal('')
    setTransKeterangan('')
    setShowTransactionModal(true)
  }

  // Submit single transaction
  const handleSubmitTransaction = async (e) => {
    e.preventDefault()
    if (!targetSiswa) return

    const nominalNum = parseFloat(transNominal.replace(/[^0-9]/g, ''))
    if (isNaN(nominalNum) || nominalNum <= 0) {
      alert('Nominal tabungan harus lebih dari 0!')
      return
    }

    const currentSaldo = rekeningMap[targetSiswa.nisn]?.saldo || 0
    if (transTipe === 'TARIK' && nominalNum > currentSaldo) {
      alert(`Gagal! Saldo siswa Rp ${currentSaldo.toLocaleString('id-ID')} tidak mencukupi untuk melakukan penarikan Rp ${nominalNum.toLocaleString('id-ID')}.`)
      return
    }

    setIsSaving(true)
    try {
      // Determine verification status:
      // If submitted by Bendahara Kelas (siswa) -> PENDING
      // If submitted by Guru/Admin -> VERIFIED
      const isSubmittingAsBendahara = mode === 'siswa' && isBendaharaActive
      const statusVerifikasi = isSubmittingAsBendahara ? 'PENDING' : 'VERIFIED'
      const diinputByNisn = isSubmittingAsBendahara ? studentData?.nisn : null
      const diinputByUserId = mode !== 'siswa' ? session?.id : null

      const { data, error } = await supabase.rpc('proses_transaksi_tabungan', {
        p_siswa_nisn: targetSiswa.nisn,
        p_kelas: targetSiswa.kelas,
        p_tipe: transTipe,
        p_jumlah: nominalNum,
        p_status_verifikasi: statusVerifikasi,
        p_diinput_oleh_nisn: diinputByNisn,
        p_diinput_oleh_user_id: diinputByUserId,
        p_keterangan: transKeterangan || (transTipe === 'SETOR' ? 'Setoran Tabungan' : 'Penarikan Tabungan')
      })

      if (error) throw error

      if (data?.success) {
        setShowTransactionModal(false)
        setNotifModal({
          type: 'success',
          title: 'Transaksi Berhasil',
          message: isSubmittingAsBendahara
            ? 'Transaksi berhasil dicatat dan menunggu verifikasi Wali Kelas!'
            : `Transaksi ${transTipe} Rp ${nominalNum.toLocaleString('id-ID')} berhasil diproses!`
        })

        // Jika langsung diverifikasi (Guru / Admin), kirim FCM push langsung ke HP Siswa & Orang Tua
        if (statusVerifikasi === 'VERIFIED') {
          const nominalStr = `Rp ${nominalNum.toLocaleString('id-ID')}`
          const newSaldo = transTipe === 'SETOR' ? currentSaldo + nominalNum : currentSaldo - nominalNum
          const saldoStr = `Rp ${newSaldo.toLocaleString('id-ID')}`
          const isSetor = transTipe === 'SETOR'

          sendFCMPushNotification({
            nisn: targetSiswa.nisn,
            title: isSetor ? `Setoran Tabungan ${targetSiswa.nama_lengkap || 'Siswa'}` : `Penarikan Tabungan ${targetSiswa.nama_lengkap || 'Siswa'}`,
            body: isSetor 
              ? `${targetSiswa.nama_lengkap || 'Siswa'} telah menabung sebesar ${nominalStr}. Total tabungan sekarang: ${saldoStr}.`
              : `Penarikan tabungan sebesar ${nominalStr} berhasil. Total tabungan sekarang: ${saldoStr}.`,
            targetMenu: 'TABUNGAN'
          }).catch(err => console.warn('[FCM Tabungan] Send error:', err))
        }

        fetchData()
      } else {
        setNotifModal({
          type: 'error',
          title: 'Gagal Memproses',
          message: data?.message || 'Terjadi kesalahan saat memproses transaksi'
        })
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Terjadi Kesalahan',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle 1-Click Verification / Approval / Rejection
  const handleVerifikasiTransaksi = async (transaksiId, approve = true) => {
    const actionLabel = approve ? 'menyetujui' : 'menolak'
    const confirmed = await requestConfirm({
      title: approve ? 'Setujui Transaksi Tabungan' : 'Tolak Transaksi Tabungan',
      message: `Apakah Anda yakin ingin ${actionLabel} transaksi setoran ini?`,
      confirmLabel: approve ? 'Ya, Setujui Setoran' : 'Ya, Tolak Transaksi',
      confirmColor: approve ? 'emerald' : 'red'
    })

    if (!confirmed) return

    setIsSaving(true)
    try {
      const rpcName = approve ? 'verifikasi_transaksi_tabungan' : 'tolak_transaksi_tabungan'
      const { data, error } = await supabase.rpc(rpcName, {
        p_transaksi_id: transaksiId,
        p_user_id: session?.id || null
      })

      if (error) throw error

      if (data?.success) {
        setNotifModal({
          type: 'success',
          title: approve ? 'Verifikasi Berhasil' : 'Transaksi Ditolak',
          message: approve ? 'Transaksi berhasil diverifikasi dan saldo resmi terupdate!' : 'Transaksi berhasil ditolak.'
        })

        // Kirim FCM Push ke HP Orang Tua & Siswa jika disetujui
        if (approve) {
          const tx = transaksiList.find(t => t.id === transaksiId)
          if (tx) {
            const nominalStr = `Rp ${parseFloat(tx.jumlah || 0).toLocaleString('id-ID')}`
            const saldoStr = `Rp ${parseFloat(tx.saldo_akhir || (rekeningMap[tx.siswa_nisn]?.saldo || 0) + parseFloat(tx.jumlah || 0)).toLocaleString('id-ID')}`
            const student = semuaSiswa.find(s => s.nisn === tx.siswa_nisn)
            const nama = tx.nama_lengkap || student?.nama_lengkap || 'Siswa'

            sendFCMPushNotification({
              nisn: tx.siswa_nisn,
              title: `Setoran Tabungan ${nama}`,
              body: `${nama} telah menabung sebesar ${nominalStr}. Total tabungan sekarang: ${saldoStr}.`,
              targetMenu: 'TABUNGAN'
            }).catch(err => console.warn('[FCM Tabungan Verify] Send error:', err))
          }
        }

        fetchData()
      } else {
        throw new Error(data?.message || 'Gagal memproses verifikasi.')
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Memproses',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Delete Transaksi (Atomic RPC with Fallback)
  const handleDeleteTransaksi = async (tx) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Transaksi Tabungan',
      message: `Apakah Anda yakin ingin menghapus catatan ${tx.tipe} Rp ${parseFloat(tx.jumlah).toLocaleString('id-ID')} ini? ${tx.status_verifikasi === 'VERIFIED' ? 'Saldo siswa akan disesuaikan secara otomatis.' : ''}`,
      confirmLabel: 'Ya, Hapus Transaksi',
      confirmColor: 'red'
    })

    if (!confirmed) return

    setIsSaving(true)
    try {
      let success = false
      const { data, error } = await supabase.rpc('hapus_transaksi_tabungan', {
        p_transaksi_id: tx.id
      })

      if (!error && data?.success) {
        success = true
      } else {
        const { error: delErr } = await supabase
          .from('tabungan_transaksi')
          .delete()
          .eq('id', tx.id)
        if (!delErr) success = true
        else throw new Error(delErr.message || data?.message || 'Gagal menghapus transaksi.')
      }

      if (success) {
        setNotifModal({
          type: 'success',
          title: 'Transaksi Dihapus',
          message: 'Transaksi berhasil dihapus.'
        })
        fetchData()
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Menghapus',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Edit Transaksi Modal (Atomic RPC with Fallback)
  const [editingTx, setEditingTx] = useState(null)
  const [editNominal, setEditNominal] = useState('')

  const handleOpenEditModal = (tx) => {
    setEditingTx(tx)
    setEditNominal(tx.jumlah.toString())
  }

  const handleSaveEditModal = async (e) => {
    e.preventDefault()
    if (!editingTx) return

    const newNominal = parseFloat(editNominal)
    if (isNaN(newNominal) || newNominal <= 0) {
      setNotifModal({
        type: 'error',
        title: 'Nominal Tidak Valid',
        message: 'Nominal transaksi tidak valid!'
      })
      return
    }

    setIsSaving(true)
    try {
      let success = false
      const { data, error } = await supabase.rpc('edit_transaksi_tabungan', {
        p_transaksi_id: editingTx.id,
        p_jumlah_baru: newNominal
      })

      if (!error && data?.success) {
        success = true
      } else {
        const { error: updErr } = await supabase
          .from('tabungan_transaksi')
          .update({ jumlah: newNominal })
          .eq('id', editingTx.id)
        if (!updErr) success = true
        else throw new Error(updErr.message || data?.message || 'Gagal mengubah transaksi.')
      }

      if (success) {
        setEditingTx(null)
        setNotifModal({
          type: 'success',
          title: 'Perubahan Disimpan',
          message: 'Nominal transaksi berhasil diperbarui!'
        })
        fetchData()
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Mengubah',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Assign Bendahara Kelas
  const handleAssignBendahara = async () => {
    if (!selectedKelas) return
    setIsSaving(true)
    try {
      if (!selectedBendaharaNisn) {
        // Hapus bendahara kelas
        const { error: delErr } = await supabase
          .from('bendahara_kelas')
          .delete()
          .eq('kelas', selectedKelas)
        if (delErr) throw delErr
        setShowBendaharaModal(false)
        setNotifModal({
          type: 'success',
          title: 'Tugas Dihapus',
          message: `Tugas Bendahara Kelas ${selectedKelas} telah dihapus.`
        })
      } else {
        // Hapus penunjukkan bendahara lama untuk kelas ini
        await supabase
          .from('bendahara_kelas')
          .delete()
          .eq('kelas', selectedKelas)

        // Insert bendahara baru
        const taId = activeTa?.id ? String(activeTa.id) : null
        const { error: insErr } = await supabase
          .from('bendahara_kelas')
          .insert({
            kelas: selectedKelas,
            siswa_nisn: selectedBendaharaNisn,
            tahun_ajaran_id: taId,
            ditunjuk_oleh: session?.id || null
          })

        if (insErr) throw insErr

        const student = semuaSiswa.find(s => s.nisn === selectedBendaharaNisn)
        setShowBendaharaModal(false)
        setNotifModal({
          type: 'success',
          title: 'Penunjukan Berhasil',
          message: `${student?.nama_lengkap || selectedBendaharaNisn} berhasil ditunjuk sebagai Bendahara Kelas ${selectedKelas}!`
        })
      }
      fetchData()
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Pengaturan',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Submit Mass / Collective Deposit
  const handleSubmitKolektif = async () => {
    const entries = Object.entries(kolektifData).filter(([, val]) => parseFloat(val || 0) > 0)
    if (entries.length === 0) {
      setNotifModal({
        type: 'error',
        title: 'Isi Nominal',
        message: 'Harap isi nominal setoran pada minimal satu siswa!'
      })
      return
    }

    const confirmed = await requestConfirm({
      title: 'Simpan Setoran Massal',
      message: `Apakah Anda yakin ingin memproses setoran kolektif untuk ${entries.length} siswa di Kelas ${selectedKelas}?`,
      confirmLabel: 'Proses Setoran Massal',
      confirmColor: 'indigo'
    })

    if (!confirmed) return

    setIsSaving(true)
    let successCount = 0
    const isSubmittingAsBendahara = mode === 'siswa' && isBendaharaActive
    const statusVerifikasi = isSubmittingAsBendahara ? 'PENDING' : 'VERIFIED'

    for (const [nisn, amountStr] of entries) {
      const amount = parseFloat(amountStr)
      const student = semuaSiswa.find(s => s.nisn === nisn)
      if (!student) continue

      try {
        const { data } = await supabase.rpc('proses_transaksi_tabungan', {
          p_siswa_nisn: nisn,
          p_kelas: student.kelas,
          p_tipe: 'SETOR',
          p_jumlah: amount,
          p_status_verifikasi: statusVerifikasi,
          p_diinput_oleh_nisn: isSubmittingAsBendahara ? studentData?.nisn : null,
          p_diinput_oleh_user_id: mode !== 'siswa' ? session?.id : null,
          p_keterangan: 'Setoran Kolektif Kelas'
        })
        if (data?.success) successCount++
      } catch (e) {
        console.error('Failed batch entry for', nisn, e)
      }
    }

    setIsSaving(false)
    setKolektifData({})
    setNotifModal({
      type: 'success',
      title: 'Setoran Massal Berhasil',
      message: `Berhasil memproses ${successCount} setoran tabungan kolektif!`
    })
    fetchData()
  }

  // Student stats computation for read-only view
  const studentStats = useMemo(() => {
    if (mode !== 'siswa' || !studentData?.nisn) return null
    const saldo = rekeningMap[studentData.nisn]?.saldo || 0
    const myTrans = transaksiList.filter(t => t.siswa_nisn === studentData.nisn && t.status_verifikasi === 'VERIFIED')
    const totalSetor = myTrans.filter(t => t.tipe === 'SETOR').reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)
    const totalTarik = myTrans.filter(t => t.tipe === 'TARIK').reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)
    return { saldo, totalSetor, totalTarik }
  }, [mode, studentData, rekeningMap, transaksiList])

  // Automatically switch tab to 'riwayat' for regular students
  useEffect(() => {
    if (mode === 'siswa' && !isBendaharaActive) {
      setActiveTab('riwayat')
    }
  }, [mode, isBendaharaActive])

  // Format currency helpers
  const formatRupiah = (val) => {
    return 'Rp ' + (parseFloat(val || 0)).toLocaleString('id-ID')
  }

  // Export to Excel / CSV based on active tab and filters
  const handleExportCSV = () => {
    let headers = []
    let rows = []
    let filename = ''
    const dateStr = new Date().toLocaleDateString('en-CA')
    const kelasLabel = !selectedKelas || selectedKelas === 'Semua Kelas' || selectedKelas === 'all' ? 'Semua' : selectedKelas

    if (activeTab === 'daftar' || activeTab === 'kolektif') {
      headers = ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Saldo Akhir (Rp)']
      rows = filteredStudents.map((s, idx) => [
        idx + 1,
        s.nisn,
        `"${(s.nama_lengkap || '').replace(/"/g, '""')}"`,
        s.kelas,
        rekeningMap[s.nisn]?.saldo || 0
      ])
      filename = `Tabungan_Siswa_${kelasLabel}_${dateStr}.csv`
    } else if (activeTab === 'pending') {
      headers = ['No', 'Waktu', 'NISN', 'Nama Siswa', 'Kelas', 'Nominal (Rp)', 'Penginput (Bendahara)', 'Keterangan']
      rows = pendingTransactions.map((t, idx) => {
        const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
        const bendahara = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)
        return [
          idx + 1,
          `"${new Date(t.created_at).toLocaleString('id-ID')}"`,
          t.siswa_nisn,
          `"${(student?.nama_lengkap || '').replace(/"/g, '""')}"`,
          t.kelas,
          parseFloat(t.jumlah || 0),
          `"${(bendahara?.nama_lengkap || t.diinput_oleh_nisn || '').replace(/"/g, '""')}"`,
          `"${(t.keterangan || '').replace(/"/g, '""')}"`
        ]
      })
      filename = `Setoran_Pending_${kelasLabel}_${dateStr}.csv`
    } else if (activeTab === 'riwayat') {
      headers = ['No', 'Waktu', 'NISN', 'Nama Siswa', 'Kelas', 'Tipe', 'Nominal (Rp)', 'Saldo Akhir (Rp)', 'Status', 'Keterangan']
      rows = filteredTransactions.map((t, idx) => {
        const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
        return [
          idx + 1,
          `"${new Date(t.created_at).toLocaleString('id-ID')}"`,
          t.siswa_nisn,
          `"${(student?.nama_lengkap || '').replace(/"/g, '""')}"`,
          t.kelas,
          t.tipe,
          parseFloat(t.jumlah || 0),
          parseFloat(t.saldo_akhir || 0),
          t.status_verifikasi,
          `"${(t.keterangan || '').replace(/"/g, '""')}"`
        ]
      })
      filename = `Riwayat_Mutasi_Tabungan_${kelasLabel}_${dateStr}.csv`
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const isSpecificClassSelected = selectedKelas && selectedKelas !== 'Semua Kelas' && selectedKelas !== 'all'

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {ConfirmModalComponent}

      {/* HEADER SECTION - Rendered ONLY in Guru/Admin mode if needed */}
      {mode !== 'siswa' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              Tabungan Siswa {isSpecificClassSelected ? `(Kelas ${selectedKelas})` : '(Semua Kelas)'}
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Kelola saldo tabungan, verifikasi setoran harian, dan tunjuk Bendahara Kelas dengan aman.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Export Excel/CSV
            </button>
            
            {isSpecificClassSelected && (
              <button
                onClick={() => {
                  setSelectedBendaharaNisn(bendaharaClassMap[selectedKelas]?.siswa_nisn || '')
                  setShowBendaharaModal(true)
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs"
              >
                <span>⭐</span>
                <span>Bendahara Kelas</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ADMIN ONLY MASTER TOGGLE PANEL */}
      {mode === 'admin' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-base border border-indigo-100">
                🎛️
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Pengaturan Visibilitas Fitur Tabungan (Hak Akses Admin)</h3>
                <p className="text-[11px] text-slate-500 font-medium">Tampilkan atau sembunyikan menu Tabungan Siswa dari Orang Tua, Siswa, dan Wali Kelas</p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-extrabold border border-indigo-200">
              Pengaturan Admin
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Toggle Orang Tua & Siswa */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="pr-4">
                <p className="text-xs font-extrabold text-slate-800">Tampilkan untuk Orang Tua & Siswa</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Status: {showTabunganOrtuSiswa ? <span className="text-emerald-700 font-bold">🟢 DITAMPILKAN</span> : <span className="text-rose-700 font-bold">🔴 DISEMBUNYIKAN</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAccess('show_tabungan_ortu_siswa', showTabunganOrtuSiswa)}
                disabled={isTogglingSettings}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showTabunganOrtuSiswa ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    showTabunganOrtuSiswa ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle Wali Kelas */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="pr-4">
                <p className="text-xs font-extrabold text-slate-800">Tampilkan untuk Wali Kelas (Guru)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Status: {showTabunganWaliKelas ? <span className="text-emerald-700 font-bold">🟢 DITAMPILKAN</span> : <span className="text-rose-700 font-bold">🔴 DISEMBUNYIKAN</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAccess('show_tabungan_wali_kelas', showTabunganWaliKelas)}
                disabled={isTogglingSettings}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showTabunganWaliKelas ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    showTabunganWaliKelas ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS CARDS - eBudimulia Native Theme */}
      {mode === 'siswa' && !isBendaharaActive ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border-2 border-indigo-600 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-indigo-600 font-bold tracking-wide">Saldo Tabungan Saya</p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-indigo-700">{formatRupiah(studentStats?.saldo)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold tracking-wide">Total Akumulasi Setoran</p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-emerald-600">+{formatRupiah(studentStats?.totalSetor)}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-indigo-600 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-indigo-600 font-bold tracking-wide">
              {isSpecificClassSelected ? `Total Saldo Kelas ${selectedKelas}` : 'Total Saldo Semua Siswa'}
            </p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-indigo-700">{formatRupiah(classStats.totalSaldo)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold tracking-wide">
              Setor Bulan Ini {isSpecificClassSelected ? `(${selectedKelas})` : '(Semua)'}
            </p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-emerald-600">+{formatRupiah(classStats.totalSetorBulanIni)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold tracking-wide">
              Menunggu Verifikasi {isSpecificClassSelected ? `(${selectedKelas})` : '(Semua)'}
            </p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-amber-600">{classStats.pendingCount} <span className="text-sm font-semibold text-slate-500">Transaksi</span></p>
          </div>
        </div>
      )}

      {/* FILTER & CONTROLS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* TAB BUTTONS */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 overflow-x-auto custom-scrollbar">
            {(mode !== 'siswa' || isBendaharaActive) && (
              <button
                onClick={() => setActiveTab('daftar')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === 'daftar' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 Daftar Siswa & Saldo
              </button>
            )}

            {(mode !== 'siswa' || isBendaharaActive) && (
              <button
                onClick={() => setActiveTab('kolektif')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === 'kolektif' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ⚡ Setor Massal (Kolektif)
              </button>
            )}

            {mode !== 'siswa' && (
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'pending' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ⏳ Verifikasi Bendahara
                {pendingTransactions.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-extrabold animate-pulse">
                    {pendingTransactions.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('riwayat')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'riwayat' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📜 Riwayat Mutasi Tabungan
            </button>
          </div>

          {/* CLASS SELECTOR, SEARCH & RESET */}
          <div className="flex items-center gap-3 flex-wrap">
            {mode !== 'siswa' && semuaKelas.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">Kelas:</span>
                <select
                  value={selectedKelas}
                  onChange={(e) => {
                    setSelectedKelas(e.target.value)
                    setSelectedPendingIds([])
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  {!isWaliOnly && <option value="Semua Kelas">Semua Kelas</option>}
                  {semuaKelas.map(k => (
                    <option key={k} value={k}>Kelas {k}</option>
                  ))}
                </select>
              </div>
            )}

            {mode !== 'siswa' && (
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Cari siswa, NISN, atau keterangan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilter}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs"
                title="Reset Semua Filter"
              >
                <span>↺</span>
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* SUB-FILTERS FOR SPECIFIC TABS */}
        {activeTab === 'daftar' && mode !== 'siswa' && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold text-[11px]">Filter Saldo:</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFilterSaldo('semua')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${filterSaldo === 'semua' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Semua Siswa ({semuaSiswa.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSaldo('ada_saldo')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${filterSaldo === 'ada_saldo' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  🟢 Memiliki Saldo
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSaldo('saldo_nol')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${filterSaldo === 'saldo_nol' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  ⚪ Saldo Rp 0
                </button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Menampilkan <span className="font-extrabold text-slate-800">{filteredStudents.length}</span> siswa
            </div>
          </div>
        )}

        {activeTab === 'riwayat' && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold text-[11px]">Tipe:</span>
                <select
                  value={filterTipeMutasi}
                  onChange={(e) => setFilterTipeMutasi(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="semua">Semua Tipe</option>
                  <option value="SETOR">💰 Setoran (+)</option>
                  <option value="TARIK">💸 Penarikan (-)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold text-[11px]">Status:</span>
                <select
                  value={filterStatusMutasi}
                  onChange={(e) => setFilterStatusMutasi(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="semua">Semua Status</option>
                  <option value="VERIFIED">✅ Terverifikasi</option>
                  <option value="PENDING">⏳ Menunggu Verifikasi</option>
                  <option value="REJECTED">❌ Ditolak</option>
                </select>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Menampilkan <span className="font-extrabold text-slate-800">{filteredTransactions.length}</span> transaksi
            </div>
          </div>
        )}

        {activeTab === 'pending' && mode !== 'siswa' && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="text-[11px] text-amber-800 font-bold flex items-center gap-1.5">
              <span>⏳</span>
              <span>Menampilkan {pendingTransactions.length} setoran menunggu verifikasi {isSpecificClassSelected ? `(Kelas ${selectedKelas})` : ''}</span>
            </div>
            {pendingTransactions.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllPending}
                className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isAllPendingSelected ? 'Batal Pilih Semua' : `Pilih Semua (${pendingTransactions.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* BENDAHARA KELAS INFO BANNER */}
      {mode !== 'siswa' && isSpecificClassSelected && bendaharaClassMap[selectedKelas] && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg">
              👑
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">Bendahara Kelas {selectedKelas}:</p>
              <p className="text-sm font-black text-amber-800">
                {bendaharaClassMap[selectedKelas].nama} <span className="text-xs font-mono opacity-80">({bendaharaClassMap[selectedKelas].siswa_nisn})</span>
              </p>
            </div>
          </div>
          <span className="text-xs bg-amber-200/60 text-amber-900 px-3 py-1 rounded-full font-bold">
            Bertugas Menginput Setoran
          </span>
        </div>
      )}

      {/* TAB CONTENT 1: DAFTAR SISWA & SALDO */}
      {activeTab === 'daftar' && (mode !== 'siswa' || isBendaharaActive) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* MOBILE LIST VIEW (Khusus Layar HP/Tablet: Nama, Bawahnya Total Saldo, Kanan Tombol Setor) */}
          <div className="md:hidden divide-y divide-slate-100">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-xs font-medium">
                Memuat data tabungan siswa...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs font-medium">
                Tidak ada siswa ditemukan.
              </div>
            ) : (
              filteredStudents.map((siswa, idx) => {
                const saldo = rekeningMap[siswa.nisn]?.saldo || 0
                const isBendahara = bendaharaClassMap[siswa.kelas]?.siswa_nisn === siswa.nisn

                return (
                  <div
                    key={siswa.nisn}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Sisi Kiri: Nama Siswa & Bawahnya Total Saldo (Dapat diklik untuk melihat mutasi) */}
                    <div 
                      onClick={() => handleOpenDetailSiswa(siswa)}
                      className="min-w-0 flex-1 cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-400 font-mono">#{idx + 1}</span>
                        <p className="font-black text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors">
                          {siswa.nama_lengkap}
                        </p>
                        {isBendahara && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black rounded-full border border-amber-300">
                            Bendahara
                          </span>
                        )}
                      </div>
                      <p className="font-black text-emerald-700 text-sm mt-0.5">
                        {formatRupiah(saldo)}
                      </p>
                    </div>

                    {/* Sisi Kanan: Tombol Setor (& Tarik) */}
                    {(mode !== 'siswa' || isBendaharaActive) && (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenTransaction(siswa, 'SETOR')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1"
                        >
                          <span>+</span> Setor
                        </button>
                        {mode !== 'siswa' && (
                          <button
                            onClick={() => handleOpenTransaction(siswa, 'TARIK')}
                            className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-2xs"
                            title="Tarik Saldo"
                          >
                            Tarik
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">No</th>
                  <th className="py-3.5 px-4">Nama Siswa</th>
                  <th className="py-3.5 px-4">NISN</th>
                  <th className="py-3.5 px-4">Kelas</th>
                  <th className="py-3.5 px-4 text-right">Saldo Tabungan</th>
                  {(mode !== 'siswa' || isBendaharaActive) && (
                    <th className="py-3.5 px-4 text-center">Aksi / Transaksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      Memuat data tabungan siswa...
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      Tidak ada siswa ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((siswa, idx) => {
                    const saldo = rekeningMap[siswa.nisn]?.saldo || 0
                    const isBendahara = bendaharaClassMap[siswa.kelas]?.siswa_nisn === siswa.nisn

                    return (
                      <tr key={siswa.nisn} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td 
                          onClick={() => handleOpenDetailSiswa(siswa)}
                          className="py-3.5 px-4 font-bold text-slate-800 cursor-pointer hover:text-emerald-700 transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="group-hover:underline">{siswa.nama_lengkap}</span>
                            {isBendahara && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full border border-amber-300">
                                Bendahara
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 font-normal hidden group-hover:inline">
                              (Klik untuk lihat mutasi)
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{siswa.nisn}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold">
                            {siswa.kelas}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm">
                          {formatRupiah(saldo)}
                        </td>
                        {(mode !== 'siswa' || isBendaharaActive) && (
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleOpenTransaction(siswa, 'SETOR')}
                                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1"
                              >
                                <span>+</span> Setor
                              </button>
                              {mode !== 'siswa' && (
                                <button
                                  onClick={() => handleOpenTransaction(siswa, 'TARIK')}
                                  className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1"
                                >
                                  <span>-</span> Tarik
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: SETOR MASSAL / KOLEKTIF */}
      {activeTab === 'kolektif' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Setor Tabungan Massal / Kolektif</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isSpecificClassSelected
                  ? `Ketikkan nominal setoran masing-masing siswa untuk Kelas ${selectedKelas}, lalu klik Simpan Semua.`
                  : 'Pilih kelas tertentu terlebih dahulu untuk melakukan penginputan setoran massal per rombel.'}
              </p>
            </div>
            {isSpecificClassSelected && (
              <button
                onClick={handleSubmitKolektif}
                disabled={isSaving}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                {isSaving ? 'Memproses...' : 'Simpan Semua Setoran'}
              </button>
            )}
          </div>

          {!isSpecificClassSelected ? (
            <div className="py-12 px-4 text-center bg-amber-50/50 rounded-2xl border border-dashed border-amber-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl mx-auto font-bold">
                👥
              </div>
              <p className="text-sm font-black text-amber-900">Pilih Kelas Tertentu untuk Setor Massal</p>
              <p className="text-xs text-amber-700 max-w-md mx-auto leading-relaxed">
                Setor massal kolektif dilakukan per rombel kelas agar tidak tercampur. Silakan pilih salah satu kelas di bawah atau dari dropdown kelas di atas:
              </p>
              {semuaKelas.length > 0 && (
                <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                  {semuaKelas.map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedKelas(k)}
                      className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-extrabold transition-all shadow-2xs hover:scale-105"
                    >
                      Kelas {k}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-2">
              <p>Tidak ada siswa ditemukan di Kelas {selectedKelas} {searchQuery ? `dengan pencarian "${searchQuery}"` : ''}.</p>
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilter}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                >
                  Reset Pencarian
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredStudents.map(siswa => (
                <div key={siswa.nisn} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-300 transition-colors">
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-800 truncate">{siswa.nama_lengkap}</p>
                    <p className="text-[10px] text-slate-500 font-mono">Saldo: {formatRupiah(rekeningMap[siswa.nisn]?.saldo || 0)}</p>
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      placeholder="Rp 0"
                      value={kolektifData[siswa.nisn] || ''}
                      onChange={(e) => setKolektifData({ ...kolektifData, [siswa.nisn]: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: PENDING VERIFICATION WITH MULTI-SELECT */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          {/* Header Banner */}
          <div className="p-4 bg-amber-50/80 border-b border-amber-200/80 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <span>⏳</span>
              <span>
                Daftar Setoran Bendahara yang Menunggu Verifikasi {isSpecificClassSelected ? `(Kelas ${selectedKelas})` : '(Semua Kelas)'}
              </span>
            </div>
            {pendingTransactions.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSelectAllPending}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-2xs"
                >
                  {isAllPendingSelected ? 'Batal Pilih Semua' : `Pilih Semua (${pendingTransactions.length})`}
                </button>
              </div>
            )}
          </div>

          {/* FLOATING / STICKY BATCH ACTION BAR WHEN SELECTED */}
          {selectedPendingIds.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-3 px-4 flex items-center justify-between gap-3 flex-wrap shadow-md animate-fade-in sticky top-0 z-20">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-indigo-500/80 text-white flex items-center justify-center text-xs font-black ring-2 ring-indigo-400">
                  {selectedPendingIds.length}
                </span>
                <span className="text-xs font-bold text-indigo-100">
                  Transaksi Setoran Terpilih
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBatchVerifikasi(true)}
                  disabled={isBatchProcessing}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>✓</span>
                  <span>{isBatchProcessing ? 'Memproses...' : `Setujui Terpilih (${selectedPendingIds.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchVerifikasi(false)}
                  disabled={isBatchProcessing}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black rounded-xl text-xs transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>✕</span>
                  <span>{isBatchProcessing ? 'Memproses...' : `Tolak Terpilih (${selectedPendingIds.length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPendingIds([])}
                  disabled={isBatchProcessing}
                  className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* MOBILE LIST VIEW */}
          <div className="md:hidden divide-y divide-slate-100">
            {pendingTransactions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <p>Tidak ada transaksi setoran yang menunggu verifikasi untuk filter ini.</p>
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilter}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              pendingTransactions.map(t => {
                const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
                const bendahara = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)
                const isSelected = selectedPendingIds.includes(t.id)

                return (
                  <div
                    key={t.id}
                    className={`p-4 space-y-2.5 transition-colors ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectPending(t.id)}
                          className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-0.5"
                        />
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{student?.nama_lengkap || t.siswa_nisn}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Kelas {t.kelas} • {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                      <span className="font-black text-emerald-700 text-sm shrink-0">
                        {formatRupiah(t.jumlah)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-amber-800 font-semibold truncate">
                        Input: {bendahara?.nama_lengkap || 'Bendahara'}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleVerifikasiTransaksi(t.id, true)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm"
                        >
                          Setujui
                        </button>
                        <button
                          onClick={() => handleVerifikasiTransaksi(t.id, false)}
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllPendingSelected}
                      onChange={handleToggleSelectAllPending}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      title={isAllPendingSelected ? 'Batal Pilih Semua' : 'Pilih Semua'}
                    />
                  </th>
                  <th className="py-3.5 px-4">Waktu</th>
                  <th className="py-3.5 px-4">Siswa</th>
                  <th className="py-3.5 px-4">Kelas</th>
                  <th className="py-3.5 px-4">Penginput (Bendahara)</th>
                  <th className="py-3.5 px-4 text-right">Nominal</th>
                  <th className="py-3.5 px-4 text-center">Aksi Individual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {pendingTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      <div className="space-y-2">
                        <p>Tidak ada transaksi setoran yang menunggu verifikasi untuk filter ini.</p>
                        {isFilterActive && (
                          <button
                            type="button"
                            onClick={handleResetFilter}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                          >
                            Reset Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingTransactions.map(t => {
                    const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
                    const bendahara = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)
                    const isSelected = selectedPendingIds.includes(t.id)

                    return (
                      <tr
                        key={t.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-indigo-50/80 font-semibold' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectPending(t.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {student?.nama_lengkap || t.siswa_nisn}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-bold">
                            {t.kelas}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-amber-800 font-bold">
                          {bendahara?.nama_lengkap || t.diinput_oleh_nisn || 'Bendahara Kelas'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm">
                          {formatRupiah(t.jumlah)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleVerifikasiTransaksi(t.id, true)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-sm flex items-center gap-1"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => handleVerifikasiTransaksi(t.id, false)}
                              className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold transition-all shadow-sm"
                            >
                              Tolak
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: RIWAYAT MUTASI WITH FILTERED DATA */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* MOBILE LIST VIEW */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <p>Belum ada riwayat transaksi tabungan yang sesuai dengan filter.</p>
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilter}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              filteredTransactions.map(t => {
                const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)

                return (
                  <div key={t.id} className="p-4 space-y-2 hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {mode !== 'siswa' && (
                          <p className="font-bold text-slate-800 text-sm">{student?.nama_lengkap || t.siswa_nisn}</p>
                        )}
                        <p className="text-[11px] text-slate-500 font-mono">
                          {t.kelas ? `Kelas ${t.kelas} • ` : ''}{new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`font-black text-sm block ${t.tipe === 'SETOR' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {t.tipe === 'SETOR' ? '+' : '-'}{formatRupiah(t.jumlah)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">Saldo: {formatRupiah(t.saldo_akhir)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          t.tipe === 'SETOR' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {t.tipe}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          t.status_verifikasi === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          t.status_verifikasi === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {t.status_verifikasi}
                        </span>
                      </div>
                      {(mode !== 'siswa' || isBendaharaActive) && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="px-2 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaksi(t)}
                            className="px-2 py-1 bg-slate-100 hover:bg-rose-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200"
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase">
                  <th className="py-3.5 px-4">Waktu</th>
                  {mode !== 'siswa' && (
                    <>
                      <th className="py-3.5 px-4">Siswa</th>
                      <th className="py-3.5 px-4">Kelas</th>
                    </>
                  )}
                  <th className="py-3.5 px-4">Tipe</th>
                  <th className="py-3.5 px-4 text-right">Jumlah</th>
                  <th className="py-3.5 px-4 text-right">Saldo Akhir</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Keterangan</th>
                  {(mode !== 'siswa' || isBendaharaActive) && (
                    <th className="py-3.5 px-4 text-center w-28">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={mode !== 'siswa' ? 9 : (isBendaharaActive ? 7 : 6)} className="py-12 text-center text-slate-400">
                      <div className="space-y-2">
                        <p>Belum ada riwayat transaksi tabungan yang sesuai dengan filter.</p>
                        {isFilterActive && (
                          <button
                            type="button"
                            onClick={handleResetFilter}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all"
                          >
                            Reset Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(t => {
                    const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        {mode !== 'siswa' && (
                          <>
                            <td className="py-3.5 px-4 font-bold text-slate-800">
                              {student?.nama_lengkap || t.siswa_nisn}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-bold">
                                {t.kelas}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            t.tipe === 'SETOR' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {t.tipe}
                          </span>
                        </td>
                        <td className={`py-3.5 px-4 text-right font-black ${t.tipe === 'SETOR' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {t.tipe === 'SETOR' ? '+' : '-'}{formatRupiah(t.jumlah)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                          {formatRupiah(t.saldo_akhir)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            t.status_verifikasi === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            t.status_verifikasi === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {t.status_verifikasi}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 truncate max-w-[150px]">
                          {t.keterangan || '-'}
                        </td>
                        {(mode !== 'siswa' || isBendaharaActive) && (
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(t)}
                                className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors"
                                title="Edit Nominal Transaksi"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaksi(t)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 rounded-lg text-[11px] font-bold border border-slate-200 transition-colors"
                                title="Hapus Transaksi"
                              >
                                🗑️ Hapus
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EDIT NOMINAL TRANSAKSI */}
      {editingTx && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <span>✏️</span> Edit Nominal Transaksi Tabungan
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Siswa</label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-800">
                  {semuaSiswa.find(s => s.nisn === editingTx.siswa_nisn)?.nama_lengkap || editingTx.siswa_nisn}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                  Nominal {editingTx.tipe} Baru (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 font-black text-slate-400 text-sm">Rp</span>
                  <input
                    type="number"
                    value={editNominal}
                    onChange={(e) => setEditNominal(e.target.value)}
                    required
                    min="1000"
                    step="500"
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL TRANSACTION (SETOR / TARIK) - FULL PAGE / PREMIUM LARGE MODAL */}
      {showTransactionModal && targetSiswa && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[99999] flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 animate-scale-in my-auto">
            {/* Modal Header */}
            <div className={`p-6 md:p-8 text-white flex items-center justify-between relative overflow-hidden ${
              transTipe === 'SETOR' ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-rose-600 to-red-700'
            }`}>
              <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold mb-2 backdrop-blur-md">
                  <span>{transTipe === 'SETOR' ? '💰' : '💸'}</span>
                  <span>Formulir {transTipe === 'SETOR' ? 'Setoran' : 'Penarikan'} Tabungan</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">
                  {transTipe === 'SETOR' ? 'Setor Tabungan Siswa' : 'Penarikan Tabungan Siswa'}
                </h3>
                <p className="text-white/80 text-xs md:text-sm mt-1">
                  Siswa: <span className="font-extrabold text-white">{targetSiswa.nama_lengkap}</span> • Kelas {targetSiswa.kelas} • NISN {targetSiswa.nisn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTransactionModal(false)}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center font-bold text-lg transition-all backdrop-blur-md relative z-10 shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitTransaction} className="p-6 md:p-8 space-y-6">
              {/* Saldo Terkini Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo Tabungan Saat Ini</p>
                  <p className="text-2xl font-black text-emerald-700 mt-0.5">
                    {formatRupiah(rekeningMap[targetSiswa.nisn]?.saldo || 0)}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl font-bold">
                  💳
                </div>
              </div>

              {/* Nominal Input */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Nominal {transTipe === 'SETOR' ? 'Setoran' : 'Penarikan'} (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-4 text-lg font-black text-slate-400">Rp</span>
                  <input
                    type="number"
                    placeholder="0"
                    required
                    autoFocus
                    value={transNominal}
                    onChange={(e) => setTransNominal(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-2xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">Pilih Cepat:</span>
                  {[5000, 10000, 20000, 50000, 100000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTransNominal(String(preset))}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-600 transition-all"
                    >
                      +{preset.toLocaleString('id-ID')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keterangan Input */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Keterangan / Catatan Transaksi
                </label>
                <input
                  type="text"
                  placeholder="Misal: Setor Harian Jumat / Qurban / Study Tour"
                  value={transKeterangan}
                  onChange={(e) => setTransKeterangan(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-8 py-3 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all ${
                    transTipe === 'SETOR'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30'
                  } disabled:opacity-50`}
                >
                  {isSaving ? 'Memproses...' : `Proses ${transTipe === 'SETOR' ? 'Setoran' : 'Penarikan'} Sekarang`}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL ASSIGN BENDAHARA KELAS - NATIVE SIMPLE MODAL */}
      {showBendaharaModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl z-[99999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span>👑</span> Penunjukan Bendahara Kelas {selectedKelas}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Pilih siswa yang bertugas menginput setoran harian kelas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBendaharaModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Dropdown Input */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                Pilih Nama Siswa
              </label>
              <select
                value={selectedBendaharaNisn}
                onChange={(e) => setSelectedBendaharaNisn(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">-- Tidak Ada Bendahara (Hanya Wali Kelas) --</option>
                {filteredStudents.map(s => (
                  <option key={s.nisn} value={s.nisn}>
                    {s.nama_lengkap} (NISN: {s.nisn})
                  </option>
                ))}
              </select>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBendaharaModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAssignBendahara}
                disabled={isSaving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              >
                {isSaving ? 'Simpan...' : 'Simpan Bendahara Kelas'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PROFESSIONAL CUSTOM NOTIFICATION MODAL */}
      {notifModal && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in">
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl transition-all"
            onClick={() => setNotifModal(null)} 
          />
          <div className="relative bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 flex flex-col items-center text-center space-y-4 animate-scale-in">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-xs ring-8 ${
              notifModal.type === 'success' ? 'bg-emerald-100 text-emerald-600 ring-emerald-50' : 'bg-rose-100 text-rose-600 ring-rose-50'
            }`}>
              {notifModal.type === 'success' ? '✅' : '❌'}
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">{notifModal.title}</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">{notifModal.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotifModal(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all"
            >
              Mengerti
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DETAIL MUTASI TRANSAKSI PER SISWA */}
      {detailSiswaTabungan && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in" onClick={() => setDetailSiswaTabungan(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in" onClick={e => e.stopPropagation()}>
            {/* Header Profile Banner (Sesuai Gaya Aplikasi) */}
            <div className="relative bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-5 text-white shrink-0">
              <button
                type="button"
                onClick={() => setDetailSiswaTabungan(null)}
                className="absolute top-4 right-4 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>

              <div className="flex items-center gap-3.5 pr-8">
                <div className="w-13 h-13 rounded-2xl border-2 border-white/40 overflow-hidden bg-white/10 shrink-0 shadow-md">
                  <StudentAvatar 
                    student={detailSiswaTabungan} 
                    fotos={internalFotos.length > 0 ? internalFotos : fotos} 
                    className="w-full h-full object-cover text-lg" 
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-black text-white truncate leading-snug">
                    {detailSiswaTabungan.nama_lengkap}
                  </h2>
                  <p className="text-xs text-indigo-100 font-mono mt-0.5">
                    NISN: {detailSiswaTabungan.nisn || '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Saldo Summary Card (Clean & Responsive) */}
            <div className="p-4 bg-slate-50 border-b border-slate-200/80 shrink-0">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200/90 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">Total Saldo Tabungan</span>
                  <span className="text-lg sm:text-xl font-black text-emerald-700">
                    {formatRupiah(rekeningMap[detailSiswaTabungan.nisn]?.saldo || 0)}
                  </span>
                </div>
                {(mode !== 'siswa' || isBendaharaActive) && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const s = detailSiswaTabungan
                        setDetailSiswaTabungan(null)
                        handleOpenTransaction(s, 'SETOR')
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                    >
                      <span>+</span> Setor
                    </button>
                    {mode !== 'siswa' && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = detailSiswaTabungan
                          setDetailSiswaTabungan(null)
                          handleOpenTransaction(s, 'TARIK')
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                      >
                        Tarik
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* List Transaksi Siswa */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  📜 Riwayat Mutasi ({detailStudentTxList.length})
                </h4>
              </div>

              {loadingDetailTx ? (
                <div className="py-10 text-center text-slate-400 text-xs font-medium animate-pulse">
                  ⏳ Memuat riwayat mutasi...
                </div>
              ) : detailStudentTxList.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6">
                  Belum ada catatan transaksi tabungan untuk siswa ini.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {detailStudentTxList.map(tx => {
                    const isSetor = tx.tipe === 'SETOR'
                    const penginput = semuaSiswa.find(s => s.nisn === tx.diinput_oleh_nisn)

                    return (
                      <div
                        key={tx.id}
                        className="p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all space-y-2 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                              isSetor ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {isSetor ? '↓' : '↑'}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                {isSetor ? 'Setoran Tabungan' : 'Penarikan Tabungan'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {new Date(tx.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs sm:text-sm font-black block ${isSetor ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {isSetor ? '+' : '-'}{formatRupiah(tx.jumlah)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Saldo: {formatRupiah(tx.saldo_akhir)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[10px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              tx.status_verifikasi === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                              tx.status_verifikasi === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {tx.status_verifikasi === 'VERIFIED' ? '✅ Terverifikasi' :
                               tx.status_verifikasi === 'PENDING' ? '⏳ Menunggu Verifikasi' : '❌ Ditolak'}
                            </span>
                            {tx.diinput_oleh_nisn && (
                              <span className="text-slate-500">
                                • Input: {penginput?.nama_lengkap || 'Bendahara'}
                              </span>
                            )}
                          </div>

                          {(mode !== 'siswa' || isBendaharaActive) && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailSiswaTabungan(null)
                                  handleOpenEditModal(tx)
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-800 text-[10px] font-bold rounded-lg border border-slate-200 transition-colors"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailSiswaTabungan(null)
                                  handleDeleteTransaksi(tx)
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 text-[10px] font-bold rounded-lg border border-slate-200 transition-colors"
                              >
                                🗑️ Hapus
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setDetailSiswaTabungan(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
