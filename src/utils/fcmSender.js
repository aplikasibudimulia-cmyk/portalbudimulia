import { supabase } from '../supabaseClient'

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

function base64Url(str) {
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

function pemToBinary(pem) {
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

let cachedToken = null;

async function getGoogleAccessToken() {
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

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const keyBuffer = pemToBinary(SERVICE_ACCOUNT.private_key);
  const cryptoKey = await window.crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await window.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const jwt = `${signatureInput}.${base64Url(new Uint8Array(signature))}`;

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
    throw new Error(`Failed to get Google Access Token: ${JSON.stringify(tokenData)}`);
  }

  cachedToken = {
    token: tokenData.access_token,
    exp: now + (tokenData.expires_in || 3600),
  };

  return cachedToken.token;
}

/**
 * Kirim FCM Push Notification ke semua perangkat Siswa / Orang Tua yang terdaftar
 */
export async function sendFCMPushNotification({ nisn, role, title, body, image, targetMenu = 'PRESENSI', data = {} }) {
  if (!nisn) return { success: false, message: 'NISN is required' };

  try {
    let query = supabase.from('push_device_tokens').select('token, role').eq('nisn', String(nisn));
    if (role) {
      query = query.eq('role', role);
    }

    const { data: deviceTokens, error } = await query;
    if (error || !deviceTokens || deviceTokens.length === 0) {
      return { success: false, message: 'No registered device tokens' };
    }

    const accessToken = await getGoogleAccessToken();
    let sentCount = 0;

    for (const item of deviceTokens) {
      try {
        const payload = {
          message: {
            token: item.token,
            notification: {
              title: title || 'eBudiMulia',
              body: body || '',
              image: image || undefined,
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'ebudimulia-notif-v3',
                icon: 'ic_launcher',
                color: '#4F46E5',
                sound: 'default',
                default_vibrate_timings: true,
                notification_priority: 'PRIORITY_HIGH',
              },
            },
            data: {
              url: item.role === 'Orang Tua' ? '/dashboard-orang-tua' : '/dashboard',
              targetMenu: targetMenu,
              ...data,
            },
          },
        };

        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (res.ok) {
          sentCount++;
        } else {
          const resJson = await res.json();
          if (res.status === 404 || resJson.error?.details?.some(d => d.errorCode === 'UNREGISTERED')) {
            await supabase.from('push_device_tokens').delete().eq('token', item.token);
          }
        }
      } catch (tokenErr) {
        console.warn('[FCM Sender] Token send error:', tokenErr);
      }
    }

    return { success: true, sentCount };
  } catch (err) {
    console.warn('[FCM Sender] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Kirim FCM Push Notification khusus ke Wali Kelas dari suatu kelas tertentu
 * 
 * @param {Object} params
 * @param {string} params.kelas - Nama kelas (contoh: '9A')
 * @param {number|string} [params.tahunAjaranId] - ID Tahun Ajaran aktif (opsional)
 * @param {string} params.title - Judul notifikasi
 * @param {string} params.body - Pesan notifikasi
 * @param {Object} [params.data] - Data payload tambahan
 */
export async function sendFCMPushToWaliKelas({ kelas, tahunAjaranId, title, body, data = {} }) {
  if (!kelas) return { success: false, message: 'Kelas is required' };

  try {
    // 1. Cari guru_id wali kelas dari tabel guru_kelas
    let queryWali = supabase.from('guru_kelas').select('guru_id').eq('kelas', kelas);
    if (tahunAjaranId) {
      queryWali = queryWali.eq('tahun_ajaran_id', tahunAjaranId);
    }

    const { data: waliList, error: errWali } = await queryWali;
    if (errWali || !waliList || waliList.length === 0) {
      console.log('[FCM Wali] Tidak ditemukan wali kelas untuk kelas:', kelas);
      return { success: false, message: 'No wali kelas found' };
    }

    const guruIds = waliList.map(w => String(w.guru_id)).filter(Boolean);
    if (guruIds.length === 0) return { success: false, message: 'No valid guru ID' };

    // 2. Ambil token FCM untuk Guru terkait dari push_device_tokens
    const { data: deviceTokens, error: errToken } = await supabase
      .from('push_device_tokens')
      .select('token, role')
      .in('nisn', guruIds)
      .eq('role', 'Guru');

    if (errToken || !deviceTokens || deviceTokens.length === 0) {
      console.log('[FCM Wali] Belum ada device token terdaftar untuk guru ID:', guruIds);
      return { success: false, message: 'No registered device tokens for wali kelas' };
    }

    const accessToken = await getGoogleAccessToken();
    let sentCount = 0;

    for (const item of deviceTokens) {
      try {
        const payload = {
          message: {
            token: item.token,
            notification: {
              title: title || `Verifikasi Tabungan Siswa (${kelas})`,
              body: body || '',
            },
            android: {
              priority: 'high',
              notification: {
                channel_id: 'ebudimulia-notif-v3',
                icon: 'ic_launcher',
                color: '#10B981',
                sound: 'default',
                default_vibrate_timings: true,
                notification_priority: 'PRIORITY_HIGH',
              },
            },
            data: {
              url: '/dashboard-guru',
              targetMenu: 'tabungan_siswa',
              kelas: kelas,
              ...data,
            },
          },
        };

        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (res.ok) {
          sentCount++;
        } else {
          const resJson = await res.json();
          if (res.status === 404 || resJson.error?.details?.some(d => d.errorCode === 'UNREGISTERED')) {
            await supabase.from('push_device_tokens').delete().eq('token', item.token);
          }
        }
      } catch (tokenErr) {
        console.warn('[FCM Wali] Token send error:', tokenErr);
      }
    }

    return { success: true, sentCount };
  } catch (err) {
    console.warn('[FCM Wali] Error:', err);
    return { success: false, error: err.message };
  }
}

