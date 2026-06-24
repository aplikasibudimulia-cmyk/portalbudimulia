import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function DataPresensiSiswaSection({ session, activeTa }) {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
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

  const fetchDashboardData = async () => {
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
      const existingRecords = presensiHariIni.filter(p => p.kelas === kelasName)
      const dataMap = {}
      students.forEach(s => {
        const rec = existingRecords.find(r => r.siswa_nisn === s.nisn)
        if (rec) {
          dataMap[s.nisn] = { status: rec.status, time: rec.waktu || null }
        }
      })
      setPresensiData(dataMap)
    }
  }

  const handleStatusChange = (nisn, status) => {
    const now = new Date().toTimeString().slice(0, 5)
    setPresensiData(prev => ({
      ...prev,
      [nisn]: { status, time: (status === 'T' || status === 'P') ? (prev[nisn]?.time || now) : null }
    }))
  }

  const handleTimeChange = (nisn, time) => {
    setPresensiData(prev => ({
      ...prev,
      [nisn]: { ...prev[nisn], time }
    }))
  }

  const handleSimpan = async () => {
    if (!selectedKelas) return
    setIsSaving(true)
    try {
      const recordsToUpsert = studentsInClass.map(s => {
        const pd = presensiData[s.nisn]
        if (!pd) return null
        return {
          tanggal,
          tahun_ajaran_id: activeTa?.id || null,
          kelas: selectedKelas,
          siswa_nisn: s.nisn,
          status: pd.status,
          waktu: pd.time || null,
          diedit_oleh: session.id,
          updated_at: new Date().toISOString()
        }
      }).filter(Boolean)

      if (recordsToUpsert.length > 0) {
        await supabase.from('presensi_harian').delete().eq('tanggal', tanggal).eq('kelas', selectedKelas)
        const { error } = await supabase.from('presensi_harian').insert(recordsToUpsert)
        if (error) throw error
        alert(`Data absensi kelas ${selectedKelas} berhasil disimpan!`)
        fetchDashboardData()
      } else {
        await supabase.from('presensi_harian').delete().eq('tanggal', tanggal).eq('kelas', selectedKelas)
        alert('Data absensi dikosongkan.')
        fetchDashboardData()
      }
    } catch (err) {
      console.error(err)
      alert('Gagal menyimpan data presensi.')
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
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                <button 
                  onClick={handleSimpan}
                  disabled={isSaving}
                  className={`px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 shrink-0 ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700 active:scale-95'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                  {isSaving ? 'Menyimpan...' : 'Simpan Presensi'}
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
                        <div className="flex items-center gap-2 justify-center">
                          {['H', 'T', 'S', 'I', 'A', 'P'].map(opt => {
                            const isActive = presensiData[s.nisn]?.status === opt;
                            const colors = {
                              'H': isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-emerald-500 border-emerald-100 hover:bg-emerald-50',
                              'T': isActive ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-white text-orange-500 border-orange-100 hover:bg-orange-50',
                              'S': isActive ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-blue-500 border-blue-100 hover:bg-blue-50',
                              'I': isActive ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-purple-500 border-purple-100 hover:bg-purple-50',
                              'A': isActive ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-white text-rose-500 border-rose-100 hover:bg-rose-50',
                              'P': isActive ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }
                            return (
                              <button 
                                key={opt}
                                onClick={() => handleStatusChange(s.nisn, opt)}
                                className={`w-9 h-8 rounded-lg text-sm font-bold transition-all border ${colors[opt]}`}
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
                              className="ml-2 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-24 transition-all"
                            />
                          )}
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
