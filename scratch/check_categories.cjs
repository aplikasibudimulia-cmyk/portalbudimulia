const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://ngdepacckohoxemlauhd.supabase.co'
const supabaseKey = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data: cats, error: errCats } = await supabase.from('program_sekolah_kategori').select('*')
  console.log('Categories in DB:', cats, errCats)
  
  const { data: locs, error: errLocs } = await supabase.from('program_sekolah_lokasi').select('*')
  console.log('Locations in DB:', locs, errLocs)
}
test()
