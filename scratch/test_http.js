import https from 'https';

const url = 'https://ngdepacckohoxemlauhd.supabase.co/functions/v1/presensi-reminder';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZGVwYWNja29ob3hlbWxhdWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDc2MDMsImV4cCI6MjA5NTI4MzYwM30.mF_IUtRel7YjUHEq3oKKFOczDkGDa1ZTgyBVp8sKsmc';

const req = https.request(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error(e));
req.write('{}');
req.end();
