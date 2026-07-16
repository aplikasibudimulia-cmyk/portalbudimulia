import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const anselEmail = 'ansel.ebm9@gmail.com';
  const anselId = '111b8b70-33fe-4e26-9d41-ef03467e0e78';
  const tempPassword = 'AnselTempPass123!';
  const originalKodeAkses = 'TR6782';

  console.log("1. Setting temporary password for Ansel...");
  const { data: resetRes1, error: resetErr1 } = await supabase.rpc('admin_reset_password', {
    p_akun_id: anselId,
    p_new_password: tempPassword
  });

  if (resetErr1 || !resetRes1?.ok) {
    console.error("Failed to set temporary password:", resetErr1 || resetRes1);
    return;
  }
  console.log("Temporary password set successfully.");

  try {
    console.log("2. Logging in as Ansel...");
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: anselEmail,
      password: tempPassword
    });

    if (authErr) {
      console.error("Ansel login failed:", authErr);
      return;
    }
    console.log("Logged in as Ansel successfully!");

    // Create authenticated client
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

    // Sign out
    await authSupabase.auth.signOut();
  } finally {
    console.log("4. Restoring Ansel's original password...");
    const { data: resetRes2, error: resetErr2 } = await supabase.rpc('admin_reset_password', {
      p_akun_id: anselId,
      p_new_password: originalKodeAkses
    });

    if (resetErr2 || !resetRes2?.ok) {
      console.error("Failed to restore original password:", resetErr2 || resetRes2);
    } else {
      console.log("Original password restored successfully.");
    }
  }
}

run();
