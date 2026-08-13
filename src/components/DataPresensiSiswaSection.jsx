import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

export default function DataPresensiSiswaSection({ session, activeTa, isFullScreen, toggleFullScreen }) {
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString('en-CA'))
  const [semuaKelas, setSemuaKelas] = useState([])
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [presensiHariIni, setPresensiHariIni] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [selectedKelas, setSelectedKelas] = useState('Semua Siswa')
  const [studentsInClass, setStudentsInClass] = useState([])
  const [presensiData, setPresensiData] = useState({})
  const [searchDetail, setSearchDetail] = useState('')
  
  const [sesiAktif, setSesiAktif] = useState(false)
  const [linkGrupGuru, setLinkGrupGuru] = useState('')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [tempLinkGrup, setTempLinkGrup] = useState('')
  const [jadwalOtomatisAktif, setJadwalOtomatisAktif] = useState(false)
  const [jamMulaiPresensi, setJamMulaiPresensi] = useState('')
  const [hariAktifPresensi, setHariAktifPresensi] = useState('1,2,3,4,5')
  const [jamBatasPulang, setJamBatasPulang] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [activeTipe, setActiveTipe] = useState('masuk') // 'masuk' | 'pulang'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'H' | 'T' | 'S' | 'I' | 'A' | 'belum'
  const manualEndedRef = React.useRef({})

  const waliClassesForActiveTa = React.useMemo(() => {
    if (!session?.kelas || session.kelas.length === 0) return []
    if (activeTa?.id) {
      const filtered = session.kelas.filter(k => k.tahun_ajaran_id == activeTa.id)
      if (filtered.length > 0) return filtered.map(k => k.kelas).filter(Boolean)
    }
    return session.kelas.map(k => k.kelas).filter(Boolean)
  }, [session, activeTa])

  const isWaliOnly = React.useMemo(() => {
    if (waliClassesForActiveTa.length === 0) return false
    const roleStr = String(session.role || session.app_role || '').toLowerCase()
    if (roleStr.includes('admin') || roleStr.includes('superadmin')) return false

    const hasAdminOrPiketRole = session.roles?.some(r => {
      const n = String(r.nama || r || '').toLowerCase()
      return n.includes('admin') || n.includes('superadmin') || n.includes('piket') || n.includes('tata usaha')
    })

    return !hasAdminOrPiketRole
  }, [session, waliClassesForActiveTa])

  const isEditLocked = React.useMemo(() => {
    const hasRecord = presensiHariIni.some(r => r.tipe === activeTipe || (!r.tipe && activeTipe === 'masuk'))
    return !sesiAktif && hasRecord && !isUnlocked
  }, [sesiAktif, presensiHariIni, isUnlocked, activeTipe])

  const isRowLocked = React.useCallback((nisn, tipe) => {
    const t = tipe || activeTipe
    const pd = presensiData[nisn]?.[t]
    const isQrOrMandiri = pd?.metode === 'qr_scan' || pd?.metode === 'manual_piket'
    
    // Jika kunci dibuka secara manual (PIN terverifikasi) -> Semua bebas diedit
    if (isUnlocked) return false
    
    // Presensi QR / Mandiri selalu terkunci jika belum dimasukkan PIN
    if (isQrOrMandiri) return true
    
    // Jika sesi presensi sudah ditutup (tidak aktif)
    if (!sesiAktif) {
      // Jika sudah terisi -> Terkunci
      // Jika belum terisi -> Bisa diisi (setelah diisi otomatis terkunci)
      return !!pd?.status
    }
    
    // Jika sesi aktif, entri manual bebas diubah
    return false
  }, [isUnlocked, sesiAktif, presensiData, activeTipe])

  const [isSaving, setIsSaving] = useState(false)
  const [sendingLineNisn, setSendingLineNisn] = useState(null)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const handleKirimNotifLineSiswa = async (student) => {
    const pd = presensiData[student.nisn]?.[activeTipe]
    if (!pd || !pd.status) {
      alert(`Siswa ${student.nama_lengkap} belum memiliki status presensi ${activeTipe} hari ini.`)
      return
    }

    const rec = presensiHariIni.find(r => r.siswa_nisn === student.nisn && r.tipe === activeTipe)
    const jamStr = pd.time || rec?.waktu || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

    setSendingLineNisn(student.nisn)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(`${supabaseUrl}/functions/v1/line-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          nisn: student.nisn,
          nama: student.nama_lengkap,
          kelas: student.kelas || selectedKelas || '-',
          status: pd.status,
          waktu: jamStr,
          tipe: activeTipe,
          fotoUrl: pd.selfie_url || rec?.selfie_url || null,
          keterangan: rec?.keterangan || '-'
        }),
      })

      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        alert(`✅ Notifikasi LINE (${activeTipe.toUpperCase()}) berhasil dikirimkan ke HP orang tua dari ${student.nama_lengkap}!`)
      } else {
        alert(`⚠️ Gagal mengirim notifikasi LINE: ${data?.reason || data?.error || 'Tidak ada penautan LINE aktif atau token belum diset.'}`)
      }
    } catch (err) {
      alert(`❌ Terjadi kesalahan saat mengirim notifikasi LINE: ${err.message}`)
    } finally {
      setSendingLineNisn(null)
    }
  }

  useEffect(() => {
    fetchDashboardData()
    setIsUnlocked(false)
  }, [tanggal, activeTa?.id])

  const latestFetchRef = React.useRef(null)
  React.useEffect(() => {
    latestFetchRef.current = fetchDashboardData
  })

  useEffect(() => {
    const channel = supabase.channel(`realtime_presensi_harian_${tanggal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian' }, (payload) => {
        const record = payload.new || payload.old
        if (record && record.tanggal === tanggal) {
          latestFetchRef.current?.(true)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tanggal])

  // Fast-poll fallback (4s) to guarantee updates if websocket experiences RLS or channel errors
  useEffect(() => {
    const poll = setInterval(() => {
      latestFetchRef.current?.(true)
    }, 4000)
    return () => clearInterval(poll)
  }, [tanggal])

  const isHariAktifHariIni = React.useMemo(() => {
    if (!jadwalOtomatisAktif) return true
    const dateObj = new Date(tanggal)
    const dow = dateObj.getDay()
    const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
    return activeDays.includes(dow)
  }, [tanggal, jadwalOtomatisAktif, hariAktifPresensi])

  const isSebelumMulai = React.useMemo(() => {
    if (!jadwalOtomatisAktif || !jamMulaiPresensi) return false
    const dateObj = new Date(tanggal)
    const dow = dateObj.getDay()
    const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
    if (!activeDays.includes(dow)) return false

    const todayStr = new Date().toLocaleDateString('en-CA')
    if (tanggal !== todayStr) return false

    const [mh, mm] = jamMulaiPresensi.split(':').map(Number)
    const now = new Date()
    const [nh, nm] = [now.getHours(), now.getMinutes()]
    return nh < mh || (nh === mh && nm < mm)
  }, [tanggal, jadwalOtomatisAktif, jamMulaiPresensi, hariAktifPresensi])

  // Auto-start session when start time is reached on scheduled active days
  useEffect(() => {
    if (loading || sesiAktif || !jadwalOtomatisAktif || !jamMulaiPresensi) return

    const checkAndAutoStart = async () => {
      const todayDateStr = new Date().toLocaleDateString('en-CA')
      if (tanggal !== todayDateStr) return // Only auto-start for today's date

      // Jangan auto-start jika sesi hari ini sudah diakhiri/diselesaikan
      const isEnded = manualEndedRef.current[todayDateStr] || localStorage.getItem(`sesi_selesai_${todayDateStr}`) === 'true'
      if (isEnded) return

      const todayDow = new Date().getDay()
      const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
      if (!activeDays.includes(todayDow)) return

      const [mh, mm] = jamMulaiPresensi.split(':').map(Number)
      const now = new Date()
      const [nh, nm] = [now.getHours(), now.getMinutes()]
      const timeHasArrived = nh > mh || (nh === mh && nm >= mm)

      // Only auto-start if we haven't crossed the end time yet
      let timeIsOver = false
      if (jamBatasPulang) {
        const [bh, bm] = jamBatasPulang.split(':').map(Number)
        timeIsOver = nh > bh || (nh === bh && nm >= bm)
      }

      if (timeHasArrived && !timeIsOver) {
        console.log('Jadwal otomatis aktif: Memulai sesi presensi hari ini...')
        const { error } = await supabase
          .from('sesi_presensi')
          .insert({ tanggal: todayDateStr, dibuka_oleh: session?.id })
        if (!error) {
          setSesiAktif(true)
          try {
            await supabase.functions.invoke('presensi-reminder', {
              body: { action: 'session_started' }
            })
          } catch (err) {
            console.warn('Gagal mengirim notif sesi dimulai:', err)
          }
        }
      }
    }

    checkAndAutoStart()
    const interval = setInterval(checkAndAutoStart, 10000)
    return () => clearInterval(interval)
  }, [loading, sesiAktif, jadwalOtomatisAktif, jamMulaiPresensi, jamBatasPulang, hariAktifPresensi, tanggal, session?.id])

  // Auto-end session when jam_batas_pulang is reached
  useEffect(() => {
    if (loading || !sesiAktif || !jadwalOtomatisAktif || !jamBatasPulang) return

    const checkAndAutoEnd = async () => {
      const todayDateStr = new Date().toLocaleDateString('en-CA')
      if (tanggal !== todayDateStr) return

      const todayDow = new Date().getDay()
      const activeDays = (hariAktifPresensi || '1,2,3,4,5').split(',').map(Number)
      if (!activeDays.includes(todayDow)) return

      const [bh, bm] = jamBatasPulang.split(':').map(Number)
      const now = new Date()
      const [nh, nm] = [now.getHours(), now.getMinutes()]
      const timeHasPassed = nh > bh || (nh === bh && nm >= bm)

      if (timeHasPassed) {
        console.log('Jadwal otomatis aktif: Waktu batas pulang tercapai. Mengakhiri sesi presensi otomatis...')
        const { error } = await supabase.from('sesi_presensi').delete().eq('tanggal', todayDateStr)
        if (!error) {
          manualEndedRef.current[todayDateStr] = true
          localStorage.setItem(`sesi_selesai_${todayDateStr}`, 'true')
          setSesiAktif(false)
        }
      }
    }

    checkAndAutoEnd()
    const interval = setInterval(checkAndAutoEnd, 10000)
    return () => clearInterval(interval)
  }, [loading, sesiAktif, jadwalOtomatisAktif, jamBatasPulang, hariAktifPresensi, tanggal, session?.id])

  const lastFiltersRef = React.useRef({
    activeTaId: null,
    siswaData: []
  })

  const fetchDashboardData = async (isRealtime = false) => {
    if (!isRealtime) setLoading(true)
    try {
      const activeTaId = activeTa?.id
      const filtersChanged = 
        lastFiltersRef.current.activeTaId !== activeTaId ||
        lastFiltersRef.current.siswaData.length === 0

      let siswaData = []
      if (filtersChanged) {
        let query = supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas, tahun_ajaran_id')
          .eq('is_aktif', true)
        
        if (activeTaId) {
          query = query.eq('tahun_ajaran_id', activeTaId)
        }

        const { data } = await query.order('nama_lengkap')
        
        siswaData = data || []
        
        lastFiltersRef.current = {
          activeTaId,
          siswaData
        }
      } else {
        siswaData = lastFiltersRef.current.siswaData
      }

      const waliClasses = isWaliOnly ? waliClassesForActiveTa : null
      const displaySiswa = waliClasses ? siswaData.filter(s => waliClasses.includes(s.kelas)) : siswaData

      if (displaySiswa.length > 0) {
        setSemuaSiswa(displaySiswa)
        const uniqueClasses = [...new Set(displaySiswa.map(s => s.kelas).filter(Boolean))].sort()
        
        if (waliClasses && waliClasses.length > 0) {
          setSemuaKelas(uniqueClasses)
          if (!selectedKelas || selectedKelas === 'Semua Siswa' || !uniqueClasses.includes(selectedKelas)) {
            setSelectedKelas(uniqueClasses[0])
          }
        } else {
          setSemuaKelas(['Semua Siswa', ...uniqueClasses])
        }
        
        if (!isRealtime && (studentsInClass.length === 0 || waliClasses)) {
          const currentK = (selectedKelas && uniqueClasses.includes(selectedKelas)) ? selectedKelas : uniqueClasses[0]
          const targetKName = (waliClasses || currentK === 'Semua Siswa') ? (waliClasses ? currentK : null) : currentK
          const initialStudents = targetKName ? displaySiswa.filter(s => s.kelas === targetKName) : displaySiswa
          setStudentsInClass(initialStudents)
        }
      }

      const { data: sesiData } = await supabase
        .from('sesi_presensi')
        .select('*')
        .eq('tanggal', tanggal)
        .maybeSingle()
      setSesiAktif(!!sesiData)

      const { data: pengDataList } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_key, setting_value')
        .in('setting_key', ['link_grup_guru', 'jadwal_otomatis_aktif', 'jam_mulai_presensi', 'hari_aktif_presensi', 'jam_batas_pulang', `sesi_selesai_${tanggal}`])
      if (pengDataList) {
        const map = {}
        pengDataList.forEach(p => { map[p.setting_key] = p.setting_value })
        if (map[`sesi_selesai_${tanggal}`] === 'true') {
          manualEndedRef.current[tanggal] = true
          localStorage.setItem(`sesi_selesai_${tanggal}`, 'true')
        }
        if (map['link_grup_guru'] !== undefined && !isRealtime) {
          setLinkGrupGuru(map['link_grup_guru'] || '')
          setTempLinkGrup(map['link_grup_guru'] || '')
        }
        if (map['jadwal_otomatis_aktif'] !== undefined) {
          setJadwalOtomatisAktif(map['jadwal_otomatis_aktif'] === 'true')
        }
        if (map['jam_mulai_presensi'] !== undefined) {
          setJamMulaiPresensi(map['jam_mulai_presensi'])
        }
        if (map['hari_aktif_presensi'] !== undefined) {
          setHariAktifPresensi(map['hari_aktif_presensi'])
        }
        if (map['jam_batas_pulang'] !== undefined) {
          setJamBatasPulang(map['jam_batas_pulang'])
        }
      }

      const { data: presensiDataDB } = await supabase
        .from('presensi_harian')
        .select('*')
        .eq('tanggal', tanggal)
      
      if (presensiDataDB) {
        setPresensiHariIni(presensiDataDB)
        
        // Sync presensiData (state form) jika sedang membuka kelas
        if (selectedKelas && siswaData) {
          const targetKelas = selectedKelas === 'Semua Siswa' ? null : selectedKelas;
          const classStudents = targetKelas ? siswaData.filter(s => s.kelas === targetKelas) : siswaData;
          setPresensiData(prev => {
            const newData = isRealtime ? { ...prev } : {}
            classStudents.forEach(s => {
              const masukRec = presensiDataDB.find(r => r.siswa_nisn === s.nisn && (!r.tipe || r.tipe === 'masuk'))
              const pulangRec = presensiDataDB.find(r => r.siswa_nisn === s.nisn && r.tipe === 'pulang')
              
              if (!newData[s.nisn]) {
                newData[s.nisn] = { masuk: null, pulang: null }
              } else {
                // Ensure structural integrity
                newData[s.nisn] = {
                  masuk: newData[s.nisn].masuk || null,
                  pulang: newData[s.nisn].pulang || null
                }
              }
              
              if (masukRec) {
                if (!isRealtime || masukRec.metode === 'qr_scan' || !newData[s.nisn].masuk) {
                  newData[s.nisn].masuk = { status: masukRec.status, time: masukRec.waktu || null, metode: masukRec.metode }
                }
              } else if (!isRealtime) {
                newData[s.nisn].masuk = null
              }

              if (pulangRec) {
                if (!isRealtime || pulangRec.metode === 'qr_scan' || !newData[s.nisn].pulang) {
                  newData[s.nisn].pulang = { status: pulangRec.status, time: pulangRec.waktu || null, metode: pulangRec.metode }
                }
              } else if (!isRealtime) {
                newData[s.nisn].pulang = null
              }
            })
            return newData
          })
        }
      }

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadKelasDetail = async (kelasName) => {
    setSelectedKelas(kelasName)
    setSearchDetail('')
    setStatusFilter('all')
    
    const targetKelas = kelasName === 'Semua Siswa' ? null : kelasName;
    const classStudents = targetKelas ? semuaSiswa.filter(s => s.kelas === targetKelas) : semuaSiswa;
      
    if (classStudents) {
      setStudentsInClass(classStudents)
      const dataMap = {}
      classStudents.forEach(s => {
        const masukRec = presensiHariIni.find(r => r.siswa_nisn === s.nisn && (!r.tipe || r.tipe === 'masuk'))
        const pulangRec = presensiHariIni.find(r => r.siswa_nisn === s.nisn && r.tipe === 'pulang')
        dataMap[s.nisn] = {
          masuk: masukRec ? { status: masukRec.status, time: masukRec.waktu || null, metode: masukRec.metode } : null,
          pulang: pulangRec ? { status: pulangRec.status, time: pulangRec.waktu || null, metode: pulangRec.metode } : null
        }
      })
      setPresensiData(dataMap)
    }
  }

  const handleRequestUnlock = async () => {
    try {
      const { data: codeSetting, error: getErr } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'kode_pembatalan_presensi')
        .maybeSingle()

      if (getErr) throw getErr

      const expectedCode = codeSetting?.setting_value || '123456'
      
      const pinInput = window.prompt('Masukkan KODE VERIFIKASI ADMIN untuk membuka kunci edit presensi:')
      if (pinInput === null) return false

      if (pinInput !== expectedCode) {
        alert('Kode verifikasi salah! Akses edit ditolak.')
        return false
      }

      setIsUnlocked(true)
      alert('🔓 Akses edit berhasil dibuka secara manual!')
      return true
    } catch (err) {
      console.error(err)
      alert('Gagal memverifikasi kode: ' + err.message)
      return false
    }
  }

  const handleStatusChange = async (nisn, status) => {
    const tipe = activeTipe
    if (isRowLocked(nisn, tipe)) {
      const unlocked = await handleRequestUnlock()
      if (!unlocked) return
    }
    const currentMetode = presensiData[nisn]?.[tipe]?.metode
    if ((currentMetode === 'qr_scan' || currentMetode === 'manual_piket') && !isUnlocked) {
      alert('Presensi QR Code / Mandiri Siswa tidak dapat diubah manual. Silakan buka kunci edit terlebih dahulu.')
      return
    }

    const isTogglingOff = presensiData[nisn]?.[tipe]?.status === status;
    
    if (isTogglingOff) {
      setPresensiData(prev => {
        const newData = { ...prev }
        if (newData[nisn]) {
          newData[nisn][tipe] = null
        }
        return newData
      })
      try {
        setIsSaving(true)
        const { error } = await supabase.from('presensi_harian')
          .delete()
          .eq('tanggal', tanggal)
          .eq('siswa_nisn', nisn)
          .eq('tipe', tipe)
        if (error) throw error
      } catch (e) {
        console.error(e)
        alert('Gagal membatalkan: ' + e.message)
      } finally {
        setIsSaving(false)
      }
      return
    }

    const now = new Date().toTimeString().slice(0, 5)
    const newTime = (status === 'T' || status === 'P' || status === 'S' || status === 'I') 
      ? (presensiData[nisn]?.[tipe]?.time || now) 
      : null
    
    setPresensiData(prev => {
      const newData = { ...prev }
      if (!newData[nisn]) {
        newData[nisn] = { masuk: null, pulang: null }
      }
      newData[nisn][tipe] = { status, time: newTime, metode: 'manual' }
      return newData
    })

    // Autosave
    try {
      setIsSaving(true)
      const stdObj = semuaSiswa.find(s => s.nisn === nisn)
      const actualKelas = (stdObj?.kelas && !stdObj.kelas.toLowerCase().includes('semua')) 
        ? stdObj.kelas 
        : (selectedKelas && !selectedKelas.toLowerCase().includes('semua') ? selectedKelas : '-')

      const record = {
        tanggal,
        tahun_ajaran_id: activeTa?.id || null,
        kelas: actualKelas,
        siswa_nisn: nisn,
        status,
        waktu: newTime,
        metode: 'manual',
        tipe,
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn,tipe' })
      if (error) throw error
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan presensi otomatis: ' + e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTimeChange = async (nisn, time) => {
    const tipe = activeTipe
    if (isRowLocked(nisn, tipe)) {
      const unlocked = await handleRequestUnlock()
      if (!unlocked) return
    }
    const currentMetode = presensiData[nisn]?.[tipe]?.metode
    if ((currentMetode === 'qr_scan' || currentMetode === 'manual_piket') && !isUnlocked) {
      alert('Presensi QR Code / Mandiri Siswa tidak dapat diubah manual. Silakan buka kunci edit terlebih dahulu.')
      return
    }

    setPresensiData(prev => {
      const newData = { ...prev }
      if (newData[nisn] && newData[nisn][tipe]) {
        newData[nisn][tipe] = { ...newData[nisn][tipe], time }
      }
      return newData
    })

    // Autosave
    try {
      setIsSaving(true)
      const pd = presensiData[nisn]?.[tipe]
      if (!pd) return
      const stdObj = semuaSiswa.find(s => s.nisn === nisn)
      const actualKelas = (stdObj?.kelas && !stdObj.kelas.toLowerCase().includes('semua')) 
        ? stdObj.kelas 
        : (selectedKelas && !selectedKelas.toLowerCase().includes('semua') ? selectedKelas : '-')

      const record = {
        tanggal,
        tahun_ajaran_id: activeTa?.id || null,
        kelas: actualKelas,
        siswa_nisn: nisn,
        status: pd.status,
        waktu: time,
        metode: 'manual',
        tipe,
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn,tipe' })
      if (error) throw error
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan perubahan waktu otomatis: ' + e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleBulkPresensi = async (status) => {
    const tipe = activeTipe
    const confirmed = await requestConfirm({
      title: 'Set Status Semua Siswa?',
      message: `Set semua siswa yang tampil menjadi ${status === 'kosong' ? 'KOSONG (hapus presensi)' : status}?`,
      confirmLabel: status === 'kosong' ? 'Kosongkan' : `Set ${status}`,
      confirmColor: status === 'kosong' ? 'red' : 'indigo',
      icon: status === 'kosong' ? 'danger' : 'warning',
    })
    if (!confirmed) return
    const newData = { ...presensiData }
    const recordsToUpsert = []
    const nisnsToDelete = []

    filteredStudents.forEach(s => {
      if (isRowLocked(s.nisn, tipe)) return // Lewati siswa yang barisnya terkunci
      if (status === 'kosong') {
        if (newData[s.nisn]) {
          newData[s.nisn][tipe] = null
        }
        nisnsToDelete.push(s.nisn)
      } else {
        if (!newData[s.nisn]) {
          newData[s.nisn] = { masuk: null, pulang: null }
        }
        newData[s.nisn][tipe] = { status, time: null, metode: 'manual' }
        const actualKelas = (s.kelas && !s.kelas.toLowerCase().includes('semua')) 
          ? s.kelas 
          : (selectedKelas && !selectedKelas.toLowerCase().includes('semua') ? selectedKelas : '-')

        recordsToUpsert.push({
          tanggal,
          tahun_ajaran_id: activeTa?.id || null,
          kelas: actualKelas,
          siswa_nisn: s.nisn,
          status,
          waktu: null,
          metode: 'manual',
          tipe,
          diinput_oleh: session.id,
          updated_at: new Date().toISOString()
        })
      }
    })
    setPresensiData(newData)

    // Autosave Massal
    try {
      setIsSaving(true)
      if (status === 'kosong' && nisnsToDelete.length > 0) {
        const { error } = await supabase.from('presensi_harian')
          .delete()
          .eq('tanggal', tanggal)
          .eq('tipe', tipe)
          .in('siswa_nisn', nisnsToDelete)
        if (error) throw error
      } else if (recordsToUpsert.length > 0) {
        const { error } = await supabase.from('presensi_harian').upsert(recordsToUpsert, { onConflict: 'tanggal,siswa_nisn,tipe' })
        if (error) throw error
      }
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan otomatis: ' + e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  }

  const handleMulaiSesi = async () => {
    setIsSaving(true)
    manualEndedRef.current[tanggal] = false
    try {
      localStorage.removeItem(`sesi_selesai_${tanggal}`)
      await supabase.from('pengaturan_sekolah').delete().eq('setting_key', `sesi_selesai_${tanggal}`)
    } catch (e) {
      console.warn('Gagal hapus status sesi selesai:', e)
    }

    const { error } = await supabase
      .from('sesi_presensi')
      .insert({ tanggal, dibuka_oleh: session.id })
    if (!error) {
      setSesiAktif(true)
      try {
        await supabase.functions.invoke('presensi-reminder', {
          body: { action: 'session_started' }
        })
      } catch (err) {
        console.warn('Gagal mengirim notif sesi dimulai:', err)
      }
    } else {
      alert('Gagal memulai sesi: ' + error.message)
    }
    setIsSaving(false)
  }

  const handleAkhiriSesi = async () => {
    const confirmed = await requestConfirm({
      title: 'Selesaikan Presensi Hari Ini',
      message: 'Apakah Anda yakin ingin menyelesaikan sesi presensi hari ini? Ini tidak menghapus data presensi yang sudah diinput, namun fitur presensi dan QR Scan siswa akan ditutup.',
      confirmLabel: 'Akhiri Sesi',
      confirmColor: 'red',
      icon: 'warning'
    })
    
    if (!confirmed) return;

    setIsSaving(true)
    manualEndedRef.current[tanggal] = true
    try {
      localStorage.setItem(`sesi_selesai_${tanggal}`, 'true')
      await supabase.from('pengaturan_sekolah').upsert({
        setting_key: `sesi_selesai_${tanggal}`,
        setting_value: 'true'
      }, { onConflict: 'setting_key' })
    } catch (e) {
      console.warn('Gagal simpan status sesi selesai:', e)
    }

    const { error } = await supabase.from('sesi_presensi').delete().eq('tanggal', tanggal)
    if (!error) {
      setSesiAktif(false)
    } else {
      alert('Gagal mengakhiri sesi: ' + error.message)
    }
    setIsSaving(false)
  }

  const handleBatalkanPresensi = async () => {
    try {
      const { data: codeSetting, error: getErr } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'kode_pembatalan_presensi')
        .maybeSingle()

      if (getErr) throw getErr

      const expectedCode = codeSetting?.setting_value || '123456'
      
      const pinInput = window.prompt('Masukkan KODE VERIFIKASI ADMIN untuk membatalkan seluruh presensi hari ini:')
      if (pinInput === null) return // Batal

      if (pinInput !== expectedCode) {
        alert('Kode verifikasi salah! Pembatalan ditolak.')
        return
      }

      const confirmed = window.confirm('🚨 PERINGATAN: Tindakan ini akan MENGHAPUS PERMANEN seluruh data presensi siswa hari ini. Apakah Anda yakin?')
      if (!confirmed) return

      setIsSaving(true)
      
      // Dapatkan daftar file selfie hari ini dari database sebelum menghapus
      const { data: recordsForToday } = await supabase.from('presensi_harian')
        .select('selfie_url')
        .eq('tanggal', tanggal)
      
      const filesToDelete = (recordsForToday || [])
        .map(r => r.selfie_url)
        .filter(Boolean)
        .map(url => {
          const urlParts = url.split('/')
          return urlParts[urlParts.length - 1].split('?')[0] // remove query parameters if any
        })

      // Hapus data presensi harian hari ini
      const { error: delPresensiErr } = await supabase
        .from('presensi_harian')
        .delete()
        .eq('tanggal', tanggal)
      
      if (delPresensiErr) throw delPresensiErr

      // Hapus file-file selfie dari storage jika ada
      if (filesToDelete.length > 0) {
        await supabase.storage.from('selfie-presensi').remove(filesToDelete)
      }

      // Hapus sesi presensi hari ini jika ada
      await supabase.from('sesi_presensi').delete().eq('tanggal', tanggal)

      alert('✅ Seluruh data presensi hari ini berhasil dibatalkan dan dihapus bersih!')
      await fetchDashboardData()
    } catch (err) {
      console.error(err)
      alert('Gagal membatalkan presensi: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    const { error } = await supabase
      .from('pengaturan_sekolah')
      .update({ setting_value: tempLinkGrup, updated_at: new Date().toISOString() })
      .eq('setting_key', 'link_grup_guru')
    if (!error) {
      setLinkGrupGuru(tempLinkGrup)
      setShowSettingsModal(false)
    } else {
      alert('Gagal menyimpan pengaturan: ' + error.message)
    }
    setIsSaving(false)
  }

  const generateWA = async (semua = false) => {
    let text = `*Laporan Presensi ${activeTipe === 'masuk' ? 'Masuk' : 'Pulang'} Siswa*\nTanggal: ${new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`
    
    const rawTargetClasses = semua ? semuaKelas : (selectedKelas ? [selectedKelas] : [])
    const targetClasses = rawTargetClasses.filter(c => c !== 'Semua Siswa')
    
    if (targetClasses.length === 0) {
      alert('Pilih kelas terlebih dahulu atau pilih laporan seluruh kelas.')
      return
    }

    // Ambil data akumulasi keterlambatan untuk tipe masuk
    const lateCounts = {}
    if (activeTipe === 'masuk' && activeTa?.id) {
      try {
        const { data: allLates, error } = await supabase
          .from('presensi_harian')
          .select('siswa_nisn')
          .eq('status', 'T')
          .eq('tahun_ajaran_id', activeTa.id)
        if (!error && allLates) {
          allLates.forEach(r => {
            lateCounts[r.siswa_nisn] = (lateCounts[r.siswa_nisn] || 0) + 1
          })
        }
      } catch (e) {
        console.error('Gagal mengambil histori keterlambatan:', e)
      }
    }

    targetClasses.forEach(kelas => {
      text += `*Kelas ${kelas}*\n`
      const classStudentsList = semuaSiswa.filter(s => s.kelas === kelas)
      
      const terlambat = []
      const tidakHadir = []
      const belumPresensi = []

      classStudentsList.forEach(s => {
        // Cari dari database hari ini
        const dbRec = presensiHariIni.find(r => r.siswa_nisn === s.nisn && r.tipe === activeTipe)
        
        let status = null
        if (dbRec) {
          status = dbRec.status
        } else if (selectedKelas === kelas || selectedKelas === 'Semua Siswa') {
          status = presensiData[s.nisn]?.[activeTipe]?.status
        }

        if (!status) {
          belumPresensi.push(s.nama_lengkap)
        } else {
          if (activeTipe === 'masuk') {
            if (status === 'T') {
              const count = lateCounts[s.nisn] || 1
              terlambat.push(`${s.nama_lengkap} (${count} kali terlambat)`)
            } else if (status === 'S') {
              tidakHadir.push(`${s.nama_lengkap} (Sakit)`)
            } else if (status === 'I') {
              tidakHadir.push(`${s.nama_lengkap} (Izin)`)
            } else if (status === 'A') {
              tidakHadir.push(`${s.nama_lengkap} (Alpha)`)
            }
          } else {
            // activeTipe === 'pulang'
            if (status === 'S') {
              tidakHadir.push(`${s.nama_lengkap} (Pulang Cepat - Sakit)`)
            } else if (status === 'I') {
              tidakHadir.push(`${s.nama_lengkap} (Pulang Cepat - Izin)`)
            } else if (status === 'A') {
              tidakHadir.push(`${s.nama_lengkap} (Alpha / Membolos)`)
            }
          }
        }
      })

      const hasIssues = terlambat.length > 0 || tidakHadir.length > 0 || belumPresensi.length > 0

      if (!hasIssues) {
        text += `Semua siswa hadir tanpa terlambat\n`
      } else {
        if (terlambat.length > 0) {
          text += `Terlambat:\n`
          terlambat.forEach(item => {
            text += `- ${item}\n`
          })
        }
        if (tidakHadir.length > 0) {
          text += `Tidak hadir:\n`
          tidakHadir.forEach(item => {
            text += `- ${item}\n`
          })
        }
        if (belumPresensi.length > 0) {
          text += `Belum mengisi presensi:\n`
          belumPresensi.forEach(item => {
            text += `- ${item}\n`
          })
        }
      }
      text += '\n'
    })

    navigator.clipboard.writeText(text).then(() => {
      if (linkGrupGuru) {
        window.open(linkGrupGuru, '_blank')
      } else {
        alert('Teks berhasil disalin ke clipboard! (Link Grup Guru belum diatur, silakan paste manual)')
      }
    }).catch(err => {
      alert('Gagal menyalin teks otomatis, beri izin clipboard pada browser Anda.')
      console.error(err)
    })
  }

  const statusCounts = React.useMemo(() => {
    const counts = { all: studentsInClass.length, H: 0, T: 0, S: 0, I: 0, A: 0, belum: 0 }
    studentsInClass.forEach(s => {
      const st = presensiData[s.nisn]?.[activeTipe]?.status
      if (!st) {
        counts.belum++
      } else if (counts[st] !== undefined) {
        counts[st]++
      } else if (st === 'P') {
        counts.H++
      }
    })
    return counts
  }, [studentsInClass, presensiData, activeTipe])

  const filteredStudents = React.useMemo(() => {
    return studentsInClass.filter(s => {
      const matchesSearch = s.nama_lengkap.toLowerCase().includes(searchDetail.toLowerCase()) || s.nisn.includes(searchDetail)
      if (!matchesSearch) return false

      const st = presensiData[s.nisn]?.[activeTipe]?.status
      if (statusFilter === 'all') return true
      if (statusFilter === 'belum') return !st
      if (statusFilter === 'H') return st === 'H' || st === 'P'
      return st === statusFilter
    })
  }, [studentsInClass, searchDetail, presensiData, activeTipe, statusFilter])

  if (loading && semuaKelas.length === 0) {
    return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  return (
    <div className="animate-fade-in font-sans text-slate-800 flex-1 flex flex-col min-h-0 h-full">
      {ConfirmModalComponent}
      
      {/* Top Header Removed, controls merged into Pilih Kelas section below */}

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Pengaturan WhatsApp Grup</h3>
              <p className="text-sm text-slate-500 mt-1">Atur link invite grup guru untuk laporan otomatis.</p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Link Invite Grup WhatsApp</label>
              <input 
                type="text" 
                placeholder="https://chat.whatsapp.com/..." 
                value={tempLinkGrup}
                onChange={e => setTempLinkGrup(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 font-medium"
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowSettingsModal(false)} className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
              <button onClick={handleSaveSettings} disabled={isSaving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-sm">{isSaving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Class Selection Area */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              <h3 className="font-bold text-slate-800 text-sm">Pilih Kelas</h3>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Settings button */}
              <button onClick={() => setShowSettingsModal(true)} className="p-2 text-slate-500 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-sm" title="Pengaturan Laporan WA">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </button>

              {/* Date Input */}
              <input 
                type="date" 
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
              />

              {/* Fullscreen Button */}
              {toggleFullScreen && (
                <button 
                  onClick={toggleFullScreen}
                  className="p-2.5 text-slate-500 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all duration-300 shadow-sm flex items-center justify-center" 
                  title={isFullScreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                >
                  {isFullScreen ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m12 0l-5-5m5 5v-4m0 4h-4"/></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"/></svg>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {semuaKelas.map(c => {
              const isSemua = c === 'Semua Siswa';
              const classTotalStudents = isSemua ? semuaSiswa.length : semuaSiswa.filter(s => s.kelas === c).length;
              const classReportedStudents = isSemua 
                ? presensiHariIni.filter(p => p.tipe === activeTipe || (!p.tipe && activeTipe === 'masuk')).length 
                : presensiHariIni.filter(p => p.kelas === c && (p.tipe === activeTipe || (!p.tipe && activeTipe === 'masuk'))).length;
              const percentage = classTotalStudents > 0 ? Math.round((classReportedStudents / classTotalStudents) * 100) : 0;
              const isSelected = selectedKelas === c;
              
              let statusColor = percentage === 0 ? 'rose' : (percentage < 100 ? 'orange' : 'emerald');

              return (
                <button
                  key={c}
                  onClick={() => loadKelasDetail(c)}
                  className={`relative shrink-0 px-4 py-2 rounded-xl border text-sm font-bold transition-all flex items-center gap-2 ${
                    isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {c}
                  <div className={`w-2 h-2 rounded-full bg-${statusColor}-500`}></div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail Area */}
        {selectedKelas ? (
          <div className="flex-1 flex flex-col min-h-0">
            {!sesiAktif && presensiHariIni.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50/50">
                {isHariAktifHariIni ? (
                  isSebelumMulai ? (
                    <>
                      <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-500 shadow-sm">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Presensi Belum Mulai</h3>
                      <p className="text-sm text-slate-500 mb-8 max-w-sm">Sesi presensi otomatis hari ini belum dimulai (dijadwalkan pukul <strong>{jamMulaiPresensi}</strong>). Namun, Anda tetap dapat memulainya secara manual.</p>
                      <button onClick={handleMulaiSesi} disabled={isSaving} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                        {isSaving ? (
                          <><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Memulai...</>
                        ) : (
                          <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Mulai Presensi Manual</>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-500 shadow-sm">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Sesi Presensi Belum Dimulai</h3>
                      <p className="text-sm text-slate-505 mb-8 max-w-sm">Anda harus memulai sesi hari ini terlebih dahulu agar siswa dapat melakukan scan QR, dan Anda dapat menginput presensi.</p>
                      <button onClick={handleMulaiSesi} disabled={isSaving} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                        {isSaving ? (
                          <><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Memulai...</>
                        ) : (
                          <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Mulai Presensi Hari Ini</>
                        )}
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <div className="w-20 h-20 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mb-6 text-amber-500 shadow-sm">
                      <span className="text-3xl select-none">🏖️</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Hari Bebas Presensi</h3>
                    <p className="text-sm text-slate-505 mb-2 max-w-md font-medium text-slate-600">Presensi otomatis tidak dijadwalkan untuk hari ini.</p>
                    <p className="text-xs text-slate-400 mb-8 max-w-sm">Jika diperlukan presensi khusus (misalnya kegiatan hari libur/ekskul), Anda tetap dapat memulai sesi secara manual.</p>
                    <button onClick={handleMulaiSesi} disabled={isSaving} className="px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                      {isSaving ? (
                        <><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Memulai...</>
                      ) : (
                        <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Mulai Presensi Manual</>
                      )}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
              {/* Tab Switcher */}
              <div className="px-4 sm:px-6 pt-4 shrink-0 flex justify-center sm:justify-start">
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setActiveTipe('masuk')
                    }}
                    className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                      activeTipe === 'masuk' 
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    🌅 Presensi Masuk (Pagi)
                  </button>
                  <button
                    onClick={() => {
                      setActiveTipe('pulang')
                    }}
                    className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                      activeTipe === 'pulang' 
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    🌇 Presensi Pulang (Sore)
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-b border-slate-100 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Presensi Kelas {selectedKelas} ({activeTipe === 'masuk' ? 'Masuk' : 'Pulang'})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Validasi kehadiran {studentsInClass.length} siswa hari ini.</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <input 
                    type="text" 
                    placeholder="Cari nama / NISN..." 
                    value={searchDetail}
                    onChange={e => setSearchDetail(e.target.value)}
                    className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64 bg-slate-50 text-slate-700"
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors ${isSaving ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                  {isSaving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      Autosave Aktif
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status Filter Pills Bar */}
            <div className="px-4 py-3 bg-slate-100/70 border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                Filter:
              </span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'all' 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Semua ({statusCounts.all})
              </button>
              <button
                onClick={() => setStatusFilter('H')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'H' 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Hadir ({statusCounts.H})
              </button>
              <button
                onClick={() => setStatusFilter('T')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'T' 
                    ? 'bg-orange-600 text-white border-orange-600 shadow-sm' 
                    : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Terlambat ({statusCounts.T})
              </button>
              <button
                onClick={() => setStatusFilter('S')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'S' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Sakit ({statusCounts.S})
              </button>
              <button
                onClick={() => setStatusFilter('I')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'I' 
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                Izin ({statusCounts.I})
              </button>
              <button
                onClick={() => setStatusFilter('A')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'A' 
                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm' 
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Alpa ({statusCounts.A})
              </button>
              <button
                onClick={() => setStatusFilter('belum')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                  statusFilter === 'belum' 
                    ? 'bg-slate-700 text-white border-slate-700 shadow-sm' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                Belum Presensi ({statusCounts.belum})
              </button>
            </div>
            
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Set Semua:</span>
                  {activeTipe === 'masuk' ? (
                    <>
                      <button onClick={() => handleBulkPresensi('H')} className="px-3 py-1.5 text-xs font-bold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors">Hadir</button>
                      <button onClick={() => handleBulkPresensi('T')} className="px-3 py-1.5 text-xs font-bold rounded bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors">Terlambat</button>
                      <button onClick={() => handleBulkPresensi('S')} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">Sakit</button>
                      <button onClick={() => handleBulkPresensi('I')} className="px-3 py-1.5 text-xs font-bold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors">Izin</button>
                      <button onClick={() => handleBulkPresensi('A')} className="px-3 py-1.5 text-xs font-bold rounded bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors">Alpa</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleBulkPresensi('P')} className="px-3 py-1.5 text-xs font-bold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors">Pulang</button>
                      <button onClick={() => handleBulkPresensi('S')} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">Sakit (Pulang Cepat)</button>
                      <button onClick={() => handleBulkPresensi('I')} className="px-3 py-1.5 text-xs font-bold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors">Izin (Pulang Cepat)</button>
                      <button onClick={() => handleBulkPresensi('A')} className="px-3 py-1.5 text-xs font-bold rounded bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors">Alpha / Bolos</button>
                    </>
                  )}
                </div>
                <button onClick={() => handleBulkPresensi('kosong')} className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  Kosongkan Presensi
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => generateWA(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 flex items-center gap-1.5 transition-colors shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Lapor Kelas Ini
                </button>
                <button onClick={() => generateWA(true)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white border border-green-700 hover:bg-green-700 flex items-center gap-1.5 transition-colors shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Lapor Semua Kelas
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                {sesiAktif ? (
                  <button onClick={handleAkhiriSesi} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1.5 transition-colors shadow-sm">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Selesaikan Presensi
                  </button>
                ) : (
                  <button onClick={handleMulaiSesi} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1.5 transition-colors shadow-sm">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                    Lanjutkan Sesi
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {!sesiAktif && (
                <div className={`p-4 mx-6 my-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                  isEditLocked 
                    ? 'bg-amber-50 border-amber-200 text-amber-800' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{isEditLocked ? '🔒' : '🔓'}</span>
                    <div>
                      <h4 className="font-bold text-sm">
                        {isEditLocked 
                          ? 'Sesi Presensi Hari Ini Telah Selesai (Terkunci)' 
                          : 'Akses Edit Dibuka (PIN Admin Terverifikasi)'}
                      </h4>
                      <p className="text-xs mt-0.5 opacity-90">
                        {isEditLocked 
                          ? 'Seluruh data presensi hari ini terkunci dari perubahan manual. Gunakan PIN Admin untuk membuka kunci.' 
                          : 'Anda dapat mengedit data presensi secara manual sekarang. Sesi presensi tetap dalam kondisi selesai.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {isEditLocked ? (
                      <>
                        <button
                          onClick={handleRequestUnlock}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h16.5a2.25 2.25 0 002.25-2.25V12.75A2.25 2.25 0 0020.25 10.5H3.75A2.25 2.25 0 001.5 12.75v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                          Buka Kunci Edit
                        </button>
                        <button
                          onClick={handleMulaiSesi}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
                        >
                          Lanjutkan Sesi
                        </button>
                        <button
                          onClick={handleBatalkanPresensi}
                          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs transition-all border border-rose-200"
                        >
                          Batalkan Presensi
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsUnlocked(false)}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
                        >
                          🔒 Kunci Kembali
                        </button>
                        <button
                          onClick={handleMulaiSesi}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
                        >
                          Lanjutkan Sesi
                        </button>
                        <button
                          onClick={handleBatalkanPresensi}
                          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs transition-all border border-rose-200"
                        >
                          Batalkan Presensi
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 text-slate-500 text-xs">
                  <tr>
                    <th className="px-6 py-4 font-semibold w-12 text-center">No</th>
                    <th className="px-6 py-4 font-semibold">Nama Siswa</th>
                    <th className="px-6 py-4 font-semibold">NISN</th>
                    <th className="px-6 py-4 font-semibold text-center">Status Kehadiran (Pilih)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredStudents.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-500 text-sm">Siswa tidak ditemukan.</td></tr>
                  ) : filteredStudents.map((s, idx) => (
                    <tr key={s.nisn} className="hover:bg-slate-50/50 bg-white transition-colors">
                      <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-indigo-100 relative shadow-sm">
                            <div className="absolute inset-0 flex items-center justify-center">
                              {getInitials(s.nama_lengkap)}
                            </div>
                            <img 
                              src={`https://res.cloudinary.com/dwyhpysp5/image/upload/c_fill,w_100,h_100/SKL-BM/FOTO_${s.nisn}_${activeTa?.id}`} 
                              alt={s.nama_lengkap}
                              className="w-full h-full object-cover relative z-10"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                          <span className="font-semibold text-slate-800">{s.nama_lengkap}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium text-xs">{s.nisn}</td>
                      
                      <td className="px-6 py-3">
                        <div className="flex justify-center relative">
                          <div className="flex items-center gap-2 w-[360px]">
                            {((activeTipe === 'masuk') ? ['H', 'T', 'S', 'I', 'A'] : ['P', 'S', 'I', 'A']).map(opt => {
                              const pd = presensiData[s.nisn]?.[activeTipe]
                              const isActive = pd?.status === opt;
                              const isLocked = isRowLocked(s.nisn, activeTipe)
                              const baseColors = {
                                'H': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
                                'T': 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
                                'S': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                                'I': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                                'A': 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
                                'P': 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                              }
                              const activeColors = {
                                'H': 'bg-emerald-600 text-white border-emerald-600',
                                'T': 'bg-orange-500 text-white border-orange-500',
                                'S': 'bg-blue-600 text-white border-blue-600',
                                'I': 'bg-purple-600 text-white border-purple-600',
                                'A': 'bg-rose-600 text-white border-rose-600',
                                'P': 'bg-slate-600 text-white border-slate-600'
                              }
                              return (
                                <button 
                                  key={opt}
                                  onClick={() => handleStatusChange(s.nisn, opt)}
                                  disabled={isLocked}
                                  className={`w-9 h-8 rounded-2xl text-sm font-bold transition-all border shrink-0 ${isActive ? activeColors[opt] : baseColors[opt]} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  {opt}
                                </button>
                              )
                            })}
                            {(() => {
                              const status = presensiData[s.nisn]?.[activeTipe]?.status
                              const showTimePicker = (activeTipe === 'masuk' && status === 'T') ||
                                                     (activeTipe === 'pulang' && (status === 'P' || status === 'S' || status === 'I'))
                              if (!showTimePicker) return null
                              return (
                                <input 
                                  type="time" 
                                  value={presensiData[s.nisn]?.[activeTipe]?.time || ''}
                                  onChange={(e) => handleTimeChange(s.nisn, e.target.value)}
                                  disabled={isRowLocked(s.nisn, activeTipe)}
                                  className="ml-2 px-2 py-1.5 text-xs border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-24 shrink-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                              )
                            })()}
                            {presensiData[s.nisn]?.[activeTipe]?.metode === 'qr_scan' && (
                              <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0" title="Discan oleh Siswa (QR Code)">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                                QR Scan
                              </div>
                            )}
                            {presensiData[s.nisn]?.[activeTipe]?.metode === 'manual_piket' && (
                              <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 shrink-0" title="Presensi Mandiri Siswa (Meja Piket)">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                Mandiri
                              </div>
                            )}
                            {(() => {
                              const rec = presensiHariIni.find(r => r.siswa_nisn === s.nisn && r.tipe === activeTipe)
                              const coords = rec?.keterangan
                              const isCoords = coords && /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/.test(coords)
                              if (isCoords) {
                                return (
                                  <a 
                                    href={`https://www.google.com/maps?q=${coords}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-2 flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded transition-colors shrink-0"
                                    title="Lihat lokasi presensi di Google Maps"
                                  >
                                    📍 Lokasi
                                  </a>
                                )
                              }
                              return null
                            })()}
                             {!presensiData[s.nisn]?.[activeTipe]?.status ? (
                              <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 shrink-0">
                                Belum Presensi
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleKirimNotifLineSiswa(s)}
                                disabled={sendingLineNisn === s.nisn}
                                className="ml-2 flex items-center gap-1 text-[10px] font-extrabold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-xl transition-all shrink-0 shadow-2xs active:scale-95 disabled:opacity-50"
                                title="Kirim ulang kartu notifikasi LINE ke HP Orang Tua siswa ini"
                              >
                                {sendingLineNisn === s.nisn ? (
                                  <span className="animate-pulse">Mengirim...</span>
                                ) : (
                                  <>
                                    <span>📱 Kirim LINE</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda Bawah */}
            <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50/50 rounded-b-2xl flex flex-wrap items-center justify-center gap-6 text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center">H</span> Hadir</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-orange-50 text-orange-600 flex items-center justify-center">T</span> Terlambat</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center">S</span> Sakit</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-purple-50 text-purple-600 flex items-center justify-center">I</span> Izin</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center">A</span> Alpha</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-slate-100 text-slate-600 flex items-center justify-center">P</span> Pulang</span>
            </div>
            </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-slate-500">
            <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Belum Ada Kelas yang Dipilih</h3>
            <p className="text-sm max-w-sm text-slate-500">Silakan pilih salah satu kelas dari daftar di atas untuk mulai melihat dan menginput data presensi siswa.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #94a3b8;
        }
      `}} />
    </div>
  )
}
