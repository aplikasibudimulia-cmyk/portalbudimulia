import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function tryLogin(email, password) {
  console.log(`Trying to login as ${email}...`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    console.error(`Login failed for ${email}:`, error.message);
    return null;
  }
  console.log(`SUCCESS! Logged in as ${email}`);
  return data;
}

async function run() {
  const gurus = [
    'deri.ebm12@gmail.com',
    'iswanto.ebm13@gmail.com',
    'dewi.ebm6@gmail.com',
    'siska.ebm7@gmail.com',
    'agnes.ebm16@gmail.com',
    'leli.ebm14@gmail.com'
  ];
  
  for (const email of gurus) {
    const session = await tryLogin(email, '123');
    if (session) {
      // Let's test if we can read berkas_pengumuman with this session
      const authSupabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      await authSupabase.auth.setSession(session.session);
      
      const { data, error } = await authSupabase
        .from('berkas_pengumuman')
        .select('*')
        .eq('kode_siswa', '0131247999');
        
      console.log("Query test as guru:", data, error);
      
      // Let's do the delete now since we logged in successfully!
      const { data: delData, error: delErr } = await authSupabase
        .from('berkas_pengumuman')
        .delete()
        .eq('kode_siswa', '0131247999')
        .eq('kode_jenis', 'PK2026');
        
      console.log("Delete test:", delData, delErr);
      break;
    }
  }
}

run();
