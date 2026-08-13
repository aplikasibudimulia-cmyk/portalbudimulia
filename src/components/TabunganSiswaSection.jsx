import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

export default function TabunganSiswaSection({ session, activeTa, mode = 'guru', studentData = null, isOrangTuaView = false }) {
  // mode: 'guru' | 'admin' | 'siswa'
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const channelRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
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

      if (!selectedKelas && uniqueClasses.length > 0) {
        if (isWaliOnly && waliClassesForActiveTa.length > 0) {
          setSelectedKelas(waliClassesForActiveTa[0])
        } else if (mode === 'siswa' && studentData?.kelas) {
          setSelectedKelas(studentData.kelas)
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
  }, [mode, studentData, isWaliOnly, waliClassesForActiveTa, selectedKelas, isBendaharaActive])

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

  // Filter students based on selected class & search query
  const filteredStudents = useMemo(() => {
    return semuaSiswa.filter(s => {
      const matchKelas = !selectedKelas || selectedKelas === 'Semua Kelas' || s.kelas === selectedKelas
      const matchSearch = !searchQuery || 
        s.nama_lengkap.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.nisn.includes(searchQuery)
      return matchKelas && matchSearch
    })
  }, [semuaSiswa, selectedKelas, searchQuery])

  // Stats calculation for current view
  const classStats = useMemo(() => {
    const studentsInCurrentView = selectedKelas && selectedKelas !== 'Semua Kelas'
      ? semuaSiswa.filter(s => s.kelas === selectedKelas)
      : semuaSiswa

    let totalSaldo = 0
    studentsInCurrentView.forEach(s => {
      totalSaldo += (rekeningMap[s.nisn]?.saldo || 0)
    })

    const nisnSet = new Set(studentsInCurrentView.map(s => s.nisn))
    const currentClassTrans = transaksiList.filter(t => nisnSet.has(t.siswa_nisn) && t.status_verifikasi === 'VERIFIED')

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const totalSetorBulanIni = currentClassTrans
      .filter(t => t.tipe === 'SETOR' && t.created_at >= startOfMonth)
      .reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)

    const totalTarikBulanIni = currentClassTrans
      .filter(t => t.tipe === 'TARIK' && t.created_at >= startOfMonth)
      .reduce((sum, t) => sum + parseFloat(t.jumlah || 0), 0)

    const pendingCount = transaksiList.filter(t => nisnSet.has(t.siswa_nisn) && t.status_verifikasi === 'PENDING').length

    return {
      totalSaldo,
      totalSetorBulanIni,
      totalTarikBulanIni,
      totalSiswa: studentsInCurrentView.length,
      pendingCount
    }
  }, [semuaSiswa, selectedKelas, rekeningMap, transaksiList])

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

  // Handle Delete Transaksi (Atomic RPC)
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
      const { data, error } = await supabase.rpc('hapus_transaksi_tabungan', {
        p_transaksi_id: tx.id
      })

      if (error) throw error

      if (data?.success) {
        setNotifModal({
          type: 'success',
          title: 'Transaksi Dihapus',
          message: 'Transaksi berhasil dihapus dan saldo telah disesuaikan secara atomik!'
        })
        fetchData()
      } else {
        throw new Error(data?.message || 'Gagal menghapus transaksi.')
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

  // Handle Edit Transaksi Modal (Atomic RPC)
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
      const { data, error } = await supabase.rpc('edit_transaksi_tabungan', {
        p_transaksi_id: editingTx.id,
        p_jumlah_baru: newNominal
      })

      if (error) throw error

      if (data?.success) {
        setEditingTx(null)
        setNotifModal({
          type: 'success',
          title: 'Perubahan Disimpan',
          message: 'Nominal transaksi berhasil diperbarui secara atomik!'
        })
        fetchData()
      } else {
        throw new Error(data?.message || 'Gagal mengubah transaksi.')
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

  // Export to Excel / CSV simple downloader
  const handleExportCSV = () => {
    const headers = ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Saldo Akhir (Rp)']
    const rows = filteredStudents.map((s, idx) => [
      idx + 1,
      s.nisn,
      `"${s.nama_lengkap}"`,
      s.kelas,
      rekeningMap[s.nisn]?.saldo || 0
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Tabungan_Siswa_${selectedKelas || 'Semua'}_${new Date().toLocaleDateString('en-CA')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {ConfirmModalComponent}

      {/* HEADER SECTION - Rendered ONLY in Guru/Admin mode if needed */}
      {mode !== 'siswa' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              Tabungan Siswa {selectedKelas ? `(Kelas ${selectedKelas})` : ''}
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
            
            {selectedKelas && (
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
            <p className="text-xs text-indigo-600 font-bold tracking-wide">Total Saldo Kelas</p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-indigo-700">{formatRupiah(classStats.totalSaldo)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold tracking-wide">Setor Bulan Ini</p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-emerald-600">+{formatRupiah(classStats.totalSetorBulanIni)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <p className="text-xs text-slate-500 font-semibold tracking-wide">Menunggu Verifikasi</p>
            <p className="text-2xl md:text-3xl font-extrabold mt-1 text-amber-600">{classStats.pendingCount} <span className="text-sm font-semibold text-slate-500">Transaksi</span></p>
          </div>
        </div>
      )}

      {/* FILTER & CONTROLS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              {classStats.pendingCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-amber-500 text-white rounded-full font-extrabold animate-pulse">
                  {classStats.pendingCount}
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

        {/* CLASS SELECTOR & SEARCH */}
        <div className="flex items-center gap-3 flex-wrap">
          {mode !== 'siswa' && semuaKelas.length > 0 && (
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {!isWaliOnly && <option value="Semua Kelas">Semua Kelas</option>}
              {semuaKelas.map(k => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>
          )}

          {mode !== 'siswa' && (
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Cari siswa atau NISN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          )}
        </div>
      </div>

      {/* BENDAHARA KELAS INFO BANNER */}
      {mode !== 'siswa' && selectedKelas && bendaharaClassMap[selectedKelas] && (
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
          <div className="overflow-x-auto">
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
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span>{siswa.nama_lengkap}</span>
                            {isBendahara && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full border border-amber-300">
                                Bendahara
                              </span>
                            )}
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
                Ketikkan nominal setoran masing-masing siswa untuk Kelas {selectedKelas || 'Aktif'}, lalu klik Simpan Semua.
              </p>
            </div>
            <button
              onClick={handleSubmitKolektif}
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              {isSaving ? 'Memproses...' : 'Simpan Semua Setoran'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredStudents.map(siswa => (
              <div key={siswa.nisn} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
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
        </div>
      )}

      {/* TAB CONTENT 3: PENDING VERIFICATION */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <span>⏳</span>
              <span>Daftar Setoran Bendahara Kelas yang Menunggu Verifikasi Wali Kelas</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase">
                  <th className="py-3.5 px-4">Waktu</th>
                  <th className="py-3.5 px-4">Siswa</th>
                  <th className="py-3.5 px-4">Kelas</th>
                  <th className="py-3.5 px-4">Penginput (Bendahara)</th>
                  <th className="py-3.5 px-4 text-right">Nominal</th>
                  <th className="py-3.5 px-4 text-center">Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {transaksiList.filter(t => t.status_verifikasi === 'PENDING').length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      Tidak ada transaksi setoran yang menunggu verifikasi.
                    </td>
                  </tr>
                ) : (
                  transaksiList
                    .filter(t => t.status_verifikasi === 'PENDING')
                    .map(t => {
                      const student = semuaSiswa.find(s => s.nisn === t.siswa_nisn)
                      const bendahara = semuaSiswa.find(s => s.nisn === t.diinput_oleh_nisn)

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 font-mono text-slate-500">
                            {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">
                            {student?.nama_lengkap || t.siswa_nisn}
                          </td>
                          <td className="py-3.5 px-4">{t.kelas}</td>
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

      {/* TAB CONTENT 4: RIWAYAT MUTASI */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
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
                {transaksiList.length === 0 ? (
                  <tr>
                    <td colSpan={mode !== 'siswa' ? 9 : (isBendaharaActive ? 7 : 6)} className="py-12 text-center text-slate-400">
                      Belum ada riwayat transaksi tabungan.
                    </td>
                  </tr>
                ) : (
                  transaksiList.map(t => {
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
                            <td className="py-3.5 px-4">{t.kelas}</td>
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
    </div>
  )
}
