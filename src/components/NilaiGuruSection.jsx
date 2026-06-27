import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import * as XLSX from 'xlsx-js-style'
import ExcelJS from 'exceljs'
import { getSemesterAktif } from '../utils/semesterUtils'
import { useConfirm } from '../utils/useConfirm'

// ─── Icons ───────────────────────────────────────────────────────────────────
const IconPlus = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconTrash = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
const IconDownload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IconUpload = () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IconEye = ({ on }) => on
  ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
const IconClose = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
const IconPencil = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
const IconSettings = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>

// ─── BAB color palette ────────────────────────────────────────────────────────
const BAB_BG      = ['bg-indigo-50/70','bg-emerald-50/70','bg-amber-50/70','bg-purple-50/70','bg-rose-50/70','bg-cyan-50/70']
const BAB_TEXT    = ['text-indigo-800','text-emerald-800','text-amber-800','text-purple-800','text-rose-800','text-cyan-800']
const BAB_HOVER   = ['hover:bg-indigo-100/70','hover:bg-emerald-100/70','hover:bg-amber-100/70','hover:bg-purple-100/70','hover:bg-rose-100/70','hover:bg-cyan-100/70']
const BAB_BG_SUB  = ['bg-indigo-50/20','bg-emerald-50/20','bg-amber-50/20','bg-purple-50/20','bg-rose-50/20','bg-cyan-50/20']
const BAB_HOV_SUB = ['hover:bg-indigo-50/50','hover:bg-emerald-50/50','hover:bg-amber-50/50','hover:bg-purple-50/50','hover:bg-rose-50/50','hover:bg-cyan-50/50']

