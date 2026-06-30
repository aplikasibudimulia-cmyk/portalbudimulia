import fs from 'fs';

// 1. Get the payload
const rawRiwayat = fs.readFileSync('restored_riwayat.jsx', 'utf8');
const riwayatJSX = JSON.parse(rawRiwayat);

// 2. Read the main file
const path = 'src/components/AdminManajemenAkunSection.jsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// 3. Find the exact target
const startIndex = lines.findIndex(l => l.includes('<label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>')) - 1;
const endIndex = lines.findIndex(l => l.includes('<label className="block text-xs font-medium text-slate-700 mb-1">No. WhatsApp</label>')) - 2;

if (startIndex > -1 && endIndex > -1) {
    // 4. Inject
    lines.splice(startIndex, endIndex - startIndex + 1, riwayatJSX);
    fs.writeFileSync(path, lines.join('\n'), 'utf8');
    console.log('Successfully injected Riwayat Kelas!');
} else {
    console.log('Target not found', startIndex, endIndex);
}

