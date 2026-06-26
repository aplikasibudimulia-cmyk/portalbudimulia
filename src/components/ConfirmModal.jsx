import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * ConfirmModal — Modal konfirmasi custom yang menggantikan window.confirm()
 * 
 * Props:
 *  - isOpen: boolean — apakah modal ditampilkan
 *  - title: string — judul modal
 *  - message: string — pesan/deskripsi tindakan
 *  - onConfirm: () => void — callback saat tombol konfirmasi diklik
 *  - onCancel: () => void — callback saat tombol batal / backdrop diklik
 *  - confirmLabel: string — label tombol konfirmasi (default: "Ya, Lanjutkan")
 *  - cancelLabel: string — label tombol batal (default: "Batal")
 *  - confirmColor: 'red' | 'indigo' | 'green' — warna tombol konfirmasi (default: 'red')
 *  - icon: 'warning' | 'danger' | 'info' — ikon yang ditampilkan di atas (default: 'warning')
 */
function ConfirmModal({
  isOpen,
  title = 'Konfirmasi Tindakan',
  message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
  onConfirm,
  onCancel,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  confirmColor = 'red',
  icon = 'warning',
}) {
  // Lock scroll saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const colorMap = {
    red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    indigo: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
    green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  }

  const iconBgMap = {
    warning: 'bg-amber-100',
    danger: 'bg-red-100',
    info: 'bg-blue-100',
  }

  const iconColorMap = {
    warning: 'text-amber-600',
    danger: 'text-red-600',
    info: 'text-blue-600',
  }

  const btnColor = colorMap[confirmColor] || colorMap.red
  const iconBg = iconBgMap[icon] || iconBgMap.warning
  const iconColor = iconColorMap[icon] || iconColorMap.warning

  const IconDisplay = () => {
    if (icon === 'danger') {
      return (
        <svg className={`w-6 h-6 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )
    }
    if (icon === 'info') {
      return (
        <svg className={`w-6 h-6 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
    }
    // Default: warning
    return (
      <svg className={`w-6 h-6 ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal Card */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-up border border-slate-100">
        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-4 ring-8 ring-white`}>
            <IconDisplay />
          </div>

          {/* Title */}
          <h3
            id="confirm-modal-title"
            className="text-lg font-bold text-slate-800 mb-2"
          >
            {title}
          </h3>

          {/* Message */}
          <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 px-4 rounded-xl text-white font-bold text-sm transition-all shadow-sm focus:outline-none focus:ring-2 active:scale-95 ${btnColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal
