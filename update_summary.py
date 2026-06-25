import os
import re

filepath = 'src/components/AdminManajemenAkunSection.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's replace the Summary Cards JSX
# Find:
#         {/* Summary Cards */}
#         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
#           {[{l:'Total Akun', v: akunSummary.total}, {l:'Akun Murid', v: akunSummary.murid}, {l:'Akun Guru', v: akunSummary.guru}, {l:'Admin', v: akunSummary.admin}].map(stat => (
#             <div key={stat.l} className="bg-white border-none rounded-xl p-4 shadow-sm">
#               <p className="text-sm font-medium text-slate-500">{stat.l}</p>
#               <p className="text-2xl font-bold text-slate-900 mt-1">{stat.v}</p>
#             </div>
#           ))}
#         </div>

# We will replace it with a dynamically calculated array.

dynamic_summary_jsx = """        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {(activeTab === 'murid' ? [
            { l: 'Total Murid', v: mergedData.length },
            { l: 'Punya Akun', v: mergedData.filter(m => m.hasAkun).length },
            { l: 'Tanpa Akun', v: mergedData.filter(m => !m.hasAkun).length },
            { l: 'Akun Aktif', v: mergedData.filter(m => m.hasAkun && m.status === 'aktif').length }
          ] : [
            { l: 'Total Guru & Staff', v: mergedData.length },
            { l: 'Punya Akun', v: mergedData.filter(g => g.hasAkun).length },
            { l: 'Tanpa Akun', v: mergedData.filter(g => !g.hasAkun).length },
            { l: 'Admin', v: mergedData.filter(g => {
                const akun = akunList.find(a => a.id === g.akun_id);
                return akun && (akun.role === 'admin' || akun.role === 'superadmin');
              }).length 
            }
          ]).map(stat => (
            <div key={stat.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{stat.l}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.v}</p>
            </div>
          ))}
        </div>"""

# Perform replacement
old_pattern = re.compile(r'\{\/\*\s*Summary Cards\s*\*\/.*?\}\]\.map\(stat => \(.*?<\/div>\s*\)\)\}\s*<\/div>', re.DOTALL)
content = old_pattern.sub(dynamic_summary_jsx, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Summary Cards to be dynamic based on mergedData filters")
