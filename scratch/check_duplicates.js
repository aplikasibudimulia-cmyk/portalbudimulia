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
  console.log("Logged in successfully!");

  const authSupabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  await authSupabase.auth.setSession(authData.session);

  console.log("Fetching all berkas_pengumuman...");
  const { data: berkas, error: berkasErr } = await authSupabase
    .from('berkas_pengumuman')
    .select('*');

  if (berkasErr) {
    console.error("Failed to fetch berkas:", berkasErr);
    return;
  }
  console.log(`Total berkas records: ${berkas.length}`);

  console.log("Fetching all enrollments...");
  const { data: enrollments, error: enrollErr } = await authSupabase
    .from('enrollment')
    .select('kode, nisn');

  if (enrollErr) {
    console.error("Failed to fetch enrollments:", enrollErr);
    return;
  }
  console.log(`Total enrollment records: ${enrollments.length}`);

  // Fetch all students (to get names)
  console.log("Fetching all students...");
  const { data: students, error: studentsErr } = await authSupabase
    .from('siswa_permanent')
    .select('nisn, nama_lengkap');
    
  if (studentsErr) {
    console.error("Failed to fetch students:", studentsErr);
    return;
  }

  // Create mappings
  const kodeToNisn = {};
  enrollments.forEach(e => {
    kodeToNisn[e.kode] = e.nisn;
  });

  const nisnToName = {};
  students.forEach(s => {
    nisnToName[s.nisn] = s.nama_lengkap;
  });

  // Group berkas by (nisn, kode_jenis)
  const grouped = {};
  berkas.forEach(b => {
    const nisn = kodeToNisn[b.kode_siswa] || b.kode_siswa; // Resolve to NISN
    const key = `${nisn}_${b.kode_jenis}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(b);
  });

  // Find duplicates
  console.log("\n=== DUPLICATE ANALYSIS ===");
  let duplicateCount = 0;
  for (const [key, records] of Object.entries(grouped)) {
    if (records.length > 1) {
      const parts = key.split('_');
      const nisn = parts[0];
      const kode_jenis = parts[1];
      const name = nisnToName[nisn] || "Unknown Student";
      
      console.log(`\nStudent: ${name} (NISN: ${nisn}) - Document Type: ${kode_jenis}`);
      console.log(`Found ${records.length} records:`);
      records.forEach(r => {
        console.log(`  - ID: ${r.id}, kode_siswa: "${r.kode_siswa}", file_name: "${r.file_name}", file_url: "${r.file_url}", reqs: ${JSON.stringify(r.persyaratan_terpenuhi)}`);
      });
      duplicateCount++;
    }
  }

  if (duplicateCount === 0) {
    console.log("No other duplicate records found in berkas_pengumuman!");
  } else {
    console.log(`\nFound ${duplicateCount} students with duplicate records.`);
  }

  await authSupabase.auth.signOut();
}

run();
