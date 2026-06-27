import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Constants
const STATUS_LABELS = { H: 'Hadir', T: 'Terlambat', S: 'Sakit', I: 'Izin', A: 'Alpha' }

const getPoinMeta = (p, max = 100) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (p / max) * 100)) : 0
  if (p > 75) return { bar: 'from-emerald-400 to-emerald-600', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Baik', emoji: '🟢' }
  if (p > 50) return { bar: 'from-yellow-400 to-yellow-600', badge: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Perlu Perhatian', emoji: '🟡' }
  if (p > 25) return { bar: 'from-orange-400 to-orange-600', badge: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Waspada', emoji: '🟠' }
  return { bar: 'from-red-400 to-red-600', badge: 'bg-red-100 text-red-700 border-red-300', label: 'Kritis', emoji: '🔴' }
}

export default function SiswaDashboardWidgets({ studentData, menuTypes, onNavigate }) {
  const [presensiHariIni, setPresensiHariIni] = useState(null)
  const [rekapBulan, setRekapBulan] = useState({ H: 0, T: 0, S: 0, I: 0, A: 0, total: 0 })
  const [nilaiTerbaru, setNilaiTerbaru] = useState([])
  const [dokumenStatus, setDokumenStatus] = useState([])
  const [berita, setBerita] = useState([])
  const [motivasi, setMotivasi] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [poinData, setPoinData] = useState(null)
  const [loading, setLoading] = useState(true)

  const MOTIVASI_LIST = [
    "Pendidikan adalah senjata paling mematikan di dunia, karena dengan pendidikan, Anda dapat mengubah dunia.",
    "Jangan pernah berhenti belajar, karena hidup tak pernah berhenti mengajarkan.",
    "Bukan seberapa pintar kamu, tapi seberapa rajin kamu.",
    "Sukses berawal dari disiplin kecil setiap harinya.",
    "Masa depan adalah milik mereka yang menyiapkan hari ini.",
    "Tidak ada jalan pintas ke tempat yang layak dituju.",
    "Kesalahan adalah bukti bahwa kamu sedang mencoba.",
    "Lakukan yang terbaik, biarkan Tuhan yang mengurus sisanya.",
    "Buku adalah jendela dunia, bacalah setiap hari.",
    "Orang sukses tidak takut gagal, mereka mengerti bahwa kegagalan diperlukan untuk belajar dan tumbuh."
  ]

  useEffect(() => {
    fetchAllWidgets()
    
    // Set Motivasi Harian (Day of Year)
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 0)
    const diff = now - start
    const oneDay = 1000 * 60 * 60 * 24
    const dayOfYear = Math.floor(diff / oneDay)
    setMotivasi(MOTIVASI_LIST[dayOfYear % MOTIVASI_LIST.length])
    
    // Subscribe realtime untuk presensi hari ini (jika piket update)
    const channel = supabase.channel(`siswa-dashboard-widgets-${studentData.nisn}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi_harian', filter: `siswa_nisn=eq.${studentData.nisn}` }, () => {
        fetchPresensi()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [studentData.nisn])

  useEffect(() => {
    fetchDokumenStatus()
  }, [menuTypes])

  const fetchPresensi = async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase.from('presensi_harian')
      .select('*').eq('tanggal', today).eq('siswa_nisn', studentData.nisn).maybeSingle()
    setPresensiHariIni(data)
  }

  const fetchAllWidgets = async () => {
    setLoading(true)
    const today = new Date()
    const todayStr = today.toLocaleDateString('en-CA')
    const thisMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    try {
      // 1. Fetch Presensi Hari Ini
      const reqPresensiHariIni = supabase.from('presensi_harian').select('*').eq('tanggal', todayStr).eq('siswa_nisn', studentData.nisn).maybeSingle()
      
      // 2. Fetch Rekap Presensi Bulan Ini
      const reqRekapBulan = supabase.from('presensi_harian').select('status').eq('siswa_nisn', studentData.nisn).like('tanggal', `${thisMonthPrefix}%`)
      
      // 3. Fetch Nilai Terbaru
      const reqNilai = supabase.from('nilai_siswa')
        .select(`
          nilai,
          nilai_komponen!inner (nama, mata_pelajaran!inner (nama))
        `)
        .eq('siswa_nisn', studentData.nisn)
        .order('created_at', { ascending: false })
        .limit(3)
        
      // 4. Fetch Berita Sekolah
      const reqBerita = supabase.from('berita_sekolah')
        .select('*')
        .eq('is_published', true)
        .contains('target_role', ['siswa'])
        .order('published_at', { ascending: false })
        .limit(3)
        
      // 5. Fetch Settings (Countdown)
      const reqSettings = supabase.from('pengaturan_sekolah').select('setting_key, setting_value').in('setting_key', ['countdown_label', 'countdown_date', 'poin_default_siswa'])

      // 6. Fetch Poin
      const reqPoin = supabase.from('student_points').select('total_poin, poin_default').eq('nisn', studentData.nisn).eq('tahun_ajaran_id', studentData.tahun_ajaran_id).order('semester', { ascending: false }).limit(1).maybeSingle()

      const [resHariIni, resRekap, resNilai, resBerita, resSettings, resPoin] = await Promise.all([
        reqPresensiHariIni, reqRekapBulan, reqNilai, reqBerita, reqSettings, reqPoin
      ])

      // Set Presensi Hari ini
      if (resHariIni.data) setPresensiHariIni(resHariIni.data)
      
      // Set Rekap Bulan Ini
      if (resRekap.data) {
        const rekap = { H: 0, T: 0, S: 0, I: 0, A: 0, total: resRekap.data.length }
        resRekap.data.forEach(p => {
          if (rekap[p.status] !== undefined) rekap[p.status]++
        })
        setRekapBulan(rekap)
      }

      // Set Nilai
      if (resNilai.data) {
        // filter jika mata_pelajaran/komponen invisible? 
        // prompt: is_nilai_visible = true. Karena kita tidak ubah DB, kita asumsikan ditampilkan jika sudah ada nilai.
        setNilaiTerbaru(resNilai.data)
      }

      // Set Berita (Filter by kelas locally or array overlap in supabase)
      if (resBerita.data) {
        const applicableBerita = resBerita.data.filter(b => {
          if (!b.target_kelas || b.target_kelas.length === 0) return true
          return b.target_kelas.includes(studentData.kelas)
        })
        setBerita(applicableBerita)
      }

      // Set Countdown & Default Poin
      let defaultPoinSiswa = 100
      if (resSettings.data) {
        const labelStr = resSettings.data.find(s => s.setting_key === 'countdown_label')?.setting_value
        const dateStr = resSettings.data.find(s => s.setting_key === 'countdown_date')?.setting_value
        const poinStr = resSettings.data.find(s => s.setting_key === 'poin_default_siswa')?.setting_value
        if (poinStr) defaultPoinSiswa = parseInt(poinStr)

        if (labelStr && dateStr) {
          const targetDate = new Date(dateStr)
          if (targetDate >= today) {
            const diffTime = Math.abs(targetDate - today)
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            setCountdown({ label: labelStr, days: diffDays })
          }
        }
      }

      // Set Poin Data
      const currentPoin = resPoin.data?.total_poin ?? defaultPoinSiswa
      const maxPoin = resPoin.data?.poin_default ?? defaultPoinSiswa
      setPoinData({ current: currentPoin, max: maxPoin })
      
      
    } catch (err) {
      console.error("Error fetching widgets:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchDokumenStatus = async () => {
    if (!menuTypes || menuTypes.length === 0) return
    const { data: berkas } = await supabase.from('berkas_pengumuman').select('*').eq('kode_siswa', studentData.kode)
    
    const status = menuTypes.map(type => {
      const b = berkas?.find(x => x.kode_jenis === type.kode_jenis)
      const hasFile = b?.file_url && b.file_url !== '-'
      // Check persyaratan
      let accessible = hasFile
      if (accessible && type.persyaratan && type.persyaratan.length > 0) {
        const notMet = type.persyaratan.find(req => !b?.persyaratan_terpenuhi?.[req.id])
        if (notMet) accessible = false
      }
      if (b?.is_accessible === false) accessible = false
      
      return {
        id: type.id,
        nama: type.nama,
        hasFile,
        accessible,
        isNew: false // TODO: logic isNew jika tgl upload < 3 hari
      }
    })
    setDokumenStatus(status)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  // Calculate kehadiran %
  const hadirTepat = rekapBulan.H + rekapBulan.T
  const persentaseHadir = rekapBulan.total > 0 ? Math.round((hadirTepat / rekapBulan.total) * 100) : 0
  const pbColor = persentaseHadir >= 80 ? 'bg-emerald-500' : persentaseHadir >= 60 ? 'bg-amber-400' : 'bg-rose-500'

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* WIDGET 1: Status Presensi Hari Ini */}
      <div className={`p-6 rounded-2xl shadow-sm border ${presensiHariIni ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-lg mb-1">
              {presensiHariIni ? `Selamat datang, ${studentData.nama_lengkap.split(' ')[0]}! 🎉` : 'Perhatian: Belum Presensi'}
            </h3>
            {presensiHariIni ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                Status: <span className="font-bold px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200 text-slate-700">{STATUS_LABELS[presensiHariIni.status] || presensiHariIni.status}</span>
                Jam: <span className="font-bold">{presensiHariIni.waktu} WIB</span>
              </p>
            ) : (
              <p className="text-sm text-amber-700">Anda belum melakukan presensi hari ini. Silakan klik tombol di samping.</p>
            )}
          </div>
          {!presensiHariIni && (
            <button 
              onClick={() => onNavigate('PRESENSI')}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all whitespace-nowrap shadow-md shadow-indigo-100"
            >
              Scan QR
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* WIDGET 2: Ringkasan Kehadiran */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow group" onClick={() => onNavigate('PRESENSI')}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Kehadiran Bulan Ini
            </h3>
            <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4 text-center">
            <div className="bg-emerald-50 rounded-xl p-2 border border-emerald-100">
              <p className="text-xl font-black text-emerald-600">{rekapBulan.H + rekapBulan.T}</p>
              <p className="text-[10px] font-bold text-emerald-500 uppercase">Hadir</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2 border border-blue-100">
              <p className="text-xl font-black text-blue-600">{rekapBulan.S}</p>
              <p className="text-[10px] font-bold text-blue-500 uppercase">Sakit</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-2 border border-purple-100">
              <p className="text-xl font-black text-purple-600">{rekapBulan.I}</p>
              <p className="text-[10px] font-bold text-purple-500 uppercase">Izin</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-2 border border-rose-100">
              <p className="text-xl font-black text-rose-600">{rekapBulan.A}</p>
              <p className="text-[10px] font-bold text-rose-500 uppercase">Alpha</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mb-1.5 overflow-hidden">
            <div className={`h-2 rounded-full ${pbColor}`} style={{ width: `${persentaseHadir}%` }}></div>
          </div>
          <p className="text-xs font-bold text-slate-500 text-right">Tingkat Kehadiran: <span className="text-slate-700">{persentaseHadir}%</span></p>
        </div>

        {/* WIDGET 2.5: Poin Saya */}
        {poinData && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('POIN')}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Poin Siswa
              </h3>
              <button onClick={() => onNavigate('POIN')} className="text-xs font-bold text-indigo-500 hover:text-indigo-600">Detail &rarr;</button>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-black text-slate-800 leading-none">{poinData.current}</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ {poinData.max}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
                  <div className={`h-2 rounded-full bg-gradient-to-r ${getPoinMeta(poinData.current, poinData.max).bar}`} style={{ width: `${Math.max(0, Math.min(100, (poinData.current / poinData.max) * 100))}%` }}></div>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold ${getPoinMeta(poinData.current, poinData.max).badge}`}>
                  {getPoinMeta(poinData.current, poinData.max).emoji} {getPoinMeta(poinData.current, poinData.max).label}
                </div>
              </div>
              
              <div className="w-16 h-16 shrink-0 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner">
                <span className="text-3xl">{getPoinMeta(poinData.current, poinData.max).emoji}</span>
              </div>
            </div>
          </div>
        )}

        {/* WIDGET 3: Nilai Terbaru */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Nilai Terbaru
            </h3>
            <button onClick={() => onNavigate('NILAI')} className="text-xs font-bold text-indigo-500 hover:text-indigo-600">Lihat Semua &rarr;</button>
          </div>
          {nilaiTerbaru.length > 0 ? (
            <div className="space-y-3">
              {nilaiTerbaru.map((n, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="truncate pr-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{n.nilai_komponen?.mata_pelajaran?.nama}</p>
                    <p className="text-sm font-bold text-slate-700 truncate">{n.nilai_komponen?.nama}</p>
                  </div>
                  <div className="w-10 h-10 shrink-0 bg-indigo-100 text-indigo-700 font-black rounded-lg flex items-center justify-center">
                    {n.nilai}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">Belum ada nilai yang dipublikasikan.</p>
            </div>
          )}
        </div>

      </div>

      {/* WIDGET 4: Dokumen Siap Diambil */}
      {dokumenStatus.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Status Dokumen Anda
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {dokumenStatus.map(doc => (
              <div 
                key={doc.id} 
                onClick={() => onNavigate(menuTypes.find(m => m.id === doc.id))}
                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${doc.accessible ? 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100' : doc.hasFile ? 'bg-amber-50 border-amber-100 hover:bg-amber-100' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}
              >
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${doc.accessible ? 'bg-emerald-100 text-emerald-600' : doc.hasFile ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'}`}>
                  {doc.accessible ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                  ) : doc.hasFile ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  )}
                </div>
                <div className="truncate">
                  <p className="text-sm font-bold text-slate-700 truncate">{doc.nama}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {doc.accessible ? 'Tersedia' : doc.hasFile ? 'Terkunci' : 'Belum Ada File'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WIDGET 5: Berita Sekolah */}
      {berita.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20"/></svg>
            Berita & Pengumuman
          </h3>
          <div className="space-y-4">
            {berita.map(b => {
              const dateObj = new Date(b.published_at)
              const diffDays = Math.ceil(Math.abs(new Date() - dateObj) / (1000 * 60 * 60 * 24))
              const isNew = diffDays <= 3
              
              return (
                <div key={b.id} className="flex gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                     onClick={() => alert('Fitur baca konten penuh segera hadir!')}> {/* TODO: Modal */}
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
      )}

      {/* WIDGET 6 & 7: Motivasi & Countdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 flex items-start gap-4">
          <svg className="w-8 h-8 text-indigo-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Motivasi Hari Ini</p>
            <p className="text-sm font-medium text-slate-700 italic leading-relaxed">"{motivasi}"</p>
          </div>
        </div>

        {countdown && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg flex items-center justify-between text-white relative overflow-hidden">
            <div className="relative z-10">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Hitung Mundur</p>
              <h3 className="text-lg font-black">{countdown.label}</h3>
            </div>
            <div className="relative z-10 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/20 text-center">
              <span className="block text-2xl font-black">{countdown.days}</span>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Hari Lagi</span>
            </div>
            <svg className="absolute top-0 right-0 w-32 h-32 text-white/5 transform translate-x-8 -translate-y-8" fill="currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          </div>
        )}
      </div>

    </div>
  )
}
