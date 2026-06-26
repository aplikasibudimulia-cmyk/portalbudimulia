import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { useConfirm } from '../utils/useConfirm'

export default function AdminBeritaSection() {
  const [berita, setBerita] = useState([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const [formData, setFormData] = useState({
    id: null,
    judul: '',
    konten: '',
    gambar_url: '',
    target_role: ['siswa', 'guru'],
    target_kelas: [],
    is_published: false
  })
  
  const [file, setFile] = useState(null)
  const [kelasOptions, setKelasOptions] = useState([])

  useEffect(() => {
    fetchBerita()
    fetchKelas()
  }, [])

  const fetchBerita = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('berita_sekolah')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setBerita(data || [])
    setLoading(false)
  }

  const fetchKelas = async () => {
    const { data } = await supabase.from('siswa_lengkap').select('kelas')
    if (data) {
      const unique = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort()
      setKelasOptions(unique)
    }
  }

  const handleEdit = (b) => {
    setFormData({
      id: b.id,
      judul: b.judul,
      konten: b.konten,
      gambar_url: b.gambar_url || '',
      target_role: b.target_role || [],
      target_kelas: b.target_kelas || [],
      is_published: b.is_published
    })
    setFile(null)
    setIsFormOpen(true)
  }

  const handleDelete = async (id, judul) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Berita',
      message: `Apakah Anda yakin ingin menghapus berita "${judul}"?`,
      confirmColor: 'bg-rose-600 hover:bg-rose-700',
      confirmLabel: 'Ya, Hapus'
    })
    if (!confirmed) return

    const { error } = await supabase.from('berita_sekolah').delete().eq('id', id)
    if (!error) {
      fetchBerita()
      logActivity({ userRole: 'Admin', action: 'Hapus Berita', details: `Menghapus berita: ${judul}` })
    } else {
      alert("Gagal menghapus berita")
    }
  }

  const handleTogglePublish = async (id, currentStatus, judul) => {
    const newStatus = !currentStatus
    const { error } = await supabase.from('berita_sekolah').update({ 
      is_published: newStatus,
      published_at: newStatus ? new Date().toISOString() : null
    }).eq('id', id)
    
    if (!error) {
      fetchBerita()
      logActivity({ userRole: 'Admin', action: newStatus ? 'Publish Berita' : 'Unpublish Berita', details: `Berita: ${judul}` })
    }
  }

  const handleImageUpload = async (imgFile) => {
    if (!imgFile) return null
    const form = new FormData()
    form.append('file', imgFile)
    form.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
    form.append('folder', 'BERITA')
    
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: form
      })
      const data = await res.json()
      return data.secure_url
    } catch (err) {
      console.error(err)
      return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      let finalImgUrl = formData.gambar_url
      if (file) {
        const uploadedUrl = await handleImageUpload(file)
        if (uploadedUrl) finalImgUrl = uploadedUrl
      }

      const payload = {
        judul: formData.judul,
        konten: formData.konten,
        gambar_url: finalImgUrl,
        target_role: formData.target_role,
        target_kelas: formData.target_kelas.length > 0 ? formData.target_kelas : null,
        is_published: formData.is_published,
        dibuat_oleh: 'Admin'
      }

      if (formData.is_published && !formData.id) {
        payload.published_at = new Date().toISOString()
      } else if (formData.is_published && formData.id) {
        const existing = berita.find(b => b.id === formData.id)
        if (!existing.is_published) {
          payload.published_at = new Date().toISOString()
        }
      }

      if (formData.id) {
        await supabase.from('berita_sekolah').update(payload).eq('id', formData.id)
        logActivity({ userRole: 'Admin', action: 'Edit Berita', details: `Update berita: ${formData.judul}` })
      } else {
        await supabase.from('berita_sekolah').insert(payload)
        logActivity({ userRole: 'Admin', action: 'Tambah Berita', details: `Membuat berita baru: ${formData.judul}` })
      }

      setIsFormOpen(false)
      fetchBerita()
    } catch (err) {
      alert("Terjadi kesalahan: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Berita Sekolah</h2>
          <p className="text-sm text-slate-500">Kelola artikel, pengumuman, dan berita untuk beranda siswa dan guru.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ id: null, judul: '', konten: '', gambar_url: '', target_role: ['siswa', 'guru'], target_kelas: [], is_published: false })
            setFile(null)
            setIsFormOpen(true)
          }}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          Tulis Berita
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg text-slate-800">{formData.id ? 'Edit Berita' : 'Tulis Berita Baru'}</h3>
            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">Batal</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Judul Berita</label>
              <input type="text" required value={formData.judul} onChange={e => setFormData({...formData, judul: e.target.value})}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Konten</label>
              <textarea required rows="6" value={formData.konten} onChange={e => setFormData({...formData, konten: e.target.value})}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"></textarea>
              <p className="text-xs text-slate-500 mt-1 text-right">{formData.konten.length} karakter</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Gambar (Opsional)</label>
              <div className="flex items-center gap-4">
                {(file || formData.gambar_url) && (
                  <img src={file ? URL.createObjectURL(file) : formData.gambar_url} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                )}
                <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Target Audience (Role)</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={formData.target_role.includes('siswa')} 
                      onChange={e => {
                        const newRoles = e.target.checked ? [...formData.target_role, 'siswa'] : formData.target_role.filter(r => r !== 'siswa')
                        setFormData({...formData, target_role: newRoles})
                      }} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" /> Siswa
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={formData.target_role.includes('guru')} 
                      onChange={e => {
                        const newRoles = e.target.checked ? [...formData.target_role, 'guru'] : formData.target_role.filter(r => r !== 'guru')
                        setFormData({...formData, target_role: newRoles})
                      }} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" /> Guru
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Target Kelas (Khusus Siswa)</label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer bg-white px-2 py-1 rounded border">
                    <input type="checkbox" checked={formData.target_kelas.length === 0} 
                      onChange={() => setFormData({...formData, target_kelas: []})} /> Semua Kelas
                  </label>
                  {kelasOptions.map(k => (
                    <label key={k} className="flex items-center gap-2 text-xs cursor-pointer bg-white px-2 py-1 rounded border">
                      <input type="checkbox" checked={formData.target_kelas.includes(k)} 
                        onChange={e => {
                          let newK = [...formData.target_kelas]
                          if (e.target.checked) newK.push(k)
                          else newK = newK.filter(x => x !== k)
                          setFormData({...formData, target_kelas: newK})
                        }} /> {k}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.is_published} onChange={e => setFormData({...formData, is_published: e.target.checked})} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-3 text-sm font-bold text-slate-700">Langsung Publikasikan</span>
              </label>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isSubmitting || formData.target_role.length === 0} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                {isSubmitting ? 'Menyimpan...' : 'Simpan Berita'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabel Data Berita */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat data...</div>
        ) : berita.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5L18.5 7H20"/></svg>
            <p>Belum ada berita yang dibuat.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Judul Berita</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Tanggal Buat</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {berita.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleTogglePublish(b.id, b.is_published, b.judul)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${b.is_published ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${b.is_published ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <p className={`text-[10px] font-bold uppercase mt-1 ${b.is_published ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {b.is_published ? 'Published' : 'Draft'}
                      </p>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate">
                      <div className="flex items-center gap-3">
                        {b.gambar_url ? (
                          <img src={b.gambar_url} className="w-10 h-10 rounded object-cover border border-slate-200" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-400"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>
                        )}
                        <p className="font-bold text-slate-800 truncate">{b.judul}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          {b.target_role.map(r => <span key={r} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase rounded-md">{r}</span>)}
                        </div>
                        {b.target_kelas && b.target_kelas.length > 0 && (
                          <p className="text-[10px] text-slate-500">Kelas: {b.target_kelas.join(', ')}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(b.created_at).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => handleEdit(b)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(b.id, b.judul)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ConfirmModalComponent}
    </div>
  )
}
