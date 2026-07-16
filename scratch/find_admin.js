import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('temp_debug_system');
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  const authUsers = data.auth_users || [];
  console.log("Total auth users:", authUsers.length);
  
  // Find users whose metadata has admin/guru role
  const staff = authUsers.filter(u => {
    const meta = u.raw_app_meta_data || {};
    const userMeta = u.raw_user_meta_data || {};
    const role = meta.role || userMeta.role;
    return ['admin', 'guru', 'staff', 'piket'].includes(role) || (u.email && u.email.includes('admin'));
  });
  
  console.log("Staff in auth.users:", staff.map(u => ({
    id: u.id,
    email: u.email,
    role: u.raw_app_meta_data?.role || u.raw_user_meta_data?.role
  })));
}

run();
