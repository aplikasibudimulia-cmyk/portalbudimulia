import React, { forwardRef, useState, useEffect, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'

// Tema warna resmi kartu pelajar SMP Budi Mulia (Merah, Biru, Putih)
export const CARD_THEMES = {
  budi_mulia_resmi: {
    id: 'budi_mulia_resmi',
    name: 'Budi Mulia Resmi (Merah, Biru & Putih)',
    isLight: true,
    bannerNavy: 'from-[#081b3f] via-[#0f2e66] to-[#091d44]',
    accentColor: 'from-[#ef4444] via-[#dc2626] to-[#b91c1c]',
    accentHex1: '#ef4444',
    accentHex2: '#dc2626',
    navyHex1: '#081b3f',
    navyHex2: '#0f2e66',
    bgTint: 'bg-white',
    watermarkColor: '#0f2e66',
    primaryText: 'text-slate-900',
    labelText: 'text-slate-500',
    iconBg: 'bg-red-50 text-red-600',
    badgeBg: 'bg-[#dc2626] text-white',
    stampColor: '#dc2626',
    ribbonGradient: 'from-[#081b3f] via-[#dc2626] to-[#081b3f]'
  }
}

// Selalu gunakan tema Budi Mulia Resmi
export const getCardTheme = (_themeId) => {
  return CARD_THEMES.budi_mulia_resmi
}

// Format tanggal bahasa Indonesia
export const formatIndonesianDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Format alamat lengkap
export const formatAlamatLengkap = (student) => {
  if (!student) return '-'
  const parts = []
  const rtRwPattern = /(?:(?:RT[\/\.]?RW|RT)[\s\.:]*\d+\s*[\/\-]\s*(?:RW[\s\.:]*)?\d+|\bRT[\s\.:]*\d+|\bRW[\s\.:]*\d+)/i

  if (student.alamat && student.alamat.trim() && student.alamat !== '-') {
    let cleanAlamat = student.alamat.trim()
    // Standarisasi penulisan RT/RW (misal: "RT/RW 2/1", "RT 02/RW 01", "2/1") menjadi "RT. 002/RW. 001"
    cleanAlamat = cleanAlamat.replace(/(?:RT[\/\.]?RW|RT)[\s\.:]*(\d+)\s*[\/\-]\s*(?:RW[\s\.:]*)?(\d+)/gi, (m, rt, rw) => {
      return `RT. ${rt.padStart(3, '0')}/RW. ${rw.padStart(3, '0')}`
    })
    parts.push(cleanAlamat)
  }
  // Tampilkan RT/RW jika ada properti terpisah dan belum termuat di student.alamat
  if (student.rt_rw && String(student.rt_rw).trim() && student.rt_rw !== '-') {
    const rawRt = String(student.rt_rw).trim()
    if (!rtRwPattern.test(student.alamat || '')) {
      const match = rawRt.match(/(?:(?:RT[\/\.]?RW|RT)[\s\.:]*)?(\d+)\s*[\/\-]\s*(?:RW[\s\.:]*)?(\d+)/i)
      if (match) {
        parts.push(`RT. ${match[1].padStart(3, '0')}/RW. ${match[2].padStart(3, '0')}`)
      } else {
        parts.push(rawRt.toLowerCase().startsWith('rt') ? rawRt : `RT. ${rawRt}`)
      }
    }
  }
  if (student.kelurahan && student.kelurahan.trim() && student.kelurahan !== '-') {
    parts.push(`Kel. ${student.kelurahan.trim()}`)
  }
  if (student.kecamatan && student.kecamatan.trim() && student.kecamatan !== '-') {
    parts.push(`Kec. ${student.kecamatan.trim()}`)
  }
  if (student.kota && student.kota.trim() && student.kota !== '-') {
    parts.push(student.kota.trim())
  }

  if (parts.length === 0) {
    const raw = student.alamat_lengkap || student.alamat
    return (raw && typeof raw === 'string' && raw.trim() && raw !== '-') ? raw.trim() : '-'
  }
  return parts.join(', ')
}

// Helper untuk parsing dan serialisasi daftar ketentuan pemegang kartu per nomor
export const parseKetentuanList = (rawTeks, defaultNamaSekolah = 'SMP BUDI MULIA') => {
  const defaultList = [
    `Kartu ini adalah bukti identitas sah siswa ${defaultNamaSekolah}.`,
    'Wajib dibawa setiap hari saat mengikuti kegiatan belajar mengajar.',
    'Tidak dapat dipindahtangankan kepada orang lain.',
    'Jika kartu ini hilang atau rusak, harap segera lapor ke pihak Tata Usaha sekolah.',
    'Yang menemukan kartu ini mohon mengembalikan ke alamat sekolah.'
  ]
  if (!rawTeks || typeof rawTeks !== 'string' || !rawTeks.trim()) {
    return defaultList
  }
  const lines = rawTeks.split('\n')
  if (lines.length === 0) {
    return defaultList
  }
  return lines.map(line => line.replace(/^(\(?\d+[\.\)\-]\s*|\-\s*)/, ''))
}

export const serializeKetentuanList = (items) => {
  return items.map((t, idx) => `${idx + 1}. ${t}`).join('\n')
}

// Helper untuk parsing dan serialisasi daftar misi sekolah
export const parseMisiList = (rawTeks) => {
  const defaultList = [
    'Menanamkan nilai keimanan, ketakwaan, dan budi pekerti luhur.',
    'Menyelenggarakan proses pembelajaran aktif, kreatif, dan berbasis teknologi.',
    'Mengembangkan potensi akademik dan non-akademik murid.',
    'Membangun karakter disiplin, kepedulian sosial, dan kelestarian lingkungan.'
  ]
  if (!rawTeks || typeof rawTeks !== 'string' || !rawTeks.trim()) {
    return defaultList
  }
  const lines = rawTeks.split('\n')
  if (lines.length === 0) {
    return defaultList
  }
  return lines.map(line => line.replace(/^(\(?\d+[\.\)\-]\s*|\-\s*)/, ''))
}

export const serializeMisiList = (items) => {
  return items.map((t, idx) => `${idx + 1}. ${t}`).join('\n')
}

// Komponen Cap Stempel Default (SVG) - Stempel Basah Merah Budi Mulia
const DefaultSchoolStamp = ({ namaSekolah = 'SMP BUDI MULIA', strokeColor = '#dc2626' }) => {
  const stampId = useMemo(() => Math.random().toString(36).substring(2, 9), [])
  const topPathId = `circlePathTop_${stampId}`
  const bottomPathId = `circlePathBottom_${stampId}`
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full select-none pointer-events-none">
      <defs>
        <path id={topPathId} d="M 20 60 A 40 40 0 0 1 100 60" fill="none" />
        <path id={bottomPathId} d="M 100 60 A 40 40 0 0 1 20 60" fill="none" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeDasharray="4 2" />
      <circle cx="60" cy="60" r="52" fill="none" stroke={strokeColor} strokeWidth="2" />
      <circle cx="60" cy="60" r="34" fill="none" stroke={strokeColor} strokeWidth="1.5" />
      <path d="M 16 60 L 22 57 L 22 63 Z" fill={strokeColor} />
      <path d="M 104 60 L 98 57 L 98 63 Z" fill={strokeColor} />
      <text fill={strokeColor} fontSize="8.5" fontWeight="900" letterSpacing="1.2">
        <textPath href={`#${topPathId}`} startOffset="50%" textAnchor="middle">
          {namaSekolah.toUpperCase()}
        </textPath>
      </text>
      <text fill={strokeColor} fontSize="7" fontWeight="800" letterSpacing="1">
        <textPath href={`#${bottomPathId}`} startOffset="50%" textAnchor="middle">
          ★ TERAKREDITASI ★
        </textPath>
      </text>
      <text x="60" y="58" fill={strokeColor} fontSize="9.5" fontWeight="900" textAnchor="middle">RESMI</text>
      <text x="60" y="68" fill={strokeColor} fontSize="6.5" fontWeight="700" textAnchor="middle">JAKARTA</text>
    </svg>
  )
}

