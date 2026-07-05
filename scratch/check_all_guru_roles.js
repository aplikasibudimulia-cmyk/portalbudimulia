import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    const key = parts[0].trim()
    const value = parts.slice(1).join('=').trim()
    env[key] = value
  }
})

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log("=== CHECK GURU & ROLES ===")
  const { data: gurus, error: gErr } = await supabase.from('guru').select('id, nama_guru, kode')
  if (gErr) console.error("Gurus error:", gErr)
  
  const { data: guruRoles, error: grErr } = await supabase.from('guru_role').select('*')
  if (grErr) console.error("Guru roles error:", grErr)

  const { data: roles, error: rErr } = await supabase.from('roles').select('*')
  if (rErr) console.error("Roles error:", rErr)

  console.log("Gurus:", gurus)
  console.log("Roles:", roles)
  console.log("Guru-Role Links:", guruRoles)
}

run()
