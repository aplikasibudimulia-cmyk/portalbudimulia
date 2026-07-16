const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co'
const supabaseKey = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  // Login first
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'temp_diagnostic_admin@ebudimulia.local',
    password: 'TempDiagnostic123!'
  })
  
  if (authError) {
    console.error('Login failed:', authError.message)
    return
  }
  
  console.log('Login successful! Token:', authData.session?.access_token ? 'Exists' : 'None')
  
  // Select categories
  const { data: cats, error: errCats } = await supabase.from('program_sekolah_kategori').select('*')
  console.log('Categories in DB for Admin:', cats, errCats)
  
  // Select locations
  const { data: locs, error: errLocs } = await supabase.from('program_sekolah_lokasi').select('*')
  console.log('Locations in DB for Admin:', locs, errLocs)
}
test()
