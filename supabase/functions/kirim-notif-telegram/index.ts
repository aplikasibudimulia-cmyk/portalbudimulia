import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { nisn, nama, kelas, status, waktu, tanggal } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Ambil bot token dari pengaturan_sekolah
    const { data: botTokenRow } = await supabase
      .from('pengaturan_sekolah')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle()

    const botToken = botTokenRow?.setting_value
    if (!botToken) {
      return new Response(JSON.stringify({ ok: false, error: 'Bot token tidak dikonfigurasi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // jangan error, agar tidak block presensi
      })
    }

    // Ambil telegram_ortu dari siswa
    const { data: siswa } = await supabase
      .from('siswa_permanent')
      .select('telegram_ortu, nama_lengkap')
      .eq('nisn', nisn)
      .maybeSingle()

    const chatId = siswa?.telegram_ortu
    if (!chatId) {
      return new Response(JSON.stringify({ ok: false, error: 'Chat ID orang tua belum diisi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    const statusLabel: Record<string, string> = { H: '✅ Hadir', T: '⚠️ Terlambat', S: '🤒 Sakit', I: '📋 Izin', A: '❌ Alpha', P: '🏃 Pulang Awal' }
    const label = statusLabel[status] || status

    // Format tanggal Indonesia
    const tgl = new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const message = `📣 *Notifikasi Presensi SIAKD*

👤 *${nama}*
🏫 Kelas: ${kelas}
📅 ${tgl}
⏰ Pukul: *${waktu} WIB*
📌 Status: *${label}*

_Pesan ini dikirim otomatis oleh sistem SIAKD._`

    // Kirim ke Telegram
    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    })

    const result = await telegramRes.json()

    return new Response(JSON.stringify({ ok: true, telegram: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // jangan 500 agar tidak block presensi
    })
  }
})
