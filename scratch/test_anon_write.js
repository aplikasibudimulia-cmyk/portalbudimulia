const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co';
const ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

async function run() {
  console.log('--- TESTING ANON WRITE TO tahun_ajaran ---')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tahun_ajaran`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      nama: '2099/2100',
      is_aktif: false
    })
  });
  
  const data = await res.json();
  console.log('Response Status:', res.status);
  console.log('Response Body:', data);
}

run()
