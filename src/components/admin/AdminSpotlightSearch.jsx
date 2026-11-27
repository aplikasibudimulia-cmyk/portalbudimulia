import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ADMIN_CATEGORIES } from './adminMenuConfig'

export default function AdminSpotlightSearch({ isOpen, onClose, onSelectMenu, menuTypes = [] }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  // Kumpulkan seluruh item menu menjadi 1 list flat
  const allItems = useMemo(() => {
    const list = []
    const categories = Array.isArray(ADMIN_CATEGORIES)
      ? ADMIN_CATEGORIES
      : (ADMIN_CATEGORIES?.ADMIN_CATEGORIES || ADMIN_CATEGORIES?.default || [])

    categories.forEach(cat => {
      (cat?.items || []).forEach(item => {
        list.push({
          ...item,
          categoryName: cat.label,
          categoryId: cat.id
        })
      })
    })

    // Tambahkan custom document types dinamis jika ada
    (menuTypes || []).forEach(t => {
      list.push({
        id: t.id,
        label: t.nama,
        desc: 'Dokumen Kategori Khusus',
        categoryName: 'Informasi & Surat',
        categoryId: 'dokumen'
      })
    })

    return list
  }, [menuTypes])

  // Filter berdasarkan pencarian
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems
    const q = query.toLowerCase().trim()
    return allItems.filter(item => 
      item.label.toLowerCase().includes(q) ||
      item.desc?.toLowerCase().includes(q) ||
      item.categoryName.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    )
  }, [query, allItems])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Navigasi keyboard (Atas, Bawah, Enter, Escape)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          onSelectMenu(filteredItems[selectedIndex].id)
          onClose()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredItems, selectedIndex, onSelectMenu, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[120] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Cari menu, fitur, ujian, kartu, nilai... (ketik nama menu)"
            className="flex-1 bg-transparent border-none outline-none text-slate-800 text-sm sm:text-base placeholder:text-slate-400 font-medium"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300"
            >
              Hapus
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-semibold text-slate-400 bg-white border border-slate-200 rounded shadow-xs">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-50">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tidak ada menu yang cocok dengan "<strong>{query}</strong>"
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={`${item.categoryId}-${item.id}`}
                  onClick={() => {
                    onSelectMenu(item.id)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.label.charAt(0)}
                    </div>
                    <div className="truncate">
                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {item.label}
                      </p>
                      {item.desc && (
                        <p className={`text-xs truncate ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {item.desc}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.categoryName}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-white/80 font-medium">↵</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span><kbd className="font-semibold text-slate-700">↑</kbd> <kbd className="font-semibold text-slate-700">↓</kbd> Pilih</span>
            <span><kbd className="font-semibold text-slate-700">↵</kbd> Buka</span>
            <span><kbd className="font-semibold text-slate-700">ESC</kbd> Tutup</span>
          </div>
          <span className="text-slate-400">{filteredItems.length} menu tersedia</span>
        </div>
      </div>
    </div>
  )
}
