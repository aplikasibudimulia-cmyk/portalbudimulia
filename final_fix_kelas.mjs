import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add selected_ta_id
content = content.replace(
    "isNew: !row,",
    "isNew: !row,\n        selected_ta_id: activeTa?.id || '',"
);

// 2. UI Replace
const oldUI = `                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>
                          <input value={biodataForm.kelas} onChange={e => setBiodataForm({...biodataForm, kelas: e.target.value})} placeholder="Contoh: X.1" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>`;

const newUI = `                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                            <select 
                              value={biodataForm.selected_ta_id || ''} 
                              onChange={e => {
                                 const taId = e.target.value;
                                 const enrol = studentEnrollments.find(en => en.tahun_ajaran_id === taId);
                                 setBiodataForm({...biodataForm, selected_ta_id: taId, kelas: enrol?.kelas || ''});
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                              <option value="">-- Pilih TA --</option>
                              {tahunAjarans?.map(ta => <option key={ta.id} value={ta.id}>{ta.nama}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
                            <input 
                              list="kelas-options" 
                              value={biodataForm.kelas || ''} 
                              onChange={e => setBiodataForm({...biodataForm, kelas: e.target.value})} 
                              placeholder="Ketik/Pilih kelas..." 
                              className="w-full px-3 py-2 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" 
                            />
                            <datalist id="kelas-options">
                              {[...new Set(students?.filter(s => s.tahun_ajaran === tahunAjarans?.find(ta => ta.id === biodataForm.selected_ta_id)?.nama).map(s => s.kelas).filter(c => c && c !== '-'))].sort().map(c => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          </div>
                        </div>`;

if (content.includes(oldUI)) {
    content = content.replace(oldUI, newUI);
    console.log("UI Replace SUCCESS");
} else {
    // try line by line
    const startLineIdx = content.split('\\n').findIndex(l => l.includes('<label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>'));
    if (startLineIdx !== -1) {
       let lines = content.split('\\n');
       lines.splice(startLineIdx - 1, 4, newUI);
       content = lines.join('\\n');
       console.log("UI Replace line-by-line SUCCESS");
    } else {
       console.log("UI Replace FAILED");
    }
}

// 3. Logic Replace
const oldLogic = `        // Upsert or Delete Enrollment
        if (activeTa) {
          if (biodataForm.kelas && biodataForm.kelas !== '-') {
            if (biodataForm.isNew) {
              await supabase.from('enrollment').insert({
                kode: \`\${biodataForm.kelas}_\${biodataForm.foreign_id}_\${activeTa.nama.replace('/', '_')}\`,
                nisn: biodataForm.foreign_id,
                kelas: biodataForm.kelas,
                tahun_ajaran_id: activeTa.id
              })
            } else {
              await supabase.from('enrollment')
                .update({ kelas: biodataForm.kelas })
                .match({ nisn: biodataForm.foreign_id, tahun_ajaran_id: activeTa.id })
            }
          } else {
            // Jika kelas dikosongkan atau '-', hapus enrollment untuk TA aktif ini
            await supabase.from('enrollment').delete().match({ 
              nisn: biodataForm.foreign_id, 
              tahun_ajaran_id: activeTa.id 
            })
          }
        }`;

const newLogic = `        // Upsert or Delete Enrollment
        if (biodataForm.selected_ta_id) {
          const taObj = tahunAjarans?.find(t => t.id === biodataForm.selected_ta_id);
          if (biodataForm.kelas && biodataForm.kelas !== '-') {
             // Check if it already exists
             const { data: existingEnrol } = await supabase.from('enrollment')
                .select('id').eq('nisn', biodataForm.foreign_id).eq('tahun_ajaran_id', biodataForm.selected_ta_id).maybeSingle();
             
             if (existingEnrol) {
                await supabase.from('enrollment').update({ kelas: biodataForm.kelas }).eq('id', existingEnrol.id);
             } else {
                await supabase.from('enrollment').insert({
                  kode: \`\${biodataForm.kelas}_\${biodataForm.foreign_id}_\${taObj?.nama.replace('/', '_')}\`,
                  nisn: biodataForm.foreign_id,
                  kelas: biodataForm.kelas,
                  tahun_ajaran_id: biodataForm.selected_ta_id
                });
             }
          } else {
            await supabase.from('enrollment').delete().match({ 
              nisn: biodataForm.foreign_id, 
              tahun_ajaran_id: biodataForm.selected_ta_id 
            })
          }
        }`;

if (content.includes(oldLogic)) {
    content = content.replace(oldLogic, newLogic);
    console.log("Logic Replace SUCCESS");
} else {
    // Try to find it line by line
    const logicStartLine = content.split('\\n').findIndex(l => l.includes('// Upsert or Delete Enrollment'));
    if (logicStartLine !== -1) {
        let lines = content.split('\\n');
        // Find the matching end brace.
        // Or just replace the exact range.
        const endLine = lines.findIndex((l, i) => i > logicStartLine && l.includes('// Upsert Guru'));
        if (endLine !== -1) {
           lines.splice(logicStartLine, endLine - logicStartLine - 3, newLogic);
           content = lines.join('\\n');
           console.log("Logic Replace line-by-line SUCCESS");
        } else {
           console.log("Logic Replace end bound FAILED");
        }
    } else {
        console.log("Logic Replace FAILED");
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
