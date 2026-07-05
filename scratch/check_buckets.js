import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function check() {
  const { data, error } = await supabase.storage.getBuckets()
  if (error) {
    console.error("Error:", error)
  } else {
    console.log("Buckets:", data.map(b => b.name))
  }
}

check()
