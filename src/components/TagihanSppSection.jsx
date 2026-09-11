import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { downloadFile } from '../utils/fileDownloader'
import { useConfirm } from '../utils/useConfirm'

// Urutan Bulan Ajaran Indonesia (Tahun Ajaran: Juli = 1 s.d. Juni = 12)
export const BULAN_AJARAN = [
  { id: 1, nama: 'Juli', short: 'Jul', semester: 1 },
  { id: 2, nama: 'Agustus', short: 'Agu', semester: 1 },
  { id: 3, nama: 'September', short: 'Sep', semester: 1 },
  { id: 4, nama: 'Oktober', short: 'Okt', semester: 1 },
  { id: 5, nama: 'November', short: 'Nov', semester: 1 },
  { id: 6, nama: 'Desember', short: 'Des', semester: 1 },
  { id: 7, nama: 'Januari', short: 'Jan', semester: 2 },
  { id: 8, nama: 'Februari', short: 'Feb', semester: 2 },
  { id: 9, nama: 'Maret', short: 'Mar', semester: 2 },
  { id: 10, nama: 'April', short: 'Apr', semester: 2 },
  { id: 11, nama: 'Mei', short: 'Mei', semester: 2 },
  { id: 12, nama: 'Juni', short: 'Jun', semester: 2 }
]

const BCA_PREFIX_DEFAULT = '5090300'

