const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co';
const ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/akun_pengguna?limit=1`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log('Status Code:', res.status);
  console.log('Response Body:', data);
}

run()
