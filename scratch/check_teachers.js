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
  console.log("Fetching teacher accounts from public.akun_pengguna...")
  
  const { data: akun, error } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status, foreign_id')
    .in('role', ['guru', 'admin', 'staff', 'staf', 'piket'])
    .limit(10)

  if (error) {
    console.error("Error:", error)
  } else {
    console.log("Teacher accounts:")
    console.log(JSON.stringify(akun, null, 2))
  }
}

check()
