import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import * as XLSX from 'xlsx'

export default function AdminJadwalPelajaranSection({ session, activeTa }) {
  // Tabs & Views
  const [activeTab, setActiveTab] = useState('grid') // 'grid', 'beban', 'catatan_ekskul', 'import'
  const [activeSemester, setActiveSemester] = useState(2) // Default Semester 2
  const [activeHari, setActiveHari] = useState('Senin')
  
  // Master Data
  const [gurus, setGurus] = useState([])
  const [mapels, setMapels] = useState([])
  const [classes, setClasses] = useState([])
  
  // Jadwal & Pendukung States
  const [slots, setSlots] = useState([]) // Dari tabel jadwal_slot_waktu
  const [jadwals, setJadwals] = useState([]) // Dari tabel jadwal_pelajaran
  const [bebanMengajar, setBebanMengajar] = useState([]) // Dari tabel jadwal_beban_mengajar
  const [piketList, setPiketList] = useState([])
  const [catatanList, setCatatanList] = useState([])
  const [ekskulList, setEkskulList] = useState([])
  
  // Loadings & Savers
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Guru & Kode Reference Sidebar Panel States
  const [showGuruRef, setShowGuruRef] = useState(true)
  const [guruRefSearch, setGuruRefSearch] = useState('')
  
  // Modal States
  const [showCellModal, setShowCellModal] = useState(false)
  const [selectedCell, setSelectedCell] = useState(null) // { kelas, slotId, slotLabel, jam_ke }
  const [cellForm, setCellForm] = useState({
    id: '',
    guru_id: '',
    mata_pelajaran_id: '',
    is_blok: false,
    keterangan_blok: ''
  })

  // State Inisialisasi Jam Pelajaran Awal Harian
  const [initForm, setInitForm] = useState({
    start_time: '06:30',
    total_jam: 9,
    start_jam_ke: 0,
    total_istirahat: 2,
    durasi_pelajaran: 40,
    durasi_istirahat_1: 30,
    durasi_istirahat_2: 20
  })
  
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false)
  
  // Setup Jam Modal (Ubah Manual Durasi/Label/Waktu Mulai Awal)
  const [showJamModal, setShowJamModal] = useState(false)
  const [jamForm, setJamForm] = useState({
    id: '',
    tipe: 'pelajaran', // 'pelajaran', 'istirahat', 'persiapan', 'penutup', 'blok_khusus'
    label: '',
    jam_ke: '',
    durasi_menit: 40,
    keterangan_blok: '',
    waktu_mulai: '06:30'
  })

  // Guru Detail untuk Setup Beban
  const [selectedGuruBeban, setSelectedGuruBeban] = useState(null) // Guru object yang sedang dipilih
  const [guruBebanMapels, setGuruBebanMapels] = useState([]) // Mapel dari guru_mapel
  const [bebanForm, setBebanForm] = useState({
    mata_pelajaran_id: '',
    jam_per_minggu: 2,
    maks_jam_per_hari: 2,
    kode_guru: ''
  })

  const [guruKodeInput, setGuruKodeInput] = useState('')

  // Piket & Catatan States
  const [piketFormGuruId, setPiketFormGuruId] = useState('')
  const [newCatatan, setNewCatatan] = useState('')
  const [newEkskul, setNewEkskul] = useState({
    nama: '',
    hari: 'Senin',
    waktu: '14:30 - 15:30',
    pembina: ''
  })

  const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

  // Hitung ulang waktu_mulai untuk semua slot dalam satu hari secara otomatis
  const calculateSlotTimes = (slotList, defaultStartTime = '06:30') => {
    let currentHour = parseInt(defaultStartTime.split(':')[0])
    let currentMin = parseInt(defaultStartTime.split(':')[1])

    return slotList.map(slot => {
      const hh = String(currentHour).padStart(2, '0')
      const mm = String(currentMin).padStart(2, '0')
      const startTimeStr = `${hh}:${mm}:00`

      currentMin += slot.durasi_menit
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60)
        currentMin = currentMin % 60
      }
      currentHour = currentHour % 24

      return {
        ...slot,
        waktu_mulai: startTimeStr
      }
    })
  }

  // Menata ulang jam_ke dan label romawi pelajaran secara berurutan tanpa duplikasi
  const reorderJamKe = (slotList, startJamKe = 0) => {
    const labelRomawi = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    let currentJamKe = parseInt(startJamKe)

    return slotList.map((slot, index) => {
      const updated = { ...slot, urutan: index }
      if (slot.tipe === 'pelajaran') {
        updated.jam_ke = currentJamKe
        updated.label = labelRomawi[currentJamKe] || String(currentJamKe)
        currentJamKe++
      } else {
        updated.jam_ke = null
        if (slot.tipe === 'persiapan') {
          updated.label = 'P'
        } else {
          updated.label = '-'
        }
      }
      return updated
    })
  }

  const fetchMasterData = async () => {
    try {
      // 1. Fetch Master Gurus
      const { data: gurusData } = await supabase
        .from('guru')
        .select('*, guru_mapel(mata_pelajaran_id, kelas, tahun_ajaran_id, mata_pelajaran(id, nama, singkatan))')
        .order('nama_guru')
      setGurus(gurusData || [])

      // 2. Fetch Master Mapels
      const { data: mapelsData } = await supabase
        .from('mata_pelajaran')
        .select('*')
        .order('nama')
      setMapels(mapelsData || [])

      // 3. Fetch Classes dari enrollment & master_kelas
      const { data: enrolls } = await supabase
        .from('enrollment')
        .select('kelas')
        .eq('tahun_ajaran_id', activeTa?.id)
      
      let listMaster = []
      try {
        const { data: masterKls, error: masterKlsErr } = await supabase
          .from('master_kelas')
          .select('nama_kelas')
          .eq('tahun_ajaran_id', activeTa?.id)
        if (!masterKlsErr && masterKls) {
          listMaster = masterKls.map(mk => mk.nama_kelas).filter(Boolean)
        }
      } catch (err) {
        console.warn('Tabel master_kelas belum dimigrasikan:', err)
      }
      
      const listEnroll = enrolls ? enrolls.map(e => e.kelas).filter(Boolean) : []
      
      let uniqueClasses = [...new Set([...listEnroll, ...listMaster])].sort()

      if (uniqueClasses.length === 0) {
        uniqueClasses = ['7A', '7B', '7C', '7D', '8A', '8B', '8C', '8D', '9A', '9B', '9C', '9D']
      }
      setClasses(uniqueClasses)

      // 4. Fetch Beban Mengajar
      const { data: bebanData } = await supabase
        .from('jadwal_beban_mengajar')
        .select(`
          *,
          guru ( id, nama_guru ),
          mata_pelajaran ( id, nama )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
      setBebanMengajar(bebanData || [])

      // 5. Fetch Catatan
      const { data: catatanData } = await supabase
        .from('jadwal_catatan')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .order('urutan')
      setCatatanList(catatanData || [])

      // 6. Fetch Ekskul
      const { data: ekskulData } = await supabase
        .from('jadwal_ekskul')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .order('urutan')
      setEkskulList(ekskulData || [])
    } catch (error) {
      console.error('Error fetching master data:', error)
    }
  }

  const fetchDailyData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // 1. Fetch Slots Waktu harian
      const { data: slotsData } = await supabase
        .from('jadwal_slot_waktu')
        .select('*')
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
        .order('urutan')

      if (slotsData && slotsData.length > 0) {
        const baseStartTime = slotsData[0].waktu_mulai ? slotsData[0].waktu_mulai.slice(0, 5) : '06:30'
        const calculated = calculateSlotTimes(slotsData, baseStartTime)
        setSlots(calculated)
      } else {
        setSlots([])
      }

      // 2. Fetch Jadwal Pelajaran harian
      const { data: jadwalData } = await supabase
        .from('jadwal_pelajaran')
        .select(`
          *,
          guru ( id, nama_guru, kode ),
          mata_pelajaran ( id, nama, singkatan )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
      setJadwals(jadwalData || [])

      // 3. Fetch Guru Piket harian
      const { data: piketData } = await supabase
        .from('jadwal_piket')
        .select(`
          *,
          guru ( id, nama_guru )
        `)
        .eq('tahun_ajaran_id', activeTa?.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
        .order('urutan')
      setPiketList(piketData || [])
    } catch (error) {
      console.error('Error fetching daily data:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Panggil fetch master & daily saat inisiasi TA berubah (Loading Penuh)
  useEffect(() => {
    if (activeTa?.id) {
      const loadAll = async () => {
        setLoading(true)
        await fetchMasterData()
        await fetchDailyData(true)
        setLoading(false)
      }
      loadAll()
    }
  }, [activeTa?.id])

  // Pindah Hari atau Semester instan tanpa layar loading penuh (silent fetch)
  useEffect(() => {
    if (activeTa?.id) {
      fetchDailyData(true)
    }
  }, [activeSemester, activeHari])

  // Alias untuk kompatibilitas code di luar
  const fetchInitialData = async (silent = false) => {
    await fetchDailyData(silent)
  }

  // LOGIKA INISIALISASI SLOT JAM PELAJARAN DAN ISTIRAHAT
  const handleInitializeSlots = async (e) => {
    e.preventDefault()
    if (!activeTa?.id) return
    setSaving(true)

    try {
      const { start_time, total_jam, start_jam_ke, total_istirahat, durasi_pelajaran, durasi_istirahat_1, durasi_istirahat_2 } = initForm
      
      const newSlots = []
      let currentUrutan = 0
      
      const istirahat1After = 3
      const istirahat2After = 7
      
      let jamKeCounter = parseInt(start_jam_ke)
      const labelRomawi = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

      for (let i = 0; i <= parseInt(total_jam); i++) {
        if (i === 0 && parseInt(start_jam_ke) === 0) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: 'P',
            tipe: 'persiapan',
            keterangan_blok: 'PERSIAPAN KBM & DOA / GLS',
            durasi_menit: 30
          })
          continue
        }

        const currentJamKe = jamKeCounter++
        newSlots.push({
          urutan: currentUrutan++,
          jam_ke: currentJamKe,
          label: String(currentJamKe),
          tipe: 'pelajaran',
          keterangan_blok: null,
          durasi_menit: parseInt(durasi_pelajaran)
        })

        if (parseInt(total_istirahat) >= 1 && currentJamKe === istirahat1After) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: '-',
            tipe: 'istirahat',
            keterangan_blok: 'ISTIRAHAT 1',
            durasi_menit: parseInt(durasi_istirahat_1)
          })
        }

        if (parseInt(total_istirahat) >= 2 && currentJamKe === istirahat2After) {
          newSlots.push({
            urutan: currentUrutan++,
            jam_ke: null,
            label: '-',
            tipe: 'istirahat',
            keterangan_blok: 'ISTIRAHAT 2',
            durasi_menit: parseInt(durasi_istirahat_2)
          })
        }
      }

      // Terapkan penataan ulang jam_ke dan label romawi pelajaran secara urut bersih
      const orderedSlots = reorderJamKe(newSlots, start_jam_ke)
      const calculated = calculateSlotTimes(orderedSlots, start_time)
      const inserts = calculated.map(s => ({
        tahun_ajaran_id: activeTa.id,
        semester: activeSemester,
        hari: activeHari,
        urutan: s.urutan,
        jam_ke: s.jam_ke,
        label: s.label,
        tipe: s.tipe,
        keterangan_blok: s.keterangan_blok,
        durasi_menit: s.durasi_menit,
        waktu_mulai: s.waktu_mulai
      }))

      // Hapus slot waktu lama harian agar bersih
      await supabase
        .from('jadwal_slot_waktu')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)

      const { error } = await supabase.from('jadwal_slot_waktu').insert(inserts)
      if (error) throw error

      await fetchInitialData()
    } catch (error) {
      alert('Gagal menginisialisasi jam pelajaran: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // 1. LOGIKA MOVE SLOT (DRAG-DROP / REORDER DENGAN UPDATE OPTIMISTIK INSTAN)
  const handleMoveSlot = async (index, direction) => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === slots.length - 1) return

    // Update state lokal secara instan (optimistic UI update)
    const newSlots = [...slots]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    // Swap urutan di local state
    const tempUrutan = newSlots[index].urutan
    newSlots[index].urutan = newSlots[targetIndex].urutan
    newSlots[targetIndex].urutan = tempUrutan

    // Swap posisi array
    const tempObj = newSlots[index]
    newSlots[index] = newSlots[targetIndex]
    newSlots[targetIndex] = tempObj

    const firstPelajaran = slots.find(s => s.tipe === 'pelajaran')
    const startJamKe = firstPelajaran ? (firstPelajaran.jam_ke !== null ? firstPelajaran.jam_ke : 0) : 0

    // Tata ulang urutan, jam_ke, dan label
    const ordered = reorderJamKe(newSlots, startJamKe)
    const baseStartTime = ordered[0].waktu_mulai ? ordered[0].waktu_mulai.slice(0, 5) : '06:30'
    const calculated = calculateSlotTimes(ordered, baseStartTime)
    setSlots(calculated)

    try {
      // Update urutan sementara negatif untuk mencegah tabrakan unique constraint
      for (let i = 0; i < calculated.length; i++) {
        await supabase
          .from('jadwal_slot_waktu')
          .update({ urutan: -999 - i })
          .eq('id', calculated[i].id)
      }

      // Update urutan, jam_ke, dan label asli yang baru
      for (let i = 0; i < calculated.length; i++) {
        await supabase
          .from('jadwal_slot_waktu')
          .update({ 
            urutan: calculated[i].urutan,
            jam_ke: calculated[i].jam_ke,
            label: calculated[i].label
          })
          .eq('id', calculated[i].id)
      }
      
      await fetchInitialData(true)
    } catch (error) {
      console.error('Gagal swap urutan:', error)
    }
  }

  const handleSaveJamSlot = async (e) => {
    e.preventDefault()
    if (!activeTa?.id) return
    setSaving(true)
    
    try {
      const payload = {
        tahun_ajaran_id: activeTa.id,
        semester: activeSemester,
        hari: activeHari,
        tipe: jamForm.tipe,
        label: jamForm.label || (jamForm.tipe === 'pelajaran' ? 'Jam' : '-'),
        jam_ke: jamForm.tipe === 'pelajaran' ? (jamForm.jam_ke !== '' ? parseInt(jamForm.jam_ke) : 0) : null,
        durasi_menit: parseInt(jamForm.durasi_menit),
        keterangan_blok: jamForm.tipe !== 'pelajaran' ? jamForm.keterangan_blok : null,
        waktu_mulai: jamForm.waktu_mulai ? `${jamForm.waktu_mulai}:00` : '00:00:00'
      }

      if (jamForm.id) {
        const { error } = await supabase.from('jadwal_slot_waktu').update(payload).eq('id', jamForm.id)
        if (error) throw error
      } else {
        const lastUrutan = slots.length > 0 ? Math.max(...slots.map(s => s.urutan)) + 1 : 0
        const { error } = await supabase.from('jadwal_slot_waktu').insert([{ ...payload, urutan: lastUrutan }])
        if (error) throw error
      }

      // Ambil slot terbaru dari database untuk ditata ulang jam_ke dan urutannya
      const { data: currentSlots, error: fetchErr } = await supabase
        .from('jadwal_slot_waktu')
        .select('*')
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
        .order('urutan')

      if (!fetchErr && currentSlots && currentSlots.length > 0) {
        const firstPelajaran = currentSlots.find(s => s.tipe === 'pelajaran')
        const startJamKe = firstPelajaran ? (firstPelajaran.jam_ke !== null ? firstPelajaran.jam_ke : 0) : 0
        
        const ordered = reorderJamKe(currentSlots, startJamKe)
        const baseStartTime = ordered[0].waktu_mulai ? ordered[0].waktu_mulai.slice(0, 5) : '06:30'
        const calculated = calculateSlotTimes(ordered, baseStartTime)

        // Gunakan urutan sementara negatif untuk mencegah tabrakan unique constraint
        for (let i = 0; i < calculated.length; i++) {
          await supabase
            .from('jadwal_slot_waktu')
            .update({ urutan: -999 - i })
            .eq('id', calculated[i].id)
        }

        // Update urutan, jam_ke, label, dan waktu_mulai
        for (let i = 0; i < calculated.length; i++) {
          await supabase
            .from('jadwal_slot_waktu')
            .update({ 
              urutan: calculated[i].urutan,
              jam_ke: calculated[i].jam_ke,
              label: calculated[i].label,
              waktu_mulai: calculated[i].waktu_mulai
            })
            .eq('id', calculated[i].id)
        }
      }

      await fetchInitialData()
      setShowJamModal(false)
    } catch (error) {
      alert('Gagal menyimpan slot: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSlot = async (id) => {
    if (!window.confirm('⚠️ Hapus slot ini beserta seluruh pelajaran terjadwal pada jam tersebut?')) return
    setSaving(true)
    try {
      const { error: deleteErr } = await supabase.from('jadwal_slot_waktu').delete().eq('id', id)
      if (deleteErr) throw deleteErr

      // Urutkan ulang sisa slot yang ada agar jam_ke dan label romawi sinkron tanpa lubang
      const remainingSlots = slots.filter(s => s.id !== id)
      if (remainingSlots.length > 0) {
        const firstPelajaran = remainingSlots.find(s => s.tipe === 'pelajaran')
        const startJamKe = firstPelajaran ? (firstPelajaran.jam_ke !== null ? firstPelajaran.jam_ke : 0) : 0
        
        const ordered = reorderJamKe(remainingSlots, startJamKe)
        const baseStartTime = ordered[0].waktu_mulai ? ordered[0].waktu_mulai.slice(0, 5) : '06:30'
        const calculated = calculateSlotTimes(ordered, baseStartTime)

        // Gunakan urutan sementara negatif untuk mencegah tabrakan unique constraint
        for (let i = 0; i < calculated.length; i++) {
          await supabase
            .from('jadwal_slot_waktu')
            .update({ urutan: -999 - i })
            .eq('id', calculated[i].id)
        }

        // Simpan nilai urutan, jam_ke, dan label baru
        for (let i = 0; i < calculated.length; i++) {
          await supabase
            .from('jadwal_slot_waktu')
            .update({ 
              urutan: calculated[i].urutan,
              jam_ke: calculated[i].jam_ke,
              label: calculated[i].label
            })
            .eq('id', calculated[i].id)
        }
      }

      await fetchInitialData()
    } catch (error) {
      alert('Gagal menghapus slot: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // 2. LOGIKA CELL JADWAL
  const handleSaveCell = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !selectedCell) return
    setSaving(true)

    try {
      if (cellForm.is_blok) {
        // Simpan sebagai Blok Kegiatan Khusus (Upacara, Ibadat, dll)
        const { error } = await supabase
          .from('jadwal_slot_waktu')
          .update({ 
            tipe: 'blok_khusus',
            keterangan_blok: cellForm.keterangan_blok || 'KEGIATAN KHUSUS'
          })
          .eq('id', selectedCell.slotId)
        if (error) throw error

        await supabase
          .from('jadwal_pelajaran')
          .delete()
          .eq('hari', activeHari)
          .eq('jam_ke', selectedCell.jam_ke)
          .eq('tahun_ajaran_id', activeTa.id)
          .eq('semester', activeSemester)
      } else {
        const payload = {
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          hari: activeHari,
          kelas: selectedCell.kelas,
          jam_ke: selectedCell.jam_ke,
          waktu_mulai: selectedCell.waktu_mulai,
          waktu_selesai: selectedCell.waktu_selesai,
          guru_id: cellForm.guru_id || null,
          mata_pelajaran_id: cellForm.mata_pelajaran_id || null
        }

        if (cellForm.id) {
          const { error } = await supabase.from('jadwal_pelajaran').update(payload).eq('id', cellForm.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('jadwal_pelajaran').insert([payload])
          if (error) throw error
        }
      }

      await fetchInitialData(true)
      setShowCellModal(false)
    } catch (error) {
      alert('Gagal menyimpan jadwal: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCell = async (id) => {
    if (!window.confirm('Hapus jadwal di cell ini?')) return
    setSaving(true)
    try {
      const { error } = await supabase.from('jadwal_pelajaran').delete().eq('id', id)
      if (error) throw error
      await fetchInitialData(true)
      setShowCellModal(false)
    } catch (error) {
      alert('Gagal menghapus: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // 3. LOGIKA SETUP BEBAN MENGAJAR (KLIK NAMA GURU & OTOMATIS TARGET KELAS)
  // 3. LOGIKA SETUP BEBAN MENGAJAR (KLIK NAMA GURU & OTOMATIS TARGET KELAS)
  const handleSelectGuruBeban = (guru) => {
    setSelectedGuruBeban(guru)
    setGuruKodeInput(guru.kode || '')
    let autoMapelId = ''
    
    if (guru.guru_mapel) {
      const mapelIds = [...new Set(guru.guru_mapel.map(gm => gm.mata_pelajaran_id))]
      const filteredMapels = mapels.filter(m => mapelIds.includes(m.id))
      setGuruBebanMapels(filteredMapels)
      
      if (filteredMapels.length === 1) {
        autoMapelId = filteredMapels[0].id
      }
    } else {
      setGuruBebanMapels([])
    }

    if (autoMapelId) {
      handleMapelChange(autoMapelId, guru)
    } else {
      setBebanForm({
        mata_pelajaran_id: '',
        jam_per_minggu: 2,
        maks_jam_per_hari: 2,
        kode_guru: ''
      })
    }
  }

  const handleMapelChange = (mapelId, guruObj = null) => {
    const activeGuru = guruObj || selectedGuruBeban
    if (!activeGuru) return

    // Cari apakah sudah ada setup beban mengajar ter-load di state
    const existing = bebanMengajar.find(b => 
      b.guru_id === activeGuru.id && 
      b.mata_pelajaran_id === mapelId
    )

    if (existing) {
      setBebanForm({
        mata_pelajaran_id: mapelId,
        jam_per_minggu: existing.jam_per_minggu,
        maks_jam_per_hari: existing.maks_jam_per_hari,
        kode_guru: existing.kode_guru || ''
      })
    } else {
      // Auto-suggest kode guru jika kode di tabel guru adalah angka murni (misal: "8", "9")
      // Jika kodenya mengandung huruf (seperti ID "g02026"), biarkan kosong agar diisi manual.
      const isNumeric = activeGuru.kode && /^\d+$/.test(activeGuru.kode.trim())
      let suggestedKode = isNumeric ? activeGuru.kode.trim() : ''

      if (suggestedKode && activeGuru.guru_mapel) {
        const mapelIds = [...new Set(activeGuru.guru_mapel.map(gm => gm.mata_pelajaran_id))]
        const idx = mapelIds.indexOf(mapelId)
        if (idx > 0) {
          suggestedKode = `${suggestedKode}.${idx}`
        }
      }

      setBebanForm({
        mata_pelajaran_id: mapelId,
        jam_per_minggu: 2,
        maks_jam_per_hari: 2,
        kode_guru: suggestedKode
      })
    }
  }

  const handleSaveGuruKode = async () => {
    if (!selectedGuruBeban) return
    try {
      const { error } = await supabase
        .from('guru')
        .update({ kode: guruKodeInput.trim() })
        .eq('id', selectedGuruBeban.id)
      if (error) throw error
      alert('Kode guru utama berhasil disimpan.')
      
      setGurus(prev => prev.map(g => g.id === selectedGuruBeban.id ? { ...g, kode: guruKodeInput.trim() } : g))
      setSelectedGuruBeban(prev => ({ ...prev, kode: guruKodeInput.trim() }))
    } catch (err) {
      alert('Gagal menyimpan kode guru: ' + err.message)
    }
  }

  const getKelasKandidat = () => {
    if (!selectedGuruBeban || !bebanForm.mata_pelajaran_id) return []
    const kandidat = selectedGuruBeban.guru_mapel
      .filter(gm => 
        gm.tahun_ajaran_id === activeTa?.id && 
        gm.mata_pelajaran_id === bebanForm.mata_pelajaran_id
      )
      .map(gm => gm.kelas)
      .filter(Boolean)
    return [...new Set(kandidat)].sort()
  }

  const handleAddBeban = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !selectedGuruBeban || !bebanForm.mata_pelajaran_id) return
    setSaving(true)

    try {
      const targetClasses = selectedGuruBeban.guru_mapel
        .filter(gm => 
          gm.tahun_ajaran_id === activeTa.id && 
          gm.mata_pelajaran_id === bebanForm.mata_pelajaran_id
        )
        .map(gm => gm.kelas)
        .filter(Boolean)

      if (targetClasses.length === 0) {
        alert('Guru ini belum diset mengajar kelas mana pun untuk mapel terpilih di menu Manajemen Akun.')
        setSaving(false)
        return
      }

      const inserts = []
      targetClasses.forEach(cls => {
        // Simpan untuk Semester 1
        inserts.push({
          tahun_ajaran_id: activeTa.id,
          semester: 1,
          guru_id: selectedGuruBeban.id,
          mata_pelajaran_id: bebanForm.mata_pelajaran_id,
          kelas: cls,
          jam_per_minggu: parseInt(bebanForm.jam_per_minggu),
          maks_jam_per_hari: parseInt(bebanForm.maks_jam_per_hari),
          kode_guru: bebanForm.kode_guru ? bebanForm.kode_guru.trim() : null
        })
        // Simpan untuk Semester 2
        inserts.push({
          tahun_ajaran_id: activeTa.id,
          semester: 2,
          guru_id: selectedGuruBeban.id,
          mata_pelajaran_id: bebanForm.mata_pelajaran_id,
          kelas: cls,
          jam_per_minggu: parseInt(bebanForm.jam_per_minggu),
          maks_jam_per_hari: parseInt(bebanForm.maks_jam_per_hari),
          kode_guru: bebanForm.kode_guru ? bebanForm.kode_guru.trim() : null
        })
      })

      const { error } = await supabase
        .from('jadwal_beban_mengajar')
        .upsert(inserts, { onConflict: 'tahun_ajaran_id, semester, guru_id, mata_pelajaran_id, kelas' })
      
      if (error) throw error
      alert(`Berhasil menyimpan target beban mengajar untuk kelas: ${targetClasses.join(', ')}`)
      await fetchInitialData(true)
      
      setBebanForm({
        mata_pelajaran_id: '',
        jam_per_minggu: 2,
        maks_jam_per_hari: 2
      })
      setSelectedGuruBeban(null)
    } catch (error) {
      alert('Gagal menyimpan beban mengajar: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // PIKET & CATATAN & EKSKUL
  const handleAddPiket = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !piketFormGuruId) return
    setSaving(true)
    
    try {
      const lastUrutan = piketList.length > 0 ? Math.max(...piketList.map(p => p.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_piket')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          hari: activeHari,
          guru_id: piketFormGuruId,
          urutan: lastUrutan
        }])
      
      if (error) throw error
      await fetchInitialData(true)
      setPiketFormGuruId('')
    } catch (error) {
      alert('Gagal menambahkan piket: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePiket = async (id) => {
    try {
      await supabase.from('jadwal_piket').delete().eq('id', id)
      await fetchInitialData(true)
    } catch (error) {
      alert('Gagal menghapus piket: ' + error.message)
    }
  }

  const handleAddCatatan = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !newCatatan) return
    setSaving(true)

    try {
      const lastUrutan = catatanList.length > 0 ? Math.max(...catatanList.map(c => c.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_catatan')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          isi_catatan: newCatatan,
          urutan: lastUrutan
        }])
      if (error) throw error
      await fetchInitialData(true)
      setNewCatatan('')
    } catch (error) {
      alert('Gagal menyimpan catatan: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddEkskul = async (e) => {
    e.preventDefault()
    if (!activeTa?.id || !newEkskul.nama) return
    setSaving(true)

    try {
      const lastUrutan = ekskulList.length > 0 ? Math.max(...ekskulList.map(el => el.urutan)) + 1 : 0
      const { error } = await supabase
        .from('jadwal_ekskul')
        .insert([{
          tahun_ajaran_id: activeTa.id,
          semester: activeSemester,
          nama: newEkskul.nama,
          hari: newEkskul.hari,
          waktu: newEkskul.waktu,
          pembina: newEkskul.pembina,
          urutan: lastUrutan
        }])
      if (error) throw error
      await fetchInitialData(true)
      setNewEkskul({ nama: '', hari: 'Senin', waktu: '14:30 - 15:30', pembina: '' })
    } catch (error) {
      alert('Gagal menyimpan ekskul: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleClearJadwal = () => {
    setShowClearConfirmModal(true)
  }

  const executeClearJadwal = async () => {
    if (!activeTa?.id) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('jadwal_pelajaran')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)
      
      if (error) throw error
      await fetchDailyData(true)
    } catch (error) {
      alert('Gagal mengosongkan jadwal: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ALGORITMA AUTO-GENERATE JADWAL
  const handleAutoGenerateJadwal = async () => {
    if (!activeTa?.id) return
    if (bebanMengajar.length === 0) {
      alert('Silakan setup Target Beban Mengajar terlebih dahulu di tab sebelah.')
      return
    }

    if (!window.confirm('⚠️ Peringatan: Auto-generate akan menghapus seluruh jadwal reguler hari ini untuk digantikan dengan yang baru. Lanjutkan?')) return
    setLoading(true)

    try {
      const pelajaranSlots = slots.filter(s => s.tipe === 'pelajaran' && s.jam_ke !== null)
      if (pelajaranSlots.length === 0) {
        alert('Belum ada slot pelajaran reguler yang diset untuk hari ini. Silakan inisialisasi jam terlebih dahulu.')
        setLoading(false)
        return
      }

      await supabase
        .from('jadwal_pelajaran')
        .delete()
        .eq('tahun_ajaran_id', activeTa.id)
        .eq('semester', activeSemester)
        .eq('hari', activeHari)

      const localJadwals = []
      const bebanKerja = bebanMengajar.map(b => ({
        ...b,
        sisa_minggu: b.jam_per_minggu
      }))

      for (const slot of pelajaranSlots) {
        for (const cls of classes) {
          const kandidatBeban = bebanKerja
            .filter(b => b.kelas === cls && b.sisa_minggu > 0)
            .sort(() => Math.random() - 0.5)

          for (const beban of kandidatBeban) {
            const guruTabrakan = localJadwals.some(j => j.guru_id === beban.guru_id && j.jam_ke === slot.jam_ke)
            if (guruTabrakan) continue

            const jamHariIni = localJadwals.filter(j => j.kelas === cls && j.mata_pelajaran_id === beban.mata_pelajaran_id).length
            if (jamHariIni >= beban.maks_jam_per_hari) continue

            localJadwals.push({
              tahun_ajaran_id: activeTa.id,
              semester: activeSemester,
              hari: activeHari,
              kelas: cls,
              jam_ke: slot.jam_ke,
              waktu_mulai: slot.waktu_mulai,
              waktu_selesai: '00:00:00',
              guru_id: beban.guru_id,
              mata_pelajaran_id: beban.mata_pelajaran_id
            })

            beban.sisa_minggu--
            break
          }
        }
      }

      if (localJadwals.length > 0) {
        const { error } = await supabase.from('jadwal_pelajaran').insert(localJadwals)
        if (error) throw error
        alert(`Sukses generate otomatis ${localJadwals.length} jam pelajaran untuk hari ${activeHari}!`)
      } else {
        alert('Tidak ada slot pelajaran yang berhasil dipasangkan. Silakan periksa setup beban mengajar.')
      }

      await fetchInitialData()
    } catch (error) {
      alert('Gagal generate jadwal: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const getSisaBeban = () => {
    const res = []
    bebanMengajar.forEach(b => {
      const terjadwalCount = jadwals.filter(j => 
        j.guru_id === b.guru_id && 
        j.mata_pelajaran_id === b.mata_pelajaran_id && 
        j.kelas === b.kelas
      ).length

      const sisa = b.jam_per_minggu - terjadwalCount
      if (sisa > 0) {
        res.push({
          ...b,
          terjadwal: terjadwalCount,
          sisa
        })
      }
    })
    return res
  }

  const sisaBebanList = getSisaBeban()

  // Filter master gurus for reference sidebar
  const filteredGurus = gurus.filter(g => {
    if (!guruRefSearch.trim()) return true
    const searchVal = guruRefSearch.toLowerCase()
    
    // Check name
    const matchName = g.nama_guru?.toLowerCase().includes(searchVal)
    
    // Check teacher code in bebanMengajar or fallback
    const matchingBebans = bebanMengajar.filter(b => b.guru_id === g.id)
    const matchCode = matchingBebans.some(b => b.kode_guru?.toLowerCase().includes(searchVal)) || g.kode?.toLowerCase().includes(searchVal)
    
    // Check mapel name from Manajemen Akun settings (guru_mapel)
    const activeMapels = g.guru_mapel?.filter(gm => gm.tahun_ajaran_id === activeTa?.id) || []
    const matchMapel = activeMapels.some(gm => 
      gm.mata_pelajaran?.nama?.toLowerCase().includes(searchVal) || 
      gm.mata_pelajaran?.singkatan?.toLowerCase().includes(searchVal)
    )
    
    return matchName || matchCode || matchMapel
  })

  return (
    <div className="bg-slate-50 min-h-screen p-4 text-slate-800">
      <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        
        {/* Header Panel */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <span className="bg-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-indigo-500/20">
              Kurikulum & Akademik
            </span>
            <h1 className="text-2xl font-black mt-2 tracking-tight">Jadwal Pelajaran Mingguan</h1>
            <p className="text-indigo-200 text-sm mt-1">
              Tahun Ajaran: <span className="font-semibold text-white">{activeTa?.nama || 'Belum Aktif'}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button 
                onClick={() => setActiveSemester(1)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeSemester === 1 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Semester 1
              </button>
              <button 
                onClick={() => setActiveSemester(2)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeSemester === 2 ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Semester 2
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 bg-slate-50 flex overflow-x-auto">
          <button 
            onClick={() => setActiveTab('grid')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'grid' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📅 Grid Jadwal
          </button>
          <button 
            onClick={() => setActiveTab('beban')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'beban' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            ⚙️ Target Beban Mengajar
          </button>
          <button 
            onClick={() => setActiveTab('catatan_ekskul')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'catatan_ekskul' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📝 Catatan & Ekskul
          </button>
          <button 
            onClick={() => setActiveTab('import')}
            className={`px-6 py-4 text-xs font-bold uppercase tracking-wider border-b-2 shrink-0 transition-colors ${
              activeTab === 'import' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📥 Import Excel
          </button>
        </div>

        {/* Contents */}
        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-indigo-600 mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-semibold">Menghubungkan ke database...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: GRID JADWAL */}
              {activeTab === 'grid' && (
                <div>
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                    {/* Hari Selector */}
                    <div className="flex gap-1 overflow-x-auto pb-1 bg-slate-100 p-1 rounded-xl">
                      {HARI_LIST.map(hari => (
                        <button
                          key={hari}
                          onClick={() => setActiveHari(hari)}
                          className={`px-5 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                            activeHari === hari ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {hari}
                        </button>
                      ))}
                    </div>

                    {slots.length > 0 && (
                      <div className="flex items-center gap-2 w-full lg:w-auto">
                        <button
                          onClick={handleAutoGenerateJadwal}
                          className="flex-1 lg:flex-initial px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                          🎲 Generate Otomatis
                        </button>
                        <button
                          onClick={() => {
                            setJamForm({
                              id: '',
                              tipe: 'pelajaran',
                              label: '',
                              jam_ke: '',
                              durasi_menit: 40,
                              keterangan_blok: '',
                              waktu_mulai: ''
                            })
                            setShowJamModal(true)
                          }}
                          className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          ➕ Tambah Jam/Istirahat
                        </button>
                        <button
                          onClick={handleClearJadwal}
                          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          🧹 Kosongkan Jadwal
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                        >
                          🖨️ Cetak Jadwal
                        </button>
                      </div>
                    )}
                  </div>

                  {slots.length === 0 ? (
                    /* FORM INISIALISASI AWAL JADWAL HARI */
                    <div className="max-w-xl mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-3xl">🗓️</span>
                        <div>
                          <h3 className="font-black text-slate-800 text-lg">Inisialisasi Jam Pelajaran Hari {activeHari}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Tentukan jam pelajaran, durasi, dan waktu istirahat untuk memunculkan tabel grid.</p>
                        </div>
                      </div>

                      <form onSubmit={handleInitializeSlots} className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1.5">Mulai Jam Pelajaran</label>
                            <input 
                              type="time"
                              required
                              value={initForm.start_time}
                              onChange={e => setInitForm(prev => ({ ...prev, start_time: e.target.value }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1.5">Dimulai Dari Jam Ke</label>
                            <select
                              value={initForm.start_jam_ke}
                              onChange={e => setInitForm(prev => ({ ...prev, start_jam_ke: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white"
                            >
                              <option value="0">Jam Ke-0 (Persiapan KBM)</option>
                              <option value="1">Jam Ke-I</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1.5">Total Jam Pelajaran</label>
                            <input 
                              type="number"
                              required
                              min="1"
                              max="12"
                              value={initForm.total_jam}
                              onChange={e => setInitForm(prev => ({ ...prev, total_jam: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1.5">Jumlah Istirahat</label>
                            <select
                              value={initForm.total_istirahat}
                              onChange={e => setInitForm(prev => ({ ...prev, total_istirahat: parseInt(e.target.value) }))}
                              className="w-full px-3 py-2 border rounded-xl bg-white"
                            >
                              <option value="0">Tidak Ada</option>
                              <option value="1">1 Kali Istirahat</option>
                              <option value="2">2 Kali Istirahat</option>
                            </select>
                          </div>
                        </div>

                        <div className="border-t pt-4 space-y-3">
                          <h4 className="font-bold text-slate-700">Durasi (Menit)</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-slate-500 mb-1">KBM Reguler</label>
                              <input 
                                type="number"
                                required
                                min="5"
                                value={initForm.durasi_pelajaran}
                                onChange={e => setInitForm(prev => ({ ...prev, durasi_pelajaran: parseInt(e.target.value) }))}
                                className="w-full px-3 py-1.5 border rounded-xl bg-white"
                              />
                            </div>
                            {initForm.total_istirahat >= 1 && (
                              <div>
                                <label className="block text-slate-500 mb-1">Istirahat 1</label>
                                <input 
                                  type="number"
                                  required
                                  min="5"
                                  value={initForm.durasi_istirahat_1}
                                  onChange={e => setInitForm(prev => ({ ...prev, durasi_istirahat_1: parseInt(e.target.value) }))}
                                  className="w-full px-3 py-1.5 border rounded-xl bg-white"
                                />
                              </div>
                            )}
                            {initForm.total_istirahat >= 2 && (
                              <div>
                                <label className="block text-slate-500 mb-1">Istirahat 2</label>
                                <input 
                                  type="number"
                                  required
                                  min="5"
                                  value={initForm.durasi_istirahat_2}
                                  onChange={e => setInitForm(prev => ({ ...prev, durasi_istirahat_2: parseInt(e.target.value) }))}
                                  className="w-full px-3 py-1.5 border rounded-xl bg-white"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={saving}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 mt-4"
                        >
                          {saving ? 'Menyimpan...' : 'Simpan & Terapkan Jam'}
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Grid Tabel Utama */}
                      <div className="flex-1 overflow-x-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
                        <table className="w-full border-collapse text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                              <th className="p-3 text-center w-12 border-r border-slate-100">Reorder</th>
                              <th className="p-3 text-center w-12 border-r border-slate-100">Jam</th>
                              <th className="p-3 text-center w-28 border-r border-slate-100">Waktu</th>
                              {classes.map(cls => (
                                <th key={cls} className="p-3 text-center border-r border-slate-100 min-w-[90px]">{cls}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {slots.map((slot, index) => {
                              const startTime = slot.waktu_mulai.slice(0, 5)
                              const [h, m] = startTime.split(':').map(Number)
                              let endM = m + slot.durasi_menit
                              let endH = h + Math.floor(endM / 60)
                              endM = endM % 60
                              const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

                              if (slot.tipe !== 'pelajaran') {
                                return (
                                  <tr key={slot.id} className="bg-slate-100 font-bold text-slate-600 hover:bg-slate-150 transition-colors">
                                    <td className="p-3 text-center border-r border-slate-200">
                                      <div className="flex flex-col gap-1 items-center justify-center">
                                        <button disabled={index === 0} onClick={() => handleMoveSlot(index, 'up')} className="hover:scale-125 disabled:opacity-20 text-[10px]" title="Naik">🔼</button>
                                        <button disabled={index === slots.length - 1} onClick={() => handleMoveSlot(index, 'down')} className="hover:scale-125 disabled:opacity-20 text-[10px]" title="Turun">🔽</button>
                                        <button onClick={() => handleDeleteSlot(slot.id)} className="hover:scale-125 text-[10px] mt-1 text-red-500 font-bold" title="Hapus Baris">❌</button>
                                      </div>
                                    </td>
                                    <td className="p-3.5 text-center border-r border-slate-200">{slot.label}</td>
                                    
                                    <td 
                                      onClick={() => {
                                        setJamForm({
                                          id: slot.id,
                                          tipe: slot.tipe,
                                          label: slot.label,
                                          jam_ke: slot.jam_ke || '',
                                          durasi_menit: slot.durasi_menit,
                                          keterangan_blok: slot.keterangan_blok || '',
                                          waktu_mulai: startTime // Simpan waktu_mulai jika index 0 agar bisa diubah
                                        })
                                        setShowJamModal(true)
                                      }}
                                      className="p-3 text-right border-r border-slate-200 text-slate-500 font-medium cursor-pointer hover:bg-slate-100 hover:text-indigo-600 transition-all font-mono whitespace-nowrap"
                                    >
                                      <div className="select-none">
                                        <span className="font-bold text-[11px]">{startTime} - {endTime}</span>
                                        <span className="text-[8px] text-slate-400 font-light ml-1">({slot.durasi_menit}m)✏️</span>
                                      </div>
                                    </td>

                                    <td colSpan={classes.length} className="p-3.5 text-center bg-indigo-50/30 text-indigo-900 border-r border-slate-200">
                                      <div className="flex items-center justify-center gap-2">
                                        <span>🛡️ {slot.keterangan_blok || slot.label}</span>
                                        <button
                                          onClick={() => {
                                            setSelectedCell({
                                              slotId: slot.id,
                                              jam_ke: slot.jam_ke,
                                              waktu_mulai: slot.waktu_mulai,
                                              waktu_selesai: endTime
                                            })
                                            setCellForm({
                                              id: '',
                                              guru_id: '',
                                              mata_pelajaran_id: '',
                                              is_blok: true,
                                              keterangan_blok: slot.keterangan_blok || ''
                                            })
                                            setShowCellModal(true)
                                          }}
                                          className="text-xs text-indigo-600 hover:underline font-bold"
                                        >
                                          [Ubah Kegiatan]
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              }

                              return (
                                <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-3 text-center border-r border-slate-200">
                                    <div className="flex flex-col gap-1 items-center justify-center">
                                      <button disabled={index === 0} onClick={() => handleMoveSlot(index, 'up')} className="hover:scale-125 disabled:opacity-20 text-[10px]" title="Naik">🔼</button>
                                      <button disabled={index === slots.length - 1} onClick={() => handleMoveSlot(index, 'down')} className="hover:scale-125 disabled:opacity-20 text-[10px]" title="Turun">🔽</button>
                                      <button onClick={() => handleDeleteSlot(slot.id)} className="hover:scale-125 text-[10px] mt-1 text-red-500 font-bold" title="Hapus Baris">❌</button>
                                    </div>
                                  </td>
                                  <td className="p-3 text-center font-bold border-r border-slate-200 bg-slate-50/50 text-slate-500">{slot.label}</td>
                                  
                                  <td 
                                    onClick={() => {
                                      setJamForm({
                                        id: slot.id,
                                        tipe: slot.tipe,
                                        label: slot.label,
                                        jam_ke: slot.jam_ke || '',
                                        durasi_menit: slot.durasi_menit,
                                        keterangan_blok: slot.keterangan_blok || '',
                                        waktu_mulai: startTime // Simpan waktu_mulai jika index 0 agar bisa diubah
                                      })
                                      setShowJamModal(true)
                                    }}
                                    className="p-3 text-right border-r border-slate-200 text-slate-500 font-medium cursor-pointer hover:bg-slate-100 hover:text-indigo-600 transition-all font-mono whitespace-nowrap"
                                  >
                                    <div className="select-none">
                                      <span className="font-bold text-[11px]">{startTime} - {endTime}</span>
                                      <span className="text-[8px] text-slate-400 font-light ml-1">({slot.durasi_menit}m)✏️</span>
                                    </div>
                                  </td>
                                  
                                  {classes.map(cls => {
                                    const sched = jadwals.find(j => j.kelas === cls && j.jam_ke === slot.jam_ke)

                                    return (
                                      <td
                                        key={`${cls}-${slot.id}`}
                                        onClick={() => {
                                          setSelectedCell({
                                            kelas: cls,
                                            slotId: slot.id,
                                            slotLabel: slot.label,
                                            jam_ke: slot.jam_ke,
                                            waktu_mulai: slot.waktu_mulai,
                                            waktu_selesai: endTime
                                          })
                                          setCellForm({
                                            id: sched?.id || '',
                                            guru_id: sched?.guru_id || '',
                                            mata_pelajaran_id: sched?.mata_pelajaran_id || '',
                                            is_blok: false,
                                            keterangan_blok: ''
                                          })
                                          setShowCellModal(true)
                                        }}
                                        className={`p-2 border-r border-slate-200 text-center cursor-pointer hover:bg-indigo-50/20 transition-all ${
                                          sched ? 'bg-white font-medium shadow-sm' : 'bg-slate-50/20 text-slate-300'
                                        }`}
                                      >
                                        {sched ? (
                                          <div className="flex flex-col items-center justify-center gap-0.5">
                                            <span className="font-extrabold text-slate-900 text-xs font-mono select-none">
                                              {(() => {
                                                const matchBeban = bebanMengajar.find(b => 
                                                  b.guru_id === sched.guru_id && 
                                                  b.mata_pelajaran_id === sched.mata_pelajaran_id
                                                )
                                                return matchBeban?.kode_guru || sched.guru?.kode || sched.guru?.nama_guru?.split(',')[0]
                                              })()}
                                            </span>
                                            <span className="text-[9px] text-indigo-700 bg-indigo-50 font-bold px-1.5 py-0.5 rounded border border-indigo-100">
                                              {sched.mata_pelajaran?.singkatan || sched.mata_pelajaran?.nama}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-[9px] font-medium text-slate-300 hover:text-indigo-600">+ Isi</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Sidebar Piket (Kanan) */}
                      <div className="w-full lg:w-72 bg-slate-50 border border-slate-200 rounded-2xl p-4 shrink-0 shadow-sm text-xs">
                        <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3">
                          👮 Guru Piket ({activeHari})
                        </h3>
                        
                        <form onSubmit={handleAddPiket} className="flex gap-2 mb-4">
                          <select
                            required
                            value={piketFormGuruId}
                            onChange={e => setPiketFormGuruId(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-xl bg-white"
                          >
                            <option value="">-- Pilih Guru --</option>
                            {gurus.map(g => (
                              <option key={g.id} value={g.id}>{g.nama_guru.split(',')[0]}</option>
                            ))}
                          </select>
                          <button type="submit" className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow">
                            +
                          </button>
                        </form>

                        <div className="space-y-2">
                          {piketList.length === 0 ? (
                            <p className="text-slate-400 italic">Belum ada guru piket.</p>
                          ) : (
                            piketList.map((p, idx) => (
                              <div key={p.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <span className="font-bold text-slate-700">{idx + 1}. {p.guru?.nama_guru.split(',')[0]}</span>
                                <button 
                                  onClick={() => handleRemovePiket(p.id)}
                                  className="text-red-500 hover:text-red-700 font-bold text-xs"
                                >
                                  ✕
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Collapsible Guru & Kode Reference */}
                        <div className="border-t border-slate-200 mt-6 pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                              📋 Daftar Guru & Kode
                            </h3>
                            <button 
                              type="button"
                              onClick={() => setShowGuruRef(!showGuruRef)}
                              className="text-[10px] text-indigo-600 font-bold hover:underline"
                            >
                              {showGuruRef ? 'Sembunyikan' : 'Tampilkan'}
                            </button>
                          </div>
                          
                          {showGuruRef && (
                            <div className="space-y-2.5">
                              <input 
                                type="text"
                                placeholder="Cari guru / kode / mapel..."
                                value={guruRefSearch}
                                onChange={e => setGuruRefSearch(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                                {filteredGurus.length === 0 ? (
                                  <p className="text-slate-400 italic text-center py-2 text-[10px]">Tidak ditemukan.</p>
                                ) : (
                                  filteredGurus.map(g => {
                                    const matchingBebans = bebanMengajar.filter(b => b.guru_id === g.id)
                                    // Use set key code_guru first or fallback to database model guru.kode
                                    const code = matchingBebans.find(b => b.kode_guru)?.kode_guru || g.kode || '-'
                                    
                                    // Fetch mapel assignment directly from Manajemen Akun settings (guru_mapel)
                                    const activeMapels = g.guru_mapel?.filter(gm => gm.tahun_ajaran_id === activeTa?.id) || []
                                    const uniqueMapels = [...new Set(activeMapels.map(gm => gm.mata_pelajaran?.singkatan || gm.mata_pelajaran?.nama).filter(Boolean))]
                                    
                                    return (
                                      <div key={g.id} className="p-2 bg-white border border-slate-150 rounded-xl flex flex-col gap-1 shadow-xs hover:border-slate-300 transition-colors">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-bold text-slate-700 truncate max-w-[170px]" title={g.nama_guru}>
                                            {g.nama_guru.split(',')[0]}
                                          </span>
                                          <span className="font-mono font-black text-indigo-700 bg-indigo-50/80 border border-indigo-100/50 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                                            {code}
                                          </span>
                                        </div>
                                        {uniqueMapels.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {uniqueMapels.map((m, i) => (
                                              <span key={i} className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/50">{m}</span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[9px] text-slate-400 italic">Belum ada mapel di-set</span>
                                        )}
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TARGET BEBAN MENGAJAR (KLIK NAMA GURU DETAIL VIEW & WIDGET SISA) */}
              {activeTab === 'beban' && (
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Daftar Guru (Kiri) */}
                  <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 overflow-y-auto max-h-[70vh]">
                    <h3 className="font-bold text-sm text-slate-800 mb-3 border-b pb-2">👨‍🏫 Daftar Guru</h3>
                    <div className="space-y-1">
                      {gurus.map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleSelectGuruBeban(g)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                            selectedGuruBeban?.id === g.id 
                              ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600' 
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {g.nama_guru}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Form Beban & Status Sisa (Kanan) */}
                  <div className="flex-1 space-y-6">
                    {selectedGuruBeban ? (
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                        <div className="flex justify-between items-start border-b pb-4 mb-4">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Set Beban Mengajar</span>
                            <h3 className="font-black text-lg text-slate-800 mt-1">{selectedGuruBeban.nama_guru}</h3>
                          </div>
                          <button 
                            onClick={() => setSelectedGuruBeban(null)}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            Tutup
                          </button>
                        </div>

                        {/* Form input */}
                        <form onSubmit={handleAddBeban} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">Mata Pelajaran</label>
                            {guruBebanMapels.length > 1 ? (
                              <select
                                required
                                value={bebanForm.mata_pelajaran_id}
                                onChange={e => handleMapelChange(e.target.value)}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-semibold text-slate-800"
                              >
                                <option value="">-- Pilih Mapel --</option>
                                {guruBebanMapels.map(m => (
                                  <option key={m.id} value={m.id}>{m.nama}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="px-3 py-2 border rounded-xl bg-slate-50 text-xs font-bold text-slate-700">
                                {guruBebanMapels[0]?.nama || 'Mapel tidak diset'}
                              </div>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">Target Kelas</label>
                            <div className="px-3 py-2 border rounded-xl bg-slate-50 text-xs font-bold text-slate-700 truncate">
                              {getKelasKandidat().length > 0 ? getKelasKandidat().join(', ') : 'Belum diset di manajemen akun'}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">Jam/Minggu</label>
                              <input 
                                type="number" 
                                required 
                                min="1" 
                                value={bebanForm.jam_per_minggu}
                                onChange={e => setBebanForm(prev => ({ ...prev, jam_per_minggu: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white text-center font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 mb-2">Maks/Hari</label>
                              <input 
                                type="number" 
                                required 
                                min="1" 
                                value={bebanForm.maks_jam_per_hari}
                                onChange={e => setBebanForm(prev => ({ ...prev, maks_jam_per_hari: parseInt(e.target.value) }))}
                                className="w-full px-3 py-2 border rounded-xl text-xs bg-white text-center font-bold"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">Kode Cetak Guru</label>
                            <input 
                              type="text"
                              required
                              placeholder="Misal: 8.1"
                              value={bebanForm.kode_guru}
                              onChange={e => setBebanForm(prev => ({ ...prev, kode_guru: e.target.value }))}
                              className="w-full px-3 py-2 border rounded-xl text-xs bg-white font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <button 
                            type="submit" 
                            disabled={saving || getKelasKandidat().length === 0}
                            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-all active:scale-95"
                          >
                            + Terapkan Beban
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-center text-indigo-900/60 font-medium">
                        👈 Silakan pilih nama guru di panel kiri untuk setup target beban mengajar.
                      </div>
                    )}

                    {/* Widget Sisa Jam Belum Terjadwal */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                      <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                        ⚠️ Sisa Jam Beban Belum Terjadwal
                      </h3>

                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <tr>
                              <th className="p-3 font-semibold">Nama Guru</th>
                              <th className="p-3 font-semibold">Mapel</th>
                              <th className="p-3 font-semibold">Kelas</th>
                              <th className="p-3 text-center">Target Beban</th>
                              <th className="p-3 text-center">Terjadwal</th>
                              <th className="p-3 text-center">Sisa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sisaBebanList.length === 0 ? (
                              <tr>
                                <td colSpan="6" className="p-6 text-center text-green-600 font-bold">🎉 Semua beban mengajar guru telah sukses dijadwalkan!</td>
                              </tr>
                            ) : (
                              sisaBebanList.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-medium text-slate-700">{item.guru?.nama_guru.split(',')[0]}</td>
                                  <td className="p-3 text-slate-600">{item.mata_pelajaran?.nama}</td>
                                  <td className="p-3 font-mono">{item.kelas}</td>
                                  <td className="p-3 text-center">{item.jam_per_minggu} jam</td>
                                  <td className="p-3 text-center">{item.terjadwal} jam</td>
                                  <td className="p-3 text-center">
                                    <span className="px-2 py-0.5 bg-red-50 text-red-700 font-black rounded-md border border-red-100 text-[10px]">
                                      {item.sisa} jam lagi
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CATATAN & EKSKUL */}
              {activeTab === 'catatan_ekskul' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-800 mb-4">📝 Catatan Kurikulum</h3>
                    
                    <form onSubmit={handleAddCatatan} className="flex gap-2 mb-4">
                      <input 
                        type="text"
                        required
                        value={newCatatan}
                        onChange={e => setNewCatatan(e.target.value)}
                        placeholder="Ketik catatan baru..."
                        className="flex-1 px-3 py-2 border rounded-xl text-xs"
                      />
                      <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow">
                        Simpan
                      </button>
                    </form>

                    <div className="space-y-2">
                      {catatanList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Belum ada catatan.</p>
                      ) : (
                        catatanList.map((c, index) => (
                          <div key={c.id} className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700">{index + 1}. {c.isi_catatan}</span>
                            <button 
                              onClick={async () => {
                                await supabase.from('jadwal_catatan').delete().eq('id', c.id)
                                await fetchInitialData(true)
                              }}
                              className="text-red-500 hover:text-red-700 font-bold ml-2 shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-bold text-sm text-slate-800 mb-4">🏀 Jadwal Ekskul</h3>

                    <form onSubmit={handleAddEkskul} className="grid grid-cols-2 gap-3 mb-6 bg-slate-50 p-3 rounded-xl border text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nama Kegiatan</label>
                        <input 
                          type="text"
                          required
                          value={newEkskul.nama}
                          onChange={e => setNewEkskul(prev => ({ ...prev, nama: e.target.value }))}
                          placeholder="Misal: Pramuka, Basket"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hari</label>
                        <select
                          value={newEkskul.hari}
                          onChange={e => setNewEkskul(prev => ({ ...prev, hari: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        >
                          {HARI_LIST.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Waktu</label>
                        <input 
                          type="text"
                          required
                          value={newEkskul.waktu}
                          onChange={e => setNewEkskul(prev => ({ ...prev, waktu: e.target.value }))}
                          placeholder="Misal: 14:30 - 15:30"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pembina/Pelatih</label>
                        <input 
                          type="text"
                          value={newEkskul.pembina}
                          onChange={e => setNewEkskul(prev => ({ ...prev, pembina: e.target.value }))}
                          placeholder="Nama Pembina"
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                        />
                      </div>
                      <button type="submit" className="col-span-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow mt-2">
                        + Tambah Ekskul
                      </button>
                    </form>

                    <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="p-3 font-semibold">Nama</th>
                            <th className="p-3 font-semibold">Hari & Waktu</th>
                            <th className="p-3 font-semibold">Pembina</th>
                            <th className="p-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ekskulList.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-4 text-center text-slate-400 italic">Belum ada ekskul.</td>
                            </tr>
                          ) : (
                            ekskulList.map(el => (
                              <tr key={el.id}>
                                <td className="p-3 font-bold">{el.nama}</td>
                                <td className="p-3">{el.hari}, {el.waktu}</td>
                                <td className="p-3">{el.pembina || '-'}</td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={async () => {
                                      await supabase.from('jadwal_ekskul').delete().eq('id', el.id)
                                      await fetchInitialData(true)
                                    }}
                                    className="text-red-500 hover:text-red-700 font-bold"
                                  >
                                    Hapus
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: IMPORT EXCEL */}
              {activeTab === 'import' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-2">📥 Import Jadwal Pelajaran (Excel)</h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Unggah berkas Excel jadwal sekolah. Sistem otomatis membaca sheet <strong className="text-slate-800">"CETAK JADWAL SM-2"</strong>, memetakan kode guru desimal (misal 8.1 untuk guru 8 mengajar PSBM), serta mengimpor guru piket, catatan, dan ekskul secara instan.
                  </p>

                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors flex flex-col items-center justify-center">
                    <svg className="w-12 h-12 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                    
                    <input 
                      type="file" 
                      id="excel-upload"
                      accept=".xlsx, .xls"
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files[0]
                        if (!file) return
                        setSaving(true)
                        
                        try {
                          const reader = new FileReader()
                          reader.onload = async (evt) => {
                            try {
                              const bstr = evt.target.result
                              const wb = XLSX.read(bstr, { type: 'binary' })
                              const sheetName = wb.SheetNames.find(s => s.toUpperCase().includes('CETAK'))
                              
                              if (!sheetName) {
                                alert('Sheet "CETAK JADWAL" tidak ditemukan di berkas Excel.')
                                setSaving(false)
                                return
                              }

                              const ws = wb.Sheets[sheetName]
                              const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
                              
                              let totalParsedCount = 0
                              const allImports = []
                              const allExtractedSlots = []
                              
                              let cellsChecked = 0
                              const unmatchedCodes = new Set()
                              const unmatchedMapels = new Set()
                              const importedDays = []

                              const HARI_MAP = {
                                'Senin': 'SENIN',
                                'Selasa': 'SELASA',
                                'Rabu': 'RABU',
                                'Kamis': 'KAMIS',
                                'Jumat': 'JUMAT',
                                'Sabtu': 'SABTU'
                              }

                              for (const [hariName, targetLabel] of Object.entries(HARI_MAP)) {
                                let dayRowIdx = -1;
                                let dayColIdx = -1;

                                for (let r = 0; r < data.length; r++) {
                                  const row = data[r];
                                  for (let c = 0; c < row.length; c++) {
                                    const val = String(row[c]).toUpperCase().trim();
                                    if (val === targetLabel) {
                                      dayRowIdx = r;
                                      dayColIdx = c;
                                      break;
                                    }
                                  }
                                  if (dayRowIdx !== -1) break;
                                }

                                if (dayRowIdx === -1) continue;
                                importedDays.push(hariName);

                                let headerRowIdx = -1;
                                for (let r = dayRowIdx + 1; r < Math.min(dayRowIdx + 5, data.length); r++) {
                                  const row = data[r];
                                  const val1 = String(row[dayColIdx]).toLowerCase().trim();
                                  const val2 = String(row[dayColIdx + 1]).toLowerCase().trim();
                                  if (val1 === 'jam' || val2 === 'jam') {
                                    headerRowIdx = r;
                                    break;
                                  }
                                }

                                if (headerRowIdx === -1) continue;

                                const headerRow = data[headerRowIdx];
                                let jamColIdx = -1;
                                let waktuColIdx = -1;
                                const classCols = {};

                                if (String(headerRow[dayColIdx]).toLowerCase().trim() === 'jam') {
                                  jamColIdx = dayColIdx;
                                } else if (String(headerRow[dayColIdx + 1]).toLowerCase().trim() === 'jam') {
                                  jamColIdx = dayColIdx + 1;
                                }

                                if (String(headerRow[jamColIdx + 1]).toLowerCase().trim() === 'waktu') {
                                  waktuColIdx = jamColIdx + 1;
                                } else if (String(headerRow[jamColIdx + 2]).toLowerCase().trim() === 'waktu') {
                                  waktuColIdx = jamColIdx + 2;
                                }

                                if (jamColIdx === -1 || waktuColIdx === -1) continue;

                                for (let c = waktuColIdx + 1; c < headerRow.length; c++) {
                                  const val = String(headerRow[c]).trim();
                                  if (!val) {
                                    if (!headerRow[c+1] && !headerRow[c+2]) break;
                                    continue;
                                  }
                                  if (val.toLowerCase() === 'jam' || val.toLowerCase() === 'waktu' || val.toLowerCase() === 'guru piket') {
                                    break;
                                  }
                                  if (classes.includes(val)) {
                                    classCols[c] = val;
                                  }
                                }

                                const daySlots = [];
                                for (let r = headerRowIdx + 1; r < data.length; r++) {
                                  const row = data[r];
                                  if (!row || row.length === 0) continue;

                                  const jamLabel = row[jamColIdx] ? String(row[jamColIdx]).trim() : '';
                                  const waktuStr = row[waktuColIdx] ? String(row[waktuColIdx]).trim() : '';

                                  const isNewDayRow = String(row[dayColIdx]).toUpperCase().trim();
                                  const isNewDaySecond = String(row[dayColIdx + 1]).toUpperCase().trim();
                                  if (isNewDayRow && Object.values(HARI_MAP).includes(isNewDayRow) && r > headerRowIdx + 2) break;
                                  if (isNewDaySecond && Object.values(HARI_MAP).includes(isNewDaySecond) && r > headerRowIdx + 2) break;

                                  if (!jamLabel && !waktuStr) {
                                    const nextRow = data[r+1];
                                    const nextJam = nextRow && nextRow[jamColIdx] ? String(nextRow[jamColIdx]).trim() : '';
                                    if (!nextJam) break;
                                    continue;
                                  }

                                  if (!waktuStr) continue;

                                  // Skip or break if encountering bottom notes / non-time content
                                  const cleanWaktu = waktuStr.toLowerCase().trim();
                                  if (
                                    cleanWaktu.includes('catatan') || 
                                    cleanWaktu.includes('piket') || 
                                    cleanWaktu.includes('ekskul') || 
                                    cleanWaktu.includes('ekstra') || 
                                    cleanWaktu.startsWith('*') ||
                                    (!cleanWaktu.includes('-') && !/\d/.test(cleanWaktu))
                                  ) {
                                    break; // Stop parsing for this day as we have reached bottom notes
                                  }

                                  const times = waktuStr.split('-').map(t => t.trim().replace('.', ':'));
                                  const startStr = times[0] || '00:00';
                                  const endStr = times[1] || '00:00';

                                  // Regex verification to prevent any illegal DB inserts
                                  const timePartRegex = /^([0-1]?[0-9]|2[0-3])[:.][0-5][0-9]$/;
                                  if (!timePartRegex.test(startStr) && !timePartRegex.test(endStr)) {
                                    continue; // Skip invalid non-time formats safely
                                  }

                                  const startTime = `${startStr.replace('.', ':')}:00`;
                                  const [startH, startM] = startStr.replace('.', ':').split(':').map(Number);
                                  const [endH, endM] = endStr.replace('.', ':').split(':').map(Number);
                                  const duration = (endH * 60 + endM) - (startH * 60 + startM);

                                  const firstClassColIdx = Object.keys(classCols)[0];
                                  const ketPelajaran = row[firstClassColIdx] ? String(row[firstClassColIdx]).toUpperCase() : '';
                                  
                                  let tipe = 'pelajaran';
                                  let label = jamLabel;
                                  let jamKeVal = null;

                                  if (ketPelajaran && (
                                    ketPelajaran.includes('ISTIRAHAT') || 
                                    ketPelajaran.includes('PRAMUKA') || 
                                    ketPelajaran.includes('UPACARA') || 
                                    ketPelajaran.includes('PERSIAPAN') || 
                                    ketPelajaran.includes('DOA') || 
                                    ketPelajaran.includes('GLS') || 
                                    ketPelajaran.includes('IBADAT') || 
                                    ketPelajaran.includes('PULANG') || 
                                    ketPelajaran.includes('BERSIH KELAS')
                                  )) {
                                    const rawVal = row[firstClassColIdx] ? String(row[firstClassColIdx]).trim() : '';
                                    label = rawVal;
                                    if (rawVal.toUpperCase().includes('ISTIRAHAT')) tipe = 'istirahat';
                                    else if (rawVal.toUpperCase().includes('PERSIAPAN') || rawVal.toUpperCase().includes('DOA') || rawVal.toUpperCase().includes('GLS')) tipe = 'persiapan';
                                    else if (rawVal.toUpperCase().includes('IBADAT') || rawVal.toUpperCase().includes('UPACARA')) tipe = 'blok_khusus';
                                    else if (rawVal.toUpperCase().includes('BERSIH KELAS') || rawVal.toUpperCase().includes('PULANG')) tipe = 'penutup';
                                  } else {
                                    if (jamLabel === 'I') jamKeVal = 1;
                                    else if (jamLabel === 'II') jamKeVal = 2;
                                    else if (jamLabel === 'III') jamKeVal = 3;
                                    else if (jamLabel === 'IV') jamKeVal = 4;
                                    else if (jamLabel === 'V') jamKeVal = 5;
                                    else if (jamLabel === 'VI') jamKeVal = 6;
                                    else if (jamLabel === 'VII') jamKeVal = 7;
                                    else if (jamLabel === 'VIII') jamKeVal = 8;
                                    else if (jamLabel === 'IX') jamKeVal = 9;
                                    else if (jamLabel === 'X') jamKeVal = 10;
                                    else if (jamLabel === '0' || jamLabel === 0 || jamLabel.includes('0')) jamKeVal = 0;
                                  }

                                  daySlots.push({
                                    tahun_ajaran_id: activeTa.id,
                                    semester: activeSemester,
                                    hari: hariName,
                                    jam_ke: jamKeVal,
                                    label: label || (tipe === 'pelajaran' ? `Jam ${jamKeVal}` : 'Kegiatan'),
                                    waktu_mulai: startTime,
                                    durasi_menit: duration > 0 ? duration : 40,
                                    tipe,
                                    urutan: daySlots.length + 1
                                  });

                                  if (tipe !== 'pelajaran' || jamKeVal === null) continue;

                                  Object.keys(classCols).forEach(colIdx => {
                                    const cellVal = row[colIdx];
                                    const className = classCols[colIdx];
                                    if (cellVal && cellVal !== 'x' && cellVal !== 'X' && String(cellVal).trim() !== '') {
                                      cellsChecked++;
                                      const valStr = String(cellVal).trim();
                                      const parts = valStr.split('.');
                                      const guruKode = parts[0].trim();
                                      const isPsbm = parts[1] === '1';

                                      const matchedGuru = gurus.find(g => String(g.kode).trim() === String(guruKode));
                                      let matchedMapel = null;
                                      
                                      if (matchedGuru) {
                                        const mapelId = isPsbm 
                                          ? mapels.find(m => m.singkatan?.toUpperCase() === 'PSBM' || m.nama?.toUpperCase() === 'PSBM')?.id
                                          : (matchedGuru.guru_mapel && matchedGuru.guru_mapel[0]?.mata_pelajaran_id);
                                        matchedMapel = mapels.find(m => m.id === mapelId);
                                        if (!matchedMapel) unmatchedMapels.add(matchedGuru.nama_guru || 'Guru Tanpa Nama');
                                      } else {
                                        unmatchedCodes.add(guruKode);
                                      }

                                      if (matchedGuru && matchedMapel) {
                                        allImports.push({
                                          tahun_ajaran_id: activeTa.id,
                                          semester: activeSemester,
                                          hari: hariName,
                                          kelas: className,
                                          jam_ke: jamKeVal,
                                          waktu_mulai: startTime,
                                          waktu_selesai: '00:00:00',
                                          guru_id: matchedGuru.id,
                                          mata_pelajaran_id: matchedMapel.id
                                        });
                                        totalParsedCount++;
                                      }
                                    }
                                  });
                                }
                                allExtractedSlots.push(...daySlots);
                              }

                              if (allImports.length > 0 || allExtractedSlots.length > 0) {
                                await supabase.from('jadwal_slot_waktu').delete().eq('tahun_ajaran_id', activeTa.id).eq('semester', activeSemester).in('hari', importedDays);
                                if (allExtractedSlots.length > 0) {
                                  const { error: slotErr } = await supabase.from('jadwal_slot_waktu').insert(allExtractedSlots);
                                  if (slotErr) throw slotErr;
                                }

                                await supabase.from('jadwal_pelajaran').delete().eq('tahun_ajaran_id', activeTa.id).eq('semester', activeSemester).in('hari', importedDays);
                                if (allImports.length > 0) {
                                  const { error } = await supabase.from('jadwal_pelajaran').insert(allImports);
                                  if (error) throw error;
                                }

                                alert(`✅ Sukses mengimpor ${totalParsedCount} slot pelajaran & slot waktu untuk hari: ${importedDays.join(', ')} dari Excel!`);
                                await fetchInitialData();
                                setActiveTab('grid');
                              } else {
                                let errMsg = 'Tidak ada data jadwal valid yang berhasil diekstraksi dari file Excel.\n\n';
                                if (cellsChecked === 0) errMsg += 'Detail: Seluruh kotak jadwal kosong atau berisi penanda "x" / "X".';
                                else {
                                  errMsg += `Detail: Berhasil membaca ${cellsChecked} kotak jadwal dari Excel, namun tidak cocok dengan data guru/mapel di database.\n\n`;
                                  if (unmatchedCodes.size > 0) errMsg += `• Kode Guru di Excel berikut tidak terdaftar di database: ${Array.from(unmatchedCodes).join(', ')}\n\n`;
                                  if (unmatchedMapels.size > 0) errMsg += `• Guru berikut terdaftar tetapi tidak memiliki Mata Pelajaran di Manajemen Akun: ${Array.from(unmatchedMapels).join(', ')}\n`;
                                }
                                alert(errMsg);
                              }
                            } catch (err) {
                              alert('Gagal memproses file: ' + err.message)
                            } finally {
                              setSaving(false)
                            }
                          }
                          reader.readAsBinaryString(file)
                        } catch (err) {
                          alert('Gagal mengunggah file: ' + err.message)
                          setSaving(false)
                        }
                      }}
                    />
                    
                    <label 
                      htmlFor="excel-upload"
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      {saving ? 'Sedang Membaca...' : 'Pilih File Excel Jadwal'}
                    </label>
                    <span className="text-[10px] text-slate-400 mt-2">Dukungan format: .xlsx, .xls</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CELL MODAL (EDIT JADWAL REGULER & BLOK JAM) */}
      {showCellModal && selectedCell && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCell} className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-up overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-indigo-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Atur Slot Pelajaran</h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Hari {activeHari} • Kelas {selectedCell.kelas || 'Semua'} ({selectedCell.waktu_mulai.slice(0, 5)} - {selectedCell.waktu_selesai})
                </p>
              </div>
              <button type="button" onClick={() => setShowCellModal(false)} className="text-white hover:opacity-85 font-bold">✕</button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-2">
                <input 
                  type="checkbox"
                  id="is_blok"
                  checked={cellForm.is_blok}
                  onChange={e => setCellForm(prev => ({ ...prev, is_blok: e.target.checked }))}
                  className="rounded text-indigo-600 h-4 w-4"
                />
                <label htmlFor="is_blok" className="font-bold text-slate-700 select-none cursor-pointer">
                  Jadikan sebagai Blok Jam Pelajaran (Full Row / Baris Penuh)
                </label>
              </div>

              {cellForm.is_blok ? (
                <div>
                  <label className="block font-bold text-slate-500 mb-2">Nama Kegiatan Blok</label>
                  <input 
                    type="text"
                    required
                    value={cellForm.keterangan_blok}
                    onChange={e => setCellForm(prev => ({ ...prev, keterangan_blok: e.target.value }))}
                    placeholder="Misal: IBADAT / UPACARA, ISTIRAHAT"
                    className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block font-bold text-slate-500 mb-2">Mata Pelajaran</label>
                    <select
                      value={cellForm.mata_pelajaran_id}
                      onChange={e => setCellForm(prev => ({ ...prev, mata_pelajaran_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                    >
                      <option value="">-- Pilih Mapel --</option>
                      {mapels.map(m => (
                        <option key={m.id} value={m.id}>{m.nama} ({m.singkatan})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-500 mb-2">Guru Pengajar</label>
                    <select
                      value={cellForm.guru_id}
                      onChange={e => setCellForm(prev => ({ ...prev, guru_id: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                    >
                      <option value="">-- Pilih Guru --</option>
                      {gurus.map(g => (
                        <option key={g.id} value={g.id}>{g.nama_guru} {g.kode ? `[Kode ${g.kode}]` : ''}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
              {cellForm.id && (
                <button
                  type="button"
                  onClick={() => handleDeleteCell(cellForm.id)}
                  disabled={saving}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl transition-colors"
                >
                  Hapus
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowCellModal(false)}
                  className="px-4 py-2 border hover:bg-slate-100 text-xs font-bold rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* JAM MODAL (EDIT WAKTU & DURASI SLOT DARI GRID) */}
      {showJamModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveJamSlot} className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-up overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-indigo-900 text-white font-bold text-lg">
              Set Slot Jam Pelajaran
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Jika baris pertama (index 0 / urutan 0), perbolehkan ganti Waktu Mulai Awal */}
              {slots[0]?.id === jamForm.id && (
                <div>
                  <label className="block font-bold text-slate-500 mb-2">Waktu Mulai Awal Hari ({activeHari})</label>
                  <input 
                    type="time"
                    required
                    value={jamForm.waktu_mulai}
                    onChange={e => setJamForm(prev => ({ ...prev, waktu_mulai: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Mengubah waktu ini akan menggeser jam-jam setelahnya secara otomatis.</p>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-500 mb-2">Tipe Slot</label>
                <select
                  value={jamForm.tipe}
                  onChange={e => setJamForm(prev => ({ ...prev, tipe: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                >
                  <option value="pelajaran">Jam Pelajaran Reguler</option>
                  <option value="istirahat">Istirahat</option>
                  <option value="persiapan">Persiapan KBM (GLS / Doa)</option>
                  <option value="penutup">Penutup / Pulang</option>
                  <option value="blok_khusus">Blok Kegiatan Khusus</option>
                </select>
              </div>

              {jamForm.tipe === 'pelajaran' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-500 mb-2">Nomor Jam</label>
                    <input 
                      type="number"
                      required
                      placeholder="Contoh: 1"
                      value={jamForm.jam_ke}
                      onChange={e => setJamForm(prev => ({ ...prev, jam_ke: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-500 mb-2">Label Tampilan</label>
                    <input 
                      type="text"
                      required
                      placeholder="Contoh: I"
                      value={jamForm.label}
                      onChange={e => setJamForm(prev => ({ ...prev, label: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-xl text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-500 mb-2">Keterangan / Nama Kegiatan</label>
                  <input 
                    type="text"
                    required
                    placeholder="Contoh: ISTIRAHAT 1, UPACARA"
                    value={jamForm.keterangan_blok}
                    onChange={e => setJamForm(prev => ({ ...prev, keterangan_blok: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-500 mb-2">Durasi (Menit)</label>
                <input 
                  type="number"
                  required
                  min="5"
                  value={jamForm.durasi_menit}
                  onChange={e => setJamForm(prev => ({ ...prev, durasi_menit: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setShowJamModal(false)} className="px-4 py-2 border hover:bg-slate-100 font-bold rounded-xl">Batal</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-scale-in">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span className="text-3xl">⚠️</span>
              </div>
              <h3 className="text-lg font-black text-slate-800">Kosongkan Jadwal Pelajaran</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                Apakah Anda yakin ingin mengosongkan seluruh jadwal KBM untuk hari <span className="font-bold text-slate-900">{activeHari}</span> Semester <span className="font-bold text-slate-900">{activeSemester}</span>?
              </p>
              <div className="mt-3 bg-slate-50 p-3 rounded-xl border text-xs text-slate-500 font-medium text-left">
                💡 <span className="font-semibold text-slate-700">Catatan:</span> Slot waktu (KBM & Istirahat) tidak akan dihapus, melainkan hanya isi pelajaran (guru & mapel) yang dibersihkan.
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 text-xs">
              <button 
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 border bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl"
              >
                Batalkan
              </button>
              <button 
                onClick={async () => {
                  setShowClearConfirmModal(false)
                  await executeClearJadwal()
                }}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
