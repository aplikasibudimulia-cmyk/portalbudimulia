// ==============================================================================
// fcm-send — Pengirim Push Notification FCM (sisi SERVER)
// ------------------------------------------------------------------------------
// Menggantikan pengiriman FCM yang sebelumnya dilakukan di browser/aplikasi
// (src/utils/fcmSender.js) dengan Service Account Firebase tertanam di frontend.
//
// Perilaku (judul berprefiks role, tag, url bawaan, konversi token APNs -> FCM,
// pembersihan token UNREGISTERED) SENGAJA dibuat identik dengan versi frontend
// agar tidak ada fitur yang berubah.
//
// Kunci Firebase HANYA dibaca dari Secrets Supabase (tidak ada fallback di kode).
//
// Deploy:  supabase functions deploy fcm-send --no-verify-jwt
//   (--no-verify-jwt dipakai karena aplikasi memakai kunci "sb_publishable_...",
//    sama seperti fungsi line-notify yang sudah ada)
// Secret:  supabase secrets set FIREBASE_SERVICE_ACCOUNT='<isi file JSON service account>'
// ==============================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// ───────────────────────── Batas & validasi masukan ─────────────────────────
const MAX_TITLE = 200;
const MAX_BODY = 1000;
const MAX_DATA_KEYS = 20;
const MAX_DATA_VALUE = 500;
const MAX_TOKENS_PER_TARGET = 15;
const RATE_LIMIT_PER_TARGET = 20; // maks notifikasi per target per menit
const RATE_WINDOW_MS = 60_000;

const VALID_ROLES = ["Siswa", "Orang Tua", "Guru"];
const NISN_PATTERN = /^[A-Za-z0-9_.\-]{1,40}$/;

// Pembatas laju sederhana (per isolate; bersifat best-effort)
const hits = new Map<string, number[]>();
function allow(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_PER_TARGET) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return true;
}

const clip = (v: unknown, max: number): string => String(v ?? "").slice(0, max);

/** Hanya izinkan tautan relatif internal (mencegah tautan phishing lewat notifikasi) */
function safeRelativeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return v.slice(0, 300);
}

/** Hanya izinkan gambar https */
function safeImage(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^https:\/\//i.test(v) || v.length > 1000) return undefined;
  return v;
}

/** Rapikan objek data: semua nilai wajib string (syarat FCM), batasi jumlah & panjang */
function cleanData(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_DATA_KEYS) break;
    if (v === undefined || v === null) continue;
    if (!/^[A-Za-z0-9_\-]{1,50}$/.test(k)) continue;
    if (k === "url") {
      const u = safeRelativeUrl(v);
      if (u) {
        out[k] = u;
        count++;
      }
      continue;
    }
    out[k] = clip(typeof v === "object" ? JSON.stringify(v) : v, MAX_DATA_VALUE);
    count++;
  }
  return out;
}

