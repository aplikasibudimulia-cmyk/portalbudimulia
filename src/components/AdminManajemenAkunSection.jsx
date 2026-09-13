import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'
import { useConfirm } from '../utils/useConfirm'
import { cleanOrphanedStudentData } from '../utils/cleanOrphans'
import ExportKontakModal from './ExportKontakModal'
import KartuPelajarCard from './KartuPelajarCard'
import { downloadWorkbook } from '../utils/fileDownloader'
import { downloadStudentTemplateExcel, parseStudentExcelRows, buildStudentDatabasePayloads, cleanPhone, syncAllTablesNisn, combineAlamatAndRtRw, splitAlamatAndRtRw, toTitleCase, parseDateToIso, formatAlamatJalan, extractRtRwFromRow } from '../utils/studentExcelHelper'
import TemplateUpdateNisnModal from './TemplateUpdateNisnModal'
import ModalKelengkapanDataSiswa from './ModalKelengkapanDataSiswa'
import SmartPhotoUploadModal from './SmartPhotoUploadModal'

// Icons (Simplified as SVGs to reduce dependencies)
const IconUsers = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
const IconKey = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
const IconPlus = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
const IconUpload = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
const IconCamera = ({ className = 'w-5 h-5' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
const IconTrash = ({ className = 'w-4 h-4' }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>

const generateRandom3Digits = () => {
  return Math.floor(100 + Math.random() * 900).toString()
}

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
  
  const [search, setSearch] = useState(initialSearchQuery || '')
  const [selectedTaFilter, setSelectedTaFilter] = useState(activeTa?.nama || 'all')
  const [selectedClassFilter, setSelectedClassFilter] = useState('all')
  const [summaryFilter, setSummaryFilter] = useState('all')
  const [quickCardStudent, setQuickCardStudent] = useState(null)
  const [showTemplateNisnModal, setShowTemplateNisnModal] = useState(false)
  const [showKelengkapanModal, setShowKelengkapanModal] = useState(false)
  const [showSmartPhotoModal, setShowSmartPhotoModal] = useState(false)



  // Hanya kelas dari tahun ajaran aktif (activeTa) - Gabungkan enrollment dengan master_kelas
  const getActiveClasses = () => {
    if (!activeTa?.id) return []
    const enrollmentClasses = students?.filter(s => s.tahun_ajaran_id === activeTa.id && s.kelas && s.kelas !== '-').map(s => s.kelas) || []
    const masterClasses = masterKelasList.map(mk => mk.nama_kelas)
    return [...new Set([...enrollmentClasses, ...masterClasses])].sort()
  }

  const getAvailableClasses = (taId) => {
    if (!taId) return []
    const enrollmentClasses = students?.filter(s => s.tahun_ajaran_id === taId && s.kelas && s.kelas !== '-').map(s => s.kelas) || []
    // Jika untuk TA aktif, tambahkan master_kelas
    if (taId === activeTa?.id) {
      const masterClasses = masterKelasList.map(mk => mk.nama_kelas)
      return [...new Set([...enrollmentClasses, ...masterClasses])].sort()
    }
    return [...new Set(enrollmentClasses)].sort()
  }

  // Gabungkan kelas berisi siswa aktif (dari enrollment) dan kelas kosong manual
  const getAllClassesList = () => {
    if (!activeTa?.id) return []
    const enrollmentClasses = students?.filter(s => s.tahun_ajaran_id === activeTa.id && s.kelas && s.kelas !== '-').map(s => s.kelas) || []
    const uniqueEnrollment = [...new Set(enrollmentClasses)].sort()

    const listEnrollment = uniqueEnrollment.map(cls => ({
      id: `enroll-${cls}`,
      nama_kelas: cls,
      source: 'siswa',
      is_deletable: false
    }))

    const listMaster = masterKelasList
      .filter(mk => !uniqueEnrollment.includes(mk.nama_kelas))
      .map(mk => ({
        id: mk.id,
        nama_kelas: mk.nama_kelas,
        source: 'master',
        is_deletable: true
      }))

    return [...listEnrollment, ...listMaster].sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas))
  }
  
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')

  const [masterKelasList, setMasterKelasList] = useState([])
  const [newClassNameInput, setNewClassNameInput] = useState('')
  const [siswaPermanentMap, setSiswaPermanentMap] = useState(new Map())

  const fetchMasterKelas = async () => {
    if (!activeTa?.id) return
    try {
      const { data, error } = await supabase
        .from('master_kelas')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)
        .order('nama_kelas')
      if (error) throw error
      setMasterKelasList(data || [])
    } catch (err) {
      console.error('Gagal fetch master kelas:', err)
    }
  }

  const handleAddMasterKelas = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !newClassNameInput.trim()) return
    setIsProcessing(true)
    setProgressText('Menambahkan kelas baru...')
    try {
      const { error } = await supabase
        .from('master_kelas')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          nama_kelas: newClassNameInput.trim().toUpperCase()
        }])
      if (error) {
        if (error.code === '23505') {
          alert('Kelas tersebut sudah terdaftar untuk Tahun Ajaran aktif.')
        } else {
          throw error
        }
      } else {
        setNewClassNameInput('')
        await fetchMasterKelas()
      }
    } catch (err) {
      alert('Gagal menambah kelas: ' + err.message)
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  const handleDeleteMasterKelas = async (id) => {
    if (!window.confirm('Hapus kelas ini? Tindakan ini tidak menghapus data siswa, melainkan hanya menghapus daftar kelas kosong dari list master.')) return
    setIsProcessing(true)
    setProgressText('Menghapus kelas...')
    try {
      const { error } = await supabase
        .from('master_kelas')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchMasterKelas()
    } catch (err) {
      alert('Gagal menghapus kelas: ' + err.message)
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // Modal Biodata (Unified for Create & Edit)
  const [showBiodataModal, setShowBiodataModal] = useState(false)
  const [biodataForm, setBiodataForm] = useState(null)
  const [studentEnrollments, setStudentEnrollments] = useState([])
  const [guruWaliKelas, setGuruWaliKelas] = useState([])
  const [guruBK, setGuruBK] = useState([])
  const [guruMapel, setGuruMapel] = useState([])
  const [guruKodeTa, setGuruKodeTa] = useState([]) // { tahun_ajaran_id, tahun_ajaran, nomor_kode }
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(null)
  
  const [isEditingWali, setIsEditingWali] = useState(false)
  const [isEditingBK, setIsEditingBK] = useState(false)
  const [isEditingMapel, setIsEditingMapel] = useState(false)
  const [primaryMapelId, setPrimaryMapelId] = useState('')

  const setSortedGuruWaliKelas = (newWk) => {
    const sorted = [...newWk].sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
    setGuruWaliKelas(sorted)
  }

  const setSortedGuruBK = (newBk) => {
    const sorted = [...newBk].sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
    setGuruBK(sorted)
  }

  const setSortedGuruMapel = (newGm) => {
    const sorted = [...newGm].sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
    setGuruMapel(sorted)
  }

  const fetchStudentEnrollments = async (nisn) => {
    const { data } = await supabase.from('enrollment').select('*, tahun_ajaran:tahun_ajaran_id(nama)').eq('nisn', nisn).order('created_at', { ascending: false })
    setStudentEnrollments(data || [])
    return data || []
  }

  // --- Helper: normalize phone so comparisons are consistent ---
  // (formatPhoneNumber is defined later but hoisted via closure in arrow functions called after it's initialized)

  const _cleanFormFields = (form) => {
    if (!form) return {};
    return {
      foreign_id: form.foreign_id || '',
      nama: form.nama || '',
      username: form.username || '',
      password: form.password || '',
      akun_status: form.akun_status || '',
      telegram_ortu: form.telegram_ortu || '',
      no_whatsapp: formatPhoneNumber(form.no_whatsapp) || '',
      no_hp_ortu: formatPhoneNumber(form.no_hp_ortu) || '',
      email_ortu: form.email_ortu || '',
      nama_ortu: form.nama_ortu || '',
      kode: form.kode || '',
      no_hp: formatPhoneNumber(form.no_hp) || '',
      jenis_kelamin: form.jenis_kelamin || '',
      tempat_lahir: form.tempat_lahir || '',
      tanggal_lahir: form.tanggal_lahir || '',
      alamat: form.alamat || '',
      rt_rw: form.rt_rw || '',
      kelurahan: form.kelurahan || '',
      kecamatan: form.kecamatan || '',
      kota: form.kota || '',
      role_ids: [...(form.role_ids || [])].sort()
    };
  };

  const _cleanEnrols = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(e => ({
      tahun_ajaran_id: e.tahun_ajaran_id,
      kelas: e.kelas || ''
    })).sort((a, b) => {
      if (a.tahun_ajaran_id !== b.tahun_ajaran_id) {
        return String(a.tahun_ajaran_id).localeCompare(String(b.tahun_ajaran_id));
      }
      return String(a.kelas).localeCompare(String(b.kelas));
    });
  };

  const _cleanWali = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => ({
      tahun_ajaran_id: item.tahun_ajaran_id,
      kelas_list: [...(item.kelas_list || [])].sort()
    })).sort((a, b) => String(a.tahun_ajaran_id).localeCompare(String(b.tahun_ajaran_id)));
  };

  const _cleanKodeTa = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => ({
      tahun_ajaran_id: item.tahun_ajaran_id,
      nomor_kode: item.nomor_kode || ''
    })).sort((a, b) => String(a.tahun_ajaran_id).localeCompare(String(b.tahun_ajaran_id)));
  };

  const _cleanMapel = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => ({
      tahun_ajaran_id: item.tahun_ajaran_id,
      mapel_list: (item.mapel_list || []).map(m => ({
        mapel_id: m.mapel_id || '',
        kelas_list: [...(m.kelas_list || [])].sort()
      })).sort((a, b) => String(a.mapel_id).localeCompare(String(b.mapel_id)))
    })).sort((a, b) => String(a.tahun_ajaran_id).localeCompare(String(b.tahun_ajaran_id)));
  };

  // Returns an array of { label, from, to } describing what changed
  const getUnsavedChangesList = () => {
    if (!initialFormSnapshot || !biodataForm) return [];
    const changes = [];

    const fieldLabels = {
      foreign_id: 'NISN / ID',
      nama: 'Nama Lengkap',
      jenis_kelamin: 'Jenis Kelamin',
      username: 'Username',
      password: 'Password',
      akun_status: 'Status Akun',
      telegram_ortu: 'Telegram',
      no_whatsapp: 'No. WhatsApp',
      no_hp_ortu: 'No. HP Orang Tua',
      email_ortu: 'Email Orang Tua',
      nama_ortu: 'Nama Orang Tua',
      kode: 'Kode Guru',
      no_hp: 'No. HP',
      tempat_lahir: 'Tempat Lahir',
      tanggal_lahir: 'Tanggal Lahir',
      alamat: 'Alamat (Jalan)',
      rt_rw: 'RT/RW',
      kelurahan: 'Kelurahan',
      kecamatan: 'Kecamatan',
      kota: 'Kota',
      role_ids: 'Role/Jabatan',
    };

    const currentClean = _cleanFormFields(biodataForm);
    const initialClean = _cleanFormFields(initialFormSnapshot.biodataForm);

    for (const key of Object.keys(fieldLabels)) {
      const curr = JSON.stringify(currentClean[key] ?? '');
      const init = JSON.stringify(initialClean[key] ?? '');
      if (curr !== init) {
        const fromVal = Array.isArray(currentClean[key])
          ? (initialClean[key] || []).join(', ')
          : (initialClean[key] || '');
        const toVal = Array.isArray(currentClean[key])
          ? (currentClean[key] || []).join(', ')
          : (currentClean[key] || '');
        changes.push({ label: fieldLabels[key], from: String(fromVal), to: String(toVal) });
      }
    }

    if (activeTab === 'murid' || activeTab === 'orang_tua') {
      const currEnrols = _cleanEnrols(studentEnrollments);
      const initEnrols = _cleanEnrols(initialFormSnapshot.studentEnrollments);
      if (JSON.stringify(currEnrols) !== JSON.stringify(initEnrols)) {
        const taNames = tahunAjarans?.reduce((acc, ta) => { acc[ta.id] = ta.nama; return acc; }, {}) || {};
        const fmtEnrols = (arr) => arr.map(e => `${taNames[e.tahun_ajaran_id] || e.tahun_ajaran_id}: ${e.kelas}`).join(' | ');
        changes.push({ label: 'Riwayat Kelas', from: fmtEnrols(initEnrols) || '(tidak ada)', to: fmtEnrols(currEnrols) || '(tidak ada)' });
      }
    }

    if (activeTab === 'guru') {
      const currWali = _cleanWali(guruWaliKelas);
      const initWali = _cleanWali(initialFormSnapshot.guruWaliKelas);
      if (JSON.stringify(currWali) !== JSON.stringify(initWali)) {
        const taNames = tahunAjarans?.reduce((acc, ta) => { acc[ta.id] = ta.nama; return acc; }, {}) || {};
        const fmtWali = (arr) => arr.map(w => `${taNames[w.tahun_ajaran_id] || w.tahun_ajaran_id}: ${w.kelas_list.join(', ')}`).join(' | ');
        changes.push({ label: 'Wali Kelas', from: fmtWali(initWali) || '(tidak ada)', to: fmtWali(currWali) || '(tidak ada)' });
      }

      const currBK = _cleanWali(guruBK);
      const initBK = _cleanWali(initialFormSnapshot.guruBK);
      if (JSON.stringify(currBK) !== JSON.stringify(initBK)) {
        const taNames = tahunAjarans?.reduce((acc, ta) => { acc[ta.id] = ta.nama; return acc; }, {}) || {};
        const fmtBK = (arr) => arr.map(w => `${taNames[w.tahun_ajaran_id] || w.tahun_ajaran_id}: ${w.kelas_list.join(', ')}`).join(' | ');
        changes.push({ label: 'Penugasan BK', from: fmtBK(initBK) || '(tidak ada)', to: fmtBK(currBK) || '(tidak ada)' });
      }

      const currMapel = _cleanMapel(guruMapel);
      const initMapel = _cleanMapel(initialFormSnapshot.guruMapel);
      if (JSON.stringify(currMapel) !== JSON.stringify(initMapel)) {
        const taNames = tahunAjarans?.reduce((acc, ta) => { acc[ta.id] = ta.nama; return acc; }, {}) || {};
        const mapelNames = mapels?.reduce((acc, m) => { acc[m.id] = m.nama; return acc; }, {}) || {};
        const fmtMapel = (arr) => arr.map(gm =>
          `${taNames[gm.tahun_ajaran_id] || gm.tahun_ajaran_id}: ${gm.mapel_list.map(ml => `${mapelNames[ml.mapel_id] || ml.mapel_id}(${ml.kelas_list.join(',')})`).join('; ')}`
        ).join(' | ');
        changes.push({ label: 'Mata Pelajaran', from: fmtMapel(initMapel) || '(tidak ada)', to: fmtMapel(currMapel) || '(tidak ada)' });
      }

      const currKode = _cleanKodeTa(guruKodeTa);
      const initKode = _cleanKodeTa(initialFormSnapshot.guruKodeTa || []);
      if (JSON.stringify(currKode) !== JSON.stringify(initKode)) {
        const taNames = tahunAjarans?.reduce((acc, ta) => { acc[ta.id] = ta.nama; return acc; }, {}) || {};
        const fmtKode = (arr) => arr.filter(k => k.nomor_kode).map(k => `${taNames[k.tahun_ajaran_id] || k.tahun_ajaran_id}: ${k.nomor_kode}`).join(' | ');
        changes.push({ label: 'Kode per TA', from: fmtKode(initKode) || '(belum ada)', to: fmtKode(currKode) || '(belum ada)' });
      }
    }

    return changes;
  };

  const checkUnsavedChanges = () => getUnsavedChangesList().length > 0;

  const handleCloseBiodataModal = async () => {
    const changesList = getUnsavedChangesList();
    if (changesList.length > 0) {
      const confirmed = await requestConfirm({
        title: 'Buang Perubahan?',
        message: 'Terdapat perubahan data yang belum disimpan. Apakah Anda yakin ingin membuang perubahan ini?',
        details: changesList,
        confirmLabel: 'Ya, Buang Perubahan',
        cancelLabel: 'Lanjut Edit',
        confirmColor: 'red',
        icon: 'danger',
      });
      if (!confirmed) return;
    }
    setShowBiodataModal(false);
  };


  // Modal Export Excel
  const [showExportModal, setShowExportModal] = useState(false)
  const [showExportKontakModal, setShowExportKontakModal] = useState(false)

  // Modal Cetak Kartu Login
  const [showPrintCardsModal, setShowPrintCardsModal] = useState(false)

  // Modal Reset Password
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetData, setResetData] = useState(null)
  const [resetMethod, setResetMethod] = useState('random')
  const [printLayout, setPrintLayout] = useState('4-per-page') // '4-per-page' or '1-per-page'

  // State untuk fetch credential real-time dari siswa_permanent
  const [isProcessingPrint, setIsProcessingPrint] = useState(false)
  const [siswaPermanentCredentials, setSiswaPermanentCredentials] = useState({})
  const [isActionsExpanded, setIsActionsExpanded] = useState(false)
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false)

  // Helper to map class to a beautiful unique color set
  const getClassColor = (kelas) => {
    if (!kelas) return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', solidBg: 'bg-slate-600' }
    const cleanClass = kelas.trim().toUpperCase()
    let hash = 0
    for (let i = 0; i < cleanClass.length; i++) {
      hash = cleanClass.charCodeAt(i) + ((hash << 5) - hash)
    }
    const index = Math.abs(hash) % 7
    const colors = [
      { bg: 'bg-indigo-50/90', text: 'text-indigo-800', border: 'border-indigo-200', solidBg: 'bg-indigo-600' },
      { bg: 'bg-emerald-50/95', text: 'text-emerald-800', border: 'border-emerald-200', solidBg: 'bg-[#00877a]' }, // matches the teal/emerald from image
      { bg: 'bg-amber-50/95', text: 'text-amber-800', border: 'border-amber-200', solidBg: 'bg-amber-500' },
      { bg: 'bg-pink-50/90', text: 'text-pink-800', border: 'border-pink-200', solidBg: 'bg-pink-600' },
      { bg: 'bg-sky-50/90', text: 'text-sky-800', border: 'border-sky-200', solidBg: 'bg-sky-500' },
      { bg: 'bg-violet-50/90', text: 'text-violet-800', border: 'border-violet-200', solidBg: 'bg-violet-600' },
      { bg: 'bg-teal-50/90', text: 'text-teal-800', border: 'border-teal-200', solidBg: 'bg-teal-600' }
    ]
    return colors[index]
  }

  // Pre-calculate attendance numbers based on sorted alphabet of students inside each class for the target academic year
  const classAbsenMap = React.useMemo(() => {
    const map = {}
    const studentsByClass = {}
    
    const targetTa = selectedTaFilter === 'all' ? activeTa?.nama : selectedTaFilter

    // Group only students enrolled in the target academic year
    students.forEach(std => {
      if (targetTa && std.tahun_ajaran && std.tahun_ajaran.trim() !== targetTa.trim()) return
      const k = (std.kelas || '-').trim()
      if (k === '-' || !k) return
      if (!studentsByClass[k]) studentsByClass[k] = []
      
      const studentKey = std.nisn || std.id || std.nama_lengkap
      if (!studentsByClass[k].some(existing => (existing.nisn || existing.id || existing.nama_lengkap) === studentKey)) {
        studentsByClass[k].push(std)
      }
    })
    
    // Sort each class group alphabetically and assign index
    Object.keys(studentsByClass).forEach(k => {
      studentsByClass[k].sort((a, b) => (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '', 'id'))
      studentsByClass[k].forEach((std, index) => {
        const num = index + 1
        if (std.nisn) map[std.nisn] = num
        if (std.id) map[std.id] = num
        if (std.nama_lengkap) map[std.nama_lengkap] = num
      })
    })
    
    return map
  }, [students, selectedTaFilter, activeTa])

  const handleOpenPrintCardsModal = async () => {
    setIsProcessingPrint(true)
    try {
      const { data, error } = await supabase
        .from('siswa_permanent')
        .select('nisn, kode_akses, ortu_username, ortu_password')
      
      if (error) throw error
      
      if (data) {
        const credsMap = {}
        data.forEach(item => {
          if (item.nisn) {
            credsMap[item.nisn] = {
              kode_akses: item.kode_akses,
              ortu_username: item.ortu_username,
              ortu_password: item.ortu_password
            }
          }
        })
        setSiswaPermanentCredentials(credsMap)
      }
      setShowPrintCardsModal(true)
    } catch (err) {
      console.error("Gagal memuat credential siswa_permanent:", err)
      alert("Gagal memuat data login dari server. Silakan coba kembali.")
    } finally {
      setIsProcessingPrint(false)
    }
  }

  const handleResetMethodChange = (method) => {
    setResetMethod(method)
    if (method === 'random') {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let generatedPass = ''
      for (let i = 0; i < 6; i++) {
        generatedPass += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      setResetData(prev => ({ ...prev, generatedPass }))
    } else {
      setResetData(prev => ({ ...prev, generatedPass: '' }))
    }
  }

  
  // Refs
  const csvInputRef = useRef(null)
  const csvSiswaInputRef = useRef(null)
  const bulkUpdateNisnInputRef = useRef(null)
  const massPhotoInputRef = useRef(null)
  const individualPhotoInputRef = useRef(null)
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null)

  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const { requestConfirm, ConfirmModalComponent } = useConfirm()


  useEffect(() => {
    fetchData()
  }, [activeTab, activeTa])

  // Sinkronkan filter tahun ajaran dengan tahun ajaran aktif saat pertama kali dimuat
  useEffect(() => {
    if (activeTa?.nama) {
      setSelectedTaFilter(activeTa.nama)
    }
  }, [activeTa])

  const fetchData = async () => {
    setLoading(true)
    if (activeTa?.id) {
      await fetchMasterKelas()
    }

    if (activeTab === 'kelas') {
      setLoading(false)
      return
    }
    // Clean up any leftover orphaned data from deleted demo/student accounts
    cleanOrphanedStudentData()

    // 1. Fetch Akun Pengguna for current tab
    const { data: akunData, error: akunError } = await supabase.from('akun_pengguna').select('id, username, role, status, foreign_id, created_at, updated_at').eq('role', activeTab)
    if (akunError) console.error('fetchData akunError:', akunError)
    setAkunList(akunData || [])

    // 1b. Fetch fresh siswa_permanent data to ensure parent biodata (nama_ortu, no_hp_ortu, email_ortu, line_user_id) is always fresh & accurate
    if (activeTab === 'murid' || activeTab === 'orang_tua') {
      const { data: permList } = await supabase.from('siswa_permanent').select('nisn, nama_lengkap, nama_ortu, no_hp_ortu, email_ortu, no_whatsapp, line_user_id, telegram_ortu, kontak_ortu, tempat_lahir, tanggal_lahir, alamat, kelurahan, kecamatan, kota, no_hp')
      if (permList) {
        setSiswaPermanentMap(new Map(permList.map(p => [String(p.nisn || '').trim(), p])))
      }
    }

    // 2. If Guru tab, fetch Guru specific data
    if (activeTab === 'guru') {
      const { data: gurus } = await supabase.from('guru').select(`
        *,
        guru_role ( role_id ),
        guru_kelas ( kelas, tahun_ajaran_id ),
        guru_bk ( kelas, tahun_ajaran_id ),
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
    if (activeTab === 'murid' || activeTab === 'orang_tua') {
      console.log('Students raw data:', students?.length, students?.[0])
      console.log('activeTa:', activeTa, 'selectedTaFilter:', selectedTaFilter)
      

      // Create a unique list of students (sometimes enrollment causes duplicates if not grouped)
      const uniqueStudentsMap = new Map()
      students.forEach(s => {
        const key = String(s.nisn || s.id || s.nama_lengkap).trim()
        if (!uniqueStudentsMap.has(key)) {
          uniqueStudentsMap.set(key, { ...s, nisn: String(s.nisn || key).trim(), enrollments: [] })
        }
        if (s.tahun_ajaran) {
          uniqueStudentsMap.get(key).enrollments.push({
            kelas: s.kelas,
            tahun_ajaran: s.tahun_ajaran,
            tahun_ajaran_id: s.tahun_ajaran_id // Might be undefined but that's fine
          })
        }
      })

      // Include any accounts in akunList whose foreign_id is not in uniqueStudentsMap
      const targetRole = activeTab === 'orang_tua' ? 'orang_tua' : 'murid'
      akunList.filter(a => a.role === targetRole).forEach(a => {
        const fId = a.foreign_id ? String(a.foreign_id).trim() : ''
        if (fId && !uniqueStudentsMap.has(fId)) {
          uniqueStudentsMap.set(fId, {
            id: fId,
            nisn: fId,
            nama_lengkap: (a.username && !a.username.startsWith('ebmsiswa.') && !a.username.startsWith('ebmortu.') ? a.username : ''),
            kelas: '-',
            tahun_ajaran: '-',
            enrollments: []
          })
        }
      })

      return Array.from(uniqueStudentsMap.values()).map(student => {
        const key = String(student.nisn || student.id || student.nama_lengkap).trim()
        const perm = siswaPermanentMap.get(key)
        const resolvedStudent = perm ? { ...student, ...perm } : student

        // Find relevant enrollment based on TA
        let enrollment = null
        if (selectedTaFilter !== 'all') {
          enrollment = resolvedStudent.enrollments.find(e => e.tahun_ajaran?.trim() === selectedTaFilter?.trim())
        } else {
          enrollment = resolvedStudent.enrollments.find(e => e.tahun_ajaran?.trim() === activeTa?.nama?.trim())
        }
        
        if (!enrollment && resolvedStudent.enrollments.length > 0) enrollment = resolvedStudent.enrollments[0]

        // Find Akun
        const targetRole = activeTab === 'orang_tua' ? 'orang_tua' : 'murid'
        const akun = akunList.find(a => (a.foreign_id === resolvedStudent.nisn || a.foreign_id === resolvedStudent.id?.toString()) && a.role === targetRole)
        
        // Find Foto
        const foto = allFotos.filter(f => (f.nisn === resolvedStudent.nisn || f.nisn === resolvedStudent.id?.toString()) && f.cloudinary_url)
            .sort((a, b) => (b.tahun_ajaran?.nama || '').localeCompare(a.tahun_ajaran?.nama || ''))[0]

        const resolvedKelas = enrollment?.kelas || resolvedStudent.kelas || '-'

        return {
          id: key,
          foreign_id: key,
          nisn: resolvedStudent.nisn,
          nama: resolvedStudent.nama_lengkap,
          kelas: resolvedKelas,
          tahun_ajaran: enrollment?.tahun_ajaran || resolvedStudent.tahun_ajaran || '-',
          foto_url: foto?.cloudinary_url || null,
          hasAkun: !!akun,
          akun_id: akun?.id,
          username: activeTab === 'orang_tua' 
            ? (akun?.username || resolvedStudent.ortu_username || '(Belum punya akun)') 
            : (activeTab === 'murid' 
                ? (akun?.username || resolvedStudent.email_aktif || '(Belum punya akun)') 
                : (akun?.username || '(Belum punya akun)')),
          password_exists: !!akun?.password,
          status: akun?.status || 'nonaktif',
          rawStudent: resolvedStudent
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
          username: akun?.username ? (akun.username.includes('@') ? akun.username.split('@')[0] : akun.username) : '(Belum punya akun)',
          password_exists: !!akun?.password,
          status: akun?.status || 'nonaktif',
          rawGuru: guru
        }
      })
    }
  }

  let mergedData = getMergedData()

  // Apply sorting for Guru & Staff based on number in kode (e.g., g192026 -> 19)
  if (activeTab !== 'murid') {
    mergedData.sort((a, b) => {
      const getNum = (kode) => {
        if (!kode) return 999999;
        const match = kode.match(/g(\d+)2026/i);
        if (match) return parseInt(match[1]);
        
        const digits = kode.match(/\d+/);
        return digits ? parseInt(digits[0]) : 999999;
      };
      return getNum(a.kode) - getNum(b.kode);
    });
  }

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

  // Apply TA Filter for Murid & Orang Tua
  if ((activeTab === 'murid' || activeTab === 'orang_tua') && selectedTaFilter !== 'all') {
    mergedData = mergedData.filter(a => a.tahun_ajaran === selectedTaFilter || a.tahun_ajaran === '-')
  }

  // Derive Unique Classes from TA-filtered data (before class filter is applied)
  const uniqueClasses = (activeTab === 'murid' || activeTab === 'orang_tua') ? [...new Set(mergedData.map(a => a.kelas).filter(k => k !== '-'))].sort() : []

  // Apply Class Filter for Murid & Orang Tua
  if ((activeTab === 'murid' || activeTab === 'orang_tua') && selectedClassFilter !== 'all') {
    mergedData = mergedData.filter(a => a.kelas === selectedClassFilter)
  }

  // --- ACTIONS ---

  // Backup data for cards before summary filter is applied
  const dataForCards = [...mergedData];



  // Apply Summary Filter
  if (summaryFilter !== 'all') {
    if (summaryFilter === 'with_akun') {
      mergedData = mergedData.filter(a => a.hasAkun)
    } else if (summaryFilter === 'without_akun') {
      mergedData = mergedData.filter(a => !a.hasAkun)
    } else if (summaryFilter === 'active_akun') {
      if (activeTab === 'murid') {
        mergedData = mergedData.filter(a => a.hasAkun && a.status === 'aktif')
      } else {
        mergedData = mergedData.filter(a => {
          const akun = akunList.find(ak => ak.id === a.akun_id);
          return akun && (akun.role === 'admin' || akun.role === 'superadmin');
        })
      }
    } else if (summaryFilter === 'duplicate_phone') {
      mergedData = mergedData.filter(a => {
        const sPhone = cleanPhone(a.rawStudent?.no_whatsapp || a.rawStudent?.no_hp)
        if (!sPhone) return false
        const currentContacts = a.rawStudent?.kontak_ortu || []
        const hasMatchingContact = Array.isArray(currentContacts) && currentContacts.some(k => cleanPhone(k.nomor) === sPhone)
        const oPhone = cleanPhone(a.rawStudent?.no_hp_ortu)
        return hasMatchingContact || (oPhone && sPhone === oPhone)
      })
    }
  }


  const handleResetPassword = async (row) => {
    if (!row.hasAkun || !row.akun_id) {
      alert("User ini belum memiliki akun. Silakan buat akun terlebih dahulu melalui modal edit data.");
      return;
    }
    
    // Generate 6 character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let generatedPass = ''
    for (let i = 0; i < 6; i++) {
      generatedPass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    let defaultWa = ""
    let noHpSiswa = ""
    let availableContacts = []
    if (activeTab === 'murid' || activeTab === 'orang_tua') {
      // Tarik langsung dari siswa_permanent untuk jaminan data terbaru dan lengkap
      const { data: permData } = await supabase
        .from('siswa_permanent')
        .select('no_whatsapp, no_hp, no_hp_ortu, nama_ortu, kontak_ortu')
        .eq('nisn', row.foreign_id)
        .maybeSingle()
        
      noHpSiswa = permData?.no_whatsapp || permData?.no_hp || row.rawStudent?.no_whatsapp || ""

      const rawKontak = Array.isArray(permData?.kontak_ortu) ? permData.kontak_ortu : (Array.isArray(row.rawStudent?.kontak_ortu) ? row.rawStudent.kontak_ortu : [])
      
      rawKontak.forEach(k => {
        const clean = formatPhoneNumber(k.nomor) || cleanPhone(k.nomor)
        if (clean) {
          let tag = k.tag || 'Orang Tua'
          if (k.nama && /ayah|papa|bapak|papi/i.test(k.nama) && tag.toLowerCase() === 'ibu') {
            tag = 'Ayah'
          } else if (k.nama && /ibu|mama|mami|bunda/i.test(k.nama) && tag.toLowerCase() === 'ayah') {
            tag = 'Ibu'
          }
          const icon = tag === 'Ayah' ? '👨' : tag === 'Ibu' ? '👩' : tag === 'Wali' ? '🤝' : '👥'
          availableContacts.push({
            tag,
            nama: k.nama || '',
            nomor: clean,
            label: `${tag}${k.nama ? ` (${k.nama})` : ''}`,
            icon
          })
        }
      })

      // Jika kontak_ortu kosong tapi ada legacy no_hp_ortu
      if (availableContacts.length === 0 && permData?.no_hp_ortu) {
        const clean = formatPhoneNumber(permData.no_hp_ortu) || cleanPhone(permData.no_hp_ortu)
        if (clean) {
          availableContacts.push({
            tag: 'Orang Tua',
            nama: permData.nama_ortu || '',
            nomor: clean,
            label: `Orang Tua${permData.nama_ortu ? ` (${permData.nama_ortu})` : ''}`,
            icon: '👥'
          })
        }
      }

      if (activeTab === 'murid') {
        defaultWa = noHpSiswa
      } else {
        defaultWa = availableContacts.length > 0 ? availableContacts[0].nomor : (permData?.no_hp_ortu || "")
      }
    } else {
      defaultWa = row.rawGuru?.no_hp || ""
    }
    
    setResetMethod('random')
    setResetData({ 
      row, 
      generatedPass, 
      waNumber: defaultWa, 
      noHpSiswa,
      availableContacts,
      selectedTag: availableContacts.length > 0 ? availableContacts[0].tag : 'Orang Tua',
      selectedName: availableContacts.length > 0 ? availableContacts[0].nama : ''
    })
    setShowResetModal(true)
  }

  const handleSendDirectWa = (targetPhone, targetTag, targetName) => {
    if (!resetData) return
    const { row, generatedPass } = resetData
    const cleanNum = formatPhoneNumber(targetPhone) || cleanPhone(targetPhone)
    if (!cleanNum) {
      alert("Nomor WhatsApp tidak valid.")
      return
    }
    const roleParam = activeTab === 'orang_tua' ? 'orang_tua' : (activeTab === 'murid' ? 'siswa' : 'guru')
    const loginUrl = `${window.location.origin}/login?u=${row.username}&p=${generatedPass}&r=${roleParam}`
    
    let greeting = `Halo Orang Tua dari ${row.nama}`
    if (targetTag === 'Ayah') greeting = `Halo Bapak ${targetName || ''} (Ayah dari ${row.nama})`.replace('  ', ' ')
    else if (targetTag === 'Ibu') greeting = `Halo Ibu ${targetName || ''} (Ibu dari ${row.nama})`.replace('  ', ' ')
    else if (targetTag === 'Wali') greeting = `Halo ${targetName || ''} (Wali dari ${row.nama})`.replace('  ', ' ')

    const message = `${greeting},\n\nBerikut adalah info login Portal Orang Tua untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Password:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
    const waUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')
  }

  const executeReset = async (sendWa) => {
    if (!resetData) return
    const { row, generatedPass } = resetData
    
    if (resetMethod === 'manual' && (!generatedPass || generatedPass.trim().length < 4)) {
      alert("Untuk input manual, kode/password minimal berisi 4 karakter!")
      return
    }

    setIsProcessing(true)
    
    // Update Supabase akun_pengguna via secure database function
    const { error } = await supabase.rpc('admin_reset_password', {
      p_akun_id: row.akun_id,
      p_new_password: generatedPass
    })
    
    // Update plain text kode_akses for display purposes
    if (!error) {
      if (activeTab === 'murid') {
        await supabase.from('siswa_permanent').update({ kode_akses: generatedPass }).eq('nisn', row.foreign_id)
      } else if (activeTab === 'orang_tua') {
        await supabase.from('siswa_permanent').update({ ortu_password: generatedPass }).eq('nisn', row.foreign_id)
      } else {
        const guruId = row.id
        if (guruId) await supabase.from('guru').update({ kode_akses: generatedPass }).eq('id', guruId)
      }
    }
    
    setIsProcessing(false)
    if (error) {
      alert("Gagal mereset: " + error.message)
    } else {
      fetchData()
      setShowResetModal(false)
      
      if (sendWa) {
        let phone = resetData.waNumber || ""
        let cleanNum = formatPhoneNumber(phone) || cleanPhone(phone)
        if (!cleanNum) {
          alert("Silakan masukkan Nomor WA tujuan yang valid di kolom yang tersedia.")
          setIsProcessing(false)
          return
        }

        let message = ""
        let roleParam = 'siswa'
        if (activeTab === 'orang_tua') roleParam = 'orang_tua'
        else if (activeTab === 'guru') roleParam = 'guru'
        const loginUrl = `${window.location.origin}/login?u=${row.username}&p=${generatedPass}&r=${roleParam}`
        if (activeTab === 'murid') {
          message = `Halo ${row.nama},\n\nBerikut adalah info login untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Kode Akses:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        } else if (activeTab === 'orang_tua') {
          const recipientTag = resetData.selectedTag || 'Orang Tua'
          const recipientName = resetData.selectedName ? ` ${resetData.selectedName}` : ''
          let greeting = `Halo Orang Tua dari ${row.nama}`
          if (recipientTag === 'Ayah') greeting = `Halo Bapak${recipientName} (Ayah dari ${row.nama})`
          else if (recipientTag === 'Ibu') greeting = `Halo Ibu${recipientName} (Ibu dari ${row.nama})`
          else if (recipientTag === 'Wali') greeting = `Halo${recipientName} (Wali dari ${row.nama})`
          message = `${greeting},\n\nBerikut adalah info login Portal Orang Tua untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Password:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        } else {
          message = `Halo ${row.nama},\n\nBerikut adalah info login untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Password:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        }
        
        const waUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')
      }
    }
  }

  const handleDeletePermanen = async (row) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Permanen?',
      message: `PERINGATAN!\nAnda akan menghapus SELURUH data ${row.nama} secara permanen (Biodata, Akun, Nilai/Kelas, Foto).\nTindakan ini TIDAK BISA dibatalkan!\nLanjutkan?`,
      confirmLabel: 'Hapus Permanen',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    setIsProcessing(true)
    
    if (activeTab === 'murid') {
      const nisn = row.foreign_id
      const cleanNisn = String(nisn || '').trim()
      // Delete all related records across all tables for this student
      await Promise.all([
        supabase.from('enrollment').delete().eq('nisn', nisn),
        supabase.from('foto').delete().eq('nisn', nisn),
        supabase.from('presensi_harian').delete().eq('siswa_nisn', nisn),
        supabase.from('point_records').delete().eq('nisn', nisn),
        supabase.from('student_points').delete().eq('nisn', nisn),
        supabase.from('nilai_siswa').delete().eq('siswa_nisn', nisn),
        supabase.from('bk_konsultasi').delete().eq('siswa_nisn', nisn),
        supabase.from('berkas_pengumuman').delete().eq('kode_siswa', row.kode || nisn),
        supabase.from('impersonate_tokens').delete().eq('target_user_id', nisn)
      ])
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      if (cleanNisn) {
        await supabase.from('akun_pengguna').delete().eq('foreign_id', cleanNisn)
      }
      if (nisn && nisn !== cleanNisn) {
        await supabase.from('akun_pengguna').delete().eq('foreign_id', nisn)
      }
      const { error } = await supabase.from('siswa_permanent').delete().eq('nisn', nisn)
      if (error) alert("Gagal hapus data siswa: " + error.message)
    } else if (activeTab === 'orang_tua') {
      // Only delete orang_tua account, NOT the student data
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      await supabase.from('siswa_permanent').update({ ortu_username: null, ortu_password: null }).eq('nisn', row.foreign_id)
    } else {
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      const { error } = await supabase.from('guru').delete().eq('id', row.id)
      if (error) alert("Gagal hapus data guru: " + error.message)
    }
    
    setIsProcessing(false)
    fetchData()
    onRefresh?.()
  }

  // --- MODAL BIODATA ---

  const openBiodataModal = async (row = null) => {
    setIsEditingWali(false)
    setIsEditingBK(false)
    setIsEditingMapel(false)

    if (activeTab === 'murid' || activeTab === 'orang_tua') {
      let rawStudent = row?.rawStudent || {};
      let enrolls = [];
      if (row) {
        enrolls = await fetchStudentEnrollments(row.foreign_id);
        
        // Ambil data terbaru langsung dari siswa_permanent untuk menutupi kolom yang belum ada di view siswa_lengkap
        const { data: permData } = await supabase.from('siswa_permanent')
          .select('nama_lengkap, nama_ortu, no_hp_ortu, email_ortu, telegram_ortu, no_whatsapp, email_aktif, kontak_ortu, tempat_lahir, tanggal_lahir, alamat, kelurahan, kecamatan, kota, no_hp')
          .eq('nisn', row.foreign_id).maybeSingle();
          
        if (permData) {
          rawStudent = { ...rawStudent, ...permData };
        }
      } else {
        setStudentEnrollments([]);
      }
      
      const emailAktifVal = rawStudent?.email_aktif || '';
      let usernameSiswaVal = '';
      
      if (activeTab === 'murid') {
        if (row?.hasAkun && row.username) {
          usernameSiswaVal = row.username;
        } else {
          // Generate default ebmsiswa.namadepan3digitrandom
          const namaDepan = (rawStudent?.nama_lengkap || row?.nama || '').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
          const randomDigits = generateRandom3Digits();
          usernameSiswaVal = namaDepan ? `ebmsiswa.${namaDepan}${randomDigits}` : '';
        }
      }

      const initialNama = rawStudent?.nama_lengkap || (row?.nama && !row?.nama.startsWith('ebmsiswa.') && !row?.nama.startsWith('ebmortu.') ? row?.nama : '') || '';

      // Susun list kontak orang tua (Tag: Ayah, Ibu, Wali, Orang Tua)
      let initialKontakOrtu = []
      if (Array.isArray(rawStudent?.kontak_ortu) && rawStudent.kontak_ortu.length > 0) {
        initialKontakOrtu = rawStudent.kontak_ortu.map(k => ({
          tag: k.tag || 'Orang Tua',
          nama: k.nama || '',
          nomor: k.nomor || k.no_hp || k.telepon || ''
        }))
      } else if (rawStudent?.no_hp_ortu || rawStudent?.nama_ortu) {
        initialKontakOrtu = [{
          tag: 'Orang Tua',
          nama: rawStudent?.nama_ortu || '',
          nomor: rawStudent?.no_hp_ortu || ''
        }]
      }

      // Pisahkan Alamat dan RT/RW serta Jenis Kelamin
      const { jalan, rtRw } = splitAlamatAndRtRw(rawStudent?.alamat, rawStudent?.rt_rw);
      const rawJk = String(rawStudent?.jenis_kelamin || rawStudent?.gender || '').trim().toUpperCase();
      const jkVal = rawJk.startsWith('L') ? 'L' : rawJk.startsWith('P') ? 'P' : (rawStudent?.jenis_kelamin || '');

      let currentHasAkun = row?.hasAkun || false;
      let currentAkunId = row?.akun_id || null;
      let currentAkunStatus = row?.hasAkun ? row.status : 'aktif';
      let currentUsername = row?.hasAkun ? row.username : (activeTab === 'orang_tua' ? '' : emailAktifVal);

      if (!currentHasAkun && row?.foreign_id) {
        const targetRole = activeTab === 'orang_tua' ? 'orang_tua' : (activeTab === 'murid' ? 'murid' : activeTab);
        const cleanFId = String(row.foreign_id).trim();
        const { data: liveAkun } = await supabase
          .from('akun_pengguna')
          .select('id, username, status')
          .eq('role', targetRole)
          .eq('foreign_id', cleanFId)
          .maybeSingle();
        if (liveAkun) {
          currentHasAkun = true;
          currentAkunId = liveAkun.id;
          currentAkunStatus = liveAkun.status || 'aktif';
          currentUsername = liveAkun.username;
          if (activeTab === 'murid' && (!usernameSiswaVal || usernameSiswaVal.startsWith('ebmsiswa.'))) {
            usernameSiswaVal = liveAkun.username;
          }
        }
      }

      const formState = {
        isNew: !row,
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: initialNama,
        jenis_kelamin: jkVal,
        kelas: row?.kelas !== '-' ? row?.kelas : '',
        username: currentUsername,
        email_aktif: emailAktifVal,
        username_siswa: usernameSiswaVal,
        password: '',
        hasAkun: currentHasAkun,
        akun_id: currentAkunId,
        foto_url: row?.foto_url || null,
        akun_status: currentAkunStatus,
        telegram_ortu: rawStudent?.telegram_ortu || '',
        no_whatsapp: rawStudent?.no_whatsapp || '',
        no_hp: rawStudent?.no_hp || rawStudent?.no_whatsapp || '',
        tempat_lahir: rawStudent?.tempat_lahir || '',
        tanggal_lahir: rawStudent?.tanggal_lahir ? new Date(rawStudent.tanggal_lahir).toISOString().split('T')[0] : '',
        alamat: jalan,
        rt_rw: rtRw,
        kelurahan: rawStudent?.kelurahan || '',
        kecamatan: rawStudent?.kecamatan || '',
        kota: rawStudent?.kota || '',
        kontak_ortu: initialKontakOrtu,
        no_hp_ortu: rawStudent?.no_hp_ortu || '',
        email_ortu: rawStudent?.email_ortu || '',
        nama_ortu: rawStudent?.nama_ortu || '',
        temp_ta_id: activeTa?.id || ''
      }
      setPrimaryMapelId('')
      setBiodataForm(formState)
      setInitialFormSnapshot({
        biodataForm: JSON.parse(JSON.stringify(formState)),
        studentEnrollments: JSON.parse(JSON.stringify(enrolls)),
        guruWaliKelas: [],
        guruMapel: []
      })
    } else {
      const g = row?.rawGuru
      // Init guruWaliKelas dari activeTa saja (hanya 1 kelas per TA untuk wali kelas)
      const waliKelasGrouped = (g?.guru_kelas || []).reduce((acc, gk) => {
        const taId = gk.tahun_ajaran_id
        const ta = tahunAjarans?.find(t => t.id === taId)
        if (!acc[taId]) acc[taId] = { tahun_ajaran_id: taId, tahun_ajaran: ta?.nama || '', kelas_list: [] }
        // Wali kelas max 1 kelas per TA — ambil hanya 1
        if (acc[taId].kelas_list.length === 0) acc[taId].kelas_list.push(gk.kelas)
        return acc
      }, {})
      const waliList = Object.values(waliKelasGrouped).sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
      setGuruWaliKelas(waliList)

      // Init guruBK
      const bkGrouped = (g?.guru_bk || []).reduce((acc, gk) => {
        const taId = gk.tahun_ajaran_id
        const ta = tahunAjarans?.find(t => t.id === taId)
        if (!acc[taId]) acc[taId] = { tahun_ajaran_id: taId, tahun_ajaran: ta?.nama || '', kelas_list: [] }
        if (!acc[taId].kelas_list.includes(gk.kelas)) acc[taId].kelas_list.push(gk.kelas)
        return acc
      }, {})
      const bkList = Object.values(bkGrouped).sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
      setGuruBK(bkList)

      // Init guruMapel from ALL TAs (not just activeTa)
      const mapelGrouped = (g?.guru_mapel || []).reduce((acc, gm) => {
        const taId = gm.tahun_ajaran_id
        const ta = tahunAjarans?.find(t => t.id === taId)
        if (!acc[taId]) acc[taId] = { tahun_ajaran_id: taId, tahun_ajaran: ta?.nama || '', mapel_list: [] }
        let mapelEntry = acc[taId].mapel_list.find(m => m.mapel_id === gm.mata_pelajaran_id)
        if (!mapelEntry) {
          mapelEntry = { mapel_id: gm.mata_pelajaran_id, kelas_list: [] }
          acc[taId].mapel_list.push(mapelEntry)
        }
        if (!mapelEntry.kelas_list.includes(gm.kelas)) mapelEntry.kelas_list.push(gm.kelas)
        return acc
      }, {})
      const mapelList = Object.values(mapelGrouped).sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
      setGuruMapel(mapelList)

      // Init primaryMapelId from existing assignments
      const defaultPrimaryMapelId = g?.guru_mapel?.[0]?.mata_pelajaran_id || ''
      setPrimaryMapelId(defaultPrimaryMapelId)

      // Fetch kode guru per tahun ajaran dari tabel guru_kode_ta
      let kodeTaList = []
      if (row && row.id) {
        const { data: kodeTaData } = await supabase
          .from('guru_kode_ta')
          .select('tahun_ajaran_id, nomor_kode')
          .eq('guru_id', row.id)
        
        // Gabungkan dengan semua tahun ajaran yang ada (tampilkan semua TA meski belum ada kodenya)
        kodeTaList = (tahunAjarans || []).map(ta => {
          const existing = (kodeTaData || []).find(k => k.tahun_ajaran_id === ta.id)
          return {
            tahun_ajaran_id: ta.id,
            tahun_ajaran: ta.nama,
            nomor_kode: existing?.nomor_kode || ''
          }
        }).sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
      } else {
        // Guru baru: siapkan baris kosong untuk semua TA
        kodeTaList = (tahunAjarans || []).map(ta => ({
          tahun_ajaran_id: ta.id,
          tahun_ajaran: ta.nama,
          nomor_kode: ''
        })).sort((a, b) => (b.tahun_ajaran || '').localeCompare(a.tahun_ajaran || ''))
      }
      setGuruKodeTa(kodeTaList)

      const formState = {
        isNew: !row,
        row: row,
        id: row?.id,
        foreign_id: row?.foreign_id || '',
        kode: g?.kode || '',
        nama: row?.nama || '',
        username: row?.hasAkun ? row.username : '',
        password: '',
        hasAkun: row?.hasAkun || false,
        akun_id: row?.akun_id,
        foto_url: row?.foto_url || null,
        akun_status: row?.hasAkun ? row.status : 'aktif',
        no_hp: g?.no_hp || '',
        role_ids: g?.guru_role?.map(r => r.role_id) || [],
        kelas_assigned: g?.guru_kelas?.filter(k => k.tahun_ajaran_id === activeTa?.id).map(k => k.kelas) || [],
        mapel_assigned: Object.entries((g?.guru_mapel?.filter(m => m.tahun_ajaran_id === activeTa?.id) || []).reduce((acc, m) => {
          if (!acc[m.mata_pelajaran_id]) acc[m.mata_pelajaran_id] = []
          acc[m.mata_pelajaran_id].push(m.kelas)
          return acc
        }, {})).map(([mapel_id, kelas_list]) => ({ mapel_id, kelas_list }))
      }
      setBiodataForm(formState)
      setInitialFormSnapshot({
        biodataForm: JSON.parse(JSON.stringify(formState)),
        studentEnrollments: [],
        guruWaliKelas: JSON.parse(JSON.stringify(waliList)),
        guruBK: JSON.parse(JSON.stringify(bkList)),
        guruMapel: JSON.parse(JSON.stringify(mapelList)),
        guruKodeTa: JSON.parse(JSON.stringify(kodeTaList))
      })
    }
    setShowBiodataModal(true)
  }

  const formatPhoneNumber = (phone) => {
    if (!phone) return ''
    let clean = String(phone).replace(/\D/g, '')
    if (clean.startsWith('6208')) {
      clean = '628' + clean.substring(4)
    } else if (clean.startsWith('08')) {
      clean = '628' + clean.substring(2)
    } else if (clean.startsWith('8')) {
      clean = '628' + clean.substring(1)
    }
    return clean
  }

  const handleSaveBiodata = async (e) => {
    e.preventDefault()

    // Show change summary confirmation (only for edits, not new records)
    if (!biodataForm.isNew) {
      const changesList = getUnsavedChangesList()
      if (changesList.length > 0) {
        const confirmed = await requestConfirm({
          title: 'Konfirmasi Simpan',
          message: 'Data berikut akan disimpan. Pastikan perubahan sudah benar.',
          details: changesList,
          confirmLabel: 'Ya, Simpan',
          cancelLabel: 'Batal',
          confirmColor: 'indigo',
          icon: 'info',
        })
        if (!confirmed) return
      }
    }

    setIsProcessing(true)
    setProgressText("Menyimpan data...")

    try {
      let f_id = String(biodataForm.foreign_id || '').trim()
      
      // 1. Save Biodata
      if (activeTab === 'murid' || activeTab === 'orang_tua') {
        if (!biodataForm.foreign_id) throw new Error("NISN harus diisi!")
        
        // Panggil RPC jika NISN berubah
        if (!biodataForm.isNew && biodataForm.original_foreign_id && biodataForm.foreign_id !== biodataForm.original_foreign_id) {
          const { error: rpcError } = await supabase.rpc('update_siswa_nisn', {
            old_nisn: biodataForm.original_foreign_id,
            new_nisn: biodataForm.foreign_id
          })
          if (rpcError) throw new Error("Gagal memigrasikan NISN: " + rpcError.message)
          // Sinkronkan NISN di seluruh tabel (Tabungan, Akun Pengguna, SPP, Presensi, Nilai, dll)
          await syncAllTablesNisn(biodataForm.original_foreign_id, biodataForm.foreign_id)
        }
        
        let uNameSiswa = activeTab === 'murid' ? biodataForm.username_siswa : biodataForm.username;
        let pWordSiswa = biodataForm.password ? biodataForm.password : (biodataForm.isNew && !biodataForm.hasAkun ? '123456' : undefined);

        // Bersihkan dan format array kontak orang tua
        const cleanKontakOrtu = (biodataForm.kontak_ortu || []).map(k => ({
          tag: k.tag || 'Orang Tua',
          nama: (k.nama || '').trim(),
          nomor: formatPhoneNumber(k.nomor) || String(k.nomor || '').replace(/\D/g, '')
        })).filter(k => k.nomor || k.nama)

        const primaryOrtu = cleanKontakOrtu.length > 0 ? cleanKontakOrtu[0] : null
        const primaryOrtuPhone = primaryOrtu?.nomor || formatPhoneNumber(biodataForm.no_hp_ortu) || null
        const primaryOrtuName = primaryOrtu?.nama || biodataForm.nama_ortu || null

        if (activeTab === 'murid') {
          const combinedAlamat = combineAlamatAndRtRw(biodataForm.alamat, biodataForm.rt_rw);
          const siswaPayload = {
            nisn: biodataForm.foreign_id,
            nama_lengkap: biodataForm.nama,
            ...(biodataForm.jenis_kelamin ? { jenis_kelamin: biodataForm.jenis_kelamin } : {}),
            tempat_lahir: biodataForm.tempat_lahir || null,
            tanggal_lahir: biodataForm.tanggal_lahir || null,
            alamat: combinedAlamat || null,
            kelurahan: biodataForm.kelurahan || null,
            kecamatan: biodataForm.kecamatan || null,
            kota: biodataForm.kota || null,
            no_hp: formatPhoneNumber(biodataForm.no_hp) || formatPhoneNumber(biodataForm.no_whatsapp) || null,
            telegram_ortu: biodataForm.telegram_ortu || null,
            no_whatsapp: formatPhoneNumber(biodataForm.no_whatsapp) || null,
            kontak_ortu: cleanKontakOrtu,
            no_hp_ortu: primaryOrtuPhone,
            email_ortu: biodataForm.email_ortu || null,
            nama_ortu: primaryOrtuName,
            email_aktif: biodataForm.email_aktif || null
          }
          if (pWordSiswa !== undefined) siswaPayload.kode_akses = pWordSiswa;

          // Upsert Siswa
          await supabase.from('siswa_permanent').upsert(siswaPayload, { onConflict: 'nisn' })

          // Sync Enrollments
          await supabase.from('enrollment').delete().eq('nisn', biodataForm.foreign_id)
          if (studentEnrollments.length > 0) {
            const insertData = studentEnrollments.map(enrol => {
               const taName = enrol.tahun_ajaran?.nama || '';
               return {
                 kode: `${enrol.kelas}_${biodataForm.foreign_id}_${taName.replace('/', '_')}`,
                 nisn: biodataForm.foreign_id,
                 kelas: enrol.kelas,
                 tahun_ajaran_id: enrol.tahun_ajaran_id
               }
            })
            await supabase.from('enrollment').insert(insertData)
          }
        } else if (activeTab === 'orang_tua') {
          const ortuPayload = {
            kontak_ortu: cleanKontakOrtu,
            no_hp_ortu: primaryOrtuPhone,
            nama_ortu: primaryOrtuName,
            email_ortu: biodataForm.email_ortu || null
          }
          if (uNameSiswa) ortuPayload.ortu_username = uNameSiswa;
          if (pWordSiswa !== undefined) ortuPayload.ortu_password = pWordSiswa;

          await supabase.from('siswa_permanent').update(ortuPayload).eq('nisn', biodataForm.foreign_id)
        }
      } else {
        // Upsert Guru
        if (!biodataForm.kode) throw new Error("Kode Guru harus diisi!")
        
        const waliKelasRoleId = roles.find(r => r.nama?.toLowerCase() === 'wali kelas')?.id
        if (waliKelasRoleId && biodataForm.role_ids.includes(waliKelasRoleId)) {
          const totalWaliKelas = guruWaliKelas.reduce((acc, wk) => acc + wk.kelas_list.length, 0)
          if (totalWaliKelas === 0) {
            throw new Error("Sebagai Wali Kelas, Anda harus menugaskan minimal 1 kelas. Jika tidak jadi, silakan hapus centang role Wali Kelas atau batalkan edit.")
          }
        }

        const guruPayload = { 
          kode: biodataForm.kode, 
          nama_guru: biodataForm.nama,
          no_hp: formatPhoneNumber(biodataForm.no_hp) || null
        }
        // Sinkronkan user_name di tabel guru dengan username yang diisi admin (tanpa domain)
        if (biodataForm.username && biodataForm.username !== '(Belum punya akun)') {
          const cleanName = biodataForm.username.includes('@') 
            ? biodataForm.username.split('@')[0] 
            : biodataForm.username
          guruPayload.user_name = cleanName
        }
        // Jika password diisi di form, sinkronkan juga kolom plain-text kode_akses di tabel guru
        if (biodataForm.password) {
          guruPayload.kode_akses = biodataForm.password
        }

        if (biodataForm.isNew) {
          const { data, error } = await supabase.from('guru').insert([guruPayload]).select()
          if (error) throw error
          f_id = data[0].id.toString()
          biodataForm.id = data[0].id
        } else {
          const { error: guruUpdateErr } = await supabase.from('guru').update(guruPayload).eq('id', biodataForm.id)
          if (guruUpdateErr) throw new Error('Gagal update data guru: ' + guruUpdateErr.message)
          f_id = biodataForm.id.toString()
        }

        // Sync Roles
        await supabase.from('guru_role').delete().eq('guru_id', biodataForm.id)
        if (biodataForm.role_ids.length > 0) {
          await supabase.from('guru_role').insert(biodataForm.role_ids.map(rid => ({ guru_id: biodataForm.id, role_id: rid })))
        }

        // Sync Wali Kelas (max 1 per TA)
        await supabase.from('guru_kelas').delete().eq('guru_id', biodataForm.id)
        const waliInserts = []
        guruWaliKelas.forEach(wk => {
          const kelasTerpilih = wk.kelas_list[0]
          if (kelasTerpilih) {
            waliInserts.push({ guru_id: biodataForm.id, kelas: kelasTerpilih, tahun_ajaran_id: wk.tahun_ajaran_id })
          }
        })
        if (waliInserts.length > 0) await supabase.from('guru_kelas').insert(waliInserts)

        // Sync BK
        await supabase.from('guru_bk').delete().eq('guru_id', biodataForm.id)
        const bkInserts = []
        guruBK.forEach(bk => {
          bk.kelas_list.forEach(k => {
            bkInserts.push({ guru_id: biodataForm.id, kelas: k, tahun_ajaran_id: bk.tahun_ajaran_id })
          })
        })
        if (bkInserts.length > 0) await supabase.from('guru_bk').insert(bkInserts)

        // Sync Mapel across ALL TAs
        // Validasi: pastikan tidak ada kelas yang sudah dipakai guru lain untuk mapel yang sama
        const conflictErrors = []
        guruMapel.forEach(gm => {
          gm.mapel_list.forEach(ml => {
            if (!ml.mapel_id) return
            ml.kelas_list.forEach(k => {
              const conflict = guruList.find(g =>
                g.id !== biodataForm.id &&
                g.guru_mapel?.some(gMapel =>
                  gMapel.tahun_ajaran_id === gm.tahun_ajaran_id &&
                  gMapel.mata_pelajaran_id === ml.mapel_id &&
                  gMapel.kelas === k
                )
              )
              if (conflict) conflictErrors.push(`Kelas ${k} (TA: ${gm.tahun_ajaran}) sudah diampu oleh ${conflict.nama_guru}`)
            })
          })
        })
        if (conflictErrors.length > 0) {
          throw new Error(`Konflik penugasan mapel:\n${conflictErrors.slice(0, 5).join('\n')}${conflictErrors.length > 5 ? `\n...dan ${conflictErrors.length - 5} konflik lainnya` : ''}`)
        }

        await supabase.from('guru_mapel').delete().eq('guru_id', biodataForm.id)
        const mapelInserts = []
        guruMapel.forEach(gm => {
          gm.mapel_list.forEach(ml => {
            if (!ml.mapel_id) return
            ml.kelas_list.forEach(k => {
              mapelInserts.push({ guru_id: biodataForm.id, mata_pelajaran_id: ml.mapel_id, kelas: k, tahun_ajaran_id: gm.tahun_ajaran_id })
            })
          })
        })
        if (mapelInserts.length > 0) await supabase.from('guru_mapel').insert(mapelInserts)

        // Sync Kode Guru per Tahun Ajaran (untuk kebutuhan jadwal pelajaran)
        const guruId = biodataForm.id
        const kodeUpserts = guruKodeTa
          .filter(k => k.nomor_kode && k.nomor_kode.toString().trim() !== '')
          .map(k => ({
            guru_id: guruId,
            tahun_ajaran_id: k.tahun_ajaran_id,
            nomor_kode: k.nomor_kode.toString().trim()
          }))
        await supabase.from('guru_kode_ta').delete().eq('guru_id', guruId)
        if (kodeUpserts.length > 0) {
          await supabase.from('guru_kode_ta').insert(kodeUpserts)
        }
      }

      // 2. Save Akun Pengguna
      const targetUsername = activeTab === 'murid' ? biodataForm.username_siswa : biodataForm.username;
      
      if (targetUsername) { // Only create/update akun if username is provided
        let uName = targetUsername;
        const roleName = activeTab === 'orang_tua' ? 'orang_tua' : (activeTab === 'murid' ? 'murid' : activeTab)
        
        // Selalu potong domain dari username sebelum dikirim ke DB
        // Ini penting agar auth.users email tersimpan sebagai: username@ebudimulia.local (bukan username@gmail.com@ebudimulia.local)
        const cleanUsernameForAkun = uName.includes('@') ? uName.split('@')[0].toLowerCase() : uName.toLowerCase()
        const cleanFId = String(f_id || '').trim()

        // Cari tahu akun_id: pertama dari state, jika tidak ada cek langsung ke akun_pengguna untuk menghindari duplicate key
        let resolvedAkunId = (biodataForm.hasAkun && biodataForm.akun_id) ? biodataForm.akun_id : null;
        if (!resolvedAkunId && cleanFId) {
          const { data: directAkun } = await supabase
            .from('akun_pengguna')
            .select('id')
            .eq('role', roleName)
            .eq('foreign_id', cleanFId)
            .maybeSingle()
          if (directAkun?.id) {
            resolvedAkunId = directAkun.id;
          }
        }

        if (resolvedAkunId) {
          // Panggil RPC untuk sinkronisasi username ke akun_pengguna DAN auth.users sekaligus
          const { data: updateResult, error: updateErr } = await supabase.rpc('admin_update_username', {
            p_akun_id: resolvedAkunId,
            p_new_username: cleanUsernameForAkun
          })
          if (updateErr || !updateResult?.ok) {
            throw new Error('Gagal update username: ' + (updateResult?.msg || updateErr?.message))
          }

          // Update status akun
          await supabase.from('akun_pengguna').update({
            status: biodataForm.akun_status
          }).eq('id', resolvedAkunId)

          // Jika ada password baru, panggil RPC reset password
          if (biodataForm.password) {
            const { data: resetResult, error: resetErr } = await supabase.rpc('admin_reset_password', {
              p_akun_id: resolvedAkunId,
              p_new_password: biodataForm.password
            })
            if (resetErr || !resetResult?.ok) throw new Error(resetResult?.msg || resetErr?.message || "Gagal mereset password")
          }

        } else {
          // Buat akun baru via secure RPC admin_create_user
          // Kirim username yang sudah di-strip domain-nya agar konsisten dengan auth.users
          const pWord = biodataForm.password || '123456'
          const { data: createResult, error: createErr } = await supabase.rpc('admin_create_user', {
            p_username: cleanUsernameForAkun,
            p_password: pWord,
            p_role: roleName,
            p_foreign_id: cleanFId,
            p_status: biodataForm.akun_status
          })
          if (createErr || !createResult?.ok) throw new Error(createResult?.msg || createErr?.message || "Gagal membuat akun")
        }

        // Auto-generate Akun Orang Tua jika tipenya Murid (meniru angka acak username siswa)
        if (activeTab === 'murid') {
          const studentUsername = biodataForm.username_siswa || '';
          let ortuSuffix = '';
          if (studentUsername.startsWith('ebmsiswa.')) {
            ortuSuffix = studentUsername.substring('ebmsiswa.'.length); // mengambil 'anselmus845'
          } else {
            ortuSuffix = studentUsername.includes('@') ? studentUsername.split('@')[0] : studentUsername;
          }
          
          if (!ortuSuffix) {
            const firstName = (biodataForm.nama || '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
            const randomDigits = generateRandom3Digits();
            ortuSuffix = `${firstName}${randomDigits}`;
          }
          
          const ortuUsername = `ebmortu.${ortuSuffix}`
          const ortuPassword = Math.random().toString(36).substring(2, 8).toUpperCase() // 6 karakter acak
          
          // Cek apakah akun ortu untuk foreign_id ini sudah ada
          const { data: existingOrtu } = await supabase
            .from('akun_pengguna')
            .select('id')
            .eq('foreign_id', cleanFId)
            .eq('role', 'orang_tua')
            .maybeSingle()

          if (existingOrtu) {
            // Akun ortu sudah ada — update username & status saja, JANGAN reset password yang sudah aktif!
            await supabase.rpc('admin_update_username', {
              p_akun_id: existingOrtu.id,
              p_new_username: ortuUsername
            })

            await supabase.from('akun_pengguna').update({
              status: biodataForm.akun_status
            }).eq('id', existingOrtu.id)

            await supabase.from('siswa_permanent').update({
              ortu_username: ortuUsername
            }).eq('nisn', cleanFId)
          } else {
            // Hanya buat password baru jika akun ortu memang BELUM PERNAH ADA
            const ortuPassword = Math.random().toString(36).substring(2, 8).toUpperCase() // 6 karakter acak
            const { data: ortuResult, error: ortuErr } = await supabase.rpc('admin_create_user', {
              p_username: ortuUsername,
              p_password: ortuPassword,
              p_role: 'orang_tua',
              p_foreign_id: cleanFId,
              p_status: biodataForm.akun_status
            })
            if (ortuErr || !ortuResult?.ok) throw new Error(ortuResult?.msg || ortuErr?.message || "Gagal membuat akun orang tua")

            await supabase.from('siswa_permanent').update({
              ortu_username: ortuUsername,
              ortu_password: ortuPassword
            }).eq('nisn', cleanFId)
          }
        }
      }

      setShowBiodataModal(false)
      fetchData()
      onRefresh?.()
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

  const handleRapihkanKode = async () => {
    if (!activeTa) return
    const confirmed = await requestConfirm({
      title: 'Rapihkan Kode Siswa?',
      message: `Apakah Anda yakin ingin merapihkan ulang seluruh kode PDF siswa di tahun ajaran ${activeTa.nama} berdasarkan urutan abjad?\n\nJangan khawatir, semua file PDF yang sudah terupload akan otomatis menyesuaikan diri!`,
      confirmLabel: 'Rapihkan Kode',
      confirmColor: 'indigo',
      icon: 'warning',
    })
    if (!confirmed) return
    
    setIsProcessing(true)
    try {
      const activeStudents = students.filter(s => s.tahun_ajaran_id === activeTa.id)
      const sorted = [...activeStudents].sort((a, b) => {
        const classA = a.kelas || ''
        const classB = b.kelas || ''
        if (classA !== classB) return classA.localeCompare(classB)
        return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
      })

      let currentClass = null
      let currentAbsen = 1
      const payload = []

      const formattedTa = activeTa.nama.replace('/', '_')

      sorted.forEach((s) => {
        if (s.kelas !== currentClass) {
          currentClass = s.kelas
          currentAbsen = 1
        }
        const absen = currentAbsen++
        const newKode = `${s.kelas}${absen}${formattedTa}`

        if (s.kode !== newKode) {
          payload.push({
            nisn: s.nisn,
            tahun_ajaran_id: activeTa.id,
            new_kode: newKode
          })
        }
      })

      if (payload.length > 0) {
        // Chunk array to prevent payload too large
        for (let i = 0; i < payload.length; i += 500) {
          const chunk = payload.slice(i, i + 500)
          const { error } = await supabase.rpc('batch_update_enrollment_kode', { payload: chunk })
          if (error) throw error
        }
        alert(`Berhasil merapihkan ${payload.length} kode siswa!`)
        onRefresh?.()
        fetchData()
      } else {
        alert('Semua kode siswa sudah rapi!')
      }
    } catch (err) {
      alert('Gagal merapihkan kode: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportExcel = async (choice) => {
    setShowExportModal(false)
    setIsProcessing(true)
    setProgressText('Menyiapkan file Excel...')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      const taSuffix = activeTa?.nama ? `_${activeTa.nama.replace(/\//g, '_')}` : ''

      if (choice === '1' || choice === '3') {
        const sortedFilteredMurid = [...students]
          .filter(s => {
            if (activeTa?.id) {
              return (s.tahun_ajaran_id === activeTa.id || s.tahun_ajaran === activeTa.nama) && s.is_aktif !== false
            }
            return s.is_aktif !== false
          })
          .sort((a, b) => {
            const classA = a.kelas || ''
            const classB = b.kelas || ''
            if (classA !== classB) return classA.localeCompare(classB)
            return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
          })

        // Deduplikasi berdasarkan NISN agar tidak ada siswa berulang
        const seenNisns = new Set()
        const uniqueFilteredMurid = sortedFilteredMurid.filter(s => {
          const nisn = String(s.nisn || s.id || '').trim()
          if (!nisn) return true
          if (seenNisns.has(nisn)) return false
          seenNisns.add(nisn)
          return true
        })

        if (uniqueFilteredMurid.length === 0 && activeTa) {
          alert(`Tidak ditemukan data siswa aktif pada tahun ajaran ${activeTa.nama}.`)
        }

        // Ambil semua data siswa_permanent untuk kolom yang tidak ada di view siswa_lengkap
        setProgressText('Mengambil data lengkap siswa...')
        const allNisns = uniqueFilteredMurid.map(s => s.nisn)
        const { data: permDataAll } = await supabase
          .from('siswa_permanent')
          .select('nisn, email_aktif, kode_akses, telegram_ortu, ortu_username, ortu_password, no_hp_ortu, email_ortu, nama_ortu, tahun_lulus, jenis_kelamin, no_whatsapp, nipd, tempat_lahir, tanggal_lahir, alamat, kelurahan, kecamatan, kota, kontak_ortu, no_hp')
          .in('nisn', allNisns)
        const permMap = new Map((permDataAll || []).map(p => [p.nisn, p]))

        // Ambil akun login siswa dari akun_pengguna untuk mengisi kolom Username Siswa
        const { data: akunSiswaAll } = await supabase
          .from('akun_pengguna')
          .select('foreign_id, username')
          .eq('role', 'murid')
          .in('foreign_id', allNisns)
        const akunMap = new Map((akunSiswaAll || []).map(a => [a.foreign_id, a.username]))

        let currentClass = null
        let currentAbsen = 1

        const dataMurid = uniqueFilteredMurid.map(s => {
          if (s.kelas !== currentClass) {
            currentClass = s.kelas
            currentAbsen = 1
          }
          const absen = currentAbsen++
          const perm = permMap.get(s.nisn) || {}

          // Ekstrak kontak ortu terpisah (Ayah, Ibu, Wali, Orang Tua)
          const kontakList = Array.isArray(perm.kontak_ortu) ? perm.kontak_ortu : (Array.isArray(s.kontak_ortu) ? s.kontak_ortu : [])
          const kontakAyah = kontakList.find(k => k.tag?.toLowerCase() === 'ayah')
          const kontakIbu  = kontakList.find(k => k.tag?.toLowerCase() === 'ibu')
          const kontakWali = kontakList.find(k => k.tag?.toLowerCase() === 'wali')
          const kontakOrtu = kontakList.find(k => k.tag?.toLowerCase() === 'orang tua')

          const namaAyah = kontakAyah?.nama || ''
          const noHpAyah = cleanPhone(kontakAyah?.nomor) || ''
          const namaIbu  = kontakIbu?.nama  || ''
          const noHpIbu  = cleanPhone(kontakIbu?.nomor)  || ''
          const namaWali = kontakWali?.nama || ''
          const noHpWali = cleanPhone(kontakWali?.nomor) || ''
          const noHpOrtu = cleanPhone(kontakOrtu?.nomor || perm.no_hp_ortu || s.no_hp_ortu) || ''
          const namaOrtu = kontakOrtu?.nama || perm.nama_ortu || s.nama_ortu || ''

          let tglStr = ''
          const rawTgl = perm.tanggal_lahir || s.tanggal_lahir
          if (rawTgl) {
            try {
              tglStr = new Date(rawTgl).toISOString().split('T')[0]
            } catch {
              tglStr = String(rawTgl)
            }
          }

          return {
            'No Absen':           absen,
            'KODE PDF (PENTING)': s.kode || '',
            'NISN':               s.nisn,
            'NIPD':               perm.nipd || s.nipd || '',
            'Nama Lengkap':       s.nama_lengkap || '',
            'Jenis Kelamin':      perm.jenis_kelamin || s.jenis_kelamin || '',
            'Kelas':              s.kelas || '',
            'Tahun Ajaran':       s.tahun_ajaran || activeTa?.nama || '',
            'Tahun Lulus':        perm.tahun_lulus || '',

            // --- Biodata & Kartu Pelajar (Terpisah) ---
            'Tempat Lahir':       perm.tempat_lahir || s.tempat_lahir || '',
            'Tanggal Lahir':      tglStr,
            'Alamat':             perm.alamat || s.alamat || '',
            'Kelurahan':          perm.kelurahan || s.kelurahan || '',
            'Kecamatan':          perm.kecamatan || s.kecamatan || '',
            'Kota':               perm.kota || s.kota || '',

            // --- Kontak Siswa ---
            'No HP Siswa':        cleanPhone(perm.no_whatsapp || s.no_whatsapp || perm.no_hp || s.no_hp) || '',
            'Email Siswa':        perm.email_aktif || s.email_aktif || '',
            'Username Siswa':     akunMap.get(s.nisn) || '',
            'Kode Akses':         perm.kode_akses || s.kode_akses || '',

            // --- Kontak Orang Tua / Wali (Terpisah Lengkap) ---
            'Nama Ayah':          namaAyah,
            'No HP Ayah':         noHpAyah,
            'Nama Ibu':           namaIbu,
            'No HP Ibu':          noHpIbu,
            'Nama Wali':          namaWali,
            'No HP Wali':         noHpWali,
            'Nama Orang Tua':     namaOrtu,
            'No HP Orang Tua':    noHpOrtu,
            'Email Orang Tua':    perm.email_ortu || s.email_ortu || '',
            'Telegram Orang Tua': perm.telegram_ortu || s.telegram_ortu || '',

            // --- Akun Login Orang Tua ---
            'Username Orang Tua': perm.ortu_username || s.ortu_username || '',
            'Password Orang Tua': perm.ortu_password || s.ortu_password || '',
          }
        })
        const wsMurid = XLSX.utils.json_to_sheet(dataMurid)
        XLSX.utils.book_append_sheet(wb, wsMurid, 'Data Murid')
      }

      if (choice === '2' || choice === '3') {
        const { data: gurus } = await supabase.from('guru').select('*, guru_role(role_id), guru_kelas(kelas), guru_mapel(mata_pelajaran_id, kelas)')
        const { data: rolesData } = await supabase.from('roles').select('*')
        
        const dataGuru = (gurus || []).map((g, i) => {
          const roleNames = g.guru_role?.map(gr => rolesData?.find(r => r.id === gr.role_id)?.nama).filter(Boolean).join(', ') || ''
          const kelasAjar = g.guru_kelas?.map(gk => gk.kelas).join(', ') || ''
          return {
            'ID Guru': g.id || '',
            'No': i + 1,
            'Kode Guru': g.kode || '',
            'Nama Guru': g.nama_guru || '',
            'Username': g.user_name || '',
            'Role/Jabatan': roleNames,
            'Kelas Wali/Ajar': kelasAjar,
            'No HP': g.no_hp || '',
            'Email': g.email || ''
          }
        })
        const wsGuru = XLSX.utils.json_to_sheet(dataGuru)
        XLSX.utils.book_append_sheet(wb, wsGuru, 'Data Guru & Staff')
      }

      if (choice === '4') {
        const sortedFilteredMurid = [...students]
          .filter(s => {
            if (activeTa?.id) {
              return (s.tahun_ajaran_id === activeTa.id || s.tahun_ajaran === activeTa.nama) && s.is_aktif !== false
            }
            return s.is_aktif !== false
          })
          .sort((a, b) => {
            const classA = a.kelas || ''
            const classB = b.kelas || ''
            if (classA !== classB) return classA.localeCompare(classB)
            return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
          })

        const seenNisns = new Set()
        const uniqueFilteredMurid = sortedFilteredMurid.filter(s => {
          const nisn = String(s.nisn || s.id || '').trim()
          if (!nisn) return true
          if (seenNisns.has(nisn)) return false
          seenNisns.add(nisn)
          return true
        })

        const dataNisn = uniqueFilteredMurid.map(s => {
          return {
            'NISN Lama': s.nisn,
            'NISN Baru': '',
            'Nama Siswa': s.nama_lengkap,
            'Kelas': s.kelas || ''
          }
        })
        const wsNisn = XLSX.utils.json_to_sheet(dataNisn)
        XLSX.utils.book_append_sheet(wb, wsNisn, 'Template Migrasi NISN')
      }

      if (choice === '5') {
        setShowExportModal(false)
        const activeOnly = (students || []).filter(s => {
          if (activeTa?.id) {
            return (s.tahun_ajaran_id === activeTa.id || s.tahun_ajaran === activeTa.nama) && s.is_aktif !== false
          }
          return s.is_aktif !== false
        })
        await downloadStudentTemplateExcel(activeOnly, `Template_Siswa_Dan_Alamat${taSuffix}.xlsx`)
        return
      }

      let filename = `Export_Data_Pengguna${taSuffix}.xlsx`
      if (choice === '1') filename = `Export_Data_Murid${taSuffix}.xlsx`
      if (choice === '2') filename = 'Export_Data_Guru.xlsx'
      if (choice === '3') filename = `Export_Semua_Data${taSuffix}.xlsx`
      if (choice === '4') filename = `Template_Update_NISN${taSuffix}.xlsx`
      await downloadWorkbook(wb, filename)

    } catch (err) {
      alert('Gagal export: ' + err.message)
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  const handleMassPhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const confirmed = await requestConfirm({
      title: 'Upload Foto Massal?',
      message: `Akan mengunggah ${files.length} foto. Pastikan nama file adalah ${activeTab === 'murid' ? 'NISN' : 'KODE GURU'}. Lanjutkan?`,
      confirmLabel: 'Upload Foto',
      confirmColor: 'indigo',
      icon: 'info',
    })
    if (!confirmed) return

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
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { alert("File Excel kosong"); setIsProcessing(false); return }

      const defaultRole = roles.find(r => r.nama.toLowerCase() === 'guru')
      let successCount = 0, errorCount = 0

      for (const row of data) {
        const id = String(row.id || row.ID || row['ID Guru'] || '').trim()
        const kode = String(row.kode || row.KODE || row['Kode Guru'] || '').trim()
        const nama = String(row.nama_guru || row['NAMA GURU'] || row.nama || row['Nama Guru'] || '').trim()
        const username = String(row.user_name || row.username || row.Username || row['Username'] || '').trim()
        const email = String(row.email || row.Email || row['Email'] || '').trim()
        const no_hp = String(row.no_hp || row['No HP'] || row['NO HP'] || row['No. HP'] || row['NO. HP'] || '').trim()
        
        if (!kode || !nama) continue
        
        const payload = { kode, nama_guru: nama }
        const cleanNoHp = formatPhoneNumber(no_hp)
        if (cleanNoHp) payload.no_hp = cleanNoHp
        
        const finalUsername = username || email
        if (finalUsername) payload.user_name = finalUsername
        
        // Match existing record by ID (most reliable), then Kode, then Username, then Name
        let exist = null
        if (id) {
          const { data: res } = await supabase.from('guru').select('id').eq('id', id).maybeSingle()
          exist = res
        }
        if (!exist && kode) {
          const { data: res } = await supabase.from('guru').select('id').eq('kode', kode).maybeSingle()
          exist = res
        }
        if (!exist && finalUsername) {
          const { data: res } = await supabase.from('guru').select('id').eq('user_name', finalUsername).maybeSingle()
          exist = res
        }
        if (!exist && nama) {
          const { data: res } = await supabase.from('guru').select('id').eq('nama_guru', nama).maybeSingle()
          exist = res
        }
        
        let guruId
        
        const applyAkunPengguna = async (gId) => {
          if (!finalUsername) return
          let uName = finalUsername;
          const { data: akunExist } = await supabase.from('akun_pengguna').select('id').eq('foreign_id', gId.toString()).eq('role', 'guru').maybeSingle()
          if (akunExist) {
             await supabase.from('akun_pengguna').update({ username: uName }).eq('id', akunExist.id)
          } else {
             await supabase.rpc('admin_create_user', {
               p_username: uName,
               p_password: '123456',
               p_role: 'guru',
               p_foreign_id: gId.toString(),
               p_status: 'aktif'
             })
          }
        }

        if (exist) {
          guruId = exist.id
          const { error } = await supabase.from('guru').update(payload).eq('id', guruId)
          await applyAkunPengguna(guruId)
          if (error) errorCount++; else successCount++
        } else {
          const { data: newGuru, error } = await supabase.from('guru').insert([payload]).select()
          if (error) { errorCount++; continue }
          guruId = newGuru[0].id
          await applyAkunPengguna(guruId)
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

  // --- EXCEL IMPORT (Siswa Only) ---
  const handleCsvImportSiswa = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true); setProgressText("Memproses Excel Siswa...")

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { alert("File Excel kosong"); setIsProcessing(false); return }

      let successCount = 0, errorCount = 0
      const validRows = []

      for (const row of data) {
        const nisn = String(row.nisn || row.NISN || row['Nisn'] || '').trim()
        const nama = toTitleCase(String(
          row.nama_lengkap || 
          row.nama || 
          row['NAMA LENGKAP'] || 
          row['Nama Lengkap'] || 
          row['NAMA'] || 
          row['Nama'] || 
          ''
        ))
        const kelas = String(
          row.kelas || 
          row.KELAS || 
          row['Kelas'] || 
          row['kelas sekarang'] || 
          row['KELAS SEKARANG'] || 
          row['Kelas Sekarang'] || 
          ''
        ).trim()
        const telegram = String(
          row['Telegram Orang Tua'] ??
          row.telegram_ortu ?? 
          row['TELEGRAM ORTU'] ?? 
          row['Telegram Ortu'] ?? 
          row.telegram ?? 
          row.Telegram ?? 
          ''
        ).trim()
        const whatsapp = formatPhoneNumber(
          row['No HP Siswa'] ??
          row['NO HP SISWA'] ??
          row['No WhatsApp Siswa'] ??
          row['NO WHATSAPP SISWA'] ??
          row.no_whatsapp ?? 
          row['NO WHATSAPP'] ?? 
          row['No Whatsapp'] ?? 
          row['NO. WHATSAPP'] ?? 
          row['No. Whatsapp'] ?? 
          row.whatsapp ?? 
          row.Whatsapp ?? 
          row['No Telp'] ?? 
          row['No. Telp'] ?? 
          row.no_telp ?? 
          row.no_hp ??
          row.WA ?? 
          row.wa ?? 
          ''
        )
        const noHpOrtu = formatPhoneNumber(
          row['No HP Orang Tua'] ??
          row.no_hp_ortu ??
          row['No HP Ortu'] ??
          ''
        )
        const emailOrtu = String(row['Email Orang Tua'] ?? row.email_ortu ?? '').trim()
        const namaOrtu = String(row['Nama Orang Tua'] ?? row.nama_ortu ?? '').trim()
        const tahunLulus = String(row['Tahun Lulus'] ?? row.tahun_lulus ?? '').trim()
        const jkRaw = String(
          row.jenis_kelamin ||
          row['Jenis Kelamin'] ||
          row['JENIS KELAMIN'] ||
          row['jenis kelamin'] ||
          row.JK ||
          row.jk ||
          ''
        ).trim().toUpperCase()
        const jk = jkRaw.startsWith('L') ? 'L' : jkRaw.startsWith('P') ? 'P' : null

        // Baca Email Siswa (Gmail) dari Excel
        const _emailRaw = (
          row['Email Siswa'] ?? row['EMAIL SISWA'] ??
          row['Email'] ?? row.Email ?? row.email ?? row.EMAIL ??
          ''
        )
        const emailSiswa = String(_emailRaw).trim().toLowerCase()

        // Baca Username Siswa dari Excel (biarkan kosong jika tidak diisi agar username lama tidak berubah)
        const _uNameRaw = (
          row['Username Siswa'] ?? row['USERNAME SISWA'] ??
          row['Username'] ?? row.Username ?? row.username ?? row.USERNAME ??
          ''
        )
        const usernameSiswa = String(_uNameRaw).trim()

        // Baca password/kode_akses siswa dari Excel
        const _pwRaw = (
          row['Kode Akses'] ?? row['kode_akses'] ??
          row['Password / Kode Akses'] ??
          row.password ?? row.Password ?? row.PASSWORD ??
          row['KODE AKSES'] ?? row['kode akses'] ??
          ''
        )
        const passwordSiswa = String(_pwRaw).trim()

        // Baca Username Orang Tua dan Password Orang Tua dari Excel
        const _uNameOrtuRaw = (
          row['Username Orang Tua'] ?? row['USERNAME ORANG TUA'] ??
          row['Username Ortu'] ?? row.ortu_username ??
          ''
        )
        const usernameOrtu = String(_uNameOrtuRaw).trim()

        const _pwOrtuRaw = (
          row['Password Orang Tua'] ?? row['PASSWORD ORANG TUA'] ??
          row['Password Ortu'] ?? row.ortu_password ??
          ''
        )
        const passwordOrtu = String(_pwOrtuRaw).trim()

        // Baca Tempat & Tanggal Lahir
        const tempatLahir = toTitleCase(String(row['TEMPAT LAHIR'] ?? row['Tempat Lahir'] ?? row.tempat_lahir ?? row.tempat ?? '').trim())
        const tanggalLahir = parseDateToIso(row['TANGGAL LAHIR'] ?? row['Tanggal Lahir'] ?? row.tanggal_lahir ?? row.tgl_lahir ?? '')

        // Baca Alamat Lengkap & RT/RW
        const rtRw = extractRtRwFromRow(row)
        const rawAlamat = String(row['ALAMAT'] ?? row['Alamat'] ?? row['Alamat Lengkap'] ?? row.alamat ?? '').trim()
        const alamatRaw = formatAlamatJalan(rawAlamat)
        const alamat = combineAlamatAndRtRw(alamatRaw, rtRw)
        const kelurahan = toTitleCase(String(row['KELURAHAN'] ?? row['Kelurahan'] ?? row.kelurahan ?? row.desa ?? '').trim())
        const kecamatan = toTitleCase(String(row['KECAMATAN'] ?? row['Kecamatan'] ?? row.kecamatan ?? '').trim())
        const kota = toTitleCase(String(row['KOTA'] ?? row['Kota'] ?? row.kota ?? row.kabupaten ?? '').trim())

        // Baca Kontak Ortu (Ayah, Ibu, Wali)
        const namaAyah = toTitleCase(String(row['NAMA AYAH'] ?? row['Nama Ayah'] ?? row.nama_ayah ?? '').trim())
        const noHpAyah = formatPhoneNumber(row['NO HP AYAH'] ?? row['No HP Ayah'] ?? row.no_hp_ayah ?? '')
        const namaIbu = toTitleCase(String(row['NAMA IBU'] ?? row['Nama Ibu'] ?? row.nama_ibu ?? '').trim())
        const noHpIbu = formatPhoneNumber(row['NO HP IBU'] ?? row['No HP Ibu'] ?? row.no_hp_ibu ?? '')
        const namaWali = toTitleCase(String(row['NAMA WALI'] ?? row['Nama Wali'] ?? row.nama_wali ?? '').trim())
        const noHpWali = formatPhoneNumber(row['NO HP WALI'] ?? row['No HP Wali'] ?? row.no_hp_wali ?? '')

        if (nisn && nama) {
          validRows.push({ 
            nisn, nama, kelas, telegram, whatsapp, noHpOrtu, emailOrtu, namaOrtu, tahunLulus, jk, 
            emailSiswa, usernameSiswa, passwordSiswa, usernameOrtu, passwordOrtu,
            tempatLahir, tanggalLahir, alamat, alamatRaw, rtRw, kelurahan, kecamatan, kota,
            namaAyah, noHpAyah, namaIbu, noHpIbu, namaWali, noHpWali
          })
        }
      }

      if (validRows.length === 0) {
        alert("File Excel kosong atau tidak ada data siswa valid.")
        setIsProcessing(false)
        return
      }

      // Ambil data siswa_permanent saat ini untuk menjaga / menggabungkan kontak_ortu
      const allNisns = validRows.map(r => r.nisn)
      const { data: existingSiswaList } = await supabase
        .from('siswa_permanent')
        .select('nisn, kontak_ortu, no_hp_ortu, nama_ortu, tempat_lahir, tanggal_lahir, alamat, kelurahan, kecamatan, kota')
        .in('nisn', allNisns)

      const existingMap = new Map((existingSiswaList || []).map(s => [String(s.nisn).trim(), s]))

      // Step 1: Bulk Upsert Siswa Permanent (biodata, alamat, kontak ortu)
      setProgressText(`Menyimpan biodata ${validRows.length} siswa...`)
      const payloadSiswaList = validRows.map(r => {
        const old = existingMap.get(r.nisn) || {}
        let kontakList = Array.isArray(old.kontak_ortu) ? [...old.kontak_ortu] : []

        const addOrUpdateKontak = (tag, nama, nomor) => {
          if (!nomor && !nama) return
          const cleanNum = formatPhoneNumber(nomor) || String(nomor || '').replace(/\D/g, '')
          const idx = kontakList.findIndex(k => k.tag?.toLowerCase() === tag.toLowerCase())
          if (idx >= 0) {
            kontakList[idx] = { tag, nama: nama || kontakList[idx].nama || '', nomor: cleanNum || kontakList[idx].nomor || '' }
          } else {
            kontakList.push({ tag, nama: nama || '', nomor: cleanNum || '' })
          }
        }

        if (r.noHpAyah || r.namaAyah) addOrUpdateKontak('Ayah', r.namaAyah, r.noHpAyah)
        if (r.noHpIbu || r.namaIbu) addOrUpdateKontak('Ibu', r.namaIbu, r.noHpIbu)
        if (r.noHpWali || r.namaWali) addOrUpdateKontak('Wali', r.namaWali, r.noHpWali)
        if (r.noHpOrtu && !r.noHpAyah && !r.noHpIbu && !r.noHpWali) {
          addOrUpdateKontak('Orang Tua', r.namaOrtu || 'Orang Tua', r.noHpOrtu)
        }

        const primaryOrtu = kontakList.length > 0 ? kontakList[0] : null
        const primaryOrtuPhone = primaryOrtu?.nomor || r.noHpOrtu || old.no_hp_ortu || null
        const primaryOrtuName = primaryOrtu?.nama || r.namaOrtu || old.nama_ortu || null

        const baseAlamat = r.alamatRaw || old.alamat || ''
        const finalAlamat = combineAlamatAndRtRw(baseAlamat, r.rtRw) || r.alamat || old.alamat || null

        return {
          nisn: r.nisn,
          nama_lengkap: r.nama,
          ...(r.tempatLahir   ? { tempat_lahir: r.tempatLahir }   : {}),
          ...(r.tanggalLahir  ? { tanggal_lahir: r.tanggalLahir } : {}),
          ...(finalAlamat     ? { alamat: finalAlamat }           : {}),
          ...(r.kelurahan     ? { kelurahan: r.kelurahan }         : {}),
          ...(r.kecamatan     ? { kecamatan: r.kecamatan }         : {}),
          ...(r.kota          ? { kota: r.kota }                   : {}),
          ...(r.telegram      ? { telegram_ortu: r.telegram }     : {}),
          ...(r.whatsapp      ? { no_whatsapp: r.whatsapp, no_hp: r.whatsapp } : {}),
          kontak_ortu: kontakList,
          no_hp_ortu: primaryOrtuPhone,
          nama_ortu: primaryOrtuName,
          ...(r.emailOrtu     ? { email_ortu: r.emailOrtu }       : {}),
          ...(r.tahunLulus    ? { tahun_lulus: r.tahunLulus }     : {}),
          ...(r.jk !== null   ? { jenis_kelamin: r.jk }           : {}),
          ...(r.emailSiswa    ? { email_aktif: r.emailSiswa }     : {}),
          ...(r.passwordSiswa ? { kode_akses: r.passwordSiswa }   : {})
        }
      })

      const { error: errSiswa } = await supabase.from('siswa_permanent').upsert(payloadSiswaList, { onConflict: 'nisn' })
      if (errSiswa) {
        throw new Error("Gagal menyimpan data siswa: " + errSiswa.message)
      }

      // Step 2: Bulk Upsert Enrollment (jika ada TA aktif)
      const enrollmentPayloads = []
      if (activeTa) {
        for (const r of validRows) {
          if (r.kelas && r.kelas !== '-') {
            enrollmentPayloads.push({
              kode: `${r.kelas}_${r.nisn}_${activeTa.id}`,
              nisn: r.nisn,
              kelas: r.kelas,
              tahun_ajaran_id: activeTa.id
            })
          }
        }
      }

      if (enrollmentPayloads.length > 0) {
        const { error: errEnrol } = await supabase.from('enrollment').upsert(enrollmentPayloads, { onConflict: 'nisn,tahun_ajaran_id' })
        if (errEnrol) {
          console.error("Gagal melakukan enrollment:", errEnrol)
        }
      }

      // Step 3: Cek akun siswa & orang tua yang sudah ada
      const importNisns = validRows.map(r => r.nisn)
      const { data: existingAkunSiswa } = await supabase
        .from('akun_pengguna')
        .select('id, foreign_id, username')
        .eq('role', 'murid')
        .in('foreign_id', importNisns)

      const { data: existingOrtus } = await supabase
        .from('akun_pengguna')
        .select('id, foreign_id, username')
        .eq('role', 'orang_tua')
        .in('foreign_id', importNisns)

      const akunSiswaMap = new Map((existingAkunSiswa || []).map(a => [a.foreign_id, a]))
      const akunOrtuMap = new Map((existingOrtus || []).map(o => [o.foreign_id, o]))

      // Step 4: Proses akun siswa (buat baru / update username+password jika ada di Excel atau auto generate)
      // Kita proses siswa yang memiliki data email, username di Excel, ATAU siswa yang belum punya akun (agar ter-generate otomatis)
      const siswaToProcess = validRows.filter(r => r.emailSiswa || r.usernameSiswa || !akunSiswaMap.has(r.nisn))
      setProgressText(`Memproses akun untuk ${siswaToProcess.length} siswa...`)

      for (const r of siswaToProcess) {
        const existingAkun = akunSiswaMap.get(r.nisn)
        let cleanUsername = r.usernameSiswa.includes('@') ? r.usernameSiswa.split('@')[0] : r.usernameSiswa

        // Jika kolom username kosong di Excel:
        if (!cleanUsername) {
          if (existingAkun) {
            // Jika sudah ada akun, pertahankan username lama
            cleanUsername = existingAkun.username
          } else {
            // Jika belum ada akun, auto generate
            const namaDepan = r.nama.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
            const randomDigits = generateRandom3Digits()
            cleanUsername = `ebmsiswa.${namaDepan}${randomDigits}`
          }
        }

        // Simpan username final siswa agar Step 5 bisa membaca untuk sinkronisasi akun ortu
        r.finalStudentUsername = cleanUsername;

        try {
          if (existingAkun) {
            // Sudah punya akun — update username jika diisi di Excel dan nilainya berbeda
            if (r.usernameSiswa && existingAkun.username !== cleanUsername) {
              await supabase.rpc('admin_update_username', {
                p_akun_id: existingAkun.id,
                p_new_username: cleanUsername
              })
            }
            // Reset password jika ada di Excel
            if (r.passwordSiswa) {
              await supabase.rpc('admin_reset_password', {
                p_akun_id: existingAkun.id,
                p_new_password: r.passwordSiswa
              })
            }
          } else {
            // Belum punya akun — buat baru
            const pWord = r.passwordSiswa || '123456'
            const { data: createResult, error: createErr } = await supabase.rpc('admin_create_user', {
              p_username: cleanUsername,
              p_password: pWord,
              p_role: 'murid',
              p_foreign_id: r.nisn,
              p_status: 'aktif'
            })
            if (createErr || !createResult?.ok) {
              console.error(`Gagal buat akun siswa NISN ${r.nisn}:`, createResult?.msg || createErr?.message)
              errorCount++
              continue
            }
          }
        } catch (e) {
          console.error(`Error akun siswa NISN ${r.nisn}:`, e)
          errorCount++
        }
      }

      // Step 5: Proses akun orang tua (buat baru / update username+password jika ada di Excel atau auto generate)
      setProgressText(`Memproses akun orang tua...`)
      for (const r of validRows) {
        const existingOrtu = akunOrtuMap.get(r.nisn)
        let cleanOrtuUsername = r.usernameOrtu.includes('@') ? r.usernameOrtu.split('@')[0] : r.usernameOrtu

        // Jika kolom username orang tua kosong di Excel:
        if (!cleanOrtuUsername) {
          if (existingOrtu) {
            // Jika sudah ada akun, pertahankan username lama
            cleanOrtuUsername = existingOrtu.username
          } else {
            // Jika belum ada akun, auto generate meniru suffix username siswa
            const existingSiswaAkun = akunSiswaMap.get(r.nisn)
            const studentUsername = r.finalStudentUsername || existingSiswaAkun?.username || ''
            
            let ortuSuffix = ''
            if (studentUsername) {
              if (studentUsername.startsWith('ebmsiswa.')) {
                ortuSuffix = studentUsername.substring('ebmsiswa.'.length)
              } else {
                ortuSuffix = studentUsername.includes('@') ? studentUsername.split('@')[0] : studentUsername
              }
            }

            if (!ortuSuffix) {
              const firstName = r.nama.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
              const randomDigits = generateRandom3Digits()
              ortuSuffix = `${firstName}${randomDigits}`
            }

            cleanOrtuUsername = `ebmortu.${ortuSuffix}`
          }
        }

        try {
          if (existingOrtu) {
            // Sudah punya akun ortu — update username jika diisi di Excel dan nilainya berbeda
            if (r.usernameOrtu && existingOrtu.username !== cleanOrtuUsername) {
              await supabase.rpc('admin_update_username', {
                p_akun_id: existingOrtu.id,
                p_new_username: cleanOrtuUsername
              })
              await supabase
                .from('siswa_permanent')
                .update({ ortu_username: cleanOrtuUsername })
                .eq('nisn', r.nisn)
            }
            // Reset password jika ada di Excel
            if (r.passwordOrtu) {
              await supabase.rpc('admin_reset_password', {
                p_akun_id: existingOrtu.id,
                p_new_password: r.passwordOrtu
              })
              await supabase
                .from('siswa_permanent')
                .update({ ortu_password: r.passwordOrtu })
                .eq('nisn', r.nisn)
            }
            successCount++
          } else {
            // Belum punya akun — buat baru
            const pWord = r.passwordOrtu || Math.random().toString(36).substring(2, 8).toUpperCase()
            const { data: ortuResult, error: errCreate } = await supabase.rpc('admin_create_user', {
              p_username: cleanOrtuUsername,
              p_password: pWord,
              p_role: 'orang_tua',
              p_foreign_id: r.nisn,
              p_status: 'aktif'
            })

            if (errCreate || !ortuResult?.ok) {
              console.error(`Gagal membuat akun ortu untuk NISN ${r.nisn}:`, errCreate || ortuResult?.msg)
              errorCount++
            } else {
              await supabase
                .from('siswa_permanent')
                .update({ ortu_username: cleanOrtuUsername, ortu_password: pWord })
                .eq('nisn', r.nisn)
              successCount++
            }
          }
        } catch (e) {
          console.error(e)
          errorCount++
        }
      }

      const siswaAkunDibuat = siswaToProcess.filter(r => !akunSiswaMap.has(r.nisn)).length
      const siswaAkunDiupdate = siswaToProcess.filter(r => akunSiswaMap.has(r.nisn)).length
      alert(
        `Sinkronisasi Siswa selesai!\n` +
        `✅ Biodata tersimpan: ${validRows.length} siswa\n` +
        `🔑 Akun siswa dibuat: ${siswaAkunDibuat}\n` +
        `🔄 Akun siswa diupdate: ${siswaAkunDiupdate}\n` +
        `👨‍👩‍👦 Akun ortu baru: ${successCount}\n` +
        `❌ Gagal: ${errorCount}`
      )
    } catch (err) {
      alert('Gagal memproses file: ' + err.message)
    }
    setIsProcessing(false); setProgressText(''); fetchData(); onRefresh?.()
    if (csvSiswaInputRef.current) csvSiswaInputRef.current.value = ''
  }

  // --- EXCEL IMPORT (Bulk Update NISN) ---
  const handleBulkUpdateNisn = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessing(true); setProgressText("Memproses Update NISN Massal...")

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { 
        alert("File Excel kosong")
        setIsProcessing(false)
        return 
      }

      let successCount = 0, errorCount = 0
      const updates = []

      for (const row of data) {
        const oldNisn = String(
          row.nisn_lama || 
          row['nisn lama'] || 
          row['NISN Lama'] || 
          row['NISN LAMA'] || 
          row.old_nisn || 
          row.oldNisn || 
          ''
        ).trim()
        
        const newNisn = String(
          row.nisn_baru || 
          row['nisn baru'] || 
          row['NISN Baru'] || 
          row['NISN BARU'] || 
          row.new_nisn || 
          row.newNisn || 
          ''
        ).trim()

        const nama = String(
          row.nama_siswa || 
          row['nama siswa'] || 
          row['Nama Siswa'] || 
          row.nama || 
          row['Nama'] || 
          row['nama_lengkap'] ||
          row['Nama Lengkap'] ||
          ''
        ).trim()

        if (oldNisn && newNisn && oldNisn !== newNisn) {
          updates.push({ oldNisn, newNisn, nama })
        }
      }

      if (updates.length === 0) {
        alert("Tidak ada data migrasi NISN yang valid. Pastikan ada kolom 'NISN Lama' dan 'NISN Baru' dengan nilai yang berbeda.")
        setIsProcessing(false)
        return
      }

      for (const update of updates) {
        setProgressText(`Mengupdate & Menyinkronkan NISN ${update.nama}...`)
        const { error } = await supabase.rpc('update_siswa_nisn', {
          old_nisn: update.oldNisn,
          new_nisn: update.newNisn
        })

        // Selalu sinkronkan NISN ke seluruh tabel sistem (Tabungan, Akun Pengguna, SPP, Presensi, Nilai, dll)
        await syncAllTablesNisn(update.oldNisn, update.newNisn)

        if (error) {
          console.warn(`RPC update_siswa_nisn untuk ${update.nama} (${update.oldNisn} -> ${update.newNisn}):`, error.message)
          // Cek apakah siswa di siswa_permanent sudah tercatat dengan newNisn
          const { data: checkSiswa } = await supabase.from('siswa_permanent').select('nisn').eq('nisn', update.newNisn).maybeSingle()
          if (checkSiswa) {
            successCount++
          } else {
            errorCount++
          }
        } else {
          successCount++
        }
      }

      alert(`Proses Update NISN Massal selesai!\nBerhasil: ${successCount}\nGagal: ${errorCount}`)
    } catch (err) {
      alert('Gagal memproses file: ' + err.message)
    }

    setIsProcessing(false)
    setProgressText('')
    fetchData()
    onRefresh?.()
    if (bulkUpdateNisnInputRef.current) bulkUpdateNisnInputRef.current.value = ''
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

  const takenWaliClasses = new Map()
  guruList.forEach(g => {
    if (g.guru_kelas) {
      g.guru_kelas.forEach(gk => {
        if (gk.tahun_ajaran_id === activeTa?.id) {
          takenWaliClasses.set(gk.kelas, g.id)
        }
      })
    }
  })

  const handleDeletePhotoModal = async () => {
    const confirmed = await requestConfirm({
      title: 'Hapus Foto?',
      message: 'Yakin ingin menghapus foto ini?',
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger'
    })
    if (!confirmed) return
    setIsProcessing(true)
    try {
      if (activeTab === 'murid') {
        await supabase.from('foto').delete().eq('nisn', biodataForm.foreign_id)
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
    setIsProcessing(false)
  }

  // --- BULK GENERATE ORANG TUA ---
  const handleBulkGenerateOrtu = async () => {
    const confirmed = await requestConfirm({
      title: 'Generate Akun Orang Tua Massal?',
      message: 'Sistem akan membuatkan username dan password untuk semua siswa yang BELUM memiliki akun orang tua. Proses ini tidak akan menimpa akun orang tua yang sudah ada. Lanjutkan?',
      confirmLabel: 'Generate Akun',
      confirmColor: 'violet',
      icon: 'info',
    })
    if (!confirmed) return

    setIsProcessing(true)
    try {
      const { data: allSiswa } = await supabase.from('siswa_permanent').select('nisn, nama_lengkap, ortu_username')
      const { data: allAkunSiswa } = await supabase.from('akun_pengguna').select('foreign_id, username').eq('role', 'murid')
      const { data: allAkunOrtu } = await supabase.from('akun_pengguna').select('id, foreign_id, username').eq('role', 'orang_tua')
      
      const akunSiswaMap = new Map(allAkunSiswa?.map(a => [a.foreign_id, a.username]) || [])
      const akunOrtuMap = new Map(allAkunOrtu?.map(a => [a.foreign_id, a]) || [])

      let successCount = 0
      let errorCount = 0
      let updateCount = 0

      for (const siswa of (allSiswa || [])) {
        const studentUsername = akunSiswaMap.get(siswa.nisn) || ''
        let ortuSuffix = ''
        
        if (studentUsername) {
          if (studentUsername.startsWith('ebmsiswa.')) {
            ortuSuffix = studentUsername.substring('ebmsiswa.'.length)
          } else {
            ortuSuffix = studentUsername.includes('@') ? studentUsername.split('@')[0] : studentUsername
          }
        }

        if (!ortuSuffix) {
          const firstName = (siswa.nama_lengkap || '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
          const randomDigits = generateRandom3Digits()
          ortuSuffix = `${firstName}${randomDigits}`
        }

        const ortuUsername = `ebmortu.${ortuSuffix}`
        const existingOrtu = akunOrtuMap.get(siswa.nisn)

        if (existingOrtu) {
          // Jika akun orang tua sudah ada tapi username mismatch, lakukan update/sync
          if (existingOrtu.username !== ortuUsername) {
            const { data: updateResult, error: errUpdate } = await supabase.rpc('admin_update_username', {
              p_akun_id: existingOrtu.id,
              p_new_username: ortuUsername
            })

            if (errUpdate || !updateResult?.ok) {
              console.error(`Gagal menyelaraskan username ortu NISN ${siswa.nisn}:`, errUpdate || updateResult?.msg)
              errorCount++
              continue
            }

            await supabase.from('siswa_permanent').update({
              ortu_username: ortuUsername
            }).eq('nisn', siswa.nisn)

            updateCount++
          }
        } else {
          // Jika belum memiliki akun orang tua, buat baru
          const ortuPassword = Math.random().toString(36).substring(2, 8).toUpperCase() // 6 chars random
          const { data: createResult, error: errAkun } = await supabase.rpc('admin_create_user', {
            p_username: ortuUsername,
            p_password: ortuPassword,
            p_role: 'orang_tua',
            p_foreign_id: siswa.nisn,
            p_status: 'aktif'
          })
          
          if (errAkun || !createResult?.ok) {
            errorCount++
            continue
          }

          await supabase.from('siswa_permanent').update({
            ortu_username: ortuUsername,
            ortu_password: ortuPassword
          }).eq('nisn', siswa.nisn)
          
          successCount++
        }
      }
      
      alert(`Sinkronisasi Akun Ortu selesai!\n🔑 Akun baru dibuat: ${successCount}\n🔄 Akun diupdate/diselaraskan: ${updateCount}\n❌ Gagal: ${errorCount}`)
      fetchData()
    } catch (err) {
      alert("Terjadi kesalahan: " + err.message)
    }
    setIsProcessing(false)
  }

  // --- BULK CLEAN DUPLICATE PHONES (Siswa = Ortu) ---
  const handleCleanDuplicatePhones = async () => {
    setIsProcessing(true)
    setProgressText('Menganalisis data kontak...')
    try {
      const { data: allSiswa, error: errSiswa } = await supabase
        .from('siswa_permanent')
        .select('nisn, nama_lengkap, no_whatsapp, no_hp, no_hp_ortu, kontak_ortu')

      if (errSiswa || !allSiswa) {
        alert('Gagal mengambil data siswa: ' + (errSiswa?.message || 'Error tidak diketahui'))
        return
      }

      const duplicates = []

      for (const s of allSiswa) {
        const studentPhone = cleanPhone(s.no_whatsapp || s.no_hp)
        if (!studentPhone) continue

        let hasDuplicate = false
        const currentContacts = Array.isArray(s.kontak_ortu) ? [...s.kontak_ortu] : []

        if (currentContacts.length > 0) {
          hasDuplicate = currentContacts.some(k => {
            const kPhone = cleanPhone(k.nomor)
            return kPhone && kPhone === studentPhone
          })
        }

        const ortuPhone = cleanPhone(s.no_hp_ortu)
        if (ortuPhone && ortuPhone === studentPhone) {
          hasDuplicate = true
        }

        if (hasDuplicate) {
          // Pastikan nomor kembar tersimpan AMAN di kontak Orang Tua
          let preservedContacts = [...currentContacts]
          const targetPhone = s.no_hp_ortu || studentPhone

          if (preservedContacts.length === 0) {
            preservedContacts = [{
              tag: 'Orang Tua',
              nama: s.nama_ortu || 'Orang Tua',
              nomor: targetPhone
            }]
          } else {
            preservedContacts = preservedContacts.map(k => {
              const kPhone = cleanPhone(k.nomor)
              if (!kPhone || kPhone === studentPhone) {
                return { ...k, nomor: k.nomor || targetPhone }
              }
              return k
            })
          }

          duplicates.push({
            nisn: s.nisn,
            nama: s.nama_lengkap,
            sharedPhone: studentPhone,
            preservedContacts,
            preservedNoHpOrtu: targetPhone
          })
        }
      }

      if (duplicates.length === 0) {
        alert('🎉 Bersih! Tidak ditemukan nomor HP kembar antara siswa dan orang tua. Semua data kontak sudah terpisah.')
        return
      }

      const confirmed = await requestConfirm({
        title: `Bersihkan ${duplicates.length} Data HP Kembar?`,
        message: `Ditemukan ${duplicates.length} data di mana nomor WhatsApp siswa sama persis dengan kontak Orang Tua.\n\n🛡️ Nomor tersebut akan DITETAPKAN SEBAGAI NOMOR ORANG TUA (AMAN & TETAP ADA).\n\nNomor duplikasi pada kolom nomor siswa akan dikosongkan agar siswa dapat melengkapi nomor HP pribadinya sendiri saat membuka Kartu Pelajar.\n\nLanjutkan pemisahan?`,
        confirmLabel: `Pisahkan Kontak (${duplicates.length})`,
        confirmColor: 'amber',
        icon: 'warning',
      })

      if (!confirmed) return

      let cleanedCount = 0
      for (const item of duplicates) {
        setProgressText(`Memisahkan kontak (${cleanedCount + 1}/${duplicates.length}): ${item.nama}`)
        const { error: updateErr } = await supabase
          .from('siswa_permanent')
          .update({
            // Nomor Orang Tua tetap aman dan terjaga
            kontak_ortu: item.preservedContacts,
            no_hp_ortu: item.preservedNoHpOrtu,
            // Kosongkan dari kolom siswa agar siswa mengisi nomor pribadinya sendiri
            no_whatsapp: null,
            no_hp: null
          })
          .eq('nisn', item.nisn)

        if (!updateErr) {
          cleanedCount++
        }
      }

      await fetchData()
      if (onRefresh) onRefresh()
      alert(`✅ Selesai! Berhasil memisahkan ${cleanedCount} data nomor HP kembar. Nomor HP orang tua tetap aman tersimpan, dan siswa akan diminta mengisi nomor pribadinya sendiri.`)
    } catch (err) {
      console.error('Error saat membersihkan HP kembar:', err)
      alert('Terjadi kesalahan saat membersihkan data: ' + err.message)
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // --- LOGIN AS USER (IMPERSONATE) ---
  const handleLoginAsUser = async (row) => {
    if (!row) return
    try {
      if (activeTab === 'murid' || activeTab === 'orang_tua') {
        // Build siswa/ortu session
        const { data: siswa } = await supabase
          .from('siswa_permanent')
          .select('*')
          .eq('nisn', row.foreign_id)
          .maybeSingle()
        
        if (!siswa) { alert(activeTab === 'murid' ? 'Data siswa tidak ditemukan.' : 'Data anak tidak ditemukan.'); return }

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
          akun_id: (activeTab === 'murid' ? 'siswa_' : 'ortu_') + siswa.id
        }

        const { data: tokenRecord, error } = await supabase.from('impersonate_tokens').insert({
          role: activeTab === 'murid' ? 'murid' : 'orang_tua',
          session_data: sessionData
        }).select('id').single()

        if (error) throw error
        window.open(`/impersonate?token=${tokenRecord.id}`, '_blank')

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

        const { data: tokenRecord, error } = await supabase.from('impersonate_tokens').insert({
          role: 'guru',
          session_data: sessionData
        }).select('id').single()

        if (error) throw error
        window.open(`/impersonate?token=${tokenRecord.id}`, '_blank')
      }
    } catch (err) {
      alert('Gagal login sebagai user: ' + err.message)
    }
  }

  return (
    <div className="animate-slide-up flex flex-col min-h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] pb-2 md:pb-0">
      <input type="file" accept="image/*" ref={individualPhotoInputRef} className="hidden" onChange={handleIndividualPhotoUpload} />
      <input type="file" accept="image/*" multiple ref={massPhotoInputRef} className="hidden" onChange={handleMassPhotoUpload} />
      <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={csvInputRef} className="hidden" onChange={handleCsvImportGuru} />
      <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={csvSiswaInputRef} className="hidden" onChange={handleCsvImportSiswa} />
      <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={bulkUpdateNisnInputRef} className="hidden" onChange={handleBulkUpdateNisn} />

      {/* Ultra-Compact High-Density Header Bar (Row 1) */}
      <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs mb-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: Title & Inline Tabs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5">
              <span>👥</span>
              <span>Manajemen Akun</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
              {dataForCards.length}
            </span>
          </div>

          {/* Inline Tab Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            {[
              { id: 'murid', label: 'Murid' },
              { id: 'orang_tua', label: 'Orang Tua' },
              { id: 'guru', label: 'Guru & Staff' },
              { id: 'kelas', label: 'Daftar Kelas' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearch(''); setSelectedClassFilter('all') }}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Compact Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick Action: Buat Data Baru */}
          <button
            onClick={() => openBiodataModal()}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-all"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>Buat Baru</span>
          </button>

          {/* Quick Action: Cek Kelengkapan Biodata Siswa */}
          {(activeTab === 'murid' || activeTab === 'orang_tua') && (
            <button
              onClick={() => setShowKelengkapanModal(true)}
              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
              title="Buka tabel audit kelengkapan biodata siswa (data kosong ditandai warna merah)"
            >
              <span>📋</span>
              <span>Cek Kelengkapan Data</span>
            </button>
          )}

          {/* Quick Action: Unduh Kontak HP */}
          <button
            onClick={() => setShowExportKontakModal(true)}
            disabled={isProcessing}
            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
            title="Unduh Kontak HP (.vcf) / Google Contacts (.csv)"
          >
            <span>📥</span>
            <span>Unduh Kontak</span>
          </button>

          {/* Quick Action: Cetak Kartu Login */}
          {activeTab === 'murid' && (
            <button
              onClick={handleOpenPrintCardsModal}
              disabled={isProcessing || isProcessingPrint || mergedData.length === 0}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
              title="Cetak Kartu Login Siswa"
            >
              {isProcessingPrint ? (
                <div className="w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
              ) : (
                <span>🖨️</span>
              )}
              <span>Cetak Kartu ({mergedData.length})</span>
            </button>
          )}

          {/* Aksi Massal Toggle */}
          <button
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
              isActionsExpanded 
                ? 'bg-slate-800 text-white border-slate-800' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
            }`}
            title="Buka menu import, export, dan foto massal"
          >
            <span>⚡</span>
            <span>Aksi Massal</span>
            <span className="text-[9px]">{isActionsExpanded ? '▲' : '▼'}</span>
          </button>

          {/* Toggle Fokus Tabel */}
          <button
            onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
            className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
              isFilterCollapsed 
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
            }`}
            title="Sembunyikan/tampilkan filter toolbar"
          >
            <span>{isFilterCollapsed ? '🔽 Buka Filter' : '👁️ Fokus Tabel'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Aksi Massal Tray */}
      {isActionsExpanded && (
        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 mb-2 flex flex-wrap items-center gap-1.5 animate-fade-in text-xs shrink-0">
          <span className="font-bold text-slate-500 mr-1">Opsi Massal:</span>
          {activeTab === 'guru' && (
            <button onClick={() => csvInputRef.current?.click()} className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1">
              <IconUpload className="w-3.5 h-3.5" /> Import Excel Guru
            </button>
          )}
          {activeTab === 'murid' && (
            <>
              <button 
                onClick={() => {
                  const activeOnly = (students || []).filter(s => {
                    if (activeTa?.id) {
                      return (s.tahun_ajaran_id === activeTa.id || s.tahun_ajaran === activeTa.nama) && s.is_aktif !== false
                    }
                    return s.is_aktif !== false
                  })
                  const taSuffix = activeTa?.nama ? `_${activeTa.nama.replace(/\//g, '_')}` : ''
                  downloadStudentTemplateExcel(activeOnly, `Template_Siswa_Dan_Alamat${taSuffix}.xlsx`)
                }} 
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg font-bold flex items-center gap-1"
                title={`Download Format Template Excel Lengkap Tahun Ajaran ${activeTa?.nama || 'Aktif'}`}
              >
                <span>📥</span> Download Template Siswa
              </button>
              <button onClick={() => csvSiswaInputRef.current?.click()} className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1" title="Import Data Siswa, Alamat & Kontak Ortu dari Excel">
                <IconUpload className="w-3.5 h-3.5" /> Import Excel Siswa
              </button>
              <button onClick={() => setShowTemplateNisnModal(true)} className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 rounded-lg font-bold flex items-center gap-1 transition-colors" title="Download Format Template Excel untuk Update NISN (Bisa Pilih Kelas)">
                <span>📥</span> Template Update NISN
              </button>
              <button onClick={() => bulkUpdateNisnInputRef.current?.click()} className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold flex items-center gap-1 shadow-sm transition-colors" title="Update NISN Siswa secara Massal dari Excel">
                <span>⚡</span> Update NISN Massal
              </button>
              <button onClick={handleRapihkanKode} disabled={isProcessing || !activeTa || students.filter(s => s.tahun_ajaran_id === activeTa?.id).length === 0} 
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50" title="Urutkan absen dan perbarui kode PDF otomatis">
                <span>A-Z</span> Rapihkan Kode
              </button>
              <button onClick={handleCleanDuplicatePhones} disabled={isProcessing} className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50" title="Bersihkan otomatis kontak orang tua yang kembar/terduplikasi dengan nomor WhatsApp siswa">
                <span>🧹</span> Bersihkan HP Kembar
              </button>
            </>
          )}
          {activeTab === 'orang_tua' && (
            <>
              <button 
                onClick={() => {
                  const activeOnly = (students || []).filter(s => {
                    if (activeTa?.id) {
                      return (s.tahun_ajaran_id === activeTa.id || s.tahun_ajaran === activeTa.nama) && s.is_aktif !== false
                    }
                    return s.is_aktif !== false
                  })
                  const taSuffix = activeTa?.nama ? `_${activeTa.nama.replace(/\//g, '_')}` : ''
                  downloadStudentTemplateExcel(activeOnly, `Template_Kontak_Orang_Tua${taSuffix}.xlsx`)
                }} 
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg font-bold flex items-center gap-1"
                title={`Download Template Excel Kontak Orang Tua Tahun Ajaran ${activeTa?.nama || 'Aktif'}`}
              >
                <span>📥</span> Template Kontak Ortu
              </button>
              <button onClick={() => csvSiswaInputRef.current?.click()} className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1" title="Import Kontak Orang Tua & Biodata Siswa dari Excel">
                <IconUpload className="w-3.5 h-3.5" /> Import Excel Kontak
              </button>
              <button onClick={handleBulkGenerateOrtu} disabled={isProcessing} className="px-2.5 py-1 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50">
                <IconPlus className="w-3.5 h-3.5" /> Generate Akun Ortu
              </button>
              <button onClick={handleCleanDuplicatePhones} disabled={isProcessing} className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50" title="Bersihkan otomatis kontak orang tua yang kembar/terduplikasi dengan nomor WhatsApp siswa">
                <span>🧹</span> Bersihkan HP Kembar
              </button>
            </>
          )}
          {activeTab === 'murid' && (
            <button 
              type="button"
              onClick={() => setShowSmartPhotoModal(true)} 
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
              title="Upload foto siswa per kelas berdasarkan urutan nomor absen/file dari fotografer dengan pratinjau visual"
            >
              <span>✨</span> Upload Cerdas (Per Kelas)
            </button>
          )}
          <button onClick={() => massPhotoInputRef.current?.click()} className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1">
            <IconCamera className="w-3.5 h-3.5" /> Upload Foto Massal (NISN)
          </button>
          <button onClick={() => setShowExportModal(true)} disabled={isProcessing} className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 disabled:opacity-50" title="Export Excel data pengguna">
            <span>📊</span> Export Excel
          </button>
        </div>
      )}

      {/* Ultra-Compact Toolbar (Row 2: Kelas, Search, TA & Mini Stats Chips) */}
      {!isFilterCollapsed && activeTab !== 'kelas' && (
        <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs mb-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Class Filter (Pills) */}
          {(activeTab === 'murid' || activeTab === 'orang_tua') && uniqueClasses.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide max-w-full sm:max-w-md">
              <span className="text-[11px] font-bold text-slate-500 shrink-0 mr-0.5">Kelas:</span>
              <button
                onClick={() => setSelectedClassFilter('all')}
                className={`px-2 py-0.5 rounded-lg text-xs font-bold border shrink-0 transition-all ${
                  selectedClassFilter === 'all'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                Semua
              </button>
              {uniqueClasses.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedClassFilter(c)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold border shrink-0 transition-all ${
                    selectedClassFilter === c
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Search, TA, and Mini Stats */}
          <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
            {/* Search Input */}
            <div className="relative min-w-[160px] max-w-xs flex-1">
              <input
                type="text"
                placeholder="Cari nama / ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold">
                  ✕
                </button>
              )}
            </div>

            {/* TA Selector */}
            {(activeTab === 'murid' || activeTab === 'orang_tua') && (
              <div className="flex items-center px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold shrink-0">
                <span className="mr-1 text-[10px] text-indigo-500">TA:</span>
                <select
                  value={selectedTaFilter}
                  onChange={(e) => { setSelectedTaFilter(e.target.value); setSelectedClassFilter('all') }}
                  className="bg-transparent outline-none cursor-pointer text-xs font-bold"
                >
                  <option value="all">Semua TA</option>
                  {tahunAjarans?.map(ta => <option key={ta.id} value={ta.nama}>{ta.nama}</option>)}
                </select>
              </div>
            )}

            {/* Mini Summary Chips (Clickable Filters) */}
            <div className="flex items-center gap-1 shrink-0 text-[11px] font-bold">
              {(() => {
                const dupCount = (activeTab === 'murid' || activeTab === 'orang_tua')
                  ? dataForCards.filter(a => {
                      const sPhone = cleanPhone(a.rawStudent?.no_whatsapp || a.rawStudent?.no_hp)
                      if (!sPhone) return false
                      const currentContacts = a.rawStudent?.kontak_ortu || []
                      const hasMatchingContact = Array.isArray(currentContacts) && currentContacts.some(k => cleanPhone(k.nomor) === sPhone)
                      const oPhone = cleanPhone(a.rawStudent?.no_hp_ortu)
                      return hasMatchingContact || (oPhone && sPhone === oPhone)
                    }).length
                  : 0

                const statChips = (activeTab === 'murid' || activeTab === 'orang_tua' ? [
                  { l: 'Punya Akun', v: dataForCards.filter(m => m.hasAkun).length, type: 'with_akun', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { l: 'Tanpa Akun', v: dataForCards.filter(m => !m.hasAkun).length, type: 'without_akun', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { l: 'Aktif', v: dataForCards.filter(m => m.hasAkun && m.status === 'aktif').length, type: 'active_akun', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  ...(dupCount > 0 ? [{ l: '⚠️ HP Kembar', v: dupCount, type: 'duplicate_phone', color: 'bg-rose-50 text-rose-700 border-rose-300' }] : [])
                ] : [
                  { l: 'Punya Akun', v: dataForCards.filter(g => g.hasAkun).length, type: 'with_akun', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { l: 'Tanpa Akun', v: dataForCards.filter(g => !g.hasAkun).length, type: 'without_akun', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                  { l: 'Admin', v: dataForCards.filter(g => {
                      const akun = akunList.find(a => a.id === g.akun_id);
                      return akun && (akun.role === 'admin' || akun.role === 'superadmin');
                    }).length, type: 'active_akun', color: 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }
                ])

                return statChips.map(stat => (
                  <button
                    key={stat.l}
                    onClick={() => setSummaryFilter(summaryFilter === stat.type ? 'all' : stat.type)}
                    className={`px-2 py-0.5 rounded-lg border transition-all ${
                      summaryFilter === stat.type
                        ? 'ring-2 ring-indigo-500 font-black'
                        : 'opacity-90 hover:opacity-100'
                    } ${stat.color}`}
                    title={`Filter ${stat.l}`}
                  >
                    <span>{stat.l}: {stat.v}</span>
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border-none rounded-xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-[500px] lg:min-h-0">
        {loading || isProcessing ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
            <p>{progressText || "Memuat data..."}</p>
          </div>
        ) : activeTab === 'kelas' ? (
          <div className="p-6 space-y-6 overflow-auto flex-1">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-lg">
              <h3 className="font-bold text-slate-800 text-sm mb-3">➕ Tambah Rombel Kelas Baru (Tahun Ajaran: {activeTa?.nama})</h3>
              <form onSubmit={handleAddMasterKelas} className="flex gap-2">
                <input 
                  type="text"
                  required
                  placeholder="Misal: 7A, 7B, 8C..."
                  value={newClassNameInput}
                  onChange={e => setNewClassNameInput(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95"
                >
                  Simpan Kelas
                </button>
              </form>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden max-w-2xl bg-white shadow-xs">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">No</th>
                    <th className="px-5 py-3.5 font-bold">Nama Rombel / Kelas</th>
                    <th className="px-5 py-3.5 font-bold">Tahun Ajaran</th>
                    <th className="px-5 py-3.5 font-bold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getAllClassesList().length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-6 text-center text-slate-400 italic">Belum ada kelas yang didaftarkan.</td>
                    </tr>
                  ) : (
                    getAllClassesList().map((clsItem, idx) => (
                      <tr key={clsItem.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3 font-mono">{idx + 1}</td>
                        <td className="px-5 py-3 font-bold text-slate-800">{clsItem.nama_kelas}</td>
                        <td className="px-5 py-3 text-slate-600">{activeTa?.nama}</td>
                        <td className="px-5 py-3 text-center">
                          {clsItem.is_deletable ? (
                            <button
                              onClick={() => handleDeleteMasterKelas(clsItem.id)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-all"
                            >
                              Hapus
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-md border border-emerald-100 text-[10px] uppercase tracking-wide">
                              🟢 Murid Aktif
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Identitas</th>
                  <th className="px-4 py-3">Akun Login</th>
                  {(activeTab === 'murid' || activeTab === 'orang_tua') ? (
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
                          className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 cursor-pointer z-10">
                          <IconCamera className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 cursor-pointer hover:bg-slate-100/80 transition-colors rounded-2xl" onClick={() => openBiodataModal(row)}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">{row.nama}</p>
                        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500 font-mono">{(activeTab === 'murid' || activeTab === 'orang_tua') ? row.foreign_id : `Kode: ${row.kode}`}</span>
                        {(() => {
                          const kontakList = Array.isArray(row.rawStudent?.kontak_ortu) ? row.rawStudent.kontak_ortu : []
                          const phone = activeTab === 'murid'
                            ? (row.rawStudent?.no_whatsapp || row.rawStudent?.no_hp)
                            : activeTab === 'orang_tua'
                              ? (kontakList[0]?.nomor || row.rawStudent?.no_hp_ortu)
                              : row.rawGuru?.no_hp
                          const digits = String(phone || '').replace(/[^0-9]/g, '')
                          const hasHp = digits.length >= 7

                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {hasHp ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5" title={`Nomor HP: ${phone}`}>
                                  <span>📱</span>
                                  <span>No. HP</span>
                                  <span className="text-emerald-600 font-black">✓</span>
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-400 border border-slate-200 inline-flex items-center gap-0.5" title="Nomor HP belum terdaftar">
                                  <span>📱</span>
                                  <span>No. HP</span>
                                  <span className="text-slate-400 font-black">✕</span>
                                </span>
                              )}
                              {activeTab === 'orang_tua' && kontakList.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {kontakList.map((k, ki) => (
                                    <span 
                                      key={ki} 
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        k.tag === 'Ayah' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                        k.tag === 'Ibu' ? 'bg-pink-50 text-pink-800 border-pink-200' :
                                        k.tag === 'Wali' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        'bg-purple-50 text-purple-800 border-purple-200'
                                      }`}
                                      title={`${k.tag}: ${k.nama || '-'} (${k.nomor || '-'})`}
                                    >
                                      {k.tag === 'Ayah' ? '👨' : k.tag === 'Ibu' ? '👩' : k.tag === 'Wali' ? '🤝' : '👥'} {k.tag}{k.nama ? `: ${k.nama.split(' ')[0]}` : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.hasAkun ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-slate-800 font-medium">{row.username}</p>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase ${row.status === 'aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{row.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                            {activeTab === 'orang_tua' && (() => {
                              const lineTaut = Boolean(row.rawStudent?.line_user_id)
                              const namaOrtu = row.rawStudent?.nama_ortu?.trim()
                              const hpOrtu = row.rawStudent?.no_hp_ortu?.trim()
                              const emailOrtu = row.rawStudent?.email_ortu?.trim()

                              const isFull = Boolean(namaOrtu && hpOrtu && emailOrtu)
                              const hasHp = Boolean(hpOrtu)

                              return (
                                <>
                                  {lineTaut ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 LINE Taut</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">🔴 LINE Belum</span>
                                  )}
                                  {isFull ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title={`Nama: ${namaOrtu} | HP: ${hpOrtu} | Email: ${emailOrtu}`}>📝 Biodata Lengkap</span>
                                  ) : hasHp ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Nama: ${namaOrtu || '-'} | HP: ${hpOrtu}`}>📱 No. HP Terisi</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">⚠️ Biodata Belum</span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs italic text-slate-400 font-medium">(Belum Punya Akun)</p>
                          {activeTab === 'orang_tua' && (() => {
                            const lineTaut = Boolean(row.rawStudent?.line_user_id)
                            const namaOrtu = row.rawStudent?.nama_ortu?.trim()
                            const hpOrtu = row.rawStudent?.no_hp_ortu?.trim()
                            const emailOrtu = row.rawStudent?.email_ortu?.trim()

                            const isFull = Boolean(namaOrtu && hpOrtu && emailOrtu)
                            const hasHp = Boolean(hpOrtu)

                            return (
                              <div className="flex items-center gap-1 flex-wrap">
                                {lineTaut ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 LINE Taut</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">🔴 LINE Belum</span>
                                )}
                                {isFull ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title={`Nama: ${namaOrtu} | HP: ${hpOrtu} | Email: ${emailOrtu}`}>📝 Biodata Lengkap</span>
                                ) : hasHp ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Nama: ${namaOrtu || '-'} | HP: ${hpOrtu}`}>📱 No. HP Terisi</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">⚠️ Biodata Belum</span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(activeTab === 'murid' || activeTab === 'orang_tua') ? (
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
                      <div className="flex items-center justify-center gap-1.5">
                        {activeTab === 'murid' && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setQuickCardStudent({
                                ...row,
                                ...(row.rawStudent || {}),
                                kelas: row.kelas,
                                tahun_ajaran: row.tahun_ajaran
                              }); 
                            }} 
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors" 
                            title="Lihat Kartu Pelajar Digital"
                          >
                            <span className="text-sm">🪪</span>
                          </button>
                        )}
                        {row.hasAkun && (
                          <button onClick={(e) => { e.stopPropagation(); handleResetPassword(row); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl" title="Reset & Kirim WA">
                            <IconKey className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePermanen(row); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl" title="Hapus Permanen"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
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
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{biodataForm.isNew ? 'Buat Data Baru' : 'Edit Data Lengkap'} ({activeTab === 'murid' ? 'Siswa' : activeTab === 'orang_tua' ? 'Orang Tua' : 'Guru'})</h3>
              <button onClick={handleCloseBiodataModal} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
                          <label className="block text-xs font-medium text-slate-700 mb-1">NISN * <span className="text-amber-500 font-normal">(Ubah dengan hati-hati)</span></label>
                          <input required value={biodataForm.foreign_id} onChange={e => {
                            const val = e.target.value;
                            if (!biodataForm.hasAkun) {
                              const namaDepan = (biodataForm.nama || '').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                              const nisnLast3 = String(val).slice(-3);
                              setBiodataForm({
                                ...biodataForm,
                                foreign_id: val,
                                username_siswa: namaDepan ? `ebmsiswa.${namaDepan}${nisnLast3}` : ''
                              });
                            } else {
                              setBiodataForm({ ...biodataForm, foreign_id: val });
                            }
                          }} className="w-full px-3 py-2 border border-slate-300 rounded-2xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                          <input required value={biodataForm.nama} onChange={e => {
                            const val = e.target.value;
                            if (!biodataForm.hasAkun) {
                              const namaDepan = val.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                              const nisnLast3 = String(biodataForm.foreign_id || '').slice(-3);
                              setBiodataForm({
                                ...biodataForm,
                                nama: val,
                                username_siswa: namaDepan ? `ebmsiswa.${namaDepan}${nisnLast3}` : ''
                              });
                            } else {
                              setBiodataForm({ ...biodataForm, nama: val });
                            }
                          }} className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>
                        <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                          <label className="block text-xs font-bold text-slate-700 mb-3 border-b border-slate-200 pb-2">Riwayat Kelas Terdaftar</label>
                          
                          <div className="space-y-2 mb-4">
                            {studentEnrollments.length === 0 && (
                              <p className="text-xs text-slate-400 italic">Belum ada riwayat kelas.</p>
                            )}
                            {studentEnrollments.map((enrol, idx) => (
                               <div key={idx} className="flex gap-3 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                                  <div className="flex-1">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{enrol.tahun_ajaran?.nama || enrol.tahun_ajaran_nama || ''}</p>
                                    {enrol.isEditing ? (
                                        <input 
                                          autoFocus
                                          value={enrol.tempEditKelas || ''}
                                          onChange={e => {
                                              const newEnrols = [...studentEnrollments];
                                              newEnrols[idx].tempEditKelas = e.target.value;
                                              setStudentEnrollments(newEnrols);
                                          }}
                                          onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                  e.preventDefault();
                                                  const newEnrols = [...studentEnrollments];
                                                  newEnrols[idx].kelas = newEnrols[idx].tempEditKelas || '-';
                                                  newEnrols[idx].isEditing = false;
                                                  setStudentEnrollments(newEnrols);
                                              }
                                          }}
                                          className="w-full px-2 py-1 mt-1 border border-indigo-300 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" 
                                          placeholder="Ketik kelas"
                                        />
                                    ) : (
                                        <p 
                                          className="text-sm font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 inline-block"
                                          onClick={() => {
                                              const newEnrols = [...studentEnrollments];
                                              newEnrols[idx].isEditing = true;
                                              newEnrols[idx].tempEditKelas = newEnrols[idx].kelas;
                                              setStudentEnrollments(newEnrols);
                                          }}
                                          title="Klik untuk mengedit"
                                        >
                                          {enrol.kelas} <span className="text-slate-400 text-[10px] ml-1 font-normal">(klik untuk edit)</span>
                                        </p>
                                    )}
                                  </div>
                                  
                                  {enrol.isEditing ? (
                                      <button type="button" onClick={() => {
                                          const newEnrols = [...studentEnrollments];
                                          newEnrols[idx].kelas = newEnrols[idx].tempEditKelas || '-';
                                          newEnrols[idx].isEditing = false;
                                          setStudentEnrollments(newEnrols);
                                      }} className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold border border-indigo-200">Apply</button>
                                  ) : (
                                      <button type="button" onClick={() => {
                                          const filtered = studentEnrollments.filter((_, i) => i !== idx);
                                          setStudentEnrollments(filtered);
                                      }} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors text-xs font-medium">Hapus</button>
                                  )}
                               </div>
                            ))}
                          </div>

                          <div className="flex gap-2 items-end p-3 bg-white rounded-xl border border-slate-200">
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-500 mb-1">Pilih Tahun Ajaran</label>
                              <select 
                                value={biodataForm.temp_ta_id || ''} 
                                onChange={e => setBiodataForm({...biodataForm, temp_ta_id: e.target.value, temp_kelas: '', kelasError: ''})}
                                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="">-- Tahun Ajaran --</option>
                                {tahunAjarans?.map(ta => <option key={ta.id} value={ta.id}>{ta.nama}</option>)}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-500 mb-1">Ketik / Pilih Kelas</label>
                              <input 
                                list="kelas-options-temp"
                                value={biodataForm.temp_kelas || ''} 
                                onChange={e => setBiodataForm({...biodataForm, temp_kelas: e.target.value})}
                                placeholder="Cth: X.1"
                                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <datalist id="kelas-options-temp">
                                {biodataForm.temp_ta_id && [...new Set(students?.filter(s => s.tahun_ajaran_id === biodataForm.temp_ta_id).map(s => s.kelas).filter(c => c && c !== '-'))].sort().map(c => (
                                  <option key={c} value={c} />
                                ))}
                              </datalist>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => {
                                if(!biodataForm.temp_ta_id || !biodataForm.temp_kelas) {
                                  setBiodataForm({...biodataForm, kelasError: 'Pilih Tahun Ajaran dan isi Kelas terlebih dahulu!'});
                                  return;
                                }
                                const ta = tahunAjarans.find(t => t.id === biodataForm.temp_ta_id);
                                
                                const existingIndex = studentEnrollments.findIndex(e => e.tahun_ajaran_id === biodataForm.temp_ta_id);
                                if (existingIndex >= 0) {
                                  setBiodataForm({...biodataForm, kelasError: 'Kelas untuk Tahun Ajaran ini sudah ada di daftar.'});
                                  return;
                                }

                                setStudentEnrollments([...studentEnrollments, {
                                  tahun_ajaran_id: ta.id,
                                  tahun_ajaran: { nama: ta.nama },
                                  kelas: biodataForm.temp_kelas,
                                  nisn: biodataForm.foreign_id
                                }]);
                                setBiodataForm({...biodataForm, temp_ta_id: '', temp_kelas: '', kelasError: ''});
                              }}
                              className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                            >
                              Tambah
                            </button>
                          </div>
                          {biodataForm.kelasError && (
                            <p className="text-xs text-red-500 mt-2 font-medium bg-red-50 p-2 rounded-lg border border-red-200 shadow-sm flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {biodataForm.kelasError}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-500 mt-2 italic">*Kelas yang ditambahkan di sini akan otomatis tersimpan saat Anda menekan tombol "Simpan Data" di bawah.</p>
                        </div>
                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                          <div className="md:col-span-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">No. WhatsApp / HP Siswa</label>
                            <input value={biodataForm.no_whatsapp || biodataForm.no_hp || ''} onChange={e => setBiodataForm({...biodataForm, no_whatsapp: e.target.value, no_hp: e.target.value})} placeholder="Contoh: 62812xxx" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">ID Telegram Orang Tua</label>
                            <input value={biodataForm.telegram_ortu || ''} onChange={e => setBiodataForm({...biodataForm, telegram_ortu: e.target.value})} placeholder="Contoh: 123456789" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          </div>
                        </div>

                        {/* Data Tempat, Tanggal Lahir & Jenis Kelamin untuk Kartu Pelajar */}
                        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tempat Lahir</label>
                            <input 
                              value={biodataForm.tempat_lahir || ''} 
                              onChange={e => setBiodataForm({...biodataForm, tempat_lahir: e.target.value})} 
                              placeholder="Contoh: Jakarta" 
                              className="w-full px-3 py-2 border rounded-2xl text-sm" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                            <input 
                              type="date" 
                              value={biodataForm.tanggal_lahir || ''} 
                              onChange={e => setBiodataForm({...biodataForm, tanggal_lahir: e.target.value})} 
                              className="w-full px-3 py-2 border rounded-2xl text-sm" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                            <select 
                              value={biodataForm.jenis_kelamin || ''} 
                              onChange={e => setBiodataForm({...biodataForm, jenis_kelamin: e.target.value})} 
                              className="w-full px-3 py-2 border rounded-2xl text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Pilih Jenis Kelamin --</option>
                              <option value="L">Laki-Laki (L)</option>
                              <option value="P">Perempuan (P)</option>
                            </select>
                          </div>
                        </div>

                        {/* Data Alamat & RT/RW untuk Kartu Pelajar */}
                        <div className="md:col-span-2 space-y-3 pt-2 border-t border-slate-100">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-slate-700 mb-1">Alamat (Nama Jalan & No. Rumah)</label>
                              <input 
                                value={biodataForm.alamat || ''} 
                                onChange={e => setBiodataForm({...biodataForm, alamat: e.target.value})} 
                                placeholder="Contoh: Jl. Pangeran Tubagus Angke No.13" 
                                className="w-full px-3 py-2 border rounded-2xl text-sm" 
                              />
                            </div>
                            <div className="sm:col-span-1">
                              <label className="block text-xs font-medium text-slate-700 mb-1">RT / RW</label>
                              <input 
                                value={biodataForm.rt_rw || ''} 
                                onChange={e => setBiodataForm({...biodataForm, rt_rw: e.target.value})} 
                                placeholder="Contoh: 06/02" 
                                className="w-full px-3 py-2 border rounded-2xl text-sm" 
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Kelurahan</label>
                              <input 
                                value={biodataForm.kelurahan || ''} 
                                onChange={e => setBiodataForm({...biodataForm, kelurahan: e.target.value})} 
                                placeholder="Jembatan Lima" 
                                className="w-full px-3 py-2 border rounded-2xl text-sm" 
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Kecamatan</label>
                              <input 
                                value={biodataForm.kecamatan || ''} 
                                onChange={e => setBiodataForm({...biodataForm, kecamatan: e.target.value})} 
                                placeholder="Tambora" 
                                className="w-full px-3 py-2 border rounded-2xl text-sm" 
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Kota / Kabupaten</label>
                              <input 
                                value={biodataForm.kota || ''} 
                                onChange={e => setBiodataForm({...biodataForm, kota: e.target.value})} 
                                placeholder="Jakarta Barat" 
                                className="w-full px-3 py-2 border rounded-2xl text-sm" 
                              />
                            </div>
                          </div>
                        </div>

                        {/* Multi-Kontak Orang Tua / Wali (Tag: Ayah, Ibu, Wali, Orang Tua) */}
                        <div className="md:col-span-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <span>👨‍👩‍👧‍👦</span>
                                <span>Kontak Orang Tua / Wali (Ayah, Ibu, Wali)</span>
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Masukkan kontak Ayah, Ibu, atau Wali siswa (terpisah dari nomor WhatsApp siswa pribadi di atas)
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const list = Array.isArray(biodataForm.kontak_ortu) ? [...biodataForm.kontak_ortu] : []
                                const hasAyah = list.some(k => k.tag?.toLowerCase() === 'ayah')
                                const hasIbu = list.some(k => k.tag?.toLowerCase() === 'ibu')
                                const defaultTag = !hasAyah ? 'Ayah' : (!hasIbu ? 'Ibu' : 'Wali')
                                list.push({ tag: defaultTag, nama: '', nomor: '' })
                                setBiodataForm({ ...biodataForm, kontak_ortu: list })
                              }}
                              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0"
                            >
                              <IconPlus className="w-3.5 h-3.5" />
                              <span>Tambah Kontak Ortu</span>
                            </button>
                          </div>

                          {(!biodataForm.kontak_ortu || biodataForm.kontak_ortu.length === 0) ? (
                            <div className="p-3 bg-white border border-dashed border-slate-300 rounded-xl text-center">
                              <p className="text-xs text-slate-400">Belum ada nomor kontak orang tua terdaftar.</p>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {biodataForm.kontak_ortu.map((item, idx) => (
                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                  {/* Pilihan Tag */}
                                  <div className="sm:col-span-3">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Peran / Tag</label>
                                    <select
                                      value={item.tag || 'Orang Tua'}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], tag: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      className={`w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border outline-none focus:ring-2 focus:ring-violet-400 ${
                                        item.tag === 'Ayah' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                        item.tag === 'Ibu' ? 'bg-pink-50 text-pink-800 border-pink-200' :
                                        item.tag === 'Wali' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        'bg-slate-50 text-slate-800 border-slate-200'
                                      }`}
                                    >
                                      <option value="Ayah">👨 Ayah</option>
                                      <option value="Ibu">👩 Ibu</option>
                                      <option value="Wali">🤝 Wali</option>
                                      <option value="Orang Tua">👥 Orang Tua</option>
                                    </select>
                                  </div>

                                  {/* Nama */}
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Nama Lengkap</label>
                                    <input
                                      type="text"
                                      value={item.nama || ''}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], nama: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      placeholder={`Nama ${item.tag || 'Orang Tua'}`}
                                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                                    />
                                  </div>

                                  {/* No HP */}
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">No. HP / WhatsApp</label>
                                    <input
                                      type="text"
                                      value={item.nomor || ''}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], nomor: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      placeholder="0812xxxx"
                                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                                    />
                                  </div>

                                  {/* Hapus Button */}
                                  <div className="sm:col-span-1 flex justify-end sm:justify-center pb-0.5">
                                    <button
                                      type="button"
                                      title="Hapus kontak ini"
                                      onClick={() => {
                                        const next = biodataForm.kontak_ortu.filter((_, i) => i !== idx)
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <IconTrash className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : activeTab === 'orang_tua' ? (
                      <>
                        <div className="md:col-span-2 bg-violet-50 border border-violet-200 rounded-2xl p-4">
                          <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-1">Orangtua dari:</p>
                          <p className="text-lg font-bold text-violet-900">{biodataForm.nama}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-violet-600 font-mono">
                            <span>NISN: {biodataForm.foreign_id}</span>
                            {biodataForm.kelas && <span>• Kelas: {biodataForm.kelas}</span>}
                          </div>
                        </div>

                        {/* Multi-Kontak Orang Tua / Wali (Tag: Ayah, Ibu, Wali, Orang Tua) */}
                        <div className="md:col-span-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                <span>👨‍👩‍👧‍👦</span>
                                <span>Daftar Kontak Orang Tua / Wali</span>
                              </h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Kelola kontak Ayah, Ibu, atau Wali untuk keperluan informasi dan notifikasi sekolah
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const list = Array.isArray(biodataForm.kontak_ortu) ? [...biodataForm.kontak_ortu] : []
                                const hasAyah = list.some(k => k.tag?.toLowerCase() === 'ayah')
                                const hasIbu = list.some(k => k.tag?.toLowerCase() === 'ibu')
                                const defaultTag = !hasAyah ? 'Ayah' : (!hasIbu ? 'Ibu' : 'Wali')
                                list.push({ tag: defaultTag, nama: '', nomor: '' })
                                setBiodataForm({ ...biodataForm, kontak_ortu: list })
                              }}
                              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 shrink-0"
                            >
                              <IconPlus className="w-3.5 h-3.5" />
                              <span>Tambah Kontak</span>
                            </button>
                          </div>

                          {(!biodataForm.kontak_ortu || biodataForm.kontak_ortu.length === 0) ? (
                            <div className="p-4 bg-white border border-dashed border-slate-300 rounded-xl text-center">
                              <p className="text-xs text-slate-500 mb-2">Belum ada kontak orang tua terdaftar.</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setBiodataForm({
                                    ...biodataForm,
                                    kontak_ortu: [
                                      { tag: 'Ayah', nama: biodataForm.nama_ortu || '', nomor: biodataForm.no_hp_ortu || '' }
                                    ]
                                  })
                                }}
                                className="px-3 py-1.5 bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg text-xs font-bold transition-colors"
                              >
                                + Tambah Kontak Pertama (Ayah)
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {biodataForm.kontak_ortu.map((item, idx) => (
                                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                  {/* Pilihan Tag */}
                                  <div className="sm:col-span-3">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Peran / Tag</label>
                                    <select
                                      value={item.tag || 'Orang Tua'}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], tag: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      className={`w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border outline-none focus:ring-2 focus:ring-violet-400 ${
                                        item.tag === 'Ayah' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                        item.tag === 'Ibu' ? 'bg-pink-50 text-pink-800 border-pink-200' :
                                        item.tag === 'Wali' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        'bg-slate-50 text-slate-800 border-slate-200'
                                      }`}
                                    >
                                      <option value="Ayah">👨 Ayah</option>
                                      <option value="Ibu">👩 Ibu</option>
                                      <option value="Wali">🤝 Wali</option>
                                      <option value="Orang Tua">👥 Orang Tua</option>
                                    </select>
                                  </div>

                                  {/* Nama */}
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Nama Lengkap</label>
                                    <input
                                      type="text"
                                      value={item.nama || ''}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], nama: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      placeholder={`Nama ${item.tag || 'Orang Tua'}`}
                                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                                    />
                                  </div>

                                  {/* No HP */}
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">No. HP / WhatsApp</label>
                                    <input
                                      type="text"
                                      value={item.nomor || ''}
                                      onChange={e => {
                                        const next = [...biodataForm.kontak_ortu]
                                        next[idx] = { ...next[idx], nomor: e.target.value }
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      placeholder="0812xxxx"
                                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                                    />
                                  </div>

                                  {/* Hapus Button */}
                                  <div className="sm:col-span-1 flex justify-end sm:justify-center pb-0.5">
                                    <button
                                      type="button"
                                      title="Hapus kontak ini"
                                      onClick={() => {
                                        const next = biodataForm.kontak_ortu.filter((_, i) => i !== idx)
                                        setBiodataForm({ ...biodataForm, kontak_ortu: next })
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <IconTrash className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Email Orang Tua (Opsional)</label>
                          <input type="email" value={biodataForm.email_ortu || ''} onChange={e => setBiodataForm({...biodataForm, email_ortu: e.target.value})} placeholder="Contoh: ortu@email.com" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Kode Guru (Untuk Cetak Jadwal, misal: 8 atau 8.1) *</label>
                          <input required value={biodataForm.kode} onChange={e => setBiodataForm({...biodataForm, kode: e.target.value})} placeholder="Misal: 8.1" className="w-full px-3 py-2 border rounded-2xl text-sm bg-white font-mono" />
                          <p className="text-[10px] text-slate-400 mt-1">ID unik guru yang akan dicetak di lembar jadwal pelajaran (seperti 8, 8.1, dst).</p>
                        </div>

                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                          <div className="md:col-span-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                            <input required value={biodataForm.nama} 
                              onChange={e => setBiodataForm({...biodataForm, nama: e.target.value})} 
                              className="w-full px-3 py-2 border rounded-2xl text-sm" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">No HP / WhatsApp</label>
                            <input value={biodataForm.no_hp || ''} onChange={e => setBiodataForm({...biodataForm, no_hp: e.target.value})} placeholder="Contoh: 62812xxx" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          </div>
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
                      <button type="button" onClick={() => { setUploadingPhotoFor(biodataForm.row); individualPhotoInputRef.current?.click() }} className="text-xs font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-2xl transition-colors flex justify-center items-center gap-1.5 w-full"><IconUpload className="w-3.5 h-3.5" /> Ganti Foto</button>
                      {biodataForm.foto_url && (
                        <button type="button" onClick={handleDeletePhotoModal} className="text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-2xl transition-colors flex justify-center items-center w-full">Hapus Foto</button>
                      )}
                      <div className="w-full h-px bg-slate-200 my-1"></div>
                      <button type="button" onClick={() => handleLoginAsUser(biodataForm.row)} className="text-xs font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 px-3 py-2 rounded-2xl transition-all flex justify-center items-center gap-1.5 w-full shadow-sm">
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
                        <label key={r.id} className={`flex items-center gap-1.5 px-3 py-2 border rounded-2xl cursor-pointer text-xs font-medium transition-colors ${biodataForm.role_ids.includes(r.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}>
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

                  {biodataForm.role_ids.includes(roles.find(r => r.nama?.toLowerCase() === 'guru')?.id) && (
                    <div className="mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Mata Pelajaran Guru (Spesialisasi)</label>
                      <select
                        value={primaryMapelId}
                        onChange={(e) => {
                          const val = e.target.value
                          setPrimaryMapelId(val)
                          // Automatically update empty mapel_id entries in guruMapel
                          const updatedMapel = guruMapel.map(gm => {
                            return {
                              ...gm,
                              mapel_list: gm.mapel_list.map(ml => {
                                if (!ml.mapel_id) {
                                  return { ...ml, mapel_id: val }
                                }
                                return ml
                              })
                            }
                          })
                          setGuruMapel(updatedMapel)
                        }}
                        className="w-full max-w-md px-3.5 py-2.5 border rounded-xl text-xs bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                      >
                        <option value="">-- Pilih Mata Pelajaran Utama --</option>
                        {mapels.map(m => (
                          <option key={m.id} value={m.id}>{m.nama}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1.5">Mengatur mata pelajaran default yang diajar oleh guru ini saat menambah penugasan baru.</p>
                    </div>
                  )}

                                    <div className="space-y-4 mt-6 border-t border-slate-200 pt-6">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg> Penugasan Akademik Guru</h4>
                    
                    {biodataForm.role_ids.includes(roles.find(r => r.nama?.toLowerCase() === 'wali kelas')?.id) && (
                      <div className="bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 space-y-4">
                        {!isEditingWali ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wide">Penugasan Wali Kelas</label>
                              <button
                                type="button"
                                onClick={() => setIsEditingWali(true)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                Ubah
                              </button>
                            </div>
                            {guruWaliKelas.filter(wk => wk.kelas_list.length > 0).length === 0 ? (
                              <p className="text-xs text-slate-500 italic">Tidak ada penugasan Wali Kelas.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {guruWaliKelas.filter(wk => wk.kelas_list.length > 0).map(wk => (
                                  <span key={wk.tahun_ajaran_id} className="text-xs bg-white border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl font-medium shadow-sm">
                                    <span className="font-bold text-slate-600">TA {wk.tahun_ajaran}:</span> {wk.kelas_list.join(', ')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wide">Edit Penugasan Wali Kelas</label>
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Hanya 1 Kelas per TA</span>
                            </div>

                            {[...guruWaliKelas].sort((a,b) => b.tahun_ajaran.localeCompare(a.tahun_ajaran)).map((wk, wkIdx) => {
                               const classesInThisTa = getAvailableClasses(wk.tahun_ajaran_id);
                               const selectedKelas = wk.kelas_list[0] || null;
                               return (
                                 <div key={wkIdx} className={`p-4 rounded-xl shadow-sm space-y-2 transition-all duration-200 ${
                                   wk.tahun_ajaran_id === activeTa?.id 
                                     ? 'bg-gradient-to-br from-emerald-50/50 to-white border-2 border-emerald-500/80 shadow-emerald-100/50' 
                                     : 'bg-white border border-slate-200'
                                 }`}>
                                   <div className="flex justify-between items-center mb-1">
                                     <span className="text-xs font-bold text-slate-700">TA: {wk.tahun_ajaran} {wk.tahun_ajaran_id === activeTa?.id && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Aktif</span>}</span>
                                     <button type="button" onClick={() => {
                                       const newWk = [...guruWaliKelas];
                                       newWk.splice(wkIdx, 1);
                                       setGuruWaliKelas(newWk);
                                     }} className="text-rose-500 hover:bg-rose-50 p-1 rounded"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                   </div>
                                   <div className="flex flex-wrap gap-2 mt-1">
                                     {classesInThisTa.length === 0 ? <span className="text-[10px] text-slate-400 italic">Belum ada kelas di TA ini.</span> : classesInThisTa.map(c => {
                                         const assignedTeacher = guruList.find(g =>
                                           g.id !== biodataForm.id &&
                                           g.guru_kelas?.some(gk => gk.tahun_ajaran_id === wk.tahun_ajaran_id && gk.kelas === c)
                                         );

                                         if (assignedTeacher) {
                                           return (
                                             <label key={c} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-slate-100 text-slate-400 rounded-2xl cursor-not-allowed text-xs font-medium" title={`Sudah diset untuk wali kelas: ${assignedTeacher.nama_guru}`}>
                                               <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                               {c} <span className="text-[9px] text-slate-400 font-normal">({assignedTeacher.nama_guru})</span>
                                             </label>
                                           )
                                         }

                                         const isSelected = selectedKelas === c;
                                         return (
                                           <button
                                             key={c}
                                             type="button"
                                             onClick={() => {
                                               const newWk = [...guruWaliKelas];
                                               if (isSelected) {
                                                 newWk[wkIdx].kelas_list = [];
                                               } else {
                                                 newWk[wkIdx].kelas_list = [c];
                                               }
                                               setSortedGuruWaliKelas(newWk);
                                             }}
                                             className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-2xl text-xs font-medium transition-all ${isSelected ? 'border-emerald-500 bg-emerald-100 text-emerald-800 shadow-sm ring-2 ring-emerald-300' : 'border-emerald-200 hover:bg-emerald-50 bg-white text-emerald-700'}`}
                                           >
                                             {isSelected && <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                             {c}
                                           </button>
                                         )
                                       })}
                                   </div>
                                   {selectedKelas && (
                                     <p className="text-[11px] text-emerald-700 font-medium pt-1">✓ Dipilih: Kelas <span className="font-bold">{selectedKelas}</span></p>
                                   )}
                                 </div>
                               )
                            })}

                            <div className="flex gap-2 items-end mt-2">
                              <div className="flex-1">
                                <select
                                  value={biodataForm.temp_ta_id || ''}
                                  onChange={e => setBiodataForm({...biodataForm, temp_ta_id: e.target.value})}
                                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-700"
                                >
                                  <option value="">-- Tambah Tahun Ajaran Wali Kelas --</option>
                                  {[...tahunAjarans].sort((a, b) => b.nama.localeCompare(a.nama)).filter(ta => !guruWaliKelas.find(w => w.tahun_ajaran_id === ta.id)).map(ta => (
                                    <option key={ta.id} value={ta.id}>
                                      {ta.nama} {ta.is_aktif ? '(Aktif)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if(!biodataForm.temp_ta_id) return;
                                  const ta = tahunAjarans.find(t => t.id === biodataForm.temp_ta_id);
                                  setSortedGuruWaliKelas([...guruWaliKelas, { tahun_ajaran_id: ta.id, tahun_ajaran: ta.nama, kelas_list: [] }]);
                                  setBiodataForm({...biodataForm, temp_ta_id: ''});
                                }}
                                className="bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-200 transition-colors"
                              >
                                Tambah TA
                              </button>
                            </div>

                            <div className="flex justify-end pt-2 border-t border-emerald-100">
                              <button
                                type="button"
                                onClick={() => setIsEditingWali(false)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm"
                              >
                                ✓ Terapkan Wali Kelas
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {biodataForm.role_ids.includes(roles.find(r => r.nama?.toLowerCase() === 'bk' || r.nama?.toLowerCase().includes('bimbingan'))?.id) && (
                      <div className="bg-purple-50/30 p-4 rounded-xl border border-purple-100 space-y-4">
                        {!isEditingBK ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-purple-800 uppercase tracking-wide">Penugasan BK</label>
                              <button
                                type="button"
                                onClick={() => setIsEditingBK(true)}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                Ubah
                              </button>
                            </div>
                            {guruBK.filter(bk => bk.kelas_list.length > 0).length === 0 ? (
                              <p className="text-xs text-slate-500 italic">Tidak ada penugasan BK.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {guruBK.filter(bk => bk.kelas_list.length > 0).map(bk => (
                                  <span key={bk.tahun_ajaran_id} className="text-xs bg-white border border-purple-200 text-purple-850 px-3 py-1.5 rounded-xl font-medium shadow-sm">
                                    <span className="font-bold text-slate-600">TA {bk.tahun_ajaran}:</span> {bk.kelas_list.join(', ')}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-purple-800 uppercase tracking-wide">Edit Penugasan BK</label>
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">Multi Kelas per TA</span>
                            </div>

                            {guruBK.map((bk, bkIdx) => {
                               const classesInThisTa = getAvailableClasses(bk.tahun_ajaran_id);
                               const selectedKelases = bk.kelas_list || [];
                               return (
                                 <div key={bkIdx} className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm space-y-2">
                                   <div className="flex justify-between items-center mb-1">
                                     <span className="text-xs font-bold text-slate-700">TA: {bk.tahun_ajaran} {bk.tahun_ajaran_id === activeTa?.id && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">Aktif</span>}</span>
                                     <button type="button" onClick={() => {
                                       const newBk = [...guruBK];
                                       newBk.splice(bkIdx, 1);
                                       setGuruBK(newBk);
                                     }} className="text-rose-500 hover:bg-rose-50 p-1 rounded"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                   </div>
                                   <div className="flex flex-wrap gap-2 mt-1">
                                     {classesInThisTa.length === 0 ? <span className="text-[10px] text-slate-400 italic">Belum ada kelas di TA ini.</span> : classesInThisTa.map(c => {
                                         const isSelected = selectedKelases.includes(c);
                                         return (
                                           <button
                                             key={c}
                                             type="button"
                                             onClick={() => {
                                               const newBK = [...guruBK];
                                               if (isSelected) {
                                                 newBK[bkIdx].kelas_list = newBK[bkIdx].kelas_list.filter(k => k !== c);
                                               } else {
                                                 newBK[bkIdx].kelas_list = [...newBK[bkIdx].kelas_list, c];
                                               }
                                               setSortedGuruBK(newBK);
                                             }}
                                             className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-2xl text-xs font-medium transition-all ${isSelected ? 'border-purple-500 bg-purple-100 text-purple-800 shadow-sm ring-2 ring-purple-200' : 'border-purple-200 hover:bg-purple-50 bg-white text-purple-700'}`}
                                           >
                                             {isSelected && <svg className="w-3 h-3 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                             {c}
                                           </button>
                                         )
                                       })}
                                   </div>
                                   {selectedKelases.length > 0 && (
                                     <p className="text-[11px] text-purple-700 font-medium pt-1">✓ Dipilih: <span className="font-bold">{selectedKelases.join(', ')}</span></p>
                                   )}
                                 </div>
                               )
                            })}

                            <div className="flex gap-2 items-end mt-2">
                              <div className="flex-1">
                                <select
                                  value={biodataForm.temp_ta_id_bk || ''}
                                  onChange={e => setBiodataForm({...biodataForm, temp_ta_id_bk: e.target.value})}
                                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-500 outline-none font-medium text-slate-700"
                                >
                                  <option value="">-- Tambah Tahun Ajaran BK --</option>
                                  {[...tahunAjarans].sort((a, b) => b.nama.localeCompare(a.nama)).filter(ta => !guruBK.find(b => b.tahun_ajaran_id === ta.id)).map(ta => (
                                    <option key={ta.id} value={ta.id}>
                                      {ta.nama} {ta.is_aktif ? '(Aktif)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if(!biodataForm.temp_ta_id_bk) return;
                                  const ta = tahunAjarans.find(t => t.id === biodataForm.temp_ta_id_bk);
                                  setSortedGuruBK([...guruBK, { tahun_ajaran_id: ta.id, tahun_ajaran: ta.nama, kelas_list: [] }]);
                                  setBiodataForm({...biodataForm, temp_ta_id_bk: ''});
                                }}
                                className="bg-purple-100 text-purple-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors"
                              >
                                Tambah TA
                              </button>
                            </div>

                            <div className="flex justify-end pt-2 border-t border-purple-100">
                              <button
                                type="button"
                                onClick={() => setIsEditingBK(false)}
                                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm"
                              >
                                ✓ Terapkan BK
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-100 space-y-4">
                      {!isEditingMapel ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide">Tugas Mengajar Mapel</label>
                            <button
                              type="button"
                              onClick={() => setIsEditingMapel(true)}
                              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              Ubah
                            </button>
                          </div>
                          {guruMapel.filter(gm => gm.mapel_list.some(ml => ml.mapel_id && ml.kelas_list.length > 0)).length === 0 ? (
                            <p className="text-xs text-slate-500 italic">Tidak ada tugas mengajar Mapel.</p>
                          ) : (
                            <div className="space-y-2 pt-1">
                              {guruMapel.filter(gm => gm.mapel_list.some(ml => ml.mapel_id && ml.kelas_list.length > 0)).map(gm => (
                                <div key={gm.tahun_ajaran_id} className="text-xs bg-white border border-indigo-200 text-indigo-900 p-3 rounded-xl shadow-sm space-y-1">
                                  <div className="font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                    TA {gm.tahun_ajaran}:
                                  </div>
                                  <div className="pl-5 space-y-1 border-l-2 border-indigo-100">
                                    {gm.mapel_list.filter(ml => ml.mapel_id && ml.kelas_list.length > 0).map((ml, mlIdx) => {
                                      const mapelName = mapels.find(m => m.id === ml.mapel_id)?.nama || ml.mapel_id;
                                      return (
                                        <div key={mlIdx} className="flex items-center gap-2">
                                          <span className="text-slate-500 font-medium">{mapelName}:</span>
                                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">{ml.kelas_list.join(', ')}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide">Edit Tugas Mengajar Mapel</label>
                          </div>

                          {[...guruMapel].sort((a,b) => b.tahun_ajaran.localeCompare(a.tahun_ajaran)).map((gm, gmIdx) => {
                             const classesInThisTa = getAvailableClasses(gm.tahun_ajaran_id);
                             return (
                               <div key={gmIdx} className={`p-4 rounded-xl shadow-sm space-y-3 transition-all duration-200 mb-3 ${
                                 gm.tahun_ajaran_id === activeTa?.id 
                                   ? 'bg-gradient-to-br from-indigo-50/50 to-white border-2 border-indigo-500/80 shadow-indigo-100/50' 
                                   : 'bg-white border border-slate-200'
                               }`}>
                                 <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                                   <span className="text-xs font-bold text-slate-700">TA: {gm.tahun_ajaran} {gm.tahun_ajaran_id === activeTa?.id && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">Aktif</span>}</span>
                                   <div className="flex items-center gap-2">
                                     <button type="button" onClick={() => {
                                       const newGm = [...guruMapel];
                                       newGm[gmIdx].mapel_list.push({ mapel_id: primaryMapelId || '', kelas_list: [] });
                                       setSortedGuruMapel(newGm);
                                     }} className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 font-bold">+ Mapel</button>
                                     <button type="button" onClick={() => {
                                       const newGm = [...guruMapel];
                                       newGm.splice(gmIdx, 1);
                                       setSortedGuruMapel(newGm);
                                     }} className="text-rose-500 hover:bg-rose-50 p-1 rounded"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                   </div>
                                 </div>

                                 <div className="space-y-3">
                                   {gm.mapel_list.length === 0 ? <p className="text-[10px] text-slate-400 italic">Belum ada mapel di TA ini.</p> : gm.mapel_list.map((ma, idx) => (
                                    <div key={idx} className="flex flex-col gap-2 bg-slate-50 p-2 border border-slate-200 rounded-lg">
                                      <div className="flex gap-2 items-center">
                                        <select value={ma.mapel_id} onChange={(e) => {
                                            const newGm = [...guruMapel];
                                            newGm[gmIdx].mapel_list[idx].mapel_id = e.target.value;
                                            setSortedGuruMapel(newGm)
                                          }} className="flex-1 text-xs border border-slate-300 rounded-md py-1.5 px-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">-- Pilih Mata Pelajaran --</option>
                                          {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                                        </select>
                                        <button type="button" onClick={() => {
                                          const newGm = [...guruMapel];
                                          newGm[gmIdx].mapel_list.splice(idx, 1);
                                          setSortedGuruMapel(newGm);
                                        }} className="p-1 text-rose-500 hover:bg-rose-100 rounded-md"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                      </div>

                                      <div className="w-full flex justify-between items-center mt-1 mb-1">
                                        <span className="text-[10px] text-slate-500 font-medium">Pilih Kelas:</span>
                                        <div className="flex gap-2">
                                          <button type="button" onClick={() => {
                                             const newGm = [...guruMapel];
                                             // Hanya pilih kelas yang TIDAK dilock guru lain untuk mapel yang sama
                                             const availableOnly = classesInThisTa.filter(c => {
                                               if (!ma.mapel_id) return true;
                                               return !guruList.some(g =>
                                                 g.id !== biodataForm.id &&
                                                 g.guru_mapel?.some(gMapel =>
                                                   gMapel.tahun_ajaran_id === gm.tahun_ajaran_id &&
                                                   gMapel.mata_pelajaran_id === ma.mapel_id &&
                                                   gMapel.kelas === c
                                                 )
                                               );
                                             });
                                             newGm[gmIdx].mapel_list[idx].kelas_list = availableOnly;
                                             setSortedGuruMapel(newGm);
                                           }} className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium">Semua</button>
                                          <span className="text-[10px] text-slate-300">|</span>
                                          <button type="button" onClick={() => {
                                            const newGm = [...guruMapel];
                                            newGm[gmIdx].mapel_list[idx].kelas_list = [];
                                            setSortedGuruMapel(newGm);
                                          }} className="text-[10px] text-slate-500 hover:text-slate-700 font-medium">Kosongkan</button>
                                        </div>
                                      </div>
                                      <div className="w-full flex flex-wrap gap-1.5">
                                        {classesInThisTa.length === 0 ? <span className="text-[10px] text-slate-400 italic">Tidak ada opsi kelas.</span> : classesInThisTa.map(c => {
                                          const assignedTeacher = ma.mapel_id ? guruList.find(g =>
                                            g.id !== biodataForm.id &&
                                            g.guru_mapel?.some(gMapel =>
                                              gMapel.tahun_ajaran_id === gm.tahun_ajaran_id &&
                                              gMapel.mata_pelajaran_id === ma.mapel_id &&
                                              gMapel.kelas === c
                                            )
                                          ) : null;

                                          if (assignedTeacher) {
                                            return (
                                              <label key={c} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-slate-100 text-slate-400 rounded-2xl cursor-not-allowed text-xs font-medium" title={`Sudah diampu oleh guru mapel: ${assignedTeacher.nama_guru}`}>
                                                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                {c} <span className="text-[9px] text-slate-400 font-normal">({assignedTeacher.nama_guru})</span>
                                              </label>
                                            )
                                          }

                                          const isSelected = ma.kelas_list.includes(c);
                                          return (
                                            <label key={c} className={`px-2.5 py-1.5 border rounded-xl cursor-pointer text-[10px] font-medium transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                              <input type="checkbox" className="hidden" checked={isSelected}
                                                onChange={(e) => {
                                                  const newGm = [...guruMapel];
                                                  const currentList = newGm[gmIdx].mapel_list[idx].kelas_list;
                                                  if (e.target.checked && !currentList.includes(c)) {
                                                    currentList.push(c);
                                                  } else {
                                                    newGm[gmIdx].mapel_list[idx].kelas_list = currentList.filter(k => k !== c);
                                                  }
                                                  setGuruMapel(newGm);
                                                }} />
                                              {c}
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                   ))}
                                 </div>
                               </div>
                             )
                          })}

                          <div className="flex gap-2 items-end mt-2">
                            <div className="flex-1">
                              <select
                                value={biodataForm.temp_ta_id_mapel || ''}
                                onChange={e => setBiodataForm({...biodataForm, temp_ta_id_mapel: e.target.value})}
                                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                              >
                                <option value="">-- Tambah Tahun Ajaran Mapel --</option>
                                {[...tahunAjarans].sort((a, b) => b.nama.localeCompare(a.nama)).filter(ta => !guruMapel.find(m => m.tahun_ajaran_id === ta.id)).map(ta => (
                                  <option key={ta.id} value={ta.id}>
                                    {ta.nama} {ta.is_aktif ? '(Aktif)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if(!biodataForm.temp_ta_id_mapel) return;
                                const ta = tahunAjarans.find(t => t.id === biodataForm.temp_ta_id_mapel);
                                const defaultMapelList = primaryMapelId ? [{ mapel_id: primaryMapelId, kelas_list: [] }] : [];
                                setSortedGuruMapel([...guruMapel, { tahun_ajaran_id: ta.id, tahun_ajaran: ta.nama, mapel_list: defaultMapelList }]);
                                setBiodataForm({...biodataForm, temp_ta_id_mapel: ''});
                              }}
                              className="bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors"
                            >
                              Tambah TA
                            </button>
                          </div>

                          <div className="flex justify-end pt-2 border-t border-indigo-100">
                            <button
                              type="button"
                              onClick={() => setIsEditingMapel(false)}
                              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm"
                            >
                              ✓ Terapkan Mapel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
                <div className={`grid grid-cols-1 ${activeTab === 'murid' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status Akun</label>
                    <select value={biodataForm.akun_status} onChange={e => setBiodataForm({...biodataForm, akun_status: e.target.value})} className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="aktif">🟢 Aktif</option>
                      <option value="nonaktif">🔴 Nonaktif / Pindah</option>
                    </select>
                  </div>
                  {activeTab === 'murid' ? (
                    <>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Email Siswa (Gmail)</label>
                        <input type="email" value={biodataForm.email_aktif} onChange={e => setBiodataForm({...biodataForm, email_aktif: e.target.value})} placeholder="Contoh: siswa@gmail.com" className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Username Siswa *</label>
                        <input required value={biodataForm.username_siswa} onChange={e => setBiodataForm({...biodataForm, username_siswa: e.target.value})} placeholder="Contoh: ebmsiswa.siswa123" className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-1">
                      <label className="block text-xs font-medium text-slate-700 mb-1">{activeTab === 'orang_tua' ? 'Username Orang Tua *' : 'Email / Username *'}</label>
                      <input required value={biodataForm.username} onChange={e => setBiodataForm({...biodataForm, username: e.target.value})} className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">{biodataForm.hasAkun ? 'Ganti Password' : 'Password Awal'}</label>
                    <input type="text" value={biodataForm.password} onChange={e => setBiodataForm({...biodataForm, password: e.target.value})} placeholder={biodataForm.hasAkun ? 'Kosongkan jika sama' : 'Default: 123456'} className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

            </form>
            <div className="p-5 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={handleCloseBiodataModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">Batal</button>
              <button type="submit" form="biodata-form" disabled={isProcessing} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 flex items-center gap-2">
                {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Simpan Data'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cetak Kartu Login Modal */}
      {showPrintCardsModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in" id="modal-cetak-kartu-root">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-slide-up-scale">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Preview Cetak Kartu Login Siswa & Ortu
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Mencetak {mergedData.length} kartu siswa yang saat ini ter-filter.</p>
              </div>

              {/* Layout Mode Toggles */}
              <div className="flex items-center gap-1.5 bg-slate-200/70 p-1.5 rounded-2xl border border-slate-300/40">
                <button
                  type="button"
                  onClick={() => setPrintLayout('4-per-page')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${printLayout === '4-per-page' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/50'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  4 per Halaman
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('1-per-page')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${printLayout === '1-per-page' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/50'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                  1 per Halaman
                </button>
              </div>

              <button onClick={() => setShowPrintCardsModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Modal Body / Scrollable Preview */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100" id="print-cards-area">
              <style>{`
                @media print {
                  * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    box-shadow: none !important;
                    text-shadow: none !important;
                  }
                  @page {
                    size: A4 portrait;
                    margin: 10mm 10mm;
                  }
                  html, body {
                    width: 100% !important;
                    height: auto !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                  }
                  body > *:not(#print-cards-wrap) {
                    display: none !important;
                  }
                  #print-cards-wrap {
                    display: block !important;
                    width: 100% !important;
                    height: auto !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    box-sizing: border-box !important;
                    background: white !important;
                  }
                  #print-cards-grid {
                    display: block !important;
                    width: 190mm !important;
                    margin: 0 auto !important;
                  }
                  .print-page-container {
                    width: 190mm !important;
                    height: 270mm !important;
                    box-sizing: border-box !important;
                    margin: 0 auto !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    border-radius: 0 !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    position: relative !important;
                    background: white !important;
                  }
                  .print-page-container:last-child {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                  }
                  .print-page-grid {
                    display: ${printLayout === '4-per-page' ? 'grid' : 'flex'} !important;
                    ${printLayout === '4-per-page' ? `
                      grid-template-columns: 90mm 90mm !important;
                      grid-auto-rows: 128mm !important;
                      gap: 8mm 10mm !important;
                    ` : `
                      flex-direction: column !important;
                      align-items: center !important;
                      justify-content: center !important;
                      height: 100% !important;
                    `}
                    width: 190mm !important;
                    height: auto !important;
                  }
                  .print-card-item {
                    width: 90mm !important;
                    height: 128mm !important;
                    box-sizing: border-box !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 0px !important;
                    box-shadow: none !important;
                    background-color: white !important;
                    background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.02) 0%, transparent 80%), 
                                      repeating-linear-gradient(-45deg, rgba(148, 163, 184, 0.04) 0px, rgba(148, 163, 184, 0.04) 1px, transparent 1px, transparent 10px) !important;
                    position: relative !important;
                  }
                }
                
                @media screen {
                  .print-page-container {
                    background: white;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                    border-radius: 1rem;
                    padding: 1.5rem;
                  }
                  .print-card-item {
                    border-radius: 0px;
                    background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.02) 0%, transparent 80%), 
                                      repeating-linear-gradient(-45deg, rgba(148, 163, 184, 0.04) 0px, rgba(148, 163, 184, 0.04) 1px, transparent 1px, transparent 10px);
                  }
                }
              `}</style>
              {(() => {
                const chunkedPages = []
                const pageSize = printLayout === '4-per-page' ? 4 : 1
                for (let i = 0; i < mergedData.length; i += pageSize) {
                  chunkedPages.push(mergedData.slice(i, i + pageSize))
                }

                return (
                  <div className="space-y-8 max-w-4xl mx-auto" id="print-cards-grid">
                    {chunkedPages.map((pageCards, pageIndex) => (
                      <div
                        key={pageIndex}
                        className="print-page-container bg-white rounded-2xl shadow-md border border-slate-200/60"
                      >
                        <div className="text-xs text-slate-400 font-bold mb-4 print:hidden border-b pb-2 flex justify-between items-center">
                          <span>Halaman {pageIndex + 1} dari {chunkedPages.length}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-500 font-black">
                            {pageCards.length} Kartu
                          </span>
                        </div>
                        <div className={`print-page-grid ${printLayout === '4-per-page' ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "flex flex-col items-center gap-6"}`}>
                          {pageCards.map((s, index) => {
                            const classCol = getClassColor(s.kelas)
                            const studentPass = siswaPermanentCredentials[s.foreign_id]?.kode_akses || s.rawStudent?.kode_akses || s.password_text || s.raw_password || ''
                            const ortuUser = siswaPermanentCredentials[s.foreign_id]?.ortu_username || s.rawStudent?.ortu_username || ''
                            const ortuPass = siswaPermanentCredentials[s.foreign_id]?.ortu_password || s.rawStudent?.ortu_password || ''
                            const studentLoginUrl = `${window.location.origin}/login?u=${encodeURIComponent(s.username || '')}&p=${encodeURIComponent(studentPass)}&r=siswa`
                            const studentQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(studentLoginUrl)}`
                            const ortuLoginUrl = `${window.location.origin}/login?u=${encodeURIComponent(ortuUser)}&p=${encodeURIComponent(ortuPass)}&r=ortu`
                            const ortuQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(ortuLoginUrl)}`

                            return (
                              <div key={s.id || index} className="print-card-item bg-white border border-slate-200 rounded-none p-5 shadow-sm relative overflow-hidden flex flex-col justify-between" style={{ minHeight: '460px', maxHeight: '480px' }}>
                                {/* Geometric Background Shapes */}
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/60 -z-10" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
                                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-100/40 -z-10" style={{ clipPath: 'polygon(100% 0, 30% 0, 100% 70%)' }} />
                                <div className={`absolute top-0 right-0 rounded-none px-5 py-2 text-[11px] font-black text-white shadow-sm z-10 ${classCol.solidBg}`}>
                                  {s.kelas || '-'} No. {classAbsenMap[s.foreign_id] || classAbsenMap[s.nisn] || classAbsenMap[s.nama] || '-'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-4 border-b pb-2 border-slate-100 mb-3 pr-20">
                                    <div className="shrink-0">
                                      <img src="/logo.png" alt="Logo SMP Budi Mulia" className="w-10 h-10 object-contain rounded-lg" />
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="text-base font-black tracking-wide text-slate-800 leading-tight">
                                        KARTU <span className="text-indigo-600">AKSES</span> PORTAL
                                      </h3>
                                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-1 leading-none">
                                        SMP BUDI MULIA JAKARTA
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-4 items-center mb-3">
                                  <div className={`relative rounded-2xl overflow-hidden border shrink-0 ${s.foto_url ? 'border-2 border-white shadow-md bg-blue-500' : 'border-slate-200 bg-white'}`} style={{ width: '70px', height: '90px' }}>
                                    {s.foto_url && (
                                      <img src={s.foto_url} alt={s.nama} className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 py-1">
                                    <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">NAMA SISWA</span>
                                    <span className="block text-base font-black text-slate-800 truncate leading-tight">{s.nama}</span>
                                  </div>
                                </div>
                                <div className="bg-[#f8fafc] border border-slate-100 border-l-4 border-l-blue-600 rounded-2xl p-3 mb-3 flex items-center justify-between gap-2 shadow-sm">
                                  <div className="flex-1 space-y-2 text-[11px] min-w-0 pr-1">
                                    <div className="flex items-center gap-1.5 border-b pb-1.5 border-slate-100">
                                      <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                      </div>
                                      <span className="font-extrabold text-[9px] text-blue-600 uppercase tracking-wider">Akses Login Siswa</span>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Username</span>
                                      <span className="font-mono font-bold text-slate-800 truncate block leading-none py-0.5">{s.username || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Kode Akses / Pass</span>
                                      <span className="font-mono font-extrabold text-sm text-blue-600 leading-none block">{studentPass || '-'}</span>
                                    </div>
                                  </div>
                                  {s.username && s.username !== '(Belum punya akun)' && studentPass && (
                                    <div className="shrink-0 flex flex-col items-center bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                                      <img src={studentQrUrl} alt="QR Siswa" className="w-14 h-14 object-contain" />
                                      <span className="text-[8px] text-slate-400 font-bold mt-1 tracking-tight">Scan Login</span>
                                    </div>
                                  )}
                                </div>
                                <div className="bg-[#fdfcff] border border-slate-100 border-l-4 border-l-violet-600 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-sm">
                                  <div className="flex-1 space-y-2 text-[11px] min-w-0 pr-1">
                                    <div className="flex items-center gap-1.5 border-b pb-1.5 border-slate-100">
                                      <div className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-violet-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                      </div>
                                      <span className="font-extrabold text-[9px] text-violet-600 uppercase tracking-wider">Akses Login Orang Tua</span>
                                    </div>
                                    <div className="min-w-0">
                                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Username Ortu</span>
                                      <span className="font-mono font-bold text-slate-800 truncate block leading-none py-0.5">{ortuUser || '-'}</span>
                                    </div>
                                    <div>
                                      <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">Password Ortu</span>
                                      <span className="font-mono font-extrabold text-sm text-violet-600 leading-none block">{ortuPass || '-'}</span>
                                    </div>
                                  </div>
                                  {ortuUser && ortuUser !== '-' && ortuPass && ortuPass !== '-' && (
                                    <div className="shrink-0 flex flex-col items-center bg-white p-1.5 rounded-lg border border-violet-200 shadow-sm">
                                      <img src={ortuQrUrl} alt="QR Ortu" className="w-14 h-14 object-contain" />
                                      <span className="text-[8px] text-violet-500 font-bold mt-1 tracking-tight">Scan Login</span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-center mt-4 text-[9px] text-slate-400 font-semibold tracking-wider flex items-center justify-center gap-1.5 shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-indigo-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                  <span>Portal Akademik:</span>
                                  <span className="text-indigo-600 font-bold">edu.smpbudimuliajakarta.sch.id</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Modal Footer / Action */}
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowPrintCardsModal(false)} className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50">
                Tutup
              </button>
              <button type="button" onClick={() => {
                const el = document.getElementById('print-cards-grid')
                const style = document.createElement('style')
                style.innerHTML = `
                  @media print {
                    * {
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                      box-shadow: none !important;
                      text-shadow: none !important;
                    }
                    @page {
                      size: A4 portrait;
                      margin: 10mm 10mm;
                    }
                    html, body {
                      width: 100% !important;
                      height: auto !important;
                      margin: 0 !important;
                      padding: 0 !important;
                      background: white !important;
                    }
                    body > *:not(#print-cards-wrap) {
                      display: none !important;
                    }
                    #print-cards-wrap {
                      display: block !important;
                      width: 100% !important;
                      height: auto !important;
                      padding: 0 !important;
                      margin: 0 !important;
                      box-sizing: border-box !important;
                      background: white !important;
                    }
                    .print-page-container {
                      width: 190mm !important;
                      height: 270mm !important;
                      box-sizing: border-box !important;
                      margin: 0 auto !important;
                      padding: 0 !important;
                      border: none !important;
                      box-shadow: none !important;
                      border-radius: 0 !important;
                      page-break-after: always !important;
                      break-after: page !important;
                      position: relative !important;
                      background: white !important;
                    }
                    .print-page-container:last-child {
                      page-break-after: avoid !important;
                      break-after: avoid !important;
                    }
                    .print-page-grid {
                      display: ${printLayout === '4-per-page' ? 'grid' : 'flex'} !important;
                      ${printLayout === '4-per-page' ? `
                        grid-template-columns: 90mm 90mm !important;
                        grid-auto-rows: 128mm !important;
                        gap: 8mm 10mm !important;
                      ` : `
                        flex-direction: column !important;
                        align-items: center !important;
                        justify-content: center !important;
                        height: 100% !important;
                      `}
                      width: 190mm !important;
                      height: auto !important;
                    }
                    .print-card-item {
                      width: 90mm !important;
                      height: 128mm !important;
                      box-sizing: border-box !important;
                      border: 1px solid #cbd5e1 !important;
                      border-radius: 0px !important;
                      box-shadow: none !important;
                      background-color: white !important;
                      background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.02) 0%, transparent 80%), 
                                        repeating-linear-gradient(-45deg, rgba(148, 163, 184, 0.04) 0px, rgba(148, 163, 184, 0.04) 1px, transparent 1px, transparent 10px) !important;
                      position: relative !important;
                    }
                  }
                `
                document.head.appendChild(style)
                const wrap = document.createElement('div')
                wrap.id = 'print-cards-wrap'
                wrap.appendChild(el.cloneNode(true))
                document.body.appendChild(wrap)
                window.print()
                document.body.removeChild(wrap)
                document.head.removeChild(style)
              }} className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 flex items-center gap-2 shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Cetak Sekarang ({mergedData.length} Kartu)
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Export Options Modal */}
      {showExportModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up-scale">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Data Pengguna
              </h3>
              <button onClick={() => setShowExportModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-200/80 px-3 py-2 rounded-xl">
                <span className="text-xs text-indigo-900 font-medium">Tahun Ajaran Target:</span>
                <span className="text-xs font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-100 shadow-2xs">
                  {activeTa?.nama || 'Aktif'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3">Pilih format data yang ingin Anda unduh ke dalam format Excel:</p>
              
              <div className="space-y-2.5">
                <button onClick={() => handleExportExcel('1')} className="w-full flex items-start text-left gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-200 transition-colors shrink-0">
                    <IconUsers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-800">Hanya Data Murid ({activeTa?.nama || 'Aktif'})</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Export khusus biodata dan akun seluruh murid tahun ajaran aktif</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('2')} className="w-full flex items-start text-left gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-200 transition-colors shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-800">Hanya Data Guru / Staff</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Export khusus data pengajar dan penugasan</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('3')} className="w-full flex items-start text-left gap-3 p-3.5 border border-indigo-200 bg-indigo-50/50 rounded-xl hover:border-indigo-400 hover:bg-indigo-100 transition-all group ring-1 ring-indigo-50 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-bl-lg">REKOMENDASI</div>
                  <div className="p-2 bg-indigo-600 text-white rounded-xl group-hover:bg-indigo-700 transition-colors shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-900">Semua Data (Murid {activeTa?.nama || 'Aktif'} & Guru)</h4>
                    <p className="text-xs text-indigo-700/80 mt-0.5">Data murid dan guru akan dipisah dalam sheet berbeda</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('4')} className="w-full flex items-start text-left gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-teal-300 hover:bg-teal-50 transition-all group">
                  <div className="p-2 bg-teal-100 text-teal-600 rounded-xl group-hover:bg-teal-200 transition-colors shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-teal-800">Template Update NISN ({activeTa?.nama || 'Aktif'})</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Download template terisi Nama & NISN Lama untuk update massal</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('5')} className="w-full flex items-start text-left gap-3 p-3.5 border border-emerald-200 bg-emerald-50/40 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-bl-lg">KARTU PELAJAR & ORTU</div>
                  <div className="p-2 bg-emerald-600 text-white rounded-xl group-hover:bg-emerald-700 transition-colors shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><line x1="15" y1="8" x2="17" y2="8"/><line x1="15" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-950 group-hover:text-emerald-900">Template Data Lengkap Siswa & Alamat ({activeTa?.nama || 'Aktif'})</h4>
                    <p className="text-xs text-emerald-800/80 mt-0.5">Format Excel resmi tahun aktif untuk NISN, TTL, Alamat Lengkap & Kontak Ortu (Ayah, Ibu, Wali)</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL RESET PASSWORD & WHATSAPP */}
      {showResetModal && resetData && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] overflow-y-auto p-3 sm:p-4 flex justify-center items-center min-h-screen">
          <div className="bg-white rounded-2xl w-full max-w-md my-auto flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-scale-in">
            {/* Header (Sticky / Shrink-0) */}
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <IconKey className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-800 leading-tight">
                    Reset {activeTab === 'murid' ? 'Kode Akses Siswa' : 'Password Orang Tua'}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate font-semibold">
                    Akun: <span className="text-slate-700">{resetData.row.nama}</span>
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowResetModal(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                title="Tutup Modal"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            {/* Body (Scrollable & min-h-0 for flex constraint) */}
            <div className="p-3.5 text-left space-y-2.5 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
              {/* Opsi Metode Sandi Ringkas */}
              <div className="flex items-center justify-between bg-slate-100 p-1 rounded-lg">
                <span className="text-[10px] font-bold text-slate-500 px-1.5">Metode Sandi:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleResetMethodChange('random')}
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all ${resetMethod === 'random' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    🎲 Acak
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetMethodChange('manual')}
                    className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all ${resetMethod === 'manual' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ✍️ Manual
                  </button>
                </div>
              </div>
              
              {/* Username & Password Grid (Samping-sampingan & Kompak) */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                {/* Username */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Username</span>
                    <button 
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(resetData.row.username)
                        alert("Username berhasil disalin!")
                      }}
                      className="text-[10px] text-indigo-600 hover:underline font-bold"
                    >
                      Salin
                    </button>
                  </div>
                  <div className="text-xs font-bold text-slate-800 font-mono truncate" title={resetData.row.username}>
                    {resetData.row.username}
                  </div>
                </div>

                {/* Password / Kode Akses */}
                <div className="border-l border-slate-200/80 pl-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                      {activeTab === 'murid' ? 'Kode Akses' : 'Password'}
                    </span>
                    {resetMethod === 'random' && (
                      <button 
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(resetData.generatedPass)
                          alert(`${activeTab === 'murid' ? 'Kode Akses' : 'Password'} berhasil disalin!`)
                        }}
                        className="text-[10px] text-indigo-600 hover:underline font-bold"
                      >
                        Salin
                      </button>
                    )}
                  </div>
                  {resetMethod === 'random' ? (
                    <div className="text-xs font-black text-indigo-700 font-mono tracking-wider truncate">
                      {resetData.generatedPass}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={resetData.generatedPass || ''}
                      onChange={(e) => setResetData({ ...resetData, generatedPass: e.target.value })}
                      placeholder="Min 4 char"
                      className="w-full text-xs font-bold text-indigo-700 font-mono bg-white border border-slate-300 rounded px-1.5 py-0.5 outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Fast Auto-login Copy Button (1-line) */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${resetData.row.username}|${resetData.generatedPass}`)
                  alert("Format Auto-Login berhasil disalin! Tempelkan (paste) langsung ke kolom Username di halaman login untuk langsung mengisi kedua kolom.")
                }}
                className="w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs"
              >
                <span>📋</span>
                <span>Salin Cepat (Format Auto-Login)</span>
              </button>
              
              {/* WhatsApp Box */}
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Nomor WhatsApp Tujuan</label>
                  {resetData.waNumber && (
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Aktif: {resetData.waNumber}
                    </span>
                  )}
                </div>

                {/* Quick Selection Chips Kontak Ortu */}
                {activeTab === 'orang_tua' && resetData.availableContacts?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 font-medium">Pilih kontak penerima:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {resetData.availableContacts.map((c, idx) => {
                        const isSelected = resetData.waNumber === c.nomor
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setResetData({ 
                              ...resetData, 
                              waNumber: c.nomor, 
                              selectedTag: c.tag, 
                              selectedName: c.nama 
                            })}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                              isSelected 
                                ? 'bg-violet-600 text-white border-violet-600 shadow-xs' 
                                : 'bg-white text-slate-700 border-slate-200 hover:border-violet-300 hover:bg-violet-50/50'
                            }`}
                          >
                            <span>{c.icon}</span>
                            <span>{c.tag}{c.nama ? ` (${c.nama})` : ''}</span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-violet-100' : 'text-slate-400'}`}>• {c.nomor}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                  </div>
                  <input 
                    type="text" 
                    value={resetData.waNumber || ''} 
                    onChange={(e) => setResetData({...resetData, waNumber: e.target.value})} 
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white transition-all" 
                    placeholder="Nomor WA (contoh: 62812xxxx)" 
                  />
                </div>
                
                {activeTab === 'orang_tua' && !resetData.waNumber && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                    <p className="text-[10px] text-amber-900 font-bold leading-tight">
                      ⚠️ Nomor HP Orang Tua belum diisi!
                    </p>
                    {resetData.noHpSiswa && (
                      <button
                        type="button"
                        onClick={() => setResetData({ ...resetData, waNumber: resetData.noHpSiswa })}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline block text-left"
                      >
                        👉 Pakai nomor HP Siswa ({resetData.noHpSiswa})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer Buttons (Sticky / Shrink-0 / Single Row Ringkas) */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button 
                type="button"
                onClick={() => setShowResetModal(false)} 
                disabled={isProcessing}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={() => executeReset(false)} 
                disabled={isProcessing}
                className="px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl transition-colors"
              >
                Hanya Simpan
              </button>
              <button 
                type="button"
                onClick={() => executeReset(true)} 
                disabled={isProcessing}
                className="flex-1 sm:flex-initial px-4 py-2 bg-[#25D366] hover:bg-[#1EBE5C] text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isProcessing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                    Simpan & Kirim WA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ExportKontakModal
        isOpen={showExportKontakModal}
        onClose={() => setShowExportKontakModal(false)}
        initialKelas={selectedClassFilter || 'Semua Siswa'}
        semuaKelas={uniqueClasses}
        activeTa={activeTa}
      />

      <TemplateUpdateNisnModal
        isOpen={showTemplateNisnModal}
        onClose={() => setShowTemplateNisnModal(false)}
        students={students}
        semuaKelas={uniqueClasses}
        activeTa={activeTa}
      />

      {/* Modal Audit Kelengkapan Biodata Siswa (Khusus Tahun Ajaran Aktif) */}
      <ModalKelengkapanDataSiswa
        isOpen={showKelengkapanModal}
        onClose={() => setShowKelengkapanModal(false)}
        students={getMergedData().filter(s => {
          const targetTa = activeTa?.nama
          if (!targetTa) return s.kelas && s.kelas !== '-'
          const isTaMatch = s.tahun_ajaran === targetTa || 
            (Array.isArray(s.rawStudent?.enrollments) && s.rawStudent.enrollments.some(e => e.tahun_ajaran?.trim() === targetTa.trim()))
          return isTaMatch && s.kelas && s.kelas !== '-'
        })}
        activeTa={activeTa}
        masterKelas={getActiveClasses()}
        onEditStudent={(row) => openBiodataModal(row)}
      />

      {/* Quick Kartu Pelajar Preview Modal */}
      {quickCardStudent && createPortal(
        <div 
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in" 
          onClick={() => setQuickCardStudent(null)}
        >
          <div 
            className="bg-slate-900 rounded-3xl p-6 shadow-2xl max-w-xl w-full flex flex-col items-center border border-slate-700" 
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex justify-between items-center mb-4 text-white border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold">Kartu Pelajar Siswa</h3>
                <p className="text-xs text-slate-400">{quickCardStudent.nama_lengkap || quickCardStudent.nama} (NISN: {quickCardStudent.foreign_id || quickCardStudent.nisn})</p>
              </div>
              <button 
                onClick={() => setQuickCardStudent(null)} 
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-x-auto max-w-full p-2 flex justify-center">
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', width: '510px', height: '320px' }}>
                <KartuPelajarCard 
                  student={quickCardStudent} 
                  photoUrl={quickCardStudent.foto_url} 
                  side="front" 
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2.5 w-full justify-end pt-3 border-t border-white/10">
              <button 
                onClick={() => window.print()} 
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <span>🖨️ Cetak Kartu</span>
              </button>
              <button 
                onClick={() => setQuickCardStudent(null)} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSmartPhotoModal && (
        <SmartPhotoUploadModal
          isOpen={showSmartPhotoModal}
          onClose={() => setShowSmartPhotoModal(false)}
          students={students}
          activeTa={activeTa}
          tahunAjarans={tahunAjarans}
          onSuccess={() => {
            fetchData()
            onRefresh?.()
          }}
        />
      )}

      {ConfirmModalComponent}

    </div>
  )
}

