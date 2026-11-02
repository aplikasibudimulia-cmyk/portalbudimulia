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
  const [appVersionConfig, setAppVersionConfig] = useState({
    latestVersion: '1.8',
    latestBuild: '10',
    minVersion: '1.8',
    forceUpdate: false,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.ebudimulia.portal',
    appStoreUrl: '',
    updateTitle: 'Pembaruan Aplikasi Tersedia 🚀',
    updateNotes: 'Peningkatan performa dan kestabilan sistem.'
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  
  useEffect(() => {
    fetchSettings()
  }, [])
  
  const fetchSettings = async () => {
    const { data } = await supabase.from('pengaturan_sekolah').select('*')
    if (data) {
      const newShowProfile = { foto: true, kelas: true, nisn: true, nipd: true, tahun_ajaran: true }
      const newVerConfig = { ...appVersionConfig }
      data.forEach(item => {
        if (item.setting_key === 'tema_warna') setTema(item.setting_value)
        if (item.setting_key === 'pengumuman_teks') setPengumuman(item.setting_value)
        if (item.setting_key === 'show_profile_foto') newShowProfile.foto = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_kelas') newShowProfile.kelas = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nisn') newShowProfile.nisn = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nipd') newShowProfile.nipd = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = item.setting_value === 'true'
        if (item.setting_key === 'app_latest_version') newVerConfig.latestVersion = item.setting_value
        if (item.setting_key === 'app_latest_build') newVerConfig.latestBuild = item.setting_value
        if (item.setting_key === 'app_min_version') newVerConfig.minVersion = item.setting_value
        if (item.setting_key === 'app_force_update') newVerConfig.forceUpdate = item.setting_value === 'true'
        if (item.setting_key === 'app_playstore_url') newVerConfig.playStoreUrl = item.setting_value
        if (item.setting_key === 'app_appstore_url') newVerConfig.appStoreUrl = item.setting_value
        if (item.setting_key === 'app_update_title') newVerConfig.updateTitle = item.setting_value
        if (item.setting_key === 'app_update_notes') newVerConfig.updateNotes = item.setting_value
      })
      setShowProfile(newShowProfile)
      setAppVersionConfig(newVerConfig)
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
        { setting_key: 'show_profile_tahun_ajaran', setting_value: showProfile.tahun_ajaran.toString() },
        { setting_key: 'app_latest_version', setting_value: appVersionConfig.latestVersion },
        { setting_key: 'app_latest_build', setting_value: appVersionConfig.latestBuild },
        { setting_key: 'app_min_version', setting_value: appVersionConfig.minVersion },
        { setting_key: 'app_force_update', setting_value: appVersionConfig.forceUpdate.toString() },
        { setting_key: 'app_playstore_url', setting_value: appVersionConfig.playStoreUrl },
        { setting_key: 'app_appstore_url', setting_value: appVersionConfig.appStoreUrl || '' },
        { setting_key: 'app_update_title', setting_value: appVersionConfig.updateTitle },
        { setting_key: 'app_update_notes', setting_value: appVersionConfig.updateNotes }
      ]
 
      for (const item of settingsToSave) {
        // Delete existing setting to avoid duplicate errors
        await supabase.from('pengaturan_sekolah').delete().eq('setting_key', item.setting_key)
        
        // Insert the new setting
        const { error } = await supabase.from('pengaturan_sekolah').insert([item])
        if (error) throw error
      }
      
      setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan!' })
      logActivity({ userRole: 'Administrator', action: 'Update Personalisasi', details: 'Mengubah tema, pengumuman, tampilan profil, dan visibilitas kalender.' })
      
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

      <div className="bg-white border-none rounded-xl shadow-sm p-6">
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

      <div className="bg-white border-none rounded-xl shadow-sm p-6">
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

      {/* Pengaturan Versi APK & Google Play Store */}
      <div className="bg-white border-none rounded-xl shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a2.036 2.036 0 0 1-.61-.954V2.768c.11-.377.33-.717.61-.954zm11.242 11.245l2.482-2.482-12.723-7.3a1.597 1.597 0 0 0-.573-.207l10.814 9.989zm0-2.118L4.036 1.777c.18.06.35.15.51.267l12.723 7.3-2.418 1.6zM15.545 12.7l2.418 1.6-12.723 7.3a1.644 1.644 0 0 1-.51.267l10.815-9.167zm1.748-1.077l4.084 2.345a1.235 1.235 0 0 1 0 2.146l-4.084 2.345-2.227-2.227 2.227-2.264z"/>
              </svg>
              Pembaruan Aplikasi Android (Google Play Store)
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Atur notifikasi pembaruan otomatis saat siswa atau pengguna membuka aplikasi eBudimulia di HP.
            </p>
          </div>
          <a
            href="?test_update=1"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 self-start"
          >
            <span>Preview Pop-up Update</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Versi Terbaru (Play Store)
            </label>
            <input
              type="text"
              placeholder="Contoh: 1.8"
              value={appVersionConfig.latestVersion}
              onChange={(e) => setAppVersionConfig(p => ({ ...p, latestVersion: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
            />
            <p className="text-xs text-slate-400 mt-1">Versi yang saat ini tersedia di Google Play Console.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Versi Minimum Wajib
            </label>
            <input
              type="text"
              placeholder="Contoh: 1.8"
              value={appVersionConfig.minVersion}
              onChange={(e) => setAppVersionConfig(p => ({ ...p, minVersion: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
            />
            <p className="text-xs text-slate-400 mt-1">Jika versi di HP siswa di bawah ini, siswa dipaksa update (tidak bisa skip).</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3 p-3.5 border border-amber-200 bg-amber-50/50 rounded-xl cursor-pointer hover:bg-amber-50 transition-colors">
            <input
              type="checkbox"
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
              checked={appVersionConfig.forceUpdate}
              onChange={(e) => setAppVersionConfig(p => ({ ...p, forceUpdate: e.target.checked }))}
            />
            <div>
              <span className="text-sm font-bold text-slate-800">Wajibkan Pembaruan (Kunci Akses APK Lama)</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Jika dicentang, siswa dengan versi lama TIDAK BISA menggunakan aplikasi sampai selesai mengupdate di Play Store. Ini mencegah pemborosan kuota/egress dari APK lama.
              </p>
            </div>
          </label>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Google Play Store (Android)
          </label>
          <input
            type="text"
            value={appVersionConfig.playStoreUrl}
            onChange={(e) => setAppVersionConfig(p => ({ ...p, playStoreUrl: e.target.value }))}
            placeholder="https://play.google.com/store/apps/details?id=com.ebudimulia.portal"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono text-xs"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Link Apple App Store (iOS / iPhone)
          </label>
          <input
            type="text"
            value={appVersionConfig.appStoreUrl}
            onChange={(e) => setAppVersionConfig(p => ({ ...p, appStoreUrl: e.target.value }))}
            placeholder="https://apps.apple.com/app/id... (Kosongkan jika masih tahap development)"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono text-xs"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Jika dikosongkan, pengguna iPhone tidak akan dimunculkan pop-up update (aman saat aplikasi iOS masih diuji coba).
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Catatan Rilis / Apa Yang Baru
          </label>
          <textarea
            rows="3"
            value={appVersionConfig.updateNotes}
            onChange={(e) => setAppVersionConfig(p => ({ ...p, updateNotes: e.target.value }))}
            placeholder="Tuliskan poin-poin fitur baru atau perbaikan di sini (1 baris per poin)..."
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-y"
          />
          <p className="text-xs text-slate-400 mt-1">Gunakan baris baru untuk setiap poin perbaikan agar rapi di tampilan siswa.</p>
        </div>
      </div>

      <div className="bg-white border-none rounded-xl shadow-sm p-6">
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

