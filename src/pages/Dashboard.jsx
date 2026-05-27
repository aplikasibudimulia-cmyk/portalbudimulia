import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const DEFAULT_AVATAR = '/default-avatar.png'

function Dashboard() {
  const navigate = useNavigate()

  const [studentData, setStudentData] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [error, setError] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(DEFAULT_AVATAR)

  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem('siswa_session')
      if (!raw) {
        navigate('/')
        return
      }

      let siswa
      try {
        siswa = JSON.parse(raw)
      } catch {
        localStorage.removeItem('siswa_session')
        navigate('/')
        return
      }

      setStudentData(siswa)

      if (siswa.kode) {
        const { data: photoData } = supabase.storage
          .from('foto-siswa')
          .getPublicUrl(`${siswa.kode}.jpg`)
        setPhotoUrl(photoData.publicUrl)
      }

      if (!siswa.file_path) {
        setError('SKL Anda saat ini belum tersedia. Silakan hubungi pihak sekolah untuk informasi lebih lanjut.')
        setLoading(false)
        return
      }

      const { data: signedData, error: urlError } = await supabase.storage
        .from('ijazah-siswa')
        .createSignedUrl(siswa.file_path, 3600)

      if (urlError || !signedData?.signedUrl) {
        setError('Dokumen SKL tidak dapat dimuat saat ini. Silakan coba beberapa saat lagi atau hubungi administrator sekolah.')
        setLoading(false)
        return
      }

      setPdfUrl(signedData.signedUrl)
      setLoading(false)
    }

    init()
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem('siswa_session')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="w-full max-w-3xl mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-2">
            <div className="border border-slate-200 rounded-xl shadow-sm p-2 bg-white">
              <img src="/logo.png" alt="Logo SMP Budi Mulia" className="h-20 w-20 object-contain" />
            </div>
            <span className="font-semibold text-slate-700 text-sm tracking-wide">SMP BUDI MULIA</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Portal SKL</h1>
          <p className="text-slate-500 mt-2 text-sm">Sistem Keterangan Lulus</p>
        </div>

        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Sedang menyiapkan dokumen Anda...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col gap-6">
            <div className="px-4 py-3 rounded-lg text-sm font-medium border bg-red-50 text-red-700 border-red-200">
              {error}
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 text-sm font-medium transition-colors duration-200"
            >
              Keluar
            </button>
          </div>
        )}

        {!loading && !error && studentData && (
          <div className="flex flex-col gap-5">

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-4 mb-5">
                <img
                  src={photoUrl}
                  alt={studentData.nama_lengkap}
                  className="w-14 h-14 rounded-full object-cover bg-blue-100 shrink-0 border border-slate-200"
                  onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_AVATAR }}
                />
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Selamat Datang</p>
                  <h2 className="text-xl font-bold text-slate-800 leading-tight">{studentData.nama_lengkap}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Kelas: <span className="font-medium text-slate-700">{studentData.kelas}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-blue-400 font-medium">NISN</p>
                    <p className="text-sm font-bold text-blue-700 truncate">{studentData.nisn ?? '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-indigo-400 font-medium">Tahun Lulus</p>
                    <p className="text-sm font-bold text-indigo-700 truncate">{studentData.tahun_lulus ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-700">Surat Keterangan Lulus</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Dokumen resmi — tautan berlaku 1 jam</p>
                </div>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-sm shadow-green-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download SKL
                </a>
              </div>

              <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {pdfLoading && (
                  <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center gap-3 z-10">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Sedang memuat dokumen SKL...</p>
                  </div>
                )}
                <iframe
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
                  width="100%"
                  height="600px"
                  className="w-full block"
                  onLoad={() => setPdfLoading(false)}
                  title="Preview Surat Keterangan Lulus"
                />
              </div>

              <p className="text-xs text-slate-400 mt-3 text-center">
                Jika dokumen tidak tampil, gunakan tombol <span className="font-medium text-green-600">Download SKL</span> di atas.
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <button
                onClick={handleLogout}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 text-sm font-medium transition-colors duration-200"
              >
                Keluar dari Sistem
              </button>
            </div>

          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          &copy; {new Date().getFullYear()} Portal SKL. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Dashboard
