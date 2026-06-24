import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const IconUsers = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
const IconTeacher = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
const IconShield = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
const IconFile = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>

export default function AdminDashboardSection() {
  const [stats, setStats] = useState({
    totalSiswa: 0,
    totalGuru: 0,
    totalRole: 0,
    totalPengumuman: 0,
    totalBerkas: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      // Fetch counts concurrently
      const [
        { count: siswaCount },
        { count: guruCount },
        { count: roleCount },
        { count: pengumumanCount },
        { count: berkasCount }
      ] = await Promise.all([
        supabase.from('siswa_lengkap').select('*', { count: 'exact', head: true }).eq('is_aktif', true),
        supabase.from('guru').select('*', { count: 'exact', head: true }),
        supabase.from('roles').select('*', { count: 'exact', head: true }),
        supabase.from('jenis_pengumuman').select('*', { count: 'exact', head: true }),
        supabase.from('berkas_pengumuman').select('*', { count: 'exact', head: true })
      ])

      setStats({
        totalSiswa: siswaCount || 0,
        totalGuru: guruCount || 0,
        totalRole: roleCount || 0,
        totalPengumuman: pengumumanCount || 0,
        totalBerkas: berkasCount || 0
      })
    } catch (err) {
      console.error("Error fetching stats", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">Memuat Statistik...</div>
  }

  return (
    <div className="animate-slide-up space-y-6">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 shadow-lg text-white relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Statistik Utama</h2>
          <p className="text-slate-300 text-sm md:text-base max-w-xl">
            Ringkasan data operasional SIAKD SMP Budi Mulia Jakarta saat ini.
          </p>
        </div>
        <svg className="absolute right-0 bottom-0 opacity-10 w-64 h-64 -mb-16 -mr-16 transform rotate-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 3.8l7.5 14.2H4.5L12 5.8z"/></svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <IconUsers />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Siswa Aktif</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalSiswa}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <IconTeacher />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Guru</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalGuru}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <IconShield />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Roles</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalRole}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <IconFile />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Jenis Pengumuman</p>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalPengumuman}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">Aktivitas Berkas</h3>
        <div className="flex items-center gap-6">
          <div className="relative w-32 h-32 flex items-center justify-center">
            {/* Simple CSS Doughnut Chart */}
            <div className="absolute inset-0 rounded-full border-8 border-slate-100"></div>
            <div className="absolute inset-0 rounded-full border-8 border-indigo-500" style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)' }}></div>
            <div className="text-center relative z-10">
              <span className="text-xl font-bold text-slate-800">{stats.totalBerkas}</span>
              <span className="block text-[10px] text-slate-500 uppercase font-semibold">Berkas</span>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-lg mb-1">Total Dokumen PDF</h4>
            <p className="text-sm text-slate-500 max-w-sm">
              Sebanyak {stats.totalBerkas} dokumen PDF telah diunggah ke cloud dan siap diakses oleh siswa.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
