import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminPresensiConfigSection() {
  const [settings, setSettings] = useState({
    qr_interval_detik: '20',
    jam_batas_hadir: '07:00',
    presensi_qr_aktif: 'true',
    selfie_required: 'true',
    notif_peringatan_aktif: 'true',
    jam_mulai_notif_belum_presensi: '06:40',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Daftar siswa
  const [siswaList, setSiswaList] = useState([])
  const [searchSiswa, setSearchSiswa] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: pengaturan }, { data: siswa }] = await Promise.all([
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value'),
      supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('is_aktif', true).order('kelas').order('nama_lengkap')
    ])
    if (pengaturan) {
      const map = {}
      pengaturan.forEach(p => { map[p.setting_key] = p.setting_value || '' })
      setSettings(prev => ({ ...prev, ...map }))
    }
    if (siswa) setSiswaList(siswa)
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
      'selfie_required', 'notif_peringatan_aktif', 'jam_mulai_notif_belum_presensi'
    ]
    await Promise.all(keys.map(k => saveSetting(k, settings[k])))
    setSaving(false)
    setSaveMsg('✅ Pengaturan disimpan!')
    setTimeout(() => setSaveMsg(''), 3000)
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

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Pengaturan Presensi QR</h2>
        <p className="text-sm text-slate-500 mt-1">Konfigurasi sistem presensi QR Code, notifikasi web, dan pengingat siswa.</p>
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

        <button onClick={handleSaveAll} disabled={saving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menyimpan...</> : 'Simpan Pengaturan'}
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
            <p className="text-xs text-slate-400">Kirim notif ke siswa setiap 5 menit jika belum presensi</p>
          </div>
          <ToggleSwitch value={settings.notif_peringatan_aktif} onChange={v => setSettings(p => ({ ...p, notif_peringatan_aktif: v }))} colorOn="bg-amber-500" />
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
          <p>• Orang tua yang mengizinkan notifikasi browser akan mendapat push notification</p>
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
                  <th className="px-4 py-3 text-center font-semibold">Status Hari Ini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredSiswa.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400 text-sm">Tidak ada siswa ditemukan.</td></tr>
                ) : filteredSiswa.map(s => (
                  <tr key={s.nisn} className="hover:bg-slate-50/50 bg-white transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.nama_lengkap}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">{s.kelas}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{s.nisn}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-400">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
