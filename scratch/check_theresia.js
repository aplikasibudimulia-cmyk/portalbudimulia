import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').replace(/(^["']|["']$)/g, '');
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("=== RUNNING GET_THERESIA_DIAGNOSE ===");
  const { data, error } = await supabase.rpc('get_theresia_diagnose');
  
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("Theresia Diagnose Result:\n", JSON.stringify(data, null, 2));
  }
}

run();
