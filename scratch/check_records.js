import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function check() {
  const { data, error } = await supabase
    .from('presensi_harian')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (error) {
    console.error("Error:", error)
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}

check()
