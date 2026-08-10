import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'

export default function AdminPrestasiSection({ session, activeTa, readOnly = false }) {
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('daftar') // 'daftar', 'poin_sync'

  // School Years & Filters
  const [tahunAjarans, setTahunAjarans] = useState([])
  const [selectedTaId, setSelectedTaId] = useState('')
  const [selectedTaName, setSelectedTaName] = useState('')
  const [filterKelas, setFilterKelas] = useState('all')
  const [filterTingkat, setFilterTingkat] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [classList, setClassList] = useState([])

  // Main Data States
  const [prestasiList, setPrestasiList] = useState([])
  const [poinPositifList, setPoinPositifList] = useState([])

  // Modal Input / Edit Prestasi State
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingPrestasi, setEditingPrestasi] = useState(null)
  
  // Form Fields
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [formNamaLomba, setFormNamaLomba] = useState('')
  const [formKategori, setFormKategori] = useState('Akademik')
  const [formTingkat, setFormTingkat] = useState('Kota / Kabupaten')
  const [formPeringkat, setFormPeringkat] = useState('Juara 1')
  const [formPenyelenggara, setFormPenyelenggara] = useState('')
  const [formTanggal, setFormTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [formKeterangan, setFormKeterangan] = useState('')
  const [formPoinRecordId, setFormPoinRecordId] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [existingBuktiUrl, setExistingBuktiUrl] = useState('')

  // Preview Bukti / Sertifikat Modal
  const [previewMedia, setPreviewMedia] = useState(null)

  // Notification & Confirm Modals
  const [notifyModal, setNotifyModal] = useState({ show: false, type: 'success', title: '', message: '' })
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null })

  // Cloudinary Config
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  const TINGKAT_OPTIONS = ['Sekolah', 'Kecamatan', 'Kota / Kabupaten', 'Provinsi', 'Nasional', 'Internasional']
  const PERINGKAT_OPTIONS = ['Juara 1', 'Juara 2', 'Juara 3', 'Harapan 1', 'Harapan 2', 'Harapan 3', 'Finalis', 'Peserta / Keikutsertaan']
  const KATEGORI_OPTIONS = ['Akademik', 'Olahraga', 'Seni & Budaya', 'Keagamaan', 'Teknologi', 'Lainnya']

  useEffect(() => {
    fetchTahunAjarans()
  }, [])

  useEffect(() => {
    if (selectedTaId) {
      fetchData()
    }
  }, [selectedTaId, activeTab])

  const fetchTahunAjarans = async () => {
    const { data, error } = await supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false })
    if (error) {
      console.error('Error fetching tahun ajaran:', error)
      return
    }
    setTahunAjarans(data || [])
    if (data && data.length > 0) {
      const active = activeTa?.id ? data.find(ta => ta.id === activeTa.id) : data[0]
      const defaultTa = active || data[0]
      setSelectedTaId(defaultTa.id)
      setSelectedTaName(defaultTa.nama)
    }
  }

  const handleTaChange = (e) => {
    const taId = e.target.value
    const ta = tahunAjarans.find(t => t.id === taId)
    setSelectedTaId(taId)
    if (ta) setSelectedTaName(ta.nama)
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      // 1. Fetch classes for filter dropdown
      const { data: enrollmentData } = await supabase
        .from('enrollment')
        .select('kelas')
        .eq('tahun_ajaran_id', selectedTaId)
      const uniqueClasses = [...new Set((enrollmentData || []).map(e => e.kelas))].filter(Boolean).sort()
      setClassList(uniqueClasses)

      if (activeTab === 'daftar') {
        // Fetch prestasi list for current TA
        const { data: pData, error: pErr } = await supabase
          .from('prestasi_siswa')
          .select('*')
          .eq('tahun_ajaran_id', selectedTaId)
          .order('tanggal_lomba', { ascending: false })

        if (pErr) throw pErr

        // Fetch student names map
        const { data: siswaData } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap')

        let nameMap = {}
        if (siswaData) {
          siswaData.forEach(s => {
            if (s.nisn) nameMap[String(s.nisn)] = s.nama_lengkap
          })
        }

        // Map class for each student
        const { data: eData } = await supabase
          .from('enrollment')
          .select('nisn, kelas')
          .eq('tahun_ajaran_id', selectedTaId);

        let enrollMap = {};
        if (eData) {
          eData.forEach(e => {
            if (e.nisn) enrollMap[String(e.nisn)] = e.kelas;
          });
        }

        const enriched = (pData || []).map(p => ({
          ...p,
          siswa: { nama_lengkap: nameMap[String(p.siswa_nisn)] || p.siswa_nisn },
          kelas: enrollMap[String(p.siswa_nisn)] || '-'
        }))

        setPrestasiList(enriched)
      } else if (activeTab === 'poin_sync') {
        // Fetch positive point records directly using column poin_diberikan
        const { data: ptData, error: ptErr } = await supabase
          .from('point_records')
          .select('*')
          .eq('tahun_ajaran_id', selectedTaId)
          .gt('poin_diberikan', 0)
          .order('tanggal', { ascending: false })

        if (ptErr) throw ptErr

        // Fetch student names map
        const { data: siswaData } = await supabase
          .from('siswa_permanent')
          .select('nisn, nama_lengkap')

        let nameMap = {}
        if (siswaData) {
          siswaData.forEach(s => {
            if (s.nisn) nameMap[String(s.nisn)] = s.nama_lengkap
          })
        }

        // Check which point records are already linked to prestasi_siswa
        const { data: existingPrestasi } = await supabase
          .from('prestasi_siswa')
          .select('poin_record_id')
          .eq('tahun_ajaran_id', selectedTaId)

        const linkedPoinIds = new Set((existingPrestasi || []).map(p => p.poin_record_id).filter(Boolean))

        const { data: eData } = await supabase
          .from('enrollment')
          .select('nisn, kelas')
          .eq('tahun_ajaran_id', selectedTaId);

        let enrollMap = {};
        if (eData) {
          eData.forEach(e => {
            if (e.nisn) enrollMap[String(e.nisn)] = e.kelas;
          });
        }

        const filteredPoin = (ptData || []).map(pt => ({
          ...pt,
          poin: pt.poin_diberikan ?? pt.poin ?? 0,
          nama_lengkap: nameMap[String(pt.nisn)] || pt.nama_siswa || pt.nisn,
          kelas: enrollMap[String(pt.nisn)] || pt.kelas || '-',
          isImported: linkedPoinIds.has(pt.id)
        }))

        setPoinPositifList(filteredPoin)
      }
    } catch (err) {
      console.error('Error fetching prestasi data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Student Search Autocomplete for Form Modal
  const handleStudentSearch = async (term) => {
    setStudentSearch(term)
    if (!term.trim() || term.length < 2) {
      setStudentResults([])
      return
    }
    try {
      // Query siswa_lengkap filtering by selectedTaId (Tahun Ajaran yang dipilih)
      let { data, error } = await supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas')
        .eq('tahun_ajaran_id', selectedTaId)
        .or(`nama_lengkap.ilike.%${term}%,nisn.ilike.%${term}%`)
        .limit(8)

      // Fallback if view doesn't return or error
      if (error || !data || data.length === 0) {
        const { data: eData } = await supabase
          .from('enrollment')
          .select('nisn, kelas, siswa:siswa_permanent(nisn, nama_lengkap)')
          .eq('tahun_ajaran_id', selectedTaId)

        if (eData) {
          const lowerTerm = term.toLowerCase()
          data = eData
            .map(e => ({
              nisn: e.nisn,
              nama_lengkap: e.siswa?.nama_lengkap || e.nisn,
              kelas: e.kelas
            }))
            .filter(s => s.nama_lengkap.toLowerCase().includes(lowerTerm) || s.nisn.toLowerCase().includes(lowerTerm))
            .slice(0, 8)
        }
      }

      setStudentResults(data || [])
    } catch (err) {
      console.error(err)
    }
  }

  const selectStudent = (student) => {
    setSelectedStudent(student)
    setStudentSearch(student.nama_lengkap)
    setStudentResults([])
  }

  // Open Form Modal (Tambah Baru)
  const openAddModal = () => {
    setEditingPrestasi(null)
    setSelectedStudent(null)
    setStudentSearch('')
    setFormNamaLomba('')
    setFormKategori('Akademik')
    setFormTingkat('Kota / Kabupaten')
    setFormPeringkat('Juara 1')
    setFormPenyelenggara('')
    setFormTanggal(new Date().toISOString().slice(0, 10))
    setFormKeterangan('')
    setFormPoinRecordId(null)
    setSelectedFile(null)
    setExistingBuktiUrl('')
    setShowFormModal(true)
  }

  // Open Form Modal (Edit)
  const openEditModal = (item) => {
    setEditingPrestasi(item)
    setSelectedStudent({ nisn: item.siswa_nisn, nama_lengkap: item.siswa?.nama_lengkap, kelas: item.kelas })
    setStudentSearch(item.siswa?.nama_lengkap || item.siswa_nisn)
    setFormNamaLomba(item.nama_lomba)
    setFormKategori(item.kategori_lomba || 'Akademik')
    setFormTingkat(item.tingkat)
    setFormPeringkat(item.peringkat)
    setFormPenyelenggara(item.penyelenggara || '')
    setFormTanggal(item.tanggal_lomba)
    setFormKeterangan(item.keterangan || '')
    setFormPoinRecordId(item.poin_record_id || null)
    setSelectedFile(null)
    setExistingBuktiUrl(item.bukti_url || '')
    setShowFormModal(true)
  }

  // Tarik dari Catatan Poin Positif
  const handleImportFromPoin = (poinItem) => {
    setEditingPrestasi(null)
    const studentName = poinItem.nama_lengkap || poinItem.nama_siswa || poinItem.nisn
    setSelectedStudent({ nisn: poinItem.nisn, nama_lengkap: studentName, kelas: poinItem.kelas })
    setStudentSearch(studentName)
    
    const desc = poinItem.jenis || poinItem.keterangan || ''
    setFormNamaLomba(desc)
    setFormKategori(poinItem.kategori?.toLowerCase().includes('non') ? 'Non-Akademik' : 'Akademik')
    setFormTingkat('Kota / Kabupaten')
    
    // Auto detect rank if present in text
    const lower = desc.toLowerCase()
    if (lower.includes('juara 1') || lower.includes('juara i')) setFormPeringkat('Juara 1')
    else if (lower.includes('juara 2') || lower.includes('juara ii')) setFormPeringkat('Juara 2')
    else if (lower.includes('juara 3') || lower.includes('juara iii')) setFormPeringkat('Juara 3')
    else if (lower.includes('harapan 1')) setFormPeringkat('Harapan 1')
    else if (lower.includes('harapan 2')) setFormPeringkat('Harapan 2')
    else if (lower.includes('harapan 3')) setFormPeringkat('Harapan 3')
    else setFormPeringkat('Peserta / Keikutsertaan')

    setFormPenyelenggara('')
    setFormTanggal(poinItem.tanggal || new Date().toISOString().slice(0, 10))
    setFormKeterangan(poinItem.keterangan ? `${poinItem.keterangan} (Diimpor dari poin positif +${poinItem.poin})` : `Diimpor dari catatan poin positif (+${poinItem.poin} poin)`)
    setFormPoinRecordId(poinItem.id)
    setSelectedFile(null)
    setExistingBuktiUrl('')

    setShowFormModal(true)
  }

  // Submit Form Prestasi (Insert / Update)
  const handleSubmitForm = async (e) => {
    e.preventDefault()
    if (!selectedStudent || !selectedStudent.nisn) {
      setNotifyModal({ show: true, type: 'warning', title: 'Siswa Belum Dipilih', message: 'Silakan cari dan pilih siswa terlebih dahulu.' })
      return
    }
    if (!formNamaLomba.trim()) {
      setNotifyModal({ show: true, type: 'warning', title: 'Nama Lomba Kosong', message: 'Silakan isi nama kegiatan / lomba.' })
      return
    }

    setIsSubmitting(true)
    try {
      let uploadedUrl = existingBuktiUrl

      // Upload file to Cloudinary if selected
      if (selectedFile) {
        const publicId = `PRESTASI_${selectedStudent.nisn}_${Date.now()}`
        const folder = `prestasi_siswa`

        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('upload_preset', UPLOAD_PRESET)
        formData.append('public_id', publicId)
        formData.append('folder', folder)

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) throw new Error("Upload bukti sertifikat gagal")
        const data = await res.json()
        uploadedUrl = data.secure_url
      }

      const recordPayload = {
        siswa_nisn: selectedStudent.nisn,
        nama_lomba: formNamaLomba.trim(),
        kategori_lomba: formKategori,
        tingkat: formTingkat,
        peringkat: formPeringkat,
        penyelenggara: formPenyelenggara.trim() || null,
        tanggal_lomba: formTanggal,
        poin_record_id: formPoinRecordId,
        bukti_url: uploadedUrl || null,
        keterangan: formKeterangan.trim() || null,
        tahun_ajaran_id: selectedTaId
      }

      if (editingPrestasi) {
        const { error } = await supabase
          .from('prestasi_siswa')
          .update(recordPayload)
          .eq('id', editingPrestasi.id)
        if (error) throw error
        setNotifyModal({ show: true, type: 'success', title: 'Berhasil Diperbarui', message: `Data prestasi "${formNamaLomba}" telah diperbarui.` })
      } else {
        const { error } = await supabase
          .from('prestasi_siswa')
          .insert([recordPayload])
        if (error) throw error
        setNotifyModal({ show: true, type: 'success', title: 'Berhasil Disimpan!', message: `Data prestasi "${formNamaLomba}" untuk ${selectedStudent.nama_lengkap} telah disimpan.` })
      }

      setShowFormModal(false)
      fetchData()
    } catch (err) {
      console.error(err)
      setNotifyModal({ show: true, type: 'error', title: 'Gagal Menyimpan', message: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete Prestasi
  const handleDeletePrestasi = (id, namaLomba) => {
    setConfirmModal({
      show: true,
      title: 'Hapus Catatan Prestasi?',
      message: `Apakah Anda yakin ingin menghapus catatan lomba/prestasi "${namaLomba}"?`,
      onConfirm: async () => {
        setIsSubmitting(true)
        try {
          const { error } = await supabase.from('prestasi_siswa').delete().eq('id', id)
          if (error) throw error
          setNotifyModal({ show: true, type: 'success', title: 'Berhasil Dihapus', message: 'Data prestasi telah berhasil dihapus.' })
          fetchData()
        } catch (err) {
          console.error(err)
          setNotifyModal({ show: true, type: 'error', title: 'Gagal Menghapus', message: err.message })
        } finally {
          setIsSubmitting(false)
        }
      }
    })
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredPrestasi.length === 0) {
      setNotifyModal({ show: true, type: 'warning', title: 'Tidak Ada Data', message: 'Tidak ada data prestasi yang dapat di-export.' })
      return
    }

    const dataToExport = filteredPrestasi.map((p, idx) => ({
      No: idx + 1,
      NISN: p.siswa_nisn,
      'Nama Siswa': p.siswa?.nama_lengkap || '-',
      Kelas: p.kelas || '-',
      'Nama Lomba / Kegiatan': p.nama_lomba,
      Kategori: p.kategori_lomba || 'Akademik',
      Tingkat: p.tingkat,
      Peringkat: p.peringkat,
      Penyelenggara: p.penyelenggara || '-',
      Tanggal: p.tanggal_lomba,
      Keterangan: p.keterangan || '-',
      'Tahun Ajaran': selectedTaName
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prestasi Siswa')
    XLSX.writeFile(workbook, `Rekap_Prestasi_Siswa_${selectedTaName.replace('/', '_')}.xlsx`)
  }

  // Filter Prestasi List
  const filteredPrestasi = prestasiList.filter(p => {
    const matchKelas = filterKelas === 'all' || p.kelas === filterKelas
    const matchTingkat = filterTingkat === 'all' || p.tingkat === filterTingkat
    const q = searchQuery.toLowerCase().trim()
    const matchQuery = !q || (
      (p.siswa?.nama_lengkap || '').toLowerCase().includes(q) ||
      (p.siswa_nisn || '').toLowerCase().includes(q) ||
      (p.nama_lomba || '').toLowerCase().includes(q) ||
      (p.penyelenggara || '').toLowerCase().includes(q)
    )
    return matchKelas && matchTingkat && matchQuery
  })

  // Summary Counts
  const totalRecords = filteredPrestasi.length
  const totalJuara = filteredPrestasi.filter(p => p.peringkat.toLowerCase().includes('juara')).length
  const totalPeserta = filteredPrestasi.filter(p => p.peringkat.toLowerCase().includes('peserta') || p.peringkat.toLowerCase().includes('keikutsertaan')).length

  const getRankBadgeColor = (peringkat) => {
    const p = (peringkat || '').toLowerCase()
    if (p.includes('juara 1')) return 'bg-amber-100 text-amber-800 border-amber-300'
    if (p.includes('juara 2')) return 'bg-slate-200 text-slate-800 border-slate-300'
    if (p.includes('juara 3')) return 'bg-orange-100 text-orange-800 border-orange-300'
    if (p.includes('harapan')) return 'bg-purple-100 text-purple-800 border-purple-200'
    return 'bg-blue-50 text-blue-700 border-blue-200'
  }

  return (
    <div className="animate-slide-up flex flex-col h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-4rem)]">
      {/* HEADER SECTION */}
      <div className="shrink-0 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            🏆 Prestasi & Lomba Siswa
          </h2>
          <p className="text-slate-500 text-sm mt-1">Pencatatan keikutsertaan lomba, capaian kejuaraan, dan rekapitulasi prestasi siswa</p>
        </div>

        {/* Dropdown Tahun Ajaran & Tombol Tambah */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Tahun Ajaran:</label>
            <select
              value={selectedTaId}
              onChange={handleTaChange}
              className="bg-white border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              {tahunAjarans.map(ta => (
                <option key={ta.id} value={ta.id}>
                  {ta.nama} {ta.id === activeTa?.id ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          {!readOnly && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
              Input Prestasi Baru
            </button>
          )}
        </div>
      </div>

      {/* TABS HEADER */}
      <div className="shrink-0 flex items-center justify-between border-b border-slate-200 mb-5">
        <div className="flex">
          <button
            onClick={() => setActiveTab('daftar')}
            className={`px-5 py-2.5 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'daftar'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🏆 Daftar Prestasi Siswa
          </button>
          <button
            onClick={() => setActiveTab('poin_sync')}
            className={`px-5 py-2.5 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'poin_sync'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            ⭐ Tarik dari Catatan Poin Positif
          </button>
        </div>

        {activeTab === 'daftar' && (
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 mb-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export Excel
          </button>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-slate-500 text-xs font-semibold">Memuat data prestasi...</p>
            </div>
          </div>
        ) : activeTab === 'daftar' ? (
          /* =======================================
             TAB 1: DAFTAR & INPUT PRESTASI
             ======================================= */
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            {/* STATS & FILTER BAR */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-500 p-4 rounded-xl text-white shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-100">Total Catatan Prestasi</p>
                  <h3 className="text-2xl font-extrabold mt-0.5">{totalRecords} <span className="text-xs font-normal text-amber-100">kegiatan</span></h3>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 rounded-xl text-white shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-100">Total Perolehan Juara</p>
                  <h3 className="text-2xl font-extrabold mt-0.5">{totalJuara} <span className="text-xs font-normal text-indigo-100">kejuaraan</span></h3>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
              </div>

              <div className="bg-gradient-to-r from-sky-500 to-cyan-500 p-4 rounded-xl text-white shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-100">Keikutsertaan / Peserta</p>
                  <h3 className="text-2xl font-extrabold mt-0.5">{totalPeserta} <span className="text-xs font-normal text-sky-100">partisipasi</span></h3>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                </div>
              </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="Cari siswa, NISN, atau nama lomba..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-72 px-3 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-slate-600">Kelas:</label>
                  <select
                    value={filterKelas}
                    onChange={(e) => setFilterKelas(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="all">Semua Kelas</option>
                    {classList.map(k => (
                      <option key={k} value={k}>Kelas {k}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-slate-600">Tingkat:</label>
                  <select
                    value={filterTingkat}
                    onChange={(e) => setFilterTingkat(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="all">Semua Tingkat</option>
                    {TINGKAT_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* TABLE LIST */}
            <div className="overflow-auto border border-slate-200 rounded-xl flex-1 min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Kegiatan / Lomba</th>
                    <th className="px-4 py-3 font-semibold text-center">Tingkat</th>
                    <th className="px-4 py-3 font-semibold text-center">Hasil / Peringkat</th>
                    <th className="px-4 py-3 font-semibold">Penyelenggara & Tanggal</th>
                    <th className="px-4 py-3 font-semibold text-center">Bukti</th>
                    {!readOnly && <th className="px-4 py-3 font-semibold text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPrestasi.length === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 6 : 7} className="px-5 py-8 text-center text-slate-500">
                        Belum ada catatan prestasi atau lomba terdaftar pada filter ini.
                      </td>
                    </tr>
                  ) : filteredPrestasi.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-800 text-xs">{item.siswa?.nama_lengkap || item.siswa_nisn}</p>
                        <p className="text-[10px] text-slate-400 font-mono">NISN: {item.siswa_nisn} • Kelas {item.kelas}</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-bold text-indigo-700 text-xs">{item.nama_lomba}</p>
                        <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold uppercase mt-0.5">
                          {item.kategori_lomba || 'Akademik'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold">
                          {item.tingkat}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${getRankBadgeColor(item.peringkat)}`}>
                          {item.peringkat}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <p className="font-semibold text-slate-700">{item.penyelenggara || '-'}</p>
                        <p className="text-[10px] text-slate-400">{item.tanggal_lomba}</p>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {item.bukti_url ? (
                          <button
                            onClick={() => setPreviewMedia({ url: item.bukti_url, title: item.nama_lomba })}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md font-semibold text-[11px] transition flex items-center gap-1 mx-auto"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                            Lihat Bukti
                          </button>
                        ) : (
                          <span className="text-[10px] italic text-slate-400">-</span>
                        )}
                      </td>

                      {!readOnly && (
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              onClick={() => openEditModal(item)}
                              className="text-indigo-600 hover:text-indigo-800 text-xs font-bold"
                            >
                              Edit
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={() => handleDeletePrestasi(item.id, item.nama_lomba)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-bold"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* =======================================
             TAB 2: TARIK DARI CATATAN POIN POSITIF
             ======================================= */
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3 shrink-0">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <div>
                <h4 className="font-bold text-indigo-900 text-sm">Integrasi Catatan Poin Positif</h4>
                <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                  Guru / Piket yang mencatat poin positif siswa (misal: Kejuaraan, Lomba, atau Prestasi) akan muncul di bawah ini. Anda dapat mengimpor catatan poin tersebut secara langsung menjadi data resmi Prestasi Siswa.
                </p>
              </div>
            </div>

            <div className="overflow-auto border border-slate-200 rounded-xl flex-1 min-h-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-5 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-5 py-3 font-semibold">Catatan Poin Positif</th>
                    <th className="px-5 py-3 font-semibold text-center">Poin Diberikan</th>
                    <th className="px-5 py-3 font-semibold">Tanggal</th>
                    <th className="px-5 py-3 font-semibold text-center">Status Impor</th>
                    {!readOnly && <th className="px-5 py-3 font-semibold text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {poinPositifList.length === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 5 : 6} className="px-5 py-8 text-center text-slate-500">
                        Belum ada catatan poin positif terdaftar untuk tahun ajaran ini.
                      </td>
                    </tr>
                  ) : poinPositifList.map(poin => (
                    <tr key={poin.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-800 text-xs">{poin.nama_lengkap || poin.nama_siswa || poin.nisn}</p>
                        <p className="text-[10px] text-slate-400 font-mono">NISN: {poin.nisn} • Kelas {poin.kelas}</p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800 text-xs">{poin.jenis || poin.keterangan || '-'}</p>
                        <span className="text-[10px] text-indigo-600 font-medium">{poin.kategori || 'Penghargaan / Prestasi'}</span>
                      </td>

                      <td className="px-5 py-4 text-center">
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          +{poin.poin} Poin
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-500 font-medium">
                        {poin.tanggal}
                      </td>

                      <td className="px-5 py-4 text-center">
                        {poin.isImported ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 w-max mx-auto">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                            Sudah Diimpor
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">
                            Belum Diimpor
                          </span>
                        )}
                      </td>

                      {!readOnly && (
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => handleImportFromPoin(poin)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 mx-auto ${
                              poin.isImported 
                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' 
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                            }`}
                          >
                            {poin.isImported ? 'Impor Ulang' : 'Tarik ke Prestasi'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* FORM MODAL (TAMBAH / EDIT PRESTASI) */}
      {showFormModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">
                {editingPrestasi ? 'Edit Catatan Prestasi' : 'Input Catatan Prestasi Baru'}
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 overflow-auto flex-1 space-y-4">
              {/* Cari Siswa Autocomplete */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Pilih Siswa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ketik Nama Siswa atau NISN..."
                  value={studentSearch}
                  onChange={(e) => handleStudentSearch(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                />

                {studentResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1 shadow-lg z-20 overflow-hidden max-h-48 overflow-y-auto">
                    {studentResults.map(s => (
                      <div
                        key={s.nisn}
                        onClick={() => selectStudent(s)}
                        className="p-3 hover:bg-indigo-50 cursor-pointer transition border-b border-slate-100 last:border-0"
                      >
                        <p className="font-bold text-xs text-slate-800">{s.nama_lengkap}</p>
                        <p className="text-[10px] text-slate-400">NISN: {s.nisn} • Kelas {s.kelas}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Kelas Siswa (Otomatis terisi di bawahnya) */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Kelas Siswa</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={selectedStudent ? `Kelas ${selectedStudent.kelas} (NISN: ${selectedStudent.nisn})` : 'Otomatis terisi setelah siswa dipilih'}
                  className={`w-full px-3.5 py-2.5 border rounded-xl text-sm font-bold cursor-not-allowed ${
                    selectedStudent 
                      ? 'bg-indigo-50/60 border-indigo-200 text-indigo-900' 
                      : 'bg-slate-100 border-slate-200 text-slate-400 font-normal italic'
                  }`}
                />
              </div>

              {/* Nama Lomba */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Nama Kegiatan / Lomba *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Olimpiade Sains Nasional Matematika"
                  value={formNamaLomba}
                  onChange={(e) => setFormNamaLomba(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Kategori & Tingkat */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Kategori Lomba</label>
                  <select
                    value={formKategori}
                    onChange={(e) => setFormKategori(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  >
                    {KATEGORI_OPTIONS.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Tingkat Lomba *</label>
                  <select
                    value={formTingkat}
                    onChange={(e) => setFormTingkat(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  >
                    {TINGKAT_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Peringkat & Tanggal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Peringkat / Hasil *</label>
                  <select
                    value={formPeringkat}
                    onChange={(e) => setFormPeringkat(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-semibold"
                  >
                    {PERINGKAT_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Tanggal Lomba *</label>
                  <input
                    type="date"
                    required
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Penyelenggara */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Penyelenggara</label>
                <input
                  type="text"
                  placeholder="Misal: Dinas Pendidikan DKI Jakarta / Kemendikbud"
                  value={formPenyelenggara}
                  onChange={(e) => setFormPenyelenggara(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Upload File Bukti / Sertifikat */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Upload Bukti Sertifikat / Foto (Opsional)</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
                {existingBuktiUrl && !selectedFile && (
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1">✓ Berkas bukti sudah terunggah</p>
                )}
              </div>

              {/* Keterangan Tambahan */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Keterangan Tambahan</label>
                <textarea
                  placeholder="Catatan pendukung atau detail pencapaian"
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  rows="2"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Data Prestasi'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* PREVIEW MEDIA MODAL */}
      {previewMedia && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
            <div className="p-4 px-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
              <h3 className="font-bold text-base text-slate-800 truncate">{previewMedia.title}</h3>
              <button 
                onClick={() => setPreviewMedia(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-100/70">
              <img src={previewMedia.url} alt={previewMedia.title} className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-md" />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* NOTIFICATION ALERT MODAL */}
      {notifyModal.show && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-scale-up">
            {notifyModal.type === 'success' ? (
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : notifyModal.type === 'error' ? (
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}

            <h3 className="font-extrabold text-slate-800 text-lg">{notifyModal.title}</h3>
            <p className="text-slate-500 text-xs font-semibold mt-1.5 leading-relaxed px-2">{notifyModal.message}</p>

            <button
              onClick={() => setNotifyModal(prev => ({ ...prev, show: false }))}
              className={`w-full mt-5 py-2.5 rounded-xl text-xs font-extrabold text-white transition-all shadow-md ${
                notifyModal.type === 'success' 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                  : notifyModal.type === 'error'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
              }`}
            >
              Selesai
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.show && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-scale-up">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <h3 className="font-extrabold text-slate-800 text-lg">{confirmModal.title}</h3>
            <p className="text-slate-500 text-xs font-semibold mt-1.5 leading-relaxed px-2">{confirmModal.message}</p>

            <div className="grid grid-cols-2 gap-2.5 w-full mt-5">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                className="py-2.5 rounded-xl text-xs font-extrabold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const action = confirmModal.onConfirm
                  setConfirmModal(prev => ({ ...prev, show: false }))
                  if (action) action()
                }}
                className="py-2.5 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-200 transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
