import { useState, useCallback } from 'react'

/**
 * useConfirm — Custom hook untuk menampilkan ConfirmModal sebagai pengganti window.confirm()
 * 
 * Cara penggunaan:
 * 
 * const { confirmState, requestConfirm, ConfirmModalComponent } = useConfirm()
 * 
 * // Di JSX, tambahkan komponen:
 * {ConfirmModalComponent}
 * 
 * // Untuk meminta konfirmasi:
 * const confirmed = await requestConfirm({
 *   title: 'Hapus Data?',
 *   message: 'Tindakan ini tidak dapat dibatalkan.',
 *   confirmLabel: 'Hapus',
 *   confirmColor: 'red',
 *   icon: 'danger',
 * })
 * if (!confirmed) return
 * // lanjutkan tindakan...
 */

import ConfirmModal from '../components/ConfirmModal'

export function useConfirm() {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya, Lanjutkan',
    cancelLabel: 'Batal',
    confirmColor: 'red',
    icon: 'warning',
    resolve: null,
  })

  const requestConfirm = useCallback(({
    title = 'Konfirmasi Tindakan',
    message = 'Apakah Anda yakin ingin melanjutkan?',
    confirmLabel = 'Ya, Lanjutkan',
    cancelLabel = 'Batal',
    confirmColor = 'red',
    icon = 'warning',
  } = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        confirmColor,
        icon,
        resolve,
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setConfirmState(prev => {
      prev.resolve?.(true)
      return { ...prev, isOpen: false }
    })
  }, [])

  const handleCancel = useCallback(() => {
    setConfirmState(prev => {
      prev.resolve?.(false)
      return { ...prev, isOpen: false }
    })
  }, [])

  const ConfirmModalComponent = (
    <ConfirmModal
      isOpen={confirmState.isOpen}
      title={confirmState.title}
      message={confirmState.message}
      confirmLabel={confirmState.confirmLabel}
      cancelLabel={confirmState.cancelLabel}
      confirmColor={confirmState.confirmColor}
      icon={confirmState.icon}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirmState, requestConfirm, ConfirmModalComponent }
}
