import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'
import { 
  parseExcelFile, 
  parseDocxTemplate, 
  renderLetterHtml, 
  downloadCkgSampleDocx,
  mergeDocxTemplate,
  arrayBufferToBase64,
  DEFAULT_SURAT_BUILDER_STATE,
  renderStructuredLetterHtml
} from '../utils/suratSebaranHelper'
import SuratDetailModal, { DEFAULT_TTD_CAP_CONFIG } from './SuratDetailModal'
import DocxViewer from './DocxViewer'
import SuratVisualBuilder from './SuratVisualBuilder'

export default function AdminSuratSebaranSection({ readOnly = false }) {
  // Riwayat surat yang tersimpan di localStorage / Supabase
  const [historyList, setHistoryList] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [previewSuratData, setPreviewSuratData] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Wizard Step (1: Form & Target, 2: Upload Files, 3: Preview & Validasi)
  const [step, setStep] = useState(1)

  // Form State
  const [judul, setJudul] = useState('')
  const [nomorSurat, setNomorSurat] = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(
    new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  )
  const [mode, setMode] = useState('template') // 'template' | 'manual'
  const [targetRoles, setTargetRoles] = useState({ ortu: true, siswa: true, guru: false })
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL') // 'ALL' or specific class

  // File & Parsing State
  const [excelData, setExcelData] = useState(null)
  const [docxData, setDocxData] = useState(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [isiManual, setIsManual] = useState('')

  // Pilihan Format Surat di Step 2 ('builder' | 'docx')
  const [formatMode, setFormatMode] = useState('builder')

  // State Formulir Penyusun Surat Visual (Tersimpan di localStorage)
  const [builderState, setBuilderState] = useState(() => {
    try {
      const saved = localStorage.getItem('ebudimulia_surat_builder_custom')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.error(e)
    }
    return DEFAULT_SURAT_BUILDER_STATE
  })

  const handleBuilderChange = (newState) => {
    setBuilderState(newState)
    try {
      localStorage.setItem('ebudimulia_surat_builder_custom', JSON.stringify(newState))
    } catch (e) {
      console.error(e)
    }
  }

  const handleResetBuilderStandard = () => {
    setBuilderState(DEFAULT_SURAT_BUILDER_STATE)
    try {
      localStorage.setItem('ebudimulia_surat_builder_custom', JSON.stringify(DEFAULT_SURAT_BUILDER_STATE))
    } catch (e) {
      console.error(e)
    }
  }

  // Previewer State
  const [previewIndex, setPreviewIndex] = useState(0)
  const [activeValidationTab, setActiveValidationTab] = useState('valid') // 'valid' | 'kosong' | 'tidak_masuk'
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 })

  // State sinkronisasi posisi Tanda Tangan & Cap dari konfigurasi global
  const [ttdConfig, setTtdConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('ebudimulia_surat_ttd_cap_config')
      if (saved) return { ...DEFAULT_TTD_CAP_CONFIG, ...JSON.parse(saved) }
    } catch (e) {
      console.error(e)
    }
    return DEFAULT_TTD_CAP_CONFIG
  })

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'ebudimulia_surat_ttd_cap_config' && e.newValue) {
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

  const fileExcelInputRef = useRef(null)
  const fileDocxInputRef = useRef(null)

  const [dbStudentsMap, setDbStudentsMap] = useState(new Map())

  // Load history from localStorage & fetch students dari Manajemen Akun sebagai acuan resmi
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ebudimulia_surat_sebaran_history')
      if (saved) {
        setHistoryList(JSON.parse(saved))
      }
    } catch (e) {
      console.warn('Error load history:', e)
    }

    const fetchDbStudents = async () => {
      try {
        const { data, error } = await supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
        if (data && !error) {
          const map = new Map()
          data.forEach(s => {
            if (s.nisn) {
              const norm = String(s.nisn).trim().padStart(10, '0')
              map.set(norm, s)
              map.set(String(s.nisn).trim(), s)
            }
          })
          setDbStudentsMap(map)
        }
      } catch (err) {
        console.warn('Error load db students for verification:', err)
      }
    }
    fetchDbStudents()
  }, [])

  const saveHistory = (newEntry) => {
    const updated = [newEntry, ...historyList]
    setHistoryList(updated)
    try {
      localStorage.setItem('ebudimulia_surat_sebaran_history', JSON.stringify(updated))
    } catch (e) {
      console.warn('Error save history:', e)
    }
  }

  // Handle Target Role Toggle
  const toggleRole = (role) => {
    setTargetRoles(prev => ({ ...prev, [role]: !prev[role] }))
  }

  // Handle Excel Upload
  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    setUploadError(null)

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseExcelFile(buffer, dbStudentsMap)
      if (!parsed.students || parsed.students.length === 0) {
        throw new Error('Tidak ada data siswa yang valid di file Excel ini.')
      }
      setExcelData(parsed)
      setPreviewIndex(0)
    } catch (err) {
      console.error('Error parse Excel:', err)
      setUploadError(err.message || 'Gagal membaca file Excel.')
    } finally {
      setIsProcessingFile(false)
    }
  }

  // Handle Docx Upload
  const handleDocxUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    setUploadError(null)

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseDocxTemplate(buffer)
      if (!parsed.success) {
        throw new Error(parsed.error || 'Gagal mengurai template Word.')
      }
      setDocxData(parsed)
    } catch (err) {
      console.error('Error parse Docx:', err)
      setUploadError(err.message || 'Gagal membaca file Word.')
    } finally {
      setIsProcessingFile(false)
    }
  }

  // Filtered Students based on selectedClassFilter
  const filteredStudents = (excelData?.students || []).filter(s => {
    if (selectedClassFilter === 'ALL') return true
    return s.kelas === selectedClassFilter
  })

  // Current preview student
  const currentStudent = filteredStudents[previewIndex] || filteredStudents[0] || null

  // Daftar tag placeholder dinamis (dari Excel + tag CKG default)
  const availableTags = useMemo(() => {
    const defaultTags = [
      'Nama', 'Kelas', 'NISN', 'JK',
      'TB (cm)', 'BB (kg)', 'Indeks Massa Tubuh (kg/m2)', 'Tekanan Darah',
      'HB', 'GDS', 'Tajam Pendengaran', 'Serumen Impaksi',
      'Tajam Penglihatan', 'Penggunaan Kacamata', 'Gigi', 'Kesimpulan'
    ]
    if (excelData?.headers && excelData.headers.length > 0) {
      const set = new Set([...excelData.headers, ...defaultTags])
      return Array.from(set)
    }
    return defaultTags
  }, [excelData])

  // State docx buffer preview yang sudah di-merge untuk siswa yang sedang dipilih
  const [currentDocxPreviewBuffer, setCurrentDocxPreviewBuffer] = useState(null)
  // State pilihan tampilan pratinjau Step 3 ('auto' | 'docx')
  const [step3PreviewMode, setStep3PreviewMode] = useState('auto')

  // HTML ter-render untuk siswa yang sedang dipilih di preview (Kop & TTD otomatis)
  const currentStudentHtml = useMemo(() => {
    if (!currentStudent) return null

    if (formatMode === 'builder') {
      return renderStructuredLetterHtml(builderState, currentStudent.rowDict || {}, {
        nomorSurat: builderState.nomorSurat || nomorSurat,
        lampiran: builderState.lampiran,
        perihal: builderState.perihal || judul,
        kepada: builderState.tujuanTipe,
        tanggalSurat,
        kotaTanggal: `${builderState.pengesahan?.kota || 'Jakarta'}, ${tanggalSurat}`,
        namaKepalaSekolah: builderState.pengesahan?.nama || ttdConfig.namaKepalaSekolah || '( Septian Ruswadi, S.Pd )'
      })
    }

    if (docxData?.rawHtml) {
      return renderLetterHtml(docxData.rawHtml, currentStudent.rowDict || {}, {
        judul,
        nomorSurat,
        tanggalSurat
      })
    }

    return null
  }, [formatMode, builderState, docxData?.rawHtml, currentStudent, judul, nomorSurat, tanggalSurat, ttdConfig.namaKepalaSekolah])

  useEffect(() => {
    if (docxData?.arrayBuffer && currentStudent) {
      mergeDocxTemplate(docxData.arrayBuffer, currentStudent.rowDict || {}, {
        judul,
        nomorSurat,
        tanggalSurat
      }).then(buf => {
        setCurrentDocxPreviewBuffer(buf)
      }).catch(err => {
        console.error('Error generating preview docx:', err)
      })
    } else {
      setCurrentDocxPreviewBuffer(null)
    }
  }, [docxData, currentStudent, judul, nomorSurat, tanggalSurat])

  // Build Surat Data for Preview & Sending
  const buildCurrentSuratData = async (student) => {
    if (!student) return null

    let mergedArrayBuffer = null
    let docxBase64 = null
    let renderedHtml = null

    if (formatMode === 'builder') {
      renderedHtml = renderStructuredLetterHtml(builderState, student.rowDict || {}, {
        nomorSurat: builderState.nomorSurat || nomorSurat,
        lampiran: builderState.lampiran,
        perihal: builderState.perihal || judul,
        kepada: builderState.tujuanTipe,
        tanggalSurat,
        kotaTanggal: `${builderState.pengesahan?.kota || 'Jakarta'}, ${tanggalSurat}`,
        namaKepalaSekolah: builderState.pengesahan?.nama || ttdConfig.namaKepalaSekolah || '( Septian Ruswadi, S.Pd )'
      })
    } else {
      if (docxData?.arrayBuffer) {
        mergedArrayBuffer = await mergeDocxTemplate(docxData.arrayBuffer, student.rowDict || {}, {
          judul,
          nomorSurat,
          tanggalSurat
        })
        if (mergedArrayBuffer) {
          docxBase64 = arrayBufferToBase64(mergedArrayBuffer)
        }
      }

      if (docxData?.rawHtml) {
        renderedHtml = renderLetterHtml(docxData.rawHtml, student.rowDict || {}, {
          judul,
          nomorSurat,
          tanggalSurat
        })
      }
    }

    return {
      judul: (formatMode === 'builder' && builderState.perihal) ? builderState.perihal : judul,
      nomorSurat: (formatMode === 'builder' && builderState.nomorSurat) ? builderState.nomorSurat : nomorSurat,
      tanggalSurat,
      kotaPengesahan: builderState.pengesahan?.kota || 'Jakarta',
      mengetahuiPengesahan: builderState.pengesahan?.mengetahui || 'Mengetahui,',
      jabatanPengesahan: builderState.pengesahan?.jabatan || 'Kepala SMP Budi Mulia,',
      namaPengesahan: builderState.pengesahan?.nama || ttdConfig.namaKepalaSekolah || '( Septian Ruswadi, S.Pd )',
      siswa: {
        nama: student.nama,
        kelas: student.kelas,
        nisn: student.nisn,
        jk: student.jk
      },
      dataDetail: {
        tb: student.tb,
        bb: student.bb,
        imt: student.imt,
        tensi: student.tensi,
        hb: student.hb,
        gds: student.gds,
        telinga: student.telinga,
        serumen: student.serumen,
        infeksi: student.infeksiTelinga,
        visus: student.visus,
        kacamata: student.kacamata,
        gigi: student.gigi,
        karies: student.karies
      },
      statusRekomendasi: student.statusRekomendasi,
      docxBuffer: mergedArrayBuffer,
      docxBase64,
      kontenHtml: renderedHtml,
      isiManual: mode === 'manual' ? isiManual : null,
      isCkg: !docxData?.arrayBuffer && !renderedHtml && Boolean(excelData?.isCkg)
    }
  }

  // Buka Modal Preview Cetak A4
  const openSuratPreviewModal = async (student) => {
    const data = await buildCurrentSuratData(student || currentStudent)
    if (data) {
      setPreviewSuratData(data)
      setIsPreviewOpen(true)
    }
  }

  // Handle Kirim Surat Sebaran ke Database Supabase (Tabel Notifikasi)
  const handleKirimSuratSebaran = async () => {
    if (!targetRoles.ortu && !targetRoles.siswa && !targetRoles.guru) {
      alert('Pilih minimal satu target penerima (Orang Tua, Siswa, atau Guru).')
      return
    }

    const studentsToSend = filteredStudents
    if (studentsToSend.length === 0) {
      alert('Tidak ada data siswa untuk dikirimkan.')
      return
    }

    const targetList = []
    if (targetRoles.ortu) targetList.push('Orang Tua')
    if (targetRoles.siswa) targetList.push('Siswa')
    if (targetRoles.guru) targetList.push('Guru')

    const confirmMsg = `Kirim Surat Sebaran "${judul}" kepada ${studentsToSend.length} siswa untuk target: ${targetList.join(', ')}?\n\nSurat akan langsung muncul di panel notifikasi aplikasi masing-masing.`
    if (!window.confirm(confirmMsg)) return

    setIsSending(true)
    setSendProgress({ current: 0, total: studentsToSend.length })

    try {
      const BATCH_SIZE = 15
      let totalInserted = 0

      for (let i = 0; i < studentsToSend.length; i += BATCH_SIZE) {
        const chunk = studentsToSend.slice(i, i + BATCH_SIZE)
        const notifInserts = []

        for (const st of chunk) {
          const suratObj = await buildCurrentSuratData(st)
          // Hapus buffer biner mentah dari JSON payload, simpan docxBase64
          const jsonSuratObj = { ...suratObj }
          delete jsonSuratObj.docxBuffer
          
          // Buat ringkasan teks singkat untuk notifikasi lonceng & push notification
          let ringkasanTeks = `Yth. Bapak/Ibu ${st.nama} (${st.kelas}),\n`
          if (excelData?.isCkg) {
            ringkasanTeks += `Hasil CKG: TB ${st.tb}cm, BB ${st.bb}kg (IMT ${st.imt || '-'}), Tensi ${st.tensi || '-'}.\nStatus: ${st.statusRekomendasi}.\nKlik untuk membuka lembar surat resmi & cetak PDF.`
          } else {
            ringkasanTeks += `Telah diterbitkan surat resmi: "${judul}". Silakan buka untuk melihat rincian surat & cetak PDF.`
          }

          // Simpan payload surat terstruktur di pesan dengan tag pembeda
          const suratPayloadString = `__SURAT_SEBARAN_PAYLOAD__${JSON.stringify(jsonSuratObj)}`

          notifInserts.push({
            judul: `[SURAT RESMI] ${judul}`,
            pesan: `${ringkasanTeks}\n\n${suratPayloadString}`,
            tipe: 'surat',
            target_nisn: st.nisn || null,
            target_kelas: st.kelas || null,
            dibuat_oleh: 'Admin SMP Budi Mulia'
          })
        }

        const { error } = await supabase.from('notifikasi').insert(notifInserts)
        if (error) throw error

        totalInserted += chunk.length
        setSendProgress({ current: totalInserted, total: studentsToSend.length })
      }

      // Catat log activity
      logActivity({
        userRole: 'Admin',
        action: 'Kirim Surat Sebaran',
        details: `Mengirim ${judul} ke ${studentsToSend.length} siswa (${targetList.join(', ')})`
      })

      // Simpan ke riwayat lokal
      saveHistory({
        id: `surat_${Date.now()}`,
        judul,
        nomorSurat,
        tanggalSurat,
        targetRoles: targetList,
        totalSiswa: studentsToSend.length,
        kelasFilter: selectedClassFilter,
        isCkg: excelData?.isCkg || false,
        sentAt: new Date().toISOString()
      })

      alert(`✓ Berhasil! Surat sebaran telah berhasil dikirimkan kepada ${studentsToSend.length} akun siswa & orang tua.`)
      setIsModalOpen(false)
      resetForm()
    } catch (err) {
      console.error('Error saat kirim surat sebaran:', err)
      alert(`Gagal mengirimkan surat sebaran: ${err.message}`)
    } finally {
      setIsSending(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setExcelData(null)
    setDocxData(null)
    setUploadError(null)
    setSelectedClassFilter('ALL')
    setPreviewIndex(0)
    setIsManual('')
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER SECTION (STANDAR APLIKASI EBUDIMULIA) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Surat Sebaran & Pemberitahuan Resmi</h2>
          <p className="text-sm text-slate-500 mt-1">
            Kirim surat pemberitahuan resmi terpersonalisasi secara massal kepada Orang Tua, Siswa, dan Guru melalui Mail Merge Word & Excel.
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={downloadCkgSampleDocx}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
              title="Unduh contoh template Word dengan Kop SMP Budi Mulia dan tag Mail Merge"
            >
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Unduh Contoh Template Word (.docx)</span>
            </button>

            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Buat Surat Sebaran Baru</span>
            </button>
          </div>
        )}
      </div>

      {/* RIWAYAT PENGIRIMAN SURAT */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Riwayat Surat Sebaran Terkirim</h3>
            <p className="text-xs text-slate-500 mt-0.5">Daftar publikasi surat personalisasi ke akun orang tua dan siswa</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
            {historyList.length} Pengiriman
          </span>
        </div>

        {historyList.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-sm font-semibold text-slate-600">Belum ada riwayat surat sebaran.</p>
            <p className="text-xs text-slate-400">
              Klik tombol &quot;Buat Surat Sebaran Baru&quot; di atas untuk mulai membuat dan mengirimkan surat.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tanggal Kirim</th>
                  <th className="py-3 px-4">Judul & Nomor Surat</th>
                  <th className="py-3 px-4">Target Penerima</th>
                  <th className="py-3 px-4 text-center">Jumlah Siswa</th>
                  <th className="py-3 px-4 text-center">Kelas</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyList.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {new Date(item.sentAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        {item.isCkg && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">CKG</span>}
                        <span>{item.judul}</span>
                      </div>
                      <span className="text-xs text-slate-500 font-normal block mt-0.5">No: {item.nomorSurat}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {item.targetRoles?.map((r, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                      {item.totalSiswa} Siswa
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-600">
                      {item.kelasFilter === 'ALL' ? 'Semua Kelas' : `Kelas ${item.kelasFilter}`}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Terkirim
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL WIZARD: BUAT SURAT SEBARAN BARU */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Buat Surat Sebaran Baru</h3>
                <p className="text-xs text-slate-500">
                  Langkah {step} dari 3: {step === 1 ? 'Pengaturan Surat & Target' : step === 2 ? 'Upload File & Pemetaan' : 'Validasi & Preview Live'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Stepper Indicator */}
            <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-3 text-xs font-semibold text-slate-600">
              <span className={`flex items-center gap-1.5 ${step === 1 ? 'text-indigo-600 font-bold' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>1</span>
                Pengaturan
              </span>
              <span>➔</span>
              <span className={`flex items-center gap-1.5 ${step === 2 ? 'text-indigo-600 font-bold' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>2</span>
                Upload Excel / Word
              </span>
              <span>➔</span>
              <span className={`flex items-center gap-1.5 ${step === 3 ? 'text-indigo-600 font-bold' : ''}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>3</span>
                Preview & Kirim
              </span>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* STEP 1: PENGATURAN SURAT & TARGET */}
              {step === 1 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Judul / Perihal Surat *
                      </label>
                      <input
                        type="text"
                        value={judul}
                        onChange={(e) => setJudul(e.target.value)}
                        placeholder="Contoh: Surat Pemberitahuan Kegiatan Sekolah / Edaran Resmi"
                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Nomor Surat Resmi *
                      </label>
                      <input
                        type="text"
                        value={nomorSurat}
                        onChange={(e) => setNomorSurat(e.target.value)}
                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Tanggal Surat *
                      </label>
                      <input
                        type="text"
                        value={tanggalSurat}
                        onChange={(e) => setTanggalSurat(e.target.value)}
                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Mode Pilihan */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Bentuk / Metode Surat
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div 
                        onClick={() => setMode('template')}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition ${
                          mode === 'template' 
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-xs' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📋</span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900">Template Dinamis (Mail Merge)</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Upload file Excel data & template Word (.docx). Surat personal per penerima.</p>
                          </div>
                        </div>
                      </div>

                      <div 
                        onClick={() => setMode('manual')}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition ${
                          mode === 'manual' 
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-xs' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">✍️</span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900">Tulis Manual (Edaran Umum)</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Tulis teks pengumuman bebas tanpa perlu upload Excel khusus.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Target Penerima (Multi-select) */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Target Akun Penerima di Aplikasi (Bisa Pilih Lebih Dari 1) *
                    </label>
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={targetRoles.ortu}
                          onChange={() => toggleRole('ortu')}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm font-bold text-slate-800">Orang Tua Siswa</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={targetRoles.siswa}
                          onChange={() => toggleRole('siswa')}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm font-bold text-slate-800">Siswa</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={targetRoles.guru}
                          onChange={() => toggleRole('guru')}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm font-bold text-slate-800">Guru / Wali Kelas</span>
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Notifikasi surat akan otomatis terkirim ke panel notifikasi akun target yang dicentang.
                    </p>
                  </div>

                  {/* Isi Manual jika pilih mode manual */}
                  {mode === 'manual' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Isi Surat / Pengumuman *
                      </label>
                      <textarea
                        rows={6}
                        value={isiManual}
                        onChange={(e) => setIsManual(e.target.value)}
                        placeholder="Tuliskan isi surat pemberitahuan resmi di sini..."
                        className="w-full px-4 py-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: UPLOAD EXCEL & WORD TEMPLATE */}
              {step === 2 && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* File 1: Excel Data */}
                  <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-2xl mx-auto">
                      📊
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">Upload File Excel Data Penerima *</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Pilih file Excel (.xlsx / .xls) yang berisi kolom NISN dan data pendukung surat.
                      </p>
                    </div>

                    <input
                      ref={fileExcelInputRef}
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />

                    <div className="pt-2">
                      <button
                        onClick={() => fileExcelInputRef.current?.click()}
                        disabled={isProcessingFile}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                      >
                        {isProcessingFile ? 'Membaca Data Excel...' : excelData ? '✓ Ganti File Excel' : 'Pilih File Excel'}
                      </button>
                    </div>

                    {excelData && (
                      <div className="mt-3 p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-700 text-left flex items-center justify-between">
                        <div>
                          <p className="font-bold text-indigo-900">
                            ✓ Berhasil Membaca: {excelData.total} Siswa
                          </p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            Format: {excelData.isCkg ? 'Pemeriksaan Kesehatan' : 'Tabel Excel'} • Kelas: {excelData.classes.join(', ')}
                          </p>
                        </div>
                        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Kunci Akun: NISN
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pilihan Metode Desain Surat */}
                  <div className="p-1.5 bg-slate-100 rounded-2xl flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormatMode('builder')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                        formatMode === 'builder'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="text-base">✨</span>
                      <span>Formulir Penyusun Surat (Visual Builder)</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-700 font-extrabold">
                        Rekomendasi Rapi
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormatMode('docx')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer ${
                        formatMode === 'docx'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="text-base">📄</span>
                      <span>Upload Template Dokumen Word (.docx)</span>
                    </button>
                  </div>

                  {/* Mode Builder: Visual Letter Builder */}
                  {formatMode === 'builder' ? (
                    <SuratVisualBuilder
                      builderState={builderState}
                      onChange={handleBuilderChange}
                      availableTags={availableTags}
                      onResetStandard={handleResetBuilderStandard}
                    />
                  ) : (
                    /* Mode Docx: Word Template Upload */
                    <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                            📝
                          </span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900">
                              Template Desain Word (.docx) <span className="text-slate-400 font-normal">(Opsional)</span>
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Cukup buat <strong>isi suratnya saja</strong> di Word. Kop Surat resmi (lengkap dengan Logo) &amp; Tanda Tangan + Cap Kepala Sekolah akan otomatis dipasang oleh sistem!
                            </p>
                          </div>
                        </div>

                        <input
                          ref={fileDocxInputRef}
                          type="file"
                          accept=".docx"
                          onChange={handleDocxUpload}
                          className="hidden"
                        />

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => fileDocxInputRef.current?.click()}
                            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
                          >
                            {docxData ? '✓ Ganti Template Word' : 'Upload Template Word'}
                          </button>
                          {docxData && (
                            <button
                              onClick={() => {
                                setDocxData(null)
                                if (fileDocxInputRef.current) fileDocxInputRef.current.value = ''
                              }}
                              className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold shrink-0 cursor-pointer"
                              title="Kembali ke Template Standar Budi Mulia"
                            >
                              ✕ Hapus / Reset
                            </button>
                          )}
                        </div>
                      </div>

                      {docxData && (
                        <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700">
                          <p className="font-bold text-slate-800">
                            Tag Placeholder Terdeteksi di Word:
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {docxData.placeholders.map((p, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-mono border border-blue-100">
                                &lt;&lt;{p}&gt;&gt;
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{uploadError}</span>
                    </div>
                  )}

                </div>
              )}

              {/* STEP 3: PREVIEW & VALIDASI */}
              {step === 3 && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* Summary Bar & Status Kelengkapan Data */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-100 text-center">
                      <p className="text-[11px] font-bold text-indigo-600 uppercase">Total Siswa Terdata</p>
                      <p className="text-xl font-extrabold text-indigo-950 mt-0.5">{filteredStudents.length}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase">Kondisi Normal</p>
                      <p className="text-xl font-extrabold text-emerald-950 mt-0.5">
                        {filteredStudents.filter(s => !s.isRujuk && !s.isDataKosong).length}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-100 text-center">
                      <p className="text-[11px] font-bold text-amber-600 uppercase">Perlu Rujukan</p>
                      <p className="text-xl font-extrabold text-amber-950 mt-0.5">
                        {filteredStudents.filter(s => s.isRujuk && !s.isDataKosong).length}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-center">
                      <p className="text-[11px] font-bold text-rose-600 uppercase">Tidak Hadir / Kosong</p>
                      <p className="text-xl font-extrabold text-rose-950 mt-0.5">
                        {(excelData?.countTidakMasuk || 0) + (excelData?.countKosong || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Sub-Tabs Navigasi Validasi Data */}
                  <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
                    <button
                      onClick={() => setActiveValidationTab('valid')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                        activeValidationTab === 'valid'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>✓ Siswa Siap Kirim ({filteredStudents.filter(s => !s.isDataKosong).length})</span>
                    </button>

                    {excelData?.countKosong > 0 && (
                      <button
                        onClick={() => setActiveValidationTab('kosong')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                          activeValidationTab === 'kosong'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <span>⚠️ Data Belum Lengkap ({excelData.countKosong})</span>
                      </button>
                    )}

                    {excelData?.tidakMasukList && excelData.tidakMasukList.length > 0 && (
                      <button
                        onClick={() => setActiveValidationTab('tidak_masuk')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                          activeValidationTab === 'tidak_masuk'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        <span>❌ Tidak Hadir / Belum Tercatat ({excelData.tidakMasukList.length})</span>
                      </button>
                    )}
                  </div>

                  {/* Filter Kelas (Hanya tampil di tab valid) */}
                  {activeValidationTab === 'valid' && excelData?.classes && excelData.classes.length > 0 && (
                    <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700">Filter Lingkup Pengiriman:</span>
                      <select
                        value={selectedClassFilter}
                        onChange={(e) => { setSelectedClassFilter(e.target.value); setPreviewIndex(0); }}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800"
                      >
                        <option value="ALL">Semua Kelas ({excelData.total} Siswa)</option>
                        {excelData.classes.map(c => (
                          <option key={c} value={c}>Hanya Kelas {c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* TAB 1: LIVE SAMPLE PREVIEW SISWA SIAP KIRIM */}
                  {activeValidationTab === 'valid' && currentStudent && (
                    <div className="border border-slate-200 rounded-3xl p-5 bg-white shadow-xs space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-100 pb-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                            Sample Preview Siswa ({previewIndex + 1} dari {filteredStudents.length})
                          </span>
                          <h4 className="text-base font-bold text-slate-900 mt-1">
                            {currentStudent.nama} ({currentStudent.kelas})
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                            <span>NISN: <strong className="text-slate-800 font-mono">{currentStudent.nisn}</strong></span>
                            {currentStudent.rawNisn && currentStudent.rawNisn.length < 10 && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                                ✓ Otomatis Ditambah 0 di Depan (di Excel: {currentStudent.rawNisn})
                              </span>
                            )}
                            <span>• NIK: {currentStudent.nik || '-'}</span>
                          </div>
                        </div>

                        {/* Prev / Next Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                            disabled={previewIndex === 0}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 transition"
                          >
                            ◀ Siswa Sebelumnya
                          </button>
                          <button
                            onClick={() => setPreviewIndex(prev => Math.min(filteredStudents.length - 1, prev + 1))}
                            disabled={previewIndex >= filteredStudents.length - 1}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 transition"
                          >
                            Siswa Berikutnya ▶
                          </button>
                          <button
                            onClick={() => openSuratPreviewModal(currentStudent)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                          >
                            <span>🔍 Lihat Surat Penuh & PDF</span>
                          </button>
                        </div>
                      </div>

                      {/* Mini Preview Box */}
                      {(formatMode === 'builder' || docxData || currentStudentHtml) ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200 text-xs text-indigo-900">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl shrink-0">{formatMode === 'builder' ? '✨' : '📝'}</span>
                              <div>
                                <p className="font-bold text-indigo-950">
                                  {formatMode === 'builder' 
                                    ? 'Pratinjau Surat Resmi A4 (Penyusun Visual)' 
                                    : 'Template Word Terpasang'}
                                </p>
                                <p className="text-[11px] text-indigo-800">
                                  Kop Surat resmi SMP Budi Mulia, titik dua sejajar, dan TTD + Cap Sekolah terpasang rapi.
                                </p>
                              </div>
                            </div>
                            
                            {/* Toggle Mode & Action Button */}
                            <div className="flex items-center gap-2">
                              {formatMode === 'docx' && (
                                <div className="flex items-center gap-1 bg-indigo-100/70 p-1 rounded-xl">
                                  <button
                                    type="button"
                                    onClick={() => setStep3PreviewMode('auto')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                                      step3PreviewMode === 'auto'
                                        ? 'bg-white text-indigo-800 shadow-xs'
                                        : 'text-indigo-700 hover:text-indigo-900'
                                    }`}
                                  >
                                    <span>🌟 Kop &amp; TTD Otomatis</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setStep3PreviewMode('docx')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                                      step3PreviewMode === 'docx'
                                        ? 'bg-white text-indigo-800 shadow-xs'
                                        : 'text-indigo-700 hover:text-indigo-900'
                                    }`}
                                  >
                                    <span>📄 Word Utuh</span>
                                  </button>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => openSuratPreviewModal(currentStudent)}
                                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>🔍 Buka Cetak A4 / PDF (Pengatur TTD &amp; Cap)</span>
                              </button>
                            </div>
                          </div>

                          <div className="bg-slate-100/80 p-3 sm:p-5 rounded-2xl border border-slate-200 max-h-[550px] overflow-y-auto">
                            {formatMode === 'docx' && step3PreviewMode === 'docx' ? (
                              currentDocxPreviewBuffer ? (
                                <DocxViewer docxData={currentDocxPreviewBuffer} />
                              ) : (
                                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                  <span>Menyiapkan pratinjau Word...</span>
                                </div>
                              )
                            ) : (
                              /* Tampilan Pratinjau Kop & TTD Otomatis */
                              <div className="bg-white p-5 sm:p-8 rounded-xl shadow-xs text-black font-serif max-w-2xl mx-auto text-xs">
                                {/* Kop Surat Resmi SMP Budi Mulia */}
                                <div className="mb-4">
                                  <div className="flex items-center gap-3 pb-2">
                                    <img 
                                      src="/assets/surat/logo_smp_budi_mulia.jpg" 
                                      alt="Logo SMP Budi Mulia" 
                                      className="w-14 h-16 object-contain shrink-0"
                                      onError={(e) => { e.target.src = '/logo.png' }}
                                    />
                                    <div className="flex-1 text-center font-serif text-black">
                                      <h4 className="text-[13px] font-bold uppercase tracking-wide leading-tight">
                                        SEKOLAH MENENGAH PERTAMA ( SMP ) BUDI MULIA
                                      </h4>
                                      <p className="text-[10px] font-bold tracking-wider uppercase mt-0.5">
                                        STATUS : AKREDITASI  A
                                      </p>
                                      <p className="text-[9px] font-semibold tracking-wide uppercase">
                                        UNIT YAYASAN BUDI MULIA LOURDES
                                      </p>
                                      <p className="text-[8.5px] leading-tight">
                                        Jl. Mangga Besar No. 135 – Jakarta Pusat 10730
                                      </p>
                                      <p className="text-[8px] leading-tight">
                                        Telp. 021 – 6291767  Fax.021-6000739   e-mail : smpbudimulia51@Gmail.com
                                      </p>
                                      <p className="text-[8px] leading-tight">
                                        Website : www.smpbudimuliajakarta.sch.id
                                      </p>
                                    </div>
                                    <div className="w-14 shrink-0 hidden sm:block" />
                                  </div>
                                  {/* Double Divider Line Kop */}
                                  <div className="w-full mt-1.5 mb-3" style={{ width: '100%' }}>
                                    <div style={{ height: '2.5px', backgroundColor: '#000000', width: '100%', marginBottom: '2px' }} />
                                    <div style={{ height: '1px', backgroundColor: '#000000', width: '100%' }} />
                                  </div>
                                </div>

                                {/* Isi Surat Ter-render */}
                                {currentStudentHtml ? (
                                  <div 
                                    className="surat-rendered-body leading-relaxed mb-6"
                                    dangerouslySetInnerHTML={{ __html: currentStudentHtml }}
                                  />
                                ) : (
                                  <p className="italic text-slate-400 text-center py-4">Memuat isi surat...</p>
                                )}

                                {/* Tanda Tangan & Cap Stempel Resmi (Sinkron dengan Pengaturan Slider) */}
                                <div 
                                  className="flex justify-end text-[11px] text-black"
                                  style={{
                                    marginTop: `${Math.max(10, ttdConfig.boxMarginTop * 0.7)}px`,
                                    marginRight: `${ttdConfig.boxMarginRight || 0}px`
                                  }}
                                >
                                  <div className="w-56 text-center">
                                    <p>{builderState.pengesahan?.kota || 'Jakarta'}, {tanggalSurat}</p>
                                    <p className="font-semibold text-black mt-0.5">{builderState.pengesahan?.mengetahui || 'Mengetahui,'}</p>
                                    <p className="font-semibold text-black">{builderState.pengesahan?.jabatan || 'Kepala SMP Budi Mulia,'}</p>
                                    
                                    <div className="relative h-16 my-1 flex items-center justify-center">
                                      <img
                                        src="/assets/surat/cap_sekolah_budi_mulia.png"
                                        alt="Cap SMP Budi Mulia"
                                        style={{
                                          width: `${Math.round(ttdConfig.capSize * 0.65)}px`,
                                          height: `${Math.round(ttdConfig.capSize * 0.65)}px`,
                                          left: `${Math.round(ttdConfig.capOffsetX * 0.65)}px`,
                                          top: `${Math.round(ttdConfig.capOffsetY * 0.65)}px`,
                                          transform: `rotate(${ttdConfig.capRotation}deg)`,
                                          opacity: ttdConfig.capOpacity / 100
                                        }}
                                        className="absolute object-contain pointer-events-none transition-all duration-75"
                                      />
                                      <img
                                        src="/assets/surat/ttd_kepala_sekolah.png"
                                        alt="Tanda Tangan Kepala Sekolah"
                                        style={{
                                          width: `${Math.round(ttdConfig.ttdWidth * 0.65)}px`,
                                          left: `${Math.round(ttdConfig.ttdOffsetX * 0.65)}px`,
                                          top: `${Math.round(ttdConfig.ttdOffsetY * 0.65)}px`
                                        }}
                                        className="absolute object-contain pointer-events-none z-10 transition-all duration-75"
                                      />
                                    </div>

                                    <p className="font-bold underline text-black tracking-wide mt-1">
                                      {builderState.pengesahan?.nama || ttdConfig.namaKepalaSekolah || '( Septian Ruswadi, S.Pd )'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div><span className="text-slate-400">TB:</span> <strong>{currentStudent.tb || '-'} cm</strong></div>
                            <div><span className="text-slate-400">BB:</span> <strong>{currentStudent.bb || '-'} kg</strong></div>
                            <div><span className="text-slate-400">IMT:</span> <strong>{currentStudent.imt ? Number(currentStudent.imt).toFixed(1) : '-'}</strong></div>
                            <div><span className="text-slate-400">Tensi:</span> <strong>{currentStudent.tensi || '-'}</strong></div>
                            <div><span className="text-slate-400">HB:</span> <strong>{currentStudent.hb || '-'}</strong></div>
                            <div><span className="text-slate-400">GDS:</span> <strong>{currentStudent.gds || '-'}</strong></div>
                            <div><span className="text-slate-400">Penglihatan:</span> <strong>{currentStudent.visus || 'Normal'}</strong></div>
                            <div><span className="text-slate-400">Gigi:</span> <strong>{currentStudent.gigi || 'Bersih'}</strong></div>
                          </div>
                          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                            <span>Status Rekomendasi Medis:</span>
                            <span className={`px-2 py-0.5 rounded font-black text-xs ${
                              currentStudent.isRujuk ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                            }`}>
                              {currentStudent.statusRekomendasi}
                            </span>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* Sending Progress Bar */}
                  {isSending && (
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-2">
                      <div className="flex justify-between font-bold">
                        <span>Sedang mendistribusikan notifikasi surat...</span>
                        <span>{sendProgress.current} / {sendProgress.total}</span>
                      </div>
                      <div className="w-full bg-indigo-200 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${(sendProgress.current / Math.max(1, sendProgress.total)) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB 2: DAFTAR SISWA DATA BELUM LENGKAP */}
                  {activeValidationTab === 'kosong' && (
                    <div className="border border-amber-200 bg-amber-50/50 rounded-3xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-amber-900">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <h4 className="font-bold text-sm">Daftar Siswa dengan Data Pemeriksaan Belum Lengkap</h4>
                          <p className="text-xs text-amber-700">
                            Siswa berikut tercatat di sheet input namun nilai pengukuran TB/BB/Tensi masih kosong di file Excel.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-amber-100/60 text-amber-950 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">No</th>
                              <th className="py-2.5 px-3">Nama Siswa</th>
                              <th className="py-2.5 px-3">Kelas</th>
                              <th className="py-2.5 px-3">NISN</th>
                              <th className="py-2.5 px-3">TB</th>
                              <th className="py-2.5 px-3">BB</th>
                              <th className="py-2.5 px-3">Tensi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {filteredStudents.filter(s => s.isDataKosong).map((st, i) => (
                              <tr key={i} className="hover:bg-amber-50/50">
                                <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                                <td className="py-2 px-3 font-bold text-slate-900">{st.nama}</td>
                                <td className="py-2 px-3 text-slate-700">{st.kelas}</td>
                                <td className="py-2 px-3 font-mono text-slate-600">{st.nisn}</td>
                                <td className="py-2 px-3 text-slate-500">{st.tb || '— (Kosong)'}</td>
                                <td className="py-2 px-3 text-slate-500">{st.bb || '— (Kosong)'}</td>
                                <td className="py-2 px-3 text-slate-500">{st.tensi || '— (Kosong)'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: DAFTAR SISWA TIDAK HADIR CKG (SHEET TIDAK MASUK) */}
                  {activeValidationTab === 'tidak_masuk' && (
                    <div className="border border-rose-200 bg-rose-50/50 rounded-3xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-rose-900">
                        <span className="text-xl">❌</span>
                        <div>
                          <h4 className="font-bold text-sm">Daftar Siswa Tidak Hadir / Belum Tercatat (Sheet &quot;TIDAK MASUK&quot;)</h4>
                          <p className="text-xs text-rose-700">
                            Siswa dalam daftar ini tercatat pada sheet &quot;TIDAK MASUK&quot; sehingga surat hasil tidak dibuatkan untuk mereka.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-rose-100/60 text-rose-950 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">No</th>
                              <th className="py-2.5 px-3">Nama Siswa</th>
                              <th className="py-2.5 px-3">Kelas</th>
                              <th className="py-2.5 px-3">NISN (Dinormalkan)</th>
                              <th className="py-2.5 px-3">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100">
                            {(excelData?.tidakMasukList || []).map((st, i) => (
                              <tr key={i} className="hover:bg-rose-50/50">
                                <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                                <td className="py-2 px-3 font-bold text-slate-900">{st.nama}</td>
                                <td className="py-2 px-3 text-slate-700 font-semibold">{st.kelas}</td>
                                <td className="py-2 px-3 font-mono text-slate-700">{st.nisn}</td>
                                <td className="py-2 px-3">
                                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                    {st.keterangan}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              {step > 1 ? (
                <button
                  onClick={() => setStep(prev => prev - 1)}
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition"
                >
                  ◀ Kembali
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-semibold transition"
                >
                  Batal
                </button>

                {step === 1 && (
                  <button
                    onClick={() => {
                      if (!judul.trim()) { alert('Masukkan judul surat'); return; }
                      if (mode === 'manual' && !isiManual.trim()) { alert('Tuliskan isi surat'); return; }
                      setStep(2);
                    }}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs"
                  >
                    Lanjut: Upload Data ➔
                  </button>
                )}

                {step === 2 && (
                  <button
                    onClick={() => {
                      if (mode === 'template' && !excelData) {
                        alert('Harap upload file Excel terlebih dahulu.')
                        return
                      }
                      setStep(3)
                    }}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs"
                  >
                    Lanjut: Validasi & Preview ➔
                  </button>
                )}

                {step === 3 && (
                  <button
                    onClick={handleKirimSuratSebaran}
                    disabled={isSending || filteredStudents.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition shadow-md hover:shadow-emerald-500/25 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{isSending ? 'Mengirimkan...' : `Kirimkan Surat ke ${filteredStudents.length} Siswa`}</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* POPUP PREVIEW SURAT A4 RESMI */}
      <SuratDetailModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        suratData={previewSuratData}
      />

    </div>
  )
}
