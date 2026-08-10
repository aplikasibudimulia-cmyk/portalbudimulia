// src/utils/lineNotifier.js
// Utilitas untuk mengolah Flex Message LINE & Mengirim Push Notification via LINE Messaging API

/**
 * Membuat payload LINE Flex Message untuk notifikasi presensi siswa
 */
export function createPresensiFlexMessage({
  nama,
  nisn,
  kelas,
  status, // 'H' | 'T' | 'S' | 'I' | 'A'
  waktu,
  tipe = 'masuk', // 'masuk' | 'pulang'
  sekolahNama = 'SMP Budi Mulia Jakarta',
  fotoUrl = null,
}) {
  const isPulang = tipe === 'pulang'
  let statusText = 'HADIR'
  let statusColor = '#10B981' // Emerald green
  let statusIcon = '✅'

  if (isPulang) {
    statusText = 'PULANG'
    statusColor = '#3B82F6' // Blue
    statusIcon = '🏠'
  } else if (status === 'T') {
    statusText = 'TERLAMBAT'
    statusColor = '#F59E0B' // Amber
    statusIcon = '⏰'
  } else if (status === 'S') {
    statusText = 'SAKIT'
    statusColor = '#6366F1' // Indigo
    statusIcon = '🏥'
  } else if (status === 'I') {
    statusText = 'IZIN'
    statusColor = '#0EA5E9' // Sky
    statusIcon = '📋'
  } else if (status === 'A') {
    statusText = 'ALPHA'
    statusColor = '#EF4444' // Red
    statusIcon = '❌'
  }

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nama)}&background=6366f1&color=fff&size=200`
  const studentPhoto = fotoUrl || defaultAvatar

  return {
    type: 'flex',
    altText: `Notifikasi Presensi: ${nama} (${statusText})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: sekolahNama.toUpperCase(),
            color: '#94A3B8',
            size: 'xs',
            weight: 'bold',
          },
          {
            type: 'text',
            text: 'NOTIFIKASI PRESENSI KEHADIRAN',
            color: '#FFFFFF',
            size: 'md',
            weight: 'bold',
            margin: 'xs',
          },
        ],
      },
      hero: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: statusColor,
        paddingAll: '12px',
        alignment: 'center',
        contents: [
          {
            type: 'text',
            text: `${statusIcon} STATUS: ${statusText}`,
            color: '#FFFFFF',
            size: 'md',
            weight: 'bold',
            align: 'center',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            contents: [
              {
                type: 'image',
                url: studentPhoto,
                size: 'xs',
                aspectMode: 'cover',
                aspectRatio: '1:1',
                gravity: 'center',
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: nama,
                    weight: 'bold',
                    size: 'md',
                    color: '#1E293B',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `Kelas: ${kelas} | NISN: ${nisn}`,
                    size: 'xs',
                    color: '#64748B',
                    margin: 'xs',
                  },
                ],
              },
            ],
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: 'Waktu Presensi',
                    size: 'xs',
                    color: '#64748B',
                  },
                  {
                    type: 'text',
                    text: `${waktu} WIB`,
                    size: 'xs',
                    color: '#0F172A',
                    weight: 'bold',
                    align: 'end',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  {
                    type: 'text',
                    text: 'Kategori',
                    size: 'xs',
                    color: '#64748B',
                  },
                  {
                    type: 'text',
                    text: isPulang ? 'Presensi Pulang' : 'Presensi Masuk',
                    size: 'xs',
                    color: '#0F172A',
                    weight: 'bold',
                    align: 'end',
                  },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'Disampaikan otomatis oleh eBudimulia Academic Portal',
            color: '#94A3B8',
            size: 'xxs',
            align: 'center',
          },
        ],
      },
    },
  }
}

/**
 * Mengirim pesan Push Notification ke user LINE spesifik via Messaging API
 * @param {Object} params
 * @param {string} params.lineUserId - ID Pengguna LINE tujuan
 * @param {Object} params.flexMessage - Payload Flex Message LINE
 * @param {string} [params.accessToken] - LINE Channel Access Token
 */
