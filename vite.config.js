import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ngdepacckohoxemlauhd.supabase.co',
  'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
)

function lineWebhookPlugin() {
  return {
    name: 'line-webhook-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/line-push' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const { lineUserId, flexMessage, accessToken } = JSON.parse(body || '{}')
              const DEFAULT_LINE_TOKEN = 'Q0qsnhosKoxttb4VNrQgZfx9mT0x8RxmzL7GPuf70nvk1YjreV8ie/hVLRzUuglwpznP7gdYw6iBZTUTFEgD2qqNxaVTepk3uRBaNZXgmZYlnslE8ppaqCltuD6WKZFfqcNqqCeGGmkwZk3hJRlUtAdB04t89/10/w1cDnyilFU='

              let token = (accessToken && accessToken.trim()) ? accessToken.trim() : null
              if (!token) {
                const { data: configData } = await supabase
                  .from('pengaturan_sekolah')
                  .select('setting_value')
                  .eq('setting_key', 'line_channel_access_token')
                  .maybeSingle()
                token = configData?.setting_value?.trim() || process.env.VITE_LINE_CHANNEL_ACCESS_TOKEN || DEFAULT_LINE_TOKEN
              }

              if (!lineUserId) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, reason: 'LINE User ID tujuan tidak boleh kosong' }))
                return
              }

              const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
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

              const resText = await lineRes.text()
              if (!lineRes.ok) {
                console.error('[LINE Proxy Push Error]', lineRes.status, resText)
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, status: lineRes.status, error: resText }))
                return
              }

              console.log('[LINE Proxy Push] Successfully sent to', lineUserId)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } catch (err) {
              console.error('[LINE Proxy Exception]', err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
            }
          })
          return
        }

        if (req.url === '/api/line-webhook' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}')
              const events = payload.events || []

              // Get LINE Token from database
              const { data: configData } = await supabase
                .from('pengaturan_sekolah')
                .select('setting_value')
                .eq('setting_key', 'line_channel_access_token')
                .maybeSingle()

              const lineToken = configData?.setting_value || process.env.VITE_LINE_CHANNEL_ACCESS_TOKEN || 'Q0qsnhosKoxttb4VNrQgZfx9mT0x8RxmzL7GPuf70nvk1YjreV8ie/hVLRzUuglwpznP7gdYw6iBZTUTFEgD2qqNxaVTepk3uRBaNZXgmZYlnslE8ppaqCltuD6WKZFfqcNqqCeGGmkwZk3hJRlUtAdB04t89/10/w1cDnyilFU='

              for (const event of events) {
                if (event.type === 'message' && event.message && event.message.type === 'text') {
                  const lineUserId = event.source?.userId
                  const userText = event.message.text?.trim() || ''
                  const replyToken = event.replyToken

                  console.log(`\x1b[32m[LINE WEBHOOK]\x1b[0m Received chat from ${lineUserId}: "${userText}"`)

                  if (!lineToken) {
                    console.warn(`\x1b[33m[LINE WEBHOOK WARN]\x1b[0m LINE Access Token belum disimpan di Admin Panel! Harap simpan di http://localhost:5173/admin -> Notifikasi LINE`)
                  }

                  // Match: TAUTKAN <NISN>, DAFTAR <NISN>, NISN <NISN>, or pure NISN digits
                  const nisnMatch = userText.match(/^(?:TAUTKAN|DAFTAR|NISN)?\s*([0-9]{5,20})$/i)
                  if (nisnMatch && lineToken) {
                    const nisn = nisnMatch[1]

                    console.log(`\x1b[32m[LINE BINDING]\x1b[0m Saving NISN ${nisn} -> LINE User ${lineUserId}`)

                    // Save to line_bindings table directly (no RLS block)
                    const { error: bindErr } = await supabase
                      .from('line_bindings')
                      .upsert({ nisn: nisn, line_user_id: lineUserId, updated_at: new Date().toISOString() }, { onConflict: 'nisn' })

                    // Also try update siswa_permanent.line_user_id
                    await supabase
                      .from('siswa_permanent')
                      .update({ line_user_id: lineUserId })
                      .eq('nisn', nisn)

                    let replyFlex = null
                    if (!bindErr) {
                      console.log(`\x1b[32m[LINE BINDING SUCCESS]\x1b[0m Linked ${lineUserId} with NISN ${nisn}`)
                      replyFlex = {
                        type: 'flex',
                        altText: `✅ Penautan Berhasil! NISN ${nisn}`,
                        contents: {
                          type: 'bubble',
                          header: {
                            type: 'box',
                            layout: 'vertical',
                            backgroundColor: '#10B981',
                            paddingAll: '15px',
                            contents: [{ type: 'text', text: '✅ PENAUTAN AKUN BERHASIL', color: '#FFFFFF', weight: 'bold', size: 'sm', align: 'center' }]
                          },
                          body: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'sm',
                            contents: [
                              { type: 'text', text: 'Selamat! Akun LINE Anda telah berhasil ditautkan.', size: 'xs', color: '#475569', wrap: true },
                              { type: 'text', text: `NISN: ${nisn}`, weight: 'bold', size: 'md', color: '#0F172A', margin: 'xs' },
                              { type: 'separator', margin: 'md' },
                              { type: 'text', text: 'Mulai sekarang, Anda akan menerima notifikasi presensi & kehadiran anak secara otomatis di sini.', size: 'xxs', color: '#94A3B8', wrap: true, margin: 'md' }
                            ]
                          }
                        }
                      }
                    } else {
                      console.log(`\x1b[31m[LINE BINDING FAILED]\x1b[0m Error: ${bindErr.message}`)
                      replyFlex = {
                        type: 'flex',
                        altText: 'Penautan Gagal',
                        contents: {
                          type: 'bubble',
                          header: {
                            type: 'box',
                            layout: 'vertical',
                            backgroundColor: '#EF4444',
                            paddingAll: '15px',
                            contents: [{ type: 'text', text: '❌ PENAUTAN GAGAL', color: '#FFFFFF', weight: 'bold', size: 'sm', align: 'center' }]
                          },
                          body: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'sm',
                            contents: [
                              { type: 'text', text: `Terjadi kesalahan saat menyimpan data. Silakan coba lagi. (${bindErr.message})`, size: 'xs', color: '#475569', wrap: true }
                            ]
                          }
                        }
                      }
                    }

                    // Send reply using LINE Reply API
                    if (replyFlex) {
                      await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${lineToken}`
                        },
                        body: JSON.stringify({
                          replyToken,
                          messages: [replyFlex]
                        })
                      }).catch(err => console.error('[LINE Reply Error]', err))
                    }
                  }
                }
              }
            } catch (err) {
              console.error('[LINE Webhook Error]', err)
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 'ok' }))
          })
          return
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), basicSsl(), lineWebhookPlugin()],
  server: {
    https: true,
    host: true, // expose ke jaringan lokal (HP bisa akses)
  },
  resolve: {
    alias: {
      stream: path.resolve('src/utils/streamMock.js'),
    },
  },
  build: {
    target: 'es2018',
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['react-pdf', 'pdfjs-dist'],
        },
      },
    },
  },
})
