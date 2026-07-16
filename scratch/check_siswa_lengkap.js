import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Calling temp_debug_system to see siswa_lengkap/guru columns...");
  
  // Since we don't have direct access, let's query public.siswa_lengkap using get_user_info or fn_login?
  // Wait! We can call fn_login for Radhika Putera. The response has:
  // "kode": "8B352026_2027", "kelas": "8B"
  // Let's sign in as Radhika Putera and query siswa_lengkap for him!
  // RLS on siswa_lengkap might allow read.
  const email = 'radhikaputera13@gmail.com';
  const plainPassword = 'Radhika123!';
  
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: email,
    password: plainPassword
  });
  
  const { data: siswaLengkap, error } = await supabase
    .from('siswa_lengkap')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error("Error querying siswa_lengkap:", error);
  } else {
    console.log("siswa_lengkap sample row:", siswaLengkap);
  }
}

run();