export default function TagihanSppSection({ session, activeTa, readOnly = false }) {
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // State Tabs: 'matriks' | 'upload_bca' | 'broadcast_wa' | 'tarif_siswa' | 'log_transaksi'
  const [activeTab, setActiveTab] = useState('matriks')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Filter & Search
  const [kelasFilter, setKelasFilter] = useState('Semua')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('semua') // 'semua' | 'tunggakan' | 'lunas'

  // Master Data
  const [siswaList, setSiswaList] = useState([])
  const [allKelas, setAllKelas] = useState([])
  const [permanentOrtuMap, setPermanentOrtuMap] = useState({}) // nisn => { nama_ortu, no_hp_ortu }
  const [tagihanMap, setTagihanMap] = useState({}) // nisn_bulan => tagihan record
  const [tarifSiswaMap, setTarifSiswaMap] = useState({}) // nisn => tarif record
  const [bcaLogs, setBcaLogs] = useState([])

  // Modal Detail / Input Pembayaran Manual
  const [selectedStudentForPay, setSelectedStudentForPay] = useState(null)
  const [selectedBulanForPay, setSelectedBulanForPay] = useState(null)
  const [payFormData, setPayFormData] = useState({
    nominal: 800000,
    metode: 'tunai',
    keterangan: '',
    noRef: ''
  })
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)

  // Upload BCA State
  const [bcaFile, setBcaFile] = useState(null)
  const [parsedBcaData, setParsedBcaData] = useState([])
  const [bcaParseStats, setBcaParseStats] = useState({ total: 0, matched: 0, newCount: 0, skipCount: 0 })

  // WhatsApp Broadcast Selection
  const [selectedNisnsForWa, setSelectedNisnsForWa] = useState(new Set())
  const [customWaTemplate, setCustomWaTemplate] = useState(
    `Yth. Bapak/Ibu Orang Tua dari *{NAMA_SISWA}* (Kelas {KELAS}),\n\nKami menginformasikan tagihan SPP sekolah yang belum terselesaikan hingga bulan {BATAS_BULAN}:\n📌 *Bulan Menunggak:* {BULAN_TUNGGAKAN}\n💰 *Total Tagihan:* *Rp {TOTAL_TUNGGAKAN}*\n\nPembayaran dapat ditransfer via Virtual Account BCA:\n🏦 *No. VA BCA:* *{NO_VA_BCA}*\n(a.n SMP Budi Mulia - {NAMA_SISWA})\n\n_Mohon abaikan pesan ini apabila Bapak/Ibu telah melakukan pembayaran. Terima kasih._\n\n*Tata Usaha Keuangan SMP Budi Mulia*`
  )

  // Pengaturan Visibilitas Menu di Dashboard Orang Tua
  const [showTagihanOrtu, setShowTagihanOrtu] = useState(true)
  const [togglingVisibilitas, setTogglingVisibilitas] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Fetch All Data
  // ─────────────────────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // a. Ambil daftar siswa aktif
      let studentQuery = supabase
        .from('siswa_lengkap')
        .select('*')
        .order('kelas', { ascending: true })
        .order('nama_lengkap', { ascending: true })

      if (activeTa?.id) {
        studentQuery = studentQuery.eq('tahun_ajaran_id', activeTa.id)
      }

      const { data: siswaData, error: siswaErr } = await studentQuery
      if (siswaErr) throw siswaErr

      // Deduplicate siswa berdasarkan NISN unik
      const studentMap = new Map()
      ;(siswaData || []).forEach(s => {
        const nisnKey = String(s.nisn).trim()
        if (nisnKey && (!studentMap.has(nisnKey) || s.is_aktif)) {
          studentMap.set(nisnKey, s)
        }
      })
      const uniqueStudents = Array.from(studentMap.values())
      setSiswaList(uniqueStudents)

      // Kumpulan kelas unik
      const kelasSet = new Set()
      uniqueStudents.forEach(s => { if (s.kelas) kelasSet.add(s.kelas) })
      setAllKelas(Array.from(kelasSet).sort())

      // b. Ambil data biodata Orang Tua dari siswa_permanent (no_hp_ortu & nama_ortu terupdate)
      const { data: permData } = await supabase
        .from('siswa_permanent')
        .select('nisn, nama_ortu, no_hp_ortu')
      const pMap = {}
      if (permData) {
        permData.forEach(p => {
          if (p.nisn) pMap[String(p.nisn).trim()] = p
        })
      }
      setPermanentOrtuMap(pMap)

      // c. Ambil tarif khusus siswa
      const { data: tarifData } = await supabase.from('tarif_spp_siswa').select('*')
      const tMap = {}
      if (tarifData) {
        tarifData.forEach(t => { tMap[String(t.siswa_nisn).trim()] = t })
      }
      setTarifSiswaMap(tMap)

      // c. Ambil data tagihan SPP
      let queryTagihan = supabase.from('tagihan_spp').select('*')
      if (activeTa?.id) {
        queryTagihan = queryTagihan.eq('tahun_ajaran_id', activeTa.id)
      }
      const { data: tagihanData, error: tagihanErr } = await queryTagihan
      if (tagihanErr && tagihanErr.code !== 'PGRST116') {
        console.warn('Tagihan fetch error:', tagihanErr)
      }

      const tgMap = {}
      if (tagihanData) {
        tagihanData.forEach(t => {
          const key = `${String(t.siswa_nisn).trim()}_${t.bulan}`
          tgMap[key] = t
        })
      }
      setTagihanMap(tgMap)

      // d. Ambil riwayat log mutasi BCA
      const { data: logsData } = await supabase
        .from('transaksi_bca_log')
        .select('*')
        .order('tanggal_transaksi', { ascending: false })
        .limit(100)
      setBcaLogs(logsData || [])

      // e. Ambil pengaturan visibilitas orang tua
      const { data: settingData } = await supabase
        .from('pengaturan_sekolah')
        .select('setting_value')
        .eq('setting_key', 'show_tagihan_ortu')
        .maybeSingle()
      if (settingData) {
        setShowTagihanOrtu(settingData.setting_value === 'true')
      }

    } catch (err) {
      console.error('Error loading Tagihan SPP:', err)
      setErrorMsg('Gagal memuat data tagihan: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTa])

  // Toggle Visibilitas Orang Tua (Instant Save)
  const handleToggleParentVisibility = async () => {
    if (readOnly) return
    setTogglingVisibilitas(true)
    const newStatus = !showTagihanOrtu
    try {
      await supabase.from('pengaturan_sekolah').delete().eq('setting_key', 'show_tagihan_ortu')
      const { error } = await supabase.from('pengaturan_sekolah').insert([{
        setting_key: 'show_tagihan_ortu',
        setting_value: newStatus.toString()
      }])
      if (error) throw error
      setShowTagihanOrtu(newStatus)
      setSuccessMsg(newStatus ? '✅ Menu Tagihan & SPP sekarang DITAMPILKAN di akun Orang Tua!' : '🔒 Menu Tagihan & SPP sekarang DISEMBUNYIKAN dari akun Orang Tua!')
    } catch (err) {
      console.error('Error updating parent visibility:', err)
      setErrorMsg('Gagal mengubah visibilitas orang tua: ' + err.message)
    } finally {
      setTogglingVisibilitas(false)
    }
  }

  // Helper mendapatkan tarif SPP per siswa
  const getTarifSiswa = (nisn) => {
    const t = tarifSiswaMap[String(nisn).trim()]
    return t ? Number(t.nominal_spp) : 800000 // Default Rp 800.000 jika belum diset khusus
  }

  // Helper nomor VA BCA siswa
  const getVaBcaSiswa = (siswa) => {
    const custom = tarifSiswaMap[String(siswa.nisn).trim()]?.nomor_va_bca
    if (custom) return custom
    const nomorInduk = siswa.no_induk || siswa.nisn || ''
    return `${BCA_PREFIX_DEFAULT}${nomorInduk}`
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Generate Tagihan 12 Bulan Massal
  // ─────────────────────────────────────────────────────────────────────────────
  const handleGenerateTagihanMassal = async () => {
    const confirmed = await requestConfirm({
      title: 'Generate Tagihan SPP 1 Tahun Ajaran',
      message: `Apakah Anda yakin ingin membuat tagihan SPP 12 bulan untuk ${siswaList.length} siswa aktif? Siswa yang sudah memiliki tagihan tidak akan tertimpa.`,
      icon: 'info',
      confirmColor: 'indigo',
      confirmLabel: 'Ya, Generate Tagihan'
    })
    if (!confirmed) return

    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const recordsToInsert = []
      const tahunMulai = activeTa?.nama ? parseInt(activeTa.nama.split('/')[0], 10) : new Date().getFullYear()

      siswaList.forEach(siswa => {
        const nisn = String(siswa.nisn).trim()
        const tarif = getTarifSiswa(nisn)

        BULAN_AJARAN.forEach(b => {
          const key = `${nisn}_${b.id}`
          if (!tagihanMap[key]) {
            const tahunKalender = b.semester === 1 ? tahunMulai : tahunMulai + 1
            recordsToInsert.push({
              tahun_ajaran_id: activeTa?.id || null,
              siswa_nisn: nisn,
              kelas: siswa.kelas || '-',
              bulan: b.id,
              tahun: tahunKalender,
              nominal_tagihan: tarif,
              nominal_dibayar: 0,
              status: 'belum_lunas',
              keterangan: `SPP Bulan ${b.nama}`
            })
          }
        })
      })

      if (recordsToInsert.length === 0) {
        setSuccessMsg('Semua siswa sudah memiliki data tagihan lengkap!')
        return
      }

      // Batch insert per 200 records
      const chunkSize = 200
      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize)
        const { error: insErr } = await supabase.from('tagihan_spp').upsert(chunk, {
          onConflict: 'tahun_ajaran_id,siswa_nisn,bulan,tahun',
          ignoreDuplicates: true
        })
        if (insErr) throw insErr
      }

      setSuccessMsg(`✅ Berhasil men-generate ${recordsToInsert.length} data tagihan SPP!`)
      await loadData()
    } catch (err) {
      console.error('Error generating tagihan:', err)
      setErrorMsg('Gagal generate tagihan: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Quick Payment / Toggle Lunas Manual (1-Klik)
  // ─────────────────────────────────────────────────────────────────────────────
  const openPayModal = (siswa, bulanObj) => {
    if (readOnly) return
    const key = `${String(siswa.nisn).trim()}_${bulanObj.id}`
    const existing = tagihanMap[key]
    const tarif = existing ? Number(existing.nominal_tagihan) : getTarifSiswa(siswa.nisn)

    setSelectedStudentForPay(siswa)
    setSelectedBulanForPay(bulanObj)
    setPayFormData({
      nominal: existing?.status === 'kurang_bayar' ? (tarif - Number(existing.nominal_dibayar)) : tarif,
      metode: existing?.metode_pembayaran || 'tunai',
      keterangan: existing?.keterangan || '',
      noRef: existing?.no_referensi_bank || ''
    })
    setIsPayModalOpen(true)
  }

  const handleSavePayment = async () => {
    if (!selectedStudentForPay || !selectedBulanForPay) return
    setActionLoading(true)
    setErrorMsg('')
    try {
      const nisn = String(selectedStudentForPay.nisn).trim()
      const bId = selectedBulanForPay.id
      const key = `${nisn}_${bId}`
      const existing = tagihanMap[key]
      const tarif = existing ? Number(existing.nominal_tagihan) : getTarifSiswa(nisn)
      const bayarNominal = Number(payFormData.nominal)

      const totalDibayar = (existing ? Number(existing.nominal_dibayar || 0) : 0) + bayarNominal
      const statusFinal = totalDibayar >= tarif ? 'lunas' : (totalDibayar > 0 ? 'kurang_bayar' : 'belum_lunas')
      const tahunMulai = activeTa?.nama ? parseInt(activeTa.nama.split('/')[0], 10) : new Date().getFullYear()
      const tahunKalender = selectedBulanForPay.semester === 1 ? tahunMulai : tahunMulai + 1

      const record = {
        tahun_ajaran_id: activeTa?.id || null,
        siswa_nisn: nisn,
        kelas: selectedStudentForPay.kelas || '-',
        bulan: bId,
        tahun: tahunKalender,
        nominal_tagihan: tarif,
        nominal_dibayar: totalDibayar,
        status: statusFinal,
        tanggal_bayar: new Date().toISOString(),
        metode_pembayaran: payFormData.metode,
        no_referensi_bank: payFormData.noRef || null,
        dicatat_oleh: session?.nama_lengkap || session?.nama_guru || 'Petugas TU',
        keterangan: payFormData.keterangan || `Pembayaran ${selectedBulanForPay.nama} (${payFormData.metode})`,
        updated_at: new Date().toISOString()
      }

      const { error: upErr } = await supabase.from('tagihan_spp').upsert([record], {
        onConflict: 'tahun_ajaran_id,siswa_nisn,bulan,tahun'
      })
      if (upErr) throw upErr

      setSuccessMsg(`✅ Pembayaran SPP ${selectedBulanForPay.nama} an. ${selectedStudentForPay.nama_lengkap} berhasil disimpan!`)
      setIsPayModalOpen(false)
      await loadData()
    } catch (err) {
      console.error('Error saving payment:', err)
      setErrorMsg('Gagal menyimpan pembayaran: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Batal Pembayaran (Reset ke Belum Lunas)
  const handleCancelPayment = async (siswa, bulanObj) => {
    if (readOnly) return
    const confirmed = await requestConfirm({
      title: 'Batalkan Status Lunas',
      message: `Yakin ingin membatalkan status pembayaran SPP ${bulanObj.nama} untuk ${siswa.nama_lengkap}? Status akan kembali menjadi Belum Lunas.`,
      icon: 'warning',
      confirmColor: 'red',
      confirmLabel: 'Ya, Batalkan'
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      const nisn = String(siswa.nisn).trim()
      const key = `${nisn}_${bulanObj.id}`
      const existing = tagihanMap[key]
      if (existing?.id) {
        const { error: delErr } = await supabase.from('tagihan_spp').update({
          status: 'belum_lunas',
          nominal_dibayar: 0,
          tanggal_bayar: null,
          metode_pembayaran: null,
          no_referensi_bank: null,
          updated_at: new Date().toISOString()
        }).eq('id', existing.id)
        if (delErr) throw delErr
      }
      setSuccessMsg(`Status ${bulanObj.nama} an. ${siswa.nama_lengkap} direset ke Belum Lunas.`)
      await loadData()
    } catch (err) {
      setErrorMsg('Gagal membatalkan pembayaran: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Smart Auto-Reconcile Mutasi BCA Excel
  // ─────────────────────────────────────────────────────────────────────────────
  const handleBcaFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBcaFile(file)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

      if (!rows || rows.length < 2) {
        throw new Error('File Excel kosong atau format tidak sesuai.')
      }

      // Deteksi Header Baris
      let headerIdx = -1
      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const rowStr = rows[i].map(c => String(c).toLowerCase()).join(' ')
        if (rowStr.includes('va') || rowStr.includes('rekening') || rowStr.includes('nominal') || rowStr.includes('jumlah') || rowStr.includes('transaksi')) {
          headerIdx = i
          break
        }
      }

      if (headerIdx === -1) headerIdx = 0
      const headerRow = rows[headerIdx].map(c => String(c).trim().toLowerCase())

      // Cari index kolom relevan
      const idxVa = headerRow.findIndex(h => h.includes('va') || h.includes('virtual') || h.includes('customer') || h.includes('rekening'))
      const idxNominal = headerRow.findIndex(h => h.includes('nominal') || h.includes('jumlah') || h.includes('amount') || h.includes('kredit'))
      const idxRef = headerRow.findIndex(h => h.includes('ref') || h.includes('id') || h.includes('no.') || h.includes('transaksi'))
      const idxDate = headerRow.findIndex(h => h.includes('tanggal') || h.includes('date') || h.includes('waktu'))
      const idxNama = headerRow.findIndex(h => h.includes('nama') || h.includes('name') || h.includes('keterangan'))

      // Ambil set No Referensi yang sudah pernah dicatat di database (Anti-Duplikasi)
      const existingRefNumbers = new Set(bcaLogs.map(l => String(l.no_referensi).trim()))

      const parsed = []
      let matchedCount = 0
      let newCount = 0
      let skipCount = 0

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.length === 0 || !row[idxNominal !== -1 ? idxNominal : 1]) continue

        const rawVa = String(idxVa !== -1 ? row[idxVa] : row[0] || '').replace(/[^0-9]/g, '')
        const rawNominal = parseFloat(String(idxNominal !== -1 ? row[idxNominal] : row[2] || '0').replace(/[^0-9.-]+/g, ''))
        const rawRef = String(idxRef !== -1 ? row[idxRef] : `TX-${r}-${Date.now()}`).trim()
        const rawDate = idxDate !== -1 ? row[idxDate] : new Date().toLocaleDateString('id-ID')
        const rawNama = idxNama !== -1 ? String(row[idxNama]).trim() : ''

        if (isNaN(rawNominal) || rawNominal <= 0) continue

        // Cocokkan nomor VA dengan siswa
        let matchedStudent = null
        if (rawVa) {
          matchedStudent = siswaList.find(s => {
            const va1 = getVaBcaSiswa(s)
            const nisnStr = String(s.nisn).trim()
            const noIndukStr = String(s.no_induk || '').trim()
            return rawVa === va1 || rawVa.endsWith(nisnStr) || (noIndukStr && rawVa.endsWith(noIndukStr))
          })
        }

        if (!matchedStudent && rawNama) {
          // Fallback matching by student name
          matchedStudent = siswaList.find(s => s.nama_lengkap.toLowerCase() === rawNama.toLowerCase())
        }

        const isDuplicate = existingRefNumbers.has(rawRef)
        if (isDuplicate) {
          skipCount++
        } else {
          newCount++
          if (matchedStudent) matchedCount++
        }

        parsed.push({
          rowIdx: r,
          noRef: rawRef,
          noVa: rawVa,
          nominal: rawNominal,
          tanggal: rawDate,
          namaTransaksi: rawNama,
          student: matchedStudent,
          isDuplicate: isDuplicate
        })
      }

      setParsedBcaData(parsed)
      setBcaParseStats({
        total: parsed.length,
        matched: matchedCount,
        newCount: newCount,
        skipCount: skipCount
      })
    } catch (err) {
      console.error('Error parsing BCA Excel:', err)
      setErrorMsg('Gagal membaca file Excel BCA: ' + err.message)
    }
  }

  // Eksekusi Rekonsiliasi BCA (Prinsip FIFO Pelunasan Bulan Tertua)
  const handleExecuteReconciliation = async () => {
    if (!parsedBcaData || parsedBcaData.length === 0) return
    const newItems = parsedBcaData.filter(p => !p.isDuplicate && p.student)
    if (newItems.length === 0) {
      setErrorMsg('Tidak ada transaksi baru yang cocok dengan data siswa untuk diproses.')
      return
    }

    const confirmed = await requestConfirm({
      title: 'Eksekusi Rekonsiliasi BCA',
      message: `Sistem akan memproses ${newItems.length} transaksi pembayaran baru secara otomatis (menggunakan prinsip FIFO pelunasan bulan tertua). Lanjutkan?`,
      icon: 'info',
      confirmColor: 'indigo',
      confirmLabel: 'Ya, Proses Rekonsiliasi'
    })
    if (!confirmed) return

    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const logsToInsert = []
      const tahunMulai = activeTa?.nama ? parseInt(activeTa.nama.split('/')[0], 10) : new Date().getFullYear()

      for (const item of newItems) {
        const student = item.student
        const nisn = String(student.nisn).trim()
        let sisaDana = Number(item.nominal)

        // Catat ke Log BCA agar tidak bisa didobel
        logsToInsert.push({
          no_referensi: item.noRef,
          nomor_va: item.noVa,
          siswa_nisn: nisn,
          nama_transaksi: item.namaTransaksi || student.nama_lengkap,
          nominal: item.nominal,
          tanggal_transaksi: new Date().toISOString(),
          status_reconcile: 'matched',
          raw_data: item
        })

        // Alokasikan dana ke bulan-bulan yang belum lunas (FIFO: Bulan 1 s.d. 12)
        for (const b of BULAN_AJARAN) {
          if (sisaDana <= 0) break

          const key = `${nisn}_${b.id}`
          const existing = tagihanMap[key]
          const tarif = existing ? Number(existing.nominal_tagihan) : getTarifSiswa(nisn)
          const sudahBayar = existing ? Number(existing.nominal_dibayar || 0) : 0

          if (sudahBayar >= tarif) {
            // Bulan ini sudah lunas, lanjut ke bulan berikutnya
            continue
          }

          const kekuranganBulanIni = tarif - sudahBayar
          const alokasi = Math.min(sisaDana, kekuranganBulanIni)
          const totalSetelahAlokasi = sudahBayar + alokasi
          const statusBulan = totalSetelahAlokasi >= tarif ? 'lunas' : 'kurang_bayar'
          const tahunKalender = b.semester === 1 ? tahunMulai : tahunMulai + 1

          const record = {
            tahun_ajaran_id: activeTa?.id || null,
            siswa_nisn: nisn,
            kelas: student.kelas || '-',
            bulan: b.id,
            tahun: tahunKalender,
            nominal_tagihan: tarif,
            nominal_dibayar: totalSetelahAlokasi,
            status: statusBulan,
            tanggal_bayar: new Date().toISOString(),
            metode_pembayaran: 'transfer_bca',
            no_referensi_bank: item.noRef,
            dicatat_oleh: 'Sistem Auto-Reconcile BCA',
            keterangan: `Auto Reconcile BCA Ref: ${item.noRef}`,
            updated_at: new Date().toISOString()
          }

          await supabase.from('tagihan_spp').upsert([record], {
            onConflict: 'tahun_ajaran_id,siswa_nisn,bulan,tahun'
          })

          sisaDana -= alokasi
        }
      }

      // Batch insert Log BCA
      if (logsToInsert.length > 0) {
        await supabase.from('transaksi_bca_log').upsert(logsToInsert, { onConflict: 'no_referensi' })
      }

      setSuccessMsg(`🎉 Berhasil memproses ${newItems.length} transaksi BCA! Semua status tagihan telah diperbarui.`)
      setParsedBcaData([])
      setBcaFile(null)
      await loadData()
      setActiveTab('matriks')
    } catch (err) {
      console.error('Error executing reconciliation:', err)
      setErrorMsg('Gagal rekonsiliasi BCA: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Helper: Dapatkan indeks bulan ajaran saat ini (1=Juli, 2=Agustus, ..., 12=Juni)
  const currentAcademicMonthId = useMemo(() => {
    const calMonth = new Date().getMonth() + 1 // 1..12 (Jan=1, Agu=8, Des=12)
    if (calMonth >= 7) return calMonth - 6 // Jul=1, Agu=2, ..., Des=6
    return calMonth + 6 // Jan=7, Feb=8, ..., Jun=12
  }, [])

  // Batas Bulan Jatuh Tempo (Default: Bulan Berjalan)
  const [batasBulanId, setBatasBulanId] = useState(currentAcademicMonthId)

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Perhitungan Rekap & Filter Matriks
  // ─────────────────────────────────────────────────────────────────────────────
  const studentFinancialRows = useMemo(() => {
    return siswaList.map((siswa, idx) => {
      const nisn = String(siswa.nisn).trim()
      const tarif = getTarifSiswa(nisn)
      const vaBca = getVaBcaSiswa(siswa)

      let totalTagihanSetahun = 0
      let totalTagihanJatuhTempo = 0
      let totalSudahBayar = 0
      let totalTunggakan = 0
      const bulanStatusList = []
      const bulanMenunggakNama = []

      BULAN_AJARAN.forEach(b => {
        const key = `${nisn}_${b.id}`
        const tagihan = tagihanMap[key]
        const nominalTagihan = tagihan ? Number(tagihan.nominal_tagihan) : tarif
        const nominalDibayar = tagihan ? Number(tagihan.nominal_dibayar || 0) : 0
        const status = tagihan?.status || 'belum_lunas'
        const isDue = b.id <= batasBulanId
        const isFuture = b.id > batasBulanId

        totalTagihanSetahun += nominalTagihan
        totalSudahBayar += nominalDibayar

        const sisa = Math.max(0, nominalTagihan - nominalDibayar)

        // Tunggakan HANYA dihitung untuk bulan yang SUDAH JATUH TEMPO (<= batasBulanId)
        if (isDue) {
          totalTagihanJatuhTempo += nominalTagihan
          if (sisa > 0) {
            totalTunggakan += sisa
            bulanMenunggakNama.push(b.short)
          }
        }

        bulanStatusList.push({
          bulanObj: b,
          tagihan: tagihan,
          nominalTagihan: nominalTagihan,
          nominalDibayar: nominalDibayar,
          status: status,
          sisa: sisa,
          isDue: isDue,
          isFuture: isFuture
        })
      })

      const perm = permanentOrtuMap[nisn]
      const parentPhone = String(perm?.no_hp_ortu || siswa.no_hp_ortu || '').trim()
      const parentName = perm?.nama_ortu || siswa.nama_ortu || 'Orang Tua / Wali'

      return {
        noUrut: idx + 1,
        siswa: siswa,
        nisn: nisn,
        nama: siswa.nama_lengkap,
        kelas: siswa.kelas || '-',
        noInduk: siswa.no_induk || nisn,
        vaBca: vaBca,
        tarifSpp: tarif,
        noHpOrtu: parentPhone,
        namaOrtu: parentName,
        bulanStatusList: bulanStatusList,
        totalTagihanSetahun: totalTagihanSetahun,
        totalTagihanJatuhTempo: totalTagihanJatuhTempo,
        totalSudahBayar: totalSudahBayar,
        totalTunggakan: totalTunggakan,
        bulanMenunggakStr: bulanMenunggakNama.join(', '),
        isLancar: totalTunggakan === 0
      }
    })
  }, [siswaList, tagihanMap, tarifSiswaMap, permanentOrtuMap, batasBulanId])

  // Filter Baris Siswa
  const filteredRows = useMemo(() => {
    return studentFinancialRows.filter(row => {
      const matchKelas = kelasFilter === 'Semua' || row.kelas === kelasFilter
      const q = searchQuery.toLowerCase()
      const matchSearch = !q || row.nama.toLowerCase().includes(q) || row.nisn.includes(q) || row.noInduk.includes(q) || row.vaBca.includes(q)
      const matchStatus = statusFilter === 'semua' || (statusFilter === 'tunggakan' ? row.totalTunggakan > 0 : row.totalTunggakan === 0)
      return matchKelas && matchSearch && matchStatus
    })
  }, [studentFinancialRows, kelasFilter, searchQuery, statusFilter])

  // Summary Totals
  const summaryTotals = useMemo(() => {
    let sumTargetJatuhTempo = 0
    let sumTargetSetahun = 0
    let sumTerkumpul = 0
    let sumTunggakan = 0
    let countNunggak = 0
    let countLunas = 0

    filteredRows.forEach(r => {
      sumTargetJatuhTempo += (r.totalTagihanJatuhTempo || 0)
      sumTargetSetahun += (r.totalTagihanSetahun || 0)
      sumTerkumpul += (r.totalSudahBayar || 0)
      sumTunggakan += (r.totalTunggakan || 0)
      if ((r.totalTunggakan || 0) > 0) {
        countNunggak++
      } else {
        countLunas++
      }
    })

    const persenLunas = sumTargetJatuhTempo > 0 
      ? Math.min(100, Math.round(((sumTargetJatuhTempo - sumTunggakan) / sumTargetJatuhTempo) * 100)) 
      : 100

    return {
      targetJatuhTempo: sumTargetJatuhTempo || 0,
      targetSetahun: sumTargetSetahun || 0,
      target: sumTargetJatuhTempo || 0,
      terkumpul: sumTerkumpul || 0,
      tunggakan: sumTunggakan || 0,
      countNunggak: countNunggak || 0,
      countLunas: countLunas || 0,
      persenLunas: persenLunas || 0
    }
  }, [filteredRows])

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Export Excel Matriks SPP
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet(`Rekap SPP ${kelasFilter}`)

      // Title header
      worksheet.mergeCells('A1:Q1')
      worksheet.getCell('A1').value = `REKAPITULASI TAGIHAN & PEMBAYARAN SPP - SMP BUDI MULIA JAKARTA`
      worksheet.getCell('A1').font = { bold: true, size: 14 }
      worksheet.getCell('A1').alignment = { horizontal: 'center' }

      worksheet.mergeCells('A2:Q2')
      worksheet.getCell('A2').value = `Kelas: ${kelasFilter} | Tahun Ajaran: ${activeTa?.nama || '-'} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`
      worksheet.getCell('A2').font = { italic: true, size: 10 }
      worksheet.getCell('A2').alignment = { horizontal: 'center' }

      worksheet.addRow([])

      // Table Header
      const headerCols = [
        'No', 'NISN', 'No Induk', 'Nama Siswa', 'Kelas', 'No VA BCA', 'Tarif SPP',
        ...BULAN_AJARAN.map(b => b.nama),
        'Total Bayar', 'Sisa Tunggakan', 'Status'
      ]
      const headerRow = worksheet.addRow(headerCols)
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })

      filteredRows.forEach((r, idx) => {
        const rowValues = [
          idx + 1,
          r.nisn,
          r.noInduk,
          r.nama,
          r.kelas,
          r.vaBca,
          r.tarifSpp,
          ...r.bulanStatusList.map(b => b.status === 'lunas' ? 'LUNAS' : (b.status === 'kurang_bayar' ? `Kurang (${b.sisa})` : 'BELUM')),
          r.totalSudahBayar,
          r.totalTunggakan,
          r.totalTunggakan === 0 ? 'LANCAR' : 'MENUNGGAK'
        ]
        const row = worksheet.addRow(rowValues)
        // Conditional cell colors
        r.bulanStatusList.forEach((b, bIdx) => {
          const colCell = row.getCell(8 + bIdx)
          if (b.status === 'lunas') {
            colCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } } // Green
            colCell.font = { color: { argb: 'FF065F46' }, bold: true }
          } else if (b.status === 'kurang_bayar') {
            colCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } } // Yellow
            colCell.font = { color: { argb: 'FF92400E' }, bold: true }
          } else {
            colCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } } // Red
            colCell.font = { color: { argb: 'FF991B1B' } }
          }
        })
      })

      // Column widths
      worksheet.columns.forEach(column => {
        column.width = 14
      })
      worksheet.getColumn(4).width = 28 // Nama siswa

      const buffer = await workbook.xlsx.writeBuffer()
      await downloadFile(buffer, `Rekap_SPP_${kelasFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      setSuccessMsg('Rekap SPP berhasil di-export ke Excel!')
    } catch (err) {
      console.error('Export error:', err)
      setErrorMsg('Gagal export Excel: ' + err.message)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. WhatsApp Penagihan Tertarget (Khusus Orang Tua)
  // ─────────────────────────────────────────────────────────────────────────────
  const unpaidParentsList = useMemo(() => {
    return filteredRows.filter(r => r.totalTunggakan > 0)
  }, [filteredRows])

  const toggleSelectNisnForWa = (nisn) => {
    setSelectedNisnsForWa(prev => {
      const next = new Set(prev)
      if (next.has(nisn)) next.delete(nisn)
      else next.add(nisn)
      return next
    })
  }

  const toggleSelectAllWa = () => {
    if (selectedNisnsForWa.size === unpaidParentsList.length) {
      setSelectedNisnsForWa(new Set())
    } else {
      setSelectedNisnsForWa(new Set(unpaidParentsList.map(r => r.nisn)))
    }
  }

  const generateWaMessage = (row) => {
    const namaBatasBulan = BULAN_AJARAN.find(b => b.id === batasBulanId)?.nama || 'Bulan Ini'
    let msg = customWaTemplate
    msg = msg.replace(/{NAMA_SISWA}/g, row.nama)
    msg = msg.replace(/{KELAS}/g, row.kelas)
    msg = msg.replace(/{NAMA_ORTU}/g, row.namaOrtu)
    msg = msg.replace(/{BATAS_BULAN}/g, namaBatasBulan)
    msg = msg.replace(/{BULAN_TUNGGAKAN}/g, row.bulanMenunggakStr || namaBatasBulan)
    msg = msg.replace(/{TOTAL_TUNGGAKAN}/g, row.totalTunggakan.toLocaleString('id-ID'))
    msg = msg.replace(/{NO_VA_BCA}/g, row.vaBca)
    return msg
  }

  const openSingleWaChat = (row) => {
    if (!row.noHpOrtu) {
      alert(`⚠️ Nomor WhatsApp Orang Tua an. "${row.nama}" belum terisi di database sekolah.\n\nSistem secara ketat HANYA mengirim pesan ke Orang Tua dan melarang pengiriman ke nomor siswa. Silakan lengkapi "No. HP Orang Tua" di Manajemen Akun terlebih dahulu.`)
      return
    }
    const cleanPhone = String(row.noHpOrtu).replace(/[^0-9]/g, '').replace(/^0/, '62')
    const message = encodeURIComponent(generateWaMessage(row))
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER UI
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 font-sans">
      {ConfirmModalComponent}

      {/* Control Panel / Header Card — eBudimulia Native Theme */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-bold">
              💳 Keuangan & SPP Siswa
            </span>
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-semibold">
              BCA VA Prefix: {BCA_PREFIX_DEFAULT}
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">
            Buku Kasir Digital & Rekonsiliasi BCA
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola tagihan SPP 12 bulan, upload mutasi Excel BCA otomatis anti-duplikasi, dan penagihan WhatsApp orang tua.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!readOnly && (
            <button
              onClick={handleToggleParentVisibility}
              disabled={togglingVisibilitas}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs flex items-center gap-1.5 ${
                showTagihanOrtu
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <span>{showTagihanOrtu ? '👁️ Portal Ortu: Tampil' : '🙈 Portal Ortu: Sembunyi'}</span>
            </button>
          )}

          {!readOnly && (
            <button
              onClick={handleGenerateTagihanMassal}
              disabled={actionLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Generate Tagihan 1 Tahun
            </button>
          )}

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export Excel
          </button>
        </div>
      </div>

      {/* STATS CARDS - eBudimulia Native Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-indigo-600 rounded-xl p-5 shadow-xs">
          <p className="text-xs text-indigo-600 font-bold tracking-wide">
            Target SPP (s.d. {BULAN_AJARAN.find(b => b.id === batasBulanId)?.nama || 'Bulan Ini'})
          </p>
          <p className="text-2xl font-extrabold mt-1 text-indigo-700">Rp {summaryTotals.targetJatuhTempo.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold tracking-wide">Realisasi Terkumpul</p>
          <p className="text-2xl font-extrabold mt-1 text-emerald-600">+Rp {summaryTotals.terkumpul.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold tracking-wide">Total Sisa Tunggakan (Jatuh Tempo)</p>
          <p className="text-2xl font-extrabold mt-1 text-rose-600">Rp {summaryTotals.tunggakan.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold tracking-wide">Kelancaran Pembayaran</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-2xl font-extrabold text-slate-800">{summaryTotals.persenLunas}%</p>
            <span className="text-xs font-semibold text-slate-400">({summaryTotals.countLunas} Lancar, {summaryTotals.countNunggak} Nunggak)</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500 font-bold hover:underline">Tutup</button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 font-bold hover:underline">Tutup</button>
        </div>
      )}

      {/* Tab Navigation & Controls */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 shrink-0 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('matriks')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'matriks' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Buku Kasir Matriks 12 Bulan
          </button>

          {!readOnly && (
            <button
              onClick={() => setActiveTab('upload_bca')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'upload_bca' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏦 Upload Mutasi BCA (Auto-Reconcile)
            </button>
          )}

          <button
            onClick={() => setActiveTab('broadcast_wa')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'broadcast_wa' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            💬 Penagihan WhatsApp Orang Tua ({summaryTotals.countNunggak})
          </button>

          <button
            onClick={() => setActiveTab('log_transaksi')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'log_transaksi' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📜 Riwayat Mutasi Bank ({bcaLogs.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BUKU KASIR MATRIKS 12 BULAN                                       */}
      {/* ========================================================================= */}
      {activeTab === 'matriks' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500">Kelas:</span>
              <button
                onClick={() => setKelasFilter('Semua')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${kelasFilter === 'Semua' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Semua
              </button>
              {allKelas.map(k => (
                <button
                  key={k}
                  onClick={() => setKelasFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${kelasFilter === k ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              {/* Batas Periode Jatuh Tempo Dropdown */}
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Jatuh Tempo s.d:</span>
                <select
                  value={batasBulanId}
                  onChange={e => setBatasBulanId(Number(e.target.value))}
                  className="bg-transparent font-bold text-indigo-700 outline-none cursor-pointer"
                >
                  <option value={currentAcademicMonthId}>Bulan Ini ({BULAN_AJARAN.find(b => b.id === currentAcademicMonthId)?.nama})</option>
                  <option value={6}>Akhir Semester 1 (Desember)</option>
                  <option value={12}>1 Tahun Ajaran Penuh (Juni)</option>
                  <optgroup label="Pilih Bulan Tertentu:">
                    {BULAN_AJARAN.map(b => (
                      <option key={b.id} value={b.id}>{b.nama} (Bulan ke-{b.id})</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="semua">Semua Status</option>
                <option value="tunggakan">Khusus Menunggak (s.d. {BULAN_AJARAN.find(b => b.id === batasBulanId)?.nama})</option>
                <option value="lunas">Khusus Lancar</option>
              </select>

              <div className="relative flex-1 md:w-56">
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Cari siswa / NISN / VA..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Table Matriks */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                  <th className="p-3 text-center w-10">No</th>
                  <th className="p-3 min-w-[200px]">Nama Siswa</th>
                  <th className="p-3 text-center w-14">Kelas</th>
                  <th className="p-3 text-right w-24">Tarif SPP</th>
                  {BULAN_AJARAN.map(b => (
                    <th key={b.id} className="p-2.5 text-center min-w-[70px]">
                      {b.short}
                    </th>
                  ))}
                  <th className="p-3 text-right w-28">Tunggakan</th>
                  <th className="p-3 text-center w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={19} className="p-12 text-center text-slate-400">
                      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                      Memuat data buku kasir SPP...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="p-12 text-center text-slate-400">
                      Tidak ada data siswa ditemukan untuk filter ini.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => (
                    <tr key={`${r.nisn}_${r.kelas}_${idx}`} className={`hover:bg-indigo-50/30 transition-colors ${r.totalTunggakan > 0 ? 'bg-amber-50/20' : ''}`}>
                      <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{r.nama}</div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>NISN: {r.nisn}</span>
                          <span>•</span>
                          <span className="text-indigo-600 font-bold">VA: {r.vaBca}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 font-bold rounded text-[11px] text-slate-600">{r.kelas}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        Rp {r.tarifSpp.toLocaleString('id-ID')}
                      </td>

                      {/* 12 Bulan Cells */}
                      {r.bulanStatusList.map(b => {
                        const isLunas = b.status === 'lunas'
                        const isKurang = b.status === 'kurang_bayar'
                        const isDue = b.isDue
                        const isFuture = b.isFuture

                        return (
                          <td key={b.bulanObj.id} className="p-1.5 text-center">
                            {isLunas ? (
                              <button
                                onClick={() => handleCancelPayment(r.siswa, b.bulanObj)}
                                title={`LUNAS (${b.tagihan?.metode_pembayaran || 'BCA'}) pada ${b.tagihan?.tanggal_bayar ? new Date(b.tagihan.tanggal_bayar).toLocaleDateString('id-ID') : '-'}. Klik untuk reset jika salah.`}
                                className="w-full py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black rounded-lg text-[10px] transition-all flex flex-col items-center justify-center leading-tight shadow-xs"
                              >
                                <span>✓ Lunas</span>
                              </button>
                            ) : isKurang ? (
                              <button
                                onClick={() => openPayModal(r.siswa, b.bulanObj)}
                                title={`Kurang Bayar! Sudah bayar: Rp ${b.nominalDibayar.toLocaleString('id-ID')} (Sisa: Rp ${b.sisa.toLocaleString('id-ID')}). Klik untuk tambah pembayaran.`}
                                className="w-full py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg text-[9px] transition-all flex flex-col items-center justify-center leading-tight"
                              >
                                <span className="font-extrabold text-amber-800">Kurang</span>
                                <span className="text-[8px]">-{Math.round(b.sisa / 1000)}k</span>
                              </button>
                            ) : isDue ? (
                              // Bulan Jatuh Tempo (Belum Bayar) -> Merah
                              <button
                                onClick={() => openPayModal(r.siswa, b.bulanObj)}
                                title={`Menunggak SPP ${b.bulanObj.nama}. Klik untuk catat pembayaran manual / tunai.`}
                                className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg text-[10px] transition-all border border-rose-200"
                              >
                                ✕ Belum
                              </button>
                            ) : (
                              // Bulan Mendatang (Belum Jatuh Tempo) -> Abu-abu Lembut
                              <button
                                onClick={() => openPayModal(r.siswa, b.bulanObj)}
                                title={`Bulan ${b.bulanObj.nama} (Belum Jatuh Tempo). Klik jika ingin bayar di muka.`}
                                className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 font-semibold rounded-lg text-[10px] transition-all border border-slate-100"
                              >
                                -
                              </button>
                            )}
                          </td>
                        )
                      })}

                      {/* Total Tunggakan */}
                      <td className="p-3 text-right font-mono font-black">
                        {r.totalTunggakan > 0 ? (
                          <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md text-[11px]">
                            Rp {r.totalTunggakan.toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold text-[11px]">0 (Lunas)</span>
                        )}
                      </td>

                      {/* Aksi WA */}
                      <td className="p-3 text-center">
                        {r.totalTunggakan > 0 ? (
                          <button
                            onClick={() => openSingleWaChat(r)}
                            title={`Kirim WA Tagihan ke Orang Tua (${r.noHpOrtu || 'No HP Belum ada'})`}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-lg transition-colors font-bold text-xs shadow-sm border border-emerald-200"
                          >
                            💬 Tagih
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">✓</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: UPLOAD MUTASI BCA (AUTO-RECONCILIATION)                            */}
      {/* ========================================================================= */}
      {activeTab === 'upload_bca' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="max-w-2xl">
            <h3 className="text-lg font-black text-slate-800">Upload File Mutasi Excel BCA Virtual Account</h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload file Excel laporan transaksi harian/bulanan dari KlikBCA Bisnis. Sistem otomatis membaca Nomor VA siswa, melunasi bulan tertua (FIFO), dan <strong>menjamin tidak ada data duplikat jika file yang sama diupload ulang</strong>.
            </p>
          </div>

          {/* Upload Dropzone */}
          <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 rounded-3xl p-8 text-center bg-indigo-50/20 transition-all">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              id="bcaFileInput"
              onChange={handleBcaFileSelect}
              className="hidden"
            />
            <label htmlFor="bcaFileInput" className="cursor-pointer flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              </div>
              <p className="text-sm font-bold text-slate-800">
                {bcaFile ? bcaFile.name : 'Klik untuk Pilih File Excel BCA / Drag & Drop'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Format didukung: .xlsx, .xls (Laporan Virtual Account BCA)</p>
            </label>
          </div>

          {/* Parsed Result Preview */}
          {parsedBcaData.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-100 animate-fade-in">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Baris Terbaca</p>
                  <p className="text-xl font-black text-slate-800 mt-0.5">{bcaParseStats.total}</p>
                </div>
                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <p className="text-[10px] text-emerald-700 font-bold uppercase">Transaksi Baru (Cocok Siswa)</p>
                  <p className="text-xl font-black text-emerald-700 mt-0.5">{bcaParseStats.matched}</p>
                </div>
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
                  <p className="text-[10px] text-amber-800 font-bold uppercase">Duplikat Dilewati (Skip)</p>
                  <p className="text-xl font-black text-amber-800 mt-0.5">{bcaParseStats.skipCount}</p>
                </div>
                <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200 flex items-center justify-center">
                  <button
                    onClick={handleExecuteReconciliation}
                    disabled={actionLoading || bcaParseStats.matched === 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>⚡ Proses Pelunasan ({bcaParseStats.matched})</span>
                  </button>
                </div>
              </div>

              {/* Table Preview */}
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 sticky top-0 text-[10px] uppercase font-bold text-slate-600">
                    <tr>
                      <th className="p-2.5">No Ref Bank</th>
                      <th className="p-2.5">No VA</th>
                      <th className="p-2.5">Nama Siswa / Cocok</th>
                      <th className="p-2.5 text-right">Nominal Transfer</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {parsedBcaData.map((item, i) => (
                      <tr key={i} className={item.isDuplicate ? 'bg-slate-50 opacity-60' : (item.student ? 'bg-emerald-50/30' : 'bg-rose-50/20')}>
                        <td className="p-2.5 font-mono text-[11px] text-slate-600">{item.noRef}</td>
                        <td className="p-2.5 font-mono font-bold text-indigo-600">{item.noVa || '-'}</td>
                        <td className="p-2.5">
                          {item.student ? (
                            <span className="font-bold text-emerald-800">✅ {item.student.nama_lengkap} (Kelas {item.student.kelas})</span>
                          ) : (
                            <span className="text-rose-600">❌ Siswa tidak ditemukan ({item.namaTransaksi || 'Tanpa Nama'})</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                          Rp {item.nominal.toLocaleString('id-ID')}
                        </td>
                        <td className="p-2.5 text-center">
                          {item.isDuplicate ? (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded">Sudah Pernah Masuk</span>
                          ) : item.student ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">Siap Diproses</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded">VA Tidak Cocok</span>
                          )}
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

      {/* ========================================================================= */}
      {/* TAB 3: PENAGIHAN WHATSAPP ORANG TUA (HEMAT BIAYA)                         */}
      {/* ========================================================================= */}
      {activeTab === 'broadcast_wa' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800">Penagihan Tertarget via WhatsApp Orang Tua</h3>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full">
                  🛡️ 100% Khusus Orang Tua
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kirim pesan tagihan <strong>hanya kepada orang tua yang memiliki sisa tunggakan</strong>. Tidak ada biaya pesan terbuang untuk siswa yang sudah lunas.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAllWa}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                {selectedNisnsForWa.size === unpaidParentsList.length ? 'Batal Pilih Semua' : `Pilih Semua (${unpaidParentsList.length})`}
              </button>
            </div>
          </div>

          {/* Template Pesan Editor */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Template Pesan WhatsApp Penagihan:</span>
              <span className="text-[10px] text-slate-400 font-mono">Variabel: {'{NAMA_SISWA}'}, {'{KELAS}'}, {'{BULAN_TUNGGAKAN}'}, {'{TOTAL_TUNGGAKAN}'}, {'{NO_VA_BCA}'}</span>
            </label>
            <textarea
              rows={5}
              value={customWaTemplate}
              onChange={e => setCustomWaTemplate(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* List Orang Tua yang Menunggak */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="p-3 w-10 text-center">Pilih</th>
                  <th className="p-3">Nama Siswa & Orang Tua</th>
                  <th className="p-3">No. WhatsApp Orang Tua</th>
                  <th className="p-3">Bulan Menunggak</th>
                  <th className="p-3 text-right">Total Tunggakan</th>
                  <th className="p-3 text-center w-28">Kirim Personal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {unpaidParentsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-emerald-600 font-bold">
                      🎉 Luar biasa! Tidak ada siswa yang menunggak untuk filter kelas ini.
                    </td>
                  </tr>
                ) : (
                  unpaidParentsList.map((r, idx) => {
                    const isSelected = selectedNisnsForWa.has(r.nisn)
                    const hasPhone = !!r.noHpOrtu

                    return (
                      <tr key={`wa_${r.nisn}_${idx}`} className={isSelected ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectNisnForWa(r.nisn)}
                            className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{r.nama} (Kelas {r.kelas})</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Orang Tua: <strong className="text-slate-700">{r.namaOrtu}</strong></div>
                        </td>
                        <td className="p-3 font-mono">
                          {hasPhone ? (
                            <span className="text-emerald-700 font-bold">{r.noHpOrtu}</span>
                          ) : (
                            <span className="text-rose-500 font-bold text-[10px]">⚠️ Belum Ada No HP</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded text-[10px]">
                            {r.bulanMenunggakStr}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-black text-rose-600">
                          Rp {r.totalTunggakan.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => openSingleWaChat(r)}
                            disabled={!hasPhone}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1 mx-auto"
                          >
                            <span>💬 Kirim WA</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RIWAYAT MUTASI BANK LOG                                           */}
      {/* ========================================================================= */}
      {activeTab === 'log_transaksi' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-800">Riwayat Mutasi Bank yang Berhasil Direkonsiliasi</h3>
            <span className="text-xs text-slate-400">Menampilkan 100 transaksi terbaru</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600">
                <tr>
                  <th className="p-3">Waktu Transaksi</th>
                  <th className="p-3">No Referensi Bank</th>
                  <th className="p-3">No VA BCA</th>
                  <th className="p-3">Siswa / Rekening</th>
                  <th className="p-3 text-right">Nominal</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {bcaLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      Belum ada riwayat mutasi bank yang tercatat.
                    </td>
                  </tr>
                ) : (
                  bcaLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {new Date(log.created_at || log.tanggal_transaksi).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">{log.no_referensi}</td>
                      <td className="p-3 font-mono font-bold text-indigo-600">{log.nomor_va || '-'}</td>
                      <td className="p-3 font-bold text-slate-800">{log.nama_transaksi || log.siswa_nisn}</td>
                      <td className="p-3 text-right font-mono font-black text-emerald-600">
                        Rp {Number(log.nominal).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                          ✓ RECONCILED
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL INPUT PEMBAYARAN MANUAL                                            */}
      {/* ========================================================================= */}
      {isPayModalOpen && selectedStudentForPay && selectedBulanForPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 md:p-8 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Catat Pembayaran SPP</p>
                <h3 className="text-lg font-black text-slate-800">
                  Bulan {selectedBulanForPay.nama}
                </h3>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-1 text-xs">
              <p><strong className="text-slate-700">Nama Siswa:</strong> {selectedStudentForPay.nama_lengkap}</p>
              <p><strong className="text-slate-700">NISN / Kelas:</strong> {selectedStudentForPay.nisn} (Kelas {selectedStudentForPay.kelas})</p>
              <p><strong className="text-slate-700">Tarif Standar:</strong> Rp {getTarifSiswa(selectedStudentForPay.nisn).toLocaleString('id-ID')}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nominal yang Dibayarkan (Rp):</label>
                <input
                  type="number"
                  value={payFormData.nominal}
                  onChange={e => setPayFormData(p => ({ ...p, nominal: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Metode Pembayaran:</label>
                <select
                  value={payFormData.metode}
                  onChange={e => setPayFormData(p => ({ ...p, metode: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="tunai">💵 Tunai / Kasir TU</option>
                  <option value="transfer_bca">🏦 Transfer Virtual Account BCA</option>
                  <option value="transfer_manual">💳 Transfer Bank Lain</option>
                  <option value="beasiswa">🎓 Beasiswa / Keringanan</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">No. Referensi / No. Kuitansi (Opsional):</label>
                <input
                  type="text"
                  placeholder="Misal: KWT-00129 atau No Ref Bank"
                  value={payFormData.noRef}
                  onChange={e => setPayFormData(p => ({ ...p, noRef: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Catatan / Keterangan (Opsional):</label>
                <input
                  type="text"
                  placeholder="Catatan tambahan..."
                  value={payFormData.keterangan}
                  onChange={e => setPayFormData(p => ({ ...p, keterangan: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePayment}
                disabled={actionLoading || !payFormData.nominal}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black rounded-xl text-xs shadow-lg shadow-indigo-200 transition-all active:scale-95"
              >
                {actionLoading ? 'Menyimpan...' : 'Simpan Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
