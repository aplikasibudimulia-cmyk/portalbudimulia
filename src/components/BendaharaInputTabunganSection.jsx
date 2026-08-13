import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'

export default function BendaharaInputTabunganSection({ studentData, activeTa }) {
  const [semuaSiswaKelas, setSemuaSiswaKelas] = useState([])
  const [selectedSiswa, setSelectedSiswa] = useState(null)
  const [studentSearchInput, setStudentSearchInput] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const [transTanggal, setTransTanggal] = useState(() => new Date().toISOString().split('T')[0])
  const [transNominal, setTransNominal] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [historiInput, setHistoriInput] = useState([])

  // Modal Edit State
  const [editingTx, setEditingTx] = useState(null)
  const [editNominal, setEditNominal] = useState('')

  // Professional Toast / Notification Dialog State
  const [notifModal, setNotifModal] = useState(null) // { type: 'success' | 'error', title: string, message: string }

  const kelasSaya = studentData?.kelas || ''
  const currentTaId = activeTa?.id || studentData?.tahun_ajaran_id || null

  const fetchData = async () => {
    if (!studentData?.kelas) return
    const currentKelas = studentData.kelas
    setLoading(true)
    try {
      // 1. Fetch data siswa di kelas & tahun ajaran aktif dari view siswa_lengkap
      let siswaQuery = supabase
        .from('siswa_lengkap')
        .select('nisn, nama_lengkap, kelas, tahun_ajaran_id')
        .eq('kelas', currentKelas)

      if (currentTaId) {
        siswaQuery = siswaQuery.or(`tahun_ajaran_id.eq.${currentTaId},tahun_ajaran_id.is.null`)
      }

      let { data: siswaData, error: sErr } = await siswaQuery.order('nama_lengkap', { ascending: true })

      if (sErr || !siswaData || siswaData.length === 0) {
        const { data: fallbackData } = await supabase
          .from('siswa')
          .select('nisn, nama_lengkap, kelas')
          .eq('kelas', currentKelas)
          .order('nama_lengkap', { ascending: true })
        if (fallbackData) siswaData = fallbackData
      }

      const listSiswa = siswaData || []
      setSemuaSiswaKelas(listSiswa)

      // 2. Fetch histori transaksi yang diinput oleh Bendahara ini untuk kelas & TA ini
      const { data: transData } = await supabase
        .from('tabungan_transaksi')
        .select('*')
        .eq('kelas', currentKelas)
        .order('created_at', { ascending: false })

      setHistoriInput(transData || [])
    } catch (err) {
      console.error('Error fetching data bendahara:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel('realtime_bendahara_tabungan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabungan_transaksi' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [studentData, activeTa])

  // Handle outside click to close combobox dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtered student list for search-as-you-type combobox
  const filteredStudentsCombobox = semuaSiswaKelas.filter(s => {
    if (!studentSearchInput) return true
    const q = studentSearchInput.toLowerCase()
    return (
      s.nama_lengkap?.toLowerCase().includes(q) ||
      s.nisn?.includes(q)
    )
  })

  const handleQuickAdd = (amount) => {
    const current = parseFloat(transNominal) || 0
    setTransNominal((current + amount).toString())
  }

  const handleSubmitSetoran = async (e) => {
    e.preventDefault()
    if (!selectedSiswa?.nisn) {
      setNotifModal({
        type: 'error',
        title: 'Pilih Siswa',
        message: 'Silakan pilih nama siswa terlebih dahulu!'
      })
      return
    }

    const nominalNum = parseFloat(transNominal)
    if (isNaN(nominalNum) || nominalNum <= 0) {
      setNotifModal({
        type: 'error',
        title: 'Nominal Tidak Valid',
        message: 'Masukkan nominal setoran yang valid (lebih dari 0)!'
      })
      return
    }

    setIsSaving(true)
    try {
      const { data, error } = await supabase.rpc('proses_transaksi_tabungan', {
        p_siswa_nisn: selectedSiswa.nisn,
        p_kelas: kelasSaya,
        p_tipe: 'SETOR',
        p_jumlah: nominalNum,
        p_status_verifikasi: 'PENDING',
        p_diinput_oleh_nisn: studentData?.nisn,
        p_diinput_oleh_user_id: null,
        p_diverifikasi_oleh_user_id: null,
        p_keterangan: 'Setoran Tabungan Kelas'
      })

      if (error) throw error

      if (data?.success) {
        setNotifModal({
          type: 'success',
          title: 'Setoran Berhasil Dicatat',
          message: `Setoran Rp ${nominalNum.toLocaleString('id-ID')} untuk ${selectedSiswa.nama_lengkap} berhasil disimpan dan menunggu verifikasi Wali Kelas!`
        })
        setTransNominal('')
        setSelectedSiswa(null)
        setStudentSearchInput('')
        fetchData()
      } else {
        setNotifModal({
          type: 'error',
          title: 'Gagal Memproses',
          message: data?.message || 'Terjadi kesalahan saat memproses setoran'
        })
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Kesalahan Sistem',
        message: err.message
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Hapus Transaksi oleh Bendahara (Atomic RPC)
  const handleDeleteTx = async (tx) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus catatan setoran Rp ${parseFloat(tx.jumlah).toLocaleString('id-ID')} ini?`)) {
      return
    }

    try {
      const { data, error } = await supabase.rpc('hapus_transaksi_tabungan', {
        p_transaksi_id: tx.id
      })

      if (error) throw error

      if (data?.success) {
        setNotifModal({
          type: 'success',
          title: 'Penghapusan Berhasil',
          message: 'Catatan setoran berhasil dihapus secara atomik.'
        })
        fetchData()
      } else {
        throw new Error(data?.message || 'Gagal menghapus setoran.')
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Menghapus',
        message: err.message
      })
    }
  }

  // Handle Edit Transaksi oleh Bendahara (Atomic RPC)
  const handleOpenEdit = (tx) => {
    setEditingTx(tx)
    setEditNominal(tx.jumlah.toString())
  }

  const handleSaveEditTx = async (e) => {
    e.preventDefault()
    if (!editingTx) return

    const newNominal = parseFloat(editNominal)
    if (isNaN(newNominal) || newNominal <= 0) {
      setNotifModal({
        type: 'error',
        title: 'Nominal Tidak Valid',
        message: 'Masukkan nominal setoran yang valid!'
      })
      return
    }

    try {
      const { data, error } = await supabase.rpc('edit_transaksi_tabungan', {
        p_transaksi_id: editingTx.id,
        p_jumlah_baru: newNominal
      })

      if (error) throw error

      if (data?.success) {
        setEditingTx(null)
        setNotifModal({
          type: 'success',
          title: 'Pembaruan Berhasil',
          message: 'Nominal setoran berhasil diperbarui secara atomik!'
        })
        fetchData()
      } else {
        throw new Error(data?.message || 'Gagal memperbarui setoran.')
      }
    } catch (err) {
      setNotifModal({
        type: 'error',
        title: 'Gagal Memperbarui',
        message: err.message
      })
    }
  }

  const formatRupiah = (val) => 'Rp ' + (parseFloat(val || 0)).toLocaleString('id-ID')

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* FORM INPUT SETORAN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-7">
        <form onSubmit={handleSubmitSetoran} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* SEARCH-AS-YOU-TYPE COMBOBOX SISWA */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                Pilih Nama Siswa <span className="text-rose-500">*</span>
              </label>

              {selectedSiswa ? (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-black text-slate-800 truncate">{selectedSiswa.nama_lengkap}</p>
                    <p className="text-[11px] font-mono text-slate-500">NISN: {selectedSiswa.nisn}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSiswa(null)
                      setStudentSearchInput('')
                      setIsDropdownOpen(true)
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-all shrink-0 shadow-2xs"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik nama siswa atau NISN..."
                    value={studentSearchInput}
                    onChange={(e) => {
                      setStudentSearchInput(e.target.value)
                      setIsDropdownOpen(true)
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>

                  {/* FLOATING DROPDOWN RESULTS */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                      {filteredStudentsCombobox.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                          Tidak ditemukan siswa yang cocok dengan "{studentSearchInput}"
                        </div>
                      ) : (
                        filteredStudentsCombobox.map(s => (
                          <div
                            key={s.nisn}
                            onClick={() => {
                              setSelectedSiswa(s)
                              setIsDropdownOpen(false)
                            }}
                            className="p-3 hover:bg-amber-50 cursor-pointer transition-colors flex items-center justify-between gap-2"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-800">{s.nama_lengkap}</p>
                              <p className="text-[10px] font-mono text-slate-500">NISN: {s.nisn}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                              Kelas {s.kelas}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TANGGAL SETORAN */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                Tanggal Setoran <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={transTanggal}
                onChange={(e) => setTransTanggal(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
            </div>
          </div>

          {/* NOMINAL SETORAN */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              Nominal Setoran (Rp) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 font-black text-slate-400 text-sm">Rp</span>
              <input
                type="number"
                value={transNominal}
                onChange={(e) => setTransNominal(e.target.value)}
                placeholder="Contoh: 10000"
                min="1000"
                step="500"
                required
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
            </div>

            {/* PRESET NOMINAL SHORTCUTS */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="text-[11px] text-slate-500 font-bold mr-1">Tambah Cepat:</span>
              {[5000, 10000, 20000, 50000, 100000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAdd(amt)}
                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all shadow-2xs"
                >
                  +{amt.toLocaleString('id-ID')}
                </button>
              ))}
              {transNominal && (
                <button
                  type="button"
                  onClick={() => setTransNominal('')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all ml-auto"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* BUTTON SIMPAN */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm tracking-wide transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Menyimpan Setoran...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Simpan Setoran Tabungan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* HISTORI TRANSAKSI YANG DIINPUT BENDAHARA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-base border border-amber-100">
              📜
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">Daftar Setoran Kelas yang Diinput</h3>
              <p className="text-[11px] text-slate-500 font-medium">Riwayat pencatatan setoran tabungan untuk Kelas {kelasSaya}</p>
            </div>
          </div>
          <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 rounded-full text-xs font-bold border border-amber-200">
            {historiInput.length} Transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4">Tanggal</th>
                <th className="py-3.5 px-4">Nama Siswa</th>
                <th className="py-3.5 px-4 text-right">Nominal Setoran</th>
                <th className="py-3.5 px-4 text-center">Status Verifikasi</th>
                <th className="py-3.5 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    Memuat data setoran...
                  </td>
                </tr>
              ) : historiInput.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    Belum ada setoran yang diinput. Gunakan formulir di atas untuk mencatat setoran tabungan siswa.
                  </td>
                </tr>
              ) : (
                historiInput.map((t, idx) => {
                  const student = semuaSiswaKelas.find(s => s.nisn === t.siswa_nisn)
                  const namaSiswa = student?.nama_lengkap || t.siswa_nisn

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        <div>{namaSiswa}</div>
                        <div className="text-[10px] font-mono text-slate-400">NISN: {t.siswa_nisn}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm whitespace-nowrap">
                        +{formatRupiah(t.jumlah)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {t.status_verifikasi === 'VERIFIED' ? (
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-extrabold rounded-full border border-emerald-300 inline-flex items-center gap-1">
                            <span>✅</span> Terverifikasi
                          </span>
                        ) : t.status_verifikasi === 'REJECTED' ? (
                          <span className="px-3 py-1 bg-rose-100 text-rose-800 text-[11px] font-extrabold rounded-full border border-rose-300 inline-flex items-center gap-1">
                            <span>❌</span> Ditolak
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[11px] font-extrabold rounded-full border border-amber-300 inline-flex items-center gap-1">
                            <span>⏳</span> Menunggu Wali Kelas
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
                            title="Edit Nominal Setoran"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTx(t)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
                            title="Hapus Catatan Setoran"
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL EDIT SETORAN BENDAHARA */}
      {editingTx && createPortal(
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl flex items-center justify-center z-[99999] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <span>✏️</span> Edit Nominal Setoran Tabungan
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Siswa</label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-800">
                  {semuaSiswaKelas.find(s => s.nisn === editingTx.siswa_nisn)?.nama_lengkap || editingTx.siswa_nisn}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                  Nominal Setoran Baru (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 font-black text-slate-400 text-sm">Rp</span>
                  <input
                    type="number"
                    value={editNominal}
                    onChange={(e) => setEditNominal(e.target.value)}
                    required
                    min="1000"
                    step="500"
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* PROFESSIONAL CUSTOM NOTIFICATION MODAL */}
      {notifModal && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 animate-fade-in">
          <div 
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-xl transition-all"
            onClick={() => setNotifModal(null)} 
          />
          <div className="relative bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 flex flex-col items-center text-center space-y-4 animate-scale-in">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-xs ring-8 ${
              notifModal.type === 'success' ? 'bg-emerald-100 text-emerald-600 ring-emerald-50' : 'bg-rose-100 text-rose-600 ring-rose-50'
            }`}>
              {notifModal.type === 'success' ? '✅' : '❌'}
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">{notifModal.title}</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">{notifModal.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotifModal(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-all"
            >
              Mengerti
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
