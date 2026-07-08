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
  const [showFeature, setShowFeature] = useState({
    presensi: true,
    nilai: true,
    poin: true
  })
  const [showCalendar, setShowCalendar] = useState({
    siswa: true,
    guru: true,
    ortu: true
  })
  const [linkGrupOrtu, setLinkGrupOrtu] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  
  useEffect(() => {
    fetchSettings()
  }, [])
  
  const fetchSettings = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('*')
    if (data) {
      const newShowProfile = { ...showProfile }
      const newShowFeature = { ...showFeature }
      const newShowCalendar = { siswa: true, guru: true, ortu: true }
      data.forEach(item => {
        if (item.setting_key === 'show_profile_foto') newShowProfile.foto = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_kelas') newShowProfile.kelas = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nisn') newShowProfile.nisn = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nipd') newShowProfile.nipd = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_presensi') newShowFeature.presensi = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_nilai') newShowFeature.nilai = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_poin') newShowFeature.poin = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_siswa') newShowCalendar.siswa = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_guru') newShowCalendar.guru = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_ortu') newShowCalendar.ortu = item.setting_value === 'true'
        if (item.setting_key === 'link_grup_ortu') setLinkGrupOrtu(item.setting_value || '')
      })
      setShowProfile(newShowProfile)
      setShowFeature(newShowFeature)
      setShowCalendar(newShowCalendar)
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
        { setting_key: 'show_profile_tahun_ajaran', setting_value: showProfile.tahun_ajaran.toString() },
        { setting_key: 'show_feature_presensi', setting_value: showFeature.presensi.toString() },
        { setting_key: 'show_feature_nilai', setting_value: showFeature.nilai.toString() },
        { setting_key: 'show_feature_poin', setting_value: showFeature.poin.toString() },
        { setting_key: 'show_calendar_siswa', setting_value: showCalendar.siswa.toString() },
        { setting_key: 'show_calendar_guru', setting_value: showCalendar.guru.toString() },
        { setting_key: 'show_calendar_ortu', setting_value: showCalendar.ortu.toString() },
        { setting_key: 'link_grup_ortu', setting_value: linkGrupOrtu }
      ]
 
      for (const item of settingsToSave) {
        await supabase.from('pengaturan_sekolah').delete().eq('setting_key', item.setting_key)
        const { error } = await supabase.from('pengaturan_sekolah').insert([item])
        if (error) throw error
      }
      
      setMessage({ type: 'success', text: 'Pengaturan beranda berhasil disimpan!' })
      logActivity({ userRole: 'Administrator', action: 'Update Beranda', details: 'Mengubah pengaturan tampilan beranda, fitur, dan visibilitas kalender.' })
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

  const toggleFeature = (key) => {
    setShowFeature(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleCalendar = (key) => {
    setShowCalendar(prev => ({ ...prev, [key]: !prev[key] }))
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
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
        >
          {saving ? 'Menyimpan...' : 'Simpan Tampilan'}
        </button>
      </div>
      
      {message && (
        <div className={`p-3 rounded-2xl text-sm mb-4 border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {message.text}
        </div>
      )}
 
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.foto} onChange={() => toggleProfile('foto')} />
          <span className="text-xs font-medium text-slate-700">Foto Profil</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.kelas} onChange={() => toggleProfile('kelas')} />
          <span className="text-xs font-medium text-slate-700">Kelas</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nisn} onChange={() => toggleProfile('nisn')} />
          <span className="text-xs font-medium text-slate-700">NISN</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.nipd} onChange={() => toggleProfile('nipd')} />
          <span className="text-xs font-medium text-slate-700">NIPD</span>
        </label>
        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showProfile.tahun_ajaran} onChange={() => toggleProfile('tahun_ajaran')} />
          <span className="text-xs font-medium text-slate-700">Tahun Ajaran</span>
        </label>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Fitur yang Ditampilkan</h3>
        <p className="text-xs text-slate-500 mb-3">Pilih fitur apa saja yang akan aktif dan dapat diakses oleh siswa.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.presensi} onChange={() => toggleFeature('presensi')} />
            <span className="text-xs font-medium text-slate-700">Presensi Hari Ini</span>
          </label>
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.nilai} onChange={() => toggleFeature('nilai')} />
            <span className="text-xs font-medium text-slate-700">Nilai Saya</span>
          </label>
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poin} onChange={() => toggleFeature('poin')} />
            <span className="text-xs font-medium text-slate-700">Poin Siswa</span>
          </label>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Akses Menu Kalender Akademik</h3>
        <p className="text-xs text-slate-500 mb-3">Pilih peran (role) mana saja yang diizinkan untuk melihat menu Kalender Akademik di portal mereka.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showCalendar.siswa} onChange={() => toggleCalendar('siswa')} />
            <span className="text-xs font-medium text-slate-700">Siswa</span>
          </label>
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showCalendar.guru} onChange={() => toggleCalendar('guru')} />
            <span className="text-xs font-medium text-slate-700">Guru</span>
          </label>
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showCalendar.ortu} onChange={() => toggleCalendar('ortu')} />
            <span className="text-xs font-medium text-slate-700">Wali / Orang Tua</span>
          </label>
        </div>
      </div>
 
      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Link Grup WhatsApp Wali Kelas (Untuk Orang Tua)</h3>
        <p className="text-xs text-slate-500 mb-2">Masukkan link undangan grup WhatsApp yang akan ditampilkan di dashboard Orang Tua.</p>
        <input 
          type="url"
          value={linkGrupOrtu}
          onChange={(e) => setLinkGrupOrtu(e.target.value)}
          placeholder="https://chat.whatsapp.com/..."
          className="w-full max-w-lg px-3 py-2 border rounded-2xl text-sm"
        />
      </div>
    </div>
  )
}
