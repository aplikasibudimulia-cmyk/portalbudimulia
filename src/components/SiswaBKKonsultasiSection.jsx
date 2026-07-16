import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logActivity } from '../utils/logger'

export default function SiswaBKKonsultasiSection({ studentData }) {
  const [gurusBK, setGurusBK] = useState([])
  const [selectedGuruId, setSelectedGuruId] = useState('')
  const [selectedDate, setSelectedDate] = useState('') // Format: YYYY-MM-DD
  const [activeSlots, setActiveSlots] = useState([])
  const [bookingsOnDate, setBookingsOnDate] = useState([])
  const [riwayatList, setRiwayatList] = useState([])
  const [loadingGurus, setLoadingGurus] = useState(true)
  const [loadingJadwal, setLoadingJadwal] = useState(false)
  const [loadingRiwayat, setLoadingRiwayat] = useState(false)
  const [dbError, setDbError] = useState(null)

  // Booking Modal States
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [konfirmasiYakin, setKonfirmasiYakin] = useState(false)

  // Inisialisasi default tanggal hari ini
  useEffect(() => {
    const today = new Date()
    const offset = today.getTimezoneOffset()
    const localToday = new Date(today.getTime() - (offset*60*1000))
    setSelectedDate(localToday.toISOString().split('T')[0])
    fetchGurusBK()
    fetchRiwayatSiswa()
  }, [])

  useEffect(() => {
    if (selectedGuruId && selectedDate) {
      fetchJadwalDanBooking(selectedGuruId, selectedDate)
    } else {
      setActiveSlots([])
      setBookingsOnDate([])
    }
  }, [selectedGuruId, selectedDate])

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

  const fetchJadwalDanBooking = async (guruId, dateStr) => {
    setLoadingJadwal(true)
    setDbError(null)
    try {
      const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const dateObj = new Date(dateStr)
      const dayName = daysIndo[dateObj.getDay()]

      const { data: slots, error: errSlots } = await supabase
        .from('bk_konsultasi_jadwal')
        .select('*')
        .eq('guru_id', guruId)
        .eq('hari', dayName)
        .order('jam_mulai', { ascending: true })

      if (errSlots) throw errSlots

      const { data: bookings, error: errBookings } = await supabase
        .from('bk_konsultasi_booking')
        .select('*')
        .eq('tanggal', dateStr)

      if (errBookings) throw errBookings

      setActiveSlots(slots || [])
      setBookingsOnDate(bookings || [])
    } catch (err) {
      console.error('Error loading BK schedule:', err)
      if (err.code === '42P01') {
        setDbError('Tabel database "bk_konsultasi_jadwal" belum dibuat. Silakan hubungi admin.')
      } else {
        setDbError(err.message)
      }
    } finally {
      setLoadingJadwal(false)
    }
  }

  const fetchRiwayatSiswa = async () => {
    setLoadingRiwayat(true)
    try {
      const { data, error } = await supabase
        .from('bk_konsultasi_booking')
        .select(`
          *,
          bk_konsultasi_jadwal (
            hari,
            jam_mulai,
            jam_selesai,
            guru (
              nama_guru,
              kode
            )
          )
        `)
        .eq('siswa_nisn', studentData.nisn)
        .order('tanggal', { ascending: false })

      if (!error) {
        setRiwayatList(data || [])
      }
    } catch (err) {
      console.error('Error fetching history:', err)
    } finally {
      setLoadingRiwayat(false)
    }
  }

  const handleBooking = async () => {
    if (!selectedSlot || !selectedDate) return
    if (!catatan.trim()) {
      alert('Silakan tuliskan pesan/alasan konsultasi Anda!')
      return
    }

    if (!konfirmasiYakin) {
      alert('Anda harus mencentang konfirmasi kesediaan melaksanakan konsultasi!')
      return
    }

    setSubmittingBooking(true)
    try {
      const payload = {
        jadwal_id: selectedSlot.id,
        tanggal: selectedDate,
        siswa_nisn: studentData.nisn,
        siswa_nama: studentData.nama_lengkap,
        catatan: catatan,
        status: 'menunggu' // Status awal menunggu persetujuan guru BK
      }

      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .insert([payload])

      if (error) throw error

      alert('Pengajuan konsultasi BK berhasil dikirim ke Guru BK!')
      setSelectedSlot(null)
      setCatatan('')
      setKonfirmasiYakin(false)
      fetchJadwalDanBooking(selectedGuruId, selectedDate)
      fetchRiwayatSiswa()

      logActivity(studentData.nisn, 'Booking BK', `Mengajukan konsultasi BK tanggal ${selectedDate} jam ${selectedSlot.jam_mulai.substring(0, 5)}`)
    } catch (err) {
      alert(`Gagal membooking: ${err.message}`)
    } finally {
      setSubmittingBooking(false)
    }
  }

  const handleCancelBooking = async (bookingId, infoBooking) => {
    if (!window.confirm('Apakah Anda yakin ingin membatalkan pengajuan booking konsultasi ini?')) return

    try {
      const { error } = await supabase
        .from('bk_konsultasi_booking')
        .delete()
        .eq('id', bookingId)

      if (error) throw error

      alert('Pengajuan booking berhasil dibatalkan.')
      fetchJadwalDanBooking(selectedGuruId, selectedDate)
      fetchRiwayatSiswa()

      logActivity(studentData.nisn, 'Cancel Booking BK', `Membatalkan booking BK: ${infoBooking}`)
    } catch (err) {
      alert(`Gagal membatalkan booking: ${err.message}`)
    }
  }

  const getDayNameIndo = (dateStr) => {
    if (!dateStr) return ''
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    const dateObj = new Date(dateStr)
    return daysIndo[dateObj.getDay()]
  }

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Konsultasi BK (Bimbingan Konseling)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pilih guru BK Anda, tentukan tanggal pertemuan, lalu booking slot waktu yang tersedia (berwarna hijau).
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
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">1. Pilih Guru BK</label>
              {loadingGurus ? (
                <div className="text-xs text-slate-400 font-medium">Memuat data guru BK...</div>
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

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase">2. Pilih Tanggal Konsultasi</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700"
              />
            </div>
          </div>

          {/* Grid Ketersediaan Jadwal */}
          {selectedGuruId && selectedDate ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-md font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                  Slot Waktu Hari {getDayNameIndo(selectedDate)} ({formatDateIndo(selectedDate)})
                </h2>
                <button
                  onClick={() => fetchJadwalDanBooking(selectedGuruId, selectedDate)}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  Refresh Slot
                </button>
              </div>

              {loadingJadwal ? (
                <div className="flex items-center justify-center py-12 text-slate-400">Memuat slot...</div>
              ) : activeSlots.length === 0 ? (
                <div className="text-center py-16 px-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
                  Guru BK yang bersangkutan tidak memiliki jadwal ketersediaan waktu untuk hari {getDayNameIndo(selectedDate)}.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {activeSlots.map((slot) => {
                    // Cari booking aktif ('menunggu' atau 'disetujui' atau 'selesai') pada slot ini
                    const matchedBooking = bookingsOnDate.find(b => b.jadwal_id === slot.id && b.status !== 'ditolak')
                    const isBooked = !!matchedBooking
                    const isMyBooking = matchedBooking?.siswa_nisn === studentData.nisn
                    const bookingStatus = matchedBooking?.status

                    return (
                      <div
                        key={slot.id}
                        className={`relative overflow-hidden group p-4 border rounded-2xl flex flex-col justify-between transition-all duration-300 ${
                          isBooked
                            ? isMyBooking
                              ? bookingStatus === 'selesai'
                                ? 'bg-green-50 border-green-200 text-green-950 shadow-sm'
                                : bookingStatus === 'disetujui'
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-950 shadow-sm'
                                  : 'bg-amber-50/50 border-amber-200 text-amber-900 shadow-sm'
                              : 'bg-red-50/50 border-red-200 text-red-950/70'
                            : 'bg-green-50/50 border-green-200 text-green-950 hover:shadow-md cursor-pointer hover:scale-[1.01]'
                        }`}
                        onClick={() => {
                          if (!isBooked) {
                            setSelectedSlot(slot)
                          }
                        }}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold font-mono">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {slot.jam_mulai.substring(0, 5)} - {slot.jam_selesai.substring(0, 5)}
                            </div>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                              isBooked
                                ? isMyBooking
                                  ? bookingStatus === 'selesai'
                                    ? 'bg-green-100 border-green-300 text-green-800'
                                    : bookingStatus === 'disetujui'
                                      ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                                      : 'bg-amber-100 border-amber-300 text-amber-800'
                                  : 'bg-red-100/60 border-red-300 text-red-800'
                                : 'bg-green-100 border-green-300 text-green-800'
                            }`}>
                              {isBooked ? isMyBooking ? bookingStatus === 'selesai' ? 'Selesai' : bookingStatus === 'disetujui' ? 'Disetujui' : 'Menunggu' : 'Terisi' : 'Tersedia'}
                            </span>
                          </div>

                          {isBooked ? (
                            isMyBooking ? (
                              <div className="space-y-1 mt-1">
                                <p className="text-xs font-semibold text-slate-800">
                                  {bookingStatus === 'selesai'
                                    ? 'Sesi Konsultasi Selesai!'
                                    : bookingStatus === 'disetujui'
                                      ? 'Konsultasi disetujui Guru BK!'
                                      : 'Pengajuan Anda sedang ditinjau.'}
                                </p>
                                {matchedBooking.balasan_guru && (
                                  <div className="bg-white/90 p-2.5 rounded-lg border border-indigo-100 mt-1">
                                    <p className="text-[9px] font-bold text-indigo-600 uppercase">Balasan Guru BK</p>
                                    <p className="text-xs text-slate-650 italic">"{matchedBooking.balasan_guru}"</p>
                                  </div>
                                )}
                                {bookingStatus === 'selesai' && matchedBooking.tampilkan_hasil_ke_siswa && matchedBooking.catatan_hasil && (
                                  <div className="bg-green-100/60 p-2.5 rounded-lg border border-green-200 mt-1">
                                    <p className="text-[9px] font-bold text-green-800 uppercase">Catatan Hasil Konsultasi</p>
                                    <p className="text-xs text-slate-700 font-medium">"{matchedBooking.catatan_hasil}"</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs font-medium text-slate-400 italic">
                                Sesi konsultasi sudah terisi.
                              </p>
                            )
                          ) : (
                            <p className="text-xs font-bold text-green-700 group-hover:underline">
                              Klik untuk ajukan konsultasi &rarr;
                            </p>
                          )}
                        </div>

                        {isBooked && isMyBooking && bookingStatus === 'menunggu' && (
                          <div className="flex justify-end border-t border-amber-100 mt-2.5 pt-2.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelBooking(matchedBooking.id, `${getDayNameIndo(selectedDate)} ${selectedDate}`)
                              }}
                              className="text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-500 hover:text-red-650 shadow-sm"
                            >
                              Batalkan Pengajuan
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400">
              Silakan pilih Guru BK dan Tanggal Konsultasi di atas.
            </div>
          )}

          {/* Riwayat Konsultasi BK Saya */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-md font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  </svg>
                </span>
                Riwayat Konsultasi BK Saya
              </h2>
              <button
                onClick={fetchRiwayatSiswa}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Refresh Riwayat
              </button>
            </div>

            {loadingRiwayat ? (
              <div className="text-center py-8 text-slate-400">Memuat riwayat...</div>
            ) : riwayatList.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 italic">
                Anda belum pernah melakukan booking jadwal konsultasi BK.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                      <th className="px-4 py-3">Tanggal & Waktu</th>
                      <th className="px-4 py-3">Guru BK</th>
                      <th className="px-4 py-3">Alasan/Topik Saya</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Balasan / Hasil Konsultasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riwayatList.map((riwayat) => {
                      const js = riwayat.bk_konsultasi_jadwal
                      return (
                        <tr key={riwayat.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {formatDateIndo(riwayat.tanggal)}
                            <div className="text-[10px] text-slate-400 font-mono font-bold">
                              {js?.jam_mulai.substring(0, 5)} - {js?.jam_selesai.substring(0, 5)}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-600">
                            {js?.guru?.nama_guru || 'Guru BK'} <span className="text-[10px] text-slate-400">({js?.guru?.kode})</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 italic max-w-xs truncate" title={riwayat.catatan}>
                            "{riwayat.catatan}"
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              riwayat.status === 'selesai'
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : riwayat.status === 'disetujui'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : riwayat.status === 'ditolak'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {riwayat.status === 'selesai' ? 'Selesai' : riwayat.status === 'disetujui' ? 'Disetujui' : riwayat.status === 'ditolak' ? 'Ditolak' : 'Menunggu'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-650 space-y-1">
                            {riwayat.balasan_guru && (
                              <div>
                                <span className="text-[9px] font-bold text-indigo-600 uppercase block">Balasan:</span>
                                <span className="italic font-medium">"{riwayat.balasan_guru}"</span>
                              </div>
                            )}
                            {riwayat.status === 'selesai' && (
                              riwayat.tampilkan_hasil_ke_siswa && riwayat.catatan_hasil ? (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-2 mt-1">
                                  <span className="text-[9px] font-bold text-green-700 uppercase block">Catatan Hasil:</span>
                                  <span className="text-slate-800 font-semibold">"{riwayat.catatan_hasil}"</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 italic mt-1">
                                  Hasil konsultasi bersifat privat.
                                </div>
                              )
                            )}
                            {!riwayat.balasan_guru && riwayat.status !== 'selesai' && (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Booking Form Modal */}
      {selectedSlot && selectedDate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Ajukan Konsultasi BK</h3>
                <p className="text-[11px] text-indigo-100 mt-0.5">
                  Slot: {formatDateIndo(selectedDate)} ({selectedSlot.jam_mulai.substring(0, 5)} - {selectedSlot.jam_selesai.substring(0, 5)})
                </p>
              </div>
              <button
                onClick={() => { setSelectedSlot(null); setKonfirmasiYakin(false); }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">Pesan / Alasan Konsultasi</label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Tulis pesan Anda untuk Guru BK di sini (misal: ingin mendiskusikan rencana kuliah atau kesulitan belajar)..."
                  rows={4}
                  className="w-full text-xs border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 leading-relaxed text-slate-700"
                  maxLength={500}
                  required
                />
                <p className="text-[10px] text-slate-400 text-right">Maksimal 500 karakter</p>
              </div>

              {/* Checkbox Konfirmasi Yakin (Peringatan sesuai request user) */}
              <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="chk-konfirmasi"
                  checked={konfirmasiYakin}
                  onChange={(e) => setKonfirmasiYakin(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="chk-konfirmasi" className="text-xs text-amber-900 font-medium select-none cursor-pointer leading-tight">
                  <span className="font-bold">Konfirmasi: </span>
                  Apakah Anda yakin akan melaksanakan sesi konsultasi di waktu yang telah terpilih tersebut?
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setSelectedSlot(null); setKonfirmasiYakin(false); }}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBooking}
                  disabled={submittingBooking || !konfirmasiYakin || !catatan.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingBooking ? 'Mengirim...' : 'Ajukan Sekarang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
