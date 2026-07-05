const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing URL or Anon Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("=== CHECKING LOGGED-IN USERS VIA ADMIN RPC / VIEWS ===");
  const { data: accounts, error: err } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status');
    
  if (err) {
    console.error("Error fetching accounts:", err.message);
  } else {
    console.log("Registered Accounts:");
    console.log(accounts);
  }
}

run();
