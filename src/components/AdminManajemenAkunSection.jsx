import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// Icons (Simplified as SVGs to reduce dependencies)
const IconUsers = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
const IconKey = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
const IconPlus = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
const IconUpload = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
const IconCamera = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>

const FallbackAvatar = ({ name, className = '' }) => (
  <div className={`flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold uppercase ${className}`} style={{ width: '40px', height: '40px', flexShrink: 0 }}>
    {name ? name.charAt(0) : '?'}
  </div>
)

export default function AdminManajemenAkunSection({ students, allFotos, activeTa, tahunAjarans, initialSearchQuery, onRefresh }) {
  const [activeTab, setActiveTab] = useState('murid')
  const [akunList, setAkunList] = useState([])
  const [guruList, setGuruList] = useState([])
  const [roles, setRoles] = useState([])
  const [mapels, setMapels] = useState([])
  const [akunSummary, setAkunSummary] = useState({ total: 0, murid: 0, guru: 0, admin: 0 })
  
  const [search, setSearch] = useState(initialSearchQuery || '')
  const [selectedTaFilter, setSelectedTaFilter] = useState(activeTa?.nama || 'all')
  const [selectedClassFilter, setSelectedClassFilter] = useState('all')
  
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')

  // Modal Biodata (Unified for Create & Edit)
  const [showBiodataModal, setShowBiodataModal] = useState(false)
  const [biodataForm, setBiodataForm] = useState(null)
  
  // Refs
  const csvInputRef = useRef(null)
  const massPhotoInputRef = useRef(null)
  const individualPhotoInputRef = useRef(null)
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null)

  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  useEffect(() => {
    fetchAkunSummary()
  }, [])

  useEffect(() => {
    fetchData()
  }, [activeTab, activeTa])

  const fetchAkunSummary = async () => {
    const { data } = await supabase.from('akun_pengguna').select('role')
    if (data) {
      const summary = { total: data.length, murid: 0, guru: 0, admin: 0 }
      data.forEach(d => { if (summary[d.role] !== undefined) summary[d.role]++ })
      setAkunSummary(summary)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    // 1. Fetch Akun Pengguna for current tab
    const { data: akunData } = await supabase.from('akun_pengguna').select('*').eq('role', activeTab)
    setAkunList(akunData || [])

    // 2. If Guru tab, fetch Guru specific data
    if (activeTab === 'guru') {
      const { data: gurus } = await supabase.from('guru').select(`
        *,
        guru_role ( role_id ),
        guru_kelas ( kelas, tahun_ajaran_id ),
        guru_mapel ( mata_pelajaran_id, kelas, tahun_ajaran_id )
      `)
      setGuruList(gurus || [])
      
      const { data: rolesData } = await supabase.from('roles').select('*')
      setRoles(rolesData || [])
      
      const { data: mapelsData } = await supabase.from('mata_pelajaran').select('*')
      setMapels(mapelsData || [])
    }
    setLoading(false)
  }

  // Penggabungan Data: Master data is Siswa/Guru, joined with Akun
  const getMergedData = () => {
    if (activeTab === 'murid') {
      console.log('Students raw data:', students?.length, students?.[0])
      console.log('activeTa:', activeTa, 'selectedTaFilter:', selectedTaFilter)
      
      // Create a unique list of students (sometimes enrollment causes duplicates if not grouped)
      const uniqueStudentsMap = new Map()
      students.forEach(s => {
        if (!uniqueStudentsMap.has(s.nisn)) {
          uniqueStudentsMap.set(s.nisn, { ...s, enrollments: [] })
        }
        if (s.tahun_ajaran) {
          uniqueStudentsMap.get(s.nisn).enrollments.push({
            kelas: s.kelas,
            tahun_ajaran: s.tahun_ajaran,
            tahun_ajaran_id: s.tahun_ajaran_id // Might be undefined but that's fine
          })
        }
      })

      return Array.from(uniqueStudentsMap.values()).map(student => {
        // Find relevant enrollment based on TA
        let enrollment = null
        if (selectedTaFilter !== 'all') {
          enrollment = student.enrollments.find(e => e.tahun_ajaran === selectedTaFilter)
        } else {
          enrollment = student.enrollments.find(e => e.tahun_ajaran === activeTa?.nama)
        }
        
        if (!enrollment && student.enrollments.length > 0) enrollment = student.enrollments[0]

        // Find Akun
        const akun = akunList.find(a => a.foreign_id === student.nisn)
        
        // Find Foto
        const foto = allFotos.filter(f => f.nisn === student.nisn && f.cloudinary_url)
            .sort((a, b) => (b.tahun_ajaran?.nama || '').localeCompare(a.tahun_ajaran?.nama || ''))[0]

        return {
          id: student.nisn, // use nisn as unique key
          foreign_id: student.nisn,
          nama: student.nama_lengkap,
          kelas: enrollment?.kelas || '-',
          tahun_ajaran: enrollment?.tahun_ajaran || '-',
          foto_url: foto?.cloudinary_url || null,
          hasAkun: !!akun,
          akun_id: akun?.id,
          username: akun?.username || '(Belum punya akun)',
          password_exists: !!akun?.password,
          status: akun?.status || 'nonaktif',
          rawStudent: student
        }
      })
    } else {
      return guruList.map(guru => {
        const akun = akunList.find(a => a.foreign_id === guru.id.toString())
        return {
          id: guru.id,
          foreign_id: guru.id.toString(),
          kode: guru.kode,
          nama: guru.nama_guru,
          foto_url: guru.foto_url,
          hasAkun: !!akun,
          akun_id: akun?.id,
          username: akun?.username || '(Belum punya akun)',
          password_exists: !!akun?.password,
          status: akun?.status || 'nonaktif',
          rawGuru: guru
        }
      })
    }
  }

  let mergedData = getMergedData()

  // Apply Search
  if (search) {
    const q = search.toLowerCase()
    mergedData = mergedData.filter(a => 
      (a.nama && a.nama.toLowerCase().includes(q)) || 
      (a.username && a.username.toLowerCase().includes(q)) || 
      (a.foreign_id && a.foreign_id.toLowerCase().includes(q)) ||
      (a.kode && a.kode.toLowerCase().includes(q))
    )
  }

  // Apply TA Filter for Murid
  if (activeTab === 'murid' && selectedTaFilter !== 'all') {
    mergedData = mergedData.filter(a => a.tahun_ajaran === selectedTaFilter)
  }

  // Derive Unique Classes from TA-filtered data (before class filter is applied)
  const uniqueClasses = activeTab === 'murid' ? [...new Set(mergedData.map(a => a.kelas).filter(k => k !== '-'))].sort() : []

  // Apply Class Filter for Murid
  if (activeTab === 'murid' && selectedClassFilter !== 'all') {
    mergedData = mergedData.filter(a => a.kelas === selectedClassFilter)
  }

  // --- ACTIONS ---

  const handleResetPassword = async (akun_id, username) => {
    const newPass = prompt(`Masukkan password baru untuk user ${username}:`, "123456")
    if (!newPass) return
    setIsProcessing(true)
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(newPass, salt)
    
    // Update Supabase akun_pengguna
    const { error } = await supabase.from('akun_pengguna').update({ password: hash }).eq('id', akun_id)
    
    // Update plain text kode_akses if it's a guru (for display purposes)
    if (!error && activeTab !== 'murid') {
      const guruId = mergedData.find(a => a.akun_id === akun_id)?.id
      if (guruId) await supabase.from('guru').update({ kode_akses: newPass }).eq('id', guruId)
    }
    
    setIsProcessing(false)
    if (error) alert("Gagal mereset: " + error.message)
    else { alert("Password berhasil direset."); fetchData() }
  }

  const handleDeletePermanen = async (row) => {
    if (!window.confirm(`PERINGATAN!\nAnda akan menghapus SELURUH data ${row.nama} secara permanen (Biodata, Akun, Nilai/Kelas, Foto).\nTindakan ini TIDAK BISA dibatalkan!\nLanjutkan?`)) return
    setIsProcessing(true)
    
    if (activeTab === 'murid') {
      await supabase.from('enrollment').delete().eq('nisn', row.foreign_id)
      await supabase.from('foto').delete().eq('nisn', row.foreign_id)
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      const { error } = await supabase.from('siswa_permanent').delete().eq('nisn', row.foreign_id)
      if (error) alert("Gagal hapus data siswa: " + error.message)
    } else {
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      const { error } = await supabase.from('guru').delete().eq('id', row.id)
      if (error) alert("Gagal hapus data guru: " + error.message)
    }
    
    setIsProcessing(false)
    fetchData()
    onRefresh?.()
    fetchAkunSummary()
  }

  // --- MODAL BIODATA ---

  const openBiodataModal = (row = null) => {
    if (activeTab === 'murid') {
      setBiodataForm({
        isNew: !row,
        row: row,
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',
        kelas: row?.kelas !== '-' ? row?.kelas : '',
        username: row?.hasAkun ? row.username : (row ? `${row.foreign_id}@gmail.com` : ''),
        password: '',
        hasAkun: row?.hasAkun || false,
        akun_id: row?.akun_id,
        foto_url: row?.foto_url || null
      })
    } else {
      const g = row?.rawGuru
      setBiodataForm({
        isNew: !row,
        row: row,
        id: row?.id,
        foreign_id: row?.foreign_id || '',
        kode: g?.kode || '',
        nama: row?.nama || '',
        username: row?.hasAkun ? row.username : (g?.kode ? `${g.kode}@gmail.com` : ''),
        password: '',
        hasAkun: row?.hasAkun || false,
        akun_id: row?.akun_id,
        foto_url: row?.foto_url || null,
        role_ids: g?.guru_role?.map(r => r.role_id) || [],
        kelas_assigned: g?.guru_kelas?.filter(k => k.tahun_ajaran_id === activeTa?.id).map(k => k.kelas) || [],
        mapel_assigned: Object.entries((g?.guru_mapel?.filter(m => m.tahun_ajaran_id === activeTa?.id) || []).reduce((acc, m) => {
          if (!acc[m.mata_pelajaran_id]) acc[m.mata_pelajaran_id] = []
          acc[m.mata_pelajaran_id].push(m.kelas)
          return acc
        }, {})).map(([mapel_id, kelas_list]) => ({ mapel_id, kelas_list }))
      })
    }
    setShowBiodataModal(true)
  }

  const handleSaveBiodata = async (e) => {
    e.preventDefault()
    setIsProcessing(true)
    setProgressText("Menyimpan data...")
    
    try {
      let f_id = biodataForm.foreign_id
      
      // 1. Save Biodata
      if (activeTab === 'murid') {
        if (!biodataForm.foreign_id) throw new Error("NISN harus diisi!")
        
        // Upsert Siswa
        await supabase.from('siswa_permanent').upsert({
          nisn: biodataForm.foreign_id,
          nama_lengkap: biodataForm.nama
        }, { onConflict: 'nisn' })
        
        // Upsert Enrollment (if class and TA available)
        if (biodataForm.kelas && activeTa) {
          await supabase.from('enrollment').upsert({
            kode: `${biodataForm.kelas}_${biodataForm.foreign_id}_${activeTa.id}`,
            nisn: biodataForm.foreign_id,
            kelas: biodataForm.kelas,
            tahun_ajaran_id: activeTa.id
          }, { onConflict: 'kode' })
        }
      } else {
        // Upsert Guru
        if (!biodataForm.kode) throw new Error("Kode Guru harus diisi!")
        
        const guruPayload = { kode: biodataForm.kode, nama_guru: biodataForm.nama }
        if (biodataForm.isNew) {
          const { data, error } = await supabase.from('guru').insert([guruPayload]).select()
          if (error) throw error
          f_id = data[0].id.toString()
          biodataForm.id = data[0].id
        } else {
          await supabase.from('guru').update(guruPayload).eq('id', biodataForm.id)
          f_id = biodataForm.id.toString()
        }

        // Sync Roles
        await supabase.from('guru_role').delete().eq('guru_id', biodataForm.id)
        if (biodataForm.role_ids.length > 0) {
          await supabase.from('guru_role').insert(biodataForm.role_ids.map(rid => ({ guru_id: biodataForm.id, role_id: rid })))
        }

        // Sync Classes/Mapel for Active TA
        if (activeTa) {
          await supabase.from('guru_kelas').delete().match({ guru_id: biodataForm.id, tahun_ajaran_id: activeTa.id })
          if (biodataForm.kelas_assigned.length > 0) {
            await supabase.from('guru_kelas').insert(biodataForm.kelas_assigned.map(k => ({ guru_id: biodataForm.id, kelas: k, tahun_ajaran_id: activeTa.id })))
          }
          
          await supabase.from('guru_mapel').delete().match({ guru_id: biodataForm.id, tahun_ajaran_id: activeTa.id })
          const mapelInserts = []
          biodataForm.mapel_assigned.forEach(ma => {
            ma.kelas_list.forEach(k => {
              mapelInserts.push({ guru_id: biodataForm.id, mata_pelajaran_id: ma.mapel_id, kelas: k, tahun_ajaran_id: activeTa.id })
            })
          })
          if (mapelInserts.length > 0) await supabase.from('guru_mapel').insert(mapelInserts)
        }
      }

      // 2. Save Akun Pengguna
      if (biodataForm.username) { // Only create/update akun if username is provided
        let uName = biodataForm.username.includes('@') ? biodataForm.username : `${biodataForm.username}@gmail.com`
        const akunPayload = {
          foreign_id: f_id,
          role: activeTab,
          username: uName,
          status: 'aktif'
        }
        if (biodataForm.password) {
          akunPayload.password = bcrypt.hashSync(biodataForm.password, bcrypt.genSaltSync(10))
        } else if (biodataForm.isNew && !biodataForm.hasAkun) {
          akunPayload.password = bcrypt.hashSync('123456', bcrypt.genSaltSync(10)) // default password
        }

        if (biodataForm.hasAkun && biodataForm.akun_id) {
          await supabase.from('akun_pengguna').update(akunPayload).eq('id', biodataForm.akun_id)
        } else {
          await supabase.from('akun_pengguna').upsert([akunPayload], { onConflict: 'username' })
        }
      }

      setShowBiodataModal(false)
      fetchData()
      onRefresh?.()
      fetchAkunSummary()
    } catch (err) {
      alert("Gagal menyimpan: " + err.message)
    }
    
    setIsProcessing(false)
    setProgressText('')
  }

  // --- PHOTO UPLOAD LOGIC ---

  const handleIndividualPhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingPhotoFor) return
    setIsProcessing(true); setProgressText("Mengunggah foto...")
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      
      let publicId, folder
      if (activeTab === 'murid') {
        if (!activeTa) throw new Error("Tahun ajaran aktif diperlukan")
        publicId = `FOTO_${uploadingPhotoFor.foreign_id}_${activeTa.id}_${Date.now()}`
        folder = `foto/${activeTa.nama.replace(/\//g, '_')}`
      } else {
        publicId = `GURU_${uploadingPhotoFor.id}_${Date.now()}`
        folder = `foto_guru`
      }
      
      formData.append('public_id', publicId)
      formData.append('folder', folder)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error("Upload ke Cloudinary gagal")
      const data = await res.json()

      const bustedUrl = `${data.secure_url}?t=${Date.now()}`

      // Update Database
      if (activeTab === 'murid') {
        await supabase.from('foto').upsert({
          nisn: uploadingPhotoFor.foreign_id,
          tahun_ajaran_id: activeTa.id,
          cloudinary_url: bustedUrl,
          cloudinary_public_id: data.public_id
        }, { onConflict: 'nisn,tahun_ajaran_id' })
      } else {
        await supabase.from('guru').update({ foto_url: bustedUrl }).eq('id', uploadingPhotoFor.id)
      }
      
      // Update form if modal is open
      if (showBiodataModal && biodataForm && biodataForm.row?.foreign_id === uploadingPhotoFor.foreign_id) {
        setBiodataForm(prev => ({...prev, foto_url: bustedUrl}))
      }

      fetchData()
      onRefresh?.()
    } catch (err) { alert(err.message) }
    
    setIsProcessing(false); setProgressText(''); setUploadingPhotoFor(null)
    if (individualPhotoInputRef.current) individualPhotoInputRef.current.value = ''
  }

  const handleMassPhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    if (!window.confirm(`Akan mengunggah ${files.length} foto. Pastikan nama file adalah ${activeTab === 'murid' ? 'NISN' : 'KODE GURU'}. Lanjutkan?`)) return

    setIsProcessing(true)
    let success = 0, failed = 0
    
    for (let i = 0; i < files.length; i++) {
      setProgressText(`Mengunggah foto ${i+1}/${files.length}...`)
      const file = files[i]
      const iden = file.name.split('.').slice(0, -1).join('.').trim() // NISN or KODE
      
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('upload_preset', UPLOAD_PRESET)
        
        let targetId = null
        if (activeTab === 'guru') {
          const { data } = await supabase.from('guru').select('id').eq('kode', iden).maybeSingle()
          if (!data) throw new Error("Guru tidak ditemukan")
          targetId = data.id
        }

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData })
        if (!res.ok) throw new Error("Upload failed")
        const result = await res.json()

        if (activeTab === 'murid') {
          await supabase.from('foto').upsert({
            nisn: iden,
            tahun_ajaran_id: activeTa.id,
            cloudinary_url: result.secure_url,
            cloudinary_public_id: result.public_id
          }, { onConflict: 'nisn,tahun_ajaran_id' })
        } else {
          await supabase.from('guru').update({ foto_url: result.secure_url }).eq('id', targetId)
        }
        success++
      } catch (err) { failed++ }
    }
    
    setIsProcessing(false); setProgressText('')
    alert(`Selesai! Berhasil: ${success}, Gagal: ${failed}`)
    if (massPhotoInputRef.current) massPhotoInputRef.current.value = ''
    fetchData()
    onRefresh?.()
  }

  // --- EXCEL IMPORT (Guru Only) ---
  const handleCsvImportGuru = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true); setProgressText("Memproses Excel...")

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { alert("File Excel kosong"); setIsProcessing(false); return }

      const defaultRole = roles.find(r => r.nama.toLowerCase() === 'guru')
      let successCount = 0, errorCount = 0

      for (const row of data) {
        const kode = String(row.kode || row.KODE || '').trim()
        const nama = String(row.nama_guru || row['NAMA GURU'] || row.nama || '').trim()
        if (!kode || !nama) continue
        const payload = { kode, nama_guru: nama }
        
        const { data: exist } = await supabase.from('guru').select('id').eq('kode', payload.kode).maybeSingle()
        let guruId
        if (exist) {
          guruId = exist.id
          const { error } = await supabase.from('guru').update(payload).eq('id', guruId)
          if (error) errorCount++; else successCount++
        } else {
          const { data: newGuru, error } = await supabase.from('guru').insert([payload]).select()
          if (error) { errorCount++; continue }
          guruId = newGuru[0].id
          successCount++
          if (defaultRole) await supabase.from('guru_role').insert([{ guru_id: guruId, role_id: defaultRole.id }])
        }
      }
      alert(`Sinkronisasi selesai!\nBerhasil: ${successCount}\nGagal: ${errorCount}`)
    } catch (err) {
      alert('Gagal memproses file: ' + err.message)
    }
    setIsProcessing(false); setProgressText(''); fetchData()
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  // Helper for UI
  const getGuruRoles = (guru) => guru?.guru_role?.map(gr => roles.find(r => r.id === gr.role_id)?.nama).filter(Boolean) || []
  const getGuruWali = (guru) => guru?.guru_kelas?.filter(gk => gk.tahun_ajaran_id === activeTa?.id).map(gk => gk.kelas) || []
  const getGuruMapel = (guru) => {
    const activeMapels = guru?.guru_mapel?.filter(gm => gm.tahun_ajaran_id === activeTa?.id) || []
    const mapelGroup = {}
    activeMapels.forEach(gm => {
      const mName = mapels.find(m => m.id === gm.mata_pelajaran_id)?.nama || 'Unknown'
      if (!mapelGroup[mName]) mapelGroup[mName] = []
      mapelGroup[mName].push(gm.kelas)
    })
    return mapelGroup
  }

  const allClassesInTa = [...new Set(
    students
      .filter(s => s.tahun_ajaran === activeTa?.nama)
      .map(s => s.kelas)
      .filter(k => k && k !== '-')
  )].sort()

  const handleDeletePhotoModal = async () => {
    if (!window.confirm("Yakin ingin menghapus foto ini?")) return
    setIsProcessing(true)
    try {
      if (activeTab === 'murid') {
        if (!activeTa) throw new Error("TA aktif diperlukan")
        await supabase.from('foto').delete().match({ nisn: biodataForm.foreign_id, tahun_ajaran_id: activeTa.id })
      } else {
        await supabase.from('guru').update({ foto_url: null }).eq('id', biodataForm.id)
      }
      setBiodataForm(prev => ({ ...prev, foto_url: null }))
      fetchData()
      onRefresh?.()
    } catch (err) {
      alert("Gagal menghapus: " + err.message)
    }
    setIsProcessing(false)
  }

  // --- LOGIN AS USER (IMPERSONATE) ---
  const handleLoginAsUser = async (row) => {
    if (!row) return
    try {
      if (activeTab === 'murid') {
        // Build siswa session (same logic as Login.jsx)
        const { data: siswa } = await supabase
          .from('siswa_permanent')
          .select('*')
          .eq('nisn', row.foreign_id)
          .maybeSingle()
        
        if (!siswa) { alert('Data siswa tidak ditemukan.'); return }

        const { data: activeTaData } = await supabase.from('tahun_ajaran').select('*').eq('is_aktif', true).single()
        
        let enrollment = {}
        if (activeTaData) {
          const { data: enrol } = await supabase.from('enrollment').select('*').eq('nisn', siswa.nisn).eq('tahun_ajaran_id', activeTaData.id).maybeSingle()
          if (enrol) enrollment = enrol
        }

        const sessionData = {
          ...siswa,
          kode: enrollment.kode || null,
          kelas: enrollment.kelas || null,
          tahun_ajaran_id: activeTaData?.id || null,
          tahun_ajaran: activeTaData?.nama || null,
          akun_id: 'siswa_' + siswa.id
        }

        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sessionData))))
        window.open(`/impersonate?data=${encoded}&role=murid`, '_blank')

      } else {
        // Build guru session (same logic as Login.jsx)
        const akun = akunList.find(a => a.foreign_id === row.foreign_id)
        if (!akun) { alert('Akun guru belum dibuat. Buat akun terlebih dahulu.'); return }

        const { data: guru } = await supabase
          .from('guru')
          .select('*, guru_role(role_id, roles(nama)), guru_kelas(kelas, tahun_ajaran_id)')
          .eq('id', akun.foreign_id)
          .single()

        if (!guru) { alert('Data guru tidak ditemukan.'); return }

        const sessionData = {
          id: guru.id,
          kode: guru.kode,
          nama_guru: guru.nama_guru,
          user_name: guru.user_name,
          foto_url: guru.foto_url,
          roles: guru.guru_role.map(r => ({ id: r.role_id, nama: r.roles?.nama })),
          kelas: guru.guru_kelas,
          akun_id: akun.id,
          app_role: akun.role
        }

        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(sessionData))))
        window.open(`/impersonate?data=${encoded}&role=guru`, '_blank')
      }
    } catch (err) {
      alert('Gagal login sebagai user: ' + err.message)
    }
  }

  return (
    <div className="animate-slide-up flex flex-col h-full min-h-screen pb-12">
      <input type="file" accept="image/*" ref={individualPhotoInputRef} className="hidden" onChange={handleIndividualPhotoUpload} />
      <input type="file" accept="image/*" multiple ref={massPhotoInputRef} className="hidden" onChange={handleMassPhotoUpload} />
      <input type="file" accept=".csv" ref={csvInputRef} className="hidden" onChange={handleCsvImportGuru} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Akun & Data Pengguna</h2>
          <p className="text-slate-500 text-sm mt-1">Satu pintu untuk mengelola biodata, akun login, dan penugasan.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'guru' && (
            <button onClick={() => csvInputRef.current?.click()} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
              <IconUpload /> Import CSV Guru
            </button>
          )}
          <button onClick={() => massPhotoInputRef.current?.click()} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
            <IconCamera /> Upload Foto Massal
          </button>
          <button onClick={() => openBiodataModal()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm">
            <IconPlus /> Buat Data Baru
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[{l:'Total Akun', v: akunSummary.total}, {l:'Akun Murid', v: akunSummary.murid}, {l:'Akun Guru', v: akunSummary.guru}, {l:'Admin', v: akunSummary.admin}].map(stat => (
          <div key={stat.l} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{stat.l}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200 mb-6">
        {[
          { id: 'murid', label: 'Murid', icon: <IconUsers className="w-4 h-4" /> },
          { id: 'guru', label: 'Guru & Staff', icon: <IconKey className="w-4 h-4" /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearch(''); setSelectedClassFilter('all') }}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mb-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <input type="text" placeholder="Cari nama, username, ID, atau kode..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {activeTab === 'murid' && (
          <div className="flex items-center px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-semibold">
            <span className="mr-2">TA:</span>
            <select value={selectedTaFilter} onChange={(e) => { setSelectedTaFilter(e.target.value); setSelectedClassFilter('all') }} className="bg-transparent outline-none cursor-pointer">
              <option value="all">Semua</option>
              {tahunAjarans?.map(ta => <option key={ta.id} value={ta.nama}>{ta.nama}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Class Filter (Murid Only) */}
      {activeTab === 'murid' && uniqueClasses.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide mb-2">
          <button onClick={() => setSelectedClassFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-medium border ${selectedClassFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>Semua</button>
          {uniqueClasses.map(c => (
            <button key={c} onClick={() => setSelectedClassFilter(c)} className={`px-4 py-1.5 rounded-full text-xs font-medium border ${selectedClassFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{c}</button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '500px' }}>
        {loading || isProcessing ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
            <p>{progressText || "Memuat data..."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap min-w-[800px]">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Identitas</th>
                  <th className="px-4 py-3">Akun Login</th>
                  {activeTab === 'murid' ? (
                    <th className="px-4 py-3">Kelas (TA)</th>
                  ) : (
                    <th className="px-4 py-3">Role & Penugasan</th>
                  )}
                  <th className="px-4 py-3 text-center bg-slate-50 shadow-[-4px_0_10px_rgba(0,0,0,0.05)] sticky right-0">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mergedData.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">Tidak ada data ditemukan.</td></tr>
                ) : mergedData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="relative group inline-flex">
                        {row.foto_url ? <img src={row.foto_url} className="w-10 h-10 rounded-full object-cover border" /> : <FallbackAvatar name={row.nama} />}
                        <button onClick={() => { setUploadingPhotoFor(row); individualPhotoInputRef.current?.click() }}
                          className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white cursor-pointer z-10">
                          <IconCamera className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors rounded-lg" onClick={() => openBiodataModal(row)}>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">{row.nama}</p>
                        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{activeTab === 'murid' ? row.foreign_id : `Kode: ${row.kode}`}</p>
                    </td>
                    <td className="px-4 py-3">
                      {row.hasAkun ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-slate-800 font-medium">{row.username}</p>
                          <span className="w-fit px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">Aktif</span>
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-400 font-medium">(Belum Punya Akun)</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {activeTab === 'murid' ? (
                        <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{row.kelas} ({row.tahun_ajaran})</span>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-w-[200px] whitespace-normal">
                          <div className="flex flex-wrap gap-1">{getGuruRoles(row.rawGuru).map(r => <span key={r} className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 rounded">{r}</span>)}</div>
                          {getGuruWali(row.rawGuru).length > 0 && <p className="text-[10px] text-slate-600"><span className="font-bold">Wali:</span> {getGuruWali(row.rawGuru).join(', ')}</p>}
                          {Object.keys(getGuruMapel(row.rawGuru)).length > 0 && <p className="text-[10px] text-slate-600"><span className="font-bold">Mapel:</span> {Object.keys(getGuruMapel(row.rawGuru)).join(', ')}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center sticky right-0 bg-white shadow-[-4px_0_10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleDeletePermanen(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Hapus Permanen"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BIODATA MODAL */}
      {showBiodataModal && biodataForm && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{biodataForm.isNew ? 'Buat Data Baru' : 'Edit Data Lengkap'} ({activeTab === 'murid' ? 'Siswa' : 'Guru'})</h3>
              <button onClick={() => setShowBiodataModal(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            
            <form id="biodata-form" onSubmit={handleSaveBiodata} className="p-5 overflow-y-auto space-y-6 flex-1 min-h-0">
              
              {/* SECTION: BIODATA & FOTO */}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800 border-b pb-2 mb-3">Informasi Biodata</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeTab === 'murid' ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">NISN *</label>
                          <input required value={biodataForm.foreign_id} onChange={e => setBiodataForm({...biodataForm, foreign_id: e.target.value})} disabled={!biodataForm.isNew} className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                          <input required value={biodataForm.nama} onChange={e => setBiodataForm({...biodataForm, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kelas (TA: {activeTa?.nama})</label>
                          <input value={biodataForm.kelas} onChange={e => setBiodataForm({...biodataForm, kelas: e.target.value})} placeholder="Contoh: X.1" className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kode Guru *</label>
                          <input required value={biodataForm.kode} onChange={e => setBiodataForm({...biodataForm, kode: e.target.value})} placeholder="g02026" className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                          <input required value={biodataForm.nama} onChange={e => setBiodataForm({...biodataForm, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!biodataForm.isNew && (
                  <div className="w-full md:w-48 flex flex-col items-center shrink-0">
                    <h4 className="text-sm font-bold text-slate-800 border-b w-full text-center pb-2 mb-3">Foto Profil</h4>
                    <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden mb-3 shadow-sm bg-slate-50 flex items-center justify-center">
                      {biodataForm.foto_url ? (
                        <img src={biodataForm.foto_url} alt="Foto" className="w-full h-full object-cover" />
                      ) : (
                        <FallbackAvatar name={biodataForm.nama} className="w-full h-full text-3xl" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                      <button type="button" onClick={() => { setUploadingPhotoFor(biodataForm.row); individualPhotoInputRef.current?.click() }} className="text-xs font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors flex justify-center items-center gap-1.5 w-full"><IconUpload className="w-3.5 h-3.5" /> Ganti Foto</button>
                      {biodataForm.foto_url && (
                        <button type="button" onClick={handleDeletePhotoModal} className="text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors flex justify-center items-center w-full">Hapus Foto</button>
                      )}
                      <div className="w-full h-px bg-slate-200 my-1"></div>
                      <button type="button" onClick={() => handleLoginAsUser(biodataForm.row)} className="text-xs font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 px-3 py-2 rounded-lg transition-all flex justify-center items-center gap-1.5 w-full shadow-sm">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        Login sebagai User
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: GURU PENUGASAN */}
              {activeTab === 'guru' && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 border-b pb-2 mb-3">Role & Penugasan</h4>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-slate-700 mb-2">Role Pengguna</label>
                    <div className="flex flex-wrap gap-2">
                      {roles.map(r => (
                        <label key={r.id} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer text-xs font-medium transition-colors ${biodataForm.role_ids.includes(r.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <input type="checkbox" className="hidden" checked={biodataForm.role_ids.includes(r.id)}
                            onChange={(e) => {
                              const newRoles = e.target.checked ? [...biodataForm.role_ids, r.id] : biodataForm.role_ids.filter(id => id !== r.id)
                              setBiodataForm({...biodataForm, role_ids: newRoles})
                            }} />
                          {r.nama}
                        </label>
                      ))}
                    </div>
                  </div>

                  {activeTa && (
                    <div className="space-y-4">
                      {biodataForm.role_ids.includes(roles.find(r => r.nama?.toLowerCase() === 'wali kelas')?.id) && (
                        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                          <label className="block text-xs font-medium text-emerald-800 mb-1.5">Penugasan Wali Kelas (TA: {activeTa.nama})</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {allClassesInTa.map(c => (
                              <label key={c} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg cursor-pointer text-xs font-medium transition-colors ${biodataForm.kelas_assigned.includes(c) ? 'border-emerald-500 bg-emerald-100 text-emerald-800' : 'border-emerald-200 hover:bg-emerald-100 bg-white text-emerald-700'}`}>
                                <input type="checkbox" className="hidden" checked={biodataForm.kelas_assigned.includes(c)}
                                  onChange={(e) => {
                                    const newKelas = e.target.checked ? [...biodataForm.kelas_assigned, c] : biodataForm.kelas_assigned.filter(k => k !== c)
                                    setBiodataForm({...biodataForm, kelas_assigned: newKelas})
                                  }} />
                                {c}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Tugas Mengajar Mapel</label>
                          <button type="button" onClick={() => setBiodataForm({...biodataForm, mapel_assigned: [...biodataForm.mapel_assigned, { mapel_id: '', kelas_list: [] }]})} className="text-xs font-medium text-indigo-600 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><IconPlus className="w-3 h-3" /> Tambah Mapel</button>
                        </div>
                        {biodataForm.mapel_assigned.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Belum ada penugasan mapel.</p>
                        ) : (
                          <div className="space-y-3">
                            {biodataForm.mapel_assigned.map((ma, idx) => (
                              <div key={idx} className="flex flex-col gap-2 bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
                                <div className="flex gap-2 items-center">
                                  <select value={ma.mapel_id} onChange={(e) => {
                                      const newMa = [...biodataForm.mapel_assigned]; newMa[idx].mapel_id = e.target.value; setBiodataForm({...biodataForm, mapel_assigned: newMa})
                                    }} className="flex-1 text-sm border border-slate-300 rounded-md py-1.5 px-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    <option value="">-- Pilih Mata Pelajaran --</option>
                                    {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                                  </select>
                                  <button type="button" onClick={() => setBiodataForm({...biodataForm, mapel_assigned: biodataForm.mapel_assigned.filter((_, i) => i !== idx)})} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                </div>
                                
                                <div className="w-full flex flex-wrap gap-1.5">
                                  {allClassesInTa.map(c => (
                                    <label key={c} className={`px-2 py-1 border rounded cursor-pointer text-xs font-medium transition-colors ${ma.kelas_list.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                                      <input type="checkbox" className="hidden" checked={ma.kelas_list.includes(c)}
                                        onChange={(e) => {
                                          const newMa = [...biodataForm.mapel_assigned]; 
                                          if (e.target.checked && !newMa[idx].kelas_list.includes(c)) newMa[idx].kelas_list.push(c)
                                          else newMa[idx].kelas_list = newMa[idx].kelas_list.filter(k => k !== c)
                                          setBiodataForm({...biodataForm, mapel_assigned: newMa})
                                        }} />
                                      {c}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: AKUN */}
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <h4 className="text-sm font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-3">Akun Login Portal</h4>
                {biodataForm.hasAkun ? (
                  <p className="text-xs text-indigo-600 mb-3 font-medium">Pengguna ini sudah memiliki akun login. Mengubah data di bawah akan memperbarui akunnya.</p>
                ) : (
                  <p className="text-xs text-amber-600 mb-3 font-medium">Pengguna ini belum memiliki akun login. Isi form di bawah untuk membuatkannya.</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email / Username *</label>
                    <input required value={biodataForm.username} onChange={e => setBiodataForm({...biodataForm, username: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{biodataForm.hasAkun ? 'Ganti Password (Opsional)' : 'Password Awal'}</label>
                    <input type="text" value={biodataForm.password} onChange={e => setBiodataForm({...biodataForm, password: e.target.value})} placeholder={biodataForm.hasAkun ? 'Biarkan kosong jika tidak diubah' : 'Default: 123456'} className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

            </form>
            <div className="p-5 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowBiodataModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">Batal</button>
              <button type="submit" form="biodata-form" disabled={isProcessing} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 flex items-center gap-2">
                {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
