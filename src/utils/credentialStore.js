/**
 * credentialStore.js
 *
 * Utility penyimpanan akun multi-login di localStorage.
 * Menyimpan credential secara langsung tanpa enkripsi/obfuscation yang berisiko merusak karakter password.
 */

const STORAGE_KEY = 'ebudimulia_saved_accounts'
const MAX_ACCOUNTS = 6

/**
 * Menyimpan akun ke daftar akun tersimpan di localStorage.
 * @param {Object} account - { id, role, username, password, displayName, className, avatarUrl, lastLogin }
 */
export function saveAccount(account) {
  try {
    const existing = loadAccounts()
    const filtered = existing.filter(
      a => a.id !== account.id &&
           (a.username?.toLowerCase() !== account.username?.toLowerCase() || a.role !== account.role)
    )
    const cleanAccount = {
      id: account.id,
      role: account.role,
      username: account.username,
      password: account.password,
      displayName: account.displayName,
      className: account.className || '',
      avatarUrl: account.avatarUrl || null,
      lastLogin: account.lastLogin || Date.now()
    }
    const updated = [cleanAccount, ...filtered].slice(0, MAX_ACCOUNTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return updated
  } catch (e) {
    console.warn('[credentialStore] Gagal menyimpan akun:', e)
    return []
  }
}

/**
 * Membaca semua akun tersimpan dari localStorage.
 * @returns {Array} daftar akun
 */
export function loadAccounts() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

/**
 * Menghapus satu akun dari daftar tersimpan berdasarkan id.
 * @param {string} id - id akun yang dihapus
 * @returns {Array} daftar akun yang tersisa
 */
export function removeAccount(id) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const accounts = stored ? JSON.parse(stored) : []
    const updated = accounts.filter(a => a.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return updated
  } catch {
    return []
  }
}
