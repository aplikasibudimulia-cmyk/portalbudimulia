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

async function checkRls() {
  const query = `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename LIKE '%program_sekolah%';
  `
  
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: query })
  if (error) {
    console.error("Error executing SQL:", error)
  } else {
    console.log("RLS Policies for program_sekolah tables:")
    console.log(JSON.stringify(data, null, 2))
  }
}

checkRls()
