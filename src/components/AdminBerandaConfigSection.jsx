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
    poin: true,
    poinTotal: true,
    poinNegatif: true,
    poinPositif: true,
    poinLeaderboard: true,
    poinTataTertib: true,
    poinKatalog: true
  })
  const [showCalendar, setShowCalendar] = useState({
    siswa: true,
    guru: true,
    ortu: true
  })
  const [showJadwal, setShowJadwal] = useState({
    siswa: true,
    ortu: true
  })
  const [jadwalSemester, setJadwalSemester] = useState('2')
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
      const newShowJadwal = { siswa: true, ortu: true }
      let loadedSemester = '2'
      data.forEach(item => {
        if (item.setting_key === 'show_profile_foto') newShowProfile.foto = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_kelas') newShowProfile.kelas = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nisn') newShowProfile.nisn = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_nipd') newShowProfile.nipd = item.setting_value === 'true'
        if (item.setting_key === 'show_profile_tahun_ajaran') newShowProfile.tahun_ajaran = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_presensi') newShowFeature.presensi = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_nilai') newShowFeature.nilai = item.setting_value === 'true'
        if (item.setting_key === 'show_feature_poin') newShowFeature.poin = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_total') newShowFeature.poinTotal = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_negatif') newShowFeature.poinNegatif = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_positif') newShowFeature.poinPositif = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_leaderboard') newShowFeature.poinLeaderboard = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_tata_tertib') newShowFeature.poinTataTertib = item.setting_value === 'true'
        if (item.setting_key === 'show_poin_katalog') newShowFeature.poinKatalog = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_siswa') newShowCalendar.siswa = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_guru') newShowCalendar.guru = item.setting_value === 'true'
        if (item.setting_key === 'show_calendar_ortu') newShowCalendar.ortu = item.setting_value === 'true'
        if (item.setting_key === 'show_jadwal_siswa') newShowJadwal.siswa = item.setting_value === 'true'
        if (item.setting_key === 'show_jadwal_ortu') newShowJadwal.ortu = item.setting_value === 'true'
        if (item.setting_key === 'jadwal_semester_aktif') loadedSemester = item.setting_value || '2'
        if (item.setting_key === 'link_grup_ortu') setLinkGrupOrtu(item.setting_value || '')
      })
      setShowProfile(newShowProfile)
      setShowFeature(newShowFeature)
      setShowCalendar(newShowCalendar)
      setShowJadwal(newShowJadwal)
      setJadwalSemester(loadedSemester)
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
        { setting_key: 'show_poin_total', setting_value: showFeature.poinTotal.toString() },
        { setting_key: 'show_poin_negatif', setting_value: showFeature.poinNegatif.toString() },
        { setting_key: 'show_poin_positif', setting_value: showFeature.poinPositif.toString() },
        { setting_key: 'show_poin_leaderboard', setting_value: showFeature.poinLeaderboard.toString() },
        { setting_key: 'show_poin_tata_tertib', setting_value: showFeature.poinTataTertib.toString() },
        { setting_key: 'show_poin_katalog', setting_value: showFeature.poinKatalog.toString() },
        { setting_key: 'show_calendar_siswa', setting_value: showCalendar.siswa.toString() },
        { setting_key: 'show_calendar_guru', setting_value: showCalendar.guru.toString() },
        { setting_key: 'show_calendar_ortu', setting_value: showCalendar.ortu.toString() },
        { setting_key: 'show_jadwal_siswa', setting_value: showJadwal.siswa.toString() },
        { setting_key: 'show_jadwal_ortu', setting_value: showJadwal.ortu.toString() },
        { setting_key: 'jadwal_semester_aktif', setting_value: jadwalSemester },
        { setting_key: 'link_grup_ortu', setting_value: linkGrupOrtu }
      ]
 
      for (const item of settingsToSave) {
        await supabase.from('pengaturan_sekolah').delete().eq('setting_key', item.setting_key)
        const { error } = await supabase.from('pengaturan_sekolah').insert([item])
        if (error) throw error
      }
      
      setMessage({ type: 'success', text: 'Pengaturan beranda berhasil disimpan!' })
      logActivity({ userRole: 'Administrator', action: 'Update Beranda', details: 'Mengubah pengaturan tampilan beranda, fitur, sub-fitur poin, dan visibilitas kalender.' })
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

  const toggleJadwal = (key) => {
    setShowJadwal(prev => ({ ...prev, [key]: !prev[key] }))
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
            <span className="text-xs font-medium text-slate-700">Poin Siswa (Master)</span>
          </label>
        </div>

        {showFeature.poin && (
          <div className="mt-3 ml-4 p-4 border border-indigo-100 bg-indigo-50/20 rounded-2xl space-y-2 max-w-2xl">
            <h4 className="text-xs font-bold text-indigo-900 mb-2">Sub-Menu Poin Siswa:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinTotal} onChange={() => toggleFeature('poinTotal')} />
                <span className="text-xs font-medium text-slate-700">⭐ Poin Saya (Total Poin)</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinNegatif} onChange={() => toggleFeature('poinNegatif')} />
                <span className="text-xs font-medium text-slate-700">🔻 Riwayat Poin Negatif</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinPositif} onChange={() => toggleFeature('poinPositif')} />
                <span className="text-xs font-medium text-slate-700">🔺 Riwayat Poin Positif</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinLeaderboard} onChange={() => toggleFeature('poinLeaderboard')} />
                <span className="text-xs font-medium text-slate-700">🏆 Leaderboard</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinTataTertib} onChange={() => toggleFeature('poinTataTertib')} />
                <span className="text-xs font-medium text-slate-700">📋 Tata Tertib</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showFeature.poinKatalog} onChange={() => toggleFeature('poinKatalog')} />
                <span className="text-xs font-medium text-slate-700">📖 Katalog Poin</span>
              </label>
            </div>
          </div>
        )}
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
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Akses Menu Jadwal Pelajaran</h3>
        <p className="text-xs text-slate-500 mb-3">Pilih peran (role) mana saja yang diizinkan melihat menu Jadwal Pelajaran, serta pilih semester yang aktif ditampilkan.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showJadwal.siswa} onChange={() => toggleJadwal('siswa')} />
            <span className="text-xs font-medium text-slate-700">Siswa</span>
          </label>
          <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={showJadwal.ortu} onChange={() => toggleJadwal('ortu')} />
            <span className="text-xs font-medium text-slate-700">Wali / Orang Tua</span>
          </label>
          <div className="flex items-center gap-2 p-2 border border-indigo-200 bg-indigo-50/30 rounded-2xl">
            <span className="text-xs font-medium text-slate-700 whitespace-nowrap">Semester Aktif:</span>
            <select
              value={jadwalSemester}
              onChange={(e) => setJadwalSemester(e.target.value)}
              className="flex-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
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
