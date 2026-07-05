const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key is missing from .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // Let's query postgrest info or do an RPC or just try a direct select on student_points
  const { data, error } = await supabase
    .from('student_points')
    .select('*, siswa_permanent(nama_lengkap)')
    .limit(1);
  
  if (error) {
    console.error("Query error:", error);
  } else {
    console.log("Query success! Data:", data);
  }
}

checkSchema();
