const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co';
const supabaseKey = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase
    .from('student_points')
    .select('*, siswa_lengkap(nama_lengkap)')
    .limit(1);
  
  if (error) {
    console.error("Query error:", error);
  } else {
    console.log("Query success! Data:", data);
  }
}

checkSchema();
