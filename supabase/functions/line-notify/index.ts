import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SRK')!
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { nisn, nama, kelas, status, waktu, tipe, fotoUrl, keterangan, lineUserId: customLineUserId, flexMessage: customFlexMessage } = body

    let lineUserId = customLineUserId || null

    if (!lineUserId && nisn) {
      // 1. Lookup line_user_id dari line_bindings
      const { data: binding } = await supabase
        .from('line_bindings')
        .select('line_user_id')
        .eq('nisn', nisn)
        .maybeSingle()

      if (binding?.line_user_id) {
        lineUserId = binding.line_user_id
      } else {
        // 2. Fallback: Lookup dari siswa_permanent
        const { data: siswa } = await supabase
          .from('siswa_permanent')
          .select('line_user_id')
          .eq('nisn', nisn)
          .maybeSingle()
        if (siswa?.line_user_id) {
          lineUserId = siswa.line_user_id
        }
      }
    }

    if (!lineUserId) {
      return new Response(JSON.stringify({ success: false, reason: 'Tidak ada LINE binding (line_user_id) untuk NISN/User ini' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build status info
    const isPulang = tipe === 'pulang'
    let statusText = 'HADIR'
    let statusColor = '#10B981'
    let statusIcon = '✅'

    if (isPulang) { statusText = 'PULANG'; statusColor = '#3B82F6'; statusIcon = '🏠' }
    else if (status === 'T') { statusText = 'TERLAMBAT'; statusColor = '#F59E0B'; statusIcon = '⏰' }
    else if (status === 'S') { statusText = 'SAKIT'; statusColor = '#6366F1'; statusIcon = '🏥' }
    else if (status === 'I') { statusText = 'IZIN'; statusColor = '#0EA5E9'; statusIcon = '📋' }
    else if (status === 'A') { statusText = 'ALPHA'; statusColor = '#EF4444'; statusIcon = '❌' }

    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nama || 'Siswa')}&background=6366f1&color=fff&size=200`
    const studentPhoto = fotoUrl || defaultAvatar

    // Parsing lokasi / keterangan koordinat
    let lokasiContent: any = { type: 'text', text: '-', size: 'xs', color: '#0F172A', weight: 'bold', align: 'end' }
    if (keterangan && keterangan.trim() !== '' && keterangan !== '-') {
      const trimmedKeterangan = keterangan.trim()
      // Cek apakah format koordinat (e.g. -6.147,106.827)
      const coordRegex = /^-?[0-9.]+,\s*-?[0-9.]+$/
      if (coordRegex.test(trimmedKeterangan)) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedKeterangan)}`
        lokasiContent = {
          type: 'text',
          text: 'Buka Peta 📍',
          size: 'xs',
          color: '#3B82F6',
          weight: 'bold',
          align: 'end',
          action: {
            type: 'uri',
            label: 'Buka Peta',
            uri: mapsUrl
          }
        }
      } else {
        lokasiContent = {
          type: 'text',
          text: trimmedKeterangan,
          size: 'xs',
          color: '#0F172A',
          weight: 'bold',
          align: 'end',
          wrap: true
        }
      }
    }

    const flexMessage = customFlexMessage || {
      type: 'flex',
      altText: `Notifikasi Presensi: ${nama || 'Siswa'} (${statusText})`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#0F172A',
          paddingAll: '15px',
          contents: [
            { type: 'text', text: 'SMP BUDI MULIA JAKARTA', color: '#94A3B8', size: 'xs', weight: 'bold' },
            { type: 'text', text: 'NOTIFIKASI PRESENSI KEHADIRAN', color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs' },
          ],
        },
        hero: {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: statusColor,
          paddingAll: '12px',
          contents: [
            { type: 'text', text: `${statusIcon} STATUS: ${statusText}`, color: '#FFFFFF', size: 'md', weight: 'bold', align: 'center' }
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
                { type: 'image', url: studentPhoto, size: 'xs', aspectMode: 'cover', aspectRatio: '1:1', gravity: 'center' },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: nama || '-', weight: 'bold', size: 'md', color: '#1E293B', wrap: true },
                    { type: 'text', text: `Kelas: ${kelas || '-'} | NISN: ${nisn || '-'}`, size: 'xs', color: '#64748B', margin: 'xs' },
                  ],
                },
              ],
            },
            { type: 'separator', margin: 'md' },
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
                    { type: 'text', text: 'Waktu Presensi', size: 'xs', color: '#64748B' },
                    { type: 'text', text: `${waktu || '-'} WIB`, size: 'xs', color: '#0F172A', weight: 'bold', align: 'end' },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'Kategori', size: 'xs', color: '#64748B' },
                    { type: 'text', text: isPulang ? 'Presensi Pulang' : 'Presensi Masuk', size: 'xs', color: '#0F172A', weight: 'bold', align: 'end' },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'Lokasi', size: 'xs', color: '#64748B' },
                    lokasiContent
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
            { type: 'text', text: 'Disampaikan otomatis oleh eBudimulia Academic Portal', color: '#94A3B8', size: 'xxs', align: 'center' }
          ],
        },
      },
    }

    // Kirim ke LINE Push API
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineUserId, messages: [flexMessage] }),
    })

    if (!lineRes.ok) {
      const errText = await lineRes.text()
      console.error('[LINE Push Error]', lineRes.status, errText)
      return new Response(JSON.stringify({ success: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[LINE Notify] Sent to ${lineUserId} for NISN ${nisn}`)
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[line-notify Error]', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
