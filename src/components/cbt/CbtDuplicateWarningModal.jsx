import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * CbtDuplicateWarningModal — Modal Peringatan Khusus untuk Butir Soal Duplikat
 * 
 * Menampilkan daftar butir soal yang sama persis (baik internal file maupun terhadap editor),
 * dan memberikan pilihan tindakan:
 * 1. Lewati Duplikat (Hanya impor soal unik)
 * 2. Tetap Impor Semua (Termasuk duplikat)
 * 3. Batal Impor
 */
export default function CbtDuplicateWarningModal({
  isOpen,
  duplicates = [],
  totalUploaded = 0,
  uniqueCount = 0,
  onSkipDuplicates,
  onKeepAll,
  onCancel,
  title = 'Terdeteksi Butir Soal Duplikat!',
  context = 'impor'
}) {
  // Cegah scroll pada body saat modal aktif
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Tutup jika tekan ESC
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen || !duplicates || duplicates.length === 0) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/65 backdrop-blur-md transition-opacity"
        onClick={onCancel}
      />

      {/* Modal Container */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header Bagian Atas */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 border-b border-slate-100 bg-amber-50/50">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-200/80 text-amber-800">
                Peringatan Upload
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                {duplicates.length} Soal Duplikat
              </span>
            </div>
            <h3 id="duplicate-modal-title" className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Sistem menemukan butir soal yang isinya sama persis. Anda dapat memilih untuk melewati butir duplikat tersebut atau tetap memasukkan semuanya.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            title="Tutup"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Daftar Soal Duplikat */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Rincian Soal yang Sama Persis:</span>
            <span className="text-slate-400 font-normal">
              Total file: {totalUploaded} soal | Unik: {uniqueCount} soal
            </span>
          </div>

          <div className="space-y-2.5">
            {duplicates.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/90 rounded-2xl transition-colors space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md">
                      Soal #{item.nomor}
                    </span>
                    <span className="text-slate-400 text-sm">➔</span>
                    <span className="text-slate-600">
                      Sama dengan{' '}
                      <strong className="text-slate-800">
                        Soal #{item.duplicateOfNomor}
                      </strong>{' '}
                      {item.isExisting ? (
                        <span className="text-indigo-600 font-medium">(Sudah ada di editor)</span>
                      ) : (
                        <span className="text-slate-500 font-medium">(Di berkas upload)</span>
                      )}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      item.type === 'exact'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.type === 'exact' ? 'Sama Persis' : 'Pertanyaan Sama'}
                  </span>
                </div>

                <div className="bg-white px-3 py-2 rounded-xl border border-slate-200/60 text-xs text-slate-600 italic leading-relaxed">
                  "{item.snippet}"
                </div>
              </div>
            ))}
          </div>

          {/* Kotak Saran / Rekomendasi */}
          <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-800">
            <span className="text-base leading-none">💡</span>
            <div className="space-y-0.5">
              <span className="font-bold">Rekomendasi Terbaik:</span>
              <p className="text-emerald-700 text-[11px] leading-relaxed">
                Pilih <strong>"Lewati Soal Duplikat"</strong> agar hanya <strong>{uniqueCount} butir soal unik</strong> yang dimasukkan. Butir soal ganda akan diabaikan secara otomatis.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Tombol Aksi */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors cursor-pointer text-center"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onKeepAll}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs transition-colors cursor-pointer text-center shadow-xs"
          >
            Tetap Impor Semua ({totalUploaded} Soal)
          </button>

          <button
            type="button"
            onClick={onSkipDuplicates}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition-all cursor-pointer text-center shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Lewati Duplikat (Impor {uniqueCount} Soal)</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
