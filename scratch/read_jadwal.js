// Query triggers in database using execute_sql RPC
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts[0]) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const headers = {
  'apikey': env.VITE_SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json'
};

const sql = `
  SELECT 
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_statement AS action,
    action_timing AS timing
  FROM information_schema.triggers
  ORDER BY table_name, trigger_name;
`;

const url = `${env.VITE_SUPABASE_URL}/rest/v1/rpc/execute_sql`;
const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({ sql_query: sql })
});

if (!response.ok) {
  console.error("HTTP error:", response.status, response.statusText);
  const errText = await response.text();
  console.error("Error body:", errText);
} else {
  const result = await response.json();
  console.log("=== DB TRIGGERS ===");
  console.log(JSON.stringify(result, null, 2));
}
