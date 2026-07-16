import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
  const query = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'siswa_permanent'
  `;
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: query });
  if (error) {
    console.error("Error executing query:", error);
  } else {
    console.log("Columns of siswa_permanent:", data);
  }

  const queryView = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'siswa_lengkap'
  `;
  const { data: dataView, error: errorView } = await supabase.rpc('execute_sql', { sql_query: queryView });
  if (errorView) {
    console.error("Error executing queryView:", errorView);
  } else {
    console.log("Columns of siswa_lengkap:", dataView);
  }
}

checkSchema();
