import fs from 'fs';

let content = fs.readFileSync('src/components/AdminManajemenAkunSection.jsx', 'utf8');

// 1. Add state
const oldState = `  const [biodataForm, setBiodataForm] = useState(null)`;
const newState = `  const [biodataForm, setBiodataForm] = useState(null)
  const [studentEnrollments, setStudentEnrollments] = useState([])

  const fetchStudentEnrollments = async (nisn) => {
    const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', nisn).order('created_at', { ascending: false })
    setStudentEnrollments(data || [])
  }`;
content = content.replace(oldState, newState);

// 2. Add openBiodataModal
const oldOpen = `  const openBiodataModal = (row = null) => {
    if (activeTab === 'murid') {
      setBiodataForm({
        isNew: !row,
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',
        kelas: row?.kelas !== '-' ? row?.kelas : '',`;
const newOpen = `  const openBiodataModal = async (row = null) => {
    if (activeTab === 'murid') {
      let enrollmentsMap = {};
      if (row) {
        const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', row.foreign_id).order('created_at', { ascending: false });
        setStudentEnrollments(data || []);
        (data || []).forEach(e => { enrollmentsMap[e.tahun_ajaran_id] = e.kelas });
      } else {
        setStudentEnrollments([]);
      }

      setBiodataForm({
        isNew: !row,
        enrollments: enrollmentsMap,
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',`;
content = content.replace(oldOpen, newOpen);

// 3. Save Logic
const oldSave = `        // Upsert or Delete Enrollment
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
const newSave = `        // Upsert or Delete Enrollments for all TAs
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
               await supabase.from('enrollment').delete().match({ 
                 nisn: biodataForm.foreign_id, 
                 tahun_ajaran_id: taObj.id 
               })
            }
          }
        }`;
content = content.replace(oldSave, newSave);

// 4. UI
const oldUI = `                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>
                          <input value={biodataForm.kelas} onChange={e => setBiodataForm({...biodataForm, kelas: e.target.value})} placeholder="Contoh: X.1" className="w-full px-3 py-2 border rounded-2xl text-sm" />
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
                          <p className="text-[10px] text-slate-500 mt-1 italic">*Kosongkan jika siswa belum terdaftar di tahun ajaran tersebut.</p>
                        </div>`;
content = content.replace(oldUI, newUI);

fs.writeFileSync('src/components/AdminManajemenAkunSection.jsx', content, 'utf8');
console.log("Applied successfully");
