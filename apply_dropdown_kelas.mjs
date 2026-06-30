import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add selected_ta_id to initial biodataForm
content = content.replace(
    "isNew: !row,",
    "isNew: !row,\n        selected_ta_id: activeTa?.id || '',"
);

// 2. Replace the UI block
// First try to find the "Riwayat Kelas (Enrollment)" block. If found, replace it.
// If not found, try to find the simple "Kelas (TA: ...)" block.

const simpleUI = `                        <div className="md:col-span-2">
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

const riwayatStartStr = '<div className="md:col-span-2 mt-2 border-t pt-4">';
const noWhatsappStr = '<label className="block text-xs font-medium text-slate-700 mb-1">No. WhatsApp</label>';

if (content.includes(riwayatStartStr)) {
    const riwayatStartIndex = content.indexOf(riwayatStartStr);
    const noWhatsappIndex = content.indexOf(noWhatsappStr, riwayatStartIndex);
    if (noWhatsappIndex > -1) {
        // Find the div wrapper of no. whatsapp which is `<div className="md:col-span-2 grid grid-cols-2 gap-4">`
        const noWhatsappWrapperIndex = content.lastIndexOf('<div className="md:col-span-2 grid grid-cols-2 gap-4">', noWhatsappIndex);
        if (noWhatsappWrapperIndex > -1) {
            const oldBlock = content.substring(riwayatStartIndex, noWhatsappWrapperIndex);
            content = content.replace(oldBlock, newUI + '\n                        ');
            console.log("Replaced Riwayat Kelas block!");
        } else {
            console.log("Could not find noWhatsappWrapperIndex");
        }
    } else {
        console.log("Could not find noWhatsappStr");
    }
} else if (content.includes(simpleUI)) {
    content = content.replace(simpleUI, newUI);
    console.log("Replaced simple Kelas UI!");
} else {
    console.log("Could not find either UI block!");
}

// 4. Modify handleSaveBiodata
const oldSaveLogic = `        // Upsert or Delete Enrollment
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

const newSaveLogic = `        // Upsert or Delete Enrollment
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

if (content.includes(oldSaveLogic)) {
    content = content.replace(oldSaveLogic, newSaveLogic);
    console.log("Replaced save logic!");
} else {
    console.log("Could not find the old save logic!");
}

fs.writeFileSync(path, content, 'utf8');
console.log("Applied dropdown kelas UI successfully!");
