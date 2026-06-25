import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_URL'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_KEY'
// I will just use grep_search to find the credentials in .env.local
