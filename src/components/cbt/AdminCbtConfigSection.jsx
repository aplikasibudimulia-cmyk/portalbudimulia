import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { fetchActiveTahunAjaranClasses, DEFAULT_KELAS_LIST } from '../../utils/cbt/cbtKelasHelper'
import { useConfirm } from '../../utils/useConfirm'
import { useToast } from '../../utils/useToast'

export default function AdminCbtConfigSection() {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  const { showToast, ToastComponent } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState({
    cbt_release_mode: 'whitelist', // 'whitelist' or 'public'
    is_frozen: false
  })
  const [whitelistUsers, setWhitelistUsers] = useState([])
  const [whitelistStats, setWhitelistStats] = useState({ siswaCount: 0, guruCount: 0, kelasCount: 0 })
  const [isCbtActive, setIsCbtActive] = useState(false)
  const [frozenCount, setFrozenCount] = useState(0)
  const [filterRole, setFilterRole] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  
  // Modal Tambah Tester
  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState('siswa') // 'siswa', 'guru', 'kelas'
  const [selectedKelas, setSelectedKelas] = useState('7A')
  const [searchUserQuery, setSearchUserQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearchingUser, setIsSearchingUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [inputKeterangan, setInputKeterangan] = useState('')
  const [availableKelas, setAvailableKelas] = useState(DEFAULT_KELAS_LIST)

  const [message, setMessage] = useState(null)
  const searchDebounceRef = useRef(null)

  useEffect(() => {
    fetchCbtConfig()
    fetchWhitelistUsers()
    checkFrozenSessions()
    fetchActiveTahunAjaranClasses().then(({ classes }) => {
      if (classes && classes.length > 0) {
        setAvailableKelas(classes)
      }
    })
  }, [])

  // Live search debouncer for students/teachers
  useEffect(() => {
    if (!showAddModal || addType === 'kelas') {
      setSearchResults([])
      return
    }

    const queryTerm = (searchUserQuery || '').trim()
    if (!queryTerm || queryTerm.length < 1) {
      setSearchResults([])
      return
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearchingUser(true)
      try {
        const cleanTerm = queryTerm.replace(/[%]/g, '')
        if (addType === 'siswa') {
          // 1. Coba cari di view siswa_lengkap (memiliki nisn, nama_lengkap, kelas)
          const { data: lengkapData, error: errLengkap } = await supabase
            .from('siswa_lengkap')
            .select('nisn, nama_lengkap, kelas')
            .or(`nama_lengkap.ilike.%${cleanTerm}%,nisn.ilike.%${cleanTerm}%`)
            .order('nama_lengkap', { ascending: true })
            .limit(15)

          if (!errLengkap && lengkapData && lengkapData.length > 0) {
            setSearchResults(lengkapData.map(s => ({
              id: s.nisn,
              nisn: s.nisn,
              nama_lengkap: s.nama_lengkap,
              kelas: s.kelas || '-'
            })))
          } else {
            // 2. Fallback ke siswa_permanent jika siswa_lengkap kosong atau belum enroll
            const { data: permData, error: errPerm } = await supabase
              .from('siswa_permanent')
              .select('nisn, nama_lengkap')
              .or(`nama_lengkap.ilike.%${cleanTerm}%,nisn.ilike.%${cleanTerm}%`)
              .order('nama_lengkap', { ascending: true })
              .limit(15)

            if (!errPerm && permData) {
              setSearchResults(permData.map(s => ({
                id: s.nisn,
                nisn: s.nisn,
                nama_lengkap: s.nama_lengkap,
                kelas: '-'
              })))
            } else {
              setSearchResults([])
            }
          }
        } else if (addType === 'guru') {
          const { data, error } = await supabase
            .from('guru')
            .select('id, nama_guru, kode')
            .or(`nama_guru.ilike.%${cleanTerm}%,kode.ilike.%${cleanTerm}%`)
            .order('nama_guru', { ascending: true })
            .limit(15)

          if (!error && data) {
            setSearchResults(data)
          } else {
            setSearchResults([])
          }
        }
      } catch (err) {
        console.error('Gagal mencari user:', err)
        setSearchResults([])
      } finally {
        setIsSearchingUser(false)
      }
    }, 150)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchUserQuery, addType, showAddModal])

  const fetchCbtConfig = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('cbt_pengaturan')
        .select('is_cbt_active')
        .eq('id', 1)
        .single()
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching cbt_pengaturan:', error)
      } else if (data) {
        setIsCbtActive(data.is_cbt_active)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchWhitelistUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('cbt_whitelist_user')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setWhitelistUsers(data || [])
    } catch (err) {
      console.error('Error fetching whitelist:', err)
    }
  }

  const checkFrozenSessions = async () => {
    try {
      const { count, error } = await supabase
        .from('cbt_sesi_ujian')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'beku')

      if (!error) {
        setFrozenCount(count || 0)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleToggleMasterRelease = async () => {
    const nextState = !isCbtActive
    setSaving(true)
    setMessage(null)
    try {
      const { error } = await supabase
        .from('cbt_pengaturan')
        .upsert({ id: 1, is_cbt_active: nextState, updated_at: new Date().toISOString() })

      if (error) throw error

      setIsCbtActive(nextState)
      setMessage({
        type: 'success',
        text: nextState 
          ? 'Mode Rilis Publik Aktif: Seluruh siswa dan guru kini dapat mengakses CBT.' 
          : 'Mode Uji Coba Aktif: Akses CBT kini hanya dibatasi untuk akun whitelist penguji.'
      })
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal mengubah mode akses: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleGlobalFreeze = async () => {
    const confirmed = await requestConfirm({
      title: 'PERINGATAN DARURAT: Bekukan CBT?',
      message: 'Anda akan membekukan seluruh sesi ujian aktif di sekolah serentak. Timer seluruh siswa akan berhenti seketika.',
      confirmLabel: 'Bekukan Seluruh Sesi',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('cbt_freeze_all_active_sessions')
      if (error) throw error

      setMessage({ type: 'success', text: `Berhasil membekukan ${data?.frozen_sessions_count || 0} sesi ujian aktif.` })
      showToast(`Berhasil membekukan ${data?.frozen_sessions_count || 0} sesi ujian aktif.`, 'warning')
      checkFrozenSessions()
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal membekukan sesi: ' + err.message })
      showToast('Gagal membekukan sesi: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleGlobalUnfreeze = async () => {
    const confirmed = await requestConfirm({
      title: 'Lanjutkan Sesi yang Beku?',
      message: 'Lanjutkan seluruh sesi ujian yang sedang beku? Jam tutup sesi akan otomatis digeser sebesar durasi padam/beku.',
      confirmLabel: 'Lanjutkan Semua Sesi',
      confirmColor: 'emerald',
      icon: 'info'
    })
    if (!confirmed) return

    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('cbt_unfreeze_all_sessions')
      if (error) throw error

      setMessage({ type: 'success', text: `Berhasil melanjutkan ${data?.unfrozen_sessions_count || 0} sesi ujian. Jam tutup telah disesuaikan.` })
      showToast(`Berhasil melanjutkan ${data?.unfrozen_sessions_count || 0} sesi ujian. Jam tutup telah disesuaikan.`, 'success')
      checkFrozenSessions()
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal unfreeze sesi: ' + err.message })
      showToast('Gagal unfreeze sesi: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWhitelist = async (id) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Akun Penguji?',
      message: 'Hapus akun ini dari daftar penguji whitelist CBT?',
      confirmLabel: 'Ya, Hapus',
      confirmColor: 'red',
      icon: 'warning'
    })
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('cbt_whitelist_user')
        .delete()
        .eq('id', id)

      if (error) throw error
      setWhitelistUsers(prev => prev.filter(u => u.id !== id))
      showToast('Akun penguji berhasil dihapus dari whitelist.', 'success')
    } catch (err) {
      showToast('Gagal menghapus penguji: ' + err.message, 'error')
    }
  }

  const handleAddTester = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      if (addType === 'kelas') {
        const { data: siswaList, error: errSiswa } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap')
          .eq('kelas', selectedKelas)
          .eq('is_aktif', true)

        if (errSiswa) throw errSiswa
        if (!siswaList || siswaList.length === 0) {
          throw new Error(`Tidak ditemukan siswa aktif di kelas ${selectedKelas}`)
        }

        // Ambil daftar NISN yang sudah ada di whitelist agar tidak terjadi duplikasi
        const { data: existingWhitelist } = await supabase
          .from('cbt_whitelist_user')
          .select('nisn')
          .eq('role', 'siswa')
          .not('nisn', 'is', null)

        const existingNisns = new Set((existingWhitelist || []).map(w => String(w.nisn || '').trim()))

        // Filter hanya siswa yang belum terdaftar di whitelist
        const newSiswa = siswaList.filter(s => s.nisn && !existingNisns.has(String(s.nisn).trim()))

        if (newSiswa.length === 0) {
          showToast(`Seluruh siswa kelas ${selectedKelas} (${siswaList.length} siswa) sudah terdaftar di whitelist penguji.`, 'info')
          setShowAddModal(false)
          return
        }

        const rows = newSiswa.map(s => ({
          nisn: s.nisn,
          role: 'siswa',
          keterangan: `Simulasi Kelas ${selectedKelas} (${s.nama_lengkap})`
        }))

        const { error: errBatch } = await supabase
          .from('cbt_whitelist_user')
          .insert(rows)

        if (errBatch) throw errBatch
        const msgText = newSiswa.length === siswaList.length
          ? `Berhasil mendaftarkan seluruh siswa (${rows.length} siswa) kelas ${selectedKelas}.`
          : `Berhasil menambahkan ${rows.length} siswa baru kelas ${selectedKelas} (${siswaList.length - rows.length} siswa sudah ada sebelumnya).`

        setMessage({ type: 'success', text: msgText })
        showToast(msgText, 'success')
      } else if (addType === 'siswa') {
        if (!selectedUser?.nisn) throw new Error('Silakan cari dan pilih salah satu siswa dari hasil pencarian.')

        // Cek duplikasi
        const { data: existing } = await supabase
          .from('cbt_whitelist_user')
          .select('id')
          .eq('nisn', selectedUser.nisn)
          .eq('role', 'siswa')
          .maybeSingle()

        if (existing) {
          throw new Error(`Siswa ${selectedUser.nama_lengkap} sudah terdaftar di whitelist.`)
        }

        const { error } = await supabase
          .from('cbt_whitelist_user')
          .insert({
            nisn: selectedUser.nisn,
            role: 'siswa',
            keterangan: inputKeterangan.trim() || `${selectedUser.nama_lengkap} (Kelas ${selectedUser.kelas})`
          })
        if (error) throw error
        setMessage({ type: 'success', text: `Berhasil mendaftarkan siswa penguji: ${selectedUser.nama_lengkap}.` })
        showToast(`Berhasil mendaftarkan siswa penguji: ${selectedUser.nama_lengkap}.`, 'success')
      } else if (addType === 'guru') {
        if (!selectedUser?.id) throw new Error('Silakan cari dan pilih salah satu guru dari hasil pencarian.')

        // Cek duplikasi
        const { data: existing } = await supabase
          .from('cbt_whitelist_user')
          .select('id')
          .eq('user_id', selectedUser.id)
          .eq('role', 'guru')
          .maybeSingle()

        if (existing) {
          throw new Error(`Guru ${selectedUser.nama_guru} sudah terdaftar di whitelist.`)
        }

        const { error } = await supabase
          .from('cbt_whitelist_user')
          .insert({
            user_id: selectedUser.id,
            role: 'guru',
            keterangan: inputKeterangan.trim() || `Guru: ${selectedUser.nama_guru} (${selectedUser.kode || '-'})`
          })
        if (error) throw error
        setMessage({ type: 'success', text: `Berhasil mendaftarkan guru penguji: ${selectedUser.nama_guru}.` })
        showToast(`Berhasil mendaftarkan guru penguji: ${selectedUser.nama_guru}.`, 'success')
      }

      setShowAddModal(false)
      setSelectedUser(null)
      setSearchUserQuery('')
      setInputKeterangan('')
      fetchWhitelistUsers()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredWhitelist = whitelistUsers.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (!searchKeyword) return true
    const kw = searchKeyword.toLowerCase()
    return (
      (u.nisn && u.nisn.toLowerCase().includes(kw)) ||
      (u.keterangan && u.keterangan.toLowerCase().includes(kw)) ||
      (u.role && u.role.toLowerCase().includes(kw))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header Info Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                Pengaturan Akses CBT &amp; Pengujian
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola hak akses pengujian whitelist, saklar rilis publik, dan mitigasi darurat sekolah.
              </p>
            </div>
          </div>
        </div>

        {/* Master Release Switch */}
        <div className="flex items-center gap-3.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-800">
              {isCbtActive ? 'Rilis Publik (Terbuka)' : 'Uji Coba (Whitelist Only)'}
            </div>
            <div className="text-[11px] text-slate-500">
              {isCbtActive ? 'Seluruh siswa dan guru dapat akses' : 'Hanya akun penguji terdaftar'}
            </div>
          </div>
          <button
            onClick={handleToggleMasterRelease}
            disabled={saving || loading}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isCbtActive ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                isCbtActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-semibold border flex items-center justify-between ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs underline opacity-80 hover:opacity-100">Tutup</button>
        </div>
      )}

      {/* Grid: Global Freeze Emergency & Whitelist Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Panel Kiri: Darurat & Status Jaringan */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Tombol Darurat (Global Freeze)
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Jika terjadi listrik padam total atau gangguan jaringan Wi-Fi sekolah saat ujian berlangsung, gunakan tombol ini untuk membekukan sisa waktu seluruh siswa serentak.
            </p>

            {frozenCount > 0 ? (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                <div className="text-xs font-bold text-amber-800">
                  Status: {frozenCount} Sesi Sedang Dibekukan
                </div>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Timer pengerjaan siswa berhenti. Klik lanjutkan setelah jaringan stabil.
                </p>
                <button
                  onClick={handleGlobalUnfreeze}
                  disabled={saving}
                  className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Lanjutkan Seluruh Ujian (Unfreeze)</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleGlobalFreeze}
                disabled={saving}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Bekukan Seluruh Sesi Ujian Aktif</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Petunjuk Mode Akses
              </h4>
            </div>
            <div className="text-xs text-slate-500 space-y-2 leading-relaxed">
              <p>
                <strong className="text-slate-700">Mode Whitelist Only:</strong> Digunakan saat Anda atau guru sedang menyiapkan bank soal, menyetel jadwal simulasi, atau gladi bersih bersama 1 kelas percontohan.
              </p>
              <p>
                <strong className="text-slate-700">Mode Rilis Publik:</strong> Diaktifkan ketika seluruh guru dan siswa resmi menggunakan aplikasi untuk Ulangan Harian, Asesmen Sumatif, STS, atau SAS.
              </p>
            </div>
          </div>
        </div>

        {/* Panel Kanan: Tabel Whitelist User */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Daftar Penguji CBT Terpilih (Whitelist)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Akun berikut dapat melihat dan mencoba menu CBT meskipun mode publik masih ditutup.
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedUser(null)
                  setSearchUserQuery('')
                  setSearchResults([])
                  setInputKeterangan('')
                  setShowAddModal(true)
                }}
                className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Tambah Penguji</span>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
                <button
                  onClick={() => setFilterRole('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterRole === 'all' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Semua ({whitelistUsers.length})
                </button>
                <button
                  onClick={() => setFilterRole('siswa')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterRole === 'siswa' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Siswa ({whitelistUsers.filter(u => u.role === 'siswa').length})
                </button>
                <button
                  onClick={() => setFilterRole('guru')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterRole === 'guru' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Guru ({whitelistUsers.filter(u => u.role === 'guru').length})
                </button>
              </div>

              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Cari NISN atau nama penguji..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full text-xs px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Table Whitelist */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-4">ROLE</th>
                      <th className="py-2.5 px-4">IDENTITAS / NISN</th>
                      <th className="py-2.5 px-4">KETERANGAN</th>
                      <th className="py-2.5 px-4 text-right">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWhitelist.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          Belum ada akun penguji yang didaftarkan.
                        </td>
                      </tr>
                    ) : (
                      filteredWhitelist.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              u.role === 'guru' 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {u.nisn || (u.user_id ? `${u.user_id.slice(0, 8)}...` : '-')}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {u.keterangan || '-'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDeleteWhitelist(u.id)}
                              className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-bold transition-colors"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Tambah Penguji dengan Pencarian Autocomplete Nama */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">
                Tambah Akun Penguji CBT
              </h3>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddTester} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Kategori Penguji:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddType('siswa')
                      setSelectedUser(null)
                      setSearchUserQuery('')
                      setSearchResults([])
                    }}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${addType === 'siswa' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    1 Siswa (Cari Nama)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddType('kelas')
                      setSelectedUser(null)
                      setSearchUserQuery('')
                      setSearchResults([])
                    }}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${addType === 'kelas' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    1 Kelas Penuh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddType('guru')
                      setSelectedUser(null)
                      setSearchUserQuery('')
                      setSearchResults([])
                    }}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all ${addType === 'guru' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Akun Guru
                  </button>
                </div>
              </div>

              {/* Mode: 1 Kelas Penuh */}
              {addType === 'kelas' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Kelas Simulasi:
                  </label>
                  <select
                    value={selectedKelas}
                    onChange={(e) => setSelectedKelas(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700"
                  >
                    {availableKelas.map(k => (
                      <option key={k} value={k}>Kelas {k}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Semua siswa aktif di kelas ini akan otomatis didaftarkan sebagai penguji ujian CBT.
                  </p>
                </div>
              )}

              {/* Mode: Siswa atau Guru dengan Autocomplete Live Search */}
              {(addType === 'siswa' || addType === 'guru') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {addType === 'siswa' ? 'Ketik Nama Siswa atau NISN:' : 'Ketik Nama Guru:'}
                  </label>

                  {selectedUser ? (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-200 text-indigo-800 font-bold flex items-center justify-center text-xs shrink-0">
                          {addType === 'siswa' ? selectedUser.nama_lengkap?.charAt(0) : selectedUser.nama_guru?.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            {addType === 'siswa' ? selectedUser.nama_lengkap : selectedUser.nama_guru}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {addType === 'siswa' ? `Kelas ${selectedUser.kelas} • NISN: ${selectedUser.nisn}` : `Kode Guru: ${selectedUser.kode || '-'}`}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(null)
                          setSearchUserQuery('')
                        }}
                        className="px-2 py-1 text-xs text-rose-600 font-bold hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        placeholder={addType === 'siswa' ? 'Ketik nama siswa (contoh: Budi, Cindy)...' : 'Ketik nama guru...'}
                        value={searchUserQuery}
                        onChange={(e) => setSearchUserQuery(e.target.value)}
                        className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      {isSearchingUser && (
                        <div className="absolute right-3 top-2.5 text-[10px] text-slate-400">
                          Mencari...
                        </div>
                      )}

                      {/* Dropdown Live Results */}
                      {searchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto z-20 divide-y divide-slate-100">
                          {searchResults.map(item => (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedUser(item)
                                setSearchResults([])
                              }}
                              className="p-2.5 hover:bg-indigo-50/70 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                                  {addType === 'siswa' ? item.nama_lengkap?.charAt(0) : item.nama_guru?.charAt(0)}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-800">
                                    {addType === 'siswa' ? item.nama_lengkap : item.nama_guru}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {addType === 'siswa' ? `NISN: ${item.nisn}` : `Kode: ${item.kode || '-'}`}
                                  </div>
                                </div>
                              </div>
                              {addType === 'siswa' && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                                  Kelas {item.kelas}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {searchUserQuery.trim().length >= 1 && !isSearchingUser && searchResults.length === 0 && (
                        <div className="mt-1.5 text-[11px] text-slate-400 italic">
                          Tidak ditemukan {addType === 'siswa' ? 'siswa' : 'guru'} dengan nama tersebut.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {addType !== 'kelas' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Keterangan Tambahan (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Penguji Gelombang 1 / Panitia"
                    value={inputKeterangan}
                    onChange={(e) => setInputKeterangan(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || (addType !== 'kelas' && !selectedUser)}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Penguji'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Professional Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Professional Toast Notification */}
      {ToastComponent}
    </div>
  )
}
