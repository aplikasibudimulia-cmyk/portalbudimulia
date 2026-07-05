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
    jam_batas_hadir: '07:00',
    presensi_qr_aktif: 'true',
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isDetectingLocation, setIsDetectingLocation] = useState(false)
  
  // State untuk Fitur Reset Data Presensi
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  // Daftar siswa
  const [siswaList, setSiswaList] = useState([])
  const [searchSiswa, setSearchSiswa] = useState('')
  
  // Subs state untuk memantau siapa saja yang sudah mengaktifkan notif
  const [activeSubs, setActiveSubs] = useState({ siswa: new Set(), ortu: new Set() })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: pengaturan }, { data: siswa }, { data: subsSiswa }, { data: subsOrtu }] = await Promise.all([
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value'),
      supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('is_aktif', true).order('kelas').order('nama_lengkap'),
      supabase.from('push_subscriptions').select('nisn'),
      supabase.from('push_subscriptions_ortu').select('nisn_anak')
    ])
    if (pengaturan) {
      const map = {}
      pengaturan.forEach(p => { map[p.setting_key] = p.setting_value || '' })
      setSettings(prev => ({ ...prev, ...map }))
    }
    if (siswa) setSiswaList(siswa)
    
    // Set status push notification
    const activeSiswaNisns = new Set((subsSiswa || []).map(s => s.nisn))
    const activeOrtuNisns = new Set((subsOrtu || []).map(o => o.nisn_anak))
    setActiveSubs({ siswa: activeSiswaNisns, ortu: activeOrtuNisns })

    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveSetting = async (key, value) => {
    await supabase.from('pengaturan_sekolah').upsert(
      { setting_key: key, setting_value: String(value) },
      { onConflict: 'setting_key' }
    )
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setSaveMsg('')
    const keys = [
      'qr_interval_detik', 'jam_batas_hadir', 'presensi_qr_aktif',
      'selfie_required', 'notif_peringatan_aktif', 'jam_mulai_notif_belum_presensi',
      'notif_pengingat_interval_menit',
      'geofence_aktif', 'geofence_lat', 'geofence_lng', 'geofence_radius_meter',
      'kode_pembatalan_presensi'
    ]
    await Promise.all(keys.map(k => saveSetting(k, settings[k])))
    setSaving(false)
    setSaveMsg('✅ Pengaturan disimpan!')
    setTimeout(() => setSaveMsg(''), 3000)
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

      {/* Link TV */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-indigo-800">🖥️ Halaman Tampilan TV</p>
          <p className="text-xs text-indigo-600 mt-0.5 font-mono break-all">{tvUrl}</p>
        </div>
        <a href={tvUrl} target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors shrink-0 text-center">
          Buka di Tab Baru →
        </a>
      </div>

      {/* Statistik Hari Ini */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-700">{statHariIni.hadir}</p>
          <p className="text-xs font-bold text-emerald-600 mt-1">Sudah Masuk</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-blue-700">{statHariIni.pulang}</p>
          <p className="text-xs font-bold text-blue-600 mt-1">Sudah Pulang</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-rose-700">{statHariIni.belum >= 0 ? statHariIni.belum : '—'}</p>
          <p className="text-xs font-bold text-rose-600 mt-1">Belum Presensi</p>
        </div>
      </div>

      {/* Pengaturan Umum */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3">⚙️ Pengaturan Umum</h3>

        {/* Toggle Aktif */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Aktifkan Presensi QR</p>
            <p className="text-xs text-slate-400">Izinkan siswa presensi via scan QR</p>
          </div>
          <ToggleSwitch value={settings.presensi_qr_aktif} onChange={v => setSettings(p => ({ ...p, presensi_qr_aktif: v }))} />
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

        {/* Jam Batas Hadir */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Jam Batas Hadir <span className="text-slate-400 font-normal">(sebelum = Hadir, sesudah = Terlambat)</span></label>
          <input type="time"
            value={settings.jam_batas_hadir}
            onChange={e => setSettings(p => ({ ...p, jam_batas_hadir: e.target.value }))}
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
          />
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
              <div className="grid grid-cols-2 gap-3">
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
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 disabled:text-slate-400 text-sm font-bold rounded-xl transition-colors border border-slate-200"
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
              <input type="range" min="50" max="2000" step="50"
                value={settings.geofence_radius_meter}
                onChange={e => setSettings(p => ({ ...p, geofence_radius_meter: e.target.value }))}
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>50m (ketat)</span>
                <span>500m (sedang)</span>
                <span>2000m (longgar)</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Siswa yang jaraknya lebih dari <strong>{settings.geofence_radius_meter} meter</strong> dari titik sekolah akan ditolak. Disarankan <strong>200–300 meter</strong> untuk keseimbangan antara keakuratan GPS dan toleransi sinyal.
              </p>
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
            className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700">Daftar Siswa Aktif ({siswaList.length})</p>
            <input type="text" placeholder="Cari nama, NISN, kelas..."
              value={searchSiswa} onChange={e => setSearchSiswa(e.target.value)}
              className="pl-3 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-52 bg-slate-50"
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
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
