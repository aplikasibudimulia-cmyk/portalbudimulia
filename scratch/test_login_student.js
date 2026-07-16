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

async function test() {
  const email = 'radhikaputera13@gmail.com'
  const password = 'Radhika123!'

  console.log(`Trying to sign in with auth.signInWithPassword for email: ${email}`)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authErr) {
    console.error("Auth error:", authErr)
  } else {
    console.log("Auth success! User ID:", authData.user.id)
  }

  // Let's also try with split ebudimulia.local
  const splitEmail = email.split('@')[0] + '@ebudimulia.local'
  console.log(`\nTrying to sign in with split ebudimulia.local: ${splitEmail}`)
  const { data: authData2, error: authErr2 } = await supabase.auth.signInWithPassword({
    email: splitEmail,
    password
  })

  if (authErr2) {
    console.error("Auth error 2:", authErr2)
  } else {
    console.log("Auth success 2! User ID:", authData2.user.id)
  }
}

test()
