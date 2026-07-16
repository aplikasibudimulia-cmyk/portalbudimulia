import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

export default function GuruBKKonsultasiSection({ session }) {
  const [activeSubTab, setActiveSubTab] = useState('agenda') // 'agenda' atau 'slot'
  const [slotList, setSlotList] = useState([])
  const [bookingList, setBookingList] = useState([])
  const [pendingCount, setPendingCount] = useState(0) // Jumlah pengajuan yang menunggu persetujuan
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [dbError, setDbError] = useState(null)

  // Form Slot states
  const [hari, setHari] = useState('Senin')
  const [jamMulai, setJamMulai] = useState('')
  const [jamSelesai, setJamSelesai] = useState('')
  const [errorForm, setErrorForm] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Filter Agenda
  const [agendaFilter, setAgendaFilter] = useState('upcoming') // 'all', 'today', 'upcoming'

  // Action Modal States (Persetujuan Setuju / Tolak)
  const [actionTarget, setActionTarget] = useState(null)
  const [actionType, setActionType] = useState('') // 'setuju' atau 'tolak'
  const [balasan, setBalasan] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  // Selesai Sesi Modal States
  const [finishTarget, setFinishTarget] = useState(null)
  const [catatanHasil, setCatatanHasil] = useState('')
  const [tampilkanKeSiswa, setTampilkanKeSiswa] = useState(false)
  const [submittingFinish, setSubmittingFinish] = useState(false)

  // Edit Hasil Modal States
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => {
    if (session?.id) {
      fetchData()
    }
  }, [session, activeSubTab, agendaFilter])

  const fetchData = async () => {
    setLoading(true)
    setDbError(null)
    setErrorForm('')
    setSuccessMsg('')
    try {
      // 1. Fetch Master Slots
      const { data: slots, error: errSlots } = await supabase
        .from('bk_konsultasi_jadwal')
        .select('*')
        .eq('guru_id', session.id)

      if (errSlots) {
        if (errSlots.code === '42P01') {
          setDbError('Tabel database "bk_konsultasi_jadwal" belum dibuat. Harap jalankan migrasi SQL di Supabase SQL Editor.')
        } else {
          setDbError(errSlots.message)
        }
        setLoading(false)
        return
      }
      setSlotList(slots || [])

      // 2. Fetch Bookings with join to master slot
      let query = supabase
        .from('bk_konsultasi_booking')
        .select(`
          *,
          bk_konsultasi_jadwal (
            hari,
            jam_mulai,
            jam_selesai,
            guru_id
          )
        `)
        .eq('bk_konsultasi_jadwal.guru_id', session.id)

      const todayStr = new Date().toISOString().split('T')[0]
      if (agendaFilter === 'today') {
        query = query.eq('tanggal', todayStr)
      } else if (agendaFilter === 'upcoming') {
        query = query.gte('tanggal', todayStr)
      }

      const { data: bookings, error: errBookings } = await query

      if (errBookings) {
        if (errBookings.code === '42P01') {
          setDbError('Tabel database "bk_konsultasi_booking" belum dibuat. Harap jalankan migrasi SQL.')
        } else {
          setDbError(errBookings.message)
        }
      } else {
        const filtered = (bookings || []).filter(b => b.bk_konsultasi_jadwal !== null)
        
        // Hitung jumlah pengajuan yang 'menunggu' untuk pemberitahuan
        const waitingCount = filtered.filter(b => b.status === 'menunggu').length
        setPendingCount(waitingCount)

        // Sort by tanggal & jam_mulai
        filtered.sort((a, b) => {
          const dateCompare = a.tanggal.localeCompare(b.tanggal)
          if (dateCompare !== 0) return dateCompare
          return a.bk_konsultasi_jadwal.jam_mulai.localeCompare(b.bk_konsultasi_jadwal.jam_mulai)
        })
        setBookingList(filtered)
      }
    } catch (err) {
      setDbError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSlot = async (e) => {
    e.preventDefault()
    setErrorForm('')
    setSuccessMsg('')

    if (!hari || !jamMulai || !jamSelesai) {
      setErrorForm('Semua input slot ketersediaan wajib diisi!')
      return
    }

    if (jamMulai >= jamSelesai) {
      setErrorForm('Jam mulai harus lebih awal dari jam selesai!')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        guru_id: session.id,
        hari,
        jam_mulai: jamMulai,
        jam_selesai: jamSelesai
      }

      const { error } = await supabase
        .from('bk_konsultasi_jadwal')
        .insert([payload])

      if (error) throw error

      setSuccessMsg(`Berhasil menambahkan slot ketersediaan hari ${hari}!`)
      setJamMulai('')
      setJamSelesai('')
      fetchData()

      logActivity(session.id, 'Jadwal BK', `Menambahkan master slot ketersediaan BK hari ${hari} jam ${jamMulai}-${jamSelesai}`)
    } catch (err) {
      setErrorForm(err.message || 'Gagal menambahkan slot ketersediaan.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = async (id, infoSlot) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus slot ketersediaan mingguan ini?\n${infoSlot}\n\n*Catatan: Semua booking siswa yang terhubung dengan slot ini juga akan terhapus!`)) return

    try {
      const { error } = await supabase
        .from('bk_konsultasi_jadwal')
        .delete()
        .eq('id', id)

      if (error) throw error

      setSuccessMsg('Slot ketersediaan berhasil dihapus.')
      fetchData()
      logActivity(session.id, 'Jadwal BK', `Menghapus master slot ketersediaan BK: ${infoSlot}`)
    } catch (err) {
      alert(`Gagal menghapus slot: ${err.message}`)
    }
  }

  const handleProcessAction = async () => {
    if (!actionTarget || !actionType) return

    setSubmittingAction(true)
    try {
      const statusFinal = actionType === 'setuju' ? 'disetujui' : 'ditolak'
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .update({
          status: statusFinal,
          balasan_guru: balasan
        })
        .eq('id', actionTarget.id)

      if (error) throw error

      alert(`Berhasil ${actionType === 'setuju' ? 'menyetujui' : 'menolak'} pengajuan konsultasi siswa!`)
      setActionTarget(null)
      setBalasan('')
      fetchData()

      logActivity(session.id, 'Persetujuan BK', `Mengubah status konsultasi siswa ${actionTarget.siswa_nisn} menjadi ${statusFinal}`)
    } catch (err) {
      alert(`Gagal memproses persetujuan: ${err.message}`)
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleFinishConsultation = async () => {
    if (!finishTarget) return

    setSubmittingFinish(true)
    try {
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .update({
          status: 'selesai',
          catatan_hasil: catatanHasil,
          tampilkan_hasil_ke_siswa: tampilkanKeSiswa
        })
        .eq('id', finishTarget.id)

      if (error) throw error

      alert('Sesi konsultasi BK berhasil diselesaikan!')
      setFinishTarget(null)
      setCatatanHasil('')
      setTampilkanKeSiswa(false)
      fetchData()

      logActivity(session.id, 'Penyelesaian BK', `Menyelesaikan sesi konsultasi siswa ${finishTarget.siswa_nisn}`)
    } catch (err) {
      alert(`Gagal menyelesaikan sesi: ${err.message}`)
    } finally {
      setSubmittingFinish(false)
    }
  }

  const handleUpdateHasil = async () => {
    if (!editTarget) return

    setSubmittingFinish(true)
    try {
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .update({
          catatan_hasil: catatanHasil,
          tampilkan_hasil_ke_siswa: tampilkanKeSiswa
        })
        .eq('id', editTarget.id)

      if (error) throw error

      alert('Catatan hasil konsultasi berhasil diperbarui!')
      setEditTarget(null)
      setCatatanHasil('')
      setTampilkanKeSiswa(false)
      fetchData()
    } catch (err) {
      alert(`Gagal memperbarui catatan: ${err.message}`)
    } finally {
      setSubmittingFinish(false)
    }
  }

  const handleDeleteBooking = async (bookingId, infoBooking) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus/membatalkan agenda konsultasi ini?\n${infoBooking}`)) return

    try {
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .delete()
        .eq('id', bookingId)

      if (error) throw error

      alert('Agenda konsultasi berhasil dihapus.')
      fetchData()
    } catch (err) {
      alert(`Gagal menghapus agenda: ${err.message}`)
    }
  }

  // Helper sort days
  const dayOrder = { 'Senin': 1, 'Selasa': 2, 'Rabu': 3, 'Kamis': 4, 'Jumat': 5, 'Sabtu': 6, 'Minggu': 7 }
  
  // Group slots by Day
  const groupedSlots = slotList.reduce((acc, curr) => {
    const key = curr.hari
    if (!acc[key]) acc[key] = []
    acc[key].push(curr)
    return acc
  }, {})

  // Sort grouped days
  const sortedDays = Object.keys(groupedSlots).sort((a, b) => dayOrder[a] - dayOrder[b])

  // Format date helper
  const formatDateIndo = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Konsultasi BK (Bimbingan Konseling)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola hari kerja ketersediaan dan pantau agenda konsultasi bersama siswa.
          </p>
        </div>
      </div>

      {/* Database Error Alert */}
      {dbError && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm shadow-sm">
          <span className="font-bold">Perhatian: </span>
          {dbError}
        </div>
      )}

      {!dbError && (
        <div className="space-y-6">
          {/* Sub-Tabs Control */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => { setActiveSubTab('agenda'); setLoading(true); }}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeSubTab === 'agenda'
                  ? 'border-indigo-600 text-indigo-700 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              🗓️ Agenda Konsultasi Siswa
              {pendingCount > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-[10px] font-extrabold bg-red-500 text-white rounded-full animate-bounce">
                  {pendingCount} Baru
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveSubTab('slot'); setLoading(true); }}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeSubTab === 'slot'
                  ? 'border-indigo-600 text-indigo-700 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              ⚙️ Atur Slot Ketersediaan (Mingguan)
            </button>
          </div>

          {/* Tab Content: AGENDA KONSULTASI */}
          {activeSubTab === 'agenda' && (
            <div className="space-y-4 animate-fade-in">
              {/* Agenda Filters */}
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase mr-2">Filter Agenda:</span>
                  {['upcoming', 'today', 'all'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAgendaFilter(filter)}
                      className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all border ${
                        agendaFilter === filter
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {filter === 'upcoming' ? 'Mendatang' : filter === 'today' ? 'Hari Ini' : 'Semua'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchData}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  Refresh Agenda
                </button>
              </div>

              {/* Agenda List */}
              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 font-medium">
                  Memuat agenda...
                </div>
              ) : bookingList.length === 0 ? (
                <div className="text-center py-16 px-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                  Tidak ada agenda konsultasi siswa untuk filter ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bookingList.map((booking) => {
                    const js = booking.bk_konsultasi_jadwal
                    const info = `${formatDateIndo(booking.tanggal)} (${js.jam_mulai.substring(0, 5)} - ${js.jam_selesai.substring(0, 5)})`
                    const isPending = booking.status === 'menunggu'
                    const isApproved = booking.status === 'disetujui'
                    const isFinished = booking.status === 'selesai'

                    return (
                      <div
                        key={booking.id}
                        className={`bg-white p-5 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden ${
                          isPending ? 'border-amber-300' : isFinished ? 'border-green-200 bg-slate-50/30' : 'border-slate-200'
                        }`}
                      >
                        {/* Indikator baru/belum diproses */}
                        {isPending && (
                          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                            Butuh Persetujuan
                          </div>
                        )}
                        {isFinished && (
                          <div className="absolute top-0 right-0 bg-green-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                            Selesai
                          </div>
                        )}

                        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                        <div className="space-y-3 pl-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-mono">
                              {js.hari}, {booking.tanggal}
                            </span>
                            <span className="text-xs font-bold text-indigo-600 font-mono">
                              {js.jam_mulai.substring(0, 5)} - {js.jam_selesai.substring(0, 5)}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Siswa</p>
                            <p className="text-sm font-bold text-slate-800">
                              {booking.siswa_nama} <span className="text-xs text-slate-400">({booking.siswa_nisn})</span>
                            </p>
                          </div>

                          {booking.catatan && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Pesan Siswa</p>
                              <p className="text-xs text-slate-650 leading-relaxed italic">
                                "{booking.catatan}"
                              </p>
                            </div>
                          )}

                          {booking.balasan_guru && !isFinished && (
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3">
                              <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wide mb-1">Balasan Anda</p>
                              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                "{booking.balasan_guru}"
                              </p>
                            </div>
                          )}

                          {/* Catatan Hasil Konsultasi (Selesai Sesi) */}
                          {isFinished && booking.catatan_hasil && (
                            <div className="bg-green-50/30 border border-green-200 rounded-xl p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-[9px] font-bold text-green-700 uppercase tracking-wide">Catatan Hasil Konsultasi</p>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                                  booking.tampilkan_hasil_ke_siswa 
                                    ? 'bg-green-100 border-green-300 text-green-800' 
                                    : 'bg-slate-100 border-slate-350 text-slate-600'
                                }`}>
                                  {booking.tampilkan_hasil_ke_siswa ? 'Dibagikan ke Siswa' : 'Privat Guru BK'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                "{booking.catatan_hasil}"
                              </p>
                            </div>
                          )}

                          <div className="pt-2">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              isFinished
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : isApproved
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : booking.status === 'ditolak'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              Status: {isFinished ? 'Selesai' : isApproved ? 'Disetujui' : booking.status === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                            </span>
                          </div>
                        </div>

                        {/* Button Action Agenda */}
                        <div className="flex justify-end gap-2 border-t border-slate-100 mt-4 pt-3.5 pl-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => { setActionTarget(booking); setActionType('tolak'); }}
                                className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-red-200 text-red-650 hover:text-red-700 transition-all shadow-sm"
                              >
                                Tolak
                              </button>
                              <button
                                onClick={() => { setActionTarget(booking); setActionType('setuju'); }}
                                className="text-[11px] font-bold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm"
                              >
                                Setujui & Balas
                              </button>
                            </>
                          )}
                          
                          {isApproved && (
                            <>
                              <button
                                onClick={() => handleDeleteBooking(booking.id, `${booking.siswa_nama} - ${info}`)}
                                className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 text-slate-500 hover:text-red-650 hover:border-red-200 transition-all shadow-sm"
                              >
                                Batalkan Sesi
                              </button>
                              <button
                                onClick={() => { setFinishTarget(booking); setCatatanHasil(''); setTampilkanKeSiswa(false); }}
                                className="text-[11px] font-bold px-3.5 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-all shadow-sm flex items-center gap-1"
                              >
                                Tandai Selesai
                              </button>
                            </>
                          )}

                          {isFinished && (
                            <>
                              <button
                                onClick={() => handleDeleteBooking(booking.id, `${booking.siswa_nama} - ${info}`)}
                                className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 text-slate-500 hover:text-red-650 hover:border-red-200 transition-all shadow-sm"
                              >
                                Hapus Riwayat
                              </button>
                              <button
                                onClick={() => { 
                                  setEditTarget(booking); 
                                  setCatatanHasil(booking.catatan_hasil || ''); 
                                  setTampilkanKeSiswa(booking.tampilkan_hasil_ke_siswa || false); 
                                }}
                                className="text-[11px] font-bold px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-all shadow-sm"
                              >
                                Edit Catatan
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab Content: ATUR SLOT KETERSEDIAAN MINGGUAN */}
          {activeSubTab === 'slot' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
              {/* Form Input Slot */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h2 className="text-md font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  Tambah Jam Kerja BK
                </h2>

                {errorForm && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
                    {errorForm}
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-xs font-medium">
                    {successMsg}
                  </div>
                )}

                <form onSubmit={handleAddSlot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Hari</label>
                    <select
                      value={hari}
                      onChange={(e) => setHari(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 bg-slate-50"
                      required
                    >
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Mulai</label>
                      <input
                        type="time"
                        value={jamMulai}
                        onChange={(e) => setJamMulai(e.target.value)}
                        className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-750 font-medium bg-slate-50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Selesai</label>
                      <input
                        type="time"
                        value={jamSelesai}
                        onChange={(e) => setJamSelesai(e.target.value)}
                        className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-750 font-medium bg-slate-50"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Menyimpan...' : 'Tambah Sesi Jam'}
                  </button>
                </form>
              </div>

              {/* Master Slots Grid */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-md font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    </span>
                    Jadwal Mingguan Terdaftar
                  </h2>
                </div>

                {loading ? (
                  <div className="text-center py-12 text-slate-400">Memuat slot...</div>
                ) : slotList.length === 0 ? (
                  <div className="text-center py-16 px-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                    Belum ada jam kerja BK mingguan yang didaftarkan.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sortedDays.map((dayName) => (
                      <div key={dayName} className="space-y-2">
                        <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest pl-1">
                          Hari {dayName}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {groupedSlots[dayName].map((slot) => (
                            <div
                              key={slot.id}
                              className="bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between transition-all"
                            >
                              <div className="flex items-center gap-2 text-slate-700 font-semibold font-mono text-sm">
                                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {slot.jam_mulai.substring(0, 5)} - {slot.jam_selesai.substring(0, 5)}
                              </div>

                              <button
                                onClick={() => handleDeleteSlot(slot.id, `Hari ${dayName} jam ${slot.jam_mulai.substring(0, 5)} - ${slot.jam_selesai.substring(0, 5)}`)}
                                className="p-1.5 bg-white text-slate-400 hover:text-red-650 hover:border-red-200 border border-slate-200 rounded-lg shadow-sm transition-all"
                                title="Hapus slot"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Approval Modal (Setuju / Tolak) */}
      {actionTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-5 py-4 text-white flex items-center justify-between bg-gradient-to-r ${
              actionType === 'setuju' ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700'
            }`}>
              <div>
                <h3 className="font-bold text-base">
                  {actionType === 'setuju' ? 'Setujui Pengajuan Konsultasi' : 'Tolak Pengajuan Konsultasi'}
                </h3>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Siswa: {actionTarget.siswa_nama} ({actionTarget.siswa_nisn})
                </p>
              </div>
              <button
                onClick={() => { setActionTarget(null); setBalasan(''); }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
                <p className="font-bold text-slate-400 uppercase text-[9px] mb-1">Pesan Siswa</p>
                <p className="text-slate-650 italic">"{actionTarget.catatan}"</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase">
                  {actionType === 'setuju' ? 'Balasan / Catatan Pertemuan' : 'Alasan Penolakan'}
                </label>
                <textarea
                  value={balasan}
                  onChange={(e) => setBalasan(e.target.value)}
                  placeholder={
                    actionType === 'setuju'
                      ? 'Contoh: Baik, mari bertemu di Ruang BK lantai 2 pada waktu tersebut.'
                      : 'Contoh: Maaf, pada waktu tersebut saya sedang mendampingi kegiatan ANBK.'
                  }
                  rows={4}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed text-slate-700"
                  maxLength={500}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setActionTarget(null); setBalasan(''); }}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleProcessAction}
                  disabled={submittingAction || !balasan.trim()}
                  className={`px-5 py-2 text-white font-semibold text-xs rounded-xl transition-all shadow-sm disabled:opacity-50 ${
                    actionType === 'setuju' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {submittingAction ? 'Memproses...' : actionType === 'setuju' ? 'Setujui Sesi' : 'Tolak Sesi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selesai / Edit Hasil Modal */}
      {(finishTarget || editTarget) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-green-650 to-green-700 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  {editTarget ? 'Edit Catatan Hasil Konsultasi' : 'Selesaikan Sesi Konsultasi'}
                </h3>
                <p className="text-[11px] text-green-100 mt-0.5">
                  Siswa: {(finishTarget || editTarget).siswa_nama} ({(finishTarget || editTarget).siswa_nisn})
                </p>
              </div>
              <button
                onClick={() => { setFinishTarget(null); setEditTarget(null); setCatatanHasil(''); setTampilkanKeSiswa(false); }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase">Catatan Hasil Konsultasi</label>
                <textarea
                  value={catatanHasil}
                  onChange={(e) => setCatatanHasil(e.target.value)}
                  placeholder="Tuliskan kesimpulan, saran, atau hasil dari sesi konsultasi ini..."
                  rows={5}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 leading-relaxed text-slate-700"
                  required
                />
              </div>

              {/* Checkbox Tampilkan Hasil ke Siswa */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="chk-tampilkan-siswa"
                  checked={tampilkanKeSiswa}
                  onChange={(e) => setTampilkanKeSiswa(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-green-600 border-slate-300 focus:ring-green-500"
                />
                <label htmlFor="chk-tampilkan-siswa" className="text-xs text-slate-700 font-semibold select-none cursor-pointer leading-tight">
                  Bagikan Catatan Hasil Konsultasi ini ke Siswa
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Jika dicentang, siswa ybs dapat melihat catatan hasil ini pada menu Riwayat Konsultasi di portal mereka.
                  </p>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setFinishTarget(null); setEditTarget(null); setCatatanHasil(''); setTampilkanKeSiswa(false); }}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={editTarget ? handleUpdateHasil : handleFinishConsultation}
                  disabled={submittingFinish || !catatanHasil.trim()}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs rounded-xl transition-all shadow-sm disabled:opacity-50"
                >
                  {submittingFinish ? 'Menyimpan...' : editTarget ? 'Perbarui Catatan' : 'Simpan & Selesaikan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
