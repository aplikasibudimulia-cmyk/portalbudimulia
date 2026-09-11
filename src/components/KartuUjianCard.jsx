import React, { forwardRef, useState, useEffect, useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * Daftar metadata komponen kartu ujian untuk keperluan Studio Editing
 */
export const EXAM_CARD_COMPONENTS_META = [
  { id: 'foto', label: 'Pas Foto Siswa', icon: '📷' },
  { id: 'qrcode', label: 'QR Code Verifikasi', icon: '🏁' },
  { id: 'biodata', label: 'Biodata Siswa', icon: '📝' },
  { id: 'tabel_kredensial', label: 'Tabel Ruang & Akun', icon: '📊' },
  { id: 'lokasi_ujian', label: 'Badge Lokasi Ujian', icon: '📍' },
  { id: 'pengesahan_kepsek', label: 'Teks Pengesahan', icon: '✍️' },
  { id: 'ttd', label: 'Tanda Tangan Kepsek', icon: '✒️' },
  { id: 'cap', label: 'Cap Stempel Sekolah', icon: '🔴' },
  { id: 'header_title', label: 'Teks Header Judul', icon: '🏷️' },
  { id: 'badge_logo', label: 'Badge Logo Sekolah', icon: '🏫' },
  { id: 'ribbon_tahun', label: 'Ribbon Tahun Ajaran', icon: '🎗️' }
]

/**
 * KartuUjianCard.jsx
 * Desain Kartu Peserta Ujian Digital SMP Budi Mulia
 * Mendukung interaktivitas Fullscreen Studio Editor:
 * - Drag & drop langsung tiap komponen
 * - Koordinat geser (X & Y), skala (zoom), dan rotasi
 */
const KartuUjianCard = forwardRef(({
  student = {},
  photoUrl = null,
  settings = {},
  scale = 1,
  className = '',
  isEditorMode = false,
  activeComponent = null,
  onSelectComponent = null,
  onStartDrag = null,
  onDeleteComponent = null,
  onTogglePasswordVisibility = null
}, ref) => {
  const namaSekolah = settings.namaSekolah || settings.kartu_nama_sekolah || 'SMP BUDI MULIA'
  const subNamaSekolah = settings.subNamaSekolah || 'SEKOLAH MENENGAH PERTAMA'
  const judulUjian = settings.judulUjian || 'KARTU PESERTA'
  const subJudulUjian = settings.subJudulUjian || 'UJIAN ASESMEN SUMATIF / PTS / PAS'
  const tahunAjaran = settings.tahunAjaran || 'TAHUN AJARAN 2026/2027'
  const semester = (settings.semester !== undefined && settings.semester !== null) ? settings.semester : ''
  const akreditasi = settings.akreditasi || settings.kartu_akreditasi || 'TERAKREDITASI A'
  const npsnSekolah = settings.npsnSekolah || settings.kartu_npsn_sekolah || '20106353'
  const logoUrl = settings.logoUrl || settings.kartu_logo_url || '/logo_budimulia.png'
  const ttdUrl = settings.ttdUrl || settings.kartu_ttd_url || ''
  const capUrl = settings.capUrl || settings.kartu_cap_url || ''
  const namaPenandatangan = settings.namaPenandatangan || settings.kartu_nama_kepsek || 'Septian Ruswadi, S.Pd'
  const jabatanPenandatangan = settings.jabatanPenandatangan || 'Kepala Sekolah'
  const tanggalTerbit = settings.tanggalTerbit || 'Jakarta, 15 September 2026'

  // Data siswa
  const raw = student.rawStudent || student || {}
  const nama = String(student.nama || raw.nama_lengkap || raw.nama || 'NAMA LENGKAP SISWA').toUpperCase()
  const kelas = String(student.kelas || raw.kelas || '-').trim()
  const nisn = String(student.nisn || raw.nisn || '-').trim()
  const nipd = String(student.nipd || raw.nipd || raw.nis || '-').trim()
  const fotoUrl = photoUrl || student.foto_url || student.cloudinary_url || raw.foto_url || raw.cloudinary_url || null

  const [photoError, setPhotoError] = useState(false)
  useEffect(() => {
    setPhotoError(false)
  }, [fotoUrl, student?.nisn])

  const isValidPhoto = Boolean(
    fotoUrl &&
    typeof fotoUrl === 'string' &&
    fotoUrl.trim().length > 0 &&
    fotoUrl !== '-' &&
    fotoUrl !== 'null' &&
    fotoUrl !== 'undefined' &&
    !fotoUrl.includes('ui-avatars.com')
  )

  const kodeUjian = student.kodeUjian || '267A01'
  const ruangUjian = student.ruang || student.ruangUjian || raw.ruang || raw.ruang_ujian || settings.defaultRuang || '-'
  const portalUser = student.portalUsername || student.username || raw.username || kodeUjian
  const portalPass = student.portalPassword || student.password || raw.password || 'BM***'

  // Ambil layout offsets dari settings
  const layoutOffsets = settings.layoutOffsets || {}

  // Komponen kustom tambahan (Teks bebas, badge tambahan, catatan)
  const customComponents = useMemo(() => {
    if (!settings.customComponents && !settings.kartu_ujian_custom_components) return []
    try {
      const src = settings.customComponents || settings.kartu_ujian_custom_components
      const parsed = typeof src === 'string' ? JSON.parse(src) : src
      return Array.isArray(parsed) 
        ? parsed.filter(c => c && c.id && !['header_title', 'ribbon_tahun', 'badge_logo'].includes(c.id))
        : []
    } catch {
      return []
    }
  }, [settings.customComponents, settings.kartu_ujian_custom_components])

  // Komponen yang disembunyikan/dihapus
  const hiddenComponents = useMemo(() => {
    const list = settings.hiddenComponents || settings.kartu_ujian_hidden_components || []
    return Array.isArray(list) ? list : []
  }, [settings.hiddenComponents, settings.kartu_ujian_hidden_components])

  // Helper render wrapper untuk tiap komponen interaktif di Studio Editor
  const renderEditorBox = ({
    id,
    label,
    children,
    origin = 'center center',
    className: compClass = '',
    style = {},
    isAbsoluteDirect = false,
    scaleOverride,
    rotateOverride
  }) => {
    // Jika komponen dihapus / disembunyikan, jangan render sama sekali
    const isHidden = hiddenComponents.includes(id) || layoutOffsets[id]?.hidden === true
    if (isHidden) {
      return null
    }

    const offset = layoutOffsets[id] || {}
    const x = isAbsoluteDirect ? 0 : (offset.x || 0)
    const y = isAbsoluteDirect ? 0 : (offset.y || 0)
    const scaleVal = scaleOverride !== undefined ? scaleOverride : (offset.scale !== undefined ? offset.scale : 1)
    const rotateVal = rotateOverride !== undefined ? rotateOverride : (offset.rotate || 0)

    const parts = []
    if (x !== 0 || y !== 0) parts.push(`translate(${x}px, ${y}px)`)
    if (scaleVal !== 1) parts.push(`scale(${scaleVal})`)
    if (rotateVal !== 0) parts.push(`rotate(${rotateVal}deg)`)
    const transformStyle = parts.length > 0 ? parts.join(' ') : undefined

    const combinedStyle = {
      ...style,
      ...(transformStyle ? { transform: transformStyle, transformOrigin: origin } : {})
    }

    const isSelected = isEditorMode && activeComponent === id
    const isAbsolute = compClass.includes('absolute') || compClass.includes('fixed') || style?.position === 'absolute'
    const posClass = isAbsolute ? '' : 'relative'

    if (!isEditorMode) {
      return (
        <div style={combinedStyle} className={`${compClass} ${posClass}`}>
          {children}
        </div>
      )
    }

    return (
      <div
        style={combinedStyle}
        className={`${compClass} ${posClass} transition-[box-shadow,outline] select-none ${
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
          <div className="absolute -top-5 left-0 z-50 pointer-events-auto flex items-center gap-1 shadow-md">
            <span className="bg-indigo-600 text-white font-bold text-[8px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
              {label} ({x >= 0 ? `+${x}` : x}, {y >= 0 ? `+${y}` : y})
            </span>
            {id === 'tabel_kredensial' && onTogglePasswordVisibility && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePasswordVisibility()
                }}
                className={`text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow cursor-pointer transition-colors flex items-center gap-0.5 ${
                  settings.passwordVisibility === 'hide'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : (settings.passwordVisibility === 'mask' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700')
                }`}
                title="Ganti Mode Tampilan Password (Tampil / Sensor / Sembunyi Kolom)"
              >
                {settings.passwordVisibility === 'hide' ? '🚫 Pwd Sembunyi' : (settings.passwordVisibility === 'mask' ? '🔒 Pwd Sensor' : '👁️ Pwd Tampil')}
              </button>
            )}
            {onDeleteComponent && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteComponent(id)
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow cursor-pointer transition-colors flex items-center gap-0.5"
                title={`Hapus / Sembunyikan ${label}`}
              >
                ✕ Hapus
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    )
  }

  // Render elemen komponen kustom tambahan (Teks Bebas / Badge Kapsul)
  const renderCustomComponentItem = (comp) => {
    const offset = layoutOffsets[comp.id] || {}
    const compScale = offset.scale !== undefined ? offset.scale : ((Number(comp.size) || 100) / 100)
    const compRotate = offset.rotate !== undefined ? offset.rotate : (Number(comp.rotate) || 0)
    const compX = offset.x !== undefined ? offset.x : (Number(comp.x) || 0)
    const compY = offset.y !== undefined ? offset.y : (Number(comp.y) || 0)

    const initialX = Number(comp.initialX) || 180
    const initialY = Number(comp.initialY) || 130
    const finalLeft = initialX + compX
    const finalTop = initialY + compY

    const hasBorder = Boolean(comp.hasBorder)
    const borderStyleObj = hasBorder ? {
      borderWidth: `${comp.borderWidth || 1}px`,
      borderColor: comp.borderColor || (comp.type === 'badge' ? (comp.color || '#3730a3') : '#cbd5e1'),
      borderStyle: comp.borderStyle || 'solid'
    } : {
      border: 'none',
      borderWidth: '0px'
    }

    return (
      <React.Fragment key={comp.id}>
        {renderEditorBox({
          id: comp.id,
          label: comp.label || (comp.type === 'badge' ? 'Badge Kustom' : (comp.text || 'Teks Bebas')),
          className: 'absolute z-30 pointer-events-auto select-none',
          isAbsoluteDirect: true,
          scaleOverride: compScale,
          rotateOverride: compRotate,
          style: {
            position: 'absolute',
            left: `${finalLeft}px`,
            top: `${finalTop}px`,
            zIndex: 35
          },
          children: (
            comp.type === 'image' ? (
              <div
                data-custom-comp={comp.id}
                style={{
                  width: `${comp.width || 65}px`,
                  height: `${comp.height || 65}px`,
                  opacity: comp.opacity !== undefined ? comp.opacity : 1,
                  backgroundColor: comp.bgColor && comp.bgColor !== 'transparent' ? comp.bgColor : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  ...borderStyleObj
                }}
                className={`select-none ${
                  comp.shape === 'circle'
                    ? 'rounded-full'
                    : comp.shape === 'rounded'
                    ? 'rounded-lg'
                    : 'rounded-none'
                }`}
              >
                {comp.imageUrl ? (
                  <img
                    src={comp.imageUrl}
                    alt={comp.label || 'Gambar'}
                    crossOrigin="anonymous"
                    className="w-full h-full pointer-events-none select-none"
                    style={{ objectFit: comp.imageFit || 'contain' }}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 p-1 text-[8px] font-bold">
                    <span className="text-sm">🖼️</span>
                    <span>Gambar</span>
                  </div>
                )}
              </div>
            ) : comp.type === 'badge' ? (
              <div 
                data-custom-comp={comp.id}
                style={{ 
                  backgroundColor: comp.bgColor || '#e0e7ff', 
                  color: comp.color || '#3730a3',
                  fontSize: `${comp.fontSize || 8.5}px`,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...borderStyleObj
                }}
                className={`px-2.5 py-0.5 font-black uppercase tracking-wider shadow-2xs whitespace-nowrap leading-none ${
                  comp.shape === 'slanted' 
                    ? '-skew-x-12 rounded-xs' 
                    : comp.shape === 'rounded'
                    ? 'rounded-md'
                    : comp.shape === 'square'
                    ? 'rounded-none'
                    : 'rounded-full'
                }`}
              >
                {comp.icon ? <span className={comp.shape === 'slanted' ? 'skew-x-12 inline-block' : ''}>{comp.icon}</span> : null}
                <span className={comp.shape === 'slanted' ? 'skew-x-12 inline-block' : ''}>{comp.text || 'BADGE KUSTOM'}</span>
              </div>
            ) : (
              <div 
                data-custom-comp={comp.id}
                style={{ 
                  color: comp.color || '#0f172a',
                  fontSize: `${comp.fontSize || 10}px`,
                  fontWeight: comp.isBold !== false ? 'bold' : 'normal',
                  lineHeight: '1.1',
                  backgroundColor: comp.bgColor && comp.bgColor !== 'transparent' ? comp.bgColor : undefined,
                  ...borderStyleObj
                }}
                className="whitespace-nowrap px-1 py-0.5 rounded leading-none inline-block"
              >
                <span style={{ lineHeight: '1.1', display: 'inline-block' }}>{comp.text || 'Teks Tambahan'}</span>
              </div>
            )
          )
        })}
      </React.Fragment>
    )
  }

  return (
    <div
      ref={ref}
      data-card-type="kartu-ujian"
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
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        boxShadow: '0 0 0 2.5px #c8102e, 0 0 0 5px #ffffff, 0 0 0 8px #0a2558'
      }}
      className={`relative rounded-none overflow-hidden bg-white select-none text-left print:m-0 ${className}`}
    >
      {/* 1. BACKGROUND WATERMARK & GEOMETRIC ACCENTS */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.035]">
        <svg className="w-full h-full" viewBox="0 0 510 322" preserveAspectRatio="none">
          <circle cx="255" cy="161" r="140" stroke="#0a2558" strokeWidth="2" strokeDasharray="4 4" fill="none" />
          <circle cx="255" cy="161" r="110" stroke="#c8102e" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Watermark Logo Transparan di Tengah */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
        <img
          src={logoUrl}
          alt=""
          crossOrigin="anonymous"
          className="w-52 h-52 object-contain opacity-[0.05] select-none pointer-events-none"
        />
      </div>

      {/* 2. HEADER BANNER UTAMA (SESUAI GAMBAR REFERENSI) */}
      <div 
        data-card-header="kartu-ujian"
        style={{ position: 'absolute', top: 0, left: 0, width: '510px', height: '78px', minHeight: '78px', maxHeight: '78px', overflow: 'visible' }}
        className="w-full h-[78px] z-10 bg-transparent shrink-0"
      >
        {/* SVG Graphic Banner (Enclosed in its own 78px clipping box) */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '510px', height: '78px', overflow: 'hidden' }}>
          <svg viewBox="0 0 510 78" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {/* Sisi Kiri Bawah Red Diagonal Accent */}
            <polygon points="0,0 128,0 96,78 0,78" fill="#c8102e" />
            
            {/* Main Navy Slanted Background */}
            <polygon points="106,0 510,0 510,78 74,78" fill="#0a2558" />

            {/* Cyan & White Decorative Stripes di Pojok Kanan Atas */}
            <g opacity="0.85">
              <polygon points="418,0 425,0 411,18 404,18" fill="#ffffff" />
              <polygon points="430,0 437,0 423,18 416,18" fill="#38bdf8" />
              <polygon points="442,0 449,0 435,18 428,18" fill="#ffffff" />
              <polygon points="454,0 461,0 447,18 440,18" fill="#38bdf8" />
              <polygon points="466,0 473,0 459,18 452,18" fill="#ffffff" />
            </g>
          </svg>
        </div>

        {/* Shield / Logo Badge di Kiri Atas (Warna Biru Navy Resmi Budi Mulia) */}
        {renderEditorBox({
          id: 'badge_logo',
          label: 'Badge Logo Sekolah',
          className: 'absolute z-30',
          isAbsoluteDirect: true,
          scaleOverride: layoutOffsets['badge_logo']?.scale !== undefined ? layoutOffsets['badge_logo'].scale : 0.95,
          rotateOverride: layoutOffsets['badge_logo']?.rotate || 0,
          style: {
            position: 'absolute',
            left: `${16 + (layoutOffsets['badge_logo']?.x || 0)}px`,
            top: `${0 + (layoutOffsets['badge_logo']?.y || 0)}px`,
            zIndex: 30
          },
          children: (
            <div 
              style={{ width: '64px', height: '82px', minWidth: '64px', minHeight: '82px', flexShrink: 0 }}
              className="w-[64px] h-[82px] bg-gradient-to-b from-[#0d2f6f] via-[#0a2558] to-[#071b40] rounded-b-xl border-x-2 border-b-2 border-blue-400/40 shadow-md flex flex-col items-center justify-between py-1.5 px-1"
            >
              <img
                src={logoUrl}
                alt="Logo"
                crossOrigin="anonymous"
                style={{ width: '40px', height: '44px', minWidth: '40px', minHeight: '44px', maxWidth: '40px', maxHeight: '44px', objectFit: 'contain', flexShrink: 0 }}
                className="drop-shadow-sm mt-0.5 pointer-events-none shrink-0"
              />
              <div className="text-center leading-none mb-0.5 pointer-events-none shrink-0">
                <span className="text-[6.5px] font-black text-white tracking-tight uppercase block">
                  {settings.badgeNamaSekolah || 'BUDI MULIA'}
                </span>
                <span className="text-[5.5px] font-bold text-amber-400 tracking-widest block uppercase scale-90">
                  {settings.badgeKota || 'JAKARTA'}
                </span>
              </div>
            </div>
          )
        })}

        {/* Teks Header di Sisi Kanan (Navy Area) */}
        {renderEditorBox({
          id: 'header_title',
          label: 'Teks Header Judul',
          className: 'absolute top-2 left-28 right-5 z-20 text-white',
          children: (
            <div>
              {settings.headerInstansi && (
                <p className="text-[6.5px] font-extrabold tracking-widest text-white/90 uppercase drop-shadow-xs leading-tight mb-0.5">
                  {settings.headerInstansi}
                </p>
              )}
              <p className="text-[7.5px] font-bold tracking-wider text-blue-100 uppercase drop-shadow-xs leading-tight">
                {settings.headerSubTitle || `${subNamaSekolah} ${namaSekolah} JAKARTA`}
              </p>
              <h1 className="text-[17px] font-black tracking-wider text-white uppercase leading-tight font-sans drop-shadow-sm -mt-0.5">
                {judulUjian}
              </h1>
              <p className="text-[7px] font-bold tracking-widest text-slate-200 uppercase -mt-0.5">
                {subJudulUjian || 'UJIAN ASESMEN SUMATIF / PTS / PAS'}
              </p>
            </div>
          )
        })}

        {/* Ribbon Slanted Merah: Tahun Ajaran (Persis Bawah Judul di Gambar) */}
        {renderEditorBox({
          id: 'ribbon_tahun',
          label: 'Ribbon Tahun Ajaran',
          className: 'absolute bottom-1 left-[110px] z-20',
          children: (
            <div 
              className="-skew-x-12 bg-[#c8102e] rounded-xs shadow-sm flex items-center justify-center" 
              style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '3px', paddingBottom: '3px' }}
            >
              <span className="skew-x-12 block text-[8px] font-black text-white uppercase tracking-wider whitespace-nowrap" style={{ lineHeight: 1 }}>
                {tahunAjaran}{semester && semester.trim() ? ` • ${semester.trim()}` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* 3. CARD BODY: FOTO & QR (KIRI) + BIODATA & TABEL KREDENSIAL (KANAN) */}
      <div 
        data-card-body="kartu-ujian"
        style={{ position: 'absolute', top: '78px', left: 0, width: '510px', height: '236px', boxSizing: 'border-box' }}
        className="z-10 px-5 pt-2 pb-0.5 flex items-start gap-4 text-left"
      >
        
        {/* SISI KIRI: PAS FOTO SISWA (FRAME MERAH) & QR VERIFIKASI */}
        <div className="w-[96px] shrink-0 flex flex-col items-center">
          
          {/* Pas Foto Siswa dengan Double Border Merah (Persis Referensi) */}
          {renderEditorBox({
            id: 'foto',
            label: 'Pas Foto Siswa',
            className: 'w-full flex justify-center',
            children: (
              <div className="p-0.5 bg-white rounded-lg border-2 border-[#c8102e] shadow-sm">
                <div className="w-[88px] h-[112px] rounded-md overflow-hidden bg-slate-100 relative flex items-center justify-center">
                  {isValidPhoto && !photoError ? (
                    <img
                      src={fotoUrl}
                      alt={nama}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover pointer-events-none"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center pointer-events-none">
                      <span className="text-2xl">👤</span>
                      <span className="text-[7px] font-bold mt-1 text-slate-500">PAS FOTO 3x4</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* QR Code & Teks "SCAN UNTUK VERIFIKASI" (Persis Referensi) */}
          {renderEditorBox({
            id: 'qrcode',
            label: 'QR Code Verifikasi',
            className: 'mt-1 w-full',
            children: (
              <div className="flex items-center gap-2 justify-center">
                <div className="p-0.5 bg-white border border-slate-300 rounded shadow-2xs">
                  <QRCodeSVG
                    value={`BM-UJIAN|${kodeUjian}|${nisn}|${nama}|${kelas}|${ruangUjian || '-'}`}
                    size={34}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="text-left leading-none pointer-events-none">
                  <span className="text-[8.5px] font-black text-slate-900 uppercase block tracking-tight">
                    {settings.qrText1 || 'SCAN'}
                  </span>
                  <span className="text-[6.5px] font-bold text-slate-500 uppercase block leading-tight">
                    {settings.qrText2 || 'UNTUK'}
                  </span>
                  <span className="text-[7.5px] font-black text-[#0a2558] uppercase block tracking-tight">
                    {settings.qrText3 || 'VERIFIKASI'}
                  </span>
                </div>
              </div>
            )
          })}

        </div>

        {/* SISI KANAN: BIODATA SISWA + TABEL RUANG & KREDENSIAL + PENGESAHAN KEPSEK */}
        <div className="flex-1 min-w-0 flex flex-col justify-start gap-1.5 h-full pt-0.5">
          
          {/* BIODATA SISWA (Dua Kolom Rapi dengan Titik Dua Sejajar) */}
          {renderEditorBox({
            id: 'biodata',
            label: 'Biodata Siswa',
            className: 'w-full',
            children: (
              <div className="space-y-0.5 text-[9.5px] text-slate-800">
                <div className="flex items-start">
                  <span className="w-28 font-bold text-slate-600 shrink-0 uppercase tracking-wide">NAMA LENGKAP</span>
                  <span className="font-bold text-slate-800 mx-1">:</span>
                  <span
                    className="font-black text-slate-900 uppercase whitespace-nowrap overflow-visible max-w-[240px] inline-block"
                    style={{ lineHeight: 1.35, paddingBottom: '1px' }}
                    title={nama}
                  >
                    {nama}
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-28 font-bold text-slate-600 shrink-0 uppercase tracking-wide">NISN / NIPD</span>
                  <span className="font-bold text-slate-800 mx-1">:</span>
                  <span className="font-mono font-bold text-slate-800" style={{ lineHeight: 1.35 }}>
                    {nisn} {nipd !== '-' && `/ ${nipd}`}
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-28 font-bold text-slate-600 shrink-0 uppercase tracking-wide">KELAS</span>
                  <span className="font-bold text-slate-800 mx-1">:</span>
                  <span className="font-bold text-slate-900 uppercase" style={{ lineHeight: 1.35 }}>
                    {kelas}
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="w-28 font-bold text-slate-600 shrink-0 uppercase tracking-wide">NOMOR PESERTA</span>
                  <span className="font-bold text-slate-800 mx-1">:</span>
                  <span className="font-mono font-bold text-slate-900 tracking-wider text-[10px]" style={{ lineHeight: 1.35 }}>
                    {kodeUjian}
                  </span>
                </div>
              </div>
            )
          })}

          {/* TABEL RUANG & AKUN UJIAN (PERSIS TABEL "JADWAL UJIAN" DENGAN HEADER MERAH) */}
          {renderEditorBox({
            id: 'tabel_kredensial',
            label: 'Tabel Ruang & Akun',
            className: `mt-1.5 w-full flex ${
              settings.tabelAlign === 'center' ? 'justify-center' : (settings.tabelAlign === 'right' ? 'justify-end' : 'justify-start')
            }`,
            children: (() => {
              const visibility = settings.passwordVisibility || (settings.tampilkanPassword === false ? 'hide' : 'show')
              const isHideCol = visibility === 'hide'
              const isMask = visibility === 'mask'

              // Atur lebar tabel (default 100%, rentang 50% - 100%)
              const rawWidth = Number(settings.tabelWidth)
              const tabelWidth = !isNaN(rawWidth) && rawWidth > 0 ? rawWidth : 100
              const widthStyle = tabelWidth >= 100 ? '100%' : `${Math.max(45, tabelWidth)}%`

              // Atur perbesaran font teks tabel (default 100%, rentang 70% - 140%)
              const rawFontSize = Number(settings.tabelFontSize)
              const fontScale = (!isNaN(rawFontSize) && rawFontSize > 0 ? rawFontSize : 100) / 100

              const headerTitleSize = `${(7.5 * fontScale).toFixed(1)}px`
              const headerSubSize = `${(6.5 * fontScale).toFixed(1)}px`
              const colHeaderSize = `${(7 * fontScale).toFixed(1)}px`
              const dataTextSize = `${(9 * fontScale).toFixed(1)}px`

              const padYHeader = `${Math.max(1.5, 3 * fontScale).toFixed(1)}px`
              const padYCol = `${Math.max(1.5, 3 * fontScale).toFixed(1)}px`
              const padYData = `${Math.max(2, 5 * fontScale).toFixed(1)}px`

              return (
                <div 
                  style={{ width: widthStyle }}
                  className="border border-slate-300 rounded-lg overflow-hidden shadow-2xs transition-all box-border shrink-0"
                >
                  {/* Header Merah Tabel */}
                  <div 
                    className="bg-[#c8102e] text-white flex items-center justify-between" 
                    style={{ paddingLeft: '8px', paddingRight: '8px', paddingTop: padYHeader, paddingBottom: padYHeader }}
                  >
                    <span className="font-black uppercase tracking-wider" style={{ fontSize: headerTitleSize, lineHeight: 1.1 }}>
                      {settings.tabelHeaderJudul || 'RUANG & KREDENSIAL LOGIN CBT'}
                    </span>
                    <span className="font-bold uppercase tracking-widest text-red-100" style={{ fontSize: headerSubSize, lineHeight: 1.1 }}>
                      {settings.tabelSubHeaderKanan || 'SESI UJIAN'}
                    </span>
                  </div>

                  {/* Sub-Header Kolom Tabel (Otomatis 2 Kolom Jika Password Disembunyikan, atau 3 Kolom Jika Tampil/Sensor) */}
                  <div 
                    className={`grid ${isHideCol ? 'grid-cols-2' : 'grid-cols-3'} bg-slate-100 text-slate-700 font-black uppercase tracking-wider border-b border-slate-200 text-center`} 
                    style={{ paddingTop: padYCol, paddingBottom: padYCol, fontSize: colHeaderSize, lineHeight: 1.1 }}
                  >
                    <div className="border-r border-slate-200 flex items-center justify-center px-1">RUANG UJIAN</div>
                    <div className={`${isHideCol ? '' : 'border-r border-slate-200'} flex items-center justify-center px-1`}>USERNAME LOGIN</div>
                    {!isHideCol && <div className="flex items-center justify-center px-1">PASSWORD / PIN</div>}
                  </div>

                  {/* Baris Data Kredensial Siswa */}
                  <div 
                    className={`grid ${isHideCol ? 'grid-cols-2' : 'grid-cols-3'} bg-white divide-x divide-slate-200 font-semibold text-center items-center`} 
                    style={{ paddingTop: padYData, paddingBottom: padYData, fontSize: dataTextSize, lineHeight: 1.25 }}
                  >
                    <div className="px-1 flex items-center justify-center overflow-hidden">
                      {ruangUjian && ruangUjian !== '-' ? (
                        <span className="font-bold text-indigo-900 truncate">
                          {String(ruangUjian).toUpperCase().startsWith('R') ? ruangUjian : `Ruang ${ruangUjian}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">-</span>
                      )}
                    </div>
                    <div className="font-mono font-black text-[#0a2558] tracking-wide px-1 flex items-center justify-center overflow-hidden" style={{ whiteSpace: 'nowrap' }}>
                      <span className="truncate">{portalUser}</span>
                    </div>
                    {!isHideCol && (
                      <div className="font-mono font-black text-[#c8102e] tracking-wide px-1 flex items-center justify-center overflow-hidden" style={{ whiteSpace: 'nowrap' }}>
                        <span className="truncate">{isMask ? '••••••' : portalPass}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()
          })}

          {/* AREA BAWAH: BADGE LOKASI UJIAN (TENGAH) & TTD KEPALA SEKOLAH (KANAN) */}
          <div className="mt-1.5 flex items-end justify-between gap-2">
            
            {/* Badge Lokasi Ujian (Slanted Navy Pill Persis Referensi) */}
            {renderEditorBox({
              id: 'lokasi_ujian',
              label: 'Badge Lokasi Ujian',
              className: 'max-w-[155px]',
              children: (
                <div className="-skew-x-12 bg-[#0a2558] text-white px-2.5 py-1 rounded-sm shadow-2xs">
                  <div className="skew-x-12 pointer-events-none" style={{ lineHeight: 1.25 }}>
                    <span className="text-[6.5px] font-bold text-sky-300 uppercase block tracking-wider" style={{ lineHeight: 1.2 }}>
                      {settings.lokasiUjianLabel || 'LOKASI UJIAN:'}
                    </span>
                    <span className="text-[7.5px] font-black text-white uppercase block mt-0.5 overflow-visible whitespace-nowrap" style={{ lineHeight: 1.3 }}>
                      {settings.lokasiUjianText || 'GEDUNG SMP BUDI MULIA'}
                    </span>
                    <span className="text-[6px] text-slate-300 block overflow-visible whitespace-nowrap" style={{ lineHeight: 1.25 }}>
                      {settings.lokasiKotaText || 'JAKARTA'}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* PENGESAHAN KEPALA SEKOLAH (KANAN BAWAH - TANPA TANDA TANGAN SISWA) */}
            {renderEditorBox({
              id: 'pengesahan_kepsek',
              label: 'Pengesahan Kepala Sekolah',
              className: 'w-36 shrink-0',
              children: (
                <div className="flex flex-col items-center text-center w-full leading-tight">
                  <p className="text-[6.5px] font-medium text-slate-500 leading-none">
                    {tanggalTerbit}
                  </p>
                  <p className="text-[7.5px] font-bold text-[#0a2558] leading-none mt-0.5">
                    {jabatanPenandatangan},
                  </p>

                  {/* Area Tanda Tangan & Cap Stempel Kepala Sekolah (Dapat Digeser Individu) */}
                  <div className="relative w-32 h-7 my-0 flex items-center justify-center">
                    {/* Cap Stempel Sekolah (Bisa Digeser & Diskalakan Mandiri) */}
                    {renderEditorBox({
                      id: 'cap',
                      label: 'Cap Stempel Sekolah',
                      className: 'absolute left-2.5 -top-1 w-10 h-10 z-20 transition-transform pointer-events-auto',
                      children: capUrl ? (
                        <img
                          src={capUrl}
                          alt="Cap Stempel"
                          crossOrigin="anonymous"
                          className="w-full h-full object-contain opacity-85 pointer-events-none"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full border border-dashed border-red-400 flex items-center justify-center text-[6px] text-red-500 font-bold uppercase pointer-events-none bg-red-50/40">
                          CAP
                        </div>
                      )
                    })}

                    {/* Tanda Tangan Kepala Sekolah (Bisa Digeser & Diskalakan Mandiri) */}
                    {renderEditorBox({
                      id: 'ttd',
                      label: 'Tanda Tangan Kepsek',
                      className: 'relative z-10 w-24 h-8 flex items-center justify-center transition-transform pointer-events-auto',
                      children: ttdUrl ? (
                        <img
                          src={ttdUrl}
                          alt="TTD Kepala Sekolah"
                          crossOrigin="anonymous"
                          className="max-w-full max-h-full object-contain pointer-events-none"
                        />
                      ) : (
                        <div className="w-16 h-5 border border-dashed border-slate-300 rounded flex items-center justify-center text-[6px] text-slate-400 font-bold uppercase pointer-events-none bg-slate-50/50">
                          TTD KEPSEK
                        </div>
                      )
                    })}
                  </div>

                  <p className="text-[7.5px] font-black text-slate-900 leading-tight underline uppercase">
                    {namaPenandatangan}
                  </p>
                </div>
              )
            })}

          </div>

        </div>

      </div>

      {/* RENDER KOMPONEN KUSTOM TAMBAHAN PENGGUNA */}
      {customComponents.map(renderCustomComponentItem)}

      {/* 4. FOOTER STRIPES (CYAN, MERAH, & NAVY DI SUDUT BAWAH) */}
      <div 
        data-card-footer="kartu-ujian"
        style={{ position: 'absolute', bottom: 0, left: 0, width: '510px', height: '8px', overflow: 'hidden' }}
        className="w-full h-2 z-10 overflow-hidden bg-white shrink-0"
      >
        <svg viewBox="0 0 510 8" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {/* Garis Navy Bawah */}
          <rect x="0" y="5" width="510" height="3" fill="#0a2558" />
          {/* Aksen Slanted Stripes di Kiri Bawah */}
          <polygon points="12,0 18,0 10,8 4,8" fill="#38bdf8" />
          <polygon points="22,0 28,0 20,8 14,8" fill="#c8102e" />
          <polygon points="32,0 38,0 30,8 24,8" fill="#0a2558" />
          {/* Aksen Slanted Stripes di Kanan Bawah */}
          <polygon points="475,0 481,0 473,8 467,8" fill="#38bdf8" />
          <polygon points="485,0 491,0 483,8 477,8" fill="#c8102e" />
          <polygon points="495,0 501,0 493,8 487,8" fill="#0a2558" />
        </svg>
      </div>

    </div>
  )
})

KartuUjianCard.displayName = 'KartuUjianCard'

export default KartuUjianCard
