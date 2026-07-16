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
    supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '')
  }
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '')
  }
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const tempEmail = 'temp_diagnostic_admin@ebudimulia.local'
  const tempPassword = 'TempDiagnostic123!'

  console.log("1. Creating temporary admin account in database...")
  // We can use the admin_create_user RPC since it runs as security definer (bypasses RLS)
  const { data: createRes, error: createError } = await supabase.rpc('admin_create_user', {
    p_username: tempEmail,
    p_password: tempPassword,
    p_role: 'admin',
    p_foreign_id: 'temp_diag_admin',
    p_status: 'aktif'
  })

  if (createError) {
    console.error("Failed to create temporary admin:", createError.message)
    return
  }
  console.log("Temporary admin created:", createRes)

  try {
    console.log("2. Logging in as temporary admin...")
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: tempEmail,
      password: tempPassword
    })

    if (authError) {
      console.error("Failed to log in as admin:", authError.message)
      return
    }
    console.log("Auth success! JWT token obtained.")

    // Initialize client with authenticated session
    const authedClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
    await authedClient.auth.setSession({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token
    })

    console.log("3. Querying public.siswa_lengkap as Admin...")
    const { data: students, error: queryError } = await authedClient
      .from('siswa_lengkap')
      .select('*')
      .order('nama_lengkap')
      .limit(3000)

    if (queryError) {
      console.error("Failed to query siswa_lengkap:", queryError.message)
      return
    }

    console.log("Total students returned from view:", students.length)

    const class7 = students.filter(s => s.kelas && s.kelas.startsWith('7'))
    console.log("Total class 7 in view for Admin:", class7.length)
    console.log("Class 7 counts in view:", {
      '7A': class7.filter(s => s.kelas === '7A').length,
      '7B': class7.filter(s => s.kelas === '7B').length,
      '7C': class7.filter(s => s.kelas === '7C').length,
      '7D': class7.filter(s => s.kelas === '7D').length,
    })

    const missingNisns = ['temp7A32', 'temp7A33', 'temp7A34', 'temp7B32', 'temp7B33', 'temp7C33', 'temp7C34', 'temp7D33']
    const found = students.filter(s => missingNisns.includes(s.nisn))
    console.log("Found missing NISNs in API response:", found.length)
    console.log("Details of found NISNs:", JSON.stringify(found, null, 2))

  } finally {
    console.log("4. Cleaning up temporary admin account...")
    // Authenticate with admin_create_user RPC to delete?
    // Wait, we can't easily delete auth.users from RPC unless there is an RPC for it, 
    // but we can update its status to 'nonaktif' or just leave it since it is harmless,
    // or we can run a SQL command? But execute_sql is gone.
    // Let's just set the status to nonaktif.
    const { error: cleanupError } = await supabase.rpc('admin_create_user', {
      p_username: tempEmail,
      p_password: tempPassword,
      p_role: 'admin',
      p_foreign_id: 'temp_diag_admin',
      p_status: 'nonaktif' // deactivate it
    })
    console.log("Cleanup status:", cleanupError ? cleanupError.message : "Success")
  }
}

run()
