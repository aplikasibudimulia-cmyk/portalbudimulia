const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co';
const ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log("Root keys:", Object.keys(data));
  if (data.paths) {
    console.log("Number of paths:", Object.keys(data.paths).length);
    console.log("Sample paths:", Object.keys(data.paths).slice(0, 10));
  } else {
    console.log("No paths. Full data:", data);
  }
}

run();