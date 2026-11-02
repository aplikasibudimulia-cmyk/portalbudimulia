import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  ELEMEN_KARAKTER, 
  RENTANG_NILAI_KARAKTER, 
  formatKarakterDeskripsi, 
  parseKarakterDeskripsi,
  getUsedKarakterInSubject 
} from '../data/indikatorKarakter'

const IconClose = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

export default function ModalKelolaNilaiKarakter({
  isOpen,
  onClose,
  babNama,
  existingKomponen = null,
  allKomponen = [],
  availableClasses = [],
  onSave,
  saving = false
}) {
  const [selectedElemenId, setSelectedElemenId] = useState('')
  const [selectedSubId, setSelectedSubId] = useState('')
  const [catatanObservasi, setCatatanObservasi] = useState('')
  const [selectedClasses, setSelectedClasses] = useState([])
  const [showRentangInfo, setShowRentangInfo] = useState(false)

  // Indikator yang sudah digunakan di BAB lain
  const usedIndicators = getUsedKarakterInSubject(
    allKomponen, 
    babNama, 
    (nama) => {
      const n = (nama || '').toUpperCase().trim()
      return n.includes('KARAKTER') || n === 'NK' || n.startsWith('NK ') || n.startsWith('N. KARAKTER')
    }
  )

  useEffect(() => {
    if (isOpen) {
      if (existingKomponen) {
        const parsed = parseKarakterDeskripsi(existingKomponen.deskripsi)
        
        const foundElem = ELEMEN_KARAKTER.find(e => 
          e.nama.toLowerCase() === (parsed.elemenNama || '').toLowerCase()
        )
        
        if (foundElem) {
          setSelectedElemenId(foundElem.id)
          const foundSub = foundElem.subIndikator.find(s => 
            s.nama.toLowerCase() === (parsed.subIndikatorNama || '').toLowerCase()
          )
          setSelectedSubId(foundSub ? foundSub.id : (foundElem.subIndikator[0]?.id || ''))
        } else {
          setSelectedElemenId(ELEMEN_KARAKTER[0].id)
          setSelectedSubId(ELEMEN_KARAKTER[0].subIndikator[0].id)
        }

        setCatatanObservasi(parsed.catatan || existingKomponen.deskripsi || '')
        setSelectedClasses(existingKomponen.target_kelas || availableClasses)
      } else {
        const usedElemNames = usedIndicators.map(u => (u.elemenNama || '').toLowerCase())
        const unusedElem = ELEMEN_KARAKTER.find(e => !usedElemNames.includes(e.nama.toLowerCase())) || ELEMEN_KARAKTER[0]

        setSelectedElemenId(unusedElem.id)
        setSelectedSubId(unusedElem.subIndikator[0]?.id || '')
        setCatatanObservasi(unusedElem.subIndikator[0]?.defaultContoh || '')
        setSelectedClasses(availableClasses)
      }
    }
  }, [isOpen, existingKomponen, babNama, availableClasses])

  const activeElemen = ELEMEN_KARAKTER.find(e => e.id === selectedElemenId) || ELEMEN_KARAKTER[0]
  const activeSub = activeElemen?.subIndikator.find(s => s.id === selectedSubId) || activeElemen?.subIndikator[0]

  const handleSelectElemen = (elemId) => {
    setSelectedElemenId(elemId)
    const targetElem = ELEMEN_KARAKTER.find(e => e.id === elemId)
    const firstSub = targetElem?.subIndikator[0]
    setSelectedSubId(firstSub?.id || '')
    if (!catatanObservasi || catatanObservasi.trim() === '' || ELEMEN_KARAKTER.some(e => e.subIndikator.some(s => s.defaultContoh === catatanObservasi))) {
      setCatatanObservasi(firstSub?.defaultContoh || '')
    }
  }

  const handleSelectSub = (subId) => {
    setSelectedSubId(subId)
    const targetSub = activeElemen?.subIndikator.find(s => s.id === subId)
    if (!catatanObservasi || catatanObservasi.trim() === '' || ELEMEN_KARAKTER.some(e => e.subIndikator.some(s => s.defaultContoh === catatanObservasi))) {
      setCatatanObservasi(targetSub?.defaultContoh || '')
    }
  }

  const handleApplyExample = () => {
    if (activeSub?.defaultContoh) {
      setCatatanObservasi(activeSub.defaultContoh)
    }
  }

  const toggleClass = (c) => {
    if (selectedClasses.includes(c)) {
      if (selectedClasses.length === 1) return
      setSelectedClasses(selectedClasses.filter(item => item !== c))
    } else {
      setSelectedClasses([...selectedClasses, c])
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!activeElemen || !activeSub) {
      alert('Pilih elemen dan sub-indikator karakter terlebih dahulu.')
      return
    }
    if (selectedClasses.length === 0) {
      alert('Pilih minimal satu target kelas.')
      return
    }

    const formattedDeskripsi = formatKarakterDeskripsi(
      activeElemen.nama,
      activeSub.nama,
      catatanObservasi
    )

    onSave({
      elemenNama: activeElemen.nama,
      subIndikatorNama: activeSub.nama,
      deskripsi: formattedDeskripsi,
      catatanObservasi,
      targetClasses: selectedClasses,
      isEdit: Boolean(existingKomponen),
      komponenId: existingKomponen?.id
    })
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-slide-up border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header Modal - clean & consistent with app theme */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              {existingKomponen ? 'Edit Nilai Karakter (NIK)' : 'Tambah Nilai Karakter (NIK)'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {babNama}
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1.5 bg-white rounded-lg shadow-2xs border border-slate-200 transition-colors cursor-pointer"
            title="Tutup"
          >
            <IconClose />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-slate-800 text-xs sm:text-sm">
          
          {/* Target Kelas */}
          {availableClasses && availableClasses.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                Target Kelas
              </label>
              <div className="flex flex-wrap gap-2">
                {availableClasses.map(c => {
                  const isChecked = selectedClasses.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleClass(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        isChecked 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs' 
                          : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Dimensi & Sub-Indikator (Clean 2-Column Dropdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                Dimensi / Elemen Sikap
              </label>
              <select
                value={selectedElemenId}
                onChange={(e) => handleSelectElemen(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer shadow-2xs"
              >
                {ELEMEN_KARAKTER.map((elem) => {
                  const isUsedInOther = usedIndicators.some(u => (u.elemenNama || '').toLowerCase() === elem.nama.toLowerCase())
                  return (
                    <option key={elem.id} value={elem.id}>
                      {elem.nomor}. {elem.nama} {isUsedInOther ? '(Sudah di BAB lain)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                Sub-Indikator
              </label>
              <select
                value={selectedSubId}
                onChange={(e) => handleSelectSub(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer shadow-2xs"
              >
                {activeElemen?.subIndikator.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.kode}. {sub.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Keterangan Observasi */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">
                Keterangan Observasi Pembelajaran
              </label>
              <button
                type="button"
                onClick={handleApplyExample}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                title="Gunakan draf kalimat contoh dari panduan"
              >
                Gunakan Contoh Draf
              </button>
            </div>
            
            <textarea
              rows="3"
              value={catatanObservasi}
              onChange={(e) => setCatatanObservasi(e.target.value)}
              placeholder="Keterangan pengamatan sikap murid saat pembelajaran..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-2xs font-normal"
            />
            
            <p className="text-[11px] text-slate-400 mt-1">
              Hubungkan sikap afektif dengan konteks kegiatan atau materi pada BAB ini.
            </p>
          </div>

          {/* Panduan Rentang Nilai (Tabel B) - Clean Collapsible Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setShowRentangInfo(!showRentangInfo)}
              className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              <span>Panduan Rentang Nilai Sikap (Tabel B)</span>
              <span className="text-[11px] text-slate-400 font-semibold">
                {showRentangInfo ? 'Tutup' : 'Lihat'}
              </span>
            </button>
            {showRentangInfo && (
              <div className="p-3.5 bg-white border-t border-slate-200 text-xs">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold">
                      <th className="pb-1.5 w-16">Predikat</th>
                      <th className="pb-1.5 w-20">Rentang</th>
                      <th className="pb-1.5 w-24">Kriteria</th>
                      <th className="pb-1.5">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {RENTANG_NILAI_KARAKTER.map((r) => (
                      <tr key={r.predikat}>
                        <td className="py-1.5 font-bold text-slate-800">{r.predikat}</td>
                        <td className="py-1.5 font-mono font-semibold">{r.rentang}</td>
                        <td className="py-1.5 font-semibold text-slate-700">{r.kriteria}</td>
                        <td className="py-1.5 text-slate-500">{r.deskripsiKriteria}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || selectedClasses.length === 0}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : existingKomponen ? 'Simpan Perubahan' : 'Tambah Nilai Karakter'}
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  )
}
