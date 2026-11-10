import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'aplikasibudimulia@gmail.com').toLowerCase()

/**
 * Klasifikasi otomatis tingkat ancaman dari setiap baris log akses
 */
function classifyAccessLog(item) {
  const rawEmail = String(item?.email || '').trim()
  const lower = rawEmail.toLowerCase()
  const hasStudentTrace = Boolean(
    item?.device_identity &&
    (item.device_identity.includes('Siswa') || item.device_identity.includes('Wali') || item.device_identity.includes('NISN'))
  )

  if (item?.status === 'blocked') {
    return {
      level: 'critical',
      badge: '🔒 LAYAR DIKUNCI',
      badgeClass: 'bg-red-700 text-white border-red-800',
      rowClass: 'bg-red-50/60 hover:bg-red-50',
      description: 'Perangkat penyusup sedang dibekukan oleh Administrator'
    }
  }

  if (
    lower.includes('serangan') ||
    lower.includes('injeksi') ||
    lower.includes('manipulasi sesi') ||
    lower.includes('akses ilegal') ||
    lower.includes('gagal login admin') ||
    lower.includes('akses admin ditolak')
  ) {
    return {
      level: 'critical',
      badge: '🚨 PERCOBAAN BOBOL',
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      rowClass: 'bg-red-50/35 hover:bg-red-50/70',
      description: 'Percobaan peretasan atau gagal autentikasi konsol Admin'
    }
  }

  if (
    lower.includes('gagal login') ||
    lower.startsWith('portal login:') ||
    (hasStudentTrace && !lower.includes('login admin resmi'))
  ) {
    return {
      level: 'warning',
      badge: hasStudentTrace ? '⚠️ PERANGKAT SISWA' : '⚠️ MENCURIGAKAN',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      rowClass: 'bg-amber-50/30 hover:bg-amber-50/60',
      description: hasStudentTrace
        ? 'Perangkat dengan sesi Siswa/Wali mencoba mengakses area Admin'
        : 'Aktivitas percobaan login mencurigakan pada portal'
    }
  }

  if (
    lower.includes('login admin resmi') ||
    lower === ADMIN_EMAIL
  ) {
    return {
      level: 'safe',
      badge: '✅ ADMIN RESMI',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      rowClass: 'hover:bg-slate-50',
      description: 'Akses sah oleh Administrator utama'
    }
  }

  return {
    level: 'info',
    badge: '👁️ PANTAUAN',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    rowClass: 'hover:bg-slate-50',
    description: 'Membuka halaman login Administrator'
  }
}

