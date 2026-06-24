import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkLog() {
  const { data, error } = await supabase.from('activity_log').select('*').limit(5);
  if (error) {
    console.log('DB_ERROR:', error);
  } else {
    console.log('DB_DATA:', data);
  }
}
checkLog();
