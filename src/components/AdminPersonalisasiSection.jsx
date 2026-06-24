import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

const THEMES = [
  { id: 'indigo', name: 'Indigo (Bawaan)', classes: 'bg-indigo-600' },
  { id: 'blue', name: 'Biru Laut', classes: 'bg-blue-600' },
  { id: 'emerald', name: 'Hijau Zamrud', classes: 'bg-emerald-600' },
  { id: 'rose', name: 'Merah Mawar', classes: 'bg-rose-600' },
  { id: 'amber', name: 'Kuning Jingga', classes: 'bg-amber-600' },
  { id: 'slate', name: 'Abu-abu Gelap', classes: 'bg-slate-800' }
]

export default function AdminPersonalisasiSection() {
  const [tema, setTema] = useState('indigo')
  const [pengumuman, setPengumuman] = useState('')
  const [showProfile, setShowProfile] = useState({
    foto: true,
    kelas: true,
    nisn: true,
    nipd: true,
    tahun_ajaran: true
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  
  useEffect(() => {
    fetchSettings()
  }, [])
  
  const fetchSettings = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('*')
    if (data) {
      const newShowProfile = { ...showProfile }
      data.forEach(item => {
        if (item.setting_key === 'tema_warna') setTema(item.setting_value)
        if (item.setting_key === 'pengumuman_teks') setPengumuman(item.setting_value)
        if (item.setting_key === 'show_profile_foto') newShowProfile.foto = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_kelas') newShowProfile.kelas = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nisn') newShowProfile.nisn = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nipd') newShowProfile.nipd = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = item.setting_value === 'true'
      })
      setShowProfile(newShowProfile)
    }
  }
  
  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    
    try {
      const settingsToSave = [
        { setting_key: 'tema_warna', setting_value: tema },
        { setting_key: 'pengumuman_teks', setting_value: pengumuman },
        { setting_key: 'show_profile_foto', setting_value: showProfile.foto.toString() },
        { setting_key: 'show_profile_kelas', setting_value: showProfile.kelas.toString() },
        { setting_key: 'show_profile_nisn', setting_value: showProfile.nisn.toString() },
        { setting_key: 'show_profile_nipd', setting_value: showProfile.nipd.toString() },
        { setting_key: 'show_profile_tahun_ajaran', setting_value: showProfile.tahun_ajaran.toString() }
      ]

      for (const item of settingsToSave) {
        // Delete existing setting to avoid duplicate errors
        await supabase.from('pengaturan_sekolah').delete().eq('setting_key', item.setting_key)
        
        // Insert the new setting
        const { error } = await supabase.from('pengaturan_sekolah').insert([item])
        if (error) throw error
      }
      
      setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan!' })
      logActivity({ userRole: 'Administrator', action: 'Update Personalisasi', details: 'Mengubah tema, pengumuman, dan tampilan profil.' })
      
      // Update global CSS variable or class locally so Admin sees it
      document.documentElement.setAttribute('data-theme', tema)
      
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const toggleProfile = (key) => {
    setShowProfile(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="animate-slide-up space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Komunikasi & Personalisasi</h2>
          <p className="text-slate-500 text-sm mt-1">Ubah tema aplikasi dan broadcast pengumuman ke siswa.</p>
        </div>
      </div>
      
      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Pengumuman Dashboard Siswa</h3>
        <p className="text-sm text-slate-500 mb-4">Pesan ini akan langsung terlihat di beranda utama ketika siswa berhasil login.</p>
        <textarea 
          value={pengumuman}
          onChange={(e) => setPengumuman(e.target.value)}
          rows="4"
          placeholder="Tulis pesan atau pengumuman penting di sini..."
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow resize-y"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Tampilan Profil Beranda Siswa</h3>
        <p className="text-sm text-slate-500 mb-4">Pilih informasi apa saja yang akan ditampilkan di header profil pada Dashboard Siswa (Beranda).</p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.foto} onChange={() => toggleProfile('foto')} />
            <span className="text-sm font-medium text-slate-700">Foto Profil</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.kelas} onChange={() => toggleProfile('kelas')} />
            <span className="text-sm font-medium text-slate-700">Kelas</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nisn} onChange={() => toggleProfile('nisn')} />
            <span className="text-sm font-medium text-slate-700">NISN</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nipd} onChange={() => toggleProfile('nipd')} />
            <span className="text-sm font-medium text-slate-700">NIPD</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.tahun_ajaran} onChange={() => toggleProfile('tahun_ajaran')} />
            <span className="text-sm font-medium text-slate-700">Tahun Ajaran</span>
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Tema Warna Aplikasi</h3>
        <p className="text-sm text-slate-500 mb-4">Pilih aksen warna yang akan digunakan di seluruh aplikasi, baik untuk panel admin, guru, maupun dashboard siswa.</p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {THEMES.map(t => (
            <button 
              key={t.id}
              onClick={() => setTema(t.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${tema === t.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className={`w-8 h-8 rounded-full ${t.classes} shrink-0`}></div>
              <span className="text-sm font-semibold text-slate-700">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm disabled:opacity-50 transition-colors"
        >
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>
    </div>
  )
}

