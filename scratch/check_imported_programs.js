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
  const { data: progs, error } = await supabase
    .from('program_sekolah')
    .select('id, nama, tanggal_mulai, tanggal_selesai')
    .order('tanggal_mulai')

  if (error) {
    console.error('Error fetching:', error)
    return
  }

  console.log('Total programs in DB:', progs.length)
  
  // Count by year and month
  const counts = {}
  progs.forEach(p => {
    const date = new Date(p.tanggal_mulai)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    counts[key] = (counts[key] || 0) + 1
  })
  console.log('Program counts by year-month:', counts)

  console.log('First 5 programs:', progs.slice(0, 5))
  console.log('Last 5 programs:', progs.slice(-5))
}
check()
