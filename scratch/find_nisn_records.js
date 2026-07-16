import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'deri.ebm12@gmail.com';
  const password = '123';

  console.log("Logging in...");
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

  const { data: berkas } = await authSupabase
    .from('berkas_pengumuman')
    .select('*');

  console.log("\n=== ANALYZING KODE_SISWA FORMATS ===");
  const nisnRecords = [];
  const kodeRecords = [];
  
  berkas.forEach(b => {
    // A NISN is typically a 10-digit number.
    const isNisn = /^\d{10}$/.test(b.kode_siswa);
    if (isNisn) {
      nisnRecords.push(b);
    } else {
      kodeRecords.push(b);
    }
  });

  console.log(`Total records under enrollment code: ${kodeRecords.length}`);
  console.log(`Total records under NISN: ${nisnRecords.length}`);

  if (nisnRecords.length > 0) {
    console.log("\nRecords stored under NISN directly:");
    // Fetch students names for these NISNs
    const { data: students } = await authSupabase
      .from('siswa_permanent')
      .select('nisn, nama_lengkap');
      
    const nisnToName = {};
    students?.forEach(s => {
      nisnToName[s.nisn] = s.nama_lengkap;
    });

    nisnRecords.forEach(r => {
      const name = nisnToName[r.kode_siswa] || "Unknown";
      console.log(`- Student: ${name} (NISN: ${r.kode_siswa})`);
      console.log(`  File: "${r.file_name}", URL: "${r.file_url}", Reqs: ${JSON.stringify(r.persyaratan_terpenuhi)}`);
    });
  }

  await authSupabase.auth.signOut();
}

run();
