import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function diagnose() {
  console.log('\n========== DIAGNOSA LOGIN SISWA ==========\n');

  // 1. Akun murid di akun_pengguna
  const { data: akunMurid, error: errAkun } = await supabase
    .from('akun_pengguna')
    .select('id, username, role, status, foreign_id, password')
    .eq('role', 'murid')
    .order('username');

  if (errAkun) {
    console.error('Tidak bisa baca akun_pengguna:', errAkun.message);
  } else {
    console.log(`Total akun murid: ${akunMurid?.length ?? 0}`);
    akunMurid?.forEach(a => {
      const hasHash = a.password && a.password.startsWith('$2');
      console.log(`  ${a.username} | status=${a.status} | foreign_id=${a.foreign_id} | password=${hasHash ? 'OK ($2...)' : 'MASALAH: ' + (a.password?.substring(0,15) || 'KOSONG')}`);
    });
  }

  // 2. Coba fn_login simulasi
  console.log('\n--- Test fn_login ervan ---');
  const { data: r1 } = await supabase.rpc('fn_login', { p_username: 'ervan', p_password: 'DUMMY_WRONG', p_role: 'murid' });
  console.log('ervan result:', JSON.stringify(r1));
}

diagnose();