// ─── NilaiGuruSection ─────────────────────────────────────────────────────────
export default function NilaiGuruSection({ session, activeTa }) {
  // Step state: 1=Pilih Konteks, 2=Kelola BAB/TP, 3=Target Kelas, 4=Input Nilai

  // Context
  const [selectedMapelId, setSelectedMapelId]     = useState('')
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [targetKelasList, setTargetKelasList]     = useState([])
  const [activeTabKelas, setActiveTabKelas]       = useState('')
  const [slideDirection, setSlideDirection] = useState('right')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  // Data
  const [semesters, setSemesters]   = useState([])
  const [komponen, setKomponen]     = useState([])
  const [students, setStudents]     = useState([])
  const [nilaiData, setNilaiData]   = useState({})
  const [savingCell, setSavingCell] = useState(null)

  // BAB/TP form
  const [showAddBab, setShowAddBab]         = useState(false)
  const [newBabNama, setNewBabNama]         = useState('')
  const [newBabRombel, setNewBabRombel]     = useState('')
  const [newBabTargetKelas, setNewBabTargetKelas] = useState([])
  const [addingTpToBab, setAddingTpToBab]   = useState(null)
  const [newTpNama, setNewTpNama]           = useState('')
  const [newTpDeskripsi, setNewTpDeskripsi] = useState('')
  const [newTpBobot, setNewTpBobot]         = useState('1')
  const [newTpTargetKelas, setNewTpTargetKelas] = useState([])
  const [addingKomponen, setAddingKomponen] = useState(false)

  // Manage BAB/TP panel
  const [selectedBabToManage, setSelectedBabToManage] = useState(null)
  const [editBabName, setEditBabName]                 = useState('')
  const [selectedTpToManage, setSelectedTpToManage]   = useState(null)
  const [editTpData, setEditTpData]                   = useState({ nama: '', deskripsi: '', bobot: '1', target_kelas: [] })
  const [editingMetode, setEditingMetode]             = useState(null)

  const [manualBobotPending, setManualBobotPending] = useState(false)
  const [manualBobotValues, setManualBobotValues] = useState({})

  // Upload Excel
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResult, setUploadResult]     = useState(null)
  
  // New injected states
  const [babOpen, setBabOpen] = useState({})
  const [kkm, setKkm] = useState(75)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedExportClasses, setSelectedExportClasses] = useState([])
  const [showKelolaSemester, setShowKelolaSemester] = useState(false)
  const [kelolaSemesterRombel, setKelolaSemesterRombel] = useState('')
  const [maxNamaWidth, setMaxNamaWidth] = useState(260)
  
  useEffect(() => {
    if (!targetKelasList || targetKelasList.length === 0) return
    const fetchMaxName = async () => {
       const { data } = await supabase.from('siswa_lengkap').select('nama_lengkap').in('kelas', targetKelasList)
       if (data && data.length > 0) {
          const maxLen = Math.max(...data.map(d => (d.nama_lengkap || '').length))
          // 1 char ~ 7.5px in standard fonts. Add 40px for padding
          const calculatedWidth = Math.max(200, Math.ceil(maxLen * 7.5 + 40))
          setMaxNamaWidth(calculatedWidth)
       }
    }
    fetchMaxName()
  }, [targetKelasList])
  const [showConfigAkhirModal, setShowConfigAkhirModal] = useState(false)
  const [configAkhir, setConfigAkhir] = useState({ metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: true })

  const [showAddTp, setShowAddTp] = useState(false)

  const uploadRef = useRef(null)
  const tableRef = useRef(null)
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // Session data
  const waliKelas  = session?.kelas?.filter(k => !activeTa || k.tahun_ajaran_id === activeTa?.id).map(k => k.kelas) || []
  const mapelRaw   = session?.guru_mapel_raw?.filter(m => !activeTa || m.tahun_ajaran_id === activeTa?.id) || []
  const uniqueMapels = mapelRaw.reduce((acc, m) => {
    const id = m.mata_pelajaran_id
    const nama = m.mata_pelajaran?.nama
    if (id && nama && !acc.find(x => x.id === id)) acc.push({ id, nama })
    return acc
  }, [])
  const uniqueClassesForMapel = [...new Set([
    ...waliKelas,
    ...mapelRaw.filter(m => m.mata_pelajaran_id === selectedMapelId).map(m => m.kelas)
  ])].sort()
  // Extract unique rombel numbers (7, 8, 9) from class names like "7A", "7B"
  const uniqueRombels = [...new Set(uniqueClassesForMapel.map(c => c.replace(/\D/g, '')))].sort()

  // Current semester komponen filtered by active tab kelas
  const classKomponen = komponen.filter(k =>
    k.semester_id === selectedSemesterId && (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.includes(activeTabKelas))
  )
  const uniqueBabs = [...new Set(komponen.map(k => k.bab_nama || 'Lainnya'))]
  const uniqueBabsClass = [...new Set(classKomponen.map(k => k.bab_nama || 'Lainnya'))]

  // Existing BABs for the selected rombel in add-bab modal
  const existingBabsForRombel = newBabRombel
    ? [...new Set(komponen.filter(k => k.target_kelas?.some(c => c.replace(/\D/g, '') === newBabRombel)).map(k => k.bab_nama || 'Lainnya'))]
    : []

  // ─── Auto-select ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (uniqueMapels.length === 1) setSelectedMapelId(uniqueMapels[0].id)
  }, [])

  useEffect(() => {
    if (!activeTa?.id) return
    fetchSemesters()
  }, [activeTa])

  useEffect(() => {
    const aktif = getSemesterAktif(semesters)
    if (aktif) setSelectedSemesterId(aktif.id)
    else if (semesters.length > 0) setSelectedSemesterId(semesters[0].id)
  }, [semesters])



  useEffect(() => {
    if (selectedMapelId && selectedSemesterId) {
      fetchKomponen()
    } else {
      setKomponen([])
    }
  }, [selectedMapelId, selectedSemesterId])

  useEffect(() => {
    if (activeTabKelas && selectedMapelId && selectedSemesterId) {
      fetchStudents()
      fetchConfigAkhir()
    } else {
      setStudents([])
      setNilaiData({})
      setConfigAkhir({ metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: true })
    }
  }, [activeTabKelas, selectedMapelId, selectedSemesterId])

  const classKompIdsStr = classKomponen.map(k => k.id).sort().join(',')
  const studentNisnsStr = students.map(s => String(s.nisn)).sort().join(',')
  useEffect(() => {
    if (classKomponen.length > 0 && students.length > 0) fetchNilai()
  }, [classKompIdsStr, studentNisnsStr])

  // ─── Fetch Functions ──────────────────────────────────────────────────────
  const fetchConfigAkhir = async () => {
    const { data } = await supabase.from('nilai_akhir_config')
      .select('*')
      .eq('guru_id', session.id)
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('semester_id', selectedSemesterId)
      .eq('mata_pelajaran_id', selectedMapelId)
      .eq('kelas', activeTabKelas)
      .maybeSingle()
    
    if (data) {
      setConfigAkhir({ metode_hitung: data.metode_hitung || 'rata_rata', bobot_detail: data.bobot_detail || {}, is_visible: data.is_visible ?? true })
    } else {
      setConfigAkhir({ metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: true })
    }
  }

  const fetchSemesters = async () => {
    const { data } = await supabase.from('semester')
      .select('*').eq('tahun_ajaran_id', activeTa.id).order('nomor')
    setSemesters(data || [])
  }

  const fetchKomponen = async () => {
    const { data } = await supabase.from('nilai_komponen')
      .select('*')
      .eq('guru_id', session.id)
      .eq('tahun_ajaran_id', activeTa.id)
      .eq('mata_pelajaran_id', selectedMapelId)
      .order('urutan')
    let d = data || []
    
    // Auto-heal corrupted target_kelas (e.g. from previous bugs where Kelas 9 was mixed with Kelas 8)
    const corruptedIds = d.filter(k => k.target_kelas && k.target_kelas.length > 0 && new Set(k.target_kelas.map(c => c.replace(/\D/g, ''))).size > 1)
    if (corruptedIds.length > 0) {
       d = d.map(k => {
           if (k.target_kelas && k.target_kelas.length > 0) {
               const trueRombel = (k.kelas || k.target_kelas[0]).replace(/\D/g, '');
               return { ...k, target_kelas: k.target_kelas.filter(c => c.replace(/\D/g, '') === trueRombel) }
           }
           return k;
       })
       corruptedIds.forEach(async (corrupted) => {
           const trueRombel = (corrupted.kelas || corrupted.target_kelas[0]).replace(/\D/g, '');
           const newTarget = corrupted.target_kelas.filter(c => c.replace(/\D/g, '') === trueRombel);
           await supabase.from('nilai_komponen').update({ target_kelas: newTarget }).eq('id', corrupted.id);
       })
    }
    
    // Auto-heal Penilaian Sumatif grouping to separate PSTS and PSAS
    const sumatifKomp = d.filter(k => k.bab_nama === 'Penilaian Sumatif' && (k.nama === 'PSTS 1' || k.nama === 'PSTS 2' || k.nama === 'PSAS' || k.nama === 'PSAT'));
    if (sumatifKomp.length > 0) {
      d = d.map(k => {
        if (k.bab_nama === 'Penilaian Sumatif' && (k.nama === 'PSTS 1' || k.nama === 'PSTS 2' || k.nama === 'PSAS' || k.nama === 'PSAT')) {
          return { ...k, bab_nama: k.nama, nama: 'Nilai' };
        }
        return k;
      });
      sumatifKomp.forEach(async (sk) => {
        await supabase.from('nilai_komponen').update({ bab_nama: sk.nama, nama: 'Nilai' }).eq('id', sk.id);
      });
    }
    
    // Auto-generate PSTS and PSAS components if they don't exist
    const currentSem = semesters.find(s => s.id === selectedSemesterId);
    if (currentSem && selectedMapelId) {
      const isSem1 = currentSem.nomor === 1;
      const t1Name = isSem1 ? 'PSTS 1' : 'PSTS 2';
      const t2Name = isSem1 ? 'PSAS' : 'PSAT';
      
      const missingKomp = [];
      uniqueRombels.forEach(rombel => {
        const classesForRombel = uniqueClassesForMapel.filter(c => c.replace(/\D/g, '') === rombel);
        if (classesForRombel.length === 0) return;

        const hasT1 = d.find(k => k.semester_id === selectedSemesterId && (k.nama === t1Name || k.bab_nama === t1Name) && k.target_kelas?.some(c => c.replace(/\D/g, '') === rombel));
        if (!hasT1) {
           missingKomp.push({ bab_nama: t1Name, nama: 'Nilai', bobot: 1, urutan: 998, target_kelas: classesForRombel, kelas: classesForRombel[0], metode_hitung: 'rata_rata', is_nilai_visible: false, guru_id: session.id, tahun_ajaran_id: activeTa.id, semester_id: selectedSemesterId, mata_pelajaran_id: selectedMapelId });
        }

        const hasT2 = d.find(k => k.semester_id === selectedSemesterId && (k.nama === t2Name || k.bab_nama === t2Name) && k.target_kelas?.some(c => c.replace(/\D/g, '') === rombel));
        if (!hasT2) {
           missingKomp.push({ bab_nama: t2Name, nama: 'Nilai', bobot: 1, urutan: 999, target_kelas: classesForRombel, kelas: classesForRombel[0], metode_hitung: 'rata_rata', is_nilai_visible: false, guru_id: session.id, tahun_ajaran_id: activeTa.id, semester_id: selectedSemesterId, mata_pelajaran_id: selectedMapelId });
        }
      });

      if (missingKomp.length > 0) {
        const { data: inserted } = await supabase.from('nilai_komponen').insert(missingKomp).select();
        if (inserted) {
          d = [...d, ...inserted];
          // re-sort based on urutan
          d.sort((a,b) => a.urutan - b.urutan);
        }
      }
    }

    setKomponen(d)
    // Collect all target kelas
    const allKelas = [...new Set(d.flatMap(k => k.target_kelas || []))].sort()
    setTargetKelasList(allKelas)
    if (allKelas.length > 0 && !activeTabKelas) setActiveTabKelas(allKelas[0])
  }

  const fetchStudents = async () => {
    const { data } = await supabase.from('siswa_lengkap')
      .select('nisn, nama_lengkap, kelas')
      .eq('kelas', activeTabKelas)
      .eq('tahun_ajaran_id', activeTa.id)
      .order('nama_lengkap')
    setStudents(data || [])
    
    // Slight delay to allow data to render before starting animation
    setTimeout(() => {
        setIsTransitioning(false)
        setAnimKey(prev => prev + 1)
    }, 10)
  }
  const fetchNilai = async () => {
    const ids = classKomponen.map(k => k.id)
    const nisnList = students.map(s => String(s.nisn))
    if (ids.length === 0 || nisnList.length === 0) return
    const { data } = await supabase.from('nilai_siswa').select('*').in('komponen_id', ids).in('siswa_nisn', nisnList)
    const map = {}
    ;(data || []).forEach(n => {
      if (!map[n.komponen_id]) map[n.komponen_id] = {}
      map[n.komponen_id][n.siswa_nisn] = n.nilai
    })
    setNilaiData(map)
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleAddBab = async () => {
    const classesForRombel = uniqueClassesForMapel.filter(c => c.replace(/\D/g, '') === newBabRombel)
    
    if (!newBabNama.trim() || !newBabRombel || classesForRombel.length === 0) {
      alert('Nama BAB dan target kelas harus diisi!');
      return;
    }
    let finalName = newBabNama.trim()
    
    // Auto format "Bab X:"
    if (!finalName.toLowerCase().startsWith('bab')) {
       const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
       const uniqueBabs = [...new Set(classBabs.map(k => k.bab_nama || 'Lainnya'))]
       const nextNum = uniqueBabs.length + 1
       finalName = `Bab ${nextNum}: ${finalName}`
    }
    
    // Check duplication for specific rombel
    if (!komponen.find(k => k.bab_nama === finalName && k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))) {
      setAddingKomponen(true)
      const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
      const { error } = await supabase.from('nilai_komponen').insert({
        guru_id: session.id,
        tahun_ajaran_id: activeTa.id,
        semester_id: null,
        mata_pelajaran_id: selectedMapelId,
        bab_nama: finalName,
        nama: 'N. Karakter',
        deskripsi: '',
        bobot: 1,
        urutan: maxUrutan,
        target_kelas: classesForRombel,
        kelas: classesForRombel[0],
        metode_hitung: 'rata_rata',
        is_nilai_visible: false
      })
      
      setAddingKomponen(false)
      if (error) {
        alert('Gagal menambah BAB: ' + error.message)
      } else {
        const combined = [...new Set([...targetKelasList, ...classesForRombel])].sort();
        setTargetKelasList(combined);
        if (!activeTabKelas && combined.length > 0) setActiveTabKelas(combined[0]);
        fetchKomponen() // Refreshes the list on the right panel automatically
      }
    } else {
      alert('BAB tersebut sudah ada di kelas ini.')
    }
    
    // Do NOT close the modal, so user can rapidly add another bab
    setNewBabNama('')
  }
  const handleAddTp = async () => {
    if (!newTpNama.trim() || !addingTpToBab || newTpTargetKelas.length === 0) {
       alert('Nama TP dan kelas target harus diisi!');
       return;
    }
    setAddingKomponen(true)
    
    const maxUrutan = komponen.length > 0 ? Math.max(...komponen.map(k => k.urutan)) + 1 : 0
    const existingInBab = komponen.find(k => k.bab_nama === addingTpToBab)
    const metodeHitung = existingInBab ? (existingInBab.metode_hitung || 'rata_rata') : 'rata_rata'
    const semesterIdForTp = existingInBab ? existingInBab.semester_id : null;
    
    const { error } = await supabase.from('nilai_komponen').insert({
      guru_id: session.id,
      tahun_ajaran_id: activeTa.id,
      semester_id: semesterIdForTp,
      mata_pelajaran_id: selectedMapelId,
      bab_nama: addingTpToBab,
      nama: newTpNama.trim(),
      deskripsi: newTpDeskripsi.trim() || null,
      bobot: parseFloat(newTpBobot) || 1,
      urutan: maxUrutan,
      target_kelas: newTpTargetKelas,
      kelas: newTpTargetKelas.length > 0 ? newTpTargetKelas[0] : 'LINTAS',
      metode_hitung: metodeHitung,
      is_nilai_visible: false
    })
    
    setAddingKomponen(false)
    if (error) {
      alert('Gagal: ' + error.message)
    } else {
      setNewTpNama('')
      setNewTpDeskripsi('')
      setNewTpBobot('1')
      setNewTpTargetKelas([])
      setAddingTpToBab(null)
      fetchKomponen()
    }
  }

  
  const handleDeleteKomponen = async (id) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Komponen Nilai?',
      message: 'Semua nilai dalam komponen ini juga akan terhapus.',
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('nilai_komponen').delete().eq('id', id)
    if (error) alert('Gagal: ' + error.message)
    else fetchKomponen()
  }

  const handleToggleVisible = async (komp) => {
    const willShow = !komp.is_nilai_visible
    if (willShow) {
      const confirmed = await requestConfirm({
        title: 'Tampilkan Nilai ke Siswa?',
        message: `Nilai "${komp.nama}" akan ditampilkan di akun siswa. Apakah Anda yakin?`,
        confirmLabel: 'Ya, Tampilkan',
        confirmColor: 'indigo',
        icon: 'info',
        extraCheckbox: 'Terapkan ke semua TP sejenis di semua kelas',
      })
      if (!confirmed) return
    }
    const { error } = await supabase.from('nilai_komponen')
      .update({ is_nilai_visible: willShow }).eq('id', komp.id)
    if (error) alert('Gagal: ' + error.message)
    else setKomponen(prev => prev.map(k => k.id === komp.id ? { ...k, is_nilai_visible: willShow } : k))
  }

  const handleSaveEditTp = async () => {
    if (!selectedTpToManage) return
    const { error } = await supabase.from('nilai_komponen').update({
      nama: editTpData.nama,
      deskripsi: editTpData.deskripsi,
      bobot: parseFloat(editTpData.bobot) || 1,
      target_kelas: editTpData.target_kelas,
      kelas: editTpData.target_kelas[0] || 'LINTAS'
    }).eq('id', selectedTpToManage)
    if (error) alert('Gagal: ' + error.message)
    else { setSelectedTpToManage(null); fetchKomponen() }
  }

  const handleSaveEditBab = async () => {
    if (!selectedBabToManage || !editBabName.trim()) return
    const updates = komponen.filter(k => k.bab_nama === selectedBabToManage)
    for (const k of updates) {
      await supabase.from('nilai_komponen').update({ bab_nama: editBabName.trim() }).eq('id', k.id)
    }
    setSelectedBabToManage(null)
    fetchKomponen()
  }

  const handleUpdateMetode = async (babNama, metode) => {
    if (metode === 'bobot_manual') {
      const komp = classKomponen.filter(k => k.bab_nama === babNama);
      const vals = {};
      komp.forEach(k => {
         // Default if previously not set properly
         vals[k.id] = (k.bobot !== undefined && k.bobot !== null) ? k.bobot : (100/komp.length);
      });
      setManualBobotValues(vals);
      setManualBobotPending(true);
      return;
    }
    
    setManualBobotPending(false);
    const ids = komponen.filter(k => k.bab_nama === babNama).map(k => k.id)
    for (const id of ids) {
      await supabase.from('nilai_komponen').update({ metode_hitung: metode }).eq('id', id)
    }
    setEditingMetode(null)
    fetchKomponen()
  }
  
  const handleSaveManualBobot = async (babNama) => {
    let sum = 0;
    Object.values(manualBobotValues).forEach(v => sum += Number(v));
    if (Math.abs(sum - 100) > 0.01) {
       alert(`Total bobot harus 100%. Saat ini: ${sum}%`);
       return;
    }
    
    const ids = classKomponen.filter(k => k.bab_nama === babNama).map(k => k.id);
    for (const id of ids) {
       await supabase.from('nilai_komponen').update({ 
         metode_hitung: 'bobot_manual',
         bobot: Number(manualBobotValues[id])
       }).eq('id', id);
    }
    setManualBobotPending(false);
    fetchKomponen();
  }

  const handleSaveConfigAkhir = async (newConfig) => {
    // Validate bobot manual sums to 100
    if (newConfig.metode_hitung === 'bobot_manual') {
      const sum = Object.values(newConfig.bobot_detail).reduce((a, b) => a + Number(b), 0);
      if (Math.abs(sum - 100) > 0.01) {
         alert(`Total bobot harus 100%. Saat ini: ${sum}%`);
         return false;
      }
    }

    const { error } = await supabase.from('nilai_akhir_config').upsert({
      guru_id: session.id,
      tahun_ajaran_id: activeTa.id,
      semester_id: selectedSemesterId,
      mata_pelajaran_id: selectedMapelId,
      kelas: activeTabKelas,
      metode_hitung: newConfig.metode_hitung,
      bobot_detail: newConfig.bobot_detail,
      is_visible: newConfig.is_visible ?? true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'guru_id,tahun_ajaran_id,semester_id,mata_pelajaran_id,kelas' });
    
    if (error) {
      alert('Gagal menyimpan pengaturan: ' + error.message);
      return false;
    }
    
    setConfigAkhir(newConfig);
    setShowConfigAkhirModal(false);
    return true;
  }

  const handleNilaiChange = async (komponenId, nisn, nilai) => {
    const cellKey = `${komponenId}-${nisn}`
    setSavingCell(cellKey)
    setNilaiData(prev => ({ ...prev, [komponenId]: { ...(prev[komponenId] || {}), [nisn]: nilai === '' ? null : Number(nilai) } }))
    await supabase.from('nilai_siswa').upsert({
      komponen_id: komponenId, siswa_nisn: nisn,
      nilai: nilai === '' ? null : Number(nilai),
      diinput_oleh: session.id, updated_at: new Date().toISOString()
    }, { onConflict: 'komponen_id,siswa_nisn' })
    setSavingCell(null)
  }

  const toggleNewTpTargetKelas = (c) => {
    setNewTpTargetKelas(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const toggleEditTpTargetKelas = (c) => {
    setEditTpData(prev => ({
      ...prev,
      target_kelas: prev.target_kelas.includes(c) ? prev.target_kelas.filter(x => x !== c) : [...prev.target_kelas, c]
    }))
  }

  // ─── Hitung Rata-rata ─────────────────────────────────────────────────────
  const hitungRataRata = (nisn) => {
    const babList = [...new Set(classKomponen.map(k => k.bab_nama || 'Lainnya'))]
    const hitungRataBAB = (bab) => {
      const komp = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab)
      const metode = komp[0]?.metode_hitung || 'rata_rata'
      let totalBobot = 0, totalNilai = 0, hasVal = false
      komp.forEach(k => {
        const val = nilaiData[k.id]?.[nisn]
        if (val !== undefined && val !== null && val !== '') {
          if (metode === 'bobot_manual') { totalNilai += Number(val) * (k.bobot || 1); totalBobot += (k.bobot || 1) }
          else { totalNilai += Number(val); totalBobot += 1 }
          hasVal = true
        }
      })
      if (!hasVal || totalBobot === 0) return null
      return +(totalNilai / totalBobot).toFixed(1)
    }

    if (configAkhir.metode_hitung === 'bobot_manual') {
      let totalNilai = 0;
      let totalBobot = 0;
      babList.forEach(bab => {
        const rataBab = hitungRataBAB(bab);
        if (rataBab !== null) {
           const bobot = Number(configAkhir.bobot_detail[bab] || 0);
           totalNilai += rataBab * bobot;
           totalBobot += bobot;
        }
      });
      if (totalBobot === 0) return null;
      return (totalNilai / totalBobot).toFixed(1);
    } else {
      const vals = babList.map(bab => hitungRataBAB(bab)).filter(v => v !== null)
      if (vals.length === 0) return null
      return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
    }
  }






  // ─── Export Excel (Rich Format) ───────────────────────────────────────────
  const generateClassSheet = async (kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb) => {
      setIsExporting(true)
      const sem = semesters.find(s => s.id === selectedSemesterId)
      const mapelNama = uniqueMapels.find(m => m.id === selectedMapelId)?.nama || 'Mapel'
      const sekolah = 'SMP BUDI MULIA'
      const tahunAjaran = activeTa?.nama || ''

      const babList = [...new Set(classKomp.map(k => k.bab_nama || 'Lainnya'))]
      const babKomponenMap = {}
      babList.forEach(bab => {
        babKomponenMap[bab] = classKomp.filter(k => (k.bab_nama || 'Lainnya') === bab).sort((a,b) => {
          if (a.nama.toUpperCase() === 'N. KARAKTER') return 1;
          if (b.nama.toUpperCase() === 'N. KARAKTER') return -1;
          return a.urutan - b.urutan;
        })
      })

      const hitungRataAkhir = (nisn) => {
        const hitungRataBAB = (nisn, bab) => {
          const komp = babKomponenMap[bab] || []
          const metode = komp[0]?.metode_hitung || 'rata_rata'
          let totalBobot = 0, totalNilai = 0, hasVal = false
          komp.forEach(k => {
            const val = classNilaiData[k.id]?.[nisn]
            if (val !== undefined && val !== null && val !== '') {
              if (metode === 'bobot_manual') { totalNilai += Number(val) * (k.bobot || 1); totalBobot += (k.bobot || 1) }
              else { totalNilai += Number(val); totalBobot += 1 }
              hasVal = true
            }
          })
          if (!hasVal || totalBobot === 0) return null
          return +(totalNilai / totalBobot).toFixed(1)
        }

        if (classConfigAkhir.metode_hitung === 'bobot_manual') {
          let totalNilai = 0;
          let totalBobot = 0;
          babList.forEach(bab => {
            const rataBab = hitungRataBAB(nisn, bab);
            if (rataBab !== null) {
               const bobot = Number(classConfigAkhir.bobot_detail[bab] || 0);
               totalNilai += rataBab * (bobot / 100);
               totalBobot += bobot;
            }
          });
          if (totalBobot === 0) return null;
          return +(totalNilai).toFixed(1);
        } else {
          const vals = babList.map(bab => hitungRataBAB(nisn, bab)).filter(v => v !== null)
          if (vals.length === 0) return null
          return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
        }
      }

      const getPredikat = (nilai) => {
        if (nilai === null) return ''
        if (nilai >= 90) return 'A'
        if (nilai >= 80) return 'B'
        if (nilai >= 70) return 'C'
        if (nilai >= 60) return 'D'
        return 'E'
      }

      const getKeterangan = (nisn, bab) => {
        const komp = babKomponenMap[bab] || []
        const belumDikerjakan = []
        komp.forEach(k => {
          const val = classNilaiData[k.id]?.[nisn]
          if (val !== undefined && val !== null && val !== '' && Number(val) === 0) {
            belumDikerjakan.push(k.nama)
          }
        })
        const parts = []
        if (belumDikerjakan.length > 0) parts.push(`${belumDikerjakan.join(', ')} belum dikerjakan`)
        return parts.join(' | ')
      }

      const isSumatif = (bab) => ['PSTS 1', 'PSTS 2', 'PSAS', 'PSAT'].includes(bab);

      const FIXED = 3
      const babColStart = {}
      let col = FIXED
      babList.forEach(bab => {
        babColStart[bab] = col
        col += (babKomponenMap[bab]?.length || 0) + (isSumatif(bab) ? 1 : 2)
      })
      const nilaiAkhirCol = col
      const predikatCol  = col + 1
      const lingkupStartCol = col + 2

      let maxKomp = 0
      babList.forEach(bab => {
        if (babKomponenMap[bab]?.length > maxKomp) maxKomp = babKomponenMap[bab].length
      })
      
      const totalCols = lingkupStartCol + (babList.length * 2)
      const requiredLingkupRows = 15 + (maxKomp * 4)
      const dataRows = 13 + classStudents.length // Data starts at idx 13 (Row 14)
      const totalRows = Math.max(dataRows, requiredLingkupRows)

      const colLetter = (n) => {
        let s = ''
        n += 1
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
        return s
      }

      const BORDER = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
      
      const styleTitle = { font: { bold: true, sz: 22 }, alignment: { horizontal: 'center', vertical: 'center' } }
      const styleInfo = { font: { sz: 12, bold: true } }
      const styleHeader = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: BORDER, fill: { fgColor: { rgb: "F2F2F2" } } }
      const styleDataCenter = { font: { sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, border: BORDER }
      const styleDataLeft = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: BORDER }
      const styleLingkupTitle = { font: { bold: true, sz: 12 } }
      const styleLingkupItalic = { font: { italic: true, sz: 12 } }
      const styleLingkupDesc = { font: { sz: 12 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: BORDER }

      // Initialize with NULL
      const aoa2 = Array.from({ length: totalRows }, () => Array.from({ length: totalCols }, () => null))

      const getColLetter = (colIndex) => {
         let letter = '';
         let temp = colIndex;
         while (temp >= 0) {
            letter = String.fromCharCode((temp % 26) + 65) + letter;
            temp = Math.floor(temp / 26) - 1;
         }
         return letter;
      }

      const setCell = (r, c, val, style, t = null, f = null) => {
        if (aoa2[r]) {
          const cellType = t ? t : (typeof val === 'number' ? 'n' : 's')
          aoa2[r][c] = { v: val, t: cellType, s: JSON.parse(JSON.stringify(style || {})), f: f }
        }
      }

      // Title
      setCell(0, 0, 'DAFTAR NILAI PESERTA DIDIK', styleTitle)
      setCell(1, 0, sekolah, styleTitle)
      setCell(2, 0, `TAHUN AJARAN ${tahunAjaran}`, styleTitle)
      
      // Info
      setCell(3, 0, 'Mata Pelajaran', styleInfo); setCell(3, 2, `: ${mapelNama}`, styleInfo)
      setCell(4, 0, 'Kelas', styleInfo);          setCell(4, 2, `: ${kelas}`, styleInfo)
      setCell(5, 0, 'Semester', styleInfo);       setCell(5, 2, `: ${sem?.nomor || '-'}`, styleInfo)
      setCell(6, 0, 'Tahun Ajaran', styleInfo);   setCell(6, 2, `: ${tahunAjaran}`, styleInfo)
      setCell(7, 0, 'KKM', styleInfo);            setCell(7, 2, `: ${kkm}`, styleInfo)
      setCell(8, 0, 'Guru Pengampu', styleInfo);  setCell(8, 2, `: ${session?.nama || 'Guru'}`, styleInfo)

      const fillEmptyBorders = (rStart, rEnd, cStart, cEnd, style) => {
        for(let r=rStart; r<=rEnd; r++) {
          for(let c=cStart; c<=cEnd; c++) {
             if (!aoa2[r][c]) setCell(r, c, '', style, 's');
          }
        }
      }

      // Row 11 (idx 10): Main Headers & Bab
      setCell(10, 0, 'No', styleHeader)
      setCell(10, 1, 'NISN', styleHeader)
      setCell(10, 2, 'Nama Siswa', styleHeader)
      babList.forEach(bab => { 
        setCell(10, babColStart[bab], bab, styleHeader) 
      })
      setCell(10, nilaiAkhirCol, 'Nilai Akhir', styleHeader)
      setCell(10, predikatCol, 'Predikat', styleHeader)

      // Row 12 (idx 11): TP sub-headers
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const metode = komp[0]?.metode_hitung || 'rata_rata'
        komp.forEach((k, ki) => { setCell(11, start + ki, k.nama, styleHeader) })
        if (isSumatif(bab)) {
          setCell(11, start + komp.length, 'Keterangan (Belum Tuntas)', styleHeader)
          setCell(12, start + komp.length, '', styleDataCenter)
        } else {
          const rataHeaderName = (metode === 'bobot_manual') ? 'Nilai Akhir BAB' : 'Rata-rata BAB'
          setCell(11, start + komp.length, rataHeaderName, styleHeader)
          setCell(11, start + komp.length + 1, 'Keterangan (Belum Tuntas)', styleHeader)
          // White cells below them
          setCell(12, start + komp.length, '', styleDataCenter)
          setCell(12, start + komp.length + 1, '', styleDataCenter)
        }
      })

      // Row 13 (idx 12): Bobot
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const metode = komp[0]?.metode_hitung || 'rata_rata'
        
        komp.forEach((k, ki) => { 
          let bobot = ''
          if (metode === 'bobot_sama') {
             bobot = 100
          } else if (metode === 'bobot_manual') {
             bobot = (k.bobot !== undefined && k.bobot !== null) ? k.bobot : 100
          } else {
             bobot = '' // rata_rata dibiarkan kosong baris bobotnya
          }
          setCell(12, start + ki, bobot, styleDataCenter, 'n') 
        })
      })

      // Fill header borders for main table (idx 10 to 12)
      fillEmptyBorders(10, 12, 0, 2, styleHeader)
      fillEmptyBorders(10, 12, nilaiAkhirCol, predikatCol, styleHeader)
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
        fillEmptyBorders(10, 12, start, end, styleHeader)
      })

      // Lingkup Materi Headers
      babList.forEach((bab, bi) => {
        const startLCol = lingkupStartCol + bi * 2
        setCell(10, startLCol, `Lingkup Materi ${bi + 1} :`, styleLingkupTitle)
        setCell(11, startLCol, 'Materi yang diajarkan :', styleLingkupTitle)
        setCell(12, startLCol, bab, styleLingkupItalic)
      })

      // Data Rows
      classStudents.forEach((s, idx) => {
        const r = 13 + idx
        const excelRow = r + 1
        setCell(r, 0, idx + 1, styleDataCenter)
        setCell(r, 1, s.nisn, styleDataCenter, 's')
        setCell(r, 2, s.nama_lengkap, styleDataLeft)
        
        const rataBabFormulaRefs = [];

        babList.forEach(bab => {
          const komp = babKomponenMap[bab] || []
          const start = babColStart[bab]
          
          const tpKomp = komp;
          const tpColLetters = tpKomp.map((k, ki) => getColLetter(start + ki))
          
          komp.forEach((k, ki) => {
            const val = classNilaiData[k.id]?.[s.nisn]
            setCell(r, start + ki, val !== undefined && val !== null && val !== '' ? Number(val) : '', styleDataCenter, 'n')
          })
          
          const metode = komp[0]?.metode_hitung || 'rata_rata'
          let formulaRata = ""
          
          if (!isSumatif(bab)) {
            if (tpColLetters.length > 0) {
               const rangeNilai = `${tpColLetters[0]}${excelRow}:${tpColLetters[tpColLetters.length-1]}${excelRow}`
               const rangeBobot = `${tpColLetters[0]}13:${tpColLetters[tpColLetters.length-1]}13`
               
               if (metode === 'rata_rata') {
                  formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(AVERAGE(${rangeNilai}), 2), ""))`
               } else {
                  formulaRata = `IF(COUNT(${rangeNilai})=0, "", IFERROR(ROUND(SUMPRODUCT(${rangeNilai}, ${rangeBobot}) / SUMIF(${rangeNilai}, ">=0", ${rangeBobot}), 2), ""))`
               }
            }
            
            const rataCol = start + komp.length
            const rataColLetter = getColLetter(rataCol)
            if (formulaRata) {
               rataBabFormulaRefs.push(`${rataColLetter}${excelRow}`)
            }
            
            setCell(r, rataCol, null, styleDataCenter, 'n', formulaRata)
            
            // Keterangan formula
            let formulaKeterangan = `""`
            if (tpColLetters.length > 0) {
               const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
               const concatExpr = parts.join(' & ')
               formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
            }
            setCell(r, start + komp.length + 1, null, styleDataLeft, 's', formulaKeterangan)
          } else {
            if (tpColLetters.length > 0) {
               rataBabFormulaRefs.push(`${tpColLetters[0]}${excelRow}`)
            }
            let formulaKeterangan = `""`
            if (tpColLetters.length > 0) {
               const parts = tpKomp.map((k, ki) => `IF(AND(NOT(ISBLANK(${tpColLetters[ki]}${excelRow})), ${tpColLetters[ki]}${excelRow}=0), "${k.nama}, ", "")`)
               const concatExpr = parts.join(' & ')
               formulaKeterangan = `IF(${concatExpr}="", "", LEFT(${concatExpr}, LEN(${concatExpr})-2) & " belum dikerjakan")`
            }
            setCell(r, start + komp.length, null, styleDataLeft, 's', formulaKeterangan)
          }
        })
        
        // Rata Rata Sumatif Formula
        let formulaRataSumatif = `""`
        if (rataBabFormulaRefs.length > 0) {
           if (classConfigAkhir.metode_hitung === 'bobot_manual') {
              let numParts = []
              let denParts = []
              babList.forEach((bab, idx) => {
                 const bobot = Number(classConfigAkhir.bobot_detail[bab] || 0)
                 if (bobot > 0) {
                    numParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[idx]}), ${rataBabFormulaRefs[idx]} * ${bobot}, 0)`)
                    denParts.push(`IF(ISNUMBER(${rataBabFormulaRefs[idx]}), ${bobot}, 0)`)
                 }
              })
              if (numParts.length > 0) {
                 formulaRataSumatif = `IF((${denParts.join(' + ')})=0, "", IFERROR(ROUND((${numParts.join(' + ')}) / (${denParts.join(' + ')}), 1), ""))`
              }
           } else {
              formulaRataSumatif = `IFERROR(ROUND(AVERAGE(${rataBabFormulaRefs.join(',')}), 1), "")`
           }
        }
        setCell(r, nilaiAkhirCol, null, styleDataCenter, 'n', formulaRataSumatif)
        
        // Predikat formula (A >= 90, B >= 80, C >= 70, D >= 60, E < 60)
        const akhirColLetter = getColLetter(nilaiAkhirCol)
        const formulaPredikat = `IF(${akhirColLetter}${excelRow}="", "", IF(${akhirColLetter}${excelRow}>=90, "A", IF(${akhirColLetter}${excelRow}>=80, "B", IF(${akhirColLetter}${excelRow}>=70, "C", IF(${akhirColLetter}${excelRow}>=60, "D", "E")))))`
        setCell(r, predikatCol, null, styleDataCenter, 's', formulaPredikat)
      })

      // Lingkup Materi Descriptions
      babList.forEach((bab, bi) => {
        const komp = babKomponenMap[bab] || []
        const startLCol = lingkupStartCol + bi * 2
        
        komp.forEach((k, ki) => {
           const rowStart = 13 + (ki * 4)
           setCell(rowStart, startLCol, k.nama, styleDataCenter)
           setCell(rowStart, startLCol + 1, k.deskripsi || '', styleLingkupDesc)
           fillEmptyBorders(rowStart, rowStart+3, startLCol, startLCol, styleDataCenter)
           fillEmptyBorders(rowStart, rowStart+3, startLCol+1, startLCol+1, styleLingkupDesc)
        })
      })

      const sheetName = `Nilai ${kelas} Sem${sem?.nomor || '-'}`.substring(0, 31);
            const ws = wb.addWorksheet(sheetName, {
        views: [{ state: 'frozen', xSplit: 3, ySplit: 13, showGridLines: false }]
      });

      // Write values and styles
      for(let r = 0; r < totalRows; r++) {
         const row = ws.getRow(r + 1);
         for(let c = 0; c < totalCols; c++) {
            const cell = row.getCell(c + 1);
            if (aoa2[r] && aoa2[r][c] !== null && aoa2[r][c] !== undefined) {
               const val = aoa2[r][c].v;
               const f = aoa2[r][c].f;
               if (f) {
                 cell.value = { formula: f };
               } else {
                 if (val !== undefined && val !== null) cell.value = val;
               }
               
               // Translate style
               const s = aoa2[r][c].s;
               if (s) {
                 if (s.font) {
                    cell.font = {
                       bold: s.font.bold,
                       italic: s.font.italic,
                       size: s.font.sz,
                       name: 'Times New Roman'
                    };
                 }
                 if (s.alignment) {
                    cell.alignment = {
                       horizontal: s.alignment.horizontal,
                       vertical: s.alignment.vertical === 'center' ? 'middle' : s.alignment.vertical,
                       wrapText: s.alignment.wrapText
                    };
                 }
                 if (s.border) {
                    const borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
                    const cellBorder = {};
                    if (s.border.top) cellBorder.top = borderStyle;
                    if (s.border.bottom) cellBorder.bottom = borderStyle;
                    if (s.border.left) cellBorder.left = borderStyle;
                    if (s.border.right) cellBorder.right = borderStyle;
                    if (Object.keys(cellBorder).length > 0) cell.border = cellBorder;
                 }
                 if (s.fill && s.fill.fgColor && s.fill.fgColor.rgb) {
                    cell.fill = {
                       type: 'pattern',
                       pattern: 'solid',
                       fgColor: { argb: 'FF' + s.fill.fgColor.rgb }
                    };
                 }
               }
            }
         }
      }

