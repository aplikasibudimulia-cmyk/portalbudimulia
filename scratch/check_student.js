async function run() {
  console.log("Searching for student Jason or Guntur...");
  
  const headers = {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
  };

  // Search in siswa_permanent
  const urlStudent = 'https://ngdepacckohoxemlauhd.supabase.co/rest/v1/siswa_permanent?or=(nama_lengkap.ilike.*Jason*,nama_lengkap.ilike.*Guntur*)&select=*';
  const resStudent = await fetch(urlStudent, { headers });
  const students = await resStudent.json();
  
  console.log("Students found:", JSON.stringify(students, null, 2));
}

run().catch(console.error);
