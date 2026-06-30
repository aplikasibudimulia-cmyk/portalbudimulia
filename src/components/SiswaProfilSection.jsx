import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SiswaProfilSection({ studentData, menuTypes }) {
  const [enrollments, setEnrollments] = useState([])
  const [rekapKehadiran, setRekapKehadiran] = useState({ H: 0, T: 0, S: 0, I: 0, A: 0, total: 0 })
  const [dokumenStatus, setDokumenStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [photoUrl, setPhotoUrl] = useState('')

  useEffect(() => {
    fetchProfileData()
  }, [studentData])

  const fetchProfileData = async () => {
    setLoading(true)
    try {
      // 1. Fetch Foto (Fallback)
      const { data: fotos } = await supabase.from('foto_siswa').select('cloudinary_url').eq('nisn', studentData.nisn).limit(1)
      let photo = fotos?.[0]?.cloudinary_url
      if (!photo) {
        photo = `https://res.cloudinary.com/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload/SKL-BM/FOTO_${studentData.nisn}_${studentData.tahun_ajaran_id}`
      }
      setPhotoUrl(photo)

      // 2. Fetch Enrollments
      const { data: enrolData } = await supabase
        .from('enrollment')
        .select(`
          kelas,
          is_active,
          tahun_ajaran (nama, semester)
        `)
        .eq('siswa_nisn', studentData.nisn)
        .order('created_at', { ascending: false })
      setEnrollments(enrolData || [])

      // 3. Fetch Rekap Kehadiran (All Time / Semester Ini)
      const { data: presensi } = await supabase
        .from('presensi_harian')
        .select('status')
        .eq('siswa_nisn', studentData.nisn)
      
      const rekap = { H: 0, T: 0, S: 0, I: 0, A: 0, total: presensi?.length || 0 }
      presensi?.forEach(p => {
        if (rekap[p.status] !== undefined) rekap[p.status]++
      })
      setRekapKehadiran(rekap)

      // 4. Fetch Dokumen Status
      if (menuTypes && menuTypes.length > 0) {
        const { data: berkas } = await supabase.from('berkas_pengumuman').select('*').eq('kode_siswa', studentData.kode)
        const status = menuTypes.map(type => {
          const b = berkas?.find(x => x.kode_jenis === (type.dokumen_kode_jenis || type.kode_jenis))
          const hasFile = b?.file_url && b.file_url !== '-'
          let accessible = hasFile
          if (accessible && type.persyaratan && type.persyaratan.length > 0) {
            const notMet = type.persyaratan.find(req => !b?.persyaratan_terpenuhi?.[req.id])
            if (notMet) accessible = false
          }
          if (b?.is_accessible === false) accessible = false
          
          return { id: type.id, nama: type.nama, hasFile, accessible }
        })
        setDokumenStatus(status)
      }

    } catch (err) {
      console.error("Error fetching profile:", err)
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoError = () => {
    setPhotoUrl(`https://ui-avatars.com/api/?name=${encodeURIComponent(studentData.nama_lengkap)}&background=e0e7ff&color=4338ca&size=200`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  const hadirTepat = rekapKehadiran.H + rekapKehadiran.T
  const persentaseHadir = rekapKehadiran.total > 0 ? Math.round((hadirTepat / rekapKehadiran.total) * 100) : 0
  const pbColor = persentaseHadir >= 80 ? 'bg-emerald-500' : persentaseHadir >= 60 ? 'bg-amber-400' : 'bg-rose-500'

  return (
    <div className="animate-slide-up space-y-6">
      
      {/* IDENTITAS UTAMA */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
        <div className="px-6 pb-8 md:px-10 flex flex-col md:flex-row gap-6 items-center md:items-end -mt-16 relative z-10 text-center md:text-left">
          <img 
            src={photoUrl} 
            onError={handlePhotoError}
            alt={studentData.nama_lengkap} 
            className="w-32 h-32 rounded-full border-4 border-white shadow-md object-cover bg-slate-50"
          />
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800">{studentData.nama_lengkap}</h2>
            <p className="text-slate-500 font-medium">Kelas {studentData.kelas} • NISN: {studentData.nisn}</p>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl border border-indigo-100 hidden md:block">
            <p className="text-[10px] font-bold uppercase tracking-wider">Status</p>
            <p className="font-bold">Siswa Aktif</p>
          </div>
        </div>

        <div className="px-6 md:px-10 pb-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">NIPD</p>
            <p className="font-semibold text-slate-800">{studentData.nipd || '-'}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Tempat, Tgl Lahir</p>
            <p className="font-semibold text-slate-800">
              {studentData.tempat_lahir || '-'}, {studentData.tanggal_lahir ? new Date(studentData.tanggal_lahir).toLocaleDateString('id-ID') : '-'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Kode Akses</p>
            <p className="font-semibold text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded inline-block">{studentData.kode}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Tahun Ajaran Aktif</p>
            <p className="font-semibold text-slate-800">{studentData.tahun_ajaran || '-'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* RINGKASAN KEHADIRAN (ALL TIME) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            Statistik Kehadiran (Total)
          </h3>
          <div className="flex items-end gap-4 mb-6">
            <div className="text-5xl font-black text-slate-800 tracking-tighter">{persentaseHadir}%</div>
            <div className="pb-1 text-sm font-medium text-slate-500">Tingkat Kehadiran</div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 mb-6 overflow-hidden">
            <div className={`h-3 rounded-full ${pbColor}`} style={{ width: `${persentaseHadir}%` }}></div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-100 flex justify-between">
              <span className="font-medium">Hadir</span><span className="font-bold">{rekapKehadiran.H + rekapKehadiran.T}</span>
            </div>
            <div className="bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-100 flex justify-between">
              <span className="font-medium">Alpha</span><span className="font-bold">{rekapKehadiran.A}</span>
            </div>
            <div className="bg-blue-50 text-blue-700 p-3 rounded-xl border border-blue-100 flex justify-between">
              <span className="font-medium">Sakit</span><span className="font-bold">{rekapKehadiran.S}</span>
            </div>
            <div className="bg-purple-50 text-purple-700 p-3 rounded-xl border border-purple-100 flex justify-between">
              <span className="font-medium">Izin</span><span className="font-bold">{rekapKehadiran.I}</span>
            </div>
          </div>
        </div>

        {/* RIWAYAT KELAS */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Riwayat Kelas
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 max-h-64 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {enrollments.length > 0 ? (
              enrollments.map((enrol, idx) => (
                <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${enrol.is_active ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div>
                    <p className={`font-bold ${enrol.is_active ? 'text-indigo-800' : 'text-slate-700'}`}>Kelas {enrol.kelas}</p>
                    <p className="text-xs text-slate-500">{enrol.tahun_ajaran?.nama} — {enrol.tahun_ajaran?.semester}</p>
                  </div>
                  {enrol.is_active && (
                    <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold uppercase px-2 py-1 rounded-md">Saat Ini</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Belum ada riwayat kelas.</p>
            )}
          </div>
        </div>

      </div>

      {/* STATUS DOKUMEN CHECKLIST */}
      {dokumenStatus.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            Checklist Status Dokumen
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dokumenStatus.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="shrink-0 text-xl">
                  {doc.accessible ? '✅' : doc.hasFile ? '🔒' : '⏳'}
                </div>
                <div className="truncate">
                  <p className="text-sm font-bold text-slate-700 truncate">{doc.nama}</p>
                  <p className="text-[10px] uppercase font-bold text-slate-400">
                    {doc.accessible ? 'Tersedia' : doc.hasFile ? 'Terkunci' : 'Belum Diunggah'}
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
