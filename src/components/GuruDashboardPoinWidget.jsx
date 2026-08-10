import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function GuruDashboardPoinWidget({ session, activeTa, setActiveMenu, fitur }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all') // 'all' | 'positif' | 'negatif'

  // Date filter state
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [datePreset, setDatePreset] = useState('all') // 'all' | 'today' | '7days' | '30days' | 'custom'
  const [showCustomDate, setShowCustomDate] = useState(false)

  // Extract wali kelas list for current TA
  const waliKelasList = session?.kelas
    ?.filter(k => activeTa && (k.tahun_ajaran_id == activeTa?.id || !k.tahun_ajaran_id))
    ?.map(k => k.kelas)
    ?.filter(Boolean) || []

  const isWaliKelas = waliKelasList.length > 0

  const fetchRecords = async () => {
    if (!activeTa?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      let query = supabase
        .from('point_records')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)

      // Only filter by Wali Kelas classes if teacher is a Wali Kelas
      if (isWaliKelas) {
        query = query.in('kelas', waliKelasList)
      }

      // Date range filtering
      if (filterDateFrom && filterDateTo) {
        if (filterDateFrom === filterDateTo) {
          query = query.eq('tanggal', filterDateFrom)
        } else {
          query = query.gte('tanggal', filterDateFrom).lte('tanggal', filterDateTo)
        }
      } else if (filterDateFrom) {
        query = query.gte('tanggal', filterDateFrom)
      } else if (filterDateTo) {
        query = query.lte('tanggal', filterDateTo)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(30)

      if (!error && data) {
        setRecords(data)
      }
    } catch (err) {
      console.warn('Gagal memuat catatan poin siswa:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [activeTa, session, filterDateFrom, filterDateTo])

  const filteredRecords = records.filter(r => {
    const poin = Number(r.poin_diberikan) || 0
    if (filterType === 'positif') return poin > 0
    if (filterType === 'negatif') return poin < 0
    return true
  })

  const formatTanggal = (tglStr) => {
    if (!tglStr) return ''
    try {
      const d = new Date(tglStr)
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    } catch {
      return tglStr
    }
  }

  const applyPreset = (preset) => {
    setDatePreset(preset)
    const today = new Date().toISOString().slice(0, 10)
    if (preset === 'all') {
      setFilterDateFrom('')
      setFilterDateTo('')
      setShowCustomDate(false)
    } else if (preset === 'today') {
      setFilterDateFrom(today)
      setFilterDateTo(today)
      setShowCustomDate(false)
    } else if (preset === '7days') {
      const now = new Date()
      const from = new Date(now.setDate(now.getDate() - 7)).toISOString().slice(0, 10)
      setFilterDateFrom(from)
      setFilterDateTo(today)
      setShowCustomDate(false)
    } else if (preset === '30days') {
      const now = new Date()
      const from = new Date(now.setDate(now.getDate() - 30)).toISOString().slice(0, 10)
      setFilterDateFrom(from)
      setFilterDateTo(today)
      setShowCustomDate(false)
    } else if (preset === 'custom') {
      setShowCustomDate(true)
    }
  }

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
              Catatan Poin Siswa
            </h3>
            {isWaliKelas && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {waliKelasList.length === 1 ? `Kelas ${waliKelasList[0]}` : `Perwalian: ${waliKelasList.join(', ')}`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isWaliKelas
              ? `Catatan poin positif & pelanggaran siswa kelas ${waliKelasList.join(', ')}`
              : 'Catatan poin positif & pelanggaran siswa'}
          </p>
        </div>
        <button
          onClick={fetchRecords}
          title="Refresh Data"
          className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Date Filter Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-1 flex-wrap text-[10px]">
          <span className="text-slate-400 font-bold uppercase tracking-wider">Waktu:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg font-bold">
            <button
              onClick={() => applyPreset('all')}
              className={`px-2 py-0.5 rounded transition-all ${
                datePreset === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => applyPreset('today')}
              className={`px-2 py-0.5 rounded transition-all ${
                datePreset === 'today' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => applyPreset('7days')}
              className={`px-2 py-0.5 rounded transition-all ${
                datePreset === '7days' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              7 Hari
            </button>
            <button
              onClick={() => applyPreset('30days')}
              className={`px-2 py-0.5 rounded transition-all ${
                datePreset === '30days' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              30 Hari
            </button>
            <button
              onClick={() => applyPreset('custom')}
              className={`px-2 py-0.5 rounded transition-all ${
                datePreset === 'custom' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Kustom 📅
            </button>
          </div>
        </div>

        {/* Custom date range inputs */}
        {(showCustomDate || datePreset === 'custom') && (
          <div className="flex items-center gap-1.5 mt-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setDatePreset('custom') }}
              title="Dari Tanggal"
              className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-700 outline-none text-[11px] font-medium"
            />
            <span className="text-slate-400 font-bold text-[10px]">s/d</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setDatePreset('custom') }}
              title="Sampai Tanggal"
              className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-700 outline-none text-[11px] font-medium"
            />
            {(filterDateFrom || filterDateTo) && (
              <button
                onClick={() => applyPreset('all')}
                className="text-[10px] text-rose-500 font-bold hover:underline ml-auto"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Jenis Poin */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mb-3 text-[11px] font-bold">
        <button
          onClick={() => setFilterType('all')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            filterType === 'all'
              ? 'bg-white text-slate-800 shadow-sm font-black'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Semua ({records.length})
        </button>
        <button
          onClick={() => setFilterType('positif')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            filterType === 'positif'
              ? 'bg-emerald-600 text-white shadow-sm font-black'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          ➕ Positif ({records.filter(r => (Number(r.poin_diberikan) || 0) > 0).length})
        </button>
        <button
          onClick={() => setFilterType('negatif')}
          className={`flex-1 py-1.5 rounded-lg transition-all ${
            filterType === 'negatif'
              ? 'bg-rose-600 text-white shadow-sm font-black'
              : 'text-rose-700 hover:bg-rose-50'
          }`}
        >
          ⚠️ Negatif ({records.filter(r => (Number(r.poin_diberikan) || 0) < 0).length})
        </button>
      </div>

      {/* Content / List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-6 px-3 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
          <p className="text-xs text-slate-400 font-medium">
            {filterType === 'positif'
              ? `Belum ada catatan poin positif ${isWaliKelas ? `siswa kelas ${waliKelasList.join(', ')}` : ''}.`
              : filterType === 'negatif'
              ? `Belum ada catatan poin pelanggaran ${isWaliKelas ? `siswa kelas ${waliKelasList.join(', ')}` : ''}.`
              : `Belum ada catatan poin ${isWaliKelas ? `siswa kelas ${waliKelasList.join(', ')}` : ''}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {filteredRecords.slice(0, 10).map((r) => {
            const poinVal = Number(r.poin_diberikan) || 0
            const isPositif = poinVal > 0

            return (
              <div
                key={r.id}
                className={`p-3 rounded-xl border transition-all text-left flex items-start justify-between gap-2 ${
                  isPositif
                    ? 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-200'
                    : 'bg-rose-50/40 border-rose-100 hover:border-rose-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {r.nama_siswa}
                    </span>
                    {r.kelas && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
                        {r.kelas}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 mt-1 line-clamp-1">
                    {r.jenis || r.keterangan || 'Catatan Poin'}
                  </p>
                  {r.keterangan && r.jenis && r.keterangan !== r.jenis && (
                    <p className="text-[10px] text-slate-400 italic line-clamp-1 mt-0.5">
                      "{r.keterangan}"
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-400 font-medium">
                    <span>{formatTanggal(r.tanggal)}</span>
                    {r.dicatat_oleh && <span>• oleh {r.dicatat_oleh}</span>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span
                    className={`inline-block text-xs font-black px-2 py-1 rounded-lg border ${
                      isPositif
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}
                  >
                    {isPositif ? `+${poinVal}` : `${poinVal}`} Poin
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Navigation */}
      {(fitur?.has('catat_poin') || fitur?.has('akses_rekap_poin')) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">
            Total {records.length} riwayat {isWaliKelas ? `kelas ${waliKelasList.join(', ')}` : ''}
          </span>
          <button
            onClick={() => {
              if (fitur?.has('catat_poin')) setActiveMenu('catat_poin')
              else if (fitur?.has('akses_rekap_poin')) setActiveMenu('rekap_poin')
            }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
          >
            <span>Catat / Kelola Poin</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
