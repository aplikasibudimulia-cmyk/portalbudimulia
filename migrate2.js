import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MTAsImV4cCI6MjA5NTI4MzYxMH0.4B7s06lQ0RkY097zD5Z-lC2P0q1vH5zXn_Qv8o7J72I'
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: 'ALTER TABLE berkas_pengumuman ADD COLUMN persyaratan_terpenuhi JSONB DEFAULT \'{}\'::jsonb;' })
  console.log("Migration:", data, error)
}
run()
