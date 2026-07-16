import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/['"]/g, '')
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/['"]/g, '')

const supabase = createClient(url, key)

async function run() {
  const sqlFile = path.resolve('scratch/apply_akses_level_migration.sql')
  const sql = fs.readFileSync(sqlFile, 'utf8')
  console.log('Running SQL Migration:\n', sql)
  
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql })
  if (error) {
    console.error('Error running migration:', error)
  } else {
    console.log('Migration successful! Result:', data)
  }
}

run().catch(console.error)
