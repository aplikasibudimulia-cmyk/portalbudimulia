import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const TELEGRAM_SETUP_STEPS = [
  { num: '1', text: 'Buka Telegram, cari @BotFather dan ketik /newbot' },
  { num: '2', text: 'Ikuti instruksi, beri nama bot Anda (contoh: eBudiMulia Budi Mulia)' },
  { num: '3', text: 'Salin Bot Token yang diberikan BotFather (format: 123456:ABC-DEF...)' },
  { num: '4', text: 'Tempel token di kolom "Telegram Bot Token" di bawah ini' },
  { num: '5', text: 'Untuk Chat ID orang tua: minta ortu chat bot lalu forward pesan ke @userinfobot' },
]

export default function AdminPresensiConfigSection() {
  const [settings, setSettings] = useState({
    qr_interval_detik: '20',
    jam_batas_hadir: '07:00',
    telegram_bot_token: '',
    presensi_qr_aktif: 'true',
    selfie_required: 'true',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)

  // Daftar siswa & telegram ortu
  const [siswaList, setSiswaList] = useState([])
  const [telegramMap, setTelegramMap] = useState({})
  const [searchSiswa, setSearchSiswa] = useState('')
  const [editingNisn, setEditingNisn] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [savingNisn, setSavingNisn] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: pengaturan }, { data: siswa }] = await Promise.all([
      supabase.from('pengaturan_sekolah').select('setting_key, setting_value'),
      supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas, telegram_ortu').eq('is_aktif', true).order('kelas').order('nama_lengkap')
    ])
    if (pengaturan) {
      const map = {}
      pengaturan.forEach(p => { map[p.setting_key] = p.setting_value || '' })
      setSettings(prev => ({ ...prev, ...map }))
    }
    if (siswa) {
      setSiswaList(siswa)
      const tm = {}
      siswa.forEach(s => { tm[s.nisn] = s.telegram_ortu || '' })
      setTelegramMap(tm)
    }
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
    const keys = ['qr_interval_detik', 'jam_batas_hadir', 'telegram_bot_token', 'presensi_qr_aktif', 'selfie_required']
    await Promise.all(keys.map(k => saveSetting(k, settings[k])))
    setSaving(false)
    setSaveMsg('✅ Pengaturan disimpan!')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const handleSaveTelegram = async (nisn) => {
    setSavingNisn(nisn)
    await supabase.from('siswa_permanent').update({ telegram_ortu: editVal.trim() }).eq('nisn', nisn)
    setTelegramMap(prev => ({ ...prev, [nisn]: editVal.trim() }))
    setSiswaList(prev => prev.map(s => s.nisn === nisn ? { ...s, telegram_ortu: editVal.trim() } : s))
    setEditingNisn(null)
    setSavingNisn(null)
  }

  const filteredSiswa = siswaList.filter(s =>
    !searchSiswa || s.nama_lengkap.toLowerCase().includes(searchSiswa.toLowerCase()) || s.nisn.includes(searchSiswa) || s.kelas.toLowerCase().includes(searchSiswa.toLowerCase())
  )

  const tvUrl = `${window.location.origin}/presensi-tv`

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Pengaturan Presensi QR</h2>
        <p className="text-sm text-slate-500 mt-1">Konfigurasi sistem presensi QR Code, notifikasi Telegram, dan nomor kontak orang tua.</p>
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

      {/* Pengaturan Umum */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-3">⚙️ Pengaturan Umum</h3>

        {/* Toggle Aktif */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Aktifkan Presensi QR</p>
            <p className="text-xs text-slate-400">Izinkan siswa presensi via scan QR</p>
          </div>
          <button
            onClick={() => setSettings(p => ({ ...p, presensi_qr_aktif: p.presensi_qr_aktif === 'true' ? 'false' : 'true' }))}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${settings.presensi_qr_aktif === 'true' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${settings.presensi_qr_aktif === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
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
          <label className="block text-sm font-semibold text-slate-700 mb-2">Jam Batas Hadir (sebelum = Hadir, sesudah = Terlambat)</label>
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
            <p className="text-xs text-slate-400">Siswa harus ambil foto selfie setelah scan QR</p>
          </div>
          <button
            onClick={() => setSettings(p => ({ ...p, selfie_required: p.selfie_required === 'true' ? 'false' : 'true' }))}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${settings.selfie_required === 'true' ? 'bg-indigo-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${settings.selfie_required === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <button onClick={handleSaveAll} disabled={saving}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Menyimpan...</> : 'Simpan Pengaturan'}
        </button>
        {saveMsg && <p className="text-sm font-semibold text-emerald-600 text-center">{saveMsg}</p>}
      </div>

      {/* Telegram Bot Setup */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800">🤖 Konfigurasi Telegram Bot</h3>
          <button onClick={() => setShowSetupGuide(p => !p)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-2xl border border-indigo-200 transition-colors">
            {showSetupGuide ? 'Tutup' : '❓ Cara Setup Bot'}
          </button>
        </div>

        {showSetupGuide && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2.5">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Panduan Setup Telegram Bot</p>
            {TELEGRAM_SETUP_STEPS.map(s => (
              <div key={s.num} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">{s.num}</div>
                <p className="text-xs text-amber-900">{s.text}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Telegram Bot Token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="123456789:ABCdefGHI..."
              value={settings.telegram_bot_token}
              onChange={e => setSettings(p => ({ ...p, telegram_bot_token: e.target.value }))}
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
            />
            <button onClick={() => setShowToken(p => !p)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors text-xs font-bold">
              {showToken ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Token ini disimpan terenkripsi di server. Jangan bagikan ke siapapun.</p>
        </div>

        <button onClick={handleSaveAll} disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl transition-all text-sm">
          Simpan Token
        </button>
      </div>

      {/* Daftar Telegram Ortu */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800">📱 Nomor Telegram Orang Tua</h3>
            <p className="text-xs text-slate-500 mt-0.5">Isi Chat ID Telegram orang tua untuk notifikasi presensi</p>
          </div>
          <div className="relative">
            <input type="text" placeholder="Cari nama, NISN, kelas..." value={searchSiswa} onChange={e => setSearchSiswa(e.target.value)}
              className="pl-4 pr-10 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-64 bg-slate-50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Nama Siswa</th>
                <th className="px-5 py-3 text-left font-semibold w-20">Kelas</th>
                <th className="px-5 py-3 text-left font-semibold">NISN</th>
                <th className="px-5 py-3 text-left font-semibold">Telegram Ortu (Chat ID)</th>
                <th className="px-5 py-3 text-center font-semibold w-20">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredSiswa.length === 0 ? (
                <tr><td colSpan="5" className="px-5 py-8 text-center text-slate-400 text-sm">Tidak ada siswa ditemukan.</td></tr>
              ) : filteredSiswa.map(s => (
                <tr key={s.nisn} className="hover:bg-slate-50/50 bg-white transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-800">{s.nama_lengkap}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold border border-indigo-100">{s.kelas}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs font-mono">{s.nisn}</td>
                  <td className="px-5 py-3">
                    {editingNisn === s.nisn ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          placeholder="Chat ID (contoh: -1001234567890)"
                          className="px-3 py-1.5 border border-indigo-300 rounded-2xl text-xs w-52 focus:ring-2 focus:ring-indigo-500 outline-none font-mono bg-white"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveTelegram(s.nisn); if (e.key === 'Escape') setEditingNisn(null) }}
                        />
                        <button onClick={() => handleSaveTelegram(s.nisn)} disabled={savingNisn === s.nisn}
                          className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-2xl text-xs font-bold hover:bg-emerald-700 transition-colors">
                          {savingNisn === s.nisn ? '...' : 'Simpan'}
                        </button>
                        <button onClick={() => setEditingNisn(null)} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-colors">Batal</button>
                      </div>
                    ) : (
                      <span className={`text-xs font-mono ${telegramMap[s.nisn] ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded' : 'text-slate-400 italic'}`}>
                        {telegramMap[s.nisn] || '— belum diisi —'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {editingNisn !== s.nisn && (
                      <button onClick={() => { setEditingNisn(s.nisn); setEditVal(telegramMap[s.nisn] || '') }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          <span className="font-bold text-emerald-600">{Object.values(telegramMap).filter(Boolean).length}</span> dari{' '}
          <span className="font-bold">{siswaList.length}</span> orang tua sudah memiliki Chat ID Telegram.
        </div>
      </div>
    </div>
  )
}
