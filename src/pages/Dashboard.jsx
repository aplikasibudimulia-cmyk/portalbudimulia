import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const DEFAULT_AVATAR = '/default-avatar.png'

function PdfViewer({ url, onError }) {
  const [numPages, setNumPages] = useState(null)
  const [pageWidth, setPageWidth] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setPageWidth(el.clientWidth - 2))
    obs.observe(el)
    setPageWidth(el.clientWidth - 2)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={() => onError?.()}
        loading={
          <div className="flex flex-col items-center justify-center p-10 gap-3">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Memuat dokumen...</p>
          </div>
        }
      >
        {pageWidth && numPages && Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </Document>
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()

  const [studentData, setStudentData] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(DEFAULT_AVATAR)
  const [loading, setLoading] = useState(true)
  const [menuTypes, setMenuTypes] = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [accessBlocked, setAccessBlocked] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const init = async () => {
      const raw = localStorage.getItem('siswa_session')
      if (!raw) { navigate('/'); return }
      let siswa
      try { siswa = JSON.parse(raw) } catch {
        localStorage.removeItem('siswa_session')
        navigate('/')
        return
      }
      try {
        if (siswa?.kode) {
          const { data: fresh } = await supabase
            .from('siswa')
            .select('*')
            .eq('kode', siswa.kode)
            .maybeSingle()
          if (fresh) {
            siswa = fresh
            localStorage.setItem('siswa_session', JSON.stringify(fresh))
          }
        }
      } catch {}
      setStudentData(siswa)
      if (siswa.kode) {
        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
        const sanitize = (str) => (str || '').replace(/\s+/g, '_')
        const kls = sanitize(siswa.kelas) || 'Uncategorized'
        const thn = siswa.tahun_lulus ? `_${sanitize(siswa.tahun_lulus)}` : ''
        const folderName = `foto-siswa/${kls}${thn}`
        
        if (cloudName && cloudName !== 'your_cloud_name') {
          setPhotoUrl(`https://res.cloudinary.com/${cloudName}/image/upload/${folderName}/${siswa.kode}.jpg`)
        } else {
          const { data: photoData } = supabase.storage.from('foto-siswa').getPublicUrl(`${sanitize(siswa.kelas)}/${siswa.kode}.jpg`)
          setPhotoUrl(photoData.publicUrl)
        }
      }
      const { data: types } = await supabase
        .from('jenis_pengumuman')
        .select('*')
        .eq('visible', true)
        .order('urutan')
      const visible = types ?? []
      setMenuTypes(visible)
      if (visible.length > 0) setSelectedType(visible[0])
      setLoading(false)
    }
    init()
  }, [navigate])

  useEffect(() => {
    if (!selectedType || !studentData) return
    setAccessBlocked(false)
    setError(null)
    setPdfUrl(null)
    if (!selectedType.aktif) { setAccessBlocked(true); return }
    const filePath = `${studentData.kode}${selectedType.kode_jenis}.pdf`
    const checkFileExists = async () => {
      const { data, error } = await supabase.from('berkas_pengumuman')
        .select('file_url, is_accessible')
        .eq('kode_siswa', studentData.kode)
        .eq('kode_jenis', selectedType.kode_jenis)
        .maybeSingle()
        
      if (data && data.file_url) {
        if (data.is_accessible) {
          setPdfUrl(data.file_url)
        } else {
          setError('Dokumen Anda sudah tersedia, namun akses belum dibuka oleh pihak sekolah.')
        }
      } else {
        setError('Dokumen belum tersedia. Silakan hubungi pihak sekolah.')
      }
    }
    checkFileExists()
  }, [selectedType, studentData])

  useEffect(() => {
    if (loading) return
    const channel = supabase
      .channel('jenis-pengumuman-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jenis_pengumuman' }, async () => {
        const { data: types } = await supabase
          .from('jenis_pengumuman').select('*').eq('visible', true).order('urutan')
        const visible = types ?? []
        setMenuTypes(visible)
        setSelectedType(prev => {
          const updated = visible.find(t => t.id === prev?.id)
          return updated ?? visible[0] ?? null
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loading])

  useEffect(() => {
    if (!studentData?.kode) return
    const ch = supabase
      .channel(`siswa-watch-${studentData.kode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'siswa', filter: `kode=eq.${studentData.kode}` }, (payload) => {
        const updated = payload?.new
        if (updated) {
          setStudentData(updated)
          localStorage.setItem('siswa_session', JSON.stringify(updated))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [studentData?.kode])

  const handleLogout = () => {
    localStorage.removeItem('siswa_session')
    navigate('/')
  }

  const StudentInfoCard = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-4 mb-5">
        <img src={photoUrl} alt={studentData.nama_lengkap}
          className="w-14 h-14 rounded-full object-cover bg-blue-100 shrink-0 border border-slate-200"
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_AVATAR }} />
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Selamat Datang</p>
          <h2 className="text-xl font-bold text-slate-800 leading-tight">{studentData.nama_lengkap}</h2>
          <p className="text-sm text-slate-500 mt-0.5">Kelas: <span className="font-medium text-slate-700">{studentData.kelas}</span></p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-400 font-medium">NISN</p>
          <p className="text-sm font-bold text-blue-700">{studentData.nisn ?? '—'}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <p className="text-xs text-indigo-400 font-medium">Tahun Lulus</p>
          <p className="text-sm font-bold text-indigo-700">{studentData.tahun_lulus ?? '—'}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 animate-fade-in">
      <div className="w-full max-w-3xl mx-auto">

        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-2 mb-2">
            <div className="border border-slate-200 rounded-xl shadow-sm p-2 bg-white">
              <img src="/logo.png" alt="Logo SMP Budi Mulia" className="h-20 w-20 object-contain" />
            </div>
            <span className="font-semibold text-slate-700 text-sm tracking-wide">SMP BUDI MULIA</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Portal Informasi</h1>
          <p className="text-slate-500 mt-2 text-sm">Budi Mulia</p>
        </div>

        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Memuat data...</p>
          </div>
        )}

        {!loading && studentData && (
          <div className="flex flex-col gap-5 animate-slide-up">
            <StudentInfoCard />

            {menuTypes.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {menuTypes.map(type => (
                  <button key={type.id} onClick={() => setSelectedType(type)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                      selectedType?.id === type.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                    }`}>
                    {type.nama}
                  </button>
                ))}
              </div>
            )}

            {menuTypes.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
                <p className="text-slate-400 text-sm">Belum ada pengumuman yang tersedia.</p>
              </div>
            )}

            {selectedType && accessBlocked && (
              <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800 mb-1">Akses Belum Dibuka</h3>
                    <p className="text-sm text-amber-700">Akses <strong>{selectedType.nama}</strong> belum diaktifkan oleh admin. Silakan tunggu pengumuman resmi dari pihak sekolah.</p>
                  </div>
                </div>
              </div>
            )}

            {selectedType && !accessBlocked && error && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="px-4 py-3 rounded-lg text-sm font-medium border bg-red-50 text-red-700 border-red-200">{error}</div>
              </div>
            )}

            {selectedType && !accessBlocked && !error && pdfUrl && (
              <div key={selectedType.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-slide-up">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-700">{selectedType.nama}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Dokumen resmi</p>
                  </div>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Buka / Download
                  </a>
                </div>
                <PdfViewer
                  url={pdfUrl}
                  onError={() => setError('Dokumen belum tersedia. Silakan hubungi pihak sekolah.')}
                />
                <p className="text-xs text-slate-400 mt-3 text-center">
                  Tidak tampil? Gunakan tombol <span className="font-medium text-green-600">Buka / Download</span> di atas.
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <button onClick={handleLogout}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 text-sm font-medium transition-colors duration-200">
                Keluar dari Sistem
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          &copy; {new Date().getFullYear()} Portal Informasi Budi Mulia. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default Dashboard
