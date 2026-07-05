async function run() {
  console.log("Calling check_admins_metadata RPC...");
  
  const headers = {
    'apikey': 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV',
    'Authorization': 'Bearer sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
  };

  const url = 'https://ngdepacckohoxemlauhd.supabase.co/rest/v1/rpc/check_admins_metadata';
  const response = await fetch(url, {
    method: 'POST',
    headers
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
