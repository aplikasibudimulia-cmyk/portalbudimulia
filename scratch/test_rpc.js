import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Parse .env manually
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function testRpc() {
  console.log("Testing RPC...");
  
  // Try parameter named 'sql'
  const { data: d1, error: e1 } = await supabase.rpc('execute_sql', {
    sql: "SELECT 1"
  });
  console.log("Try 'sql':", d1, e1);

  // Try parameter named 'query'
  const { data: d2, error: e2 } = await supabase.rpc('execute_sql', {
    query: "SELECT 1"
  });
  console.log("Try 'query':", d2, e2);

  // Try parameter named 'sql_query'
  const { data: d3, error: e3 } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT 1"
  });
  console.log("Try 'sql_query':", d3, e3);
}

testRpc();
