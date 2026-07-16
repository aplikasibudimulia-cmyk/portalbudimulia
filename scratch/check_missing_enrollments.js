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

async function run() {
  // Let's find all students whose NISN contains 'temp' or is '9879879876'
  const { data: siswa, error: errSiswa } = await supabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap')
    .or('nisn.ilike.%temp%,nisn.eq.9879879876')

  if (errSiswa) {
    console.error("Error fetching siswa:", errSiswa)
    return
  }

  console.log(`Total temp/987 siswa in database: ${siswa.length}`)

  // Let's fetch all enrollments for these students
  const nisns = siswa.map(s => s.nisn)
  const { data: enrollments, error: errEnrol } = await supabase
    .from('enrollment')
    .select('nisn, kelas')
    .in('nisn', nisns)

  if (errEnrol) {
    console.error("Error fetching enrollments:", errEnrol)
    return
  }

  console.log(`Total enrollments for these students: ${enrollments.length}`)

  const enrolledNisns = new Set(enrollments.map(e => e.nisn))
  const notEnrolled = siswa.filter(s => !enrolledNisns.has(s.nisn))

  console.log("Students without enrollment:")
  notEnrolled.forEach(s => {
    console.log(`- NISN: ${s.nisn}, Nama: ${s.nama_lengkap}`)
  })
}

run()
