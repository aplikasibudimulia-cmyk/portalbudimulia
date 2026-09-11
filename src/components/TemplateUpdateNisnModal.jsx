import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { downloadUpdateNisnTemplateExcel } from '../utils/studentExcelHelper'

export default function TemplateUpdateNisnModal({
  isOpen,
  onClose,
  students = [],
  activeTa = null,
  semuaKelas = []
}) {
  const [selectedClasses, setSelectedClasses] = useState([])
  const [isDownloading, setIsDownloading] = useState(false)

  // Ambil siswa yang relevan dengan tahun ajaran aktif (atau semua siswa aktif)
  const targetStudents = useMemo(() => {
    const list = students || []
    if (activeTa?.id || activeTa?.nama) {
      const filtered = list.filter(s => 
        (s.tahun_ajaran_id === activeTa?.id || s.tahun_ajaran === activeTa?.nama) && s.is_aktif !== false
      )
      if (filtered.length > 0) return filtered
    }
    return list.filter(s => s.is_aktif !== false)
  }, [students, activeTa])

  // Ekstrak daftar kelas unik yang tersedia dari props atau dari data siswa
  const availableClasses = useMemo(() => {
    if (semuaKelas && semuaKelas.length > 0) {
      return [...semuaKelas].filter(k => k && k !== '-').sort()
    }
    const fromStudents = targetStudents
      .map(s => s.kelas)
      .filter(k => k && k !== '-')
    return [...new Set(fromStudents)].sort()
  }, [semuaKelas, targetStudents])

  // Hitung jumlah siswa per kelas
  const studentCountPerClass = useMemo(() => {
    const counts = {}
    availableClasses.forEach(k => { counts[k] = 0 })
    targetStudents.forEach(s => {
      const k = s.kelas
      if (k && counts[k] !== undefined) {
        counts[k]++
      }
    })
    return counts
  }, [availableClasses, targetStudents])

  // Ekstrak kelompok tingkat (misal: '7', '8', '9' dari '7A', '8B', dst)
  const gradeLevels = useMemo(() => {
    const grades = new Set()
    availableClasses.forEach(k => {
      const match = k.match(/^(\d+)/)
      if (match) {
        grades.add(match[1])
      }
    })
    return Array.from(grades).sort((a, b) => Number(a) - Number(b))
  }, [availableClasses])

  // Inisialisasi: saat modal terbuka, default pilih kelas tingkat terendah (misal kelas 7) jika ada, atau semua
  useEffect(() => {
    if (isOpen) {
      if (gradeLevels.length > 0) {
        // Otomatis pilih tingkat terendah (biasanya kelas 7 yang paling sering butuh update NISN baru)
        const lowestGrade = gradeLevels[0]
        const defaultClasses = availableClasses.filter(k => k.startsWith(lowestGrade))
        setSelectedClasses(defaultClasses.length > 0 ? defaultClasses : availableClasses)
      } else {
        setSelectedClasses([...availableClasses])
      }
    }
  }, [isOpen, availableClasses, gradeLevels])

  // Toggle satu kelas
  const handleToggleClass = (kelas) => {
    setSelectedClasses(prev => 
      prev.includes(kelas) ? prev.filter(k => k !== kelas) : [...prev, kelas]
    )
  }

  // Pilih semua kelas
  const handleSelectAll = () => {
    setSelectedClasses([...availableClasses])
  }

  // Kosongkan pilihan
  const handleDeselectAll = () => {
    setSelectedClasses([])
  }

  // Pilih berdasarkan tingkat (misal khusus kelas 7)
  const handleSelectGrade = (grade) => {
    const classesInGrade = availableClasses.filter(k => k.startsWith(grade))
    setSelectedClasses(classesInGrade)
  }

  // Siswa yang masuk filter kelas yang dipilih
  const filteredStudents = useMemo(() => {
    if (selectedClasses.length === 0) return []
    return targetStudents.filter(s => selectedClasses.includes(s.kelas))
  }, [targetStudents, selectedClasses])

  // Eksekusi download template Excel
  const handleDownload = async () => {
    if (filteredStudents.length === 0) {
      alert('Pilih minimal satu kelas yang memiliki data siswa.')
      return
    }

    setIsDownloading(true)
    try {
      let classSuffix = ''
      if (selectedClasses.length === 1) {
        classSuffix = `_Kelas_${selectedClasses[0].replace(/\s+/g, '_')}`
      } else if (gradeLevels.length > 0 && selectedClasses.every(c => c.startsWith(selectedClasses[0].charAt(0)))) {
        classSuffix = `_Kelas_${selectedClasses[0].charAt(0)}`
      } else if (selectedClasses.length === availableClasses.length) {
        classSuffix = '_Semua_Kelas'
      } else {
        classSuffix = `_${selectedClasses.length}_Kelas`
      }

      const taSuffix = activeTa?.nama ? `_${activeTa.nama.replace(/\//g, '_')}` : ''
      const filename = `Template_Update_NISN${classSuffix}${taSuffix}.xlsx`

      await downloadUpdateNisnTemplateExcel(filteredStudents, filename)
      onClose()
    } catch (err) {
      console.error('Gagal mengunduh template NISN:', err)
      alert('Gagal mengunduh template: ' + (err.message || err))
    } finally {
      setIsDownloading(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full flex flex-col max-h-[90vh] border border-slate-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shadow-inner">
              📥
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Download Template Update NISN</h3>
              <p className="text-xs text-teal-100 mt-0.5">
                Pilih kelas siswa yang ingin diperbarui NISN-nya
                {activeTa?.nama && ` (${activeTa.nama})`}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Quick Filter Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Pilih Kelas
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2 py-0.5 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md border border-teal-200 transition-colors"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-200 transition-colors"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Filter Cepat Tingkat (Kelas 7, 8, 9 jika ada) */}
            {gradeLevels.length > 0 && (
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">Filter Cepat:</span>
                {gradeLevels.map(grade => {
                  const gradeClasses = availableClasses.filter(k => k.startsWith(grade))
                  const isAllSelected = gradeClasses.length > 0 && gradeClasses.every(c => selectedClasses.includes(c))
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => handleSelectGrade(grade)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                        isAllSelected
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-800 border border-slate-200'
                      }`}
                    >
                      <span>🎯</span> Kelas {grade} Saja
                    </button>
                  )
                })}
              </div>
            )}

            {/* Grid Checkbox Kelas */}
            {availableClasses.length === 0 ? (
              <div className="p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs text-center">
                Belum ada data kelas atau siswa di tahun ajaran ini.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                {availableClasses.map(kelas => {
                  const isChecked = selectedClasses.includes(kelas)
                  const count = studentCountPerClass[kelas] || 0
                  return (
                    <label
                      key={kelas}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        isChecked
                          ? 'bg-teal-50/80 border-teal-400 text-teal-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleClass(kelas)}
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <span className="font-bold text-xs truncate">{kelas}</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isChecked ? 'bg-teal-200 text-teal-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {count} siswa
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status Jumlah Terpilih */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-600 font-medium">
              Kelas Terpilih: <strong className="text-slate-800">{selectedClasses.length} kelas</strong>
            </span>
            <span className="text-teal-700 font-bold bg-teal-100/70 px-2.5 py-1 rounded-lg">
              Total: {filteredStudents.length} siswa
            </span>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || filteredStudents.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
          >
            {isDownloading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                Menyiapkan Excel...
              </>
            ) : (
              <>
                <span>📥</span> Download Excel ({filteredStudents.length} Siswa)
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
