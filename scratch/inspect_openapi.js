// Fetch OpenAPI schema of Supabase to inspect RPC functions
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const envLines = envContent.split('\n')

let supabaseUrl = ''
let supabaseKey = ''

for (const line of envLines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim()
  }
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseKey = line.split('=')[1].trim()
  }
}

async function run() {
  const url = `${supabaseUrl}/rest/v1/`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  if (!response.ok) {
    console.error("Failed to fetch OpenAPI spec:", response.status);
    return;
  }

  const spec = await response.json();
  const paths = Object.keys(spec.paths);
  const rpcs = paths.filter(p => p.startsWith('/rpc/'));
  
  console.log("=== Available RPC Functions ===");
  console.log(rpcs);
}

run().catch(console.error);
