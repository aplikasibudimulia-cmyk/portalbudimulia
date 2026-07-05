import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim()
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim()

const supabase = createClient(url, key)

async function checkSchema() {
  const { data, error } = await supabase
    .from('presensi_harian')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('Error fetching:', error)
  } else {
    if (data.length > 0) {
      console.log('Columns available in first row:', Object.keys(data[0]))
      console.log('First row data:', data[0])
    } else {
      console.log('Table is empty.')
    }
  }
}

checkSchema()
