import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

// Membaca .env manual
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

async function test() {
  const plainPassword = 'testingpassword123'
  const salt = bcrypt.genSaltSync(10)
  const hash = bcrypt.hashSync(plainPassword, salt)
  
  // Ganti $2b$ menjadi $2a$
  const hash2a = hash.replace(/^\$2b\$/, '$2a$')

  console.log("Plain password to write:", plainPassword)
  console.log("Original Hash ($2b$):", hash)
  console.log("Modified Hash ($2a$):", hash2a)

  // Update ke DB dengan $2a$
  console.log("Updating password hash for chloelikesfrenchfries@gmail.com with $2a$...")
  const { error: updateErr } = await supabase
    .from('akun_pengguna')
    .update({ password: hash2a })
    .eq('username', 'chloelikesfrenchfries@gmail.com')

  if (updateErr) {
    console.error("Failed to update password:", updateErr)
    return
  }

  // Coba login lagi
  console.log("Calling fn_login RPC...")
  const { data: loginRes, error: loginErr } = await supabase.rpc('fn_login', {
    p_username: 'chloelikesfrenchfries@gmail.com',
    p_password: plainPassword,
    p_role: 'murid'
  })

  if (loginErr) {
    console.error("fn_login RPC error:", loginErr)
  } else {
    console.log("fn_login RPC Response:")
    console.log(JSON.stringify(loginRes, null, 2))
  }
}

test()
