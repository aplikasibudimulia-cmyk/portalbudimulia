import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://xyz.supabase.co', 'dummy')
try {
  supabase.from('berkas_pengumuman').select('*').eq('kode_jenis', undefined).then(console.log).catch(console.error)
} catch (e) {
  console.error("SYNC ERROR:", e)
}
