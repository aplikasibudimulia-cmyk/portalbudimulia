import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((a, l) => {
  const [k,...v] = l.split('=');
  if(k && v) a[k.trim()] = v.join('=').trim();
  return a;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: p } = await supabase.from('siswa_permanent').select('nisn, nama_lengkap');
  const weird = p.filter(x => x.nisn.length > 10 || x.nisn.includes('\'') || x.nisn.includes('\"'));
  console.log('Total weird NISNs:', weird.length);
  console.log(weird);
}
run();
