import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import TagInput from './TagInput'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export default function ProgramSekolahSection({ session, isAdmin = false, activeTa }) {
  const [programs, setPrograms] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [targets, setTargets] = useState([])
  const [teachers, setTeachers] = useState([])
  
  // States untuk filter dan tampilan
  const [loading, setLoading] = useState(true)
  const [activeDate, setActiveDate] = useState(new Date()) // Bulan yang sedang dilihat
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalDateString(new Date())) // Tanggal aktif yang dipilih
  const [selectedCategories, setSelectedCategories] = useState([]) // Array of category IDs for filtering
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [slogan, setSlogan] = useState('SINERGI, OPTIMIS, LOYALITAS, INTEGRITAS & DEDIKATIF')
  const [logoUrl, setLogoUrl] = useState(null)
  const [activeSemester, setActiveSemester] = useState(0) // 0 = Semester 1 (Jul-Des), 1 = Semester 2 (Jan-Jun)

  // Modal States
  // Inline date panel (replaces popup modal)
  const [inlinePanelDate, setInlinePanelDate] = useState(null) // dateStr of opened panel
  const [inlineNewName, setInlineNewName] = useState('')
  const [inlineSaving, setInlineSaving] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState(null)

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDanger: true
  })

  const triggerConfirm = (title, message, onConfirm, isDanger = true) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: async () => {
        await onConfirm()
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
      },
      isDanger
    })
  }

  // Read-only Info Modal State
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [selectedInfoProgram, setSelectedInfoProgram] = useState(null)

  const handleOpenProgram = (prog) => {
    if (hasWriteAccess) {
      handleOpenDetail(prog)
    } else {
      setSelectedInfoProgram(prog)
      setInfoModalOpen(true)
    }
  }

  // Month filter state
  const [selectedMonthFilter, setSelectedMonthFilter] = useState('ALL')
  
  // Detail Form States
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formLocation, setFormLocation] = useState([])
  const [formBudget, setFormBudget] = useState(0)
  const [formStatus, setFormStatus] = useState('Direncanakan')
  const [formHariEfektif, setFormHariEfektif] = useState(true)
  const [formVisibility, setFormVisibility] = useState('internal')
  const [formCategories, setFormCategories] = useState([])
  const [formPics, setFormPics] = useState([])
  const [formTargets, setFormTargets] = useState([])
  
  // Files States
  const [existingDocs, setExistingDocs] = useState([])
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)

  // Laporan States
  const [laporanRingkasan, setLaporanRingkasan] = useState('')
  const [laporanPeserta, setLaporanPeserta] = useState(0)
  const [laporanEvaluasi, setLaporanEvaluasi] = useState('')
  const [existingPhotos, setExistingPhotos] = useState([])
  const [uploadedPhotos, setUploadedPhotos] = useState([])

  const isKepalaSekolah = session?.roles?.some(r => r.nama.toLowerCase().includes('kepala sekolah'))
  const hasWriteAccess = isAdmin || isKepalaSekolah

  // Calendar calculations for PDF poster
  const startYear = activeTa?.nama ? parseInt(activeTa.nama.split('/')[0]) || 2024 : 2024
  const endYear = activeTa?.nama ? parseInt(activeTa.nama.split('/')[1]) || 2025 : 2025

  const monthDefs = [
    { m: 6, y: startYear, label: 'JULI' },
    { m: 7, y: startYear, label: 'AGUSTUS' },
    { m: 8, y: startYear, label: 'SEPTEMBER' },
    { m: 9, y: startYear, label: 'OKTOBER' },
    { m: 10, y: startYear, label: 'NOVEMBER' },
    { m: 11, y: startYear, label: 'DESEMBER' },
    { m: 0, y: endYear, label: 'JANUARI' },
    { m: 1, y: endYear, label: 'FEBRUARI' },
    { m: 2, y: endYear, label: 'MARET' },
    { m: 3, y: endYear, label: 'APRIL' },
    { m: 4, y: endYear, label: 'MEI' },
    { m: 5, y: endYear, label: 'JUNI' }
  ]

  const getMonthDays = (m, y) => {
    const firstDay = new Date(y, m, 1).getDay()
    const totalDays = new Date(y, m + 1, 0).getDate()
    return { firstDay, totalDays }
  }

  const generatePosterPDF = async () => {
    setIsGenerating(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210

      // Page 1: Capture Semester 1
      const sem1El = document.getElementById('kalender-poster-sem1')
      const canvas1 = await html2canvas(sem1El, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        scrollX: 0,
        scrollY: 0
      })
      const img1 = canvas1.toDataURL('image/png')
      const imgHeight1 = (canvas1.height * imgWidth) / canvas1.width
      pdf.addImage(img1, 'PNG', 0, 0, imgWidth, imgHeight1)

      // Page 2: Capture Semester 2
      const sem2El = document.getElementById('kalender-poster-sem2')
      if (sem2El) {
        pdf.addPage()
        const canvas2 = await html2canvas(sem2El, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          width: 794,
          height: 1123,
          windowWidth: 794,
          windowHeight: 1123,
          scrollX: 0,
          scrollY: 0
        })
        const img2 = canvas2.toDataURL('image/png')
        const imgHeight2 = (canvas2.height * imgWidth) / canvas2.width
        pdf.addImage(img2, 'PNG', 0, 0, imgWidth, imgHeight2)
      }

      pdf.save(`kalender-akademik-${startYear}-${endYear}.pdf`)
    } catch (err) {
      alert('Gagal membuat PDF: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateDummyData = async () => {
    if (!window.confirm("Isi data kalender akademik SMP Budi Mulia TA 2026/2027? Data yang sudah ada tidak akan dihapus.")) return
    setLoading(true)
    try {
      // TA 2026/2027 → Semester 1: Juli-Des 2026, Semester 2: Jan-Jul 2027
      const S1 = 2026  // startYear
      const S2 = 2027  // endYear

      // Pastikan semua kategori tersedia
      const ensureCat = async (nama, warna) => {
        let cat = categories.find(c => c.nama === nama)
        if (!cat) {
          const { data } = await supabase.from('program_sekolah_kategori')
            .insert([{ nama, warna }]).select().single()
          if (data) { cat = data; setCategories(prev => [...prev, data]) }
        }
        return cat?.id || null
      }

      const acaraId   = await ensureCat('Acara', '#3b82f6')
      const ujianId   = await ensureCat('Ujian', '#f97316')
      const liburId   = await ensureCat('Libur', '#ef4444')
      const lainnyaId = await ensureCat('Lainnya', '#6b7280')
      const progKSId  = await ensureCat('Program Kepala Sekolah', '#10b981')

      // Helper shorthand
      const d = (y, m, day) => `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`

      const dummyPrograms = [
        // ──────────────────────────────────────────────
        // SEMESTER 1 – JULI 2026 (HE = 14)
        // ──────────────────────────────────────────────
        { nama: 'Libur Akhir Tahun Pelajaran 2025/2026', start: d(S1,7,1), end: d(S1,7,6), catId: liburId, efektif: false },
        { nama: 'OSIS Menyiapkan Kegiatan MPLS & Pembentukan Dewan Penggalang', start: d(S1,7,7), end: d(S1,7,7), catId: acaraId, efektif: true },
        { nama: 'Pembekalan MPLS', start: d(S1,7,8), end: d(S1,7,8), catId: acaraId, efektif: true },
        { nama: 'Masa Pengenalan Lingkungan Sekolah (MPLS)', start: d(S1,7,9), end: d(S1,7,10), catId: acaraId, efektif: true },
        { nama: 'Pemberian Materi Mental Health (Bu Indri Psi)', start: d(S1,7,10), end: d(S1,7,10), catId: lainnyaId, efektif: true },
        { nama: 'Upacara Pembukaan T.A 2026-2027 (Gabung dg SMA) & Gelar Talenta MPLS', start: d(S1,7,14), end: d(S1,7,14), catId: acaraId, efektif: true },
        { nama: 'Pembekalan Siswa untuk Tahun Pelajaran 2026-2027', start: d(S1,7,15), end: d(S1,7,16), catId: acaraId, efektif: true },
        { nama: 'Misa Awal Tahun Bersama SMA & Komplek', start: d(S1,7,18), end: d(S1,7,18), catId: acaraId, efektif: true },
        { nama: 'Pemberian Materi Tanggap Bencana – Narasumber BASARNAS', start: d(S1,7,23), end: d(S1,7,23), catId: lainnyaId, efektif: true },
        { nama: 'Penandatanganan KSP', start: d(S1,7,28), end: d(S1,7,28), catId: progKSId, efektif: true },

        // ──────────────────────────────────────────────
        // AGUSTUS 2026 (HE = 21)
        // ──────────────────────────────────────────────
        { nama: 'Parenting Kelas 7 & Pemaparan Program Sekolah Kelas 8 dan 9', start: d(S1,8,2), end: d(S1,8,2), catId: acaraId, efektif: true },
        { nama: 'Pekan Asesmen 1', start: d(S1,8,4), end: d(S1,8,8), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,8,8), end: d(S1,8,8), catId: lainnyaId, efektif: true },
        { nama: 'Pengembalian Hasil Asesmen 1', start: d(S1,8,11), end: d(S1,8,15), catId: ujianId, efektif: true },
        { nama: 'Upacara Hari Pramuka & Kegiatan Pramuka', start: d(S1,8,14), end: d(S1,8,14), catId: acaraId, efektif: true },
        { nama: 'Lomba dalam Rangka HUT ke-80 RI', start: d(S1,8,15), end: d(S1,8,15), catId: acaraId, efektif: true },
        { nama: 'HUT ke-80 Kemerdekaan RI (Upacara Gabungan dengan SMA)', start: d(S1,8,17), end: d(S1,8,17), catId: liburId, efektif: false },
        { nama: 'Gladi Bersih AN', start: d(S1,8,18), end: d(S1,8,21), catId: ujianId, efektif: true },
        { nama: 'Sinkronisasi Pelaksanaan AN', start: d(S1,8,22), end: d(S1,8,24), catId: ujianId, efektif: true },
        { nama: 'Pembekalan Siswa untuk Pelaksanaan ANBK', start: d(S1,8,22), end: d(S1,8,22), catId: ujianId, efektif: true },
        { nama: 'Pelaksanaan AN (Asesmen Nasional)', start: d(S1,8,25), end: d(S1,8,28), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,8,28), end: d(S1,8,28), catId: lainnyaId, efektif: true },
        { nama: 'SMART DAY', start: d(S1,8,29), end: d(S1,8,29), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // SEPTEMBER 2026 (HE = 21)
        // ──────────────────────────────────────────────
        { nama: 'Pembukaan Bulan Kitab Suci Nasional (BKSN)', start: d(S1,9,1), end: d(S1,9,1), catId: acaraId, efektif: true },
        { nama: 'Pekan Asesmen 2', start: d(S1,9,4), end: d(S1,9,8), catId: ujianId, efektif: true },
        { nama: 'Libur Maulud Nabi Muhammad SAW', start: d(S1,9,5), end: d(S1,9,5), catId: liburId, efektif: false },
        { nama: 'Pengembalian Hasil Asesmen 2', start: d(S1,9,11), end: d(S1,9,12), catId: ujianId, efektif: true },
        { nama: 'Sosialisasi Penilaian Sumatif Tengah Semester', start: d(S1,9,12), end: d(S1,9,12), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,9,12), end: d(S1,9,12), catId: lainnyaId, efektif: true },
        { nama: 'Penilaian Sumatif Tengah Semester', start: d(S1,9,15), end: d(S1,9,19), catId: ujianId, efektif: true },
        { nama: 'Pelaksanaan Sulingjar (Kepsek & Guru)', start: d(S1,9,15), end: d(S1,9,30), catId: progKSId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,9,19), end: d(S1,9,19), catId: lainnyaId, efektif: true },
        { nama: 'Persiapan & Pelaksanaan Projek Buzz Learning 1', start: d(S1,9,22), end: d(S1,10,3), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,9,26), end: d(S1,9,26), catId: lainnyaId, efektif: true },
        { nama: 'Lomba Bulan Kitab Suci & Penutupan BKSN (Misa)', start: d(S1,9,29), end: d(S1,9,29), catId: acaraId, efektif: true },
        { nama: 'SMART DAY', start: d(S1,9,30), end: d(S1,9,30), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // OKTOBER 2026 (HE = 23)
        // ──────────────────────────────────────────────
        { nama: 'Hari Kesaktian Pancasila', start: d(S1,10,1), end: d(S1,10,1), catId: liburId, efektif: false },
        { nama: 'Pembukaan Bulan Rosario (Ibadat)', start: d(S1,10,1), end: d(S1,10,1), catId: acaraId, efektif: true },
        { nama: 'Kegiatan Peringatan Bulan Bahasa', start: d(S1,10,1), end: d(S1,10,1), catId: acaraId, efektif: true },
        { nama: 'Pameran Hasil PBL & Pelaksanaan BMLJ', start: d(S1,10,2), end: d(S1,10,4), catId: acaraId, efektif: true },
        { nama: 'Pekan Pembagian Rapor Tengah Semester 1', start: d(S1,10,9), end: d(S1,10,15), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,10,10), end: d(S1,10,10), catId: lainnyaId, efektif: true },
        { nama: 'Hari Pangan Sedunia', start: d(S1,10,16), end: d(S1,10,16), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,10,17), end: d(S1,10,17), catId: lainnyaId, efektif: true },
        { nama: 'Pekan Asesmen 3', start: d(S1,10,20), end: d(S1,10,24), catId: ujianId, efektif: true },
        { nama: 'Pengembalian Hasil Asesmen 3', start: d(S1,10,25), end: d(S1,10,27), catId: ujianId, efektif: true },
        { nama: 'Upacara Sumpah Pemuda (Pakaian Budaya) & Kegiatan Sumpah Pemuda', start: d(S1,10,28), end: d(S1,10,28), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,10,31), end: d(S1,10,31), catId: lainnyaId, efektif: true },
        { nama: 'SMART DAY', start: d(S1,10,31), end: d(S1,10,31), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // NOVEMBER 2026 (HE = 19)
        // ──────────────────────────────────────────────
        { nama: 'Pekan Asesmen 4', start: d(S1,11,3), end: d(S1,11,7), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,11,7), end: d(S1,11,7), catId: lainnyaId, efektif: true },
        { nama: 'Upacara Peringatan Hari Pahlawan', start: d(S1,11,10), end: d(S1,11,10), catId: acaraId, efektif: true },
        { nama: 'Persiapan & Pelaksanaan Projek Buzz Learning 2', start: d(S1,11,10), end: d(S1,11,14), catId: acaraId, efektif: true },
        { nama: 'Pengembalian Hasil Asesmen 4', start: d(S1,11,13), end: d(S1,11,17), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,11,14), end: d(S1,11,14), catId: lainnyaId, efektif: true },
        { nama: 'Penyerahan Hasil Asesmen', start: d(S1,11,17), end: d(S1,11,17), catId: ujianId, efektif: true },
        { nama: 'PjBL 2 & Pemungutan Suara Pemilihan Ketua OSIS', start: d(S1,11,19), end: d(S1,11,19), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S1,11,21), end: d(S1,11,21), catId: lainnyaId, efektif: true },
        { nama: 'Kegiatan Peringatan Hari Pahlawan & HUT Kongregasi BM', start: d(S1,11,24), end: d(S1,11,24), catId: acaraId, efektif: true },
        { nama: 'Perayaan HUT Budi Mulia & HUT PGRI', start: d(S1,11,25), end: d(S1,11,25), catId: acaraId, efektif: true },
        { nama: 'Sosialisasi Penilaian Akhir Semester (PAS)', start: d(S1,11,28), end: d(S1,11,28), catId: ujianId, efektif: true },
        { nama: 'SMART DAY', start: d(S1,11,29), end: d(S1,11,29), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // DESEMBER 2026 (HE = 15)
        // ──────────────────────────────────────────────
        { nama: 'Pelaksanaan Penilaian Akhir Semester (PAS)', start: d(S1,12,4), end: d(S1,12,10), catId: ujianId, efektif: true },
        { nama: 'Pekan Remedial', start: d(S1,12,11), end: d(S1,12,12), catId: ujianId, efektif: true },
        { nama: 'Kegiatan Classmeeting', start: d(S1,12,15), end: d(S1,12,19), catId: acaraId, efektif: true },
        { nama: 'Rapat Hasil Belajar Siswa Semester 1', start: d(S1,12,16), end: d(S1,12,16), catId: progKSId, efektif: true },
        { nama: 'Misa Syukur Akhir Semester 1, Pelantikan Peng. OSIS & Pensi Siswa', start: d(S1,12,18), end: d(S1,12,18), catId: acaraId, efektif: true },
        { nama: 'PENYERAHAN RAPOR SEMESTER 1', start: d(S1,12,19), end: d(S1,12,19), catId: progKSId, efektif: true },
        { nama: 'Libur Khusus Natal & Akhir Semester 1', start: d(S1,12,21), end: d(S1,12,31), catId: liburId, efektif: false },
        { nama: 'Hari Raya Natal', start: d(S1,12,25), end: d(S1,12,25), catId: liburId, efektif: false },

        // ──────────────────────────────────────────────
        // SEMESTER 2 – JANUARI 2027 (HE = 19)
        // ──────────────────────────────────────────────
        { nama: 'Libur Tahun Baru Masehi 2027', start: d(S2,1,1), end: d(S2,1,4), catId: liburId, efektif: false },
        { nama: 'Hari Pertama Masuk Sekolah Semester II', start: d(S2,1,5), end: d(S2,1,5), catId: acaraId, efektif: true },
        { nama: 'Misa Natal & Pentas Natal serta Awal Tahun 2027 (Bersama Komplek)', start: d(S2,1,9), end: d(S2,1,9), catId: acaraId, efektif: true },
        { nama: 'Libur Isra Mi\'raj Nabi Muhammad SAW', start: d(S2,1,16), end: d(S2,1,16), catId: liburId, efektif: false },
        { nama: 'Sehat Bersama', start: d(S2,1,23), end: d(S2,1,23), catId: lainnyaId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,1,30), end: d(S2,1,30), catId: lainnyaId, efektif: true },
        { nama: 'SMART DAY', start: d(S2,1,30), end: d(S2,1,30), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // FEBRUARI 2027 (HE = 17)
        // ──────────────────────────────────────────────
        { nama: 'Pekan Asesmen 1 Semester 2', start: d(S2,2,1), end: d(S2,2,2), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,2,6), end: d(S2,2,6), catId: lainnyaId, efektif: true },
        { nama: 'Pengembalian Hasil Asesmen 1 Semester 2', start: d(S2,2,5), end: d(S2,2,7), catId: ujianId, efektif: true },
        { nama: 'Rekoleksi Kelas 7', start: d(S2,2,7), end: d(S2,2,7), catId: acaraId, efektif: true },
        { nama: 'Penyerahan Hasil Asesmen 1 Semester 2', start: d(S2,2,7), end: d(S2,2,7), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,2,13), end: d(S2,2,13), catId: lainnyaId, efektif: true },
        { nama: 'Retret Kelas 9', start: d(S2,2,9), end: d(S2,2,13), catId: acaraId, efektif: true },
        { nama: 'Pemantapan Karakter melalui Perjusa Kelas 8', start: d(S2,2,13), end: d(S2,2,14), catId: acaraId, efektif: true },
        { nama: 'Libur Hari Raya Imlek', start: d(S2,2,16), end: d(S2,2,18), catId: liburId, efektif: false },
        { nama: 'Rabu Abu', start: d(S2,2,18), end: d(S2,2,18), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,2,20), end: d(S2,2,20), catId: lainnyaId, efektif: true },
        { nama: 'Perkiraan Awal Puasa Ramadan', start: d(S2,2,21), end: d(S2,2,21), catId: lainnyaId, efektif: true },
        { nama: 'Pekan Asesmen 2 Semester 2', start: d(S2,2,24), end: d(S2,2,28), catId: ujianId, efektif: true },
        { nama: 'Pengembalian Hasil Asesmen 2 Semester 2', start: d(S2,2,26), end: d(S2,2,28), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,2,27), end: d(S2,2,27), catId: lainnyaId, efektif: true },
        { nama: 'SMART DAY', start: d(S2,2,27), end: d(S2,2,27), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // MARET 2027 (HE = 15)
        // ──────────────────────────────────────────────
        { nama: 'Sehat Bersama', start: d(S2,3,6), end: d(S2,3,6), catId: lainnyaId, efektif: true },
        { nama: 'Sosialisasi Penilaian Tengah Semester & Asesmen Akhir Tahun Kelas 9', start: d(S2,3,7), end: d(S2,3,7), catId: ujianId, efektif: true },
        { nama: 'Penilaian Tengah Semester Kelas 7 & 8 dan Asesmen Akhir Tahun Kelas 9', start: d(S2,3,9), end: d(S2,3,13), catId: ujianId, efektif: true },
        { nama: 'Penyerahan Terakhir Nilai ATS Kelas 9', start: d(S2,3,14), end: d(S2,3,14), catId: ujianId, efektif: true },
        { nama: 'Libur Idul Fitri', start: d(S2,3,16), end: d(S2,3,24), catId: liburId, efektif: false },
        { nama: 'Sehat Bersama', start: d(S2,3,27), end: d(S2,3,27), catId: lainnyaId, efektif: true },
        { nama: 'Perkiraan TKA Kelas 9', start: d(S2,3,30), end: d(S2,3,30), catId: ujianId, efektif: true },
        { nama: 'Pekan Pembagian Rapor Tengah Semester 2', start: d(S2,3,30), end: d(S2,3,31), catId: progKSId, efektif: true },
        { nama: 'SMART DAY', start: d(S2,3,31), end: d(S2,3,31), catId: acaraId, efektif: true },

        // ──────────────────────────────────────────────
        // APRIL 2027 (HE = 18)
        // ──────────────────────────────────────────────
        { nama: 'Libur Paskah', start: d(S2,4,2), end: d(S2,4,6), catId: liburId, efektif: false },
        { nama: 'Asesmen Sumatif Praktik / PBL Kolaborasi Mapel', start: d(S2,4,9), end: d(S2,4,14), catId: ujianId, efektif: true },
        { nama: 'Susulan Asesmen Sumatif Praktik / PBL Kolaborasi Mapel', start: d(S2,4,15), end: d(S2,4,16), catId: ujianId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,4,17), end: d(S2,4,17), catId: lainnyaId, efektif: true },
        { nama: 'Peringatan Hari Kartini & Perayaan Paskah', start: d(S2,4,21), end: d(S2,4,21), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,4,24), end: d(S2,4,24), catId: lainnyaId, efektif: true },
        { nama: 'Sosialisasi Asesmen Sumatif Akhir Tahun', start: d(S2,4,30), end: d(S2,4,30), catId: ujianId, efektif: true },

        // ──────────────────────────────────────────────
        // MEI 2027 (HE = 16)
        // ──────────────────────────────────────────────
        { nama: 'Libur Hari Buruh', start: d(S2,5,1), end: d(S2,5,1), catId: liburId, efektif: false },
        { nama: 'Asesmen Sumatif Akhir Tahun', start: d(S2,5,4), end: d(S2,5,8), catId: ujianId, efektif: true },
        { nama: 'Hari Kenaikan Tuhan Yesus', start: d(S2,5,14), end: d(S2,5,14), catId: liburId, efektif: false },
        { nama: 'Sehat Bersama', start: d(S2,5,15), end: d(S2,5,15), catId: lainnyaId, efektif: true },
        { nama: 'Upacara Hari Kebangkitan Nasional & Kegiatan Hardiknas', start: d(S2,5,20), end: d(S2,5,20), catId: acaraId, efektif: true },
        { nama: 'Motivasi Kelas 9', start: d(S2,5,21), end: d(S2,5,21), catId: acaraId, efektif: true },
        { nama: 'Sehat Bersama', start: d(S2,5,22), end: d(S2,5,22), catId: lainnyaId, efektif: true },
        { nama: 'Sosialisasi Pelaksanaan Penilaian Akhir Sekolah', start: d(S2,5,26), end: d(S2,5,26), catId: ujianId, efektif: true },
        { nama: 'Hari Raya Idul Adha', start: d(S2,5,27), end: d(S2,5,27), catId: liburId, efektif: false },
        { nama: 'Pelaksanaan Penilaian Akhir Tahun', start: d(S2,5,28), end: d(S2,5,30), catId: ujianId, efektif: true },
        { nama: 'Hari Raya Waisak', start: d(S2,5,31), end: d(S2,5,31), catId: liburId, efektif: false },

        // ──────────────────────────────────────────────
        // JUNI 2027 (HE = 14)
        // ──────────────────────────────────────────────
        { nama: 'Pelaksanaan Asesmen Akhir Tahun', start: d(S2,6,2), end: d(S2,6,4), catId: ujianId, efektif: true },
        { nama: 'Susulan / Remedial Asesmen Akhir Tahun', start: d(S2,6,5), end: d(S2,6,5), catId: ujianId, efektif: true },
        { nama: 'Graduation (Wisuda)', start: d(S2,6,6), end: d(S2,6,6), catId: acaraId, efektif: true },
        { nama: 'Character Building Kelas 8', start: d(S2,6,8), end: d(S2,6,10), catId: acaraId, efektif: true },
        { nama: 'Character Building Kelas 7', start: d(S2,6,10), end: d(S2,6,10), catId: acaraId, efektif: true },
        { nama: 'Class Meet (Classmeeting Akhir Tahun)', start: d(S2,6,8), end: d(S2,6,18), catId: acaraId, efektif: true },
        { nama: 'Rapat Hasil Belajar Siswa Semester 2', start: d(S2,6,15), end: d(S2,6,15), catId: progKSId, efektif: true },
        { nama: 'Pembagian Buku Perlengkapan Kelas 7', start: d(S2,6,16), end: d(S2,6,17), catId: lainnyaId, efektif: true },
        { nama: 'Pembagian Buku Perlengkapan Kelas 8', start: d(S2,6,18), end: d(S2,6,18), catId: lainnyaId, efektif: true },
        { nama: 'Misa Tutup Tahun Pelajaran 2026-2027 & PENSI', start: d(S2,6,19), end: d(S2,6,19), catId: acaraId, efektif: true },
        { nama: 'Pembagian Buku Perlengkapan Kelas 9', start: d(S2,6,19), end: d(S2,6,19), catId: lainnyaId, efektif: true },
        { nama: 'PENYERAHAN RAPOR SEMESTER 2', start: d(S2,6,20), end: d(S2,6,20), catId: progKSId, efektif: true },
        { nama: 'Libur Akhir Tahun Pelajaran 2026/2027', start: d(S2,6,24), end: d(S2,6,28), catId: liburId, efektif: false },

        // ──────────────────────────────────────────────
        // JULI 2027 – LS (Libur Sekolah)
        // ──────────────────────────────────────────────
        { nama: 'Libur Akhir Tahun Pelajaran 2026/2027', start: d(S2,7,3), end: d(S2,7,5), catId: liburId, efektif: false },
        { nama: 'MPLS T.A 2027-2028', start: d(S2,7,7), end: d(S2,7,9), catId: acaraId, efektif: true },
        { nama: 'Upacara Pembukaan T.A 2027-2028 (Gabung dengan SMA)', start: d(S2,7,14), end: d(S2,7,14), catId: acaraId, efektif: true },
        { nama: 'Puncak MPLS – Unjuk Talenta', start: d(S2,7,14), end: d(S2,7,14), catId: acaraId, efektif: true },
      ]

      let inserted = 0
      for (const p of dummyPrograms) {
        const { data: newProg, error } = await supabase.from('program_sekolah').insert([{
          nama: p.nama,
          tanggal_mulai: p.start,
          tanggal_selesai: p.end,
          deskripsi: p.desc || '',
          status: 'Direncanakan',
          visibilitas: 'publik',
          hari_efektif: p.efektif,
          created_by: session?.user?.id || null
        }]).select().single()

        if (!error && newProg && p.catId) {
          await supabase.from('program_sekolah_kategori_pivot').insert([{
            program_id: newProg.id,
            kategori_id: p.catId
          }])
          inserted++
        }
      }

      await fetchPrograms()
      alert(`✅ Berhasil memasukkan ${inserted} kegiatan kalender akademik TA ${S1}/${S2}.`)
    } catch (err) {
      alert("Gagal menambahkan data dummy: " + err.message)
    } finally {
      setLoading(false)
    }
  }


  const handleResetPrograms = async () => {
    if (!window.confirm("⚠️ PERINGATAN: Apakah Anda yakin ingin menghapus SEMUA program sekolah secara permanen?")) return
    if (!window.confirm("Tindakan ini tidak dapat dibatalkan. Konfirmasi penghapusan seluruh data kegiatan?")) return
    
    setLoading(true)
    try {
      const { data: progs } = await supabase.from('program_sekolah').select('id')
      const progIds = progs?.map(p => p.id) || []

      if (progIds.length > 0) {
        await Promise.all([
          supabase.from('program_sekolah_kategori_pivot').delete().in('program_id', progIds),
          supabase.from('program_sekolah_pic_pivot').delete().in('program_id', progIds),
          supabase.from('program_sekolah_target_pivot').delete().in('program_id', progIds),
          supabase.from('program_sekolah_dokumen').delete().in('program_id', progIds),
          supabase.from('program_sekolah_laporan').delete().in('program_id', progIds)
        ])

        await supabase.from('program_sekolah').delete().in('id', progIds)
      }

      await fetchPrograms()
      alert("Berhasil mengosongkan semua data program sekolah.")
    } catch (err) {
      alert("Gagal menghapus program: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInitialData()
  }, [])

  // Mengambil Data Awal
  const fetchInitialData = async () => {
    setLoading(true)
    try {
      // 1. Ambil Master Tag
      const [resCat, resLoc, resTar, resGuru] = await Promise.all([
        supabase.from('program_sekolah_kategori').select('*').order('nama'),
        supabase.from('program_sekolah_lokasi').select('*').order('nama'),
        supabase.from('program_sekolah_target_peserta').select('*').order('nama'),
        supabase.from('guru').select('id, nama_guru, kode').order('nama_guru')
      ])

      if (resCat.data) {
        setCategories(resCat.data)
        // Set default filter aktif semua
        setSelectedCategories(resCat.data.map(c => c.id))
      }
      if (resLoc.data) setLocations(resLoc.data)
      if (resTar.data) setTargets(resTar.data)
      if (resGuru.data) setTeachers(resGuru.data)

      // 2. Ambil Daftar Program Kerja
      await fetchPrograms()
    } catch (err) {
      console.error('Error fetching initial data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPrograms = async () => {
    const { data, error } = await supabase
      .from('program_sekolah')
      .select(`
        *,
        categories:program_sekolah_kategori_pivot(category:program_sekolah_kategori(*)),
        pics:program_sekolah_pic_pivot(guru:guru(*)),
        targets:program_sekolah_target_pivot(target:program_sekolah_target_peserta(*)),
        lokasi:program_sekolah_lokasi(*),
        laporan:program_sekolah_laporan(*),
        dokumen:program_sekolah_dokumen(*)
      `)
      .order('tanggal_mulai', { ascending: true })

    if (error) {
      console.error('Error fetching programs:', error)
    } else {
      setPrograms(data || [])
    }
  }

  // Format Helper
  function getLocalDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const formatTanggalPelaksanaan = (startStr, endStr) => {
    if (!startStr) return '-'
    // Parsing with T00:00 to prevent local timezone offsets issues
    const start = new Date(startStr + 'T00:00')
    const end = endStr ? new Date(endStr + 'T00:00') : start
    
    const optionsDay = { day: 'numeric' }
    const optionsFull = { day: 'numeric', month: 'long', year: 'numeric' }
    
    if (startStr === endStr || !endStr) {
      return start.toLocaleDateString('id-ID', optionsFull)
    }
    
    // Jika bulan dan tahun sama, format: "1 - 3 Januari 2025"
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.toLocaleDateString('id-ID', optionsDay)} - ${end.toLocaleDateString('id-ID', optionsFull)}`
    }
    
    // Jika tahun sama tapi bulan beda, format: "31 Desember - 2 Januari 2026"
    if (start.getFullYear() === end.getFullYear()) {
      const startText = start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })
      return `${startText} - ${end.toLocaleDateString('id-ID', optionsFull)}`
    }
    
    // Jika berbeda tahun
    return `${start.toLocaleDateString('id-ID', optionsFull)} - ${end.toLocaleDateString('id-ID', optionsFull)}`
  }

  const handleAddNewCategory = async (name) => {
    const { data, error } = await supabase
      .from('program_sekolah_kategori')
      .insert([{ nama: name, warna: '#6366f1' }])
      .select()
      .single()
    if (data) {
      setCategories(prev => [...prev, data])
      return data
    }
    return null
  }

  const handleAddNewLocation = async (name) => {
    const { data, error } = await supabase
      .from('program_sekolah_lokasi')
      .insert([{ nama: name }])
      .select()
      .single()
    if (data) {
      setLocations(prev => [...prev, data])
      return data
    }
    return null
  }

  const handleAddNewTarget = async (name) => {
    const { data, error } = await supabase
      .from('program_sekolah_target_peserta')
      .insert([{ nama: name }])
      .select()
      .single()
    if (data) {
      setTargets(prev => [...prev, data])
      return data
    }
    return null
  }

  const handleDeleteCategory = (id) => {
    triggerConfirm(
      'Hapus Kategori',
      'Apakah Anda yakin ingin menghapus kategori ini secara permanen dari database dan seluruh program terkait?',
      async () => {
        const { error } = await supabase.from('program_sekolah_kategori').delete().eq('id', id)
        if (!error) {
          setCategories(prev => prev.filter(c => c.id !== id))
          setFormCategories(prev => prev.filter(x => x !== id))
        } else {
          alert('Gagal menghapus kategori: ' + error.message)
        }
      }
    )
  }

  const handleDeleteLocation = (id) => {
    triggerConfirm(
      'Hapus Lokasi Kegiatan',
      'Apakah Anda yakin ingin menghapus lokasi ini secara permanen dari database dan seluruh program terkait?',
      async () => {
        const { error } = await supabase.from('program_sekolah_lokasi').delete().eq('id', id)
        if (!error) {
          setLocations(prev => prev.filter(l => l.id !== id))
          setFormLocation(prev => prev.filter(x => x !== id))
        } else {
          alert('Gagal menghapus lokasi: ' + error.message)
        }
      }
    )
  }

  const handleDeleteTarget = (id) => {
    triggerConfirm(
      'Hapus Target Peserta',
      'Apakah Anda yakin ingin menghapus target peserta ini secara permanen dari database dan seluruh program terkait?',
      async () => {
        const { error } = await supabase.from('program_sekolah_target_peserta').delete().eq('id', id)
        if (!error) {
          setTargets(prev => prev.filter(t => t.id !== id))
          setFormTargets(prev => prev.filter(x => x !== id))
        } else {
          alert('Gagal menghapus target peserta: ' + error.message)
        }
      }
    )
  }

  // Inline Quick Add Handler
  const handleInlineQuickAdd = async (e) => {
    e.preventDefault()
    if (!inlineNewName.trim()) return
    setInlineSaving(true)
    try {
      const { data: newProg, error } = await supabase
        .from('program_sekolah')
        .insert([{
          nama: inlineNewName.trim(),
          tanggal_mulai: inlinePanelDate,
          tanggal_selesai: inlinePanelDate,
          status: 'Direncanakan',
          visibilitas: 'internal',
          created_by: session?.user?.id || null
        }])
        .select()
        .single()

      if (error) throw error

      const defaultCat = categories.find(c => c.nama === 'Lainnya')
      if (defaultCat && newProg) {
        await supabase
          .from('program_sekolah_kategori_pivot')
          .insert([{ program_id: newProg.id, kategori_id: defaultCat.id }])
      }

      setInlineNewName('')
      setInlinePanelDate(null)
      await fetchPrograms()
    } catch (err) {
      alert('Gagal menambah program: ' + err.message)
    } finally {
      setInlineSaving(false)
    }
  }

  // Detail Modal Open & Data Mapping (Langkah 2)
  const handleOpenDetail = async (prog) => {
    setSelectedProgram(prog)
    setFormName(prog.nama)
    setFormDesc(prog.deskripsi || '')
    setFormStart(prog.tanggal_mulai)
    setFormEnd(prog.tanggal_selesai)
    setFormLocation(prog.lokasi_id ? [prog.lokasi_id] : [])
    setFormBudget(prog.estimasi_anggaran || 0)
    setFormStatus(prog.status || 'Direncanakan')
    setFormHariEfektif(prog.hari_efektif !== false) // default true
    setFormVisibility(prog.visibilitas || 'internal')
    
    // Mapping arrays
    setFormCategories(prog.categories?.map(c => c.category?.id).filter(Boolean) || [])
    setFormPics(prog.pics?.map(p => p.guru?.id).filter(Boolean) || [])
    setFormTargets(prog.targets?.map(t => t.target?.id).filter(Boolean) || [])

    // Files & Laporan mapping
    setExistingDocs(prog.dokumen || [])
    setUploadedFiles([])
    
    if (prog.laporan && prog.laporan.length > 0) {
      const lap = prog.laporan[0]
      setLaporanRingkasan(lap.ringkasan || '')
      setLaporanPeserta(lap.jumlah_peserta_aktual || 0)
      setLaporanEvaluasi(lap.catatan_evaluasi || '')
      
      // Fetch foto dokumentasi
      const { data: photos } = await supabase
        .from('program_sekolah_laporan_foto')
        .select('*')
        .eq('laporan_id', lap.id)
      setExistingPhotos(photos || [])
    } else {
      setLaporanRingkasan('')
      setLaporanPeserta(0)
      setLaporanEvaluasi('')
      setExistingPhotos([])
    }
    setUploadedPhotos([])
    setDetailOpen(true)
  }

  // Save Detail Lengkap Program
  const handleSaveDetail = async (e) => {
    e.preventDefault()
    if (!formName.trim()) return
    if (new Date(formEnd) < new Date(formStart)) {
      alert('Tanggal selesai tidak boleh mendahului tanggal mulai!')
      return
    }

    setSaving(true)
    const progId = selectedProgram.id

    try {
      // 1. Update tabel utama program_sekolah
      const { error: errUpdate } = await supabase
        .from('program_sekolah')
        .update({
          nama: formName.trim(),
          deskripsi: formDesc.trim(),
          tanggal_mulai: formStart,
          tanggal_selesai: formEnd,
          lokasi_id: formLocation[0] || null,
          estimasi_anggaran: formBudget,
          status: formStatus,
          hari_efektif: formHariEfektif,
          visibilitas: formVisibility,
          updated_at: new Date()
        })
        .eq('id', progId)

      if (errUpdate) throw errUpdate

      // 2. Sinkronisasi Kategori (Pivot)
      await supabase.from('program_sekolah_kategori_pivot').delete().eq('program_id', progId)
      if (formCategories.length > 0) {
        const catIns = formCategories.map(cid => ({ program_id: progId, kategori_id: cid }))
        await supabase.from('program_sekolah_kategori_pivot').insert(catIns)
      }

      // 3. Sinkronisasi PIC (Pivot)
      await supabase.from('program_sekolah_pic_pivot').delete().eq('program_id', progId)
      if (formPics.length > 0) {
        const picIns = formPics.map(gid => ({ program_id: progId, guru_id: gid }))
        await supabase.from('program_sekolah_pic_pivot').insert(picIns)
      }

      // 4. Sinkronisasi Target (Pivot)
      await supabase.from('program_sekolah_target_pivot').delete().eq('program_id', progId)
      if (formTargets.length > 0) {
        const tarIns = formTargets.map(tid => ({ program_id: progId, target_id: tid }))
        await supabase.from('program_sekolah_target_pivot').insert(tarIns)
      }

      // 5. Upload Dokumen Baru jika ada
      if (uploadedFiles.length > 0) {
        setUploadingFile(true)
        for (const file of uploadedFiles) {
          const filePath = `documents/${progId}/${Date.now()}_${file.name}`
          const { error: uploadErr } = await supabase.storage
            .from('program_sekolah_assets')
            .upload(filePath, file)

          if (uploadErr) throw uploadErr

          const { data: urlData } = supabase.storage
            .from('program_sekolah_assets')
            .getPublicUrl(filePath)

          await supabase.from('program_sekolah_dokumen').insert({
            program_id: progId,
            file_name: file.name,
            file_url: urlData.publicUrl
          })
        }
      }

      // 6. Handle Laporan Pasca Kegiatan jika status Selesai
      if (formStatus === 'Selesai') {
        let laporanId = selectedProgram.laporan?.[0]?.id

        if (!laporanId) {
          // Buat laporan baru
          const { data: newLap, error: lapErr } = await supabase
            .from('program_sekolah_laporan')
            .insert({
              program_id: progId,
              ringkasan: laporanRingkasan,
              jumlah_peserta_aktual: laporanPeserta,
              catatan_evaluasi: laporanEvaluasi
            })
            .select()
            .single()
          
          if (lapErr) throw lapErr
          laporanId = newLap.id
        } else {
          // Update laporan yang sudah ada
          await supabase
            .from('program_sekolah_laporan')
            .update({
              ringkasan: laporanRingkasan,
              jumlah_peserta_aktual: laporanPeserta,
              catatan_evaluasi: laporanEvaluasi
            })
            .eq('id', laporanId)
        }

        // Upload Foto Laporan baru jika ada
        if (uploadedPhotos.length > 0) {
          for (const file of uploadedPhotos) {
            const filePath = `photos/${laporanId}/${Date.now()}_${file.name}`
            const { error: photoErr } = await supabase.storage
              .from('program_sekolah_assets')
              .upload(filePath, file)

            if (photoErr) throw photoErr

            const { data: urlData } = supabase.storage
              .from('program_sekolah_assets')
              .getPublicUrl(filePath)

            await supabase.from('program_sekolah_laporan_foto').insert({
              laporan_id: laporanId,
              file_url: urlData.publicUrl
            })
          }
        }
      }

      setDetailOpen(false)
      await fetchPrograms()
    } catch (err) {
      alert('Gagal memperbarui detail program: ' + err.message)
    } finally {
      setSaving(false)
      setUploadingFile(false)
    }
  }

  // Hapus Program
  const handleDeleteProgram = () => {
    triggerConfirm(
      'Hapus Program Kerja',
      'Apakah Anda yakin ingin menghapus program ini beserta seluruh lampiran berkas dan fotonya secara permanen?',
      async () => {
        setSaving(true)
        try {
          const { error } = await supabase
            .from('program_sekolah')
            .delete()
            .eq('id', selectedProgram.id)

          if (error) throw error

          setDetailOpen(false)
          await fetchPrograms()
        } catch (err) {
          alert('Gagal menghapus program: ' + err.message)
        } finally {
          setSaving(false)
        }
      }
    )
  }

  // Delete lampiran dokumen spesifik
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Hapus dokumen ini?')) return
    try {
      await supabase.from('program_sekolah_dokumen').delete().eq('id', docId)
      setExistingDocs(prev => prev.filter(d => d.id !== docId))
    } catch (err) {
      console.error(err)
    }
  }

  // Delete foto dokumentasi spesifik
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm('Hapus foto ini?')) return
    try {
      await supabase.from('program_sekolah_laporan_foto').delete().eq('id', photoId)
      setExistingPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch (err) {
      console.error(err)
    }
  }

  // ==========================================
  // KALENDER GENERATION UTILITIES
  // ==========================================
  const year = activeDate.getFullYear()
  const month = activeDate.getMonth()

  const firstDayIndex = new Date(year, month, 1).getDay() // Hari pertama di awal bulan (0: Minggu, dst)
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate()

  const handlePrevMonth = () => {
    setActiveDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setActiveDate(new Date(year, month + 1, 1))
  }

  const handleYearChange = (e) => {
    setActiveDate(new Date(parseInt(e.target.value), month, 1))
  }

  const handleMonthSelect = (e) => {
    setActiveDate(new Date(year, parseInt(e.target.value), 1))
  }

  // Menentukan warna pill/chip kategori
  const getCategoryColorStyle = (catId) => {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return { bg: 'bg-slate-100', text: 'text-slate-700', hex: '#6b7280' }
    return {
      hex: cat.warna,
      bg: 'inline-block',
      style: { backgroundColor: `${cat.warna}15`, color: cat.warna, borderColor: `${cat.warna}35` }
    }
  }

  // Filter Program yang memenuhi kategori terpilih & visibilitas
  const getFilteredPrograms = () => {
    return programs.filter(p => {
      // 1. Filter Kategori
      const hasSelectedCategory = p.categories?.some(c => selectedCategories.includes(c.category?.id))
      // 2. Filter Visibilitas (Siswa/Ortu hanya bisa baca Publik, Guru/Admin bisa semua)
      const isPublicOnly = !session?.roles && !isAdmin // placeholder check jika siswa/ortu login
      const matchesVisibility = !isPublicOnly || p.visibilitas === 'publik'

      return hasSelectedCategory && matchesVisibility
    })
  }

  // Mencari program pada tanggal tertentu (mendukung rentang multi-hari)
  const getProgramsForDate = (dateStr) => {
    const targetDate = new Date(dateStr)
    targetDate.setHours(0, 0, 0, 0)

    return getFilteredPrograms().filter(p => {
      const start = new Date(p.tanggal_mulai)
      start.setHours(0, 0, 0, 0)
      const end = new Date(p.tanggal_selesai)
      end.setHours(0, 0, 0, 0)
      return targetDate >= start && targetDate <= end
    })
  }

  // Render Kolom List Kanan
  const renderProgramList = () => {
    const filtered = getFilteredPrograms()
    
    // Saring berdasarkan bulan aktif atau tanggal terpilih
    const currentMonthProgs = filtered.filter(p => {
      const start = new Date(p.tanggal_mulai)
      const end = new Date(p.tanggal_selesai)
      const startOfView = new Date(year, month, 1)
      const endOfView = new Date(year, month + 1, 0)
      return (start <= endOfView && end >= startOfView)
    })

    if (currentMonthProgs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 text-center min-h-[300px]">
          <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-slate-500 font-medium text-sm">Tidak ada program kegiatan pada bulan ini.</p>
        </div>
      )
    }

    // Urutkan program & pecah ke dalam kelompok tanggal
    // Agar program multi-hari muncul pada setiap tanggal di rentangnya
    const dateGroups = {}
    
    currentMonthProgs.forEach(prog => {
      const start = new Date(prog.tanggal_mulai)
      const end = new Date(prog.tanggal_selesai)
      
      let curr = new Date(start)
      while (curr <= end) {
        // Hanya masukkan tanggal yang berada pada bulan aktif kalender
        if (curr.getMonth() === month && curr.getFullYear() === year) {
          const dateStr = getLocalDateString(curr)
          if (!dateGroups[dateStr]) {
            dateGroups[dateStr] = []
          }
          
          // Hitung index hari ke-berapa
          const diffTime = Math.abs(curr - start)
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
          const totalDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1
          
          dateGroups[dateStr].push({
            ...prog,
            dayIndexInfo: totalDays > 1 ? `Hari ${diffDays} dari ${totalDays}` : null
          })
        }
        curr.setDate(curr.getDate() + 1)
      }
    })

    // Urutkan key tanggal kronologis
    const sortedDates = Object.keys(dateGroups).sort()

    return (
      <div className="space-y-6">
        {sortedDates.map(dateStr => {
          const dateObj = new Date(dateStr)
          const formattedHeader = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
          const isSelected = dateStr === selectedDateStr

          return (
            <div key={dateStr} className={`p-4 rounded-2xl border transition-all ${isSelected ? 'border-indigo-200 bg-indigo-50/10 shadow-sm' : 'border-slate-100 bg-white'}`}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                {formattedHeader}
              </h3>
              
              <div className="space-y-3">
                {dateGroups[dateStr].map(prog => {
                  const mainCat = prog.categories?.[0]?.category
                  const catStyle = getCategoryColorStyle(mainCat?.id)

                  return (
                    <div 
                      key={`${prog.id}-${prog.dayIndexInfo}`}
                      onClick={() => handleOpenProgram(prog)}
                      className="group border border-slate-100 rounded-xl p-4 bg-white hover:border-indigo-100 hover:shadow-md transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {mainCat && (
                          <span 
                            style={catStyle.style}
                            className="text-[10px] px-2 py-0.5 rounded-full font-bold border"
                          >
                            {mainCat.nama}
                          </span>
                        )}
                        {prog.dayIndexInfo && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                            {prog.dayIndexInfo}
                          </span>
                        )}
                        <span className="text-slate-400 text-xs ml-auto">
                          {new Date(prog.tanggal_mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          {prog.tanggal_mulai !== prog.tanggal_selesai && ` - ${new Date(prog.tanggal_selesai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`}
                        </span>
                      </div>
                      
                      <h4 className="font-bold text-slate-800 text-base group-hover:text-indigo-600 transition-colors">
                        {prog.nama}
                      </h4>
                      
                      {prog.deskripsi && (
                        <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
                          {prog.deskripsi}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-50 mt-1.5 text-xs text-slate-500">
                        {prog.lokasi && (
                          <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg">
                            📍 {prog.lokasi.nama}
                          </span>
                        )}
                        {prog.pics && prog.pics.length > 0 && (
                          <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg truncate max-w-[200px]">
                            👤 PIC: {prog.pics.map(p => p.guru?.nama_guru).join(', ')}
                          </span>
                        )}
                        <span className={`ml-auto font-bold px-2 py-0.5 rounded-md text-[10px] uppercase border ${
                          prog.status === 'Selesai' ? 'bg-green-50 text-green-700 border-green-200' :
                          prog.status === 'Berjalan' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          prog.status === 'Dibatalkan' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {prog.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ===================================================
  // RENDER SEMESTER POSTER VIEW (Interactive)
  // ===================================================
  const renderSemesterView = (semIdx) => {
    const baseDefs = semIdx === 0 ? monthDefs.slice(0, 6) : monthDefs.slice(6, 12)
    const defs = selectedMonthFilter === 'ALL'
      ? baseDefs
      : baseDefs.filter(def => String(def.m) === selectedMonthFilter)
    const semLabel = semIdx === 0 ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)'
    const filteredAll = getFilteredPrograms()

    return (
      <div>
        {/* Semester Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-700">
              📆 {semLabel} — T.A {startYear}/{endYear}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Klik tanggal untuk tambah / edit / hapus program</p>
          </div>
          <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-full font-bold">
            {filteredAll.length} total program
          </span>
        </div>

        {/* Dynamic Month Grid */}
        <div className={`grid gap-4 ${selectedMonthFilter === 'ALL' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 max-w-xl mx-auto'}`}>
          {defs.map(def => {
            const { firstDay, totalDays } = getMonthDays(def.m, def.y)
            const daysArray = []
            for (let i = 0; i < firstDay; i++) daysArray.push(null)
            for (let d = 1; d <= totalDays; d++) daysArray.push(d)

            // Programs that START in this month
            const monthProgs = filteredAll.filter(p => {
              const s = new Date(p.tanggal_mulai + 'T00:00')
              return s.getMonth() === def.m && s.getFullYear() === def.y
            })

            return (
              <div
                key={`${def.m}-${def.y}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
              >
                {/* Month Header */}
                <div className="relative flex items-center justify-center py-2.5 px-4" style={{ background: '#1e3a8a' }}>
                  <div style={{ position:'absolute', top:0, left:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(0 0, 100% 0, 0 100%)' }} />
                  <div style={{ position:'absolute', top:0, right:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(100% 0, 0 0, 100% 100%)' }} />
                  <span className="text-white text-xs font-black tracking-widest uppercase">{def.label} – {def.y}</span>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
                  {['MIN','SEN','SEL','RAB','KAM','JUM','SAB'].map((d,i) => (
                    <div key={d} className={`text-center py-1 text-[10px] font-black tracking-wider ${ i===0 ? 'text-red-500' : 'text-slate-400' }`}>{d}</div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-px p-1.5 bg-slate-100">
                  {daysArray.map((dayNum, idx) => {
                    if (dayNum === null) return <div key={`e-${def.m}-${idx}`} className="aspect-square bg-slate-50 rounded" />
                    const dateStr = getLocalDateString(new Date(def.y, def.m, dayNum))
                    const dayProgs = getProgramsForDate(dateStr)
                    const isSunday = idx % 7 === 0
                    const hasProg = dayProgs.length > 0
                    const isToday = getLocalDateString(new Date()) === dateStr
                    const isPanelOpen = inlinePanelDate === dateStr
                    const colIndex = idx % 7
                    const panelLeft = colIndex >= 4
                    const progColor = hasProg ? (dayProgs[0].categories?.[0]?.category?.warna || '#f59e0b') : null

                    return (
                      <div key={`d-${def.m}-${dayNum}`} className="relative">
                        <div
                          onClick={() => {
                            setSelectedDateStr(dateStr)
                            setInlinePanelDate(isPanelOpen ? null : dateStr)
                            setInlineNewName('')
                          }}
                          className={`aspect-square flex items-center justify-center rounded text-[11px] font-bold cursor-pointer transition-all select-none
                            ${hasProg ? 'text-white shadow-sm' : isSunday ? 'text-red-500' : 'text-slate-700'}
                            ${!hasProg ? 'bg-white hover:bg-indigo-50' : ''}
                            ${isPanelOpen ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
                          `}
                          style={hasProg ? { backgroundColor: progColor } : {}}
                          title={hasProg ? dayProgs.map(p=>p.nama).join(', ') : ''}
                        >
                          {isToday ? (
                            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-black">{dayNum}</span>
                          ) : dayNum}
                        </div>

                        {/* Inline Panel */}
                        {isPanelOpen && (
                          <div
                            className={`absolute top-full mt-2.5 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden ${ panelLeft ? 'right-0' : 'left-0' }`}
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100" style={{ background:'#eef2ff' }}>
                              <span className="text-[13px] font-black text-indigo-700">📅 {new Date(dateStr+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long'})}</span>
                              <button onClick={() => setInlinePanelDate(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none">&times;</button>
                            </div>
                            {dayProgs.length > 0 && (
                              <div className="px-4 py-2.5 border-b border-slate-100 space-y-2 max-h-40 overflow-y-auto">
                                {dayProgs.map(p => {
                                  const col = p.categories?.[0]?.category?.warna || '#6366f1'
                                  return (
                                    <div key={p.id} className="flex items-center gap-2 group py-0.5">
                                      <span style={{ background: col }} className="w-2.5 h-2.5 rounded-full shrink-0" />
                                      <span className="text-[12.5px] text-slate-700 font-bold truncate flex-1">{p.nama}</span>
                                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <button onClick={() => { handleOpenProgram(p); setInlinePanelDate(null) }} className="text-xs text-indigo-600 hover:underline font-bold" title={hasWriteAccess ? "Edit" : "Lihat"}>
                                          {hasWriteAccess ? '✏️' : '👁️'}
                                        </button>
                                        {hasWriteAccess && (
                                          <button onClick={() => {
                                            triggerConfirm(
                                              'Hapus Kegiatan',
                                              `Apakah Anda yakin ingin menghapus "${p.nama}" secara permanen dari kalender akademik?`,
                                              async () => {
                                                await supabase.from('program_sekolah_kategori_pivot').delete().eq('program_id', p.id)
                                                await supabase.from('program_sekolah_pic_pivot').delete().eq('program_id', p.id)
                                                await supabase.from('program_sekolah_target_pivot').delete().eq('program_id', p.id)
                                                await supabase.from('program_sekolah').delete().eq('id', p.id)
                                                await fetchPrograms()
                                              }
                                            )
                                          }} className="text-xs text-red-500 hover:underline font-bold" title="Hapus">🗑️</button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {hasWriteAccess && (
                              <form onSubmit={handleInlineQuickAdd} className="px-4 py-3 flex flex-col gap-2.5">
                                <input
                                  type="text" autoFocus value={inlineNewName}
                                  onChange={e => setInlineNewName(e.target.value)}
                                  placeholder="+ Tambah program baru..."
                                  className="w-full px-3 py-2 text-[12.5px] border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400"
                                />
                                <button type="submit" disabled={!inlineNewName.trim() || inlineSaving}
                                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-[12.5px] font-bold rounded-xl transition-all shadow-sm">
                                  {inlineSaving ? 'Menyimpan...' : '✓ Apply'}
                                </button>
                              </form>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Program List Below Calendar */}
                <div className="border-t border-slate-100 px-3 py-2.5 flex-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">KEGIATAN TERJADWAL:</div>
                  {monthProgs.length === 0 ? (
                    <div className="text-[11px] text-slate-300 italic text-center py-2">— Belum ada kegiatan —</div>
                  ) : (
                    <div className="space-y-1">
                      {monthProgs.map(p => {
                        const ds = new Date(p.tanggal_mulai+'T00:00').getDate()
                        const de = new Date(p.tanggal_selesai+'T00:00').getDate()
                        const lbl = ds === de ? `${ds}` : `${ds}-${de}`
                        const col = p.categories?.[0]?.category?.warna || '#6366f1'
                        return (
                          <div key={p.id}
                            onClick={() => handleOpenProgram(p)}
                            className="flex items-start gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-1 py-0.5 transition-colors group"
                          >
                            <div style={{ background: col, color:'#fff', fontSize:'10px', fontWeight:800, padding:'1px 5px', borderRadius:'4px', minWidth:'24px', textAlign:'center', flexShrink:0, marginTop:'1px' }}>{lbl}</div>
                            <div className="text-[11px] font-semibold text-slate-700 leading-tight group-hover:text-indigo-600 transition-colors">{p.nama}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Close inline panel on outside click */}
        {inlinePanelDate && (
          <div className="fixed inset-0 z-40" onClick={() => setInlinePanelDate(null)} />
        )}
      </div>
    )
  }

  // (Keep old helpers below for PDF poster use)
  // Render Cells Kalender Bulanan
  const renderCalendarCells = () => {
    const cells = []
    
    // Empty cells sebelum hari pertama
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<div key={`empty-${i}`} className="aspect-square bg-slate-50/40 rounded-lg" />)
    }

    // Days of the month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = getLocalDateString(new Date(year, month, day))
      const isSelected = dateStr === selectedDateStr
      const isPanelOpen = inlinePanelDate === dateStr
      const dayProgs = getProgramsForDate(dateStr)
      const isToday = getLocalDateString(new Date()) === dateStr
      // column index 0-6 to decide panel placement
      const colIndex = (firstDayIndex + day - 1) % 7
      const panelLeft = colIndex >= 4 // push panel to left if near right edge

      cells.push(
        <div
          key={`day-${day}`}
          className="relative"
        >
          <div
            onClick={() => {
              setSelectedDateStr(dateStr)
              setInlinePanelDate(isPanelOpen ? null : dateStr)
              setInlineNewName('')
            }}
            className={`aspect-square p-1.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
              isSelected 
                ? 'border-indigo-600 bg-indigo-50/30 text-indigo-700 shadow-sm font-bold' 
                : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 bg-white'
            } ${isPanelOpen ? 'ring-2 ring-indigo-400' : ''}`}
          >
            <div className="flex justify-between items-center w-full">
              <span className={`text-xs ${isToday ? 'bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold' : 'text-slate-700'}`}>
                {day}
              </span>
            </div>
            {dayProgs.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-auto max-h-3 overflow-hidden">
                {dayProgs.map((p, idx) => {
                  const color = p.categories?.[0]?.category?.warna || '#6b7280'
                  return (
                    <span 
                      key={`${p.id}-${idx}`}
                      style={{ backgroundColor: color }}
                      className="w-1.5 h-1.5 rounded-full shadow-sm"
                      title={p.nama}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* ── INLINE CONTEXTUAL PANEL ── */}
          {isPanelOpen && (
            <div
              className={`absolute top-full mt-1 z-50 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden ${
                panelLeft ? 'right-0' : 'left-0'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                <span className="text-[11px] font-bold text-indigo-700">
                  📅 {new Date(dateStr + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
                </span>
                <button
                  onClick={() => setInlinePanelDate(null)}
                  className="text-slate-400 hover:text-slate-700 text-base leading-none"
                >×</button>
              </div>

              {/* Existing programs on this date */}
              {dayProgs.length > 0 && (
                <div className="px-3 py-2 border-b border-slate-100 space-y-1.5 max-h-36 overflow-y-auto">
                  {dayProgs.map(p => {
                    const col = p.categories?.[0]?.category?.warna || '#6366f1'
                    return (
                      <div key={p.id} className="flex items-center gap-2 group">
                        <span style={{ background: col }} className="w-2 h-2 rounded-full shrink-0" />
                        <span className="text-[11px] text-slate-700 font-medium truncate flex-1">{p.nama}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => { handleOpenProgram(p); setInlinePanelDate(null) }}
                            className="text-[10px] text-indigo-600 hover:underline font-bold"
                            title={hasWriteAccess ? "Edit" : "Lihat"}
                          >{hasWriteAccess ? '✏️' : '👁️'}</button>
                          {hasWriteAccess && (
                            <button
                              onClick={() => {
                                triggerConfirm(
                                  'Hapus Kegiatan',
                                  `Apakah Anda yakin ingin menghapus "${p.nama}" secara permanen dari kalender akademik?`,
                                  async () => {
                                    await supabase.from('program_sekolah_kategori_pivot').delete().eq('program_id', p.id)
                                    await supabase.from('program_sekolah_pic_pivot').delete().eq('program_id', p.id)
                                    await supabase.from('program_sekolah_target_pivot').delete().eq('program_id', p.id)
                                    await supabase.from('program_sekolah').delete().eq('id', p.id)
                                    await fetchPrograms()
                                  }
                                )
                              }}
                              className="text-[10px] text-red-500 hover:underline font-bold"
                              title="Hapus"
                            >🗑️</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Quick add form */}
              {hasWriteAccess && (
                <form onSubmit={handleInlineQuickAdd} className="px-3 py-2.5 flex flex-col gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={inlineNewName}
                    onChange={(e) => setInlineNewName(e.target.value)}
                    placeholder="+ Tambah program baru..."
                    className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!inlineNewName.trim() || inlineSaving}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-[11px] font-bold rounded-lg transition-all"
                  >
                    {inlineSaving ? 'Menyimpan...' : '✓ Apply'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )
    }

    return cells
  }

  return (
    <div className="flex-1 w-full space-y-6">

      {/* Header & Cetak Kalender (Hanya tampil untuk Admin/Write Access) */}
      {hasWriteAccess && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-2">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Program Sekolah & Kegiatan Akademik</h2>
            <p className="text-xs text-slate-500 mt-1">Kelola agenda kegiatan sekolah dan cetak kalender akademik.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/50 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
          >
            🖨️ Cetak Kalender Akademik
          </button>
        </div>
      )}

      {/* Tombol-tombol Admin (Hanya tampil jika hasWriteAccess) */}
      {hasWriteAccess && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateDummyData}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100/50 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            🪄 Isi Data Dummy
          </button>
          <button
            type="button"
            onClick={handleResetPrograms}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-100/50 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            🗑️ Reset Program
          </button>
        </div>
      )}

      {/* FILTER BULAN & SEMESTER (Unified) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        {/* Row 1: Semester */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[70px]">Semester:</span>
          <div className="flex flex-wrap gap-2">
            {['Semester 1 (Ganjil)', 'Semester 2 (Genap)'].map((label, idx) => {
              const isSelected = activeSemester === idx
              return (
                <button
                  key={idx}
                  onClick={() => { setActiveSemester(idx); setSelectedMonthFilter('ALL'); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-100" />

        {/* Row 2: Bulan */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[70px]">Bulan:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedMonthFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                selectedMonthFilter === 'ALL' 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua Bulan
            </button>
            {(activeSemester === 0 ? monthDefs.slice(0, 6) : monthDefs.slice(6, 12)).map(def => {
              const isSelected = selectedMonthFilter === String(def.m)
              return (
                <button
                  key={def.m}
                  onClick={() => setSelectedMonthFilter(String(def.m))}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    isSelected 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {def.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* FILTER KATEGORI (CHIP/PILL) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2.5">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter Kategori:</span>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => {
            const isSelected = selectedCategories.includes(cat.id)
            return (
              <button
                key={cat.id}
                onClick={() => {
                  if (isSelected) {
                    setSelectedCategories(prev => prev.filter(id => id !== cat.id))
                  } else {
                    setSelectedCategories(prev => [...prev, cat.id])
                  }
                }}
                style={isSelected ? { backgroundColor: `${cat.warna}15`, color: cat.warna, borderColor: cat.warna } : {}}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  isSelected ? 'border-2 scale-100' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <span style={{ backgroundColor: cat.warna }} className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0" />
                {cat.nama}
              </button>
            )
          })}
        </div>
      </div>

      {/* KONTEN UTAMA - SEMESTER POSTER GRID */}
      <div>
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <svg className="animate-spin w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          </div>
        ) : (
          renderSemesterView(activeSemester)
        )}
      </div>


      {/* ==========================================
          MODAL 2: DETAIL PROGRAM LENGKAP (Langkah 2)
          ========================================== */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-scale-up flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-xl">Detail Agenda Program</h3>
                <p className="text-xs text-slate-400 mt-0.5">Kelola data program kerja tahunan secara detail.</p>
              </div>
              <button 
                onClick={() => setDetailOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-semibold p-1.5 hover:bg-slate-100 rounded-lg text-lg transition-colors"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSaveDetail} className="overflow-y-auto flex-1 p-6 space-y-6">
              
              {/* Field Utama: Nama & Deskripsi */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Nama Program <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      disabled={!hasWriteAccess}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Masukkan nama program kerja..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-50"
                    />
                  </div>

                  {/* Toggle Hari Efektif */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Jenis Hari</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!hasWriteAccess}
                        onClick={() => setFormHariEfektif(true)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border-2 text-sm font-bold transition-all ${
                          formHariEfektif
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <span className={`w-2 h-2 rounded-full ${ formHariEfektif ? 'bg-emerald-500' : 'bg-slate-300' }`} />
                        ✅ Hari Efektif
                      </button>
                      <button
                        type="button"
                        disabled={!hasWriteAccess}
                        onClick={() => setFormHariEfektif(false)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border-2 text-sm font-bold transition-all ${
                          !formHariEfektif
                            ? 'border-red-400 bg-red-50 text-red-600'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <span className={`w-2 h-2 rounded-full ${ !formHariEfektif ? 'bg-red-400' : 'bg-slate-300' }`} />
                        🚫 Tidak Efektif
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {formHariEfektif
                        ? 'Kegiatan belajar mengajar berlangsung normal.'
                        : 'Kegiatan belajar mengajar tidak berlangsung (libur, ujian, event, dll).'}
                    </p>
                  </div>

                  {/* Kategori Tags */}
                  <TagInput
                    label="Kategori"
                    placeholder="Pilih Kategori..."
                    options={categories}
                    selectedIds={formCategories}
                    onChange={setFormCategories}
                    onAddNew={handleAddNewCategory}
                    onDelete={handleDeleteCategory}
                    disabled={!hasWriteAccess}
                  />

                  {/* Rentang Tanggal Mulai - Selesai */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tanggal Mulai</label>
                      <input
                        type="date"
                        required
                        disabled={!hasWriteAccess}
                        value={formStart}
                        onChange={(e) => setFormStart(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tanggal Selesai</label>
                      <input
                        type="date"
                        required
                        disabled={!hasWriteAccess}
                        value={formEnd}
                        onChange={(e) => setFormEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* PIC Guru Multi-select */}
                  <TagInput
                    label="Penanggung Jawab (PIC)"
                    placeholder="Pilih Guru / PIC..."
                    options={teachers}
                    selectedIds={formPics}
                    onChange={setFormPics}
                    picMode={true}
                    disabled={!hasWriteAccess}
                  />
                </div>

                <div className="space-y-4">
                  {/* Deskripsi Rich Text / Textarea */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Deskripsi Program & Tujuan</label>
                    <textarea
                      rows={5}
                      disabled={!hasWriteAccess}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Tuliskan tujuan dan deskripsi singkat pelaksanaan program..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-slate-50"
                    />
                  </div>

                  {/* Target Peserta Tags */}
                  <TagInput
                    label="Target Peserta"
                    placeholder="Pilih target..."
                    options={targets}
                    selectedIds={formTargets}
                    onChange={setFormTargets}
                    onAddNew={handleAddNewTarget}
                    onDelete={handleDeleteTarget}
                    disabled={!hasWriteAccess}
                  />

                  {/* Lokasi (Single FK, tapi pakai TagInput format singleSelect) */}
                  <TagInput
                    label="Lokasi Kegiatan"
                    placeholder="Pilih lokasi..."
                    options={locations}
                    selectedIds={formLocation}
                    onChange={setFormLocation}
                    onAddNew={handleAddNewLocation}
                    onDelete={handleDeleteLocation}
                    singleSelect={true}
                    disabled={!hasWriteAccess}
                  />
                </div>
              </div>

              {/* Anggaran, Status & Visibilitas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Estimasi Anggaran (Rp)</label>
                  <input
                    type="number"
                    disabled={!hasWriteAccess}
                    value={formBudget}
                    onChange={(e) => setFormBudget(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Status Pelaksanaan</label>
                  <select
                    disabled={!hasWriteAccess}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                  >
                    <option value="Direncanakan">Direncanakan</option>
                    <option value="Disetujui">Disetujui</option>
                    <option value="Berjalan">Berjalan</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Visibilitas Publik</label>
                  <div className="flex items-center gap-3 h-[42px]">
                    <span className="text-xs text-slate-500">{formVisibility === 'publik' ? '🔓 Tampil ke Murid/Ortu' : '🔒 Hanya internal Guru'}</span>
                    <button
                      type="button"
                      disabled={!hasWriteAccess}
                      onClick={() => setFormVisibility(prev => prev === 'publik' ? 'internal' : 'publik')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${formVisibility === 'publik' ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formVisibility === 'publik' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* UPLOAD FILE DOKUMEN PENDUKUNG (TOR/PROPOSAL) */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700">Lampiran Dokumen (TOR / Proposal Kegiatan)</label>
                
                {/* List Existing Docs */}
                {existingDocs.length > 0 && (
                  <div className="flex flex-wrap gap-2.5">
                    {existingDocs.map(doc => (
                      <span key={doc.id} className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-slate-50 rounded-xl text-xs text-slate-600 font-medium">
                        📄 <a href={doc.file_url} target="_blank" rel="noreferrer" className="hover:underline">{doc.file_name}</a>
                        {hasWriteAccess && (
                          <button type="button" onClick={() => handleDeleteDoc(doc.id)} className="text-red-500 hover:text-red-700 font-bold font-mono text-sm ml-1">&times;</button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {hasWriteAccess && (
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setUploadedFiles(Array.from(e.target.files))}
                      className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* ==========================================
                  LAPORAN PASCA KEGIATAN (Hanya Aktif Jika Status 'Selesai')
                  ========================================== */}
              {formStatus === 'Selesai' && (
                <div className="space-y-4 pt-6 border-t border-indigo-100 bg-indigo-50/5 p-5 rounded-2xl border border-indigo-50">
                  <h4 className="font-bold text-indigo-700 text-md flex items-center gap-2">
                    📋 Laporan Pelaksanaan Kegiatan
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Ringkasan Pelaksanaan</label>
                      <textarea
                        rows={3}
                        disabled={!hasWriteAccess}
                        value={laporanRingkasan}
                        onChange={(e) => setLaporanRingkasan(e.target.value)}
                        placeholder="Bagaimana jalannya program? Tuliskan di sini..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Jumlah Peserta Aktual</label>
                        <input
                          type="number"
                          disabled={!hasWriteAccess}
                          value={laporanPeserta}
                          onChange={(e) => setLaporanPeserta(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Catatan Evaluasi / Rekomendasi</label>
                        <textarea
                          rows={2}
                          disabled={!hasWriteAccess}
                          value={laporanEvaluasi}
                          onChange={(e) => setLaporanEvaluasi(e.target.value)}
                          placeholder="Hal-hal yang perlu diperbaiki untuk ke depannya..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Foto Dokumentasi Laporan */}
                  <div className="space-y-3.5 pt-4 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-600">Dokumentasi Gambar/Foto</label>
                    
                    {/* List Existing Photos */}
                    {existingPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {existingPhotos.map(photo => (
                          <div key={photo.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 group">
                            <img src={photo.file_url} alt="Dokumentasi" className="w-full h-full object-cover" />
                            {hasWriteAccess && (
                              <button 
                                type="button" 
                                onClick={() => handleDeletePhoto(photo.id)} 
                                className="absolute inset-0 bg-black/40 text-white flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {hasWriteAccess && (
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => setUploadedPhotos(Array.from(e.target.files))}
                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Tombol Simpan & Hapus */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex gap-3 justify-end shrink-0 -mx-6 -mb-6">
                {hasWriteAccess && (
                  <button
                    type="button"
                    onClick={handleDeleteProgram}
                    disabled={saving}
                    className="px-5 py-2.5 mr-auto bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-bold border border-red-100 transition-all active:scale-95 disabled:bg-slate-100"
                  >
                    Hapus Program
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-bold transition-all"
                >
                  Batal
                </button>
                
                {hasWriteAccess && (
                  <button
                    type="submit"
                    disabled={saving || uploadingFile}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition-all ${
                      saving || uploadingFile 
                        ? 'bg-indigo-400 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-95'
                    }`}
                  >
                    {(saving || uploadingFile) && <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    {saving || uploadingFile ? 'Menyimpan...' : 'Simpan Detail'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 3: CETAK POSTER KALENDER AKADEMIK
          ========================================== */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto flex flex-col items-center justify-start">
          {/* Sticky Controller */}
          <div className="w-full max-w-7xl flex flex-wrap gap-4 justify-between items-center bg-white/10 backdrop-blur border border-white/20 p-4 rounded-2xl mb-4 shrink-0 shadow-lg sticky top-0 z-50">
            <div className="flex flex-wrap items-center gap-5">
              <span className="text-sm font-black text-white shrink-0">Preview Kalender Akademik</span>
              
              {/* Slogan Editor */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-300">Edit Slogan</span>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  className="px-2.5 py-1 bg-white/10 border border-white/25 rounded-lg text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-60"
                  placeholder="Sinergi, Optimis, dll..."
                />
              </div>

              {/* Logo Uploader */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-300">Unggah Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (event) => {
                        setLogoUrl(event.target.result)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-white/10 file:text-white hover:file:bg-white/20 cursor-pointer w-48"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-all"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={generatePosterPDF}
                disabled={isGenerating}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                {isGenerating ? 'Memproses PDF...' : 'Download Kalender PDF (A4 Portrait)'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto w-full flex flex-col items-center gap-8 pb-8">
            
            {/* ===== PAGE 1: Semester 1 (Juli - Desember) ===== */}
            <div
              id="kalender-poster-sem1"
              style={{
                width: '794px',
                minHeight: '1123px',
                background: '#fff',
                border: '12px solid #0f172a',
                borderRadius: '20px',
                position: 'relative',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui, sans-serif',
                flexShrink: 0,
              }}
            >
              {/* Inner gold border */}
              <div style={{ position:'absolute', inset:'4px', border:'2px solid rgba(251,191,36,0.7)', borderRadius:'14px', pointerEvents:'none', zIndex:1 }} />

              {/* Watermark Logo Background */}
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Watermark"
                  style={{
                    position: 'absolute',
                    top: '55%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '450px',
                    height: '450px',
                    objectFit: 'contain',
                    opacity: 0.06,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    top: '55%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '180px',
                    fontWeight: 900,
                    color: '#0f172a',
                    opacity: 0.03,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                >
                  BM
                </div>
              )}

              {/* Corner ornaments TL */}
              <div style={{ position:'absolute', top:0, left:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', top:0, left:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(0 0, 100% 0, 0 100%)' }} />
                <div style={{ position:'absolute', top:'38px', left:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(-45deg)', transformOrigin:'top left' }} />
                <div style={{ position:'absolute', top:'44px', left:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(-45deg)', transformOrigin:'top left' }} />
              </div>
              {/* Corner ornaments TR */}
              <div style={{ position:'absolute', top:0, right:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', top:0, right:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(100% 0, 100% 100%, 0 0)' }} />
                <div style={{ position:'absolute', top:'38px', right:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(45deg)', transformOrigin:'top right' }} />
                <div style={{ position:'absolute', top:'44px', right:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(45deg)', transformOrigin:'top right' }} />
              </div>
              {/* Corner ornaments BL */}
              <div style={{ position:'absolute', bottom:0, left:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', bottom:0, left:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(0 100%, 100% 100%, 0 0)' }} />
                <div style={{ position:'absolute', bottom:'38px', left:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(45deg)', transformOrigin:'bottom left' }} />
                <div style={{ position:'absolute', bottom:'44px', left:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(45deg)', transformOrigin:'bottom left' }} />
              </div>
              {/* Corner ornaments BR */}
              <div style={{ position:'absolute', bottom:0, right:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', bottom:0, right:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(100% 100%, 0 100%, 100% 0)' }} />
                <div style={{ position:'absolute', bottom:'38px', right:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(-45deg)', transformOrigin:'bottom right' }} />
                <div style={{ position:'absolute', bottom:'44px', right:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(-45deg)', transformOrigin:'bottom right' }} />
              </div>

              {/* ── HEADER ── */}
              <div style={{ position:'relative', zIndex:2, padding:'24px 32px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                {/* Logo absolut di sebelah kiri, digeser sedikit ke kanan (60px) tanpa lingkaran */}
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ position:'absolute', left:'60px', top:'24px', height:'72px', width:'72px', objectFit:'contain', zIndex:10 }} />
                ) : (
                  <div style={{ position:'absolute', left:'60px', top:'24px', width:'56px', height:'56px', background:'#0f172a', border:'3px solid #fbbf24', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:'18px', zIndex:10 }}>BM</div>
                )}

                {/* Title stack - centered */}
                <div style={{ fontSize:'28px', fontWeight:900, color:'#0f172a', letterSpacing:'0.08em', lineHeight:1.1, textTransform:'uppercase', textAlign:'center' }}>KALENDER AKADEMIK</div>
                <div style={{ fontSize:'13px', fontWeight:800, color:'#334155', letterSpacing:'0.06em', textTransform:'uppercase', textAlign:'center', marginTop:'2px' }}>SMP BUDI MULIA JAKARTA</div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'4px' }}>
                  <div style={{ height:'2px', width:'30px', background:'#fbbf24' }} />
                  <div style={{ fontSize:'11px', fontWeight:800, color:'#f59e0b', letterSpacing:'0.14em', textTransform:'uppercase' }}>SEMESTER 1 (GANJIL)</div>
                  <div style={{ height:'2px', width:'30px', background:'#fbbf24' }} />
                </div>
                {/* Gold separator */}
                <div style={{ width:'450px', height:'2px', background:'linear-gradient(90deg, transparent, #fbbf24, transparent)', marginTop:'8px' }} />
              </div>

              {/* ── MONTH GRID ── */}
              <div style={{ position:'relative', zIndex:2, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', padding:'10px 16px', marginTop:'4px' }}>
                {monthDefs.slice(0, 6).map(def => {
                  const { firstDay, totalDays } = getMonthDays(def.m, def.y)
                  const daysArray = []
                  for (let i = 0; i < firstDay; i++) daysArray.push(null)
                  for (let d = 1; d <= totalDays; d++) daysArray.push(d)
                  const monthProgs = programs.filter(p => {
                    const start = new Date(p.tanggal_mulai)
                    return start.getMonth() === def.m && start.getFullYear() === def.y
                  })

                  return (
                    <div key={`${def.m}-${def.y}`} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'visible', display:'flex', flexDirection:'column', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
                      {/* Month header */}
                      <div style={{ background:'#1e3a8a', color:'#fff', textAlign:'center', padding:'6px 8px', fontSize:'10px', fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', position:'relative', lineHeight:1.3 }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(0 0, 100% 0, 0 100%)' }} />
                        <div style={{ position:'absolute', top:0, right:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(100% 0, 0 0, 100% 100%)' }} />
                        {def.label} – {def.y}
                      </div>

                      {/* Day headers */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', textAlign:'center', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', padding:'3px 4px' }}>
                        {['MIN','SEN','SEL','RAB','KAM','JUM','SAB'].map((d,i) => (
                          <div key={d} style={{ fontSize:'7px', fontWeight:800, color: i===0 ? '#ef4444' : '#64748b', letterSpacing:'0.05em' }}>{d}</div>
                        ))}
                      </div>

                      {/* Day cells */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'3px 4px', gap:'1px' }}>
                        {daysArray.map((dayNum, idx) => {
                          if (dayNum === null) return <div key={`e-${idx}`} style={{ width: '24px', height: '24px', margin: '2px auto' }} />
                          const dateStr = getLocalDateString(new Date(def.y, def.m, dayNum))
                          const dayProgs = getProgramsForDate(dateStr)
                          const isSunday = idx % 7 === 0
                          const hasProg = dayProgs.length > 0
                          const progColor = hasProg ? (dayProgs[0].categories?.[0]?.category?.warna || '#f59e0b') : null
                          return (
                            <div key={`d-${dayNum}`} style={{
                              display: 'block',
                              width: '24px',
                              height: '24px',
                              lineHeight: '24px',
                              textAlign: 'center',
                              margin: '2px auto',
                              fontSize: '9px',
                              fontWeight: hasProg ? 900 : 600,
                              color: hasProg ? '#fff' : (isSunday ? '#ef4444' : '#334155'),
                              background: hasProg ? progColor : 'transparent',
                              borderRadius: hasProg ? '4.5px' : '0',
                            }}>
                              {dayNum}
                            </div>
                          )
                        })}
                      </div>

                      {/* Events list */}
                      <div style={{ borderTop:'1px solid #f1f5f9', padding:'4px 6px' }}>
                        <div style={{ fontSize:'7px', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'3px' }}>KEGIATAN TERJADWAL:</div>
                        {monthProgs.length === 0 ? (
                          <div style={{ fontSize:'7.5px', color:'#cbd5e1', fontStyle:'italic', textAlign:'center', padding:'3px 0' }}>—</div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                            {monthProgs.map(p => {
                              const ds = new Date(p.tanggal_mulai).getDate()
                              const de = new Date(p.tanggal_selesai).getDate()
                              const lbl = ds === de ? `${ds}` : `${ds}-${de}`
                              const col = p.categories?.[0]?.category?.warna || '#6366f1'
                              return (
                                <div key={p.id} style={{ display:'flex', alignItems:'flex-start', gap:'4px', color:col, fontSize:'7.5px', fontWeight:600, lineHeight:1.3 }}>
                                  <span style={{ fontWeight:900, minWidth:'20px', flexShrink:0 }}>{lbl}</span>
                                  <span style={{ flex:1 }}>{p.nama}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── LEGEND ── */}
              <div style={{ position:'relative', zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'16px', padding:'8px 20px', margin:'0 20px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:'8px', fontWeight:800, color:'#64748b', letterSpacing:'0.1em', textTransform:'uppercase' }}>KETERANGAN:</span>
                {categories.slice(0, 5).map(cat => (
                  <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                    <div style={{ width:'12px', height:'12px', borderRadius:'3px', background:cat.warna, flexShrink:0 }} />
                    <span style={{ fontSize:'8px', fontWeight:700, color:'#334155' }}>{cat.nama}</span>
                  </div>
                ))}
              </div>

              {/* ── FOOTER QUOTE ── */}
              <div style={{ position:'relative', zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'12px', padding:'10px 32px 14px' }}>
                <div style={{ height:'1px', flex:1, background:'linear-gradient(90deg, transparent, #fbbf24)' }} />
                <div style={{ fontSize:'9px', fontWeight:700, color:'#1e3a8a', fontStyle:'italic', textAlign:'center', letterSpacing:'0.03em' }}>
                  "{slogan} Menuju Generasi Berkarakter dan Berprestasi"
                </div>
                <div style={{ height:'1px', flex:1, background:'linear-gradient(90deg, #fbbf24, transparent)' }} />
              </div>
            </div>

            {/* ===== PAGE 2: Semester 2 (Januari - Juni) ===== */}
            <div
              id="kalender-poster-sem2"
              style={{
                width: '794px',
                minHeight: '1123px',
                background: '#fff',
                border: '12px solid #0f172a',
                borderRadius: '20px',
                position: 'relative',
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'Inter, system-ui, sans-serif',
                flexShrink: 0,
              }}
            >
              {/* Inner gold border */}
              <div style={{ position:'absolute', inset:'4px', border:'2px solid rgba(251,191,36,0.7)', borderRadius:'14px', pointerEvents:'none', zIndex:1 }} />

              {/* Watermark Logo Background */}
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Watermark"
                  style={{
                    position: 'absolute',
                    top: '55%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '450px',
                    height: '450px',
                    objectFit: 'contain',
                    opacity: 0.06,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    top: '55%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '180px',
                    fontWeight: 900,
                    color: '#0f172a',
                    opacity: 0.03,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                >
                  BM
                </div>
              )}

              {/* Corner ornaments TL */}
              <div style={{ position:'absolute', top:0, left:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', top:0, left:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(0 0, 100% 0, 0 100%)' }} />
                <div style={{ position:'absolute', top:'38px', left:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(-45deg)', transformOrigin:'top left' }} />
                <div style={{ position:'absolute', top:'44px', left:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(-45deg)', transformOrigin:'top left' }} />
              </div>
              {/* Corner ornaments TR */}
              <div style={{ position:'absolute', top:0, right:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', top:0, right:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(100% 0, 100% 100%, 0 0)' }} />
                <div style={{ position:'absolute', top:'38px', right:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(45deg)', transformOrigin:'top right' }} />
                <div style={{ position:'absolute', top:'44px', right:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(45deg)', transformOrigin:'top right' }} />
              </div>
              {/* Corner ornaments BL */}
              <div style={{ position:'absolute', bottom:0, left:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', bottom:0, left:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(0 100%, 100% 100%, 0 0)' }} />
                <div style={{ position:'absolute', bottom:'38px', left:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(45deg)', transformOrigin:'bottom left' }} />
                <div style={{ position:'absolute', bottom:'44px', left:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(45deg)', transformOrigin:'bottom left' }} />
              </div>
              {/* Corner ornaments BR */}
              <div style={{ position:'absolute', bottom:0, right:0, width:'80px', height:'80px', pointerEvents:'none', zIndex:5 }}>
                <div style={{ position:'absolute', bottom:0, right:0, width:'44px', height:'44px', background:'#0f172a', clipPath:'polygon(100% 100%, 0 100%, 100% 0)' }} />
                <div style={{ position:'absolute', bottom:'38px', right:0, width:'54px', height:'2px', background:'#fbbf24', transform:'rotate(-45deg)', transformOrigin:'bottom right' }} />
                <div style={{ position:'absolute', bottom:'44px', right:0, width:'62px', height:'4px', background:'#0f172a', transform:'rotate(-45deg)', transformOrigin:'bottom right' }} />
              </div>

              {/* ── HEADER ── */}
              <div style={{ position:'relative', zIndex:2, padding:'24px 32px 12px', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                {/* Logo absolut di sebelah kiri, digeser sedikit ke kanan (60px) tanpa lingkaran */}
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ position:'absolute', left:'60px', top:'24px', height:'72px', width:'72px', objectFit:'contain', zIndex:10 }} />
                ) : (
                  <div style={{ position:'absolute', left:'60px', top:'24px', width:'56px', height:'56px', background:'#0f172a', border:'3px solid #fbbf24', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:900, fontSize:'18px', zIndex:10 }}>BM</div>
                )}

                {/* Title stack - centered */}
                <div style={{ fontSize:'28px', fontWeight:900, color:'#0f172a', letterSpacing:'0.08em', lineHeight:1.1, textTransform:'uppercase', textAlign:'center' }}>KALENDER AKADEMIK</div>
                <div style={{ fontSize:'13px', fontWeight:800, color:'#334155', letterSpacing:'0.06em', textTransform:'uppercase', textAlign:'center', marginTop:'2px' }}>SMP BUDI MULIA JAKARTA</div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'4px' }}>
                  <div style={{ height:'2px', width:'30px', background:'#fbbf24' }} />
                  <div style={{ fontSize:'11px', fontWeight:800, color:'#f59e0b', letterSpacing:'0.14em', textTransform:'uppercase' }}>SEMESTER 2 (GENAP)</div>
                  <div style={{ height:'2px', width:'30px', background:'#fbbf24' }} />
                </div>
                {/* Gold separator */}
                <div style={{ width:'450px', height:'2px', background:'linear-gradient(90deg, transparent, #fbbf24, transparent)', marginTop:'8px' }} />
              </div>

              {/* ── MONTH GRID ── */}
              <div style={{ position:'relative', zIndex:2, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', padding:'10px 16px', marginTop:'4px' }}>
                {monthDefs.slice(6, 12).map(def => {
                  const { firstDay, totalDays } = getMonthDays(def.m, def.y)
                  const daysArray = []
                  for (let i = 0; i < firstDay; i++) daysArray.push(null)
                  for (let d = 1; d <= totalDays; d++) daysArray.push(d)
                  const monthProgs = programs.filter(p => {
                    const start = new Date(p.tanggal_mulai)
                    return start.getMonth() === def.m && start.getFullYear() === def.y
                  })

                  return (
                    <div key={`${def.m}-${def.y}`} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'visible', display:'flex', flexDirection:'column', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
                      {/* Month header */}
                      <div style={{ background:'#1e3a8a', color:'#fff', textAlign:'center', padding:'6px 8px', fontSize:'10px', fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', position:'relative', lineHeight:1.3 }}>
                        <div style={{ position:'absolute', top:0, left:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(0 0, 100% 0, 0 100%)' }} />
                        <div style={{ position:'absolute', top:0, right:0, width:'10px', height:'10px', background:'#f59e0b', clipPath:'polygon(100% 0, 0 0, 100% 100%)' }} />
                        {def.label} – {def.y}
                      </div>

                      {/* Day headers */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', textAlign:'center', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', padding:'3px 4px' }}>
                        {['MIN','SEN','SEL','RAB','KAM','JUM','SAB'].map((d,i) => (
                          <div key={d} style={{ fontSize:'7px', fontWeight:800, color: i===0 ? '#ef4444' : '#64748b', letterSpacing:'0.05em' }}>{d}</div>
                        ))}
                      </div>

                      {/* Day cells */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'3px 4px', gap:'1px' }}>
                        {daysArray.map((dayNum, idx) => {
                          if (dayNum === null) return <div key={`e-${idx}`} style={{ width: '24px', height: '24px', margin: '2px auto' }} />
                          const dateStr = getLocalDateString(new Date(def.y, def.m, dayNum))
                          const dayProgs = getProgramsForDate(dateStr)
                          const isSunday = idx % 7 === 0
                          const hasProg = dayProgs.length > 0
                          const progColor = hasProg ? (dayProgs[0].categories?.[0]?.category?.warna || '#f59e0b') : null
                          return (
                            <div key={`d-${dayNum}`} style={{
                              display: 'block',
                              width: '24px',
                              height: '24px',
                              lineHeight: '24px',
                              textAlign: 'center',
                              margin: '2px auto',
                              fontSize: '9px',
                              fontWeight: hasProg ? 900 : 600,
                              color: hasProg ? '#fff' : (isSunday ? '#ef4444' : '#334155'),
                              background: hasProg ? progColor : 'transparent',
                              borderRadius: hasProg ? '4.5px' : '0',
                            }}>
                              {dayNum}
                            </div>
                          )
                        })}
                      </div>

                      {/* Events list */}
                      <div style={{ borderTop:'1px solid #f1f5f9', padding:'4px 6px' }}>
                        <div style={{ fontSize:'7px', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'3px' }}>KEGIATAN TERJADWAL:</div>
                        {monthProgs.length === 0 ? (
                          <div style={{ fontSize:'7.5px', color:'#cbd5e1', fontStyle:'italic', textAlign:'center', padding:'3px 0' }}>—</div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                            {monthProgs.map(p => {
                              const ds = new Date(p.tanggal_mulai).getDate()
                              const de = new Date(p.tanggal_selesai).getDate()
                              const lbl = ds === de ? `${ds}` : `${ds}-${de}`
                              const col = p.categories?.[0]?.category?.warna || '#6366f1'
                              return (
                                <div key={p.id} style={{ display:'flex', alignItems:'flex-start', gap:'4px', color:col, fontSize:'7.5px', fontWeight:600, lineHeight:1.3 }}>
                                  <span style={{ fontWeight:900, minWidth:'20px', flexShrink:0 }}>{lbl}</span>
                                  <span style={{ flex:1 }}>{p.nama}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── LEGEND ── */}
              <div style={{ position:'relative', zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'16px', padding:'8px 20px', margin:'0 20px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:'8px', fontWeight:800, color:'#64748b', letterSpacing:'0.1em', textTransform:'uppercase' }}>KETERANGAN:</span>
                {categories.slice(0, 5).map(cat => (
                  <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:'5px' }}>
                    <div style={{ width:'12px', height:'12px', borderRadius:'3px', background:cat.warna, flexShrink:0 }} />
                    <span style={{ fontSize:'8px', fontWeight:700, color:'#334155' }}>{cat.nama}</span>
                  </div>
                ))}
              </div>

              {/* ── FOOTER QUOTE ── */}
              <div style={{ position:'relative', zIndex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'12px', padding:'10px 32px 14px' }}>
                <div style={{ height:'1px', flex:1, background:'linear-gradient(90deg, transparent, #fbbf24)' }} />
                <div style={{ fontSize:'9px', fontWeight:700, color:'#1e3a8a', fontStyle:'italic', textAlign:'center', letterSpacing:'0.03em' }}>
                  "{slogan} Menuju Generasi Berkarakter dan Berprestasi"
                </div>
                <div style={{ height:'1px', flex:1, background:'linear-gradient(90deg, #fbbf24, transparent)' }} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-6 animate-zoom-in text-center">
            {/* Warning Icon */}
            <div className="mx-auto w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500 shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            {/* Message */}
            <div className="space-y-2">
              <h3 className="font-black text-slate-900 text-lg leading-tight">{confirmModal.title}</h3>
              <p className="text-slate-500 text-xs font-semibold leading-relaxed px-2">{confirmModal.message}</p>
            </div>
            
            {/* Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl shadow-sm transition-all ${
                  confirmModal.isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                    : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                }`}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Read-only Info Modal */}
      {infoModalOpen && selectedInfoProgram && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 p-6 space-y-5 animate-zoom-in text-left relative">
            {/* Close Button */}
            <button 
              onClick={() => setInfoModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg transition-all"
            >
              &times;
            </button>

            {/* 1. Nama Program */}
            <h3 className="font-black text-slate-900 text-xl leading-snug pr-8 pt-2">
              {selectedInfoProgram.nama}
            </h3>

            {/* 2. Tanggal Pelaksanaan */}
            <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-3.5 flex items-start gap-3">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">Tanggal Pelaksanaan</p>
                <p className="text-slate-800 text-sm font-bold leading-normal">
                  {formatTanggalPelaksanaan(selectedInfoProgram.tanggal_mulai, selectedInfoProgram.tanggal_selesai)}
                </p>
              </div>
            </div>

            {/* 3. Deskripsi Program & Tujuan */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deskripsi & Tujuan Kegiatan</h4>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-[100px] max-h-48 overflow-y-auto">
                {selectedInfoProgram.deskripsi ? (
                  <p className="text-slate-700 text-sm font-medium leading-relaxed whitespace-pre-wrap">
                    {selectedInfoProgram.deskripsi}
                  </p>
                ) : (
                  <p className="text-slate-400 text-xs italic font-medium">
                    Tidak ada deskripsi atau tujuan khusus yang dicantumkan untuk program ini.
                  </p>
                )}
              </div>
            </div>

            {/* Close Button at bottom */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setInfoModalOpen(false)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 text-center"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
