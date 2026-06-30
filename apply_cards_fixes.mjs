import fs from 'fs'

const path = 'src/components/AdminManajemenAkunSection.jsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// 1. Inject dataForCards logic before `const handleResetPassword`
const insertIndex = lines.findIndex(l => l.includes('const handleResetPassword = (row) => {'));

if (insertIndex > -1) {
  const injection = `
  // Backup data for cards before summary filter is applied
  const dataForCards = [...mergedData];

  // Apply Summary Filter
  if (summaryFilter !== 'all') {
    if (summaryFilter === 'with_akun') {
      mergedData = mergedData.filter(a => a.hasAkun)
    } else if (summaryFilter === 'without_akun') {
      mergedData = mergedData.filter(a => !a.hasAkun)
    } else if (summaryFilter === 'active_akun') {
      if (activeTab === 'murid') {
        mergedData = mergedData.filter(a => a.hasAkun && a.status === 'aktif')
      } else {
        mergedData = mergedData.filter(a => {
          const akun = akunList.find(ak => ak.id === a.akun_id);
          return akun && (akun.role === 'admin' || akun.role === 'superadmin');
        })
      }
    }
  }
`;
  lines.splice(insertIndex - 1, 0, injection);
} else {
  console.log("Could not find handleResetPassword");
}

// 2. Replace the UI Cards block
const cardStart = lines.findIndex(l => l.includes('{(activeTab === \'murid\' ? ['));
// We want to find the </div> that closes the summary cards, which is exactly before {/* Tabs */}
let cardEnd = -1;
for (let i = cardStart; i < lines.length; i++) {
   if (lines[i].includes('{/* Tabs */}')) {
       cardEnd = i - 1; // The line before Tabs is probably an empty line or </div>
       // backtrack empty lines
       while (lines[cardEnd].trim() === '') cardEnd--;
       break;
   }
}

if (cardStart > -1 && cardEnd > -1) {
  const newCards = `          {(activeTab === 'murid' ? [
            { l: 'Total Murid', v: dataForCards.length, type: 'all' },
            { l: 'Punya Akun', v: dataForCards.filter(m => m.hasAkun).length, type: 'with_akun' },
            { l: 'Tanpa Akun', v: dataForCards.filter(m => !m.hasAkun).length, type: 'without_akun' },
            { l: 'Akun Aktif', v: dataForCards.filter(m => m.hasAkun && m.status === 'aktif').length, type: 'active_akun' }
          ] : [
            { l: 'Total Guru & Staff', v: dataForCards.length, type: 'all' },
            { l: 'Punya Akun', v: dataForCards.filter(g => g.hasAkun).length, type: 'with_akun' },
            { l: 'Tanpa Akun', v: dataForCards.filter(g => !g.hasAkun).length, type: 'without_akun' },
            { l: 'Admin', v: dataForCards.filter(g => {
                const akun = akunList.find(a => a.id === g.akun_id);
                return akun && (akun.role === 'admin' || akun.role === 'superadmin');
              }).length, type: 'active_akun'
            }
          ]).map(stat => (
            <div 
              key={stat.l} 
              onClick={() => setSummaryFilter(stat.type)}
              className={\`bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:-translate-y-1 \${summaryFilter === stat.type ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-300'}\`}
            >
              <p className={\`text-sm font-medium \${summaryFilter === stat.type ? 'text-indigo-600' : 'text-slate-500'}\`}>{stat.l}</p>
              <p className={\`text-2xl font-bold mt-1 \${summaryFilter === stat.type ? 'text-indigo-900' : 'text-slate-900'}\`}>{stat.v}</p>
            </div>
          ))}
        </div>`;
  // Replace from cardStart up to cardEnd (inclusive)
  lines.splice(cardStart, cardEnd - cardStart + 1, newCards);
} else {
  console.log("Could not find Cards block");
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Successfully applied accurate patches.');
