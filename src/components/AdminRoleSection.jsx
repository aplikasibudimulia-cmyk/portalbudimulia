import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'

const FITUR_CATEGORIES = [
  {
    title: 'Manajemen Pengguna',
    features: [
      { id: 'kelola_akun_pengguna', label: 'Kelola Akun Pengguna', desc: 'Akses penuh ke Manajemen Akun (Guru, Siswa, Orangtua)' },
      { id: 'kelola_role_akses', label: 'Kelola Role & Hak Akses', desc: 'Akses ke Manajemen Role' },
      { id: 'lihat_log_aktivitas', label: 'Lihat Log Aktivitas', desc: 'Akses ke Log Aktivitas sistem' }
    ]
  },
  {
    title: 'Akademik & KBM',
    features: [
      { id: 'lihat_data_siswa', label: 'Lihat Data Siswa', desc: 'Melihat daftar siswa di kelasnya' },
      { id: 'ubah_data_siswa', label: 'Ubah Data Siswa', desc: 'Mengedit data siswa' },
      { id: 'upload_csv', label: 'Upload CSV', desc: 'Upload CSV data siswa' },
      { id: 'upload_foto', label: 'Upload Foto', desc: 'Upload foto siswa secara massal' },
      { id: 'input_nilai', label: 'Input Nilai Pelajaran', desc: 'Mengisi nilai mata pelajaran dan nilai rapor siswa' },
      { id: 'kelola_kalender_akademik', label: 'Kelola Kalender & Rencana', desc: 'Mengatur kalender akademik dan agenda sekolah' }
    ]
  },
  {
    title: 'Informasi & Pengumuman',
    features: [
      { id: 'kelola_berita_sekolah', label: 'Kelola Berita Sekolah', desc: 'Membuat dan memposting artikel berita sekolah' },
      { id: 'kirim_notifikasi_siswa', label: 'Kirim Notifikasi Massal', desc: 'Mengirimkan push notification / broadcast ke siswa & ortu' },
      { id: 'kelola_pengumuman', label: 'Kelola Pengumuman', desc: 'Mengelola jenis pengumuman & toggle akses' },
      { id: 'lihat_dokumen', label: 'Akses Dokumen Siswa', desc: 'Mengunduh/melihat berkas pengumuman (SKL, rapor) per kelas' },
      { id: 'upload_dokumen_guru', label: 'Upload Dokumen Guru (Mapel)', desc: 'Mengupload berkas administrasi guru (RPP, silabus, dll) dan melihat status kelengkapannya' },
      { id: 'kelola_dokumen_guru', label: 'Kelola Syarat Dokumen Guru', desc: 'Mengatur daftar dokumen wajib yang harus diupload oleh guru mapel' }
    ]
  },
  {
    title: 'Presensi & Kehadiran',
    features: [
      { id: 'kelola_presensi_sekolah', label: 'Kelola Presensi Siswa (Piket)', desc: 'Memantau & mengubah absensi harian siswa (S/I/A)' },
      { id: 'akses_presensi_qr', label: 'Presensi QR Code & TV', desc: 'Halaman scan QR Code untuk presensi TV' },
      { id: 'akses_denah_kehadiran', label: 'Lihat Denah Kehadiran', desc: 'Melihat visualisasi kehadiran berdasarkan tata letak kelas' }
    ]
  },
  {
    title: 'Sistem Poin (Kesiswaan / BK)',
    features: [
      { id: 'lihat_tata_tertib', label: 'Lihat Tata Tertib', desc: 'Membaca daftar pasal dan aturan tata tertib sekolah' },
      { id: 'lihat_katalog_poin', label: 'Lihat Katalog Poin', desc: 'Melihat rincian poin pelanggaran' },
      { id: 'lihat_tahap_pembinaan', label: 'Lihat Tahap Pembinaan', desc: 'Melihat kriteria tahap pembinaan siswa' },
      { id: 'catat_poin', label: 'Catat Poin Siswa', desc: 'Input poin pelanggaran/prestasi ke siswa' },
      { id: 'kelola_poin_siswa', label: 'Kelola Pengaturan Poin', desc: 'Set poin default, reset poin, lihat semua poin siswa' },
      { id: 'akses_rekap_poin', label: 'Lihat Rekap Poin Sekolah', desc: 'Memantau peringkat poin dan rekap pelanggaran sekolah' }
    ]
  },
  {
    title: 'Analitik & Pengaturan',
    features: [
      { id: 'akses_dashboard_eksekutif', label: 'Akses Dashboard Eksekutif', desc: 'Melihat statistik grafik kehadiran & poin secara makro' },
      { id: 'akses_pengumuman_resmi_kepsek', label: 'Laporan Pengumuman Resmi', desc: 'Memantau statistik keterbacaan surat oleh orangtua' },
      { id: 'kelola_konfigurasi_sistem', label: 'Kelola Konfigurasi Portal', desc: 'Edit identitas sekolah, tahun ajaran aktif, dsb' }
    ]
  }
]

