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
      nisn: account.nisn ? String(account.nisn) : null,
      lastLogin: account.lastLogin || Date.now()
    }
    const updated = [cleanAccount, ...filtered].slice(0, MAX_ACCOUNTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    // Otomatis daftarkan FCM push token untuk akun yang baru disimpan ke Supabase
    import('./pushNotif').then(m => {
      m.syncMultiAccountPushTokens?.(null, cleanAccount).catch(() => {})
    }).catch(() => {})

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
    const toRemove = accounts.find(a => a.id === id)
    const updated = accounts.filter(a => a.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

    if (toRemove?.nisn) {
      import('./pushNotif').then(m => {
        m.removeAccountPushToken?.(toRemove.nisn, toRemove.role).catch(() => {})
      }).catch(() => {})
    }
    return updated
  } catch {
    return []
  }
}

/**
 * Otomatis beralih ke akun yang sesuai dengan target role (Orang Tua atau Siswa).
 * Digunakan saat pengguna mengetuk notifikasi di layar usap Android.
 * @param {string} targetRole - 'Orang Tua' | 'Siswa'
 * @param {string|number} [targetNisn] - NISN siswa (opsional)
 * @returns {Promise<boolean>} true jika berhasil/sudah aktif, false jika akun tidak ditemukan
 */
export async function switchToRoleAccount(targetRole, targetNisn = null) {
  if (!targetRole) return false

  let cleanRole = targetRole
  if (targetRole.toLowerCase().includes('ortu') || targetRole.toLowerCase().includes('orang tua')) {
    cleanRole = 'Orang Tua'
  } else if (targetRole.toLowerCase().includes('siswa') || targetRole.toLowerCase().includes('murid')) {
    cleanRole = 'Siswa'
  }

  // Cek apakah session aktif saat ini sudah cocok
  const currentSiswa = localStorage.getItem('siswa_session')
  const currentOrtu = localStorage.getItem('orangtua_session')

  if (cleanRole === 'Siswa' && currentSiswa) {
    if (!targetNisn) return true
    try {
      const parsed = JSON.parse(currentSiswa)
      if (String(parsed.nisn) === String(targetNisn)) return true
    } catch {}
  } else if (cleanRole === 'Orang Tua' && currentOrtu) {
    if (!targetNisn) return true
    try {
      const parsed = JSON.parse(currentOrtu)
      if (String(parsed.nisn) === String(targetNisn)) return true
    } catch {}
  }

  // Cari akun yang sesuai di saved accounts
  const accounts = loadAccounts()
  let targetAccount = null

  if (targetNisn) {
    const nisnStr = String(targetNisn).trim()
    targetAccount = accounts.find(a =>
      a.role === cleanRole && (
        String(a.nisn) === nisnStr ||
        a.username?.includes(nisnStr) ||
        a.id?.includes(nisnStr)
      )
    )
  }

  if (!targetAccount) {
    targetAccount = accounts.find(a => a.role === cleanRole)
  }

  if (!targetAccount || !targetAccount.username || !targetAccount.password) {
    console.log(`[credentialStore] Tidak ada akun tersimpan untuk role: ${cleanRole}`)
    return false
  }

  try {
    const { supabase } = await import('../supabaseClient')
    let rpcRole = cleanRole === 'Orang Tua' ? 'orang_tua' : 'murid'
    let sessionKey = cleanRole === 'Orang Tua' ? 'orangtua_session' : 'siswa_session'

    const { data: result, error } = await supabase.rpc('fn_login', {
      p_username: targetAccount.username,
      p_password: targetAccount.password,
      p_role: rpcRole
    })

    if (error || !result?.ok) {
      console.warn('[credentialStore] Gagal login auto-switch akun:', error || result?.msg)
      return false
    }

    const sessionData = {
      ...result.siswa,
      kode: result.kode || null,
      kelas: result.kelas || null,
      tahun_ajaran_id: result.tahun_ajaran_id || null,
      tahun_ajaran: result.tahun_ajaran || null,
      akun_id: result.akun_id,
      role: result.role
    }

    localStorage.removeItem('siswa_session')
    localStorage.removeItem('guru_session')
    localStorage.removeItem('orangtua_session')

    localStorage.setItem(sessionKey, JSON.stringify(sessionData))
    console.log(`[credentialStore] ✅ Berhasil auto-switch ke akun ${cleanRole} (${targetAccount.username})`)
    return true
  } catch (err) {
    console.error('[credentialStore] Auto-switch error:', err)
    return false
  }
}

