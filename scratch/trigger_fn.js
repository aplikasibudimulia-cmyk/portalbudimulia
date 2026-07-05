const url = "https://ngdepacckohoxemlauhd.supabase.co/functions/v1/presensi-reminder";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MDMsImV4cCI6MjA5NTI4MzYwM30.mF_IUtRel7YjUHEq3oKKFOczDkGDa1ZTgyBVp8sKsmc";

fetch(url, {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({})
}).then(res => res.json()).then(console.log).catch(console.error);
