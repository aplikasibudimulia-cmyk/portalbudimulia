import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_user_info', { p_email: 'ansel.ebm9@gmail.com' });
  if (error) {
    console.error("Error calling get_user_info:", error);
  } else {
    console.log("get_user_info result:", data);
  }
}

run();
