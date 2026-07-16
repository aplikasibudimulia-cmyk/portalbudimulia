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

async function dump() {
  console.log("Calling temp_debug_system...")
  const { data, error } = await supabase.rpc('temp_debug_system')
  if (error) {
    console.error("Error:", error)
    return
  }
  
  fs.writeFileSync('scratch/db_dump.json', JSON.stringify(data, null, 2))
  console.log("Dump saved to scratch/db_dump.json")
  
  if (data.akun_pengguna) {
    console.log("Total accounts in akun_pengguna:", data.akun_pengguna.length)
    console.log("Roles breakdown:", data.akun_pengguna.reduce((acc, a) => {
      acc[a.role] = (acc[a.role] || 0) + 1
      return acc
    }, {}))
    console.log("First 15 accounts in akun_pengguna:")
    console.log(data.akun_pengguna.slice(0, 15).map(a => ({ id: a.id, username: a.username, role: a.role, status: a.status })))
  }
  
  if (data.auth_users) {
    console.log("Total users in auth.users:", data.auth_users.length)
    console.log("First 15 users in auth.users:")
    console.log(data.auth_users.slice(0, 15).map(u => ({ id: u.id, email: u.email })))
  }
}

dump()
