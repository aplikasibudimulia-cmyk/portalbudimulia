import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import { globalUploadManager } from '../utils/uploadManager'

const IconFile = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

export default function AdminKumpulanDokumenSection({ kumpulanDokumenList, fetchKumpulanDokumen }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingDoc, setEditingDoc] = useState(null)
  
  const [newDoc, setNewDoc] = useState({ nama: '', kode_jenis: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const { confirmState, requestConfirm, ConfirmModalComponent } = useConfirm()
  const uploadInputRef = useRef(null)
  const [activeUploadDoc, setActiveUploadDoc] = useState(null)

  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newDoc.nama || !newDoc.kode_jenis) return
    setIsSaving(true)
    setErrorMsg(null)

    const { error } = await supabase.from('kumpulan_dokumen').insert({
      nama: newDoc.nama.trim(),
      kode_jenis: newDoc.kode_jenis.trim().toUpperCase()
    })

    setIsSaving(false)
    if (error) {
      setErrorMsg('Gagal menyimpan: ' + error.message)
    } else {
      setShowAddModal(false)
      setNewDoc({ nama: '', kode_jenis: '' })
      fetchKumpulanDokumen()
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editingDoc) return
    setIsSaving(true)
    setErrorMsg(null)

    const { error } = await supabase.from('kumpulan_dokumen').update({
      nama: editingDoc.nama.trim(),
      kode_jenis: editingDoc.kode_jenis.trim().toUpperCase()
    }).eq('id', editingDoc.id)

    setIsSaving(false)
    if (error) {
      setErrorMsg('Gagal update: ' + error.message)
    } else {
      setShowEditModal(false)
      fetchKumpulanDokumen()
    }
  }

  const handleDelete = async (doc) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Kumpulan Dokumen?',
      message: `Anda yakin ingin menghapus wadah "${doc.nama}"?\nFile yang sudah di-upload ke wadah ini akan terhapus juga dari database.`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger'
    })
    
    if (confirmed) {
      // Hapus berkas pengumuman
      await supabase.from('berkas_pengumuman').delete().eq('kode_jenis', doc.kode_jenis)
      // Hapus kumpulan dokumen
      await supabase.from('kumpulan_dokumen').delete().eq('id', doc.id)
      
      fetchKumpulanDokumen()
    }
  }

  const triggerUpload = (doc) => {
    setActiveUploadDoc(doc)
    if (uploadInputRef.current) uploadInputRef.current.click()
  }

  const handleUpload = async (e) => {
    const filesList = e.target.files
    if (!filesList?.length || !activeUploadDoc) return
    if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
      alert('Konfigurasi Cloudinary belum diatur')
      return
    }

    globalUploadManager.startUpload()
    const type = activeUploadDoc

    for (let i = 0; i < filesList.length; i++) {
      if (globalUploadManager.getState().cancelFlag) break
      const file = filesList[i]
      globalUploadManager.updateProgress(i + 1, filesList.length, file.name)
      
      let baseName = file.name.replace(/\.[^/.]+$/, '')
      let kode;
      if (baseName.includes('_')) {
        kode = baseName.split('_')[0].trim()
      } else {
        kode = baseName.replace(new RegExp(`${type.kode_jenis}$`, 'i'), '').trim()
      }
      kode = kode.replace(/_$/, '')

      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      const sanitizeName = (str) => (str || 'Lainnya').replace(/\s+/g, '_')
      formData.append('public_id', `${kode}${type.kode_jenis}`)
      formData.append('folder', `pengumuman/${sanitizeName(type.nama)}`)

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
          method: 'POST',
          body: formData
        })
        const data = await res.json()
        if (data.secure_url) {
          await supabase.from('berkas_pengumuman').upsert({
            kode_siswa: kode,
            kode_jenis: type.kode_jenis,
            file_name: file.name,
            file_url: data.secure_url
          }, { onConflict: 'kode_siswa,kode_jenis' })
        }
      } catch (err) {
        console.error(err)
      }
    }
    
    globalUploadManager.finishUpload()
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    alert('Upload selesai!')
  }

  return (
    <div className="animate-slide-up flex flex-col h-full">
      <input ref={uploadInputRef} type="file" multiple accept="application/pdf" className="hidden" onChange={handleUpload} />

      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Kumpulan File Pengumuman</h2>
          <p className="text-sm text-slate-500 mt-1">Kelola wadah file eksternal yang bisa disambungkan ke pengumuman manapun.</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm">
          + Buat Wadah Baru
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kumpulanDokumenList?.map(doc => (
          <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <IconFile />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{doc.nama}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Kode: {doc.kode_jenis}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              <button onClick={() => triggerUpload(doc)} className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-sm rounded-lg transition-colors">
                Upload PDF
              </button>
              <button onClick={() => { setEditingDoc(doc); setShowEditModal(true); }} className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium text-sm rounded-lg transition-colors">
                Edit
              </button>
              <button onClick={() => handleDelete(doc)} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium text-sm rounded-lg transition-colors">
                Hapus
              </button>
            </div>
          </div>
        ))}
        {kumpulanDokumenList?.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
            Belum ada Kumpulan Dokumen. Buat wadah baru untuk mulai meng-upload file.
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Buat Wadah Baru</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="p-6">
              {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{errorMsg}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Wadah</label>
                  <input type="text" required value={newDoc.nama} onChange={e => setNewDoc({...newDoc, nama: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="Misal: Tagihan SPP Ganjil" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kode Jenis</label>
                  <input type="text" required value={newDoc.kode_jenis} onChange={e => setNewDoc({...newDoc, kode_jenis: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase" placeholder="Misal: TAGGANJIL" />
                  <p className="text-[10px] text-slate-500 mt-1">Gunakan kode pendek unik (tanpa spasi)</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingDoc && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Edit Wadah</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">&times;</button>
            </div>
            <form onSubmit={handleEdit} className="p-6">
              {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{errorMsg}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nama Wadah</label>
                  <input type="text" required value={editingDoc.nama} onChange={e => setEditingDoc({...editingDoc, nama: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kode Jenis</label>
                  <input type="text" required disabled value={editingDoc.kode_jenis} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-slate-500" />
                  <p className="text-[10px] text-slate-500 mt-1">Kode jenis tidak dapat diubah setelah dibuat.</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={isSaving} className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm disabled:opacity-50">
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmModalComponent}
    </div>
  )
}
