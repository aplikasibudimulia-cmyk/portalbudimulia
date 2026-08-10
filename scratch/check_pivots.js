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

try {
  console.log('Starting query...')
  const { data: progs, error } = await supabase
    .from('program_sekolah')
    .select(`
      nama,
      tanggal_mulai,
      categories:program_sekolah_kategori_pivot(category:program_sekolah_kategori(nama))
    `)
    .gte('tanggal_mulai', '2027-01-01')
    .order('tanggal_mulai')

  if (error) {
    console.error('Database query error:', error)
  } else if (!progs) {
    console.log('No programs returned')
  } else {
    console.log('Total programs found:', progs.length)
    progs.forEach((p, idx) => {
      const catName = p.categories?.[0]?.category?.nama || 'NONE'
      console.log(`${idx+1}. [${p.tanggal_mulai}] [Cat: ${catName}] - "${p.nama}"`)
    })
  }
} catch (err) {
  console.error('Execution error:', err)
}