export async function sendLinePushNotification({ lineUserId, flexMessage, accessToken }) {
  if (!lineUserId) {
    console.warn('[LINE] lineUserId kosong. Skipping LINE notification.')
    return { success: false, reason: 'LINE User ID kosong' }
  }

  const token = accessToken || import.meta.env.VITE_LINE_CHANNEL_ACCESS_TOKEN

  // Primary: Kirim via proxy backend (/api/line-push) untuk menghindari blokir CORS di browser
  try {
    const proxyRes = await fetch('/api/line-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId, flexMessage, accessToken: token }),
    })

    if (proxyRes.ok) {
      const data = await proxyRes.json()
      if (data.success) {
        console.log('[LINE Proxy] Push notification berhasil dikirim ke:', lineUserId)
        return { success: true }
      }
      return data
    }
  } catch (proxyErr) {
    console.warn('[LINE Proxy] Proxy error/unreachable, mencoba Supabase Edge Function fallback...', proxyErr)
  }

  // Fallback 1: Supabase Edge Function (Bekerja di Web Produksi tanpa terhalang CORS Browser)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseAnonKey) {
      const edgeRes = await fetch(`${supabaseUrl}/functions/v1/line-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          lineUserId,
          flexMessage,
          accessToken: token
        }),
      })

      if (edgeRes.ok) {
        const edgeData = await edgeRes.json()
        if (edgeData.success) {
          console.log('[LINE Edge Function] Push notification berhasil dikirim ke:', lineUserId)
          return { success: true }
        }
      }
    }
  } catch (edgeErr) {
    console.warn('[LINE Edge Function Fallback Error]', edgeErr)
  }

  // Fallback: Direct fetch (hanya berjalan jika di luar browser / tanpa CORS restriction)
  if (!token) {
    console.warn('[LINE] Channel Access Token tidak ditemukan. Setel di VITE_LINE_CHANNEL_ACCESS_TOKEN atau Admin Panel.')
    return { success: false, reason: 'LINE Access Token belum diatur' }
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [flexMessage],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('[LINE API Error]', response.status, errBody)
      return { success: false, status: response.status, error: errBody }
    }

    console.log('[LINE] Push notification berhasil dikirim ke:', lineUserId)
    return { success: true }
  } catch (err) {
    console.error('[LINE Exception]', err)
    return { success: false, error: err.message }
  }
}

/**
 * Membuat payload LINE Flex Message konfirmasi penautan sukses
 */
export function createBindingSuccessFlexMessage({ nama, kelas, nisn }) {
  return {
    type: 'flex',
    altText: `Penautan Berhasil: ${nama}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10B981',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: '✅ PENAUTAN AKUN BERHASIL',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'sm',
            align: 'center',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: `Selamat! Akun LINE Anda telah berhasil ditautkan dengan siswa:`,
            size: 'xs',
            color: '#475569',
            wrap: true,
          },
          {
            type: 'text',
            text: nama,
            weight: 'bold',
            size: 'md',
            color: '#0F172A',
            margin: 'xs',
          },
          {
            type: 'text',
            text: `Kelas: ${kelas} | NISN: ${nisn}`,
            size: 'xs',
            color: '#64748B',
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: 'Mulai sekarang, Anda akan menerima notifikasi presensi & kehadiran anak secara otomatis di sini.',
            size: 'xxs',
            color: '#94A3B8',
            wrap: true,
            margin: 'md',
          },
        ],
      },
    },
  }
}

/**
 * Pemproses perintah chat LINE (Metode 2: TAUTKAN <NISN>)
 */
export async function handleLineChatCommand({ lineUserId, textMessage, supabaseClient }) {
  if (!textMessage || !lineUserId) return null
  const cleaned = textMessage.trim().toUpperCase()

  // Match: "TAUTKAN 1234567890", "TAUTKAN 1234567890 KODE123", "DAFTAR 1234567890", "NISN 1234567890"
  const match = cleaned.match(/^(?:TAUTKAN|DAFTAR|NISN)\s+([0-9A-Z]+)(?:\s+(.+))?$/i)
  if (!match) return null

  const targetNisn = match[1]

  // Cari siswa berdasarkan NISN di Supabase
  const { data: siswa, error } = await supabaseClient
    .from('siswa_lengkap')
    .select('nisn, nama_lengkap, kelas')
    .eq('nisn', targetNisn)
    .maybeSingle()

  if (error || !siswa) {
    return {
      success: false,
      nisn: targetNisn,
      reason: `NISN ${targetNisn} tidak ditemukan di sistem sekolah. Harap periksa kembali.`,
    }
  }

  // Update line_user_id di database Supabase
  await supabaseClient
    .from('siswa_lengkap')
    .update({ line_user_id: lineUserId })
    .eq('nisn', targetNisn)

  const flexMsg = createBindingSuccessFlexMessage({
    nama: siswa.nama_lengkap,
    kelas: siswa.kelas,
    nisn: siswa.nisn,
  })

  // Kirim respon balasan ke LINE
  await sendLinePushNotification({ lineUserId, flexMessage: flexMsg })

  return {
    success: true,
    siswa,
  }
}

