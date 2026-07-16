// Diagnose the exact auth error by logging in as temporary admin
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
  const randId = Math.random().toString(36).substring(7);
  const tempEmail = "diag_admin_temp_" + randId + "@ebudimulia.local";
  const tempPassword = "DiagAdminPass123!_";
  const tempForeignId = "temp_login_diag_" + randId;

  console.log("1. Creating temporary admin account...");
  const { data: createResult, error: createError } = await supabase.rpc('admin_create_user', {
    p_username: tempEmail,
    p_password: tempPassword,
    p_role: 'admin',
    p_foreign_id: tempForeignId,
    p_status: 'aktif'
  });

  if (createError || !createResult?.ok) {
    console.error("Failed to create temporary admin:", createError || createResult);
    return;
  }

  const tempAdminId = createResult.id;
  console.log("Temp admin created successfully. ID:", tempAdminId);

  try {
    console.log("2. Authenticating as temporary admin...");
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: tempEmail,
      password: tempPassword
    });

    if (authError) {
      console.error("Failed to authenticate as admin:", authError.message);
      return;
    }

    const adminClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`
        }
      }
    });

    console.log("3. Querying latest accounts from public.akun_pengguna as Admin...");
    const { data: accounts, error: errAcc } = await adminClient
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
      console.log("No accounts found.");
      return;
    }

    const targetUser = accounts[0];
    const emailToSignIn = targetUser.username.includes('@') 
      ? targetUser.username.trim().toLowerCase()
      : targetUser.username.trim().toLowerCase().split('@')[0] + '@ebudimulia.local';

    console.log(`\n4. Testing login for latest user email: "${emailToSignIn}" (Role: ${targetUser.role}) with test password...`);
    const loginResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
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

    console.log("HTTP Response Status:", loginResponse.status, loginResponse.statusText);
    const bodyText = await loginResponse.text();
    console.log("HTTP Response Body:", bodyText);

  } finally {
    console.log("\n5. Cleaning up temporary admin account...");
    // Update status to nonaktif
    await supabase.rpc('admin_create_user', {
      p_username: tempEmail,
      p_password: tempPassword,
      p_role: 'admin',
      p_foreign_id: tempForeignId,
      p_status: 'nonaktif'
    });
    console.log("Cleanup done.");
  }
}

run().catch(console.error);
