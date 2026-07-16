import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Parse .env manually
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkData() {
  console.log("Checking data...");

  // 1. Check roles
  const { data: roles } = await supabase.from('roles').select('*');
  console.log("All Roles:", roles);

  // 2. Check akun_pengguna
  const { data: users, error: errUsers } = await supabase.from('akun_pengguna').select('*').limit(5);
  console.log("Users:", users, "Error:", errUsers);

  // 3. Check guru
  const { data: guruCount } = await supabase.from('guru').select('count', { count: 'exact' });
  console.log("Guru count:", guruCount);

  // 4. Check siswa_permanent
  const { data: siswaCount } = await supabase.from('siswa_permanent').select('count', { count: 'exact' });
  console.log("Siswa count:", siswaCount);
}

checkData();
