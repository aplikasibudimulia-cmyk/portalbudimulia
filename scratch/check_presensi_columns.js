import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim()
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim()

const supabase = createClient(url, key)

async function checkColumns() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'presensi_harian'
  ` })
  console.log("Columns of presensi_harian:", data)
  if (error) console.error("Error:", error)
}

checkColumns()
