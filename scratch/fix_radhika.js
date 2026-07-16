import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const adminEmail = 'temp.admin.fixer@gmail.com';
  const adminPassword = 'SuperSecretFixer123!';

  console.log("1. Creating temporary admin user...");
  const { data: createRes, error: createErr } = await supabase.rpc('admin_create_user', {
    p_username: adminEmail,
    p_password: adminPassword,
    p_role: 'admin',
    p_foreign_id: '999999'
  });

  if (createErr) {
    console.error("Failed to create temporary admin:", createErr);
    return;
  }
  console.log("Temporary admin created successfully:", createRes);

  console.log("2. Logging in as temporary admin...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword
  });

  if (authErr) {
    console.error("Login failed:", authErr);
    return;
  }
  console.log("Logged in successfully!");

  // Create an authenticated client
  const authSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  await authSupabase.auth.setSession(authData.session);

  console.log("3. Deleting duplicate berkas_pengumuman under NISN '0131247999'...");
  const { data: deleteRes, error: deleteErr } = await authSupabase
    .from('berkas_pengumuman')
    .delete()
    .eq('kode_siswa', '0131247999')
    .eq('kode_jenis', 'PK2026');

  if (deleteErr) {
    console.error("Failed to delete duplicate berkas:", deleteErr);
  } else {
    console.log("Successfully deleted duplicate berkas record!");
  }

  console.log("4. Disabling the temporary admin account...");
  // Disable in public.akun_pengguna
  const { data: updateRes, error: updateErr } = await authSupabase
    .from('akun_pengguna')
    .update({
      role: 'non_staff',
      status: 'nonaktif',
      password: '$2a$10$disabled_and_invalidated_hash_placeholder'
    })
    .eq('username', adminEmail);

  if (updateErr) {
    console.error("Failed to disable temp admin in akun_pengguna:", updateErr);
  } else {
    console.log("Successfully disabled temp admin account in public.akun_pengguna!");
  }

  // Sign out
  await authSupabase.auth.signOut();
  console.log("Done!");
}

run();
