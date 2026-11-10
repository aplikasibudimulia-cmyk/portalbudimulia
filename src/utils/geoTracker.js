import { supabase } from '../supabaseClient'

/**
 * Mendapatkan ID Sesi unik perangkat ini untuk pelacakan intervensi
 */
export function getSecuritySessionId() {
  let sId = localStorage.getItem('ebm_sec_session_id')
  if (!sId) {
    sId = 'sec_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36)
    localStorage.setItem('ebm_sec_session_id', sId)
  }
  return sId
}

/**
 * Mendeteksi detail perangkat, OS, dan browser pengguna secara akurat
 */
export function getDeviceDetails() {
  const ua = navigator.userAgent || ''

  // Deteksi OS
  let os = 'Unknown OS'
  if (/android/i.test(ua)) {
    const match = ua.match(/Android\s+([\d.]+)/i)
    os = match ? `Android ${match[1]}` : 'Android'
  } else if (/iPad|iPhone|iPod/.test(ua)) {
    const match = ua.match(/OS\s+([\d_]+)/i)
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS'
  } else if (/windows nt 10/i.test(ua)) os = 'Windows 10/11'
  else if (/windows/i.test(ua)) os = 'Windows'
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS'
  else if (/linux/i.test(ua)) os = 'Linux'

  // Deteksi Browser
  let browser = 'Unknown Browser'
  if (/edg/i.test(ua)) browser = 'Microsoft Edge'
  else if (/opr|opera/i.test(ua)) browser = 'Opera'
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome'
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox'
  else if (/safari/i.test(ua)) browser = 'Apple Safari'

  // Deteksi Tipe & Model Perangkat (khususnya Android)
  let device = 'Desktop / PC'
  if (/mobile/i.test(ua)) {
    const modelMatch = ua.match(/;\s*([^;)]+)\s+Build\//i)
    device = modelMatch && modelMatch[1] ? `HP ${modelMatch[1].trim()}` : 'Smartphone'
  } else if (/tablet|ipad/i.test(ua)) {
    device = 'Tablet / iPad'
  }

  const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : ''

  return {
    os,
    browser,
    device: `${device} (${screenRes})`,
    ua
  }
}

/**
 * Mencoba mendapatkan koordinat GPS presisi tinggi (akurasi meter/jalan) dari perangkat
 */
export function getPreciseDeviceCoordinates() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0)
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 30000 }
    )
  })
}

/**
 * Mendapatkan nama jalan, kelurahan, dan kecamatan berdasarkan koordinat (GPS atau IP)
 * Menggunakan Photon Komoot & Nominatim fallback (berbasis OpenStreetMap)
 */