// ───────────────────────── Service Account (hanya dari Secrets) ─────────────
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function getServiceAccount(): ServiceAccount | null {
  const envJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (envJson) {
    try {
      const sa = JSON.parse(envJson);
      if (sa?.project_id && sa?.client_email && sa?.private_key) {
        return {
          project_id: sa.project_id,
          client_email: sa.client_email,
          private_key: String(sa.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch (e) {
      console.warn("FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid:", e);
    }
  }
  const project_id = Deno.env.get("FIREBASE_PROJECT_ID");
  const client_email = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  const private_key = Deno.env.get("FIREBASE_PRIVATE_KEY");
  if (project_id && client_email && private_key) {
    return { project_id, client_email, private_key: private_key.replace(/\\n/g, "\n") };
  }
  return null;
}

function base64UrlEncode(str: string | Uint8Array): string {
  let binary = "";
  if (typeof str === "string") {
    const bytes = new TextEncoder().encode(str);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  } else {
    for (let i = 0; i < str.byteLength; i++) binary += String.fromCharCode(str[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToBinary(pem: string): ArrayBuffer {
  let b64 = "";
  for (const line of pem.split("\n")) {
    if (line.includes("-----BEGIN") || line.includes("-----END") || !line.trim()) continue;
    b64 += line.trim();
  }
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const signatureInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBinary(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput),
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
    throw new Error("Gagal mendapatkan Google Access Token");
  }
  cachedToken = { token: tokenData.access_token, exp: now + (tokenData.expires_in || 3600) };
  return cachedToken.token;
}

/** Konversi token APNs (hex 64 karakter dari iOS native) menjadi token FCM */
async function resolveFcmToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawToken: string,
  accessToken: string,
): Promise<string | null> {
  if (!rawToken) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(rawToken)) return rawToken;
  try {
    for (const sandbox of [false, true]) {
      const res = await fetch("https://iid.googleapis.com/iid/v1:batchImport", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          access_token_auth: "true",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          application: "com.ebudimulia.portal",
          sandbox,
          apns_tokens: [rawToken],
        }),
      });
      const data = await res.json();
      if (data?.results?.[0]?.registration_token) {
        const fcmToken = data.results[0].registration_token;
        await supabase.from("push_device_tokens").update({ token: fcmToken }).eq("token", rawToken);
        return fcmToken;
      }
    }
  } catch (err) {
    console.warn("Gagal konversi APNs -> FCM:", err);
  }
  return rawToken;
}

/** Kirim satu pesan; hapus token jika sudah tidak valid. Mengembalikan true bila sukses */
async function sendOne(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sa: ServiceAccount,
  accessToken: string,
  // deno-lint-ignore no-explicit-any
  message: any,
  originalToken: string,
): Promise<boolean> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return true;
  const resJson = await res.json().catch(() => ({}));
  console.warn("FCM send error:", res.status);
  // deno-lint-ignore no-explicit-any
  if (res.status === 404 || resJson?.error?.details?.some((d: any) => d.errorCode === "UNREGISTERED")) {
    await supabase.from("push_device_tokens").delete().eq("token", originalToken);
  }
  return false;
}

// ───────────────────────── Handler ─────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, message: "Method not allowed" }, 405);

  try {
    // deno-lint-ignore no-explicit-any
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, message: "Body JSON tidak valid" }, 400);
    }

    const sa = getServiceAccount();
    if (!sa) {
      console.error("FIREBASE_SERVICE_ACCOUNT belum diset di Secrets Supabase");
      return jsonResponse({ success: false, message: "Konfigurasi server notifikasi belum lengkap" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const title = clip(body.title, MAX_TITLE);
    const notifText = clip(body.body ?? body.message, MAX_BODY);
    const data = cleanData(body.data);

    // ───── Jalur 1: Wali Kelas (setara sendFCMPushToWaliKelas) ─────
    if (body.kind === "wali") {
      const kelas = clip(body.kelas, 20);
      if (!kelas) return jsonResponse({ success: false, message: "Kelas is required" });
      if (!allow(`wali:${kelas}`)) {
        return jsonResponse({ success: false, message: "Terlalu banyak notifikasi, coba lagi sebentar" }, 429);
      }

      let queryWali = supabase.from("guru_kelas").select("guru_id").eq("kelas", kelas);
      if (body.tahunAjaranId) queryWali = queryWali.eq("tahun_ajaran_id", String(body.tahunAjaranId));
      const { data: waliList, error: errWali } = await queryWali;
      if (errWali || !waliList || waliList.length === 0) {
        return jsonResponse({ success: false, message: "No wali kelas found" });
      }
      // deno-lint-ignore no-explicit-any
      const guruIds = waliList.map((w: any) => String(w.guru_id)).filter(Boolean);
      if (guruIds.length === 0) return jsonResponse({ success: false, message: "No valid guru ID" });

      const { data: deviceTokens, error: errToken } = await supabase
        .from("push_device_tokens")
        .select("token, role")
        .in("nisn", guruIds)
        .eq("role", "Guru")
        .limit(MAX_TOKENS_PER_TARGET * guruIds.length);
      if (errToken || !deviceTokens || deviceTokens.length === 0) {
        return jsonResponse({ success: false, message: "No registered device tokens for wali kelas" });
      }

      const accessToken = await getGoogleAccessToken(sa);
      let sentCount = 0;
      const finalTitle = title || `Verifikasi Tabungan Siswa (${kelas})`;

      for (const item of deviceTokens) {
        try {
          const targetToken = await resolveFcmToken(supabase, item.token, accessToken);
          if (!targetToken) continue;
          const ok = await sendOne(supabase, sa, accessToken, {
            token: targetToken,
            notification: { title: finalTitle, body: notifText },
            android: {
              priority: "high",
              notification: {
                channel_id: "ebudimulia_presensi_v5",
                icon: "ic_launcher",
                color: "#10B981",
                sound: "default",
                default_vibrate_timings: true,
                notification_priority: "PRIORITY_HIGH",
                visibility: "PUBLIC",
              },
            },
            apns: { payload: { aps: { sound: "default", badge: 1, "content-available": 1 } } },
            data: {
              title: finalTitle,
              body: notifText,
              url: "/dashboard-guru",
              targetMenu: "tabungan_siswa",
              kelas,
              ...data,
            },
          }, item.token);
          if (ok) sentCount++;
        } catch (e) {
          console.warn("Token send error (wali):", e);
        }
      }
      return jsonResponse({ success: true, sentCount });
    }

    // ───── Jalur 2: Siswa / Orang Tua / Guru (setara sendFCMPushNotification) ─────
    const nisn = body.nisn;
    if (!nisn) return jsonResponse({ success: false, message: "NISN is required" });
    if (!NISN_PATTERN.test(String(nisn))) {
      return jsonResponse({ success: false, message: "Format NISN tidak valid" }, 400);
    }
    const role = body.role;
    if (role && !VALID_ROLES.includes(role)) {
      return jsonResponse({ success: false, message: "Role tidak valid" }, 400);
    }
    if (!allow(`nisn:${nisn}:${role || "all"}`)) {
      return jsonResponse({ success: false, message: "Terlalu banyak notifikasi, coba lagi sebentar" }, 429);
    }

    const targetMenu = clip(body.targetMenu || "PRESENSI", 50);
    const image = safeImage(body.image);

    let query = supabase.from("push_device_tokens").select("token, role").eq("nisn", String(nisn));
    if (role) query = query.eq("role", role);
    const { data: deviceTokens, error } = await query.limit(MAX_TOKENS_PER_TARGET);
    if (error || !deviceTokens || deviceTokens.length === 0) {
      return jsonResponse({ success: false, message: "No registered device tokens" });
    }

    const accessToken = await getGoogleAccessToken(sa);
    let sentCount = 0;

    for (const item of deviceTokens) {
      try {
        const targetToken = await resolveFcmToken(supabase, item.token, accessToken);
        if (!targetToken) continue;

        const tokenRole = item.role || role || "Siswa";
        let roleTitle = title || "eBudiMulia";
        if (tokenRole === "Orang Tua" && !roleTitle.includes("[Orang Tua]") && !roleTitle.includes("[Ortu]")) {
          roleTitle = `[Orang Tua] ${roleTitle}`;
        } else if (tokenRole === "Siswa" && !roleTitle.includes("[Siswa]")) {
          roleTitle = `[Siswa] ${roleTitle}`;
        }

        // deno-lint-ignore no-explicit-any
        const notifObj: any = { title: roleTitle, body: notifText };
        if (image) notifObj.image = image;

        const defaultUrl = tokenRole === "Orang Tua"
          ? "/dashboard-orang-tua?menu=PRESENSI"
          : (tokenRole === "Guru"
            ? "/dashboard-guru"
            : (targetMenu === "AJUKAN_POIN" ? "/dashboard?menu=AJUKAN_POIN&tab=riwayat" : "/dashboard"));

        const ok = await sendOne(supabase, sa, accessToken, {
          token: targetToken,
          notification: notifObj,
          android: {
            priority: "high",
            notification: {
              channel_id: "ebudimulia_presensi_v5",
              icon: "ic_stat_logo",
              color: tokenRole === "Guru" ? "#10B981" : "#4F46E5",
              sound: "default",
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_HIGH",
              visibility: "PUBLIC",
              image: image || undefined,
            },
          },
          apns: { payload: { aps: { sound: "default", badge: 1, "content-available": 1 } } },
          data: {
            title: roleTitle,
            body: notifText,
            role: tokenRole,
            nisn: String(nisn),
            imageUrl: image || "",
            tag: data.tag
              ? (data.tag.includes(tokenRole) ? data.tag : `${data.tag}-${tokenRole}`)
              : `presensi-${tokenRole}-${nisn}`,
            url: data.url || defaultUrl,
            targetMenu,
            ...(data.targetTab || targetMenu === "AJUKAN_POIN"
              ? { targetTab: data.targetTab || "riwayat" }
              : {}),
            ...data,
          },
        }, item.token);
        if (ok) sentCount++;
      } catch (e) {
        console.warn("Token send error:", e);
      }
    }

    return jsonResponse({ success: true, sentCount });
  } catch (err) {
    console.error("fcm-send error:", err);
    return jsonResponse({ success: false, error: "Terjadi kesalahan pada server notifikasi" }, 500);
  }
});
