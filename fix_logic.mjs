import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

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
    fs.writeFileSync(path, content, 'utf8');
    console.log("SUCCESS exact match");
} else {
    // Try to replace by index
    const startIdx = content.indexOf('// Upsert or Delete Enrollment');
    const endIdx = content.indexOf('      } else {', startIdx);
    if (startIdx > -1 && endIdx > -1) {
        const oldStr = content.substring(startIdx, endIdx);
        content = content.replace(oldStr, newLogic + '\\n');
        fs.writeFileSync(path, content, 'utf8');
        console.log("SUCCESS index match");
    } else {
        console.log("FAILED");
    }
}
