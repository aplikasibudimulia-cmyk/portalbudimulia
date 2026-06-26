import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SiswaNotificationPanel({ isOpen, onClose, studentData }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      // Fetch notifikasi (target_nisn = null or my nisn) and (target_kelas = null or my kelas)
      // Since supabase filtering with OR can be tricky, we can fetch all relevant to me
      const { data, error } = await supabase
        .from('notifikasi')
        .select(`
          id, judul, pesan, tipe, created_at,
          notifikasi_read ( id )
        `)
        .or(`target_nisn.is.null,target_nisn.eq.${studentData.nisn}`)
        .order('created_at', { ascending: false })
      
      if (error) throw error

      // Filter local for target_kelas (Supabase .or doesn't play well with array contains sometimes)
      const validNotifs = data.filter(n => {
        // Asumsi struktur data: target_kelas text (bukan array di schema awal, tp di prompt dibilang 'NULL = semua kelas')
        // Di fase3_schema.sql: target_kelas TEXT. 
        if (n.target_kelas && n.target_kelas !== studentData.kelas) return false
        return true
      })

      const mapped = validNotifs.map(n => ({
        ...n,
        isRead: n.notifikasi_read && n.notifikasi_read.length > 0
      }))

      setNotifications(mapped)
    } catch (err) {
      console.error("Error fetch notif:", err)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notifId) => {
    const isAlreadyRead = notifications.find(n => n.id === notifId)?.isRead
    if (isAlreadyRead) return

    try {
      await supabase.from('notifikasi_read').insert({
        notifikasi_id: notifId,
        nisn: studentData.nisn
      })
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n))
    } catch (err) {
      console.error("Error mark read:", err)
    }
  }

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead)
    if (unread.length === 0) return

    try {
      const inserts = unread.map(n => ({
        notifikasi_id: n.id,
        nisn: studentData.nisn
      }))
      await supabase.from('notifikasi_read').insert(inserts)
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch (err) {
      console.error("Error mark all read:", err)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Notifikasi</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Memuat notifikasi...</div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center h-full text-slate-400">
              <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              <p>Belum ada notifikasi.</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {notifications.map(n => {
                const dateObj = new Date(n.created_at)
                let icon = <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                let bgClass = n.isRead ? 'bg-white border-slate-200 opacity-70' : 'bg-blue-50 border-blue-100 shadow-sm'
                
                if (n.tipe === 'success') {
                  icon = <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  if (!n.isRead) bgClass = 'bg-emerald-50 border-emerald-100 shadow-sm'
                } else if (n.tipe === 'warning') {
                  icon = <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  if (!n.isRead) bgClass = 'bg-amber-50 border-amber-100 shadow-sm'
                }

                return (
                  <div 
                    key={n.id} 
                    onClick={() => markAsRead(n.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${bgClass}`}
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 mt-0.5">{icon}</div>
                      <div>
                        <h4 className={`font-bold text-sm ${n.isRead ? 'text-slate-600' : 'text-slate-800'}`}>{n.judul}</h4>
                        <p className={`text-xs mt-1 leading-relaxed ${n.isRead ? 'text-slate-500' : 'text-slate-700'}`}>{n.pesan}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                          {dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB
                        </p>
                      </div>
                      {!n.isRead && <div className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5 ml-auto"></div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.some(n => !n.isRead) && (
          <div className="p-4 border-t border-slate-100 bg-white shrink-0">
            <button 
              onClick={markAllAsRead}
              className="w-full py-2.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
            >
              Tandai semua dibaca
            </button>
          </div>
        )}
      </div>
    </>
  )
}
