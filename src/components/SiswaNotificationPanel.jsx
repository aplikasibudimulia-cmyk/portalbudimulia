import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SiswaNotificationPanel({ isOpen, onClose, studentData, onNavigateMenu, isOrangTua = false }) {
  const [notifications, setNotifications] = useState([])
  const [activeCategory, setActiveCategory] = useState('all') // 'all' | 'presensi' | 'tabungan' | 'poin' | 'pengumuman'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen && studentData?.nisn) {
      fetchNotifications()
    }
  }, [isOpen, studentData?.nisn, isOrangTua])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const allItems = []
      const nisn = studentData.nisn

      // 1. Fetch Notifikasi Umum / Broadcast dari Admin/Guru
      try {
        const { data: notifData } = await supabase
          .from('notifikasi')
          .select(`
            id, judul, pesan, tipe, created_at,
            notifikasi_read ( id )
          `)
          .or(`target_nisn.is.null,target_nisn.eq.${nisn}`)
          .order('created_at', { ascending: false })
          .limit(20)

        const validNotifs = (notifData || []).filter(n => {
          if (n.target_kelas && n.target_kelas !== studentData.kelas) return false
          // Jangan sertakan notifikasi berbau poin untuk orang tua
          if (isOrangTua && (n.tipe === 'poin' || n.judul?.toLowerCase().includes('poin') || n.pesan?.toLowerCase().includes('poin'))) {
            return false
          }
          return true
        }).map(n => {
          const isWarning = n.tipe === 'warning' || n.judul?.toLowerCase().includes('peringatan') || n.judul?.toLowerCase().includes('pelanggaran')
          return {
            id: `notif_${n.id}`,
            rawId: n.id,
            source: 'notifikasi',
            category: isWarning ? 'disiplin' : 'sekolah',
            categoryLabel: isWarning ? 'Peringatan' : 'Pengumuman',
            judul: n.judul,
            pesan: n.pesan,
            tipe: n.tipe || 'info',
            created_at: n.created_at,
            isRead: n.notifikasi_read && n.notifikasi_read.length > 0
          }
        })
        allItems.push(...validNotifs)
      } catch (e) {
        console.warn("Fetch notifikasi table err:", e)
      }

      // 2. Fetch Riwayat Presensi Terbaru Siswa (Masuk & Pulang)
      try {
        const { data: presensiData } = await supabase
          .from('presensi_harian')
          .select('id, tanggal, waktu, tipe, status, metode, selfie_url, keterangan, created_at')
          .eq('siswa_nisn', nisn)
          .order('tanggal', { ascending: false })
          .limit(10)

        const presensiItems = (presensiData || []).map(p => {
          const isPulang = p.tipe === 'pulang'
          const tipeLabel = isPulang ? 'Pulang' : 'Masuk'
          const isTerlambat = p.status === 'T'
          const statusLabel = p.status === 'H' ? 'Hadir Tepat Waktu' : isTerlambat ? 'Terlambat' : p.status === 'P' ? 'Selesai KBM' : p.status

          return {
            id: `presensi_${p.id}`,
            source: 'presensi',
            category: isTerlambat ? 'disiplin' : 'presensi',
            categoryLabel: isTerlambat ? 'Presensi Terlambat' : `Presensi ${tipeLabel}`,
            judul: `Presensi ${tipeLabel} Siswa (${statusLabel})`,
            pesan: `Tercatat ${statusLabel} pada pukul ${p.waktu || '-'} WIB.\nTanggal: ${p.tanggal}${p.keterangan ? ` • ${p.keterangan}` : ''}`,
            tipe: isTerlambat ? 'warning' : 'presensi',
            created_at: p.created_at || `${p.tanggal}T${p.waktu || '07:00'}:00Z`,
            selfieUrl: p.selfie_url,
            isRead: true
          }
        })
        allItems.push(...presensiItems)
      } catch (e) {
        console.warn("Fetch presensi err:", e)
      }

      // 3. Fetch Riwayat Tabungan Siswa Terverifikasi
      try {
        const { data: tabunganData } = await supabase
          .from('tabungan_transaksi')
          .select('id, tipe, jumlah, saldo_akhir, status_verifikasi, keterangan, created_at')
          .eq('siswa_nisn', nisn)
          .eq('status_verifikasi', 'VERIFIED')
          .order('created_at', { ascending: false })
          .limit(10)

        const namaSiswa = studentData.nama_lengkap || studentData.nama || 'Siswa'
        const tabunganItems = (tabunganData || []).map(t => {
          const isSetor = t.tipe === 'SETOR'
          const nominalFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(t.jumlah)
          const saldoFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(t.saldo_akhir)

          return {
            id: `tabungan_${t.id}`,
            source: 'tabungan',
            category: 'tabungan',
            categoryLabel: isSetor ? 'Setoran Tabungan' : 'Penarikan Tabungan',
            judul: isSetor 
              ? (isOrangTua ? `${namaSiswa} Menabung ${nominalFormatted}` : `Setoran Tabungan ${nominalFormatted}`)
              : `Penarikan Tabungan ${nominalFormatted}`,
            pesan: isSetor
              ? `${isOrangTua ? `${namaSiswa} telah menabung` : 'Setoran tabungan'} sebesar ${nominalFormatted} telah diverifikasi.\nTotal saldo tabungan saat ini: ${saldoFormatted}.`
              : `Penarikan tabungan sebesar ${nominalFormatted} telah diverifikasi.\nTotal saldo tabungan saat ini: ${saldoFormatted}.`,
            tipe: 'info',
            created_at: t.created_at,
            isRead: true
          }
        })
        allItems.push(...tabunganItems)
      } catch (e) {
        console.warn("Fetch tabungan_transaksi err:", e)
      }

      // 4. Fetch Poin & Pengajuan Poin Mandiri (HANYA UNTUK SISWA, TIDAK UNTUK ORANG TUA)
      if (!isOrangTua) {
        try {
          const { data: pengajuanData } = await supabase
            .from('pengajuan_poin_positif')
            .select('id, jenis, poin_diajukan, status, catatan_reviewer, created_at, updated_at')
            .eq('nisn', nisn)
            .order('created_at', { ascending: false })
            .limit(15)

          const pengajuanItems = (pengajuanData || []).map(p => {
            let categoryLabel = 'Pengajuan Poin'
            let judul = `Pengajuan Poin: ${p.jenis}`
            let pesan = `Pengajuan "${p.jenis}" (+${p.poin_diajukan} Poin) berstatus ${p.status}.`
            let cat = 'sekolah'
            let tipe = 'info'

            if (p.status === 'disetujui') {
              categoryLabel = 'Pengajuan Disetujui'
              judul = `Pengajuan Disetujui (+${p.poin_diajukan} Poin)`
              pesan = `Pengajuan "${p.jenis}" telah disetujui pihak sekolah.${p.catatan_reviewer ? `\nCatatan Guru: "${p.catatan_reviewer}"` : ''}`
              cat = 'poin'
              tipe = 'poin'
            } else if (p.status === 'revisi') {
              categoryLabel = 'Perlu Revisi'
              judul = 'Pengajuan Perlu Revisi'
              pesan = `Pengajuan "${p.jenis}" memerlukan perbaikan.${p.catatan_reviewer ? `\nCatatan Guru: "${p.catatan_reviewer}"` : '\nBuka menu Pengajuan Poin untuk melengkapi berkas.'}`
              cat = 'disiplin'
              tipe = 'warning'
            } else if (p.status === 'ditolak') {
              categoryLabel = 'Pengajuan Ditolak'
              judul = 'Pengajuan Poin Ditolak'
              pesan = `Pengajuan "${p.jenis}" belum dapat disetujui.${p.catatan_reviewer ? `\nAlasan: "${p.catatan_reviewer}"` : ''}`
              cat = 'disiplin'
              tipe = 'warning'
            } else {
              categoryLabel = 'Menunggu Review'
              judul = 'Pengajuan Poin Terkirim'
              pesan = `Pengajuan "${p.jenis}" (+${p.poin_diajukan} Poin) sedang menunggu evaluasi guru BK.`
              cat = 'sekolah'
              tipe = 'info'
            }

            return {
              id: `pengajuan_${p.id}`,
              source: 'pengajuan_poin',
              category: cat,
              categoryLabel: categoryLabel,
              judul: judul,
              pesan: pesan,
              tipe: tipe,
              created_at: p.updated_at || p.created_at,
              isRead: true
            }
          })
          allItems.push(...pengajuanItems)
        } catch (e) {
          console.warn("Fetch pengajuan_poin_positif err:", e)
        }

        try {
          const { data: pointData } = await supabase
            .from('point_records')
            .select('id, poin_diberikan, jenis, tanggal, keterangan, created_at')
            .eq('nisn', nisn)
            .order('tanggal', { ascending: false })
            .limit(10)

          const pointItems = (pointData || []).map(pt => {
            const poinVal = pt.poin_diberikan || 0
            const isPositif = poinVal > 0
            const tanda = isPositif ? '+' : ''
            return {
              id: `poin_${pt.id}`,
              source: 'poin',
              category: isPositif ? 'poin' : 'disiplin',
              categoryLabel: isPositif ? 'Poin Prestasi' : 'Catatan Disiplin',
              judul: `${isPositif ? 'Poin Positif' : 'Catatan Pelanggaran'} (${tanda}${poinVal} Poin)`,
              pesan: `${pt.jenis || 'Catatan Karakter'}\nTanggal: ${pt.tanggal}${pt.keterangan ? ` • ${pt.keterangan}` : ''}`,
              tipe: isPositif ? 'poin' : 'warning',
              created_at: pt.created_at || `${pt.tanggal}T12:00:00Z`,
              isRead: true
            }
          })
          allItems.push(...pointItems)
        } catch (e) {
          console.warn("Fetch point_records err:", e)
        }
      }

      // Urutkan seluruh notifikasi berdasarkan waktu terbaru
      allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setNotifications(allItems)
    } catch (err) {
      console.error("Error fetch all notif:", err)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notif) => {
    if (notif.source !== 'notifikasi' || notif.isRead) return

    try {
      await supabase.from('notifikasi_read').insert({
        notifikasi_id: notif.rawId,
        nisn: studentData.nisn
      })
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n))
    } catch (err) {
      console.error("Error mark read:", err)
    }
  }

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => n.source === 'notifikasi' && !n.isRead)
    if (unread.length === 0) return

    try {
      const inserts = unread.map(n => ({
        notifikasi_id: n.rawId,
        nisn: studentData.nisn
      }))
      await supabase.from('notifikasi_read').insert(inserts)
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch (err) {
      console.error("Error mark all read:", err)
    }
  }

  const handleNotifClick = (n) => {
    markAsRead(n)
    if (n.source === 'presensi' && onNavigateMenu) {
      onNavigateMenu('PRESENSI')
    } else if (n.source === 'tabungan' && onNavigateMenu) {
      onNavigateMenu('TABUNGAN')
    } else if (n.source === 'poin' && onNavigateMenu) {
      onNavigateMenu('POIN')
    } else if (n.source === 'pengajuan_poin' && onNavigateMenu) {
      onNavigateMenu('AJUKAN_POIN')
    } else if (n.tipe === 'poin' || n.judul?.toLowerCase().includes('pengajuan') || n.pesan?.toLowerCase().includes('pengajuan')) {
      if (onNavigateMenu) onNavigateMenu('AJUKAN_POIN')
    }
    if (onClose) onClose()
  }

  const getNotificationTheme = (category) => {
    switch (category) {
      case 'presensi':
        return {
          cardBg: 'bg-blue-50/50 border-blue-200 hover:border-blue-300',
          badgeBg: 'bg-blue-100 text-blue-700 border-blue-200',
          titleColor: 'text-blue-950',
          iconBg: 'bg-blue-100 text-blue-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        }
      case 'tabungan':
        return {
          cardBg: 'bg-emerald-50/50 border-emerald-200 hover:border-emerald-300',
          badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          titleColor: 'text-emerald-950',
          iconBg: 'bg-emerald-100 text-emerald-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        }
      case 'sekolah':
        return {
          cardBg: 'bg-teal-50/50 border-teal-200 hover:border-teal-300',
          badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
          titleColor: 'text-teal-950',
          iconBg: 'bg-teal-100 text-teal-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          )
        }
      case 'poin':
        return {
          cardBg: 'bg-purple-50/50 border-purple-200 hover:border-purple-300',
          badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
          titleColor: 'text-purple-950',
          iconBg: 'bg-purple-100 text-purple-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          )
        }
      case 'disiplin':
        return {
          cardBg: 'bg-amber-50/50 border-amber-200 hover:border-amber-300',
          badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
          titleColor: 'text-amber-950',
          iconBg: 'bg-amber-100 text-amber-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
        }
      default:
        return {
          cardBg: 'bg-slate-50 border-slate-200 hover:border-slate-300',
          badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
          titleColor: 'text-slate-900',
          iconBg: 'bg-slate-100 text-slate-600',
          icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        }
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-50 animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg leading-tight">Pusat Notifikasi</h3>
              <p className="text-[11px] text-slate-400 font-medium">{studentData?.nama_lengkap}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 px-4 py-2.5 bg-slate-50 border-b border-slate-200/80 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === 'all' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'}`}
          >
            Semua ({notifications.length})
          </button>
          <button
            onClick={() => setActiveCategory('presensi')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === 'presensi' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'}`}
          >
            Presensi ({notifications.filter(n => n.source === 'presensi').length})
          </button>
          <button
            onClick={() => setActiveCategory('tabungan')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === 'tabungan' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'}`}
          >
            Tabungan ({notifications.filter(n => n.source === 'tabungan').length})
          </button>
          {!isOrangTua && (
            <button
              onClick={() => setActiveCategory('poin')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === 'poin' ? 'bg-purple-600 text-white shadow-2xs' : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'}`}
            >
              Poin ({notifications.filter(n => n.source === 'poin' || n.source === 'pengajuan_poin').length})
            </button>
          )}
          <button
            onClick={() => setActiveCategory('pengumuman')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeCategory === 'pengumuman' ? 'bg-teal-600 text-white shadow-2xs' : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'}`}
          >
            Pengumuman ({notifications.filter(n => n.source === 'notifikasi').length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-2">
              <svg className="w-6 h-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              <span>Memuat notifikasi...</span>
            </div>
          ) : notifications.filter(n => {
              if (activeCategory === 'presensi') return n.source === 'presensi'
              if (activeCategory === 'tabungan') return n.source === 'tabungan'
              if (activeCategory === 'poin') return n.source === 'poin' || n.source === 'pengajuan_poin'
              if (activeCategory === 'pengumuman') return n.source === 'notifikasi'
              return true
            }).length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center justify-center h-full text-slate-400">
              <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
              <p className="font-semibold text-sm">Belum ada notifikasi pada kategori ini.</p>
              <p className="text-xs text-slate-400 mt-1">Aktivitas baru akan otomatis muncul di sini.</p>
            </div>
          ) : (
            notifications.filter(n => {
              if (activeCategory === 'presensi') return n.source === 'presensi'
              if (activeCategory === 'tabungan') return n.source === 'tabungan'
              if (activeCategory === 'poin') return n.source === 'poin' || n.source === 'pengajuan_poin'
              if (activeCategory === 'pengumuman') return n.source === 'notifikasi'
              return true
            }).map(n => {
              const dateObj = new Date(n.created_at)
              const theme = getNotificationTheme(n.category)

              return (
                <div 
                  key={n.id} 
                  onClick={() => handleNotifClick(n)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all shadow-2xs ${theme.cardBg}`}
                >
                  <div className="flex gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${theme.iconBg}`}>
                      {theme.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${theme.badgeBg}`}>
                          {n.categoryLabel}
                        </span>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>
                        )}
                      </div>

                      <h4 className={`font-bold text-xs sm:text-sm mt-1.5 leading-snug ${theme.titleColor}`}>
                        {n.judul}
                      </h4>

                      <p className="text-xs mt-1 leading-relaxed whitespace-pre-line text-slate-600 font-medium">
                        {n.pesan}
                      </p>

                      {/* Foto Selfie Thumbnail jika ada */}
                      {n.selfieUrl && (
                        <div className="mt-2 flex items-center gap-2">
                          <img src={n.selfieUrl} alt="Selfie Presensi" className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs" />
                          <span className="text-[10px] text-slate-400 font-medium">Foto kehadiran terlampir</span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 hover:underline">
                          Lihat Menu ➔
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        {notifications.some(n => n.source === 'notifikasi' && !n.isRead) && (
          <div className="p-4 border-t border-slate-100 bg-white shrink-0">
            <button 
              onClick={markAllAsRead}
              className="w-full py-2.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
            >
              Tandai semua dibaca
            </button>
          </div>
        )}
      </div>
    </>
  )
}
