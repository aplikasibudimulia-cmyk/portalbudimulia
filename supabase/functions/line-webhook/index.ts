import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SRK')!
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function sendLineReply(replyToken: string, messages: object[]) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
}

function buildSuccessFlex(nisn: string, namaLengkap: string, kelas: string) {
  return {
    type: 'flex',
    altText: `✅ Penautan Berhasil! ${namaLengkap}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#10B981',
        paddingAll: '15px',
        contents: [{
          type: 'text',
          text: '✅ PENAUTAN AKUN BERHASIL',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'sm',
          align: 'center',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'Selamat! Akun LINE Anda telah berhasil ditautkan dengan siswa:', size: 'xs', color: '#475569', wrap: true },
          { type: 'text', text: namaLengkap, weight: 'bold', size: 'md', color: '#0F172A', margin: 'xs' },
          { type: 'text', text: `Kelas: ${kelas} | NISN: ${nisn}`, size: 'xs', color: '#64748B' },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'Mulai sekarang, Anda akan menerima notifikasi presensi & kehadiran anak secara otomatis di LINE ini.', size: 'xxs', color: '#94A3B8', wrap: true, margin: 'md' },
        ],
      },
    },
  }
}

function buildNotFoundFlex(nisn: string) {
  return {
    type: 'flex',
    altText: `❌ NISN ${nisn} tidak ditemukan`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EF4444',
        paddingAll: '15px',
        contents: [{
          type: 'text',
          text: '❌ NISN TIDAK DITEMUKAN',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'sm',
          align: 'center',
        }],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: `Nomor NISN "${nisn}" tidak terdaftar di sistem sekolah. Harap periksa kembali NISN anak Anda dan coba lagi.`,
            size: 'xs',
            color: '#475569',
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: 'Format perintah yang benar:\nTAUTKAN [NISN] [PASSWORD_LOGIN]\n\nContoh:\nTAUTKAN 111222345 MHLY5',
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const payload = await req.json()
    const events = payload.events || []

    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text') {
        const lineUserId = event.source?.userId as string
        const userText = (event.message.text as string).trim()
        const replyToken = event.replyToken as string

        console.log(`[LINE WEBHOOK] From ${lineUserId}: "${userText}"`)

        // Match: BATAL <NISN>, HAPUS <NISN>, UNLINK <NISN>
        const unlinkMatch = userText.match(/^(?:BATAL|HAPUS|UNLINK)\s*([0-9]{5,20})$/i)
        if (unlinkMatch) {
          const nisn = unlinkMatch[1]
          console.log(`[LINE UNBIND] Request to unlink NISN ${nisn} from LINE User ${lineUserId}`)

          // Cek apakah binding ini memang milik pengguna LINE yang mengirim chat
          const { data: existing } = await supabase
            .from('line_bindings')
            .select('line_user_id')
            .eq('nisn', nisn)
            .maybeSingle()

          if (existing && existing.line_user_id === lineUserId) {
            // Hapus binding
            await supabase.from('line_bindings').delete().eq('nisn', nisn)
            // Bersihkan line_user_id di siswa_permanent
            await supabase.from('siswa_permanent').update({ line_user_id: null }).eq('nisn', nisn)

            await sendLineReply(replyToken, [{
              type: 'text',
              text: `✅ Penautan untuk NISN ${nisn} telah berhasil dibatalkan.`
            }])
          } else {
            await sendLineReply(replyToken, [{
              type: 'text',
              text: `❌ Gagal membatalkan penautan. NISN ${nisn} tidak ditautkan ke akun LINE Anda.`
            }])
          }
          continue
        }

        // 1. Cek perintah TAUTKAN dengan password: TAUTKAN [NISN] [PASSWORD]
        const bindWithPassMatch = userText.match(/^(?:TAUTKAN|DAFTAR|NISN)?\s*([0-9]{5,20})\s+(.+)$/i)
        
        // 2. Cek perintah TAUTKAN tanpa password: TAUTKAN [NISN]
        const bindNoPassMatch = userText.match(/^(?:TAUTKAN|DAFTAR|NISN)?\s*([0-9]{5,20})$/i)

        if (bindWithPassMatch) {
          const nisn = bindWithPassMatch[1]
          const password = bindWithPassMatch[2].trim()
          console.log(`[LINE BINDING] Attempt NISN ${nisn} with password verification -> LINE User ${lineUserId}`)

          // Lookup student in siswa_permanent
          const { data: siswa } = await supabase
            .from('siswa_permanent')
            .select('nisn, nama_lengkap')
            .eq('nisn', nisn)
            .maybeSingle()

          if (!siswa) {
            console.log(`[LINE BINDING FAILED] NISN ${nisn} not found`)
            await sendLineReply(replyToken, [buildNotFoundFlex(nisn)])
            continue
          }

          // Verifikasi password akun orang tua via RPC
          const { data: isValidPassword } = await supabase
            .rpc('fn_verify_parent_password', { p_nisn: nisn, p_password: password })

          if (!isValidPassword) {
            console.log(`[LINE BINDING FAILED] NISN ${nisn} -> Incorrect password`)
            await sendLineReply(replyToken, [{
              type: 'text',
              text: `❌ Kata sandi (password) salah untuk NISN ${nisn}. Penautan gagal. Harap gunakan password login orang tua Anda yang terdaftar.`
            }])
            continue
          }

          // Get kelas from enrollment based on active school year (is_aktif = true)
          let kelasStr = '-'
          const { data: activeTa } = await supabase
            .from('tahun_ajaran')
            .select('id')
            .eq('is_aktif', true)
            .maybeSingle()

          if (activeTa?.id) {
            const { data: enroll } = await supabase
              .from('enrollment')
              .select('kelas')
              .eq('nisn', nisn)
              .eq('tahun_ajaran_id', activeTa.id)
              .maybeSingle()
            if (enroll?.kelas) kelasStr = enroll.kelas
          }

          // Cek apakah NISN sudah terikat sebelumnya
          const { data: existingBinding } = await supabase
            .from('line_bindings')
            .select('line_user_id')
            .eq('nisn', nisn)
            .maybeSingle()

          if (existingBinding) {
            if (existingBinding.line_user_id === lineUserId) {
              await sendLineReply(replyToken, [{
                type: 'text',
                text: `ℹ️ Siswa ${siswa.nama_lengkap} (NISN: ${nisn}) sudah ditautkan ke akun LINE Anda.`
              }])
            } else {
              await sendLineReply(replyToken, [{
                type: 'text',
                text: `⚠️ Siswa ${siswa.nama_lengkap} (NISN: ${nisn}) sudah ditautkan ke akun LINE lain. Silakan hubungi admin sekolah jika ada kekeliruan.`
              }])
            }
            continue
          }

          // Save binding to line_bindings (upsert)
          await supabase
            .from('line_bindings')
            .upsert(
              { nisn, line_user_id: lineUserId, updated_at: new Date().toISOString() },
              { onConflict: 'nisn' }
            )

          // Also update siswa_permanent.line_user_id
          await supabase
            .from('siswa_permanent')
            .update({ line_user_id: lineUserId })
            .eq('nisn', nisn)

          console.log(`[LINE BINDING SUCCESS] ${lineUserId} -> ${siswa.nama_lengkap} (${nisn})`)

          await sendLineReply(replyToken, [
            buildSuccessFlex(nisn, siswa.nama_lengkap, kelasStr)
          ])
        } else if (bindNoPassMatch) {
          const nisn = bindNoPassMatch[1]
          await sendLineReply(replyToken, [{
            type: 'text',
            text: `⚠️ Keamanan Diperlukan!\n\nUntuk menautkan akun, silakan gunakan format perintah berikut dengan menyertakan password login orang tua Anda:\n\nTAUTKAN [NISN] [PASSWORD_LOGIN]\n\nContoh:\nTAUTKAN ${nisn} MHLY5`
          }])
          continue
        }
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[LINE Webhook Error]', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
