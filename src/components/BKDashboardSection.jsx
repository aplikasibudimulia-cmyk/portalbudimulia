import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function BKDashboardSection({ session, activeTa, onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pendingCount: 0, todayCount: 0, totalCount: 0, siswaPerhatianCount: 0 })
  const [todayAgenda, setTodayAgenda] = useState([])
  const [siswaPerhatian, setSiswaPerhatian] = useState([])
  const [berita, setBerita] = useState([])

  const bkKelas = session?.bk_kelas || []
  const bkKelasStr = bkKelas.length > 0 ? bkKelas.join(', ') : '—'

  const today = new Date()
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const hariIni = HARI[today.getDay()]

  useEffect(() => {
    if (session?.id) fetchAll()
  }, [session, activeTa])

  const fetchAll = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchKonsultasiStats(), fetchSiswaPerhatian(), fetchBerita()])
    } catch (e) { console.error('BK Dashboard error:', e) }
    setLoading(false)
  }

  const fetchKonsultasiStats = async () => {
    const { data: slots } = await supabase
      .from('bk_konsultasi_jadwal').select('id, hari, jam_mulai, jam_selesai').eq('guru_id', session.id)
    const slotIds = (slots || []).map(s => s.id)
    if (slotIds.length === 0) return

    const { data: bookings } = await supabase
      .from('bk_konsultasi_booking')
      .select('*, bk_konsultasi_jadwal(hari, jam_mulai, jam_selesai), siswa_lengkap(nama_lengkap, kelas)')
      .in('jadwal_id', slotIds)

    const allB = bookings || []
    const pending = allB.filter(b => b.status === 'pending').length
    const total = allB.filter(b => b.status !== 'ditolak').length
    const todayB = allB.filter(b => b.status === 'disetujui' && b.bk_konsultasi_jadwal?.hari === hariIni)

    setTodayAgenda(todayB)
    setStats(prev => ({ ...prev, pendingCount: pending, todayCount: todayB.length, totalCount: total }))
  }

  const fetchSiswaPerhatian = async () => {
    if (!activeTa?.id) return
    const { data: spRaw } = await supabase
      .from('student_points')
      .select('nisn, total_poin, poin_default, siswa_lengkap(nama_lengkap, kelas)')
      .eq('tahun_ajaran_id', activeTa.id)
      .order('total_poin', { ascending: true })
      .limit(50)

    let filtered = (spRaw || []).filter(sp => sp.total_poin < (sp.poin_default ?? 100))
    if (bkKelas.length > 0) filtered = filtered.filter(sp => bkKelas.includes(sp.siswa_lengkap?.kelas))
    setSiswaPerhatian(filtered.slice(0, 5))
    setStats(prev => ({ ...prev, siswaPerhatianCount: filtered.length }))
  }

  const fetchBerita = async () => {
    const { data } = await supabase.from('berita').select('id, judul, created_at, kategori')
      .eq('is_published', true).order('created_at', { ascending: false }).limit(4)
    setBerita(data || [])
  }

  const getPoinColor = (poin, def = 100) => {
    const r = poin / def
    if (r > 0.75) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    if (r > 0.5) return 'bg-orange-50 text-orange-700 border-orange-200'
    return 'bg-red-50 text-red-700 border-red-200'
  }

  const statCards = [
    { label: 'Menunggu Persetujuan', value: stats.pendingCount, unit: 'Konsultasi', color: 'amber', action: () => onNavigate?.('konsultasi_bk'), urgent: stats.pendingCount > 0,
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
    { label: 'Sesi Hari Ini', value: stats.todayCount, unit: 'Sesi', color: 'indigo',
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Total Konsultasi', value: stats.totalCount, unit: 'Sesi', color: 'emerald',
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> },
    { label: 'Siswa Perlu Perhatian', value: stats.siswaPerhatianCount, unit: 'Siswa', color: 'rose', action: () => onNavigate?.('rekap_poin'),
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> },
  ]

  const cm = {
    amber:   'bg-amber-50 text-amber-600 border-amber-100',
    indigo:  'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    rose:    'bg-rose-50 text-rose-600 border-rose-100',
  }

  return (
    <div className="animate-slide-up flex flex-col gap-6">

      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 rounded-2xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden">
        <svg className="absolute -right-10 -top-10 w-56 h-56 opacity-10" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" fill="none" stroke="white" strokeWidth="2"/>
          <circle cx="100" cy="100" r="50" fill="none" stroke="white" strokeWidth="1.5"/>
          <circle cx="100" cy="100" r="20" fill="white"/>
        </svg>
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="inline-block px-2.5 py-1 bg-white/20 text-white text-xs font-bold rounded-full uppercase tracking-wide mb-2">Guru BK</span>
            <h2 className="text-2xl md:text-3xl font-bold mb-1">Selamat Datang, {session.nama_guru}! 👋</h2>
            <p className="text-teal-100 text-sm max-w-xl">
              Anda bertugas sebagai Guru Bimbingan Konseling.
              {bkKelas.length > 0 && <> Kelas BK: <strong className="text-white bg-teal-500/40 px-2 py-0.5 rounded">{bkKelasStr}</strong>.</>}
            </p>
            {stats.pendingCount > 0 && (
              <button onClick={() => onNavigate?.('konsultasi_bk')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white text-teal-700 text-sm font-bold rounded-xl hover:bg-teal-50 transition-all shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"/>
                {stats.pendingCount} konsultasi menunggu persetujuan →
              </button>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-teal-200 text-xs">{hariIni},</p>
            <p className="text-white text-sm font-bold">{today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} onClick={card.action}
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 transition-all duration-200 ${card.action ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''} ${card.urgent ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${cm[card.color]}`}>{card.icon}</div>
            <div>
              <p className="text-xs text-slate-500 font-semibold">{card.label}</p>
              <div className="flex items-end gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-slate-800">
                  {loading ? <span className="w-8 h-6 bg-slate-100 rounded animate-pulse inline-block"/> : card.value}
                </span>
                <span className="text-xs text-slate-400 mb-0.5">{card.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Kolom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Agenda Hari Ini */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Sesi Konsultasi Hari Ini</h3>
                <p className="text-xs text-slate-400">{hariIni}</p>
              </div>
            </div>
            <button onClick={() => onNavigate?.('konsultasi_bk')} className="text-xs text-indigo-600 font-bold hover:text-indigo-800">Kelola →</button>
          </div>
          {loading ? (
            <div className="flex flex-col gap-3 p-5">{[1,2].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse"/>)}</div>
          ) : todayAgenda.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Tidak Ada Sesi</p>
              <p className="text-xs text-slate-400 mt-1">Belum ada konsultasi yang dijadwalkan hari ini.</p>
            </div>
          ) : todayAgenda.map((b, i) => (
            <div key={b.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-50 hover:bg-slate-50">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{b.siswa_lengkap?.nama_lengkap || '—'}</p>
                <p className="text-xs text-slate-400">{b.siswa_lengkap?.kelas} · {b.bk_konsultasi_jadwal?.jam_mulai} – {b.bk_konsultasi_jadwal?.jam_selesai}</p>
              </div>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100 shrink-0">Disetujui</span>
            </div>
          ))}
        </div>

        {/* Siswa Perlu Perhatian */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Siswa Perlu Perhatian</h3>
                <p className="text-xs text-slate-400">Poin terkurangi di kelas BK Anda</p>
              </div>
            </div>
            <button onClick={() => onNavigate?.('rekap_poin')} className="text-xs text-rose-600 font-bold hover:text-rose-800">Lihat Semua →</button>
          </div>
          {loading ? (
            <div className="flex flex-col gap-3 p-5">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse"/>)}</div>
          ) : siswaPerhatian.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Semua Siswa Aman ✓</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada siswa bermasalah saat ini.</p>
            </div>
          ) : siswaPerhatian.map((sp, i) => (
            <div key={sp.nisn} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50 hover:bg-slate-50">
              <span className="text-xs font-black text-slate-400 w-4 text-center shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{sp.siswa_lengkap?.nama_lengkap || '—'}</p>
                <p className="text-xs text-slate-400">{sp.siswa_lengkap?.kelas}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-black border shrink-0 ${getPoinColor(sp.total_poin, sp.poin_default)}`}>
                {sp.total_poin} poin
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Berita Terbaru */}
      {berita.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="p-2 bg-slate-50 text-slate-600 rounded-xl">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-.586-1.414l-4.5-4.5A2 2 0 0015.5 3H14"/></svg>
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Pengumuman Terbaru</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {berita.map(b => (
              <div key={b.id} className="px-5 py-4 hover:bg-slate-50 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{b.judul}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(b.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {b.kategori && <span className="ml-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-medium">{b.kategori}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
