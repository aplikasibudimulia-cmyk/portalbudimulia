import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import PiketDashboardSection from '../components/PiketDashboardSection'
import DataPresensiSiswaSection from '../components/DataPresensiSiswaSection'
import NilaiGuruSection from '../components/NilaiGuruSection'

const IconDashboard = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
const IconUsers = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
const IconKey = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
const IconLogout = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
const IconFile = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
const IconUser = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
const IconNilai = () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h4"/></svg>

const Toggle = ({ value, onChange, disabled, colorOn = 'bg-green-500' }) => (
  <button onClick={() => onChange(!value)} disabled={disabled}
    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none ${value ? colorOn : 'bg-slate-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
)

const StudentAvatar = ({ student, fotos, className }) => {
  const DEFAULT_AVATAR = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama_lengkap)}&background=eff6ff&color=2563eb&size=150`
  const sPhoto = fotos?.find(f => f.nisn === student.nisn)?.cloudinary_url || `https://res.cloudinary.com/dwyhpysp5/image/upload/SKL-BM/FOTO_${student.nisn}_${student.tahun_ajaran_id}`
  
  const [imgSrc, setImgSrc] = useState(sPhoto)
  
  useEffect(() => {
    setImgSrc(sPhoto)
  }, [sPhoto])
  
  return (
    <img 
      src={imgSrc} 
      alt={student.nama_lengkap} 
      className={className}
      onError={() => {
        if (imgSrc !== DEFAULT_AVATAR) {
          setImgSrc(DEFAULT_AVATAR)
        }
      }}
    />
  )
}

