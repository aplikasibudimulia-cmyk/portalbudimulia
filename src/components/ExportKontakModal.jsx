// components/ExportKontakModal.jsx
import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { 
  formatPhoneNumberE164, 
  formatShortTahunAjaran, 
  generateContactName, 
  downloadVCard, 
  downloadGoogleContactsCSV 
} from '../utils/contactExporter'

export default function ExportKontakModal({
  isOpen,
  onClose,
  initialKelas = 'Semua Siswa',
  semuaKelas = [],
  activeTa = null,
  allowedClasses = null,
  hideGuru = false,
  modalTitle = '',
}) {
  const [selectedKelas, setSelectedKelas] = useState(initialKelas || 'Semua Siswa')
  const [targetType, setTargetType] = useState('ortu') // 'ortu' | 'siswa' | 'guru' | 'all'
  const [formatOrtu, setFormatOrtu] = useState('OT [KELAS] [TA] - [NAMA]')
  const [formatSiswa, setFormatSiswa] = useState('[KELAS] [TA] - [NAMA]')
  const [formatGuru, setFormatGuru] = useState('GURU - [NAMA]')
  const [nameStyle, setNameStyle] = useState('uppercase') // Default: Nama Lengkap (UPPERCASE)
  const [taShort, setTaShort] = useState('')
  const [groupLabelCustom, setGroupLabelCustom] = useState('')
  const [onlyWithPhone, setOnlyWithPhone] = useState(true)
  const [selectedTaId, setSelectedTaId] = useState(activeTa?.id || 'all')
  const [tahunAjaransList, setTahunAjaransList] = useState([])
  const [loading, setLoading] = useState(false)
  const [studentsData, setStudentsData] = useState([])
  const [gurusData, setGurusData] = useState([])

  useEffect(() => {
    if (allowedClasses && Array.isArray(allowedClasses) && allowedClasses.length > 0) {
      const cleanAllowed = allowedClasses.map(c => String(c).replace(/^Kelas\s+/i, '').trim()).filter(Boolean)
      if (cleanAllowed.length === 1) {
        setSelectedKelas(cleanAllowed[0])
        return
      }
      if (initialKelas) {
        const clean = initialKelas.replace(/^Kelas\s+/i, '').trim()
        if (cleanAllowed.includes(clean)) {
          setSelectedKelas(clean)
          return
        }
      }
      setSelectedKelas('Semua Siswa')
      return
    }

    if (initialKelas) {
      const clean = initialKelas.replace(/^Kelas\s+/i, '').trim()
      setSelectedKelas(clean || 'Semua Siswa')
    }
  }, [initialKelas, allowedClasses])

  useEffect(() => {
    if (activeTa?.id) {
      setSelectedTaId(activeTa.id)
    }
  }, [activeTa])

  // Reset targetType if guru was selected but hideGuru is enabled
  useEffect(() => {
    if (hideGuru && targetType === 'guru') {
      setTargetType('ortu')
    }
  }, [hideGuru, targetType])

  // Update taShort when selectedTaId changes
  useEffect(() => {
    if (selectedTaId === 'all') {
      setTaShort('ALL')
      return
    }
    const currentTa = tahunAjaransList.find(t => t.id === selectedTaId) || (activeTa?.id === selectedTaId ? activeTa : null)
    if (currentTa?.nama) {
      setTaShort(formatShortTahunAjaran(currentTa.nama))
    } else {
      const now = new Date()
      const y = now.getFullYear() % 100
      setTaShort(`${y}/${y + 1}`)
    }
  }, [selectedTaId, tahunAjaransList, activeTa])

  // Fetch student, parent, and teacher contact data from Supabase with full pagination
  useEffect(() => {
    if (!isOpen) return
    const fetchData = async () => {
      setLoading(true)
      try {
        // Helper pagination to bypass 1000 row cap
        const fetchAllFromTable = async (tableName, selectFields) => {
          let allRows = []
          let from = 0
          let to = 999
          let hasMore = true
          while (hasMore) {
            const { data, error } = await supabase
              .from(tableName)
              .select(selectFields)
              .range(from, to)
            if (error) {
              console.warn(`Error fetching ${tableName}:`, error)
              break
            }
            if (!data || data.length === 0) {
              hasMore = false
            } else {
              allRows = allRows.concat(data)
              if (data.length < 1000) {
                hasMore = false
              } else {
                from += 1000
                to += 1000
              }
            }
          }
          return allRows
        }

        // 0. Fetch Tahun Ajaran
        const { data: taData } = await supabase
          .from('tahun_ajaran')
          .select('*')
          .order('nama', { ascending: false })
        if (taData) setTahunAjaransList(taData)

        // 1. Fetch Students from siswa_lengkap with full pagination
        const lengkapList = await fetchAllFromTable(
          'siswa_lengkap',
          'nisn, nama_lengkap, kelas, is_aktif, no_whatsapp, tahun_ajaran_id, tahun_ajaran'
        )

        // 2. Fetch Parent details from siswa_permanent with full pagination
        const permList = await fetchAllFromTable(
          'siswa_permanent',
          'nisn, nama_lengkap, nama_ortu, no_hp_ortu, no_whatsapp, email_ortu, email_aktif'
        )

        const permMap = {}
        permList.forEach(p => { permMap[String(p.nisn || '').trim()] = p })

        // Merge siswa_lengkap with siswa_permanent
        const combinedStudents = lengkapList.map(s => {
          const p = permMap[String(s.nisn || '').trim()] || {}
          return {
            nisn: s.nisn,
            nama_lengkap: s.nama_lengkap || p.nama_lengkap || '',
            kelas: s.kelas || '',
            is_aktif: s.is_aktif,
            tahun_ajaran_id: s.tahun_ajaran_id,
            nama_ortu: p.nama_ortu || '',
            no_hp_ortu: p.no_hp_ortu || '',
            no_whatsapp: s.no_whatsapp || p.no_whatsapp || '',
            email_ortu: p.email_ortu || '',
            email_aktif: s.email_aktif || p.email_aktif || '',
            tahun_ajaran: s.tahun_ajaran || ''
          }
        })

        setStudentsData(combinedStudents)

        // 3. Fetch Teachers & Staff if not hidden
        if (!hideGuru) {
          const { data: rawGurus, error: errGuru } = await supabase
            .from('guru')
            .select('id, nama_guru, kode, no_hp, nip, guru_role(roles(nama)))')
          if (errGuru) console.warn('errGuru:', errGuru)
          setGurusData(rawGurus || [])
        } else {
          setGurusData([])
        }
      } catch (err) {
        console.error('Error fetching contact export data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen, hideGuru])

  // Filter students based on selected academic year and allowed classes
  const activeTaStudents = useMemo(() => {
    let list = studentsData
    if (selectedTaId && selectedTaId !== 'all') {
      list = list.filter(s => s.tahun_ajaran_id === selectedTaId && s.is_aktif !== false)
    } else if (activeTa?.id) {
      list = list.filter(s => s.tahun_ajaran_id === activeTa.id && s.is_aktif !== false)
    } else {
      list = list.filter(s => s.is_aktif !== false)
    }

    if (allowedClasses && Array.isArray(allowedClasses) && allowedClasses.length > 0) {
      const cleanAllowed = allowedClasses.map(c => String(c).replace(/^Kelas\s+/i, '').trim().toUpperCase())
      list = list.filter(s => cleanAllowed.includes(String(s.kelas || '').trim().toUpperCase()))
    }

    // Deduplikasi berdasarkan NISN
    const seenNisns = new Set()
    return list.filter(s => {
      const nisn = String(s.nisn || '').trim()
      if (!nisn) return true
      if (seenNisns.has(nisn)) return false
      seenNisns.add(nisn)
      return true
    })
  }, [studentsData, selectedTaId, activeTa, allowedClasses])

  // Extract unique available classes from students
  const availableClasses = useMemo(() => {
    if (allowedClasses && Array.isArray(allowedClasses) && allowedClasses.length > 0) {
      const cleanAllowed = allowedClasses.map(c => String(c).replace(/^Kelas\s+/i, '').trim()).filter(Boolean)
      return Array.from(new Set(cleanAllowed)).sort()
    }
    const fromList = (semuaKelas || []).map(c => String(c).replace(/^Kelas\s+/i, '').trim()).filter(c => c && c !== 'Semua Siswa' && c !== 'Semua')
    const fromStudents = activeTaStudents.map(s => s.kelas).filter(Boolean)
    const set = new Set([...fromList, ...fromStudents])
    return Array.from(set).sort()
  }, [semuaKelas, activeTaStudents, allowedClasses])

  // Filter students based on class selection
  const filteredStudents = useMemo(() => {
    const cleanFilter = (selectedKelas || '').replace(/^Kelas\s+/i, '').trim()
    if (!cleanFilter || cleanFilter === 'Semua Siswa' || cleanFilter === 'Semua') {
      return activeTaStudents
    }
    return activeTaStudents.filter(s => String(s.kelas || '').trim() === cleanFilter)
  }, [activeTaStudents, selectedKelas])

  // Computed Default Group Name
  const defaultGroupName = useMemo(() => {
    if (groupLabelCustom) return groupLabelCustom
    const classTag = (!selectedKelas || selectedKelas === 'Semua Siswa') ? 'Semua Siswa' : `Kelas ${selectedKelas}`
    const taTag = taShort ? `${taShort}` : ''
    if (targetType === 'guru') return `Guru & Staff BM ${taTag}`.trim()
    if (targetType === 'ortu') return `Ortu BM ${taTag} - ${classTag}`.trim()
    if (targetType === 'siswa') return `Siswa BM ${taTag} - ${classTag}`.trim()
    if (hideGuru) return `Siswa & Ortu BM ${taTag} - ${classTag}`.trim()
    return `eBudiMulia ${taTag} - ${classTag}`.trim()
  }, [groupLabelCustom, selectedKelas, taShort, targetType, hideGuru])

  // Prepared Contacts Array (HANYA kontak yang memiliki nomor HP valid)
  const preparedContacts = useMemo(() => {
    const contacts = []

    // 1. Process Students & Parents
    if (targetType === 'ortu' || targetType === 'siswa' || targetType === 'all') {
      filteredStudents.forEach(s => {
        const parentPhone = formatPhoneNumberE164(s.no_hp_ortu)
        const studentPhone = formatPhoneNumberE164(s.no_whatsapp)
        const studentClass = s.kelas || ''

        // Ortu Contact - HANYA jika memiliki nomor HP orang tua
        if (targetType === 'ortu' || targetType === 'all') {
          if (parentPhone) {
            const fn = generateContactName({
              type: 'ortu',
              studentName: s.nama_lengkap,
              parentName: s.nama_ortu,
              kelas: studentClass,
              taShort: taShort,
              formatOrtu: formatOrtu,
              formatSiswa: formatSiswa,
              nameStyle: nameStyle,
            })

            contacts.push({
              id: `ortu-${s.nisn}`,
              fullName: fn,
              phone: parentPhone,
              email: s.email_ortu || '',
              nisn: s.nisn,
              kelas: studentClass,
              typeLabel: 'Orang Tua',
              groupName: defaultGroupName,
              raw: s
            })
          }
        }

        // Siswa Contact - HANYA jika memiliki nomor HP siswa
        if (targetType === 'siswa' || targetType === 'all') {
          if (studentPhone) {
            const fn = generateContactName({
              type: 'siswa',
              studentName: s.nama_lengkap,
              parentName: s.nama_ortu,
              kelas: studentClass,
              taShort: taShort,
              formatOrtu: formatOrtu,
              formatSiswa: formatSiswa,
              nameStyle: nameStyle,
            })

            contacts.push({
              id: `siswa-${s.nisn}`,
              fullName: fn,
              phone: studentPhone,
              email: s.email_aktif || '',
              nisn: s.nisn,
              kelas: studentClass,
              typeLabel: 'Siswa',
              groupName: defaultGroupName,
              raw: s
            })
          }
        }
      })
    }

    // 2. Process Guru & Staff - HANYA jika memiliki nomor HP guru
    if (!hideGuru && (targetType === 'guru' || targetType === 'all')) {
      gurusData.forEach(g => {
        const guruPhone = formatPhoneNumberE164(g.no_hp)
        if (guruPhone) {
          let gName = g.nama_guru || ''
          const words = gName.trim().split(/\s+/)
          const firstName = words[0] || ''

          let processedName = gName
          if (nameStyle === 'firstname_upper') {
            processedName = firstName.toUpperCase()
          } else if (nameStyle === 'firstname_normal') {
            processedName = firstName
          } else if (nameStyle === 'uppercase') {
            processedName = gName.toUpperCase()
          }

          let fn = formatGuru
            .replace(/\[NAMA\]/g, processedName)
            .replace(/\[KODE\]/g, g.kode || '')
            .replace(/\[TA\]/g, taShort || '')
            .replace(/\s+/g, ' ')
            .trim()

          contacts.push({
            id: `guru-${g.id || g.kode || g.nama_guru}`,
            fullName: fn,
            phone: guruPhone,
            email: '',
            nisn: g.kode || '-',
            kelas: 'Guru & Staff',
            typeLabel: 'Guru / Staff',
            groupName: targetType === 'all' ? defaultGroupName : `Guru Staff BM ${taShort}`,
            raw: g
          })
        }
      })
    }

    return contacts
  }, [filteredStudents, gurusData, targetType, formatOrtu, formatSiswa, formatGuru, taShort, nameStyle, defaultGroupName, hideGuru])

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }, [])

  const [exportingVcf, setExportingVcf] = useState(false)

  // Generate File Name
  const getExportFileName = (ext) => {
    const classTag = (!selectedKelas || selectedKelas === 'Semua Siswa') ? 'Semua_Kelas' : `Kelas_${selectedKelas}`
    const typeTag = targetType === 'ortu' ? 'Ortu' : targetType === 'siswa' ? 'Siswa' : targetType === 'guru' ? 'Guru_Staff' : (hideGuru ? 'Siswa_Ortu' : 'Kontak_Semua')
    const taTag = taShort ? `_${taShort.replace(/\//g, '-')}` : ''
    return `Kontak_${typeTag}_${classTag}${taTag}.${ext}`
  }

  const handleExportVCF = async () => {
    if (preparedContacts.length === 0 || exportingVcf) return
    setExportingVcf(true)
    try {
      await downloadVCard(preparedContacts, getExportFileName('vcf'))
    } catch (e) {
      console.error('Export VCF error:', e)
    } finally {
      setExportingVcf(false)
    }
  }

  const handleExportCSV = () => {
    if (preparedContacts.length === 0) return
    downloadGoogleContactsCSV(preparedContacts, getExportFileName('csv'))
  }

  if (!isOpen) return null

  // Portal to document.body so the dark blurred backdrop covers 100% full screen
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-fade-in">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col animate-scale-up overflow-hidden my-auto">
        {/* Header (Pinned) */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl sm:text-2xl shadow-xs shrink-0">
              📥
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">
                {modalTitle || (allowedClasses ? 'Unduh Kontak Kelas Perwalian' : 'Unduh Kontak Siswa, Ortu & Guru')}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Tahun Ajaran Aktif: <strong className="text-indigo-600">{activeTa?.nama || '2026/2027'}</strong></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors font-bold text-xs sm:text-sm shadow-2xs cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0 custom-scrollbar">
          {/* Filter Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            {/* Target Kontak */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Target Kontak Yang Ingin Diunduh</label>
              <div className={`grid ${hideGuru ? 'grid-cols-3' : 'grid-cols-4'} gap-1 bg-slate-200/70 p-1 rounded-xl`}>
                <button
                  type="button"
                  onClick={() => setTargetType('ortu')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    targetType === 'ortu' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ortu
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType('siswa')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    targetType === 'siswa' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Siswa
                </button>
                {!hideGuru && (
                  <button
                    type="button"
                    onClick={() => setTargetType('guru')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      targetType === 'guru' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Guru/Staff
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTargetType('all')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    targetType === 'all' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {hideGuru ? 'Semua (Siswa & Ortu)' : 'Semua'}
                </button>
              </div>
            </div>

            {/* Pilih Tahun Ajaran */}
            {targetType !== 'guru' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Tahun Ajaran Target</label>
                <select
                  value={selectedTaId}
                  onChange={e => {
                    setSelectedTaId(e.target.value)
                    setSelectedKelas(allowedClasses && allowedClasses.length === 1 ? allowedClasses[0] : 'Semua Siswa')
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {tahunAjaransList.map(t => {
                    let cnt = studentsData.filter(s => s.tahun_ajaran_id === t.id)
                    if (allowedClasses && Array.isArray(allowedClasses) && allowedClasses.length > 0) {
                      const cleanAllowed = allowedClasses.map(c => String(c).replace(/^Kelas\s+/i, '').trim().toUpperCase())
                      cnt = cnt.filter(s => cleanAllowed.includes(String(s.kelas || '').trim().toUpperCase()))
                    }
                    return (
                      <option key={t.id} value={t.id}>
                        {t.nama} {t.is_aktif ? '(Aktif)' : ''} ({cnt.length} siswa)
                      </option>
                    )
                  })}
                  <option value="all">Semua Tahun Ajaran ({activeTaStudents.length} siswa)</option>
                </select>
              </div>
            )}

            {/* Pilih Kelas */}
            {targetType !== 'guru' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Pilih Kelas</label>
                <select
                  value={selectedKelas}
                  onChange={e => setSelectedKelas(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {(!allowedClasses || allowedClasses.length > 1) && (
                    <option value="Semua Siswa">
                      {allowedClasses && allowedClasses.length > 1 ? `Semua Kelas Perwalian (${activeTaStudents.length} siswa)` : `Semua Kelas (${activeTaStudents.length} siswa)`}
                    </option>
                  )}
                  {availableClasses.map(c => {
                    const cnt = activeTaStudents.filter(s => s.kelas === c).length
                    return (
                      <option key={c} value={c}>Kelas {c} ({cnt} siswa)</option>
                    )
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Format Template Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Format Penamaan & Label Grup</h4>
              <span className="text-[11px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                TA Aktif: {taShort}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Format Ortu */}
              {(targetType === 'ortu' || targetType === 'all') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Format Nama Ortu:
                  </label>
                  <input
                    type="text"
                    value={formatOrtu}
                    onChange={e => setFormatOrtu(e.target.value)}
                    placeholder="OT [KELAS] [TA] - [NAMA]"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              {/* Format Siswa */}
              {(targetType === 'siswa' || targetType === 'all') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Format Nama Siswa:
                  </label>
                  <input
                    type="text"
                    value={formatSiswa}
                    onChange={e => setFormatSiswa(e.target.value)}
                    placeholder="[KELAS] [TA] - [NAMA]"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              {/* Format Guru */}
              {(targetType === 'guru' || targetType === 'all') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Format Nama Guru/Staff:
                  </label>
                  <input
                    type="text"
                    value={formatGuru}
                    onChange={e => setFormatGuru(e.target.value)}
                    placeholder="GURU - [NAMA]"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              {/* Nama Grup Kontak / Label */}
              <div className={targetType === 'all' ? 'sm:col-span-2' : ''}>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  🏷️ Nama Grup / Label di HP & Google Contacts:
                </label>
                <input
                  type="text"
                  value={groupLabelCustom}
                  onChange={e => setGroupLabelCustom(e.target.value)}
                  placeholder={defaultGroupName}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Gaya Penulisan Nama */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Gaya Penulisan Nama ([NAMA]):
                </label>
                <select
                  value={nameStyle}
                  onChange={e => setNameStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="uppercase">Nama Lengkap (UPPERCASE) - Contoh: ABIGAIL ANNASTASIA MIKAYLA</option>
                  <option value="normal">Nama Lengkap (Normal) - Contoh: Abigail Annastasia Mikayla</option>
                  <option value="firstname_upper">Nama Depan Saja (UPPERCASE) - Contoh: ABIGAIL</option>
                  <option value="firstname_normal">Nama Depan Saja (Normal) - Contoh: Abigail</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2.5 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold border-b border-slate-800 pb-2 flex-wrap gap-1">
              <span>👁️ Pratinjau Tampilan Kontak di HP</span>
              <span className="text-emerald-400 font-black shrink-0">{preparedContacts.length} Kontak Siap Diunduh</span>
            </div>

            <div className="space-y-1.5 pt-0.5 font-mono text-xs max-h-32 overflow-y-auto custom-scrollbar">
              {loading ? (
                <p className="text-xs text-slate-400 py-2 text-center">Memuat data kontak...</p>
              ) : preparedContacts.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-slate-800/90 px-3 py-2 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-emerald-400 font-bold shrink-0">📱</span>
                    <span className="text-white font-bold truncate">{c.fullName}</span>
                  </div>
                  <span className="text-emerald-400 text-[11px] shrink-0 font-mono font-bold">{c.phone}</span>
                </div>
              ))}

              {!loading && preparedContacts.length === 0 && (
                <p className="text-xs text-amber-400 py-2 text-center">Tidak ada kontak dengan nomor HP pada filter ini.</p>
              )}
            </div>

            <div className="pt-1 text-[11px] text-indigo-300 flex items-center justify-between gap-2 border-t border-slate-800 flex-wrap">
              <div className="flex items-center gap-1.5 truncate">
                <span>🏷️ Grup:</span>
                <span className="font-bold text-white bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800/60 truncate">
                  {defaultGroupName}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 italic">*Hanya kontak dengan nomor HP</span>
            </div>
          </div>

          {/* Tips Khusus iPhone (iOS) */}
          <div className="bg-sky-50 border border-sky-200/80 rounded-xl p-3 text-[11px] text-sky-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-sky-900">
              <span className="text-sm">🍎</span>
              <span>Panduan Khusus Pengguna iPhone (iOS):</span>
            </div>
            <p className="text-sky-800 leading-relaxed">
              Saat menekan tombol <strong>"Download Kontak HP (.vcf)"</strong> di iPhone:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1">
              <li>
                Pada menu lembar <strong>Bagikan (Share Sheet)</strong> yang muncul, pilih aplikasi <strong>Kontak (Contacts)</strong>, lalu tekan tombol <strong>"Tambah Semua Kontak"</strong> di kanan atas.
              </li>
              <li>
                <em>Atau</em> pilih <strong>"Simpan ke File"</strong>, lalu buka file <code>.vcf</code> tersebut dari aplikasi <strong>File (Files) / Unduhan</strong> untuk mengimpor seluruh kontak sekaligus.
              </li>
            </ol>
          </div>

          {/* Tips Penghapusan Massal & Info Filter Nomor HP */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-[11px] text-emerald-900 flex items-start gap-2">
            <span className="text-base leading-none">💡</span>
            <div>
              <strong>Hanya Kontak Ber-Nomor HP:</strong> Sistem secara otomatis memfilter dan hanya mengekspor kontak siswa atau orang tua yang memiliki nomor HP aktif. Semua kontak juga otomatis dimasukkan ke grup <strong>"{defaultGroupName}"</strong> untuk kemudahan manajemen di HP.
            </div>
          </div>
        </div>

        {/* Action Buttons (Pinned Footer) */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 shrink-0 bg-slate-50/90 backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-200/70 transition-colors text-center"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={preparedContacts.length === 0 || loading || exportingVcf}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            title="Download CSV untuk Google Contacts (contacts.google.com)"
          >
            <span>🌐</span>
            <span>Google Contacts (.csv)</span>
          </button>

          <button
            type="button"
            onClick={handleExportVCF}
            disabled={preparedContacts.length === 0 || loading || exportingVcf}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            title="Download file .vcf - Cukup klik di HP Android / iPhone untuk langsung simpan ke kontak telepon"
          >
            {exportingVcf ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>📱</span>
                <span>{isIOS ? 'Simpan / Download Kontak (.vcf)' : 'Download Kontak HP (.vcf)'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
