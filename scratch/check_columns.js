import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/['"]/g, '')
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/['"]/g, '')

const supabase = createClient(url, key)

async function run() {
  const sql = `
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name IN ('notifikasi', 'dokumen')
    ORDER BY table_name, column_name;
  `
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
  if (error) {
    console.error('Error running RPC execute_sql:', error)
  } else {
    console.log('Columns definition:')
    console.log(JSON.stringify(data, null, 2))
  }
}

run().catch(console.error)
