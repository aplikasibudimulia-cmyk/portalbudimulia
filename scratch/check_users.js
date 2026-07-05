import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Membaca .env manual
const envPath = path.resolve(process.cwd(), '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const envLines = envContent.split('\n')

let supabaseUrl = ''
let supabaseKey = ''

for (const line of envLines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim()
  }
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseKey = line.split('=')[1].trim()
  }
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log("Searching for Vernando or similar in siswa_permanent and akun_pengguna...")
  
  // 1. Cari di siswa_permanent
  const { data: siswa, error: errSiswa } = await supabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap, email_aktif')
    .ilike('nama_lengkap', '%vernando%')
  
  if (errSiswa) {
    console.error("Error searching siswa_permanent:", errSiswa)
  } else {
    console.log("Siswa permanent matching Vernando:")
    console.log(JSON.stringify(siswa, null, 2))
  }

  // 2. Cari di akun_pengguna
  const { data: akun, error: errAkun } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status')
    .ilike('username', '%vernando%')

  if (errAkun) {
    console.error("Error searching akun_pengguna:", errAkun)
  } else {
    console.log("Akun pengguna matching Vernando:")
    console.log(JSON.stringify(akun, null, 2))
  }
}

check()
