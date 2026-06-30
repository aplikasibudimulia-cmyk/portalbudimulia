import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testDelete() {
  console.log("Fetching Gladys...");
  const { data: users, error: err1 } = await supabase.from('siswa_permanent').select('*').ilike('nama_lengkap', '%Gladys%');
  if (err1) { console.log("Err1:", err1); return; }
  console.log("Found students:", users.map(u => u.nisn));

  for (let u of users) {
     console.log("Trying to delete NISN:", u.nisn);
     
     // fetch akun
     const {data: akunData} = await supabase.from('akun_pengguna').select('*').eq('foreign_id', u.nisn);
     if (akunData && akunData.length > 0) {
        console.log("Has akun:", akunData[0].id);
        const { error: errAkun } = await supabase.from('akun_pengguna').delete().eq('id', akunData[0].id);
        if (errAkun) console.log("Err deleting akun:", errAkun);
        else console.log("Akun deleted successfully");
     }

     const { error: errSiswa } = await supabase.from('siswa_permanent').delete().eq('nisn', u.nisn);
     if (errSiswa) console.log("Err deleting siswa:", errSiswa);
     else console.log("Siswa deleted successfully");
  }
}

testDelete();
