const fs = require('fs');

let content = fs.readFileSync('src/components/AdminManajemenAkunSection.jsx', 'utf8');
const lines = content.split(/\r?\n/);

let out = [];
let i = 0;
while (i < lines.length) {
    let line = lines[i];

    // 1. Insert State
    if (line.includes('const [biodataForm, setBiodataForm] = useState(null)')) {
        out.push(line);
        out.push('  const [studentEnrollments, setStudentEnrollments] = useState([])');
        out.push('');
        out.push('  const fetchStudentEnrollments = async (nisn) => {');
        out.push("    const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', nisn).order('created_at', { ascending: false })");
        out.push('    setStudentEnrollments(data || [])');
        out.push('  }');
        i++;
        continue;
    }

    // 2. Modify openBiodataModal
    if (line.includes('const openBiodataModal = (row = null) => {')) {
        out.push('  const openBiodataModal = async (row = null) => {');
        i++;
        continue;
    }

    if (line.includes("if (activeTab === 'murid') {") && lines[i-1].includes('openBiodataModal')) {
        out.push(line);
        out.push('      let enrollmentsMap = {};');
        out.push('      if (row) {');
        out.push("        const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', row.foreign_id).order('created_at', { ascending: false });");
        out.push('        setStudentEnrollments(data || []);');
        out.push('        (data || []).forEach(e => { enrollmentsMap[e.tahun_ajaran_id] = e.kelas });');
        out.push('      } else {');
        out.push('        setStudentEnrollments([]);');
        out.push('      }');
        i++;
        continue;
    }

    if (line.includes('isNew: !row,')) {
        out.push(line);
        out.push('        enrollments: enrollmentsMap,');
        i++;
        continue;
    }

    // 3. Modify Save logic
    if (line.includes('// Upsert or Delete Enrollment')) {
        // Skip lines until the end of this block
        while (!lines[i].includes('} else {') && !lines[i].includes('// Upsert Guru')) {
            i++;
        }
        out.push('        // Upsert or Delete Enrollments for all TAs');
        out.push('        if (tahunAjarans && biodataForm.enrollments) {');
        out.push('          for (const taObj of tahunAjarans) {');
        out.push('            const assignedKelas = biodataForm.enrollments[taObj.id];');
        out.push("            if (assignedKelas && assignedKelas.trim() !== '' && assignedKelas !== '-') {");
        out.push("               const { data: existingEnrol } = await supabase.from('enrollment')");
        out.push("                  .select('id').eq('nisn', biodataForm.foreign_id).eq('tahun_ajaran_id', taObj.id).maybeSingle();");
        out.push('               ');
        out.push('               if (existingEnrol) {');
        out.push("                  await supabase.from('enrollment').update({ kelas: assignedKelas }).eq('id', existingEnrol.id);");
        out.push('               } else {');
        out.push("                  await supabase.from('enrollment').insert({");
        out.push("                    kode: `${assignedKelas}_${biodataForm.foreign_id}_${taObj.nama.replace('/', '_')}`,");
        out.push('                    nisn: biodataForm.foreign_id,');
        out.push('                    kelas: assignedKelas,');
        out.push('                    tahun_ajaran_id: taObj.id');
        out.push('                  });');
        out.push('               }');
        out.push('            } else {');
        out.push('               // If empty, delete any existing enrollment for this TA');
        out.push("               await supabase.from('enrollment').delete().match({ ");
        out.push('                 nisn: biodataForm.foreign_id, ');
        out.push('                 tahun_ajaran_id: taObj.id ');
        out.push('               })');
        out.push('            }');
        out.push('          }');
        out.push('        }');
        continue;
    }

    // 4. Modify UI
    if (line.includes('Kelas (TA: {activeTa?.nama})')) {
        // We are at the `<label>` of the UI. Wait, we want to replace the whole `md:col-span-2` div.
        // We need to pop the previous line `<div className="md:col-span-2">`
        out.pop();
        
        // Skip until the closing div of this block
        i++; // skip label
        i++; // skip input
        i++; // skip /div
        
        // Insert new UI
        out.push('                        <div className="md:col-span-2">');
        out.push('                          <label className="block text-xs font-bold text-slate-700 mb-2 border-b pb-1">Set Kelas per Tahun Ajaran</label>');
        out.push('                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">');
        out.push('                            {tahunAjarans?.map(ta => (');
        out.push('                              <div key={ta.id} className="bg-slate-50 p-2 rounded-xl border border-slate-200">');
        out.push('                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{ta.nama}</label>');
        out.push('                                <input ');
        out.push('                                  list={`kelas-options-${ta.id}`}');
        out.push("                                  value={biodataForm.enrollments?.[ta.id] || ''} ");
        out.push('                                  onChange={e => setBiodataForm({');
        out.push('                                    ...biodataForm, ');
        out.push('                                    enrollments: { ...biodataForm.enrollments, [ta.id]: e.target.value }');
        out.push('                                  })} ');
        out.push('                                  placeholder="Ketik/Pilih Kelas" ');
        out.push('                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500" ');
        out.push('                                />');
        out.push('                                <datalist id={`kelas-options-${ta.id}`}>');
        out.push("                                  {[...new Set(students?.filter(s => s.tahun_ajaran === ta.nama).map(s => s.kelas).filter(c => c && c !== '-'))].sort().map(c => (");
        out.push('                                    <option key={c} value={c} />');
        out.push('                                  ))}');
        out.push('                                </datalist>');
        out.push('                              </div>');
        out.push('                            ))}');
        out.push('                          </div>');
        out.push('                          <p className="text-[10px] text-slate-500 mt-1 italic">*Kosongkan jika siswa belum terdaftar di tahun ajaran tersebut. Semua kelas yang diisi akan otomatis tersimpan saat Anda menekan tombol "Simpan Data".</p>');
        out.push('                        </div>');
        continue;
    }

    out.push(line);
    i++;
}

fs.writeFileSync('src/components/AdminManajemenAkunSection.jsx', out.join('\n'), 'utf8');
console.log("Done");
