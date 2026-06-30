import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function checkDb() {
  console.log("Checking DB...");
  const { data, error } = await supabase.rpc('update_siswa_nisn', { old_nisn: 'doesnotexist', new_nisn: 'doesnotexist2' });
  if (error) {
     console.log("update_siswa_nisn error:", error);
  } else {
     console.log("update_siswa_nisn OK");
  }
}

checkDb();
