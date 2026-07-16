import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const email = 'radhikaputera13@gmail.com';
  const plainPassword = 'Radhika123!';

  const { data: authData } = await supabase.auth.signInWithPassword({
    email: email,
    password: plainPassword
  });

  const authSupabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  await authSupabase.auth.setSession(authData.session);

  const { data: gurus, error } = await authSupabase
    .from('guru')
    .select('id, nama_guru, user_name, kode_akses');

  if (error) {
    console.error(error);
  } else {
    console.log("All Gurus:");
    console.log(gurus);
  }
}

run();
