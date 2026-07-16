const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co';
const ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

async function testTable(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?limit=5`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log(`Table ${tableName} Status: ${res.status}`);
  console.log(`Response Body (${tableName}):`, JSON.stringify(data, null, 2));
}

async function run() {
  await testTable('siswa_permanent');
  await testTable('enrollment');
  await testTable('berkas_pengumuman');
  await testTable('jenis_pengumuman');
  await testTable('kumpulan_dokumen');
}

run();
