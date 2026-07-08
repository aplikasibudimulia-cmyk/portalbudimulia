import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useConfirm } from '../utils/useConfirm'

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
  
  const [search, setSearch] = useState(initialSearchQuery || '')
  const [selectedTaFilter, setSelectedTaFilter] = useState(activeTa?.nama || 'all')
  const [selectedClassFilter, setSelectedClassFilter] = useState('all')
  const [summaryFilter, setSummaryFilter] = useState('all')

  const getAvailableClasses = (taId) => {
    if (!taId) return []
    // Hanya tampilkan kelas yang tersedia di tahun ajaran aktif yang di-set admin
    // (untuk konsistensi, filter siswa berdasarkan taId yang diberikan)
    return [...new Set(students?.filter(s => s.tahun_ajaran_id === taId && s.kelas && s.kelas !== '-').map(s => s.kelas))].sort()
  }

  // Hanya kelas dari tahun ajaran aktif (activeTa)
  const getActiveClasses = () => {
    if (!activeTa?.id) return []
    return [...new Set(students?.filter(s => s.tahun_ajaran_id === activeTa.id && s.kelas && s.kelas !== '-').map(s => s.kelas))].sort()
  }
  
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')

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

  // Modal Reset Password
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetData, setResetData] = useState(null)

  
  // Refs
  const csvInputRef = useRef(null)
  const csvSiswaInputRef = useRef(null)
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
    // 1. Fetch Akun Pengguna for current tab
    const { data: akunData, error: akunError } = await supabase.from('akun_pengguna').select('id, username, role, status, foreign_id, created_at, updated_at').eq('role', activeTab)
    if (akunError) console.error('fetchData akunError:', akunError)
    setAkunList(akunData || [])

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
        const targetRole = activeTab === 'orang_tua' ? 'orang_tua' : 'murid'
        const akun = akunList.find(a => a.foreign_id === student.nisn && a.role === targetRole)
        
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
          username: activeTab === 'orang_tua' ? (akun?.username || student.ortu_username || '(Belum punya akun)') : (akun?.username || '(Belum punya akun)'),
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
    mergedData = mergedData.filter(a => a.tahun_ajaran === selectedTaFilter)
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
    }
  }


  const handleResetPassword = (row) => {
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
    if (activeTab === 'murid') defaultWa = row.rawStudent?.no_whatsapp || ""
    else if (activeTab === 'orang_tua') defaultWa = row.rawStudent?.no_hp_ortu || row.rawStudent?.no_whatsapp || ""
    else defaultWa = row.rawGuru?.no_hp || ""
    
    setResetData({ row, generatedPass, waNumber: defaultWa })
    setShowResetModal(true)
  }

  const executeReset = async (sendWa) => {
    if (!resetData) return
    const { row, generatedPass } = resetData
    
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
        let cleanPhone = formatPhoneNumber(phone)
        if (!cleanPhone) {
          alert("Silakan masukkan Nomor WA tujuan yang valid di kolom yang tersedia.")
          setIsProcessing(false) // Re-enable buttons if WA is invalid
          return
        }

        let message = ""
        const loginUrl = `${window.location.origin}/login?u=${row.username}&p=${generatedPass}`
        if (activeTab === 'murid') {
          message = `Halo ${row.nama},\n\nBerikut adalah info login untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Kode Akses:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        } else if (activeTab === 'orang_tua') {
          message = `Halo Orang Tua ${row.nama},\n\nBerikut adalah info login Portal Orang Tua untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Password:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        } else {
          message = `Halo ${row.nama},\n\nBerikut adalah info login untuk e-BudiMulia:\n\n*Username:* ${row.username}\n*Password:* ${generatedPass}\n\nSilakan masuk melalui tautan login otomatis berikut:\n${loginUrl}\n\nHarap simpan baik-baik informasi ini.`
        }
        
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
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
      await supabase.from('enrollment').delete().eq('nisn', row.foreign_id)
      await supabase.from('foto').delete().eq('nisn', row.foreign_id)
      if (row.akun_id) await supabase.from('akun_pengguna').delete().eq('id', row.akun_id)
      // Also delete orang_tua akun if exists
      await supabase.from('akun_pengguna').delete().eq('foreign_id', row.foreign_id).eq('role', 'orang_tua')
      const { error } = await supabase.from('siswa_permanent').delete().eq('nisn', row.foreign_id)
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
          .select('nama_ortu, no_hp_ortu, email_ortu, telegram_ortu, no_whatsapp, email_aktif')
          .eq('nisn', row.foreign_id).maybeSingle();
          
        if (permData) {
          rawStudent = { ...rawStudent, ...permData };
        }
      } else {
        setStudentEnrollments([]);
      }
      const formState = {
        isNew: !row,
        row: row,
        original_foreign_id: row?.foreign_id || '',
        foreign_id: row?.foreign_id || '',
        nama: row?.nama || '',
        kelas: row?.kelas !== '-' ? row?.kelas : '',
        username: row?.hasAkun ? row.username : (rawStudent?.email_aktif || ''),
        password: '',
        hasAkun: row?.hasAkun || false,
        akun_id: row?.akun_id,
        foto_url: row?.foto_url || null,
        akun_status: row?.hasAkun ? row.status : 'aktif',
        telegram_ortu: rawStudent?.telegram_ortu || '',
        no_whatsapp: rawStudent?.no_whatsapp || '',
        no_hp_ortu: rawStudent?.no_hp_ortu || '',
        email_ortu: rawStudent?.email_ortu || '',
        nama_ortu: rawStudent?.nama_ortu || ''
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
    if (clean.startsWith('08')) {
      clean = '62' + clean.substring(1)
    } else if (clean.startsWith('6208')) {
      clean = '628' + clean.substring(4)
    } else if (clean.startsWith('8')) {
      clean = '62' + clean
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
      let f_id = biodataForm.foreign_id
      
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
        }
        
        let uNameSiswa = biodataForm.username || null;
        let pWordSiswa = biodataForm.password ? biodataForm.password : (biodataForm.isNew && !biodataForm.hasAkun ? '123456' : undefined);

        if (activeTab === 'murid') {
          const siswaPayload = {
            nisn: biodataForm.foreign_id,
            nama_lengkap: biodataForm.nama,
            telegram_ortu: biodataForm.telegram_ortu || null,
            no_whatsapp: formatPhoneNumber(biodataForm.no_whatsapp) || null,
            no_hp_ortu: formatPhoneNumber(biodataForm.no_hp_ortu) || null,
            email_ortu: biodataForm.email_ortu || null,
            nama_ortu: biodataForm.nama_ortu || null
          }
          if (uNameSiswa) siswaPayload.email_aktif = uNameSiswa;
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
            no_hp_ortu: formatPhoneNumber(biodataForm.no_hp_ortu) || null,
            email_ortu: biodataForm.email_ortu || null,
            nama_ortu: biodataForm.nama_ortu || null
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
          nama_guru: biodataForm.nama
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
      if (biodataForm.username) { // Only create/update akun if username is provided
        let uName = biodataForm.username;
        const roleName = activeTab === 'orang_tua' ? 'orang_tua' : (activeTab === 'murid' ? 'murid' : activeTab)
        
        if (biodataForm.hasAkun && biodataForm.akun_id) {
          // Strip domain dari username — simpan hanya bagian sebelum @ (misal: ebm.mesrawati)
          const cleanUsername = uName.includes('@') ? uName.split('@')[0] : uName

          // Panggil RPC untuk sinkronisasi username ke akun_pengguna DAN auth.users sekaligus
          const { data: updateResult, error: updateErr } = await supabase.rpc('admin_update_username', {
            p_akun_id: biodataForm.akun_id,
            p_new_username: cleanUsername
          })
          if (updateErr || !updateResult?.ok) {
            throw new Error('Gagal update username: ' + (updateResult?.msg || updateErr?.message))
          }

          // Update status akun
          await supabase.from('akun_pengguna').update({
            status: biodataForm.akun_status
          }).eq('id', biodataForm.akun_id)

          // Jika ada password baru, panggil RPC reset password
          if (biodataForm.password) {
            const { data: resetResult, error: resetErr } = await supabase.rpc('admin_reset_password', {
              p_akun_id: biodataForm.akun_id,
              p_new_password: biodataForm.password
            })
            if (resetErr || !resetResult?.ok) throw new Error(resetResult?.msg || resetErr?.message || "Gagal mereset password")
          }

        } else {
          // Buat akun baru via secure RPC admin_create_user
          const pWord = biodataForm.password || '123456'
          const { data: createResult, error: createErr } = await supabase.rpc('admin_create_user', {
            p_username: uName,
            p_password: pWord,
            p_role: roleName,
            p_foreign_id: f_id,
            p_status: biodataForm.akun_status
          })
          if (createErr || !createResult?.ok) throw new Error(createResult?.msg || createErr?.message || "Gagal membuat akun")
        }

        // Auto-generate Akun Orang Tua jika tipenya Murid
        if (activeTab === 'murid') {
          const firstName = (biodataForm.nama || '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
          const nisnLast3 = biodataForm.foreign_id.slice(-3)
          const ortuUsername = `ebmortu.${firstName}${nisnLast3}`
          const ortuPassword = Math.random().toString(36).substring(2, 8).toUpperCase() // 6 karakter acak
          
          // Cek apakah akun ortu untuk foreign_id ini sudah ada
          const { data: existingOrtu } = await supabase
            .from('akun_pengguna')
            .select('id')
            .eq('foreign_id', f_id)
            .eq('role', 'orang_tua')
            .maybeSingle()

          if (existingOrtu) {
            // Update username dan status ortu
            await supabase.from('akun_pengguna').update({
              username: ortuUsername,
              status: biodataForm.akun_status
            }).eq('id', existingOrtu.id)

            // Reset password ortu
            await supabase.rpc('admin_reset_password', {
              p_akun_id: existingOrtu.id,
              p_new_password: ortuPassword
            })
          } else {
            // Buat akun ortu baru
            const { data: ortuResult, error: ortuErr } = await supabase.rpc('admin_create_user', {
              p_username: ortuUsername,
              p_password: ortuPassword,
              p_role: 'orang_tua',
              p_foreign_id: f_id,
              p_status: biodataForm.akun_status
            })
            if (ortuErr || !ortuResult?.ok) throw new Error(ortuResult?.msg || ortuErr?.message || "Gagal membuat akun orang tua")
          }
          
          await supabase.from('siswa_permanent').update({ ortu_username: ortuUsername, ortu_password: ortuPassword }).eq('nisn', f_id)
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
      const wb = XLSX.utils.book_new()

      if (choice === '1' || choice === '3') {
        const sortedFilteredMurid = [...students]
          .filter(s => activeTa ? s.tahun_ajaran_id === activeTa.id : true)
          .sort((a, b) => {
            const classA = a.kelas || ''
            const classB = b.kelas || ''
            if (classA !== classB) return classA.localeCompare(classB)
            return (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '')
          })

        let currentClass = null
        let currentAbsen = 1

        const dataMurid = sortedFilteredMurid.map(s => {
          if (s.kelas !== currentClass) {
            currentClass = s.kelas
            currentAbsen = 1
          }
          const absen = currentAbsen++
          return {
            'No Absen': absen,
            'KODE PDF (PENTING)': s.kode || '',
            'NISN': s.nisn,
            'NIPD': s.nipd || '',
            'Nama Lengkap': s.nama_lengkap,
            'Username': s.username || '',
            'Password / Kode Akses': s.password_text || '',
            'Username Orang Tua': s.ortu_username || '',
            'Password Orang Tua': s.ortu_password || '',
            'Kelas': s.kelas || '',
            'Tahun Ajaran': s.tahun_ajaran || '',
            'Email': s.email_aktif || '',
            'No Telp': s.no_whatsapp || '',
            'Kode Akses': s.kode_akses || '',
            'Password Login': s.raw_password || ''
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

      let filename = 'Export_Data_Pengguna.xlsx'
      if (choice === '1') filename = 'Export_Data_Murid.xlsx'
      if (choice === '2') filename = 'Export_Data_Guru.xlsx'
      XLSX.writeFile(wb, filename)

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
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { alert("File Excel kosong"); setIsProcessing(false); return }

      const defaultRole = roles.find(r => r.nama.toLowerCase() === 'guru')
      let successCount = 0, errorCount = 0

      for (const row of data) {
        const kode = String(row.kode || row.KODE || row['Kode Guru'] || '').trim()
        const nama = String(row.nama_guru || row['NAMA GURU'] || row.nama || row['Nama Guru'] || '').trim()
        const username = String(row.user_name || row.username || row.Username || row['Username'] || '').trim()
        const email = String(row.email || row.Email || row['Email'] || '').trim()
        
        if (!kode || !nama) continue
        
        const payload = { kode, nama_guru: nama }
        const finalUsername = username || email
        if (finalUsername) payload.user_name = finalUsername
        
        const { data: exist } = await supabase.from('guru').select('id').eq('kode', payload.kode).maybeSingle()
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
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!data.length) { alert("File Excel kosong"); setIsProcessing(false); return }

      let successCount = 0, errorCount = 0

      for (const row of data) {
        const nisn = String(row.nisn || row.NISN || '').trim()
        const nama = String(row.nama_lengkap || row.nama || row['NAMA LENGKAP'] || row['NAMA'] || '').trim()
        const kelas = String(row.kelas || row.KELAS || '').trim()
        const telegram = String(row.telegram_ortu || row['TELEGRAM ORTU'] || row.telegram || '').trim()
        const whatsapp = formatPhoneNumber(row.no_whatsapp || row['NO WHATSAPP'] || row.whatsapp || row.WA || '')

        if (!nisn || !nama) continue
        
        // Upsert Siswa Permanent
        const payloadSiswa = { 
          nisn, 
          nama_lengkap: nama,
          ...(telegram ? { telegram_ortu: telegram } : {}),
          ...(whatsapp ? { no_whatsapp: whatsapp } : {})
        }
        
        const { error: errSiswa } = await supabase.from('siswa_permanent').upsert(payloadSiswa, { onConflict: 'nisn' })
        
        if (errSiswa) {
          errorCount++
          continue
        }

        // Upsert Enrollment jika ada TA aktif dan Kelas
        if (activeTa && kelas && kelas !== '-') {
          const { error: errEnrol } = await supabase.from('enrollment').upsert({
            kode: `${kelas}_${nisn}_${activeTa.id}`,
            nisn: nisn,
            kelas: kelas,
            tahun_ajaran_id: activeTa.id
          }, { onConflict: 'nisn,tahun_ajaran_id' })
          if (errEnrol) console.error(errEnrol)
        }

        // Auto-generate Akun Orang Tua during import
        const firstName = nama.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
        const nisnLast3 = nisn.slice(-3)
        const ortuUsername = `ebmortu.${firstName}${nisnLast3}`
        const ortuPassword = Math.random().toString(36).substring(2, 8).toUpperCase() // 6 chars random
        
        // Cek apakah akun ortu untuk foreign_id ini sudah ada
        const { data: existingOrtu } = await supabase
          .from('akun_pengguna')
          .select('id')
          .eq('foreign_id', nisn)
          .eq('role', 'orang_tua')
          .maybeSingle()

        if (existingOrtu) {
          await supabase.from('akun_pengguna').update({ username: ortuUsername }).eq('id', existingOrtu.id)
          await supabase.rpc('admin_reset_password', {
            p_akun_id: existingOrtu.id,
            p_new_password: ortuPassword
          })
        } else {
          await supabase.rpc('admin_create_user', {
            p_username: ortuUsername,
            p_password: ortuPassword,
            p_role: 'orang_tua',
            p_foreign_id: nisn,
            p_status: 'aktif'
          })
        }
        await supabase.from('siswa_permanent').update({ ortu_username: ortuUsername, ortu_password: ortuPassword }).eq('nisn', nisn)

        successCount++
      }
      alert(`Sinkronisasi Siswa selesai!\nBerhasil: ${successCount}\nGagal: ${errorCount}`)
    } catch (err) {
      alert('Gagal memproses file: ' + err.message)
    }
    setIsProcessing(false); setProgressText(''); fetchData(); onRefresh?.()
    if (csvSiswaInputRef.current) csvSiswaInputRef.current.value = ''
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
      const { data: allAkunOrtu } = await supabase.from('akun_pengguna').select('foreign_id').eq('role', 'orang_tua')
      const existingAkunOrtuIds = new Set(allAkunOrtu?.map(a => a.foreign_id) || [])

      const siswaToGenerate = (allSiswa || []).filter(s => !existingAkunOrtuIds.has(s.nisn))
      
      if (siswaToGenerate.length === 0) {
        alert("Semua siswa sudah memiliki akun orang tua.")
        setIsProcessing(false)
        return
      }

      let successCount = 0
      let errorCount = 0

      for (const siswa of siswaToGenerate) {
        const firstName = (siswa.nama_lengkap || '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
        const nisnLast3 = siswa.nisn.slice(-3)
        const ortuUsername = `ebmortu.${firstName}${nisnLast3}`
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
      
      alert(`Berhasil membuat ${successCount} akun orang tua baru. Gagal: ${errorCount}`)
      fetchData()
    } catch (err) {
      alert("Terjadi kesalahan: " + err.message)
    }
    setIsProcessing(false)
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Manajemen Akun & Data Pengguna</h2>
          <p className="text-slate-500 text-sm mt-1">Satu pintu untuk mengelola biodata, akun login, dan penugasan.</p>
        </div>
      <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'guru' ? (
            <button onClick={() => csvInputRef.current?.click()} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
              <IconUpload /> Import Excel Guru
            </button>
          ) : activeTab === 'murid' ? (
            <button onClick={() => csvSiswaInputRef.current?.click()} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
              <IconUpload /> Import Excel Siswa
            </button>
          ) : null}
          {activeTab === 'orang_tua' && (
            <button onClick={handleBulkGenerateOrtu} disabled={isProcessing} className="px-3 py-2 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-100 flex items-center gap-2 disabled:opacity-50">
              <IconPlus className="w-4 h-4" /> Generate Akun Orang Tua
            </button>
          )}
          <button onClick={() => massPhotoInputRef.current?.click()} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
            <IconCamera /> Upload Foto Massal
          </button>
          <button onClick={() => setShowExportModal(true)} disabled={isProcessing} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50" title="Export Excel data pengguna">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Data
          </button>
          {activeTab === 'murid' && (
            <button onClick={handleRapihkanKode} disabled={isProcessing || !activeTa || students.filter(s => s.tahun_ajaran_id === activeTa?.id).length === 0} 
              className="px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-100 flex items-center gap-2 disabled:opacity-50" title="Urutkan absen dan perbarui kode PDF otomatis">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18"/><path d="M12 3v18"/><path d="m8 8-4 4 4 4"/><path d="m16 16 4-4-4-4"/></svg>
              Rapihkan Kode (A-Z)
            </button>
          )}
          <button onClick={() => openBiodataModal()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center gap-2 shadow-sm">
            <IconPlus /> Buat Data Baru
          </button>
        </div>
      </div>

              {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
          {(activeTab === 'murid' || activeTab === 'orang_tua' ? [
            { l: activeTab === 'murid' ? 'Total Murid' : 'Total Orang Tua', v: dataForCards.length, type: 'all' },
            { l: 'Punya Akun', v: dataForCards.filter(m => m.hasAkun).length, type: 'with_akun' },
            { l: 'Tanpa Akun', v: dataForCards.filter(m => !m.hasAkun).length, type: 'without_akun' },
            { l: 'Akun Aktif', v: dataForCards.filter(m => m.hasAkun && m.status === 'aktif').length, type: 'active_akun' }
          ] : [
            { l: 'Total Guru & Staff', v: dataForCards.length, type: 'all' },
            { l: 'Punya Akun', v: dataForCards.filter(g => g.hasAkun).length, type: 'with_akun' },
            { l: 'Tanpa Akun', v: dataForCards.filter(g => !g.hasAkun).length, type: 'without_akun' },
            { l: 'Admin', v: dataForCards.filter(g => {
                const akun = akunList.find(a => a.id === g.akun_id);
                return akun && (akun.role === 'admin' || akun.role === 'superadmin');
              }).length, type: 'active_akun'
            }
          ]).map(stat => (
            <div 
              key={stat.l} 
              onClick={() => setSummaryFilter(stat.type)}
              className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer transition-all hover:-translate-y-1 ${summaryFilter === stat.type ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/30' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <p className={`text-sm font-medium ${summaryFilter === stat.type ? 'text-indigo-600' : 'text-slate-500'}`}>{stat.l}</p>
              <p className={`text-2xl font-bold mt-1 ${summaryFilter === stat.type ? 'text-indigo-900' : 'text-slate-900'}`}>{stat.v}</p>
            </div>
          ))}
        </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200 mb-6 shrink-0">
        {[
          { id: 'murid', label: 'Murid', icon: <IconUsers className="w-4 h-4" /> },
          { id: 'orang_tua', label: 'Orang Tua', icon: <IconUsers className="w-4 h-4" /> },
          { id: 'guru', label: 'Guru & Staff', icon: <IconKey className="w-4 h-4" /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearch(''); setSelectedClassFilter('all') }}
            className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4 flex flex-col md:flex-row gap-3 shrink-0">
        <div className="relative flex-1">
          <input type="text" placeholder="Cari nama, username, ID, atau kode..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        {(activeTab === 'murid' || activeTab === 'orang_tua') && (
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
      {(activeTab === 'murid' || activeTab === 'orang_tua') && uniqueClasses.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide mb-2 shrink-0">
          <button onClick={() => setSelectedClassFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-medium border ${selectedClassFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>Semua</button>
          {uniqueClasses.map(c => (
            <button key={c} onClick={() => setSelectedClassFilter(c)} className={`px-4 py-1.5 rounded-full text-xs font-medium border ${selectedClassFilter === c ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{c}</button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border-none rounded-xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-[500px] lg:min-h-0">
        {loading || isProcessing ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
            <p>{progressText || "Memuat data..."}</p>
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
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline">{row.nama}</p>
                        <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{(activeTab === 'murid' || activeTab === 'orang_tua') ? row.foreign_id : `Kode: ${row.kode}`}</p>
                    </td>
                    <td className="px-4 py-3">
                      {row.hasAkun ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-slate-800 font-medium">{row.username}</p>
                          <span className={`w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase ${row.status === 'aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{row.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-400 font-medium">(Belum Punya Akun)</p>
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
                      <div className="flex items-center justify-center gap-2">
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
                          <input required value={biodataForm.foreign_id} onChange={e => setBiodataForm({...biodataForm, foreign_id: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-2xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                          <input required value={biodataForm.nama} onChange={e => setBiodataForm({...biodataForm, nama: e.target.value})} className="w-full px-3 py-2 border rounded-2xl text-sm" />
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
                            <label className="block text-xs font-medium text-slate-700 mb-1">No. WhatsApp</label>
                            <input value={biodataForm.no_whatsapp || ''} onChange={e => setBiodataForm({...biodataForm, no_whatsapp: e.target.value})} placeholder="Contoh: 62812xxx" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-xs font-medium text-slate-700 mb-1">ID Telegram Orang Tua</label>
                            <input value={biodataForm.telegram_ortu || ''} onChange={e => setBiodataForm({...biodataForm, telegram_ortu: e.target.value})} placeholder="Contoh: 123456789" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          </div>
                        </div>
                      </>
                    ) : activeTab === 'orang_tua' ? (
                      <>
                        <div className="md:col-span-2 bg-violet-50 border border-violet-200 rounded-2xl p-4">
                          <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-1">Orangtua dari:</p>
                          <p className="text-lg font-bold text-violet-900">{biodataForm.nama}</p>
                          <p className="text-xs text-violet-600 font-mono mt-1">NISN: {biodataForm.foreign_id}</p>
                          {biodataForm.kelas && <p className="text-xs text-violet-600 mt-0.5">Kelas: {biodataForm.kelas}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nama Orang Tua</label>
                          <input value={biodataForm.nama_ortu || ''} onChange={e => setBiodataForm({...biodataForm, nama_ortu: e.target.value})} placeholder="Contoh: Budi Santoso" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">No HP Orang Tua</label>
                          <input value={biodataForm.no_hp_ortu || ''} onChange={e => setBiodataForm({...biodataForm, no_hp_ortu: e.target.value})} placeholder="Contoh: 62812xxx" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Email Orang Tua</label>
                          <input type="email" value={biodataForm.email_ortu || ''} onChange={e => setBiodataForm({...biodataForm, email_ortu: e.target.value})} placeholder="Contoh: ortu@email.com" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Kode Guru (ID Permanen) *</label>
                          <input required value={biodataForm.kode} onChange={e => setBiodataForm({...biodataForm, kode: e.target.value})} placeholder="g02026" className="w-full px-3 py-2 border rounded-2xl text-sm" />
                          <p className="text-[10px] text-slate-400 mt-1">ID permanen guru (tidak berubah setiap tahun ajaran).</p>
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
                                            newGm[gmIdx].mapel_list[idx].kelas_list = [...classesInThisTa];
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status Akun</label>
                    <select value={biodataForm.akun_status} onChange={e => setBiodataForm({...biodataForm, akun_status: e.target.value})} className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="aktif">🟢 Aktif</option>
                      <option value="nonaktif">🔴 Nonaktif / Pindah</option>
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email / Username *</label>
                    <input required value={biodataForm.username} onChange={e => setBiodataForm({...biodataForm, username: e.target.value})} className="w-full px-3 py-2 border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
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
              <p className="text-sm text-slate-600 mb-4">Pilih kategori data pengguna yang ingin Anda download ke dalam format Excel:</p>
              
              <div className="space-y-3">
                <button onClick={() => handleExportExcel('1')} className="w-full flex items-start text-left gap-3 p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-2xl group-hover:bg-indigo-200 transition-colors">
                    <IconUsers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-800">Hanya Data Murid</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Export khusus biodata dan akun seluruh murid</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('2')} className="w-full flex items-start text-left gap-3 p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-2xl group-hover:bg-indigo-200 transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 group-hover:text-indigo-800">Hanya Data Guru / Staff</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Export khusus data pengajar dan penugasan</p>
                  </div>
                </button>

                <button onClick={() => handleExportExcel('3')} className="w-full flex items-start text-left gap-3 p-4 border border-indigo-200 bg-indigo-50/50 rounded-xl hover:border-indigo-400 hover:bg-indigo-100 transition-all group ring-1 ring-indigo-50 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-bold rounded-bl-lg">REKOMENDASI</div>
                  <div className="p-2 bg-indigo-600 text-white rounded-2xl group-hover:bg-indigo-700 transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-900">Semua Data (Murid & Guru)</h4>
                    <p className="text-xs text-indigo-700/80 mt-0.5">Data murid dan guru akan dipisah dalam sheet berbeda</p>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-in-center">
            {/* Header */}
            <div className="p-6 text-center border-b border-slate-100 bg-slate-50">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconKey className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">Reset {activeTab === 'murid' ? 'Kode Akses' : 'Password'}</h3>
              <p className="text-sm text-slate-500">Anda akan mereset akun milik <span className="font-semibold text-slate-700">{resetData.row.nama}</span></p>
            </div>
            
            {/* Body */}
            <div className="p-6 text-left space-y-4">
              <p className="text-sm text-slate-600 text-center mb-4">Sistem telah membuatkan kombinasi login baru untuk keamanan akun:</p>
              
              <div className="space-y-3">
                {/* Username Row */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Username</span>
                    <span className="text-xs font-semibold text-slate-700 font-mono break-all pr-2">{resetData.row.username}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(resetData.row.username)
                      alert("Username berhasil disalin!")
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all flex items-center gap-1 text-[10px] font-semibold shadow-sm shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                    Salin
                  </button>
                </div>

                {/* Password Row */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">{activeTab === 'murid' ? 'Kode Akses' : 'Password'}</span>
                    <span className="text-xs font-bold text-indigo-700 font-mono tracking-wider">{resetData.generatedPass}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(resetData.generatedPass)
                      alert(`${activeTab === 'murid' ? 'Kode Akses' : 'Password'} berhasil disalin!`)
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all flex items-center gap-1 text-[10px] font-semibold shadow-sm shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                    Salin
                  </button>
                </div>
              </div>

              {/* Fast Auto-login Copy Button */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${resetData.row.username}|${resetData.generatedPass}`)
                  alert("Format Auto-Login berhasil disalin! Tempelkan (paste) langsung ke kolom Username di halaman login untuk langsung mengisi kedua kolom.")
                }}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                Salin Cepat (Format Auto-Login)
              </button>
              
              <div className="mt-4 text-left bg-slate-50 border border-slate-200 p-3 rounded-xl">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp Tujuan</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                  </div>
                  <input type="text" value={resetData.waNumber || ''} onChange={(e) => setResetData({...resetData, waNumber: e.target.value})} className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" placeholder="Misal: 62812xxxx" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Kosongkan jika hanya ingin menyimpan tanpa mengirim WhatsApp.</p>
              </div>
              
              <p className="text-xs text-slate-400 mt-4">Pilih tindakan selanjutnya di bawah ini.</p>
            </div>
            
            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t flex flex-col gap-2">
              <button 
                onClick={() => executeReset(true)} 
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1EBE5C] text-white py-3 rounded-xl font-semibold shadow-sm transition-colors"
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                    Simpan & Kirim WA
                  </>
                )}
              </button>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => executeReset(false)} 
                  disabled={isProcessing}
                  className="flex-1 py-2.5 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-xl transition-colors"
                >
                  Hanya Simpan
                </button>
                <button 
                  onClick={() => setShowResetModal(false)} 
                  disabled={isProcessing}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {ConfirmModalComponent}

    </div>
  )
}

