async function run() {
  console.log("Querying Supabase database using execute_sql RPC...");
  
  const headers = {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Content-Type': 'application/json'
  };

  const sql = `
    SELECT * FROM siswa_permanent 
    WHERE nama_lengkap ILIKE '%Jason Leonard Guntur%'
  `;

  const url = 'https://ngdepacckohoxemlauhd.supabase.co/rest/v1/rpc/execute_sql';
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql_query: sql })
  });

  if (!response.ok) {
    console.error("HTTP error:", response.status, response.statusText);
    const errText = await response.text();
    console.error("Error body:", errText);
    return;
  }

  const result = await response.json();
  console.log("SQL Result:", JSON.stringify(result, null, 2));
}

run().catch(console.error);
