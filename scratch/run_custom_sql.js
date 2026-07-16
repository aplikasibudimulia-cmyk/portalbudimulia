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

const supabase = createClient(supabaseUrl, supabaseKey)

async function querySql() {
  const query = `
    SELECT 
      (SELECT count(*) FROM public.siswa_permanent) as total_siswa_permanent,
      (SELECT count(*) FROM public.enrollment WHERE tahun_ajaran_id = (SELECT id FROM public.tahun_ajaran WHERE is_aktif = true)) as total_enrollment_aktif,
      (SELECT json_object_agg(kelas, count) FROM (
        SELECT kelas, count(*) FROM public.enrollment 
        WHERE tahun_ajaran_id = (SELECT id FROM public.tahun_ajaran WHERE is_aktif = true)
        GROUP BY kelas
      ) t) as enrollment_per_kelas,
      (SELECT json_object_agg(kelas, count) FROM (
        SELECT kelas, count(*) FROM public.siswa_lengkap 
        WHERE tahun_ajaran_id = (SELECT id FROM public.tahun_ajaran WHERE is_aktif = true)
        GROUP BY kelas
      ) t) as siswa_lengkap_per_kelas;
  `
  
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: query })
  if (error) {
    console.error("Error executing SQL:", error)
  } else {
    console.log("Database Diagnostics Results:")
    console.log(JSON.stringify(data, null, 2))
  }
}

querySql()
