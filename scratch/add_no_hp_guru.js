import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/['"]/g, '')
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/['"]/g, '')

const supabase = createClient(url, key)

async function run() {
  console.log("Menambahkan kolom no_hp ke tabel guru...")
  const sql = `ALTER TABLE public.guru ADD COLUMN IF NOT EXISTS no_hp text;`
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
  
  if (error) {
    console.error('Error running alter table:', error)
  } else {
    console.log('Kolom no_hp berhasil ditambahkan atau sudah ada!')
    
    // Cek kolom tabel guru sekarang
    const verifySql = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'guru';
    `
    const { data: cols, error: colsErr } = await supabase.rpc('execute_sql', { sql_query: verifySql })
    if (colsErr) {
      console.error('Gagal memverifikasi kolom:', colsErr)
    } else {
      console.log('Kolom saat ini pada tabel guru:', cols)
    }
  }
}

run().catch(console.error)
