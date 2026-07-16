import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

export default function AdminBKKonsultasiSection({ session }) {
  const [activeSubTab, setActiveSubTab] = useState('agenda') // 'agenda' atau 'slot'
  const [gurusBK, setGurusBK] = useState([])
  const [selectedGuruId, setSelectedGuruId] = useState('')
  const [slotList, setSlotList] = useState([])
  const [bookingList, setBookingList] = useState([])
  const [loadingGurus, setLoadingGurus] = useState(true)
  const [loading, setLoading] = useState(false)
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

  // Action Modal States
  const [actionTarget, setActionTarget] = useState(null)
  const [actionType, setActionType] = useState('') // 'setuju' atau 'tolak'
  const [balasan, setBalasan] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  useEffect(() => {
    fetchGurusBK()
  }, [])

  useEffect(() => {
    if (selectedGuruId) {
      fetchData(selectedGuruId)
    } else {
      setSlotList([])
      setBookingList([])
    }
  }, [selectedGuruId, activeSubTab, agendaFilter])

  const fetchGurusBK = async () => {
    setLoadingGurus(true)
    setDbError(null)
    try {
      const { data, error } = await supabase
        .from('guru')
        .select(`
          id, 
          nama_guru, 
          kode,
          guru_role (
            role_id,
            roles (
              nama
            )
          )
        `)
        .order('nama_guru', { ascending: true })

      if (error) throw error

      const filtered = (data || []).filter(g => {
        return g.guru_role?.some(gr => {
          const roleName = gr.roles?.nama?.toLowerCase() || ''
          return roleName === 'bk' || roleName.includes('bimbingan')
        })
      })

      setGurusBK(filtered)
      if (filtered.length > 0) {
        setSelectedGuruId(filtered[0].id)
      }
    } catch (err) {
      console.error('Error fetching BK Gurus:', err)
      setDbError(err.message)
    } finally {
      setLoadingGurus(false)
    }
  }

  const fetchData = async (guruId) => {
    setLoading(true)
    setDbError(null)
    setErrorForm('')
    setSuccessMsg('')
    try {
      if (activeSubTab === 'slot') {
        const { data, error } = await supabase
          .from('bk_konsultasi_jadwal')
          .select('*')
          .eq('guru_id', guruId)

        if (error) {
          if (error.code === '42P01') {
            setDbError('Tabel database "bk_konsultasi_jadwal" belum dibuat. Harap jalankan migrasi SQL di Supabase SQL Editor.')
          } else {
            setDbError(error.message)
          }
        } else {
          setSlotList(data || [])
        }
      } else {
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
          .eq('bk_konsultasi_jadwal.guru_id', guruId)

        const todayStr = new Date().toISOString().split('T')[0]
        if (agendaFilter === 'today') {
          query = query.eq('tanggal', todayStr)
        } else if (agendaFilter === 'upcoming') {
          query = query.gte('tanggal', todayStr)
        }

        const { data, error } = await query

        if (error) {
          if (error.code === '42P01') {
            setDbError('Tabel database "bk_konsultasi_booking" belum dibuat. Harap jalankan migrasi SQL.')
          } else {
            setDbError(error.message)
          }
        } else {
          const filtered = (data || []).filter(b => b.bk_konsultasi_jadwal !== null)
          filtered.sort((a, b) => {
            const dateCompare = a.tanggal.localeCompare(b.tanggal)
            if (dateCompare !== 0) return dateCompare
            return a.bk_konsultasi_jadwal.jam_mulai.localeCompare(b.bk_konsultasi_jadwal.jam_mulai)
          })
          setBookingList(filtered)
        }
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

    if (!selectedGuruId) {
      setErrorForm('Pilih Guru BK terlebih dahulu!')
      return
    }

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
        guru_id: selectedGuruId,
        hari,
        jam_mulai: jamMulai,
        jam_selesai: jamSelesai
      }

      const { error } = await supabase
        .from('bk_konsultasi_jadwal')
        .insert([payload])

      if (error) throw error

      setSuccessMsg(`[ADMIN] Berhasil menambahkan slot ketersediaan BK!`)
      setJamMulai('')
      setJamSelesai('')
      fetchData(selectedGuruId)

      const selectedGuru = gurusBK.find(g => g.id === selectedGuruId)
      logActivity(session?.user?.id || 'admin', 'Jadwal BK Admin', `Membuat slot master BK untuk ${selectedGuru?.nama_guru} hari ${hari}`)
    } catch (err) {
      setErrorForm(err.message || 'Gagal menambahkan slot.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSlot = async (id, infoSlot) => {
    if (!window.confirm(`[ADMIN] Apakah Anda yakin ingin menghapus slot ketersediaan mingguan ini?\n${infoSlot}\n\n*Catatan: Semua booking siswa yang terhubung dengan slot ini juga akan terhapus!`)) return

    try {
      const { error } = await supabase
        .from('bk_konsultasi_jadwal')
        .delete()
        .eq('id', id)

      if (error) throw error

      setSuccessMsg('Slot ketersediaan berhasil dihapus.')
      fetchData(selectedGuruId)
      logActivity(session?.user?.id || 'admin', 'Jadwal BK Admin', `Menghapus master slot BK: ${infoSlot}`)
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

      alert(`[ADMIN] Berhasil memproses pengajuan sesi konsultasi menjadi ${statusFinal}.`)
      setActionTarget(null)
      setBalasan('')
      fetchData(selectedGuruId)

      logActivity(session?.user?.id || 'admin', 'Persetujuan BK Admin', `Mengubah status booking siswa ${actionTarget.siswa_nisn} menjadi ${statusFinal}`)
    } catch (err) {
      alert(`Gagal memproses persetujuan: ${err.message}`)
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleDeleteBooking = async (bookingId, infoBooking) => {
    if (!window.confirm(`[ADMIN] Apakah Anda yakin ingin menghapus/membatalkan agenda konsultasi ini?\n${infoBooking}`)) return

    try {
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .delete()
        .eq('id', bookingId)

      if (error) throw error

      alert('Agenda konsultasi berhasil dihapus oleh Admin.')
      fetchData(selectedGuruId)
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
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Monitoring Konsultasi BK (Admin)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pantau dan kelola jadwal ketersediaan waktu serta agenda konsultasi seluruh Guru BK di sekolah.
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
          {/* Top Selection and Sub-Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="w-full md:max-w-xs space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">Pilih Guru BK</label>
              {loadingGurus ? (
                <div className="text-xs text-slate-400">Memuat data guru BK...</div>
              ) : (
                <select
                  value={selectedGuruId}
                  onChange={(e) => setSelectedGuruId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700"
                >
                  <option value="">-- Pilih Guru BK --</option>
                  {gurusBK.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nama_guru} ({g.kode})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedGuruId && (
              <div className="flex border-b border-slate-200 self-end md:self-center">
                <button
                  onClick={() => { setActiveSubTab('agenda'); setLoading(true); }}
                  className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeSubTab === 'agenda'
                      ? 'border-indigo-600 text-indigo-700 font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  🗓️ Agenda Booking Siswa
                </button>
                <button
                  onClick={() => { setActiveSubTab('slot'); setLoading(true); }}
                  className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeSubTab === 'slot'
                      ? 'border-indigo-600 text-indigo-700 font-extrabold'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  ⚙️ Slot Ketersediaan (Mingguan)
                </button>
              </div>
            )}
          </div>

          {/* Tab Content */}
          {!selectedGuruId ? (
            <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
              Silakan pilih Guru BK pada menu dropdown di atas untuk memulai monitoring.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tab Content: AGENDA BOOKING SISWA */}
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
                      onClick={() => fetchData(selectedGuruId)}
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Refresh Agenda
                    </button>
                  </div>

                  {/* Agenda List */}
                  {loading ? (
                    <div className="text-center py-12 text-slate-400 font-medium">Memuat agenda...</div>
                  ) : bookingList.length === 0 ? (
                    <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                      Tidak ada agenda booking konsultasi siswa.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {bookingList.map((booking) => {
                        const js = booking.bk_konsultasi_jadwal
                        const info = `${formatDateIndo(booking.tanggal)} (${js.jam_mulai.substring(0, 5)} - ${js.jam_selesai.substring(0, 5)})`
                        const isPending = booking.status === 'menunggu'

                        return (
                          <div
                            key={booking.id}
                            className={`bg-white p-5 rounded-2xl border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden ${
                              isPending ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          >
                            {isPending && (
                              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                Butuh Persetujuan
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

                              {booking.balasan_guru && (
                                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3">
                                  <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-wide mb-1">Balasan Guru BK</p>
                                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                                    "{booking.balasan_guru}"
                                  </p>
                                </div>
                              )}

                              <div className="pt-2">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                  booking.status === 'disetujui'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : booking.status === 'ditolak'
                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  Status: {booking.status === 'disetujui' ? 'Disetujui' : booking.status === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 mt-4 pt-3.5 pl-2">
                              {isPending ? (
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
                              ) : (
                                <button
                                  onClick={() => handleDeleteBooking(booking.id, `${booking.siswa_nama} - ${info}`)}
                                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
                                >
                                  Hapus Sesi
                                </button>
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
                  {/* Form Slot Input */}
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
                          className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                            className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Jam Selesai</label>
                          <input
                            type="time"
                            value={jamSelesai}
                            onChange={(e) => setJamSelesai(e.target.value)}
                            className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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

                  {/* List Master Slot */}
                  <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                    <div className="border-b border-slate-100 pb-3">
                      <h2 className="text-md font-bold text-slate-700 uppercase tracking-wider">
                        Jadwal Mingguan Terdaftar
                      </h2>
                    </div>

                    {loading ? (
                      <div className="text-center py-12 text-slate-400 font-medium">Memuat slot...</div>
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
    </div>
  )
}
