import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

export default function AdminBerandaConfigSection() {
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
        { setting_key: 'show_profile_foto', setting_value: showProfile.foto.toString() },
        { setting_key: 'show_profile_kelas', setting_value: showProfile.kelas.toString() },
        { setting_key: 'show_profile_nisn', setting_value: showProfile.nisn.toString() },
        { setting_key: 'show_profile_nipd', setting_value: showProfile.nipd.toString() },
        { setting_key: 'show_profile_tahun_ajaran', setting_value: showProfile.tahun_ajaran.toString() }
      ]

      for (const item of settingsToSave) {
        await supabase.from('pengaturan_sekolah').delete().eq('setting_key', item.setting_key)
        const { error } = await supabase.from('pengaturan_sekolah').insert([item])
        if (error) throw error
      }
      
      setMessage({ type: 'success', text: 'Pengaturan beranda berhasil disimpan!' })
      logActivity({ userRole: 'Administrator', action: 'Update Beranda', details: 'Mengubah pengaturan tampilan beranda siswa.' })
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
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Tampilan Profil Beranda Siswa</h3>
          <p className="text-xs text-slate-500 mt-1">Pilih informasi apa saja yang akan ditampilkan di halaman depan (Beranda) setelah siswa login.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
        >
          {saving ? 'Menyimpan...' : 'Simpan Tampilan'}
        </button>
      </div>
      
      {message && (
        <div className={`p-3 rounded-lg text-sm mb-4 border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.foto} onChange={() => toggleProfile('foto')} />
          <span className="text-xs font-medium text-slate-700">Foto Profil</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.kelas} onChange={() => toggleProfile('kelas')} />
          <span className="text-xs font-medium text-slate-700">Kelas</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nisn} onChange={() => toggleProfile('nisn')} />
          <span className="text-xs font-medium text-slate-700">NISN</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nipd} onChange={() => toggleProfile('nipd')} />
          <span className="text-xs font-medium text-slate-700">NIPD</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.tahun_ajaran} onChange={() => toggleProfile('tahun_ajaran')} />
          <span className="text-xs font-medium text-slate-700">Tahun Ajaran</span>
        </label>
      </div>
    </div>
  )
}
