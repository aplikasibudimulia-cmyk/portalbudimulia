import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webPush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }

  webPush.setVapidDetails(contactEmail, vapidPublicKey, vapidPrivateKey);

  try {
    // Parse action from request body if any
    let bodyData = {};
    if (req.method === "POST") {
      try {
        bodyData = await req.json();
      } catch (e) {
        // No JSON body or invalid JSON
      }
    }
    const action = bodyData.action || "cron_reminder";

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    // 0. Cek pengaturan dari database
    const { data: settings } = await supabase
      .from('pengaturan_sekolah')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'notif_peringatan_aktif', 
        'jam_mulai_notif_belum_presensi', 
        'jam_batas_hadir',
        'notif_pengingat_interval_menit'
      ]);
      
    const notifAktif = settings?.find(s => s.setting_key === 'notif_peringatan_aktif')?.setting_value;
    if (notifAktif === 'false') {
      return new Response(JSON.stringify({ message: "Notifikasi dimatikan oleh admin." }), { 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    // Aksi 1: Peringatan Sesi Presensi Dimulai (Dipicu saat Piket klik Mulai Presensi)
    if (action === "session_started") {
      const { data: activeStudents, error: studentError } = await supabase
        .from("siswa_lengkap")
        .select("nisn, nama_lengkap")
        .eq("is_aktif", true);

      if (studentError) throw studentError;
      const activeNisns = activeStudents.map(s => s.nisn);

      if (activeNisns.length === 0) {
        return new Response(JSON.stringify({ message: "Tidak ada siswa aktif." }), { 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }

      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("nisn, subscription")
        .in("nisn", activeNisns);

      if (subError) throw subError;

      let successCount = 0;
      let failureCount = 0;

      const sendPromises = subscriptions.map(async (subRecord) => {
        const student = activeStudents.find((s) => s.nisn === subRecord.nisn);
        const payload = JSON.stringify({
          title: "📢 Presensi Hari Ini Dimulai",
          body: `Halo ${student?.nama_lengkap}, sesi presensi hari ini sudah dibuka oleh petugas piket. Silakan scan QR code presensi ya!`,
          icon: "/logo.png",
          tag: "presensi-session-started",
          url: "/"
        });

        try {
          await webPush.sendNotification(subRecord.subscription, payload);
          successCount++;
        } catch (err) {
          console.error(`Failed to send session start to ${subRecord.nisn}:`, err);
          failureCount++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("nisn", subRecord.nisn);
          }
        }
      });

      await Promise.all(sendPromises);

      return new Response(JSON.stringify({ 
        message: "Notifikasi sesi presensi dimulai berhasil dikirim.", 
        success: successCount, 
        failed: failureCount
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Aksi 2: Pengingat Berkala (Cron Reminder)
    const intervalMenit = parseInt(settings?.find(s => s.setting_key === 'notif_pengingat_interval_menit')?.setting_value || '5', 10);
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const now = new Date(nowStr);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Jalankan pengingat hanya jika menit saat ini habis dibagi interval pengaturan admin
    if (now.getMinutes() % intervalMenit !== 0) {
      return new Response(JSON.stringify({ 
        message: `Waktu tidak cocok dengan interval. Interval: ${intervalMenit} menit. Sekarang menit ke-${now.getMinutes()}` 
      }), { 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    const jamMulai = settings?.find(s => s.setting_key === 'jam_mulai_notif_belum_presensi')?.setting_value || '06:40';
    const [mulaiH, mulaiM] = jamMulai.split(':').map(Number);
    const mulaiMinutes = mulaiH * 60 + mulaiM;

    if (nowMinutes < mulaiMinutes) {
      return new Response(JSON.stringify({ message: `Belum masuk jam mulai pengingat (${jamMulai}).` }), { 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }
    
    const jamBatasHadir = settings?.find(s => s.setting_key === 'jam_batas_hadir')?.setting_value || '07:00';
    const [batasH, batasM] = jamBatasHadir.split(':').map(Number);
    const batasMinutes = batasH * 60 + batasM;
    
    // Hentikan notifikasi pengingat jika sudah lewat 30 menit dari batas hadir presensi (Hanya jika batas waktu lebih besar dari jam mulai)
    if (batasMinutes > mulaiMinutes) {
      if (nowMinutes > batasMinutes + 30) {
        return new Response(JSON.stringify({ message: `Sudah lewat batas hadir presensi (${jamBatasHadir} + toleransi 30mnt).` }), { 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // 1. Dapatkan daftar siswa aktif
    const { data: activeStudents, error: studentError } = await supabase
      .from("siswa_lengkap")
      .select("nisn, nama_lengkap")
      .eq("is_aktif", true);

    if (studentError) throw studentError;

    // 2. Dapatkan data presensi hari ini
    const { data: presensiToday, error: presensiError } = await supabase
      .from("presensi_harian")
      .select("siswa_nisn")
      .eq("tanggal", today);

    if (presensiError) throw presensiError;

    const presentNisns = new Set(presensiToday.map((p) => p.siswa_nisn));

    // 3. Filter siswa yang belum presensi
    const missingStudents = activeStudents.filter((s) => !presentNisns.has(s.nisn));
    const missingNisns = missingStudents.map((s) => s.nisn);

    if (missingNisns.length === 0) {
      return new Response(JSON.stringify({ message: "Semua siswa sudah melakukan presensi hari ini." }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 4. Cari push subscriptions milik siswa yang belum presensi
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("nisn, subscription")
      .in("nisn", missingNisns);

    if (subError) throw subError;

    let successCount = 0;
    let failureCount = 0;

    // 5. Kirim Push Notification ke masing-masing subscriber
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
        console.error(`Failed to send reminder to ${subRecord.nisn}:`, err);
        failureCount++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("nisn", subRecord.nisn);
        }
      }
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ 
      message: "Notifikasi pengingat berhasil dikirim.", 
      success: successCount, 
      failed: failureCount,
      missingCount: missingNisns.length
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
