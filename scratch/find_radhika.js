import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Calling temp_debug_system to find Radhika...");
  const { data, error } = await supabase.rpc('temp_debug_system');
  if (error) {
    console.error("Error calling temp_debug_system:", error);
    return;
  }
  
  const akunList = data.akun_pengguna || [];
  const authUsers = data.auth_users || [];
  
  console.log("Searching in akun_pengguna...");
  const matchingAkun = akunList.filter(a => 
    (a.username && a.username.toLowerCase().includes('radhika')) ||
    (a.username && a.username.toLowerCase().includes('putra'))
  );
  console.log("Matching accounts in akun_pengguna:", matchingAkun);

  console.log("Searching in auth_users...");
  const matchingAuth = authUsers.filter(u => 
    (u.email && u.email.toLowerCase().includes('radhika')) ||
    (u.email && u.email.toLowerCase().includes('putra'))
  );
  console.log("Matching accounts in auth_users:", matchingAuth);

  // Let's also search in the guru table if it's there
  const guruList = data.gurus || [];
  const matchingGuru = guruList.filter(g => 
    (g.nama_guru && g.nama_guru.toLowerCase().includes('radhika')) ||
    (g.nama_guru && g.nama_guru.toLowerCase().includes('putra'))
  );
  console.log("Matching gurus:", matchingGuru);
}

run();
