import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const email = 'radhikaputera13@gmail.com';
  
  const before = await supabase.rpc('get_user_info', { p_email: email });
  console.log("Before hash:", before.data?.public_hash);

  const plainPassword = 'testingpassword123';
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(plainPassword, salt);
  const hash2a = hash.replace(/^\$2b\$/, '$2a$');

  console.log("Updating...");
  const resUpdate = await supabase
    .from('akun_pengguna')
    .update({ password: hash2a })
    .eq('username', email)
    .select();
  
  console.log("Update returned data:", resUpdate.data);
  console.log("Update returned error:", resUpdate.error);

  const after = await supabase.rpc('get_user_info', { p_email: email });
  console.log("After hash:", after.data?.public_hash);
}

run();
