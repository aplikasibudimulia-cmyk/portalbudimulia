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

async function testRpc() {
  console.log("Calling fn_login for Radhika...")
  const { data: res1, error: err1 } = await supabase.rpc('fn_login', {
    p_username: 'radhikaputera13@gmail.com',
    p_password: 'Radhika123!',
    p_role: 'murid'
  })
  console.log("Response:", res1)
  console.log("Error:", err1)

  console.log("\nCalling fn_login for split username...")
  const { data: res2, error: err2 } = await supabase.rpc('fn_login', {
    p_username: 'radhikaputera13',
    p_password: 'Radhika123!',
    p_role: 'murid'
  })
  console.log("Response:", res2)
  console.log("Error:", err2)
}

testRpc()
