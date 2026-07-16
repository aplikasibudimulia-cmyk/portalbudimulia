import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkStudent() {
  console.log("Checking tables using execute_sql...");
  
  // 1. Search for Radhika
  const querySiswa = `SELECT * FROM public.siswa_permanent WHERE nama_lengkap ILIKE '%Radhika%' OR nama_lengkap ILIKE '%Putra%'`;
  const { data: siswaData, error: errSiswa } = await supabase.rpc('execute_sql', { sql_query: querySiswa });
  
  if (errSiswa) {
    console.error("Error executing querySiswa:", errSiswa);
  } else {
    console.log("Siswa permanent matching 'Radhika' or 'Putra':", siswaData);
  }

  // 2. Search for Radhika in enrollment
  const queryEnroll = `
    SELECT e.*, s.nama_lengkap 
    FROM public.enrollment e
    JOIN public.siswa_permanent s ON e.nisn = s.nisn
    WHERE s.nama_lengkap ILIKE '%Radhika%' OR s.nama_lengkap ILIKE '%Putra%'
  `;
  const { data: enrollData, error: errEnroll } = await supabase.rpc('execute_sql', { sql_query: queryEnroll });
  if (errEnroll) {
    console.error("Error executing queryEnroll:", errEnroll);
  } else {
    console.log("Enrollment matches:", enrollData);
  }

  // 3. Search for Radhika's berkas_pengumuman
  const queryBerkas = `
    SELECT b.*, s.nama_lengkap
    FROM public.berkas_pengumuman b
    JOIN public.siswa_permanent s ON b.kode_siswa = s.nisn OR b.kode_siswa = (
      SELECT e.kode FROM public.enrollment e WHERE e.nisn = s.nisn LIMIT 1
    )
    WHERE s.nama_lengkap ILIKE '%Radhika%' OR s.nama_lengkap ILIKE '%Putra%'
  `;
  const { data: berkasData, error: errBerkas } = await supabase.rpc('execute_sql', { sql_query: queryBerkas });
  if (errBerkas) {
    console.error("Error executing queryBerkas:", errBerkas);
  } else {
    console.log("Berkas Pengumuman matches:", berkasData);
  }

  // 4. Let's see some generic student records
  const querySample = `SELECT * FROM public.siswa_permanent LIMIT 5`;
  const { data: sampleData, error: errSample } = await supabase.rpc('execute_sql', { sql_query: querySample });
  console.log("Sample 5 students:", sampleData);
}

checkStudent();
