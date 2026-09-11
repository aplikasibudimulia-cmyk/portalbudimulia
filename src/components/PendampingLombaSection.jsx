import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import { downloadWorkbook } from '../utils/fileDownloader'

const KATEGORI_OPTIONS = ['Akademik', 'Olahraga', 'Seni & Budaya', 'Keagamaan', 'Teknologi', 'Lainnya']
const TINGKAT_OPTIONS = ['Sekolah', 'Kecamatan', 'Kota / Kabupaten', 'Provinsi', 'Nasional', 'Internasional']
const STATUS_OPTIONS = ['Direncanakan', 'Sedang Berjalan', 'Selesai']
const CAPAIAN_OPTIONS = [
  'Belum Ditentukan',
  'Juara 1',
  'Juara 2',
  'Juara 3',
  'Harapan 1',
  'Harapan 2',
  'Harapan 3',
  'Finalis',
  'Peserta / Keikutsertaan'
]

// Konversi bulan ke Romawi untuk nomor surat
const getRomanMonth = (monthIndex) => {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  return roman[monthIndex] || 'I'
}

// Format tanggal Indonesia
const formatIndoDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch (e) {
    return dateStr
  }
}

export default function PendampingLombaSection({ session, activeTa, isAdminView = false }) {
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Data state
  const [lombaList, setLombaList] = useState([])
  const [guruList, setGuruList] = useState([])
  const [tahunAjarans, setTahunAjarans] = useState([])
  const [selectedTaId, setSelectedTaId] = useState(activeTa?.id || '')
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterKategori, setFilterKategori] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterGuruId, setFilterGuruId] = useState('all')

  // Modals
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [hasilModalItem, setHasilModalItem] = useState(null) // Modal Catat Capaian / Hasil
  const [hasilPesertaState, setHasilPesertaState] = useState([])

  // Master Stempel & TTD Storage Helper
  const getStoredMasterTtd = () => {
    try {
      const saved = localStorage.getItem('ebudimulia_master_stempel_ttd_v2')
      if (saved) return JSON.parse(saved)
    } catch (e) {}
    return {
      namaKepalaSekolah: 'Drs. Agustinus, M.Pd.',
      nipKepalaSekolah: '19720815 199802 1 004',
      jabatanKepalaSekolah: 'Kepala SMP Budi Mulia',
      customCapUrl: '',
      customTtdUrl: ''
    }
  }

  // Modal Cetak Surat Tugas (Khusus Admin)
  const [suratTugasItem, setSuratTugasItem] = useState(null)
  const [showMasterTtdModal, setShowMasterTtdModal] = useState(false)
  const [masterTtdForm, setMasterTtdForm] = useState(getStoredMasterTtd)

  const [suratConfig, setSuratConfig] = useState(() => {
    const master = getStoredMasterTtd()
    const saved = localStorage.getItem('ebudimulia_surat_tugas_config_v5')
    let parsed = {}
    if (saved) {
      try { parsed = JSON.parse(saved) } catch (e) {}
    }
    return {
      nomorSurat: '',
      tanggalSurat: new Date().toISOString().slice(0, 10),
      kotaSurat: 'Jakarta',
      namaKepalaSekolah: master.namaKepalaSekolah || parsed.namaKepalaSekolah || 'Drs. Agustinus, M.Pd.',
      nipKepalaSekolah: master.nipKepalaSekolah || parsed.nipKepalaSekolah || '19720815 199802 1 004',
      jabatanKepalaSekolah: master.jabatanKepalaSekolah || parsed.jabatanKepalaSekolah || 'Kepala SMP Budi Mulia',
      namaSekolah: parsed.namaSekolah || 'SEKOLAH MENENGAH PERTAMA (SMP) BUDI MULIA',
      alamatKop: parsed.alamatKop || 'Jl. Mangga Besar No. 135 – Jakarta Pusat 10730',
      teleponKop: parsed.teleponKop || 'Telp. 021 – 6291767 Fax. 6000739 Email: smpbudimulia51@gmail.com',
      showLogo: true,
      logoUrl: parsed.logoUrl || '/logo.jpg',
      showCapTtd: true,
      customCapUrl: master.customCapUrl || parsed.customCapUrl || '',
      customTtdUrl: master.customTtdUrl || parsed.customTtdUrl || ''
    }
  })

  const [notifyModal, setNotifyModal] = useState({ show: false, type: 'success', title: '', message: '' })
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // Form State
  const [formNamaKegiatan, setFormNamaKegiatan] = useState('')
  const [formKategori, setFormKategori] = useState('Akademik')
  const [formTingkat, setFormTingkat] = useState('Kota / Kabupaten')
  const [formPenyelenggara, setFormPenyelenggara] = useState('')
  const [formTempatLokasi, setFormTempatLokasi] = useState('')
  const [formTanggalMulai, setFormTanggalMulai] = useState(new Date().toISOString().slice(0, 10))
  const [formTanggalSelesai, setFormTanggalSelesai] = useState('')
  const [formGuruId, setFormGuruId] = useState(session?.id || '')
  const [formNamaGuru, setFormNamaGuru] = useState(session?.nama_guru || '')
  const [formStatus, setFormStatus] = useState('Direncanakan')
  const [formKeterangan, setFormKeterangan] = useState('')
  const [formPeserta, setFormPeserta] = useState([]) // array of { nisn, nama_lengkap, kelas, peran, capaian }

  // Student Search Autocomplete State
  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  const [studentSearchResults, setStudentSearchResults] = useState([])
  const [isSearchingStudent, setIsSearchingStudent] = useState(false)
  const searchTimeoutRef = useRef(null)

  // Current logged in teacher detection
  const currentGuruId = session?.id || session?.guru_id || null
  const isRealAdmin = isAdminView || session?.is_admin || session?.role === 'admin' || session?.roles?.some(r => r.nama?.toLowerCase() === 'admin')

  useEffect(() => {
    fetchTahunAjarans()
    fetchGuruList()
  }, [])

  useEffect(() => {
    if (activeTa?.id && !selectedTaId) {
      setSelectedTaId(activeTa.id)
    }
  }, [activeTa])

  useEffect(() => {
    fetchLombaList()
  }, [selectedTaId])

  // Simpan config surat tugas di localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ebudimulia_surat_tugas_config_v4', JSON.stringify(suratConfig))
    } catch (e) {}
  }, [suratConfig])

  const fetchTahunAjarans = async () => {
    try {
      const { data } = await supabase.from('tahun_ajaran').select('*').order('nama', { ascending: false })
      if (data && data.length > 0) {
        setTahunAjarans(data)
        if (!selectedTaId) {
          const active = activeTa?.id ? data.find(t => t.id === activeTa.id) : data[0]
          setSelectedTaId(active ? active.id : data[0].id)
        }
      }
    } catch (err) {
      console.error('Error fetching tahun ajaran:', err)
    }
  }

  const fetchGuruList = async () => {
    try {
      const { data } = await supabase.from('guru').select('id, nama_guru').order('nama_guru', { ascending: true })
      setGuruList(data || [])
    } catch (err) {
      console.error('Error fetching guru list:', err)
    }
  }

  const fetchLombaList = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('pendamping_lomba')
        .select('*')
        .order('tanggal_mulai', { ascending: false })

      if (selectedTaId) {
        query = query.eq('tahun_ajaran_id', selectedTaId)
      }

      // Jika bukan Admin view, kunci hanya untuk guru yang sedang login
      if (!isRealAdmin && currentGuruId) {
        query = query.eq('guru_id', currentGuruId)
      }

      const { data, error } = await query
      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          console.warn('Tabel pendamping_lomba belum dibuat di database. Harap jalankan migrasi SQL.')
        } else {
          console.error('Error fetching pendamping_lomba:', error)
        }
        setLombaList([])
      } else {
        setLombaList(data || [])
      }
    } catch (err) {
      console.error('Exception fetching pendamping_lomba:', err)
      setLombaList([])
    } finally {
      setLoading(false)
    }
  }

  // Student Search Autocomplete
  const handleStudentSearch = (term) => {
    setStudentSearchTerm(term)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (!term || term.trim().length < 2) {
      setStudentSearchResults([])
      setIsSearchingStudent(false)
      return
    }

    setIsSearchingStudent(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        let query = supabase
          .from('siswa_lengkap')
          .select('nisn, nama_lengkap, kelas')
          .or(`nama_lengkap.ilike.%${term}%,nisn.ilike.%${term}%`)
          .limit(8)

        if (selectedTaId) {
          query = query.eq('tahun_ajaran_id', selectedTaId)
        }

        const { data, error } = await query
        if (error) {
          const { data: permData } = await supabase
            .from('siswa_permanent')
            .select('nisn, nama_lengkap, kelas')
            .or(`nama_lengkap.ilike.%${term}%,nisn.ilike.%${term}%`)
            .limit(8)
          setStudentSearchResults(permData || [])
        } else {
          setStudentSearchResults(data || [])
        }
      } catch (err) {
        console.error('Error searching student:', err)
        setStudentSearchResults([])
      } finally {
        setIsSearchingStudent(false)
      }
    }, 250)
  }

  const handleAddStudent = (student) => {
    if (formPeserta.some(p => p.nisn === student.nisn)) {
      setNotifyModal({
        show: true,
        type: 'warning',
        title: 'Siswa Sudah Ditambahkan',
        message: `${student.nama_lengkap} sudah ada dalam daftar peserta kegiatan ini.`
      })
      return
    }

    setFormPeserta(prev => [
      ...prev,
      {
        nisn: student.nisn,
        nama_lengkap: student.nama_lengkap,
        kelas: student.kelas || '-',
        peran: 'Peserta',
        capaian: 'Belum Ditentukan'
      }
    ])
    setStudentSearchTerm('')
    setStudentSearchResults([])
  }

  const handleRemoveStudent = (nisn) => {
    setFormPeserta(prev => prev.filter(p => p.nisn !== nisn))
  }

  const handleUpdateStudentRole = (nisn, newPeran) => {
    setFormPeserta(prev => prev.map(p => p.nisn === nisn ? { ...p, peran: newPeran } : p))
  }

  // Open Modal Create
  const handleOpenCreateModal = () => {
    setEditingItem(null)
    setFormNamaKegiatan('')
    setFormKategori('Akademik')
    setFormTingkat('Kota / Kabupaten')
    setFormPenyelenggara('')
    setFormTempatLokasi('')
    setFormTanggalMulai(new Date().toISOString().slice(0, 10))
    setFormTanggalSelesai('')
    setFormGuruId(currentGuruId || '')
    setFormNamaGuru(session?.nama_guru || '')
    setFormStatus('Direncanakan')
    setFormKeterangan('')
    setFormPeserta([])
    setStudentSearchTerm('')
    setStudentSearchResults([])
    setShowFormModal(true)
  }

  // Open Modal Edit
  const handleOpenEditModal = (item) => {
    setEditingItem(item)
    setFormNamaKegiatan(item.nama_kegiatan || '')
    setFormKategori(item.kategori || 'Akademik')
    setFormTingkat(item.tingkat || 'Kota / Kabupaten')
    setFormPenyelenggara(item.penyelenggara || '')
    setFormTempatLokasi(item.tempat_lokasi || '')
    setFormTanggalMulai(item.tanggal_mulai || new Date().toISOString().slice(0, 10))
    setFormTanggalSelesai(item.tanggal_selesai || '')
    setFormGuruId(item.guru_id || '')
    setFormNamaGuru(item.nama_guru || '')
    setFormStatus(item.status || 'Direncanakan')
    setFormKeterangan(item.keterangan || '')
    setFormPeserta(Array.isArray(item.peserta) ? item.peserta : [])
    setStudentSearchTerm('')
    setStudentSearchResults([])
    setShowFormModal(true)
  }

  // Open Modal Catat Hasil / Juara
  const handleOpenHasilModal = (item) => {
    setHasilModalItem(item)
    const list = Array.isArray(item.peserta) ? item.peserta.map(p => ({
      ...p,
      capaian: p.capaian || 'Peserta / Keikutsertaan',
      syncPrestasi: true
    })) : []
    setHasilPesertaState(list)
  }

  // Submit Catat Hasil / Juara
  const handleSubmitHasil = async (e) => {
    e.preventDefault()
    if (!hasilModalItem) return

    setIsSubmitting(true)
    try {
      const updatedPeserta = hasilPesertaState.map(p => ({
        nisn: p.nisn,
        nama_lengkap: p.nama_lengkap,
        kelas: p.kelas || '-',
        peran: p.peran || 'Peserta',
        capaian: p.capaian || 'Peserta / Keikutsertaan',
        is_prestasi_synced: p.syncPrestasi ? true : Boolean(p.is_prestasi_synced)
      }))

      const { error: updateErr } = await supabase
        .from('pendamping_lomba')
        .update({
          peserta: updatedPeserta,
          status: 'Selesai',
          updated_at: new Date().toISOString()
        })
        .eq('id', hasilModalItem.id)

      if (updateErr) throw updateErr

      // Sinkronkan ke master prestasi_siswa
      let syncedCount = 0
      for (const p of hasilPesertaState) {
        if (p.syncPrestasi && p.capaian && p.capaian !== 'Belum Ditentukan') {
          const { data: existingPrestasi } = await supabase
            .from('prestasi_siswa')
            .select('id')
            .eq('siswa_nisn', p.nisn)
            .eq('nama_lomba', hasilModalItem.nama_kegiatan)
            .limit(1)

          const prestasiPayload = {
            siswa_nisn: p.nisn,
            nama_lomba: hasilModalItem.nama_kegiatan,
            kategori_lomba: hasilModalItem.kategori || 'Akademik',
            tingkat: hasilModalItem.tingkat || 'Kota / Kabupaten',
            peringkat: p.capaian,
            penyelenggara: hasilModalItem.penyelenggara || null,
            tanggal_lomba: hasilModalItem.tanggal_mulai,
            keterangan: `Guru Pendamping: ${hasilModalItem.nama_guru || '-'}. ${hasilModalItem.keterangan || ''}`.trim(),
            tahun_ajaran_id: hasilModalItem.tahun_ajaran_id || selectedTaId
          }

          if (existingPrestasi && existingPrestasi.length > 0) {
            await supabase.from('prestasi_siswa').update(prestasiPayload).eq('id', existingPrestasi[0].id)
          } else {
            await supabase.from('prestasi_siswa').insert([prestasiPayload])
          }
          syncedCount++
        }
      }

      setNotifyModal({
        show: true,
        type: 'success',
        title: 'Hasil Berhasil Dicatat',
        message: syncedCount > 0
          ? `Hasil lomba berhasil disimpan! ${syncedCount} siswa telah otomatis didaftarkan ke buku Prestasi & Lomba Siswa.`
          : 'Hasil capaian lomba berhasil disimpan.'
      })

      setHasilModalItem(null)
      fetchLombaList()
    } catch (err) {
      console.error('Error recording hasil lomba:', err)
      setNotifyModal({
        show: true,
        type: 'error',
        title: 'Gagal Menyimpan Hasil',
        message: err.message || 'Terjadi kesalahan saat menyimpan hasil lomba.'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Modal Surat Tugas (Khusus Admin)
  const handleOpenSuratTugas = (item) => {
    const today = new Date()
    const romanM = getRomanMonth(today.getMonth())
    const defaultNomor = suratConfig.nomorSurat || `0${Math.floor(Math.random() * 80) + 10}/ST-LOMBA/SMP-BM/${romanM}/${today.getFullYear()}`
    
    // Always refresh master stempel & ttd from persistent storage
    const master = getStoredMasterTtd()

    setSuratConfig(prev => ({
      ...prev,
      nomorSurat: defaultNomor,
      tanggalSurat: new Date().toISOString().slice(0, 10),
      namaKepalaSekolah: master.namaKepalaSekolah || prev.namaKepalaSekolah,
      nipKepalaSekolah: master.nipKepalaSekolah || prev.nipKepalaSekolah,
      jabatanKepalaSekolah: master.jabatanKepalaSekolah || prev.jabatanKepalaSekolah,
      customCapUrl: master.customCapUrl || prev.customCapUrl,
      customTtdUrl: master.customTtdUrl || prev.customTtdUrl
    }))
    setSuratTugasItem(item)
  }

  // Trigger Print Surat Tugas (Pas 1 Halaman A4 & Times New Roman)
  const handlePrintSuratTugas = () => {
    if (!suratTugasItem) return
    const pesertaList = Array.isArray(suratTugasItem.peserta) ? suratTugasItem.peserta : []

    const pesertaRowsHtml = pesertaList.length === 0
      ? `<tr><td colspan="5" style="border: 1px solid #000; text-align: center; padding: 4px; color: #475569;">Belum ada siswa yang didaftarkan.</td></tr>`
      : pesertaList.map((p, idx) => `
        <tr>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #000; padding: 3px 6px; text-align: left; font-weight: bold;">${p.nama_lengkap}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: center;">${p.nisn || '-'}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: center;">${p.kelas || '-'}</td>
          <td style="border: 1px solid #000; padding: 3px 4px; text-align: center;">${p.peran || 'Peserta'}</td>
        </tr>
      `).join('')

    const logoHtml = suratConfig.showLogo
      ? `<img src="${suratConfig.logoUrl || '/logo.jpg'}" class="kop-logo" alt="Logo SMP Budi Mulia" />`
      : ''

    const capTtdHtml = suratConfig.showCapTtd
      ? `
        <div style="position: relative; height: 68px; margin: 2px 0;">
          ${suratConfig.customTtdUrl 
            ? `<img src="${suratConfig.customTtdUrl}" style="position: absolute; right: 20px; top: -5px; height: 68px; object-fit: contain;" alt="Tanda Tangan" />`
            : `
              <svg viewBox="0 0 200 80" style="position: absolute; right: 10px; top: 0; width: 130px; height: 55px; color: #1e3a8a;">
                <path d="M 20,55 Q 45,15 70,50 T 110,40 Q 130,20 145,55 T 180,45" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <path d="M 40,65 Q 90,55 165,60" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            `
          }
          ${suratConfig.customCapUrl
            ? `<img src="${suratConfig.customCapUrl}" style="position: absolute; right: 80px; top: 2px; height: 72px; width: 72px; object-fit: contain; opacity: 0.88;" alt="Cap Sekolah" />`
            : `
              <svg viewBox="0 0 160 160" style="position: absolute; right: 70px; top: 0; width: 70px; height: 70px; color: #4338ca; opacity: 0.88; transform: rotate(-8deg);">
                <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6,2" />
                <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" stroke-width="1.8" />
                <circle cx="80" cy="80" r="48" fill="none" stroke="currentColor" stroke-width="1.2" />
                <path id="curveTop" d="M 24,80 A 56,56 0 0,1 136,80" fill="none" />
                <text font-size="11px" font-weight="900" letter-spacing="0.15em" fill="currentColor">
                  <textPath href="#curveTop" startOffset="50%" text-anchor="middle">SMP BUDI MULIA</textPath>
                </text>
                <path id="curveBottom" d="M 136,80 A 56,56 0 0,1 24,80" fill="none" />
                <text font-size="9px" font-weight="700" letter-spacing="0.2em" fill="currentColor">
                  <textPath href="#curveBottom" startOffset="50%" text-anchor="middle">JAKARTA PUSAT</textPath>
                </text>
                <g transform="translate(80, 80)">
                  <polygon points="0,-10 3,-3 10,-3 4,2 6,9 0,5 -6,9 -4,2 -10,-3 -3,-3" fill="currentColor" opacity="0.88" />
                </g>
              </svg>
            `
          }
        </div>
      `
      : `<div style="height: 55px;"></div>`

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Surat Tugas - ${suratTugasItem.nama_kegiatan}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 18mm 10mm 18mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Times New Roman', Times, serif !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            color: #000;
            background: #fff;
            font-size: 10.5pt;
            line-height: 1.35;
          }
          .kop-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2px;
          }
          .kop-logo {
            width: 72px;
            height: 86px;
            object-fit: contain;
            margin-right: 16px;
            flex-shrink: 0;
          }
          .kop-text {
            flex: 1;
            text-align: center;
          }
          .kop-sekolah {
            font-size: 14pt;
            font-weight: bold;
            text-transform: uppercase;
            color: #000;
            letter-spacing: 0.2px;
            line-height: 1.25;
          }
          .kop-alamat {
            font-size: 10.5pt;
            font-weight: bold;
            color: #000;
            margin-top: 2px;
            line-height: 1.25;
          }
          .kop-telepon {
            font-size: 9.5pt;
            font-weight: bold;
            color: #000;
            margin-top: 2px;
            line-height: 1.25;
          }
          .kop-divider {
            border-bottom: 1.5px solid #000;
            margin-top: 6px;
            margin-bottom: 12px;
          }
          .surat-header {
            text-align: center;
            margin-bottom: 10px;
          }
          .surat-judul {
            font-size: 13pt;
            font-weight: bold;
            text-decoration: underline;
            text-underline-offset: 3px;
            letter-spacing: 1px;
            line-height: 1.2;
          }
          .surat-nomor {
            font-size: 10pt;
            margin-top: 2px;
            line-height: 1.2;
          }
          .paragraf {
            margin: 6px 0 4px 0;
            text-align: justify;
            text-justify: inter-word;
            line-height: 1.35;
          }
          .paragraf-daftar {
            margin: 6px 0 4px 0;
            text-align: left;
            line-height: 1.35;
          }
          table.content-table {
            width: 100%;
            border-collapse: collapse;
            margin: 3px 0 3px 8px;
            font-size: 10.5pt;
          }
          table.content-table td {
            vertical-align: top;
            padding: 1.5px 2px;
            text-align: left;
          }
          table.content-table td.col-label {
            width: 155px;
          }
          table.content-table td.col-colon {
            width: 15px;
            text-align: center;
          }
          table.content-table td.col-val {
            text-align: left;
          }
          table.peserta-table {
            width: 100%;
            border-collapse: collapse;
            margin: 5px 0 6px 0;
            font-size: 10pt;
          }
          table.peserta-table th {
            border: 1px solid #000;
            padding: 4px 6px;
            background-color: #f8fafc;
            font-weight: bold;
          }
          table.peserta-table td {
            border: 1px solid #000;
            padding: 3px 6px;
          }
          .ttd-section {
            margin-top: 10px;
            display: flex;
            justify-content: flex-end;
            page-break-inside: avoid;
          }
          .ttd-box {
            width: 250px;
            text-align: center;
            font-size: 10.5pt;
          }
        </style>
      </head>
      <body>
        <div class="kop-container">
          ${logoHtml}
          <div class="kop-text">
            <div class="kop-sekolah">${suratConfig.namaSekolah}</div>
            <div class="kop-alamat">${suratConfig.alamatKop}</div>
            <div class="kop-telepon">${suratConfig.teleponKop}</div>
          </div>
        </div>
        <div class="kop-divider"></div>

        <div class="surat-header">
          <div class="surat-judul">SURAT TUGAS</div>
          <div class="surat-nomor">Nomor: ${suratConfig.nomorSurat}</div>
        </div>

        <p class="paragraf">
          Yang bertanda tangan di bawah ini, Kepala ${suratConfig.namaSekolah}, dengan ini memberikan tugas kedinasan kepada:
        </p>

        <table class="content-table">
          <tr>
            <td class="col-label">Nama Guru</td>
            <td class="col-colon">:</td>
            <td class="col-val" style="font-weight: bold;">${suratTugasItem.nama_guru || 'Guru Pendamping'}</td>
          </tr>
          <tr>
            <td class="col-label">Jabatan / Tugas</td>
            <td class="col-colon">:</td>
            <td class="col-val">Guru Pendamping Kegiatan / Perlombaan Siswa</td>
          </tr>
          <tr>
            <td class="col-label">Unit Kerja</td>
            <td class="col-colon">:</td>
            <td class="col-val">${suratConfig.namaSekolah}</td>
          </tr>
        </table>

        <p class="paragraf">
          Untuk mendampingi, membimbing, dan mengkoordinasikan siswa-siswi ${suratConfig.namaSekolah} dalam mengikuti kegiatan lomba dengan rincian sebagai berikut:
        </p>

        <table class="content-table">
          <tr>
            <td class="col-label">Nama Kegiatan / Lomba</td>
            <td class="col-colon">:</td>
            <td class="col-val" style="font-weight: bold;">${suratTugasItem.nama_kegiatan}</td>
          </tr>
          <tr>
            <td class="col-label">Kategori / Tingkat</td>
            <td class="col-colon">:</td>
            <td class="col-val">${suratTugasItem.kategori || 'Akademik'} / Tingkat ${suratTugasItem.tingkat || 'Kota'}</td>
          </tr>
          <tr>
            <td class="col-label">Penyelenggara</td>
            <td class="col-colon">:</td>
            <td class="col-val">${suratTugasItem.penyelenggara || '-'}</td>
          </tr>
          <tr>
            <td class="col-label">Waktu Pelaksanaan</td>
            <td class="col-colon">:</td>
            <td class="col-val">
              ${formatIndoDate(suratTugasItem.tanggal_mulai)}
              ${suratTugasItem.tanggal_selesai && suratTugasItem.tanggal_selesai !== suratTugasItem.tanggal_mulai ? ` s.d. ${formatIndoDate(suratTugasItem.tanggal_selesai)}` : ''}
            </td>
          </tr>
          <tr>
            <td class="col-label">Tempat / Lokasi</td>
            <td class="col-colon">:</td>
            <td class="col-val">${suratTugasItem.tempat_lokasi || '-'}</td>
          </tr>
        </table>

        <p class="paragraf-daftar">
          Adapun daftar siswa-siswi yang didampingi adalah sebagai berikut:
        </p>

        <table class="peserta-table">
          <thead>
            <tr>
              <th style="width: 32px; text-align: center;">No</th>
              <th style="text-align: left; padding-left: 6px;">Nama Siswa</th>
              <th style="width: 105px; text-align: center;">NISN</th>
              <th style="width: 55px; text-align: center;">Kelas</th>
              <th style="width: 95px; text-align: center;">Keterangan / Peran</th>
            </tr>
          </thead>
          <tbody>
            ${pesertaRowsHtml}
          </tbody>
        </table>

        <p class="paragraf">
          Demikian Surat Tugas ini dibuat dan diberikan kepada yang bersangkutan untuk dapat dilaksanakan dengan penuh tanggung jawab dan dedikasi.
        </p>

        <div class="ttd-section">
          <div class="ttd-box">
            <div>${suratConfig.kotaSurat}, ${formatIndoDate(suratConfig.tanggalSurat)}</div>
            <div style="font-weight: bold; margin-top: 1px;">${suratConfig.jabatanKepalaSekolah}</div>
            
            ${capTtdHtml}

            <div style="font-weight: bold; text-decoration: underline; text-underline-offset: 2px;">
              ${suratConfig.namaKepalaSekolah}
            </div>
            <div style="font-size: 9.5pt; margin-top: 1px;">
              ${suratConfig.nipKepalaSekolah ? `NIP. ${suratConfig.nipKepalaSekolah}` : ''}
            </div>
          </div>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=900,height=800')
    if (!printWindow) {
      alert('Pop-up terblokir oleh browser. Harap izinkan pop-up untuk mencetak surat tugas.')
      return
    }

    printWindow.document.write(printHtml)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 450)
  }

  // Upload Custom Logo
  const handleUploadLogo = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        setSuratConfig(prev => ({ ...prev, logoUrl: evt.target.result }))
      }
      reader.readAsDataURL(file)
    }
  }

  // Upload Custom Cap (Disimpan permanen ke master)
  const handleUploadCap = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const url = evt.target.result
        setSuratConfig(prev => ({ ...prev, customCapUrl: url }))
        setMasterTtdForm(prev => {
          const updated = { ...prev, customCapUrl: url }
          try {
            localStorage.setItem('ebudimulia_master_stempel_ttd_v2', JSON.stringify(updated))
          } catch (err) {}
          return updated
        })
      }
      reader.readAsDataURL(file)
    }
  }

  // Upload Custom Ttd (Disimpan permanen ke master)
  const handleUploadTtd = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const url = evt.target.result
        setSuratConfig(prev => ({ ...prev, customTtdUrl: url }))
        setMasterTtdForm(prev => {
          const updated = { ...prev, customTtdUrl: url }
          try {
            localStorage.setItem('ebudimulia_master_stempel_ttd_v2', JSON.stringify(updated))
          } catch (err) {}
          return updated
        })
      }
      reader.readAsDataURL(file)
    }
  }

  // Simpan Master TTD dari Modal Pengaturan Khusus
  const handleSaveMasterTtd = () => {
    try {
      localStorage.setItem('ebudimulia_master_stempel_ttd_v2', JSON.stringify(masterTtdForm))
      setSuratConfig(prev => ({
        ...prev,
        namaKepalaSekolah: masterTtdForm.namaKepalaSekolah,
        nipKepalaSekolah: masterTtdForm.nipKepalaSekolah,
        jabatanKepalaSekolah: masterTtdForm.jabatanKepalaSekolah,
        customCapUrl: masterTtdForm.customCapUrl,
        customTtdUrl: masterTtdForm.customTtdUrl
      }))
      setShowMasterTtdModal(false)
      setNotifyModal({
        show: true,
        type: 'success',
        title: 'Berhasil Disimpan',
        message: 'Stempel dan tanda tangan resmi kepala sekolah berhasil disimpan permanen. Anda tidak perlu mengunggah ulang saat mencetak Surat Tugas.'
      })
    } catch (err) {
      alert('Gagal menyimpan stempel: ' + err.message)
    }
  }

  // Save / Update Lomba Form
  const handleSubmitForm = async (e) => {
    if (!formNamaKegiatan.trim()) {
      setNotifyModal({ show: true, type: 'error', title: 'Validasi Gagal', message: 'Nama kegiatan/lomba wajib diisi.' })
      return
    }
    if (!formTanggalMulai) {
      setNotifyModal({ show: true, type: 'error', title: 'Validasi Gagal', message: 'Tanggal mulai kegiatan wajib diisi.' })
      return
    }

    setIsSubmitting(true)
    try {
      let resolvedNamaGuru = formNamaGuru
      if (formGuruId && (!resolvedNamaGuru || isRealAdmin)) {
        const found = guruList.find(g => g.id === formGuruId)
        if (found) resolvedNamaGuru = found.nama_guru
      }
      if (!resolvedNamaGuru) {
        resolvedNamaGuru = session?.nama_guru || 'Guru Pendamping'
      }

      const payload = {
        nama_kegiatan: formNamaKegiatan.trim(),
        kategori: formKategori,
        tingkat: formTingkat,
        penyelenggara: formPenyelenggara.trim() || null,
        tempat_lokasi: formTempatLokasi.trim() || null,
        tanggal_mulai: formTanggalMulai,
        tanggal_selesai: formTanggalSelesai || null,
        guru_id: formGuruId || currentGuruId || null,
        nama_guru: resolvedNamaGuru,
        tahun_ajaran_id: selectedTaId || null,
        peserta: formPeserta,
        status: formStatus,
        keterangan: formKeterangan.trim() || null,
        created_by: session?.id || null,
        updated_at: new Date().toISOString()
      }

      if (editingItem) {
        const { error } = await supabase
          .from('pendamping_lomba')
          .update(payload)
          .eq('id', editingItem.id)

        if (error) throw error
        setNotifyModal({ show: true, type: 'success', title: 'Berhasil Diperbarui', message: 'Data kegiatan pendamping lomba berhasil diperbarui.' })
      } else {
        const { error } = await supabase
          .from('pendamping_lomba')
          .insert([payload])

        if (error) throw error
        setNotifyModal({ show: true, type: 'success', title: 'Berhasil Disimpan', message: 'Kegiatan lomba baru berhasil didaftarkan.' })
      }

      setShowFormModal(false)
      fetchLombaList()
    } catch (err) {
      console.error('Error saving pendamping_lomba:', err)
      setNotifyModal({
        show: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: err.message || 'Terjadi kesalahan saat menyimpan data. Pastikan migrasi tabel pendamping_lomba sudah dijalankan di Supabase.'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete
  const handleDeleteItem = async (item) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Kegiatan Pendamping Lomba?',
      message: `Apakah Anda yakin ingin menghapus kegiatan "${item.nama_kegiatan}" beserta seluruh daftar pesertanya? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Hapus Kegiatan',
      cancelText: 'Batal',
      type: 'danger'
    })

    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('pendamping_lomba')
        .delete()
        .eq('id', item.id)

      if (error) throw error

      setNotifyModal({ show: true, type: 'success', title: 'Berhasil Dihapus', message: 'Kegiatan lomba berhasil dihapus dari sistem.' })
      fetchLombaList()
    } catch (err) {
      console.error('Error deleting pendamping_lomba:', err)
      setNotifyModal({ show: true, type: 'error', title: 'Gagal Menghapus', message: err.message || 'Terjadi kesalahan saat menghapus data.' })
    }
  }

  // Export to Excel
  const handleExportExcel = async () => {
    if (filteredLombaList.length === 0) {
      setNotifyModal({ show: true, type: 'warning', title: 'Tidak Ada Data', message: 'Tidak ada data kegiatan lomba untuk diekspor.' })
      return
    }

    try {
      const exportRows = []
      filteredLombaList.forEach((item, idx) => {
        const pesertaArray = Array.isArray(item.peserta) ? item.peserta : []
        const pesertaText = pesertaArray.map(p => {
          const cap = p.capaian && p.capaian !== 'Belum Ditentukan' ? ` [${p.capaian}]` : ''
          return `${p.nama_lengkap} (${p.kelas || '-'})${cap}`
        }).join(', ')

        exportRows.push({
          'No': idx + 1,
          'Nama Kegiatan / Lomba': item.nama_kegiatan || '-',
          'Kategori': item.kategori || '-',
          'Tingkat': item.tingkat || '-',
          'Guru Pendamping': item.nama_guru || '-',
          'Tanggal Mulai': item.tanggal_mulai || '-',
          'Tanggal Selesai': item.tanggal_selesai || '-',
          'Penyelenggara': item.penyelenggara || '-',
          'Lokasi': item.tempat_lokasi || '-',
          'Jumlah Peserta': pesertaArray.length,
          'Daftar Siswa Peserta & Hasil': pesertaText || 'Belum ada peserta',
          'Status': item.status || 'Direncanakan',
          'Keterangan': item.keterangan || '-'
        })
      })

      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(exportRows)
      XLSX.utils.book_append_sheet(wb, ws, 'Pendamping Lomba')

      const currentTaName = tahunAjarans.find(t => t.id === selectedTaId)?.nama?.replace('/', '_') || 'Semua'
      const fileName = isRealAdmin 
        ? `Laporan_Pendamping_Lomba_Semua_Guru_TA_${currentTaName}.xlsx`
        : `Laporan_Pendamping_Lomba_${(session?.nama_guru || 'Guru').replace(/\s+/g, '_')}_TA_${currentTaName}.xlsx`

      await downloadWorkbook(wb, fileName)
    } catch (err) {
      console.error('Error exporting excel:', err)
      setNotifyModal({ show: true, type: 'error', title: 'Gagal Ekspor', message: 'Gagal membuat file Excel.' })
    }
  }

  // Filtered List
  const filteredLombaList = useMemo(() => {
    return lombaList.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = item.nama_kegiatan?.toLowerCase().includes(q)
        const matchGuru = item.nama_guru?.toLowerCase().includes(q)
        const matchPenyelenggara = item.penyelenggara?.toLowerCase().includes(q)
        const matchPeserta = Array.isArray(item.peserta) && item.peserta.some(p => 
          p.nama_lengkap?.toLowerCase().includes(q) || p.nisn?.toLowerCase().includes(q) || p.capaian?.toLowerCase().includes(q)
        )
        if (!matchName && !matchGuru && !matchPenyelenggara && !matchPeserta) return false
      }

      if (filterKategori !== 'all' && item.kategori !== filterKategori) return false
      if (filterStatus !== 'all' && item.status !== filterStatus) return false
      if (isRealAdmin && filterGuruId !== 'all' && item.guru_id !== filterGuruId) return false

      return true
    })
  }, [lombaList, searchQuery, filterKategori, filterStatus, filterGuruId, isRealAdmin])

  // Statistics
  const stats = useMemo(() => {
    const totalKegiatan = filteredLombaList.length
    let totalPesertaSlots = 0
    const uniqueNisns = new Set()
    let countBerjalan = 0
    let countSelesai = 0
    let countJuara = 0

    filteredLombaList.forEach(item => {
      const pList = Array.isArray(item.peserta) ? item.peserta : []
      totalPesertaSlots += pList.length
      pList.forEach(p => { 
        if (p.nisn) uniqueNisns.add(p.nisn) 
        if (p.capaian && p.capaian.toLowerCase().includes('juara')) countJuara++
      })
      if (item.status === 'Sedang Berjalan' || item.status === 'Direncanakan') countBerjalan++
      if (item.status === 'Selesai') countSelesai++
    })

    return {
      totalKegiatan,
      totalPeserta: uniqueNisns.size,
      totalSlotPeserta: totalPesertaSlots,
      countBerjalan,
      countSelesai,
      countJuara
    }
  }, [filteredLombaList])

  return (
    <div className="animate-slide-up space-y-6 pb-12">
      {/* HEADER SECTION */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Pendamping Lomba & Kegiatan Siswa
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {isRealAdmin
              ? 'Memantau riwayat pendampingan lomba siswa dari seluruh guru serta penerbitan surat tugas resmi.'
              : `Pencatatan dan rekam jejak kegiatan lomba siswa yang Anda (${session?.nama_guru || 'Guru'}) dampingi.`}
          </p>
        </div>

        {/* Action Buttons & Dropdown TA */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {isRealAdmin && (
            <button
              type="button"
              onClick={() => {
                setMasterTtdForm(getStoredMasterTtd())
                setShowMasterTtdModal(true)
              }}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Kelola Stempel & TTD Resmi Sekolah Permanen"
            >
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span>Stempel & TTD</span>
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Tambah Kegiatan Lomba</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Kegiatan */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Kegiatan</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalKegiatan}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Lomba terdaftar</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        </div>

        {/* Card 2: Siswa Terdampingi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Siswa Terdampingi</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalPeserta}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{stats.totalSlotPeserta} partisipasi siswa</p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>

        {/* Card 3: Perolehan Juara */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Perolehan Juara</p>
            <h3 className="text-2xl font-extrabold text-amber-600 mt-0.5">{stats.countJuara}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Kejuaraan tercatat</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
        </div>

        {/* Card 4: Selesai */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Kegiatan Selesai</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-0.5">{stats.countSelesai}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Tuntas terlaksana</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cari kegiatan, siswa, guru, penyelenggara, atau juara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedTaId}
            onChange={(e) => setSelectedTaId(e.target.value)}
            className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
          >
            <option value="">Semua Tahun Ajaran</option>
            {tahunAjarans.map(t => (
              <option key={t.id} value={t.id}>{t.nama} {t.is_aktif ? '(Aktif)' : ''}</option>
            ))}
          </select>

          <select
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
            className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
          >
            <option value="all">Semua Kategori</option>
            {KATEGORI_OPTIONS.map(kat => (
              <option key={kat} value={kat}>{kat}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
          >
            <option value="all">Semua Status</option>
            {STATUS_OPTIONS.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          {isRealAdmin && (
            <select
              value={filterGuruId}
              onChange={(e) => setFilterGuruId(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer max-w-[180px]"
            >
              <option value="all">Semua Guru Pendamping</option>
              {guruList.map(g => (
                <option key={g.id} value={g.id}>{g.nama_guru}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* TABLE LIST */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">Memuat data pendamping lomba...</p>
          </div>
        ) : filteredLombaList.length === 0 ? (
          <div className="p-14 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">Belum Ada Data Kegiatan Lomba</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery || filterKategori !== 'all' || filterStatus !== 'all'
                  ? 'Tidak ditemukan kegiatan lomba yang sesuai dengan pencarian atau filter.'
                  : 'Belum ada kegiatan lomba yang didaftarkan pada tahun ajaran ini.'}
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold transition cursor-pointer"
            >
              <span>+ Tambah Lomba Baru</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4 min-w-[210px]">Nama Kegiatan / Lomba</th>
                  <th className="py-3 px-4 min-w-[160px]">Jadwal & Lokasi</th>
                  {isRealAdmin && (
                    <th className="py-3 px-4 min-w-[150px]">Guru Pendamping</th>
                  )}
                  <th className="py-3 px-4 min-w-[210px]">Peserta & Capaian</th>
                  <th className="py-3 px-4 text-center w-24">Status</th>
                  <th className="py-3 px-4 text-center min-w-[180px]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredLombaList.map((item, idx) => {
                  const pesertaArray = Array.isArray(item.peserta) ? item.peserta : []
                  const isFinished = item.status === 'Selesai'
                  const isOngoing = item.status === 'Sedang Berjalan'
                  const juaraList = pesertaArray.filter(p => p.capaian && p.capaian.toLowerCase().includes('juara'))

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Nama Kegiatan */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 text-xs">
                            {item.nama_kegiatan}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                              {item.kategori || 'Akademik'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                              {item.tingkat || 'Kota'}
                            </span>
                            {item.penyelenggara && (
                              <span className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">
                                By: {item.penyelenggara}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Waktu & Lokasi */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-700 text-xs">
                            {item.tanggal_mulai}
                            {item.tanggal_selesai && item.tanggal_selesai !== item.tanggal_mulai && (
                              <span className="text-slate-500 font-normal"> s.d. {item.tanggal_selesai}</span>
                            )}
                          </div>
                          {item.tempat_lokasi && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[170px]">
                              {item.tempat_lokasi}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Guru Pendamping (Admin Only) */}
                      {isRealAdmin && (
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {(item.nama_guru || 'G').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                              {item.nama_guru || 'Guru Pendamping'}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Peserta Siswa & Capaian */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[10px] border border-indigo-200">
                              {pesertaArray.length} Siswa
                            </span>

                            {juaraList.length > 0 && (
                              <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md text-[10px] border border-amber-300">
                                {juaraList[0].capaian}
                                {juaraList.length > 1 && ` (+${juaraList.length - 1})`}
                              </span>
                            )}

                            {pesertaArray.length > 0 && (
                              <button
                                onClick={() => setDetailItem(item)}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                              >
                                Lihat Daftar
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {pesertaArray.slice(0, 2).map((p, pIdx) => (
                              <span
                                key={pIdx}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                  p.capaian && p.capaian.toLowerCase().includes('juara')
                                    ? 'bg-amber-50 text-amber-900 font-semibold border border-amber-200'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                <span>{p.nama_lengkap}</span>
                                {p.capaian && p.capaian !== 'Belum Ditentukan' && (
                                  <span className="font-bold text-indigo-600">[{p.capaian}]</span>
                                )}
                              </span>
                            ))}
                            {pesertaArray.length > 2 && (
                              <span className="text-[10px] text-slate-400 font-medium">
                                +{pesertaArray.length - 2} lainnya
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isFinished
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isOngoing
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {item.status || 'Direncanakan'}
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Tombol Cetak Surat Tugas (Khusus Admin) */}
                          {isRealAdmin && (
                            <button
                              title="Cetak Surat Tugas Resmi Guru"
                              onClick={() => handleOpenSuratTugas(item)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              <span>Surat Tugas</span>
                            </button>
                          )}

                          {/* Tombol Catat Hasil / Juara */}
                          <button
                            title="Catat Capaian / Juara Siswa"
                            onClick={() => handleOpenHasilModal(item)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            <span>Catat Juara</span>
                          </button>

                          <button
                            title="Edit Kegiatan"
                            onClick={() => handleOpenEditModal(item)}
                            className="text-slate-500 hover:text-indigo-600 p-1 rounded hover:bg-slate-100 text-xs font-bold cursor-pointer"
                          >
                            Edit
                          </button>

                          <button
                            title="Hapus Kegiatan"
                            onClick={() => handleDeleteItem(item)}
                            className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 text-xs font-bold cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL CETAK SURAT TUGAS RESMI (KHUSUS ADMIN)              */}
      {/* ========================================================= */}
      {suratTugasItem && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[94vh] my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Panel Administrator
                </span>
                <h3 className="font-bold text-lg text-slate-900">
                  Cetak Surat Tugas Pendamping Lomba
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintSuratTugas}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Cetak / Simpan PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSuratTugasItem(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Split Layout: Pengaturan di Kiri & Live Preview Dokumen di Kanan */}
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
              {/* Kolom Kiri: Pengaturan Surat Tugas */}
              <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-5 overflow-y-auto space-y-4 text-xs shrink-0">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b border-slate-200">
                  Pengaturan Dokumen Surat
                </div>

                {/* Nomor Surat */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block text-[11px]">
                    Nomor Surat Tugas:
                  </label>
                  <input
                    type="text"
                    value={suratConfig.nomorSurat}
                    onChange={(e) => setSuratConfig(prev => ({ ...prev, nomorSurat: e.target.value }))}
                    placeholder="Contoh: 042/ST-LOMBA/SMP-BM/IX/2026"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                  />
                </div>

                {/* Tanggal Terbit & Kota */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block text-[11px]">
                      Tanggal Surat:
                    </label>
                    <input
                      type="date"
                      value={suratConfig.tanggalSurat}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, tanggalSurat: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block text-[11px]">
                      Kota Surat:
                    </label>
                    <input
                      type="text"
                      value={suratConfig.kotaSurat}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, kotaSurat: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                {/* Pejabat Penandatangan */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Kepala Sekolah (Penandatangan)
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block text-[10px]">
                      Nama Lengkap:
                    </label>
                    <input
                      type="text"
                      value={suratConfig.namaKepalaSekolah}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, namaKepalaSekolah: e.target.value }))}
                      placeholder="Drs. Agustinus, M.Pd."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block text-[10px]">
                      NIP / NIK:
                    </label>
                    <input
                      type="text"
                      value={suratConfig.nipKepalaSekolah}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, nipKepalaSekolah: e.target.value }))}
                      placeholder="19720815 199802 1 004"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                {/* Opsi Teks Kop Surat */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Teks Kop Surat
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block text-[10px]">
                      Nama Sekolah (Baris 1):
                    </label>
                    <input
                      type="text"
                      value={suratConfig.namaSekolah}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, namaSekolah: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block text-[10px]">
                      Alamat (Baris 2):
                    </label>
                    <input
                      type="text"
                      value={suratConfig.alamatKop}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, alamatKop: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block text-[10px]">
                      Telp / Fax / Email (Baris 3):
                    </label>
                    <input
                      type="text"
                      value={suratConfig.teleponKop}
                      onChange={(e) => setSuratConfig(prev => ({ ...prev, teleponKop: e.target.value }))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                {/* Opsi Logo & Kop Surat */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-[11px]">Logo Kop Surat</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px] font-semibold">
                      <input
                        type="checkbox"
                        checked={suratConfig.showLogo}
                        onChange={(e) => setSuratConfig(prev => ({ ...prev, showLogo: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Tampilkan</span>
                    </label>
                  </div>
                  {suratConfig.showLogo && (
                    <div className="flex items-center gap-2">
                      <label className="px-2.5 py-1 bg-white hover:bg-slate-50 text-indigo-700 font-bold rounded-lg text-[10px] border border-slate-200 cursor-pointer shadow-xs transition">
                        Ganti Logo
                        <input type="file" accept="image/*" onChange={handleUploadLogo} className="hidden" />
                      </label>
                      {suratConfig.logoUrl !== '/logo.jpg' && (
                        <button
                          type="button"
                          onClick={() => setSuratConfig(prev => ({ ...prev, logoUrl: '/logo.jpg' }))}
                          className="text-[10px] text-rose-600 hover:underline font-semibold cursor-pointer"
                        >
                          Reset Default
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Opsi Cap Sekolah & Tanda Tangan */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-[11px]">Cap & Tanda Tangan</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px] font-semibold">
                      <input
                        type="checkbox"
                        checked={suratConfig.showCapTtd}
                        onChange={(e) => setSuratConfig(prev => ({ ...prev, showCapTtd: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Sertakan</span>
                    </label>
                  </div>

                  {suratConfig.showCapTtd && (
                    <div className="space-y-2 pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Stempel / Cap:</span>
                        <label className="px-2 py-0.5 bg-white text-indigo-700 font-bold rounded text-[10px] border border-slate-200 cursor-pointer hover:bg-slate-50">
                          Upload Cap
                          <input type="file" accept="image/*" onChange={handleUploadCap} className="hidden" />
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Tanda Tangan:</span>
                        <label className="px-2 py-0.5 bg-white text-indigo-700 font-bold rounded text-[10px] border border-slate-200 cursor-pointer hover:bg-slate-50">
                          Upload TTD
                          <input type="file" accept="image/*" onChange={handleUploadTtd} className="hidden" />
                        </label>
                      </div>
                      {(suratConfig.customCapUrl || suratConfig.customTtdUrl) && (
                        <button
                          type="button"
                          onClick={() => setSuratConfig(prev => ({ ...prev, customCapUrl: '', customTtdUrl: '' }))}
                          className="text-[10px] text-rose-600 hover:underline font-semibold block pt-1 cursor-pointer"
                        >
                          Gunakan Cap & TTD Standar Sistem
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Kolom Kanan: Live WYSIWYG Sheet Preview */}
              <div className="flex-1 bg-slate-200/70 p-4 sm:p-8 overflow-y-auto flex justify-center">
                <div className="bg-white rounded-lg shadow-xl p-8 sm:p-12 w-full max-w-[680px] text-black font-serif min-h-[880px] flex flex-col justify-between select-none">
                  <div>
                    {/* Kop Surat Resmi Sesuai Format Gambar Sekolah */}
                    <div className="flex items-center justify-center pb-2">
                      {suratConfig.showLogo && (
                        <img
                          src={suratConfig.logoUrl || '/logo.jpg'}
                          alt="Logo SMP Budi Mulia"
                          className="w-16 h-20 sm:w-20 sm:h-24 object-contain mr-5 shrink-0"
                          onError={(e) => { e.target.src = '/logo.jpg' }}
                        />
                      )}
                      <div className="flex-1 text-center font-serif">
                        <div className="font-bold text-sm sm:text-base md:text-[17px] uppercase tracking-wide text-slate-800 leading-snug">
                          {suratConfig.namaSekolah}
                        </div>
                        <div className="font-bold text-xs sm:text-sm text-slate-700 mt-1">
                          {suratConfig.alamatKop}
                        </div>
                        <div className="font-bold text-[11px] sm:text-xs text-slate-700 mt-0.5">
                          {suratConfig.teleponKop}
                        </div>
                      </div>
                    </div>

                    {/* Single Divider Line */}
                    <div className="border-b-[1.5px] border-slate-700 w-full mt-2 mb-4" />

                    {/* Header Surat */}
                    <div className="text-center my-4">
                      <h4 className="font-bold text-sm tracking-wider uppercase underline underline-offset-4">
                        SURAT TUGAS
                      </h4>
                      <p className="text-xs font-mono mt-1 text-slate-700">
                        Nomor: {suratConfig.nomorSurat}
                      </p>
                    </div>

                    {/* Paragraf Pembuka */}
                    <p className="text-xs leading-relaxed text-justify mb-2.5">
                      Yang bertanda tangan di bawah ini, Kepala {suratConfig.namaSekolah}, dengan ini memberikan tugas kedinasan kepada:
                    </p>

                    {/* Data Guru */}
                    <table className="w-full text-xs mb-3 border-collapse">
                      <tbody>
                        <tr>
                          <td className="w-36 py-0.5 text-slate-700">Nama Guru</td>
                          <td className="w-3 text-center">:</td>
                          <td className="font-bold">{suratTugasItem.nama_guru || 'Guru Pendamping'}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Jabatan / Tugas</td>
                          <td className="text-center">:</td>
                          <td>Guru Pendamping Kegiatan / Perlombaan Siswa</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Unit Kerja</td>
                          <td className="text-center">:</td>
                          <td>{suratConfig.namaSekolah}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Narasi Kegiatan */}
                    <p className="text-xs leading-relaxed text-justify mb-2">
                      Untuk mendampingi, membimbing, dan mengkoordinasikan siswa-siswi {suratConfig.namaSekolah} dalam mengikuti kegiatan lomba dengan rincian sebagai berikut:
                    </p>

                    <table className="w-full text-xs mb-3 border-collapse">
                      <tbody>
                        <tr>
                          <td className="w-36 py-0.5 text-slate-700">Nama Kegiatan / Lomba</td>
                          <td className="w-3 text-center">:</td>
                          <td className="font-bold">{suratTugasItem.nama_kegiatan}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Kategori / Tingkat</td>
                          <td className="text-center">:</td>
                          <td>{suratTugasItem.kategori || 'Akademik'} / Tingkat {suratTugasItem.tingkat || 'Kota'}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Penyelenggara</td>
                          <td className="text-center">:</td>
                          <td>{suratTugasItem.penyelenggara || '-'}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Waktu Pelaksanaan</td>
                          <td className="text-center">:</td>
                          <td>
                            {formatIndoDate(suratTugasItem.tanggal_mulai)}
                            {suratTugasItem.tanggal_selesai && suratTugasItem.tanggal_selesai !== suratTugasItem.tanggal_mulai ? ` s.d. ${formatIndoDate(suratTugasItem.tanggal_selesai)}` : ''}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-0.5 text-slate-700">Tempat / Lokasi</td>
                          <td className="text-center">:</td>
                          <td>{suratTugasItem.tempat_lokasi || '-'}</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Tabel Siswa */}
                    <p className="text-xs mb-1.5 font-medium">
                      Adapun daftar siswa-siswi yang didampingi adalah sebagai berikut:
                    </p>

                    <table className="w-full border border-black border-collapse text-[11px] mb-4">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="border border-black px-2 py-1 text-center w-8">No</th>
                          <th className="border border-black px-2 py-1 text-left">Nama Siswa</th>
                          <th className="border border-black px-2 py-1 text-center w-24">NISN</th>
                          <th className="border border-black px-2 py-1 text-center w-16">Kelas</th>
                          <th className="border border-black px-2 py-1 text-left w-24">Peran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(suratTugasItem.peserta) && suratTugasItem.peserta.length > 0 ? (
                          suratTugasItem.peserta.map((p, pIdx) => (
                            <tr key={pIdx}>
                              <td className="border border-black px-2 py-1 text-center">{pIdx + 1}</td>
                              <td className="border border-black px-2 py-1 font-bold">{p.nama_lengkap}</td>
                              <td className="border border-black px-2 py-1 text-center">{p.nisn || '-'}</td>
                              <td className="border border-black px-2 py-1 text-center">{p.kelas || '-'}</td>
                              <td className="border border-black px-2 py-1">{p.peran || 'Peserta'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="border border-black px-2 py-2 text-center text-slate-400">
                              Belum ada siswa yang didaftarkan pada kegiatan ini.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Penutup */}
                    <p className="text-xs leading-relaxed text-justify">
                      Demikian Surat Tugas ini dibuat dan diberikan kepada yang bersangkutan untuk dapat dilaksanakan dengan penuh rasa tanggung jawab dan dedikasi sebaik-baiknya.
                    </p>
                  </div>

                  {/* Pengesahan Tanda Tangan */}
                  <div className="flex justify-end pt-6">
                    <div className="w-60 text-center text-xs">
                      <div>{suratConfig.kotaSurat}, {formatIndoDate(suratConfig.tanggalSurat)}</div>
                      <div className="font-bold mt-0.5">{suratConfig.jabatanKepalaSekolah}</div>

                      {/* Area Cap & Tanda Tangan */}
                      <div className="relative h-20 my-1 flex items-center justify-center">
                        {suratConfig.showCapTtd ? (
                          <>
                            {/* Tanda Tangan */}
                            {suratConfig.customTtdUrl ? (
                              <img
                                src={suratConfig.customTtdUrl}
                                alt="TTD"
                                className="h-16 object-contain absolute right-4"
                              />
                            ) : (
                              <svg viewBox="0 0 200 80" className="w-36 h-14 text-blue-900 absolute right-2">
                                <path d="M 20,55 Q 45,15 70,50 T 110,40 Q 130,20 145,55 T 180,45" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M 40,65 Q 90,55 165,60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            )}

                            {/* Cap Stempel */}
                            {suratConfig.customCapUrl ? (
                              <img
                                src={suratConfig.customCapUrl}
                                alt="Cap"
                                className="w-20 h-20 object-contain absolute left-6 opacity-85"
                              />
                            ) : (
                              <svg viewBox="0 0 160 160" className="w-20 h-20 text-indigo-700 opacity-85 absolute left-4 -rotate-6">
                                <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6,2" />
                                <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                <circle cx="80" cy="80" r="48" fill="none" stroke="currentColor" strokeWidth="1.2" />
                                <path id="previewCurveTop" d="M 24,80 A 56,56 0 0,1 136,80" fill="none" />
                                <text fontSize="11px" fontWeight="900" letterSpacing="0.15em" fill="currentColor">
                                  <textPath href="#previewCurveTop" startOffset="50%" textAnchor="middle">SMP BUDI MULIA</textPath>
                                </text>
                                <path id="previewCurveBottom" d="M 136,80 A 56,56 0 0,1 24,80" fill="none" />
                                <text fontSize="9px" fontWeight="700" letterSpacing="0.2em" fill="currentColor">
                                  <textPath href="#previewCurveBottom" startOffset="50%" textAnchor="middle">JAKARTA PUSAT</textPath>
                                </text>
                                <g transform="translate(80, 80)">
                                  <polygon points="0,-10 3,-3 10,-3 4,2 6,9 0,5 -6,9 -4,2 -10,-3 -3,-3" fill="currentColor" opacity="0.85" />
                                </g>
                              </svg>
                            )}
                          </>
                        ) : (
                          <div className="h-16" />
                        )}
                      </div>

                      <div className="font-bold underline underline-offset-2">
                        {suratConfig.namaKepalaSekolah}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 font-mono">
                        NIP. {suratConfig.nipKepalaSekolah}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL CATAT CAPAIAN / HASIL JUARA & SINKRONISASI PRESTASI */}
      {/* ========================================================= */}
      {hasilModalItem && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[92vh] my-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  Hasil & Kejuaraan Lomba
                </span>
                <h3 className="font-bold text-lg text-slate-900 line-clamp-1">
                  Catat Capaian / Juara: {hasilModalItem.nama_kegiatan}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHasilModalItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleSubmitHasil} className="p-6 sm:p-7 space-y-5 overflow-y-auto flex-1 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Tanggal Kegiatan</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{hasilModalItem.tanggal_mulai}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Tingkat</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{hasilModalItem.tingkat || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Guru Pendamping</div>
                  <div className="font-bold text-indigo-700 text-xs mt-0.5">{hasilModalItem.nama_guru || '-'}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                    Tentukan Hasil Setiap Siswa Peserta:
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {hasilPesertaState.length} Siswa
                  </span>
                </div>

                {hasilPesertaState.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-400 border border-slate-200">
                    Belum ada peserta pada lomba ini. Silakan tambahkan peserta terlebih dahulu melalui tombol Edit.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {hasilPesertaState.map((p, idx) => (
                      <div
                        key={p.nisn || idx}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs">{p.nama_lengkap}</div>
                          <div className="text-[10px] text-slate-500">
                            Kelas: <span className="font-bold text-slate-700">{p.kelas || '-'}</span> | NISN: {p.nisn}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={p.capaian || 'Peserta / Keikutsertaan'}
                            onChange={(e) => {
                              const val = e.target.value
                              setHasilPesertaState(prev => prev.map((item, i) => i === idx ? {
                                ...item,
                                capaian: val,
                                syncPrestasi: val !== 'Belum Ditentukan'
                              } : item))
                            }}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-pointer"
                          >
                            {CAPAIAN_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="p-1 bg-indigo-600 text-white rounded shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-indigo-900 text-xs">
                      Otomatis Masukkan ke Data Prestasi Siswa
                    </h5>
                    <p className="text-[11px] text-indigo-800 leading-relaxed">
                      Siswa yang meraih juara atau capaian di atas akan langsung otomatis didaftarkan ke modul <strong>Prestasi & Lomba Siswa</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setHasilModalItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || hasilPesertaState.length === 0}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Capaian & Sinkronkan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL FORM TAMBAH / EDIT KEGIATAN LOMBA                   */}
      {/* ========================================================= */}
      {showFormModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[92vh] my-auto">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50">
              <div className="space-y-0.5">
                <h3 className="font-bold text-lg text-slate-900">
                  {editingItem ? 'Edit Kegiatan Pendamping Lomba' : 'Tambah Kegiatan / Lomba Baru'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingItem ? 'Perbarui informasi perlombaan dan daftar siswa peserta' : 'Daftarkan kegiatan lomba beserta siswa yang Anda dampingi'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmitForm} className="p-6 sm:p-7 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Nama Kegiatan */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Nama Kegiatan / Lomba <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Olimpiade Sains Nasional (OSN) Matematika Tingkat Kota"
                  value={formNamaKegiatan}
                  onChange={(e) => setFormNamaKegiatan(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 shadow-xs"
                />
              </div>

              {/* Kategori & Tingkat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Kategori Lomba
                  </label>
                  <select
                    value={formKategori}
                    onChange={(e) => setFormKategori(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 bg-white shadow-xs cursor-pointer"
                  >
                    {KATEGORI_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Tingkat Wilayah
                  </label>
                  <select
                    value={formTingkat}
                    onChange={(e) => setFormTingkat(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 bg-white shadow-xs cursor-pointer"
                  >
                    {TINGKAT_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tanggal Mulai & Selesai */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Tanggal Pelaksanaan / Mulai <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formTanggalMulai}
                    onChange={(e) => setFormTanggalMulai(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 shadow-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Tanggal Selesai (Opsional)
                  </label>
                  <input
                    type="date"
                    value={formTanggalSelesai}
                    min={formTanggalMulai}
                    onChange={(e) => setFormTanggalSelesai(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 shadow-xs"
                  />
                </div>
              </div>

              {/* Penyelenggara & Lokasi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Penyelenggara Kegiatan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Kemendikbudristek / Dinas Pendidikan"
                    value={formPenyelenggara}
                    onChange={(e) => setFormPenyelenggara(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 shadow-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Tempat / Lokasi Pelaksanaan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: GOR Soemantri Brodjonegoro / Online"
                    value={formTempatLokasi}
                    onChange={(e) => setFormTempatLokasi(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 shadow-xs"
                  />
                </div>
              </div>

              {/* Guru Pendamping */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Guru Pendamping
                </label>
                {isRealAdmin ? (
                  <select
                    value={formGuruId}
                    onChange={(e) => {
                      setFormGuruId(e.target.value)
                      const found = guruList.find(g => g.id === e.target.value)
                      if (found) setFormNamaGuru(found.nama_guru)
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold text-slate-900 bg-white shadow-xs cursor-pointer"
                  >
                    <option value="">-- Pilih Guru Pendamping --</option>
                    {guruList.map(g => (
                      <option key={g.id} value={g.id}>{g.nama_guru}</option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] flex items-center justify-center font-bold">
                      ✓
                    </span>
                    <span>{session?.nama_guru || 'Anda (Guru Login)'}</span>
                  </div>
                )}
              </div>

              {/* Status Kegiatan */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Status Kegiatan
                </label>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormStatus(st)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-center font-bold text-xs transition cursor-pointer ${
                        formStatus === st
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Daftar Siswa Peserta */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
                      Daftar Siswa Peserta Lomba
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Ketik nama siswa untuk menambahkan ke daftar peserta (bisa lebih dari 1 siswa).
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-200">
                    {formPeserta.length} Siswa Terpilih
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik minimal 2 huruf nama siswa atau NISN..."
                    value={studentSearchTerm}
                    onChange={(e) => handleStudentSearch(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-semibold shadow-xs"
                  />
                  {isSearchingStudent && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-indigo-500 font-bold">
                      Mencari...
                    </div>
                  )}

                  {studentSearchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-30 overflow-hidden max-h-56 overflow-y-auto animate-slide-up">
                      <div className="p-1 divide-y divide-slate-100">
                        {studentSearchResults.map(s => {
                          const isAlreadyAdded = formPeserta.some(p => p.nisn === s.nisn)
                          return (
                            <button
                              key={s.nisn}
                              type="button"
                              disabled={isAlreadyAdded}
                              onClick={() => handleAddStudent(s)}
                              className={`w-full p-2.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                                isAlreadyAdded
                                  ? 'bg-slate-50 opacity-50 cursor-not-allowed'
                                  : 'hover:bg-indigo-50/70 cursor-pointer'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900 text-xs">{s.nama_lengkap}</div>
                                <div className="text-[10px] text-slate-500">
                                  Kelas: <span className="font-bold text-slate-700">{s.kelas || '-'}</span> | NISN: {s.nisn}
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isAlreadyAdded ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'
                              }`}>
                                {isAlreadyAdded ? 'Sudah Ada' : '+ Tambah'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {formPeserta.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                    Belum ada siswa yang ditambahkan. Gunakan kolom pencarian di atas untuk menambahkan peserta lomba.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {formPeserta.map((peserta, pIdx) => (
                      <div
                        key={peserta.nisn || pIdx}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {pIdx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate text-xs">
                              {peserta.nama_lengkap}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Kelas: <span className="font-semibold text-slate-700">{peserta.kelas || '-'}</span> | NISN: {peserta.nisn}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            placeholder="Peran (Peserta/Ketua)"
                            value={peserta.peran || 'Peserta'}
                            onChange={(e) => handleUpdateStudentRole(peserta.nisn, e.target.value)}
                            className="w-24 px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStudent(peserta.nisn)}
                            className="w-6 h-6 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center font-bold text-xs transition cursor-pointer"
                            title="Hapus Siswa dari Lomba"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Catatan / Keterangan */}
              <div className="space-y-1.5 pt-3 border-t border-slate-200">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
                  Catatan / Keterangan Tambahan
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan persiapan, jadwal bimbingan, atau perlengkapan lomba..."
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium text-slate-900 shadow-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Daftarkan Lomba'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL DETAIL KEGIATAN & DAFTAR PESERTA                    */}
      {/* ========================================================= */}
      {detailItem && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Detail Kegiatan Lomba
                </span>
                <h3 className="font-bold text-base text-slate-900 line-clamp-1">{detailItem.nama_kegiatan}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Kategori</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{detailItem.kategori || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Tingkat</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">{detailItem.tingkat || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Status</div>
                  <div className="font-bold text-indigo-700 text-xs mt-0.5">{detailItem.status || 'Direncanakan'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Tanggal</div>
                  <div className="font-bold text-slate-800 text-xs mt-0.5">
                    {detailItem.tanggal_mulai}
                    {detailItem.tanggal_selesai && ` s.d. ${detailItem.tanggal_selesai}`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Penyelenggara</div>
                  <div className="font-semibold text-slate-800 text-xs mt-0.5 truncate">{detailItem.penyelenggara || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Lokasi</div>
                  <div className="font-semibold text-slate-800 text-xs mt-0.5 truncate">{detailItem.tempat_lokasi || '-'}</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-indigo-900 uppercase">Guru Pendamping:</div>
                  <div className="font-bold text-indigo-950 text-sm mt-0.5">
                    {detailItem.nama_guru || 'Guru Pendamping'}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  {(detailItem.nama_guru || 'G').charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Daftar Siswa Peserta ({Array.isArray(detailItem.peserta) ? detailItem.peserta.length : 0} Siswa)
                  </h4>
                  <div className="flex items-center gap-2">
                    {isRealAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          const item = detailItem
                          setDetailItem(null)
                          handleOpenSuratTugas(item)
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        <span>Surat Tugas</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const item = detailItem
                        setDetailItem(null)
                        handleOpenHasilModal(item)
                      }}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      <span>Catat / Update Juara</span>
                    </button>
                  </div>
                </div>

                {!detailItem.peserta || detailItem.peserta.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 text-center text-slate-400 border border-slate-200">
                    Belum ada siswa yang terdaftar pada kegiatan ini.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {detailItem.peserta.map((peserta, pIdx) => (
                      <div key={pIdx} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                            {pIdx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{peserta.nama_lengkap}</div>
                            <div className="text-[10px] text-slate-500">
                              NISN: {peserta.nisn} | Kelas: <span className="font-semibold text-slate-700">{peserta.kelas || '-'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {peserta.capaian && peserta.capaian !== 'Belum Ditentukan' && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                              {peserta.capaian}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                            {peserta.peran || 'Peserta'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detailItem.keterangan && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Catatan / Keterangan:</div>
                  <p className="text-xs text-slate-700 leading-relaxed">{detailItem.keterangan}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL PENGATURAN MASTER STEMPEL & TTD SEKOLAH (ADMIN)     */}
      {/* ========================================================= */}
      {showMasterTtdModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up flex flex-col my-auto border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-slate-50">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  Pengaturan Dokumen Kedinasan
                </span>
                <h3 className="font-bold text-base sm:text-lg text-slate-900">
                  Stempel & Tanda Tangan Resmi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMasterTtdModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
              <p className="text-slate-600 leading-relaxed text-xs">
                Upload cap stempel sekolah dan tanda tangan kepala sekolah sekali di sini. File akan tersimpan permanen dan otomatis digunakan untuk setiap cetak Surat Tugas.
              </p>

              {/* Data Pejabat */}
              <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Data Kepala Sekolah (Penandatangan)
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block text-[11px]">
                    Nama Lengkap & Gelar:
                  </label>
                  <input
                    type="text"
                    value={masterTtdForm.namaKepalaSekolah}
                    onChange={(e) => setMasterTtdForm(prev => ({ ...prev, namaKepalaSekolah: e.target.value }))}
                    placeholder="Contoh: Septian Ruswadi, S.Pd"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block text-[11px]">
                      NIP Kepala Sekolah:
                    </label>
                    <input
                      type="text"
                      value={masterTtdForm.nipKepalaSekolah}
                      onChange={(e) => setMasterTtdForm(prev => ({ ...prev, nipKepalaSekolah: e.target.value }))}
                      placeholder="19720815 199802 1 004"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-700 block text-[11px]">
                      Jabatan:
                    </label>
                    <input
                      type="text"
                      value={masterTtdForm.jabatanKepalaSekolah}
                      onChange={(e) => setMasterTtdForm(prev => ({ ...prev, jabatanKepalaSekolah: e.target.value }))}
                      placeholder="Kepala SMP Budi Mulia"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Upload Stempel & TTD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Upload Cap */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 text-[11px]">Cap Stempel Sekolah</div>
                  <div className="h-20 bg-white border border-dashed border-slate-300 rounded-lg flex items-center justify-center p-1 relative overflow-hidden">
                    {masterTtdForm.customCapUrl ? (
                      <img src={masterTtdForm.customCapUrl} alt="Cap Stempel" className="h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">Stempel Standar Sistem</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[10px] text-center cursor-pointer shadow-xs transition">
                      Pilih File Cap
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = (evt) => setMasterTtdForm(prev => ({ ...prev, customCapUrl: evt.target.result }))
                            reader.readAsDataURL(file)
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {masterTtdForm.customCapUrl && (
                      <button
                        type="button"
                        onClick={() => setMasterTtdForm(prev => ({ ...prev, customCapUrl: '' }))}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 text-[10px] font-bold cursor-pointer"
                        title="Hapus / Reset"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Upload TTD */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 text-[11px]">Tanda Tangan Digital</div>
                  <div className="h-20 bg-white border border-dashed border-slate-300 rounded-lg flex items-center justify-center p-1 relative overflow-hidden">
                    {masterTtdForm.customTtdUrl ? (
                      <img src={masterTtdForm.customTtdUrl} alt="Tanda Tangan" className="h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">TTD Standar Sistem</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[10px] text-center cursor-pointer shadow-xs transition">
                      Pilih File TTD
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onload = (evt) => setMasterTtdForm(prev => ({ ...prev, customTtdUrl: evt.target.result }))
                            reader.readAsDataURL(file)
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {masterTtdForm.customTtdUrl && (
                      <button
                        type="button"
                        onClick={() => setMasterTtdForm(prev => ({ ...prev, customTtdUrl: '' }))}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 text-[10px] font-bold cursor-pointer"
                        title="Hapus / Reset"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Live Overlay Preview */}
              <div className="p-3.5 bg-slate-100/80 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase">
                  Pratinjau Pengesahan Titimangsa:
                </span>
                <div className="bg-white p-4 rounded-lg border border-slate-200 font-serif text-center max-w-[260px] mx-auto text-black">
                  <div className="text-[11px] font-medium">Jakarta, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div className="text-[11px] font-bold mt-0.5">{masterTtdForm.jabatanKepalaSekolah}</div>
                  
                  {/* Overlay Cap & TTD */}
                  <div className="relative h-16 my-1">
                    {masterTtdForm.customTtdUrl ? (
                      <img
                        src={masterTtdForm.customTtdUrl}
                        alt="Tanda Tangan"
                        className="absolute right-4 top-0 h-16 object-contain"
                      />
                    ) : (
                      <svg viewBox="0 0 200 80" className="absolute right-2 top-0 w-28 h-12 text-blue-900">
                        <path d="M 20,55 Q 45,15 70,50 T 110,40 Q 130,20 145,55 T 180,45" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 40,65 Q 90,55 165,60" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    )}

                    {masterTtdForm.customCapUrl ? (
                      <img
                        src={masterTtdForm.customCapUrl}
                        alt="Cap Stempel"
                        className="absolute right-14 top-1 h-16 w-16 object-contain opacity-85"
                      />
                    ) : (
                      <svg viewBox="0 0 160 160" className="absolute right-12 top-0 w-16 h-16 text-indigo-700 opacity-85 -rotate-6">
                        <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6,2" />
                        <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="80" cy="80" r="48" fill="none" stroke="currentColor" strokeWidth="1.2" />
                        <path id="curveTopPreview" d="M 24,80 A 56,56 0 0,1 136,80" fill="none" />
                        <text fontSize="11px" fontWeight="900" letterSpacing="0.15em" fill="currentColor">
                          <textPath href="#curveTopPreview" startOffset="50%" textAnchor="middle">SMP BUDI MULIA</textPath>
                        </text>
                      </svg>
                    )}
                  </div>

                  <div className="text-[11px] font-bold underline underline-offset-2">
                    {masterTtdForm.namaKepalaSekolah}
                  </div>
                  <div className="text-[9px] text-slate-700 mt-0.5">
                    NIP. {masterTtdForm.nipKepalaSekolah}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowMasterTtdModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveMasterTtd}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Modal */}
      {ConfirmModalComponent}

      {/* Notification Modal */}
      {notifyModal.show && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-slide-up">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${
              notifyModal.type === 'error' ? 'bg-rose-50 text-rose-600' : notifyModal.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {notifyModal.type === 'error' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              ) : notifyModal.type === 'warning' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">{notifyModal.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{notifyModal.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotifyModal(prev => ({ ...prev, show: false }))}
              className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
