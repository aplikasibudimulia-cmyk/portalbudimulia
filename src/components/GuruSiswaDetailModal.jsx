import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const StudentAvatar = ({ student, fotos, className }) => {
  const DEFAULT_AVATAR = `https://ui-avatars.com/api/?name=${encodeURIComponent(student?.nama_lengkap || 'Siswa')}&background=eff6ff&color=2563eb&size=150`
  const sPhoto = fotos?.find(f => f.nisn === student?.nisn)?.cloudinary_url || DEFAULT_AVATAR

  const [imgSrc, setImgSrc] = useState(sPhoto)

  useEffect(() => {
    setImgSrc(sPhoto)
  }, [sPhoto])

  return (
    <img
      src={imgSrc}
      alt={student?.nama_lengkap || 'Siswa'}
      className={className}
      onError={() => {
        if (imgSrc !== DEFAULT_AVATAR) {
          setImgSrc(DEFAULT_AVATAR)
        }
      }}
    />
  )
}

// Helper to normalize presensi status (database stores 'H', 'T', 'S', 'I', 'A' or full names)
const parsePresensiStatus = (rawStatus) => {
  if (!rawStatus) return { code: 'H', label: 'Hadir', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  const s = String(rawStatus).trim().toUpperCase()
  if (s === 'H' || s === 'HADIR') return { code: 'H', label: 'Hadir', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (s === 'T' || s === 'TERLAMBAT') return { code: 'T', label: 'Terlambat', badge: 'bg-amber-100 text-amber-800 border-amber-200' }
  if (s === 'S' || s === 'SAKIT') return { code: 'S', label: 'Sakit', badge: 'bg-blue-100 text-blue-800 border-blue-200' }
  if (s === 'I' || s === 'IZIN') return { code: 'I', label: 'Izin', badge: 'bg-purple-100 text-purple-800 border-purple-200' }
  if (s === 'A' || s === 'ALPA' || s.includes('TANPA')) return { code: 'A', label: 'Alpa', badge: 'bg-rose-100 text-rose-800 border-rose-200' }
  return { code: s, label: rawStatus, badge: 'bg-slate-100 text-slate-700 border-slate-200' }
}

export default function GuruSiswaDetailModal({ student, fotos, activeTa, onClose, setActiveMenu }) {
  const [activeTab, setActiveTab] = useState('poin') // 'poin' | 'presensi' | 'biodata'
  const [loading, setLoading] = useState(true)

  // Data states
  const [biodata, setBiodata] = useState(null)
  const [studentPoint, setStudentPoint] = useState(null)
  const [pointRecords, setPointRecords] = useState([])
  const [presensiRecords, setPresensiRecords] = useState([])
  const [selectedPresensiDetail, setSelectedPresensiDetail] = useState(null)

  // Presensi summary stats
  const [presensiStats, setPresensiStats] = useState({
    hadir: 0,
    terlambat: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    total: 0
  })

  useEffect(() => {
    if (!student?.nisn) return

    const loadStudentData = async () => {
      setLoading(true)
      try {
        // 1. Fetch biodata from siswa_permanent
        const { data: permData } = await supabase
          .from('siswa_permanent')
          .select('*')
          .eq('nisn', student.nisn)
          .maybeSingle()

        if (permData) setBiodata(permData)

        // 2. Fetch point stats from student_points
        let pointQuery = supabase.from('student_points').select('*').eq('nisn', student.nisn)
        if (activeTa?.id) pointQuery = pointQuery.eq('tahun_ajaran_id', activeTa.id)
        const { data: ptData } = await pointQuery.maybeSingle()
        setStudentPoint(ptData || { total_poin: 100, poin_default: 100, tahap_pembinaan_aktif: 'Bebas Pembinaan' })

        // 3. Fetch point records history
        let recordsQuery = supabase.from('point_records').select('*').eq('nisn', student.nisn).order('created_at', { ascending: false })
        if (activeTa?.id) recordsQuery = recordsQuery.eq('tahun_ajaran_id', activeTa.id)
        const { data: pRecords } = await recordsQuery.limit(50)
        setPointRecords(pRecords || [])

        // 4. Fetch presensi harian history
        const { data: presRecords } = await supabase
          .from('presensi_harian')
          .select('*')
          .eq('siswa_nisn', student.nisn)
          .order('tanggal', { ascending: false })
          .limit(100)

        const pList = presRecords || []
        setPresensiRecords(pList)

        // Calculate summary stats using parsePresensiStatus
        const stats = { hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, total: pList.length }
        pList.forEach(r => {
          const parsed = parsePresensiStatus(r.status)
          if (parsed.code === 'H') stats.hadir++
          else if (parsed.code === 'T') stats.terlambat++
          else if (parsed.code === 'S') stats.sakit++
          else if (parsed.code === 'I') stats.izin++
          else if (parsed.code === 'A') stats.alpa++
        })
        setPresensiStats(stats)
      } catch (err) {
        console.warn('Gagal memuat detail siswa:', err)
      } finally {
        setLoading(false)
      }
    }

    loadStudentData()
  }, [student, activeTa])

  if (!student) return null

  // Format WhatsApp Link from Orang Tua filled biodata
  const namaOrtu = biodata?.nama_ortu || biodata?.nama_ayah || biodata?.nama_ibu || '-'
  const emailOrtu = biodata?.email_ortu || '-'
  const rawPhone = biodata?.no_hp_ortu || biodata?.no_whatsapp || student.no_hp_ortu || ''
  const cleanPhone = rawPhone.replace(/\D/g, '')
  const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone
  const waLink = waPhone ? `https://wa.me/${waPhone}` : null

  const formatTgl = (str) => {
    if (!str) return '-'
    try {
      return new Date(str).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return str
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header Profile Banner */}
        <div className="relative bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-5 text-white shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-white/40 overflow-hidden bg-white/10 shrink-0 shadow-md">
              <StudentAvatar student={student} fotos={fotos} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 bg-white/20 text-white rounded-full text-xs font-black tracking-wider uppercase backdrop-blur-sm">
                  Kelas {student.kelas}
                </span>
                <span className="px-2.5 py-0.5 bg-emerald-400/30 text-emerald-100 rounded-full text-xs font-bold border border-emerald-300/40">
                  Siswa Aktif
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white mt-1 truncate leading-snug">
                {student.nama_lengkap}
              </h2>
              <p className="text-xs text-indigo-100/90 font-medium">
                NISN: {student.nisn || '-'} {student.nipd ? `• NIPD: ${student.nipd}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-1 shrink-0 text-xs font-bold">
          <button
            onClick={() => setActiveTab('poin')}
            className={`px-4 py-2.5 rounded-t-xl transition-all border-t border-x ${
              activeTab === 'poin'
                ? 'bg-white text-indigo-700 border-slate-200 border-b-transparent shadow-xs font-black'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            ⚠️ Detail Poin ({pointRecords.length})
          </button>
          <button
            onClick={() => setActiveTab('presensi')}
            className={`px-4 py-2.5 rounded-t-xl transition-all border-t border-x ${
              activeTab === 'presensi'
                ? 'bg-white text-indigo-700 border-slate-200 border-b-transparent shadow-xs font-black'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            🕒 Rekap Presensi ({presensiStats.total})
          </button>
          <button
            onClick={() => setActiveTab('biodata')}
            className={`px-4 py-2.5 rounded-t-xl transition-all border-t border-x ${
              activeTab === 'biodata'
                ? 'bg-white text-indigo-700 border-slate-200 border-b-transparent shadow-xs font-black'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            👤 Informasi Ortu
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : activeTab === 'poin' ? (
            /* TAB 1: DETAIL POIN */
            <div className="space-y-4">
              {/* Poin Scoreboard */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Poin Siswa</div>
                  <div className={`text-2xl font-black mt-0.5 ${
                    (studentPoint?.total_poin ?? 100) >= 80 ? 'text-emerald-600' : (studentPoint?.total_poin ?? 100) >= 60 ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {studentPoint?.total_poin ?? 100}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poin Default</div>
                  <div className="text-2xl font-black text-slate-700 mt-0.5">
                    {studentPoint?.poin_default ?? 100}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status Pembinaan</div>
                  <div className="text-xs font-extrabold text-indigo-700 mt-2 bg-indigo-50 border border-indigo-100 py-1 px-2 rounded-lg truncate">
                    {studentPoint?.tahap_pembinaan_aktif || 'Bebas Pembinaan'}
                  </div>
                </div>
              </div>

              {/* Action bar for Poin */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Riwayat Pencatatan Poin
                </h4>
                {setActiveMenu && (
                  <button
                    onClick={() => {
                      onClose()
                      setActiveMenu('catat_poin')
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                  >
                    <span>+ Catat Poin Siswa Ini</span>
                  </button>
                )}
              </div>

              {/* Point Records List */}
              {pointRecords.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 font-medium">
                  Belum ada catatan poin untuk siswa ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {pointRecords.map((rec) => {
                    const val = Number(rec.poin_diberikan) || 0
                    const isPos = val > 0

                    return (
                      <div
                        key={rec.id}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          isPos
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-rose-50/50 border-rose-200'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">
                            {rec.jenis || rec.keterangan || 'Catatan Poin'}
                          </div>
                          {rec.keterangan && rec.jenis && rec.keterangan !== rec.jenis && (
                            <p className="text-[11px] text-slate-500 italic">"{rec.keterangan}"</p>
                          )}
                          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-2 pt-1">
                            <span>📅 {formatTgl(rec.tanggal)}</span>
                            {rec.dicatat_oleh && <span>• oleh {rec.dicatat_oleh}</span>}
                          </div>
                        </div>

                        <span
                          className={`font-black text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
                            isPos
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}
                        >
                          {isPos ? `+${val}` : `${val}`} Poin
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'presensi' ? (
            /* TAB 2: REKAP PRESENSI */
            <div className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center text-xs">
                <div className="bg-emerald-50 border border-emerald-200 p-2 sm:p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Hadir</div>
                  <div className="text-base sm:text-lg font-black text-emerald-700 mt-0.5">{presensiStats.hadir}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2 sm:p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-700 uppercase">Terlambat</div>
                  <div className="text-base sm:text-lg font-black text-amber-700 mt-0.5">{presensiStats.terlambat}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-2 sm:p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Sakit</div>
                  <div className="text-base sm:text-lg font-black text-blue-700 mt-0.5">{presensiStats.sakit}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-2 sm:p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-purple-700 uppercase">Izin</div>
                  <div className="text-base sm:text-lg font-black text-purple-700 mt-0.5">{presensiStats.izin}</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-2 sm:p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">Alpa</div>
                  <div className="text-base sm:text-lg font-black text-rose-700 mt-0.5">{presensiStats.alpa}</div>
                </div>
              </div>

              {/* Presensi List Table */}
              <div className="pt-1">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                  Riwayat Presensi ({presensiRecords.length} Catatan)
                </h4>

                {presensiRecords.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 font-medium">
                    Belum ada data presensi harian untuk siswa ini.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                          <tr>
                            <th className="p-2.5">Tanggal</th>
                            <th className="p-2.5">Tipe</th>
                            <th className="p-2.5">Waktu</th>
                            <th className="p-2.5">Status</th>
                            <th className="p-2.5 text-right">Detail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {presensiRecords.map((p) => {
                            const parsed = parsePresensiStatus(p.status)

                            return (
                              <tr
                                key={p.id}
                                onClick={() => setSelectedPresensiDetail({ ...p, parsedStatus: parsed })}
                                className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                              >
                                <td className="p-2.5 font-medium text-slate-800">{formatTgl(p.tanggal)}</td>
                                <td className="p-2.5 font-bold uppercase text-[10px] text-slate-500">
                                  {p.tipe || 'MASUK'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-700">{p.waktu || '-'}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${parsed.badge}`}>
                                    {parsed.label}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right">
                                  <button className="text-[10px] font-bold text-indigo-600 hover:underline">
                                    Lihat &rarr;
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* TAB 3: INFORMASI ORTU (Nama, No HP, Email) */
            <div className="space-y-4 text-xs">
              {/* Contact WhatsApp Banner */}
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between p-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                    </svg>
                    <div>
                      <div>Hubungi Orang Tua via WhatsApp</div>
                      <div className="text-[10px] font-normal text-emerald-100">{rawPhone}</div>
                    </div>
                  </div>
                  <span className="text-[11px] bg-white/20 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                    Kirim Pesan &rarr;
                  </span>
                </a>
              )}

              {/* Info Grid: Nama Orang Tua, Nomor HP, Email */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="text-xs font-bold text-slate-800">Biodata Kontak Orang Tua / Wali</span>
                  <span className="text-[10px] font-medium text-slate-400 italic">Diisi melalui Login Orang Tua</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nama Orang Tua / Wali</span>
                    <span className="font-bold text-slate-800 text-sm">{namaOrtu}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nomor HP / WhatsApp</span>
                    <span className="font-bold text-indigo-700 text-sm">{rawPhone || '-'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Orang Tua</span>
                    <span className="font-bold text-slate-800 text-sm">{emailOrtu}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">SMP Budi Mulia Jakarta</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Sub-modal: Presensi Item Detail */}
      {selectedPresensiDetail && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setSelectedPresensiDetail(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl space-y-3 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-slate-800 text-sm">Detail Presensi Harian</h4>
              <button onClick={() => setSelectedPresensiDetail(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs">✕</button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-semibold">Tanggal:</span>
                <span className="font-bold text-slate-800">{formatTgl(selectedPresensiDetail.tanggal)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-semibold">Tipe:</span>
                <span className="font-bold uppercase text-indigo-700">{selectedPresensiDetail.tipe || 'MASUK'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-semibold">Waktu Presensi:</span>
                <span className="font-mono font-bold text-slate-800">{selectedPresensiDetail.waktu || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-semibold">Status:</span>
                <span className={`px-2 py-0.5 rounded font-bold text-[11px] border ${selectedPresensiDetail.parsedStatus?.badge}`}>
                  {selectedPresensiDetail.parsedStatus?.label}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400 font-semibold">Metode:</span>
                <span className="font-medium text-slate-700">{selectedPresensiDetail.metode || 'QR Code / Tap'}</span>
              </div>
              {selectedPresensiDetail.keterangan && (
                <div className="pt-1">
                  <span className="text-slate-400 font-semibold block">Catatan / Keterangan:</span>
                  <p className="text-slate-700 italic bg-slate-50 p-2 rounded-lg mt-1">{selectedPresensiDetail.keterangan}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedPresensiDetail(null)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs mt-2"
            >
              Tutup Detail Presensi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
