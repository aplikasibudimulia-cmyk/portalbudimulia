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
  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr)
  const [presensiList, setPresensiList] = useState([])
  const [loading, setLoading] = useState(true)

  // Generate opsi bulan (misal 6 bulan terakhir)
  const monthOptions = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    return { val, label }
  })

  useEffect(() => {
    fetchPresensi()
  }, [selectedMonth])

  const fetchPresensi = async () => {
    setLoading(true)
    // Mencari tanggal yang dimulai dengan YYYY-MM
    // Menggunakan operator like atau gte/lte
    const startDate = `${selectedMonth}-01`
    const nextMonthDate = new Date(selectedMonth + '-01')
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
    const endDate = nextMonthDate.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('presensi_harian')
      .select('*')
      .eq('siswa_nisn', studentData.nisn)
      .gte('tanggal', startDate)
      .lt('tanggal', endDate)
      .order('tanggal', { ascending: false })

    if (!error && data) {
      setPresensiList(data)
    }
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
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat"
          >
            {monthOptions.map(opt => (
              <option key={opt.val} value={opt.val}>{opt.label}</option>
            ))}
          </select>
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
            {presensiList.map((item) => {
              const d = new Date(item.tanggal)
              const tanggalStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              const statusColor = STATUS_COLORS[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
              const statusLabel = STATUS_LABELS[item.status] || item.status

              return (
                <div key={item.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-black text-lg shrink-0 ${statusColor}`}>
                      {item.status}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{tanggalStr}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2"/></svg>
                        Tercatat pukul <span className="font-bold text-slate-700">{item.waktu || '-'} WIB</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full border ${statusColor}`}>
                      {statusLabel}
                    </span>
                    {item.metode === 'qr_scan' && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
                        Scan QR
                      </span>
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
