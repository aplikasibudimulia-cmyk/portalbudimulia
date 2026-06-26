import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

export default function AdminMapelSection() {
  const [mapels, setMapels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({ id: null, nama: '', singkatan: '' })
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  const fetchMapel = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('mata_pelajaran').select('*').order('nama')
    if (error) console.error('Error fetching mapel:', error)
    else setMapels(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMapel()
  }, [])

  const handleAdd = () => {
    setFormData({ id: null, nama: '', singkatan: '' })
    setShowModal(true)
  }

  const handleEdit = (m) => {
    setFormData({ id: m.id, nama: m.nama, singkatan: m.singkatan || '' })
    setShowModal(true)
  }

  const handleDelete = async (id, nama) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Mata Pelajaran?',
      message: `Yakin ingin menghapus mata pelajaran "${nama}"? Semua guru yang ditugaskan ke pelajaran ini juga akan kehilangan datanya.`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('mata_pelajaran').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    else fetchMapel()
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!formData.nama.trim()) return

    setIsSaving(true)
    if (formData.id) {
      const { error } = await supabase.from('mata_pelajaran').update({ nama: formData.nama, singkatan: formData.singkatan }).eq('id', formData.id)
      if (error) alert('Gagal mengedit: ' + error.message)
    } else {
      const { error } = await supabase.from('mata_pelajaran').insert([{ nama: formData.nama, singkatan: formData.singkatan }])
      if (error) alert('Gagal menambah: ' + error.message)
    }

    setIsSaving(false)
    setShowModal(false)
    fetchMapel()
  }

  return (
    <div className="animate-slide-up">
      {ConfirmModalComponent}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Mata Pelajaran</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola master data mata pelajaran di sekolah</p>
        </div>
        <button onClick={handleAdd}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Tambah Mapel
        </button>
      </div>

      <div className="bg-white border-none rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
                  <th className="px-5 py-3 font-semibold w-16 text-center">No</th>
                  <th className="px-5 py-3 font-semibold">Nama Mata Pelajaran</th>
                  <th className="px-5 py-3 font-semibold">Singkatan</th>
                  <th className="px-5 py-3 font-semibold w-32 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mapels.length === 0 ? (
                  <tr><td colSpan="3" className="px-5 py-8 text-center text-slate-500">Belum ada mata pelajaran. Silakan tambah baru.</td></tr>
                ) : mapels.map((m, i) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-center text-slate-500">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{m.nama}</td>
                    <td className="px-5 py-3 text-slate-600">{m.singkatan || '-'}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleEdit(m)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                        <button onClick={() => handleDelete(m.id, m.nama)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-colors"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl overflow-hidden animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">{formData.id ? 'Edit Mapel' : 'Tambah Mapel'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-2xl hover:bg-slate-100"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Mata Pelajaran <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} placeholder="Contoh: Matematika" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Singkatan / Kode <span className="text-slate-400 font-normal">(Opsional)</span></label>
                <input type="text" value={formData.singkatan} onChange={e => setFormData({...formData, singkatan: e.target.value})} placeholder="Contoh: MTK" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={isSaving || !formData.nama.trim()} className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center">
                  {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
