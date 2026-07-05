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
  console.log("Checking Admin accounts in public.akun_pengguna...")
  
  // We can select role = 'admin' using fn_login or another method if RLS is on,
  // but wait, we can create a temporary function to list all admin accounts and call it!
  const { data, error } = await supabase.rpc('get_auth_triggers') // let's see if we can query it via a SQL function
}

check()
