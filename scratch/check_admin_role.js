const { createClient } = require('@supabase/supabase-client');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Needs service role key to inspect auth schema

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  // Get all users in public.akun_pengguna
  const { data: accounts, error: accErr } = await supabase
    .from('akun_pengguna')
    .select('*')
    .ilike('username', '%admin%');
  
  if (accErr) {
    console.error("Error fetching accounts:", accErr.message);
  } else {
    console.log("=== Accounts with 'admin' in username ===");
    console.log(accounts);
  }

  // Get auth users
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error("Error listing auth users:", authErr.message);
  } else {
    console.log("\n=== Auth Users ===");
    users.forEach(u => {
      console.log(`ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, AppMetadata:`, u.app_metadata);
    });
  }
}

run();
