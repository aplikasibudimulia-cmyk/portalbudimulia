import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback Service Account Firebase eBudiMulia (digunakan jika env variable belum diset)
const SERVICE_ACCOUNT_FALLBACK = {
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

function getServiceAccount() {
  const envJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (envJson) {
    try {
      return JSON.parse(envJson);
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT json:", e);
    }
  }

  const project_id = Deno.env.get("FIREBASE_PROJECT_ID") || SERVICE_ACCOUNT_FALLBACK.project_id;
  const client_email = Deno.env.get("FIREBASE_CLIENT_EMAIL") || SERVICE_ACCOUNT_FALLBACK.client_email;
  let private_key = Deno.env.get("FIREBASE_PRIVATE_KEY") || SERVICE_ACCOUNT_FALLBACK.private_key;
  if (private_key && private_key.includes("\\n")) {
    private_key = private_key.replace(/\\n/g, "\n");
  }

  return { project_id, client_email, private_key };
}

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

// Generate Google OAuth2 Token from Service Account
let cachedToken: { token: string; exp: number } | null = null;

async function getGoogleAccessToken(serviceAccount: { project_id: string; client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) {
    return cachedToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const keyBuffer = pemToBinary(serviceAccount.private_key);
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      nisn,
      nisns,
      role,
      title,
      message,
      body: notifBody,
      image,
      targetMenu,
      data = {},
      waliKelas
    } = body;

    const finalMessage = notifBody || message || "";

    let tokens: { token: string; role?: string }[] = [];

    // Kasus 1: Notifikasi khusus Wali Kelas
    if (waliKelas && waliKelas.kelas) {
      let queryWali = supabase.from("guru_kelas").select("guru_id").eq("kelas", waliKelas.kelas);
      if (waliKelas.tahunAjaranId) {
        queryWali = queryWali.eq("tahun_ajaran_id", waliKelas.tahunAjaranId);
      }
      const { data: waliList, error: errWali } = await queryWali;
      if (errWali) throw errWali;

      if (waliList && waliList.length > 0) {
        const guruIds = waliList.map((w: any) => String(w.guru_id)).filter(Boolean);
        if (guruIds.length > 0) {
          const { data: dt, error: errDt } = await supabase
            .from("push_device_tokens")
            .select("token, role")
            .in("nisn", guruIds)
            .eq("role", "Guru");
          if (errDt) throw errDt;
          if (dt) tokens = dt;
        }
      }
    }
    // Kasus 2: Notifikasi daftar beberapa NISN
    else if (nisns && Array.isArray(nisns) && nisns.length > 0) {
      let query = supabase.from("push_device_tokens").select("token, role").in("nisn", nisns.map(String));
      if (role) query = query.eq("role", role);
      const { data: dt, error: dtErr } = await query;
      if (dtErr) throw dtErr;
      if (dt) tokens = dt;
    }
    // Kasus 3: Notifikasi perorangan (NISN tunggal)
    else if (nisn) {
      let query = supabase.from("push_device_tokens").select("token, role").eq("nisn", String(nisn));
      if (role) query = query.eq("role", role);
      const { data: dt, error: dtErr } = await query;
      if (dtErr) throw dtErr;
      if (dt) tokens = dt;
    } else {
      return new Response(JSON.stringify({ error: "nisn, nisns, atau waliKelas wajib diisi" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 400,
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: false, message: "Tidak ada token perangkat FCM yang terdaftar" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const serviceAccount = getServiceAccount();
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const results = [];

    for (const item of tokens) {
      const fcmToken = item.token;
      const fcmPayload = {
        message: {
          token: fcmToken,
          notification: {
            title: title || "eBudiMulia",
            body: finalMessage,
            image: image || undefined,
          },
          android: {
            priority: "high",
            notification: {
              channel_id: "ebudimulia_presensi_v5",
              icon: "ic_launcher",
              color: item.role === "Guru" ? "#10B981" : "#4F46E5",
              sound: "default",
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_HIGH",
            },
          },
          data: {
            url: item.role === "Orang Tua" ? "/dashboard-orang-tua" : (item.role === "Guru" ? "/dashboard-guru" : "/dashboard"),
            targetMenu: targetMenu || (item.role === "Guru" ? "tabungan_siswa" : "PRESENSI"),
            ...data,
          },
        },
      };

      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(fcmPayload),
        }
      );

      const fcmJson = await fcmRes.json();
      results.push({ token: fcmToken, status: fcmRes.status, response: fcmJson });

      // Hapus token tidak valid jika sudah uninstalled
      if (fcmRes.status === 404 || fcmJson.error?.details?.some((d: any) => d.errorCode === "UNREGISTERED")) {
        await supabase.from("push_device_tokens").delete().eq("token", fcmToken);
      }
    }

    return new Response(JSON.stringify({ success: true, count: tokens.length, results }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("FCM Send Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
