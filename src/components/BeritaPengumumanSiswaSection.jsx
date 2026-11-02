import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import SuratDetailModal from './SuratDetailModal'

export default function BeritaPengumumanSiswaSection({ studentData, isOrangTua = false }) {
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'surat' | 'berita' | 'pengumuman'
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const [suratList, setSuratList] = useState([])
  const [beritaList, setBeritaList] = useState([])
  const [pengumumanList, setPengumumanList] = useState([])

  const [selectedSurat, setSelectedSurat] = useState(null)
  const [selectedBerita, setSelectedBerita] = useState(null)

  useEffect(() => {
    if (studentData?.nisn) {
      fetchAllData()
    }
  }, [studentData?.nisn, studentData?.kelas, isOrangTua])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const nisn = studentData.nisn
      const kelas = studentData.kelas

      // 1. Fetch Notifikasi & Surat dari tabel notifikasi
      const { data: notifData } = await supabase
        .from('notifikasi')
        .select('*')
        .or(`target_nisn.is.null,target_nisn.eq.${nisn}`)
        .order('created_at', { ascending: false })
        .limit(100)

      const validNotifs = (notifData || []).filter(n => {
        if (n.target_kelas && n.target_kelas !== kelas) return false
        
        // 1. Abaikan notifikasi presensi harian
        if (n.tipe === 'presensi' || n.pesan?.toLowerCase().includes('melakukan presensi') || n.judul?.toLowerCase().includes('presensi')) {
          return false
        }

        // 2. Abaikan pengajuan poin, catatan poin, dan pelanggaran (bukan bagian dari berita & pengumuman)
        const judulLower = (n.judul || '').toLowerCase()
        const pesanLower = (n.pesan || '').toLowerCase()
        if (
          n.tipe === 'poin' || 
          n.tipe === 'pengajuan_poin' ||
          judulLower.includes('poin') || 
          judulLower.includes('point') || 
          pesanLower.includes('pengajuan poin') || 
          pesanLower.includes('pengajuan point') ||
          judulLower.includes('catatan pelanggaran') ||
          judulLower.includes('spam')
        ) {
          return false
        }

        return true
      })

      const suratArr = []
      const pengumumanArr = []

      validNotifs.forEach(n => {
        const isSurat = n.tipe === 'surat' || n.pesan?.includes('__SURAT_SEBARAN_PAYLOAD__')
        if (isSurat) {
          let cleanPesan = n.pesan || ''
          let payload = null
          if (n.pesan?.includes('__SURAT_SEBARAN_PAYLOAD__')) {
            const parts = n.pesan.split('__SURAT_SEBARAN_PAYLOAD__')
            cleanPesan = parts[0]?.trim() || ''
            try {
              payload = JSON.parse(parts[1])
            } catch (err) {
              console.warn('Gagal parse payload surat:', err)
            }
          }
          suratArr.push({
            id: `surat_${n.id}`,
            judul: n.judul?.replace('[SURAT RESMI] ', ''),
            pesan: cleanPesan,
            created_at: n.created_at,
            dibuat_oleh: n.dibuat_oleh || 'Sekolah',
            suratData: payload,
            type: 'surat'
          })
        } else {
          pengumumanArr.push({
            id: `notif_${n.id}`,
            judul: n.judul,
            pesan: n.pesan,
            created_at: n.created_at,
            dibuat_oleh: n.dibuat_oleh || 'Sekolah',
            type: 'pengumuman'
          })
        }
      })

      setSuratList(suratArr)
      setPengumumanList(pengumumanArr)

      // 2. Fetch Berita Sekolah
      const { data: beritaData } = await supabase
        .from('berita_sekolah')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(30)

      const roleTarget = isOrangTua ? 'ortu' : 'siswa'
      const validBerita = (beritaData || []).filter(b => {
        if (b.target_kelas && b.target_kelas !== kelas) return false
        if (Array.isArray(b.target_role) && b.target_role.length > 0) {
          const matchRole = b.target_role.includes(roleTarget) || b.target_role.includes('all')
          if (!matchRole) return false
        }
        return true
      }).map(b => ({
        ...b,
        type: 'berita',
        created_at: b.published_at || b.created_at
      }))

      setBeritaList(validBerita)
    } catch (err) {
      console.error('Error fetching berita & pengumuman:', err)
    } finally {
      setLoading(false)
    }
  }

  // Gabungkan semua data sesuai tab aktif dan pencarian
  const filteredItems = useMemo(() => {
    let combined = []

    if (activeTab === 'all') {
      combined = [...suratList, ...beritaList, ...pengumumanList]
    } else if (activeTab === 'surat') {
      combined = suratList
    } else if (activeTab === 'berita') {
      combined = beritaList
    } else if (activeTab === 'pengumuman') {
      combined = pengumumanList
    }

    combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    if (!searchQuery.trim()) return combined

    const query = searchQuery.toLowerCase()
    return combined.filter(item => {
      const matchJudul = item.judul?.toLowerCase().includes(query)
      const matchPesan = (item.pesan || item.konten || '').toLowerCase().includes(query)
      return matchJudul || matchPesan
    })
  }, [activeTab, suratList, beritaList, pengumumanList, searchQuery])

  return (
    <div className="space-y-6">
      
      {/* FILTER TABS & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Category Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua ({suratList.length + beritaList.length + pengumumanList.length})
            </button>

            <button
              onClick={() => setActiveTab('surat')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'surat'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <span>📄 Surat Resmi ({suratList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('berita')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'berita'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>📰 Berita ({beritaList.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('pengumuman')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'pengumuman'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>📢 Pengumuman ({pengumumanList.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul atau isi berita..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-800 placeholder-slate-400"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>

        </div>
      </div>

      {/* CONTENT LIST (BENTUK KEBAWAH / SINGLE COLUMN VERTICAL FEED) */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Memuat seluruh informasi sekolah...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
          <span className="text-5xl block">📭</span>
          <p className="font-bold text-slate-700 text-base">Belum Ada Informasi</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery ? 'Tidak ada hasil yang sesuai dengan kata kunci pencarian Anda.' : 'Pemberitahuan resmi dan berita dari pihak sekolah akan otomatis muncul di sini.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map(item => {
            const dateObj = new Date(item.created_at)
            const dateStr = dateObj.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })

            // TIPE 1: SURAT RESMI (CKG / SURAT SEBARAN)
            if (item.type === 'surat') {
              return (
                <div
                  key={item.id}
                  className="bg-gradient-to-br from-indigo-50/70 via-white to-white rounded-2xl border border-indigo-200 p-5 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider border border-indigo-200">
                        <span>📄 SURAT RESMI</span>
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {dateStr}
                      </span>
                      <span className="text-xs text-slate-400">• Dari: {item.dibuat_oleh}</span>
                    </div>

                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                      {item.judul}
                    </h3>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                      {item.pesan}
                    </p>
                  </div>

                  {item.suratData && (
                    <div className="shrink-0 pt-2 sm:pt-0">
                      <button
                        onClick={() => setSelectedSurat(item.suratData)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs hover:shadow cursor-pointer"
                      >
                        <span>📄 Buka Surat & Cetak PDF</span>
                        <span>➔</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            // TIPE 2: BERITA SEKOLAH
            if (item.type === 'berita') {
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-indigo-300 transition-all p-4 sm:p-5 flex flex-col sm:flex-row gap-5 items-stretch"
                >
                  {item.gambar_url && (
                    <div className="w-full sm:w-60 sm:h-40 shrink-0 rounded-xl overflow-hidden bg-slate-100 relative">
                      <img
                        src={item.gambar_url}
                        alt={item.judul}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                        onClick={() => setSelectedBerita(item)}
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-wider border border-blue-200">
                          📰 BERITA SEKOLAH
                        </span>
                        <span className="text-xs font-semibold text-slate-400">
                          {dateStr}
                        </span>
                      </div>

                      <h3 
                        onClick={() => setSelectedBerita(item)}
                        className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug hover:text-indigo-600 transition cursor-pointer"
                      >
                        {item.judul}
                      </h3>

                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed line-clamp-2 whitespace-pre-line">
                        {item.konten}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">
                        Oleh: {item.dibuat_oleh || 'Admin'}
                      </span>
                      <button
                        onClick={() => setSelectedBerita(item)}
                        className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                      >
                        <span>Baca Selengkapnya</span>
                        <span>➔</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            // TIPE 3: PENGUMUMAN RESMI UMUM
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-teal-200 transition-all space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-black uppercase tracking-wider border border-teal-200">
                    📢 PENGUMUMAN
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {dateStr}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                  {item.judul}
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {item.pesan}
                </p>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium">
                  Diumumkan oleh: {item.dibuat_oleh || 'Sekolah'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL SURAT RESMI DETAIL */}
      <SuratDetailModal
        isOpen={Boolean(selectedSurat)}
        onClose={() => setSelectedSurat(null)}
        suratData={selectedSurat}
      />

      {/* MODAL BACA BERITA DETAIL */}
      {selectedBerita && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                Berita Sekolah
              </span>
              <button
                onClick={() => setSelectedBerita(null)}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedBerita.gambar_url && (
                <div className="w-full rounded-2xl overflow-hidden border border-slate-200">
                  <img src={selectedBerita.gambar_url} alt={selectedBerita.judul} className="w-full object-cover max-h-72" />
                </div>
              )}
              <h2 className="text-xl font-black text-slate-900 leading-tight">
                {selectedBerita.judul}
              </h2>
              <p className="text-xs text-slate-400">
                Dipublikasikan pada {new Date(selectedBerita.published_at || selectedBerita.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • Oleh {selectedBerita.dibuat_oleh}
              </p>
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line pt-2 border-t border-slate-100">
                {selectedBerita.konten}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-right shrink-0">
              <button
                onClick={() => setSelectedBerita(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
