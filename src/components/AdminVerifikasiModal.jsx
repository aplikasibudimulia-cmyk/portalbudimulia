import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

export default function AdminVerifikasiModal({ type, students, onClose }) {
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [verifikasiData, setVerifikasiData] = useState({})
  
  // Ambil semua data berkas yang ada untuk pengumuman ini
  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('berkas_pengumuman')
        .select('kode_siswa, persyaratan_terpenuhi')
        .eq('kode_jenis', type.kode_jenis)
      
      if (!error && data) {
        const map = {}
        data.forEach(item => {
          map[item.kode_siswa] = item.persyaratan_terpenuhi || {}
        })
        setVerifikasiData(map)
      }
    }
    fetchData()
  }, [type.kode_jenis])

  const reqs = type.persyaratan || []

  // Filter students based on search
  const filteredStudents = students.filter(s => 
    (s.nama_lengkap || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.nisn || '').includes(searchTerm)
  )

  const handleToggle = (kodeSiswa, reqId, currentStatus) => {
    setVerifikasiData(prev => {
      const studentData = prev[kodeSiswa] || {}
      return {
        ...prev,
        [kodeSiswa]: {
          ...studentData,
          [reqId]: !currentStatus
        }
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const validKodes = Object.keys(verifikasiData)
    
    // We update the DB
    try {
      for (const kode of validKodes) {
        const { error } = await supabase.from('berkas_pengumuman')
          .update({ persyaratan_terpenuhi: verifikasiData[kode] })
          .eq('kode_siswa', kode)
          .eq('kode_jenis', type.kode_jenis)
        
        // If row doesn't exist, upsert instead
        if (error) {
          await supabase.from('berkas_pengumuman').upsert({
             kode_siswa: kode,
             kode_jenis: type.kode_jenis,
             persyaratan_terpenuhi: verifikasiData[kode]
          }, { onConflict: 'kode_siswa,kode_jenis' })
        }
      }
      logActivity({ userRole: 'Administrator', action: 'Verifikasi Persyaratan', details: `Memperbarui verifikasi persyaratan untuk dokumen ${type.nama}.` })
      onClose()
    } catch (err) {
      alert("Terjadi kesalahan saat menyimpan: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBulkToggle = (reqId, status) => {
    setVerifikasiData(prev => {
      const next = { ...prev }
      filteredStudents.forEach(s => {
        const kode = String(s.kode || '').trim()
        if (kode) {
          next[kode] = { ...(next[kode] || {}), [reqId]: status }
        }
      })
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col animate-scale-in">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Verifikasi Persyaratan: {type.nama}</h2>
            <p className="text-sm text-slate-500 mt-1">Centang kotak untuk menandai bahwa siswa telah memenuhi persyaratan.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-4 items-center justify-between shrink-0">
          <input 
            type="text" 
            placeholder="Cari siswa..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl text-sm w-full md:w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <div className="flex gap-2">
            <span className="text-xs font-medium text-slate-500 self-center mr-2">Aksi Massal (Hasil Filter):</span>
            {reqs.map(req => (
              <div key={req.id} className="flex gap-1 border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button 
                  onClick={() => handleBulkToggle(req.id, true)} 
                  className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100"
                  title={`Centang semua ${req.nama}`}
                >✓ {req.nama}</button>
                <button 
                  onClick={() => handleBulkToggle(req.id, false)} 
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100"
                  title={`Hapus centang semua ${req.nama}`}
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {reqs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500">Tidak ada persyaratan yang diatur untuk dokumen ini.</p>
            </div>
          ) : (
            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Kelas</th>
                    {reqs.map(req => (
                      <th key={req.id} className="px-4 py-3 font-semibold text-center">{req.nama}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(student => {
                    const kode = String(student.kode || '').trim()
                    if (!kode) return null
                    
                    const studentReqs = verifikasiData[kode] || {}
                    const isAllChecked = reqs.every(r => studentReqs[r.id])

                    return (
                      <tr key={kode} className={`hover:bg-slate-50/50 ${isAllChecked ? 'bg-green-50/30' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{student.nama_lengkap}</p>
                          <p className="text-xs text-slate-500 font-mono">{student.nisn}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.kelas}</td>
                        {reqs.map(req => {
                          const isChecked = !!studentReqs[req.id]
                          return (
                            <td key={req.id} className="px-4 py-3 text-center">
                              <label className="inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  checked={isChecked}
                                  onChange={() => handleToggle(kode, req.id, isChecked)}
                                />
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={2 + reqs.length} className="px-4 py-8 text-center text-slate-500">
                        Siswa tidak ditemukan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Batal
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || reqs.length === 0}
            className="px-5 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Simpan Verifikasi'}
          </button>
        </div>
      </div>
    </div>
  )
}
