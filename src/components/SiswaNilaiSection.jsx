import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { getSemesterAktif } from '../utils/semesterUtils'

export default function SiswaNilaiSection({ studentData }) {
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState(null)
  
  const [mapels, setMapels] = useState([])
  const [komponens, setKomponens] = useState([])
  const [grades, setGrades] = useState([])
  
  const [loading, setLoading] = useState(true)
  const [expandedBabs, setExpandedBabs] = useState({})
  const [selectedMapelId, setSelectedMapelId] = useState('')
  
  const toggleBab = (babKey) => {
    setExpandedBabs(prev => ({
      ...prev,
      [babKey]: !prev[babKey]
    }))
  }

  useEffect(() => {
    if (studentData) {
      fetchSemesters()
    }
  }, [studentData])

  const fetchSemesters = async () => {
    const { data, error } = await supabase
      .from('semester')
      .select('*')
      .order('tanggal_mulai', { ascending: false })

    if (data && data.length > 0) {
      setSemesters(data)
      const aktif = getSemesterAktif(data)
      if (aktif) {
        setSelectedSemesterId(aktif.id)
      } else {
        setSelectedSemesterId(data[0].id)
      }
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedSemesterId && studentData?.nisn) {
      fetchAllData()
    }
  }, [selectedSemesterId, studentData])

  const fetchAllData = async () => {
    setLoading(true)
    
    // 1. Fetch all mapels
    const { data: mapelsData } = await supabase.from('mata_pelajaran').select('*').order('nama')
    
    // 2. Fetch all komponen for the active semester
    const { data: kompData } = await supabase.from('nilai_komponen')
      .select('id, nama, bab_nama, mata_pelajaran_id, target_kelas, is_nilai_visible, urutan, deskripsi')
      .eq('semester_id', selectedSemesterId)
      
    // Filter komponen valid for this student's class and visible
    const studentClassNum = studentData.kelas ? studentData.kelas.replace(/\D/g, '') : ''
    const validKomps = (kompData || []).filter(k => {
      // Don't filter by is_nilai_visible here, so we can show the Bab headers even if TPs are hidden
      if (!k.target_kelas || k.target_kelas.length === 0) return true;
      return k.target_kelas.some(c => c.replace(/\D/g, '') === studentClassNum)
    })
    
    // 3. Fetch student's grades
    const { data: gradeData } = await supabase.from('nilai_siswa')
      .select('*')
      .eq('siswa_nisn', studentData.nisn)

    setMapels(mapelsData || [])
    setKomponens(validKomps)
    setGrades(gradeData || [])
    setLoading(false)
  }

  
  const getPredikat = (nilai) => {
    if (nilai === null || isNaN(nilai)) return '-';
    if (nilai >= 90) return 'A';
    if (nilai >= 80) return 'B';
    if (nilai >= 70) return 'C';
    if (nilai >= 60) return 'D';
    return 'E';
  }



  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>
      <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-white z-10 sticky top-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Nilai Saya</h2>
          <p className="text-sm text-slate-500 mt-1">Daftar nilai mata pelajaran Anda per semester.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 shrink-0">
          <select 
            value={selectedMapelId} 
            onChange={e => setSelectedMapelId(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto bg-white text-slate-800 shadow-sm"
          >
            <option value="">Semua Mapel</option>
            {mapels.map(m => (
              <option key={m.id} value={m.id}>{m.nama}</option>
            ))}
          </select>
          
          {semesters.length > 0 && (
            <select 
              value={selectedSemesterId || ''} 
              onChange={e => setSelectedSemesterId(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto bg-slate-50 text-slate-800 shadow-sm"
            >
              {semesters.map(sem => (
                <option key={sem.id} value={sem.id}>Semester {sem.nomor}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="p-6 md:p-8 bg-slate-50 overflow-y-auto flex-1">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : semesters.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-slate-100 shadow-sm">
            <p className="text-slate-500">Belum ada data semester.</p>
          </div>
        ) : mapels.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-100 shadow-sm">
            <p className="text-slate-500">Belum ada mata pelajaran terdaftar.</p>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {mapels.filter(m => !selectedMapelId || m.id === selectedMapelId).map(mapel => {
              const mKomps = komponens.filter(k => k.mata_pelajaran_id === mapel.id)
              const hasKomponen = mKomps.length > 0
              // Mapel is now always expanded
              
              // Group by Bab
              const babs = {}
              mKomps.forEach(k => {
                const bName = k.bab_nama || 'Tanpa Bab'
                if (!babs[bName]) babs[bName] = []
                const gradeRow = grades.find(g => g.komponen_id === k.id)
                babs[bName].push({
                  komponen: k,
                  nilai: gradeRow ? gradeRow.nilai : null
                })
              })
              
              // Calculate Mapel Average (Average of Bab Averages)
              const babAverages = []
              Object.keys(babs).forEach(bab => {
                const gradedItems = babs[bab].filter(i => i.komponen.is_nilai_visible && i.nilai !== null && i.nilai !== undefined)
                if (gradedItems.length > 0) {
                  const sum = gradedItems.reduce((acc, curr) => acc + curr.nilai, 0)
                  babAverages.push(sum / gradedItems.length)
                }
              })
              
              let mapelAvgStr = null
              let mapelPred = null
              if (babAverages.length > 0) {
                const totalMapelSum = babAverages.reduce((acc, curr) => acc + curr, 0)
                const mapelAvg = totalMapelSum / babAverages.length
                mapelAvgStr = mapelAvg.toFixed(1)
                mapelPred = getPredikat(parseFloat(mapelAvgStr))
              }
              
              return (
                <div key={mapel.id} className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg bg-indigo-100 text-indigo-700 shrink-0">
                        {mapel.nama.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-slate-800">{mapel.nama}</h3>
                        <p className="text-sm text-slate-500">
                          {hasKomponen ? `${Object.keys(babs).length} Bab Tersedia` : 'Belum ada bab/materi'}
                        </p>
                      </div>
                    </div>
                    
                    {mapelAvgStr && (
                      <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-indigo-100 shadow-sm shrink-0">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nilai Akhir Mapel</span>
                          <span className="font-black text-2xl text-indigo-700 leading-none mt-1">{mapelAvgStr}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Predikat</span>
                          <span className={`font-black text-2xl leading-none mt-1 ${mapelPred === 'A' || mapelPred === 'B' ? 'text-emerald-600' : mapelPred === 'C' ? 'text-amber-500' : 'text-rose-500'}`}>{mapelPred}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-5 sm:p-6 bg-white">
                    {!hasKomponen ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-slate-500 font-medium">Mata pelajaran ini belum memiliki materi/bab untuk semester ini.</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                          {Object.keys(babs).sort((a,b) => {
                             const numA = parseInt(a.replace(/\D/g, '')) || 0;
                             const numB = parseInt(b.replace(/\D/g, '')) || 0;
                             if (numA !== numB) return numA - numB;
                             return a.localeCompare(b);
                          }).map(bab => {
                            const babKey = `${mapel.id}_${bab}`;
                            const isBabExpanded = expandedBabs[babKey];
                            return (
                            <div key={bab} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                              <button 
                                onClick={() => toggleBab(babKey)}
                                className="w-full bg-slate-50 hover:bg-slate-100 transition-colors px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 ${isBabExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-white text-slate-400 border border-slate-200'}`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                    <h4 className="font-bold text-slate-800">{bab}</h4>
                                  </div>
                                </div>
                                {(() => {
                                  const gradedItems = babs[bab].filter(i => i.komponen.is_nilai_visible && i.nilai !== null && i.nilai !== undefined);
                                  if (gradedItems.length === 0) return null;
                                  // Asumsi nilai bab = rata-rata dari TP yang sudah dinilai
                                  const sum = gradedItems.reduce((acc, curr) => acc + curr.nilai, 0);
                                  const avg = (sum / gradedItems.length).toFixed(1);
                                  const pred = getPredikat(parseFloat(avg));
                                  return (
                                    <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm shrink-0">
                                      <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rata-rata Bab</span>
                                        <span className="font-black text-indigo-700 leading-none mt-0.5">{avg}</span>
                                      </div>
                                      <div className="w-px h-6 bg-slate-200"></div>
                                      <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Predikat</span>
                                        <span className={`font-black leading-none mt-0.5 ${pred === 'A' || pred === 'B' ? 'text-emerald-600' : pred === 'C' ? 'text-amber-500' : 'text-rose-500'}`}>{pred}</span>
                                      </div>
                                    </div>
                                  )
                                })()}
                              </button>
                              
                              {isBabExpanded && (
                              <div className="divide-y divide-slate-100 bg-white animate-fade-in">
                                {(() => {
                                  const visibleTPs = babs[bab].filter(i => i.komponen.is_nilai_visible).sort((a,b) => (a.komponen.urutan || 0) - (b.komponen.urutan || 0));
                                  if (visibleTPs.length === 0) {
                                    return (
                                      <div className="px-5 py-6 text-center text-slate-500 text-sm">
                                        Materi/Nilai untuk bab ini belum dipublikasikan oleh Guru.
                                      </div>
                                    )
                                  }
                                  return visibleTPs.map((item, idx) => (
                                  <div key={item.komponen.id || idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-slate-700">{item.komponen.nama}</span>
                                      {item.komponen.deskripsi && (
                                        <span className="text-sm text-slate-500 mt-1">{item.komponen.deskripsi}</span>
                                      )}
                                    </div>
                                    <div className="shrink-0">
                                      {item.nilai !== null && item.nilai !== undefined ? (
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nilai</span>
                                          <span className={`text-lg font-black px-4 py-1.5 rounded-xl ${item.nilai >= 75 ? 'bg-emerald-100 text-emerald-700' : item.nilai > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                            {item.nilai}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-sm font-medium border border-rose-100">
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          Belum diinput Guru
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  ))
                                })()}
                              </div>
                              )}
                            </div>
                          )
                          })}
                        </div>
                      )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