// Komponen Tanda Tangan Default (SVG)
const DefaultSignature = ({ strokeColor = '#0f172a' }) => (
  <svg viewBox="0 0 160 70" className="w-full h-full opacity-90 select-none pointer-events-none">
    <path 
      d="M 15 45 C 30 15, 45 60, 55 25 C 65 5, 75 55, 90 20 C 105 5, 115 50, 135 30 C 145 20, 155 35, 150 45 M 35 48 Q 90 42 145 46" 
      fill="none" 
      stroke={strokeColor} 
      strokeWidth="2.8" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
)

// Komponen Lapisan Kilau Glossy PVC (Lamination Sheen & Glare Effect)
// PERHATIAN: Efek kilau ini HANYA untuk pratinjau digital di layar.
// Otomatis DIABAIKAN saat diekspor ke PNG/PDF dan saat dicetak (print:hidden & data-html2canvas-ignore)
// sehingga hasil unduhan/cetakan 100% tajam, pekat, dan TIDAK berkabut putih!
const GlossyLaminationOverlay = () => (
  <div 
    data-html2canvas-ignore="true" 
    className="glossy-overlay absolute inset-0 pointer-events-none z-30 overflow-hidden select-none rounded-2xl print:hidden"
  >
    {/* Pantulan Cahaya Diagonal Khas Kartu Laminated PVC */}
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{
        background: 'linear-gradient(118deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.18) 46%, rgba(255,255,255,0.26) 49%, rgba(255,255,255,0.06) 53%, rgba(255,255,255,0) 65%)',
      }}
    />
    {/* Pantulan Sudut Kiri Atas Halus */}
    <div 
      className="absolute -top-12 -left-12 w-48 h-48 rounded-full pointer-events-none"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0) 70%)'
      }}
    />
    {/* Inner Edge Border Rim Highlight */}
    <div 
      className="absolute inset-0 pointer-events-none rounded-2xl"
      style={{
        boxShadow: 'inset 0 1px 1.5px rgba(255,255,255,0.5), inset 0 -1px 1.5px rgba(0,0,0,0.08)'
      }}
    />
  </div>
)

// Komponen Barcode Code 128 Realistis
const BarcodeGraphic = ({ code = '0012345678', className = '' }) => {
  const bars = []
  for (let i = 0; i < 64; i++) {
    const charCode = code.charCodeAt(i % code.length) || 48
    const w = (charCode % 3) + 1
    bars.push({ width: w, gap: ((i * 3 + charCode) % 3) + 1 })
  }
  let currentX = 2
  const rects = []
  bars.forEach((b, idx) => {
    rects.push(<rect key={idx} x={currentX} y={0} width={b.width} height={32} fill="currentColor" />)
    currentX += b.width + b.gap
  })

  return (
    <svg viewBox={`0 0 ${currentX + 4} 32`} className={className} preserveAspectRatio="none">
      {rects}
    </svg>
  )
}

