import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { useConfirm } from '../utils/useConfirm'

export default function AdminNotifikasiSection() {
  const [notifikasi, setNotifikasi] = useState([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()
  
  const [kelasOptions, setKelasOptions] = useState([])
  
  const [formData, setFormData] = useState({
    judul: '',
    pesan: '',
    tipe: 'info',
    target: 'all', // all, kelas, nisn
    target_kelas: '',
    target_nisn: '',
    expires_at: ''
  })

  useEffect(() => {
    fetchNotifikasi()
    fetchKelas()
  }, [])

  const fetchNotifikasi = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notifikasi')
      .select(`
        *,
        notifikasi_read ( count )
      `)
      .order('created_at', { ascending: false })
      .limit(50)
      
    if (error) console.error(error)
    else setNotifikasi(data || [])
    setLoading(false)
  }

  const fetchKelas = async () => {
    const { data } = await supabase.from('siswa_lengkap').select('kelas')
    if (data) {
      const unique = [...new Set(data.map(d => d.kelas).filter(Boolean))].sort()
      setKelasOptions(unique)
    }
  }

  const handleDelete = async (id, judul) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Notifikasi',
      message: `Apakah Anda yakin ingin menghapus notifikasi "${judul}"? Ini akan menarik notifikasi dari semua siswa.`,
      confirmColor: 'bg-rose-600 hover:bg-rose-700',
      confirmLabel: 'Ya, Hapus'
    })
    if (!confirmed) return

    const { error } = await supabase.from('notifikasi').delete().eq('id', id)
    if (!error) {
      fetchNotifikasi()
      logActivity({ userRole: 'Admin', action: 'Hapus Notifikasi', details: `Menghapus notifikasi: ${judul}` })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const payload = {
        judul: formData.judul,
        pesan: formData.pesan,
        tipe: formData.tipe,
        target_kelas: formData.target === 'kelas' ? formData.target_kelas : null,
        target_nisn: formData.target === 'nisn' ? formData.target_nisn : null,
        dibuat_oleh: 'Admin'
      }

      if (formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString()
      }

      await supabase.from('notifikasi').insert(payload)
      logActivity({ userRole: 'Admin', action: 'Kirim Notifikasi', details: `Mengirim notifikasi: ${formData.judul} ke ${formData.target}` })
      
      setIsFormOpen(false)
      setFormData({ judul: '', pesan: '', tipe: 'info', target: 'all', target_kelas: '', target_nisn: '', expires_at: '' })
      fetchNotifikasi()
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
          <h2 className="text-2xl font-black text-slate-800">Notifikasi Siswa</h2>
          <p className="text-sm text-slate-500">Kirim pemberitahuan in-app ke seluruh siswa, kelas tertentu, atau individu.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          Kirim Notifikasi Baru
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg text-slate-800">Buat Notifikasi Baru</h3>
            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">Batal</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Judul Notifikasi</label>
                  <input type="text" required value={formData.judul} onChange={e => setFormData({...formData, judul: e.target.value})}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="Mis: Dokumen SKL Tersedia" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Isi Pesan</label>
                  <textarea required rows="4" value={formData.pesan} onChange={e => setFormData({...formData, pesan: e.target.value})}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="Tulis pesan lengkap..."></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Tipe Pesan</label>
                    <select value={formData.tipe} onChange={e => setFormData({...formData, tipe: e.target.value})} className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white">
                      <option value="info">Info (Biru)</option>
                      <option value="success">Success (Hijau)</option>
                      <option value="warning">Warning (Kuning)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Kedaluwarsa (Opsional)</label>
                    <input type="date" value={formData.expires_at} onChange={e => setFormData({...formData, expires_at: e.target.value})} className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-3">Target Penerima</label>
                <div className="space-y-4">
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formData.target === 'all' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="target" value="all" checked={formData.target === 'all'} onChange={e => setFormData({...formData, target: 'all'})} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Semua Siswa</p>
                      <p className="text-xs text-slate-500">Kirim blast ke seluruh siswa terdaftar.</p>
                    </div>
                  </label>
                  
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formData.target === 'kelas' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="target" value="kelas" checked={formData.target === 'kelas'} onChange={e => setFormData({...formData, target: 'kelas'})} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">Kelas Tertentu</p>
                      {formData.target === 'kelas' && (
                        <select value={formData.target_kelas} onChange={e => setFormData({...formData, target_kelas: e.target.value})} className="mt-2 w-full p-2 text-sm rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" required>
                          <option value="">-- Pilih Kelas --</option>
                          {kelasOptions.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      )}
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formData.target === 'nisn' ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="target" value="nisn" checked={formData.target === 'nisn'} onChange={e => setFormData({...formData, target: 'nisn'})} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">Siswa Tertentu (NISN)</p>
                      {formData.target === 'nisn' && (
                        <input type="text" placeholder="Masukkan NISN Siswa" required value={formData.target_nisn} onChange={e => setFormData({...formData, target_nisn: e.target.value})} className="mt-2 w-full p-2 text-sm rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Mengirim...' : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    Kirim Sekarang
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabel Riwayat Notifikasi */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat data...</div>
        ) : notifikasi.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <p>Belum ada notifikasi yang dikirim.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Judul & Pesan</th>
                  <th className="px-6 py-4">Tipe</th>
                  <th className="px-6 py-4 text-center">Dibaca Oleh</th>
                  <th className="px-6 py-4 text-right">Tanggal</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifikasi.map(n => {
                  const targetStr = n.target_nisn ? `NISN: ${n.target_nisn}` : n.target_kelas ? `Kelas ${n.target_kelas}` : 'Semua Siswa'
                  const targetBadgeColor = n.target_nisn ? 'bg-orange-100 text-orange-700' : n.target_kelas ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  
                  return (
                    <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md ${targetBadgeColor}`}>
                          {targetStr}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs truncate">
                        <p className="font-bold text-slate-800 truncate">{n.judul}</p>
                        <p className="text-xs text-slate-500 truncate">{n.pesan}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${n.tipe === 'success' ? 'bg-emerald-50 text-emerald-600' : n.tipe === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                          {n.tipe}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full text-xs">
                          {n.notifikasi_read?.[0]?.count || 0} user
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-right">
                        {new Date(n.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDelete(n.id, n.judul)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ConfirmModalComponent}
    </div>
  )
}