const FITUR_LIST = FITUR_CATEGORIES.flatMap(cat => cat.features)

const PURE_READ_ONLY_FEATURES = [
  'akses_dashboard_eksekutif',
  'akses_pengumuman_resmi_kepsek',
  'akses_rekap_poin',
  'lihat_log_aktivitas',
  'akses_denah_kehadiran'
]

export default function AdminRoleSection() {
  const [roles, setRoles] = useState([])
  const [roleFiturs, setRoleFiturs] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newRole, setNewRole] = useState({ nama: '', deskripsi: '' })
  const [editingRole, setEditingRole] = useState(null)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

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
        if (!fitursMap[f.role_id]) fitursMap[f.role_id] = {}
        fitursMap[f.role_id][f.fitur] = f.akses_level || 'edit'
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
    const confirmed = await requestConfirm({
      title: 'Hapus Role?',
      message: `Yakin ingin menghapus role "${nama}"?\nSemua guru yang memiliki role ini juga akan kehilangan hak aksesnya.`,
      confirmLabel: 'Hapus Role',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('roles').delete().eq('id', id)
    if (error) alert('Gagal menghapus: ' + error.message)
    else fetchRoles()
  }

  const handleSetAksesLevel = async (roleId, fiturId, level) => {
    // Optimistic update
    const newMap = { ...roleFiturs }
    if (!newMap[roleId]) newMap[roleId] = {}
    
    if (level === 'nonaktif') {
      delete newMap[roleId][fiturId]
    } else {
      newMap[roleId][fiturId] = level
    }
    setRoleFiturs(newMap)

    // DB update: delete then insert
    const { error: delError } = await supabase.from('role_fitur').delete().match({ role_id: roleId, fitur: fiturId })
    if (delError) {
      console.error(delError)
      fetchRoles() // revert on error
      return
    }

    if (level !== 'nonaktif') {
      const { error: insError } = await supabase.from('role_fitur').insert([{ role_id: roleId, fitur: fiturId, akses_level: level }])
      if (insError) {
        console.error(insError)
        fetchRoles() // revert on error
      }
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] pb-2 md:pb-0">
      {ConfirmModalComponent}
      
      <div className="animate-slide-up flex flex-col flex-1 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
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
          <div className="flex justify-center py-12 flex-1 min-h-0"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
        ) : (
          <div className="overflow-auto flex-1 min-h-[500px] lg:min-h-0 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
              {roles.map(role => {
                const activeCount = roleFiturs[role.id] ? Object.keys(roleFiturs[role.id]).length : 0
                return (
                  <div key={role.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-slate-800 text-lg">{role.nama}</h3>
                          <button onClick={() => handleDeleteRole(role.id, role.nama)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </div>
                        {role.deskripsi && <p className="text-sm text-slate-500 mt-2 line-clamp-2">{role.deskripsi}</p>}
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-medium">
                          {activeCount} Fitur diaktifkan
                        </span>
                        <button onClick={() => setEditingRole(role)}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <path d="M12 8v4M12 16h.01"></path>
                          </svg>
                          Kelola Hak Akses
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {editingRole && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Kelola Hak Akses</h3>
                <p className="text-xs text-slate-500 mt-0.5">Role: <span className="font-semibold text-indigo-600">{editingRole.nama}</span></p>
              </div>
              <button onClick={() => setEditingRole(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-2xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="p-5 bg-slate-50/50 overflow-y-auto flex-1">
              <div className="space-y-6">
                {FITUR_CATEGORIES.map(cat => (
                  <div key={cat.title} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2.5">{cat.title}</h4>
                    <div className="space-y-2.5">
                      {cat.features.map(f => {
                        const currentLevel = roleFiturs[editingRole.id]?.[f.id] || 'nonaktif'
                        const isPureRead = PURE_READ_ONLY_FEATURES.includes(f.id)
                        return (
                          <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/60 bg-white shadow-sm hover:border-indigo-300 transition-colors">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{f.desc}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl">
                              <button
                                type="button"
                                onClick={() => handleSetAksesLevel(editingRole.id, f.id, 'nonaktif')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                  currentLevel === 'nonaktif'
                                    ? 'bg-white text-slate-700 shadow-sm'
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                Nonaktif
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetAksesLevel(editingRole.id, f.id, 'read')}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                  currentLevel === 'read'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-400 hover:text-indigo-600'
                                }`}
                              >
                                {isPureRead ? 'Aktif' : 'Read Only'}
                              </button>
                              {!isPureRead && (
                                <button
                                  type="button"
                                  onClick={() => handleSetAksesLevel(editingRole.id, f.id, 'edit')}
                                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                    currentLevel === 'edit'
                                      ? 'bg-white text-emerald-600 shadow-sm'
                                      : 'text-slate-400 hover:text-emerald-600'
                                  }`}
                                >
                                  Edit Penuh
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-white">
              <button onClick={() => setEditingRole(null)} className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
                Selesai
              </button>
            </div>
          </div>
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
