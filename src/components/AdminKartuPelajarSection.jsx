import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import KartuPelajarCard, { CARD_THEMES, formatAlamatLengkap, parseKetentuanList, serializeKetentuanList, parseMisiList, serializeMisiList } from './KartuPelajarCard'
import { exportCardAsPdf, exportCardAsImage, exportBulkCardsAsPdf } from '../utils/kartuPelajarExporter'
import { downloadWorkbook } from '../utils/fileDownloader'
import { downloadStudentTemplateExcel, combineAlamatAndRtRw, cleanPhone, toTitleCase, parseDateToIso, formatAlamatJalan, extractRtRwFromRow } from '../utils/studentExcelHelper'

const CARD_COMPONENTS_META = [
  // Sisi Depan
  {
    id: 'foto',
    side: 'front',
    label: 'Pas Foto Siswa',
    icon: '📷',
    keyX: 'kartu_foto_x',
    keyY: 'kartu_foto_y',
    keySize: 'kartu_foto_size',
    keyRotate: 'kartu_foto_rotate',
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'qr',
    side: 'front',
    label: 'QR Code',
    icon: '🏁',
    keyX: 'kartu_qr_x',
    keyY: 'kartu_qr_y',
    keySize: 'kartu_qr_size',
    keyRotate: 'kartu_qr_rotate',
    textFields: [
      { key: 'kartu_masa_berlaku', label: 'Teks Masa Berlaku', placeholder: 'contoh: 2024 - 2027' }
    ],
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'barcode',
    side: 'front',
    label: 'Barcode Garis',
    icon: '📊',
    keyX: 'kartu_barcode_x',
    keyY: 'kartu_barcode_y',
    keySize: 'kartu_barcode_size',
    keyRotate: 'kartu_barcode_rotate',
    widthKey: 'kartu_barcode_width',
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'biodata',
    side: 'front',
    label: 'Biodata Siswa',
    icon: '📝',
    keyX: 'kartu_biodata_x',
    keyY: 'kartu_biodata_y',
    keySize: 'kartu_biodata_size',
    keyRotate: 'kartu_biodata_rotate',
    widthKey: 'kartu_biodata_width',
    labelWidthKey: 'kartu_biodata_label_width',
    fontSizeKey: 'kartu_biodata_font_size',
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'badge',
    side: 'front',
    label: 'Badge Sekolah',
    icon: '🏷️',
    keyX: 'kartu_badge_x',
    keyY: 'kartu_badge_y',
    keySize: 'kartu_badge_size',
    keyRotate: 'kartu_badge_rotate',
    textFields: [
      { key: 'kartu_badge_teks', label: 'Teks Badge', placeholder: 'contoh: SMP BUDI MULIA' }
    ],
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0, text: 'SMP BUDI MULIA' }
  },
  {
    id: 'header_title',
    side: 'front',
    label: 'Judul Kartu',
    icon: '🪪',
    keyX: 'kartu_header_title_x',
    keyY: 'kartu_header_title_y',
    keySize: 'kartu_header_title_size',
    keyRotate: 'kartu_header_title_rotate',
    textFields: [
      { key: 'kartu_judul', label: 'Judul Utama (Baris 1)', placeholder: 'KARTU TANDA PELAJAR' },
      { key: 'kartu_subjudul', label: 'Sub-judul / Pengenal (Baris 2)', placeholder: 'MURID / PESERTA DIDIK' },
      { key: 'kartu_header_instansi', label: 'Nama Yayasan / Instansi (Atas)', placeholder: 'YAYASAN BUDI MULIA JAKARTA' }
    ],
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'header_logo',
    side: 'front',
    label: 'Logo & Nama Sekolah (Header)',
    icon: '🏛️',
    keyX: 'kartu_header_logo_x',
    keyY: 'kartu_header_logo_y',
    keySize: 'kartu_header_logo_size',
    keyRotate: 'kartu_header_logo_rotate',
    textFields: [
      { key: 'kartu_nama_sekolah', label: 'Nama Sekolah (Baris 1)', placeholder: 'SMP BUDI MULIA' },
      { key: 'kartu_npsn_sekolah', label: 'NPSN Sekolah (Baris 2)', placeholder: '20106353' },
      { key: 'kartu_akreditasi', label: 'Akreditasi (Baris 3)', placeholder: 'TERAKREDITASI A' }
    ],
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'kepsek',
    side: 'front',
    label: 'Pengesahan Kepala Sekolah',
    icon: '✍️',
    keyX: 'kartu_kepsek_x',
    keyY: 'kartu_kepsek_y',
    keySize: 'kartu_kepsek_size',
    keyRotate: 'kartu_kepsek_rotate',
    textFields: [
      { key: 'kartu_tgl_terbit', label: 'Tempat & Tanggal Pengesahan', placeholder: 'Jakarta, 15 Juli 2024' },
      { key: 'kartu_nama_kepsek', label: 'Nama Kepala Sekolah', placeholder: 'Drs. Budi Santoso, M.Pd' },
      { key: 'kartu_nip_kepsek', label: 'NIP Kepala Sekolah (kosongkan jika tidak ada)', placeholder: '19750101 200003 1 001' }
    ],
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'cap',
    side: 'front',
    label: 'Cap Stempel Sekolah',
    icon: '🔴',
    keyX: 'kartu_cap_x',
    keyY: 'kartu_cap_y',
    keySize: 'kartu_cap_size',
    keyRotate: 'kartu_cap_rotate',
    defaultValues: { x: 0, y: 0, size: 100, rotate: -8 }
  },
  {
    id: 'ttd',
    side: 'front',
    label: 'Tanda Tangan Kepsek',
    icon: '✒️',
    keyX: 'kartu_ttd_x',
    keyY: 'kartu_ttd_y',
    keySize: 'kartu_ttd_size',
    keyRotate: 'kartu_ttd_rotate',
    defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
  },
  {
    id: 'bg_logo',
    side: 'front',
    label: 'Watermark Logo Background',
    icon: '🛡️',
    keyX: 'kartu_bg_logo_x',
    keyY: 'kartu_bg_logo_y',
    keySize: 'kartu_bg_logo_size',
    defaultValues: { x: 0, y: 0, size: 100 }
  },

  // Sisi Belakang
  {
    id: 'back_header',
    side: 'back',
    label: 'Kop Sekolah Belakang',
    icon: '🏛️',
    keyX: 'kartu_back_header_x',
    keyY: 'kartu_back_header_y',
    keySize: 'kartu_back_header_size',
    textFields: [
      { key: 'kartu_nama_sekolah', label: 'Nama Sekolah Belakang', placeholder: 'SMP BUDI MULIA' }
    ],
    defaultValues: { x: 0, y: 0, size: 100 }
  },
  {
    id: 'back_visi_misi',
    side: 'back',
    label: 'Visi & Misi Sekolah',
    icon: '🎯',
    keyX: 'kartu_back_visi_x',
    keyY: 'kartu_back_visi_y',
    keySize: 'kartu_back_visi_size',
    textFields: [
      { key: 'kartu_visi', label: 'Teks Visi', isTextarea: true, rows: 2 },
      { key: 'kartu_misi', label: 'Poin Misi (1 baris per poin)', isTextarea: true, rows: 3 }
    ],
    defaultValues: { x: 0, y: 0, size: 100 }
  },
  {
    id: 'back_rules',
    side: 'back',
    label: 'Ketentuan Kartu',
    icon: '📋',
    keyX: 'kartu_back_rules_x',
    keyY: 'kartu_back_rules_y',
    keySize: 'kartu_back_rules_size',
    textFields: [
      { key: 'kartu_ketentuan', label: 'Ketentuan Kartu (1 baris per poin)', isTextarea: true, rows: 4 }
    ],
    defaultValues: { x: 0, y: 0, size: 100 }
  },
  {
    id: 'back_footer',
    side: 'back',
    label: 'Footer Belakang',
    icon: '🌐',
    keyX: 'kartu_back_footer_x',
    keyY: 'kartu_back_footer_y',
    keySize: 'kartu_back_footer_size',
    textFields: [
      { key: 'kartu_footer_teks', label: 'Teks Pita Footer Belakang', placeholder: 'SMP BUDI MULIA JAKARTA' }
    ],
    defaultValues: { x: 0, y: 0, size: 100 }
  }
]

