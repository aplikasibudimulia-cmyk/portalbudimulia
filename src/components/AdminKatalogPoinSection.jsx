import React, { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import { downloadFile } from '../utils/fileDownloader'
import { DEFAULT_BUKU_AGENDA_DRAFT } from '../data/bukuAgendaDraftData'

const EMPTY_FORM = { tipe: 'negative', kategori: '', sub_kategori: '', kode: '', jenis: '', keterangan: '', poin: '' }

const ROMANS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"]

// Helper untuk membuat prefix kode dari nama kategori
const getCategoryPrefix = (kategori, tipe) => {
  if (!kategori) return tipe === 'negative' ? 'NEG-1' : 'POS-1'
  
  // Bersihkan angka romawi atau nomor di awal: "I. KEHADIRAN" -> "KEHADIRAN"
  const cleanName = kategori.replace(/^[I|V|X|L|C|D|M|\d]+\.\s*/i, '').trim()
  const words = cleanName.split(/\s+/).filter(Boolean)
  
  let abbrev = ''
  if (words.length === 1) {
    abbrev = words[0].slice(0, 3).toUpperCase()
  } else {
    abbrev = words.map(w => w[0]).join('').slice(0, 4).toUpperCase()
  }
  
  const prefixTipe = tipe === 'negative' ? 'NEG' : 'POS'
  return `${prefixTipe}-${abbrev}`
}

// Helper untuk otomatis menghitung kode berikutnya di kategori yang dipilih
const getNextKodeForCategory = (allData, tipe, kategori, subKategori = '') => {
  if (!kategori) return ''
  const itemsInCat = (allData || []).filter(d => d.tipe === tipe && d.kategori === kategori)
  
  if (itemsInCat.length === 0) {
    const pfx = getCategoryPrefix(kategori, tipe)
    return `${pfx}-1`
  }

  // Jika ada sub-kategori berangka seperti "1. Terlambat datang...", gunakan pola 1.a, 1.b
  if (subKategori) {
    const numMatch = subKategori.match(/^(\d+)\./)
    if (numMatch) {
      const numPrefix = numMatch[1]
      const subItems = itemsInCat.filter(d => d.sub_kategori === subKategori)
      const alphabet = 'abcdefghijklmnopqrstuvwxyz'
      const nextChar = alphabet[subItems.length] || `${subItems.length + 1}`
      return `${numPrefix}.${nextChar}`
    }
  }

  // Cari pola kode yang berakhiran angka: PREFIX-123 atau angka murni
  let maxNum = 0
  let detectedPrefix = null

  itemsInCat.forEach(item => {
    if (!item.kode) return
    const match = item.kode.match(/^(.*?)(\d+)$/)
    if (match) {
      const pfx = match[1]
      const num = parseInt(match[2], 10)
      if (!detectedPrefix) detectedPrefix = pfx
      if (num > maxNum) maxNum = num
    }
  })

  if (detectedPrefix && maxNum > 0) {
    return `${detectedPrefix}${maxNum + 1}`
  }

  // Fallback jika tidak ada pola angka standar
  const pfx = getCategoryPrefix(kategori, tipe)
  return `${pfx}-${itemsInCat.length + 1}`
}

const getNextKategori = (data, tipe) => {
  const kats = [...new Set((data || []).filter(d => d.tipe === tipe).map(d => d.kategori))]
  let maxIdx = -1
  kats.forEach(k => {
    if (!k) return
    const romanMatch = k.split('.')[0]
    const idx = ROMANS.indexOf(romanMatch)
    if (idx > maxIdx) maxIdx = idx
  })
  if (maxIdx !== -1 && maxIdx < ROMANS.length - 1) return `${ROMANS[maxIdx + 1]}. `
  return "KATEGORI BARU"
}

export default function AdminKatalogPoinSection({ readOnly = false, isAdmin = false }) {
  // Mode switcher: 'draft' (Uji Coba Rapat Buku Agenda - admin only) vs 'production' (Katalog Aktif di DB)
  const [catalogMode, setCatalogMode] = useState(isAdmin ? 'draft' : 'production')
  
  // Production DB Data
  const [prodData, setProdData] = useState([])
  
  // Draft Data (Persistent in localStorage v4)
  const [draftData, setDraftData] = useState(() => {
    try {
      const saved = localStorage.getItem('ebudimulia_katalog_draft_v4')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Failed to parse draft from localStorage', e)
    }
    return DEFAULT_BUKU_AGENDA_DRAFT
  })

  // Ensure non-admin users always use production mode
  useEffect(() => {
    if (!isAdmin) {
      setCatalogMode('production')
    }
  }, [isAdmin])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('negative')
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('all')
  const [collapsedCategories, setCollapsedCategories] = useState({})
  
  // Modal Form State
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [isNewKategori, setIsNewKategori] = useState(false)
  const [isNewSubKategori, setIsNewSubKategori] = useState(false)
  const [syncHistory, setSyncHistory] = useState(false)
  const [syncCount, setSyncCount] = useState(0)
  const [openSubKategori, setOpenSubKategori] = useState({})
  
  // Import / Export State
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef()
  const jenisInputRef = useRef()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  // Simpan draft data ke localStorage v4 setiap kali ada perubahan
  const updateDraftData = (newDraft) => {
    setDraftData(newDraft)
    try {
      localStorage.setItem('ebudimulia_katalog_draft_v4', JSON.stringify(newDraft))
    } catch (e) {
      console.warn('Failed to save draft to localStorage', e)
    }
  }

  // Data yang sedang aktif ditampilkan di layar tergantung mode
  const currentData = catalogMode === 'draft' ? draftData : prodData

  useEffect(() => { fetchProdData() }, [])

  const fetchProdData = async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('point_catalog').select('*').order('kategori').order('kode')
    setProdData(rows || [])
    setLoading(false)
  }

  // Filter Data berdasarkan Tab, Search, dan Filter Kategori
  const filteredData = useMemo(() => {
    return currentData.filter(d => {
      if (d.tipe !== activeTab) return false
      const q = search.toLowerCase()
      const matchSearch = !q || 
        d.kategori?.toLowerCase().includes(q) || 
        d.sub_kategori?.toLowerCase().includes(q) ||
        d.kode?.toLowerCase().includes(q) || 
        d.jenis?.toLowerCase().includes(q) || 
        d.keterangan?.toLowerCase().includes(q)
      const matchKat = filterKategori === 'all' || d.kategori === filterKategori
      return matchSearch && matchKat
    })
  }, [currentData, activeTab, search, filterKategori])

  // Daftar Kategori Unik untuk Tab Aktif (Natural Sort)
  const uniqueKategoris = useMemo(() => {
    return [...new Set(currentData.filter(d => d.tipe === activeTab).map(d => d.kategori))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [currentData, activeTab])

// Helper untuk mengekstrak urutan numerik & sub-huruf (misal: "1", "6.a", "14.c", "PA-2")
function getSortRank(item) {
  const str = (item.display_no || item.kode || '').toString().trim()
  // Match "II.6.a", "6.a", "1", "29"
  const matchWithLetter = str.match(/(?:[A-ZIVXLCDM]+\.)?(\d+)(?:\.([a-z]))?/i)
  if (matchWithLetter && matchWithLetter[1]) {
    const num = parseInt(matchWithLetter[1], 10)
    const letterCode = matchWithLetter[2] ? matchWithLetter[2].toLowerCase().charCodeAt(0) - 96 : 0
    return num * 100 + letterCode
  }
  // Match "PA-1", "KH-2", etc.
  const matchPrefix = str.match(/[A-Z]+-(\d+)/i)
  if (matchPrefix && matchPrefix[1]) {
    return parseInt(matchPrefix[1], 10) * 100
  }
  return 99999
}

// Helper untuk mengelompokkan butir pasal per nomor induk (misal: No 6 memiliki sub 6.a, 6.b, 6.c)
function buildArticleGroups(items) {
  const groups = []
  let currentGroup = null

  items.forEach(item => {
    const subKat = item.sub_kategori ? item.sub_kategori.trim() : ''
    
    if (subKat) {
      if (currentGroup && currentGroup.isGroup && currentGroup.fullSubKat === subKat) {
        currentGroup.items.push(item)
      } else {
        const match = subKat.match(/^(\d+|[A-Z]+)\.\s*(.*)/)
        const articleNo = match ? match[1] : (item.display_no ? item.display_no.split('.')[0] : '')
        const articleTitle = match ? match[2] : subKat
        
        currentGroup = {
          isGroup: true,
          articleNo: articleNo || '',
          title: articleTitle || subKat,
          fullSubKat: subKat,
          items: [item]
        }
        groups.push(currentGroup)
      }
    } else {
      currentGroup = null
      groups.push({
        isGroup: false,
        item
      })
    }
  })

  return groups
}

  // Pengelompokan Data per Kategori Utama (Bab) dengan Urutan Pasal Kronologis 100% Sesuai PDF
  const categoryMap = useMemo(() => {
    const map = {}
    
    filteredData.forEach(item => {
      const kat = item.kategori || 'Tanpa Kategori'
      if (!map[kat]) map[kat] = []
      map[kat].push(item)
    })

    // Sort items di dalam setiap Bab secara urut kronologis (1, 2, 3, ... 6.a, 6.b, 6.c, ... 29)
    Object.keys(map).forEach(kat => {
      map[kat].sort((a, b) => {
        const rankA = getSortRank(a)
        const rankB = getSortRank(b)
        if (rankA !== rankB) return rankA - rankB
        return (a.display_no || a.kode || '').localeCompare(b.display_no || b.kode || '', undefined, { numeric: true, sensitivity: 'base' })
      })
    })

    return map
  }, [filteredData])

  const toggleCategoryCollapse = (kategori) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [kategori]: !prev[kategori]
    }))
  }

  const collapseAll = () => {
    const all = {}
    Object.keys(categoryMap).forEach(k => { all[k] = true })
    setCollapsedCategories(all)
  }

  const expandAll = () => {
    setCollapsedCategories({})
  }

  // Buka modal tambah dengan kategori & sub-kategori default
  const openAdd = (targetKategori = null, targetSubKategori = '') => {
    setEditItem(null)
    const kat = targetKategori || uniqueKategoris[0] || 'I. KEHADIRAN'
    const nextKode = getNextKodeForCategory(currentData, activeTab, kat, targetSubKategori)
    
    setForm({
      ...EMPTY_FORM,
      tipe: activeTab,
      kategori: kat,
      sub_kategori: targetSubKategori || '',
      kode: nextKode,
      poin: activeTab === 'negative' ? '-5' : '10'
    })
    setIsNewKategori(false)
    setIsNewSubKategori(false)
    setShowModal(true)
    setTimeout(() => jenisInputRef.current?.focus(), 150)
  }

  // Buka modal edit
  const openEdit = async (item) => {
    setEditItem(item)
    setForm({
      tipe: item.tipe,
      kategori: item.kategori,
      sub_kategori: item.sub_kategori || '',
      kode: item.kode,
      jenis: item.jenis,
      keterangan: item.keterangan || '',
      poin: item.poin
    })
    setIsNewKategori(false)
    setIsNewSubKategori(false)
    setSyncHistory(false)
    setSyncCount(0)
    setShowModal(true)
    setTimeout(() => jenisInputRef.current?.focus(), 150)

    if (catalogMode === 'production') {
      try {
        const { count } = await supabase
          .from('point_records')
          .select('*', { count: 'exact', head: true })
          .or(`catalog_id.eq.${item.id},kode_katalog.eq.${item.kode}`)
        setSyncCount(count || 0)
      } catch (err) {
        console.warn('Gagal cek count:', err)
      }
    }
  }

  // Handler saat kategori diubah dalam modal (otomatis update kode berikutnya)
  const handleModalKategoriChange = (newKat) => {
    if (newKat === "NEW") {
      setIsNewKategori(true)
      const nextKatName = getNextKategori(currentData, form.tipe)
      const nextKode = getNextKodeForCategory(currentData, form.tipe, nextKatName, form.sub_kategori)
      setForm({ ...form, kategori: nextKatName, kode: nextKode })
    } else {
      setIsNewKategori(false)
      const nextKode = getNextKodeForCategory(currentData, form.tipe, newKat, form.sub_kategori)
      setForm({ ...form, kategori: newKat, kode: nextKode })
    }
  }

  // Handler saat tipe (Negatif / Positif) diubah dalam modal
  const handleModalTipeChange = (newTipe) => {
    const kats = [...new Set(currentData.filter(d => d.tipe === newTipe).map(d => d.kategori))].filter(Boolean).sort()
    const firstKat = kats[0] || (newTipe === 'negative' ? 'I. KEHADIRAN' : 'PRESTASI AKADEMIK')
    const nextKode = getNextKodeForCategory(currentData, newTipe, firstKat, form.sub_kategori)
    
    setForm({
      ...form,
      tipe: newTipe,
      kategori: firstKat,
      kode: nextKode,
      poin: newTipe === 'negative' ? (parseInt(form.poin) > 0 ? `-${form.poin}` : '-5') : (parseInt(form.poin) < 0 ? `${Math.abs(parseInt(form.poin))}` : '10')
    })
    setIsNewKategori(false)
  }

  // Simpan data (Mendukung Mode Draf & Mode Produksi)
  const handleSave = async (e, keepOpen = false) => {
    if (e) e.preventDefault()
    if (!form.kode || !form.jenis || form.poin === '') {
      alert('Lengkapi semua field bertanda bintang (*).')
      return
    }
    const poinNum = parseInt(form.poin, 10)
    if (isNaN(poinNum)) {
      alert('Poin harus berupa angka.')
      return
    }
    if (form.tipe === 'negative' && poinNum > 0) {
      alert('Poin pelanggaran (negatif) harus bernilai minus (< 0), contoh: -5.')
      return
    }
    if (form.tipe === 'positive' && poinNum <= 0) {
      alert('Poin prestasi (positif) harus bernilai plus (> 0), contoh: 10.')
      return
    }

    setSaving(true)
    const payload = {
      tipe: form.tipe,
      kategori: form.kategori.trim(),
      sub_kategori: form.sub_kategori ? form.sub_kategori.trim() : '',
      kode: form.kode.trim(),
      jenis: form.jenis.trim(),
      keterangan: form.keterangan ? form.keterangan.trim() : '',
      poin: poinNum
    }

    if (catalogMode === 'draft') {
      // ─── SIMPAN DI MODE DRAF (LOKAL & AMAN) ───
      let updatedDraft = []
      if (editItem) {
        updatedDraft = draftData.map(item => item.id === editItem.id ? { ...item, ...payload } : item)
      } else {
        const newItem = { ...payload, id: 'draft-' + Date.now() }
        updatedDraft = [...draftData, newItem]
      }
      updateDraftData(updatedDraft)
      setSaving(false)

      if (keepOpen && !editItem) {
        const nextKode = getNextKodeForCategory(updatedDraft, form.tipe, form.kategori, form.sub_kategori)
        setForm(prev => ({ ...prev, kode: nextKode, jenis: '', keterangan: '' }))
        setTimeout(() => jenisInputRef.current?.focus(), 100)
      } else {
        setShowModal(false)
      }
      return
    }

    // ─── SIMPAN DI MODE PRODUKSI (SUPABASE) ───
    let saveError = null
    if (editItem) {
      const { error } = await supabase.from('point_catalog').update(payload).eq('id', editItem.id)
      saveError = error

      if (!error && syncHistory) {
        try {
          const { data: recordsToUpdate } = await supabase
            .from('point_records')
            .select('id, nisn, tahun_ajaran_id, semester')
            .or(`catalog_id.eq.${editItem.id},kode_katalog.eq.${editItem.kode}`)

          if (recordsToUpdate && recordsToUpdate.length > 0) {
            await supabase
              .from('point_records')
              .update({
                kode_katalog: form.kode.trim(),
                jenis: form.jenis.trim(),
                poin_diberikan: poinNum
              })
              .or(`catalog_id.eq.${editItem.id},kode_katalog.eq.${editItem.kode}`)

            if (editItem.poin !== poinNum) {
              const studentPairs = []
              const seenPairs = new Set()
              recordsToUpdate.forEach(r => {
                const key = `${r.nisn}_${r.tahun_ajaran_id}_${r.semester}`
                if (!seenPairs.has(key)) {
                  seenPairs.add(key)
                  studentPairs.push({ nisn: r.nisn, taId: r.tahun_ajaran_id, sem: r.semester })
                }
              })

              for (const sp of studentPairs) {
                const { data: stuRecs } = await supabase
                  .from('point_records')
                  .select('poin_diberikan')
                  .eq('nisn', sp.nisn)
                  .eq('tahun_ajaran_id', sp.taId)
                  .eq('semester', sp.sem)

                const totalPoinChanges = (stuRecs || []).reduce((acc, r) => acc + (r.poin_diberikan || 0), 0)
                const { data: spRow } = await supabase
                  .from('student_points')
                  .select('poin_default')
                  .eq('nisn', sp.nisn)
                  .eq('tahun_ajaran_id', sp.taId)
                  .eq('semester', sp.sem)
                  .maybeSingle()

                const defPoin = spRow?.poin_default ?? 100
                const updatedTotal = defPoin + totalPoinChanges

                await supabase
                  .from('student_points')
                  .update({ total_poin: updatedTotal, updated_at: new Date().toISOString() })
                  .eq('nisn', sp.nisn)
                  .eq('tahun_ajaran_id', sp.taId)
                  .eq('semester', sp.sem)
              }
            }
          }
        } catch (syncErr) {
          console.error('Gagal sinkronisasi data riwayat siswa:', syncErr)
        }
      }
    } else {
      const { error } = await supabase.from('point_catalog').insert([payload])
      saveError = error
    }

    setSaving(false)
    if (saveError) {
      alert('Gagal menyimpan: ' + (saveError.code === '23505' ? `Kode "${form.kode}" sudah ada di database!` : saveError.message))
      return
    }

    await fetchProdData()

    if (keepOpen && !editItem) {
      const updatedData = [...prodData, { ...payload, id: 'temp-' + Date.now() }]
      const nextKode = getNextKodeForCategory(updatedData, form.tipe, form.kategori, form.sub_kategori)
      setForm(prev => ({
        ...prev,
        kode: nextKode,
        jenis: '',
        keterangan: ''
      }))
      setTimeout(() => jenisInputRef.current?.focus(), 100)
    } else {
      setShowModal(false)
    }
  }

  const handleDelete = async (item) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Katalog Poin?',
      message: `Apakah Anda yakin ingin menghapus "${item.kode} — ${item.jenis}"?\n(Data histori pelanggaran siswa yang sudah tercatat sebelumnya tidak akan terhapus).`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return

    if (catalogMode === 'draft') {
      const updatedDraft = draftData.filter(d => d.id !== item.id)
      updateDraftData(updatedDraft)
      return
    }

    const { error } = await supabase.from('point_catalog').delete().eq('id', item.id)
    if (error) alert('Gagal menghapus: ' + error.message)
    else fetchProdData()
  }

  const handleResetDraft = async () => {
    const confirmed = await requestConfirm({
      title: 'Reset Draf ke Buku PDF Asli?',
      message: 'Tindakan ini akan mengembalikan seluruh data draf uji coba ke master data asli hasil ekstraksi PDF Buku Agenda (51 pasal).',
      confirmLabel: 'Reset Draf',
      confirmColor: 'indigo',
      icon: 'info'
    })
    if (confirmed) {
      updateDraftData(DEFAULT_BUKU_AGENDA_DRAFT)
    }
  }

  const handleApplyDraftToProduction = async () => {
    const confirmed = await requestConfirm({
      title: 'Terapkan Draf Buku Agenda ke Sistem Aktif?',
      message: `PERINGATAN: Tindakan ini akan mengunggah seluruh pasal Buku Agenda dari mode draf ke database aktif sistem eBudiMulia.\n\nPastikan rapat dewan guru sudah selesai dan menyetujui seluruh butir aturan ini. Lanjutkan?`,
      confirmLabel: 'Ya, Terapkan ke Sistem Aktif',
      confirmColor: 'emerald',
      icon: 'warning'
    })
    if (!confirmed) return

    setLoading(true)
    const upserts = draftData.map(d => ({
      tipe: d.tipe,
      kategori: d.kategori,
      sub_kategori: d.sub_kategori || '',
      kode: d.kode,
      jenis: d.jenis,
      keterangan: d.keterangan || '',
      poin: d.poin
    }))

    const { error } = await supabase.from('point_catalog').upsert(upserts, { onConflict: 'kode' })
    setLoading(false)
    if (error) {
      alert('Gagal menerapkan draf: ' + error.message)
    } else {
      alert('Berhasil! Draf Buku Agenda kini telah resmi aktif di sistem eBudiMulia.')
      await fetchProdData()
      setCatalogMode('production')
    }
  }

  const handleClearCatalog = async () => {
    const tipeText = activeTab === 'negative' ? 'Negatif' : 'Positif'
    const count = currentData.filter(d => d.tipe === activeTab).length
    if (count === 0) {
      alert(`Katalog poin ${tipeText.toLowerCase()} sudah kosong.`)
      return
    }
    const confirmed = await requestConfirm({
      title: `Bersihkan Seluruh Katalog ${tipeText}?`,
      message: `Tindakan ini akan menghapus seluruh daftar katalog poin ${tipeText.toLowerCase()} (${count} item).\n\nApakah Anda benar-benar yakin?`,
      confirmLabel: 'Ya, Bersihkan Semua',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    
    if (catalogMode === 'draft') {
      const updatedDraft = draftData.filter(d => d.tipe !== activeTab)
      updateDraftData(updatedDraft)
      return
    }

    setLoading(true)
    const { error } = await supabase.from('point_catalog').delete().eq('tipe', activeTab)
    if (error) {
      alert('Gagal: ' + error.message)
      setLoading(false)
    } else {
      fetchProdData()
    }
  }

  // ─── EXPORT EXCEL (Bahan Rapat Guru) ───────────────────────
  const handleExport = async () => {
    const ExcelJS = await import('exceljs')
    const { saveAs } = await import('file-saver')
    const wb = new ExcelJS.Workbook()
    const isDraft = catalogMode === 'draft'
    const ws = wb.addWorksheet(isDraft ? 'Draf Buku Agenda SMP BM' : 'Katalog Poin')
    
    ws.columns = [
      { header: 'Tipe', key: 'tipe', width: 14 },
      { header: 'Bab (Kategori)', key: 'kategori', width: 26 },
      { header: 'Sub-Kategori / Topik', key: 'sub_kategori', width: 32 },
      { header: 'Kode / Butir', key: 'kode', width: 14 },
      { header: 'Jenis Pelanggaran / Prestasi', key: 'jenis', width: 45 },
      { header: 'Sanksi / Tindakan Penanganan', key: 'keterangan', width: 45 },
      { header: 'Poin', key: 'poin', width: 12 },
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isDraft ? 'FF0284C7' : 'FF4F46E5' } }
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
    ws.getRow(1).height = 28

    currentData.forEach((row, i) => {
      const r = ws.addRow({
        tipe: row.tipe === 'negative' ? 'Negatif' : 'Positif',
        kategori: row.kategori,
        sub_kategori: row.sub_kategori || '—',
        kode: row.kode,
        jenis: row.jenis,
        keterangan: row.keterangan || '',
        poin: row.poin
      })
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
      r.getCell('poin').font = { color: { argb: row.poin < 0 ? 'FFDC2626' : 'FF16A34A' }, bold: true }
      r.getCell('kode').font = { bold: true }
      r.alignment = { vertical: 'middle' }
      r.height = 24
    })
    
    ws.eachRow(r => {
      r.eachCell(c => {
        c.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const today = new Date().toISOString().slice(0, 10)
    const fileName = isDraft ? `DRAF-MATERI-RAPAT-BUKU-AGENDA-SMP-BM-${today}.xlsx` : `katalog-poin-ebudimulia-${today}.xlsx`
    await downloadFile(buf, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  // ─── IMPORT EXCEL ──────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    const existingCodes = new Set(prodData.map(d => d.kode))
    const rows = []
    
    ws.eachRow((row, rn) => {
      if (rn === 1) return
      const [tipeRaw, kategori, kode, jenis, keterangan, poinRaw] = [1,2,3,4,5,6].map(i => (row.getCell(i).value ?? '').toString().trim())
      const errors = []
      const tipe = tipeRaw.toLowerCase() === 'positif' ? 'positive' : tipeRaw.toLowerCase() === 'negatif' ? 'negative' : null
      if (!tipe) errors.push('Tipe harus "Positif" atau "Negatif"')
      if (!kode) errors.push('Kode kosong')
      if (!jenis) errors.push('Jenis kosong')
      const poin = parseInt(poinRaw, 10)
      if (isNaN(poin)) errors.push('Poin bukan angka')
      const isUpdate = existingCodes.has(kode)
      rows.push({ tipe, kategori, kode, jenis, keterangan, poin, _errors: errors, _valid: errors.length === 0, _isUpdate: isUpdate })
    })
    
    setImportRows(rows.filter(r => r.kode || r.jenis))
    setImportLoading(false)
    setImportResult(null)
    if (importRef.current) importRef.current.value = ''
  }

  const handleImportSave = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) { alert('Tidak ada data valid yang bisa diimport.'); return }
    setImportLoading(true)
    const allUpserts = valid.map(r => ({
      tipe: r.tipe,
      kategori: r.kategori,
      kode: r.kode,
      jenis: r.jenis,
      keterangan: r.keterangan,
      poin: r.poin
    }))
    
    const seen = new Map()
    allUpserts.forEach(row => seen.set(row.kode, row))
    const upserts = Array.from(seen.values())
    const skippedDuplicates = allUpserts.length - upserts.length
    const { error } = await supabase.from('point_catalog').upsert(upserts, { onConflict: 'kode' })
    setImportLoading(false)
    if (error) { alert('Gagal import: ' + error.message); return }
    setImportResult({ success: upserts.length, skipped: (importRows.length - valid.length) + skippedDuplicates })
    fetchProdData()
  }

  const handleDownloadTemplate = async () => {
    const ExcelJS = await import('exceljs')
    const { saveAs } = await import('file-saver')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Template Katalog Poin')
    ws.columns = [
      { header: 'Tipe (Negatif/Positif)', key: 'tipe', width: 22 },
      { header: 'Kategori', key: 'kategori', width: 30 },
      { header: 'Kode', key: 'kode', width: 14 },
      { header: 'Jenis Pelanggaran/Prestasi', key: 'jenis', width: 45 },
      { header: 'Sanksi/Keterangan', key: 'keterangan', width: 45 },
      { header: 'Poin', key: 'poin', width: 10 },
    ]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
    ws.addRow({ tipe: 'Negatif', kategori: 'I. KEHADIRAN', kode: 'NEG-KH-1', jenis: 'Terlambat datang ke sekolah ≤ 5 menit', keterangan: 'Dicatat petugas piket & diperbolehkan masuk', poin: -2 })
    ws.addRow({ tipe: 'Negatif', kategori: 'I. KEHADIRAN', kode: 'NEG-KH-2', jenis: 'Terlambat datang ke sekolah > 5 menit', keterangan: 'Petugas piket memberi tugas 1 jam pelajaran', poin: -4 })
    ws.addRow({ tipe: 'Positif', kategori: 'PRESTASI AKADEMIK', kode: 'POS-AK-1', jenis: 'Juara 1 Lomba OSN Tingkat Kota/Provinsi', keterangan: 'Piagam penghargaan & apresiasi sekolah', poin: 25 })
    const buf = await wb.xlsx.writeBuffer()
    await downloadFile(buf, 'template-katalog-poin-ebudimulia.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  const poinBadge = (poin) => {
    if (poin < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-black bg-rose-50 text-rose-600 border border-rose-200/80 shadow-xs">
          {poin}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-3 py-1 rounded-xl text-xs font-black bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-xs">
        +{poin}
      </span>
    )
  }

  // Urutan Kategori (Natural Sort)
  const categoryKeys = useMemo(() => {
    return Object.keys(categoryMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [categoryMap])

  const totalItemCount = currentData.filter(d => d.tipe === activeTab).length

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-9 h-9 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-400">Memuat katalog poin...</p>
      </div>
    )
  }

  return (
    <>
      {ConfirmModalComponent}
      <div className="animate-slide-up space-y-6">

        {/* ─── UNIFIED HEADER CARD (SESUAI TEMA EBUDIMULIA) ─── */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Title & Mode Switcher */}
            <div className="flex items-start sm:items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs shrink-0 ${activeTab === 'negative' ? 'bg-rose-50 border border-rose-100 text-rose-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-600'}`}>
                {activeTab === 'negative' ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Katalog Poin Siswa</h2>
                  
                  {/* Mode Selector Pill Switcher (Hanya Ditampilkan di Dashboard Admin) */}
                  {isAdmin && (
                    <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => setCatalogMode('draft')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          catalogMode === 'draft'
                            ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60 font-black'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span>Mode Draf (Buku Agenda)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatalogMode('production')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          catalogMode === 'production'
                            ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60 font-black'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span>Aktif (Database)</span>
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-slate-500 text-xs font-medium mt-1">
                  Master tata tertib & apresiasi poin • Total <strong className="text-slate-800 font-bold">{totalItemCount}</strong> butir pasal {catalogMode === 'draft' ? '(dalam draf rapat)' : 'aktif'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            {!readOnly && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {catalogMode === 'draft' ? (
                  <>
                    <button
                      onClick={handleResetDraft}
                      className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1.5"
                      title="Reset draf ke 51 pasal default PDF Buku Agenda"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      <span>Reset PDF</span>
                    </button>
                    <button
                      onClick={handleExport}
                      className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                      title="Download Excel bahan rapat dewan guru"
                    >
                      <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span>Export Excel (Bahan Rapat)</span>
                    </button>
                    <button
                      onClick={handleApplyDraftToProduction}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-200"
                      title="Terapkan seluruh draf ini ke database sistem aktif"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Terapkan ke Sistem Aktif</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleExport} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all shadow-xs">
                      <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Export Excel
                    </button>
                    <button onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null) }} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition-all shadow-xs">
                      <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                      Import Excel
                    </button>
                  </>
                )}

                {totalItemCount > 0 && (
                  <button onClick={handleClearCatalog} className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all shadow-xs" title="Bersihkan Seluruh Katalog">
                    <svg className="w-4 h-4 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                )}

                <button onClick={() => openAdd()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all shadow-sm shadow-indigo-200">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  + Tambah Pasal
                </button>
              </div>
            )}
          </div>

          {/* Banner Info Ringkas Draf (Jika di Mode Draf) */}
          {catalogMode === 'draft' && (
            <div className="px-3.5 py-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center justify-between gap-3 text-xs text-indigo-900">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  Menampilkan <strong>Draf Buku Agenda SMP Budi Mulia</strong> (Struktur Bab I–IV & Sub-topik a, b, c).
                </span>
                <span className="text-indigo-600 text-[11px] hidden sm:inline">• Portal siswa & guru tetap memakai aturan aktif di database.</span>
              </div>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-200/70 text-indigo-800 shrink-0">
                Uji Coba Rapat
              </span>
            </div>
          )}
        </div>

        {/* ─── TABS & CONTROLS ─────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Main Tabs */}
          <div className="flex gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl w-full sm:w-fit border border-slate-200/60">
            <button
              onClick={() => { setActiveTab('negative'); setFilterKategori('all'); setSearch('') }}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'negative' 
                  ? 'bg-red-600 text-white shadow-sm shadow-red-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Poin Negatif (Pelanggaran)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'negative' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {currentData.filter(d => d.tipe === 'negative').length}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('positive'); setFilterKategori('all'); setSearch('') }}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'positive' 
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Poin Positif (Prestasi)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'positive' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {currentData.filter(d => d.tipe === 'positive').length}
              </span>
            </button>
          </div>

          {/* Search & Filter Kategori Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Cari nomor, judul, atau sanksi..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-xs"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
              )}
            </div>

            <select
              value={filterKategori}
              onChange={e => setFilterKategori(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs max-w-[200px] truncate"
            >
              <option value="all">Semua Bab ({uniqueKategoris.length})</option>
              {uniqueKategoris.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>

            <div className="hidden sm:flex items-center gap-1 border-l border-slate-200 pl-2">
              <button onClick={expandAll} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold transition-colors" title="Buka Semua Kategori">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7"/></svg>
              </button>
              <button onClick={collapseAll} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold transition-colors" title="Tutup Semua Kategori">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 11l7-7 7 7M5 19l7-7 7 7"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ─── CATEGORY ACCORDION GROUPS ───────────────────────── */}
        {categoryKeys.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
            <h3 className="font-bold text-slate-800 text-base mb-1">Tidak ada pasal ditemukan</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
              {search ? `Tidak ada hasil pencarian untuk "${search}". Coba kata kunci lain.` : 'Belum ada data katalog poin pada kategori ini.'}
            </p>
            {!readOnly && (
              <button onClick={() => openAdd()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm">
                + Tambah Pasal Baru
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {categoryKeys.map(kategoriName => {
              const allItemsInCat = categoryMap[kategoriName] || []
              const isCollapsed = !!collapsedCategories[kategoriName]

              return (
                <div key={kategoriName} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all">
                  
                  {/* Category Header Bar */}
                  <div className="p-4 sm:px-6 bg-slate-50/90 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div 
                      onClick={() => toggleCategoryCollapse(kategoriName)}
                      className="flex items-center gap-3 cursor-pointer select-none group flex-1"
                    >
                      <button className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-colors shrink-0 shadow-2xs">
                        <svg className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-black text-slate-800 text-sm tracking-tight group-hover:text-indigo-600 transition-colors">
                            {kategoriName}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-700">
                            {allItemsInCat.length} Butir
                          </span>
                        </div>
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openAdd(kategoriName)
                          }}
                          className="px-3 py-1.5 bg-white hover:bg-indigo-50 active:scale-95 text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          <span>+ Tambah di Bab Ini</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Category Items Unified Table (Single Table with Section Headers) */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200/80 bg-slate-50/50 text-slate-500 text-[11px] font-bold">
                            <th className="py-3 px-4 sm:px-6 w-28 whitespace-nowrap">No. / Kode</th>
                            <th className="py-3 px-4">
                              {activeTab === 'positive' ? 'Jenis Prestasi / Penghargaan' : 'Jenis Pelanggaran'}
                            </th>
                            <th className="py-3 px-4 hidden md:table-cell">
                              {activeTab === 'positive' ? 'Keterangan / Bukti Pendukung' : 'Sanksi & Tindakan Penanganan'}
                            </th>
                            <th className="py-3 px-4 text-center w-24">Poin</th>
                            {!readOnly && <th className="py-3 px-4 text-center w-20">Aksi</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {buildArticleGroups(allItemsInCat).map((group, gIdx) => {
                            if (!group.isGroup) {
                              const item = group.item
                              return (
                                <tr 
                                  key={item.id || gIdx}
                                  onClick={() => !readOnly && openEdit(item)}
                                  className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                                >
                                  {/* Kode / No Display Badge */}
                                  <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap align-middle">
                                    <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50/80 border border-indigo-200/80 px-2.5 py-1 rounded-lg inline-block whitespace-nowrap shadow-2xs">
                                      {item.display_no || item.kode}
                                    </span>
                                  </td>

                                  {/* Jenis Pelanggaran */}
                                  <td className="py-3.5 px-4 align-middle">
                                    <p className="font-bold text-slate-800 text-xs leading-relaxed group-hover:text-indigo-900 transition-colors">
                                      {item.jenis}
                                    </p>
                                    {item.keterangan && (
                                      <p className="text-[11px] text-slate-400 mt-0.5 md:hidden">
                                        {item.keterangan}
                                      </p>
                                    )}
                                  </td>

                                  {/* Sanksi / Tindakan Desktop */}
                                  <td className="py-3.5 px-4 text-xs text-slate-500 font-medium hidden md:table-cell align-middle leading-relaxed">
                                    {item.keterangan ? (
                                      <span>{item.keterangan}</span>
                                    ) : (
                                      <span className="text-slate-300 italic">—</span>
                                    )}
                                  </td>

                                  {/* Poin Badge */}
                                  <td className="py-3.5 px-4 text-center whitespace-nowrap align-middle">
                                    {poinBadge(item.poin)}
                                  </td>

                                  {/* Actions */}
                                  {!readOnly && (
                                    <td className="py-3.5 px-4 text-center whitespace-nowrap align-middle" onClick={e => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1">
                                        <button 
                                          onClick={() => openEdit(item)}
                                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                          title="Edit Pasal"
                                        >
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button 
                                          onClick={() => handleDelete(item)}
                                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                          title="Hapus Pasal"
                                        >
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              )
                            }

                            // Multi-item Article (e.g. Pasal 6, 10, 11, 12, 14, 17)
                            const subKatKey = `${kategoriName}__${group.fullSubKat}`
                            const isSubOpen = activeTab === 'negative' ? true : !!openSubKategori[subKatKey]
                            return (
                              <React.Fragment key={group.fullSubKat || gIdx}>
                                {/* Induk Pasal Row (No Induk seperti 6, 10, 11, sejajar dengan No 1-5) */}
                                <tr 
                                  onClick={activeTab === 'positive' ? () => setOpenSubKategori(prev => ({ ...prev, [subKatKey]: !prev[subKatKey] })) : undefined}
                                  className={`bg-slate-50/90 border-t border-slate-200/90 select-none ${activeTab === 'positive' ? 'cursor-pointer hover:bg-slate-100/90 group/sub' : ''}`}
                                >
                                  {/* Kolom No / Kode persis sejajar dengan no 1 - 5 */}
                                  <td className="py-3 px-4 sm:px-6 whitespace-nowrap align-middle">
                                    <span className="font-mono text-xs font-black text-indigo-700 bg-white border border-indigo-200/80 px-2.5 py-1 rounded-lg inline-block whitespace-nowrap shadow-2xs">
                                      {group.articleNo || '—'}
                                    </span>
                                  </td>

                                  {/* Judul Pasal Induk */}
                                  <td className="py-3 px-4 align-middle">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-black text-slate-900 text-xs tracking-tight">
                                        {group.title}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                        {group.items.length} butir
                                      </span>
                                    </div>
                                  </td>

                                  {/* Kolom Sanksi di baris induk - Tombol tambah butir */}
                                  <td className="py-3 px-4 hidden md:table-cell align-middle text-xs text-slate-400" onClick={e => e.stopPropagation()}>
                                    {!readOnly && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openAdd(kategoriName, group.fullSubKat)
                                        }}
                                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 hover:underline"
                                      >
                                        <span>+ Tambah Butir</span>
                                      </button>
                                    )}
                                  </td>

                                  {/* Kolom Poin (Status toggle buka/tutup untuk positif, strip untuk negatif) */}
                                  <td className="py-3 px-4 text-center whitespace-nowrap align-middle">
                                    {activeTab === 'positive' ? (
                                      <div className="flex items-center justify-center gap-1 text-indigo-600">
                                        <span className="text-[11px] font-bold hidden sm:inline">
                                          {isSubOpen ? 'Tutup' : 'Buka'}
                                        </span>
                                        <svg
                                          className={`w-3.5 h-3.5 transition-transform duration-200 ${isSubOpen ? 'rotate-180' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 font-bold text-xs">—</span>
                                    )}
                                  </td>

                                  {/* Kolom Aksi */}
                                  {!readOnly && (
                                    <td className="py-3 px-4 text-center whitespace-nowrap align-middle"></td>
                                  )}
                                </tr>

                                {/* Anak Butir (6.a, 6.b, 6.c dst) */}
                                {isSubOpen && group.items.map((item, cIdx) => (
                                  <tr 
                                    key={item.id || cIdx}
                                    onClick={() => !readOnly && openEdit(item)}
                                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors group bg-white animate-fade-in"
                                  >
                                    {/* Kolom No Butir (Indented dengan simbol panah/cabang) */}
                                    <td className="py-3 px-4 sm:px-6 whitespace-nowrap align-middle pl-8 sm:pl-10">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-indigo-300 font-bold text-xs">↳</span>
                                        <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md inline-block whitespace-nowrap">
                                          {item.display_no || item.kode}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Jenis Pelanggaran Anak Butir */}
                                    <td className="py-3 px-4 align-middle">
                                      <p className="font-bold text-slate-800 text-xs leading-relaxed group-hover:text-indigo-900 transition-colors">
                                        {item.jenis}
                                      </p>
                                      {item.keterangan && (
                                        <p className="text-[11px] text-slate-400 mt-0.5 md:hidden">
                                          {item.keterangan}
                                        </p>
                                      )}
                                    </td>

                                    {/* Sanksi Anak Butir */}
                                    <td className="py-3 px-4 text-xs text-slate-500 font-medium hidden md:table-cell align-middle leading-relaxed">
                                      {item.keterangan ? (
                                        <span>{item.keterangan}</span>
                                      ) : (
                                        <span className="text-slate-300 italic">—</span>
                                      )}
                                    </td>

                                    {/* Poin Badge */}
                                    <td className="py-3 px-4 text-center whitespace-nowrap align-middle">
                                      {poinBadge(item.poin)}
                                    </td>

                                    {/* Actions */}
                                    {!readOnly && (
                                      <td className="py-3 px-4 text-center whitespace-nowrap align-middle" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                          <button 
                                            onClick={() => openEdit(item)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Edit Butir"
                                          >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                          </button>
                                          <button 
                                            onClick={() => handleDelete(item)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Hapus Butir"
                                          >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* ─── ADD / EDIT MODAL ──────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div>
                <h3 className="font-black text-slate-800 text-base">
                  {editItem ? 'Edit Pasal Katalog Poin' : 'Tambah Pasal Baru'}
                </h3>
                <p className="text-xs text-slate-400">
                  {editItem ? `Mengubah data pasal ${editItem.display_no || editItem.kode}` : 'Otomatis terhubung ke kategori & kode selanjutnya'}
                </p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={(e) => handleSave(e, false)} className="p-6 space-y-4 overflow-y-auto flex-1">
              
              {/* Tipe Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tipe Pasal <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleModalTipeChange('negative')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      form.tipe === 'negative'
                        ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>Poin Negatif (Pelanggaran)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModalTipeChange('positive')}
                    className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      form.tipe === 'positive'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>Poin Positif (Prestasi)</span>
                  </button>
                </div>
              </div>

              {/* Kategori Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Bab (Kategori Utama) <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <select 
                    value={isNewKategori ? "NEW" : form.kategori} 
                    onChange={e => handleModalKategoriChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-800 shadow-xs"
                  >
                    {[...new Set(currentData.filter(d => d.tipe === form.tipe).map(d => d.kategori))].filter(Boolean).sort().map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                    <option value="NEW">+ Buat Bab / Kategori Baru...</option>
                  </select>

                  {isNewKategori && (
                    <input 
                      value={form.kategori} 
                      onChange={e => {
                        const val = e.target.value
                        const nextKode = getNextKodeForCategory(currentData, form.tipe, val, form.sub_kategori)
                        setForm({ ...form, kategori: val, kode: nextKode })
                      }} 
                      placeholder="Contoh: III. SIKAP & ETIKA" 
                      className="w-full px-3.5 py-2 border border-indigo-200 bg-indigo-50/40 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                    />
                  )}
                </div>
              </div>

              {/* Sub-Kategori Dropdown & Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Sub-Kategori / Judul Pasal Induk <span className="text-slate-400 font-normal text-[11px]">(Opsional, misal: 1. Terlambat datang)</span>
                </label>
                <div className="space-y-2">
                  <select
                    value={isNewSubKategori ? "NEW" : form.sub_kategori}
                    onChange={e => {
                      const val = e.target.value
                      if (val === "NEW") {
                        setIsNewSubKategori(true)
                        setForm({ ...form, sub_kategori: '' })
                      } else {
                        setIsNewSubKategori(false)
                        const nextKode = getNextKodeForCategory(currentData, form.tipe, form.kategori, val)
                        setForm({ ...form, sub_kategori: val, kode: nextKode })
                      }
                    }}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-slate-800 shadow-xs"
                  >
                    <option value="">(Tanpa Sub-Kategori / Pasal Tunggal)</option>
                    {[...new Set(currentData.filter(d => d.kategori === form.kategori && d.sub_kategori).map(d => d.sub_kategori))].map(sk => (
                      <option key={sk} value={sk}>{sk}</option>
                    ))}
                    <option value="NEW">+ Ketik Sub-Kategori Baru...</option>
                  </select>

                  {isNewSubKategori && (
                    <input
                      value={form.sub_kategori}
                      onChange={e => {
                        const val = e.target.value
                        const nextKode = getNextKodeForCategory(currentData, form.tipe, form.kategori, val)
                        setForm({ ...form, sub_kategori: val, kode: nextKode })
                      }}
                      placeholder="Contoh: 1. Terlambat datang ke sekolah"
                      className="w-full px-3.5 py-2 border border-indigo-200 bg-indigo-50/40 rounded-xl text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Kode & Poin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Kode / Nomor Butir <span className="text-red-500">*</span></label>
                    <span className="text-[10px] text-emerald-600 font-semibold">Auto-terisi</span>
                  </div>
                  <input 
                    value={form.kode} 
                    onChange={e => setForm({ ...form, kode: e.target.value.toUpperCase() })} 
                    placeholder="Contoh: 1.a atau II.1" 
                    required 
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-black font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-slate-50 text-indigo-700 shadow-xs" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Bobot Poin <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    value={form.poin} 
                    onChange={e => setForm({ ...form, poin: e.target.value })} 
                    placeholder={form.tipe === 'negative' ? '-5' : '10'} 
                    required 
                    className={`w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-black focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs ${
                      form.tipe === 'negative' ? 'text-rose-600' : 'text-emerald-600'
                    }`} 
                  />
                </div>
              </div>

              {/* Quick Poin Chips */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 block mb-1.5">PILIHAN CEPAT BOBOT POIN:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {form.tipe === 'negative' ? (
                    [-2, -3, -4, -5, -10, -15, -20, -25, -50, -100].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setForm({ ...form, poin: val.toString() })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                          parseInt(form.poin, 10) === val
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {val}
                      </button>
                    ))
                  ) : (
                    [5, 10, 15, 20, 25, 50].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setForm({ ...form, poin: val.toString() })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                          parseInt(form.poin, 10) === val
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        +{val}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Jenis Pelanggaran / Prestasi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Jenis {form.tipe === 'negative' ? 'Pelanggaran' : 'Prestasi'} <span className="text-red-500">*</span>
                </label>
                <textarea 
                  ref={jenisInputRef}
                  rows={2}
                  value={form.jenis} 
                  onChange={e => setForm({ ...form, jenis: e.target.value })} 
                  required 
                  placeholder={form.tipe === 'negative' ? 'Contoh: Terlambat datang ke sekolah > 5 menit' : 'Contoh: Juara 1 Lomba Cerdas Cermat'} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none shadow-xs" 
                />
              </div>

              {/* Sanksi / Tindakan / Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {form.tipe === 'negative' ? 'Sanksi / Tindakan Penanganan' : 'Keterangan / Bukti Pendukung'}
                </label>
                <input 
                  value={form.keterangan} 
                  onChange={e => setForm({ ...form, keterangan: e.target.value })} 
                  placeholder={form.tipe === 'negative' ? 'Contoh: Dicatat guru piket & diberikan tugas 1 jam' : 'Contoh: Surat Keputusan / Piagam / Rekap Presensi'} 
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-xs" 
                />
              </div>

              {/* Opsi Sinkronisasi ke Riwayat Siswa (Hanya muncul saat Edit di Mode Produksi) */}
              {editItem && catalogMode === 'production' && (
                <div className={`p-4 rounded-2xl border transition-all ${syncHistory ? 'bg-indigo-50/90 border-indigo-300 shadow-xs' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncHistory}
                      onChange={e => setSyncHistory(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300 transition-colors"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Sinkronkan ke seluruh riwayat siswa yang sudah tersimpan
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Jika dicentang, seluruh catatan siswa yang pernah menggunakan pasal <strong className="text-indigo-700 font-bold">{editItem.display_no || editItem.kode}</strong> ({syncCount} catatan ditemukan di database) akan otomatis diperbarui nama jenis & kodenya, serta total poin siswa dihitung ulang secara aman.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Batal
                </button>
                
                {!editItem && (
                  <button 
                    type="button" 
                    disabled={saving} 
                    onClick={(e) => handleSave(e, true)}
                    className="flex-1 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Simpan & Tambah Lagi</span>
                  </button>
                )}

                <button 
                  type="submit" 
                  disabled={saving} 
                  className={`${editItem ? 'flex-1' : 'px-6'} py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-200 disabled:opacity-60 flex items-center justify-center gap-1.5`}
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── IMPORT EXCEL MODAL ───────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-100">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base">Import Katalog Poin via Excel</h3>
                  <p className="text-xs text-slate-400">Unggah master data pasal tata tertib secara instan</p>
                </div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60">
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl">
                <div>
                  <h4 className="text-xs font-bold text-indigo-900">Gunakan Template Resmi</h4>
                  <p className="text-[11px] text-indigo-700 mt-0.5">Pastikan kolom Excel sesuai dengan format eBudiMulia.</p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Download Template Excel
                </button>
              </div>

              {/* Upload Input Area */}
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center bg-slate-50/50 transition-colors">
                <input 
                  type="file" 
                  ref={importRef}
                  accept=".xlsx,.xls" 
                  onChange={handleImportFile}
                  className="hidden" 
                  id="excel-upload-katalog"
                />
                <label htmlFor="excel-upload-katalog" className="cursor-pointer flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-2 shadow-xs text-xl">
                    📊
                  </div>
                  <span className="text-xs font-bold text-indigo-600 hover:underline">Klik untuk memilih file Excel</span>
                  <span className="text-[10px] text-slate-400 mt-1">Format didukung: .xlsx atau .xls</span>
                </label>
              </div>

              {/* Preview Table */}
              {importRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Preview Data ({importRows.length} baris terdeteksi):</span>
                    <span className="text-[11px] font-bold text-emerald-600">{importRows.filter(r => r._valid).length} valid</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-56">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2">Status</th>
                          <th className="p-2">Tipe</th>
                          <th className="p-2">Kategori</th>
                          <th className="p-2">Kode</th>
                          <th className="p-2">Jenis</th>
                          <th className="p-2">Poin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2">{r.tipe || '—'}</td>
                            <td className="p-2">{r.kategori || '—'}</td>
                            <td className="p-2 font-mono font-bold text-indigo-700">{r.kode}</td>
                            <td className="p-2 max-w-xs truncate">{r.jenis}</td>
                            <td className="p-2 text-right font-bold">{r.poin}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 10 && (
                    <p className="text-[10px] text-slate-400 italic text-right">+ {importRows.length - 10} baris lainnya...</p>
                  )}
                </div>
              )}

              {importResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-medium">
                  🎉 Berhasil mengimport <strong>{importResult.success}</strong> pasal katalog poin.
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
              >
                Tutup
              </button>
              {importRows.length > 0 && (
                <button
                  disabled={importLoading || importRows.filter(r => r._valid).length === 0}
                  onClick={handleImportSave}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  {importLoading ? 'Menyimpan...' : `Simpan ${importRows.filter(r => r._valid).length} Data ke Database`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
