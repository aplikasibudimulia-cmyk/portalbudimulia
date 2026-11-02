/**
 * Mengembalikan Base URL resmi portal eBudiMulia.
 * Jika aplikasi dibuka dari Android (Capacitor yang berjalan di https://localhost)
 * atau saat development lokal, fungsi ini otomatis mengembalikan domain resmi:
 * 'https://edu.smpbudimuliajakarta.sch.id' agar tautan yang dikirim via WhatsApp,
 * QR code cetak, dan tautan luar tidak pernah mengarah ke localhost.
 */
export function getPortalBaseUrl() {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin || ''
    if (
      !origin ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('capacitor://')
    ) {
      return import.meta.env.VITE_PUBLIC_PORTAL_URL || 'https://edu.smpbudimuliajakarta.sch.id'
    }
    return origin
  }
  return import.meta.env.VITE_PUBLIC_PORTAL_URL || 'https://edu.smpbudimuliajakarta.sch.id'
}
