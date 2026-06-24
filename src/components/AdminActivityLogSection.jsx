import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminActivityLogSection() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_log')
      .select(`
        id, aktor, aksi, detail, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(100)
      
    if (!error && data) {
      setLogs(data)
    } else if (error) {
      console.error('Fetch Logs Error:', error)
    }
    setLoading(false)
  }

  const formatTime = (isoString) => {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(d)
  }

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Log Aktivitas</h2>
          <p className="text-slate-500 text-sm mt-1">Pemantauan aktivitas yang dilakukan oleh Admin dan Guru.</p>
        </div>
        <button onClick={fetchLogs} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
          <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="px-6 py-4 font-semibold w-48">Waktu</th>
                <th className="px-6 py-4 font-semibold w-48">Aktor</th>
                <th className="px-6 py-4 font-semibold">Tindakan</th>
                <th className="px-6 py-4 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Memuat log aktivitas...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Belum ada aktivitas yang tercatat.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{formatTime(log.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{log.aktor}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {log.aksi}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 truncate max-w-md" title={log.detail}>{log.detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