export default function AdminActivityLogSection() {
  const [activeTab, setActiveTab] = useState('honeypot') // 'honeypot' | 'general'
  const [logs, setLogs] = useState([])
  const [accessLogs, setAccessLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [siswaMap, setSiswaMap] = useState({})

  // Filter & Pencarian Tab Honeypot
  const [threatFilter, setThreatFilter] = useState('all') // 'all' | 'threats' | 'student_device' | 'with_photo' | 'with_reply' | 'locked' | 'safe'
  const [searchQuery, setSearchQuery] = useState('')
  const [hideDuplicates, setHideDuplicates] = useState(true)

  // Filter & Pencarian Tab Log Umum
  const [generalCategory, setGeneralCategory] = useState('all') // 'all' | 'security' | 'siswa' | 'ortu' | 'guru' | 'cbt'
  const [generalSearch, setGeneralSearch] = useState('')

  // Modal Komunikasi & Detail Forensik
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [forensicTarget, setForensicTarget] = useState(null)
  const [messagePrompt, setMessagePrompt] = useState('')
  const [lockOnSend, setLockOnSend] = useState(false)
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

    const intervalId = setInterval(() => {
      fetchAccessLogs()
    }, 4000)

    const channel = supabase.channel('realtime-admin-access-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_access_logs' }, () => {
        fetchAccessLogs()
      })
      .subscribe()

    // Listener Realtime Broadcast untuk balasan instan & tangkapan kamera jarak jauh
    const bcChannel = supabase.channel('ebm-security-command')
      .on('broadcast', { event: 'hacker_replied' }, ({ payload }) => {
        if (payload?.sessionId && payload?.reply) {
          setAccessLogs(prev => prev.map(item =>
            item.session_id === payload.sessionId
              ? { ...item, hacker_reply: payload.reply, replied_at: payload.time || new Date().toISOString() }
              : item
          ))
          setAlertNotification({
            type: 'success',
            text: `💬 Balasan baru diterima dari sesi ${payload.sessionId.substring(0, 10)}: "${payload.reply}"`
          })
          fetchAccessLogs()
        }
      })
      .on('broadcast', { event: 'photo_captured' }, ({ payload }) => {
        if (payload?.photo_url) {
          setAccessLogs(prev => prev.map(item =>
            (item.id === payload.logId || item.session_id === payload.sessionId)
              ? { ...item, photo_url: payload.photo_url }
              : item
          ))
          setAlertNotification({
            type: 'success',
            text: '📸 Foto wajah pelaku berhasil ditangkap dari kamera depan!'
          })
          fetchAccessLogs()
        }
      })
      .subscribe()

    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
      supabase.removeChannel(bcChannel)
    }
  }, [])

  const fetchAccessLogs = async () => {
    try {
      const [
        { data, error },
        { data: interceptRows }
      ] = await Promise.all([
        supabase
          .from('admin_access_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('activity_log')
          .select('id, aktor, aksi, detail, created_at')
          .in('aktor', ['SECURITY_INTERCEPT', 'PENYUSUP_KLARIFIKASI'])
          .order('created_at', { ascending: false })
          .limit(150)
      ])

      if (data) {
        // Gabungkan status kunci layar & pesan intervensi dari jembatan activity_log (terbaru menang)
        const latestBySession = {}
        const latestById = {}
        const replyBySession = {}

        if (Array.isArray(interceptRows)) {
          for (const row of interceptRows) {
            if (row.aktor === 'SECURITY_INTERCEPT' && row.detail) {
              try {
                const parsed = JSON.parse(row.detail)
                const sKey = parsed.session_id || parsed.sessionId
                const idKey = parsed.id || parsed.logId
                if (sKey && !latestBySession[sKey]) latestBySession[sKey] = parsed
                if (idKey && !latestById[idKey]) latestById[idKey] = parsed
              } catch {}
            } else if (row.aktor === 'PENYUSUP_KLARIFIKASI' && row.aksi?.startsWith('BALASAN:')) {
              const sKey = row.aksi.replace('BALASAN:', '').trim()
              if (sKey && !replyBySession[sKey]) {
                const matchQuote = row.detail?.match(/membalas intervensi Admin:\s*"([\s\S]*)"$/)
                replyBySession[sKey] = matchQuote ? matchQuote[1] : row.detail
              }
            }
          }
        }

        const merged = data.map(item => {
          const ov = latestById[item.id] || (item.session_id ? latestBySession[item.session_id] : null)
          const rep = item.session_id ? replyBySession[item.session_id] : null
          let nextStatus = item.status
          let nextMsg = item.admin_message
          if (ov) {
            if (ov.action === 'unlock_screen' || ov.status === 'unlocked') {
              nextStatus = 'active'
            } else if (ov.action === 'lock_screen' || ov.status === 'blocked') {
              nextStatus = 'blocked'
              if (ov.admin_message) nextMsg = ov.admin_message
            } else if (ov.admin_message) {
              if (nextStatus !== 'blocked') nextStatus = 'investigating'
              nextMsg = ov.admin_message
            }
          }
          return {
            ...item,
            status: nextStatus,
            admin_message: nextMsg,
            hacker_reply: item.hacker_reply || rep || null
          }
        })

        setAccessLogs(merged)
      } else if (error) {
        console.warn('Access logs table error:', error.message)
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
          .neq('aktor', 'SECURITY_INTERCEPT')
          .order('created_at', { ascending: false })
          .limit(300),
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
      day: '2-digit', month: 'short', year: 'numeric',
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

  /**
   * Mengirim intervensi (pesan / kunci layar / buka kunci / paksa kamera) melalui 3 jalur sekaligus:
   * 1. RPC fn_send_admin_intervention / update tabel admin_access_logs
   * 2. Jembatan activity_log (SECURITY_INTERCEPT) agar 100% terbaca oleh user anon meskipun refresh halaman
   * 3. Supabase Realtime Broadcast (ebm-security-command) agar muncul < 100ms di layar pelaku
   */
  const dispatchInterventionCommand = async (target, { message, action = 'message', status = 'investigating' }) => {
    if (!target) return false
    const cleanMsg = message || target.admin_message || 'Peringatan Keamanan: Aktivitas mencurigakan terdeteksi dari perangkat Anda.'

    // 1. Update database admin_access_logs
    try {
      await supabase.rpc('fn_send_admin_intervention', {
        p_log_id: target.id,
        p_message: cleanMsg
      })
      if (status === 'blocked' || action === 'unlock_screen') {
        const nextStatus = action === 'unlock_screen' ? 'active' : 'blocked'
        await supabase
          .from('admin_access_logs')
          .update({ status: nextStatus, admin_message: action === 'unlock_screen' ? null : cleanMsg })
          .eq('session_id', target.session_id)
      }
    } catch {}

    const payloadObj = {
      id: target.id,
      logId: target.id,
      session_id: target.session_id,
      sessionId: target.session_id,
      admin_message: action === 'unlock_screen' ? null : cleanMsg,
      action,
      status: action === 'unlock_screen' ? 'unlocked' : status,
      city: target.city,
      region: target.region,
      isp: target.isp,
      ip_address: target.ip_address,
      device: target.device,
      timestamp: new Date().toISOString()
    }

    // 2. Simpan ke jembatan activity_log agar bertahan saat di-refresh oleh pelaku anon maupun saat tabel di-refresh Admin
    const targetKey = target.session_id || target.id
    if (targetKey) {
      await supabase.from('activity_log').insert({
        aktor: 'SECURITY_INTERCEPT',
        aksi: `INTERVENSI:${targetKey}`,
        detail: JSON.stringify(payloadObj)
      }).catch(() => {})
    }

    // 3. Kirim Realtime Broadcast instan
    try {
      const ch = supabase.channel('ebm-security-command')
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event: 'admin_intervention',
            payload: payloadObj
          })
        }
      })
    } catch {}

    return true
  }

  const handleOpenSendMessage = (target, defaultLock = false) => {
    setSelectedTarget(target)
    setLockOnSend(defaultLock || target.status === 'blocked')
    const studentHint = target.device_identity ? ` (${target.device_identity})` : ''
    setMessagePrompt(
      target.admin_message ||
      `PERINGATAN KEAMANAN: Aktivitas Anda${studentHint} terpantau dari ${target.city || 'lokasi Anda'} menggunakan IP ${target.ip_address || ''}. Segera hentikan percobaan akses ini dan tulis klarifikasi Anda di bawah sebelum perangkat dikunci permanen.`
    )
  }

  const handleSendMessageToHacker = async (e) => {
    e.preventDefault()
    if (!selectedTarget || !messagePrompt.trim()) return

    setSendingMsg(true)
    try {
      const actionType = lockOnSend ? 'lock_screen' : 'message'
      const statusType = lockOnSend ? 'blocked' : 'investigating'

      const cleanMsg = messagePrompt.trim()
      await dispatchInterventionCommand(selectedTarget, {
        message: cleanMsg,
        action: actionType,
        status: statusType
      })

      // Update state tabel secara instan
      setAccessLogs(prev => prev.map(item =>
        (item.id === selectedTarget.id || (selectedTarget.session_id && item.session_id === selectedTarget.session_id))
          ? { ...item, status: statusType, admin_message: cleanMsg }
          : item
      ))

      setAlertNotification({
        type: 'success',
        text: lockOnSend
          ? '🔒 Layar perangkat pelaku berhasil DIKUNCI & pesan peringatan telah ditampilkan di layarnya!'
          : '🚀 Pesan peringatan berhasil dikirim langsung ke layar pelaku!'
      })
      setSelectedTarget(null)
      fetchAccessLogs()
    } catch (err) {
      setAlertNotification({ type: 'error', text: err.message || 'Terjadi kesalahan sistem.' })
    } finally {
      setSendingMsg(false)
      setTimeout(() => setAlertNotification(null), 5000)
    }
  }

  const handleToggleLockDevice = async (target) => {
    const isCurrentlyLocked = target.status === 'blocked'
    if (isCurrentlyLocked) {
      await dispatchInterventionCommand(target, {
        message: '',
        action: 'unlock_screen',
        status: 'active'
      })
      setAccessLogs(prev => prev.map(item =>
        item.session_id === target.session_id ? { ...item, status: 'active' } : item
      ))
      setAlertNotification({ type: 'success', text: `🔓 Kunci layar untuk sesi ${target.session_id?.substring(0, 10)} berhasil dibuka.` })
    } else {
      const lockMsg = target.admin_message || `PERANGKAT DIKUNCI: Sistem Keamanan SMP Budi Mulia mendeteksi aktivitas mencurigakan dari ${target.city || 'lokasi Anda'} (${target.ip_address || ''}). Silakan isi klarifikasi untuk membuka kunci.`
      await dispatchInterventionCommand(target, {
        message: lockMsg,
        action: 'lock_screen',
        status: 'blocked'
      })
      setAccessLogs(prev => prev.map(item =>
        item.session_id === target.session_id ? { ...item, status: 'blocked', admin_message: lockMsg } : item
      ))
      setAlertNotification({ type: 'success', text: `🔒 Perangkat penyusup (${target.session_id?.substring(0, 10)}) berhasil DIKUNCI secara real-time!` })
    }
    setTimeout(() => setAlertNotification(null), 5000)
  }

  const handleTriggerRemoteCamera = async (target) => {
    await dispatchInterventionCommand(target, {
      message: target.admin_message || '',
      action: 'force_camera',
      status: target.status || 'investigating'
    })
    setAlertNotification({
      type: 'success',
      text: `📸 Perintah pindai wajah jarak jauh dikirim ke perangkat (${target.device || 'Pelaku'})!`
    })
    setTimeout(() => setAlertNotification(null), 5000)
  }

  const handleCleanAdminAndDuplicateLogs = async () => {
    if (!window.confirm('Bersihkan log kunjungan Admin sendiri & baris duplikat agar daftar hanya menampilkan aktivitas penting/penyusup?')) return
    try {
      const idsToDelete = []
      const seenSessionKeys = new Set()

      for (const item of accessLogs) {
        const cls = classifyAccessLog(item)
        const timeMinute = item.created_at ? item.created_at.substring(0, 16) : ''
        const dedupKey = `${item.session_id}::${item.email}::${timeMinute}`

        if (seenSessionKeys.has(dedupKey)) {
          idsToDelete.push(item.id)
          continue
        }
        seenSessionKeys.add(dedupKey)

        // Hapus baris "Mengunjungi Halaman Login Admin" atau login admin resmi milik sendiri yang tidak memiliki balasan/intervensi
        if ((cls.level === 'safe' || item.email === 'Mengunjungi Halaman Login Admin' || item.email === '👁️ Mengunjungi Halaman Login Admin') && !item.hacker_reply && !item.admin_message && !item.device_identity) {
          idsToDelete.push(item.id)
        }
      }

      if (idsToDelete.length === 0) {
        setAlertNotification({ type: 'success', text: 'Log sudah bersih! Tidak ditemukan duplikat atau log admin berlebih.' })
        return
      }

      const { error } = await supabase
        .from('admin_access_logs')
        .delete()
        .in('id', idsToDelete)

      if (!error) {
        setAccessLogs(prev => prev.filter(item => !idsToDelete.includes(item.id)))
        setAlertNotification({ type: 'success', text: `🧹 Berhasil membersihkan ${idsToDelete.length} log duplikat / kunjungan Admin sendiri!` })
      } else {
        setAlertNotification({ type: 'error', text: 'Gagal membersihkan sebagian log: ' + error.message })
      }
    } catch (err) {
      setAlertNotification({ type: 'error', text: err.message })
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

  const handlePreviewIntruderScreen = (target, customMsg = null, customLocked = null) => {
    if (!target) return
    const msg = customMsg || target.admin_message || messagePrompt || `PERINGATAN KEAMANAN: Aktivitas mencurigakan dari ${target.city || 'Jakarta'} (${target.ip_address || '-'}) telah direkam server.`
    const locked = customLocked !== null ? customLocked : (target.status === 'blocked' || lockOnSend)
    window.dispatchEvent(
      new CustomEvent('ebm-preview-intervention', {
        detail: {
          id: target.id,
          session_id: target.session_id,
          admin_message: msg,
          city: target.city,
          region: target.region,
          isp: target.isp,
          ip_address: target.ip_address,
          device: target.device,
          status: locked ? 'blocked' : 'investigating',
          hacker_reply: target.hacker_reply || null
        }
      })
    )
  }

  // Deduplikasi cerdas & pemfilteran daftar Honeypot
  const processedAccessLogs = useMemo(() => {
    let list = [...accessLogs]

    // 1. Jika hideDuplicates aktif, gabungkan baris identik yang tercatat di menit yang sama pada sesi yang sama
    if (hideDuplicates) {
      const seen = new Set()
      list = list.filter(item => {
        const minuteStamp = item.created_at ? item.created_at.substring(0, 16) : ''
        const key = `${item.session_id || ''}::${item.email || ''}::${minuteStamp}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    // 2. Filter berdasarkan tingkat ancaman / kategori
    if (threatFilter !== 'all') {
      list = list.filter(item => {
        const cls = classifyAccessLog(item)
        if (threatFilter === 'threats') return cls.level === 'critical' || cls.level === 'warning'
        if (threatFilter === 'student_device') return Boolean(item.device_identity)
        if (threatFilter === 'with_photo') return Boolean(item.photo_url)
        if (threatFilter === 'with_reply') return Boolean(item.hacker_reply || item.admin_message)
        if (threatFilter === 'locked') return item.status === 'blocked'
        if (threatFilter === 'safe') return cls.level === 'safe'
        return true
      })
    }

    // 3. Filter pencarian teks bebas
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(item =>
        (item.email || '').toLowerCase().includes(q) ||
        (item.device_identity || '').toLowerCase().includes(q) ||
        (item.city || '').toLowerCase().includes(q) ||
        (item.region || '').toLowerCase().includes(q) ||
        (item.ip_address || '').toLowerCase().includes(q) ||
        (item.isp || '').toLowerCase().includes(q) ||
        (item.device || '').toLowerCase().includes(q) ||
        (item.os || '').toLowerCase().includes(q) ||
        (item.hacker_reply || '').toLowerCase().includes(q) ||
        (item.session_id || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [accessLogs, hideDuplicates, threatFilter, searchQuery])

  // Statistik KPI Keamanan
  const securityStats = useMemo(() => {
    let threats = 0
    let studentDevices = 0
    let photos = 0
    let replies = 0
    let locked = 0

    accessLogs.forEach(item => {
      const cls = classifyAccessLog(item)
      if (cls.level === 'critical' || cls.level === 'warning') threats++
      if (item.device_identity) studentDevices++
      if (item.photo_url) photos++
      if (item.hacker_reply) replies++
      if (item.status === 'blocked') locked++
    })

    return { threats, studentDevices, photos, replies, locked }
  }, [accessLogs])

  // Filter Log Aktivitas Umum (Tab 2)
  const filteredGeneralLogs = useMemo(() => {
    return logs.filter(log => {
      const aktor = (log.aktor || '').toLowerCase()
      const aksi = (log.aksi || '').toLowerCase()
      const detail = renderDetailText(log.detail || '').toLowerCase()

      if (generalCategory === 'security') {
        const isSec = aktor.includes('suspect') || aktor.includes('penyusup') || aksi.includes('🚨') || aksi.includes('manipulasi') || aksi.includes('diblokir') || aksi.includes('pelanggaran') || aksi.includes('balasan:')
        if (!isSec) return false
      } else if (generalCategory === 'siswa') {
        if (!aktor.includes('siswa')) return false
      } else if (generalCategory === 'ortu') {
        if (!aktor.includes('orang tua') && !aktor.includes('wali')) return false
      } else if (generalCategory === 'guru') {
        if (!aktor.includes('guru') && !aktor.includes('admin') && !aktor.includes('wali kelas') && !aktor.includes('piket')) return false
      } else if (generalCategory === 'cbt') {
        if (!aksi.includes('cbt') && !aksi.includes('ujian') && !detail.includes('ujian')) return false
      }

      if (generalSearch.trim()) {
        const q = generalSearch.toLowerCase().trim()
        return aktor.includes(q) || aksi.includes(q) || detail.includes(q)
      }

      return true
    })
  }, [logs, generalCategory, generalSearch, siswaMap])

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
              Verifikasi Otorisasi Pusat Keamanan
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Menu ini memuat rekaman forensik IP, GPS presisi, sadapan identitas perangkat, kamera biometrik, dan kendali kunci layar jarak jauh. Masukkan kode otorisasi Administrator.
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
              <span>Buka Pusat Keamanan &amp; Forensik</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            SMP Budi Mulia Jakarta • Administrator Security Operations Center
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-slide-up space-y-5 font-sans">
      
      {/* Header Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pusat Keamanan &amp; Forensik Penyusup</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
              🛡️ Live SOC Monitoring
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Deteksi otomatis percobaan bobol akun, pelacakan GPS &amp; IP presisi, sadapan akun HP pelaku, interogasi 2 arah, dan kunci layar jarak jauh.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => { fetchLogsAndSiswa(); fetchAccessLogs() }} 
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition active:scale-95"
            title="Segarkan Data"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Segarkan Log
          </button>
          <button
            onClick={handleLockMenu}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition active:scale-95"
            title="Kunci kembali menu ini dengan kode keamanan"
          >
            <span>🔒</span>
            <span>Kunci Menu</span>
          </button>
        </div>
      </div>

      {/* Notifikasi Toast */}
      {alertNotification && (
        <div className={`p-4 rounded-2xl text-xs font-bold border animate-fade-in flex items-center justify-between gap-3 ${
          alertNotification.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : 'bg-red-50 text-red-900 border-red-200'
        }`}>
          <span>{alertNotification.text}</span>
          <button onClick={() => setAlertNotification(null)} className="text-slate-400 hover:text-slate-600 shrink-0">✕</button>
        </div>
      )}

      {/* 5 Kartu Ringkasan KPI Keamanan */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => { setActiveTab('honeypot'); setThreatFilter(threatFilter === 'threats' ? 'all' : 'threats') }}
          className={`text-left p-3.5 rounded-2xl border transition ${
            threatFilter === 'threats' ? 'bg-red-600 text-white border-red-700 shadow-md' : 'bg-white hover:bg-red-50/40 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${threatFilter === 'threats' ? 'text-red-100' : 'text-slate-400'}`}>
              Ancaman / Gagal Login
            </span>
            <span className="text-base">🚨</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${threatFilter === 'threats' ? 'text-white' : 'text-red-600'}`}>
            {securityStats.threats}
          </p>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('honeypot'); setThreatFilter(threatFilter === 'student_device' ? 'all' : 'student_device') }}
          className={`text-left p-3.5 rounded-2xl border transition ${
            threatFilter === 'student_device' ? 'bg-amber-600 text-white border-amber-700 shadow-md' : 'bg-white hover:bg-amber-50/40 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${threatFilter === 'student_device' ? 'text-amber-100' : 'text-slate-400'}`}>
              Akun Siswa Tersadap
            </span>
            <span className="text-base">🎓</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${threatFilter === 'student_device' ? 'text-white' : 'text-amber-600'}`}>
            {securityStats.studentDevices}
          </p>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('honeypot'); setThreatFilter(threatFilter === 'with_photo' ? 'all' : 'with_photo') }}
          className={`text-left p-3.5 rounded-2xl border transition ${
            threatFilter === 'with_photo' ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-white hover:bg-indigo-50/40 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${threatFilter === 'with_photo' ? 'text-indigo-100' : 'text-slate-400'}`}>
              Foto Wajah Pelaku
            </span>
            <span className="text-base">📸</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${threatFilter === 'with_photo' ? 'text-white' : 'text-indigo-600'}`}>
            {securityStats.photos}
          </p>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('honeypot'); setThreatFilter(threatFilter === 'with_reply' ? 'all' : 'with_reply') }}
          className={`text-left p-3.5 rounded-2xl border transition ${
            threatFilter === 'with_reply' ? 'bg-emerald-600 text-white border-emerald-700 shadow-md' : 'bg-white hover:bg-emerald-50/40 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${threatFilter === 'with_reply' ? 'text-emerald-100' : 'text-slate-400'}`}>
              Balasan Klarifikasi
            </span>
            <span className="text-base">💬</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${threatFilter === 'with_reply' ? 'text-white' : 'text-emerald-600'}`}>
            {securityStats.replies}
          </p>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('honeypot'); setThreatFilter(threatFilter === 'locked' ? 'all' : 'locked') }}
          className={`text-left p-3.5 rounded-2xl border transition col-span-2 sm:col-span-1 ${
            threatFilter === 'locked' ? 'bg-slate-900 text-white border-slate-950 shadow-md' : 'bg-white hover:bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${threatFilter === 'locked' ? 'text-slate-300' : 'text-slate-400'}`}>
              Perangkat Dikunci
            </span>
            <span className="text-base">🔒</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${threatFilter === 'locked' ? 'text-white' : 'text-slate-800'}`}>
            {securityStats.locked}
          </p>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('honeypot')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition ${
            activeTab === 'honeypot'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🎯</span>
          <span>Pelacak Forensik &amp; Intervensi Penyusup ({processedAccessLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition ${
            activeTab === 'general'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>📋</span>
          <span>Log Aktivitas Umum &amp; Audit Sistem ({filteredGeneralLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: PELACAK LOKASI & HONEYPOT INTERAKTIF */}
      {activeTab === 'honeypot' && (
        <div className="space-y-4">
          
          {/* Toolbar Pencarian, Filter Ancaman, & Pembersih Duplikat */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Kotak Pencarian */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama siswa, NISN, email, alamat jalan, kota, IP, ISP, atau tipe HP..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Tombol Aksi Pembersihan */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideDuplicates}
                    onChange={(e) => setHideDuplicates(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span>Sembunyikan Duplikat</span>
                </label>

                <button
                  onClick={handleCleanAdminAndDuplicateLogs}
                  disabled={accessLogs.length === 0}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 disabled:opacity-50 px-3 py-1.5 rounded-xl transition active:scale-95"
                  title="Hapus otomatis baris duplikat dan riwayat login Admin sendiri agar fokus pada penyusup"
                >
                  <span>🧹</span>
                  <span>Bersihkan Log Admin &amp; Duplikat</span>
                </button>

                <button
                  onClick={handleClearAllLogs}
                  disabled={accessLogs.length === 0}
                  className="inline-flex items-center gap-1 text-[11px] font-bold bg-white hover:bg-rose-50 border border-red-200 text-red-700 disabled:opacity-50 px-3 py-1.5 rounded-xl transition active:scale-95"
                  title="Hapus seluruh riwayat log akses"
                >
                  <span>🗑️</span>
                  <span>Reset Semua</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {[
                { id: 'all', label: 'Semua Log' },
                { id: 'threats', label: '🚨 Hanya Ancaman & Mencurigakan' },
                { id: 'student_device', label: '🎓 Terdeteksi Akun Siswa' },
                { id: 'with_photo', label: '📸 Ada Foto Wajah' },
                { id: 'with_reply', label: '💬 Ada Komunikasi' },
                { id: 'locked', label: '🔒 Perangkat Dikunci' },
                { id: 'safe', label: '✅ Login Admin Resmi' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setThreatFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                    threatFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                    <th className="px-4 py-3.5 whitespace-nowrap">Waktu &amp; Status</th>
                    <th className="px-4 py-3.5 min-w-[230px]">Identitas &amp; Jejak Akun HP</th>
                    <th className="px-4 py-3.5 min-w-[240px]">Lokasi Jalan, IP &amp; Jaringan</th>
                    <th className="px-4 py-3.5 min-w-[150px]">Perangkat</th>
                    <th className="px-4 py-3.5 min-w-[200px]">Status Intervensi</th>
                    <th className="px-4 py-3.5 text-center whitespace-nowrap">Kendali &amp; Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {processedAccessLogs.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                        Tidak ada log akses yang sesuai dengan filter saat ini.
                      </td>
                    </tr>
                  ) : processedAccessLogs.map((item) => {
                    const hasReply = Boolean(item.hacker_reply)
                    const hasSentMsg = Boolean(item.admin_message)
                    const isLocked = item.status === 'blocked'
                    const cls = classifyAccessLog(item)

                    return (
                      <tr key={item.id} className={`transition ${cls.rowClass}`}>
                        
                        {/* Waktu & Tingkat Ancaman */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-mono text-[11px] font-semibold text-slate-700">
                            {formatTime(item.created_at)}
                          </div>
                          <span className={`mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md text-[9.5px] font-black border ${cls.badgeClass}`}>
                            {cls.badge}
                          </span>
                        </td>

                        {/* Akun & Identitas Tersadap (Tampil Utuh Tidak Terpotong) */}
                        <td className="px-4 py-3.5 max-w-[300px]">
                          <div className="flex items-start gap-2.5">
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
                                  className="w-11 h-11 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm group-hover:scale-105 transition"
                                />
                                <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-[8px] text-white rounded-full px-1 font-bold">
                                  📸
                                </span>
                              </button>
                            ) : (
                              <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm text-slate-400 shrink-0">
                                {cls.level === 'critical' ? '🕵️' : cls.level === 'safe' ? '🛡️' : '👤'}
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-1">
                              {/* Identitas Siswa Tersadap dari HP (tampil utuh break-words) */}
                              {item.device_identity && (
                                <div className="text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg break-words leading-snug">
                                  {item.device_identity}
                                </div>
                              )}

                              <div className="font-bold text-slate-900 text-[11.5px] break-words leading-snug">
                                {item.email || 'Tanpa Identitas Email'}
                              </div>

                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                                <span>Sesi: {item.session_id ? item.session_id.substring(0, 14) : '-'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Lokasi Rinci & ISP (Tampil Utuh Tidak Terpotong) */}
                        <td className="px-4 py-3.5 max-w-[290px] space-y-1">
                          <div className="font-bold text-slate-800 text-[11.5px] break-words leading-snug">
                            {!item.city?.startsWith('🎯') && !item.city?.startsWith('📍') && <span className="mr-1">📍</span>}
                            {item.city || 'Area Jabodetabek'}
                          </div>
                          {item.region && (
                            <div className="text-[10px] text-slate-500 break-words leading-snug">
                              {item.region}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-600 font-mono flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-800 break-all">
                              {item.ip_address || '-'}
                            </span>
                            <span className="text-slate-500 font-sans font-semibold break-words">
                              {item.isp || 'Provider Jaringan'}
                            </span>
                          </div>
                          {item.latitude && item.longitude && (
                            <div className="pt-0.5 flex items-center gap-2">
                              <a
                                href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 underline font-bold inline-flex items-center gap-1"
                              >
                                <span>🗺️ Buka Google Maps</span>
                                <span>↗</span>
                              </a>
                            </div>
                          )}
                        </td>

                        {/* Perangkat & OS */}
                        <td className="px-4 py-3.5 max-w-[180px]">
                          <span className="font-bold text-slate-800 text-[11px] block break-words leading-snug">
                            {item.device || 'PC / Smartphone'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5 break-words">
                            {item.browser || '-'} • {item.os || '-'}
                          </span>
                        </td>

                        {/* Status Komunikasi */}
                        <td className="px-4 py-3.5 max-w-[240px]">
                          {isLocked && (
                            <div className="mb-1.5 bg-red-600 text-white rounded-xl px-2.5 py-1.5 text-[10px] font-black flex items-center justify-between gap-1.5 shadow-2xs">
                              <span className="flex items-center gap-1">
                                <span>🔒</span>
                                <span>LAYAR DIKUNCI</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handlePreviewIntruderScreen(item, item.admin_message, true)}
                                className="px-1.5 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[9px] font-bold transition"
                                title="Lihat simulasi tampilan layar terkunci di perangkat pelaku"
                              >
                                👁️ Lihat
                              </button>
                            </div>
                          )}
                          {hasReply ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-950 space-y-1">
                              <span className="font-black text-emerald-800 flex items-center gap-1 text-[10px]">
                                💬 Balasan Pelaku:
                              </span>
                              <p className="italic font-bold break-words text-emerald-900 leading-snug">
                                "{item.hacker_reply}"
                              </p>
                              {hasSentMsg && (
                                <p className="text-[10px] text-slate-500 border-t border-emerald-100 pt-1 break-words">
                                  Pesan Admin: "{item.admin_message}"
                                </p>
                              )}
                            </div>
                          ) : hasSentMsg ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-900 space-y-1">
                              <span className="font-bold flex items-center gap-1 text-blue-800 text-[10px]">
                                ✈️ Intervensi Terkirim:
                              </span>
                              <p className="italic text-[10.5px] break-words leading-snug">"{item.admin_message}"</p>
                              <span className="text-[9.5px] text-blue-600 font-semibold block">Menunggu klarifikasi pelaku...</span>
                            </div>
                          ) : !isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              Belum Diintervensi
                            </span>
                          ) : null}
                        </td>

                        {/* Tombol Aksi Lengkap */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <div className="flex flex-col gap-1.5 items-stretch min-w-[125px]">
                            <button
                              type="button"
                              onClick={() => setForensicTarget(item)}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-[10.5px] transition shadow-2xs active:scale-95"
                            >
                              <span>🔍</span>
                              <span>Detail Forensik</span>
                            </button>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenSendMessage(item, false)}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[10px] transition shadow-2xs active:scale-95"
                                title="Kirim pesan peringatan ke layar perangkat ini"
                              >
                                <span>💬</span>
                                <span>{hasSentMsg ? 'Pesan' : 'Tegur'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleLockDevice(item)}
                                className={`px-2 py-1.5 rounded-xl font-bold text-[10px] transition shadow-2xs active:scale-95 ${
                                  isLocked
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                                }`}
                                title={isLocked ? 'Buka kunci layar perangkat ini' : 'Kunci / bekukan layar perangkat ini dari jarak jauh'}
                              >
                                {isLocked ? '🔓 Buka' : '🔒 Kunci'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteSingleLog(item.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Hapus baris log ini"
                              >
                                🗑️
                              </button>
                            </div>
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

      {/* TAB 2: LOG AKTIVITAS UMUM & AUDIT SISTEM */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="relative">
              <input
                type="text"
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                placeholder="Cari nama siswa, NISN, nama guru, atau detail aktivitas..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              {generalSearch && (
                <button
                  onClick={() => setGeneralSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Semua Aktivitas' },
                { id: 'security', label: '🚨 Peringatan Keamanan & Manipulasi' },
                { id: 'siswa', label: '🎓 Aktivitas Siswa' },
                { id: 'ortu', label: '👨‍👩‍👧 Aktivitas Orang Tua' },
                { id: 'guru', label: '💼 Aktivitas Guru & Admin' },
                { id: 'cbt', label: '📝 Ujian CBT' }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setGeneralCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                    generalCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                    <th className="px-5 py-3.5 whitespace-nowrap">Waktu</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Aktor</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Tindakan</th>
                    <th className="px-5 py-3.5 min-w-[280px]">Detail Lengkap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs align-top">
                  {loading && filteredGeneralLogs.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Memuat log aktivitas...</td></tr>
                  ) : filteredGeneralLogs.length === 0 ? (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500">Tidak ada log aktivitas yang cocok.</td></tr>
                  ) : filteredGeneralLogs.map((log) => {
                    const formattedDetail = renderDetailText(log.detail)
                    const isSecAlert =
                      (log.aktor || '').includes('SUSPECT') ||
                      (log.aktor || '').includes('PENYUSUP') ||
                      (log.aksi || '').includes('🚨') ||
                      (log.aksi || '').toLowerCase().includes('diblokir')

                    return (
                      <tr key={log.id} className={`transition ${isSecAlert ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">{formatTime(log.created_at)}</td>
                        <td className="px-5 py-3.5 font-bold text-slate-800 whitespace-nowrap">
                          <span className={isSecAlert ? 'text-red-700 font-black' : ''}>{log.aktor}</span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-700 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                            isSecAlert
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {log.aksi}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700 font-medium break-words leading-relaxed">
                          {formattedDetail}
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

      {/* MODAL DOSSIER FORENSIK LENGKAP + PETA LOKASI (Full-Screen Blur via Portal) */}
      {forensicTarget && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in font-sans"
          onClick={() => setForensicTarget(null)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.45)] max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Forensik Elegan */}
            <div className="bg-slate-900 text-white px-6 py-4.5 flex items-center justify-between sticky top-0 z-10 border-b border-slate-800">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xl shrink-0">
                  🕵️‍♂️
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black tracking-wide text-white truncate">
                      Laporan Forensik Perangkat &amp; Lokasi
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                      LIVE DOSSIER
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                    {formatTime(forensicTarget.created_at)} • Sesi: {forensicTarget.session_id || '-'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setForensicTarget(null)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold shrink-0 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Baris Atas: Foto Wajah & Identitas Tersadap */}
              <div className="flex flex-col sm:flex-row gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90">
                <div className="flex flex-col items-center justify-center shrink-0 gap-2">
                  {forensicTarget.photo_url ? (
                    <img
                      src={forensicTarget.photo_url}
                      alt="Wajah Pelaku"
                      onClick={() => setSelectedPhoto(forensicTarget.photo_url)}
                      className="w-28 h-28 rounded-2xl object-cover border-2 border-emerald-500 shadow-md cursor-pointer hover:scale-105 transition"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-2xl bg-slate-200/70 border border-slate-300 flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                      <span className="text-2xl mb-1">📷</span>
                      <span className="text-[10px] font-semibold">Belum Ada Foto</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTriggerRemoteCamera(forensicTarget)}
                    className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[10px] transition active:scale-95 shadow-2xs"
                  >
                    📸 Jepret Kamera
                  </button>
                </div>

                <div className="flex-1 space-y-2.5 min-w-0">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Kejadian / Input Tercatat</span>
                    <p className="text-sm font-black text-slate-900 break-words mt-0.5">{forensicTarget.email || '-'}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 block">Jejak Akun Tersimpan di HP / Browser Pelaku</span>
                    {forensicTarget.device_identity ? (
                      <div className="mt-1 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 font-bold break-words leading-relaxed">
                        {forensicTarget.device_identity}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic mt-0.5">Tidak ada sesi Siswa/Wali yang tersimpan di browser ini (Mode Tamu / Incognito).</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Teknis Lokasi & Jaringan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1.5 shadow-2xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">📍 Lokasi &amp; Alamat Jalan</span>
                  <p className="font-bold text-slate-800 break-words text-xs">{forensicTarget.city || '-'}</p>
                  <p className="text-slate-500 break-words text-[11px]">{forensicTarget.region || '-'}</p>
                  {forensicTarget.latitude && forensicTarget.longitude && (
                    <p className="font-mono text-[10.5px] text-indigo-600 font-semibold pt-1">
                      GPS: {forensicTarget.latitude}, {forensicTarget.longitude}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1.5 shadow-2xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">🌐 Jaringan &amp; Perangkat</span>
                  <p className="font-mono font-bold text-slate-800 break-all text-[11px]">IP: {forensicTarget.ip_address || '-'}</p>
                  <p className="text-slate-600 break-words text-[11px]">ISP: <strong className="text-slate-800">{forensicTarget.isp || '-'}</strong></p>
                  <p className="text-slate-600 break-words text-[11px]">Perangkat: <strong className="text-slate-800">{forensicTarget.device || '-'}</strong> ({forensicTarget.browser} • {forensicTarget.os})</p>
                </div>
              </div>

              {/* Peta Interaktif Langsung */}
              {forensicTarget.latitude && forensicTarget.longitude && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">🗺️ Peta Titik Lokasi Pelaku</span>
                    <a
                      href={`https://www.google.com/maps?q=${forensicTarget.latitude},${forensicTarget.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Buka di Google Maps Penuh ↗
                    </a>
                  </div>
                  <div className="w-full h-52 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner">
                    <iframe
                      title="Peta Lokasi Penyusup"
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(forensicTarget.longitude) - 0.005}%2C${Number(forensicTarget.latitude) - 0.005}%2C${Number(forensicTarget.longitude) + 0.005}%2C${Number(forensicTarget.latitude) + 0.005}&layer=mapnik&marker=${forensicTarget.latitude}%2C${forensicTarget.longitude}`}
                    />
                  </div>
                </div>
              )}

              {/* Tombol Kendali Intervensi di Bawah Modal */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = forensicTarget
                      setForensicTarget(null)
                      handleOpenSendMessage(target, false)
                    }}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition shadow-sm active:scale-95"
                  >
                    💬 Kirim Pesan Interogasi
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleToggleLockDevice(forensicTarget)
                      setForensicTarget(prev => prev ? { ...prev, status: prev.status === 'blocked' ? 'active' : 'blocked' } : null)
                    }}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs transition shadow-sm active:scale-95 ${
                      forensicTarget.status === 'blocked'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {forensicTarget.status === 'blocked' ? '🔓 Buka Kunci Layar Pelaku' : '🔒 Kunci Layar Perangkat Pelaku'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setForensicTarget(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL POP-UP: KIRIM PESAN & KUNCI LAYAR PENYUSUP (Full-Screen Blur via Portal) */}
      {selectedTarget && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in font-sans"
          onClick={() => setSelectedTarget(null)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.45)] max-w-lg w-full overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal Modern Dark/Crimson */}
            <div className="bg-slate-900 text-white px-6 py-4.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-xl shrink-0">
                  🛡️
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-wide text-white">
                    Intervensi &amp; Kendali Layar Penyusup
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    Target: {selectedTarget.city || 'Jakarta'} • <span className="font-mono">{selectedTarget.ip_address}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTarget(null)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold shrink-0 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendMessageToHacker} className="p-6 space-y-4">
              
              {/* Ringkasan Target */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/90 text-[11px] space-y-1.5 text-slate-600 break-words">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px] shrink-0">Kejadian:</span>
                  <span className="font-bold text-slate-800 text-right">{selectedTarget.email || '-'}</span>
                </div>
                {selectedTarget.device_identity && (
                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-[10.5px]">
                    🎯 {selectedTarget.device_identity}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 pt-0.5 border-t border-slate-200/60">
                  <span className="text-slate-400 font-bold uppercase text-[10px] shrink-0">Perangkat:</span>
                  <span className="font-semibold text-slate-700 text-right">{selectedTarget.device || '-'} ({selectedTarget.browser} • {selectedTarget.os})</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px] shrink-0">Lokasi / ISP:</span>
                  <span className="font-semibold text-slate-700 text-right">{selectedTarget.city} ({selectedTarget.isp})</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-800">
                    Pesan Peringatan ke Layar Pelaku:
                  </label>
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                    Wajib Dibalas Pelaku
                  </span>
                </div>
                <textarea
                  rows={4}
                  required
                  value={messagePrompt}
                  onChange={(e) => setMessagePrompt(e.target.value)}
                  placeholder="Ketik pesan peringatan atau interogasi Anda..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white resize-none transition"
                />
              </div>

              {/* Template Cepat */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Template:</span>
                <button
                  type="button"
                  onClick={() => setMessagePrompt(`Halo, sistem keamanan mendeteksi Anda mencoba mengakses area terlarang dari ${selectedTarget.city}. Mohon segera tulis nama/kelas Anda dan temui Tim IT / Admin sekolah untuk klarifikasi.`)}
                  className="text-[10.5px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold transition"
                >
                  📋 Teguran Resmi
                </button>
                <button
                  type="button"
                  onClick={() => setMessagePrompt(`Kami telah mencatat identitas perangkat (${selectedTarget.device}) dan alamat IP (${selectedTarget.ip_address}) Anda. Jelaskan mengapa Anda mencoba melakukan akses ilegal?`)}
                  className="text-[10.5px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold transition"
                >
                  🚨 Interogasi Tegas
                </button>
              </div>

              {/* Opsi Kunci Layar Sekaligus */}
              <div className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                lockOnSend ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lockOnSend}
                    onChange={(e) => setLockOnSend(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500 w-4 h-4 mt-0.5 shrink-0"
                  />
                  <div className="text-[11px] leading-snug">
                    <span className="font-extrabold text-slate-900 block">🔒 Kunci &amp; Bekukan Layar Perangkat Pelaku</span>
                    <span className="text-slate-600">Pelaku tidak bisa menutup jendela peringatan walaupun me-refresh browser sampai Anda membuka kuncinya.</span>
                  </div>
                </label>

                <div className="pt-1 border-t border-slate-200/70 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 italic">
                    Ingin tahu tampilan yang muncul di layar HP/PC pelaku?
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePreviewIntruderScreen(selectedTarget, messagePrompt, lockOnSend)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition shrink-0 shadow-2xs"
                  >
                    👁️ Lihat Simulasi di Layar Pelaku
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedTarget(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={sendingMsg || !messagePrompt.trim()}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl text-xs font-extrabold transition shadow-md active:scale-95"
                >
                  {sendingMsg ? 'Mengirim...' : lockOnSend ? '🔒 Kunci Layar & Kirim Pesan' : '🚀 Kirim ke Layar Pelaku'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Lightbox Foto Wajah Penyusup (Full-Screen Blur via Portal) */}
      {selectedPhoto && createPortal(
        <div
          className="fixed inset-0 z-[999999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in font-sans"
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
              Foto ini diambil secara otomatis dari kamera depan saat perangkat membuka atau gagal masuk ke konsol Administrator.
            </p>

            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition active:scale-95"
            >
              Tutup Foto
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
