import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

export default function DataPresensiSiswaSection({ session, activeTa }) {
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

  const [isSaving, setIsSaving] = useState(false)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => {
    fetchDashboardData()
  }, [tanggal, activeTa])

  useEffect(() => {
    const channel = supabase.channel(`realtime_presensi_harian_${tanggal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian', filter: `tanggal=eq.${tanggal}` }, () => {
        fetchDashboardData(true)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tanggal])

  const fetchDashboardData = async (isRealtime = false) => {
    setLoading(true)
    try {
      const { data: siswaData } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)
        .order('nama_lengkap')

      if (siswaData) {
        setSemuaSiswa(siswaData)
        const uniqueClasses = [...new Set(siswaData.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelas(['Semua Siswa', ...uniqueClasses])
        
        if (!isRealtime && studentsInClass.length === 0) {
          setStudentsInClass(siswaData)
        }
      }

      const { data: sesiData } = await supabase
        .from('sesi_presensi')
        .select('*')
        .eq('tanggal', tanggal)
        .maybeSingle()
      setSesiAktif(!!sesiData)

      const { data: pengData } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'link_grup_guru')
        .maybeSingle()
      if (pengData && !isRealtime) {
        setLinkGrupGuru(pengData.setting_value)
        setTempLinkGrup(pengData.setting_value)
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
              const rec = presensiDataDB.find(r => r.siswa_nisn === s.nisn && (!r.tipe || r.tipe === 'masuk'))
              if (rec) {
                // Saat realtime: QR scan selalu diapply (tidak boleh ditimpa manual)
                // Jika bukan realtime (reload penuh), atau siswa belum ada di form: selalu set
                if (!isRealtime || rec.metode === 'qr_scan' || !newData[s.nisn]) {
                  newData[s.nisn] = { status: rec.status, time: rec.waktu || null, metode: rec.metode }
                }
              } else if (!isRealtime) {
                // Saat reload penuh: hapus entry yang sudah dihapus dari DB
                delete newData[s.nisn]
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
    
    const targetKelas = kelasName === 'Semua Siswa' ? null : kelasName;
    const classStudents = targetKelas ? semuaSiswa.filter(s => s.kelas === targetKelas) : semuaSiswa;
      
    if (classStudents) {
      setStudentsInClass(classStudents)
      const dataMap = {}
      classStudents.forEach(s => {
        const rec = presensiHariIni.find(r => r.siswa_nisn === s.nisn && (!r.tipe || r.tipe === 'masuk'))
        if (rec) {
          dataMap[s.nisn] = { status: rec.status, time: rec.waktu || null, metode: rec.metode }
        }
      })
      setPresensiData(dataMap)
    }
  }

  const handleStatusChange = async (nisn, status) => {
    const currentMetode = presensiData[nisn]?.metode
    if (currentMetode === 'qr_scan' || currentMetode === 'manual_piket') {
      alert('Presensi QR Code / Mandiri Siswa tidak dapat diubah manual.')
      return
    }

    const isTogglingOff = presensiData[nisn]?.status === status;
    
    if (isTogglingOff) {
      setPresensiData(prev => {
        const newData = { ...prev }
        delete newData[nisn]
        return newData
      })
      try {
        setIsSaving(true)
        const { error } = await supabase.from('presensi_harian').delete().eq('tanggal', tanggal).eq('siswa_nisn', nisn)
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
    const newTime = (status === 'T' || status === 'P') ? (presensiData[nisn]?.time || now) : null
    
    setPresensiData(prev => ({
      ...prev,
      [nisn]: { status, time: newTime, metode: 'manual' }
    }))

    // Autosave
    try {
      setIsSaving(true)
      const record = {
        tanggal,
        tahun_ajaran_id: activeTa?.id || null,
        kelas: selectedKelas,
        siswa_nisn: nisn,
        status,
        waktu: newTime,
        metode: 'manual',
        tipe: 'masuk',
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn,tipe' })
      if (error) throw error
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTimeChange = async (nisn, time) => {
    const currentMetode = presensiData[nisn]?.metode
    if (currentMetode === 'qr_scan' || currentMetode === 'manual_piket') {
      alert('Presensi QR Code / Mandiri Siswa tidak dapat diubah manual.')
      return
    }

    setPresensiData(prev => ({
      ...prev,
      [nisn]: { ...prev[nisn], time }
    }))

    // Autosave
    try {
      setIsSaving(true)
      const pd = presensiData[nisn]
      if (!pd) return
      const record = {
        tanggal,
        tahun_ajaran_id: activeTa?.id || null,
        kelas: selectedKelas,
        siswa_nisn: nisn,
        status: pd.status,
        waktu: time,
        metode: 'manual',
        tipe: 'masuk',
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn,tipe' })
      if (error) throw error
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleBulkPresensi = async (status) => {
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
      if (presensiData[s.nisn]?.metode === 'qr_scan') return // Lewati siswa yang sudah scan QR
      if (status === 'kosong') {
        delete newData[s.nisn]
        nisnsToDelete.push(s.nisn)
      } else {
        newData[s.nisn] = { status, time: null, metode: 'manual' }
        recordsToUpsert.push({
          tanggal,
          tahun_ajaran_id: activeTa?.id || null,
          kelas: selectedKelas,
          siswa_nisn: s.nisn,
          status,
          waktu: null,
          metode: 'manual',
          tipe: 'masuk',
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
        await supabase.from('presensi_harian')
          .delete()
          .eq('tanggal', tanggal)
          .in('siswa_nisn', nisnsToDelete)
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
      
      // Hapus data presensi harian hari ini
      const { error: delPresensiErr } = await supabase
        .from('presensi_harian')
        .delete()
        .eq('tanggal', tanggal)
      
      if (delPresensiErr) throw delPresensiErr

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

  const generateWA = (semua = false) => {
    let text = `*Laporan Presensi Siswa*\nTanggal: ${new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`
    
    const targetClasses = semua ? semuaKelas : (selectedKelas ? [selectedKelas] : [])
    
    if (targetClasses.length === 0) {
      alert('Pilih kelas terlebih dahulu atau pilih laporan seluruh kelas.')
      return
    }

    targetClasses.forEach(kelas => {
      text += `*Kelas ${kelas}*\n`
      const students = semuaSiswa.filter(s => s.kelas === kelas)
      let belumPresensi = 0
      students.forEach(s => {
        const pd = presensiHariIni.find(r => r.siswa_nisn === s.nisn)
        const uiData = selectedKelas === kelas ? presensiData[s.nisn] : null
        if (!pd && !uiData) {
          text += `- ${s.nama_lengkap} (Belum Presensi)\n`
          belumPresensi++
        }
      })
      if (belumPresensi === 0) {
        text += `_Semua data sudah masuk_\n`
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

  if (loading && semuaKelas.length === 0) {
    return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  const filteredStudents = studentsInClass.filter(s => s.nama_lengkap.toLowerCase().includes(searchDetail.toLowerCase()) || s.nisn.includes(searchDetail))

  return (
    <div className="animate-fade-in font-sans text-slate-800 flex-1 flex flex-col min-h-0 h-full">
      {ConfirmModalComponent}
      
      {/* Top Header */}
      <div className="shrink-0 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Data Presensi Siswa</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Input dan validasi kehadiran siswa per kelas secara mendetail.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettingsModal(true)} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100" title="Pengaturan Laporan WA">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
          <input 
            type="date" 
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="px-4 py-2 bg-white border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
          />
        </div>
      </div>

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
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <h3 className="font-bold text-slate-800 text-sm">Pilih Kelas</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {semuaKelas.map(c => {
              const isSemua = c === 'Semua Siswa';
              const classTotalStudents = isSemua ? semuaSiswa.length : semuaSiswa.filter(s => s.kelas === c).length;
              const classReportedStudents = isSemua ? presensiHariIni.length : presensiHariIni.filter(p => p.kelas === c).length;
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
            {!sesiAktif ? (
              presensiHariIni.length > 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50/50">
                  <div className="w-20 h-20 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-500 shadow-sm animate-pulse">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Sesi Presensi Hari Ini Telah Selesai</h3>
                  <p className="text-sm text-slate-500 mb-8 max-w-md">
                    Seluruh data kehadiran hari ini telah tercatat dan disimpan dengan aman. Anda dapat melanjutkan kembali sesi presensi agar siswa dapat scan QR kembali, atau membatalkan seluruh data presensi hari ini.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button 
                      onClick={handleMulaiSesi} 
                      disabled={isSaving} 
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Lanjutkan Presensi Hari Ini
                    </button>
                    <button 
                      onClick={handleBatalkanPresensi} 
                      disabled={isSaving} 
                      className="px-6 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-bold rounded-xl border border-rose-200 hover:border-rose-300 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      Batalkan Presensi Hari Ini
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-50/50">
                  <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-500 shadow-sm">
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Sesi Presensi Belum Dimulai</h3>
                  <p className="text-sm text-slate-500 mb-8 max-w-sm">Anda harus memulai sesi hari ini terlebih dahulu agar siswa dapat melakukan scan QR, dan Anda dapat menginput presensi.</p>
                  <button onClick={handleMulaiSesi} disabled={isSaving} className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                    {isSaving ? (
                      <><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Memulai...</>
                    ) : (
                      <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Mulai Presensi Hari Ini</>
                    )}
                  </button>
                </div>
              )
            ) : (
            <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
              <div className="p-4 sm:p-6 border-b border-slate-100 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Presensi Kelas {selectedKelas}</h3>
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
            
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Set Semua:</span>
                  <button onClick={() => handleBulkPresensi('H')} className="px-3 py-1.5 text-xs font-bold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors">Hadir</button>
                  <button onClick={() => handleBulkPresensi('T')} className="px-3 py-1.5 text-xs font-bold rounded bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors">Terlambat</button>
                  <button onClick={() => handleBulkPresensi('S')} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">Sakit</button>
                  <button onClick={() => handleBulkPresensi('I')} className="px-3 py-1.5 text-xs font-bold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors">Izin</button>
                  <button onClick={() => handleBulkPresensi('A')} className="px-3 py-1.5 text-xs font-bold rounded bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors">Alpa</button>
                  <button onClick={() => handleBulkPresensi('P')} className="px-3 py-1.5 text-xs font-bold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors">Pulang</button>
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
                <button onClick={handleAkhiriSesi} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1.5 transition-colors shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Selesaikan Presensi
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                            {['H', 'T', 'S', 'I', 'A', 'P'].map(opt => {
                              const pd = presensiData[s.nisn]
                              const isActive = pd?.status === opt;
                              const isLocked = pd?.metode === 'qr_scan' || pd?.metode === 'manual_piket'
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
                                'T': 'bg-orange-500 text-indigo-600 border-orange-500',
                                'S': 'bg-blue-600 text-indigo-600 border-blue-600',
                                'I': 'bg-purple-600 text-indigo-600 border-purple-600',
                                'A': 'bg-rose-600 text-indigo-600 border-rose-600',
                                'P': 'bg-slate-600 text-indigo-600 border-slate-600'
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
                            {(presensiData[s.nisn]?.status === 'T' || presensiData[s.nisn]?.status === 'P') && (
                              <input 
                                type="time" 
                                value={presensiData[s.nisn]?.time || ''}
                                onChange={(e) => handleTimeChange(s.nisn, e.target.value)}
                                disabled={presensiData[s.nisn]?.metode === 'qr_scan' || presensiData[s.nisn]?.metode === 'manual_piket'}
                                className="ml-2 px-2 py-1.5 text-xs border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-24 shrink-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                              />
                            )}
                             {presensiData[s.nisn]?.metode === 'qr_scan' && (
                               <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0" title="Discan oleh Siswa (QR Code)">
                                 <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                                 QR Scan
                                </div>
                              )}
                              {presensiData[s.nisn]?.metode === 'manual_piket' && (
                               <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 shrink-0" title="Presensi Mandiri Siswa (Meja Piket)">
                                 <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                 Mandiri
                                </div>
                              )}
                              {(() => {
                                const rec = presensiHariIni.find(r => r.siswa_nisn === s.nisn)
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
                              {!presensiData[s.nisn] && (
                                <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 shrink-0">
                                  Belum Presensi
                                </div>
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
