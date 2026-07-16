import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

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

async function inspect() {
  console.log("=== INSPECTING ERVAN ===")
  const { data: ervans, error: errErvan } = await supabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap, email_aktif')
    .ilike('nama_lengkap', '%ervan%')
  
  if (errErvan) console.error("Error Ervan:", errErvan)
  else console.log("Siswa named Ervan:", ervans)

  if (ervans && ervans.length > 0) {
    for (const erv of ervans) {
      const { data: akun, error: errAkun } = await supabase
        .from('akun_pengguna')
        .select('*')
        .eq('foreign_id', erv.nisn)
      console.log(`Akun for Ervan (${erv.nisn}):`, akun)
    }
  }

  console.log("\n=== INSPECTING OTHER STUDENTS ===")
  const { data: otherSiswa, error: errOther } = await supabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap, email_aktif')
    .limit(5)
  if (errOther) console.error("Error other:", errOther)
  else console.log("Other 5 siswa:", otherSiswa)

  if (otherSiswa) {
    for (const sis of otherSiswa) {
      const { data: akun, error: errAkun } = await supabase
        .from('akun_pengguna')
        .select('*')
        .eq('foreign_id', sis.nisn)
      console.log(`Akun for Siswa (${sis.nisn} - ${sis.nama_lengkap}):`, akun)
    }
  }
}

inspect()
