import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const getPoinMeta = (p, max = 100) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (p / max) * 100)) : 0
  if (p > 75) return { bar: 'from-emerald-400 to-emerald-600', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Baik', emoji: '🟢' }
  if (p > 50) return { bar: 'from-yellow-400 to-yellow-600', badge: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Perlu Perhatian', emoji: '🟡' }
  if (p > 25) return { bar: 'from-orange-400 to-orange-600', badge: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Waspada', emoji: '🟠' }
  return { bar: 'from-red-400 to-red-600', badge: 'bg-red-100 text-red-700 border-red-300', label: 'Kritis', emoji: '🔴' }
}

export default function SiswaPoinSection({ siswaNisn, activeTa }) {
  const [semester, setSemester] = useState(1)
  const [studentPoint, setStudentPoint] = useState(null)
  const [records, setRecords] = useState([])
  const [stages, setStages] = useState([])
  const [tataTertib, setTataTertib] = useState([])
  const [activeView, setActiveView] = useState('poin') // 'poin' | 'tata_tertib'
  const [recordFilter, setRecordFilter] = useState('all') // 'all' | 'negative' | 'positive'
  const [loading, setLoading] = useState(true)
  const [defaultPoin, setDefaultPoin] = useState(100)

  useEffect(() => {
    fetchStages()
    fetchDefaultPoin()
    fetchTataTertib()
  }, [])

  useEffect(() => {
    if (siswaNisn && activeTa?.id) {
      fetchData()
    }
  }, [siswaNisn, activeTa, semester])

  const fetchDefaultPoin = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'poin_default_siswa').maybeSingle()
    
    // Fetch point records for history
    const { data: recordsData } = await supabase.from('point_records')
      .select('*')
      .eq('nisn', siswaNisn)
      .eq('tahun_ajaran_id', activeTa.id)
      .order('created_at', { ascending: false })

    const defaultVal = data?.setting_value ? parseInt(data.setting_value) : 100 
    setDefaultPoin(defaultVal)
  }

  const fetchStages = async () => {
    const { data } = await supabase.from('guidance_stages').select('*').order('batas_poin', { ascending: false })
    setStages(data || [])
  }

  const fetchTataTertib = async () => {
    const { data } = await supabase.from('school_regulations').select('*').order('urutan')
    setTataTertib(data || [])
  }

  const fetchData = async () => {
    setLoading(true)
    const [spRes, recRes] = await Promise.all([
      supabase.from('student_points').select('*').eq('nisn', siswaNisn).eq('tahun_ajaran_id', activeTa.id).eq('semester', semester).maybeSingle(),
      supabase.from('point_records').select('*').eq('nisn', siswaNisn).eq('tahun_ajaran_id', activeTa.id).eq('semester', semester).order('tanggal', { ascending: false }).order('created_at', { ascending: false })
    ])
    setStudentPoint(spRes.data || { total_poin: defaultPoin, poin_default: defaultPoin })
    setRecords(recRes.data || [])
    setLoading(false)
  }

  const poin = studentPoint?.total_poin ?? defaultPoin
  const maxPoin = studentPoint?.poin_default ?? defaultPoin
  const pct = maxPoin > 0 ? Math.max(0, Math.min(100, (poin / maxPoin) * 100)) : 0
  const meta = getPoinMeta(poin, maxPoin)
  const activeStage = stages.find(s => poin <= s.batas_poin) || null

  const filteredRecords = records.filter(r => {
    if (recordFilter === 'negative') return r.poin_diberikan < 0
    if (recordFilter === 'positive') return r.poin_diberikan > 0
    return true
  })

  // Group tata tertib by bab
  const babGroups = tataTertib.reduce((acc, row) => {
    if (!acc[row.bab]) acc[row.bab] = { nama_bab: row.nama_bab, pasals: {} }
    if (!acc[row.bab].pasals[row.pasal]) acc[row.bab].pasals[row.pasal] = { nama_pasal: row.nama_pasal, items: [] }
    acc[row.bab].pasals[row.pasal].items.push(row)
    return acc
  }, {})

  return (
    <div className="animate-slide-up space-y-4">
      {/* Tab Switch */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveView('poin')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeView === 'poin' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
          🏆 Poin Saya
        </button>
        <button onClick={() => setActiveView('tata_tertib')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeView === 'tata_tertib' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
          📋 Tata Tertib
        </button>
      </div>

      {/* ─── POIN VIEW ─────────────────────────────────── */}
      {activeView === 'poin' && (
        <>
          {/* Semester Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Semester:</span>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {[1, 2].map(s => (
                <button key={s} onClick={() => setSemester(s)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semester === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'}`}>
                  Semester {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* Top Row: Tahap Pembinaan (Left) & Poin Card (Right) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Kiri: Tahap Pembinaan Info */}
                <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Tahap Pembinaan</p>
                  <div className="space-y-2 flex-1">
                    {stages.map((stage, i) => {
                      const colors = ['border-yellow-200 bg-yellow-50', 'border-orange-200 bg-orange-50', 'border-red-200 bg-red-50', 'border-red-300 bg-red-100']
                      const textColors = ['text-yellow-700', 'text-orange-700', 'text-red-700', 'text-red-900']
                      const idx = Math.min(i, 3)
                      const isActive = activeStage?.id === stage.id
                      return (
                        <div key={stage.id} className={`border rounded-xl p-3 flex items-start gap-3 ${isActive ? colors[idx] + ' ring-2 ring-offset-1 ring-red-400' : colors[idx]}`}>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isActive ? 'bg-red-600 text-white border-red-600' : textColors[idx] + ' bg-white border-slate-200'}`}>
                            ≤ {stage.batas_poin}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold ${textColors[idx]}`}>{stage.nama_tahap}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{stage.tindakan}</p>
                          </div>
                          {isActive && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-200 shrink-0">AKTIF</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Kanan: Poin Card */}
                <div className="md:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
                  <div className="p-5 text-center flex-1 flex flex-col justify-center">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold mb-3 mx-auto ${meta.badge}`}>
                      {meta.emoji} {meta.label}
                    </div>
                    <div className="text-6xl font-black text-slate-900 leading-none mb-1">{poin}</div>
                    <p className="text-xs text-slate-500">dari <span className="font-bold text-slate-700">{maxPoin}</span> poin</p>
                    {/* Progress Bar */}
                    <div className="mt-4 bg-slate-200 rounded-full h-2 overflow-hidden w-full">
                      <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{pct.toFixed(0)}% dari poin awal</p>
                  </div>

                  <div className="mt-auto">
                    {/* Stage Warning */}
                    {activeStage && (
                      <div className="mx-3 mb-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-left">
                        <p className="text-xs font-bold text-orange-800 mb-0.5">⚠️ Tahap: <span className="text-orange-700">{activeStage.nama_tahap}</span></p>
                        <p className="text-[10px] text-orange-600 leading-tight">{activeStage.tindakan}</p>
                        <p className="text-[10px] text-orange-500 mt-0.5">PJ: {activeStage.penanggung_jawab}</p>
                      </div>
                    )}

                    {/* Next stage info */}
                    {!activeStage && stages.length > 0 && (
                      <div className="mx-3 mb-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-left">
                        <p className="text-xs font-bold text-emerald-800">✅ Kondisi baik!</p>
                        {stages[0] && <p className="text-[10px] text-emerald-600 mt-0.5 leading-tight">Pertahankan poin di atas {stages[stages.length-1]?.batas_poin + 1 || 76}.</p>}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Riwayat Poin */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800">Riwayat Poin</p>
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                    {[{v:'all',l:'Semua'},{v:'negative',l:'Negatif'},{v:'positive',l:'Positif'}].map(f => (
                      <button key={f.v} onClick={() => setRecordFilter(f.v)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${recordFilter === f.v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                        {f.l}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">Belum ada riwayat poin.</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {filteredRecords.map(rec => (
                      <div key={rec.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50/80 transition-colors">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${rec.poin_diberikan < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {rec.poin_diberikan > 0 ? '+' : ''}{rec.poin_diberikan}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {rec.kode_katalog && <span className="text-indigo-600 font-mono text-[10px] mr-1">[{rec.kode_katalog}]</span>}
                            {rec.jenis}
                          </p>
                          {rec.keterangan && <p className="text-xs text-slate-500 truncate">{rec.keterangan}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400">{rec.tanggal}</p>
                          <p className="text-[10px] text-slate-400">{rec.dicatat_oleh}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TATA TERTIB VIEW ───────────────────────────── */}
      {activeView === 'tata_tertib' && (
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

          {Object.entries(babGroups).length === 0 ? (
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
    </div>
  )
}
