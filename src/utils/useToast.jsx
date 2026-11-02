import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * useToast — Hook untuk menampilkan notifikasi toast mengambang yang modern & profesional
 * 
 * Penggunaan:
 * const { showToast, ToastComponent } = useToast()
 * 
 * showToast('Data berhasil disimpan!', 'success')
 * showToast('Gagal memproses permintaan: ' + err.message, 'error')
 * showToast('Perhatian: waktu ujian tersisa 10 menit', 'warning')
 * showToast('Memuat data...', 'info')
 * 
 * Di JSX komponen:
 * {ToastComponent}
 */
export function useToast() {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    if (!message) return
    setToast({
      id: Date.now(),
      message,
      type, // 'success' | 'error' | 'warning' | 'info'
      duration,
    })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => {
      setToast(null)
    }, toast.duration || 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const ToastComponent = toast ? createPortal(
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[999999] animate-slide-down pointer-events-none max-w-md w-full px-4">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 text-white shadow-2xl backdrop-blur-md border border-slate-700/60 pointer-events-auto text-xs font-semibold">
        {toast.type === 'success' && (
          <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
        {toast.type === 'error' && (
          <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
        {toast.type === 'warning' && (
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
        )}
        {toast.type === 'info' && (
          <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        )}
        <span className="flex-1 leading-relaxed text-slate-100">{toast.message}</span>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-md hover:bg-slate-800"
          aria-label="Tutup notifikasi"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  ) : null

  return { toast, showToast, ToastComponent }
}
