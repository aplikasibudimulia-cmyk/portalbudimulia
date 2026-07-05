import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim()
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim()

const supabase = createClient(url, key)

async function checkConstraints() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: `
    SELECT 
        conname AS constraint_name, 
        pg_get_constraintdef(c.oid) AS constraint_definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.conrelid
    WHERE conrelid = 'public.presensi_harian'::regclass;
  ` })
  console.log("Constraints of presensi_harian:", data)
  if (error) console.error("Error:", error)
}

checkConstraints()
