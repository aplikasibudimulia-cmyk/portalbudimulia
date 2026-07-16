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

async function run() {
  console.log("Querying admins from akun_pengguna...")
  const { data, error } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status')
    .eq('role', 'admin')

  if (error) {
    console.error("Error fetching admins:", error.message)
  } else {
    console.log("Admin accounts in DB:", data)
  }
}

run()
