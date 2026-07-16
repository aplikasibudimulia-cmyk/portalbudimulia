import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const lines = env.split('\n')
const url = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim()
const key = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim()

const supabase = createClient(url, key)

async function run() {
  console.log("Logging in as Ansel...")
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ansel.ebm9@gmail.com',
    password: 'TR6782'
  })
  if (authError) {
    console.error("Auth error:", authError.message)
    return
  }

  // Create authenticated client
  const authSupabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
  await authSupabase.auth.setSession(authData.session)

  console.log("Fetching one row from guru...")
  const { data: oneGuru, error: oneError } = await authSupabase.from('guru').select('*').limit(1)
  if (oneError) {
    console.error("Error fetching guru:", oneError)
  } else {
    console.log("Sample guru row:", oneGuru)
  }

  console.log("Querying information_schema.columns...")
  const { data, error } = await authSupabase.rpc('execute_sql', { sql_query: `
    SELECT 
        column_name, 
        data_type,
        is_nullable
    FROM information_schema.columns
    WHERE table_name = 'guru';
  ` })
  if (error) {
    console.error("Error columns with auth:", error)
  } else {
    console.log("Columns of table guru:", data)
  }

  console.log("Querying pg_constraint...")
  const { data: conData, error: conError } = await authSupabase.rpc('execute_sql', { sql_query: `
    SELECT 
        conname AS constraint_name, 
        pg_get_constraintdef(c.oid) AS constraint_definition
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE r.relname = 'guru';
  ` })
  if (conError) {
    console.error("Error constraints:", conError)
  } else {
    console.log("Constraints of table guru:", conData)
  }
}

run()
