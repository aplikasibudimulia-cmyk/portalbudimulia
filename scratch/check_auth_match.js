import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = {};
fs.readFileSync('.env', 'utf-8').split('\n').forEach(l => {
  const [k,...v] = l.split('='); if(k) env[k.trim()] = v.join('=').trim();
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Test: coba signIn dengan email @ebudimulia.local langsung
async function testSignIn(username, password) {
  const authEmail = username.split('@')[0] + '@ebudimulia.local';
  console.log(`\nTesting: "${username}" → authEmail: "${authEmail}"`);
  const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (error) console.log('  ❌ GAGAL:', error.message);
  else console.log('  ✅ BERHASIL, user id:', data.user?.id);
  await supabase.auth.signOut();
}

// Ganti dengan username + password siswa yang GAGAL login
await testSignIn('GANTI_USERNAME_SISWA@gmail.com', 'GANTI_PASSWORD');
