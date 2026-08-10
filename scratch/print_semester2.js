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

async function check() {
  const { data: progs } = await supabase
    .from('program_sekolah')
    .select('id, nama, tanggal_mulai, tanggal_selesai')
    .gte('tanggal_mulai', '2027-01-01')
    .order('tanggal_mulai')

  console.log('Programs in Semester 2 (>= 2027-01-01) in DB:', progs.length)
  progs.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.tanggal_mulai} s/d ${p.tanggal_selesai}] - "${p.nama}"`)
  })
}
check()
