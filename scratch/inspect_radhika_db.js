import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = 'radhikaputera13@gmail.com';
  const plainPassword = 'Radhika123!';

  console.log("1. Calling fn_login RPC...");
  const { data: loginRes, error: loginErr } = await supabase.rpc('fn_login', {
    p_username: email,
    p_password: plainPassword,
    p_role: 'murid'
  });

  if (loginErr) {
    console.error("fn_login RPC error:", loginErr);
    return;
  }
  console.log("fn_login RPC Response:", JSON.stringify(loginRes, null, 2));

  // Now, authenticate the Supabase client as Radhika
  console.log(`2. Logging in via Supabase Auth as ${email}...`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: email,
    password: plainPassword
  });

  if (authErr) {
    console.error("Supabase Auth error:", authErr);
    return;
  }
  console.log("Auth success!");

  // Query enrollments
  console.log("3. Fetching enrollments for Radhika...");
  const { data: enrollments, error: enrollErr } = await supabase
    .from('enrollment')
    .select('*')
    .eq('nisn', loginRes.siswa?.nisn);
  
  if (enrollErr) {
    console.error("Enrollment fetch error:", enrollErr);
  } else {
    console.log("Enrollments:", JSON.stringify(enrollments, null, 2));
  }

  // Query berkas_pengumuman as Radhika
  console.log("4. Fetching berkas_pengumuman for Radhika...");
  const allStudentKodes = [
    loginRes.kode,
    loginRes.siswa?.nisn,
    ...(enrollments?.map(e => e.kode) || [])
  ].filter(Boolean);

  console.log("allStudentKodes:", allStudentKodes);

  const { data: berkas, error: berkasErr } = await supabase
    .from('berkas_pengumuman')
    .select('*')
    .in('kode_siswa', allStudentKodes);

  if (berkasErr) {
    console.error("Error fetching berkas:", berkasErr);
  } else {
    console.log("Berkas Pengumuman for Radhika:", JSON.stringify(berkas, null, 2));
  }
}

run();
