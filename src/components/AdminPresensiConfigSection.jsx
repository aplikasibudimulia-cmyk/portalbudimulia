import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// ===== Haversine Distance Calculator =====
function hitungJarak(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Radius bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function AdminPresensiConfigSection() {
  const [settings, setSettings] = useState({
    qr_interval_detik: '20',
    jam_mulai_presensi: '06:00',
    jam_batas_hadir: '07:00',
    jam_batas_pulang: '14:00',
    jadwal_otomatis_aktif: 'false',
    hari_aktif_presensi: '1,2,3,4,5',
    presensi_masuk_mode: 'qr',
    presensi_qr_aktif: 'true',
    presensi_pulang_aktif: 'false',
    selfie_required: 'true',
    notif_peringatan_aktif: 'true',
    jam_mulai_notif_belum_presensi: '06:40',
    notif_pengingat_interval_menit: '5',
    // Geofencing
    geofence_aktif: 'false',
    geofence_lat: '',
    geofence_lng: '',
    geofence_radius_meter: '200',
    kode_pembatalan_presensi: '123456',
  })
  const [geofenceAreas, setGeofenceAreas] = useState([]) // multiple areas
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)
  
  // State untuk Fitur Reset Data Presensi
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [isLoggingInAsPiket, setIsLoggingInAsPiket] = useState(false)

  const handleLoginAsPiket = async () => {
    setIsLoggingInAsPiket(true)
    try {
      // Find by code first (cleaner, no spaces)
      let { data: guru, error: errGuru } = await supabase
        .from('guru')
        .select('*, guru_role(role_id, roles(nama)), guru_kelas(kelas, tahun_ajaran_id)')
        .eq('kode', 'piketsmpbm135')
        .maybeSingle()

      // If not found, try finding by name
      if (!guru) {
        const { data: guruByName } = await supabase
          .from('guru')
          .select('*, guru_role(role_id, roles(nama)), guru_kelas(kelas, tahun_ajaran_id)')
          .eq('nama_guru', 'Petugas Piket')
          .maybeSingle()
        guru = guruByName
      }

      if (!guru) {
        alert('Gagal: Data guru dengan kode "piketsmpbm135" atau nama "Petugas Piket" tidak ditemukan di database.')
        setIsLoggingInAsPiket(false)
        return
      }

      // Find their login account by loading all guru accounts and filtering in memory (same as AdminManajemenAkunSection)
      // Select specific columns to avoid permission denied on sensitive columns (like password)
      const { data: akunList, error: errAkun } = await supabase
        .from('akun_pengguna')
        .select('id, username, role, foreign_id')
        .eq('role', 'guru')

      if (errAkun) throw errAkun

      const akun = akunList?.find(a => String(a.foreign_id) === String(guru.id))

      if (!akun) {
        alert(`Gagal: Data guru ditemukan (ID: ${guru.id}), tetapi akun login portalnya belum dibuat. Silakan buat akun login di Manajemen Akun terlebih dahulu.`)
        setIsLoggingInAsPiket(false)
        return
      }

      // Build session data (same as impersonate flow in AdminManajemenAkunSection.jsx)
      const sessionData = {
        id: guru.id,
        kode: guru.kode,
        nama_guru: guru.nama_guru,
        user_name: guru.user_name,
        foto_url: guru.foto_url,
        roles: guru.guru_role.map(r => ({ id: r.role_id, nama: r.roles?.nama })),
        kelas: guru.guru_kelas,
        akun_id: akun.id,
        app_role: akun.role
      }

      const { data: tokenRecord, error: errToken } = await supabase
        .from('impersonate_tokens')
        .insert({
          role: 'guru',
          session_data: sessionData
        })
        .select('id')
        .single()

      if (errToken) throw errToken
      window.open(`/impersonate?token=${tokenRecord.id}`, '_blank')
    } catch (err) {
      alert('Gagal login sebagai petugas piket: ' + err.message)
    } finally {
      setIsLoggingInAsPiket(false)
    }
  }

  // Daftar siswa
  const [siswaList, setSiswaList] = useState([])
  const [searchSiswa, setSearchSiswa] = useState('')
  
  // Subs state untuk memantau siapa saja yang sudah mengaktifkan notif
  const [activeSubs, setActiveSubs] = useState({ siswa: new Set(), ortu: new Set() })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    let siswa = []
    let from = 0
    let to = 999
    let hasMore = true
    while (hasMore) {
      const { data, error } = await supabase.from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('is_aktif', true)
        .order('kelas')
        .order('nama_lengkap')
        .range(from, to)
      if (error) {
        console.error(error)
        break
      }
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        siswa = [...siswa, ...data]
        if (data.length < 1000) {
          hasMore = false
        } else {
          from += 1000
          to += 1000
        }
      }
    }

    const [{ data: pengaturan }, { data: subsSiswa }, { data: subsOrtu }] = await Promise.all([
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value'),
      supabase.from('push_subscriptions').select('nisn'),
      supabase.from('push_subscriptions_ortu').select('nisn_anak')
    ])
    if (pengaturan) {
      const map = {}
      pengaturan.forEach(p => { map[p.setting_key] = p.setting_value || '' })
      setSettings(prev => ({ ...prev, ...map }))
      // Load multiple geofence areas
      if (map['geofence_areas']) {
        try { setGeofenceAreas(JSON.parse(map['geofence_areas'])) } catch { setGeofenceAreas([]) }
      }
    }
    setSiswaList(siswa)
    
    // Set status push notification
    const activeSiswaNisns = new Set((subsSiswa || []).map(s => s.nisn))
    const activeOrtuNisns = new Set((subsOrtu || []).map(o => o.nisn_anak))
    setActiveSubs({ siswa: activeSiswaNisns, ortu: activeOrtuNisns })

    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveSetting = async (key, value) => {
    const { error } = await supabase.from('pengaturan_sekolah').upsert(
      { setting_key: key, setting_value: String(value) },
      { onConflict: 'setting_key' }
    )
    if (error) {
      console.error(`Gagal menyimpan ${key}:`, error)
      throw error
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setSaveMsg('')
    const keys = [
      'qr_interval_detik', 'jam_mulai_presensi', 'jam_batas_hadir', 'jam_batas_pulang',
      'jadwal_otomatis_aktif', 'hari_aktif_presensi', 'presensi_masuk_mode', 'presensi_qr_aktif', 'presensi_pulang_aktif',
      'selfie_required', 'notif_peringatan_aktif', 'jam_mulai_notif_belum_presensi',
      'notif_pengingat_interval_menit',
      'geofence_aktif', 'geofence_lat', 'geofence_lng', 'geofence_radius_meter',
      'kode_pembatalan_presensi'
    ]
    try {
      await Promise.all([
        ...keys.map(k => saveSetting(k, settings[k])),
        saveSetting('geofence_areas', JSON.stringify(geofenceAreas))
      ])
      setSaving(false)
      setSaveMsg('✅ Pengaturan disimpan!')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err) {
      setSaving(false)
      setSaveMsg('❌ Gagal menyimpan pengaturan: ' + (err.message || 'Error Supabase'))
    }
  }

  // Deteksi lokasi sekolah dari browser admin
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Browser tidak mendukung GPS.')
      return
    }
    setIsDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings(prev => ({
          ...prev,
          geofence_lat: pos.coords.latitude.toFixed(7),
          geofence_lng: pos.coords.longitude.toFixed(7),
        }))
        setIsDetectingLocation(false)
      },
      () => {
        alert('Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin lokasi diberikan.')
        setIsDetectingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Hitung jarak preview antara dua titik (untuk validasi)
  const previewJarak = () => {
    const lat = parseFloat(settings.geofence_lat)
    const lng = parseFloat(settings.geofence_lng)
    if (isNaN(lat) || isNaN(lng)) return null
    return { lat, lng }
  }

  const filteredSiswa = siswaList.filter(s =>
    !searchSiswa ||
    s.nama_lengkap.toLowerCase().includes(searchSiswa.toLowerCase()) ||
    s.nisn.includes(searchSiswa) ||
    s.kelas.toLowerCase().includes(searchSiswa.toLowerCase())
  )

  const tvUrl = `${window.location.origin}/presensi-tv`

  // Hitung statistik presensi hari ini
  const [statHariIni, setStatHariIni] = useState({ hadir: 0, belum: 0, pulang: 0 })
  useEffect(() => {
    const fetchStat = async () => {
      const today = new Date().toLocaleDateString('en-CA')
      const { data } = await supabase.from('presensi_harian').select('siswa_nisn, tipe').eq('tanggal', today)
      if (data) {
        const masukSet = new Set(data.filter(p => !p.tipe || p.tipe === 'masuk').map(p => p.siswa_nisn))
        const pulangSet = new Set(data.filter(p => p.tipe === 'pulang').map(p => p.siswa_nisn))
        setStatHariIni({
          hadir: masukSet.size,
          pulang: pulangSet.size,
          belum: siswaList.length - masukSet.size
        })
      }
    }
    if (siswaList.length > 0) fetchStat()
  }, [siswaList])

  const handleResetPresensi = async () => {
    if (resetConfirmText !== 'RESET') {
      alert('Silakan ketik kata "RESET" dengan huruf kapital untuk mengonfirmasi.')
      return
    }

    const confirmed = window.confirm('PENTING: Apakah Anda benar-benar yakin ingin menghapus SELURUH data presensi harian, sesi aktif, dan log aktivitas? Tindakan ini bersifat permanen dan tidak dapat dibatalkan!')
    if (!confirmed) return

    setIsResetting(true)
    setResetMsg('')

    try {
      // 1. Hapus seluruh data presensi_harian
      const { error: err1 } = await supabase
        .from('presensi_harian')
        .delete()
        .neq('siswa_nisn', '0000000000')
      if (err1) throw err1

      // 2. Hapus seluruh data sesi_presensi
      const { error: err2 } = await supabase
        .from('sesi_presensi')
        .delete()
        .neq('tanggal', '1970-01-01')
      if (err2) throw err2

      // 3. Hapus seluruh data qr_tokens
      const { error: err3 } = await supabase
        .from('qr_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (err3) throw err3

      // 4. Hapus seluruh data activity_log
      const { error: err4 } = await supabase
        .from('activity_log')
        .delete()
        .neq('aksi', 'dummy_xyz')
      if (err4) throw err4

      setResetMsg('✅ Semua data presensi berhasil di-reset bersih!')
      setResetConfirmText('')
      
      // Muat ulang data & statistik
      await fetchAll()
    } catch (err) {
      console.error(err)
      alert('Gagal mereset data: ' + err.message)
    } finally {
      setIsResetting(false)
      setTimeout(() => setResetMsg(''), 5000)
    }
  }

  const ToggleSwitch = ({ value, onChange, colorOn = 'bg-emerald-500' }) => (
    <button
      onClick={() => onChange(value === 'true' ? 'false' : 'true')}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${value === 'true' ? colorOn : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  const koordinatValid = previewJarak()

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Pengaturan Presensi QR</h2>
        <p className="text-sm text-slate-500 mt-1">Konfigurasi sistem presensi QR Code, geofencing lokasi, notifikasi web, dan pengingat siswa.</p>
      </div>

      {/* Link TV + Petugas Piket */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-indigo-800">🖥️ Halaman Tampilan TV</p>
            <p className="text-xs text-indigo-600 mt-0.5 font-mono break-all">{tvUrl}</p>
          </div>
          <a href={tvUrl} target="_blank" rel="noopener noreferrer"
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors text-center block">
            Buka di Tab Baru →
          </a>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-800">👮 Akun Petugas Piket</p>
            <p className="text-xs text-emerald-600 mt-0.5">Masuk langsung ke akun guru/petugas piket (impersonate) untuk input presensi manual & kelola kehadiran siswa.</p>
          </div>
          <button 
            onClick={handleLoginAsPiket}
            disabled={isLoggingInAsPiket}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold rounded-xl transition-colors text-center flex items-center justify-center gap-2">
            {isLoggingInAsPiket ? (
              <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menghubungkan...</>
            ) : (
              'Masuk Akun Petugas Piket →'
            )}
          </button>
        </div>
      </div>

      {/* Pengaturan Umum */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3">⚙️ Pengaturan Umum</h3>


        {/* Toggle Presensi Pulang */}
        <div className="flex items-center justify-between p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
          <div>
            <p className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
              <span>🏠</span> Status Sesi Presensi Pulang
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Jika diaktifkan, siswa yang hadir/terlambat dapat langsung foto selfie untuk presensi pulang tanpa scan QR.
            </p>
          </div>
          <ToggleSwitch value={settings.presensi_pulang_aktif} onChange={v => setSettings(p => ({ ...p, presensi_pulang_aktif: v }))} colorOn="bg-blue-600" />
        </div>

        {/* Interval QR */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Interval Regenerasi QR: <span className="text-indigo-600 font-black">{settings.qr_interval_detik} detik</span>
          </label>
          <input type="range" min="5" max="120" step="5"
            value={settings.qr_interval_detik}
            onChange={e => setSettings(p => ({ ...p, qr_interval_detik: e.target.value }))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>5s (lebih aman)</span><span>120s (lebih lambat)</span>
          </div>
        </div>

        {/* Jadwal Otomatis Harian */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">⏰ Jadwal Otomatis Harian</p>
              <p className="text-xs text-slate-400 mt-0.5">Atur jam presensi otomatis. Saat jam batas pulang tercapai, presensi hari itu selesai otomatis.</p>
            </div>
            <ToggleSwitch value={settings.jadwal_otomatis_aktif} onChange={v => setSettings(p => ({ ...p, jadwal_otomatis_aktif: v }))} colorOn="bg-violet-500" />
          </div>

          {settings.jadwal_otomatis_aktif === 'true' && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-xs text-violet-800 flex items-start gap-2">
              <span className="shrink-0 text-base">🗓️</span>
              <span>Jadwal otomatis <strong>aktif</strong>. Presensi akan dimulai pukul <strong>{settings.jam_mulai_presensi}</strong> dan ditutup otomatis pukul <strong>{settings.jam_batas_pulang}</strong>. QR di layar TV akan menampilkan layar selesai setelahnya.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Mulai Presensi</label>
              <input type="time"
                value={settings.jam_mulai_presensi}
                onChange={e => setSettings(p => ({ ...p, jam_mulai_presensi: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-1">QR mulai aktif</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Batas Hadir</label>
              <input type="time"
                value={settings.jam_batas_hadir}
                onChange={e => setSettings(p => ({ ...p, jam_batas_hadir: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-1">Lewat ini = Terlambat</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Batas Pulang</label>
              <input type="time"
                value={settings.jam_batas_pulang}
                onChange={e => setSettings(p => ({ ...p, jam_batas_pulang: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-1">Presensi selesai otomatis</p>
            </div>
          </div>

          {/* Hari Aktif Presensi */}
          <div className="mt-4 border-t border-violet-100 pt-4">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Hari Aktif Presensi Otomatis</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Senin', val: '1' },
                { label: 'Selasa', val: '2' },
                { label: 'Rabu', val: '3' },
                { label: 'Kamis', val: '4' },
                { label: 'Jumat', val: '5' },
                { label: 'Sabtu', val: '6' },
                { label: 'Minggu', val: '0' },
              ].map(day => {
                const activeDays = (settings.hari_aktif_presensi || '1,2,3,4,5').split(',')
                const isChecked = activeDays.includes(day.val)
                return (
                  <label key={day.val} className={`flex items-center gap-2 px-3 py-2 border rounded-xl cursor-pointer text-xs font-semibold select-none transition-all ${
                    isChecked
                      ? 'bg-violet-50 border-violet-300 text-violet-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        let newDays = [...activeDays]
                        if (e.target.checked) {
                          if (!newDays.includes(day.val)) newDays.push(day.val)
                        } else {
                          newDays = newDays.filter(d => d !== day.val)
                        }
                        setSettings(p => ({ ...p, hari_aktif_presensi: newDays.join(',') }))
                      }}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5"
                    />
                    {day.label}
                  </label>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">Sistem presensi otomatis dan display TV QR hanya berjalan pada hari-hari yang dicentang di atas.</p>
          </div>
        </div>

        {/* Jam Batas Hadir Manual (standalone, when jadwal_otomatis is off) */}
        {settings.jadwal_otomatis_aktif !== 'true' && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Jam Batas Hadir <span className="text-slate-400 font-normal">(sebelum = Hadir, sesudah = Terlambat)</span></label>
            <input type="time"
              value={settings.jam_batas_hadir}
              onChange={e => setSettings(p => ({ ...p, jam_batas_hadir: e.target.value }))}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 w-full sm:w-64"
            />
          </div>
        )}

        {/* Mode Presensi Masuk */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Mode Presensi Masuk Siswa</p>
            <p className="text-xs text-slate-500">Aktifkan satu atau keduanya — siswa bisa memilih metode yang tersedia.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Toggle QR Code */}
            <div className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all ${settings.presensi_qr_aktif === 'true' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800">📷 Scan QR Code TV</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Siswa wajib scan QR Code dinamis dari layar TV pintu masuk sekolah lalu selfie.</p>
              </div>
              <ToggleSwitch
                value={settings.presensi_qr_aktif}
                onChange={v => setSettings(p => ({ ...p, presensi_qr_aktif: v }))}
              />
            </div>

            {/* Toggle Geofencing GPS */}
            <div className={`flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all ${settings.geofence_aktif === 'true' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800">📍 Geofencing GPS</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Siswa cukup berada di area sekolah lalu langsung selfie — tanpa perlu scan QR TV.</p>
              </div>
              <ToggleSwitch
                value={settings.geofence_aktif}
                onChange={v => setSettings(p => ({
                  ...p,
                  geofence_aktif: v,
                  presensi_masuk_mode: v === 'true'
                    ? (settings.presensi_qr_aktif === 'true' ? 'both' : 'geofence')
                    : (settings.presensi_qr_aktif === 'true' ? 'qr' : 'qr')
                }))}
                colorOn="bg-emerald-500"
              />
            </div>
          </div>

          {/* Info gabungan */}
          {settings.presensi_qr_aktif === 'true' && settings.geofence_aktif === 'true' && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-xl font-medium flex items-start gap-2">
              <span className="text-base shrink-0">💡</span>
              <span><strong>Kedua mode aktif:</strong> Siswa akan melihat dua pilihan — "Scan QR Code" (tanpa cek lokasi) atau "Presensi GPS" (verifikasi area + selfie langsung).</span>
            </div>
          )}
          {settings.presensi_qr_aktif !== 'true' && settings.geofence_aktif !== 'true' && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl font-medium flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span><strong>Perhatian:</strong> Tidak ada mode presensi yang aktif. Siswa tidak akan bisa melakukan presensi masuk.</span>
            </div>
          )}
        </div>

        {/* Toggle Wajib Selfie */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Wajib Selfie saat Presensi</p>
            <p className="text-xs text-slate-400">Siswa harus ambil foto selfie setelah scan QR. Foto tersimpan di server.</p>
          </div>
          <ToggleSwitch value={settings.selfie_required} onChange={v => setSettings(p => ({ ...p, selfie_required: v }))} colorOn="bg-indigo-500" />
        </div>

        {/* Kode Pembatalan Presensi */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Kode Pembatalan Presensi (PIN Admin)
            <span className="text-slate-400 font-normal ml-2">(digunakan oleh petugas untuk membatalkan presensi harian)</span>
          </label>
          <input type="text"
            placeholder="Contoh: 123456"
            value={settings.kode_pembatalan_presensi || ''}
            onChange={e => setSettings(p => ({ ...p, kode_pembatalan_presensi: e.target.value }))}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 w-full sm:w-64"
          />
        </div>

        <button onClick={handleSaveAll} disabled={saving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menyimpan...</> : 'Simpan Pengaturan'}
        </button>
        {saveMsg && <p className="text-sm font-semibold text-emerald-600 text-center">{saveMsg}</p>}
      </div>

      {/* ===== GEOFENCING LOKASI ===== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800">📍 Geofencing Lokasi Presensi</h3>
            <p className="text-xs text-slate-500 mt-1">Batasi presensi hanya di area sekolah. Siswa yang lokasinya terlalu jauh tidak bisa presensi.</p>
          </div>
          <ToggleSwitch value={settings.geofence_aktif} onChange={v => setSettings(p => ({ ...p, geofence_aktif: v }))} colorOn="bg-rose-500" />
        </div>

        {settings.geofence_aktif === 'true' && (
          <div className="space-y-4">
            {/* Info aktif */}
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start gap-2">
              <span className="shrink-0 text-base">🛡️</span>
              <span>Geofencing <strong>aktif</strong>. Siswa yang lokasi HPnya berjarak lebih dari <strong>{settings.geofence_radius_meter} meter</strong> dari koordinat sekolah akan ditolak saat presensi.</span>
            </div>

            {/* Koordinat Sekolah */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Koordinat Lokasi Sekolah</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Latitude</label>
                  <input
                    type="text"
                    placeholder="Contoh: -6.1234567"
                    value={settings.geofence_lat}
                    onChange={e => setSettings(p => ({ ...p, geofence_lat: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Longitude</label>
                  <input
                    type="text"
                    placeholder="Contoh: 106.8901234"
                    value={settings.geofence_lng}
                    onChange={e => setSettings(p => ({ ...p, geofence_lng: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                  />
                </div>
              </div>

              {/* Tombol Deteksi Lokasi Admin */}
              <button
                onClick={handleDetectLocation}
                disabled={isDetectingLocation}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 disabled:text-slate-400 text-sm font-bold rounded-xl transition-colors border border-slate-200"
              >
                {isDetectingLocation ? (
                  <><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />Mendeteksi lokasi...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>Gunakan Lokasi Saya Sekarang</>
                )}
              </button>
              <p className="text-xs text-slate-400">💡 Klik tombol di atas dari HP yang berada di area sekolah agar koordinat akurat. Anda juga bisa isi manual dari Google Maps.</p>

              {/* Preview Koordinat */}
              {koordinatValid && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">✅</span>
                  <div>
                    <p className="text-xs font-bold text-emerald-800">Koordinat tersimpan:</p>
                    <p className="text-xs text-emerald-700 font-mono">{koordinatValid.lat}, {koordinatValid.lng}</p>
                    <a
                      href={`https://www.google.com/maps?q=${koordinatValid.lat},${koordinatValid.lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-emerald-600 underline hover:text-emerald-800 font-semibold"
                    >
                      Lihat di Google Maps →
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Radius */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Radius Toleransi: <span className="text-rose-600 font-black">{settings.geofence_radius_meter} meter</span>
              </label>
              <input type="range" min="1" max="2000" step="1"
                value={settings.geofence_radius_meter}
                onChange={e => setSettings(p => ({ ...p, geofence_radius_meter: e.target.value }))}
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>1m (sangat ketat)</span>
                <span>500m (sedang)</span>
                <span>2000m (longgar)</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Siswa yang jaraknya lebih dari <strong>{settings.geofence_radius_meter} meter</strong> dari titik sekolah akan ditolak. Disarankan <strong>200–300 meter</strong> untuk keseimbangan antara keakuratan GPS dan toleransi sinyal.
              </p>
            </div>

            {/* Multiple Geofencing Areas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">📍 Area Geofencing Tambahan</p>
                <button
                  onClick={() => setGeofenceAreas(prev => [...prev, { nama: '', lat: '', lng: '', radius: 200 }])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                  Tambah Area
                </button>
              </div>
              <p className="text-xs text-slate-400">Siswa yang berada di <strong>salah satu</strong> area ini (OR) tetap dapat presensi, selain dari titik utama sekolah di atas.</p>
              {geofenceAreas.length === 0 && (
                <p className="text-xs text-slate-400 italic border border-dashed border-slate-200 rounded-xl p-3 text-center">Belum ada area tambahan. Klik "Tambah Area" untuk menambahkan.</p>
              )}
              {geofenceAreas.map((area, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600">Area #{idx + 1}</p>
                    <button
                      onClick={() => setGeofenceAreas(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Hapus area ini"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Nama area (opsional, misal: Gedung Olahraga)"
                    value={area.nama}
                    onChange={e => setGeofenceAreas(prev => prev.map((a, i) => i === idx ? { ...a, nama: e.target.value } : a))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Latitude</label>
                      <input type="text" placeholder="-6.1234" value={area.lat}
                        onChange={e => setGeofenceAreas(prev => prev.map((a, i) => i === idx ? { ...a, lat: e.target.value } : a))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Longitude</label>
                      <input type="text" placeholder="106.8901" value={area.lng}
                        onChange={e => setGeofenceAreas(prev => prev.map((a, i) => i === idx ? { ...a, lng: e.target.value } : a))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Radius (m)</label>
                      <input type="number" min="1" max="5000" placeholder="200" value={area.radius}
                        onChange={e => setGeofenceAreas(prev => prev.map((a, i) => i === idx ? { ...a, radius: parseInt(e.target.value) || 200 } : a))}
                        className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!navigator.geolocation) return
                      navigator.geolocation.getCurrentPosition(
                        pos => setGeofenceAreas(prev => prev.map((a, i) => i === idx ? { ...a, lat: pos.coords.latitude.toFixed(7), lng: pos.coords.longitude.toFixed(7) } : a)),
                        () => alert('Gagal mendapatkan lokasi.'),
                        { enableHighAccuracy: true, timeout: 10000 }
                      )
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                    Gunakan Lokasi Saya
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSaveAll} disabled={saving}
          className="w-full py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menyimpan...</> : 'Simpan Pengaturan Geofencing'}
        </button>
        {saveMsg && <p className="text-sm font-semibold text-emerald-600 text-center">{saveMsg}</p>}
      </div>

      {/* Notifikasi Web ke Siswa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800">🔔 Pengaturan Notifikasi Siswa</h3>
          <p className="text-xs text-slate-500 mt-1">Kirim notifikasi peringatan ke siswa yang belum presensi via browser (PWA).</p>
        </div>

        {/* Toggle Notif Peringatan */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Aktifkan Notifikasi Pengingat</p>
            <p className="text-xs text-slate-400">Kirim notif ke siswa setiap {settings.notif_pengingat_interval_menit || '5'} menit jika belum presensi</p>
          </div>
          <ToggleSwitch value={settings.notif_peringatan_aktif} onChange={v => setSettings(p => ({ ...p, notif_peringatan_aktif: v }))} colorOn="bg-amber-500" />
        </div>

        {/* Interval Pengingat */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Interval Pengingat Presensi</label>
          <select
            value={settings.notif_pengingat_interval_menit || '5'}
            onChange={e => setSettings(p => ({ ...p, notif_pengingat_interval_menit: e.target.value }))}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 w-full sm:w-64 cursor-pointer"
          >
            <option value="1">Setiap 1 Menit (Untuk Demo/Cepat)</option>
            <option value="2">Setiap 2 Menit</option>
            <option value="3">Setiap 3 Menit</option>
            <option value="5">Setiap 5 Menit</option>
            <option value="10">Setiap 10 Menit</option>
            <option value="15">Setiap 15 Menit</option>
            <option value="30">Setiap 30 Menit</option>
          </select>
        </div>

        {/* Jam Mulai Notif */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Jam Mulai Pengingat
            <span className="text-slate-400 font-normal ml-2">(notif dikirim mulai jam ini jika belum presensi)</span>
          </label>
          <input type="time"
            value={settings.jam_mulai_notif_belum_presensi}
            onChange={e => setSettings(p => ({ ...p, jam_mulai_notif_belum_presensi: e.target.value }))}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 w-full sm:w-64"
          />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
          <p className="font-bold">📱 Cara Kerja Notifikasi Web (PWA)</p>
          <p>1. Siswa/orangtua membuka portal di browser dan mengizinkan notifikasi</p>
          <p>2. Setelah izin diberikan, sistem akan mengirim notifikasi otomatis</p>
          <p>3. Untuk Android: notif muncul seperti aplikasi native</p>
          <p>4. Untuk iOS: siswa harus "Add to Home Screen" terlebih dahulu (iOS 16.4+)</p>
          <p className="font-bold text-amber-700 mt-2">✅ Tidak perlu Telegram. Tidak ada biaya berlangganan.</p>
        </div>

        <button onClick={handleSaveAll} disabled={saving}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menyimpan...</> : 'Simpan Pengaturan Notifikasi'}
        </button>
      </div>

      {/* Notifikasi Orang Tua */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800">👨‍👩‍👧 Notifikasi Real-time ke Orang Tua</h3>
          <p className="text-xs text-slate-500 mt-1">Sistem mengirim notifikasi otomatis ke akun orang tua saat siswa presensi masuk dan pulang.</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800 space-y-1.5">
          <p className="font-bold">✅ Fitur Aktif Otomatis</p>
          <p>• Saat siswa scan QR masuk → notifikasi + foto selfie langsung muncul di dashboard orang tua</p>
          <p>• Saat siswa scan QR pulang → notifikasi kepulangan muncul di dashboard orang tua</p>
          <p>• Notifikasi muncul <strong>realtime</strong> via Supabase Realtime (tidak perlu Telegram)</p>
          <p>• Orang tua yang mengizinkan notifikasi browser akan mendapat <strong>push notification ke HP</strong> meski app tertutup</p>
        </div>

        {/* Daftar Siswa */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <p className="text-sm font-bold text-slate-700">Daftar Siswa Aktif ({siswaList.length})</p>
            <input type="text" placeholder="Cari nama, NISN, kelas..."
              value={searchSiswa} onChange={e => setSearchSiswa(e.target.value)}
              className="pl-3 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64 bg-slate-50"
            />
          </div>

          {/* Desktop View (Table) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Nama Siswa</th>
                  <th className="px-4 py-3 text-left font-semibold w-20">Kelas</th>
                  <th className="px-4 py-3 text-left font-semibold">NISN</th>
                  <th className="px-4 py-3 text-center font-semibold">Notifikasi HP</th>
                  <th className="px-4 py-3 text-center font-semibold">Status Hari Ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredSiswa.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400 text-sm">Tidak ada siswa ditemukan.</td></tr>
                ) : filteredSiswa.map(s => (
                  <tr key={s.nisn} className="hover:bg-slate-50/50 bg-white transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.nama_lengkap}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">{s.kelas}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{s.nisn}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {activeSubs.siswa.has(s.nisn) ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-100 flex items-center gap-0.5">🔔 Siswa</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded text-[10px] border border-slate-100">🔕 Siswa</span>
                        )}
                        {activeSubs.ortu.has(s.nisn) ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold border border-amber-100 flex items-center gap-0.5">🔔 Ortu</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded text-[10px] border border-slate-100">🔕 Ortu</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Card List) */}
          <div className="block md:hidden space-y-3">
            {filteredSiswa.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-xl border border-slate-100">Tidak ada siswa ditemukan.</div>
            ) : filteredSiswa.map(s => (
              <div key={s.nisn} className="bg-slate-50/50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold text-slate-800 text-sm leading-snug">{s.nama_lengkap}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{s.nisn}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold border border-indigo-100 shrink-0">{s.kelas}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-405 font-bold uppercase tracking-wider text-[10px]">Notifikasi HP</span>
                  <div className="flex items-center gap-1.5">
                    {activeSubs.siswa.has(s.nisn) ? (
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[9px] font-bold border border-emerald-100">🔔 Siswa</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[9px] border border-slate-100">🔕 Siswa</span>
                    )}
                    {activeSubs.ortu.has(s.nisn) ? (
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[9px] font-bold border border-amber-100">🔔 Ortu</span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[9px] border border-slate-100">🔕 Ortu</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AREA BAHAYA: RESET DATA PRESENSI SECARA FULL */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6 space-y-4">
        <div className="border-b border-red-100 pb-3">
          <h3 className="font-bold text-red-800 flex items-center gap-2">
            <span>⚠️</span> Area Bahaya: Reset Data Presensi
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Gunakan fitur ini untuk menghapus seluruh data kehadiran, log aktivitas, dan sesi presensi guna memulai tahun ajaran atau semester baru dari nol.
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 space-y-1">
          <p className="font-bold">🚨 Peringatan Penting:</p>
          <p>• Menghapus seluruh riwayat presensi masuk & pulang semua siswa (`presensi_harian`).</p>
          <p>• Menghapus seluruh riwayat sesi presensi harian (`sesi_presensi`).</p>
          <p>• Menghapus log audit aktivitas (`activity_log`).</p>
          <p className="font-bold mt-1.5">• Data akun pengguna, biodata siswa permanent, kelas, dan data guru tetap aman & tidak terpengaruh.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ketik "RESET" untuk mengonfirmasi:</label>
            <input 
              type="text" 
              placeholder="RESET"
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              className="px-4 py-2.5 border border-red-200 rounded-xl text-sm font-bold text-red-700 focus:ring-2 focus:ring-red-500 outline-none w-full bg-slate-50 placeholder-red-300"
            />
          </div>
          <button
            onClick={handleResetPresensi}
            disabled={isResetting || resetConfirmText !== 'RESET'}
            className="sm:mt-5 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2"
          >
            {isResetting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Mereset Data...
              </>
            ) : (
              'Reset Semua Data Presensi'
            )}
          </button>
        </div>

        {resetMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 text-xs font-bold rounded-xl text-center animate-fade-in">
            {resetMsg}
          </div>
        )}
      </div>
    </div>
  )
}
