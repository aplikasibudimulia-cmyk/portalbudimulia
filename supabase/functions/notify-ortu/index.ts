import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webPush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

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
    const body = await req.json();

    // Validasi input
    const { nisn, namaLengkap, status, statusLabel, waktu, tipe, tipeLabel, tanggal, lokasi } = body;
    if (!nisn) {
      return new Response(JSON.stringify({ error: "nisn diperlukan" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    // Ambil subscription orang tua berdasarkan nisn anak
    const { data: subRecord, error: subErr } = await supabase
      .from("push_subscriptions_ortu")
      .select("subscription, username_ortu")
      .eq("nisn_anak", nisn)
      .maybeSingle();

    if (subErr) throw subErr;

    if (!subRecord) {
      return new Response(JSON.stringify({ message: "Orang tua belum mendaftarkan notifikasi push." }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Buat isi notifikasi yang informatif
    const icon = tipe === "pulang" ? "🏠" : "🏫";
    const statusEmoji = status === "H" ? "✅" : status === "T" ? "⚠️" : "📋";
    const lokasiText = lokasi ? `📍 Lokasi: ${lokasi}` : "";
    const redirectUrl = lokasi ? `https://www.google.com/maps?q=${lokasi}` : "/";

    const payload = JSON.stringify({
      title: `${icon} Presensi ${tipeLabel} Anak`,
      body: `${namaLengkap} — ${statusEmoji} ${statusLabel} pukul ${waktu} WIB\n${lokasiText}\n📅 ${tanggal}`,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: `presensi-ortu-${tipe}`,
      data: { url: redirectUrl, nisn, tipe },
      vibrate: [200, 100, 200],
    });

    try {
      await webPush.sendNotification(subRecord.subscription, payload);
      return new Response(JSON.stringify({ success: true, message: "Push notifikasi berhasil dikirim ke orang tua." }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (pushErr) {
      console.error("Push gagal:", pushErr);
      // Jika subscription sudah tidak valid (kedaluwarsa), hapus dari database
      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
        await supabase.from("push_subscriptions_ortu").delete().eq("nisn_anak", nisn);
        return new Response(JSON.stringify({ message: "Subscription kedaluwarsa, telah dihapus." }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      throw pushErr;
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
