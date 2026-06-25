import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function DataPresensiSiswaSection({ session, activeTa }) {
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString('en-CA'))
  const [semuaKelas, setSemuaKelas] = useState([])
  const [semuaSiswa, setSemuaSiswa] = useState([])
  const [presensiHariIni, setPresensiHariIni] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [selectedKelas, setSelectedKelas] = useState(null)
  const [studentsInClass, setStudentsInClass] = useState([])
  const [presensiData, setPresensiData] = useState({})
  const [searchDetail, setSearchDetail] = useState('')
  
  const [isSaving, setIsSaving] = useState(false)

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

      if (siswaData) {
        setSemuaSiswa(siswaData)
        const uniqueClasses = [...new Set(siswaData.map(s => s.kelas).filter(Boolean))].sort()
        setSemuaKelas(uniqueClasses)
      }

      const { data: presensiDataDB } = await supabase
        .from('presensi_harian')
        .select('*')
        .eq('tanggal', tanggal)
      
      if (presensiDataDB) {
        setPresensiHariIni(presensiDataDB)
        
        // Sync presensiData (state form) jika sedang membuka kelas
        if (selectedKelas && siswaData) {
          const classStudents = siswaData.filter(s => s.kelas === selectedKelas)
          setPresensiData(prev => {
            const newData = isRealtime ? { ...prev } : {}
            classStudents.forEach(s => {
              const rec = presensiDataDB.find(r => r.siswa_nisn === s.nisn)
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
    setPresensiData({})
    setSearchDetail('')
    
    const { data: students } = await supabase
      .from('siswa_lengkap')
      .select('*')
      .eq('kelas', kelasName)
      .eq('is_aktif', true)
      .order('nama_lengkap')
      
    if (students) {
      setStudentsInClass(students)
      const dataMap = {}
      students.forEach(s => {
        const rec = presensiHariIni.find(r => r.siswa_nisn === s.nisn)
        if (rec) {
          dataMap[s.nisn] = { status: rec.status, time: rec.waktu || null, metode: rec.metode }
        }
      })
      setPresensiData(dataMap)
    }
  }

  const handleStatusChange = async (nisn, status) => {
    if (presensiData[nisn]?.metode === 'qr_scan') {
      alert('Presensi QR Code tidak dapat diubah manual.')
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
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn' })
      if (error) throw error
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleTimeChange = async (nisn, time) => {
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
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      const { error } = await supabase.from('presensi_harian').upsert([record], { onConflict: 'tanggal,siswa_nisn' })
      if (error) throw error
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleBulkPresensi = async (status) => {
    if (!window.confirm(`Set semua siswa yang tampil menjadi ${status}?`)) return
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
        const { error } = await supabase.from('presensi_harian').upsert(recordsToUpsert, { onConflict: 'tanggal,siswa_nisn' })
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

  if (loading && semuaKelas.length === 0) {
    return <div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  const filteredStudents = studentsInClass.filter(s => s.nama_lengkap.toLowerCase().includes(searchDetail.toLowerCase()) || s.nisn.includes(searchDetail))

  return (
    <div className="animate-fade-in font-sans text-slate-800 flex-1 flex flex-col min-h-0 h-full">
      
      {/* Top Header */}
      <div className="shrink-0 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Data Presensi Siswa</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">Input dan validasi kehadiran siswa per kelas secara mendetail.</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="px-4 py-2 bg-white border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Class Selection Area */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <h3 className="font-bold text-slate-800 text-sm">Pilih Kelas</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {semuaKelas.map(c => {
              const classTotalStudents = semuaSiswa.filter(s => s.kelas === c).length;
              const classReportedStudents = presensiHariIni.filter(p => p.kelas === c).length;
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
            
            {/* Aksi Massal Presensi */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
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
                        <div className="flex justify-center">
                          <div className="flex items-center gap-2 w-[360px]">
                            {['H', 'T', 'S', 'I', 'A', 'P'].map(opt => {
                              const pd = presensiData[s.nisn]
                              const isActive = pd?.status === opt;
                              const isLocked = pd?.metode === 'qr_scan'
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
                                disabled={presensiData[s.nisn]?.metode === 'qr_scan'}
                                className="ml-2 px-2 py-1.5 text-xs border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-24 shrink-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                              />
                            )}
                            {presensiData[s.nisn]?.metode === 'qr_scan' && (
                              <div className="ml-2 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0" title="Discan oleh Siswa (QR Code)">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                                QR Scan
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
