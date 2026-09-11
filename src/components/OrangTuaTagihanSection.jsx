import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { BULAN_AJARAN } from './TagihanSppSection'

const BCA_PREFIX_DEFAULT = '5090300'

export default function OrangTuaTagihanSection({ studentData }) {
  const [loading, setLoading] = useState(true)
  const [tagihanList, setTagihanList] = useState([])
  const [tarifSiswa, setTarifSiswa] = useState(800000)
  const [nomorVa, setNomorVa] = useState('')
  const [copiedVa, setCopiedVa] = useState(false)

  const loadStudentTagihan = async () => {
    if (!studentData?.nisn) return
    setLoading(true)
    try {
      const nisn = String(studentData.nisn).trim()

      // 1. Ambil tarif khusus & VA jika ada
      const { data: tarifData } = await supabase
        .from('tarif_spp_siswa')
        .select('*')
        .eq('siswa_nisn', nisn)
        .maybeSingle()

      if (tarifData) {
        setTarifSiswa(Number(tarifData.nominal_spp || 800000))
        setNomorVa(tarifData.nomor_va_bca || `${BCA_PREFIX_DEFAULT}${studentData.no_induk || nisn}`)
      } else {
        setNomorVa(`${BCA_PREFIX_DEFAULT}${studentData.no_induk || nisn}`)
      }

      // 2. Ambil data tagihan SPP
      const { data: tagihanData, error } = await supabase
        .from('tagihan_spp')
        .select('*')
        .eq('siswa_nisn', nisn)
        .order('bulan', { ascending: true })

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching tagihan ortu:', error)
      }

      setTagihanList(tagihanData || [])
    } catch (err) {
      console.error('Error loadStudentTagihan:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStudentTagihan()
  }, [studentData])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedVa(true)
    setTimeout(() => setCopiedVa(false), 2500)
  }

  // Helper: Dapatkan indeks bulan ajaran saat ini (1=Juli, 2=Agustus, ..., 12=Juni)
  const currentAcademicMonthId = useMemo(() => {
    const calMonth = new Date().getMonth() + 1 // 1..12
    if (calMonth >= 7) return calMonth - 6 // Jul=1, Agu=2, ..., Des=6
    return calMonth + 6 // Jan=7, Feb=8, ..., Jun=12
  }, [])

  // Kalkulasi Ringkasan
  const tagihanMap = {}
  tagihanList.forEach(t => { tagihanMap[t.bulan] = t })

  let totalTagihanSetahun = 0
  let totalTagihanJatuhTempo = 0
  let totalSudahBayar = 0
  let totalTunggakan = 0
  const monthsData = []

  BULAN_AJARAN.forEach(b => {
    const t = tagihanMap[b.id]
    const nominalTagihan = t ? Number(t.nominal_tagihan) : tarifSiswa
    const nominalDibayar = t ? Number(t.nominal_dibayar || 0) : 0
    const status = t?.status || 'belum_lunas'
    const isDue = b.id <= currentAcademicMonthId
    const isFuture = b.id > currentAcademicMonthId

    totalTagihanSetahun += nominalTagihan
    totalSudahBayar += nominalDibayar
    const sisa = Math.max(0, nominalTagihan - nominalDibayar)

    // Tunggakan HANYA dihitung untuk bulan yang SUDAH JATUH TEMPO
    if (isDue) {
      totalTagihanJatuhTempo += nominalTagihan
      if (sisa > 0) {
        totalTunggakan += sisa
      }
    }

    monthsData.push({
      bulan: b,
      tagihan: t,
      nominalTagihan,
      nominalDibayar,
      status,
      sisa,
      isDue,
      isFuture
    })
  })

  return (
    <div className="space-y-6 font-sans">
      {/* Header Info VA Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-xs font-bold">
                💳 Status Tagihan SPP
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-bold">
                Siswa: {studentData?.nama_lengkap} ({studentData?.kelas})
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">
              Informasi Pembayaran SPP Sekolah
            </h2>
            <p className="text-slate-500 text-xs md:text-sm max-w-lg">
              Setiap siswa memiliki Nomor Virtual Account BCA resmi untuk kemudahan pembayaran SPP bulanan.
            </p>
          </div>

          {/* Virtual Account Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shrink-0 max-w-xs w-full text-center space-y-2">
            <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Nomor Virtual Account BCA</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl md:text-2xl font-black font-mono tracking-widest text-indigo-700">
                {nomorVa || '5090300...'}
              </span>
              <button
                onClick={() => copyToClipboard(nomorVa)}
                className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 rounded-lg text-slate-700 text-xs font-bold shadow-xs transition-all"
                title="Salin Nomor VA"
              >
                {copiedVa ? '✓ Tersalin' : '📋 Salin'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">a.n SMP Budi Mulia - {studentData?.nama_lengkap}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-bold">Tarif SPP Bulanan</p>
            <p className="text-lg font-extrabold text-slate-800 mt-0.5">Rp {tarifSiswa.toLocaleString('id-ID')}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <p className="text-xs text-slate-500 font-bold">Total Telah Dibayar</p>
            <p className="text-lg font-extrabold text-emerald-600 mt-0.5">+Rp {totalSudahBayar.toLocaleString('id-ID')}</p>
          </div>
          <div className="bg-white border-2 border-indigo-600 rounded-2xl p-4 shadow-xs col-span-2 md:col-span-1">
            <p className="text-xs text-indigo-600 font-bold">Sisa Tunggakan (Jatuh Tempo)</p>
            <p className="text-lg font-black text-rose-600 mt-0.5">
              {totalTunggakan > 0 ? `Rp ${totalTunggakan.toLocaleString('id-ID')}` : 'Rp 0 (Lancar / Lunas)'}
            </p>
          </div>
        </div>
      </div>

      {/* Grid 12 Bulan Kartu SPP */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-2">
          <div>
            <h3 className="text-lg font-extrabold text-slate-800">Buku Pembayaran SPP 1 Tahun Ajaran</h3>
            <p className="text-xs text-slate-400">Rincian status pelunasan bulan Juli s.d. Juni</p>
          </div>
          <span className={`px-3 py-1 text-xs font-bold rounded-full w-fit ${totalTunggakan === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            {totalTunggakan === 0 ? '🎉 Pembayaran Lancar (Tidak Ada Tunggakan)' : `⚠️ Ada Tunggakan Bulan Jatuh Tempo`}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
            Memuat rincian tagihan...
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {monthsData.map((m) => {
              const isLunas = m.status === 'lunas'
              const isKurang = m.status === 'kurang_bayar'
              const isDue = m.isDue
              const isFuture = m.isFuture

              return (
                <div
                  key={m.bulan.id}
                  className={`rounded-2xl p-4 border transition-all text-center flex flex-col justify-between ${
                    isLunas
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : isKurang
                      ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                      : isDue
                      ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                      : 'bg-slate-50/50 border-slate-100 text-slate-500'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bulan {m.bulan.id}</span>
                      <span className="text-xs">
                        {isLunas ? '✅' : isKurang ? '🟡' : isDue ? '❌' : '⏳'}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-800">{m.bulan.nama}</h4>
                    <p className="text-xs font-mono font-bold mt-1 text-slate-600">
                      Rp {m.nominalTagihan.toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200/60">
                    {isLunas ? (
                      <div>
                        <span className="inline-block px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold">
                          {isFuture ? 'LUNAS DI MUKA' : 'LUNAS'}
                        </span>
                        {m.tagihan?.tanggal_bayar && (
                          <p className="text-[9px] text-emerald-700 mt-1">
                            {new Date(m.tagihan.tanggal_bayar).toLocaleDateString('id-ID')}
                          </p>
                        )}
                      </div>
                    ) : isKurang ? (
                      <div>
                        <span className="inline-block px-2 py-0.5 bg-amber-500 text-white rounded text-[10px] font-bold">
                          KURANG BAYAR
                        </span>
                        <p className="text-[10px] text-amber-800 font-bold mt-0.5">
                          Sisa: Rp {m.sisa.toLocaleString('id-ID')}
                        </p>
                      </div>
                    ) : isDue ? (
                      <div>
                        <span className="inline-block px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold">
                          BELUM LUNAS
                        </span>
                        <p className="text-[9px] text-rose-600 mt-1 font-semibold">
                          Jatuh Tempo
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="inline-block px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">
                          BELUM TEMPO
                        </span>
                        <p className="text-[9px] text-slate-400 mt-1">
                          Bulan Mendatang
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Panduan Pembayaran Virtual Account */}
      <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 space-y-3">
        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span>🏦</span>
          <span>Panduan Cara Pembayaran via BCA Virtual Account</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 mb-1">📱 BCA Mobile (m-BCA):</p>
            <p>1. Pilih <strong>m-Transfer</strong> ➔ <strong>BCA Virtual Account</strong>.</p>
            <p>2. Masukkan nomor VA: <strong className="text-indigo-600">{nomorVa}</strong>.</p>
            <p>3. Masukkan nominal tagihan & selesaikan transfer.</p>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 mb-1">🏧 ATM BCA:</p>
            <p>1. Pilih menu <strong>Transaksi Lainnya</strong> ➔ <strong>Transfer</strong> ➔ <strong>Ke Rek BCA Virtual Account</strong>.</p>
            <p>2. Masukkan nomor VA: <strong className="text-indigo-600">{nomorVa}</strong>.</p>
            <p>3. Konfirmasi pembayaran.</p>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 mb-1">💳 Bank Lain (Antar Bank):</p>
            <p>1. Pilih <strong>Transfer Antar Bank</strong> ➔ Bank Tujuan: <strong>BCA (Kode: 014)</strong>.</p>
            <p>2. Masukkan nomor rekening tujuan: <strong className="text-indigo-600">{nomorVa}</strong>.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
