import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

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
  console.log("Checking plain-text kode_akses for Abigail...")
  
  // 1. Fetch from siswa_permanent
  const { data: siswa, error: errSiswa } = await supabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap, kode_akses, email_aktif')
    .eq('email_aktif', 'abigail.weisly@gmail.com')
    .maybeSingle()

  if (errSiswa) {
    console.error("Error fetching student:", errSiswa)
    return
  }

  if (!siswa) {
    console.log("No student found with email_aktif = abigail.weisly@gmail.com")
    return
  }

  console.log("Student details:")
  console.log("NISN:", siswa.nisn)
  console.log("Nama:", siswa.nama_lengkap)
  console.log("Kode Akses (Plain Text):", siswa.kode_akses)

  // 2. Fetch the hash from public.akun_pengguna using a custom select since we can't do it with anon key
  // Wait, let's test if the plain text password matches the hash using bcryptjs!
  const publicHash = "$2b$10$jEplPy0C.SJ1vI70hbpNDeB7C6aELnGskQNhXC3y6I2wlrJxUd2aG"
  if (siswa.kode_akses) {
    const isMatch = bcrypt.compareSync(siswa.kode_akses, publicHash)
    console.log("Does the plain-text password match the public hash in bcryptjs?", isMatch)
    
    // Let's also test the $2a$ version
    const authHash = "$2a$10$jEplPy0C.SJ1vI70hbpNDeB7C6aELnGskQNhXC3y6I2wlrJxUd2aG"
    const isMatch2 = bcrypt.compareSync(siswa.kode_akses, authHash)
    console.log("Does the plain-text password match the auth ($2a$) hash in bcryptjs?", isMatch2)
  }
}

check()