const merges = [];
      [0, 1, 2].forEach(r => {
        if (predikatCol > 1) merges.push({ s: { r, c: 0 }, e: { r, c: predikatCol } })
      });
      [4, 5, 6, 7, 8].forEach(r => {
        if (predikatCol > 2) merges.push({ s: { r, c: 2 }, e: { r, c: predikatCol } })
      });
      
      // Merge Bab titles across their components horizontally
      babList.forEach(bab => {
        const komp = babKomponenMap[bab] || []
        const start = babColStart[bab]
        const end = start + komp.length + (isSumatif(bab) ? 0 : 1)
        if (end > start) merges.push({ s: { r: 10, c: start }, e: { r: 10, c: end } })
        
        // Merge Nilai Akhir BAB & Keterangan vertically from row 11 to 12
        if (!isSumatif(bab)) {
          const rataCol = start + komp.length;
          const ketCol = start + komp.length + 1;
          merges.push({ s: { r: 11, c: rataCol }, e: { r: 12, c: rataCol } });
          merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } });
        } else {
          const ketCol = start + komp.length;
          merges.push({ s: { r: 11, c: ketCol }, e: { r: 12, c: ketCol } });
        }
      });

      // Merge No, NISN, Nama vertically
      [0, 1, 2].forEach(c => merges.push({ s: { r: 10, c }, e: { r: 12, c } }));
      // Merge End Columns vertically
      [nilaiAkhirCol, predikatCol].forEach(c => {
        merges.push({ s: { r: 10, c }, e: { r: 12, c } })
      });

      // Lingkup Materi vertical merges
      babList.forEach((bab, bi) => {
         const startLCol = lingkupStartCol + bi * 2
         const komp = babKomponenMap[bab] || []
         komp.forEach((k, ki) => {
            const rowStart = 13 + (ki * 4)
            merges.push({ s: { r: rowStart, c: startLCol }, e: { r: rowStart + 3, c: startLCol } })
            merges.push({ s: { r: rowStart, c: startLCol + 1 }, e: { r: rowStart + 3, c: startLCol + 1 } })
         })
      });

      // Translate merges

      for (const m of merges) {
         ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
      }