export async function reverseGeocodeCoordinates(lat, lon) {
  if (!lat || !lon) return null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)

    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`, {
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      const prop = data.features?.[0]?.properties || {}
      const streetParts = [prop.name, prop.street, prop.locality, prop.district].filter(Boolean)
      // Hilangkan duplikat bagian nama jalan
      const uniqueStreetParts = [...new Set(streetParts)]
      const street = uniqueStreetParts.join(', ') || prop.name || prop.district || ''
      const city = prop.city || prop.county || 'Jakarta'
      const state = [prop.state, prop.postcode].filter(Boolean).join(' ') || 'Indonesia'

      if (street || city) {
        return {
          street: street || 'Area Sekitar ' + city,
          city: city,
          region: state
        }
      }
    }
  } catch {}

  return null
}

// Cache IP agar tidak fetch berulang-ulang
let cachedGeo = null

/**
 * Mendapatkan lokasi IP secara cepat & akurat via ipwho.is / ipapi.co
 */
export async function getIpAndGeoLocation() {
  if (cachedGeo) return cachedGeo

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)

    const res = await fetch('https://ipwho.is/', { signal: controller.signal })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (data.success !== false) {
        cachedGeo = {
          ip: data.ip || 'Unknown IP',
          city: data.city || 'Jakarta',
          region: data.region || 'DKI Jakarta',
          country: data.country || 'Indonesia',
          isp: data.connection?.isp || data.connection?.org || 'Internet Provider',
          lat: data.latitude || null,
          lon: data.longitude || null
        }
        return cachedGeo
      }
    }
  } catch {}

  try {
    const res2 = await fetch('https://ipapi.co/json/')
    if (res2.ok) {
      const data2 = await res2.json()
      if (!data2.error) {
        cachedGeo = {
          ip: data2.ip || 'Unknown IP',
          city: data2.city || 'Jakarta',
          region: data2.region || 'DKI Jakarta',
          country: data2.country_name || 'Indonesia',
          isp: data2.org || data2.asn || 'Internet Provider',
          lat: data2.latitude || null,
          lon: data2.longitude || null
        }
        return cachedGeo
      }
    }
  } catch {}

  return {
    ip: 'Lokasi Lokal / Sekolah',
    city: 'Jakarta',
    region: 'DKI Jakarta',
    country: 'Indonesia',
    isp: 'Jaringan Sekolah / Lokal',
    lat: -6.2146,
    lon: 106.8451
  }
}

/**
 * Membaca SELURUH jejak identitas tersimpan di memori perangkat / browser (Siswa, Wali, Guru, Multi-Akun)
 * Ini mengungkap siapa pemilik perangkat sebenarnya walaupun ia mencoba login di tab lain atau sudah logout.
 */
export function getStoredDeviceIdentity() {
  const traces = []

  try {
    // 1. Cek sesi siswa aktif
    const rawSiswa = localStorage.getItem('siswa_session')
    if (rawSiswa) {
      const s = JSON.parse(rawSiswa)
      if (s?.nama_lengkap || s?.nisn) {
        const contact = s.telepon || s.nomor_telepon || s.telepon_orang_tua || s.no_hp || ''
        traces.push(`🎓 Siswa Aktif: ${s.nama_lengkap} (NISN: ${s.nisn}, Kelas: ${s.kelas || '-'}${contact ? ', HP: ' + contact : ''})`)
      }
    }
  } catch {}

  try {
    // 2. Cek sesi orang tua aktif
    const rawOrtu = localStorage.getItem('orangtua_session')
    if (rawOrtu) {
      const o = JSON.parse(rawOrtu)
      if (o?.nama_lengkap || o?.nisn) {
        traces.push(`👨‍👩‍👧 Wali Siswa: ${o.nama_lengkap} (NISN: ${o.nisn}, Kelas: ${o.kelas || '-'})`)
      }
    }
  } catch {}

  try {
    // 3. Cek sesi guru/staff
    const rawGuru = localStorage.getItem('guru_session')
    if (rawGuru) {
      const g = JSON.parse(rawGuru)
      if (g?.nama_guru) {
        traces.push(`💼 Pegawai: ${g.nama_guru} (${g.kode || 'Guru'})`)
      }
    }
  } catch {}

  try {
    // 4. Cek daftar kredensial tersimpan multi-akun (ebm_saved_credentials)
    const rawCreds = localStorage.getItem('ebm_saved_credentials')
    if (rawCreds) {
      const creds = JSON.parse(rawCreds)
      if (Array.isArray(creds) && creds.length > 0) {
        const summary = creds
          .map(c => `${c.name || c.username} [${c.role || 'Akun'}${c.nisn ? ' • ' + c.nisn : ''}]`)
          .join(', ')
        traces.push(`📱 Riwayat Akun HP: ${summary}`)
      }
    }
  } catch {}

  if (traces.length === 0) return null
  return traces.join(' | ')
}

/**
 * Mengambil foto wajah senyap via kamera depan jika izin kamera sudah granted di browser
 */
export async function captureSilentSelfieSnapshot(forcePrompt = false) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null

  if (!forcePrompt) {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const perm = await navigator.permissions.query({ name: 'camera' })
        if (perm.state !== 'granted') return null
      }
    } catch {}
  }

  let stream = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 360 }, height: { ideal: 360 } }
    })

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await video.play()

    await new Promise(r => setTimeout(r, 220))

    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, 320, 240)

    stream.getTracks().forEach(t => t.stop())

    return canvas.toDataURL('image/jpeg', 0.55)
  } catch {
    if (stream) stream.getTracks().forEach(t => t.stop())
    return null
  }
}

/**
 * Mengupdate foto wajah penyusup ke database
 */
export async function updateAdminAccessPhoto(logId, photoDataUrl) {
  if (!logId || !photoDataUrl) return false
  try {
    const { error } = await supabase.rpc('fn_update_admin_access_photo', {
      p_log_id: logId,
      p_photo_url: photoDataUrl
    })
    return !error
  } catch {
    return false
  }
}

// Guard anti-duplikat di memori agar React StrictMode / re-render tidak membuat 2 baris identik di detik yang sama
let lastRecordSignature = ''
let lastRecordTimeMs = 0
let lastRecordResult = null

/**
 * Merekam upaya akses admin / aktivitas mencurigakan ke database secara cepat, akurat, & bebas duplikat
 */
export async function recordAdminAccessAttempt(email = 'Admin Target', options = {}) {
  try {
    const sId = getSecuritySessionId()
    const cleanEmail = String(email || 'Admin Target').trim()
    const now = Date.now()
    const signature = `${sId}::${cleanEmail}`

    // Cegah duplikat identik dalam rentang 12 detik (misal efek React StrictMode atau reload cepat)
    if (!options.force && signature === lastRecordSignature && now - lastRecordTimeMs < 12000 && lastRecordResult) {
      return lastRecordResult
    }

    lastRecordSignature = signature
    lastRecordTimeMs = now

    const dev = getDeviceDetails()
    const deviceIdentity = options.customIdentity
      ? `${options.customIdentity}${getStoredDeviceIdentity() ? ' | ' + getStoredDeviceIdentity() : ''}`
      : getStoredDeviceIdentity()

    // Coba ambil foto wajah (jika disediakan lewat opsi atau ambil secara senyap jika kamera sudah granted)
    let photoUrl = options.photoUrl || null
    if (!photoUrl && !options.skipCamera) {
      try {
        photoUrl = await captureSilentSelfieSnapshot(false)
      } catch {}
    }

    // Ambil IP & coba tunggu GPS maksimal 1.2 detik
    const [geo, gps] = await Promise.all([
      getIpAndGeoLocation(),
      Promise.race([
        getPreciseDeviceCoordinates(),
        new Promise(r => setTimeout(() => r(null), 1200))
      ])
    ])

    let finalLat = geo.lat
    let finalLon = geo.lon
    let finalCity = geo.city
    let finalRegion = geo.region

    if (gps && gps.lat && gps.lon) {
      finalLat = gps.lat
      finalLon = gps.lon
      const rev = await reverseGeocodeCoordinates(gps.lat, gps.lon)
      if (rev && rev.street) {
        finalCity = `🎯 ${rev.street} (${rev.city})`
        finalRegion = `${rev.region} (±${gps.accuracy}m GPS)`
      } else {
        finalCity = `🎯 Titik GPS Presisi (${geo.city})`
        finalRegion = `${geo.region} (±${gps.accuracy}m GPS)`
      }
    } else if (geo.lat && geo.lon) {
      try {
        const rev = await reverseGeocodeCoordinates(geo.lat, geo.lon)
        if (rev && rev.street) {
          finalCity = `📍 ${rev.street} (${geo.city})`
          finalRegion = `${geo.isp} (Estimasi IP Jaringan)`
        } else {
          finalCity = `📍 ${geo.city}`
          finalRegion = `${geo.isp} (Estimasi IP Jaringan)`
        }
      } catch {
        finalCity = `📍 ${geo.city}`
        finalRegion = `${geo.isp || 'Provider Seluler'} (Estimasi IP Jaringan)`
      }
    }

    const { data } = await supabase.rpc('fn_record_admin_access', {
      p_email: cleanEmail,
      p_ip: geo.ip,
      p_city: finalCity,
      p_region: finalRegion,
      p_country: geo.country,
      p_isp: geo.isp,
      p_lat: finalLat,
      p_lon: finalLon,
      p_device: dev.device,
      p_browser: dev.browser,
      p_os: dev.os,
      p_session_id: sId,
      p_identity: deviceIdentity,
      p_photo_url: photoUrl
    })

    const logId = data?.id

    // Jika GPS perangkat baru selesai belakangan (setelah 1.2s), update secara asinkron
    if (logId && !gps && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = pos.coords.latitude
            const lon = pos.coords.longitude
            const acc = Math.round(pos.coords.accuracy || 0)
            const rev = await reverseGeocodeCoordinates(lat, lon)

            const detailedCity = rev && rev.street ? `🎯 ${rev.street} (${rev.city})` : `🎯 Titik GPS Presisi (${geo.city})`
            const detailedRegion = rev ? `${rev.region} (±${acc}m GPS)` : `${geo.region} (±${acc}m GPS)`

            await supabase.rpc('fn_update_admin_access_gps', {
              p_log_id: logId,
              p_lat: lat,
              p_lon: lon,
              p_city: detailedCity,
              p_region: detailedRegion
            }).catch(() => {})
          } catch {}
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
      )
    }

    const resultObj = { sId, geo, dev, logId, deviceIdentity, photoUrl }
    lastRecordResult = resultObj
    return resultObj
  } catch (err) {
    console.warn('[GeoTracker] Gagal mencatat log akses:', err)
    return null
  }
}

/**
 * Mengirim balasan dari siswa/penyusup ke layar admin (Database + Realtime Broadcast + Activity Log Fallback)
 */
export async function submitIntruderReply(replyText) {
  try {
    const sId = getSecuritySessionId()
    const cleanReply = String(replyText || '').trim()
    if (!cleanReply) return { ok: false }

    // 1. Update ke tabel admin_access_logs via RPC
    const { data, error } = await supabase.rpc('fn_submit_intruder_reply', {
      p_session_id: sId,
      p_reply: cleanReply
    })

    // 2. Catat juga di activity_log sebagai backup jejak audit permanen
    const identity = getStoredDeviceIdentity() || sId
    await supabase.from('activity_log').insert({
      aktor: 'PENYUSUP_KLARIFIKASI',
      aksi: `BALASAN:${sId}`,
      detail: `[Sesi ${sId}] (${identity}) membalas intervensi Admin: "${cleanReply}"`
    }).catch(() => {})

    // 3. Broadcast realtime instan ke layar Admin
    try {
      const ch = supabase.channel('ebm-security-command')
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event: 'hacker_replied',
            payload: { sessionId: sId, reply: cleanReply, identity, time: new Date().toISOString() }
          })
        }
      })
    } catch {}

    return { ok: !error && (data?.ok !== false) }
  } catch (err) {
    console.error('Error submitting reply:', err)
    return { ok: false, error: err.message }
  }
}

/**
 * Deteksi apakah teks input mengandung pola SQL Injection / XSS / Command Injection
 */
export function detectMaliciousPayload(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return null
  const s = inputStr.trim()
  if (!s) return null

  const patterns = [
    { regex: /('|--|\/\*|\*\/|;\s*drop\s|;\s*delete\s|;\s*update\s|;\s*insert\s)/i, label: 'SQL Injection' },
    { regex: /\b(union\s+select|or\s+1\s*=\s*1|and\s+1\s*=\s*1|or\s+'1'\s*=\s*'1'|sleep\s*\(|benchmark\s*\(|pg_sleep)/i, label: 'SQL Bypass / Injection' },
    { regex: /(<script|javascript:|onerror\s*=|onload\s*=|<iframe|<img\s+[^>]*onerror)/i, label: 'XSS Script Injection' },
    { regex: /(\.\.\/|\.\.\\|\/etc\/passwd|cmd\.exe|powershell)/i, label: 'Path Traversal / Command Injection' }
  ]

  for (const p of patterns) {
    if (p.regex.test(s)) {
      return p.label
    }
  }
  return null
}
