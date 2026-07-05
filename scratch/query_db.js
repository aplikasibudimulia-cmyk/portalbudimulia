import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Baca .env secara manual
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
  console.log("=== MEMANGGIL TEMP PRINT AUTH ===")
  const { data, error } = await supabase.rpc('temp_print_auth')
  if (error) {
    console.error("Gagal memanggil rpc temp_print_auth:", error.message)
    console.log("Pastikan Anda sudah menjalankan temp_print_auth.sql di Supabase SQL Editor.")
  } else {
    console.log("=== USER DI AUTH.USERS ===")
    console.log(JSON.stringify(data, null, 2))
  }
}

run()