function GuruAnnouncementSection({ type, students, fitur, fotos }) {
  const [files, setFiles] = useState(new Set())
  const [fileUrls, setFileUrls] = useState({})
  const [fileAccess, setFileAccess] = useState({})
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [fileReqs, setFileReqs] = useState({})
  const [activityLogs, setActivityLogs] = useState([])
  const [toggling, setToggling] = useState(null)
  const [previewPdf, setPreviewPdf] = useState(null)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(fitur.has('kelola_pengumuman'))
  
  useEffect(() => {
    if (previewPdf) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [previewPdf])
  
  const canKelola = fitur.has('kelola_pengumuman')
  const canLihat = fitur.has('lihat_dokumen')

  // Filter students based on roles
  const session = JSON.parse(localStorage.getItem('guru_session') || '{}')
  const allowedClasses = canKelola ? null : (session.kelas || []).map(k => k.kelas)
  const displayStudents = allowedClasses ? students.filter(s => allowedClasses.includes(s.kelas)) : students

  const uniqueClasses = [...new Set(displayStudents.map(s => s.kelas).filter(Boolean))].sort()

  useEffect(() => { 
    fetchFiles() 
    fetchActivityLogs()
  }, [type.id])

  const fetchActivityLogs = async () => {
    const { data } = await supabase.from('activity_log')
      .select('*')
      .eq('aksi', 'Unduh Dokumen')
      .ilike('detail', `%${type.nama}%`)
    setActivityLogs(data || [])
  }

  const fetchFiles = async () => {
    const { data } = await supabase.from('berkas_pengumuman')
      .select('kode_siswa, file_name, file_url, is_accessible, persyaratan_terpenuhi')
      .eq('kode_jenis', type.kode_jenis)
    
    setFiles(new Set(data?.map(f => f.file_name).filter(Boolean) ?? []))
    setFileUrls(data?.reduce((acc, f) => f.file_name ? {...acc, [f.file_name]: f.file_url} : acc, {}) ?? {})
    setFileAccess(data?.reduce((acc, f) => f.file_name ? {...acc, [f.file_name]: f.is_accessible} : acc, {}) ?? {})
    setFileReqs(data?.reduce((acc, f) => ({...acc, [f.kode_siswa]: f.persyaratan_terpenuhi || {}}), {}) ?? {})
  }

  const handleToggleReq = async (kode, reqId) => {
    const currentReqs = fileReqs[kode] || {}
    const newStatus = !currentReqs[reqId]
    const updatedReqs = { ...currentReqs, [reqId]: newStatus }
    
    setToggling(`${kode}_req_${reqId}`)
    
    const hasFileForSingle = files.has(`${kode}${type.kode_jenis}.pdf`)
    const fNameSingle = `${kode}${type.kode_jenis}.pdf`
    
    const { error: upsertErr } = await supabase.from('berkas_pengumuman').upsert({
      kode_siswa: kode,
      kode_jenis: type.kode_jenis,
      persyaratan_terpenuhi: updatedReqs,
      file_name: hasFileForSingle ? fNameSingle : '-',
      file_url: hasFileForSingle ? (fileUrls[fNameSingle] || '-') : '-'
    }, { onConflict: 'kode_siswa,kode_jenis' })
    
    if (upsertErr) alert('Gagal: ' + upsertErr.message)
    else setFileReqs(prev => ({ ...prev, [kode]: updatedReqs }))
    
    setToggling(null)
  }

  const handleMassToggleReq = async (reqId, targetStatus) => {
    if (!window.confirm(`Anda yakin ingin ${targetStatus ? 'mencentang' : 'menghapus centang'} syarat ini untuk semua siswa yang tampil di bawah?`)) return
    const codes = filteredStudents.map(s => s.kode).filter(Boolean)
    if (codes.length === 0) return
    setToggling(`mass_req_${reqId}`)
    
    const upserts = codes.map(kode => {
      const currentReqs = fileReqs[kode] || {}
      const fName = `${kode}${type.kode_jenis}.pdf`
      const hasFile = files.has(fName)
      return {
        kode_siswa: kode,
        kode_jenis: type.kode_jenis,
        persyaratan_terpenuhi: { ...currentReqs, [reqId]: targetStatus },
        file_name: hasFile ? fName : '-',
        file_url: hasFile ? (fileUrls[fName] || '-') : '-'
      }
    })
    
    const { error } = await supabase.from('berkas_pengumuman').upsert(upserts, { onConflict: 'kode_siswa,kode_jenis' })
    if (error) {
      alert('Gagal mengubah massal: ' + error.message)
    } else {
      const newFileReqs = { ...fileReqs }
      codes.forEach(kode => {
        newFileReqs[kode] = { ...(newFileReqs[kode] || {}), [reqId]: targetStatus }
      })
      setFileReqs(newFileReqs)
    }
    setToggling(null)
  }

  const handleToggleGlobal = async (status) => {
    if (!window.confirm(`Anda yakin ingin ${status ? 'membuka' : 'menutup'} akses global untuk semua siswa pada menu ini?`)) return
    const { error } = await supabase.from('jenis_pengumuman').update({ aktif: status }).eq('id', type.id)
    if (error) {
      alert('Gagal mengubah akses global: ' + error.message)
    } else {
      type.aktif = status // mutate locally for immediate feedback
      // refresh not entirely needed if we mutate, but we should trigger re-render in parent if possible
      
      const session = JSON.parse(localStorage.getItem('guru_session') || '{}')
      logActivity({
        userId: session.id,
        userRole: session.role || 'Guru',
        action: 'Ubah Akses Global',
        details: `${status ? 'Membuka' : 'Menutup'} akses global untuk pengumuman: ${type.nama}`
      })
    }
  }

  const handleToggleFileAccess = async (kode, fileName) => {
    const currentStatus = fileAccess[fileName]
    setToggling(fileName)
    const { error } = await supabase.from('berkas_pengumuman')
      .update({ is_accessible: !currentStatus })
      .match({ kode_siswa: kode, kode_jenis: type.kode_jenis })
    if (error) {
      alert('Gagal mengubah akses: ' + error.message)
    } else {
      setFileAccess(prev => ({ ...prev, [fileName]: !currentStatus }))
      const session = JSON.parse(localStorage.getItem('guru_session') || '{}')
      logActivity({
        userId: session.id,
        userRole: session.role || 'Guru',
        action: 'Toggle Akses File',
        details: `${!currentStatus ? 'Membuka' : 'Menutup'} akses dokumen ${fileName}`
      })
    }
    setToggling(null)
  }

  const handlePreview = (student) => {
    const fileName = `${student.kode}${type.kode_jenis}.pdf`
    const url = fileUrls[fileName]
    if (!url) { alert('File tidak ditemukan untuk ' + student.nama_lengkap); return }
    setPreviewPdf({ url, student })
  }

  let filteredStudents = displayStudents
  if (classFilter !== 'all') filteredStudents = filteredStudents.filter(s => s.kelas === classFilter)
  if (search) {
    const query = search.toLowerCase()
    filteredStudents = filteredStudents.filter(s => s.nama_lengkap.toLowerCase().includes(query) || s.nisn.includes(query))
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{type.nama}</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola dokumen pengumuman untuk siswa Anda</p>
        </div>
        
        {canKelola && (
          <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div>
              <p className="text-sm font-bold text-slate-800">Akses Global (Semua Siswa)</p>
              <p className="text-xs text-slate-500">Buka/tutup akses tombol di dashboard siswa</p>
            </div>
            <Toggle value={type.aktif} onChange={(val) => handleToggleGlobal(val)} />
          </div>
        )}
      </div>

        <div className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row gap-4">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px] lg:min-h-0 min-w-0">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
              <div className="relative flex-1">
                <input type="text" placeholder="Cari nama atau NISN..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="all">Semua Kelas</option>
                {uniqueClasses.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="px-5 py-3 font-semibold w-12 text-center">No</th>
                <th className="px-5 py-3 font-semibold">Nama & NISN</th>
                <th className="px-5 py-3 font-semibold text-center">Kelas</th>
                <th className="px-5 py-3 font-semibold text-center w-24">Berkas</th>
                {type.persyaratan && type.persyaratan.map(req => (
                  <th key={req.id} className="text-center px-2 py-2.5 w-20">
                    <div className="flex flex-col items-center gap-1">
                      <span className="max-w-[70px] truncate" title={req.nama}>{req.nama}</span>
                      {canKelola && (
                        <div className="flex gap-0.5 mt-1">
                          <button onClick={() => handleMassToggleReq(req.id, true)} disabled={toggling === `mass_req_${req.id}`}
                            className="text-[9px] bg-green-50 text-green-600 px-1 py-0.5 rounded border border-green-200 hover:bg-green-100 font-bold leading-none" title="Centang Semua">✓</button>
                          <button onClick={() => handleMassToggleReq(req.id, false)} disabled={toggling === `mass_req_${req.id}`}
                            className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded border border-red-200 hover:bg-red-100 font-bold leading-none" title="Hapus Centang">✗</button>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-5 py-3 font-semibold text-center">Status Unduh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">Tidak ada siswa yang cocok.</td></tr>
              ) : filteredStudents.map((s, idx) => {
                const fileName = `${s.kode}${type.kode_jenis}.pdf`
                const hasFile = files.has(fileName)
                const isAccessible = fileAccess[fileName]
                const isToggling = toggling === fileName

                return (
                  <tr key={s.id} className="group hover:bg-slate-50/50 bg-white">
                    <td className="px-5 py-3 text-center text-slate-500">{idx + 1}</td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-800">{s.nama_lengkap}</div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono">{s.nisn}</div>
                    </td>
                    <td className="px-5 py-3 text-center"><span className="px-2.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{s.kelas}</span></td>
                    <td className="px-5 py-3 text-center">
                      {hasFile ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Ada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-500 border border-red-200">—</span>
                      )}
                    </td>
                    {type.persyaratan && type.persyaratan.map(req => {
                      const terpenuhi = fileReqs[s.kode] || {}
                      const isChecked = !!(terpenuhi[req.id])
                      return (
                        <td key={req.id} className="text-center px-2 py-2">
                          <label className="inline-flex items-center cursor-pointer">
                            <input type="checkbox"
                              className={`w-4 h-4 rounded focus:ring-0 cursor-pointer ${isChecked ? 'text-green-600' : 'text-slate-300 border-slate-300'}`}
                              checked={isChecked}
                              disabled={!canKelola || toggling === `${s.kode}_req_${req.id}`}
                              onChange={() => handleToggleReq(s.kode, req.id)}
                            />
                          </label>
                        </td>
                      )
                    })}
                    <td className="text-center px-2 py-2">
                      {activityLogs.some(log => log.detail.includes(s.nama_lengkap)) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200" title="Siswa telah mengunduh/membuka dokumen">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          Selesai
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[10px] italic">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          </div>
          
          {/* Sidebar Progress Per Kelas */}
          <div className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col h-auto lg:h-full lg:max-h-full overflow-y-auto">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-5">Progress Per Kelas (Akses Dokumen)</h3>
            <div className="space-y-4">
              {uniqueClasses.map(c => {
                const classStudents = displayStudents.filter(s => s.kelas === c)
                const total = classStudents.length
                if (total === 0) return null

                const hasFileReqs = type.persyaratan && type.persyaratan.length > 0
                const grantedCount = classStudents.filter(s => {
                  const hasFile = files.has(`${s.kode}${type.kode_jenis}.pdf`)
                  if (!hasFile) return false
                  if (!hasFileReqs) return true
                  const terpenuhi = fileReqs[s.kode] || {}
                  return type.persyaratan.every(r => terpenuhi[r.id])
                }).length

                const accessedCount = classStudents.filter(s => activityLogs.some(log => log.detail.includes(s.nama_lengkap))).length
                
                const grantedPercent = total > 0 ? (grantedCount / total) * 100 : 0
                const accessedPercent = total > 0 ? (accessedCount / total) * 100 : 0

                return (
                  <div key={c} className="flex flex-col gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50/50">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>{c} (Dapat Akses)</span>
                        <span>{grantedCount}/{total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full rounded-full transition-all duration-500 ${grantedPercent >= 100 ? 'bg-indigo-600' : 'bg-indigo-400'}`} style={{ width: `${grantedPercent}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>Telah Mengunduh</span>
                        <span>{accessedCount}/{total}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-1.5">
                        <div className={`h-full rounded-full transition-all duration-500 ${accessedPercent >= 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${accessedPercent}%` }}></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      {/* PDF Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 px-4 animate-fade-in" onClick={() => setPreviewPdf(null)}>
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* Purple Header & Close Button */}
            <div className="relative bg-indigo-600 h-28 shrink-0">
              <button onClick={() => setPreviewPdf(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Student Info Card Layout */}
            <div className="px-6 pb-4 shrink-0 bg-white relative z-10">
              <div className="flex flex-col items-center -mt-14">
                <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white overflow-hidden shadow-md shrink-0">
                  <StudentAvatar student={previewPdf.student} fotos={fotos} className="w-full h-full object-cover text-2xl" />
                </div>
                <h3 className="text-slate-900 font-bold text-xl mt-3 text-center">{previewPdf.student.nama_lengkap}</h3>
                <p className="text-indigo-600 font-medium text-sm mt-0.5 mb-3">Kelas {previewPdf.student.kelas ?? '—'}</p>

                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">NISN / NIPD</p>
                  <p className="text-slate-800 font-semibold">{previewPdf.student.nisn || '-'}{previewPdf.student.nipd ? ` / ${previewPdf.student.nipd}` : ''}</p>
                </div>
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="bg-slate-100 border-t border-slate-200 relative h-[60vh] min-h-[400px]">
              <div className="absolute top-4 right-4 z-10">
                <a href={previewPdf.url}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 text-sm font-bold shadow-md border border-slate-200 transition-transform active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Buka Tab Baru
                </a>
              </div>
              <iframe src={previewPdf.url} className="w-full h-full border-0 block" title={`Preview - ${previewPdf.student.nama_lengkap}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardGuru() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fitur, setFitur] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const [students, setStudents] = useState([])
  const [waliStudents, setWaliStudents] = useState([])
  const [mapelStudents, setMapelStudents] = useState([])
  const [menuTypes, setMenuTypes] = useState([])
  const [fotos, setFotos] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [activeTa, setActiveTa] = useState(null)
  const [siswaSearch, setSiswaSearch] = useState('')
  const [siswaClassFilter, setSiswaClassFilter] = useState('all')
  const [mapelFilter, setMapelFilter] = useState('')
  const [presensiData, setPresensiData] = useState({})

  const handleBulkPresensi = (status) => {
    if (status === 'kosong') {
      setPresensiData({})
      return
    }
    const newData = { ...presensiData }
    const now = new Date().toTimeString().slice(0, 5) // HH:mm
    filteredMapelStudents.forEach(s => {
      newData[s.nisn] = { status, time: (status === 'T' || status === 'P') ? now : null }
    })
    setPresensiData(newData)
  }

  const handleStatusChange = (nisn, status) => {
    const now = new Date().toTimeString().slice(0, 5)
    setPresensiData(prev => ({
      ...prev,
      [nisn]: { status, time: (status === 'T' || status === 'P') ? (prev[nisn]?.time || now) : null }
    }))
  }

  const handleTimeChange = (nisn, time) => {
    setPresensiData(prev => ({
      ...prev,
      [nisn]: { ...prev[nisn], time }
    }))
  }

  const handleSimpanPresensiMapel = async (s) => {
    const pd = presensiData[s.nisn]
    if (!pd) {
      alert(`Silakan pilih status kehadiran untuk ${s.nama_lengkap} terlebih dahulu.`)
      return
    }
    try {
      const today = new Date().toISOString().split('T')[0]
      const record = {
        tanggal: today,
        tahun_ajaran_id: activeTa?.id || null,
        kelas: s.kelas,
        siswa_nisn: s.nisn,
        status: pd.status,
        waktu: pd.time || null,
        diinput_oleh: session.id,
        updated_at: new Date().toISOString()
      }
      
      const { error } = await supabase.from('presensi_harian').upsert(record, { onConflict: 'tanggal,siswa_nisn' })
      if (error) throw error
      alert(`Kehadiran ${s.nama_lengkap} berhasil disimpan!`)
    } catch (err) {
      console.error(err)
      alert(`Gagal menyimpan kehadiran: ${err.message}`)
    }
  }

  const fetchPresensiHariIni = async () => {
    if (activeMenu !== 'presensi' || filteredMapelStudents.length === 0) return
    const today = new Date().toISOString().split('T')[0]
    const nisns = filteredMapelStudents.map(s => s.nisn)
    if (nisns.length === 0) return
    
    const { data } = await supabase.from('presensi_harian')
      .select('siswa_nisn, status, waktu')
      .eq('tanggal', today)
      .in('siswa_nisn', nisns)
      
    if (data) {
      setPresensiData(prev => {
        const newData = { ...prev }
        data.forEach(d => {
          newData[d.siswa_nisn] = { status: d.status, time: d.waktu || null }
        })
        return newData
      })
    }
  }

  useEffect(() => {
    fetchPresensiHariIni()
  }, [activeMenu, mapelStudents, siswaClassFilter, mapelFilter])

  useEffect(() => {
    if (session?.mapels?.length > 0 && !mapelFilter) {
      setMapelFilter(session.mapels[0])
    }
  }, [session])

  useEffect(() => {
    setSiswaSearch('')
    setSiswaClassFilter('all')
  }, [activeMenu])

  useEffect(() => {
    const rawSession = localStorage.getItem('guru_session')
    if (!rawSession) {
      navigate('/')
      return
    }
    const parsed = JSON.parse(rawSession)
    setSession(parsed)
    fetchData(parsed)
  }, [navigate])

  const fetchData = async (userData) => {
    // 0. Refresh Guru Session Data
    const { data: freshGuru } = await supabase
      .from('guru')
      .select('*, guru_role(role_id, roles(nama)), guru_kelas(kelas, tahun_ajaran_id), guru_mapel(kelas, tahun_ajaran_id, mata_pelajaran_id, mata_pelajaran(nama))')
      .eq('id', userData.id)
      .single()

    let activeSession = userData
    if (freshGuru) {
      activeSession = {
        ...userData,
        kode: freshGuru.kode,
        nama_guru: freshGuru.nama_guru,
        user_name: freshGuru.user_name,
        foto_url: freshGuru.foto_url,
        roles: freshGuru.guru_role.map(r => ({ id: r.role_id, nama: r.roles?.nama })),
        kelas: freshGuru.guru_kelas,
        guru_mapel_raw: freshGuru.guru_mapel,
        mapels: freshGuru.guru_mapel ? Array.from(new Set(freshGuru.guru_mapel.map(gm => gm.mata_pelajaran?.nama).filter(Boolean))) : []
      }
      setSession(activeSession)
      localStorage.setItem('guru_session', JSON.stringify(activeSession))
    }

    // 1. Fetch features
    let currentFitur = new Set()
    const roleIds = activeSession.roles.map(r => r.id)
    if (roleIds.length > 0) {
      const { data } = await supabase.from('role_fitur').select('fitur').in('role_id', roleIds)
      if (data) {
        currentFitur = new Set(data.map(d => d.fitur))
        setFitur(currentFitur)
      }
    }

    // 2. Fetch Active Tahun Ajaran
    const { data: activeTaData } = await supabase.from('tahun_ajaran').select('id, nama').eq('is_aktif', true).single()
    setActiveTa(activeTaData)

    // 3. Fetch Students (Filtered by active year & assigned classes)
    const waliClassesList = activeSession.kelas.filter(k => !activeTaData || k.tahun_ajaran_id === activeTaData.id).map(k => k.kelas)
    const mapelClassesList = activeSession.guru_mapel_raw?.filter(m => !activeTaData || m.tahun_ajaran_id === activeTaData.id).map(m => m.kelas) || []
    const allAssignedClasses = Array.from(new Set([...waliClassesList, ...mapelClassesList]))
    
    if (allAssignedClasses.length > 0 && activeTaData) {
      const { data: siswaData } = await supabase.from('siswa_lengkap')
        .select('*')
        .in('kelas', allAssignedClasses)
        .eq('is_aktif', true)
        .order('nama_lengkap')

      if (siswaData) {
        setStudents(siswaData)
        setWaliStudents(siswaData.filter(s => waliClassesList.includes(s.kelas)))
        setMapelStudents(siswaData.filter(s => mapelClassesList.includes(s.kelas)))
      }

      const { data: fotoData } = await supabase.from('foto').select('*')
      if (fotoData) setFotos(fotoData)
    }

    // 4. Fetch Jenis Pengumuman (if has permission)
    if (currentFitur.has('lihat_dokumen') || currentFitur.has('kelola_pengumuman')) {
      const { data: mTypes } = await supabase.from('jenis_pengumuman').select('*').order('urutan')
      if (mTypes) setMenuTypes(mTypes)
    }

    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('guru_session')
    navigate('/')
  }

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>
  }

  const waliClassesStr = session.kelas?.filter(k => !activeTa || k.tahun_ajaran_id === activeTa.id).map(k => k.kelas).join(', ') || '-'
  const mapelClassesStr = session.guru_mapel_raw?.filter(m => !activeTa || m.tahun_ajaran_id === activeTa.id).map(m => m.kelas).join(', ') || '-'
  const allAssignedClassesStr = Array.from(new Set([
    ...(session.kelas?.filter(k => !activeTa || k.tahun_ajaran_id === activeTa.id).map(k => k.kelas) || []),
    ...(session.guru_mapel_raw?.filter(m => !activeTa || m.tahun_ajaran_id === activeTa.id).map(m => m.kelas) || [])
  ])).join(', ') || 'Belum ada'

  const uniqueWaliClasses = [...new Set(waliStudents.map(s => s.kelas).filter(Boolean))].sort()
  let filteredWaliStudents = waliStudents
  if (siswaClassFilter !== 'all') filteredWaliStudents = filteredWaliStudents.filter(s => s.kelas === siswaClassFilter)
  if (siswaSearch) {
    const query = siswaSearch.toLowerCase()
    filteredWaliStudents = filteredWaliStudents.filter(s => s.nama_lengkap.toLowerCase().includes(query) || s.nisn.includes(query))
  }

  const uniqueMapelClasses = [...new Set(mapelStudents.map(s => s.kelas).filter(Boolean))].sort()
  let filteredMapelStudents = mapelStudents
  if (siswaClassFilter !== 'all') filteredMapelStudents = filteredMapelStudents.filter(s => s.kelas === siswaClassFilter)
  if (siswaSearch) {
    const query = siswaSearch.toLowerCase()
    filteredMapelStudents = filteredMapelStudents.filter(s => s.nama_lengkap.toLowerCase().includes(query) || s.nisn.includes(query))
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-800 font-sans">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-30 md:hidden animate-fade-in" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 md:z-auto ${
        sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}>
        <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-slate-200 rounded-xl shadow-sm p-1 bg-white shrink-0">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 leading-tight">SIAKD</h2>
              <p className="text-xs font-medium text-slate-500">SMP Budi Mulia Jakarta</p>
            </div>
          </div>
          <button className="md:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setSidebarOpen(false)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full border border-slate-200 bg-white shadow-sm overflow-hidden flex items-center justify-center font-bold text-slate-500 text-lg">
              {session.foto_url ? <img src={session.foto_url} alt="Profile" className="w-full h-full object-cover" /> : session.nama_guru.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{session.nama_guru}</p>
              <p className="text-xs text-slate-500 truncate">Kode: {session.kode}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {session.roles.map(r => (
               <span key={r.id} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold uppercase tracking-wider">{r.nama}</span>
            ))}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <button onClick={() => { setActiveMenu('dashboard'); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeMenu === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <IconDashboard /> Beranda
          </button>

          {(fitur.has('lihat_data_siswa') || fitur.has('lihat_dokumen') || fitur.has('kelola_pengumuman') || fitur.has('kelola_presensi_sekolah')) && (
            <>
              <div className="pt-4 pb-2 px-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AKADEMIK</p>
              </div>
              
              {fitur.has('lihat_data_siswa') && (
                <>
                  {session.kelas?.length > 0 && (
                    <button onClick={() => { setActiveMenu('siswa_wali'); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        activeMenu === 'siswa_wali' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                      }`}>
                      <IconUsers /> Siswa Wali Kelas
                    </button>
                  )}
                  {session.guru_mapel_raw?.length > 0 && (
                    <>
                      <button onClick={() => { setActiveMenu('siswa_mapel'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          activeMenu === 'siswa_mapel' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        }`}>
                        <IconUsers /> Siswa Mapel
                      </button>
                      <button onClick={() => { setActiveMenu('presensi'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          activeMenu === 'presensi' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        }`}>
                        <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        Presensi
                      </button>
                      <button onClick={() => { setActiveMenu('input_nilai'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          activeMenu === 'input_nilai' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                        }`}>
                        <IconNilai /> Input Nilai
                      </button>
                    </>
                  )}
                </>
              )}

              {fitur.has('kelola_presensi_sekolah') && (
                <>
                  <button onClick={() => { setActiveMenu('piket_dashboard'); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeMenu === 'piket_dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}>
                    <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                    Dashboard Piket
                  </button>
                  <button onClick={() => { setActiveMenu('data_presensi_siswa'); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      activeMenu === 'data_presensi_siswa' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}>
                    <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Data Presensi Siswa
                  </button>
                </>
              )}

              {(fitur.has('lihat_dokumen') || fitur.has('kelola_pengumuman')) && menuTypes.map(t => (
                <button key={t.id} onClick={() => { setActiveMenu(t.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    activeMenu === t.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  <IconFile />
                  <span className="truncate">{t.nama}</span>
                </button>
              ))}
            </>
          )}

          <div className="pt-4 pb-2 px-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PENGATURAN</p>
          </div>
          <button onClick={() => { setActiveMenu('profil'); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeMenu === 'profil' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <IconUser /> Profil Saya
          </button>
          <button onClick={() => { setActiveMenu('password'); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeMenu === 'password' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            <IconKey /> Ubah Sandi
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors">
            <IconLogout /> Keluar Sesi
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="font-semibold text-slate-800 text-sm">SIAKD Guru</h1>
          </div>
        </header>

        <div className={`flex-1 p-4 md:p-6 lg:p-8 flex flex-col ${
          activeMenu === 'dashboard' && session.roles.some(r => r.nama.toLowerCase() === 'piket') && (!session.kelas || session.kelas.length === 0) && (!session.guru_mapel_raw || session.guru_mapel_raw.length === 0)
            ? 'min-h-0 overflow-hidden'
            : 'overflow-y-auto'
        }`}>
          <div className="w-full flex-1 flex flex-col min-h-0">
            {activeMenu === 'dashboard' && (
              <>
                {session.roles.some(r => r.nama.toLowerCase() === 'piket') && (!session.kelas || session.kelas.length === 0) && (!session.guru_mapel_raw || session.guru_mapel_raw.length === 0) ? (
                  <PiketDashboardSection session={session} activeTa={activeTa} />
                ) : (
                  <div className="animate-slide-up">
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 md:p-10 shadow-lg text-white mb-8 relative overflow-hidden">
                      <div className="relative z-10">
                        <h2 className="text-2xl md:text-3xl font-bold mb-2">Selamat Datang, {session.nama_guru}! 👋</h2>
                        <p className="text-indigo-100 text-sm md:text-base max-w-xl">
                          Anda sedang mengakses Sistem Informasi Akademik Digital sebagai Guru/Staff. 
                          Anda ditugaskan mengampu kelas: <strong className="text-white bg-indigo-500/50 px-2 py-0.5 rounded">{allAssignedClassesStr}</strong>.
                        </p>
                      </div>
                      <svg className="absolute right-0 bottom-0 opacity-10 w-64 h-64 -mb-16 -mr-16 transform rotate-12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 3.8l7.5 14.2H4.5L12 5.8z"/></svg>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <IconUsers /> Statistik Kelas Saya
                        </h3>
                        <div className="text-3xl font-black text-indigo-600 mb-1">{students.length}</div>
                        <p className="text-sm text-slate-500">Total siswa aktif di kelas yang Anda ampu</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
                        <p className="text-slate-500 text-sm mb-4">Gunakan menu di sidebar untuk mulai mengelola data akademik siswa atau mengubah profil Anda.</p>
                        {session.kelas?.length > 0 ? (
                          <button onClick={() => setActiveMenu('siswa_wali')} className="px-4 py-2 bg-indigo-50 text-indigo-600 font-medium rounded-xl text-sm hover:bg-indigo-100 transition-colors">
                            Lihat Siswa Wali Kelas &rarr;
                          </button>
                        ) : session.guru_mapel_raw?.length > 0 ? (
                          <button onClick={() => setActiveMenu('siswa_mapel')} className="px-4 py-2 bg-indigo-50 text-indigo-600 font-medium rounded-xl text-sm hover:bg-indigo-100 transition-colors">
                            Lihat Siswa Mapel &rarr;
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeMenu === 'siswa_wali' && fitur.has('lihat_data_siswa') && (
              <div className="animate-slide-up">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Siswa Wali Kelas</h2>
                  <p className="text-slate-500 text-sm mt-1">Daftar siswa pada kelas perwalian Anda: <strong>{waliClassesStr}</strong></p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
                  <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input type="text" placeholder="Cari nama atau NISN..." value={siswaSearch} onChange={(e) => setSiswaSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                  </div>

                  {uniqueWaliClasses.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      <button 
                        onClick={() => setSiswaClassFilter('all')}
                        className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                          siswaClassFilter === 'all' 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        Semua Kelas ({waliStudents.length})
                      </button>
                      {uniqueWaliClasses.map(c => {
                        const count = waliStudents.filter(s => s.kelas === c).length
                        return (
                          <button 
                            key={c}
                            onClick={() => setSiswaClassFilter(c)}
                            className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                              siswaClassFilter === c 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {c} ({count})
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="px-6 py-4 font-semibold w-12 text-center">No</th>
                          <th className="px-6 py-4 font-semibold">NISN</th>
                          <th className="px-6 py-4 font-semibold">Nama Siswa</th>
                          <th className="px-6 py-4 font-semibold">Kelas</th>
                          <th className="px-6 py-4 font-semibold text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredWaliStudents.length === 0 ? (
                          <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500">Tidak ada siswa yang cocok dengan filter.</td></tr>
                        ) : filteredWaliStudents.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-center text-slate-500 font-medium">{idx + 1}</td>
                            <td className="px-6 py-4 font-medium text-slate-700">{s.nisn}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-slate-200">
                                  <StudentAvatar student={s} fotos={fotos} className="w-full h-full object-cover" />
                                </div>
                                <div className="font-semibold text-slate-800">{s.nama_lengkap}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4"><span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md font-medium text-xs border border-indigo-100">{s.kelas}</span></td>
                            <td className="px-6 py-4 text-center">
                              <button onClick={() => setSelectedStudent(s)} className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold hover:underline">
                                Lihat Detail
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeMenu === 'data_presensi_siswa' && (
              <DataPresensiSiswaSection session={session} activeTa={activeTa} />
            )}

            {activeMenu === 'siswa_mapel' && fitur.has('lihat_data_siswa') && (
              <div className="animate-slide-up">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Siswa Mata Pelajaran</h2>
                  <p className="text-slate-500 text-sm mt-1">Daftar siswa pada kelas mata pelajaran Anda: <strong>{mapelClassesStr}</strong></p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
                  <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input type="text" placeholder="Cari nama atau NISN..." value={siswaSearch} onChange={(e) => setSiswaSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                    
                    {session.mapels && session.mapels.length > 0 && (
                      <div className="flex-shrink-0 relative">
                        <select 
                          value={mapelFilter} 
                          onChange={(e) => setMapelFilter(e.target.value)}
                          className="w-full md:w-auto pl-4 pr-10 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-medium border border-indigo-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition appearance-none cursor-pointer"
                        >
                          {session.mapels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-indigo-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {uniqueMapelClasses.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      <button 
                        onClick={() => setSiswaClassFilter('all')}
                        className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                          siswaClassFilter === 'all' 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        Semua Kelas ({mapelStudents.length})
                      </button>
                      {uniqueMapelClasses.map(c => {
                        const count = mapelStudents.filter(s => s.kelas === c).length
                        return (
                          <button 
                            key={c}
                            onClick={() => setSiswaClassFilter(c)}
                            className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                              siswaClassFilter === c 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {c} ({count})
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto pb-4">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="px-4 py-4 font-semibold w-12 text-center">No</th>
                          <th className="px-4 py-4 font-semibold">Nama Siswa</th>
                          <th className="px-4 py-4 font-semibold text-center">Kelas</th>
                          <th className="px-4 py-4 font-semibold text-center">Tugas</th>
                          <th className="px-4 py-4 font-semibold text-center">UTS</th>
                          <th className="px-4 py-4 font-semibold text-center">UAS</th>
                          <th className="px-4 py-4 font-semibold text-center sticky right-0 bg-slate-50 border-l border-slate-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMapelStudents.length === 0 ? (
                          <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">Tidak ada siswa yang cocok dengan filter.</td></tr>
                        ) : filteredMapelStudents.map((s, idx) => (
                          <tr key={s.id} className="hover:bg-slate-50 bg-white group">
                            <td className="px-4 py-4 text-center text-slate-500 font-medium">{idx + 1}</td>
                            <td className="px-4 py-4">
                              <div className="font-semibold text-slate-800">{s.nama_lengkap}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{s.nisn}</div>
                            </td>
                            <td className="px-4 py-4 text-center"><span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md font-medium text-xs border border-indigo-100">{s.kelas}</span></td>
                            
                            {/* Mockup Inputs for Grades */}
                            <td className="px-4 py-3 text-center">
                              <input type="number" min="0" max="100" className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all" placeholder="0" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="number" min="0" max="100" className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all" placeholder="0" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input type="number" min="0" max="100" className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white transition-all" placeholder="0" />
                            </td>

                            <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 transition-colors">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => alert(`Fungsi Simpan Nilai ${mapelFilter} untuk ${s.nama_lengkap} sedang dalam tahap pengembangan UI mockup.`)} 
                                  className="px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-xs rounded-lg transition-colors shadow-sm active:scale-95 flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                  Simpan
                                </button>
                                <button onClick={() => alert('Fungsi tambah jurnal/catatan individu.')} 
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Beri Catatan/Jurnal">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeMenu === 'presensi' && fitur.has('lihat_data_siswa') && (
              <div className="animate-slide-up">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Presensi Mapel</h2>
                  <p className="text-slate-500 text-sm mt-1">Daftar presensi siswa pada kelas mata pelajaran Anda.</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
                  <div className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input type="text" placeholder="Cari nama atau NISN..." value={siswaSearch} onChange={(e) => setSiswaSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                    </div>
                    
                    {session.mapels && session.mapels.length > 0 && (
                      <div className="flex-shrink-0 relative">
                        <select 
                          value={mapelFilter} 
                          onChange={(e) => setMapelFilter(e.target.value)}
                          className="w-full md:w-auto pl-4 pr-10 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 font-medium border border-indigo-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition appearance-none cursor-pointer"
                        >
                          {session.mapels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-indigo-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {uniqueMapelClasses.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      <button 
                        onClick={() => setSiswaClassFilter('all')}
                        className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                          siswaClassFilter === 'all' 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        Semua Kelas ({mapelStudents.length})
                      </button>
                      {uniqueMapelClasses.map(c => {
                        const count = mapelStudents.filter(s => s.kelas === c).length
                        return (
                          <button 
                            key={c}
                            onClick={() => setSiswaClassFilter(c)}
                            className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors border ${
                              siswaClassFilter === c 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {c} ({count})
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-800 text-sm">Aksi Massal Presensi</h3>
                    <button onClick={() => handleBulkPresensi('kosong')} className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors">
                      Kosongkan Presensi
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-medium text-slate-500 mr-2">Set Semua:</span>
                    <button onClick={() => handleBulkPresensi('H')} className="px-3 py-1.5 text-xs font-bold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">Hadir</button>
                    <button onClick={() => handleBulkPresensi('T')} className="px-3 py-1.5 text-xs font-bold rounded bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200">Terlambat</button>
                    <button onClick={() => handleBulkPresensi('S')} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">Sakit</button>
                    <button onClick={() => handleBulkPresensi('I')} className="px-3 py-1.5 text-xs font-bold rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200">Izin</button>
                    <button onClick={() => handleBulkPresensi('A')} className="px-3 py-1.5 text-xs font-bold rounded bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200">Alpa</button>
                    <button onClick={() => handleBulkPresensi('P')} className="px-3 py-1.5 text-xs font-bold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300">Pulang</button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto pb-4">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="px-4 py-4 font-semibold w-12 text-center">No</th>
                          <th className="px-4 py-4 font-semibold">Nama Siswa</th>
                          <th className="px-4 py-4 font-semibold text-center">Kelas</th>
                          <th className="px-4 py-4 font-semibold text-center">Kehadiran</th>
                          <th className="px-4 py-4 font-semibold text-center sticky right-0 bg-slate-50 border-l border-slate-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMapelStudents.length === 0 ? (
                          <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">Tidak ada siswa yang cocok dengan filter.</td></tr>
                        ) : filteredMapelStudents.map((s, idx) => (
                          <tr key={s.nisn} className="hover:bg-slate-50 bg-white group">
                            <td className="px-4 py-4 text-center text-slate-500 font-medium">{idx + 1}</td>
                            <td className="px-4 py-4">
                              <div className="font-semibold text-slate-800">{s.nama_lengkap}</div>
                              <div className="text-xs text-slate-500 mt-0.5">{s.nisn}</div>
                            </td>
                            <td className="px-4 py-4 text-center"><span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md font-medium text-xs border border-indigo-100">{s.kelas}</span></td>
                            
                            <td className="px-4 py-3 min-w-[320px]">
                              <div className="flex items-center gap-1.5">
                                {['H', 'T', 'S', 'I', 'A', 'P'].map(opt => {
                                  const isActive = presensiData[s.nisn]?.status === opt;
                                  const baseColors = {
                                    'H': 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
                                    'T': 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
                                    'S': 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                                    'I': 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                                    'A': 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
                                    'P': 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  }
                                  const activeColors = {
                                    'H': 'bg-emerald-600 text-white border-emerald-600',
                                    'T': 'bg-orange-500 text-white border-orange-500',
                                    'S': 'bg-blue-600 text-white border-blue-600',
                                    'I': 'bg-purple-600 text-white border-purple-600',
                                    'A': 'bg-rose-600 text-white border-rose-600',
                                    'P': 'bg-slate-600 text-white border-slate-600'
                                  }
                                  return (
                                    <button 
                                      key={opt}
                                      onClick={() => handleStatusChange(s.nisn, opt)}
                                      className={`w-8 h-8 rounded text-sm font-bold transition-all border ${isActive ? activeColors[opt] : baseColors[opt]}`}
                                    >
                                      {opt}
                                    </button>
                                  )
                                })}
                                {(presensiData[s.nisn]?.status === 'T' || presensiData[s.nisn]?.status === 'P') && (
                                  <input 
                                    type="time" 
                                    value={presensiData[s.nisn]?.time || ''}
                                    onChange={(e) => handleTimeChange(s.nisn, e.target.value)}
                                    className="ml-2 px-2 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none w-24"
                                  />
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 transition-colors">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => handleSimpanPresensiMapel(s)} 
                                  className="px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-xs rounded-lg transition-colors shadow-sm active:scale-95 flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                  Simpan
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {menuTypes.map(t => {
              if (activeMenu === t.id) {
                return (
                  <GuruAnnouncementSection 
                    key={t.id} 
                    type={t} 
                    students={waliStudents} 
                    fitur={fitur}
                    fotos={fotos}
                  />
                )
              }
              return null
            })}

            {activeMenu === 'piket_dashboard' && fitur.has('kelola_presensi_sekolah') && (
              <PiketDashboardSection session={session} activeTa={activeTa} />
            )}

            {activeMenu === 'input_nilai' && session.guru_mapel_raw?.length > 0 && (
              <NilaiGuruSection session={session} activeTa={activeTa} />
            )}

            {activeMenu === 'password' && (
              <div className="animate-slide-up max-w-md">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Ubah Sandi</h2>
                  <p className="text-slate-500 text-sm mt-1">Ubah kata sandi login Anda untuk keamanan</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <p className="text-sm text-slate-600 mb-6">Untuk mengubah sandi, silakan hubungi Administrator Sekolah. (Fitur ubah sandi mandiri sedang dalam pengembangan).</p>
                </div>
              </div>
            )}

            {activeMenu === 'profil' && (
              <div className="animate-slide-up max-w-3xl">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">Profil Saya</h2>
                  <p className="text-slate-500 text-sm mt-1">Informasi lengkap data diri dan penugasan Anda.</p>
                </div>
                
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 sm:p-8 flex items-center gap-5 border-b border-slate-100">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-indigo-100 text-indigo-600 border-4 border-white shadow-md flex items-center justify-center font-bold text-3xl overflow-hidden shrink-0">
                      {session.foto_url ? <img src={session.foto_url} alt="Profile" className="w-full h-full object-cover" /> : session.nama_guru.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-slate-800">{session.nama_guru}</h3>
                      <p className="text-slate-500 text-sm sm:text-base mt-1">Kode: {session.kode}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                         {session.roles.map(r => (
                           <span key={r.id} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs font-semibold">{r.nama}</span>
                         ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 sm:p-8">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-6 gap-x-4">
                      
                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Nama Lengkap</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{session.nama_guru}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Kode Guru / Akses</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{session.kode}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Mata Pelajaran</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{session.mapels?.length > 0 ? session.mapels.join(', ') : '-'}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Sekolah</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">SMP Budi Mulia Jakarta</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Wali Kelas</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{waliClassesStr}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Kelas Diampu (Mapel)</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{mapelClassesStr}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Tahun Ajaran Aktif</p>
                      </div>
                      <div className="sm:col-span-2 border-b border-slate-100 pb-4 sm:border-0 sm:pb-0">
                        <p className="text-sm font-medium text-slate-800">{activeTa ? activeTa.nama : '-'}</p>
                      </div>

                      <div className="sm:col-span-1">
                        <p className="text-sm font-semibold text-slate-500">Username Login</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-sm font-medium text-slate-800 bg-slate-100 px-2 py-1 rounded w-fit">{session.user_name}</p>
                      </div>

                    </div>
                  </div>
                  <div className="px-6 py-5 sm:px-8 border-t border-slate-100 bg-slate-50">
                    <button onClick={() => setActiveMenu('password')} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-colors shadow-sm focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 outline-none">
                      Edit Profil / Ubah Sandi
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Student Detail Modal */}
            {selectedStudent && (
              <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedStudent(null)}>
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                  <div className="relative h-24 bg-gradient-to-r from-indigo-500 to-indigo-700">
                    <button onClick={() => setSelectedStudent(null)} className="absolute top-4 right-4 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 relative">
                    <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-slate-100 absolute -top-12 left-6 shadow-md">
                      <StudentAvatar student={selectedStudent} fotos={fotos} className="w-full h-full object-cover" />
                    </div>
                    <div className="pt-14">
                      <h3 className="text-xl font-bold text-slate-900">{selectedStudent.nama_lengkap}</h3>
                      <p className="text-sm font-medium text-indigo-600 mb-4 mt-0.5">Kelas {selectedStudent.kelas}</p>
                      
                      <div className="space-y-3 mt-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">NISN / NIPD</span>
                          <span className="text-slate-800 font-medium">{selectedStudent.nisn || '-'} / {selectedStudent.nipd || '-'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Kode Akses / PIN</span>
                          <span className="text-slate-800 font-medium font-mono bg-slate-100 px-2 py-1 rounded w-fit">{selectedStudent.kode}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Status</span>
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded w-fit text-xs font-bold border border-emerald-200">Siswa Aktif</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