const KartuPelajarCard = forwardRef(({
  student,
  photoUrl,
  settings = {},
  side = 'front', // 'front' | 'back'
  scale = 1,
  className = '',
  isEditorMode = false,
  activeComponent = null,
  onSelectComponent = null,
  onStartDrag = null
}, ref) => {
  const instanceId = useMemo(() => Math.random().toString(36).substring(2, 9), [])
  const navyGradId = `navyGrad_${instanceId}`
  const redGradId = `redGrad_${instanceId}`
  const redGradBottomId = `redGradBottom_${instanceId}`

  const theme = getCardTheme(settings.kartu_tema_warna)
  const namaSekolah = settings.kartu_nama_sekolah || 'SMP BUDI MULIA'
  const npsnSekolah = (settings.kartu_npsn_sekolah && settings.kartu_npsn_sekolah !== '20100223') ? settings.kartu_npsn_sekolah : '20106353'
  const ketentuanList = parseKetentuanList(settings.kartu_belakang_teks, namaSekolah).map(k => k.trim()).filter(Boolean)
  const visiSekolah = settings.kartu_visi_sekolah || 'Terwujudnya murid yang beriman, berakhlak mulia, cerdas, berprestasi, berwawasan global, dan berakar pada budaya bangsa.'
  const misiList = parseMisiList(settings.kartu_misi_sekolah).map(m => m.trim()).filter(Boolean)
  const instansiSekolah = settings.kartu_instansi_sekolah || 'DINAS PENDIDIKAN PROVINSI DKI JAKARTA'
  const akreditasiSekolah = settings.kartu_akreditasi || 'TERAKREDITASI A'
  const judulKartu = settings.kartu_judul || 'KARTU TANDA PELAJAR'
  const subjudulKartu = settings.kartu_subjudul || 'SEKOLAH MENENGAH PERTAMA'

  // Komponen Kustom Tambahan (+ Tambah Komponen)
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

  // Cek apakah ada badge kustom untuk masa berlaku agar tidak bertumpuk / teks ganda
  const hasCustomBerlakuBadge = customComponents.some(c => 
    c.text && String(c.text).toUpperCase().includes('BERLAKU')
  )
  const rawMasaBerlaku = settings.kartu_masa_berlaku
  const masaBerlaku = (rawMasaBerlaku !== undefined && rawMasaBerlaku !== null)
    ? (rawMasaBerlaku.trim() === '' ? '' : (rawMasaBerlaku === 'AKTIF BELAJAR' ? 'Selama Menjadi Siswa Aktif' : rawMasaBerlaku))
    : (hasCustomBerlakuBadge ? '' : 'Selama Menjadi Siswa Aktif')

  const footerTeks = settings.kartu_footer_teks || 'KARTU IDENTITAS RESMI SISWA • SMP BUDI MULIA JAKARTA'
  const alamatSekolah = settings.kartu_alamat_sekolah || 'Jl. Mangga Besar Raya No. 135, RT.3/RW.1, Mangga Dua Selatan, Kecamatan Sawah Besar, Kota Jakarta Pusat, DKI Jakarta 10730'
  const namaKepsek = settings.kartu_nama_kepsek || 'Septian Ruswadi, S.Pd'
  const nipKepsek = settings.kartu_nip_kepsek || '-'
  const tanggalTerbit = settings.kartu_tanggal_terbit || 'Jakarta, 1 Juli 2026'
  const ttdUrl = settings.kartu_ttd_url || ''
  const capUrl = settings.kartu_cap_url || ''
  const logoUrl = (settings.kartu_logo_url && settings.kartu_logo_url !== '/logo.png') ? settings.kartu_logo_url : '/logo_budimulia.png'
  const webSekolah = settings.kartu_web_sekolah || 'smpbudimuliajakarta.sch.id'
  const badgeTeks = settings.kartu_badge_teks || 'SMP BUDI MULIA'

  // Pengaturan Ukuran & Posisi TTD
  const ttdScale = (Number(settings.kartu_ttd_size) || 100) / 100
  const ttdX = Number(settings.kartu_ttd_x) || 0
  const ttdY = Number(settings.kartu_ttd_y) || 0
  const ttdRotate = Number(settings.kartu_ttd_rotate) || 0

  // Pengaturan Ukuran & Posisi Cap Stempel
  const capScale = (Number(settings.kartu_cap_size) || 100) / 100
  const capX = Number(settings.kartu_cap_x) || 0
  const capY = Number(settings.kartu_cap_y) || 0
  const capRotate = settings.kartu_cap_rotate !== undefined && settings.kartu_cap_rotate !== '' 
    ? Number(settings.kartu_cap_rotate) 
    : -8
  const capOpacity = (Number(settings.kartu_cap_opacity) || 90) / 100

  // Pengaturan Ukuran, Posisi & Opasitas Logo Background Watermark
  const bgLogoScale = (Number(settings.kartu_bg_logo_size) || 100) / 100
  const bgLogoX = Number(settings.kartu_bg_logo_x) || 0
  const bgLogoY = Number(settings.kartu_bg_logo_y) || 0
  const bgLogoOpacity = (settings.kartu_bg_logo_opacity !== undefined && settings.kartu_bg_logo_opacity !== '')
    ? Number(settings.kartu_bg_logo_opacity) / 100
    : 0.08

  // Pengaturan Pas Foto
  const fotoScale = (Number(settings.kartu_foto_size) || 100) / 100
  const fotoX = Number(settings.kartu_foto_x) || 0
  const fotoY = Number(settings.kartu_foto_y) || 0
  const fotoRotate = Number(settings.kartu_foto_rotate) || 0

  // Pengaturan QR Code
  const qrScale = (Number(settings.kartu_qr_size) || 100) / 100
  const qrX = Number(settings.kartu_qr_x) || 0
  const qrY = Number(settings.kartu_qr_y) || 0
  const qrRotate = Number(settings.kartu_qr_rotate) || 0

  // Pengaturan Barcode Garis (Komponen Terpisah)
  const barcodeScale = (Number(settings.kartu_barcode_size) || 100) / 100
  const barcodeX = Number(settings.kartu_barcode_x) || 0
  const barcodeY = Number(settings.kartu_barcode_y) || 0
  const barcodeRotate = Number(settings.kartu_barcode_rotate) || 0
  const barcodeWidth = Number(settings.kartu_barcode_width) || 355

  // Pengaturan Blok Biodata Siswa
  const biodataScale = (Number(settings.kartu_biodata_size) || 100) / 100
  const biodataX = Number(settings.kartu_biodata_x) || 0
  const biodataY = Number(settings.kartu_biodata_y) || 0
  const biodataRotate = Number(settings.kartu_biodata_rotate) || 0
  const biodataWidth = settings.kartu_biodata_width ? `${settings.kartu_biodata_width}px` : undefined
  const biodataLabelWidth = Number(settings.kartu_biodata_label_width) || 85
  const biodataFontSize = settings.kartu_biodata_font_size ? `${settings.kartu_biodata_font_size}px` : '10.5px'

  const renderCustomComponentItem = (comp) => {
    const compScale = (Number(comp.size) || 100) / 100
    const compRotate = Number(comp.rotate) || 0
    const compX = Number(comp.x) || 0
    const compY = Number(comp.y) || 0

    const hasBorder = Boolean(comp.hasBorder)
    const borderStyleObj = hasBorder ? {
      borderWidth: `${comp.borderWidth || 1}px`,
      borderColor: comp.borderColor || (comp.type === 'badge' ? (comp.color || '#3730a3') : '#cbd5e1'),
      borderStyle: comp.borderStyle || 'solid'
    } : {
      border: 'none',
      borderWidth: '0px',
      outline: 'none'
    }

    return (
      <React.Fragment key={comp.id}>
        {renderEditorBox({
          id: comp.id,
          label: comp.label || (comp.type === 'badge' ? 'Badge Kustom' : (comp.text || 'Teks Bebas')),
          x: compX,
          y: compY,
          scaleVal: compScale,
          rotateVal: compRotate,
          origin: 'center center',
          className: 'absolute z-30 pointer-events-auto cursor-grab active:cursor-grabbing select-none',
          style: {
            position: 'absolute',
            left: `${comp.initialX ?? 180}px`,
            top: `${comp.initialY ?? 100}px`,
            zIndex: 35
          },
          children: (
            comp.type === 'badge' ? (
              <div 
                style={{ 
                  backgroundColor: comp.bgColor || '#e0e7ff', 
                  color: comp.color || '#3730a3',
                  fontSize: `${comp.fontSize || 8.5}px`,
                  lineHeight: '1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...borderStyleObj
                }}
                className="px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-2xs whitespace-nowrap gap-1"
              >
                {comp.icon ? <span style={{ lineHeight: '1' }}>{comp.icon}</span> : null}
                <span style={{ lineHeight: '1', display: 'inline-block' }}>{comp.text || 'BADGE KUSTOM'}</span>
              </div>
            ) : (
              <div 
                style={{ 
                  color: comp.color || '#0f172a',
                  fontSize: `${comp.fontSize || 10}px`,
                  fontWeight: comp.isBold !== false ? 'bold' : 'normal',
                  lineHeight: '1.2',
                  backgroundColor: comp.bgColor && comp.bgColor !== 'transparent' ? comp.bgColor : undefined,
                  ...borderStyleObj
                }}
                className="whitespace-nowrap px-1.5 py-0.5 rounded"
              >
                <span style={{ lineHeight: '1.2', display: 'inline-block' }}>{comp.text || 'Teks Tambahan'}</span>
              </div>
            )
          )
        })}
      </React.Fragment>
    )
  }

  // Pengaturan Badge Sekolah
  const badgeScale = (Number(settings.kartu_badge_size) || 100) / 100
  const badgeX = Number(settings.kartu_badge_x) || 0
  const badgeY = Number(settings.kartu_badge_y) || 0
  const badgeRotate = Number(settings.kartu_badge_rotate) || 0

  // Pengaturan Judul Banner Depan
  const headerTitleScale = (Number(settings.kartu_header_title_size) || 100) / 100
  const headerTitleX = Number(settings.kartu_header_title_x) || 0
  const headerTitleY = Number(settings.kartu_header_title_y) || 0
  const headerTitleRotate = Number(settings.kartu_header_title_rotate) || 0

  // Pengaturan Logo & Nama Sekolah Header Kanan
  const headerLogoScale = (Number(settings.kartu_header_logo_size) || 100) / 100
  const headerLogoX = Number(settings.kartu_header_logo_x) || 0
  const headerLogoY = Number(settings.kartu_header_logo_y) || 0
  const headerLogoRotate = Number(settings.kartu_header_logo_rotate) || 0

  // Pengaturan Pengesahan Kepala Sekolah
  const kepsekScale = (Number(settings.kartu_kepsek_size) || 100) / 100
  const rawKepsekX = Number(settings.kartu_kepsek_x) || 0
  const rawKepsekY = Number(settings.kartu_kepsek_y) || 0
  // Safety guard agar blok Kepsek/TTD/Cap tidak pernah hilang terlempar ke luar batas kartu
  const kepsekX = Math.min(80, Math.max(-180, rawKepsekX))
  const kepsekY = Math.min(25, Math.max(-160, rawKepsekY))
  const kepsekRotate = Number(settings.kartu_kepsek_rotate) || 0

  // Pengaturan Sisi Belakang
  const backHeaderScale = (Number(settings.kartu_back_header_size) || 100) / 100
  const backHeaderX = Number(settings.kartu_back_header_x) || 0
  const backHeaderY = Number(settings.kartu_back_header_y) || 0

  const backVisiScale = (Number(settings.kartu_back_visi_size) || 100) / 100
  const backVisiX = Number(settings.kartu_back_visi_x) || 0
  const backVisiY = Number(settings.kartu_back_visi_y) || 0

  const backRulesScale = (Number(settings.kartu_back_rules_size) || 100) / 100
  const backRulesX = Number(settings.kartu_back_rules_x) || 0
  const backRulesY = Number(settings.kartu_back_rules_y) || 0

  const backFooterScale = (Number(settings.kartu_back_footer_size) || 100) / 100
  const backFooterX = Number(settings.kartu_back_footer_x) || 0
  const backFooterY = Number(settings.kartu_back_footer_y) || 0

  // Helper render wrapper untuk komponen interaktif di mode editor
  const renderEditorBox = ({
    id,
    label,
    children,
    x = 0,
    y = 0,
    scaleVal = 1,
    rotateVal = 0,
    origin = 'center center',
    className = '',
    style = {}
  }) => {
    const isSelected = isEditorMode && activeComponent === id
    const transformStyle = `translate(${x}px, ${y}px) scale(${scaleVal}) rotate(${rotateVal}deg)`

    const combinedStyle = {
      ...style,
      transform: transformStyle,
      transformOrigin: origin
    }

    const isAbsolute = className.includes('absolute') || className.includes('fixed') || style?.position === 'absolute'
    const posClass = isAbsolute ? '' : 'relative'

    if (!isEditorMode) {
      return (
        <div style={combinedStyle} className={`${className} ${posClass}`}>
          {children}
        </div>
      )
    }

    return (
      <div
        style={combinedStyle}
        className={`${className} ${posClass} transition-[box-shadow,outline] select-none ${
          isSelected
            ? 'ring-2 ring-indigo-600 ring-offset-1 ring-offset-white/80 shadow-lg rounded-sm z-40 cursor-move'
            : 'hover:ring-1 hover:ring-indigo-400 hover:ring-dashed rounded-sm z-20 cursor-grab'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onSelectComponent?.(id)
        }}
        onMouseDown={(e) => onStartDrag?.(id, e)}
        onTouchStart={(e) => onStartDrag?.(id, e)}
        title={`Klik atau geser untuk memindahkan ${label}`}
      >
        {isSelected && (
          <div className="absolute -top-4 left-0 z-50 pointer-events-none flex items-center">
            <span className="bg-indigo-600 text-white text-[7px] font-black uppercase px-1.5 py-0.2 rounded-t shadow-xs whitespace-nowrap leading-tight">
              {label}
            </span>
          </div>
        )}
        {children}
      </div>
    )
  }

  // Efek Finishing Kilau Glossy PVC
  const isGlossy = settings.kartu_glossy_effect !== false && settings.kartu_glossy_effect !== 'false'

  // State untuk menangani foto gagal muat (CORS / Link rusak / Belum ada foto)
  const [photoError, setPhotoError] = useState(false)

  useEffect(() => {
    setPhotoError(false)
  }, [photoUrl, student?.nisn])

  const isValidPhoto = Boolean(
    photoUrl &&
    typeof photoUrl === 'string' &&
    photoUrl.trim().length > 0 &&
    photoUrl !== '-' &&
    photoUrl !== 'null' &&
    photoUrl !== 'undefined' &&
    !photoUrl.includes('ui-avatars.com')
  )

  const cleanNisn = (student?.nisn && String(student.nisn).trim() !== '-' && String(student.nisn).trim() !== 'null' && String(student.nisn).trim() !== 'undefined') 
    ? String(student.nisn).trim() 
    : ''

  const cleanNipd = (student?.nipd && String(student.nipd).trim() !== '-' && String(student.nipd).trim() !== 'null' && String(student.nipd).trim() !== 'undefined') 
    ? String(student.nipd).trim() 
    : (student?.nis && String(student.nis).trim() !== '-' && String(student.nis).trim() !== 'null' && String(student.nis).trim() !== 'undefined') 
    ? String(student.nis).trim() 
    : (student?.nomor_induk && String(student.nomor_induk).trim() !== '-' && String(student.nomor_induk).trim() !== 'null' && String(student.nomor_induk).trim() !== 'undefined') 
    ? String(student.nomor_induk).trim() 
    : ''

  const nisn = cleanNisn || '-'
  const nipd = cleanNipd || '-'

  let idDisplay = '-'
  if (cleanNisn && cleanNipd) {
    idDisplay = `${cleanNisn} / ${cleanNipd}`
  } else if (cleanNisn) {
    idDisplay = cleanNisn
  } else if (cleanNipd) {
    idDisplay = cleanNipd
  } else {
    idDisplay = '-'
  }

  const namaLengkap = student?.nama_lengkap || student?.nama || '-'
  const kelas = student?.kelas && student.kelas !== '-' ? student.kelas : '-'

  // Tempat & Tanggal Lahir (Hanya tampilkan jika data sudah diisi di sistem, TANPA fallback dummy)
  const tempatLahir = (student?.tempat_lahir && typeof student.tempat_lahir === 'string' && student.tempat_lahir.trim() && student.tempat_lahir !== '-') 
    ? student.tempat_lahir.trim() 
    : ''
  const tanggalLahir = (student?.tanggal_lahir && student.tanggal_lahir !== '-') 
    ? formatIndonesianDate(student.tanggal_lahir) 
    : ''

  let ttl = '-'
  if (tempatLahir && tanggalLahir && tanggalLahir !== '-') {
    ttl = `${tempatLahir}, ${tanggalLahir}`
  } else if (tempatLahir) {
    ttl = tempatLahir
  } else if (tanggalLahir && tanggalLahir !== '-') {
    ttl = tanggalLahir
  }

  const alamatLengkap = formatAlamatLengkap(student)

  // Jenis Kelamin
  const rawJk = student?.jenis_kelamin || student?.gender || ''
  let jenisKelamin = '-'
  if (rawJk) {
    const trimmed = String(rawJk).trim().toUpperCase()
    if (trimmed === 'L' || trimmed === 'LAKI-LAKI' || trimmed === 'LAKI - LAKI') {
      jenisKelamin = 'Laki-Laki'
    } else if (trimmed === 'P' || trimmed === 'PEREMPUAN') {
      jenisKelamin = 'Perempuan'
    } else {
      jenisKelamin = rawJk
    }
  }

  // URL Verifikasi Resmi untuk QR Code (Dapat discan kamera HP kapan pun)
  const baseUrl = typeof window !== 'undefined' && window.location?.origin 
    ? window.location.origin 
    : 'https://ebudimulia.com'
  const verificationUrl = cleanNisn 
    ? `${baseUrl}/validasi-kartu?nisn=${encodeURIComponent(cleanNisn)}`
    : cleanNipd
    ? `${baseUrl}/validasi-kartu?nipd=${encodeURIComponent(cleanNipd)}`
    : `${baseUrl}/validasi-kartu`

  // =========================================================================
  // SISI DEPAN KARTU (BIODATA SISWA + PAS FOTO + PENGESAHAN KEPALA SEKOLAH)
  // =========================================================================
  if (side === 'front') {
    return (
      <div 
        ref={ref}
        data-card-side="front"
        data-card-type="kartu-pelajar"
        style={{
          width: '510px',
          height: '322px',
          minWidth: '510px',
          minHeight: '322px',
          maxWidth: '510px',
          maxHeight: '322px',
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
        className={`relative rounded-2xl overflow-hidden ${theme.bgTint} border-2 border-slate-300 shadow-2xl flex flex-col justify-between font-sans select-none text-left print:shadow-none print:m-0 ${className}`}
      >
        {/* Background Security Wave Guilloche */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04]">
          <svg className="w-full h-full" viewBox="0 0 510 322" preserveAspectRatio="none">
            <path d="M 0,100 C 150,20 300,180 510,120 L 510,322 L 0,322 Z" fill={theme.watermarkColor} />
            <circle cx="200" cy="180" r="140" stroke={theme.watermarkColor} strokeWidth="1" strokeDasharray="4 4" fill="none" />
            <circle cx="200" cy="180" r="120" stroke={theme.watermarkColor} strokeWidth="1" fill="none" />
            <circle cx="200" cy="180" r="100" stroke={theme.watermarkColor} strokeWidth="1" strokeDasharray="6 3" fill="none" />
          </svg>
        </div>

        {/* LOGO TRANSPARAN SEBAGAI WATERMARK BACKGROUND KARTU */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
          <img 
            src={logoUrl} 
            alt="" 
            crossOrigin="anonymous"
            style={{
              transform: `translate(${bgLogoX}px, ${bgLogoY}px) scale(${bgLogoScale})`,
              opacity: bgLogoOpacity,
              transformOrigin: 'center center'
            }}
            className="w-56 h-56 object-contain select-none transition-transform pointer-events-none" 
          />
        </div>

        {/* 1. HEADER DIAGONAL WAVE BANNER (ELEGAN & RAPI) */}
        <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10">
          <svg viewBox="0 0 510 66" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={navyGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={theme.navyHex1 || '#081b3f'} />
                <stop offset="60%" stopColor={theme.navyHex2 || '#0f2e66'} />
                <stop offset="100%" stopColor={theme.navyHex1 || '#081b3f'} />
              </linearGradient>
              <linearGradient id={redGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={theme.accentHex1 || '#ef4444'} />
                <stop offset="50%" stopColor={theme.accentHex2 || '#dc2626'} />
                <stop offset="100%" stopColor={theme.accentHex2 || '#dc2626'} />
              </linearGradient>
            </defs>

            {/* Merah Accent Wave Strip di Bawah Banner Biru (Solid Backing + Gradient) */}
            <path d="M 0,48 C 95,42 175,44 260,46 C 295,24 310,0 310,0 L 324,0 C 308,26 270,52 175,49 C 95,46 0,55 0,55 Z" fill={theme.accentHex2 || '#dc2626'} />
            <path d="M 0,48 C 95,42 175,44 260,46 C 295,24 310,0 310,0 L 324,0 C 308,26 270,52 175,49 C 95,46 0,55 0,55 Z" fill={`url(#${redGradId})`} />

            {/* Navy Blue Diagonal Banner Foreground (Solid Backing + Gradient) */}
            <path d="M 0,0 L 310,0 C 295,24 260,46 175,44 C 95,42 0,48 0,48 Z" fill={theme.navyHex1 || '#081b3f'} />
            <path d="M 0,0 L 310,0 C 295,24 260,46 175,44 C 95,42 0,48 0,48 Z" fill={`url(#${navyGradId})`} />
          </svg>

          {/* Teks Judul Banner */}
          {renderEditorBox({
            id: 'header_title',
            label: 'Judul Kartu',
            x: headerTitleX,
            y: headerTitleY,
            scaleVal: headerTitleScale,
            rotateVal: headerTitleRotate,
            origin: 'left top',
            className: 'absolute top-2 left-6 z-20 text-left pointer-events-auto',
            children: (
              <>
                <h1 
                  className="text-[14.5px] font-black tracking-widest text-white italic drop-shadow-sm uppercase leading-none"
                  style={{ lineHeight: '1', margin: 0 }}
                >
                  {judulKartu}
                </h1>
                <span 
                  className="text-[7.5px] font-bold tracking-widest text-blue-200 uppercase block mt-0.5"
                  style={{ lineHeight: '1' }}
                >
                  {subjudulKartu}
                </span>
              </>
            )
          })}

          {/* Logo & Identitas Resmi Budi Mulia di Kanan Atas */}
          {renderEditorBox({
            id: 'header_logo',
            label: 'Logo & Nama Sekolah',
            x: headerLogoX,
            y: headerLogoY,
            scaleVal: headerLogoScale,
            rotateVal: headerLogoRotate,
            origin: 'right top',
            className: 'absolute top-1.5 right-5 z-20 flex items-center gap-2.5 pointer-events-auto',
            children: (
              <>
                <div className="flex flex-col items-end justify-center text-right leading-tight select-none">
                  <span className="text-[11px] font-black text-[#081b3f] tracking-wide block uppercase leading-tight font-sans">
                    {namaSekolah}
                  </span>
                  <span className="text-[8px] font-black text-[#081b3f] tracking-wider block uppercase leading-tight mt-0.5 font-sans">
                    {npsnSekolah.toUpperCase().startsWith('NPSN') ? npsnSekolah : `NPSN: ${npsnSekolah}`}
                  </span>
                  <span className="text-[7.5px] font-black text-[#dc2626] tracking-widest block uppercase leading-tight mt-0.5 font-sans">
                    {akreditasiSekolah || 'TERAKREDITASI A'}
                  </span>
                </div>
                {/* Logo Resmi SMP Budi Mulia */}
                <img 
                  src={logoUrl} 
                  alt="Logo Budi Mulia" 
                  crossOrigin="anonymous"
                  className="w-10 h-12 object-contain drop-shadow-xs shrink-0"
                  onError={(e) => {
                    e.target.onerror = null
                    if (!e.target.src.includes('logo_budimulia.png')) {
                      e.target.src = '/logo_budimulia.png'
                    }
                  }} 
                />
              </>
            )
          })}
        </div>

        {/* Dot Pattern Texture di Kanan Atas (Persis Contoh Gambar) */}
        <div className="absolute top-16 right-5 pointer-events-none z-0 opacity-20">
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-slate-400" />
            ))}
          </div>
        </div>

        {/* 2. BODY KARTU: IDENTITAS DI KIRI, FOTO DI KANAN, QR DI ATAS */}
        <div className="relative z-20 mt-[58px] px-5 pb-5 flex-1 w-full flex items-stretch justify-between gap-4 text-left">
          
          {/* SISI KIRI: QR CODE DI ATAS + IDENTITAS SISWA */}
          <div 
            className="flex-1 min-w-0 flex flex-col pt-0.5"
            style={{ minWidth: biodataWidth || undefined }}
          >
            
            {/* QR Code di Atas Identitas */}
            {renderEditorBox({
              id: 'qr',
              label: 'QR Code',
              x: qrX,
              y: qrY,
              scaleVal: qrScale,
              rotateVal: qrRotate,
              origin: 'left center',
              className: 'flex items-center gap-2 mb-1.5 w-fit select-none',
              children: (
                <>
                  <div className="bg-white p-1 rounded-lg border border-slate-300 shadow-2xs inline-block">
                    <QRCodeSVG 
                      value={verificationUrl} 
                      size={36} 
                      level="M" 
                      includeMargin={false}
                    />
                  </div>
                  {Boolean(masaBerlaku && !hasCustomBerlakuBadge) && (
                    <div className="flex flex-col">
                      <p className="text-[6.5px] font-semibold text-slate-700 leading-tight whitespace-nowrap">
                        Berlaku: {masaBerlaku.replace(/^berlaku:\s*/i, '')}
                      </p>
                    </div>
                  )}
                </>
              )
            })}

            {/* 5 Baris Identitas (Lebar section & label dapat disesuaikan) */}
            {renderEditorBox({
              id: 'biodata',
              label: 'Biodata Siswa',
              x: biodataX,
              y: biodataY,
              scaleVal: biodataScale,
              rotateVal: biodataRotate,
              origin: 'left top',
              className: 'text-left space-y-0.5 w-full',
              style: {
                width: biodataWidth || '100%',
                minWidth: biodataWidth || undefined,
                maxWidth: biodataWidth ? 'none' : '100%',
                flexShrink: 0
              },
              children: (
                <>
                  {/* 1. Nama (Wrap ke bawah jika panjang, tidak di-truncate/hide) */}
                  <div className="flex items-start py-[1px] leading-[1.25]">
                    <span 
                      style={{ width: `${biodataLabelWidth}px`, fontSize: biodataFontSize }} 
                      className="shrink-0 font-medium text-slate-700 leading-tight"
                    >
                      Nama
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="shrink-0 font-bold text-slate-900 mx-1.5 leading-tight"
                    >
                      :
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="flex-1 min-w-0 font-bold text-slate-900 uppercase break-words leading-tight" 
                      title={namaLengkap}
                    >
                      {namaLengkap}
                    </span>
                  </div>

                  {/* 2. NISN / NIPD (Jika belum ada data tampilkan -) */}
                  <div className="flex items-start py-[1px] leading-[1.25]">
                    <span 
                      style={{ width: `${biodataLabelWidth}px`, fontSize: biodataFontSize }} 
                      className="shrink-0 font-medium text-slate-700 leading-tight"
                    >
                      NISN / NIPD
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="shrink-0 font-bold text-slate-900 mx-1.5 leading-tight"
                    >
                      :
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="flex-1 min-w-0 font-mono font-bold text-slate-900 leading-tight whitespace-nowrap"
                    >
                      {idDisplay}
                    </span>
                  </div>

                  {/* 3. Tempat & Tanggal Lahir (Wrap ke bawah jika panjang) */}
                  <div className="flex items-start py-[1px] leading-[1.25]">
                    <span 
                      style={{ width: `${biodataLabelWidth}px`, fontSize: biodataFontSize }} 
                      className="shrink-0 font-medium text-slate-700 leading-tight"
                    >
                      Tempat, Tgl Lahir
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="shrink-0 font-bold text-slate-900 mx-1.5 leading-tight"
                    >
                      :
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="flex-1 min-w-0 font-bold text-slate-900 break-words leading-tight" 
                      title={ttl}
                    >
                      {ttl}
                    </span>
                  </div>

                  {/* 4. Jenis Kelamin */}
                  <div className="flex items-start py-[1px] leading-[1.25]">
                    <span 
                      style={{ width: `${biodataLabelWidth}px`, fontSize: biodataFontSize }} 
                      className="shrink-0 font-medium text-slate-700 leading-tight"
                    >
                      Jenis Kelamin
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="shrink-0 font-bold text-slate-900 mx-1.5 leading-tight"
                    >
                      :
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="flex-1 min-w-0 font-bold text-slate-900 leading-tight"
                    >
                      {jenisKelamin}
                    </span>
                  </div>

                  {/* 5. Alamat (Wrap ke bawah jika panjang, tidak di-hide) */}
                  <div className="flex items-start py-[1px] leading-[1.25]">
                    <span 
                      style={{ width: `${biodataLabelWidth}px`, fontSize: biodataFontSize }} 
                      className="shrink-0 font-medium text-slate-700 leading-tight"
                    >
                      Alamat
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="shrink-0 font-bold text-slate-900 mx-1.5 leading-tight"
                    >
                      :
                    </span>
                    <span 
                      style={{ fontSize: biodataFontSize }} 
                      className="flex-1 min-w-0 font-bold text-slate-900 leading-tight break-words" 
                      title={alamatLengkap}
                    >
                      {alamatLengkap}
                    </span>
                  </div>
                </>
              )
            })}

          </div>

          {/* SISI KANAN: PAS FOTO SISWA & BADGE SMP BUDI MULIA */}
          <div className="w-[102px] shrink-0 flex flex-col justify-between items-center pt-0.5 pb-0.5">
            {/* Bagian Atas: Pas Foto Siswa (Portrait 3:4) */}
            <div className="flex flex-col items-center">
              {renderEditorBox({
                id: 'foto',
                label: 'Pas Foto Siswa',
                x: fotoX,
                y: fotoY,
                scaleVal: fotoScale,
                rotateVal: fotoRotate,
                origin: 'center center',
                className: 'w-[92px] h-[120px] rounded-2xl overflow-hidden border-2 border-indigo-500 bg-slate-50 relative shadow-sm flex items-center justify-center',
                children: (
                  isValidPhoto && !photoError ? (
                    <img 
                      src={photoUrl} 
                      alt={namaLengkap} 
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover pointer-events-none"
                      onError={() => {
                        setPhotoError(true)
                      }}
                    />
                  ) : (
                    /* Avatar Placeholder Siluet Netral */
                    <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-end pb-2 pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-slate-300 mb-1" />
                      <div className="w-16 h-10 rounded-t-full bg-slate-300" />
                    </div>
                  )
                )
              })}

              {/* Slanted Single Badge Parallelogram SMP BUDI MULIA */}
              {renderEditorBox({
                id: 'badge',
                label: 'Badge Sekolah',
                x: badgeX,
                y: badgeY,
                scaleVal: badgeScale,
                rotateVal: badgeRotate,
                origin: 'center center',
                className: 'mt-2 flex flex-col items-center select-none',
                children: (
                  <div 
                    className="-skew-x-12 bg-[#dc2626] px-2.5 rounded-xs shadow-2xs whitespace-nowrap flex items-center justify-center"
                    style={{ paddingTop: '2px', paddingBottom: '2px', lineHeight: '1' }}
                  >
                    <span 
                      className="skew-x-12 block text-[7.5px] font-black text-white tracking-wider uppercase whitespace-nowrap"
                      style={{ lineHeight: '1' }}
                    >
                      {badgeTeks}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pengesahan Kepala Sekolah (di pojok kanan bawah, rapi dan tidak tumpang tindih dengan footer) */}
          {renderEditorBox({
            id: 'kepsek',
            label: 'Pengesahan Kepsek',
            x: kepsekX,
            y: kepsekY,
            scaleVal: kepsekScale,
            rotateVal: kepsekRotate,
            origin: 'bottom right',
            className: 'absolute right-4 bottom-10 shrink-0 flex flex-col items-center text-center w-36 z-20 pointer-events-auto',
            children: (
              <>
                <p className="text-[7.5px] font-medium text-slate-600 leading-none" style={{ lineHeight: '1' }}>
                  {tanggalTerbit}
                </p>
                <p className="text-[8px] font-bold text-[#081b3f] leading-none mt-0.5" style={{ lineHeight: '1' }}>
                  Kepala Sekolah,
                </p>

                {/* Area TTD & Cap Stempel tumpang tindih */}
                <div className="relative w-36 h-9 my-0.5 flex items-center justify-center">
                  {/* Cap Stempel Basah */}
                  {renderEditorBox({
                    id: 'cap',
                    label: 'Cap Stempel',
                    x: capX,
                    y: capY,
                    scaleVal: capScale,
                    rotateVal: capRotate,
                    style: { opacity: capOpacity },
                    className: `absolute left-3 -top-1 w-11 h-11 z-20 drop-shadow-xs transition-transform ${
                      isEditorMode ? 'pointer-events-auto' : 'pointer-events-none'
                    }`,
                    children: capUrl ? (
                      <img src={capUrl} alt="Cap" crossOrigin="anonymous" className="w-full h-full object-contain pointer-events-none" />
                    ) : (
                      <DefaultSchoolStamp namaSekolah={namaSekolah} strokeColor="#dc2626" />
                    )
                  })}

                  {/* Tanda Tangan Tinta */}
                  {renderEditorBox({
                    id: 'ttd',
                    label: 'Tanda Tangan',
                    x: ttdX,
                    y: ttdY,
                    scaleVal: ttdScale,
                    rotateVal: ttdRotate,
                    className: 'relative z-10 w-28 h-9 flex items-center justify-center transition-transform pointer-events-auto',
                    children: ttdUrl ? (
                      <img src={ttdUrl} alt="TTD" crossOrigin="anonymous" className="max-w-full max-h-full object-contain pointer-events-none" />
                    ) : (
                      <DefaultSignature strokeColor="#0f172a" />
                    )
                  })}
                </div>

                {/* Nama Lengkap Kepala Sekolah dengan Garis Bawah Tegas */}
                <p className="text-[9px] font-bold text-[#081b3f] underline decoration-[#081b3f] decoration-1 underline-offset-2 truncate leading-tight" title={namaKepsek} style={{ lineHeight: '1.2' }}>
                  {namaKepsek}
                </p>
                {nipKepsek && nipKepsek !== '-' && nipKepsek.trim() !== '' && (
                  <p className="text-[6.5px] font-mono text-slate-600 mt-0.5 leading-none" style={{ lineHeight: '1' }}>
                    NIP. {nipKepsek}
                  </p>
                )}
              </>
            )
          })}

        </div>

        {/* 3. FOOTER GRAPHIC WAVE BANNER (PERSIS DENGAN GAMBAR CONTOH) */}
        <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-10 overflow-hidden">
          <svg viewBox="0 0 510 26" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={redGradBottomId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={theme.accentHex1 || '#ef4444'} />
                <stop offset="50%" stopColor={theme.accentHex2 || '#dc2626'} />
                <stop offset="100%" stopColor={theme.accentHex2 || '#dc2626'} />
              </linearGradient>
            </defs>

            {/* Merah Accent Wave di Kiri Bawah (Solid Backing + Gradient) */}
            <path 
              d="M 0,16 C 35,16 65,19 125,24 C 70,24 25,24 0,24 Z" 
              fill={theme.accentHex2 || '#dc2626'} 
            />
            <path 
              d="M 0,16 C 35,16 65,19 125,24 C 70,24 25,24 0,24 Z" 
              fill={`url(#${redGradBottomId})`} 
            />
            <path 
              d="M 0,20 C 40,20 75,22 140,26 L 0,26 Z" 
              fill="#dc2626" 
            />

            {/* Navy Blue Main Footer Ribbon */}
            <path 
              d="M 85,26 C 125,14 175,8 240,8 L 475,8 C 490,8 505,16 510,26 L 85,26 Z" 
              fill="#081b3f" 
            />

            {/* Aksen Garis Diagonal Putih di Ujung Kanan Pita Navy */}
            <polygon 
              points="472,26 484,8 490,8 478,26" 
              fill="white" 
              opacity="0.9" 
            />
          </svg>

          {/* Pill Web Sekolah di Tengah Pita Navy (Persis Gambar Contoh) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div 
              className="flex items-center justify-center gap-1.5 bg-[#081b3f]/90 px-3 py-0.5 rounded-full border border-blue-400/30 shadow-xs"
              style={{ height: '16px', lineHeight: '1' }}
            >
              <svg className="w-2.5 h-2.5 text-white shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <span 
                className="text-[7.5px] font-mono font-medium text-white tracking-wider"
                style={{ lineHeight: '1', display: 'inline-block' }}
              >
                {webSekolah}
              </span>
            </div>
          </div>
        </div>

        {/* Komponen Tambahan Barcode Garis (Independen, dapat digeser & diedit secara individual) */}
        {renderEditorBox({
          id: 'barcode',
          label: 'Barcode Garis',
          x: barcodeX,
          y: barcodeY,
          scaleVal: barcodeScale,
          rotateVal: barcodeRotate,
          origin: 'left bottom',
          className: 'absolute left-5 bottom-8 z-20 pointer-events-auto cursor-grab active:cursor-grabbing select-none',
          style: {
            position: 'absolute'
          },
          children: (
            <div 
              style={{ width: `${barcodeWidth}px` }}
              className="flex items-center justify-center pointer-events-auto select-none"
            >
              <BarcodeGraphic 
                code={cleanNisn || '0117023562'} 
                className="w-full h-5 text-slate-900" 
              />
            </div>
          )
        })}

        {/* Render Komponen Kustom Sisi Depan */}
        {customComponents.filter(c => (c.side || 'front') === 'front').map(renderCustomComponentItem)}

        {/* Lapisan Kilau Glossy Finishing Laminated PVC */}
        {isGlossy && <GlossyLaminationOverlay />}

      </div>
    )
  }

  // =========================================================================
  // SISI BELAKANG KARTU (KOP SEKOLAH, VISI & MISI, KETENTUAN PEMEGANG KARTU)
  // =========================================================================
  return (
    <div 
      ref={ref}
      data-card-side="back"
      data-card-type="kartu-pelajar"
      style={{
        width: '510px',
        height: '322px',
        minWidth: '510px',
        minHeight: '322px',
        maxWidth: '510px',
        maxHeight: '322px',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
        boxSizing: 'border-box',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
      className={`relative rounded-2xl overflow-hidden bg-white border-2 border-slate-300 shadow-2xl flex flex-col justify-between font-sans select-none text-left print:shadow-none print:m-0 ${className}`}
    >
      {/* Background Security Guilloche Pattern & Watermark */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04]">
        <svg className="w-full h-full" viewBox="0 0 510 322" preserveAspectRatio="none">
          <circle cx="120" cy="160" r="130" stroke="#081b3f" strokeWidth="1.5" strokeDasharray="5 3" fill="none" />
          <circle cx="380" cy="180" r="110" stroke="#dc2626" strokeWidth="1" fill="none" />
          <path d="M 0,0 L 510,322 M 510,0 L 0,322" stroke="#081b3f" strokeWidth="0.5" strokeDasharray="8 8" />
        </svg>
      </div>

      {/* LOGO TRANSPARAN SEBAGAI WATERMARK BACKGROUND KARTU (SISI BELAKANG) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
        <img 
          src={logoUrl} 
          alt="" 
          crossOrigin="anonymous"
          style={{
            transform: `translate(${bgLogoX}px, ${bgLogoY}px) scale(${bgLogoScale})`,
            opacity: bgLogoOpacity,
            transformOrigin: 'center center'
          }}
          className="w-52 h-52 object-contain select-none transition-transform pointer-events-none" 
        />
      </div>

      {/* 1. KOP RESMI SEKOLAH (DENGAN LOGO ASLI BUDI MULIA & NPSN) */}
      {renderEditorBox({
        id: 'back_header',
        label: 'Kop Sekolah Belakang',
        x: backHeaderX,
        y: backHeaderY,
        scaleVal: backHeaderScale,
        origin: 'top left',
        className: 'relative z-10 px-5 pt-2.5 pb-2 border-b-2 border-[#081b3f] flex items-center justify-between text-left',
        children: (
          <>
            <div className="flex items-center gap-2.5 text-left">
              {/* Logo Resmi SMP Budi Mulia */}
              <img 
                src={logoUrl} 
                alt="Logo Budi Mulia" 
                crossOrigin="anonymous"
                className="w-10 h-12 object-contain shrink-0 drop-shadow-xs pointer-events-none"
                onError={(e) => {
                  e.target.onerror = null
                  if (!e.target.src.includes('logo_budimulia.png')) {
                    e.target.src = '/logo_budimulia.png'
                  }
                }} 
              />
              <div className="text-left">
                <h4 className="text-[8px] font-extrabold tracking-widest text-[#081b3f] uppercase leading-tight">
                  {instansiSekolah}
                </h4>
                <h2 className="text-[13px] font-black tracking-wider text-[#dc2626] uppercase leading-tight mt-0.5">
                  {namaSekolah}
                </h2>
                <div className="mt-1 space-y-0.5 text-[7.5px] font-medium text-slate-600 leading-snug">
                  <p>
                    {alamatSekolah}{npsnSekolah && npsnSekolah !== '-' ? ` • NPSN: ${npsnSekolah}` : ''}
                  </p>
                  <p>
                    Web: {webSekolah}
                  </p>
                </div>
              </div>
            </div>

            {/* Ikon RFID / Smart Card Contactless */}
            <div className="text-slate-700 shrink-0 text-right pointer-events-none">
              <svg className="w-6 h-6 inline-block text-[#081b3f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
              </svg>
              <span className="text-[6.5px] font-mono font-bold tracking-widest text-slate-400 block mt-0.5">
                RFID SECURE
              </span>
            </div>
          </>
        )
      })}


      {/* 2. AREA TENGAH: 2 KOLOM RAPI (KIRI: VISI & MISI SEKOLAH, KANAN: KETENTUAN PEMEGANG KARTU) */}
      <div className="relative z-10 px-5 py-1.5 flex-1 grid grid-cols-2 gap-3 text-left">
        
        {/* Sisi Kiri: Visi & Misi Sekolah */}
        {renderEditorBox({
          id: 'back_visi_misi',
          label: 'Visi & Misi',
          x: backVisiX,
          y: backVisiY,
          scaleVal: backVisiScale,
          origin: 'top left',
          className: 'text-[7.2px] text-slate-600 flex flex-col justify-between overflow-hidden',
          children: (
            <div>
              <p className="font-black text-[#081b3f] text-[8px] uppercase tracking-wider mb-1">
                VISI & MISI SEKOLAH
              </p>
              {/* Visi */}
              <div className="mb-1 p-1.5 rounded-lg bg-red-50/50 border border-red-100">
                <span className="text-[6.8px] font-black text-[#dc2626] uppercase tracking-wider block">VISI:</span>
                <p className="text-[7px] italic font-semibold text-slate-800 leading-tight mt-0.5">
                  "{visiSekolah}"
                </p>
              </div>
              {/* Misi */}
              <div>
                <span className="text-[6.8px] font-black text-[#081b3f] uppercase tracking-wider block mb-0.5">MISI:</span>
                <div className="space-y-0.5 leading-[1.25]">
                  {misiList.map((m, idx) => (
                    <div key={idx} className="flex items-start gap-1">
                      <span className="font-bold text-[#dc2626] shrink-0 text-[7px] leading-tight">{idx + 1}.</span>
                      <span className="text-[6.8px] text-slate-700 leading-tight">{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {/* Sisi Kanan: Ketentuan Pemegang Kartu */}
        {renderEditorBox({
          id: 'back_rules',
          label: 'Ketentuan Kartu',
          x: backRulesX,
          y: backRulesY,
          scaleVal: backRulesScale,
          origin: 'top left',
          className: 'pl-3 border-l border-slate-200 text-[7.2px] text-slate-600 flex flex-col justify-between overflow-hidden',
          children: (
            <div>
              <p className="font-black text-[#081b3f] text-[8px] uppercase tracking-wider mb-1">
                KETENTUAN PEMEGANG KARTU
              </p>
              <div className="space-y-0.5 leading-[1.25]">
                {ketentuanList.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-1">
                    <span className="font-bold text-[#081b3f] shrink-0 text-[7px] leading-tight">{idx + 1}.</span>
                    <span className="text-[6.8px] text-slate-700 leading-tight">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

      </div>

      {/* 3. FOOTER BELAKANG MINI BERWARNA MERAH-BIRU */}
      {renderEditorBox({
        id: 'back_footer',
        label: 'Footer Belakang',
        x: backFooterX,
        y: backFooterY,
        scaleVal: backFooterScale,
        origin: 'bottom center',
        className: 'relative z-10 px-5 py-1 bg-gradient-to-r from-[#081b3f] via-[#dc2626] to-[#081b3f] text-white text-[7.5px] font-mono font-bold tracking-widest text-center uppercase',
        children: footerTeks
      })}

      {/* Render Komponen Kustom Sisi Belakang */}
      {customComponents.filter(c => c.side === 'back').map(renderCustomComponentItem)}

      {/* Lapisan Kilau Glossy Finishing Laminated PVC */}
      {isGlossy && <GlossyLaminationOverlay />}

    </div>
  )
})

KartuPelajarCard.displayName = 'KartuPelajarCard'
export default KartuPelajarCard
