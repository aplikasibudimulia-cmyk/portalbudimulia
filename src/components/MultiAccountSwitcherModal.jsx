import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { loadAccounts, removeAccount } from '../utils/credentialStore'

export default function MultiAccountSwitcherModal({ isOpen, onClose, currentAccountName, currentRole, currentUsername }) {
  const navigate = useNavigate()
  const [savedAccounts, setSavedAccounts] = useState([])
  const [switchingId, setSwitchingId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      try {
        // loadAccounts() otomatis de-obfuscate password sebelum dikembalikan
        setSavedAccounts(loadAccounts())
      } catch (e) {
        setSavedAccounts([])
      }
      setErrorMsg('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSwitchAccount = async (acc) => {
    if (switchingId) return
    setSwitchingId(acc.id)
    setErrorMsg('')

    try {
      let rpcRole = 'murid'
      let sessionKey = 'siswa_session'
      let targetPath = '/dashboard'

      if (acc.role === 'Orang Tua') {
        rpcRole = 'orang_tua'
        sessionKey = 'orangtua_session'
        targetPath = '/dashboard-orang-tua'
      } else if (acc.role === 'Guru / Staff') {
        rpcRole = 'staff'
        sessionKey = 'guru_session'
        targetPath = '/dashboard-guru'
      }

      // Login via RPC server-side
      const { data: result, error } = await supabase.rpc('fn_login', {
        p_username: acc.username,
        p_password: acc.password,
        p_role: rpcRole
      })

      if (error || !result?.ok) {
        const errMsg = result?.msg || error?.message || 'Gagal beralih akun. Silakan coba lagi.'
        setErrorMsg(errMsg)
        setSwitchingId(null)
        return
      }

      let sessionData = {}
      if (acc.role === 'Guru / Staff') {
        const g = result.guru
        sessionData = {
          id: g.id,
          kode: g.kode,
          nama_guru: g.nama_guru,
          user_name: g.user_name,
          foto_url: g.foto_url,
          roles: g.roles || [],
          kelas: g.kelas || [],
          akun_id: result.akun_id,
          app_role: result.role
        }
      } else {
        sessionData = {
          ...result.siswa,
          kode: result.kode || null,
          kelas: result.kelas || null,
          tahun_ajaran_id: result.tahun_ajaran_id || null,
          tahun_ajaran: result.tahun_ajaran || null,
          akun_id: result.akun_id,
          role: result.role
        }
      }

      // Bersihkan session aktif lama agar tidak konflik
      localStorage.removeItem('siswa_session')
      localStorage.removeItem('guru_session')
      localStorage.removeItem('orangtua_session')

      localStorage.setItem(sessionKey, JSON.stringify(sessionData))
      onClose()
      navigate(targetPath)
      window.location.reload()
    } catch (err) {
      setErrorMsg('Terjadi kesalahan saat beralih akun.')
      setSwitchingId(null)
    }
  }

  const handleAddNewAccount = () => {
    onClose()
    navigate('/login?add_account=true')
  }

  const handleRemoveAccount = (id, e) => {
    e.stopPropagation()
    try {
      // removeAccount() menghapus dari localStorage dan mengembalikan daftar yang tersisa
      const updated = removeAccount(id)
      setSavedAccounts(updated)
    } catch (e) {
      console.warn('Gagal menghapus akun:', e)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div 
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base leading-tight">Beralih Akun</h3>
              <p className="text-[11px] text-slate-400 font-medium">Pilih akun yang tersimpan di HP ini</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl space-y-2">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                <span>{errorMsg}</span>
              </div>
              {/* Jika bukan error jaringan, tampilkan tombol login ulang */}
              {!errorMsg.includes('sibuk') && (
                <button
                  onClick={() => { onClose(); navigate('/login?add_account=true') }}
                  className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[11px] transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
                  Login Ulang Sekarang
                </button>
              )}
            </div>
          )}

          {/* List of Accounts */}
          <div className="space-y-2">
            {savedAccounts.map((acc) => {
              const isRoleMatch = !currentRole || acc.role?.toLowerCase() === currentRole?.toLowerCase()
              
              let isNameMatch = false
              if (currentRole === 'Orang Tua') {
                isNameMatch = 
                  acc.displayName === `Orang Tua (${currentAccountName})` ||
                  acc.displayName?.includes(currentAccountName) ||
                  (currentUsername && acc.username === currentUsername)
              } else {
                isNameMatch = 
                  acc.displayName === currentAccountName ||
                  (currentUsername && acc.username === currentUsername)
              }

              const isCurrent = isRoleMatch && isNameMatch
              const isProcessing = switchingId === acc.id

              return (
                <div
                  key={acc.id}
                  onClick={() => !isCurrent && handleSwitchAccount(acc)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 ${
                    isCurrent 
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 cursor-default' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-indigo-200 cursor-pointer active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs ${
                      acc.role === 'Siswa' ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white' :
                      acc.role === 'Orang Tua' ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white' :
                      'bg-gradient-to-tr from-purple-600 to-pink-500 text-white'
                    }`}>
                      {acc.displayName ? acc.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className={`text-sm font-extrabold truncate ${isCurrent ? 'text-indigo-900' : 'text-slate-800'}`}>
                        {acc.displayName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          acc.role === 'Siswa' ? 'bg-blue-100 text-blue-700' :
                          acc.role === 'Orang Tua' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {acc.role}
                        </span>
                        {acc.className && (
                          <span className="text-xs text-slate-400 font-medium truncate">• {acc.className}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-white px-2.5 py-1 rounded-full border border-indigo-200 shadow-2xs">
                        <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        Aktif
                      </span>
                    ) : isProcessing ? (
                      <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                        <svg className="w-4 h-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Masuk...
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleRemoveAccount(acc.id, e)}
                        title="Hapus akun dari HP ini"
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add New Account Button */}
          <button
            onClick={handleAddNewAccount}
            className="w-full mt-2 py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-600 hover:text-indigo-600 font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 active:scale-98"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Tambah Akun Baru ke HP Ini</span>
          </button>
        </div>
      </div>
    </div>
  )
}
