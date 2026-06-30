import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testFetch() {
  console.log("Testing fetchData queries...");
  
  let res = await supabase.from('siswa_permanent').select('*, enrollment(*)');
  console.log('siswa_permanent:', res.status, res.error ? res.error.message : 'OK');

  res = await supabase.from('akun_pengguna').select('*');
  console.log('akun_pengguna:', res.status, res.error ? res.error.message : 'OK');

  res = await supabase.from('guru').select('*, guru_role(role_id), guru_kelas(kelas, tahun_ajaran_id), guru_mapel(mata_pelajaran_id, kelas, tahun_ajaran_id)');
  console.log('guru:', res.status, res.error ? res.error.message : 'OK');

  res = await supabase.from('roles').select('*');
  console.log('roles:', res.status, res.error ? res.error.message : 'OK');

  res = await supabase.from('mata_pelajaran').select('*');
  console.log('mata_pelajaran:', res.status, res.error ? res.error.message : 'OK');
}

testFetch();
