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
  console.log("Logging in as Radhika to bypass RLS...")
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'radhikaputera13@gmail.com',
    password: 'Radhika123!'
  })

  if (authError) {
    console.error("Auth error:", authError.message)
    return
  }

  console.log("Auth success! Querying siswa_lengkap...")
  const { data, error } = await supabase.from('siswa_lengkap').select('*')
  if (error) {
    console.error("Query error:", error.message)
  } else {
    console.log("Total rows in siswa_lengkap view for Radhika:", data.length)
    const class7 = data.filter(s => s.kelas && s.kelas.startsWith('7'))
    console.log("Total class 7 in view:", class7.length)
    console.log("Class 7 counts in view:", {
      '7A': class7.filter(s => s.kelas === '7A').length,
      '7B': class7.filter(s => s.kelas === '7B').length,
      '7C': class7.filter(s => s.kelas === '7C').length,
      '7D': class7.filter(s => s.kelas === '7D').length,
    })
  }
}

run()
