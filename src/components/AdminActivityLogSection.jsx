import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminActivityLogSection() {
  const [activeTab, setActiveTab] = useState('honeypot') // 'honeypot' | 'general'
  const [logs, setLogs] = useState([])
  const [accessLogs, setAccessLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [siswaMap, setSiswaMap] = useState({})

  // Modal Komunikasi dengan Hacker / Penyusup
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [messagePrompt, setMessagePrompt] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [alertNotification, setAlertNotification] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  // 🔒 Kunci Keamanan Khusus Menu Log Aktivitas
  const LOG_SECURITY_PIN = 'Bm135531@@'
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return sessionStorage.getItem('ebm_log_unlocked') === 'true'
  })
  const [securityPinInput, setSecurityPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [showPin, setShowPin] = useState(false)

  const handleVerifyPin = (e) => {
    e.preventDefault()
    if (securityPinInput === LOG_SECURITY_PIN) {
      sessionStorage.setItem('ebm_log_unlocked', 'true')
      setIsUnlocked(true)
      setPinError('')
      setSecurityPinInput('')
    } else {
      setPinError('Kode otorisasi salah. Akses Log Aktivitas ditolak!')
    }
  }

  const handleLockMenu = () => {
    sessionStorage.removeItem('ebm_log_unlocked')
    setIsUnlocked(false)
    setSecurityPinInput('')
  }

  useEffect(() => {
    fetchLogsAndSiswa()
    fetchAccessLogs()

    // 1. Polling berkala setiap 4 detik agar selalu update otomatis
    const intervalId = setInterval(() => {
      fetchAccessLogs()
    }, 4000)

    // 2. Realtime subscription untuk mendeteksi login baru & balasan hacker seketika
    const channel = supabase.channel('realtime-admin-access-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_access_logs' }, () => {
        fetchAccessLogs()
      })
      .subscribe()

    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchAccessLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (data) {
        setAccessLogs(data)
      } else if (error) {
        console.warn('Access logs table not ready or empty:', error.message)
      }
    } catch (e) {
      console.warn('Error fetching access logs:', e)
    }
  }

  const fetchLogsAndSiswa = async () => {
    setLoading(true)
    try {
      const [
        { data: logData, error: logErr },
        { data: siswaData }
      ] = await Promise.all([
        supabase
          .from('activity_log')
          .select('id, aktor, aksi, detail, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap')
      ])

      if (siswaData) {
        const map = {}
        siswaData.forEach(s => {
          if (s.nisn) map[s.nisn] = s.nama_lengkap || s.nama || ''
        })
        setSiswaMap(map)
      }

      if (logData) {
        setLogs(logData)
      } else if (logErr) {
        console.error('Fetch Logs Error:', logErr)
      }
    } catch (err) {
      console.error('Error fetching activity log:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return '-'
    const d = new Date(isoString)
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(d)
  }

  const renderDetailText = (detail) => {
    if (!detail) return '-'
    const matchNisn = detail.match(/(?:dengan NISN|NISN:?)\s*([0-9A-Z]+)/i)
    if (matchNisn && matchNisn[1]) {
      const nisn = matchNisn[1].trim()
      const studentName = siswaMap[nisn]
      if (studentName && !detail.toLowerCase().includes(studentName.toLowerCase())) {
        return detail
          .replace(`dengan NISN ${nisn}`, `dari ${studentName} (NISN: ${nisn})`)
          .replace(`NISN: ${nisn}`, `${studentName} (NISN: ${nisn})`)
          .replace(`NISN ${nisn}`, `${studentName} (NISN: ${nisn})`)
      }
    }
    return detail
  }

  const handleOpenSendMessage = (target) => {
    setSelectedTarget(target)
    setMessagePrompt(
      target.admin_message ||
      `Halo. Aktivitas Anda terpantau dari area ${target.city || 'lokasi Anda'} menggunakan IP ${target.ip_address || ''}. Harap segera hentikan aktivitas ini dan temui Tim IT / Admin SMP Budi Mulia untuk klarifikasi.`
    )
  }

  const handleSendMessageToHacker = async (e) => {
    e.preventDefault()
    if (!selectedTarget || !messagePrompt.trim()) return

    setSendingMsg(true)
    try {
      const { data, error } = await supabase.rpc('fn_send_admin_intervention', {
        p_log_id: selectedTarget.id,
        p_message: messagePrompt.trim()
      })

      if (error || !data?.ok) {
        setAlertNotification({ type: 'error', text: data?.msg || error?.message || 'Gagal mengirim pesan.' })
      } else {
        setAlertNotification({ type: 'success', text: 'Pesan intervensi berhasil dikirim langsung ke layar penyusup!' })
        setSelectedTarget(null)
        fetchAccessLogs()
      }
    } catch (err) {
      setAlertNotification({ type: 'error', text: err.message || 'Terjadi kesalahan sistem.' })
    } finally {
      setSendingMsg(false)
      setTimeout(() => setAlertNotification(null), 5000)
    }
  }

  const handleClearAllLogs = async () => {
    if (!window.confirm('Hapus seluruh riwayat log akses penyusup? Seluruh rekaman lokasi & komunikasi akan dibersihkan.')) return
    try {
      const { error } = await supabase
        .from('admin_access_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (!error) {
        setAccessLogs([])
        setAlertNotification({ type: 'success', text: 'Seluruh riwayat log akses berhasil dibersihkan!' })
      } else {
        setAlertNotification({ type: 'error', text: 'Gagal membersihkan log: ' + error.message })
      }
    } catch (err) {
      setAlertNotification({ type: 'error', text: err.message })
    }
  }

  const handleDeleteSingleLog = async (id) => {
    if (!window.confirm('Hapus baris log ini?')) return
    try {
      const { error } = await supabase
        .from('admin_access_logs')
        .delete()
        .eq('id', id)

      if (!error) {
        setAccessLogs(prev => prev.filter(item => item.id !== id))
        setAlertNotification({ type: 'success', text: 'Baris log berhasil dihapus.' })
      } else {
        setAlertNotification({ type: 'error', text: 'Gagal menghapus baris: ' + error.message })
      }
    } catch (err) {
      setAlertNotification({ type: 'error', text: err.message })
    }
  }

  // Jika menu belum dibuka dengan kode keamanan Bm135531@@, tampilkan layar gembok proteksi
  if (!isUnlocked) {
    return (
      <div className="min-h-[460px] flex items-center justify-center p-4 animate-fade-in font-sans">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 border-2 border-red-200 rounded-3xl mx-auto flex items-center justify-center text-3xl shadow-sm">
            🔐
          </div>
          <div>
            <span className="text-[10px] font-black tracking-widest uppercase bg-red-100 text-red-700 px-3 py-1 rounded-full">
              Area Keamanan Tingkat Dua
            </span>
            <h3 className="text-lg font-black text-slate-900 mt-2.5">
              Verifikasi Otorisasi Log Aktivitas
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Menu ini memuat rekaman pelacak IP, lokasi, dan komunikasi dua arah dengan penyusup. Masukkan kode otorisasi keamanan Administrator untuk membuka akses.
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={securityPinInput}
                onChange={(e) => {
                  setSecurityPinInput(e.target.value)
                  setPinError('')
                }}
                placeholder="Masukkan kode keamanan..."
                className={`w-full px-4 py-3.5 rounded-xl border text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 transition ${
                  pinError
                    ? 'border-red-500 bg-red-50/50 focus:ring-red-500 text-red-900'
                    : 'border-slate-300 focus:ring-red-500 focus:border-red-500'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600 transition"
              >
                {showPin ? '🙈' : '👁️'}
              </button>
            </div>

            {pinError && (
              <p className="text-xs font-bold text-red-600">
                ⚠️ {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2"
            >
              <span>🔓</span>
              <span>Buka Akses Log Aktivitas</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            SMP Budi Mulia Jakarta • Administrator Security Guard
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-slide-up space-y-6 font-sans">
      
      {/* Header Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pusat Keamanan &amp; Log Aktivitas</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
              🛡️ Live Monitoring
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Pelacak lokasi rinci akses login admin, intervensi penyusup dua arah, dan riwayat sistem.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => { fetchLogsAndSiswa(); fetchAccessLogs() }} 
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition"
            title="Segarkan Data"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Segarkan Log
          </button>
          <button
            onClick={handleLockMenu}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shadow-xs transition"
            title="Kunci kembali menu ini dengan kode keamanan"
          >
            <span>🔒</span>
            <span>Kunci</span>
          </button>
        </div>
      </div>

      {/* Notifikasi Toast */}
      {alertNotification && (
        <div className={`p-4 rounded-2xl text-xs font-bold border animate-fade-in flex items-center justify-between ${
          alertNotification.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <span>{alertNotification.text}</span>
          <button onClick={() => setAlertNotification(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('honeypot')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition ${
            activeTab === 'honeypot'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🎯</span>
          <span>Pelacak Lokasi &amp; Komunikasi Penyusup ({accessLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition ${
            activeTab === 'general'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📋</span>
          <span>Log Aktivitas Umum ({logs.length})</span>
        </button>
      </div>

      {/* TAB 1: PELACAK LOKASI & HONEYPOT INTERAKTIF */}
      {activeTab === 'honeypot' && (
        <div className="space-y-4">
          
          <div className="bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 border border-red-200 rounded-2xl p-4 text-xs text-red-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-extrabold text-red-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                Sistem Perekam Otomatis &amp; Honeypot Aktif
              </p>
              <p className="text-[11px] text-red-800 mt-0.5">
                Setiap kali seseorang membuka atau mencoba masuk ke halaman admin, koordinat, kota, ISP, IP, dan tipe perangkat langsung terekam. Anda bisa mengirim pesan langsung ke layarnya saat itu juga.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => fetchAccessLogs()}
                className="inline-flex items-center gap-1 text-[11px] font-bold bg-white hover:bg-slate-50 border border-red-200 text-red-900 px-3 py-1.5 rounded-xl shadow-xs transition active:scale-95"
              >
                <span>🔄</span>
                <span>Segarkan Data</span>
              </button>
              <button
                onClick={handleClearAllLogs}
                disabled={accessLogs.length === 0}
                className="inline-flex items-center gap-1 text-[11px] font-bold bg-white hover:bg-rose-50 border border-red-200 text-red-700 disabled:opacity-50 px-3 py-1.5 rounded-xl shadow-xs transition active:scale-95"
                title="Hapus seluruh riwayat log akses"
              >
                <span>🗑️</span>
                <span>Bersihkan Log</span>
              </button>
              <span className="text-[10px] font-mono font-bold bg-white/80 border border-red-200 px-3 py-1.5 rounded-xl">
                {accessLogs.filter(a => a.hacker_reply).length} Balasan Diterima
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                    <th className="px-4 py-3.5 whitespace-nowrap">Waktu</th>
                    <th className="px-4 py-3.5">Identitas</th>
                    <th className="px-4 py-3.5">Lokasi &amp; Jaringan</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">Perangkat</th>
                    <th className="px-4 py-3.5">Status Komunikasi</th>
                    <th className="px-4 py-3.5 text-center whitespace-nowrap">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accessLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                        Belum ada aktivitas login admin yang tercatat. Buka halaman <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600">/login-admin</code> untuk menguji pelacak ini.
                      </td>
                    </tr>
                  ) : accessLogs.map((item) => {
                    const hasReply = Boolean(item.hacker_reply)
                    const hasSentMsg = Boolean(item.admin_message)

                    return (
                      <tr key={item.id} className={`hover:bg-slate-50 transition ${hasReply ? 'bg-amber-50/40' : ''}`}>
                        
                        {/* Waktu */}
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatTime(item.created_at)}
                        </td>

                        {/* Akun & Identitas Tersadap */}
                        <td className="px-4 py-3 max-w-[200px]">
                          <div className="flex items-start gap-2.5">
                            {/* Thumbnail Foto Wajah (jika ada) */}
                            {item.photo_url ? (
                              <button
                                type="button"
                                onClick={() => setSelectedPhoto(item.photo_url)}
                                className="relative shrink-0 group"
                                title="Klik untuk memperbesar foto tangkapan wajah pelaku"
                              >
                                <img
                                  src={item.photo_url}
                                  alt="Foto Wajah"
                                  className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500 shadow-sm group-hover:scale-105 transition"
                                />
                                <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-[8px] text-white rounded-full px-1 font-bold">
                                  📸
                                </span>
                              </button>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs text-slate-400 shrink-0">
                                👤
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              {/* Identitas Siswa Tersadap dari HP */}
                              {item.device_identity && (
                                <div className="mb-1">
                                  <span
                                    className="text-[9.5px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md inline-block max-w-full truncate"
                                    title={item.device_identity}
                                  >
                                    {item.device_identity}
                                  </span>
                                </div>
                              )}

                              <span className="font-bold text-slate-900 block truncate text-[11px]" title={item.email}>
                                {item.email || 'Tanpa Email'}
                              </span>
                              <span className="text-[9.5px] text-slate-400 font-mono block truncate" title={item.session_id}>
                                Sesi: {item.session_id ? item.session_id.substring(0, 10) + '...' : '-'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Lokasi Rinci & ISP */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="flex items-center gap-1 font-bold text-slate-800 text-[11px] truncate" title={`${item.city || ''} - ${item.region || ''}`}>
                            {!item.city?.startsWith('🎯') && !item.city?.startsWith('📍') && <span>📍</span>}
                            <span className="truncate">{item.city || 'Area Jabodetabek'}</span>
                          </div>
                          {item.region && (
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5" title={item.region}>
                              {item.region}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono">
                            <span className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-slate-700 shrink-0">{item.ip_address || '-'}</span>
                            <span className="truncate max-w-[120px]" title={item.isp}>{item.isp || 'Provider Jaringan'}</span>
                          </div>
                          {item.latitude && item.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-semibold mt-0.5 inline-block"
                            >
                              Buka Maps ↗
                            </a>
                          )}
                        </td>

                        {/* Perangkat & OS */}
                        <td className="px-4 py-3 max-w-[140px] whitespace-nowrap">
                          <span className="font-semibold text-slate-800 text-[11px] block truncate" title={item.device}>{item.device || 'PC / HP'}</span>
                          <span className="text-[10px] text-slate-400 font-mono block truncate">{item.browser || '-'} • {item.os || '-'}</span>
                        </td>

                        {/* Status Komunikasi */}
                        <td className="px-4 py-3 max-w-[230px]">
                          {hasReply ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-[11px] text-emerald-950 space-y-1">
                              <span className="font-black text-emerald-800 flex items-center gap-1 text-[10px]">
                                💬 Balasan Siswa:
                              </span>
                              <p className="italic font-bold break-words text-emerald-900 leading-tight">"{item.hacker_reply}"</p>
                              {hasSentMsg && (
                                <p className="text-[10px] text-slate-500 border-t border-emerald-100 pt-1 truncate" title={item.admin_message}>
                                  Pesan Anda: "{item.admin_message}"
                                </p>
                              )}
                            </div>
                          ) : hasSentMsg ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 text-[11px] text-blue-900">
                              <span className="font-bold flex items-center gap-1 text-blue-800 text-[10px]">
                                ✈️ Terkirim:
                              </span>
                              <p className="italic text-[10px] truncate" title={item.admin_message}>"{item.admin_message}"</p>
                              <span className="text-[9px] text-blue-500 font-medium">Menunggu respon...</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Belum Dihubungi
                            </span>
                          )}
                        </td>

                        {/* Tombol Aksi */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenSendMessage(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] transition shadow-xs active:scale-95"
                            >
                              <span>💬</span>
                              <span>{hasSentMsg ? 'Kirim Lagi' : 'Kirim Pesan'}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteSingleLog(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Hapus baris log ini"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOG AKTIVITAS UMUM */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 w-48">Waktu</th>
                  <th className="px-6 py-4 w-48">Aktor</th>
                  <th className="px-6 py-4">Tindakan</th>
                  <th className="px-6 py-4">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading && logs.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Memuat log aktivitas...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Belum ada aktivitas yang tercatat.</td></tr>
                ) : logs.map((log) => {
                  const formattedDetail = renderDetailText(log.detail)
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-3.5 text-slate-500 font-mono text-[11px]">{formatTime(log.created_at)}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{log.aktor}</td>
                      <td className="px-6 py-3.5 font-medium text-slate-700">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {log.aksi}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 truncate max-w-lg font-medium" title={formattedDetail}>
                        {formattedDetail}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL POP-UP: KIRIM PESAN KE HACKER / PENYUSUP */}
      {selectedTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Kirim Pesan ke Layar Penyusup</h3>
                <p className="text-xs text-red-100 mt-0.5">
                  Target: {selectedTarget.city || 'Jakarta'} ({selectedTarget.ip_address})
                </p>
              </div>
              <button 
                onClick={() => setSelectedTarget(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendMessageToHacker} className="p-6 space-y-4">
              
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 text-[11px] space-y-1 text-slate-600">
                <p><strong>Akun:</strong> {selectedTarget.email || '-'}</p>
                <p><strong>Perangkat:</strong> {selectedTarget.device || '-'}</p>
                <p><strong>Lokasi:</strong> {selectedTarget.city}, {selectedTarget.region} ({selectedTarget.isp})</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Teks Pesan (Akan langsung muncul di layar si penyusup):
                </label>
                <textarea
                  rows={4}
                  required
                  value={messagePrompt}
                  onChange={(e) => setMessagePrompt(e.target.value)}
                  placeholder="Ketik pesan peringatan atau pertanyaan Anda..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white resize-none"
                />
              </div>

              {/* Template Cepat */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Pilih Template Cepat:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMessagePrompt(`Halo, sistem mendeteksi Anda mencoba mengakses Admin dari ${selectedTarget.city}. Mohon segera temui Tim IT / Admin sekolah untuk klarifikasi sebelum akun ditindak.`)}
                    className="text-[10px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold"
                  >
                    Format Resmi Teguran
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessagePrompt(`Kami tahu Anda sedang mengakses sistem dari ${selectedTarget.device} dengan IP ${selectedTarget.ip_address}. Jelaskan mengapa Anda mencoba login admin?`)}
                    className="text-[10px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold"
                  >
                    Format Interogasi
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={sendingMsg || !messagePrompt.trim()}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
                >
                  {sendingMsg ? 'Mengirim...' : 'Kirim Pesan Sekarang 🚀'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Lightbox Foto Wajah Penyusup */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-4 animate-scale-up border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span>📸</span>
                <span>Foto Wajah Penyusup / Petugas</span>
              </h4>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-xs font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border-2 border-indigo-100 shadow-inner bg-slate-950">
              <img
                src={selectedPhoto}
                alt="Wajah Pelaku"
                className="w-full h-auto max-h-[60vh] object-contain mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Foto ini diambil secara otomatis dari kamera depan saat perangkat membuka atau mencoba masuk ke konsol Administrator.
            </p>

            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition active:scale-95"
            >
              Tutup Foto
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
