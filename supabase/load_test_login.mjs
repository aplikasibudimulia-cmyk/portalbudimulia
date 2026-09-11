/**
 * ============================================
 * LOAD TEST: Simulasi Login Siswa Bersamaan
 * ============================================
 * Script ini mensimulasikan banyak siswa memanggil fn_login secara bersamaan
 * untuk menguji apakah database bisa handle traffic jam sibuk pagi.
 *
 * Cara pakai: node supabase/load_test_login.mjs
 */

const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV'

// Jumlah simulasi login bersamaan
const CONCURRENT_LOGINS = 500
// Username & password test (pakai akun yang ada, password salah tidak masalah — kita ukur kecepatan query, bukan keberhasilan login)
const TEST_USERNAME = 'test_loadtest_user'
const TEST_PASSWORD = 'password_salah_tidak_masalah'
const TEST_ROLE = 'murid'

async function callFnLogin(index) {
  const start = performance.now()
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_username: TEST_USERNAME,
        p_password: TEST_PASSWORD,
        p_role: TEST_ROLE,
      }),
    })
    const elapsed = (performance.now() - start).toFixed(0)
    const data = await res.json()
    
    if (res.status === 200) {
      const msg = data?.msg || data?.ok ? 'OK' : 'Login gagal (expected)'
      return { index, status: 'success', elapsed: `${elapsed}ms`, msg, httpStatus: res.status }
    } else {
      const code = data?.code || res.status
      const msg = data?.message || data?.msg || 'Unknown error'
      return { index, status: code === 'PGRST003' || code === '57014' ? '⚠️ TIMEOUT' : 'error', elapsed: `${elapsed}ms`, code, msg, httpStatus: res.status }
    }
  } catch (err) {
    const elapsed = (performance.now() - start).toFixed(0)
    return { index, status: '❌ NETWORK_ERROR', elapsed: `${elapsed}ms`, msg: err.message }
  }
}

async function runLoadTest() {
  console.log('═══════════════════════════════════════════════════')
  console.log(`🔥 LOAD TEST: ${CONCURRENT_LOGINS} login bersamaan`)
  console.log('═══════════════════════════════════════════════════')
  console.log(`Target: ${SUPABASE_URL}`)
  console.log(`Waktu mulai: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`)
  console.log('')

  const totalStart = performance.now()

  // Fire semua request bersamaan
  const promises = Array.from({ length: CONCURRENT_LOGINS }, (_, i) => callFnLogin(i + 1))
  const results = await Promise.all(promises)

  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(2)

  // Tampilkan hasil
  console.log('─── HASIL PER REQUEST ───')
  results.forEach(r => {
    const icon = r.status === 'success' ? '✅' : r.status.includes('TIMEOUT') ? '⏰' : '❌'
    console.log(`  ${icon} #${String(r.index).padStart(2, '0')} │ ${r.elapsed.padStart(7)} │ ${r.msg || r.status}`)
  })

  // Statistik
  const times = results.map(r => parseInt(r.elapsed))
  const successCount = results.filter(r => r.status === 'success').length
  const timeoutCount = results.filter(r => String(r.status).includes('TIMEOUT')).length
  const errorCount = results.filter(r => r.status !== 'success' && !String(r.status).includes('TIMEOUT')).length

  console.log('')
  console.log('═══════════════════════════════════════════════════')
  console.log(`📊 RINGKASAN LOAD TEST`)
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Total request    : ${CONCURRENT_LOGINS}`)
  console.log(`  ✅ Berhasil       : ${successCount}`)
  console.log(`  ⏰ Timeout (pool) : ${timeoutCount}`)
  console.log(`  ❌ Error lain     : ${errorCount}`)
  console.log(`  ─────────────────────────────`)
  console.log(`  ⏱  Waktu total    : ${totalElapsed} detik`)
  console.log(`  ⚡ Tercepat       : ${Math.min(...times)}ms`)
  console.log(`  🐢 Terlambat      : ${Math.max(...times)}ms`)
  console.log(`  📈 Rata-rata      : ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`)
  console.log('')

  if (timeoutCount > 0) {
    console.log(`  ⚠️  WARNING: ${timeoutCount} request kena timeout!`)
    console.log(`  → Pertimbangkan naikkan pool size di Supabase Dashboard`)
  } else {
    console.log(`  🎉 LULUS! Semua ${CONCURRENT_LOGINS} request selesai tanpa timeout.`)
    console.log(`  → Jam sibuk pagi besok seharusnya aman!`)
  }
  console.log('')
}

runLoadTest()
