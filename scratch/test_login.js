// Diagnostic script to check latest users and test login error response
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
  console.log("1. Querying latest accounts from public.akun_pengguna...");
  const { data: accounts, error: errAcc } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status, foreign_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (errAcc) {
    console.error("Error querying accounts:", errAcc);
    return;
  }

  console.log("Latest accounts:", JSON.stringify(accounts, null, 2));

  if (!accounts || accounts.length === 0) {
    console.log("No accounts found in public.akun_pengguna.");
    return;
  }

  // Let's check the latest user's email format and test signing in
  const latestUser = accounts[0];
  const emailToSignIn = latestUser.username.includes('@') 
    ? latestUser.username.trim().toLowerCase()
    : latestUser.username.trim().toLowerCase().split('@')[0] + '@ebudimulia.local';

  // We don't know the password, but we want to see the error payload
  // If the user has "Database error querying schema", even with wrong password, it will throw 500 "Database error querying schema"
  // If the user is healthy, it will throw 400 "Invalid login credentials"
  console.log(`\n2. Testing login for email: "${emailToSignIn}" (Role: ${latestUser.role}) with test password...`);
  
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: emailToSignIn,
      password: 'wrong_password_test_123'
    })
  });

  console.log("HTTP Response Status:", response.status, response.statusText);
  const bodyText = await response.text();
  console.log("HTTP Response Body:", bodyText);
}

run().catch(console.error);
