import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webPush from "https://esm.sh/web-push@3.6.7";

serve(async (req) => {
  // Initialize Supabase Client using Auth Headers or Service Role
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Setup Web Push
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const contactEmail = Deno.env.get("VAPID_CONTACT_EMAIL") ?? "mailto:admin@ebudimulia.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }

  webPush.setVapidDetails(contactEmail, vapidPublicKey, vapidPrivateKey);

  try {
    // Get today's date in YYYY-MM-DD
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    // 0. Cek pengaturan dari database
    const { data: settings } = await supabase
      .from('pengaturan_sekolah')
      .select('setting_key, setting_value')
      .in('setting_key', ['notif_peringatan_aktif', 'jam_mulai_notif_belum_presensi', 'jam_batas_akhir_presensi']);
      
    const notifAktif = settings?.find(s => s.setting_key === 'notif_peringatan_aktif')?.setting_value;
    if (notifAktif === 'false') {
      return new Response(JSON.stringify({ message: "Notifikasi dimatikan oleh admin." }), { headers: { "Content-Type": "application/json" } });
    }

    const jamMulai = settings?.find(s => s.setting_key === 'jam_mulai_notif_belum_presensi')?.setting_value || '06:40';
    const [mulaiH, mulaiM] = jamMulai.split(':').map(Number);
    const mulaiMinutes = mulaiH * 60 + mulaiM;

    const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const now = new Date(nowStr);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (nowMinutes < mulaiMinutes) {
      return new Response(JSON.stringify({ message: `Belum waktunya. Jam mulai: ${jamMulai}, Sekarang: ${now.getHours()}:${now.getMinutes()}` }), { headers: { "Content-Type": "application/json" } });
    }
    
    // Cek batas akhir presensi (jangan spam seharian jika anak benar-benar bolos/sakit)
    const jamBatasAkhir = settings?.find(s => s.setting_key === 'jam_batas_akhir_presensi')?.setting_value || '07:00';
    const [batasH, batasM] = jamBatasAkhir.split(':').map(Number);
    const batasMinutes = batasH * 60 + batasM;
    
    // Kita tambahkan jeda toleransi (misal 30 menit setelah batas akhir) baru kita stop notifikasinya
    if (nowMinutes > batasMinutes + 30) {
      return new Response(JSON.stringify({ message: `Sudah lewat batas akhir presensi (${jamBatasAkhir} + toleransi 30mnt), push dihentikan.` }), { headers: { "Content-Type": "application/json" } });
    }

    // 1. Get all active students
    const { data: activeStudents, error: studentError } = await supabase
      .from("siswa_lengkap")
      .select("nisn, nama_lengkap")
      .eq("is_aktif", true);

    if (studentError) throw studentError;

    // 2. Get today's presensi
    const { data: presensiToday, error: presensiError } = await supabase
      .from("presensi_harian")
      .select("siswa_nisn")
      .eq("tanggal", today);

    if (presensiError) throw presensiError;

    const presentNisns = new Set(presensiToday.map((p) => p.siswa_nisn));

    // 3. Find students who haven't checked in
    const missingStudents = activeStudents.filter((s) => !presentNisns.has(s.nisn));
    const missingNisns = missingStudents.map((s) => s.nisn);

    if (missingNisns.length === 0) {
      return new Response(JSON.stringify({ message: "Semua siswa sudah presensi hari ini." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Get push subscriptions for missing students
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("nisn, subscription")
      .in("nisn", missingNisns);

    if (subError) throw subError;

    let successCount = 0;
    let failureCount = 0;

    // 5. Send push notifications
    const sendPromises = subscriptions.map(async (subRecord) => {
      const student = missingStudents.find((s) => s.nisn === subRecord.nisn);
      const payload = JSON.stringify({
        title: "⏰ Belum Presensi Pagi!",
        body: `Halo ${student?.nama_lengkap}, jangan lupa lakukan presensi / scan QR pagi ini ya!`,
        icon: "/logo.png",
        tag: "presensi-reminder",
        url: "/"
      });

      try {
        await webPush.sendNotification(subRecord.subscription, payload);
        successCount++;
      } catch (err) {
        console.error(`Failed to send to ${subRecord.nisn}:`, err);
        failureCount++;
        // Optionally: delete invalid subscriptions if statusCode === 410 or 404
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("nisn", subRecord.nisn);
        }
      }
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ 
      message: "Reminders sent", 
      success: successCount, 
      failed: failureCount,
      missingCount: missingNisns.length
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
