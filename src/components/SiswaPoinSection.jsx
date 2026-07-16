import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SiswaPoinSection({ 
  siswaNisn, 
  activeTa, 
  showTabPoinSaya = true, 
  showPoinTotal = true,
  showPoinNegatif = true,
  showPoinPositif = true,
  showTabLeaderboard = true, 
  showTabTataTertib = true, 
  showTabKatalog = true,
  showPointRecords = true
}) {
  const [tataTertib, setTataTertib] = useState([])
  const [katalogPoin, setKatalogPoin] = useState([])
  const [activeView, setActiveView] = useState(() => {
    if (showTabPoinSaya) return 'poin_saya'
    if (showTabLeaderboard) return 'leaderboard'
    if (showTabTataTertib) return 'tata_tertib'
    if (showTabKatalog) return 'katalog_poin'
    return 'poin_saya'
  })
  const [katalogTab, setKatalogTab] = useState('negative') // 'negative' | 'positive'
  const [katalogSearch, setKatalogSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // State baru untuk data personal siswa & leaderboard
  const [myPoints, setMyPoints] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  const [leaderboardList, setLeaderboardList] = useState([])
  const [fetchingPersonal, setFetchingPersonal] = useState(false)
  const [expandedRecords, setExpandedRecords] = useState({})

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      try {
        await Promise.all([fetchTataTertib(), fetchKatalogPoin()])
      } catch (err) {
        console.error("Gagal memuat data tata tertib/katalog:", err)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    if (siswaNisn && activeTa?.id) {
      fetchPersonalPointData()
      fetchLeaderboardData()
    }
  }, [siswaNisn, activeTa])

  const fetchTataTertib = async () => {
    const { data } = await supabase.from('school_regulations').select('*').order('urutan')
    setTataTertib(data || [])
  }

  const fetchKatalogPoin = async () => {
    const { data } = await supabase.from('point_catalog').select('*').order('kategori').order('kode')
    setKatalogPoin(data || [])
  }

  const fetchPersonalPointData = async () => {
    if (!siswaNisn || !activeTa?.id) return
    setFetchingPersonal(true)
    try {
      // 1. Ambil data total poin aktif
      const { data: ptData } = await supabase
        .from('student_points')
        .select('total_poin, poin_default')
        .eq('nisn', siswaNisn)
        .eq('tahun_ajaran_id', activeTa.id)
        .order('semester', { ascending: false })
        .limit(1)
        .maybeSingle()

      setMyPoints(ptData || null)

      // 2. Ambil riwayat kasus pelanggaran/prestasi
      const { data: recData } = await supabase
        .from('point_records')
        .select('*')
        .eq('nisn', siswaNisn)
        .eq('tahun_ajaran_id', activeTa.id)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })

      setMyHistory(recData || [])
    } catch (err) {
      console.error("Error fetching personal points:", err)
    } finally {
      setFetchingPersonal(false)
    }
  }

  const fetchLeaderboardData = async () => {
    if (!activeTa?.id) return
    try {
      const { data } = await supabase
        .from('student_points')
        .select(`
          nisn,
          total_poin,
          poin_default,
          siswa_lengkap (nama_lengkap, kelas)
        `)
        .eq('tahun_ajaran_id', activeTa.id)
        .order('total_poin', { ascending: false })
        .limit(10)

      // Format data untuk menghindari properti kosong jika ada siswa yang tidak memiliki relasi lengkap
      const formatted = (data || [])
        .filter(item => item.siswa_lengkap)
        .map((item, idx) => ({
          rank: idx + 1,
          nisn: item.nisn,
          nama: item.siswa_lengkap.nama_lengkap,
          kelas: item.siswa_lengkap.kelas,
          totalPoin: item.total_poin,
          poinDefault: item.poin_default
        }))

      setLeaderboardList(formatted)
    } catch (err) {
      console.error("Error fetching leaderboard:", err)
    }
  }

  // Group tata tertib by bab
  const babGroups = tataTertib.reduce((acc, row) => {
    if (!acc[row.bab]) acc[row.bab] = { nama_bab: row.nama_bab, pasals: {} }
    if (!acc[row.bab].pasals[row.pasal]) acc[row.bab].pasals[row.pasal] = { nama_pasal: row.nama_pasal, items: [] }
    acc[row.bab].pasals[row.pasal].items.push(row)
    return acc
  }, {})

  // Group and search katalog poin
  const groupedKatalog = (katalogPoin || []).reduce((acc, item) => {
    if (item.tipe !== katalogTab) return acc
    
    const q = katalogSearch.toLowerCase()
    const match = !q || 
      (item.kategori || '').toLowerCase().includes(q) || 
      (item.kode || '').toLowerCase().includes(q) || 
      (item.jenis || '').toLowerCase().includes(q) || 
      (item.keterangan || '').toLowerCase().includes(q)
      
    if (!match) return acc
    
    const kat = item.kategori || 'TANPA KATEGORI'
    if (!acc[kat]) acc[kat] = []
    acc[kat].push(item)
    return acc
  }, {})

  // Hitung status warna & label kedisiplinan
  const getDisciplineStatus = (poin, max) => {
    const pct = max > 0 ? (poin / max) * 100 : 100
    if (pct >= 90) return { label: 'Sangat Baik', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', barColor: 'bg-emerald-500' }
    if (pct >= 75) return { label: 'Baik', color: 'text-blue-600 bg-blue-50 border-blue-200', barColor: 'bg-blue-500' }
    if (pct >= 60) return { label: 'Cukup / Perlu Pembinaan', color: 'text-amber-600 bg-amber-50 border-amber-200', barColor: 'bg-amber-500' }
    return { label: 'Kritis / Tindakan Khusus', color: 'text-rose-600 bg-rose-50 border-rose-200', barColor: 'bg-rose-500' }
  }

  const defaultMaxPoin = 100
  const currentPoin = myPoints?.total_poin ?? defaultMaxPoin
  const maxPoin = myPoints?.poin_default ?? defaultMaxPoin
  const status = getDisciplineStatus(currentPoin, maxPoin)
  const percentVal = Math.max(0, Math.min(100, maxPoin > 0 ? (currentPoin / maxPoin) * 100 : 100))

  const displayedHistory = myHistory.filter((rec) => {
    const isMinus = rec.poin_diberikan < 0
    if (isMinus) return showPoinNegatif
    return showPoinPositif
  })

  return (
    <div className="animate-slide-up space-y-5">
      {/* Navigation Tab Menu */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit flex-wrap">
        {showTabPoinSaya && (
          <button onClick={() => setActiveView('poin_saya')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeView === 'poin_saya' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            ⭐ Poin Saya
          </button>
        )}
        {showTabLeaderboard && (
          <button onClick={() => setActiveView('leaderboard')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeView === 'leaderboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            🏆 Leaderboard
          </button>
        )}
        {showTabTataTertib && (
          <button onClick={() => setActiveView('tata_tertib')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeView === 'tata_tertib' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            📋 Tata Tertib
          </button>
        )}
        {showTabKatalog && (
          <button onClick={() => setActiveView('katalog_poin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeView === 'katalog_poin' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            📖 Katalog Poin
          </button>
        )}
      </div>

      {/* ─── TAB 1: POIN SAYA (PERSONAL SCORE) ───────────────── */}
      {activeView === 'poin_saya' && showTabPoinSaya && (
        <div className="space-y-6">
          {fetchingPersonal ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Point Card Summary */}
              {showPoinTotal && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm md:col-span-2 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-extrabold text-slate-800 text-base">Poin Perilaku & Kedisiplinan</h3>
                        <p className="text-xs text-slate-500">Akumulasi penilaian sikap semester ini</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-slate-400">STATUS POINT BAR</span>
                        <span className="text-2xl font-black text-slate-850">
                          {currentPoin} <span className="text-sm font-medium text-slate-400">/ {maxPoin} Poin</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                        <div className={`h-3.5 rounded-full transition-all duration-500 ${status.barColor}`} style={{ width: `${percentVal}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="relative z-10">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Target Sikwa</span>
                      <h4 className="text-base font-black mt-1 leading-snug">Jaga Reputasi Karakter Anda!</h4>
                      <p className="text-[11px] text-indigo-200 mt-2 leading-relaxed">
                        Siswa dengan sisa poin di atas 90 di akhir semester berkesempatan masuk di papan lencana terdisiplin sekolah.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* History List Section */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-sm">Riwayat Catatan Pelanggaran & Prestasi</h4>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
                    {displayedHistory.length} Kasus
                  </span>
                </div>

                {!showPointRecords ? (
                  /* Hide Mode - Privacy notice */
                  <div className="p-8 text-center max-w-lg mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mx-auto">
                      <svg xmlns="http://www.w3.org/2500/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h5 className="font-bold text-slate-850 text-sm">Detail Catatan Disembunyikan</h5>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Kebijakan sekolah menyembunyikan rincian catatan negatif demi menjaga kerahasiaan siswa. Untuk melihat kronologis kasus, silakan hubungi Guru BK atau Wali Kelas secara langsung.
                    </p>
                  </div>
                ) : displayedHistory.length === 0 ? (
                  /* No records */
                  <div className="p-8 text-center text-slate-400 text-sm">
                    🎉 Luar biasa! Belum ada catatan negatif (pelanggaran) atau prestasi yang dilaporkan semester ini.
                  </div>
                ) : (
                  /* Show Mode - Table list & Mobile Card list */
                  <>
                    {/* Desktop View (Table) */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="py-3 px-5">Tanggal</th>
                            <th className="py-3 px-5">Jenis & Kode</th>
                            <th className="py-3 px-5">Deskripsi Tindakan</th>
                            <th className="py-3 px-5 text-center">Poin</th>
                            <th className="py-3 px-5">Dicatat Oleh</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {displayedHistory.map((rec) => {
                            const isMinus = rec.poin_diberikan < 0
                            const dateObj = new Date(rec.tanggal)
                            const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                            
                            return (
                              <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3.5 px-5 font-medium text-slate-500 whitespace-nowrap">
                                  {formattedDate}
                                </td>
                                <td className="py-3.5 px-5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${isMinus ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                      {rec.kode_katalog || 'KODE'}
                                    </span>
                                    <span className="font-semibold text-slate-800">{rec.jenis || 'Jenis Catatan'}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-5 text-slate-600 max-w-xs truncate" title={rec.keterangan}>
                                  {rec.keterangan || '-'}
                                </td>
                                <td className="py-3.5 px-5 text-center whitespace-nowrap">
                                  <span className={`font-black ${isMinus ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {isMinus ? '' : '+'}{rec.poin_diberikan}
                                  </span>
                                </td>
                                <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap font-medium">
                                  {rec.dicatat_oleh || 'Staf Tata Usaha'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View (Accordion Card List) */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {displayedHistory.map((rec) => {
                        const isMinus = rec.poin_diberikan < 0
                        const dateObj = new Date(rec.tanggal)
                        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                        const isExpanded = !!expandedRecords[rec.id]
                        
                        return (
                          <div 
                            key={rec.id} 
                            className="p-4 hover:bg-slate-50/50 active:bg-slate-100/50 transition-colors cursor-pointer select-none"
                            onClick={() => {
                              setExpandedRecords(prev => ({
                                ...prev,
                                [rec.id]: !prev[rec.id]
                              }))
                            }}
                          >
                            {/* Baris Atas: Jenis & Kode (Kiri), Poin (Kanan) */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border shrink-0 ${isMinus ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                  {rec.kode_katalog || 'KODE'}
                                </span>
                                <span className="font-semibold text-slate-800 text-xs truncate">{rec.jenis || 'Jenis Catatan'}</span>
                              </div>
                              <div className="shrink-0">
                                <span className={`font-black text-sm ${isMinus ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {isMinus ? '' : '+'}{rec.poin_diberikan}
                                </span>
                              </div>
                            </div>

                            {/* Baris Bawah: Tanggal & Chevron Toggle */}
                            <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 font-bold">
                              <span>{formattedDate}</span>
                              <span className="text-slate-300 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </div>

                            {/* Detail Panel ketika Diklik */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-655 space-y-2 animate-scale-in">
                                <div>
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Deskripsi Tindakan</span>
                                  <p className="bg-slate-50 p-2.5 rounded border border-slate-100 text-slate-700 leading-relaxed font-medium">
                                    {rec.keterangan || '-'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-between text-[10px] pt-1">
                                  <div>
                                    <span className="text-slate-400 font-bold uppercase tracking-wider">Dicatat Oleh:</span>
                                    <span className="ml-1 text-slate-600 font-semibold">{rec.dicatat_oleh || 'Staf Tata Usaha'}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── TAB 2: LEADERBOARD (BULANAN) ───────────────────── */}
      {activeView === 'leaderboard' && showTabLeaderboard && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Peringkat Kedisiplinan Murid</h3>
              <p className="text-xs text-slate-500">Top 10 Siswa dengan skor kedisiplinan tertinggi semester ini</p>
            </div>
          </div>

          {leaderboardList.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-400 text-sm shadow-sm">
              Data papan peringkat belum dihitung. Silakan tunggu hingga penilaian semester aktif berjalan.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Podium Visual Top 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end max-w-3xl mx-auto pt-6">
                
                {/* Juara 2 (Perak) */}
                {leaderboardList[1] && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center relative shadow-sm order-2 sm:order-1 h-36">
                    <span className="absolute -top-4 w-8 h-8 bg-slate-200 border-2 border-white rounded-full flex items-center justify-center text-xs font-black text-slate-700 shadow-sm">2</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold border border-slate-200 mb-2">{leaderboardList[1].kelas}</span>
                    <h5 className="font-bold text-slate-800 text-sm text-center truncate w-full">{leaderboardList[1].nama}</h5>
                    <p className="text-indigo-600 font-extrabold text-sm mt-1">{leaderboardList[1].totalPoin} Poin</p>
                  </div>
                )}

                {/* Juara 1 (Emas) */}
                {leaderboardList[0] && (
                  <div className="bg-indigo-50 border-2 border-amber-300 rounded-2xl p-6 flex flex-col items-center justify-center relative shadow-md order-1 sm:order-2 h-44">
                    <span className="absolute -top-5 w-10 h-10 bg-amber-400 border-4 border-white rounded-full flex items-center justify-center text-sm font-black text-white shadow-md">👑</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold border border-amber-200 mb-2">{leaderboardList[0].kelas}</span>
                    <h5 className="font-black text-indigo-900 text-base text-center truncate w-full">{leaderboardList[0].nama}</h5>
                    <p className="text-indigo-700 font-black text-base mt-1">{leaderboardList[0].totalPoin} Poin</p>
                  </div>
                )}

                {/* Juara 3 (Perunggu) */}
                {leaderboardList[2] && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center relative shadow-sm order-3 sm:order-3 h-32">
                    <span className="absolute -top-4 w-8 h-8 bg-amber-600/20 border-2 border-white rounded-full flex items-center justify-center text-xs font-black text-amber-800 shadow-sm">3</span>
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-100 mb-2">{leaderboardList[2].kelas}</span>
                    <h5 className="font-bold text-slate-800 text-sm text-center truncate w-full">{leaderboardList[2].nama}</h5>
                    <p className="text-indigo-600 font-extrabold text-sm mt-1">{leaderboardList[2].totalPoin} Poin</p>
                  </div>
                )}

              </div>

              {/* Table List Juara 4-10 */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-w-3xl mx-auto">
                <div className="divide-y divide-slate-100">
                  {leaderboardList.slice(3).map((std) => (
                    <div key={std.nisn} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="w-6 text-center text-slate-400 font-bold text-xs">
                          {std.rank}
                        </span>
                        <div>
                          <p className="font-bold text-slate-800 text-xs sm:text-sm">{std.nama}</p>
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border font-semibold mt-0.5 inline-block">{std.kelas}</span>
                        </div>
                      </div>
                      <span className="font-extrabold text-slate-800 text-xs sm:text-sm whitespace-nowrap">
                        {std.totalPoin} Poin
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: TATA TERTIB VIEW ───────────────────────────── */}
      {activeView === 'tata_tertib' && showTabTataTertib && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Tata Tertib Sekolah</h3>
              <p className="text-xs text-slate-500">SMP Budi Mulia Jakarta</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
          ) : Object.entries(babGroups).length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Data tata tertib belum tersedia.</div>
          ) : Object.entries(babGroups).map(([bab, babData]) => (
            <div key={bab} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                <h4 className="font-bold text-indigo-800 text-sm">{bab} — {babData.nama_bab}</h4>
              </div>
              {Object.entries(babData.pasals).map(([pasal, pasalData]) => (
                <div key={pasal}>
                  <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-600">{pasal}: {pasalData.nama_pasal}</p>
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {pasalData.items.map((item, idx) => (
                      <li key={item.id} className={`flex items-start gap-3 px-5 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <span className="text-xs font-bold text-slate-400 mt-0.5 shrink-0 w-6">{item.nomor}.</span>
                        <p className="text-sm text-slate-700 leading-relaxed">{item.isi}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ─── TAB 4: KATALOG POIN VIEW ──────────────────────────── */}
      {activeView === 'katalog_poin' && showTabKatalog && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Katalog Poin Kedisiplinan</h3>
                <p className="text-xs text-slate-500">Daftar tindakan pelanggaran & prestasi sekolah</p>
              </div>
            </div>

            {/* Sub-tab Switch Tipe Poin */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit shrink-0">
              <button onClick={() => setKatalogTab('negative')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${katalogTab === 'negative' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                🔴 Pelanggaran (Poin Min)
              </button>
              <button onClick={() => setKatalogTab('positive')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${katalogTab === 'positive' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                🟢 Prestasi (Poin Plus)
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input 
              type="text" 
              placeholder="Cari kata kunci, kode, jenis, atau kategori..." 
              value={katalogSearch}
              onChange={(e) => setKatalogSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
            />
            <div className="absolute left-3 top-3 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            {katalogSearch && (
              <button onClick={() => setKatalogSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-2xl hover:bg-slate-100 text-xs">
                Clear
              </button>
            )}
          </div>

          {/* Catalog Render */}
          {Object.entries(groupedKatalog).length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-slate-400 text-sm shadow-sm">
              Tidak ada data katalog poin yang cocok dengan pencarian Anda.
            </div>
          ) : Object.entries(groupedKatalog).map(([kat, items]) => (
            <div key={kat} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-fade-in">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">{kat}</h4>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-mono rounded font-semibold shrink-0">
                          {item.kode}
                        </span>
                        <span className="font-bold text-slate-800 text-sm leading-snug">
                          {item.jenis}
                        </span>
                      </div>
                      {item.keterangan && (
                        <p className="text-xs text-slate-500 leading-relaxed pl-1">
                          {item.keterangan}
                        </p>
                      )}
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 border shadow-sm ${item.tipe === 'positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {item.tipe === 'positive' ? `+${item.poin}` : `-${item.poin}`} Poin
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
