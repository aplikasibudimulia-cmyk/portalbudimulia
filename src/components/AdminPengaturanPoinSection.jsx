import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

const getPoinColor = (p, max = 100) => {
  const pct = (p / max) * 100
  if (pct > 75) return { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Baik' }
  if (pct > 50) return { bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Perhatian' }
  if (pct > 25) return { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Waspada' }
  return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200', label: 'Kritis' }
}

export default function AdminPengaturanPoinSection({ activeTa }) {
  const [students, setStudents] = useState([])
  const [studentPoints, setStudentPoints] = useState({})
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [semester, setSemester] = useState(1)
  const [search, setSearch] = useState('')
  const [filterKelas, setFilterKelas] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [allKelas, setAllKelas] = useState([])
  const [defaultPoin, setDefaultPoin] = useState(100)
  const [savingDefault, setSavingDefault] = useState(false)
  const [resettingId, setResettingId] = useState(null)
  const [showResetAll, setShowResetAll] = useState(false)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => {
    fetchStages()
    fetchDefaultPoin()
  }, [])

  useEffect(() => {
    if (activeTa?.id) {
      fetchStudents()
    }
  }, [activeTa, semester])

  const fetchDefaultPoin = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_value').eq('setting_key', 'poin_default_siswa').maybeSingle()
    if (data && data.setting_value) setDefaultPoin(parseInt(data.setting_value))
  }

  const fetchStages = async () => {
    const { data } = await supabase.from('guidance_stages').select('*').order('batas_poin', { ascending: false })
    setStages(data || [])
  }

  const fetchStudents = async () => {
    setLoading(true)
    // Fetch all active students
    const { data: siswaData } = await supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('is_aktif', true).order('kelas').order('nama_lengkap')
    // Fetch poin for this TA+semester
    const { data: pointsData } = await supabase.from('student_points').select('*')
      .eq('tahun_ajaran_id', activeTa.id).eq('semester', semester)

    const uniqueKelas = [...new Set((siswaData || []).map(s => s.kelas).filter(Boolean))].sort()
    setAllKelas(uniqueKelas)
    setStudents(siswaData || [])

    const pointsMap = {}
    ;(pointsData || []).forEach(p => { pointsMap[p.nisn] = p })
    setStudentPoints(pointsMap)
    setLoading(false)
  }

  const getStudentPoin = (nisn) => studentPoints[nisn] || { total_poin: defaultPoin, poin_default: defaultPoin, tahap_pembinaan_aktif: null }

  const getActiveStage = (poin) => stages.find(s => poin <= s.batas_poin) || null

  const handleSaveDefault = async () => {
    setSavingDefault(true)
    const { error } = await supabase.from('pengaturan_sekolah').upsert({ setting_key: 'poin_default_siswa', setting_value: defaultPoin.toString() }, { onConflict: 'setting_key' })
    setSavingDefault(false)
    if (error) alert('Gagal: ' + error.message)
    else alert('Poin default berhasil diperbarui.')
  }

  const handleResetPoin = async (siswa) => {
    const confirmed = await requestConfirm({
      title: 'Reset Poin Siswa?',
      message: `Reset poin ${siswa.nama_lengkap} ke poin default (${defaultPoin})? Riwayat pencatatan tidak akan dihapus.`,
      confirmLabel: 'Reset', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    setResettingId(siswa.nisn)
    const { error } = await supabase.from('student_points').upsert({
      nisn: siswa.nisn, tahun_ajaran_id: activeTa.id, semester,
      total_poin: defaultPoin, poin_default: defaultPoin,
      tahap_pembinaan_aktif: null, updated_at: new Date().toISOString()
    }, { onConflict: 'nisn,tahun_ajaran_id,semester' })
    setResettingId(null)
    if (error) alert('Gagal: ' + error.message)
    else fetchStudents()
  }

  const handleResetAll = async () => {
    const confirmed = await requestConfirm({
      title: 'Reset Semua Poin?',
      message: `Reset poin seluruh siswa ke ${defaultPoin}? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Reset Semua', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    setShowResetAll(false)
    setLoading(true)
    const inserts = students.map(s => ({
      nisn: s.nisn, tahun_ajaran_id: activeTa.id, semester,
      total_poin: defaultPoin, poin_default: defaultPoin,
      tahap_pembinaan_aktif: null, updated_at: new Date().toISOString()
    }))
    // Batch upsert
    for (let i = 0; i < inserts.length; i += 50) {
      await supabase.from('student_points').upsert(inserts.slice(i, i+50), { onConflict: 'nisn,tahun_ajaran_id,semester' })
    }
    fetchStudents()
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.nama_lengkap?.toLowerCase().includes(q) || s.nisn?.includes(q)
    const matchKelas = filterKelas === 'all' || s.kelas === filterKelas
    const poin = getStudentPoin(s.nisn).total_poin
    const stage = getActiveStage(poin)
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'aman' && poin > 75) ||
      (filterStatus === 'perhatian' && poin > 50 && poin <= 75) ||
      (filterStatus === 'waspada' && poin > 25 && poin <= 50) ||
      (filterStatus === 'kritis' && poin <= 25)
    return matchSearch && matchKelas && matchStatus
  })

  // Stats
  const stats = students.reduce((acc, s) => {
    const p = getStudentPoin(s.nisn).total_poin
    if (p > 75) acc.aman++
    else if (p > 50) acc.perhatian++
    else if (p > 25) acc.waspada++
    else acc.kritis++
    return acc
  }, { aman: 0, perhatian: 0, waspada: 0, kritis: 0 })

  return (
    <div className="animate-slide-up space-y-5">
      {ConfirmModalComponent}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pengaturan Poin Siswa</h2>
          <p className="text-slate-500 text-sm mt-0.5">{activeTa?.nama} — Kelola dan pantau poin seluruh siswa</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Semester:</span>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {[1,2].map(s => (
              <button key={s} onClick={() => setSemester(s)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${semester === s ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'}`}>
                Semester {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Default Poin Setting */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-indigo-800">Poin Default Siswa</p>
            <p className="text-xs text-indigo-600 mt-0.5">Nilai poin awal untuk siswa baru. Berlaku global untuk semua semester.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" value={defaultPoin} onChange={e => setDefaultPoin(parseInt(e.target.value) || 100)} min={1} max={1000}
              className="w-24 px-3 py-2 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-center" />
            <button onClick={handleSaveDefault} disabled={savingDefault}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-60 transition-all">
              {savingDefault ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Aman (>75)', value: stats.aman, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', statKey: 'aman' },
          { label: 'Perhatian (>50)', value: stats.perhatian, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', statKey: 'perhatian' },
          { label: 'Waspada (>25)', value: stats.waspada, color: 'bg-orange-50 border-orange-200 text-orange-700', statKey: 'waspada' },
          { label: 'Kritis (≤25)', value: stats.kritis, color: 'bg-red-50 border-red-200 text-red-700', statKey: 'kritis' },
        ].map(s => (
          <button key={s.statKey} onClick={() => setFilterStatus(filterStatus === s.statKey ? 'all' : s.statKey)}
            className={`border rounded-xl p-3 text-left transition-all ${s.color} ${filterStatus === s.statKey ? 'ring-2 ring-offset-1 ring-indigo-400' : 'hover:opacity-80'}`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs font-semibold mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Cari nama atau NISN..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={filterKelas} onChange={e => setFilterKelas(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700">
          <option value="all">Semua Kelas</option>
          {allKelas.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <button onClick={() => setShowResetAll(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold transition-all">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.69"/></svg>
          Reset Semua
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-medium">{filtered.length} siswa</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Siswa</th>
                  <th className="px-4 py-2.5 text-left">Kelas</th>
                  <th className="px-4 py-2.5 text-left w-48">Poin</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">Tahap Pembinaan</th>
                  <th className="px-4 py-2.5 text-center w-20">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const sp = getStudentPoin(s.nisn)
                  const poin = sp.total_poin
                  const maxPoin = sp.poin_default || defaultPoin
                  const pct = Math.max(0, Math.min(100, (poin / maxPoin) * 100))
                  const colors = getPoinColor(pct)
                  const stage = getActiveStage(poin)
                  return (
                    <tr key={s.nisn} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/80 ${i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-sm">{s.nama_lengkap}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{s.nisn}</p>
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">{s.kelas}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${colors.badge}`}>{poin}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {stage ? (
                          <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{stage.nama_tahap}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleResetPoin(s)} disabled={resettingId === s.nisn}
                          className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50 text-[10px] font-bold" title="Reset Poin">
                          {resettingId === s.nisn ? <div className="w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin" /> : (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.69"/></svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
