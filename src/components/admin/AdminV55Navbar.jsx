import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ADMIN_CATEGORIES, getCategoryByMenuId } from './adminMenuConfig'

export default function AdminV55Navbar({
  activeMenu,
  onNavigate,
  activeTa,
  session,
  onLogout,
  onToggleFullscreen,
  isNativeFullScreen,
  currentFont,
  onCycleFont,
  pendingPengajuanCount = 0,
  menuTypes = [],
  onOpenSearch
}) {
  // Kategori aktif saat ini
  const currentCategory = getCategoryByMenuId(activeMenu)
  const [selectedCatId, setSelectedCatId] = useState(currentCategory)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [openAccordion, setOpenAccordion] = useState(currentCategory)

  // Sinkronkan selected category saat activeMenu berubah dari luar (misal via search atau URL)
  useEffect(() => {
    const cat = getCategoryByMenuId(activeMenu)
    setSelectedCatId(cat)
    setOpenAccordion(cat)
  }, [activeMenu])

  // Cari objek kategori aktif
  const activeCategoryObj = ADMIN_CATEGORIES.find(c => c.id === selectedCatId) || ADMIN_CATEGORIES[0]

  // Gabungkan sub-items kategori dokumen jika ada custom document types
  const subItems = React.useMemo(() => {
    let items = [...(activeCategoryObj.items || [])]
    if (selectedCatId === 'dokumen' && menuTypes && menuTypes.length > 0) {
      const dynamicItems = menuTypes.map(t => ({
        id: t.id,
        label: t.nama,
        desc: 'Dokumen Khusus',
        icon: 'file-text'
      }))
      items = [...items, ...dynamicItems]
    }
    return items
  }, [activeCategoryObj, selectedCatId, menuTypes])

  const handleCategoryClick = (cat) => {
    setSelectedCatId(cat.id)
    // Jika menu saat ini belum ada di kategori ini, otomatis arahkan ke default item kategori tsb
    const isAlreadyInCat = cat.items.some(item => item.id === activeMenu)
    if (!isAlreadyInCat && cat.items.length > 0) {
      onNavigate(cat.items[0].id)
    }
  }

  return (
    <>
      {/* ─── HEADER UTAMA V55 (STICKY TOP) ─────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs transition-all app-header-safe">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-5 lg:px-8">
          
          {/* Row 1: Brand + Primary Pill Navigation + Actions */}
          <div className="flex items-center justify-between gap-3 h-16 sm:h-[68px]">
            
            {/* Left: Brand Logo & Title */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="xl:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200/70 transition-all cursor-pointer"
                title="Buka Menu"
                aria-label="Buka Menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <div 
                onClick={() => onNavigate('dashboard')} 
                className="flex items-center gap-2.5 cursor-pointer group"
                title="Kembali ke Beranda"
              >
                <img 
                  src="/logo.png?v=1784818000" 
                  alt="Logo" 
                  className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-xs group-hover:scale-105 transition-transform" 
                />
                <div className="hidden sm:block leading-none">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">eBudiMulia</span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                      Admin
                    </span>
                  </div>
                  <p className="text-[10.5px] font-medium text-slate-400 mt-0.5">SMP Budi Mulia Jakarta</p>
                </div>
              </div>
            </div>

            {/* Center: Horizontal Sliding Pill Tabs (Desktop XL+) */}
            <nav className="hidden xl:flex items-center p-1 bg-slate-100/90 rounded-full border border-slate-200/60 shadow-inner max-w-fit">
              {ADMIN_CATEGORIES.map(cat => {
                const isActive = selectedCatId === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className={`relative px-3.5 py-2 text-xs font-semibold rounded-full transition-colors cursor-pointer select-none whitespace-nowrap ${
                      isActive ? 'text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="v55-primary-pill"
                        className="absolute inset-0 bg-slate-900 rounded-full shadow-sm z-0"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {cat.label}
                      {cat.id === 'kesiswaan' && pendingPengajuanCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                      )}
                    </span>
                  </button>
                )
              })}
            </nav>

            {/* Right: Quick Search Button & Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Search Bar / Trigger (⌘K) */}
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-slate-500 bg-slate-100/80 hover:bg-slate-200/80 active:scale-95 border border-slate-200/70 rounded-full transition-all cursor-pointer shadow-2xs"
                title="Cari Menu Cepat (Ctrl+K)"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden md:inline text-slate-600 font-medium">Cari menu...</span>
                <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200/80 rounded shadow-xs">
                  ⌘K
                </kbd>
              </button>

              {/* Tahun Ajaran Active Badge */}
              {activeTa && (
                <div className="hidden 2xl:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>T.A. {activeTa.tahun || activeTa.nama || activeTa}</span>
                </div>
              )}

              {/* Font Switcher */}
              <button
                type="button"
                onClick={onCycleFont}
                className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                title={`Ganti Font Tampilan (Saat ini: ${currentFont})`}
              >
                <span className="text-xs font-black uppercase">{currentFont?.charAt(0) || 'B'}</span>
              </button>

              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                title={isNativeFullScreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
              >
                {isNativeFullScreen ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v4m0-4h4m12 0l-5 5m5-5v4m0-4h-4M4 20l5-5m-5 5v-4m0 4h4m12 0l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                  </svg>
                )}
              </button>

              {/* Logout Button */}
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-rose-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                title="Keluar Sesi Admin"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ─── ROW 2: CONTEXTUAL SUB-NAV PILL STRIP (DESKTOP) ──────────────── */}
        <div className="hidden xl:block bg-slate-50/70 border-t border-slate-200/60 py-2">
          <div className="max-w-[1720px] mx-auto px-5 lg:px-8">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">
                {activeCategoryObj.label}:
              </span>

              {subItems.map(item => {
                const isItemActive = activeMenu === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 select-none ${
                      isItemActive
                        ? 'text-indigo-900 bg-white shadow-xs border border-indigo-200/80 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                    }`}
                  >
                    {isItemActive && (
                      <motion.div
                        layoutId="v55-sub-pill"
                        className="absolute inset-0 bg-white rounded-lg border border-indigo-300/80 shadow-xs z-0"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <span>{item.label}</span>

                      {/* Badge Khusus (Live / Cetak / Ekskul) */}
                      {item.badge && (
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                          item.badge === 'Live' ? 'bg-indigo-100 text-indigo-700' :
                          item.badge === 'Cetak' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {item.badge}
                        </span>
                      )}

                      {/* Pending Badge */}
                      {item.isPendingPengajuan && pendingPengajuanCount > 0 && (
                        <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                          {pendingPengajuanCount}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* ─── MOBILE / TABLET DRAWER OVERLAY (< XL) ─────────────────────────── */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setMobileDrawerOpen(false)}
            />

            {/* Drawer Content */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col z-10"
            >
              {/* Drawer Header */}
              <div className="p-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src="/logo.png?v=1784818000" alt="Logo" className="w-8 h-8 object-contain" />
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-tight">eBudiMulia</h3>
                    <p className="text-[10px] text-slate-500 font-medium">Panel Navigasi Admin</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18" strokeWidth={2} strokeLinecap="round" />
                    <line x1="6" y1="6" x2="18" y2="18" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Drawer Quick Search */}
              <div className="p-3 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false)
                    onOpenSearch()
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Cari menu cepat...</span>
                </button>
              </div>

              {/* Accordion Categories */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {ADMIN_CATEGORIES.map(cat => {
                  const isOpen = openAccordion === cat.id
                  const hasActiveMenu = cat.items.some(i => i.id === activeMenu)
                  return (
                    <div key={cat.id} className="rounded-xl border border-slate-100 overflow-hidden">
                      <button
                        onClick={() => setOpenAccordion(isOpen ? null : cat.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold transition-colors ${
                          hasActiveMenu ? 'bg-indigo-50/80 text-indigo-900' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{cat.label}</span>
                          {cat.id === 'kesiswaan' && pendingPengajuanCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                          )}
                        </span>
                        <svg
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="p-1 space-y-0.5 bg-white">
                          {cat.items.map(item => {
                            const isCurrent = activeMenu === item.id
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  onNavigate(item.id)
                                  setMobileDrawerOpen(false)
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                                  isCurrent
                                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <span>{item.label}</span>
                                {item.badge && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                    isCurrent ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {item.badge}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2">
                <button
                  onClick={() => {
                    onCycleFont()
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl"
                >
                  <span>Font: {currentFont}</span>
                  <span className="text-[10px] text-indigo-600 font-bold">Ganti ↻</span>
                </button>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
                >
                  <span>Keluar Sesi Admin</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
