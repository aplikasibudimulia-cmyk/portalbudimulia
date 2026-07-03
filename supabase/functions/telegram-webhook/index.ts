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
    const url = new URL(req.url)
    
    // Parse update from Telegram Webhook
    const update = await req.json()
    console.log('Received update:', JSON.stringify(update))

    // Handle incoming message
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id
      const text = update.message.text.trim()

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

      const sendTelegramReply = async (message: string) => {
        if (!botToken) return;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
          })
        })
      }

      if (text.startsWith('/start ')) {
        const nisn = text.replace('/start ', '').trim()

        if (!nisn) {
          await sendTelegramReply('Format salah. Gunakan link yang diberikan oleh pihak sekolah.')
          return new Response('ok', { status: 200 })
        }

        // Cari siswa berdasarkan NISN
        const { data: siswa, error: siswaError } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap')
          .eq('nisn', nisn)
          .maybeSingle()

        if (siswaError || !siswa) {
          await sendTelegramReply(`Maaf, data siswa dengan NISN *${nisn}* tidak ditemukan di sistem kami. Pastikan link yang Anda buka benar.`)
          return new Response('ok', { status: 200 })
        }

        // Update chat ID ke tabel siswa_permanent
        const { error: updateError } = await supabase
          .from('siswa_permanent')
          .update({ telegram_ortu: chatId.toString() })
          .eq('nisn', nisn)

        if (updateError) {
          console.error('Update Error:', updateError)
          await sendTelegramReply('Terjadi kesalahan saat menyimpan data. Silakan coba lagi nanti.')
          return new Response('ok', { status: 200 })
        }

        await sendTelegramReply(`✅ *Verifikasi Berhasil!*\n\nAkun Telegram ini sekarang terhubung dengan data siswa:\n👤 *${siswa.nama_lengkap}*\n\nAnda akan menerima notifikasi kehadiran (presensi) siswa di ruang obrolan ini secara otomatis.`)
        return new Response('ok', { status: 200 })
      }
      
      // Jika perintah bukan /start [nisn] (misal diketik manual)
      if (text === '/start') {
        await sendTelegramReply('Selamat datang! Untuk verifikasi nomor Telegram, silakan gunakan tautan (link) atau scan QR Code yang dibagikan oleh pihak sekolah.')
        return new Response('ok', { status: 200 })
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Error handling webhook:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})
