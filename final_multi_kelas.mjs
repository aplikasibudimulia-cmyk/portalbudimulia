import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add state and fetch function
if (!content.includes('studentEnrollments')) {
  content = content.replace(
    `const [biodataForm, setBiodataForm] = useState(null)`,
    `const [biodataForm, setBiodataForm] = useState(null)
  const [studentEnrollments, setStudentEnrollments] = useState([])

  const fetchStudentEnrollments = async (nisn) => {
    const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', nisn).order('created_at', { ascending: false })
    setStudentEnrollments(data || [])
  }`
  );
  console.log("Added state");
}

// 2. Change openBiodataModal
const oldOpen = `  const openBiodataModal = (row = null) => {
    if (activeTab === 'murid') {
      setBiodataForm({
        isNew: !row,
        row: row,
        original_foreign_id: row?.foreign_id || '',`;

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
        original_foreign_id: row?.foreign_id || '',`;

if (content.includes(oldOpen)) {
  content = content.replace(oldOpen, newOpen);
  console.log("Replaced openBiodataModal");
} else {
  console.log("Cannot find oldOpen!");
}

// 3. Replace save logic
const oldSaveLogic = `        // Upsert Siswa
        await supabase.from('siswa_permanent').upsert({
          nisn: biodataForm.foreign_id,
          nama_lengkap: biodataForm.nama,
          telegram_ortu: biodataForm.telegram_ortu || null,
          no_whatsapp: formatPhoneNumber(biodataForm.no_whatsapp) || null
        }, { onConflict: 'nisn' })
        
        // Upsert Enrollment jika ada TA aktif dan Kelas
        if (activeTa) {
          if (biodataForm.kelas && biodataForm.kelas !== '-') {
            await supabase.from('enrollment').upsert({
              kode: \`\${biodataForm.kelas}_\${biodataForm.foreign_id}_\${activeTa.id}\`,
              nisn: biodataForm.foreign_id,
              kelas: biodataForm.kelas,
              tahun_ajaran_id: activeTa.id
            }, { onConflict: 'nisn,tahun_ajaran_id' })
          } else {
            await supabase.from('enrollment').delete().match({ nisn: biodataForm.foreign_id, tahun_ajaran_id: activeTa.id })
          }
        }`;

const newSaveLogic = `        // Upsert Siswa
        await supabase.from('siswa_permanent').upsert({
          nisn: biodataForm.foreign_id,
          nama_lengkap: biodataForm.nama,
          telegram_ortu: biodataForm.telegram_ortu || null,
          no_whatsapp: formatPhoneNumber(biodataForm.no_whatsapp) || null
        }, { onConflict: 'nisn' })
        
        // Upsert or Delete Enrollments for all TAs
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
  console.log("Cannot find oldSaveLogic!");
}

// 4. Replace UI
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

if (content.includes(oldUI)) {
  content = content.replace(oldUI, newUI);
  console.log("Replaced UI");
} else {
  console.log("Cannot find oldUI!");
}

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
