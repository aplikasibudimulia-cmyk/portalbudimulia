import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import DocxViewer from './DocxViewer'

const STORAGE_KEY_TTD_CONFIG = 'ebudimulia_surat_ttd_cap_config'

export const DEFAULT_TTD_CAP_CONFIG = {
  // Margin keseluruhan kotak TTD dari teks isi surat
  boxMarginTop: 24, // px
  boxMarginRight: 0, // px

  // Stempel / Cap Sekolah
  capOffsetX: 16, // px (horizontal relatif)
  capOffsetY: -8, // px (vertikal relatif)
  capSize: 105, // px (diameter stempel)
  capRotation: -5, // derajat kemiringan
  capOpacity: 85, // persentase kepekatan tinta (0 - 100)

  // Tanda Tangan Kepala Sekolah
  ttdOffsetX: 55, // px (horizontal relatif)
  ttdOffsetY: 0, // px (vertikal relatif)
  ttdWidth: 135, // px (lebar tanda tangan)

  // Identitas Penandatangan
  namaKepalaSekolah: '( Septian Ruswadi, S.Pd )'
}

export default function SuratDetailModal({ isOpen, onClose, suratData }) {
  const [isPrinting, setIsPrinting] = useState(false)
  const [viewMode, setViewMode] = useState('auto') // 'auto' | 'docx'
  const [showConfigDrawer, setShowConfigDrawer] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState('cap') // 'cap' | 'ttd' | 'box'
  const [saveSuccessToast, setSaveSuccessToast] = useState(false)

  // State Pengaturan Posisi Tanda Tangan & Cap (Tersimpan di localStorage)
  const [ttdConfig, setTtdConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TTD_CONFIG)
      if (saved) {
        return { ...DEFAULT_TTD_CAP_CONFIG, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Error load ttd cap config:', e)
    }
    return DEFAULT_TTD_CAP_CONFIG
  })

  // Sinkronisasi jika config berubah di storage lain
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY_TTD_CONFIG && e.newValue) {
        try {
          setTtdConfig({ ...DEFAULT_TTD_CAP_CONFIG, ...JSON.parse(e.newValue) })
        } catch (err) {
          console.error(err)
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  if (!isOpen || !suratData) return null

  const handlePrint = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 150)
  }

  const handleUpdateConfig = (key, value) => {
    setTtdConfig(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSaveConfig = () => {
    try {
      localStorage.setItem(STORAGE_KEY_TTD_CONFIG, JSON.stringify(ttdConfig))
      setSaveSuccessToast(true)
      setTimeout(() => setSaveSuccessToast(false), 3000)
    } catch (e) {
      console.error('Error save ttd cap config:', e)
    }
  }

  const handleResetConfig = () => {
    setTtdConfig(DEFAULT_TTD_CAP_CONFIG)
    try {
      localStorage.setItem(STORAGE_KEY_TTD_CONFIG, JSON.stringify(DEFAULT_TTD_CAP_CONFIG))
      setSaveSuccessToast(true)
      setTimeout(() => setSaveSuccessToast(false), 3000)
    } catch (e) {
      console.error('Error reset ttd cap config:', e)
    }
  }

  const {
    judul = 'Surat Pemberitahuan Hasil Pemeriksaan Kesehatan',
    nomorSurat = '084/SMP-BM/KES/IX/2026',
    tanggalSurat = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    kotaPengesahan = 'Jakarta',
    mengetahuiPengesahan = 'Mengetahui,',
    jabatanPengesahan = 'Kepala SMP Budi Mulia,',
    namaPengesahan = null,
    siswa = {},
    dataDetail = {},
    statusRekomendasi = 'Normal',
    docxBuffer = null,
    docxBase64 = null,
    kontenHtml = null,
    isiManual = null,
    isCkg = true
  } = suratData

  const docxDataToRender = docxBuffer || docxBase64 || null
  const isRujuk = statusRekomendasi?.toLowerCase().includes('rujuk') || statusRekomendasi?.toLowerCase().includes('perlu')
  const hasWordTemplate = Boolean(kontenHtml && kontenHtml.trim().length > 0)

  const modalNode = (
    <div id="surat-modal-portal">
      <style>{`
        #surat-printable-content,
        #surat-printable-content * {
          font-family: 'Times New Roman', Times, serif !important;
        }

        /* Perataan Titik Dua Dinamis per Grup/Poin */
        .surat-group-grid {
          display: grid;
          grid-template-columns: max-content 16px 1fr;
          align-items: baseline;
          row-gap: 2.5px;
          line-height: 1.5;
        }
        .surat-group-grid.surat-indent {
          margin-left: 1.5rem;
        }
        .surat-col-label {
          color: #000000;
          white-space: nowrap;
          padding-right: 4px;
        }
        .surat-col-sep {
          text-align: center;
          font-weight: bold;
          color: #000000;
        }
        .surat-col-val {
          color: #000000;
        }

        /* Fallback Baris Titik Dua per Poin (Word / non-grid) */
        .surat-colon-row {
          display: grid;
          align-items: baseline;
          margin-bottom: 2.5px;
          line-height: 1.5;
        }
        .surat-colon-row.surat-type-header {
          grid-template-columns: 80px 16px 1fr;
        }
        .surat-colon-row.surat-type-identitas {
          grid-template-columns: 110px 16px 1fr;
          margin-left: 1.5rem;
        }
        .surat-colon-row.surat-type-sub {
          grid-template-columns: 195px 16px 1fr;
          margin-left: 1.5rem;
        }
        .surat-colon-row:not([class*="surat-type-"]) {
          grid-template-columns: max-content 16px 1fr;
        }
        .surat-colon-row.surat-indent {
          margin-left: 1.5rem;
        }
        .surat-colon-label {
          font-weight: 500;
          color: #000000;
          padding-right: 4px;
        }
        .surat-colon-sep {
          text-align: center;
          font-weight: bold;
          color: #000000;
        }
        .surat-colon-val {
          color: #000000;
        }

        /* Sub-Judul Romawi (I. DATA PEMERIKSAAN, II. PEMERIKSAAN INDERA, III. KESIMPULAN) */
        .surat-section-heading {
          font-weight: bold;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          margin-top: 0.85rem;
          margin-bottom: 0.35rem;
          color: #000000;
        }

        /* Paragraf & Enter */
        .surat-rendered-body p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
          text-align: justify;
          white-space: pre-line;
        }
        .surat-rendered-body p:empty, 
        .surat-rendered-body p:has(br:only-child) {
          min-height: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .surat-rendered-body ol,
        ol.surat-numbered-list {
          list-style-type: decimal !important;
          padding-left: 1.75rem !important;
          margin-top: 0.35rem !important;
          margin-bottom: 0.65rem !important;
        }
        .surat-rendered-body ul,
        ul.surat-bullet-list {
          list-style-type: disc !important;
          padding-left: 1.75rem !important;
          margin-top: 0.35rem !important;
          margin-bottom: 0.65rem !important;
        }
        .surat-rendered-body li {
          display: list-item !important;
          margin-bottom: 0.3rem !important;
          line-height: 1.6 !important;
          color: #000000 !important;
        }
        .surat-rendered-body ol > li {
          list-style-type: decimal !important;
        }
        .surat-rendered-body ul > li {
          list-style-type: disc !important;
        }
        .surat-rendered-body table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin: 0.75rem 0 !important;
          font-size: 13px !important;
        }
        .surat-rendered-body th,
        .surat-rendered-body td {
          border: 1px solid #000000 !important;
          padding: 5px 8px !important;
          vertical-align: top !important;
        }
        .surat-rendered-body th {
          background-color: #f1f5f9 !important;
          font-weight: bold !important;
          text-align: left !important;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 15mm 10mm 15mm;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          #root {
            display: none !important;
          }
          body > *:not(#surat-modal-portal) {
            display: none !important;
          }
          #surat-modal-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          #surat-modal-portal .modal-overlay-bg {
            background: transparent !important;
            position: static !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          #surat-modal-portal .modal-top-bar,
          #surat-modal-portal .ttd-cap-settings-drawer,
          #surat-modal-portal button {
            display: none !important;
          }
          #surat-modal-portal .modal-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-height: none !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          #surat-modal-portal #surat-printable-content {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }
        }
      `}</style>

      <div className="modal-overlay-bg fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
        <div className="modal-card relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:rounded-none">
          
          {/* Modal Top Actions (Hidden on Print) */}
          <div className="modal-top-bar px-6 py-3.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                📄
              </span>
              <div>
                <h3 className="font-bold text-slate-800 text-sm leading-tight">Surat Pemberitahuan Resmi</h3>
                <p className="text-[11px] text-slate-500">{nomorSurat}</p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Toggle Mode Segmented Control (if Docx uploaded) */}
              {docxDataToRender && (
                <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewMode('auto')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'auto'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🌟 Kop & TTD Otomatis</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">Rekomendasi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('docx')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      viewMode === 'docx'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📄 Word Utuh</span>
                  </button>
                </div>
              )}

              {/* Tombol Pengaturan Geser TTD & Cap */}
              <button
                type="button"
                onClick={() => setShowConfigDrawer(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  showConfigDrawer
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
                title="Atur Posisi Geser Cap & Tanda Tangan"
              >
                <span>⚙️ Atur TTD &amp; Cap</span>
              </button>

              <button
                onClick={handlePrint}
                disabled={isPrinting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm hover:shadow cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>{isPrinting ? 'Menyiapkan...' : 'Cetak / Unduh PDF'}</span>
              </button>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Drawer Panel Pengaturan Geser TTD & Cap (Interactive Sliders) */}
          {showConfigDrawer && (
            <div className="ttd-cap-settings-drawer bg-amber-50/95 border-b border-amber-200 p-4 shrink-0 text-slate-800 print:hidden animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎯</span>
                  <div>
                    <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                      Pengaturan Posisi Tanda Tangan &amp; Cap Stempel
                    </h4>
                    <p className="text-[11px] text-amber-800">
                      Geser slider di bawah untuk mengatur letak dan ukuran stempel &amp; tanda tangan. Klik <strong>Simpan Posisi</strong> agar berlaku permanen untuk seluruh surat.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {saveSuccessToast && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] animate-pulse">
                      ✓ Posisi Tersimpan untuk Semua Surat!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    💾 Simpan Posisi
                  </button>
                  <button
                    type="button"
                    onClick={handleResetConfig}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                  >
                    ↺ Reset Standar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfigDrawer(false)}
                    className="w-7 h-7 rounded-xl bg-amber-200/70 hover:bg-amber-300 text-amber-900 flex items-center justify-center font-bold text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tabs Controller: Cap vs TTD vs Jarak */}
              <div className="flex items-center gap-2 mb-3 border-b border-amber-200/80 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('cap')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    activeConfigTab === 'cap' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  🔵 Stempel / Cap Sekolah
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('ttd')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    activeConfigTab === 'ttd' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  ✍️ Tanda Tangan
                </button>
                <button
                  type="button"
                  onClick={() => setActiveConfigTab('box')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    activeConfigTab === 'box' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  📐 Jarak &amp; Posisi Blok
                </button>
              </div>

              {/* Slider Controls */}
              {activeConfigTab === 'cap' && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs bg-white/80 p-3 rounded-2xl border border-amber-200/60">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Geser Horizontal: <strong className="text-indigo-600">{ttdConfig.capOffsetX}px</strong>
                    </label>
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      value={ttdConfig.capOffsetX}
                      onChange={(e) => handleUpdateConfig('capOffsetX', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Kiri</span><span>Kanan</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Geser Vertikal: <strong className="text-indigo-600">{ttdConfig.capOffsetY}px</strong>
                    </label>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={ttdConfig.capOffsetY}
                      onChange={(e) => handleUpdateConfig('capOffsetY', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Atas</span><span>Bawah</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Ukuran Cap: <strong className="text-indigo-600">{ttdConfig.capSize}px</strong>
                    </label>
                    <input
                      type="range"
                      min="70"
                      max="140"
                      value={ttdConfig.capSize}
                      onChange={(e) => handleUpdateConfig('capSize', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Kecil</span><span>Besar</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Kemiringan: <strong className="text-indigo-600">{ttdConfig.capRotation}°</strong>
                    </label>
                    <input
                      type="range"
                      min="-25"
                      max="25"
                      value={ttdConfig.capRotation}
                      onChange={(e) => handleUpdateConfig('capRotation', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Miring Kiri</span><span>Kanan</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Kepekatan Tinta: <strong className="text-indigo-600">{ttdConfig.capOpacity}%</strong>
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={ttdConfig.capOpacity}
                      onChange={(e) => handleUpdateConfig('capOpacity', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Transparan</span><span>Pekat</span>
                    </div>
                  </div>
                </div>
              )}

              {activeConfigTab === 'ttd' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/80 p-3 rounded-2xl border border-amber-200/60">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Geser Horizontal TTD: <strong className="text-indigo-600">{ttdConfig.ttdOffsetX}px</strong>
                    </label>
                    <input
                      type="range"
                      min="-60"
                      max="120"
                      value={ttdConfig.ttdOffsetX}
                      onChange={(e) => handleUpdateConfig('ttdOffsetX', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Kiri</span><span>Kanan</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Geser Vertikal TTD: <strong className="text-indigo-600">{ttdConfig.ttdOffsetY}px</strong>
                    </label>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={ttdConfig.ttdOffsetY}
                      onChange={(e) => handleUpdateConfig('ttdOffsetY', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Atas</span><span>Bawah</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Lebar Tanda Tangan: <strong className="text-indigo-600">{ttdConfig.ttdWidth}px</strong>
                    </label>
                    <input
                      type="range"
                      min="90"
                      max="180"
                      value={ttdConfig.ttdWidth}
                      onChange={(e) => handleUpdateConfig('ttdWidth', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Ringkas</span><span>Lebar</span>
                    </div>
                  </div>
                </div>
              )}

              {activeConfigTab === 'box' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/80 p-3 rounded-2xl border border-amber-200/60">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Jarak dari Isi Surat (Margin Top): <strong className="text-indigo-600">{ttdConfig.boxMarginTop}px</strong>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="70"
                      value={ttdConfig.boxMarginTop}
                      onChange={(e) => handleUpdateConfig('boxMarginTop', Number(e.target.value))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Rapat</span><span>Renggang</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Nama Kepala Sekolah:
                    </label>
                    <input
                      type="text"
                      value={ttdConfig.namaKepalaSekolah}
                      onChange={(e) => handleUpdateConfig('namaKepalaSekolah', e.target.value)}
                      className="w-full px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paper Container (Scrollable on Screen, Full Page on Print) */}
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-10 bg-white text-black font-serif print:overflow-visible print:p-0 print:bg-white" 
            id="surat-printable-content"
          >
            {viewMode === 'docx' && docxDataToRender ? (
              /* TAMPILAN RAW WORD DENGAN DOCX-PREVIEW */
              <DocxViewer docxData={docxDataToRender} />
            ) : (
              /* TAMPILAN RESMI STANDAR: KOP OTOMATIS + ISI SURAT + TTD/CAP OTOMATIS */
              <div className="max-w-3xl mx-auto">
                {/* 1. KOP SURAT RESMI SMP BUDI MULIA (SESUAI DOKUMEN RESMI) */}
                <div className="mb-4">
                  <div className="flex items-center gap-4 pb-2">
                    <img 
                      src="/assets/surat/logo_smp_budi_mulia.jpg" 
                      alt="Logo SMP Budi Mulia" 
                      style={{ width: '68px', height: '84px' }}
                      className="object-contain shrink-0"
                      onError={(e) => { e.target.src = '/logo.png' }}
                    />
                    <div className="flex-1 text-center font-serif text-black leading-tight">
                      <h1 className="text-[17px] sm:text-[18.5px] font-bold uppercase tracking-wide">
                        SEKOLAH MENENGAH PERTAMA ( SMP ) BUDI MULIA
                      </h1>
                      <p className="text-[13px] sm:text-[14px] font-bold tracking-widest uppercase mt-0.5">
                        STATUS : AKREDITASI  A
                      </p>
                      <p className="text-[12px] sm:text-[13px] font-semibold tracking-wide uppercase mt-0.5">
                        UNIT YAYASAN BUDI MULIA LOURDES
                      </p>
                      <p className="text-[11px] sm:text-[12px] mt-0.5 font-normal">
                        Jl. Mangga Besar No. 135 – Jakarta Pusat 10730
                      </p>
                      <p className="text-[10px] sm:text-[11px] mt-0.5 font-normal">
                        Telp. 021 – 6291767  Fax.021-6000739  e-mail : smpbudimulia51@Gmail.com
                      </p>
                      <p className="text-[10px] sm:text-[11px] mt-0.5 font-normal">
                        Website : www.smpbudimuliajakarta.sch.id
                      </p>
                    </div>
                    {/* Penyeimbang kanan agar teks kop tetap presisi di tengah halaman seperti MS Word */}
                    <div style={{ width: '68px' }} className="shrink-0 hidden sm:block print:block" />
                  </div>
                  {/* Garis Ganda Pemisah Kop Resmi (Garis tebal di atas, spasi 2.5px, garis tipis di bawah) */}
                  <div className="w-full mt-2 mb-4" style={{ width: '100%' }}>
                    <div style={{ height: '2.5px', backgroundColor: '#000000', width: '100%', marginBottom: '2.5px' }} />
                    <div style={{ height: '1px', backgroundColor: '#000000', width: '100%' }} />
                  </div>
                </div>

                {/* 2. ISI SURAT */}
                {hasWordTemplate && kontenHtml ? (
                  /* Render Template Word Pengguna (Hanya Isi Dokumen) dengan Titik Dua Sejajar & Sub-Judul Romawi */
                  <div 
                    className="surat-rendered-body text-[13px] leading-relaxed text-black mb-6"
                    dangerouslySetInnerHTML={{ __html: kontenHtml }}
                  />
                ) : (
                  /* Render Format Resmi Default CKG / Surat Pengumuman */
                  <>
                    {/* NOMOR & TANGGAL SURAT */}
                    <div className="flex justify-between items-start text-[13px] mb-4">
                      <div className="surat-group-grid">
                        <div className="surat-col-label">Nomor</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val">{nomorSurat}</div>

                        <div className="surat-col-label">Lampiran</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val">1 (satu) Berkas Hasil Skrining</div>

                        <div className="surat-col-label">Perihal</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val font-bold">{judul}</div>
                      </div>
                      <div className="text-right text-[13px]">
                        <p>Jakarta, {tanggalSurat}</p>
                      </div>
                    </div>

                    {/* KEPADA YTH */}
                    <div className="text-[13px] mb-4 leading-relaxed">
                      <p>Kepada Yth.</p>
                      <p className="font-medium">Bapak/Ibu Orang Tua / Wali Murid dari:</p>
                      <div className="mt-1 surat-group-grid surat-indent">
                        <div className="surat-col-label">Nama Siswa</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val font-bold uppercase">{siswa.nama || '—'}</div>

                        <div className="surat-col-label">Kelas</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val">{siswa.kelas || '—'}</div>

                        <div className="surat-col-label">NISN</div>
                        <div className="surat-col-sep">:</div>
                        <div className="surat-col-val">{siswa.nisn || '—'}</div>
                      </div>
                      <p className="mt-1">di Tempat</p>
                    </div>

                    {/* SALAM PEMBUKA & PENGANTAR */}
                    <div className="text-[13px] leading-relaxed text-justify space-y-2 mb-4">
                      <p>Dengan hormat,</p>
                      <p>
                        Teriring salam dan doa semoga Bapak/Ibu beserta keluarga senantiasa berada dalam lindungan Tuhan Yang Maha Esa serta diberikan kesehatan dan berkat yang melimpah. Dalam rangka mendukung tumbuh kembang optimal serta memantau status kesehatan murid, SMP Budi Mulia telah menyelenggarakan kegiatan Cek Kesehatan Gratis (CKG) / Skrining Kesehatan Berkala Tahun Ajaran 2026/2027.
                      </p>
                      <p>
                        Melalui surat ini, pihak sekolah bermaksud menyampaikan laporan hasil pemeriksaan kesehatan ananda sebagai berikut:
                      </p>
                    </div>

                    {/* TABEL / BARIS DATA PEMERIKSAAN MEDIS (JIKA CKG) */}
                    {isCkg && (
                      <div className="space-y-3 mb-4">
                        {/* I. DATA PEMERIKSAAN FISIK & VITAL */}
                        <div>
                          <div className="surat-section-heading">
                            I. DATA PEMERIKSAAN FISIK &amp; VITAL
                          </div>
                          <div className="surat-group-grid surat-indent text-[13px] mt-1">
                            <div className="surat-col-label">a. Tinggi Badan (TB)</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">{dataDetail.tb ? `${dataDetail.tb} cm` : '—'}</div>

                            <div className="surat-col-label">b. Berat Badan (BB)</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">{dataDetail.bb ? `${dataDetail.bb} kg` : '—'}</div>

                            <div className="surat-col-label">c. Indeks Massa Tubuh (IMT)</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">
                              {dataDetail.imt ? `${Number(dataDetail.imt).toFixed(1)} kg/m²` : '—'}
                            </div>

                            <div className="surat-col-label">d. Tekanan Darah</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">{dataDetail.tensi ? `${dataDetail.tensi} mmHg` : '—'}</div>

                            <div className="surat-col-label">e. Kadar Hemoglobin (Hb)</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">{dataDetail.hb ? `${dataDetail.hb} g/dL` : '—'}</div>

                            <div className="surat-col-label">f. Gula Darah Sewaktu (GDS)</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">{dataDetail.gds ? `${dataDetail.gds} mg/dL` : '—'}</div>
                          </div>
                        </div>

                        {/* II. PEMERIKSAAN INDERA & ORGAN */}
                        <div>
                          <div className="surat-section-heading">
                            II. PEMERIKSAAN INDERA &amp; ORGAN
                          </div>
                          <div className="surat-group-grid surat-indent text-[13px] mt-1">
                            <div className="surat-col-label">a. Telinga &amp; Pendengaran</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">
                              {dataDetail.telinga || 'Tajam pendengaran baik'} / Serumen: {dataDetail.serumen || 'Tidak (Bersih)'}
                            </div>

                            <div className="surat-col-label">b. Mata &amp; Penglihatan</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">
                              {dataDetail.visus || 'Normal (Visus 6/6)'} (Kacamata: {dataDetail.kacamata || 'Tidak'})
                            </div>

                            <div className="surat-col-label">c. Gigi &amp; Rongga Mulut</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val">
                              {dataDetail.gigi || 'Tidak ada karies (Bersih)'}
                            </div>
                          </div>
                        </div>

                        {/* III. KESIMPULAN & ANJURAN TINDAK LANJUT */}
                        <div>
                          <div className="surat-section-heading">
                            III. KESIMPULAN &amp; ANJURAN TINDAK LANJUT
                          </div>
                          <div className="surat-group-grid surat-indent text-[13px] mt-1">
                            <div className="surat-col-label font-bold">a. Status Rekomendasi Medis</div>
                            <div className="surat-col-sep">:</div>
                            <div className="surat-col-val font-bold">
                              {statusRekomendasi || (isRujuk ? 'Perlu Rujukan' : 'Normal / Dalam Batas Wajar')}
                            </div>
                          </div>
                        </div>

                        {/* Catatan Bagi Orang Tua */}
                        <div className="text-[12px] leading-relaxed italic text-justify pt-1">
                          <p className="font-semibold not-italic">Catatan Bagi Orang Tua:</p>
                          <p className="mt-0.5">
                            - Apabila hasil pemeriksaan dalam batas NORMAL: Mohon agar ananda tetap didampingi untuk menjaga pola makan bergizi seimbang, asupan air putih yang cukup, menjaga kebersihan gigi, serta membatasi durasi penggunaan gawai (gadget).
                          </p>
                          <p className="mt-0.5">
                            - Apabila tercatat PERLU RUJUKAN: Kami menyarankan Bapak/Ibu untuk mendampingi ananda memeriksakan diri lebih lanjut ke Fasilitas Kesehatan / Puskesmas terdekat (Poli Gigi / Poli Mata / Dokter Umum) dengan membawa salinan lembar surat pemberitahuan ini.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* KONTEN TEKS MANUAL JIKA ADA */}
                    {isiManual && (
                      <div className="text-[13px] whitespace-pre-line mb-4">
                        {isiManual}
                      </div>
                    )}

                    {/* PARAGRAF PENUTUP */}
                    <div className="text-[13px] leading-relaxed text-justify mb-5">
                      <p>
                        Demikian pemberitahuan ini kami sampaikan. Atas perhatian, kerja sama yang baik, dan perhatian Bapak/Ibu terhadap kesehatan putra-putri kita, kami mengucapkan terima kasih.
                      </p>
                    </div>
                  </>
                )}

                {/* 3. TANDA TANGAN & CAP RESMI KEPALA SEKOLAH (DENGAN POSISI & UKURAN TERUKUR) */}
                <div 
                  className="flex justify-end text-[13px] text-black break-inside-avoid"
                  style={{
                    marginTop: `${ttdConfig.boxMarginTop}px`,
                    marginRight: `${ttdConfig.boxMarginRight || 0}px`
                  }}
                >
                  <div className="w-72 text-center">
                    <p>{kotaPengesahan}, {tanggalSurat}</p>
                    <p className="font-semibold text-black mt-0.5">{mengetahuiPengesahan}</p>
                    <p className="font-semibold text-black">{jabatanPengesahan}</p>
                    
                    {/* Ruang Stempel & TTD Overlap Terukur */}
                    <div className="relative h-24 my-1 flex items-center justify-center">
                      {/* Cap Stempel Resmi SMP Budi Mulia */}
                      <img
                        src="/assets/surat/cap_sekolah_budi_mulia.png"
                        alt="Cap SMP Budi Mulia"
                        style={{
                          width: `${ttdConfig.capSize}px`,
                          height: `${ttdConfig.capSize}px`,
                          left: `${ttdConfig.capOffsetX}px`,
                          top: `${ttdConfig.capOffsetY}px`,
                          transform: `rotate(${ttdConfig.capRotation}deg)`,
                          opacity: ttdConfig.capOpacity / 100
                        }}
                        className="absolute object-contain pointer-events-none select-none transition-all duration-75"
                      />
                      {/* Tanda Tangan Resmi Kepala Sekolah */}
                      <img
                        src="/assets/surat/ttd_kepala_sekolah.png"
                        alt="Tanda Tangan Kepala Sekolah"
                        style={{
                          width: `${ttdConfig.ttdWidth}px`,
                          left: `${ttdConfig.ttdOffsetX}px`,
                          top: `${ttdConfig.ttdOffsetY}px`
                        }}
                        className="absolute object-contain pointer-events-none select-none z-10 transition-all duration-75"
                      />
                    </div>

                    <p className="font-bold underline text-black tracking-wide mt-2">
                      {namaPengesahan || ttdConfig.namaKepalaSekolah || '( Septian Ruswadi, S.Pd )'}
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )

  return createPortal(modalNode, document.body)
}
