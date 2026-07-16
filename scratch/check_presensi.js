import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkPresensi() {
  const email = 'radhikaputera13@gmail.com';
  const plainPassword = 'Radhika123!';

  console.log("Logging in as student...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: email,
    password: plainPassword
  });

  if (authError) {
    console.error("Login failed:", authError.message);
    return;
  }

  console.log("SUCCESS! Logged in as student:", authData.user.email);

  const today = '2026-07-16';
  const { data: presensi, error: err1 } = await supabase
    .from('presensi_harian')
    .select('siswa_nisn, status, kelas, waktu, tipe, metode, tanggal')
    .eq('tanggal', today);
    
  console.log("Today's presensi records in DB:", presensi, err1);

  if (presensi && presensi.length > 0) {
    const nisns = presensi.map(p => p.siswa_nisn);
    const { data: siswa, error: err2 } = await supabase
      .from('siswa_lengkap')
      .select('nisn, nama_lengkap, kelas')
      .in('nisn', nisns);
    console.log("Students details:", siswa, err2);
  }
}

checkPresensi();
