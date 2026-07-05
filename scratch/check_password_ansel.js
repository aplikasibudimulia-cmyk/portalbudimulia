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
  console.log("Checking Ansel hashes...")
  
  // 1. Fetch public.akun_pengguna hash
  const { data: publicAkun, error: errPublic } = await supabase
    .from('akun_pengguna')
    .select('id, username, password')
    .eq('username', 'ansel.ebm9@gmail.com')
    .single()

  if (errPublic) {
    console.error("Public fetch error:", errPublic)
    return
  }
  console.log("Public hash:", publicAkun.password)

  // 2. We can check the auth.users details using a temp database function
  // We will run this function to fetch both hashes.
}

check()
