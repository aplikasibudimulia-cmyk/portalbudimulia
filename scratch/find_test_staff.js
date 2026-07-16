import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('temp_debug_system');
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  const akunList = data.akun_pengguna || [];
  const matches = akunList.filter(a => 
    a.username.includes('test') || 
    a.username.includes('contoh') ||
    a.username.includes('guru') ||
    a.username.includes('staff') ||
    a.username.includes('piket')
  );
  console.log("Matching accounts:", matches);
}

run();
