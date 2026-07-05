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
  console.log("Checking Ansel account details in public.akun_pengguna and auth.users...")
  
  // 1. Check in public.akun_pengguna
  const { data: publicAkun, error: errPublic } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status')
    .ilike('username', '%ansel%')

  console.log("Public akun_pengguna matching Ansel:", publicAkun)

  // 2. We can't query auth.users directly via standard select if we are using the anon key (because it is in another schema and RLS protects it).
  // But wait! We can query it if we write a quick PL/pgSQL function to look up auth.users and call it!
  // Or we can just inspect public.akun_pengguna first.
}

check()
