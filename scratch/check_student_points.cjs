const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co';
const supabaseKey = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('student_points')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error("Query error:", error);
  } else {
    console.log("Success! Columns:", Object.keys(data[0] || {}));
  }
}

checkColumns();
