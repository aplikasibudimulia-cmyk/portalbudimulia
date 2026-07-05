const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MDMsImV4cCI6MjA5NTI4MzYwM30.mF_IUtRel7YjUHEq3oKKFOczDkGDa1ZTgyBVp8sKsmc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('jenis_pengumuman').select('*').limit(1);
  if (error) {
    console.error('Error fetching jenis_pengumuman:', error);
  } else {
    console.log('Record:', data[0]);
  }
}

check();
