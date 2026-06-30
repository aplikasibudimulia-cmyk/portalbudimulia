import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update openBiodataModal
const oldOpenModal = `  const openBiodataModal = (row = null) => {
    if (activeTab === 'murid') {
      if (row) fetchStudentEnrollments(row.foreign_id)
      else setStudentEnrollments([])

      setBiodataForm({
        isNew: !row,
        selected_ta_id: activeTa?.id || '',
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',
        kelas: row?.kelas !== '-' ? row?.kelas : '',
        telegram_ortu: row?.telegram_ortu || '',
        no_whatsapp: row?.no_whatsapp || '',
        id: row?.akun_id,
        username: row?.email || '',
        password: '',
        status: row?.status || 'Aktif',
      })
    }`;

const newOpenModal = `  const openBiodataModal = async (row = null) => {
    if (activeTab === 'murid') {
      let enrollmentsMap = {};
      if (row) {
        setLoadingEnrollments(true);
        const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', row.foreign_id).order('created_at', { ascending: false });
        setStudentEnrollments(data || []);
        (data || []).forEach(e => { enrollmentsMap[e.tahun_ajaran_id] = e.kelas });
        setLoadingEnrollments(false);
      } else {
        setStudentEnrollments([]);
      }

      setBiodataForm({
        isNew: !row,
        enrollments: enrollmentsMap,
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',
        telegram_ortu: row?.telegram_ortu || '',
        no_whatsapp: row?.no_whatsapp || '',
        id: row?.akun_id,
        username: row?.email || '',
        password: '',
        status: row?.status || 'Aktif',
      })
    }`;

if (content.includes(oldOpenModal)) {
    content = content.replace(oldOpenModal, newOpenModal);
    console.log("Replaced openBiodataModal");
} else {
    console.log("FAILED to replace openBiodataModal");
    // Just string match the beginning
    const startIdx = content.indexOf("const openBiodataModal = (row = null) => {");
    if (startIdx > -1) {
        const endIdx = content.indexOf("    }", startIdx);
        if (endIdx > -1) {
           content = content.replace(content.substring(startIdx, endIdx + 5), newOpenModal);
           console.log("Replaced openBiodataModal via indexOf");
        }
    }
}

// 2. Update UI
const oldUI = `                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
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

const newUI = `                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-2 border-b pb-1">Set Kelas per Tahun Ajaran</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {tahunAjarans?.map(ta => (
                              <div key={ta.id} className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{ta.nama}</label>
                                <input 
                                  list={\`kelas-options-\${ta.id}\`}
                                  value={biodataForm.enrollments?.[ta.id] || ''} 
                                  onChange={e => setBiodataForm({
                                    ...biodataForm, 
                                    enrollments: { ...biodataForm.enrollments, [ta.id]: e.target.value }
                                  })} 
                                  placeholder="Ketik/Pilih Kelas" 
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500" 
                                />
                                <datalist id={\`kelas-options-\${ta.id}\`}>
                                  {[...new Set(students?.filter(s => s.tahun_ajaran === ta.nama).map(s => s.kelas).filter(c => c && c !== '-'))].sort().map(c => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 italic">*Kosongkan jika siswa belum terdaftar di tahun ajaran tersebut. Semua kelas yang diisi akan otomatis tersimpan saat Anda menekan tombol "Simpan Data".</p>
                        </div>`;

if (content.includes(oldUI)) {
    content = content.replace(oldUI, newUI);
    console.log("Replaced UI");
} else {
    console.log("FAILED to replace UI");
}

// 3. Update handleSaveBiodata
const oldSaveLogic = `        // Upsert or Delete Enrollment
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

const newSaveLogic = `        // Upsert or Delete Enrollments for all TAs
        if (tahunAjarans && biodataForm.enrollments) {
          for (const taObj of tahunAjarans) {
            const assignedKelas = biodataForm.enrollments[taObj.id];
            if (assignedKelas && assignedKelas.trim() !== '' && assignedKelas !== '-') {
               const { data: existingEnrol } = await supabase.from('enrollment')
                  .select('id').eq('nisn', biodataForm.foreign_id).eq('tahun_ajaran_id', taObj.id).maybeSingle();
               
               if (existingEnrol) {
                  await supabase.from('enrollment').update({ kelas: assignedKelas }).eq('id', existingEnrol.id);
               } else {
                  await supabase.from('enrollment').insert({
                    kode: \`\${assignedKelas}_\${biodataForm.foreign_id}_\${taObj.nama.replace('/', '_')}\`,
                    nisn: biodataForm.foreign_id,
                    kelas: assignedKelas,
                    tahun_ajaran_id: taObj.id
                  });
               }
            } else {
               // If empty, delete any existing enrollment for this TA
               await supabase.from('enrollment').delete().match({ 
                 nisn: biodataForm.foreign_id, 
                 tahun_ajaran_id: taObj.id 
               })
            }
          }
        }`;

if (content.includes(oldSaveLogic)) {
    content = content.replace(oldSaveLogic, newSaveLogic);
    console.log("Replaced save logic");
} else {
    console.log("FAILED to replace save logic");
    const startIdx = content.indexOf('// Upsert or Delete Enrollment');
    if (startIdx > -1) {
       const endIdx = content.indexOf('      } else {', startIdx);
       if (endIdx > -1) {
          content = content.replace(content.substring(startIdx, endIdx), newSaveLogic + '\n');
          console.log("Replaced save logic via indexOf");
       }
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
