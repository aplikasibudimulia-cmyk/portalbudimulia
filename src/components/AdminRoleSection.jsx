import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const FITUR_LIST = [
  { id: 'lihat_data_siswa', label: 'Lihat Data Siswa', desc: 'Melihat daftar siswa di kelasnya' },
  { id: 'lihat_dokumen', label: 'Lihat Dokumen', desc: 'Melihat/download dokumen pengumuman siswa' },
  { id: 'ubah_data_siswa', label: 'Ubah Data Siswa', desc: 'Mengedit data siswa' },
  { id: 'upload_csv', label: 'Upload CSV', desc: 'Upload CSV data siswa' },
  { id: 'upload_foto', label: 'Upload Foto', desc: 'Upload foto siswa secara massal' },
  { id: 'kelola_pengumuman', label: 'Kelola Pengumuman', desc: 'Mengelola jenis pengumuman & toggle akses' }
]

export default function AdminRoleSection() {
  const [roles, setRoles] = useState([])
  const [roleFiturs, setRoleFiturs] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newRole, setNewRole] = useState({ nama: '', deskripsi: '' })

  const fetchRoles = async () => {
    setLoading(true)
    const { data: rolesData, error: rErr } = await supabase.from('roles').select('*').order('created_at')
    const { data: fitursData, error: fErr } = await supabase.from('role_fitur').select('*')
    
    if (rErr) console.error('Error fetching roles:', rErr)
    if (fErr) console.error('Error fetching role fiturs:', fErr)

    if (rolesData) setRoles(rolesData)
    if (fitursData) {
      const fitursMap = {}
      fitursData.forEach(f => {
        if (!fitursMap[f.role_id]) fitursMap[f.role_id] = new Set()
        fitursMap[f.role_id].add(f.fitur)
      })
      setRoleFiturs(fitursMap)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRoles()
  }, [])

  const handleAddRole = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    const { error } = await supabase.from('roles').insert([newRole])
    setIsSaving(false)
    if (error) {
      alert('Gagal menambah role: ' + error.message)
    } else {
      setShowModal(false)
      setNewRole({ nama: '', deskripsi: '' })
      fetchRoles()
    }
  }

  const handleDeleteRole = async (id, nama) => {
    if (!window.confirm(`Yakin ingin menghapus role "${nama}"?\nSemua guru yang memiliki role ini juga akan kehilangan hak aksesnya.`)) return
    const { error } = await supabase.from('roles').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    else fetchRoles()
  }

  const handleToggleFitur = async (roleId, fiturId) => {
    const hasFitur = roleFiturs[roleId]?.has(fiturId)
    
    // Optimistic update
    const newMap = { ...roleFiturs }
    if (!newMap[roleId]) newMap[roleId] = new Set()
    const newSet = new Set(newMap[roleId])
    if (hasFitur) newSet.delete(fiturId)
    else newSet.add(fiturId)
    newMap[roleId] = newSet
    setRoleFiturs(newMap)

    if (hasFitur) {
      const { error } = await supabase.from('role_fitur').delete().match({ role_id: roleId, fitur: fiturId })
      if (error) fetchRoles() // revert on error
    } else {
      const { error } = await supabase.from('role_fitur').insert([{ role_id: roleId, fitur: fiturId }])
      if (error) fetchRoles() // revert on error
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Role</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola jenis role pengguna dan hak akses fiturnya</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Tambah Role
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map(role => (
            <div key={role.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{role.nama}</h3>
                  {role.deskripsi && <p className="text-sm text-slate-500 mt-1">{role.deskripsi}</p>}
                </div>
                <button onClick={() => handleDeleteRole(role.id, role.nama)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
              <div className="p-5 flex-1 bg-slate-50/50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Hak Akses Fitur</p>
                <div className="space-y-3">
                  {FITUR_LIST.map(f => {
                    const isChecked = roleFiturs[role.id]?.has(f.id) || false
                    return (
                      <label key={f.id} className="flex items-start gap-3 cursor-pointer group">
                        <div className="mt-0.5 relative flex items-center justify-center">
                          <input type="checkbox" className="sr-only" checked={isChecked} onChange={() => handleToggleFitur(role.id, f.id)} />
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                            {isChecked && <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                          </div>
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${isChecked ? 'text-slate-800' : 'text-slate-600'}`}>{f.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{f.desc}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Tambah Role Baru</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-2xl hover:bg-slate-100"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form onSubmit={handleAddRole} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Role <span className="text-red-500">*</span></label>
                <input type="text" required value={newRole.nama} onChange={e => setNewRole({...newRole, nama: e.target.value})} placeholder="Contoh: Wali Kelas" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi (Opsional)</label>
                <textarea rows="2" value={newRole.deskripsi} onChange={e => setNewRole({...newRole, deskripsi: e.target.value})} placeholder="Penjelasan singkat tentang role ini" className="w-full px-3 py-2 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"></textarea>
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={isSaving || !newRole.nama.trim()} className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center">
                  {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
