import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'deri.ebm12@gmail.com';
  const password = '123';

  console.log("Logging in as Guru...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authErr) {
    console.error("Login failed:", authErr);
    return;
  }

  const authSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  await authSupabase.auth.setSession(authData.session);

  console.log("Fetching all berkas_pengumuman...");
  const { data: berkas } = await authSupabase
    .from('berkas_pengumuman')
    .select('*');

  // Identify NISN records (10-digit number)
  const nisnRecords = berkas.filter(b => /^\d{10}$/.test(b.kode_siswa));
  console.log(`Found ${nisnRecords.length} records stored under NISN.`);

  if (nisnRecords.length === 0) {
    console.log("No records to migrate.");
    await authSupabase.auth.signOut();
    return;
  }

  const activeTaId = '4e1ae0ff-a398-488c-a940-14dc69f337d9'; // 2026/2027

  for (const record of nisnRecords) {
    const nisn = record.kode_siswa;
    console.log(`\nProcessing migration for NISN: ${nisn} (Record ID: ${record.id})`);
    
    // Fetch enrollment for active year
    const { data: enrollments, error: enrollErr } = await authSupabase
      .from('enrollment')
      .select('kode')
      .eq('nisn', nisn)
      .eq('tahun_ajaran_id', activeTaId)
      .maybeSingle();

    if (enrollErr || !enrollments) {
      console.error(`  - Failed to fetch active enrollment for NISN ${nisn}:`, enrollErr);
      continue;
    }

    const activeKode = enrollments.kode;
    console.log(`  - Active enrollment code found: "${activeKode}"`);

    // Perform migration: delete the old record and insert the new one under activeKode
    // Why delete & insert instead of update? 
    // Sometimes updating the primary key / unique constraint in Supabase via PostgREST is restricted.
    // Let's try to update first, and if it fails, delete & insert.
    console.log(`  - Attempting to update kode_siswa from "${nisn}" to "${activeKode}"...`);
    const { data: updateRes, error: updateErr } = await authSupabase
      .from('berkas_pengumuman')
      .update({ kode_siswa: activeKode })
      .eq('id', record.id);

    if (updateErr) {
      console.log(`  - Direct update failed: ${updateErr.message}. Attempting delete & insert fallback...`);
      
      // Delete old record
      const { error: delErr } = await authSupabase
        .from('berkas_pengumuman')
        .delete()
        .eq('id', record.id);

      if (delErr) {
        console.error(`  - Failed to delete old record:`, delErr);
        continue;
      }

      // Insert new record
      const { error: insErr } = await authSupabase
        .from('berkas_pengumuman')
        .insert({
          kode_siswa: activeKode,
          kode_jenis: record.kode_jenis,
          file_name: record.file_name,
          file_url: record.file_url,
          persyaratan_terpenuhi: record.persyaratan_terpenuhi,
          is_accessible: record.is_accessible
        });

      if (insErr) {
        console.error(`  - Failed to insert migrated record:`, insErr);
      } else {
        console.log(`  - Fallback migration successful!`);
      }
    } else {
      console.log(`  - Direct update migration successful!`);
    }
  }

  await authSupabase.auth.signOut();
  console.log("\nMigration process completed!");
}

run();