export default function AdminKartuPelajarSection({ students = [], activeTa = null, allFotos = [], tahunAjarans = [], onRefresh }) {
  const [activeTab, setActiveTab] = useState('desain') // 'desain' | 'import_excel' | 'cetak_massal'
  const [loading, setLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [message, setMessage] = useState(null)
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState(null)
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(true)
  const [autoSaveStatus, setAutoSaveStatus] = useState(null) // null | 'saving' | 'saved'
  const autoSaveTimerRef = useRef(null)

  // Settings State
  const [settings, setSettings] = useState({
    kartu_nama_sekolah: 'SMP BUDI MULIA',
    kartu_npsn_sekolah: '20106353',
    kartu_instansi_sekolah: 'DINAS PENDIDIKAN PROVINSI DKI JAKARTA',
    kartu_akreditasi: 'TERAKREDITASI A',
    kartu_judul: 'KARTU TANDA PELAJAR',
    kartu_subjudul: 'SEKOLAH MENENGAH PERTAMA',
    kartu_alamat_sekolah: 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730',
    kartu_nama_kepsek: 'Septian Ruswadi, S.Pd',
    kartu_nip_kepsek: '-',
    kartu_tema_warna: 'budi_mulia_resmi',
    kartu_logo_url: '/logo_budimulia.png',
    kartu_tanggal_terbit: 'Jakarta, 1 Juli 2026',
    kartu_web_sekolah: 'smpbudimuliajakarta.sch.id',
    kartu_masa_berlaku: 'Selama Menjadi Siswa Aktif',
    kartu_footer_teks: 'KARTU IDENTITAS RESMI SISWA • SMP BUDI MULIA JAKARTA',
    kartu_visi_sekolah: 'Terwujudnya peserta didik yang beriman, berakhlak mulia, cerdas, berprestasi, berwawasan global, dan berakar pada budaya bangsa.',
    kartu_misi_sekolah: 
`1. Menanamkan keimanan, ketakwaan, dan budi pekerti luhur melalui pembiasaan dan pengamalan nilai-nilai keagamaan.
2. Menyelenggarakan proses pembelajaran yang aktif, inovatif, kreatif, efektif, menyenangkan, dan berbasis teknologi.
3. Mengembangkan potensi bakat, minat, dan prestasi peserta didik secara optimal di bidang akademik maupun non-akademik.
4. Menumbuhkan budaya disiplin, cinta tanah air, kepedulian sosial, serta kelestarian lingkungan hidup.`,
    kartu_ttd_url: '',
    kartu_ttd_size: 100,
    kartu_ttd_x: 0,
    kartu_ttd_y: 0,
    kartu_ttd_rotate: 0,
    kartu_cap_url: '',
    kartu_cap_size: 100,
    kartu_cap_x: 0,
    kartu_cap_y: 0,
    kartu_cap_rotate: -8,
    kartu_cap_opacity: 90,
    kartu_bg_logo_size: 100,
    kartu_bg_logo_x: 0,
    kartu_bg_logo_y: 0,
    kartu_bg_logo_opacity: 8,
    kartu_glossy_effect: true,
    kartu_belakang_teks: 
`1. Kartu ini adalah tanda pengenal sah siswa SMP Budi Mulia Jakarta.
2. Wajib dibawa saat berada di lingkungan sekolah dan kegiatan resmi.
3. Kartu ini tidak dapat dipindahtangankan kepada orang lain.
4. Apabila kartu ini hilang atau rusak, segera lapor ke bagian Tata Usaha / Kesiswaan.
5. Jika menemukan kartu ini, mohon kembalikan ke alamat sekolah di bawah ini.`,

    // Posisi & Ukuran Baru untuk Fitur Visual Drag & Resize
    kartu_foto_x: 0,
    kartu_foto_y: 0,
    kartu_foto_size: 100,
    kartu_foto_rotate: 0,

    kartu_qr_x: 0,
    kartu_qr_y: 0,
    kartu_qr_size: 100,
    kartu_qr_rotate: 0,

    kartu_barcode_x: 0,
    kartu_barcode_y: 0,
    kartu_barcode_size: 100,
    kartu_barcode_rotate: 0,
    kartu_barcode_width: 355,

    kartu_biodata_x: 0,
    kartu_biodata_y: 0,
    kartu_biodata_size: 100,
    kartu_biodata_rotate: 0,

    kartu_badge_x: 0,
    kartu_badge_y: 0,
    kartu_badge_size: 100,
    kartu_badge_rotate: 0,
    kartu_badge_teks: 'SMP BUDI MULIA',

    kartu_header_title_x: 0,
    kartu_header_title_y: 0,
    kartu_header_title_size: 100,
    kartu_header_title_rotate: 0,

    kartu_header_logo_x: 0,
    kartu_header_logo_y: 0,
    kartu_header_logo_size: 100,
    kartu_header_logo_rotate: 0,

    kartu_kepsek_x: 0,
    kartu_kepsek_y: 0,
    kartu_kepsek_size: 100,
    kartu_kepsek_rotate: 0,

    kartu_back_header_x: 0,
    kartu_back_header_y: 0,
    kartu_back_header_size: 100,

    kartu_back_visi_x: 0,
    kartu_back_visi_y: 0,
    kartu_back_visi_size: 100,

    kartu_back_rules_x: 0,
    kartu_back_rules_y: 0,
    kartu_back_rules_size: 100,

    kartu_back_footer_x: 0,
    kartu_back_footer_y: 0,
    kartu_back_footer_size: 100,

    kartu_biodata_width: '',
    kartu_biodata_label_width: 85,
    kartu_biodata_font_size: '10.5',
    kartu_code_display: 'both',
    kartu_custom_components: JSON.stringify([
      {
        id: 'custom_npsn',
        side: 'front',
        label: 'NPSN Sekolah',
        type: 'text',
        text: 'NPSN: 20106353',
        initialX: 305,
        initialY: 34,
        x: 0,
        y: 0,
        size: 85,
        rotate: 0,
        color: '#dc2626',
        bgColor: 'transparent',
        fontSize: 8,
        isBold: true
      }
    ])
  })

  // Live preview state
  const [previewSide, setPreviewSide] = useState('front') // 'front' | 'back'
  const [selectedStudentForPreview, setSelectedStudentForPreview] = useState(null)

  // Visual Studio Editor State (Drag & Drop, Resize, Rotate, Fullscreen, Custom Components)
  const [isEditorMode, setIsEditorMode] = useState(true)
  const [activeComponentId, setActiveComponentId] = useState('foto')
  const [isDragging, setIsDragging] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenZoom, setFullscreenZoom] = useState(1.15)
  const [isAddCustomModalOpen, setIsAddCustomModalOpen] = useState(false)
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false)
  const [newCustomData, setNewCustomData] = useState({
    type: 'text',
    text: '',
    label: '',
    side: 'front',
    color: '#0f172a',
    bgColor: '#e0e7ff',
    fontSize: 10,
    isBold: true,
    hasBorder: false,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderStyle: 'solid'
  })

  // Sinkronisasi custom components dari settings
  const customComponents = useMemo(() => {
    if (!settings.kartu_custom_components) return []
    try {
      const parsed = typeof settings.kartu_custom_components === 'string'
        ? JSON.parse(settings.kartu_custom_components)
        : settings.kartu_custom_components
      return Array.isArray(parsed) ? parsed.filter(item => !item.text?.includes('20106353')) : []
    } catch {
      return []
    }
  }, [settings.kartu_custom_components])

  // Handler Tambah Komponen Kustom Baru
  const handleAddCustomComponent = (compData) => {
    const newComp = {
      id: `custom_${Date.now()}`,
      side: compData.side || previewSide,
      label: compData.label || (compData.type === 'badge' ? 'Badge Kustom' : 'Teks Bebas'),
      type: compData.type || 'text',
      text: compData.text || (compData.type === 'badge' ? 'BADGE BARU' : 'Teks Baru'),
      initialX: 180,
      initialY: 130,
      x: 0,
      y: 0,
      size: 100,
      rotate: 0,
      color: compData.color || (compData.type === 'badge' ? '#3730a3' : '#0f172a'),
      bgColor: compData.bgColor || (compData.type === 'badge' ? '#e0e7ff' : 'transparent'),
      fontSize: compData.fontSize || (compData.type === 'badge' ? 8.5 : 10),
      isBold: compData.isBold !== false,
      hasBorder: Boolean(compData.hasBorder),
      borderColor: compData.borderColor || '#cbd5e1',
      borderWidth: compData.borderWidth || 1,
      borderStyle: compData.borderStyle || 'solid'
    }
    const nextList = [...customComponents, newComp]
    setSettings(prev => ({
      ...prev,
      kartu_custom_components: JSON.stringify(nextList)
    }))
    setActiveComponentId(newComp.id)
    setIsAddCustomModalOpen(false)
  }

  // Handler Hapus Komponen Kustom
  const handleDeleteCustomComponent = (id) => {
    const nextList = customComponents.filter(c => c.id !== id)
    setSettings(prev => ({
      ...prev,
      kartu_custom_components: JSON.stringify(nextList)
    }))
    const firstSideMeta = CARD_COMPONENTS_META.find(c => c.side === previewSide)
    setActiveComponentId(firstSideMeta?.id || 'foto')
  }

  // Handler Update Atribut Komponen Kustom
  const handleUpdateCustomComponentAttr = (id, key, val) => {
    const nextList = customComponents.map(c => {
      if (c.id === id) {
        return { ...c, [key]: val }
      }
      return c
    })
    setSettings(prev => ({
      ...prev,
      kartu_custom_components: JSON.stringify(nextList)
    }))
  }

  // Escape key listener & body scroll lock untuk mode Fullscreen & Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showBulkPrintModal) {
          setShowBulkPrintModal(false)
        } else if (isAddCustomModalOpen) {
          setIsAddCustomModalOpen(false)
        } else if (isFullscreen) {
          setIsFullscreen(false)
        }
      }
    }
    if (isFullscreen || isAddCustomModalOpen || showBulkPrintModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isFullscreen, isAddCustomModalOpen, showBulkPrintModal])

  const dragRef = useRef({
    active: false,
    id: null,
    isCustom: false,
    keyX: '',
    keyY: '',
    startMouseX: 0,
    startMouseY: 0,
    startValX: 0,
    startValY: 0,
    scale: 0.9
  })

  // Sinkronisasi komponen aktif saat tab sisi depan / belakang berganti
  useEffect(() => {
    const isCustom = activeComponentId?.startsWith('custom_')
    if (isCustom) {
      const currentCustom = customComponents.find(c => c.id === activeComponentId)
      if (!currentCustom || (currentCustom.side || 'front') !== previewSide) {
        const firstOnSide = CARD_COMPONENTS_META.find(c => c.side === previewSide)
        if (firstOnSide) setActiveComponentId(firstOnSide.id)
      }
    } else {
      const currentMeta = CARD_COMPONENTS_META.find(c => c.id === activeComponentId)
      if (!currentMeta || currentMeta.side !== previewSide) {
        const firstOnSide = CARD_COMPONENTS_META.find(c => c.side === previewSide)
        if (firstOnSide) setActiveComponentId(firstOnSide.id)
      }
    }
  }, [previewSide, activeComponentId, customComponents])

  // Handler inisiasi Drag mouse / touch
  const handleStartDrag = useCallback((id, e) => {
    if (!isEditorMode) return
    let keyX = '', keyY = '', startValX = 0, startValY = 0, isCustom = false

    const meta = CARD_COMPONENTS_META.find(c => c.id === id)
    if (meta && meta.keyX && meta.keyY) {
      keyX = meta.keyX
      keyY = meta.keyY
      startValX = Number(settings[meta.keyX]) || 0
      startValY = Number(settings[meta.keyY]) || 0
    } else {
      const custom = customComponents.find(c => c.id === id)
      if (custom) {
        isCustom = true
        startValX = Number(custom.x) || 0
        startValY = Number(custom.y) || 0
      } else {
        return
      }
    }

    e.preventDefault()
    e.stopPropagation()
    setActiveComponentId(id)

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    dragRef.current = {
      active: true,
      id,
      isCustom,
      keyX,
      keyY,
      startMouseX: clientX,
      startMouseY: clientY,
      startValX,
      startValY,
      scale: isFullscreen ? fullscreenZoom : 0.9
    }
    setIsDragging(true)
  }, [isEditorMode, settings, customComponents, isFullscreen, fullscreenZoom])

  // Global mousemove & mouseup listener untuk fluid drag & drop
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current.active) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      const dx = (clientX - dragRef.current.startMouseX) / (dragRef.current.scale || 0.9)
      const dy = (clientY - dragRef.current.startMouseY) / (dragRef.current.scale || 0.9)

      let nextX = Math.round(dragRef.current.startValX + dx)
      let nextY = Math.round(dragRef.current.startValY + dy)

      if (dragRef.current.id === 'kepsek') {
        nextX = Math.min(80, Math.max(-180, nextX))
        nextY = Math.min(25, Math.max(-160, nextY))
      }

      if (dragRef.current.isCustom) {
        setSettings(prev => {
          let list = []
          try {
            list = typeof prev.kartu_custom_components === 'string'
              ? JSON.parse(prev.kartu_custom_components)
              : (prev.kartu_custom_components || [])
          } catch { list = [] }
          const updated = list.map(item => {
            if (item.id === dragRef.current.id) {
              return { ...item, x: nextX, y: nextY }
            }
            return item
          })
          return { ...prev, kartu_custom_components: JSON.stringify(updated) }
        })
      } else {
        setSettings(prev => ({
          ...prev,
          [dragRef.current.keyX]: nextX,
          [dragRef.current.keyY]: nextY
        }))
      }
    }

    const handleMouseUp = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false
        setIsDragging(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleMouseMove, { passive: false })
    window.addEventListener('touchend', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleMouseMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [])

  // Fungsi Nudge (Geser Halus X/Y)
  const nudgePosition = (deltaX, deltaY) => {
    if (activeComponentId?.startsWith('custom_')) {
      const c = customComponents.find(item => item.id === activeComponentId)
      if (c) {
        handleUpdateCustomComponentAttr(activeComponentId, 'x', (Number(c.x) || 0) + deltaX)
        handleUpdateCustomComponentAttr(activeComponentId, 'y', (Number(c.y) || 0) + deltaY)
      }
      return
    }
    const meta = CARD_COMPONENTS_META.find(c => c.id === activeComponentId)
    if (!meta || !meta.keyX || !meta.keyY) return
    setSettings(prev => ({
      ...prev,
      [meta.keyX]: (Number(prev[meta.keyX]) || 0) + deltaX,
      [meta.keyY]: (Number(prev[meta.keyY]) || 0) + deltaY
    }))
  }

  // Reset Komponen Terpilih ke Bawaan
  const handleResetActiveComponent = () => {
    if (activeComponentId?.startsWith('custom_')) {
      handleUpdateCustomComponentAttr(activeComponentId, 'x', 0)
      handleUpdateCustomComponentAttr(activeComponentId, 'y', 0)
      handleUpdateCustomComponentAttr(activeComponentId, 'size', 100)
      handleUpdateCustomComponentAttr(activeComponentId, 'rotate', 0)
      return
    }
    const meta = CARD_COMPONENTS_META.find(c => c.id === activeComponentId)
    if (!meta) return
    setSettings(prev => {
      const next = { ...prev }
      if (meta.keyX) next[meta.keyX] = meta.defaultValues?.x ?? 0
      if (meta.keyY) next[meta.keyY] = meta.defaultValues?.y ?? 0
      if (meta.keySize) next[meta.keySize] = meta.defaultValues?.size ?? 100
      if (meta.keyRotate) next[meta.keyRotate] = meta.defaultValues?.rotate ?? 0
      if (meta.keyOpacity) next[meta.keyOpacity] = meta.defaultValues?.opacity ?? 90
      if (meta.id === 'biodata') {
        next.kartu_biodata_width = ''
        next.kartu_biodata_label_width = 85
        next.kartu_biodata_font_size = '10.5'
      }
      return next
    })
  }

  // Reset Seluruh Tata Letak Kartu ke Bawaan
  const handleResetAllCardLayout = () => {
    if (!window.confirm('Apakah Anda yakin ingin mereset seluruh posisi, ukuran, dan rotasi semua komponen kartu ke tata letak awal?')) {
      return
    }
    setSettings(prev => {
      const next = { ...prev }
      CARD_COMPONENTS_META.forEach(meta => {
        if (meta.keyX) next[meta.keyX] = meta.defaultValues?.x ?? 0
        if (meta.keyY) next[meta.keyY] = meta.defaultValues?.y ?? 0
        if (meta.keySize) next[meta.keySize] = meta.defaultValues?.size ?? 100
        if (meta.keyRotate) next[meta.keyRotate] = meta.defaultValues?.rotate ?? 0
        if (meta.keyOpacity) next[meta.keyOpacity] = meta.defaultValues?.opacity ?? 90
      })
      return next
    })
  }

  // Import Excel State
  const [excelFile, setExcelFile] = useState(null)
  const [excelPreviewData, setExcelPreviewData] = useState([])
  const [isProcessingExcel, setIsProcessingExcel] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const fileInputRef = useRef(null)

  // Bulk Print State
  const [filterKelas, setFilterKelas] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNisns, setSelectedNisns] = useState(new Set())
  const [bulkPrintMode, setBulkPrintMode] = useState('both') // 'front' | 'back' | 'both'
  const [isGeneratingBulkPdf, setIsGeneratingBulkPdf] = useState(false)
  const [bulkPdfProgress, setBulkPdfProgress] = useState(null) // null | { current: 1, total: 10 }

  // Preview Export State (Tab 1)
  const previewFrontRef = useRef(null)
  const previewBackRef = useRef(null)
  const [isExportingPreview, setIsExportingPreview] = useState(false)

  // Download Single Preview Image (PNG 300 DPI)
  const handleDownloadPreviewImage = async () => {
    const target = previewSide === 'front' ? previewFrontRef.current : previewBackRef.current
    if (!target) return
    setIsExportingPreview(true)
    try {
      const fileName = `kartu_pelajar_${selectedStudentForPreview?.nisn || 'siswa'}_${previewSide}.png`
      await exportCardAsImage(target, fileName)
    } catch (err) {
      console.error(err)
      alert('Gagal mengunduh gambar kartu: ' + (err.message || err))
    } finally {
      setIsExportingPreview(false)
    }
  }

  // Download Single Preview PDF (CR80 Depan-Belakang)
  const handleDownloadPreviewPdf = async () => {
    if (!previewFrontRef.current || !previewBackRef.current) return
    setIsExportingPreview(true)
    try {
      const fileName = `kartu_pelajar_${selectedStudentForPreview?.nisn || 'siswa'}.pdf`
      await exportCardAsPdf(previewFrontRef.current, previewBackRef.current, fileName)
    } catch (err) {
      console.error(err)
      alert('Gagal mengunduh PDF kartu: ' + (err.message || err))
    } finally {
      setIsExportingPreview(false)
    }
  }

  // Download Bulk PDF (Semua Siswa Terpilih)
  const handleDownloadBulkPdf = async () => {
    const container = document.getElementById('printable-bulk-cards')
    if (!container) return
    const cardElements = Array.from(container.querySelectorAll('[data-card-side]'))
    if (cardElements.length === 0) {
      alert('Tidak ada kartu yang ditemukan untuk diekspor.')
      return
    }

    setIsGeneratingBulkPdf(true)
    setBulkPdfProgress({ current: 1, total: cardElements.length })
    try {
      const fileName = `kartu_pelajar_massal_${studentsToPrint.length}_siswa.pdf`
      await exportBulkCardsAsPdf(cardElements, fileName, (curr, tot) => {
        setBulkPdfProgress({ current: curr, total: tot })
      })
    } catch (err) {
      console.error(err)
      alert('Gagal mengunduh PDF massal: ' + (err.message || err))
    } finally {
      setIsGeneratingBulkPdf(false)
      setBulkPdfProgress(null)
    }
  }

  // Photo map: nisn -> url
  const fotoMap = useMemo(() => {
    const map = new Map()
    if (allFotos && allFotos.length > 0) {
      allFotos.forEach(f => {
        const url = typeof f.cloudinary_url === 'string' ? f.cloudinary_url.trim() : ''
        if (f.nisn && url && url !== '-' && url !== 'null' && url !== 'undefined' && !url.includes('ui-avatars.com')) {
          if (!map.has(f.nisn) || f.tahun_ajaran_id === activeTa?.id) {
            map.set(f.nisn, url)
          }
        }
      })
    }
    return map
  }, [allFotos, activeTa?.id])

  // Filter students active in current academic year
  const activeStudents = useMemo(() => {
    if (!students || students.length === 0) return []
    return students.filter(s => {
      // Jika activeTa ada, filter berdasarkan tahun_ajaran_id atau siswa aktif
      if (activeTa?.id) {
        return s.tahun_ajaran_id === activeTa.id && s.is_aktif !== false
      }
      return s.is_aktif !== false
    })
  }, [students, activeTa])

  // Get available classes
  const availableClasses = useMemo(() => {
    const list = activeStudents.map(s => s.kelas).filter(k => k && k !== '-')
    return [...new Set(list)].sort()
  }, [activeStudents])

  // Filtered students for Tab Cetak Massal
  const filteredStudents = useMemo(() => {
    return activeStudents.filter(s => {
      const matchKelas = filterKelas === 'all' || s.kelas === filterKelas
      const q = searchQuery.toLowerCase()
      const matchSearch = !q || (s.nama_lengkap || s.nama || '').toLowerCase().includes(q) || (s.nisn || '').includes(q)
      return matchKelas && matchSearch
    })
  }, [activeStudents, filterKelas, searchQuery])

  // Set default preview student
  useEffect(() => {
    if (!selectedStudentForPreview && activeStudents.length > 0) {
      setSelectedStudentForPreview(activeStudents[0])
    }
  }, [activeStudents, selectedStudentForPreview])

  // Fetch settings from supabase on mount
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('pengaturan_sekolah')
          .select('setting_key, setting_value')
          .like('setting_key', 'kartu_%')

        if (data && data.length > 0) {
          setSettings(prev => {
            const next = { ...prev }
            data.forEach(item => {
              next[item.setting_key] = item.setting_value
            })
            if (!next.kartu_tema_warna || next.kartu_tema_warna !== 'budi_mulia_resmi') {
              next.kartu_tema_warna = 'budi_mulia_resmi'
            }
            if (!next.kartu_logo_url || next.kartu_logo_url === '/logo.png') {
              next.kartu_logo_url = '/logo_budimulia.png'
            }
            if (!next.kartu_alamat_sekolah || next.kartu_alamat_sekolah.includes('Jl. Mangga Besar No. 2M')) {
              next.kartu_alamat_sekolah = 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730'
            }
            if (!next.kartu_tanggal_terbit || next.kartu_tanggal_terbit.includes('15 Juli 2025')) {
              next.kartu_tanggal_terbit = 'Jakarta, 1 Juli 2026'
            }
            if (!next.kartu_web_sekolah || next.kartu_web_sekolah.includes('ebudimulia.com')) {
              next.kartu_web_sekolah = 'smpbudimuliajakarta.sch.id'
            }
            if (!next.kartu_npsn_sekolah || next.kartu_npsn_sekolah === '20100223') {
              next.kartu_npsn_sekolah = '20106353'
            }
            if (!next.kartu_code_display) {
              next.kartu_code_display = 'both'
            }
            if (!next.kartu_custom_components) {
              next.kartu_custom_components = '[]'
            } else {
              try {
                const parsed = typeof next.kartu_custom_components === 'string' 
                  ? JSON.parse(next.kartu_custom_components) 
                  : next.kartu_custom_components
                if (Array.isArray(parsed)) {
                  next.kartu_custom_components = JSON.stringify(parsed.filter(item => item.id !== 'custom_npsn' && !item.text?.includes('20106353')))
                }
              } catch {}
            }
            if (!next.kartu_visi_sekolah) {
              next.kartu_visi_sekolah = 'Terwujudnya peserta didik yang beriman, berakhlak mulia, cerdas, berprestasi, berwawasan global, dan berakar pada budaya bangsa.'
            }
            if (!next.kartu_misi_sekolah) {
              next.kartu_misi_sekolah = `1. Menanamkan keimanan, ketakwaan, dan budi pekerti luhur melalui pembiasaan dan pengamalan nilai-nilai keagamaan.\n2. Menyelenggarakan proses pembelajaran yang aktif, inovatif, kreatif, efektif, menyenangkan, dan berbasis teknologi.\n3. Mengembangkan potensi bakat, minat, dan prestasi peserta didik secara optimal di bidang akademik maupun non-akademik.\n4. Menumbuhkan budaya disiplin, cinta tanah air, kepedulian sosial, serta kelestarian lingkungan hidup.`
            }
            // Safety: pastikan koordinat kepsek tidak out-of-bounds
            if (Number(next.kartu_kepsek_y) > 25 || Number(next.kartu_kepsek_y) < -160) {
              next.kartu_kepsek_y = 0
            }
            if (Number(next.kartu_kepsek_x) > 80 || Number(next.kartu_kepsek_x) < -180) {
              next.kartu_kepsek_x = 0
            }
            setSavedSettingsSnapshot(next)
            return next
          })
        } else {
          setSettings(prev => {
            setSavedSettingsSnapshot(prev)
            return prev
          })
        }
      } catch (err) {
        console.warn('Gagal memuat pengaturan kartu:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  // Deteksi jika ada perubahan yang belum disimpan
  const hasUnsavedChanges = useMemo(() => {
    if (!savedSettingsSnapshot) return false
    return JSON.stringify(settings) !== JSON.stringify(savedSettingsSnapshot)
  }, [settings, savedSettingsSnapshot])

  // Simpan Settings ke Supabase
  const handleSaveSettings = async (customSettings = null, silent = false) => {
    const targetSettings = customSettings || settings
    if (!silent) setSavingSettings(true)
    else setAutoSaveStatus('saving')
    if (!silent) setMessage(null)

    try {
      const upsertRows = Object.entries(targetSettings).map(([key, val]) => ({
        setting_key: key,
        setting_value: val !== undefined && val !== null ? String(val) : ''
      }))

      for (const row of upsertRows) {
        await supabase.from('pengaturan_sekolah').upsert(row, { onConflict: 'setting_key' })
      }

      setSavedSettingsSnapshot({ ...targetSettings })
      if (!silent) {
        setMessage({ type: 'success', text: 'Pengaturan dan desain kartu pelajar berhasil disimpan!' })
      } else {
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus(null), 3000)
      }
    } catch (err) {
      console.error(err)
      if (!silent) {
        setMessage({ type: 'error', text: 'Gagal menyimpan pengaturan: ' + err.message })
      } else {
        setAutoSaveStatus(null)
      }
    } finally {
      if (!silent) {
        setSavingSettings(false)
        setTimeout(() => setMessage(null), 4000)
      }
    }
  }

  // Debounced Auto-Save otomatis saat user menggeser slider / mengedit form
  useEffect(() => {
    if (!isAutoSaveEnabled || !savedSettingsSnapshot) return
    const isDifferent = JSON.stringify(settings) !== JSON.stringify(savedSettingsSnapshot)
    if (!isDifferent) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      handleSaveSettings(settings, true)
    }, 1800)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [settings, isAutoSaveEnabled, savedSettingsSnapshot])

  // Peringatan saat user ingin reload / close browser tab jika ada perubahan belum tersimpan
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && autoSaveStatus !== 'saving') {
        e.preventDefault()
        e.returnValue = 'Perubahan pengaturan kartu belum disimpan.'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges, autoSaveStatus])

  // Handler pindah tab yang otomatis menyimpan perubahan
  const handleTabChange = (newTab) => {
    if (activeTab === 'desain' && hasUnsavedChanges && !isAutoSaveEnabled) {
      handleSaveSettings(settings, false)
    }
    setActiveTab(newTab)
  }

  // Handle upload gambar TTD atau Cap
  const handleUploadAsset = (key, file) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file maksimal 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64Url = e.target.result
      setSettings(prev => ({ ...prev, [key]: base64Url }))
    }
    reader.readAsDataURL(file)
  }

  // -------------------------------------------------------------
  // HELPER MANAJEMEN KETENTUAN PEMEGANG KARTU PER NOMOR
  // -------------------------------------------------------------
  const ketentuanItems = useMemo(() => {
    return parseKetentuanList(settings.kartu_belakang_teks, settings.kartu_nama_sekolah || 'SMP BUDI MULIA')
  }, [settings.kartu_belakang_teks, settings.kartu_nama_sekolah])

  const handleUpdateKetentuanItem = (index, val) => {
    const nextList = [...ketentuanItems]
    nextList[index] = val
    setSettings(prev => ({
      ...prev,
      kartu_belakang_teks: serializeKetentuanList(nextList)
    }))
  }

  const handleAddKetentuanItem = () => {
    const nextList = [...ketentuanItems, 'Ketentuan baru...']
    setSettings(prev => ({
      ...prev,
      kartu_belakang_teks: serializeKetentuanList(nextList)
    }))
  }

  const handleDeleteKetentuanItem = (index) => {
    if (ketentuanItems.length <= 1) {
      alert('Minimal harus ada 1 butir ketentuan pemegang kartu.')
      return
    }
    const nextList = ketentuanItems.filter((_, idx) => idx !== index)
    setSettings(prev => ({
      ...prev,
      kartu_belakang_teks: serializeKetentuanList(nextList)
    }))
  }

  const handleMoveKetentuanItem = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= ketentuanItems.length) return
    const nextList = [...ketentuanItems]
    const temp = nextList[index]
    nextList[index] = nextList[targetIndex]
    nextList[targetIndex] = temp
    setSettings(prev => ({
      ...prev,
      kartu_belakang_teks: serializeKetentuanList(nextList)
    }))
  }

  const handleResetKetentuanDefault = () => {
    const defaultList = [
      `Kartu ini adalah bukti identitas sah siswa ${settings.kartu_nama_sekolah || 'SMP Budi Mulia Jakarta'}.`,
      'Wajib dibawa setiap hari saat mengikuti kegiatan belajar mengajar.',
      'Tidak dapat dipindahtangankan kepada orang lain.',
      'Jika kartu ini hilang atau rusak, segera lapor ke pihak Tata Usaha sekolah.',
      'Yang menemukan kartu ini mohon mengembalikan ke alamat sekolah.'
    ]
    setSettings(prev => ({
      ...prev,
      kartu_belakang_teks: serializeKetentuanList(defaultList)
    }))
  }

  // -------------------------------------------------------------
  // HELPER MANAJEMEN VISI & MISI SEKOLAH
  // -------------------------------------------------------------
  const misiItems = useMemo(() => {
    return parseMisiList(settings.kartu_misi_sekolah)
  }, [settings.kartu_misi_sekolah])

  const handleUpdateMisiItem = (index, val) => {
    const nextList = [...misiItems]
    nextList[index] = val
    setSettings(prev => ({
      ...prev,
      kartu_misi_sekolah: serializeMisiList(nextList)
    }))
  }

  const handleAddMisiItem = () => {
    const nextList = [...misiItems, 'Butir misi baru...']
    setSettings(prev => ({
      ...prev,
      kartu_misi_sekolah: serializeMisiList(nextList)
    }))
  }

  const handleDeleteMisiItem = (index) => {
    if (misiItems.length <= 1) {
      alert('Minimal harus ada 1 butir misi sekolah.')
      return
    }
    const nextList = misiItems.filter((_, idx) => idx !== index)
    setSettings(prev => ({
      ...prev,
      kartu_misi_sekolah: serializeMisiList(nextList)
    }))
  }

  const handleMoveMisiItem = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= misiItems.length) return
    const nextList = [...misiItems]
    const temp = nextList[index]
    nextList[index] = nextList[targetIndex]
    nextList[targetIndex] = temp
    setSettings(prev => ({
      ...prev,
      kartu_misi_sekolah: serializeMisiList(nextList)
    }))
  }

  const handleResetMisiDefault = () => {
    const defaultList = [
      'Menanamkan keimanan, ketakwaan, dan budi pekerti luhur melalui pembiasaan dan pengamalan nilai-nilai keagamaan.',
      'Menyelenggarakan proses pembelajaran yang aktif, inovatif, kreatif, efektif, menyenangkan, dan berbasis teknologi.',
      'Mengembangkan potensi bakat, minat, dan prestasi peserta didik secara optimal di bidang akademik maupun non-akademik.',
      'Menumbuhkan budaya disiplin, cinta tanah air, kepedulian sosial, serta kelestarian lingkungan hidup.'
    ]
    setSettings(prev => ({
      ...prev,
      kartu_visi_sekolah: 'Terwujudnya peserta didik yang beriman, berakhlak mulia, cerdas, berprestasi, berwawasan global, dan berakar pada budaya bangsa.',
      kartu_misi_sekolah: serializeMisiList(defaultList)
    }))
  }

  // -------------------------------------------------------------
  // TAB 2: EXCEL IMPORT & TEMPLATE DOWNLOAD
  // -------------------------------------------------------------

  const handleDownloadTemplate = async () => {
    await downloadStudentTemplateExcel(activeStudents, 'Template_Siswa_Dan_Alamat.xlsx')
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    setIsProcessingExcel(true)
    setImportStatus(null)

    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { cellDates: true })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (rawRows.length === 0) {
        throw new Error('File Excel kosong atau tidak memiliki baris data.')
      }

      // Normalisasi nama kolom (case insensitive)
      const parsedRows = rawRows.map(row => {
        const getVal = (...keys) => {
          for (const k of keys) {
            const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase())
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
              return String(row[foundKey]).trim()
            }
          }
          return ''
        }

        const nisn = getVal('NISN', 'nisn', 'No Induk', 'no_induk')
        const nama = toTitleCase(getVal('NAMA LENGKAP', 'NAMA', 'nama_lengkap', 'nama'))
        
        // Jenis Kelamin
        const jkRaw = getVal('JENIS KELAMIN', 'Jenis Kelamin', 'jenis_kelamin', 'JK', 'jk', 'gender')
        let jk = ''
        if (jkRaw) {
          const u = jkRaw.toUpperCase()
          if (u.startsWith('L')) jk = 'L'
          else if (u.startsWith('P')) jk = 'P'
          else jk = jkRaw
        }

        const tempatLahir = toTitleCase(getVal('TEMPAT LAHIR', 'tempat_lahir', 'tempat'))
        
        // Tanggal Lahir (support format YYYY-MM-DD, DD/MM/YYYY, atau Date object Excel)
        const tglLahir = parseDateToIso(getVal('TANGGAL LAHIR', 'tanggal_lahir', 'tgl_lahir', 'tgl'))

        const rawAlamat = getVal('ALAMAT', 'alamat', 'alamat_rumah', 'jalan')
        const alamatRaw = formatAlamatJalan(rawAlamat)
        const rtRw = extractRtRwFromRow(row)
        const combinedAlamat = combineAlamatAndRtRw(alamatRaw, rtRw)

        const kelurahan = toTitleCase(getVal('KELURAHAN', 'kelurahan', 'desa', 'kel'))
        const kecamatan = toTitleCase(getVal('KECAMATAN', 'kecamatan', 'kec'))
        const kota = toTitleCase(getVal('KOTA', 'kota', 'kabupaten', 'kab_kota'))
        const noHpSiswa = cleanPhone(getVal('NO HP SISWA', 'NO HP', 'no_hp', 'no_whatsapp', 'telepon_siswa'))

        // Kontak Ortu
        const namaAyah = toTitleCase(getVal('NAMA AYAH', 'nama_ayah', 'ayah'))
        const noHpAyah = cleanPhone(getVal('NO HP AYAH', 'no_hp_ayah', 'hp_ayah', 'wa_ayah'))
        const namaIbu = toTitleCase(getVal('NAMA IBU', 'nama_ibu', 'ibu'))
        const noHpIbu = cleanPhone(getVal('NO HP IBU', 'no_hp_ibu', 'hp_ibu', 'wa_ibu'))
        const namaWali = toTitleCase(getVal('NAMA WALI', 'nama_wali', 'wali'))
        const noHpWali = cleanPhone(getVal('NO HP WALI', 'no_hp_wali', 'hp_wali'))
        const noHpOrtuUmum = cleanPhone(getVal('NO HP ORANG TUA', 'no_hp_ortu', 'hp_ortu', 'no_telepon_ortu'))

        return {
          nisn,
          nama,
          jenis_kelamin: jk,
          tempat_lahir: tempatLahir,
          tanggal_lahir: tglLahir,
          alamat: combinedAlamat,
          alamat_murni: alamatRaw,
          rt_rw: rtRw,
          kelurahan,
          kecamatan,
          kota,
          no_hp: noHpSiswa,
          nama_ayah: namaAyah,
          no_hp_ayah: noHpAyah,
          nama_ibu: namaIbu,
          no_hp_ibu: noHpIbu,
          nama_wali: namaWali,
          no_hp_wali: noHpWali,
          no_hp_ortu_umum: noHpOrtuUmum,
        }
      }).filter(r => r.nisn) // Hanya baris yang memiliki NISN

      setExcelPreviewData(parsedRows)
      setImportStatus({
        type: 'info',
        text: `Berhasil membaca ${parsedRows.length} baris data siswa dari file Excel.`
      })
    } catch (err) {
      console.error(err)
      setImportStatus({
        type: 'error',
        text: 'Gagal memproses file Excel: ' + err.message
      })
      setExcelPreviewData([])
    } finally {
      setIsProcessingExcel(false)
    }
  }

  // Simpan data Excel ke Supabase
  const handleSaveImportedData = async () => {
    if (excelPreviewData.length === 0) return
    setIsProcessingExcel(true)
    setImportStatus({ type: 'info', text: 'Menyimpan data ke database...' })

    try {
      let successCount = 0
      let failCount = 0

      // Kumpulkan list NISN yang akan diupdate
      const nisnList = excelPreviewData.map(r => String(r.nisn).trim())
      const { data: existingStudents } = await supabase
        .from('siswa_permanent')
        .select('*')
        .in('nisn', nisnList)

      const existingMap = new Map((existingStudents || []).map(s => [String(s.nisn).trim(), s]))

      const payloadList = excelPreviewData.map(row => {
        const cleanNisn = String(row.nisn).trim()
        const old = existingMap.get(cleanNisn) || {}

        // Susun kontak_ortu JSONB
        const kontakList = Array.isArray(old.kontak_ortu) ? [...old.kontak_ortu] : []
        const addOrUpdateKontak = (tag, nama, nomor) => {
          if (!nomor) return
          const cleanNum = cleanPhone(nomor)
          if (!cleanNum) return
          const idx = kontakList.findIndex(k => k.tag?.toLowerCase() === tag.toLowerCase())
          if (idx >= 0) {
            kontakList[idx] = { tag, nama: nama || kontakList[idx].nama || '', nomor: cleanNum }
          } else {
            kontakList.push({ tag, nama: nama || '', nomor: cleanNum })
          }
        }

        if (row.no_hp_ayah) addOrUpdateKontak('Ayah', row.nama_ayah, row.no_hp_ayah)
        if (row.no_hp_ibu) addOrUpdateKontak('Ibu', row.nama_ibu, row.no_hp_ibu)
        if (row.no_hp_wali) addOrUpdateKontak('Wali', row.nama_wali, row.no_hp_wali)
        if (row.no_hp_ortu_umum && !row.no_hp_ayah && !row.no_hp_ibu && !row.no_hp_wali) {
          addOrUpdateKontak('Orang Tua', row.nama_ayah || row.nama_ibu || 'Orang Tua', row.no_hp_ortu_umum)
        }

        const primaryOrtuPhone = cleanPhone(row.no_hp_ayah || row.no_hp_ibu || row.no_hp_ortu_umum) || old.no_hp_ortu || null
        const primaryOrtuName = row.nama_ayah || row.nama_ibu || old.nama_ortu || null

        const baseAlamat = row.alamat_murni || old.alamat || ''
        const finalAlamat = combineAlamatAndRtRw(baseAlamat, row.rt_rw) || row.alamat || old.alamat || null

        return {
          nisn: cleanNisn,
          nama_lengkap: row.nama || old.nama_lengkap || 'Siswa',
          ...(row.jenis_kelamin ? { jenis_kelamin: row.jenis_kelamin } : (old.jenis_kelamin ? { jenis_kelamin: old.jenis_kelamin } : {})),
          tempat_lahir: row.tempat_lahir || old.tempat_lahir || null,
          tanggal_lahir: row.tanggal_lahir || old.tanggal_lahir || null,
          alamat: finalAlamat,
          kelurahan: row.kelurahan || old.kelurahan || null,
          kecamatan: row.kecamatan || old.kecamatan || null,
          kota: row.kota || old.kota || null,
          no_whatsapp: cleanPhone(row.no_hp) || old.no_whatsapp || null,
          no_hp: cleanPhone(row.no_hp) || old.no_hp || null,
          kontak_ortu: kontakList,
          no_hp_ortu: primaryOrtuPhone,
          nama_ortu: primaryOrtuName
        }
      })

      // Batch Upsert ke siswa_permanent
      const { error } = await supabase
        .from('siswa_permanent')
        .upsert(payloadList, { onConflict: 'nisn' })

      if (error) throw error

      setImportStatus({
        type: 'success',
        text: `Berhasil mengupdate ${payloadList.length} data siswa dan alamat lengkap ke database!`
      })
      setExcelPreviewData([])
      setExcelFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Refresh data luar
      onRefresh?.()
    } catch (err) {
      console.error(err)
      setImportStatus({
        type: 'error',
        text: 'Gagal menyimpan data ke database: ' + err.message
      })
    } finally {
      setIsProcessingExcel(false)
    }
  }

  // -------------------------------------------------------------
  // TAB 3: BULK PRINT & SELECTIONS
  // -------------------------------------------------------------

  const handleSelectAll = (checked) => {
    if (checked) {
      const all = new Set(filteredStudents.map(s => s.nisn))
      setSelectedNisns(all)
    } else {
      setSelectedNisns(new Set())
    }
  }

  const handleToggleSelect = (nisn) => {
    setSelectedNisns(prev => {
      const next = new Set(prev)
      if (next.has(nisn)) {
        next.delete(nisn)
      } else {
        next.add(nisn)
      }
      return next
    })
  }

  const studentsToPrint = useMemo(() => {
    return activeStudents.filter(s => selectedNisns.has(s.nisn))
  }, [activeStudents, selectedNisns])

  const activeMeta = useMemo(() => {
    if (!activeComponentId) return null
    const builtIn = CARD_COMPONENTS_META.find(c => c.id === activeComponentId)
    if (builtIn) return builtIn

    const custom = customComponents.find(c => c.id === activeComponentId)
    if (custom) {
      return {
        id: custom.id,
        side: custom.side || previewSide,
        label: custom.label || (custom.type === 'badge' ? 'Badge Kustom' : 'Teks Bebas'),
        icon: custom.type === 'badge' ? '🏷️' : '✏️',
        isCustom: true,
        customData: custom,
        defaultValues: { x: 0, y: 0, size: 100, rotate: 0 }
      }
    }
    return null
  }, [activeComponentId, customComponents, previewSide])

  // Studio Inspector Content Renderer (digunakan di mode biasa & mode layar penuh)
  const renderStudioInspectorContent = () => {
    const sideComponents = CARD_COMPONENTS_META.filter(c => c.side === previewSide)
    const sideCustomComponents = customComponents.filter(c => (c.side || 'front') === previewSide)

    return (
      <div className="space-y-4 text-left">
        {/* Header Studio Inspector */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center text-sm shadow-2xs">
              🎨
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  Studio Inspector: <span className="text-indigo-600">{activeMeta?.icon} {activeMeta?.label}</span>
                </h4>
              </div>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                Klik & geser langsung di kartu atau sesuaikan posisi & ukuran di bawah
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditorMode(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                isEditorMode 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' 
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
              title="Nyalakan/Matikan mode interaktif drag kursor pada kartu"
            >
              <span>{isEditorMode ? '🎯 Drag Aktif' : 'Pratinjau Biasa'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetActiveComponent}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-2xs"
              title="Kembalikan koordinat, ukuran, dan rotasi komponen ini ke default"
            >
              ↩️ Reset
            </button>
          </div>
        </div>

        {/* Pill Pemilihan Cepat Komponen */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider">
              Komponen Sisi {previewSide === 'front' ? 'Depan' : 'Belakang'}:
            </span>
            <button
              type="button"
              onClick={() => {
                setNewCustomData({
                  type: 'text',
                  text: '',
                  label: '',
                  side: previewSide,
                  color: '#0f172a',
                  bgColor: '#e0e7ff',
                  fontSize: 10,
                  isBold: true,
                  hasBorder: false,
                  borderColor: '#cbd5e1',
                  borderWidth: 1,
                  borderStyle: 'solid'
                })
                setIsAddCustomModalOpen(true)
              }}
              className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>+ Tambah Komponen</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {/* Komponen Bawaan */}
            {sideComponents.map(comp => (
              <button
                key={comp.id}
                type="button"
                onClick={() => setActiveComponentId(comp.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activeComponentId === comp.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-indigo-400'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{comp.icon}</span>
                <span>{comp.label}</span>
              </button>
            ))}

            {/* Komponen Kustom Tambahan */}
            {sideCustomComponents.map(comp => (
              <button
                key={comp.id}
                type="button"
                onClick={() => setActiveComponentId(comp.id)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  activeComponentId === comp.id
                    ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                }`}
              >
                <span>{comp.type === 'badge' ? '🏷️' : '✏️'}</span>
                <span>{comp.label || comp.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Kontrol Komponen Aktif */}
        {activeMeta && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* 1. Posisi Koordinat X & Y */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  📍 Posisi (X & Y)
                </span>
                <span className="text-[11px] font-mono text-indigo-600 font-bold">
                  X: {activeMeta.isCustom ? (activeMeta.customData?.x ?? 0) : (settings[activeMeta.keyX] ?? 0)}px • Y: {activeMeta.isCustom ? (activeMeta.customData?.y ?? 0) : (settings[activeMeta.keyY] ?? 0)}px
                </span>
              </div>

              {/* Tombol Nudge (Geser Presisi) */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-slate-500">Geser Presisi:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => nudgePosition(-5, 0)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
                    title="Geser Kiri 5px"
                  >
                    ⬅️ -5
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgePosition(0, -5)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
                    title="Geser Atas 5px"
                  >
                    ⬆️ -5
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgePosition(0, 5)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
                    title="Geser Bawah 5px"
                  >
                    ⬇️ +5
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgePosition(5, 0)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-[11px] font-bold text-slate-700 border border-slate-200 cursor-pointer shadow-2xs"
                    title="Geser Kanan 5px"
                  >
                    ➡️ +5
                  </button>
                </div>
              </div>

              {/* Sliders X & Y */}
              <div className="space-y-2 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                    <span>Geser Kiri / Kanan (X):</span>
                    <span className="font-mono text-indigo-600 font-bold">
                      {activeMeta.isCustom ? (activeMeta.customData?.x ?? 0) : (settings[activeMeta.keyX] ?? 0)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    step="1"
                    value={activeMeta.isCustom ? (activeMeta.customData?.x ?? 0) : (settings[activeMeta.keyX] ?? 0)}
                    onChange={e => {
                      const val = Number(e.target.value)
                      if (activeMeta.isCustom) {
                        handleUpdateCustomComponentAttr(activeMeta.id, 'x', val)
                      } else {
                        setSettings(prev => ({ ...prev, [activeMeta.keyX]: val }))
                      }
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                    <span>Geser Atas / Bawah (Y):</span>
                    <span className="font-mono text-indigo-600 font-bold">
                      {activeMeta.isCustom ? (activeMeta.customData?.y ?? 0) : (settings[activeMeta.keyY] ?? 0)} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-160"
                    max="160"
                    step="1"
                    value={activeMeta.isCustom ? (activeMeta.customData?.y ?? 0) : (settings[activeMeta.keyY] ?? 0)}
                    onChange={e => {
                      const val = Number(e.target.value)
                      if (activeMeta.isCustom) {
                        handleUpdateCustomComponentAttr(activeMeta.id, 'y', val)
                      } else {
                        setSettings(prev => ({ ...prev, [activeMeta.keyY]: val }))
                      }
                    }}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 2. Ukuran & Rotasi */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
              {/* Kontrol Ukuran / Skala */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                  <span>🔍 Ukuran / Skala:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = activeMeta.isCustom ? (Number(activeMeta.customData?.size) || 100) : (Number(settings[activeMeta.keySize]) || 100)
                        const val = Math.max(30, cur - 5)
                        if (activeMeta.isCustom) {
                          handleUpdateCustomComponentAttr(activeMeta.id, 'size', val)
                        } else if (activeMeta.keySize) {
                          setSettings(prev => ({ ...prev, [activeMeta.keySize]: val }))
                        }
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded text-[10px] font-bold text-slate-700 border border-slate-200 cursor-pointer"
                    >
                      -5%
                    </button>
                    <span className="font-mono text-emerald-600 font-bold">
                      {activeMeta.isCustom ? (activeMeta.customData?.size ?? 100) : (settings[activeMeta.keySize] ?? 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = activeMeta.isCustom ? (Number(activeMeta.customData?.size) || 100) : (Number(settings[activeMeta.keySize]) || 100)
                        const val = Math.min(250, cur + 5)
                        if (activeMeta.isCustom) {
                          handleUpdateCustomComponentAttr(activeMeta.id, 'size', val)
                        } else if (activeMeta.keySize) {
                          setSettings(prev => ({ ...prev, [activeMeta.keySize]: val }))
                        }
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded text-[10px] font-bold text-slate-700 border border-slate-200 cursor-pointer"
                    >
                      +5%
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="40"
                  max="220"
                  step="1"
                  value={activeMeta.isCustom ? (activeMeta.customData?.size ?? 100) : (settings[activeMeta.keySize] ?? 100)}
                  onChange={e => {
                    const val = Number(e.target.value)
                    if (activeMeta.isCustom) {
                      handleUpdateCustomComponentAttr(activeMeta.id, 'size', val)
                    } else if (activeMeta.keySize) {
                      setSettings(prev => ({ ...prev, [activeMeta.keySize]: val }))
                    }
                  }}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              {/* Kontrol Rotasi / Kemiringan */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                  <span>🔄 Kemiringan / Rotasi:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (activeMeta.isCustom) {
                          handleUpdateCustomComponentAttr(activeMeta.id, 'rotate', 0)
                        } else if (activeMeta.keyRotate) {
                          setSettings(prev => ({ ...prev, [activeMeta.keyRotate]: 0 }))
                        }
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded text-[10px] font-bold text-slate-700 border border-slate-200 cursor-pointer"
                      title="Reset Rotasi ke 0°"
                    >
                      0°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = activeMeta.isCustom ? (Number(activeMeta.customData?.rotate) || 0) : (Number(settings[activeMeta.keyRotate]) || 0)
                        const val = cur - 15
                        if (activeMeta.isCustom) {
                          handleUpdateCustomComponentAttr(activeMeta.id, 'rotate', val)
                        } else if (activeMeta.keyRotate) {
                          setSettings(prev => ({ ...prev, [activeMeta.keyRotate]: val }))
                        }
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded text-[10px] font-bold text-slate-700 border border-slate-200 cursor-pointer"
                    >
                      ↺ -15°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = activeMeta.isCustom ? (Number(activeMeta.customData?.rotate) || 0) : (Number(settings[activeMeta.keyRotate]) || 0)
                        const val = cur + 15
                        if (activeMeta.isCustom) {
                          handleUpdateCustomComponentAttr(activeMeta.id, 'rotate', val)
                        } else if (activeMeta.keyRotate) {
                          setSettings(prev => ({ ...prev, [activeMeta.keyRotate]: val }))
                        }
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded text-[10px] font-bold text-slate-700 border border-slate-200 cursor-pointer"
                    >
                      ↻ +15°
                    </button>
                    <span className="font-mono text-amber-600 font-bold ml-1">
                      {activeMeta.isCustom ? (activeMeta.customData?.rotate ?? 0) : (settings[activeMeta.keyRotate] ?? 0)}°
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={activeMeta.isCustom ? (activeMeta.customData?.rotate ?? 0) : (settings[activeMeta.keyRotate] ?? 0)}
                  onChange={e => {
                    const val = Number(e.target.value)
                    if (activeMeta.isCustom) {
                      handleUpdateCustomComponentAttr(activeMeta.id, 'rotate', val)
                    } else if (activeMeta.keyRotate) {
                      setSettings(prev => ({ ...prev, [activeMeta.keyRotate]: val }))
                    }
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* 3. KONTROL KHUSUS BIODATA (LEBAR SECTION, LEBAR LABEL & UKURAN FONT) */}
            {activeMeta.id === 'biodata' && (
              <div className="sm:col-span-2 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
                  <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                    📐 Penyesuaian Lebar Area & Kolom Biodata Siswa
                  </span>
                  <span className="text-[10.5px] text-indigo-700 font-semibold">
                    Mencegah teks Nama & NISN terbungkus / wrap
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Lebar Kolom Label (Nama, NISN, dll) */}
                  <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>Lebar Kolom Label:</span>
                      <span className="font-mono text-indigo-600 font-extrabold">
                        {settings.kartu_biodata_label_width ?? 85} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="140"
                      step="2"
                      value={settings.kartu_biodata_label_width ?? 85}
                      onChange={e => setSettings(prev => ({ ...prev, kartu_biodata_label_width: Number(e.target.value) }))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] text-slate-400">Ringkas (60px)</span>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_label_width: 85 }))}
                        className="text-[9.5px] text-indigo-600 font-bold hover:underline"
                      >
                        Default (85px)
                      </button>
                      <span className="text-[9.5px] text-slate-400">Lebar (140px)</span>
                    </div>
                  </div>

                  {/* Lebar Section Biodata */}
                  <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-2">
                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                      <span>Lebar Blok Biodata:</span>
                      <span className="font-mono text-indigo-600 font-extrabold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {settings.kartu_biodata_width ? `${settings.kartu_biodata_width} px` : 'Penuh (Auto)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="180"
                      max="480"
                      step="5"
                      value={settings.kartu_biodata_width || 340}
                      onChange={e => setSettings(prev => ({ ...prev, kartu_biodata_width: Number(e.target.value) }))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9.5px]">
                      <span className="text-slate-400 font-mono">180px</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_width: 260 }))}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold transition-all ${
                            settings.kartu_biodata_width === 260 ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          260px
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_width: 320 }))}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold transition-all ${
                            settings.kartu_biodata_width === 320 ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          320px
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_width: 380 }))}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold transition-all ${
                            settings.kartu_biodata_width === 380 ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          380px
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_width: 440 }))}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold transition-all ${
                            settings.kartu_biodata_width === 440 ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          440px
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_width: '' }))}
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all ${
                            !settings.kartu_biodata_width ? 'bg-indigo-600 text-white shadow-2xs' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                          }`}
                        >
                          Auto
                        </button>
                      </div>
                      <span className="text-slate-400 font-mono">480px</span>
                    </div>
                  </div>

                  {/* Ukuran Huruf / Font Size Biodata */}
                  <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>Ukuran Huruf Biodata:</span>
                      <span className="font-mono text-indigo-600 font-extrabold">
                        {settings.kartu_biodata_font_size ?? '10.5'} px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="9"
                      max="12.5"
                      step="0.5"
                      value={settings.kartu_biodata_font_size || 10.5}
                      onChange={e => setSettings(prev => ({ ...prev, kartu_biodata_font_size: e.target.value }))}
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] text-slate-400">9px</span>
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, kartu_biodata_font_size: '10.5' }))}
                        className="text-[9.5px] text-indigo-600 font-bold hover:underline"
                      >
                        Default (10.5px)
                      </button>
                      <span className="text-[9.5px] text-slate-400">12.5px</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kontrol Panjang Rentang Barcode Garis */}
            {activeMeta.id === 'barcode' && (
              <div className="sm:col-span-2 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5 text-left">
                <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">📊</span>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">Panjang Rentang Barcode Garis</h4>
                      <p className="text-[10px] text-slate-500">Sesuaikan panjang bentangan barcode lurus ke kanan hingga batas foto siswa</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-black text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                    {settings.kartu_barcode_width || 355} px
                  </span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="range"
                    min="180"
                    max="450"
                    step="5"
                    value={settings.kartu_barcode_width || 355}
                    onChange={e => setSettings(prev => ({ ...prev, kartu_barcode_width: Number(e.target.value) }))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, kartu_barcode_width: 240 }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        Number(settings.kartu_barcode_width) === 240 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Ringkas (240px)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, kartu_barcode_width: 300 }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        Number(settings.kartu_barcode_width) === 300 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Standar (300px)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, kartu_barcode_width: 355 }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        !settings.kartu_barcode_width || Number(settings.kartu_barcode_width) === 355 ? 'bg-indigo-600 text-white shadow-xs' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      ⭐ Sampai Foto Siswa (355px)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, kartu_barcode_width: 410 }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                        Number(settings.kartu_barcode_width) === 410 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      Penuh (410px)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. EDIT TEKS LANGSUNG UNTUK SETIAP KOMPONEN */}
            {activeMeta.textFields && activeMeta.textFields.length > 0 && (
              <div className="sm:col-span-2 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  ✏️ Edit Teks Komponen Ini
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeMeta.textFields.map(tf => (
                    <div key={tf.key} className={tf.isTextarea ? 'sm:col-span-2' : ''}>
                      <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                        {tf.label}:
                      </label>
                      {tf.isTextarea ? (
                        <textarea
                          rows={tf.rows || 3}
                          value={settings[tf.key] ?? ''}
                          onChange={e => setSettings(prev => ({ ...prev, [tf.key]: e.target.value }))}
                          placeholder={tf.placeholder}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 shadow-inner"
                        />
                      ) : (
                        <input
                          type="text"
                          value={settings[tf.key] ?? ''}
                          onChange={e => setSettings(prev => ({ ...prev, [tf.key]: e.target.value }))}
                          placeholder={tf.placeholder}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 shadow-inner"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. KONTROL KHUSUS KOMPONEN KUSTOM */}
            {activeMeta.isCustom && (
              <div className="sm:col-span-2 p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-3">
                <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    ⚙️ Pengaturan Komponen Kustom
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomComponent(activeMeta.id)}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer"
                  >
                    <span>🗑️ Hapus Komponen Ini</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Teks Komponen:
                    </label>
                    <input
                      type="text"
                      value={activeMeta.customData?.text || ''}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'text', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Warna Teks:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={activeMeta.customData?.color || '#0f172a'}
                        onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'color', e.target.value)}
                        className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={activeMeta.customData?.color || '#0f172a'}
                        onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'color', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                      />
                    </div>
                  </div>

                  {activeMeta.customData?.type === 'badge' && (
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                        Warna Background Badge:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={activeMeta.customData?.bgColor || '#e0e7ff'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', e.target.value)}
                          className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={activeMeta.customData?.bgColor || '#e0e7ff'}
                          onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'bgColor', e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-[10.5px] font-bold text-slate-700 block mb-1">
                      Ukuran Huruf ({activeMeta.customData?.fontSize || 10}px):
                    </label>
                    <input
                      type="range"
                      min="7"
                      max="18"
                      step="0.5"
                      value={activeMeta.customData?.fontSize || 10}
                      onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'fontSize', Number(e.target.value))}
                      className="w-full accent-purple-600 cursor-pointer"
                    />
                  </div>

                  {/* Kontrol Garis Pinggir / Border Komponen Kustom */}
                  <div className="sm:col-span-2 pt-2.5 border-t border-purple-200/70">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-[11px] font-bold text-slate-800 block">Garis Pinggir (Border):</span>
                        <span className="text-[9.5px] text-slate-500 block">Beri bingkai garis tepi pada komponen kustom ini</span>
                      </div>
                      <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 border border-slate-300/60">
                        <button
                          type="button"
                          onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'hasBorder', false)}
                          className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                            !activeMeta.customData?.hasBorder 
                              ? 'bg-white text-slate-800 shadow-2xs' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          ✕ Tanpa Garis
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateCustomComponentAttr(activeMeta.id, 'hasBorder', true)}
                          className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                            activeMeta.customData?.hasBorder 
                              ? 'bg-purple-600 text-white shadow-2xs' 
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          ✓ Pakai Garis
                        </button>
                      </div>
                    </div>

                    {Boolean(activeMeta.customData?.hasBorder) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-xl bg-white/80 border border-purple-200/60">
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">
                            Warna Garis:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={activeMeta.customData?.borderColor || '#cbd5e1'}
                              onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderColor', e.target.value)}
                              className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                            />
                            <input
                              type="text"
                              value={activeMeta.customData?.borderColor || '#cbd5e1'}
                              onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderColor', e.target.value)}
                              className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-600 block mb-1">
                            Ketebalan & Bentuk Garis:
                          </label>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={activeMeta.customData?.borderStyle || 'solid'}
                              onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderStyle', e.target.value)}
                              className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
                            >
                              <option value="solid">Lurus (Solid)</option>
                              <option value="dashed">Putus-putus</option>
                              <option value="dotted">Titik</option>
                            </select>
                            <select
                              value={activeMeta.customData?.borderWidth || 1}
                              onChange={e => handleUpdateCustomComponentAttr(activeMeta.id, 'borderWidth', Number(e.target.value))}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
                            >
                              <option value={1}>1px</option>
                              <option value={2}>2px</option>
                              <option value={3}>3px</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tombol Reset Semua Komponen Kartu */}
        <div className="flex justify-end pt-1 border-t border-slate-200">
          <button
            type="button"
            onClick={handleResetAllCardLayout}
            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-1.5 transition-colors"
          >
            <span>⚠️ Reset Seluruh Posisi & Tata Letak Kartu ke Bawaan</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* 1. Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
            <span>🪪</span>
            <span>Modul Kartu Pelajar & Data Identitas Siswa</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Manajemen Kartu Pelajar
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kustomisasi desain kartu, pengesahan TTD & Cap Kepala Sekolah, import alamat lengkap (Excel), dan cetak massal ID card.
          </p>
        </div>

        {/* Global Action buttons & Auto-Save Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Status Indikator Simpan & Toggle Auto-Save */}
          {activeTab === 'desain' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs shadow-xs">
              {/* Tombol Toggle Auto-Save */}
              <button
                type="button"
                onClick={() => setIsAutoSaveEnabled(prev => !prev)}
                className={`flex items-center gap-1.5 font-bold cursor-pointer transition-colors ${
                  isAutoSaveEnabled ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title={isAutoSaveEnabled ? 'Auto-Save aktif (otomatis tersimpan setelah menggeser/mengetik)' : 'Auto-Save mati (simpan manual dengan tombol)'}
              >
                <span className={`w-2 h-2 rounded-full ${isAutoSaveEnabled ? 'bg-indigo-600 animate-pulse' : 'bg-slate-300'}`}></span>
                <span>Auto-Save {isAutoSaveEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <span className="text-slate-300">|</span>

              {/* Status Teks Simpan */}
              {autoSaveStatus === 'saving' ? (
                <span className="text-amber-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                  Menyimpan otomatis...
                </span>
              ) : autoSaveStatus === 'saved' ? (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  ✓ Tersimpan
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-amber-600 font-bold flex items-center gap-1">
                  ⚠️ Belum disimpan
                </span>
              ) : (
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  ✓ Tersimpan
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download Template Excel</span>
          </button>

          {activeTab === 'desain' && (
            <button
              type="button"
              onClick={() => handleSaveSettings(settings, false)}
              disabled={savingSettings}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
                hasUnsavedChanges
                  ? 'bg-amber-500 hover:bg-amber-600 text-white ring-4 ring-amber-200 shadow-amber-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 active:scale-95'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{savingSettings ? 'Menyimpan...' : hasUnsavedChanges ? 'Simpan Sekarang ⚠️' : 'Simpan Pengaturan'}</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('desain')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'desain'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🎨</span>
          <span>Desain & Pengesahan Resmi</span>
          {hasUnsavedChanges && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" title="Ada perubahan belum tersimpan" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('import_excel')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'import_excel'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📥</span>
          <span>Import Alamat & Data Siswa (Excel)</span>
          {excelPreviewData.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('cetak_massal')}
          className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'cetak_massal'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🖨️</span>
          <span>Pratinjau & Cetak Massal</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
            {activeStudents.length} Siswa
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: DESAIN & PENGESAHAN */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'desain' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Kolom Kiri: Form Kustomisasi */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Pilihan Tema Desain - Hanya Tema Resmi Budi Mulia */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  Tema Desain Kartu Pelajar
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kartu pelajar menggunakan standar warna resmi SMP Budi Mulia Jakarta (Merah, Biru & Putih).
                </p>
              </div>

              <div className="p-4 rounded-2xl border-2 border-red-500/80 bg-gradient-to-r from-blue-50/40 via-white to-red-50/40 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#081b3f] via-[#dc2626] to-[#081b3f] border border-slate-200 shrink-0 shadow-sm flex items-center justify-center text-white text-base">
                    🪪
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">Budi Mulia Resmi</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                        Tema Aktif
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Palet CR-80: Merah Marun, Biru Navy & Putih
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <span className="w-4 h-4 rounded-full bg-[#081b3f] border border-white shadow-xs" title="Navy Blue"></span>
                  <span className="w-4 h-4 rounded-full bg-[#dc2626] border border-white shadow-xs" title="Red Accent"></span>
                  <span className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-xs" title="White"></span>
                </div>
              </div>

              {/* Opsi Finishing Kilau Glossy PVC */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">✨</span>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Efek Kilau Glossy PVC (Laminasi)</p>
                    <p className="text-[10px] text-slate-500">Pantulan kilap kaca realistis khas kartu pelajar PVC laminated resmi</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, kartu_glossy_effect: prev.kartu_glossy_effect === false ? true : false }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.kartu_glossy_effect !== false ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      settings.kartu_glossy_effect !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Pengesahan Resmi (TTD, Cap & Logo Sekolah) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Pengesahan Resmi & Identitas Sekolah
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Identitas sekolah, Tanda Tangan, dan Cap Stempel pengesahan resmi ditampilkan pada sisi depan kartu pelajar.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Nama Sekolah</label>
                  <input
                    type="text"
                    value={settings.kartu_nama_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_nama_sekolah: e.target.value })}
                    placeholder="SMP BUDI MULIA"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">NPSN SMP Budi Mulia</label>
                  <input
                    type="text"
                    value={settings.kartu_npsn_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_npsn_sekolah: e.target.value })}
                    placeholder="20100223"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Instansi Pembina (Kop Surat)</label>
                  <input
                    type="text"
                    value={settings.kartu_instansi_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_instansi_sekolah: e.target.value })}
                    placeholder="DINAS PENDIDIKAN PROVINSI DKI JAKARTA"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Status Akreditasi</label>
                  <input
                    type="text"
                    value={settings.kartu_akreditasi || ''}
                    onChange={e => setSettings({ ...settings, kartu_akreditasi: e.target.value })}
                    placeholder="TERAKREDITASI A"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Judul Kartu (Header Depan)</label>
                  <input
                    type="text"
                    value={settings.kartu_judul || ''}
                    onChange={e => setSettings({ ...settings, kartu_judul: e.target.value })}
                    placeholder="KARTU TANDA PELAJAR"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Subjudul Kartu</label>
                  <input
                    type="text"
                    value={settings.kartu_subjudul || ''}
                    onChange={e => setSettings({ ...settings, kartu_subjudul: e.target.value })}
                    placeholder="SEKOLAH MENENGAH PERTAMA"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Masa Berlaku Kartu</label>
                  <input
                    type="text"
                    value={settings.kartu_masa_berlaku || ''}
                    onChange={e => setSettings({ ...settings, kartu_masa_berlaku: e.target.value })}
                    placeholder="AKTIF BELAJAR"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Tanggal Terbit / Pengesahan</label>
                  <input
                    type="text"
                    value={settings.kartu_tanggal_terbit || ''}
                    onChange={e => setSettings({ ...settings, kartu_tanggal_terbit: e.target.value })}
                    placeholder="Jakarta, 1 Juli 2026"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Website Sekolah</label>
                  <input
                    type="text"
                    value={settings.kartu_web_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_web_sekolah: e.target.value })}
                    placeholder="smpbudimuliajakarta.sch.id"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Nama Kepala Sekolah</label>
                  <input
                    type="text"
                    value={settings.kartu_nama_kepsek || ''}
                    onChange={e => setSettings({ ...settings, kartu_nama_kepsek: e.target.value })}
                    placeholder="Nama Kepala Sekolah beserta gelar"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">NIP Kepala Sekolah</label>
                  <input
                    type="text"
                    value={settings.kartu_nip_kepsek || ''}
                    onChange={e => setSettings({ ...settings, kartu_nip_kepsek: e.target.value })}
                    placeholder="19750817 200212 1 003"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Alamat Lengkap Sekolah (Sisi Belakang)</label>
                  <input
                    type="text"
                    value={settings.kartu_alamat_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_alamat_sekolah: e.target.value })}
                    placeholder="Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">Teks Pita Footer Belakang</label>
                  <input
                    type="text"
                    value={settings.kartu_footer_teks || ''}
                    onChange={e => setSettings({ ...settings, kartu_footer_teks: e.target.value })}
                    placeholder="KARTU IDENTITAS RESMI SISWA • SMP BUDI MULIA JAKARTA"
                    className="w-full px-3 py-2 border rounded-xl text-xs font-semibold uppercase"
                  />
                </div>
              </div>

              {/* Upload Asset: Logo Sekolah, TTD & Cap Stempel */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                {/* Upload Logo Sekolah */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Logo Sekolah</span>
                    {settings.kartu_logo_url && settings.kartu_logo_url !== '/logo_budimulia.png' && (
                      <button 
                        type="button" 
                        onClick={() => setSettings(prev => ({ ...prev, kartu_logo_url: '/logo_budimulia.png' }))}
                        className="text-[10px] text-rose-600 hover:underline"
                      >
                        Reset Logo
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">SMP Budi Mulia Resmi</p>

                  <div className="h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1 relative overflow-hidden">
                    <img 
                      src={settings.kartu_logo_url || '/logo_budimulia.png'} 
                      alt="Logo Sekolah" 
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        e.target.onerror = null
                        if (!e.target.src.includes('logo_budimulia.png')) {
                          e.target.src = '/logo_budimulia.png'
                        }
                      }}
                    />
                  </div>

                  <label className="block w-full py-2 px-2 text-center bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer transition-all">
                    <span>Ganti Logo</span>
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp" 
                      className="hidden" 
                      onChange={e => handleUploadAsset('kartu_logo_url', e.target.files?.[0])}
                    />
                  </label>
                </div>

                {/* Upload Tanda Tangan */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Tanda Tangan</span>
                    {settings.kartu_ttd_url && (
                      <button 
                        type="button" 
                        onClick={() => setSettings(prev => ({ ...prev, kartu_ttd_url: '' }))}
                        className="text-[10px] text-rose-600 hover:underline"
                      >
                        Reset Default
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">PNG Transparan</p>

                  <div className="h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1 relative overflow-hidden">
                    {settings.kartu_ttd_url ? (
                      <img src={settings.kartu_ttd_url} alt="Preview TTD" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">TTD Bawaan</span>
                    )}
                  </div>

                  <label className="block w-full py-2 px-2 text-center bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer transition-all">
                    <span>Pilih TTD</span>
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp" 
                      className="hidden" 
                      onChange={e => handleUploadAsset('kartu_ttd_url', e.target.files?.[0])}
                    />
                  </label>
                </div>

                {/* Upload Cap Stempel */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Cap Stempel</span>
                    {settings.kartu_cap_url && (
                      <button 
                        type="button" 
                        onClick={() => setSettings(prev => ({ ...prev, kartu_cap_url: '' }))}
                        className="text-[10px] text-rose-600 hover:underline"
                      >
                        Reset Default
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">Cap Basah Merah</p>

                  <div className="h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1 relative overflow-hidden">
                    {settings.kartu_cap_url ? (
                      <img src={settings.kartu_cap_url} alt="Preview Cap" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Cap Bawaan</span>
                    )}
                  </div>

                  <label className="block w-full py-2 px-2 text-center bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-[11px] font-bold text-slate-700 cursor-pointer transition-all">
                    <span>Pilih Cap</span>
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp" 
                      className="hidden" 
                      onChange={e => handleUploadAsset('kartu_cap_url', e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>

              {/* Visi & Misi Sekolah (Sisi Belakang) */}
              <div className="pt-4 border-t border-slate-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-[#dc2626]">🎯</span>
                      Visi & Misi Sekolah (Sisi Belakang Kartu)
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Teks visi dan misi resmi SMP Budi Mulia yang tercetak di sisi belakang kartu pelajar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetMisiDefault}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      title="Kembalikan ke visi misi standar Budi Mulia"
                    >
                      Reset Visi & Misi
                    </button>
                    <button
                      type="button"
                      onClick={handleAddMisiItem}
                      className="px-3 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span className="text-xs">+</span> Tambah Misi
                    </button>
                  </div>
                </div>

                {/* Input Visi Sekolah */}
                <div className="p-3 rounded-2xl bg-red-50/40 border border-red-200/70 space-y-1.5">
                  <span className="text-[10px] font-extrabold text-[#dc2626] uppercase tracking-wider block">
                    Visi SMP Budi Mulia
                  </span>
                  <textarea
                    rows={2}
                    value={settings.kartu_visi_sekolah || ''}
                    onChange={e => setSettings({ ...settings, kartu_visi_sekolah: e.target.value })}
                    placeholder="Tuliskan visi sekolah..."
                    className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 resize-none leading-relaxed"
                  />
                </div>

                {/* List Butir Misi Sekolah */}
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold text-[#081b3f] uppercase tracking-wider block">
                    Butir Misi Sekolah (Tercetak Bernomor)
                  </span>
                  {misiItems.map((itemText, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-start gap-2 p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 focus-within:border-red-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-red-100 transition-all"
                    >
                      {/* Badge Nomor */}
                      <span className="w-6 h-6 rounded-lg bg-red-50 border border-red-200 text-red-700 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 select-none">
                        {idx + 1}
                      </span>

                      {/* Input Teks Misi */}
                      <textarea
                        rows={2}
                        value={itemText}
                        onChange={e => handleUpdateMisiItem(idx, e.target.value)}
                        placeholder={`Isi misi nomor ${idx + 1}...`}
                        className="flex-1 bg-transparent border-none text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none resize-none leading-relaxed py-0.5"
                      />

                      {/* Tombol Aksi */}
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveMisiItem(idx, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-25 disabled:hover:text-slate-400 hover:bg-slate-200/70 text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                          title="Pindah ke atas"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === misiItems.length - 1}
                          onClick={() => handleMoveMisiItem(idx, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-25 disabled:hover:text-slate-400 hover:bg-slate-200/70 text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                          title="Pindah ke bawah"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMisiItem(idx)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors cursor-pointer"
                          title="Hapus butir misi ini"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Teks Belakang Kartu: Ketentuan Pemegang Kartu Per Nomor */}
              <div className="pt-4 border-t border-slate-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <span className="text-[#dc2626]">ℹ️</span>
                      Ketentuan Pemegang Kartu (Sisi Belakang)
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Kelola butir ketentuan bernomor yang tercetak di sisi belakang kartu pelajar.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetKetentuanDefault}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      title="Kembalikan ke ketentuan standar"
                    >
                      Reset Default
                    </button>
                    <button
                      type="button"
                      onClick={handleAddKetentuanItem}
                      className="px-3 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <span className="text-xs">+</span> Tambah Ketentuan
                    </button>
                  </div>
                </div>

                {/* List Butir Ketentuan Bernomor */}
                <div className="space-y-2">
                  {ketentuanItems.map((itemText, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-start gap-2 p-2.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition-all"
                    >
                      {/* Badge Nomor */}
                      <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 select-none">
                        {idx + 1}
                      </span>

                      {/* Input Teks Ketentuan */}
                      <textarea
                        rows={2}
                        value={itemText}
                        onChange={e => handleUpdateKetentuanItem(idx, e.target.value)}
                        placeholder={`Isi ketentuan nomor ${idx + 1}...`}
                        className="flex-1 bg-transparent border-none text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none resize-none leading-relaxed py-0.5"
                      />

                      {/* Tombol Aksi (Geser Urutan & Hapus) */}
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {/* Naikkan Urutan */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveKetentuanItem(idx, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-25 disabled:hover:text-slate-400 hover:bg-slate-200/70 text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                          title="Pindah ke atas"
                        >
                          ▲
                        </button>

                        {/* Turunkan Urutan */}
                        <button
                          type="button"
                          disabled={idx === ketentuanItems.length - 1}
                          onClick={() => handleMoveKetentuanItem(idx, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-25 disabled:hover:text-slate-400 hover:bg-slate-200/70 text-[10px] transition-colors cursor-pointer disabled:cursor-not-allowed"
                          title="Pindah ke bawah"
                        >
                          ▼
                        </button>

                        {/* Hapus Item */}
                        <button
                          type="button"
                          onClick={() => handleDeleteKetentuanItem(idx)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs transition-colors cursor-pointer"
                          title="Hapus ketentuan nomor ini"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-slate-400">
                    Total <b>{ketentuanItems.length}</b> butir ketentuan tercetak pada kartu.
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewSide('back')}
                    className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Lihat Pratinjau Sisi Belakang ➔
                  </button>
                </div>
              </div>
            </div>



          </div>

          {/* Kolom Kanan: Live Interactive Preview & Studio Inspector */}
          <div className="lg:col-span-6 sticky top-6 space-y-4">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col items-center justify-center text-center">
                  
                  {/* Top Header Live Preview */}
                  <div className="w-full flex items-center justify-between mb-4">
                    <div className="text-left">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">LIVE PREVIEW KARTU</h4>
                      <p className="text-[11px] text-slate-500">Ukuran Standar ID Card CR-80</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Tombol Edit Fullscreen */}
                      <button
                        type="button"
                        onClick={() => setIsFullscreen(true)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Buka Editor Kartu dalam Mode Layar Penuh (Fullscreen Canvas)"
                      >
                        <span>⛶ Layar Penuh</span>
                      </button>

                      {/* Switch Sisi Depan / Belakang */}
                      <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setPreviewSide('front')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            previewSide === 'front' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Depan
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewSide('back')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            previewSide === 'back' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Belakang
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Selector Sample Siswa untuk Preview */}
                  <div className="w-full mb-6">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 text-left">
                      Pratinjau dengan Data Siswa:
                    </label>
                    <select
                      value={selectedStudentForPreview?.nisn || ''}
                      onChange={e => {
                        const s = activeStudents.find(x => x.nisn === e.target.value)
                        if (s) setSelectedStudentForPreview(s)
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none focus:border-indigo-500"
                    >
                      {activeStudents.map(s => (
                        <option key={s.nisn} value={s.nisn}>
                          {s.nama_lengkap || s.nama} (Kelas {s.kelas || '-'} • NISN: {s.nisn})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Display Card Preview */}
                  <div className="overflow-x-auto max-w-full p-2 flex justify-center py-2 text-left w-full">
                    <div className="flex items-center justify-center p-3 rounded-2xl bg-slate-100/70 border border-slate-200/80 shadow-inner text-left">
                      <div style={{ transform: 'scale(0.9)', transformOrigin: 'top center', width: '510px', height: '290px' }}>
                        <KartuPelajarCard
                          student={selectedStudentForPreview}
                          photoUrl={selectedStudentForPreview ? fotoMap.get(selectedStudentForPreview.nisn) : null}
                          settings={settings}
                          side={previewSide}
                          scale={1}
                          isEditorMode={isEditorMode}
                          activeComponent={activeComponentId}
                          onSelectComponent={(id) => setActiveComponentId(id)}
                          onStartDrag={handleStartDrag}
                        />
                      </div>
                    </div>
                  </div>

                  {/* STUDIO INSPECTOR TOOLBAR (VISUAL DRAG, RESIZE, ROTATE & TEXT EDIT) */}
                  <div className="mt-4 p-4.5 rounded-3xl bg-slate-50 border border-slate-200 shadow-2xs space-y-4 text-left w-full">
                    {renderStudioInspectorContent()}
                  </div>

                  {/* Tombol Unduh Uji Coba Pratinjau (PNG 300 DPI & PDF CR80) */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleDownloadPreviewImage}
                      disabled={isExportingPreview}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 active:scale-95 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
                      title="Unduh gambar PNG sisi yang sedang aktif dengan resolusi cetak 300 DPI"
                    >
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{isExportingPreview ? 'Memproses...' : `Unduh PNG (${previewSide === 'front' ? 'Depan' : 'Belakang'})`}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPreviewPdf}
                      disabled={isExportingPreview}
                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Unduh PDF Resmi 2 Halaman CR-80 (Depan & Belakang)"
                    >
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{isExportingPreview ? 'Membuat PDF...' : 'Unduh PDF (Depan-Belakang)'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-2 text-center">
                    *Pratinjau langsung mengikuti koordinat, perbesaran, rotasi, teks, dan foto siswa aktual.
                  </p>
                </div>
              </div>
            </div>
          )}

      {/* ========================================================================= */}
      {/* MODAL FULLSCREEN STUDIO EDITOR (PORTAL KE DOCUMENT.BODY) */}
      {/* ========================================================================= */}
      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] w-screen h-screen bg-slate-950/75 backdrop-blur-md flex flex-col overflow-hidden select-none animate-fade-in">
          {/* Top Bar Fullscreen */}
          <div className="h-16 px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between shadow-xs shrink-0 z-10">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-black text-base border border-indigo-100">
                🪪
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Studio Kartu Pelajar — Mode Layar Penuh
                </h3>
                <p className="text-[11px] text-slate-500">
                  Drag & drop langsung pada kartu, geser koordinat, atau sesuaikan ukuran & teks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Switch Sisi */}
              <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPreviewSide('front')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    previewSide === 'front' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Depan
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSide('back')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    previewSide === 'back' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Belakang
                </button>
              </div>

              {/* Sample Siswa Dropdown */}
              <select
                value={selectedStudentForPreview?.nisn || ''}
                onChange={e => {
                  const s = activeStudents.find(x => x.nisn === e.target.value)
                  if (s) setSelectedStudentForPreview(s)
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none"
              >
                {activeStudents.map(s => (
                  <option key={s.nisn} value={s.nisn}>
                    {s.nama_lengkap || s.nama} (Kelas {s.kelas || '-'})
                  </option>
                ))}
              </select>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(z => Math.max(0.6, Number((z - 0.1).toFixed(1))))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded cursor-pointer"
                  title="Perkecil Zoom"
                >
                  -
                </button>
                <span className="text-[11px] font-mono font-bold text-slate-700 px-1">
                  {Math.round(fullscreenZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(1))))}
                  className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded cursor-pointer"
                  title="Perbesar Zoom"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreenZoom(1.0)}
                  className="text-[10px] text-slate-500 hover:text-slate-900 px-1.5 cursor-pointer font-semibold"
                  title="Kembalikan Zoom 100%"
                >
                  100%
                </button>
              </div>

              {/* Tombol Tutup Fullscreen */}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>✕ Keluar Layar Penuh (Esc)</span>
              </button>
            </div>
          </div>

          {/* Workspace: Center Large Canvas (Centered without scrolling!) + Right Inspector Sidebar */}
          <div className="flex-1 flex overflow-hidden min-h-0 w-full">
            {/* Center Canvas */}
            <div className="flex-1 h-full overflow-hidden bg-slate-900/30 p-6 flex flex-col items-center justify-center relative">
              <div 
                style={{ 
                  width: '510px', 
                  height: '322px', 
                  transform: `scale(${fullscreenZoom})`, 
                  transformOrigin: 'center center' 
                }} 
                className="shadow-2xl rounded-2xl shrink-0 transition-transform duration-75 select-none"
              >
                <KartuPelajarCard
                  student={selectedStudentForPreview}
                  photoUrl={selectedStudentForPreview ? fotoMap.get(selectedStudentForPreview.nisn) : null}
                  settings={settings}
                  side={previewSide}
                  scale={1}
                  isEditorMode={isEditorMode}
                  activeComponent={activeComponentId}
                  onSelectComponent={(id) => setActiveComponentId(id)}
                  onStartDrag={handleStartDrag}
                />
              </div>
            </div>

            {/* Right Inspector Sidebar */}
            <div className="w-[420px] max-w-[45vw] h-full border-l border-slate-200/80 bg-white p-5 overflow-y-auto shrink-0 shadow-2xl">
              {renderStudioInspectorContent()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL TAMBAH KOMPONEN KUSTOM BARU (PORTAL KE DOCUMENT.BODY) */}
      {/* ========================================================================= */}
      {isAddCustomModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-scale-in text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  ✨
                </span>
                <h3 className="text-sm font-black text-slate-900">Tambah Komponen Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCustomModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Tipe Komponen */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tipe Komponen:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, type: 'text' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      newCustomData.type === 'text'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">✏️</span>
                    <span>Teks Bebas / Catatan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, type: 'badge' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      newCustomData.type === 'badge'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">🏷️</span>
                    <span>Badge Kapsul</span>
                  </button>
                </div>
              </div>

              {/* Sisi Kartu */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Sisi Kartu:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, side: 'front' }))}
                    className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      newCustomData.side === 'front'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Sisi Depan
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCustomData(prev => ({ ...prev, side: 'back' }))}
                    className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      newCustomData.side === 'back'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Sisi Belakang
                  </button>
                </div>
              </div>

              {/* Isi Teks */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Teks Komponen:
                </label>
                <input
                  type="text"
                  value={newCustomData.text}
                  onChange={e => setNewCustomData(prev => ({ ...prev, text: e.target.value }))}
                  placeholder={newCustomData.type === 'badge' ? 'Contoh: OSIS 2026' : 'Contoh: STATUS: AKTIF'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Label Pengenal */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Label Komponen (di Inspector):
                </label>
                <input
                  type="text"
                  value={newCustomData.label}
                  onChange={e => setNewCustomData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Contoh: Label Status / Badge OSIS"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Fitur Garis Pinggir / Border */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Garis Pinggir (Border)</span>
                    <span className="text-[10.5px] text-slate-500 block">Beri bingkai garis tepi pada komponen</span>
                  </div>
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-200/80 border border-slate-300/60">
                    <button
                      type="button"
                      onClick={() => setNewCustomData(prev => ({ ...prev, hasBorder: false }))}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        !newCustomData.hasBorder 
                          ? 'bg-white text-slate-800 shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✕ Tanpa Garis
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCustomData(prev => ({ ...prev, hasBorder: true }))}
                      className={`px-2.5 py-1 text-[10.5px] font-bold rounded-md transition-all cursor-pointer ${
                        newCustomData.hasBorder 
                          ? 'bg-indigo-600 text-white shadow-2xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ✓ Pakai Garis
                    </button>
                  </div>
                </div>

                {newCustomData.hasBorder && (
                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 animate-fade-in">
                    <div>
                      <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                        Warna Garis:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={newCustomData.borderColor || '#cbd5e1'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                        />
                        <input
                          type="text"
                          value={newCustomData.borderColor || '#cbd5e1'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderColor: e.target.value }))}
                          className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                        Tipe & Tebal Garis:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={newCustomData.borderStyle || 'solid'}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderStyle: e.target.value }))}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                        >
                          <option value="solid">Lurus (Solid)</option>
                          <option value="dashed">Putus-putus</option>
                          <option value="dotted">Titik</option>
                        </select>
                        <select
                          value={newCustomData.borderWidth || 1}
                          onChange={e => setNewCustomData(prev => ({ ...prev, borderWidth: Number(e.target.value) }))}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700"
                        >
                          <option value={1}>1px</option>
                          <option value={2}>2px</option>
                          <option value={3}>3px</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddCustomModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newCustomData.text.trim()) {
                    alert('Silakan masukkan teks komponen terlebih dahulu.')
                    return
                  }
                  handleAddCustomComponent(newCustomData)
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Tambahkan ke Kartu
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hidden high-res DOM elements for full PDF/PNG capture of Tab 1 Preview */}
      <div className="fixed -left-[9999px] -top-[9999px] pointer-events-none">
        <KartuPelajarCard
          ref={previewFrontRef}
          student={selectedStudentForPreview}
          photoUrl={selectedStudentForPreview ? fotoMap.get(selectedStudentForPreview.nisn) : null}
          settings={settings}
          side="front"
          scale={1}
        />
        <KartuPelajarCard
          ref={previewBackRef}
          student={selectedStudentForPreview}
          photoUrl={selectedStudentForPreview ? fotoMap.get(selectedStudentForPreview.nisn) : null}
          settings={settings}
          side="back"
          scale={1}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: IMPORT ALAMAT & BIODATA SISWA (EXCEL) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'import_excel' && (
        <div className="space-y-6">
          
          {/* Petunjuk & Upload Card */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Import Data Alamat & Biodata Siswa via Excel
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Unggah file Excel yang berisi kolom Alamat, Kelurahan, Kecamatan, Kota, Tempat & Tanggal Lahir, serta Kontak Siswa/Orang Tua. Sistem otomatis mencocokkan data berdasarkan NISN.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2 shrink-0 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Format Template (.xlsx)
              </button>
            </div>

            {/* Banner Sinkronisasi dengan Manajemen Akun */}
            <div className="bg-indigo-50/80 border border-indigo-200/90 rounded-2xl p-4 flex items-start gap-3.5">
              <div className="text-2xl shrink-0 mt-0.5">🔄</div>
              <div className="text-xs text-indigo-950 leading-relaxed">
                <span className="font-black text-indigo-900 block mb-0.5">100% Tersinkronisasi dengan Master Data Manajemen Akun</span>
                Seluruh data yang Anda impor di sini (Alamat, Kelurahan, Kecamatan, Kota, TTL, dan Kontak Orang Tua Ayah/Ibu/Wali) disimpan langsung ke database master siswa (<span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded text-indigo-700">siswa_permanent</span>). Anda juga dapat mengunduh template dan mengimpor file yang sama kapan saja langsung dari menu <strong>Manajemen Akun</strong> (Opsi Massal &rarr; Download Template / Import Excel).
              </div>
            </div>

            {/* Drag & Drop File Upload Box */}
            <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-3xl p-8 text-center bg-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl shadow-sm">
                  📊
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  {excelFile ? excelFile.name : 'Pilih atau Tarik File Excel ke Sini'}
                </h4>
                <p className="text-xs text-slate-500">
                  Mendukung format .xlsx, .xls, atau .csv (Sesuai kolom Alamat, Kelurahan, Kecamatan, Kota)
                </p>
                {excelFile && (
                  <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-extrabold">
                    File Terpilih: {excelFile.name} ({(excelFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
            </div>

            {/* Import Status Alert */}
            {importStatus && (
              <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 ${
                importStatus.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : importStatus.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
              }`}>
                <span>{importStatus.text}</span>
              </div>
            )}
          </div>

          {/* Preview Tabel Hasil Baca Excel */}
          {excelPreviewData.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-slate-800">
                    Pratinjau Data yang Akan Diperbarui ({excelPreviewData.length} Siswa)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Pastikan kolom Alamat dan identitas sudah sesuai sebelum disimpan ke database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExcelPreviewData([])
                      setExcelFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Batalkan
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveImportedData}
                    disabled={isProcessingExcel}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>{isProcessingExcel ? 'Menyimpan...' : 'Simpan ke Database'}</span>
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-[420px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3">NISN</th>
                      <th className="p-3">Nama Lengkap</th>
                      <th className="p-3 text-center">L/P</th>
                      <th className="p-3">Tempat, Tgl Lahir</th>
                      <th className="p-3">Alamat Lengkap Terangkai</th>
                      <th className="p-3">No HP Siswa</th>
                      <th className="p-3">Nama / No HP Ortu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelPreviewData.map((row, idx) => {
                      const alamatFull = [row.alamat, row.kelurahan && `Kel. ${row.kelurahan}`, row.kecamatan && `Kec. ${row.kecamatan}`, row.kota].filter(Boolean).join(', ')
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-indigo-700">{row.nisn}</td>
                          <td className="p-3 font-semibold text-slate-800">{row.nama || '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              row.jenis_kelamin === 'L' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              row.jenis_kelamin === 'P' ? 'bg-pink-50 text-pink-700 border border-pink-200' :
                              'text-slate-400'
                            }`}>
                              {row.jenis_kelamin ? (row.jenis_kelamin === 'L' ? 'L' : row.jenis_kelamin === 'P' ? 'P' : row.jenis_kelamin) : '-'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{row.tempat_lahir || '-'}{row.tanggal_lahir ? `, ${row.tanggal_lahir}` : ''}</td>
                          <td className="p-3 text-slate-700 max-w-xs truncate" title={alamatFull}>{alamatFull || '-'}</td>
                          <td className="p-3 font-mono text-slate-600">{row.no_hp || '-'}</td>
                          <td className="p-3 text-slate-600">
                            {row.nama_ayah || row.nama_ibu || '-'}{row.no_hp_ayah || row.no_hp_ibu ? ` (${row.no_hp_ayah || row.no_hp_ibu})` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: PRATINJAU SISWA & CETAK MASSAL */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'cetak_massal' && (
        <div className="space-y-6">
          
          {/* Filter Bar */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Kelas */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kelas</label>
                <select
                  value={filterKelas}
                  onChange={e => setFilterKelas(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">Semua Kelas ({activeStudents.length})</option>
                  {availableClasses.map(k => (
                    <option key={k} value={k}>
                      Kelas {k} ({activeStudents.filter(s => s.kelas === k).length})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Bar */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cari Siswa</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Nama atau NISN..."
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 w-48 sm:w-60"
                />
              </div>
            </div>

            {/* Bulk Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectAll(selectedNisns.size < filteredStudents.length)}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all"
              >
                {selectedNisns.size === filteredStudents.length && filteredStudents.length > 0
                  ? 'Batal Pilih Semua'
                  : `Pilih Semua (${filteredStudents.length})`}
              </button>

              <button
                type="button"
                disabled={selectedNisns.size === 0}
                onClick={() => setShowBulkPrintModal(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Cetak Massal ({selectedNisns.size})</span>
              </button>
            </div>
          </div>

          {/* Daftar Siswa Grid */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-600">
                Menampilkan {filteredStudents.length} siswa aktif • {selectedNisns.size} terpilih
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredStudents.map(student => {
                const isSelected = selectedNisns.has(student.nisn)
                const photo = fotoMap.get(student.nisn)
                const alamatFormatted = formatAlamatLengkap(student)

                return (
                  <div
                    key={student.nisn}
                    onClick={() => handleToggleSelect(student.nisn)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-200 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by div
                        className="mt-1 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                      />

                      {/* Avatar */}
                      <div className="w-12 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                        {photo ? (
                          <img src={photo} alt={student.nama_lengkap} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-sm">
                            {(student.nama_lengkap || 'S').charAt(0)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-extrabold text-[9px]">
                            {student.kelas || '-'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">NISN: {student.nisn}</span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 truncate mt-0.5">
                          {student.nama_lengkap || student.nama}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5" title={alamatFormatted}>
                          📍 {alamatFormatted}
                        </p>
                      </div>
                    </div>

                    {/* Quick Single Card Preview Button */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-[10px] font-medium text-slate-400">
                        {student.tempat_lahir || '-'}{student.tanggal_lahir ? `, ${student.tanggal_lahir}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedStudentForPreview(student)
                          setActiveTab('desain')
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-bold text-[11px] hover:underline"
                      >
                        Lihat Desain
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {filteredStudents.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">
                Tidak ada siswa yang cocok dengan filter.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL CETAK MASSAL (BULK PRINT MODAL) */}
      {/* ------------------------------------------------------------- */}
      {showBulkPrintModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999999] w-screen h-screen bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-scale-in">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Cetak Massal Kartu Pelajar ({studentsToPrint.length} Siswa)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Format tata letak lembar cetak ID Card standar siap potong.
                </p>
              </div>

              {/* Mode Seleksi Sisi Kartu */}
              <div className="flex items-center gap-3">
                <div className="inline-flex p-1 rounded-xl bg-slate-200">
                  <button
                    type="button"
                    onClick={() => setBulkPrintMode('front')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      bulkPrintMode === 'front' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Depan Saja
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkPrintMode('back')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      bulkPrintMode === 'back' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Belakang Saja
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkPrintMode('both')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      bulkPrintMode === 'both' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Depan & Belakang
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBulkPrintModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Status Progress Pembuatan Bulk PDF */}
            {isGeneratingBulkPdf && (
              <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between text-xs font-bold text-indigo-800 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Sedang membuat file PDF resolusi tinggi... {bulkPdfProgress ? `(${bulkPdfProgress.current} dari ${bulkPdfProgress.total} sisi kartu)` : ''}</span>
                </div>
                <span className="text-[11px] text-indigo-600">Mohon jangan tutup modal</span>
              </div>
            )}

            {/* Modal Body: Scrollable Preview of all Cards */}
            <div id="printable-bulk-cards" className="p-6 overflow-y-auto flex-1 bg-slate-100 flex flex-wrap gap-6 justify-center">
              {studentsToPrint.map(student => {
                const photo = fotoMap.get(student.nisn)
                return (
                  <div key={student.nisn} className="print-student-group flex flex-wrap gap-4 items-center justify-center p-2 bg-white rounded-2xl shadow-sm border border-slate-200">
                    {(bulkPrintMode === 'front' || bulkPrintMode === 'both') && (
                      <div style={{ width: '420px', height: '264px' }}>
                        <KartuPelajarCard
                          student={student}
                          photoUrl={photo}
                          settings={settings}
                          side="front"
                          scale={420 / 510}
                        />
                      </div>
                    )}
                    {(bulkPrintMode === 'back' || bulkPrintMode === 'both') && (
                      <div style={{ width: '420px', height: '264px' }}>
                        <KartuPelajarCard
                          student={student}
                          photoUrl={photo}
                          settings={settings}
                          side="back"
                          scale={420 / 510}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
              <span className="text-xs font-semibold text-slate-500">
                Total {studentsToPrint.length} kartu ({bulkPrintMode === 'both' ? studentsToPrint.length * 2 : studentsToPrint.length} sisi) siap diproses.
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkPrintModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBulkPdf}
                  disabled={isGeneratingBulkPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  title="Unduh satu file PDF resmi yang memuat semua kartu pelajar CR80"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{isGeneratingBulkPdf ? 'Membuat PDF...' : 'Unduh Dokumen PDF (Semua Kartu)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Cetak Langsung (Print)</span>
                </button>
              </div>
            </div>

            {/* Print Media Styling Khusus Cetak Massal */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-bulk-cards, #printable-bulk-cards * {
                  visibility: visible !important;
                }
                #printable-bulk-cards {
                  position: fixed !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  margin: 0 !important;
                  padding: 8mm !important;
                  background: white !important;
                  display: flex !important;
                  flex-wrap: wrap !important;
                  gap: 8mm !important;
                  justify-content: center !important;
                  z-index: 9999999 !important;
                  overflow: visible !important;
                }
                .print-student-group {
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: transparent !important;
                  padding: 0 !important;
                }
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  color-adjust: exact !important;
                }
                .glossy-overlay, [data-html2canvas-ignore="true"] {
                  display: none !important;
                }
              }
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
            `}</style>

          </div>
        </div>,
        document.body
      )}

      {/* FLOATING ACTION BAR: Peringatan jika ada perubahan yang belum disimpan (saat Auto-Save OFF) */}
      {hasUnsavedChanges && !isAutoSaveEnabled && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92%] sm:w-auto bg-slate-900/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-amber-500/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>⚠️</span> Ada perubahan pengaturan kartu yang belum disimpan!
              </p>
              <p className="text-[10px] text-slate-400">
                Klik simpan sekarang agar perubahan tidak hilang saat Anda menutup halaman.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSettings({ ...savedSettingsSnapshot })}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              Batalkan
            </button>
            <button
              type="button"
              onClick={() => handleSaveSettings(settings, false)}
              disabled={savingSettings}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-xs font-bold text-white shadow-md shadow-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>💾</span>
              <span>{savingSettings ? 'Menyimpan...' : 'Simpan Sekarang'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TOAST STATUS AUTO-SAVE DI POJOK BAWAH */}
      {autoSaveStatus && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-2.5 text-xs font-medium pointer-events-none">
          {autoSaveStatus === 'saving' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span className="text-amber-200 font-bold">⚡ Menyimpan perubahan otomatis...</span>
            </>
          ) : (
            <>
              <span className="text-emerald-400 font-bold text-sm">✓</span>
              <span className="text-emerald-200 font-semibold">Semua perubahan otomatis tersimpan</span>
            </>
          )}
        </div>
      )}

    </div>
  )
}
