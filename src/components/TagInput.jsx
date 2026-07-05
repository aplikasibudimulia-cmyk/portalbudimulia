import React, { useState, useRef, useEffect } from 'react'

export default function TagInput({
  label,
  placeholder,
  options = [],
  selectedIds = [],
  onChange,
  onAddNew,
  onDelete, // Callback untuk menghapus opsi permanen
  isLoading = false,
  singleSelect = false,
  searchable = true,
  picMode = false // Khusus untuk PIC (search Guru)
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(opt =>
    (opt.nama || opt.nama_guru || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleToggleOption = (id) => {
    if (singleSelect) {
      if (selectedIds.includes(id)) {
        onChange([])
      } else {
        onChange([id])
        setIsOpen(false)
      }
    } else {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter(x => x !== id))
      } else {
        onChange([...selectedIds, id])
      }
    }
  }

  const handleAddNew = async () => {
    const value = search.trim()
    if (!value) return
    
    // Cegah duplikat local
    const exists = options.some(opt => 
      (opt.nama || opt.nama_guru || '').toLowerCase() === value.toLowerCase()
    )
    if (exists) return

    if (onAddNew) {
      const newOpt = await onAddNew(value)
      if (newOpt && newOpt.id) {
        if (singleSelect) {
          onChange([newOpt.id])
          setIsOpen(false)
        } else {
          onChange([...selectedIds, newOpt.id])
        }
        setSearch('')
      }
    }
  }

  // Ambil nama dari opsi terpilih
  const getSelectedLabels = () => {
    if (selectedIds.length === 0) return null
    return selectedIds.map(id => {
      const opt = options.find(o => o.id === id)
      if (!opt) return null
      
      const text = opt.nama || opt.nama_guru
      const badgeStyle = opt.warna 
        ? { backgroundColor: `${opt.warna}20`, color: opt.warna, borderColor: `${opt.warna}40` }
        : { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }

      return (
        <span 
          key={id}
          style={badgeStyle}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border transition-all scale-100 hover:scale-105"
        >
          {text}
          {!singleSelect && (
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); handleToggleOption(id); }}
              className="hover:opacity-70 font-bold ml-0.5"
            >
              &times;
            </button>
          )}
        </span>
      )
    }).filter(Boolean)
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {label && <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>}
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[42px] px-3 py-1.5 border border-slate-300 rounded-xl bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 outline-none transition-all flex flex-wrap gap-1.5 items-center cursor-pointer select-none"
      >
        {getSelectedLabels() || (
          <span className="text-slate-400 text-sm">{placeholder || 'Pilih...'}</span>
        )}
        
        {/* Arrow icon */}
        <div className="ml-auto text-slate-400">
          <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in max-h-60 flex flex-col">
          {searchable && (
            <div className="p-2 border-b border-slate-100 flex gap-2 shrink-0 bg-slate-50">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={picMode ? "Cari PIC..." : "Cari atau ketik baru..."}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!picMode) handleAddNew();
                  }
                }}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              />
              {!picMode && search.trim() && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleAddNew(); }}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                >
                  Tambah
                </button>
              )}
            </div>
          )}

          <div className="overflow-y-auto flex-1 py-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">
                {picMode ? 'PIC tidak ditemukan.' : 'Ketik lalu klik "Tambah" untuk membuat baru.'}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id)
                const optText = opt.nama || opt.nama_guru
                const roleSub = opt.kode ? ` (${opt.kode})` : ''

                return (
                  <div
                    key={opt.id}
                    onClick={(e) => { e.stopPropagation(); handleToggleOption(opt.id); }}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm font-medium transition-colors text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 shrink-0"
                    />
                    <span className="truncate flex-1">
                      {optText}
                      {picMode && <span className="text-slate-400 font-normal text-xs">{roleSub}</span>}
                    </span>
                    {opt.warna && (
                      <span 
                        style={{ backgroundColor: opt.warna }} 
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm border border-black/10"
                      />
                    )}
                    {onDelete && !picMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(opt.id)
                        }}
                        className="text-[11px] hover:bg-rose-50 text-rose-500 hover:text-rose-700 p-1.5 rounded-lg shrink-0 transition-all font-bold"
                        title="Hapus Permanen"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