const colWidths = Array(totalCols).fill({ wch: 10 })
      for (let c = 0; c < totalCols; c++) {
        let maxLen = 5
        for (let r = 0; r < totalRows; r++) {
          if (aoa2[r] && aoa2[r][c] && aoa2[r][c].v !== undefined && aoa2[r][c].v !== null) {
             // Ignore title rows for column width calculation (since they are merged and long)
             if (c === 0 && r < 4) continue; 
             // Ignore Bab group headers in row 10
             if (r === 10 && c > 2 && c < nilaiAkhirCol) continue;
             // Ignore Lingkup Materi Headers that span columns
             if (c >= lingkupStartCol && r >= 10 && r <= 12) continue;
             
             let valStr = String(aoa2[r][c].v)
             // Handle newline characters if any
             let lines = valStr.split('\n')
             for (let line of lines) {
               if (line.length > maxLen) maxLen = line.length
             }
          }
        }
        
        // Apply Caps and Padding
        if (c === 0) maxLen = 3.71 // No
        else if (c === 1) maxLen = 16.29 // NISN
        else if (c === 2) maxLen = Math.min(Math.max(maxLen + 2, 15), 35) // Nama Siswa
        else if (c >= lingkupStartCol) {
           // Lingkup Materi section
           const isDesc = (c - lingkupStartCol) % 2 !== 0
           if (isDesc) maxLen = 60 // Deskripsi always 60 to wrap nicely
           else maxLen = 15 // TP Name always 15
        }
        else {
           // TP columns, Rata-rata, Keterangan
           maxLen = Math.min(Math.max(maxLen + 2, 8), 35) // Cap at 35 to force wrap
        }

        colWidths[c] = { wch: maxLen }
      }

      // Translate col widths

      for (let c = 0; c < colWidths.length; c++) {
         if (colWidths[c]) {
            ws.getColumn(c + 1).width = colWidths[c].wch;
         }
      }

      // Apply row heights (Title rows)
      ws.getRow(1).height = 34.5;
      ws.getRow(2).height = 34.5;
      ws.getRow(3).height = 34.5;
      
      // Apply row heights (Lingkup Materi)
      babList.forEach((bab, bi) => {
        const komp = babKomponenMap[bab] || []
        komp.forEach((k, ki) => {
           const rowStart = 13 + (ki * 4)
           const descLen = (k.deskripsi || '').length
           const lines = Math.ceil(descLen / 60)
           if (lines > 4) {
              const extraLines = lines - 4
              const hpt = 15 + Math.ceil((extraLines * 15) / 4)
              ws.getRow(rowStart).height = hpt
              ws.getRow(rowStart+1).height = hpt
              ws.getRow(rowStart+2).height = hpt
              ws.getRow(rowStart+3).height = hpt
           }
        })
      })

      // Custom BAB Colors
      const babHexColors = ['FFEEF2FF', 'FFECFDF5', 'FFFFFBEB', 'FFFAF5FF', 'FFFFF1F2', 'FFECFEFF'];
      babList.forEach((bab, bi) => {
         const start = babColStart[bab];
         const komp = babKomponenMap[bab] || [];
         const end = start + komp.length + (isSumatif(bab) ? 0 : 1); 
         const color = babHexColors[bi % babHexColors.length];
         
         // Apply to headers (Row 11 and Row 12)
         for (let r = 10; r <= 11; r++) {
            for (let c = start; c <= end; c++) {
               const cell = ws.getRow(r + 1).getCell(c + 1);
               // Ensure there is a border on these headers
               cell.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
         }

         // Apply color to Bobot row (Row 13 / idx 12) only for cells that have values
         for (let c = start; c <= end; c++) {
            const cell = ws.getRow(13).getCell(c + 1);
            if (aoa2[12] && aoa2[12][c] && aoa2[12][c].v !== undefined && aoa2[12][c].v !== null && aoa2[12][c].v !== '') {
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
         }
      });
      
      // Apply Student Row Colors (Odd/Even)
      classStudents.forEach((s, idx) => {
         const r = 13 + idx;
         // Visual Ganjil (idx 0, 2, 4) = Putih, Visual Genap (idx 1, 3, 5) = Biru muda FFF0F9FF
         const isGanjilVisual = (idx % 2 === 0);
         const rowColor = isGanjilVisual ? 'FFFFFFFF' : 'FFF0F9FF';
         for(let c = 0; c < totalCols; c++) {
            // Only color up to Predikat col, ignore Lingkup on the right for now
            if (c > predikatCol) break; 
            
            const cell = ws.getRow(r + 1).getCell(c + 1);
            if (aoa2[r] && aoa2[r][c] && aoa2[r][c].s && aoa2[r][c].s.border) {
               cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowColor } };
            }
         }
      });

            // Worksheet Protection
      await ws.protect(session?.id?.substring(0, 8) || 'sklbm123', {
         selectLockedCells: true,
         selectUnlockedCells: true,
         formatCells: false,
         formatColumns: false,
         formatRows: false,
      });

      // Unlock TP and N. Karakter input cells, and apply Conditional Formatting
      for(let r = 13; r < totalRows; r++) {
         const excelRow = r + 1;
         babList.forEach(bab => {
            const start = babColStart[bab];
            const komp = babKomponenMap[bab] || [];
            komp.forEach((k, ki) => {
               const cell = ws.getRow(excelRow).getCell(start + ki + 1);
               cell.protection = { locked: false };
               
               // Conditional Formatting for TP cells
               ws.addConditionalFormatting({
                  ref: cell.address,
                  rules: [
                     {
                        type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}<${kkm})`],
                        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                     },
                     {
                        type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}>=${kkm})`],
                        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                     }
                  ]
               });
            });
            
            // Conditional formatting for Rata-rata BAB
            const rataCell = ws.getRow(excelRow).getCell(start + komp.length + 1);
            ws.addConditionalFormatting({
               ref: rataCell.address,
               rules: [
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}<${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                  },
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${rataCell.address}), ${rataCell.address}>=${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                  }
               ]
            });
         });
         
         // Conditional formatting for Nilai Akhir
         const nilaiAkhirColCell = ws.getRow(excelRow).getCell(nilaiAkhirCol + 1);
         [nilaiAkhirColCell].forEach(cell => {
            ws.addConditionalFormatting({
               ref: cell.address,
               rules: [
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}<${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } }
                  },
                  {
                     type: 'expression', formulae: [`AND(ISNUMBER(${cell.address}), ${cell.address}>=${kkm})`],
                     style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } }
                  }
               ]
            });
         });
      }

      
  }

  const handleDownloadExcel = async () => {
    try {
      if (selectedExportClasses.length === 0) return;
      setIsExporting(true)
      setShowExportModal(false)
      
      const sem = semesters.find(s => s.id === selectedSemesterId)
      const mapelNama = uniqueMapels.find(m => m.id === selectedMapelId)?.nama || 'Mapel'
      const sekolah = 'SMP BUDI MULIA'
      const tahunAjaran = activeTa?.nama || ''
      
      const wb = new ExcelJS.Workbook();
      wb.creator = session?.user?.user_metadata?.full_name || 'Guru';
      wb.created = new Date();

      for (const kelas of selectedExportClasses) {
        // Fetch specific class data
        const { data: studentsData } = await supabase.from('siswa_lengkap').select('nisn, nama_lengkap, kelas').eq('kelas', kelas).eq('tahun_ajaran_id', activeTa.id).order('nama_lengkap', { ascending: true })
        const classStudents = studentsData || []
        
        const classKomp = komponen.filter(k => 
          k.semester_id === selectedSemesterId && 
          (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.includes(kelas))
        )
        
        let classNilaiData = {}
        const kompIds = classKomp.map(k => k.id)
        const nisnList = classStudents.map(s => String(s.nisn))
        if (kompIds.length > 0 && nisnList.length > 0) {
           const { data: nData } = await supabase.from('nilai_siswa').select('*').in('komponen_id', kompIds).in('siswa_nisn', nisnList)
           if (nData) {
              nData.forEach(n => {
                 if (!classNilaiData[n.komponen_id]) classNilaiData[n.komponen_id] = {}
                 classNilaiData[n.komponen_id][n.siswa_nisn] = n.nilai
              })
           }
        }
        
        
        // Fetch config akhir specific to this class
        let classConfigAkhir = { metode_hitung: 'rata_rata', bobot_detail: {}, is_visible: true };
        const { data: configData } = await supabase.from('nilai_akhir_config')
          .select('*')
          .eq('guru_id', session.id)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester_id', selectedSemesterId)
          .eq('mata_pelajaran_id', selectedMapelId)
          .eq('kelas', kelas)
          .maybeSingle();
        if (configData) {
           classConfigAkhir = { metode_hitung: configData.metode_hitung || 'rata_rata', bobot_detail: configData.bobot_detail || {}, is_visible: configData.is_visible ?? true };
        }
        
        await generateClassSheet(kelas, classStudents, classKomp, classNilaiData, classConfigAkhir, wb);
      }

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const clsName = selectedExportClasses.length > 1 ? 'MultiKelas' : selectedExportClasses[0];
      a.download = `Nilai_${mapelNama}_${clsName}_Sem${sem?.nomor || '-'}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)

      

      setIsExporting(false)
    } catch (err) {
      console.error(err);
      setIsExporting(false)
    }
  }

  // ─── Import Excel ─────────────────────────────────────────────────────────
  const handleUploadExcel = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploadResult(null); setUploadProgress({ status: 'reading' })
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      
      let success = 0, failed = 0, skipped = 0
      const upserts = []

      // If it's a single sheet (old format) or the sheet name doesn't match our classes, we process it against activeTabKelas.
      // We will loop through all sheets.
      for (const sheetName of wb.SheetNames) {
          let kelas = activeTabKelas;
          // Try to guess class from sheetName (e.g. "Nilai 8A Sem1")
          const matchedClass = targetKelasList.find(c => sheetName.includes(c));
          if (matchedClass) {
              kelas = matchedClass;
          }
          
          const ws = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!raw || raw.length < 2) continue;

          let headerIdx = -1;
          for (let i = 0; i < raw.length; i++) {
            const row = raw[i];
            if (row && row.some(cell => String(cell).trim().toUpperCase() === 'NISN')) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx === -1) continue;

          let tpRowIdx = headerIdx;
          let maxMatchCount = 0;
          
          // Use sheet specific components
          const sheetKomp = komponen.filter(k => k.semester_id === selectedSemesterId && (!k.target_kelas || k.target_kelas.length === 0 || k.target_kelas.some(c => kelas && c.replace(/\D/g, '') === kelas.replace(/\D/g, ''))));

          for (let i = headerIdx; i <= Math.min(headerIdx + 5, raw.length - 1); i++) {
            const row = raw[i];
            if (!row) continue;
            let matchCount = 0;
            sheetKomp.forEach(k => {
              if (row.some(cell => String(cell).trim() === k.nama)) matchCount++;
            });
            if (matchCount > maxMatchCount) {
              maxMatchCount = matchCount;
              tpRowIdx = i;
            }
          }
          
          const tpRow = raw[tpRowIdx].map(h => String(h).trim())
          const nisnIdx = raw[headerIdx].findIndex(h => String(h).trim().toUpperCase() === 'NISN')
          
          let actualDataStart = tpRowIdx + 1;
          for(let i = tpRowIdx + 1; i < raw.length; i++) {
              if (raw[i] && String(raw[i][nisnIdx]).trim() !== '' && !isNaN(Number(raw[i][0]))) {
                  actualDataStart = i;
                  break;
              }
          }

          const babRowIdx = tpRowIdx - 1;
          const babRow = babRowIdx >= 0 ? raw[babRowIdx].map(h => String(h).trim()) : [];
          const komponenCols = [];
          let currentBab = null;
          for (let c = 0; c < tpRow.length; c++) {
             const babVal = babRow[c];
             if (babVal && babVal !== '') {
                const matchedBab = sheetKomp.find(k => babVal.includes(k.bab_nama));
                if (matchedBab) currentBab = matchedBab.bab_nama;
             }
             const tpName = tpRow[c];
             if (tpName && currentBab) {
                const k = sheetKomp.find(x => x.bab_nama === currentBab && x.nama === tpName);
                if (k) {
                   komponenCols.push({ colIdx: c, komponen: k });
                }
             }
          }

          if (komponenCols.length === 0) continue;

          // Fetch students for this sheet's class
          const { data: sheetStudentsData } = await supabase.from('siswa_lengkap').select('nisn').eq('kelas', kelas).eq('tahun_ajaran_id', activeTa.id);
          const sheetStudents = sheetStudentsData || [];
          const sMap = Object.fromEntries(sheetStudents.map(s => [String(s.nisn).trim(), true]));
          
          const nisnKeys = Object.keys(sMap);
          const kompIds = sheetKomp.map(k => k.id);
          
          let existingDataMap = {};
          if (nisnKeys.length > 0 && kompIds.length > 0) {
             const { data: existingData } = await supabase.from('nilai_siswa').select('komponen_id, siswa_nisn, nilai').in('komponen_id', kompIds).in('siswa_nisn', nisnKeys);
             if (existingData) {
                existingData.forEach(ed => {
                   existingDataMap[`${ed.komponen_id}_${ed.siswa_nisn}`] = ed.nilai;
                });
             }
          }

          for (let i = actualDataStart; i < raw.length; i++) {
            const row = raw[i]; const nisn = String(row[nisnIdx]||'').trim()
            if (!nisn) continue
            if (!sMap[nisn]) { skipped++; continue }
            komponenCols.forEach(({ komponen: k, colIdx }) => {
              const rawVal = row[colIdx]; const val = rawVal === '' ? null : Number(rawVal)
              if (rawVal !== '' && isNaN(val)) { failed++; return }
              
              const key = `${k.id}_${nisn}`;
              const existingVal = existingDataMap[key] !== undefined ? existingDataMap[key] : null;
              
              // Only push if the value has actually changed
              if (val !== existingVal) {
                 upserts.push({ komponen_id: k.id, siswa_nisn: nisn, nilai: val, diinput_oleh: session.id, updated_at: new Date().toISOString() })
              }
            })
          }
      }


      // Deduplicate upserts to prevent PostgreSQL 500 error on ON CONFLICT DO UPDATE
      const uniqueUpsertsMap = {};
      for (const u of upserts) {
          uniqueUpsertsMap[`${u.komponen_id}_${u.siswa_nisn}`] = u;
      }
      const finalUpserts = Object.values(uniqueUpsertsMap);

      if (finalUpserts.length === 0 && failed === 0 && skipped > 0 && false) { 
          // Kept false just in case skipped logic causes weirdness, but we handle it generally below
      } 
      
      if (finalUpserts.length === 0) {
          setUploadResult({ error: 'Data sama persis dengan sistem. Tidak ada perubahan baru yang perlu disimpan.' });
          setUploadProgress(null);
          return;
      }

      setUploadProgress({ status: 'saving', total: finalUpserts.length })
      for (let i = 0; i < finalUpserts.length; i += 100) {
        const chunk = finalUpserts.slice(i, i + 100)
        const { error } = await supabase.from('nilai_siswa').upsert(chunk, { onConflict: 'komponen_id,siswa_nisn' })
        if (error) throw error
        setUploadProgress(p => ({ ...p, current: Math.min(i + 100, finalUpserts.length) }))
      }

      const filledCount = finalUpserts.filter(u => u.nilai !== null).length;
      setUploadResult({ success: finalUpserts.length, filled: filledCount, failed, skipped }); fetchNilai()
    } catch (err) { setUploadResult({ error: err.message }) }
    setUploadProgress(null)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const handleClearTP = async (e, k) => {
    e.stopPropagation();
    const confirmed = await requestConfirm({
      title: `Kosongkan nilai ${k.nama}?`,
      message: `Apakah Anda yakin ingin menghapus SEMUA nilai siswa untuk ${k.nama} pada kelas ${activeTabKelas}? Aksi ini tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Kosongkan',
      confirmColor: 'red',
      icon: 'danger'
    });
    if (!confirmed) return;
    
    try {
      const nisnList = students.map(s => String(s.nisn).trim());
      if (nisnList.length === 0) return;
      const { error } = await supabase.from('nilai_siswa').delete().eq('komponen_id', k.id).in('siswa_nisn', nisnList);
      if (error) throw error;
      fetchNilai();
    } catch (err) {
      alert("Gagal mengosongkan nilai: " + err.message);
    }
  }

  const handleClearBab = async (e, babName) => {
    e.stopPropagation();
    const confirmed = await requestConfirm({
      title: `Kosongkan nilai Bab ${babName}?`,
      message: `Apakah Anda yakin ingin menghapus SEMUA nilai siswa untuk Bab ini pada kelas ${activeTabKelas}? Aksi ini tidak dapat dibatalkan.`,
      confirmLabel: 'Ya, Kosongkan',
      confirmColor: 'red',
      icon: 'danger'
    });
    if (!confirmed) return;

    try {
      const kompIds = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === babName).map(k => k.id);
      if (kompIds.length === 0) return;
      const nisnList = students.map(s => String(s.nisn).trim());
      if (nisnList.length === 0) return;
      const { error } = await supabase.from('nilai_siswa').delete().in('komponen_id', kompIds).in('siswa_nisn', nisnList);
      if (error) throw error;
      fetchNilai();
    } catch (err) {
      alert("Gagal mengosongkan nilai BAB: " + err.message);
    }
  }

  const selectedMapelNama = uniqueMapels.find(m => m.id === selectedMapelId)?.nama || ''
  const selectedSemesterObj = semesters.find(s => s.id === selectedSemesterId)
  const contextReady = selectedMapelId && selectedSemesterId
  const hasKomponen = classKomponen.length > 0


  return (
    <div className="animate-slide-up flex flex-col h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-8rem)]">
      {/* Modal Config Akhir */}
      {showConfigAkhirModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800">Pengaturan Nilai Akhir</h3>
              <button onClick={() => setShowConfigAkhirModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-4 bg-slate-50/50 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Metode Perhitungan</label>
                <div className="flex bg-slate-200/50 p-1 rounded-xl">
                  <button
                    onClick={() => setConfigAkhir({...configAkhir, metode_hitung: 'rata_rata'})}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${configAkhir.metode_hitung === 'rata_rata' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Rata-rata
                  </button>
                  <button
                    onClick={() => setConfigAkhir({...configAkhir, metode_hitung: 'bobot_manual'})}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${configAkhir.metode_hitung === 'bobot_manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Bobot Manual
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {configAkhir.metode_hitung === 'rata_rata' ? 'Nilai akhir adalah rata-rata dari semua BAB, PSTS, dan PSAS.' : 'Tentukan persentase bobot masing-masing BAB, PSTS, dan PSAS (Total harus 100%).'}
                </p>
              </div>

              {configAkhir.metode_hitung === 'bobot_manual' && (
                <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-100">
                  {uniqueBabsClass.map((bab) => (
                    <div key={bab} className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">{bab}</span>
                      <div className="relative w-24">
                        <input 
                          type="number" min="0" max="100" 
                          className="w-full pl-3 pr-8 py-1.5 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 text-right"
                          value={configAkhir.bobot_detail[bab] || ''}
                          onChange={(e) => setConfigAkhir({
                            ...configAkhir,
                            bobot_detail: { ...configAkhir.bobot_detail, [bab]: e.target.value }
                          })}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                      </div>
                    </div>
                  ))}
                  
                  {(() => {
                    const sum = Object.values(configAkhir.bobot_detail).reduce((a, b) => a + Number(b || 0), 0)
                    return (
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 mt-3">
                        <span className="text-sm font-bold text-slate-700">Total Bobot</span>
                        <span className={`text-sm font-bold ${sum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{sum}%</span>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
              <button onClick={() => setShowConfigAkhirModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors">Batal</button>
              <button onClick={() => handleSaveConfigAkhir(configAkhir)} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm shadow-indigo-600/20 flex items-center gap-2">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Export */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Export Nilai Excel</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-4 bg-slate-50/50">
              <p className="text-sm text-slate-600 mb-3">Pilih kelas yang ingin diexport:</p>
              
              <div className="flex items-center justify-between mb-2">
                <button 
                  onClick={() => setSelectedExportClasses(targetKelasList)}
                  className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
                >Pilih Semua</button>
                <button 
                  onClick={() => setSelectedExportClasses([])}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >Kosongkan</button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {targetKelasList.map(kelas => (
                  <label key={kelas} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={selectedExportClasses.includes(kelas)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedExportClasses(prev => [...prev, kelas])
                        else setSelectedExportClasses(prev => prev.filter(c => c !== kelas))
                      }}
                    />
                    <span className="text-sm font-medium text-slate-700">{kelas}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
              <button 
                onClick={handleDownloadExcel} 
                disabled={selectedExportClasses.length === 0 || isExporting}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2"
              >
                {isExporting ? 'Mengekspor...' : 'Download Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {ConfirmModalComponent}
      <input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadExcel} />
      
      {/* Header */}
      <div className="mb-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Input Nilai Guru</h2>
          <p className="text-slate-500 text-sm mt-1">Sistem Input Nilai Berbasis Target Kelas</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
          {uniqueMapels.length > 1 ? (
            <select value={selectedMapelId} onChange={e => setSelectedMapelId(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none bg-slate-50">
              <option value="">-- Pilih Mapel --</option>
              {uniqueMapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
            </select>
          ) : (
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg text-sm border border-indigo-100">{selectedMapelNama}</span>
          )}
          
          <div className="w-px h-6 bg-slate-200"></div>
          
          <select value={selectedSemesterId} onChange={e => setSelectedSemesterId(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none bg-slate-50" disabled={semesters.length === 0}>
            {semesters.map(s => (
              <option key={s.id} value={s.id}>Semester {s.nomor}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* MAIN VIEW */}
      <div className="flex flex-col gap-4 flex-1 min-h-[500px] xl:min-h-0 animate-fade-in">
        {/* Action Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 w-full overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center gap-3 w-full xl:w-auto overflow-hidden">
            {targetKelasList.length === 0 ? (
              <div className="text-sm font-bold text-slate-400 italic">Belum ada kelas target</div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 md:pb-0 w-full md:w-auto">
                {targetKelasList.map(c => {
                  const isActive = activeTabKelas === c
                  return (
                    <button key={c} onClick={() => setActiveTabKelas(c)} 
                      className={`px-4 py-2 rounded-lg font-bold text-[12px] transition-all whitespace-nowrap border shrink-0 ${
                        isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300 hover:bg-white hover:text-indigo-600'
                      }`}>
                      Kelas {c}
                    </button>
                  )
                })}
              </div>
            )}
            
            <div className="w-px h-6 bg-slate-200 mx-1 hidden md:block shrink-0"></div>
            
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button onClick={() => setShowConfigAkhirModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold rounded-xl transition-colors shadow-sm"
                title="Pengaturan Bobot Nilai Akhir">
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Bobot Akhir
              </button>
              <button onClick={() => setShowKelolaSemester(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold rounded-xl transition-colors shadow-sm">
                <IconPencil /> Kelola Semester
              </button>
              <button onClick={() => {
                setNewBabTargetKelas(activeTabKelas ? [activeTabKelas] : [])
                setShowAddBab(true)
              }}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition-colors shadow-sm">
                <IconPlus /> Buat BAB
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 flex-wrap border-t xl:border-t-0 border-slate-100 pt-3 xl:pt-0 w-full xl:w-auto justify-start xl:justify-end">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase">KKM:</span>
              <input 
                type="number" 
                value={kkm} 
                onChange={(e) => setKkm(e.target.value)}
                className="w-14 px-2 py-1 text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded-lg outline-none focus:border-indigo-500"
              />
            </div>
            <button onClick={() => { setSelectedExportClasses([activeTabKelas]); setShowExportModal(true); }} disabled={isExporting || targetKelasList.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50">
              {isExporting ? <><div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/> Mengekspor...</> : <><IconDownload /> Export</>}
            </button>
            <button onClick={() => uploadRef.current?.click()} disabled={targetKelasList.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50">
              <IconUpload /> Upload
            </button>
          </div>
        </div>
        
        {/* Upload Progress/Result Messages */}
        {uploadProgress && (
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-semibold text-indigo-700 shadow-sm shrink-0">
            <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
            {uploadProgress === 'reading' ? 'Membaca file...' : `Menyimpan ${0 || 0}/${0}...`}
          </div>
        )}
        
                {uploadResult && (
          <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-bold shadow-sm shrink-0 ${uploadResult.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            <div className="flex items-center gap-2">
              {uploadResult.error ? '⚠️' : '✅'}
              {uploadResult.error ? uploadResult.error : `Sinkronisasi selesai! ${uploadResult.success} sel data berhasil diperbarui (termasuk sel kosong). | Gagal: ${uploadResult.failed} | Dilewati: ${uploadResult.skipped}`}
            </div>
            <button onClick={() => setUploadResult(null)} className="p-1 rounded-md hover:bg-black/5"><IconClose /></button>
          </div>
        )}
        
        {/* Tabel Nilai */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px] xl:min-h-0 relative">
          {!selectedMapelId || !selectedSemesterId ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
              <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
                <IconEye on={false} />
              </div>
              <h3 className="font-bold text-slate-700 text-lg">Pilih Mapel dan Semester</h3>
              <p className="text-slate-500 text-sm mt-1 mb-5">Anda perlu mengatur konteks terlebih dahulu.</p>
            </div>
          ) : targetKelasList.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
              <div className="w-16 h-16 bg-indigo-50 border-2 border-indigo-200 rounded-full flex items-center justify-center mb-4 text-indigo-500 shadow-sm">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <h3 className="font-bold text-slate-800 text-xl mb-1">Mulai Kelola Nilai</h3>
              <p className="text-slate-500 text-sm max-w-md text-center mb-6">Pilih kelas yang Anda ajar untuk mata pelajaran ini, lalu buat BAB pertama.</p>
              <button onClick={() => setShowAddBab(true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2">
                <IconPlus /> Tentukan Target Kelas & Buat BAB
              </button>
            </div>
          ) : !activeTabKelas ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20 text-slate-400">Pilih Tab Kelas</div>
          ) : !hasKomponen ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
              <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
                <IconPlus />
              </div>
              <h3 className="font-bold text-slate-700 text-lg">Belum ada materi bab di Kelas {activeTabKelas}</h3>
              <p className="text-slate-500 text-sm mt-1 mb-5">Silakan tambahkan bab untuk semester ini.</p>
              <button onClick={() => {
                setNewBabTargetKelas([activeTabKelas])
                setShowAddBab(true)
              }} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 text-sm">
                Buat BAB Baru
              </button>
            </div>
          ) : students.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-20 text-slate-400">Memuat siswa...</div>
          ) : (
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-max text-xs whitespace-nowrap">
                <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-xs uppercase tracking-wider font-extrabold">
                    <th className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top" rowSpan={2} style={{ position: "sticky", top: 0, left: 0, zIndex: 20, minWidth: 40, maxWidth: 40 }}>
                      <div className="pt-4 flex items-start justify-center h-full">No</div>
                    </th>
                    <th className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top mobile-nama-col" rowSpan={2} style={{ position: "sticky", top: 0, left: 40, zIndex: 20, minWidth: maxNamaWidth, maxWidth: maxNamaWidth }}>
                      <div className="pt-4 flex items-start justify-center h-full">Nama Siswa</div>
                    </th>
                    <th className="border-r border-slate-200 bg-indigo-50 text-indigo-700 p-0 align-top mobile-unsticky" rowSpan={2} style={{ position: "sticky", top: 0, left: 40 + maxNamaWidth, zIndex: 20, minWidth: 90, maxWidth: 90 }}>
                      <div className="pt-4 flex items-start justify-center h-full">NISN</div>
                    </th>
                    {uniqueBabsClass.map((bab, bIdx) => {
                      const babCount = classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).length
                      return (
                        <th key={bab} colSpan={babCount} 
                          onClick={() => {
                              setEditBabName(bab)
                              setSelectedBabToManage(bab)
                          }}
                          className={`text-center px-3 py-2 border-r border-slate-200 cursor-pointer transition-colors whitespace-normal break-words ${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]} ${BAB_HOVER[bIdx % BAB_HOVER.length]}`}
                          title="Klik untuk kelola BAB (Ubah nama, Metode Hitung, Tambah TP)">
                          <div className="flex items-center justify-center gap-1.5">
                            {bab}
                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            <button onClick={(e) => handleClearBab(e, bab)} className="p-0.5 ml-1 text-slate-400 hover:text-rose-500 hover:bg-rose-100 rounded transition-colors" title="Kosongkan semua nilai di Bab ini">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </th>
                      )
                    })}
                    <th className={`px-3 py-2 min-w-[120px] bg-indigo-50 border-l border-indigo-200 text-center text-indigo-800 align-middle ${configAkhir.is_visible === false ? 'opacity-50' : ''}`} rowSpan={2}>
                      <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                        <div className="flex items-center justify-center gap-1.5 w-full">
                          <div className="font-extrabold leading-snug">Nilai Akhir</div>
                          <button onClick={(e) => { 
                             e.stopPropagation(); 
                             handleSaveConfigAkhir({...configAkhir, is_visible: configAkhir.is_visible === false ? true : false}) 
                          }} className={`p-0.5 rounded transition-colors ${configAkhir.is_visible !== false ? 'text-indigo-400 hover:text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`} title={configAkhir.is_visible !== false ? 'Sembunyikan dari siswa' : 'Tampilkan ke siswa'}>
                            <IconEye on={configAkhir.is_visible !== false} />
                          </button>
                        </div>
                        <div className="relative w-full">
                          <select 
                            className="w-full bg-white/70 border border-indigo-200 text-indigo-800 font-black uppercase text-[10px] tracking-wider rounded-lg px-2 py-1.5 outline-none cursor-pointer appearance-none text-center hover:bg-white transition-colors"
                            value={configAkhir.metode_hitung}
                            onChange={async (e) => {
                              const newVal = e.target.value;
                              if (newVal === 'bobot_manual') {
                                 const sum = Object.values(configAkhir.bobot_detail || {}).reduce((a, b) => a + Number(b), 0);
                                 if (Math.abs(sum - 100) < 0.01) {
                                    const newConfig = { ...configAkhir, metode_hitung: 'bobot_manual' };
                                    await handleSaveConfigAkhir(newConfig);
                                 } else {
                                    setConfigAkhir({ ...configAkhir, metode_hitung: 'bobot_manual' });
                                    setShowConfigAkhirModal(true);
                                 }
                              } else {
                                 const newConfig = { ...configAkhir, metode_hitung: newVal };
                                 await handleSaveConfigAkhir(newConfig);
                              }
                            }}
                          >
                            <option value="rata_rata">RATA-RATA</option>
                            <option value="bobot_manual">BOBOT MANUAL</option>
                          </select>
                          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </div>
                      </div>
                    </th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-600 text-xs">
                    {uniqueBabsClass.flatMap((bab, bIdx) => {
                      return classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort((a,b) => {
                      if (a.nama.toUpperCase() === 'N. KARAKTER') return 1;
                      if (b.nama.toUpperCase() === 'N. KARAKTER') return -1;
                      return a.urutan - b.urutan;
                    }).map(k => (
                        <th key={k.id} 
                          className={`text-center px-2 py-2 w-28 min-w-[110px] max-w-[130px] whitespace-normal break-words border-r border-slate-200 font-bold align-top ${!k.is_nilai_visible ? 'opacity-50' : ''} cursor-pointer transition-colors ${BAB_BG[bIdx % BAB_BG.length]} ${BAB_TEXT[bIdx % BAB_TEXT.length]} ${BAB_HOVER[bIdx % BAB_HOVER.length]}`} 
                          title={k.deskripsi ? "Klik untuk kelola TP" : "Deskripsi belum diisi! Klik untuk mengisi."}
                          onClick={(e) => {
                              if(e.target.closest('button')) return;
                              setEditTpData({ nama: k.nama, deskripsi: k.deskripsi || '', bobot: k.bobot, target_kelas: k.target_kelas || [] })
                              setSelectedTpToManage(k.id)
                          }}
                        >
                          <div className="flex items-center justify-center gap-1.5 h-full">
                            {!k.deskripsi && <span className="text-rose-500 font-bold bg-rose-100 w-4 h-4 rounded-full flex items-center justify-center text-[10px]" title="Deskripsi kosong!">!</span>}
                            <div className="font-extrabold leading-snug">{k.nama}</div>
                            <button onClick={(e) => { e.stopPropagation(); handleToggleVisible(k) }} className={`p-0.5 rounded transition-colors ${k.is_nilai_visible ? 'opacity-70 hover:opacity-100' : 'opacity-40 hover:opacity-100'}`} title={k.is_nilai_visible ? 'Sembunyikan dari siswa' : 'Tampilkan ke siswa'}>
                              <IconEye on={k.is_nilai_visible} />
                            </button>
                            <button onClick={(e) => handleClearTP(e, k)} className="p-0.5 rounded transition-colors opacity-40 hover:opacity-100 hover:text-rose-500 hover:bg-rose-100" title="Kosongkan semua nilai di TP ini">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </th>
                      ))
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s, idx) => {
                    const rataRata = hitungRataRata(s.nisn)
                    const rataColor = rataRata === null ? 'text-slate-300' : Number(rataRata) >= kkm ? 'text-emerald-700' : 'text-rose-600'
                    const orderedKomponen = uniqueBabsClass.flatMap(bab => classKomponen.filter(k => (k.bab_nama || 'Lainnya') === bab).sort((a,b) => {
                      if (a.nama.toUpperCase() === 'N. KARAKTER') return 1;
                      if (b.nama.toUpperCase() === 'N. KARAKTER') return -1;
                      return a.urutan - b.urutan;
                    }))
                    
                    return (
                      <tr key={s.nisn} className={`hover:bg-slate-200 transition-colors group ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"}`}>
                        <td className={`text-center px-2 py-2.5 text-slate-400 border-r border-slate-100 font-medium ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 0, zIndex: 10, minWidth: 40, maxWidth: 40 }}>{idx + 1}</td>
                        <td className={`px-4 py-2.5 font-bold text-slate-800 text-[14px] leading-none border-r border-slate-100 mobile-nama-col ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 40, zIndex: 10, minWidth: maxNamaWidth, maxWidth: maxNamaWidth }}>
                          <div className="truncate w-full h-full" title={s.nama_lengkap}>{s.nama_lengkap}</div>
                        </td>
                        <td className={`px-3 py-2.5 text-slate-500 font-mono text-[13px] leading-none border-r border-slate-100 mobile-unsticky ${idx % 2 === 1 ? "bg-sky-50" : "bg-white"} group-hover:bg-slate-200 transition-colors`} style={{ position: "sticky", left: 40 + maxNamaWidth, zIndex: 10, minWidth: 90, maxWidth: 90 }}>{s.nisn}</td>
                        {orderedKomponen.map(k => {
                          const cellKey = `${k.id}-${s.nisn}`
                          const val = nilaiData[k.id]?.[s.nisn]
                          const isSaving = savingCell === cellKey
                          
                          const valColor = val === undefined || val === null || val === '' 
                            ? 'text-slate-800' 
                            : Number(val) >= kkm 
                              ? 'text-emerald-600' 
                              : 'text-rose-600';
                          
                          return (
                            <td key={k.id} className="text-center px-2 py-1.5 border-r border-slate-100">
                              <div className="relative flex justify-center">
                                <input
                                  type="number"
                                  min="0" max="100" step="1"
                                  defaultValue={val !== undefined && val !== null ? val : ''}
                                  key={`${cellKey}-${val}`}
                                  onBlur={e => {
                                    const newVal = e.target.value
                                    const oldVal = val !== undefined && val !== null ? String(val) : ''
                                    if (newVal !== oldVal) handleNilaiChange(k.id, s.nisn, newVal)
                                  }}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                                  className={`w-16 sm:w-20 mx-auto text-center text-sm font-black px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 hover:border-indigo-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all ${valColor}`}
                                  placeholder="—"
                                />
                                {isSaving && (
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-sm"/>
                                )}
                              </div>
                            </td>
                          )
                        })}
                        <td className={`text-center px-4 py-2.5 font-black text-sm border-l border-indigo-100 bg-indigo-50/30 ${rataColor} ${configAkhir.is_visible === false ? 'opacity-50' : ''}`}>
                          {rataRata !== null ? rataRata : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {/* MODALS */}
      
      {showAddBab && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col md:flex-row max-h-[90vh]">
            
            {/* KIRI: Input Form */}
            <div className="w-full md:w-3/5 flex flex-col border-r border-slate-100">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center bg-white">
                <h3 className="font-bold text-slate-800 text-lg">Buat BAB Baru</h3>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 flex-1 bg-white">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">1. Pilih Rombel (Tingkat Kelas)</label>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(uniqueClassesForMapel.map(c => c.replace(/\D/g, '')))].filter(Boolean).map(r => {
                      const isSelected = newBabRombel === r
                      return (
                        <button key={r} onClick={() => setNewBabRombel(r)}
                          className={`px-6 py-2.5 rounded-xl text-sm font-bold border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-indigo-300'}`}>
                          Kelas {r}
                        </button>
                      )
                    })}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">2. Topik / Nama BAB</label>
                  <div className="flex items-stretch border border-indigo-200 rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all bg-white">
                    <div className="bg-slate-50 border-r border-indigo-100 px-4 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                      {(() => {
                        if (!newBabRombel) return 'Bab ?:'
                        const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
                        const uniqueBabs = [...new Set(classBabs.map(k => k.bab_nama || 'Lainnya'))]
                        return `Bab ${uniqueBabs.length + 1}:`
                      })()}
                    </div>
                    <input value={newBabNama} onChange={e => setNewBabNama(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddBab()}
                      placeholder="Contoh: Bilangan Bulat"
                      className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none" autoFocus disabled={!newBabRombel} />
                  </div>
                  <p className="text-xs text-slate-400 mt-2 italic">Format otomatis: Bab X: [Topik]</p>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-white border-t border-slate-100 flex gap-3 justify-end shrink-0">
                <button onClick={() => { setShowAddBab(false); setNewBabNama('') }}
                  className="px-5 py-2.5 text-slate-600 bg-white hover:bg-slate-50 text-sm font-bold rounded-xl border border-slate-200 transition-colors shadow-sm">
                  Batal
                </button>
                <button onClick={handleAddBab} disabled={!newBabNama.trim() || !newBabRombel || addingKomponen}
                  className="px-6 py-2.5 bg-indigo-400 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2">
                  {addingKomponen ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : null}
                  Simpan BAB
                </button>
              </div>
            </div>

            {/* KANAN: Daftar BAB */}
            <div className="w-full md:w-2/5 flex flex-col bg-slate-50 relative">
              <button onClick={() => { setShowAddBab(false); setNewBabNama('') }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between pr-14">
                <h3 className="font-bold text-slate-700 text-sm">
                  {newBabRombel ? `Daftar BAB Kelas ${newBabRombel}` : 'Daftar BAB'}
                </h3>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                {!newBabRombel ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    Pilih kelas untuk melihat daftar BAB.
                  </div>
                ) : (() => {
                  const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === newBabRombel))
                  const uniqueBabs = [...new Set(classBabs.map(k => k.bab_nama || 'Lainnya'))]
                  
                  if (uniqueBabs.length === 0) {
                    return (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                        Belum ada BAB untuk Kelas {newBabRombel}.
                      </div>
                    )
                  }
                  
                  return (
                    <div className="flex flex-col gap-2">
                      {uniqueBabs.map((bab, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-sm font-bold text-slate-700 flex items-center gap-3 animate-fade-in">
                          {bab}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
            
          </div>
        </div>
      , document.body)}
      
      {showKelolaSemester && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col md:flex-row max-h-[90vh]">
            
            {/* KIRI: Pilih Rombel */}
            <div className="w-full md:w-2/5 flex flex-col border-r border-slate-100 bg-white">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center bg-white">
                <h3 className="font-bold text-slate-800 text-lg">Kelola Materi Semester</h3>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 flex-1 bg-white">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">Pilih Rombel (Tingkat Kelas)</label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueRombels.filter(Boolean).map(r => {
                      const isSelected = kelolaSemesterRombel === r
                      return (
                        <button key={r} onClick={() => setKelolaSemesterRombel(r)}
                          className={`px-6 py-2.5 rounded-xl text-sm font-bold border transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-indigo-300'}`}>
                          Kelas {r}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* KANAN: Daftar BAB & Set Semester */}
            <div className="w-full md:w-3/5 flex flex-col bg-slate-50 relative">
              <button onClick={() => setShowKelolaSemester(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 rounded-lg p-1 shadow-sm z-20">
                <IconClose />
              </button>
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between pr-14 bg-slate-50">
                <h3 className="font-bold text-slate-700 text-sm">
                  {kelolaSemesterRombel ? `Daftar BAB Kelas ${kelolaSemesterRombel}` : 'Daftar BAB'}
                </h3>
              </div>
              <div className="p-0 overflow-y-auto custom-scrollbar flex-1 relative bg-white">
                {!kelolaSemesterRombel ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic p-6">
                    Pilih kelas untuk mengelola materi semester.
                  </div>
                ) : (() => {
                  const classBabs = komponen.filter(k => k.target_kelas && k.target_kelas.some(c => c.replace(/\D/g, '') === kelolaSemesterRombel))
                  const uniqueBabs = [...new Set(classBabs.map(k => k.bab_nama || 'Lainnya'))]
                  
                  if (uniqueBabs.length === 0) {
                    return (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic p-6">
                        Belum ada BAB untuk Kelas {kelolaSemesterRombel}.
                      </div>
                    )
                  }
                  
                  return (
                    <table key={kelolaSemesterRombel} className="w-full text-left text-sm border-collapse animate-fade-in">
                      <thead className="bg-slate-100 text-slate-500 font-bold sticky top-0 shadow-sm z-10">
                        <tr>
                          <th className="px-5 py-3 border-b border-slate-200">Nama BAB</th>
                          <th className="px-5 py-3 w-40 text-right border-b border-slate-200">Semester</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uniqueBabs.map(bab => {
                          const babSemester = komponen.find(k => k.bab_nama === bab)?.semester_id
                          return (
                            <tr key={bab} className="hover:bg-slate-50">
                              <td className="px-5 py-4 font-bold text-slate-700 leading-tight">{bab}</td>
                              <td className="px-5 py-4">
                                <select 
                                  value={babSemester || ''} 
                                  onChange={async (e) => {
                                    const newSemId = e.target.value
                                    const ids = komponen.filter(k => k.bab_nama === bab).map(k => k.id)
                                    await supabase.from('nilai_komponen').update({ semester_id: newSemId }).in('id', ids)
                                    fetchKomponen()
                                  }}
                                  className={`px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-indigo-500 w-full min-w-[140px] cursor-pointer ${!babSemester ? 'text-rose-600 border-rose-300 bg-rose-50' : 'text-indigo-700'}`}
                                >
                                  <option value="" disabled hidden>PILIH SEMESTER</option>
                                  {semesters.map(s => <option key={s.id} value={s.id} className="text-slate-700">Semester {s.nomor}</option>)}
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
            
          </div>
        </div>
      , document.body)}
      
            {selectedBabToManage && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg">Kelola BAB: {selectedBabToManage}</h3>
              <button onClick={() => { setSelectedBabToManage(null); setAddingTpToBab(null) }} className="text-slate-400 hover:text-slate-600 p-1"><IconClose /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative">
              
              <div className="flex flex-col sm:flex-row gap-6 border-b border-slate-100 pb-5">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nama BAB</label>
                  <div className="flex gap-2">
                    <input value={editBabName} onChange={e => setEditBabName(e.target.value)} className="flex-1 px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={handleSaveEditBab} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-sm transition-colors">Simpan</button>
                  </div>
                </div>
                <div className="sm:w-1/3">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Metode Hitung</label>
                  <select 
                    value={manualBobotPending ? 'bobot_manual' : (komponen.find(k => k.bab_nama === selectedBabToManage)?.metode_hitung || 'rata_rata')} 
                    onChange={e => handleUpdateMetode(selectedBabToManage, e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="rata_rata">Rata-rata</option>
                    <option value="bobot_sama">Bobot Sama</option>
                    <option value="bobot_manual">Atur Bobot Manual</option>
                  </select>
                </div>
              </div>
              
              {(manualBobotPending || komponen.find(k => k.bab_nama === selectedBabToManage)?.metode_hitung === 'bobot_manual') && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-4 mb-4">
                  <h4 className="font-bold text-amber-800 text-sm mb-3">Atur Bobot Manual (Total harus 100%)</h4>
                  <div className="flex flex-col gap-2">
                    {classKomponen.filter(k => k.bab_nama === selectedBabToManage).sort((a,b) => {
                      if (a.nama.toUpperCase() === 'N. KARAKTER') return 1;
                      if (b.nama.toUpperCase() === 'N. KARAKTER') return -1;
                      return a.urutan - b.urutan;
                    }).map(k => (
                      <div key={k.id} className="flex items-center justify-between gap-4">
                        <div className="text-xs font-semibold text-slate-700">{k.nama}</div>
                        <div className="flex items-center gap-2">
                          <input 
                             type="number" min="0" max="100" step="0.1"
                             value={manualBobotValues[k.id] ?? (k.bobot || 0)} 
                             onChange={e => {
                               if(!manualBobotPending) {
                                  // Switch to pending mode if they start typing but hadn't clicked dropdown
                                  const komp = classKomponen.filter(k => k.bab_nama === selectedBabToManage);
                                  const vals = {};
                                  komp.forEach(x => vals[x.id] = (x.bobot || 0));
                                  vals[k.id] = e.target.value;
                                  setManualBobotValues(vals);
                                  setManualBobotPending(true);
                               } else {
                                  setManualBobotValues({...manualBobotValues, [k.id]: e.target.value})
                               }
                             }} 
                             className="w-20 px-2 py-1 text-center border border-slate-300 rounded-lg text-sm font-mono outline-none focus:border-amber-500" 
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-between items-center border-t border-amber-200 pt-3">
                     <div className="text-xs font-bold text-amber-900">Total: {Object.values(manualBobotPending ? manualBobotValues : classKomponen.filter(k => k.bab_nama === selectedBabToManage).reduce((acc, curr) => ({...acc, [curr.id]: curr.bobot||0}), {})).reduce((sum, v) => sum + Number(v), 0)}%</div>
                     {manualBobotPending && (
                       <button onClick={() => handleSaveManualBobot(selectedBabToManage)} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors">Simpan Bobot</button>
                     )}
                  </div>
                </div>
              )}
              
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="text-xs font-bold text-slate-500 uppercase">Daftar Tujuan Pembelajaran (TP)</label>
                  <button onClick={() => {
                     setAddingTpToBab(selectedBabToManage);
                     const existingCount = classKomponen.filter(k => k.bab_nama === selectedBabToManage && k.nama.toUpperCase() !== 'N. KARAKTER').length;
                     setNewTpNama('TP ' + (existingCount + 1));
                     setNewTpDeskripsi('');
                     setNewTpBobot('1');
                     setNewTpTargetKelas(targetKelasList.filter(c => activeTabKelas && c.replace(/\D/g, '') === activeTabKelas.replace(/\D/g, '')));
                  }} className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-sm rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-1.5 shadow-sm"><IconPlus/> Tambah TP</button>
                </div>
                
                {addingTpToBab === selectedBabToManage && (
                  <div className="bg-slate-50 border border-indigo-100 p-5 rounded-xl mb-4 relative">
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Target Kelas</label>
                      <div className="flex flex-wrap gap-2">
                        {targetKelasList.filter(c => activeTabKelas && c.replace(/\D/g, '') === activeTabKelas.replace(/\D/g, '')).map(c => {
                          const isSelected = newTpTargetKelas.includes(c)
                          return (
                            <button key={c} onClick={() => toggleNewTpTargetKelas(c)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                              {c}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 mb-4">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nama TP</label>
                        <input value={newTpNama} onChange={e => setNewTpNama(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" />
                      </div>
                      
                    </div>
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Deskripsi Rapor</label>
                      <textarea value={newTpDeskripsi} onChange={e => setNewTpDeskripsi(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500 resize-none h-20" placeholder="Opsional..." />
                    </div>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setAddingTpToBab(null)} className="px-5 py-2.5 text-sm font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
                      <button onClick={handleAddTp} disabled={newTpTargetKelas.length === 0 || !newTpNama.trim()} className="px-6 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-50">Simpan TP</button>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-3">
                  {classKomponen.filter(k => k.bab_nama === selectedBabToManage).sort((a,b) => {
                      if (a.nama.toUpperCase() === 'N. KARAKTER') return 1;
                      if (b.nama.toUpperCase() === 'N. KARAKTER') return -1;
                      return a.urutan - b.urutan;
                  }).map((k, idx) => {
                    const isKarakter = k.nama.toUpperCase() === 'N. KARAKTER';
                    return (
                    <div key={k.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl shadow-sm gap-4 ${isKarakter ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-slate-200'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-bold text-sm ${isKarakter ? 'text-amber-800' : 'text-slate-800'}`}>{k.nama}</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-bold rounded uppercase border border-slate-200">Bobot: {k.bobot}</span>
                        </div>
                        {k.target_kelas && k.target_kelas.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-1.5">
                            {k.target_kelas.map(c => <span key={c} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isKarakter ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>{c}</span>)}
                          </div>
                        )}
                        <div className={`text-xs line-clamp-2 ${isKarakter ? 'text-amber-700/80' : 'text-slate-500'}`}>{k.deskripsi || <span className="italic opacity-50">Belum ada deskripsi</span>}</div>
                      </div>
                      <div className={`flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 ${isKarakter ? 'border-amber-100' : 'border-slate-100'}`}>
                        <button onClick={() => handleToggleVisible(k)} className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 text-xs font-bold ${k.is_nilai_visible ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                           <IconEye on={k.is_nilai_visible} />
                        </button>
                        <button onClick={() => {
                          setEditTpData({ nama: k.nama, deskripsi: k.deskripsi || '', bobot: k.bobot, target_kelas: k.target_kelas || [] })
                          setSelectedTpToManage(k.id)
                        }} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"><IconPencil/> Edit</button>
                        <button onClick={() => handleDeleteKomponen(k.id)} className="p-1.5 text-rose-500 border border-transparent hover:border-rose-200 bg-white hover:bg-rose-50 rounded-lg transition-colors"><IconTrash/></button>
                      </div>
                    </div>
                  )})}
                  {classKomponen.filter(k => k.bab_nama === selectedBabToManage).length === 0 && (
                    <div className="text-center p-6 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-sm">Tidak ada TP untuk kelas ini di BAB ini.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {selectedTpToManage && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">Edit Tujuan Pembelajaran</h3>
              <button onClick={() => setSelectedTpToManage(null)} className="text-slate-400 hover:text-slate-600 p-1 bg-white rounded-md shadow-sm border border-slate-200"><IconClose /></button>
            </div>
            <div className="p-5 flex flex-col gap-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Target Kelas</label>
                <div className="flex flex-wrap gap-2">
                  {targetKelasList.filter(c => activeTabKelas && c.replace(/\D/g, '') === activeTabKelas.replace(/\D/g, '')).map(c => {
                    const isSelected = editTpData.target_kelas.includes(c)
                  

  return (
                      <button key={c} onClick={() => toggleEditTpTargetKelas(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Nama TP</label>
                <input value={editTpData.nama} onChange={e => setEditTpData({...editTpData, nama: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Deskripsi Rapor</label>
                <textarea value={editTpData.deskripsi} onChange={e => setEditTpData({...editTpData, deskripsi: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm min-h-[100px] resize-none outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div className="pt-2">
                <button onClick={handleSaveEditTp} disabled={editTpData.target_kelas.length === 0} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; border: 3px solid #f8fafc; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #94a3b8; }
                input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.3s ease-out forwards; }
      `}} />
    </div>
  )
}

// FORCE HMR 2

// FORCE HMR 1782522827.4436662
