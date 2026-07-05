// ============================================================
// 🔒 SECURITY TEST — Paste di Chrome Console (F12 → Console)
// Buka dulu: https://edu.smpbudimuliajakarta.sch.id
// ============================================================

const SUPABASE_URL = 'https://ngdepacckohoxemlauhd.supabase.co';
const ANON_KEY = 'sb_publishable_HShpzptZQ6jymnZO-zrgrQ_4PPx_DYV';

// Tabel sensitif → harus BLOKIR total (return [] atau error)
const HARUS_BLOKIR = [
  'siswa_permanent',
  'siswa_backup',
  'akun_pengguna',
  'presensi_harian',
  'nilai_siswa',
  'student_points',
  'point_records',
  'guidance_logs',
  'impersonate_tokens',
  'qr_tokens',
  'notifikasi',
  'enrollment',
  'guru',
];

// Tabel publik → boleh dibaca (return data)
const BOLEH_DIBACA = [
  'tahun_ajaran',
  'semester',
  'berita_sekolah',
  'pengaturan_sekolah',
];

async function testTabel(nama, harusBlokir) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${nama}?limit=1`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    
    if (res.status === 401 || res.status === 403) {
      if (harusBlokir) {
        console.log(`%c✅ AMAN   | ${nama} → diblokir (status ${res.status})`, 'color: green; font-weight: bold');
        return { tabel: nama, status: 'AMAN', bocor: false };
      } else {
        console.log(`%c❌ ERROR  | ${nama} → diblokir padahal harusnya publik (status ${res.status})`, 'color: red; font-weight: bold');
        return { tabel: nama, status: 'BLOCKED_BUT_PUBLIC', bocor: false };
      }
    }

    const data = await res.json();
    
    if (data.code && data.message) {
      // Postgres error is equivalent to blocked
      if (harusBlokir) {
        console.log(`%c✅ AMAN   | ${nama} → diblokir (${data.message})`, 'color: green; font-weight: bold');
        return { tabel: nama, status: 'AMAN', bocor: false };
      } else {
        console.log(`%c❌ ERROR  | ${nama} → error padahal harusnya publik (${data.message})`, 'color: red; font-weight: bold');
        return { tabel: nama, status: 'ERROR_BUT_PUBLIC', bocor: false };
      }
    }

    const jumlah = Array.isArray(data) ? data.length : '?';

    if (harusBlokir) {
      if (jumlah === 0) {
        console.log(`%c✅ AMAN   | ${nama} → kosong (${jumlah} row)`, 'color: green; font-weight: bold');
        return { tabel: nama, status: 'AMAN', bocor: false };
      } else {
        console.log(`%c❌ BOCOR  | ${nama} → ${jumlah} row terekspos!`, 'color: red; font-weight: bold; font-size: 14px');
        return { tabel: nama, status: 'BOCOR', bocor: true, contoh: data[0] };
      }
    } else {
      console.log(`%cℹ️  PUBLIK | ${nama} → ${jumlah} row (ok)`, 'color: gray');
      return { tabel: nama, status: 'PUBLIK', bocor: false };
    }
  } catch (e) {
    console.log(`%c⚠️  ERROR  | ${nama} → ${e.message}`, 'color: orange');
    return { tabel: nama, status: 'ERROR', bocor: false };
  }
}

async function cekAkunPasswordBocor() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/akun_pengguna?limit=1`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].password) {
      console.log('%c❌ KRITIS  | akun_pengguna.password MASIH BOCOR!', 'color: red; font-weight: bold; font-size: 14px');
      return true;
    } else {
      console.log('%c✅ AMAN   | akun_pengguna.password tidak terekspos', 'color: green; font-weight: bold');
      return false;
    }
  } catch (e) {
    return false;
  }
}

// ── JALANKAN SEMUA TEST ──────────────────────────────────────
async function jalankanSemuaTest() {
  console.clear();
  console.log('%c🔒 SECURITY TEST — eBudiMulia', 'color: white; background: #1e3a5f; padding: 6px 12px; border-radius: 4px; font-size: 16px; font-weight: bold');
  console.log('%c' + '─'.repeat(55), 'color: #888');

  console.log('\n%c[TABEL SENSITIF — harus kosong untuk anon]', 'color: #555; font-style: italic');
  const hasilBlokir = [];
  for (const t of HARUS_BLOKIR) {
    hasilBlokir.push(await testTabel(t, true));
  }

  console.log('\n%c[CEK KOLOM PASSWORD]', 'color: #555; font-style: italic');
  const passwordBocor = await cekAkunPasswordBocor();

  console.log('\n%c[TABEL PUBLIK — boleh ada data]', 'color: #555; font-style: italic');
  for (const t of BOLEH_DIBACA) {
    await testTabel(t, false);
  }

  // ── RINGKASAN ──
  const bocor = hasilBlokir.filter(r => r.bocor);
  console.log('\n%c' + '─'.repeat(55), 'color: #888');
  console.log('%c📊 HASIL AKHIR', 'font-weight: bold; font-size: 14px');

  if (bocor.length === 0 && !passwordBocor) {
    console.log('%c🎉 SELAMAT! Semua tabel sensitif sudah aman.\nTidak ada data yang bocor ke publik.', 'color: green; font-weight: bold; font-size: 14px');
  } else {
    console.log(`%c⚠️  ADA ${bocor.length + (passwordBocor ? 1 : 0)} MASALAH yang perlu diperbaiki:`, 'color: red; font-weight: bold; font-size: 14px');
    bocor.forEach(r => console.log(`  ❌ ${r.tabel}`));
    if (passwordBocor) console.log('  ❌ akun_pengguna.password masih bocor');
    console.log('\n%cJalankan EMERGENCY_security_fix.sql di Supabase SQL Editor!', 'color: orange; font-weight: bold');
  }

  console.log('%c' + '─'.repeat(55), 'color: #888');
  return { bocor, passwordBocor };
}

jalankanSemuaTest();
