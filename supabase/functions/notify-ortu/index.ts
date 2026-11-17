import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webPush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Service Account Firebase eBudiMulia
// Kunci Firebase TIDAK lagi disimpan di kode. Set lewat: supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat file.json)"
function loadFirebaseServiceAccount() {
  try {
    const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (raw) {
      const j = JSON.parse(raw);
      return {
        project_id: j.project_id || "",
        client_email: j.client_email || "",
        private_key: String(j.private_key || "").replace(/\\n/g, "\n"),
      };
    }
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT tidak valid:", e);
  }
  console.error("FIREBASE_SERVICE_ACCOUNT belum diatur di Supabase Secrets.");
  return { project_id: "", client_email: "", private_key: "" };
}
const SERVICE_ACCOUNT = loadFirebaseServiceAccount();

function base64UrlEncode(str: string | Uint8Array): string {
  let binary = "";
  if (typeof str === "string") {
    const bytes = new TextEncoder().encode(str);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  } else {
    for (let i = 0; i < str.byteLength; i++) {
      binary += String.fromCharCode(str[i]);
    }
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToBinary(pem: string): ArrayBuffer {
  const lines = pem.split("\n");
  let b64 = "";
  for (const line of lines) {
    if (line.includes("-----BEGIN") || line.includes("-----END") || !line.trim()) continue;
    b64 += line.trim();
  }
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) {
    return cachedToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const keyBuffer = pemToBinary(SERVICE_ACCOUNT.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const jwt = `${signatureInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to obtain Google access token: ${JSON.stringify(tokenData)}`);
  }

  cachedToken = {
    token: tokenData.access_token,
    exp: now + (tokenData.expires_in || 3600),
  };

  return cachedToken.token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { nisn, namaLengkap, statusLabel, waktu, tipeLabel, lokasi, selfieUrl } = body;

    if (!nisn) {
      return new Response(JSON.stringify({ error: "nisn diperlukan" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    const title = `Presensi ${tipeLabel || 'Masuk'} Siswa (${statusLabel || 'Hadir'} - ${waktu || '07.00'} WIB)`;
    const notifBody = `${namaLengkap || 'Siswa'} - Presensi ${tipeLabel || 'Masuk'} pukul ${waktu || '-'} WIB (${statusLabel || 'Hadir'}).${lokasi ? ` Lokasi: ${lokasi}` : ''}`;

    // 1. Kirim FCM Push ke HP Orang Tua & Siswa (bekerja walau aplikasi mati)
    let fcmSentCount = 0;
    try {
      const { data: deviceTokens } = await supabase
        .from("push_device_tokens")
        .select("token, role")
        .eq("nisn", String(nisn));

      if (deviceTokens && deviceTokens.length > 0) {
        const accessToken = await getGoogleAccessToken();
        for (const dev of deviceTokens) {
          try {
            const fcmRes = await fetch(
              `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  message: {
                    token: dev.token,
                    notification: {
                      title: title,
                      body: notifBody,
                      image: selfieUrl || undefined,
                    },
                    android: {
                      priority: "high",
                      notification: {
                        channel_id: "ebudimulia_presensi_v5",
                        icon: "ic_launcher",
                        color: "#4F46E5",
                        sound: "default",
                        default_vibrate_timings: true,
                        notification_priority: "PRIORITY_HIGH",
                      },
                    },
                    data: {
                      url: dev.role === "Orang Tua" ? "/dashboard-orang-tua?menu=PRESENSI" : "/dashboard?menu=PRESENSI",
                      targetMenu: "PRESENSI",
                    },
                  },
                }),
              }
            );
            if (fcmRes.ok) fcmSentCount++;
          } catch (devErr) {
            console.warn("FCM error on single token:", devErr);
          }
        }
      }
    } catch (fcmErr) {
      console.warn("FCM Push Error:", fcmErr);
    }

    // 2. Kirim WebPush VAPID (Fallback untuk browser)
    try {
      const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
      const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
      const contactEmail = Deno.env.get("VAPID_CONTACT_EMAIL") ?? "mailto:admin@ebudimulia.com";

      if (vapidPublicKey && vapidPrivateKey) {
        webPush.setVapidDetails(contactEmail, vapidPublicKey, vapidPrivateKey);
        const { data: subRecord } = await supabase
          .from("push_subscriptions_ortu")
          .select("subscription")
          .eq("nisn_anak", nisn)
          .maybeSingle();

        if (subRecord?.subscription) {
          const payload = JSON.stringify({
            title: title,
            body: notifBody,
            icon: "/logo.png",
            badge: "/logo.png",
            image: selfieUrl || undefined,
            tag: `presensi-ortu-${nisn}`,
            data: { url: "/dashboard-orang-tua?menu=PRESENSI", nisn },
            vibrate: [200, 100, 200],
          });
          await webPush.sendNotification(subRecord.subscription, payload);
        }
      }
    } catch (wpErr) {
      console.warn("WebPush Error:", wpErr);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      fcmSentCount, 
      message: `Push notifikasi berhasil dikirim ke ${fcmSentCount} perangkat.` 
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
