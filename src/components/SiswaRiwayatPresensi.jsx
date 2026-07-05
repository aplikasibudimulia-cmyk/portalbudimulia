import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha' }
const STATUS_COLORS = {
  H: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  T: 'text-amber-600 bg-amber-50 border-amber-200',
  S: 'text-blue-600 bg-blue-50 border-blue-200',
  I: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-rose-600 bg-rose-50 border-rose-200',
}

export default function SiswaRiwayatPresensi({ studentData }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [presensiList, setPresensiList] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState(null)

  const [effectiveDates, setEffectiveDates] = useState([])

  // Fetch rentang tanggal semester aktif dari admin
  useEffect(() => {
    const fetchSemesterRange = async () => {
      if (!studentData?.tahun_ajaran_id) {
        const todayStr = new Date().toISOString().split('T')[0]
        setStartDate(todayStr)
        setEndDate(todayStr)
        return
      }

      try {
        const { data, error } = await supabase
          .from('semester')
          .select('nomor, tanggal_mulai, tanggal_selesai')
          .eq('tahun_ajaran_id', studentData.tahun_ajaran_id)

        if (!error && data && data.length > 0) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          // Cari semester yang menaungi tanggal hari ini
          let activeSem = data.find(s => {
            const start = new Date(s.tanggal_mulai)
            const end = new Date(s.tanggal_selesai)
            start.setHours(0, 0, 0, 0)
            end.setHours(23, 59, 59, 999)
            return today >= start && today <= end
          })

          // Jika tidak ada yang cocok, default ke Semester 1 atau record pertama
          if (!activeSem) {
            activeSem = data.find(s => s.nomor === 1) || data[0]
          }

          if (activeSem && activeSem.tanggal_mulai && activeSem.tanggal_selesai) {
            setStartDate(activeSem.tanggal_mulai)
            setEndDate(activeSem.tanggal_selesai)
          } else {
            const todayStr = new Date().toISOString().split('T')[0]
            setStartDate(todayStr)
            setEndDate(todayStr)
          }
        } else {
          const todayStr = new Date().toISOString().split('T')[0]
          setStartDate(todayStr)
          setEndDate(todayStr)
        }
      } catch (err) {
        console.error('Gagal memuat rentang tanggal semester:', err)
        const todayStr = new Date().toISOString().split('T')[0]
        setStartDate(todayStr)
        setEndDate(todayStr)
      }
    }

    fetchSemesterRange()
  }, [studentData?.tahun_ajaran_id])

  useEffect(() => {
    if (startDate && endDate) {
      fetchPresensi()
    }
  }, [startDate, endDate])

  const fetchPresensi = async () => {
    setLoading(true)
    
    // 1. Ambil tanggal dari sesi_presensi yang aktif/dibuka
    let sesiQuery = supabase.from('sesi_presensi').select('tanggal').order('tanggal', { ascending: false })
    if (startDate) sesiQuery = sesiQuery.gte('tanggal', startDate)
    if (endDate) sesiQuery = sesiQuery.lte('tanggal', endDate)
    else if (startDate && !endDate) sesiQuery = sesiQuery.lte('tanggal', startDate)
    
    const { data: sesiData } = await sesiQuery
    const activeDates = sesiData ? sesiData.map(s => s.tanggal) : []

    // 2. Ambil data presensi harian milik siswa
    let query = supabase
      .from('presensi_harian')
      .select('status, waktu, tanggal, tipe, selfie_url, keterangan')
      .eq('siswa_nisn', studentData.nisn)
      .order('tanggal', { ascending: false })

    if (startDate) query = query.gte('tanggal', startDate)
    if (endDate) query = query.lte('tanggal', endDate)
    else if (startDate && !endDate) query = query.lte('tanggal', startDate)

    const { data, error } = await query
    let dbRecords = []
    if (!error && data) {
      dbRecords = data
      setPresensiList(data)
    }

    // 3. Gabungkan tanggal dari sesi aktif DAN tanggal di mana siswa memiliki catatan presensi
    const recordDates = dbRecords.map(r => r.tanggal)
    const allDates = [...new Set([...activeDates, ...recordDates])].sort((a, b) => b.localeCompare(a))
    
    setEffectiveDates(allDates)
    setLoading(false)
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-6">
      
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Riwayat Kehadiran</h3>
          <p className="text-sm text-slate-500 mt-0.5">Pantau catatan presensi harian Anda</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow w-full sm:w-auto"
          />
          <span className="text-slate-400 font-bold text-sm hidden sm:block">s/d</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow w-full sm:w-auto"
          />
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-500">Memuat data riwayat...</p>
          </div>
        ) : presensiList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h4 className="font-bold text-slate-700">Belum Ada Presensi</h4>
            <p className="text-sm text-slate-500 mt-1">Anda belum memiliki catatan presensi di bulan ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(() => {
              const dates = effectiveDates
              if (dates.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    Tidak ada sesi presensi yang aktif pada rentang tanggal tersebut.
                  </div>
                )
              }

              return dates.map(tanggal => {
                const records = presensiList.filter(r => r.tanggal === tanggal)
                const tglStr = new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                
                // Tentukan status utama
                const masukRecord = records.find(r => r.tipe === 'masuk' || !r.tipe)
                let s = { label: 'Belum Presensi', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
                
                if (masukRecord) {
                  s = STATUS_LABELS[masukRecord.status] ? { label: STATUS_LABELS[masukRecord.status], cls: STATUS_COLORS[masukRecord.status] } : { label: masukRecord.status, cls: 'bg-slate-100 text-slate-700' }
                }
                const isExpanded = expandedDate === tanggal

                return (
                  <div key={tanggal} className="flex flex-col">
                    {/* ACCORDION HEADER */}
                    <button 
                      onClick={() => setExpandedDate(isExpanded ? null : tanggal)}
                      className={`w-full flex items-center justify-between p-4 sm:p-5 transition-colors ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80'}`}
                    >
                      <div className="flex items-center gap-3">
                        <svg className={`w-5 h-5 text-slate-400 transform transition-transform ${isExpanded ? 'rotate-90 text-indigo-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                        <span className="font-bold text-slate-800 text-sm sm:text-base">{tglStr}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 text-xs font-bold rounded-md border ${s.cls}`}>{s.label}</span>
                      </div>
                    </button>

                    {/* ACCORDION BODY */}
                    {isExpanded && (
                      <div className="p-4 sm:p-6 bg-slate-50/50 border-t border-slate-100 shadow-inner">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                          {['masuk', 'pulang'].map(tipe => {
                            const p = records.find(r => r.tipe === tipe || (!r.tipe && tipe === 'masuk'))
                            
                            if (!p) return (
                              <div key={tipe} className="flex flex-col items-center justify-center p-6 rounded-xl bg-white border border-slate-200 min-h-[200px]">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{tipe}</span>
                                <span className="text-sm font-semibold text-slate-300">Belum ada data</span>
                              </div>
                            )

                            const pStatus = STATUS_LABELS[p.status] ? { label: STATUS_LABELS[p.status], cls: STATUS_COLORS[p.status] } : { label: p.status, cls: 'bg-slate-100 text-slate-700' }
                            
                            return (
                              <div key={tipe} className="flex flex-col items-center p-6 rounded-xl bg-white border border-slate-200 shadow-sm relative">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{tipe}</span>
                                <span className={`text-xs font-bold px-3 py-1 rounded-md ${pStatus.cls}`}>{pStatus.label}</span>
                                <span className="text-base font-black text-slate-700 mt-2">{p.waktu} WIB</span>
                                
                                {p.selfie_url ? (
                                  <div className="mt-4 rounded-xl overflow-hidden border-4 border-slate-100 shadow-md">
                                    <img src={p.selfie_url} alt={`Selfie ${tipe}`} className="w-32 h-32 sm:w-40 sm:h-40 object-cover" />
                                  </div>
                                ) : (
                                  <div className="mt-4 w-32 h-32 sm:w-40 sm:h-40 bg-slate-100 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300">
                                    <span className="text-xs font-medium text-slate-400">Tidak ada foto</span>
                                  </div>
                                )}

                                {p.keterangan && (
                                  <div className="mt-3 text-center">
                                    {/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/.test(p.keterangan) ? (
                                      <a 
                                        href={`https://www.google.com/maps?q=${p.keterangan}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors underline"
                                      >
                                        📍 Lihat Lokasi (Peta)
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200 shadow-sm">
                                        📍 {p.keterangan}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

    </div>
  )
}
