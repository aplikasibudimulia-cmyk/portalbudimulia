import React, { useState } from 'react'

export default function SiswaCbtTokenModal({
  sesi,
  student,
  isOpen,
  onClose,
  onSubmitToken,
  loading = false,
  error = null
}) {
  const [token, setToken] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [validationError, setValidationError] = useState(null)

  if (!isOpen || !sesi) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setValidationError(null)
    if (!token.trim()) return
    if (!agreed) {
      setValidationError('Silakan centang pakta kejujuran terlebih dahulu.')
      return
    }
    onSubmitToken(token.trim().toUpperCase())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-7 shadow-2xl border border-slate-100 space-y-5 animate-scale-up">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              Konfirmasi Pelaksanaan Ujian
            </span>
            <h3 className="text-lg font-bold text-slate-800">
              {sesi.judul}
            </h3>
          </div>
          <button 
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Informasi Ringkas Ujian */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Mata Pelajaran</span>
            <span className="font-bold text-slate-800">{sesi.mapel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Kelas Peserta</span>
            <span className="font-bold text-slate-800">{student?.kelas || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Alokasi Waktu</span>
            <span className="font-bold text-slate-800">{sesi.durasi_menit} Menit</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Target KKTP</span>
            <span className="font-bold text-indigo-600">{sesi.kkm || 75.0}</span>
          </div>
        </div>

        {/* Form Token & Pakta Kejujuran */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Masukkan Token Ujian Ruang Kelas
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Token diberikan oleh guru pengawas di ruang kelas Anda (contoh: 7A-K8X).
            </p>
            <input
              type="text"
              required
              autoFocus
              maxLength={12}
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="CONTOH: 7A-X9K"
              className="w-full text-center font-mono text-lg font-bold tracking-widest uppercase px-4 py-3 bg-slate-50 border-2 border-indigo-200 focus:border-indigo-600 rounded-2xl focus:outline-none transition-all text-slate-800"
            />
          </div>

          {/* Pakta Kejujuran */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-indigo-900 leading-snug">
              Saya menyatakan akan mengerjakan ujian ini secara <strong>mandiri, jujur, dan tertib</strong> tanpa membuka aplikasi lain maupun bekerja sama dengan pihak mana pun.
            </span>
          </label>

          {(error || validationError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{validationError || error}</span>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Kembali ke Portal
            </button>
            <button
              type="submit"
              disabled={loading || !token.trim() || !agreed}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin text-sm">⟳</span>
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Mulai Lembar Ujian →</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
