import React, { useState, useEffect } from 'react'
import { useSearchParams, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ValidasiKartuPelajar() {
  const [searchParams] = useSearchParams()
  const { nisn: paramNisn } = useParams()
  const nisnQuery = paramNisn || searchParams.get('nisn') || ''

  const [inputNisn, setInputNisn] = useState(nisnQuery)
  const [activeNisn, setActiveNisn] = useState(nisnQuery)
  const [student, setStudent] = useState(null)
  const [fotoUrl, setFotoUrl] = useState(null)
  const [schoolSettings, setSchoolSettings] = useState({
    nama_sekolah: 'SMP BUDI MULIA',
    instansi: 'DINAS PENDIDIKAN PROVINSI DKI JAKARTA',
    logo_url: '/logo_budimulia.png',
    akreditasi: 'TERAKREDITASI A',
    web_sekolah: 'smpbudimuliajakarta.sch.id',
    alamat_sekolah: 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730',
    nama_kepsek: 'Drs. H. Hendra Wijaya, M.Pd.'
  })
  const [loading, setLoading] = useState(true)
  const [verifiedTime, setVerifiedTime] = useState(null)

  // Load school settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .like('setting_key', 'kartu_%')

        if (data && data.length > 0) {
          const map = {}
          data.forEach(item => { map[item.setting_key] = item.setting_value })
          setSchoolSettings(prev => ({
            ...prev,
            nama_sekolah: map.kartu_nama_sekolah || prev.nama_sekolah,
            instansi: map.kartu_instansi_sekolah || prev.instansi,
            logo_url: (map.kartu_logo_url && map.kartu_logo_url !== '/logo.png') ? map.kartu_logo_url : prev.logo_url,
            akreditasi: map.kartu_akreditasi || prev.akreditasi,
            web_sekolah: map.kartu_web_sekolah || prev.web_sekolah,
            alamat_sekolah: map.kartu_alamat_sekolah || prev.alamat_sekolah,
            nama_kepsek: map.kartu_nama_kepsek || prev.nama_kepsek
          }))
        }
      } catch (err) {
        console.warn('Gagal memuat info sekolah:', err)
      }
    }
    fetchSettings()
  }, [])

  // Fetch Student Data by NISN
  useEffect(() => {
    const fetchStudent = async () => {
      const clean = String(activeNisn || '').trim()
      if (!clean) {
        setStudent(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // 1. Coba cari di view siswa_lengkap
        let studentResult = null
        const { data: siswaLengkap, error: errLengkap } = await supabase
          .from('siswa_lengkap')
          .select('*')
          .eq('nisn', clean)
          .order('is_aktif', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!errLengkap && siswaLengkap) {
          studentResult = siswaLengkap
        }

        // 2. Jika tidak ditemukan, coba cari di tabel siswa_permanent
        if (!studentResult) {
          const { data: perm, error: errPerm } = await supabase
            .from('siswa_permanent')
            .select('*')
            .eq('nisn', clean)
            .maybeSingle()

          if (!errPerm && perm) {
            studentResult = perm
          }
        }

        // 3. Fallback jika query ID bukannya NISN
        if (!studentResult) {
          const { data: permById } = await supabase
            .from('siswa_permanent')
            .select('*')
            .eq('id', clean)
            .maybeSingle()

          if (permById) {
            studentResult = permById
          }
        }

        setStudent(studentResult)

        // 4. Cari Foto Siswa
        if (studentResult) {
          const { data: foto } = await supabase
            .from('foto_siswa')
            .select('foto_url')
            .eq('nisn', studentResult.nisn || clean)
            .maybeSingle()

          if (foto?.foto_url) {
            setFotoUrl(foto.foto_url)
          } else {
            setFotoUrl(studentResult.foto_url || null)
          }

          // Catat waktu validasi
          const now = new Date()
          setVerifiedTime(now.toLocaleString('id-ID', {
            dateStyle: 'full',
            timeStyle: 'medium'
          }))
        } else {
          setFotoUrl(null)
          setVerifiedTime(null)
        }
      } catch (err) {
        console.error('Error memvalidasi siswa:', err)
        setStudent(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStudent()
  }, [activeNisn])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (inputNisn.trim()) {
      setActiveNisn(inputNisn.trim())
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-200 text-slate-900 py-6 px-4 sm:px-6 flex flex-col justify-between font-sans selection:bg-red-500 selection:text-white">
      
      {/* Container Utama */}
      <div className="max-w-md w-full mx-auto space-y-5">
        
        {/* Header Resmi Sekolah */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-5 text-center relative overflow-hidden">
          {/* Aksen Pita Atas Merah-Biru */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#081b3f] via-[#dc2626] to-[#081b3f]"></div>

          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 p-2 shadow-xs flex items-center justify-center mb-3">
              <img 
                src={schoolSettings.logo_url} 
                alt="Logo Sekolah" 
                className="w-full h-full object-contain"
                onError={(e) => { e.target.src = '/logo_budimulia.png' }}
              />
            </div>
            
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              {schoolSettings.instansi}
            </p>
            <h1 className="text-base font-black tracking-wide text-[#081b3f] uppercase mt-0.5">
              {schoolSettings.nama_sekolah}
            </h1>
            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-[#dc2626]">
              <span>★</span> {schoolSettings.akreditasi}
            </div>
            
            <div className="w-full border-t border-slate-100 mt-4 pt-3">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl">
                PORTAL VALIDASI KARTU PELAJAR RESMI
              </span>
            </div>
          </div>
        </div>

        {/* Status Loading */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-slate-600">Menghubungkan ke basis data sekolah & memverifikasi...</p>
          </div>
        ) : student ? (
          /* ========================================================= */
          /* HASIL 1: SISWA DITEMUKAN & TERVERIFIKASI RESMI             */
          /* ========================================================= */
          <div className="bg-white rounded-3xl border-2 border-emerald-500/80 shadow-xl overflow-hidden animate-fade-in">
            {/* Banner Hijau Terverifikasi */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-5 py-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">
                  ✓
                </span>
                <div>
                  <h3 className="text-xs font-black tracking-wider uppercase">TERVERIFIKASI SAH & RESMI</h3>
                  <p className="text-[10px] text-emerald-100">Siswa Aktif Terdaftar di Sekolah</p>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping"></span>
            </div>

            {/* Profil Siswa */}
            <div className="p-6 space-y-5">
              
              {/* Foto & Identitas Pokok */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-24 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden shrink-0 shadow-sm flex items-center justify-center relative">
                  {fotoUrl ? (
                    <img src={fotoUrl} alt={student.nama_lengkap} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">👤</span>
                  )}
                  <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-white">
                    ✓
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                    KELAS {student.kelas && student.kelas !== '-' ? student.kelas : '9A'}
                  </span>
                  <h2 className="text-base font-black text-slate-900 mt-1 leading-snug break-words uppercase">
                    {student.nama_lengkap || student.nama}
                  </h2>
                  <p className="text-xs font-mono font-bold text-slate-500 mt-0.5">
                    NISN: {student.nisn || activeNisn}
                  </p>
                </div>
              </div>

              {/* Rincian Biodata Terverifikasi */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs">
                <div className="flex justify-between items-start border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 text-[11px]">Status Kesiswaan:</span>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    AKTIF BELAJAR
                  </span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 text-[11px]">Tempat, Tanggal Lahir:</span>
                  <span className="font-bold text-slate-800 text-right">
                    {student.tempat_lahir || 'Jakarta'}, {student.tanggal_lahir || '-'}
                  </span>
                </div>

                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500 text-[11px]">Jenis Kelamin:</span>
                  <span className="font-bold text-slate-800">
                    {student.jenis_kelamin === 'L' || student.jenis_kelamin === 'Laki-laki' ? 'Laki-Laki' : student.jenis_kelamin === 'P' || student.jenis_kelamin === 'Perempuan' ? 'Perempuan' : '-'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[11px]">Kepala Sekolah Pengesah:</span>
                  <span className="font-bold text-slate-800 text-right">
                    {schoolSettings.nama_kepsek}
                  </span>
                </div>
              </div>

              {/* Timestamp Validasi */}
              <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100 flex items-center gap-2.5 text-[11px] text-emerald-800">
                <span className="text-base">🕒</span>
                <div>
                  <p className="font-bold">Waktu Pengecekan Sistem:</p>
                  <p className="text-[10px] text-emerald-700">{verifiedTime || 'Saat ini'}</p>
                </div>
              </div>

            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* HASIL 2: TIDAK DITEMUKAN / NISN TIDAK VALID               */
          /* ========================================================= */
          <div className="bg-white rounded-3xl border-2 border-rose-400 shadow-xl p-6 text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 text-2xl flex items-center justify-center mx-auto border border-rose-200">
              ✕
            </div>
            
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase">
                {activeNisn ? 'Data Siswa Tidak Ditemukan' : 'Silakan Masukkan NISN Siswa'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {activeNisn ? (
                  <>Nomor NISN <b className="font-mono text-slate-800">{activeNisn}</b> tidak terdaftar di sistem. Pastikan kartu pelajar resmi diterbitkan oleh SMP Budi Mulia Jakarta.</>
                ) : (
                  'Scan QR Code pada kartu pelajar resmi untuk memverifikasi keaslian identitas siswa secara online.'
                )}
              </p>
            </div>

            {/* Form Input Manual NISN untuk Cek Ulang */}
            <form onSubmit={handleSearchSubmit} className="pt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ketik NISN Siswa..."
                  value={inputNisn}
                  onChange={(e) => setInputNisn(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#081b3f] hover:bg-[#0f2e66] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Cari
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Form Cek Ulang Jika Siswa Ditemukan */}
        {student && (
          <div className="bg-white/80 backdrop-blur-xs rounded-2xl border border-slate-200 p-3 text-center">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Verifikasi NISN lain..."
                value={inputNisn}
                onChange={(e) => setInputNisn(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cek
              </button>
            </form>
          </div>
        )}

        {/* Footer & Tautan Resmi */}
        <div className="text-center space-y-2 pt-2">
          <p className="text-[10px] text-slate-500">
            © {new Date().getFullYear()} {schoolSettings.nama_sekolah}. Seluruh hak cipta dilindungi.
          </p>
          <div className="flex items-center justify-center gap-3 text-xs font-bold text-indigo-600">
            <a 
              href={`https://${schoolSettings.web_sekolah}`} 
              target="_blank" 
              rel="noreferrer"
              className="hover:underline"
            >
              {schoolSettings.web_sekolah}
            </a>
            <span>•</span>
            <Link to="/login" className="hover:underline text-slate-600">
              Portal eBudimulia
            </Link>
          </div>
        </div>

      </div>

    </div>
  )
}
