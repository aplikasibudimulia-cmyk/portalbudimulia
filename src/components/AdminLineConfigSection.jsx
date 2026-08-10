import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { createPresensiFlexMessage, sendLinePushNotification } from '../utils/lineNotifier'

export default function AdminLineConfigSection() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Test push state
  const [testLineUserId, setTestLineUserId] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Monitoring Report State for Parents
  const [parentReportList, setParentReportList] = useState([])
  const [reportLoading, setReportLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLineStatus, setFilterLineStatus] = useState('all')
  const [filterLoginStatus, setFilterLoginStatus] = useState('all')
  const [filterBiodataStatus, setFilterBiodataStatus] = useState('all')
  const [filterKelas, setFilterKelas] = useState('all')
  const [copiedNisn, setCopiedNisn] = useState(null)

  useEffect(() => {
    fetchConfig()
    fetchParentReport()
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    const { data } = await supabase.from('pengaturan_sekolah').select('setting_key, setting_value')
    if (data) {
      const map = {}
      data.forEach(d => { map[d.setting_key] = d.setting_value })
      setToken(map['line_channel_access_token'] || '')
      setSecret(map['line_channel_secret'] || '')
      setEnabled(map['line_notif_enabled'] === 'true')
    }
    setLoading(false)
  }

  const fetchParentReport = async () => {
    setReportLoading(true)
    try {
      // 1. Fetch active school year
      let activeTaId = null
      try {
        const { data: activeTa } = await supabase.from('tahun_ajaran').select('id').eq('is_aktif', true).maybeSingle()
        if (activeTa?.id) activeTaId = activeTa.id
      } catch (e) {
        console.warn('Failed to fetch active ta:', e)
      }

      // 2. Fetch all students from siswa_permanent (NO SQL filter on nullable status_siswa to avoid NULL filtering out rows)
      const { data: siswaList, error: siswaErr } = await supabase
        .from('siswa_permanent')
        .select('*')
        .order('nama_lengkap', { ascending: true })

      if (siswaErr) {
        console.error('[Parent Report] Error fetching siswa_permanent:', siswaErr)
      }

      const activeSiswaList = (siswaList || []).filter(s => s.status_siswa !== 'Lulus')

      // 3. Fetch enrollments for active TA to get class
      let enrollMap = {}
      if (activeTaId) {
        try {
          const { data: enrolls } = await supabase
            .from('enrollment')
            .select('nisn, kelas')
            .eq('tahun_ajaran_id', activeTaId)

          if (enrolls) {
            enrolls.forEach(e => { if (e.nisn) enrollMap[e.nisn] = e.kelas })
          }
        } catch (e) {
          console.warn('Failed to fetch enrollments:', e)
        }
      }

      // 4. Fetch line_bindings table
      const lineMap = {}
      try {
        const { data: bindings } = await supabase.from('line_bindings').select('nisn, line_user_id')
        if (bindings) {
          bindings.forEach(b => {
            if (b.nisn && b.line_user_id) lineMap[b.nisn] = b.line_user_id
          })
        }
      } catch (e) {
        console.warn('Failed to fetch line_bindings:', e)
      }

      // 5. Fetch activity_log for parent logins safely
      const loggedNisns = new Set()
      try {
        const { data: logs } = await supabase
          .from('activity_log')
          .select('detail, aksi, aktor')
          .limit(500)

        if (logs) {
          logs.forEach(l => {
            const str = `${l.aktor || ''} ${l.aksi || ''} ${l.detail || ''}`
            if (str.toLowerCase().includes('orang tua') || str.toLowerCase().includes('ortu')) {
              const match = str.match(/NISN:\s*([0-9A-Z]+)/i)
              if (match && match[1]) {
                loggedNisns.add(match[1].trim())
              }
            }
          })
        }
      } catch (e) {
        console.warn('Failed to fetch activity_log:', e)
      }

      // Process list
      const processed = activeSiswaList.map(s => {
        const lineId = lineMap[s.nisn] || s.line_user_id || null
        const isLineLinked = Boolean(lineId)
        
        const hasNama = Boolean(s.nama_ortu && s.nama_ortu.trim() !== '')
        const hasEmail = Boolean(s.email_ortu && s.email_ortu.trim() !== '')
        const hasHp = Boolean(s.no_hp_ortu && s.no_hp_ortu.trim() !== '')
        const isBiodataComplete = hasNama && hasEmail && hasHp

        const missingFields = []
        if (!hasNama) missingFields.push('Nama')
        if (!hasEmail) missingFields.push('Email')
        if (!hasHp) missingFields.push('No HP')

        // Login status: if logged in activity_log OR if line_user_id is set OR if biodata filled
        const hasLoggedIn = loggedNisns.has(s.nisn) || isLineLinked || (hasEmail || hasHp)

        const studentClass = enrollMap[s.nisn] || s.kelas || s.kelas_aktif || '-'

        return {
          nisn: s.nisn,
          nama_lengkap: s.nama_lengkap || s.nama || '-',
          kelas: studentClass,
          nama_ortu: s.nama_ortu || '',
          email_ortu: s.email_ortu || '',
          no_hp_ortu: s.no_hp_ortu || '',
          kode_akses: s.ortu_password || s.kode_akses || '',
          is_line_linked: isLineLinked,
          line_user_id: lineId,
          has_logged_in: hasLoggedIn,
          is_biodata_complete: isBiodataComplete,
          missing_fields: missingFields,
        }
      })

      setParentReportList(processed)
    } catch (err) {
      console.error('Error fetching parent report:', err)
    } finally {
      setReportLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)

    const updates = [
      { setting_key: 'line_channel_access_token', setting_value: token },
      { setting_key: 'line_channel_secret', setting_value: secret },
      { setting_key: 'line_notif_enabled', setting_value: String(enabled) },
    ]

    for (const item of updates) {
      await supabase.from('pengaturan_sekolah').upsert(item, { onConflict: 'setting_key' })
    }

    setSaving(false)
    alert('Pengaturan LINE Messaging API berhasil disimpan!')
  }

  const handleTestSend = async () => {
    if (!testLineUserId.trim()) {
      alert('Masukkan LINE User ID tujuan uji coba.')
      return
    }

    setTesting(true)
    setTestResult(null)

    const testFlex = createPresensiFlexMessage({
      nama: 'Siswa Uji Coba (Budi)',
      nisn: '1234567890',
      kelas: '8A',
      status: 'H',
      waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      tipe: 'masuk',
      sekolahNama: 'SMP Budi Mulia Jakarta',
    })

    const res = await sendLinePushNotification({
      lineUserId: testLineUserId.trim(),
      flexMessage: testFlex,
      accessToken: token,
    })

    setTesting(false)
    setTestResult(res)
  }

  const copyBindingCmd = (nisn, kodeAkses) => {
    const cmd = `TAUTKAN ${nisn} ${kodeAkses || ''}`.trim()
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => {
        setCopiedNisn(nisn)
        setTimeout(() => setCopiedNisn(null), 2000)
      })
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = cmd
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedNisn(nisn)
      setTimeout(() => setCopiedNisn(null), 2000)
    }
  }

  // Filtered dataset for reporting
  const filteredParents = parentReportList.filter(row => {
    // Search
    const q = searchQuery.toLowerCase().trim()
    if (q) {
      const matchNisn = row.nisn.toLowerCase().includes(q)
      const matchSiswa = row.nama_lengkap.toLowerCase().includes(q)
      const matchOrtu = row.nama_ortu.toLowerCase().includes(q)
      const matchEmail = row.email_ortu.toLowerCase().includes(q)
      const matchHp = row.no_hp_ortu.toLowerCase().includes(q)
      if (!matchNisn && !matchSiswa && !matchOrtu && !matchEmail && !matchHp) return false
    }

    // Filter Kelas
    if (filterKelas !== 'all' && row.kelas !== filterKelas) return false

    // Filter Line Status
    if (filterLineStatus === 'linked' && !row.is_line_linked) return false
    if (filterLineStatus === 'unlinked' && row.is_line_linked) return false

    // Filter Login Status
    if (filterLoginStatus === 'logged_in' && !row.has_logged_in) return false
    if (filterLoginStatus === 'never_logged_in' && row.has_logged_in) return false

    // Filter Biodata Status
    if (filterBiodataStatus === 'complete' && !row.is_biodata_complete) return false
    if (filterBiodataStatus === 'incomplete' && row.is_biodata_complete) return false

    return true
  })

  // Unique Classes list for filter
  const classOptions = Array.from(new Set(parentReportList.map(p => p.kelas).filter(k => k && k !== '-'))).sort()

  // Overall Statistics
  const totalCount = parentReportList.length
  const totalLineLinked = parentReportList.filter(p => p.is_line_linked).length
  const pctLineLinked = totalCount ? Math.round((totalLineLinked / totalCount) * 100) : 0

  const totalLoggedIn = parentReportList.filter(p => p.has_logged_in).length
  const pctLoggedIn = totalCount ? Math.round((totalLoggedIn / totalCount) * 100) : 0

  const totalBiodataComplete = parentReportList.filter(p => p.is_biodata_complete).length
  const pctBiodataComplete = totalCount ? Math.round((totalBiodataComplete / totalCount) * 100) : 0

  // CSV Export
  const exportToCSV = () => {
    if (filteredParents.length === 0) {
      alert('Tidak ada data untuk diekspor.')
      return
    }

    const headers = ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Nama Orang Tua', 'Email Orang Tua', 'No HP Orang Tua', 'Status LINE', 'LINE User ID', 'Status Login Portal', 'Status Biodata', 'Perintah Tautan LINE Bot']
    const rows = filteredParents.map((p, idx) => [
      idx + 1,
      `"${p.nisn}"`,
      `"${p.nama_lengkap.replace(/"/g, '""')}"`,
      `"${p.kelas}"`,
      `"${(p.nama_ortu || '-').replace(/"/g, '""')}"`,
      `"${p.email_ortu || '-'}"`,
      `"${p.no_hp_ortu || '-'}"`,
      p.is_line_linked ? 'Sudah Tautkan' : 'Belum Tautkan',
      `"${p.line_user_id || '-'}"`,
      p.has_logged_in ? 'Pernah Login' : 'Belum Login',
      p.is_biodata_complete ? 'Lengkap' : `Belum Lengkap (Kurang: ${p.missing_fields.join(', ')})`,
      `"TAUTKAN ${p.nisn} ${p.kode_akses}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Laporan_LINE_OrangTua_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟢</span>
            <h2 className="text-2xl font-black tracking-tight">Integrasi LINE & Monitoring Orang Tua</h2>
          </div>
          <p className="text-emerald-100 text-sm">
            Kelola konfigurasi LINE Messaging API serta pantau status penautan LINE, riwayat login portal, dan kelengkapan biodata orang tua.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2 text-left sm:text-right shrink-0">
          <span className="text-xs text-emerald-200 uppercase font-bold block">Status Bot LINE</span>
          <span className={`text-sm font-black ${enabled ? 'text-emerald-300' : 'text-slate-300'}`}>
            {enabled ? '🟢 AKTIF' : '⚪ NON-AKTIF'}
          </span>
        </div>
      </div>

      {/* Grid Konfigurasi & Uji Coba */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Pengaturan */}
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
            🔑 Konfigurasi Kredensial LINE
          </h3>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Status Notifikasi LINE
            </label>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 border ${
                enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {enabled ? '✅ Notifikasi LINE Diaktifkan' : '🚫 Notifikasi LINE Dinonaktifkan'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Channel Access Token (Long-Lived)
            </label>
            <textarea
              rows={4}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Masukkan Channel Access Token dari LINE Developers Console..."
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Channel Secret (Opsional)
            </label>
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Masukkan Channel Secret..."
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-3 rounded-xl transition-colors shadow-md disabled:opacity-50"
          >
            {saving ? 'Saving...' : '💾 Simpan Pengaturan LINE'}
          </button>
        </form>

        {/* Form Uji Coba Push */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
              🧪 Uji Coba Pengiriman Flex Message
            </h3>
            <p className="text-xs text-slate-500">
              Kirimkan kartu notifikasi presensi simulasi ke akun LINE Anda untuk menguji apakah token valid.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                LINE User ID Tujuan (Uji Coba)
              </label>
              <input
                type="text"
                value={testLineUserId}
                onChange={(e) => setTestLineUserId(e.target.value)}
                placeholder="Contoh: U1234567890abcdef..."
                className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                *Dapatkan LINE User ID dari webhook LINE console atau saat user add bot.
              </span>
            </div>

            <button
              type="button"
              onClick={handleTestSend}
              disabled={testing || !token}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {testing ? 'Mengirim...' : '🚀 Kirim Notifikasi Uji Coba'}
            </button>

            {testResult && (
              <div className={`p-3 rounded-xl text-xs font-mono ${testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {testResult.success ? (
                  <p>✅ <strong>Sukses:</strong> Notifikasi uji coba berhasil terkirim ke LINE!</p>
                ) : (
                  <p>❌ <strong>Gagal ({testResult.status || 'Error'}):</strong> {testResult.error || testResult.reason}</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-[11px] text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">💡 Petunjuk Singkat LINE Official Console:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Buka <a href="https://developers.line.biz/" target="_blank" rel="noreferrer" className="text-emerald-600 underline font-bold">LINE Developers Console</a></li>
              <li>Buat <strong>Messaging API Channel</strong> baru.</li>
              <li>Issue <strong>Channel Access Token (long-lived)</strong> di tab Messaging API.</li>
              <li>Copy & paste token ke form di samping.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* SECTION MONITORING & LAPORAN ORANG TUA */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-100">
          <div>
            <h3 className="font-black text-slate-900 text-xl flex items-center gap-2">
              📊 Laporan & Monitoring Akun Orang Tua
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Informasi lengkap penautan LINE, riwayat login portal, serta status kelengkapan biodata orang tua siswa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchParentReport}
              disabled={reportLoading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
            >
              <svg className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <span>Refresh</span>
            </button>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-md flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              <span>Export Excel / CSV</span>
            </button>
          </div>
        </div>

        {/* Ringkasan Statistik (KPI Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-1">
            <span className="text-xs text-slate-500 font-semibold block">Total Wali / Siswa</span>
            <div className="text-2xl font-black text-slate-900">{totalCount}</div>
            <span className="text-[11px] text-slate-400 font-medium">Siswa terdaftar aktif</span>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-800 font-bold block">Tautkan LINE</span>
              <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-900 font-bold rounded-full">{pctLineLinked}%</span>
            </div>
            <div className="text-2xl font-black text-emerald-900">{totalLineLinked} <span className="text-xs font-normal text-emerald-700">/ {totalCount}</span></div>
            <span className="text-[11px] text-emerald-700 font-medium">Aktif notifikasi presensi</span>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-800 font-bold block">Pernah Login Portal</span>
              <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-900 font-bold rounded-full">{pctLoggedIn}%</span>
            </div>
            <div className="text-2xl font-black text-blue-900">{totalLoggedIn} <span className="text-xs font-normal text-blue-700">/ {totalCount}</span></div>
            <span className="text-[11px] text-blue-700 font-medium">Pernah akses akun ortu</span>
          </div>

          <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-purple-800 font-bold block">Biodata Lengkap</span>
              <span className="text-xs px-2 py-0.5 bg-purple-200 text-purple-900 font-bold rounded-full">{pctBiodataComplete}%</span>
            </div>
            <div className="text-2xl font-black text-purple-900">{totalBiodataComplete} <span className="text-xs font-normal text-purple-700">/ {totalCount}</span></div>
            <span className="text-[11px] text-purple-700 font-medium">Terisi Nama, Email & HP</span>
          </div>
        </div>

        {/* Filters & Search Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
          {/* Search Box */}
          <div className="lg:col-span-1">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Cari Data</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Siswa, NISN, Ortu, HP..."
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium"
            />
          </div>

          {/* Filter Kelas */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Kelas</label>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium"
            >
              <option value="all">Semua Kelas ({parentReportList.length})</option>
              {classOptions.map(k => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>
          </div>

          {/* Filter LINE */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Status LINE</label>
            <select
              value={filterLineStatus}
              onChange={(e) => setFilterLineStatus(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium"
            >
              <option value="all">Semua Status LINE</option>
              <option value="linked">🟢 Sudah Menautkan ({totalLineLinked})</option>
              <option value="unlinked">🔴 Belum Menautkan ({totalCount - totalLineLinked})</option>
            </select>
          </div>

          {/* Filter Login */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Status Login Portal</label>
            <select
              value={filterLoginStatus}
              onChange={(e) => setFilterLoginStatus(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium"
            >
              <option value="all">Semua Status Login</option>
              <option value="logged_in">🟢 Sudah Pernah Login ({totalLoggedIn})</option>
              <option value="never_logged_in">⚪ Belum Pernah Login ({totalCount - totalLoggedIn})</option>
            </select>
          </div>

          {/* Filter Biodata */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Status Biodata Ortu</label>
            <select
              value={filterBiodataStatus}
              onChange={(e) => setFilterBiodataStatus(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-medium"
            >
              <option value="all">Semua Biodata</option>
              <option value="complete">🟢 Biodata Lengkap ({totalBiodataComplete})</option>
              <option value="incomplete">⚠️ Biodata Belum Lengkap ({totalCount - totalBiodataComplete})</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-extrabold sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-12 text-center">No</th>
                  <th className="px-4 py-3">Siswa & Kelas</th>
                  <th className="px-4 py-3">Data Orang Tua</th>
                  <th className="px-4 py-3">Status Biodata</th>
                  <th className="px-4 py-3 text-center">Login Portal</th>
                  <th className="px-4 py-3 text-center">Status LINE</th>
                  <th className="px-4 py-3 text-center">Perintah Tautan LINE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportLoading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400 font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                        <span>Memuat data laporan orang tua...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredParents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400 font-medium">
                      Tidak ada data yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredParents.map((row, idx) => (
                    <tr key={row.nisn} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center font-mono text-slate-400 font-semibold">{idx + 1}</td>

                      {/* Siswa */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{row.nama_lengkap}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          NISN: <span className="font-bold text-slate-700">{row.nisn}</span> | Kelas: <span className="font-bold text-emerald-700">{row.kelas}</span>
                        </div>
                      </td>

                      {/* Ortu */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{row.nama_ortu || <span className="text-slate-400 italic">Belum Diisi</span>}</div>
                        <div className="text-[11px] text-slate-500">
                          {row.email_ortu || '-'} {row.no_hp_ortu ? `• ${row.no_hp_ortu}` : ''}
                        </div>
                      </td>

                      {/* Status Biodata */}
                      <td className="px-4 py-3">
                        {row.is_biodata_complete ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            🟢 Lengkap
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              ⚠️ Belum Lengkap
                            </span>
                            <div className="text-[10px] text-rose-600 font-medium">
                              Kurang: {row.missing_fields.join(', ')}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status Login */}
                      <td className="px-4 py-3 text-center">
                        {row.has_logged_in ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                            🔑 Pernah Login
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            ⚪ Belum Login
                          </span>
                        )}
                      </td>

                      {/* Status LINE */}
                      <td className="px-4 py-3 text-center">
                        {row.is_line_linked ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              🟢 Menautkan
                            </span>
                            <div className="text-[10px] font-mono text-slate-400 truncate max-w-[120px] mx-auto mt-0.5" title={row.line_user_id}>
                              ID: {row.line_user_id}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            🔴 Belum Taut
                          </span>
                        )}
                      </td>

                      {/* Action Copas Perintah */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => copyBindingCmd(row.nisn, row.kode_akses)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl font-mono font-bold text-[11px] transition-all flex items-center justify-center gap-1 mx-auto"
                          title="Copas kode perintah TAUTKAN untuk orang tua"
                        >
                          <span>{copiedNisn === row.nisn ? '✅ Copied!' : `📋 TAUTKAN ${row.nisn}`}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
            <span>Menampilkan <strong>{filteredParents.length}</strong> dari <strong>{parentReportList.length}</strong> orang tua siswa</span>
            <span>Gunakan tombol <strong>Export Excel / CSV</strong> untuk mengunduh laporan lengkap.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
