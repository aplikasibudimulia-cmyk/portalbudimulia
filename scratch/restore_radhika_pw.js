import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const akunId = '03ba4cc5-3616-4474-a305-187c9ec54293';
  const originalPassword = 'U2GNPV';
  
  console.log(`Restoring password to original kode_akses for ID: ${akunId}...`);
  const { data, error } = await supabase.rpc('admin_reset_password', {
    p_akun_id: akunId,
    p_new_password: originalPassword
  });

  if (error) {
    console.error("RPC error:", error);
  } else {
    console.log("Result:", data);
  }
}

run();
