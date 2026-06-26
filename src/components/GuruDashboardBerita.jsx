import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function GuruDashboardBerita({ session }) {
  const [berita, setBerita] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBerita = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('berita_sekolah')
          .select('*')
          .eq('is_published', true)
          .contains('target_role', ['guru'])
          .order('published_at', { ascending: false })
          .limit(5)
        
        if (!error && data) {
          setBerita(data)
        }
      } catch (err) {
        console.error("Error fetching berita guru:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchBerita()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (berita.length === 0) return null

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20"/></svg>
        Berita & Pengumuman Sekolah
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {berita.map(b => {
          const dateObj = new Date(b.published_at)
          const diffDays = Math.ceil(Math.abs(new Date() - dateObj) / (1000 * 60 * 60 * 24))
          const isNew = diffDays <= 3
          
          return (
            <div key={b.id} className="flex gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
              {b.gambar_url && (
                <img src={b.gambar_url} alt={b.judul} className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-lg shrink-0 border border-slate-200" />
              )}
              <div className="flex-1">
                <div className="flex gap-2 items-center mb-1">
                  {isNew && <span className="bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Baru</span>}
                  <span className="text-xs text-slate-400 font-medium">{dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                </div>
                <h4 className="font-bold text-slate-800 text-sm md:text-base line-clamp-1 mb-1">{b.judul}</h4>
                <p className="text-xs text-slate-500 line-clamp-2">{b.konten}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
