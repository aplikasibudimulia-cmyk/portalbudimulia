import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/['"]/g, '')
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/['"]/g, '')

const supabase = createClient(url, key)

async function run() {
  console.log("Mengambil satu record dari siswa_lengkap...")
  const { data, error } = await supabase.from('siswa_lengkap').select('*').limit(1)
  if (error) {
    console.error("Gagal mengambil data siswa_lengkap:", error)
  } else {
    console.log("Sample siswa_lengkap:", data[0])
  }
}

run().catch(console.error)
