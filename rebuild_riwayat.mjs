import fs from 'fs';

const path = 'src/components/AdminManajemenAkunSection.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add State variables
if (!content.includes('studentEnrollments')) {
    content = content.replace(
        "const [biodataForm, setBiodataForm] = useState(null)",
        `const [biodataForm, setBiodataForm] = useState(null)\n  const [studentEnrollments, setStudentEnrollments] = useState([])\n  const [loadingEnrollments, setLoadingEnrollments] = useState(false)\n  const [newEnrollment, setNewEnrollment] = useState({ tahun_ajaran_id: '', kelas: '' })`
    );
}

// 2. Add functions
if (!content.includes('fetchStudentEnrollments')) {
    const functionsStr = `
  const fetchStudentEnrollments = async (nisn) => {
    setLoadingEnrollments(true)
    const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', nisn).order('created_at', { ascending: false })
    setStudentEnrollments(data || [])
    setLoadingEnrollments(false)
  }

  const handleDeleteEnrollment = async (enrolId) => {
    if (!confirm('Yakin ingin menghapus riwayat kelas ini?')) return
    setIsProcessing(true)
    await supabase.from('enrollment').delete().eq('id', enrolId)
    await fetchStudentEnrollments(biodataForm.foreign_id)
    await fetchData()
    setIsProcessing(false)
  }

  const handleAddEnrollment = async () => {
    if (!newEnrollment.tahun_ajaran_id || !newEnrollment.kelas) return
    setIsProcessing(true)
    
    // Check if enrollment for this TA already exists
    const existing = studentEnrollments.find(e => e.tahun_ajaran_id === newEnrollment.tahun_ajaran_id)
    if (existing) {
       // Update
       const { error } = await supabase.from('enrollment').update({ kelas: newEnrollment.kelas }).eq('id', existing.id)
       if (error) alert(error.message)
    } else {
       // Insert
       const { error } = await supabase.from('enrollment').insert({
         nisn: biodataForm.foreign_id,
         tahun_ajaran_id: newEnrollment.tahun_ajaran_id,
         kelas: newEnrollment.kelas
       })
       if (error) alert(error.message)
    }
    
    setNewEnrollment({ tahun_ajaran_id: '', kelas: '' })
    await fetchStudentEnrollments(biodataForm.foreign_id)
    await fetchData()
    setIsProcessing(false)
  }
`;
    content = content.replace(
        "const openBiodataModal = (row = null) => {",
        functionsStr + "\n  const openBiodataModal = (row = null) => {"
    );
}

// 3. Call fetchStudentEnrollments in openBiodataModal
if (!content.includes('fetchStudentEnrollments(row.foreign_id)')) {
    content = content.replace(
        "akun_status: row?.hasAkun ? row.status : 'aktif',",
        "akun_status: row?.hasAkun ? row.status : 'aktif',"
    );
    // Actually, let's just replace the setBiodataForm inside openBiodataModal murid block
    content = content.replace(
        "setBiodataForm({\n        isNew: !row,",
        "if (row) fetchStudentEnrollments(row.foreign_id);\n      setStudentEnrollments([]);\n      setNewEnrollment({ tahun_ajaran_id: '', kelas: '' });\n      setBiodataForm({\n        isNew: !row,"
    );
}

// 4. Replace the UI block
const oldUI = `                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>
                          <input value={biodataForm.kelas} onChange={e => setBiodataForm({...biodataForm, kelas: e.target.value})} placeholder="Contoh: X.1" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>`;

const newUI = `                        <div className="md:col-span-2 mt-2 border-t pt-4">
                          <h5 className="text-xs font-bold text-slate-800 mb-2 border-b pb-1">Riwayat Kelas (Enrollment)</h5>
                          {biodataForm.isNew ? (
                            <div className="bg-amber-50 text-amber-700 text-xs p-3 rounded-xl border border-amber-200">
                              Anda sedang menambahkan data siswa baru. Silakan isi NISN & Nama lalu klik <strong>Simpan Data</strong> terlebih dahulu. Setelah tersimpan, klik kembali nama siswa untuk mengatur riwayat kelasnya.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {loadingEnrollments ? (
                                <p className="text-xs text-slate-500 animate-pulse">Memuat riwayat kelas...</p>
                              ) : (
                                <>
                                  {studentEnrollments.length > 0 ? (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                      <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 border-b">
                                          <tr>
                                            <th className="px-3 py-2 font-medium text-slate-600">Tahun Ajaran</th>
                                            <th className="px-3 py-2 font-medium text-slate-600">Kelas</th>
                                            <th className="px-3 py-2 font-medium text-slate-600 text-center w-12">Aksi</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {studentEnrollments.map((enrol) => (
                                            <tr key={enrol.id} className="border-b last:border-0 hover:bg-slate-50">
                                              <td className="px-3 py-2">{enrol.tahun_ajaran?.nama || '-'}</td>
                                              <td className="px-3 py-2 font-medium">{enrol.kelas}</td>
                                              <td className="px-3 py-2 text-center">
                                                <button type="button" onClick={() => handleDeleteEnrollment(enrol.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Hapus Kelas">
                                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">Siswa ini belum memiliki riwayat kelas.</p>
                                  )}
                                  
                                  <div className="flex items-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                    <div className="flex-1">
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Tahun Ajaran</label>
                                      <select value={newEnrollment.tahun_ajaran_id} onChange={e => setNewEnrollment({...newEnrollment, tahun_ajaran_id: e.target.value})} className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500">
                                        <option value="">-- Pilih TA --</option>
                                        {tas.map(ta => <option key={ta.id} value={ta.id}>{ta.nama}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Kelas</label>
                                      <input list="kelas-options" value={newEnrollment.kelas} onChange={e => setNewEnrollment({...newEnrollment, kelas: e.target.value})} placeholder="Ketik/Pilih" className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500" />
                                      <datalist id="kelas-options">
                                        {[...new Set(students?.map(s => s.kelas).filter(c => c && c !== '-'))].sort().map(c => (
                                          <option key={c} value={c} />
                                        ))}
                                      </datalist>
                                    </div>
                                    <button type="button" onClick={handleAddEnrollment} disabled={!newEnrollment.tahun_ajaran_id || !newEnrollment.kelas || isProcessing} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors whitespace-nowrap h-[34px]">
                                      Set Kelas
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>`;

if (content.includes(oldUI)) {
    content = content.replace(oldUI, newUI);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully rebuilt Riwayat Kelas!');
