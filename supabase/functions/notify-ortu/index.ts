import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webPush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Service Account Firebase eBudiMulia
const SERVICE_ACCOUNT = {
  project_id: "ebudimulia-d1a16",
  client_email: "firebase-adminsdk-fbsvc@ebudimulia-d1a16.iam.gserviceaccount.com",
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDDl0mCzZ1sNQ2Z
hQSo4Nr0YXnqOX8ZuGrIm7RkCI0I1sYE7drpxT0jFbm2yHGaDCviIuvCly1NDL9+
29X/esfD20et1oGp8XKz9OV4EByv711++tTfqMxdrku04wXSb6XxcjKzoxm9/3C+
RIwGjIRFiMOoTXxVewpG2HuArcoM8BmlvvzCPw6XfPkU1zQFqOeyqo/bHwB7jRBa
T32OflXn1BHdKj5OnvTxFV/R6WH2XigvZuA6xXU3FnnrnGClEeDPowFxSs8fKEP5
ZSkSkboiZZELMu4tE7zsccHGFAmQkyKiwOgbn2HyvkAhTfs6xW5DoPU65H+ZN31v
CbyhYcZPAgMBAAECggEAXush8RkQvw0GEw0jJEOu7m8Jp7oMbPJ62+z4P52IuBPm
mEjH9q/SCh9Gd6ZRvyUN/NnemRodkWlQ22MbOLcgj/NwFzRky5DRjfSYkcob6eOb
d36J5Rq5RvNJaTjNQAEPwpsdcOEDopl+4M9KNvllTYtgDGLCJoemBpiTYvCz/8+A
cgEb1WALxjt67Sk0lHJfYCK9I7PdCLGrj5kTQNYd470xryrRsl7BfFJP3Hn7VqdP
cJvFELa8dcyELwRYJYJENEoOcULxeecj0tQuBwIv1PqdiZWw63oSvp6RXcEBjkTt
IhsyHFPNW1ztRgVLW85pARrcR0qVtR5Q+jUidlN8SQKBgQD9yF2mSRnN0zGUPKaN
4uQVvokaT559r9J5bxN/o0Qfq/W5YBH5mohy+NslrfKyQtVFN51UxQyPCnq7+0iL
BIk4ERv9oCKt8GeJGV8pVUP6SUvvSyxD4PbCFCe7p7ZWy9enQLLIJYHrp3eQvnc3
4PBakyCJ913CT2I6V0IjDCZZ5wKBgQDFTMOn3uJQme39cZL1rCoj+5NErMHT/MVW
T11v+OySW5sTRmBgxPiw0LIPz8Mwb0jYuuKycTAql4q2zIQ3fXnxjHB2mYeinE8q
lwBUWdOFGpShk0+fdz6o7D+j/RBGWx+P6ozp6TaEhxZWLXCtJoVMjYA6DMXddZaT
B3BfqVCzWQKBgQCWWh25hXeHLIckBqa6SuDMTRzW/LKuTftJPFh19xlGFk+3Ksab
dUU/sFXNRfgSSmwl3OQWM8PT/uZl9mKtEdvl3qURpszE9jewztpFF6H1Z3VYaNXp
xR8MLnq3v43UcGHsUfVZhHcrUQUSOPVSoq5jSuUtN+NRWkycudOSBgG2owKBgQCp
PrJPnFgSwBhw4i4oY+k6OKIZtQAH8rrs0OPcG3IEEmSyYhpmqFCUjFFSUuyi7bNV
hurUG1gwERLCwCli2FX0qH4InqbFDMS0ShfUQ8G4WhbJi24v4sBzc0UcTQba82vd
rlv2g0Fq6d51SkFvpq2N/4vRQAezcx0ZPrZcuQcq8QKBgHJRAYZtw5UHTHEf7Q6o
Y+sSzIMp6gX2dlqgjZqOqnhvoWzDcEDR8KvVT2hNzdYYmyhCcVoJ86il5NTTvgs8
oZMNeeUdWAyT+SVkwsJr8S7e7kZOubZc88OnlfJTkNQSCsfgjJ3uUVUxRZjU9HN5
JflIBeU2B5XmmmBxHTdH/8iO
-----END PRIVATE KEY-----`
};

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
