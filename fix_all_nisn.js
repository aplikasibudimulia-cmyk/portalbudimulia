import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((a, l) => {
  const [k,...v] = l.split('=');
  if(k && v) a[k.trim()] = v.join('=').trim();
  return a;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function normalizeNisn(val) {
  let str = (val || '').toString().trim();
  if (str.startsWith("'")) str = str.substring(1);
  if (str.startsWith('="') && str.endsWith('"')) str = str.substring(2, str.length - 1);
  str = str.trim();
  if (str.length > 10) return str.slice(-10);
  if (str.length > 0 && str.length < 10) return str.padStart(10, '0');
  return str;
}

async function run() {
  const { data: allSiswa } = await supabase.from('siswa_permanent').select('*');
  
  const toFix = allSiswa.filter(s => normalizeNisn(s.nisn) !== s.nisn);
  console.log('Found', toFix.length, 'records needing normalization.');

  let mergedCount = 0;
  let renamedCount = 0;

  for (const r of toFix) {
    const oldNisn = r.nisn;
    const newNisn = normalizeNisn(oldNisn);
    
    if (!newNisn) continue;

    // Check if the normalized NISN already exists
    const { data: existing } = await supabase.from('siswa_permanent').select('*').eq('nisn', newNisn).single();
    
    if (!existing) {
      // Doesn't exist, we must "rename" it (by creating new, moving FKs, deleting old)
      const newRecord = { ...r, nisn: newNisn };
      delete newRecord.created_at; 
      await supabase.from('siswa_permanent').insert(newRecord);
      
      await supabase.from('enrollment').update({ nisn: newNisn }).eq('nisn', oldNisn);
      await supabase.from('foto').update({ nisn: newNisn }).eq('nisn', oldNisn);
      await supabase.from('berkas_pengumuman').update({ nisn: newNisn }).eq('nisn', oldNisn);
      
      await supabase.from('siswa_permanent').delete().eq('nisn', oldNisn);
      renamedCount++;
    } else {
      // Exists, we must merge!
      if (!existing.kode_akses && r.kode_akses) {
        await supabase.from('siswa_permanent').update({ kode_akses: r.kode_akses }).eq('nisn', newNisn);
      }
      
      await supabase.from('enrollment').update({ nisn: newNisn }).eq('nisn', oldNisn);
      await supabase.from('foto').update({ nisn: newNisn }).eq('nisn', oldNisn);
      await supabase.from('berkas_pengumuman').update({ nisn: newNisn }).eq('nisn', oldNisn);
      
      await supabase.from('siswa_permanent').delete().eq('nisn', oldNisn);
      mergedCount++;
    }
  }
  
  console.log(`Successfully merged ${mergedCount} records, renamed ${renamedCount} records.`);
}

run().catch(console.error);
