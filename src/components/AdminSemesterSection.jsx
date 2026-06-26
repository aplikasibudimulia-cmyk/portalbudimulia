import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { getSemesterAktif, formatTanggal } from '../utils/semesterUtils'
import { useConfirm } from '../utils/useConfirm'

export default function AdminSemesterSection({ tahunAjarans, activeTa }) {
  const [selectedTaId, setSelectedTaId] = useState(activeTa?.id || '')
  const [semesters, setSemesters] = useState([]) // [{id, nomor, tanggal_mulai, tanggal_selesai}]
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(null) // null | 1 | 2
  const [form, setForm] = useState({
    1: { tanggal_mulai: '', tanggal_selesai: '' },
    2: { tanggal_mulai: '', tanggal_selesai: '' }
  })
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => {
    if (activeTa?.id) setSelectedTaId(activeTa.id)
  }, [activeTa])

  useEffect(() => {
    if (selectedTaId) fetchSemesters()
  }, [selectedTaId])

  const fetchSemesters = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('semester')
      .select('*')
      .eq('tahun_ajaran_id', selectedTaId)
      .order('nomor')
    
    const semesterData = data || []
    setSemesters(semesterData)

    // Populate form
    const newForm = {
      1: { tanggal_mulai: '', tanggal_selesai: '' },
      2: { tanggal_mulai: '', tanggal_selesai: '' }
    }
    semesterData.forEach(s => {
      newForm[s.nomor] = {
        tanggal_mulai: s.tanggal_mulai || '',
        tanggal_selesai: s.tanggal_selesai || ''
      }
    })
    setForm(newForm)
    setLoading(false)
  }

  const handleSave = async (nomor) => {
    const { tanggal_mulai, tanggal_selesai } = form[nomor]
    if (!tanggal_mulai || !tanggal_selesai) {
      alert('Tanggal mulai dan selesai harus diisi.')
      return
    }
    if (tanggal_mulai >= tanggal_selesai) {
      alert('Tanggal mulai harus lebih awal dari tanggal selesai.')
      return
    }

    setSaving(nomor)
    const { error } = await supabase.from('semester').upsert({
      tahun_ajaran_id: selectedTaId,
      nomor,
      tanggal_mulai,
      tanggal_selesai
    }, { onConflict: 'tahun_ajaran_id,nomor' })

    setSaving(null)
    if (error) {
      alert('Gagal menyimpan: ' + error.message)
    } else {
      fetchSemesters()
    }
  }

  const handleDelete = async (nomor) => {
    const confirmed = await requestConfirm({
      title: `Hapus Semester ${nomor}?`,
      message: `Data semester ${nomor} termasuk rentang tanggalnya akan dihapus.`,
      confirmLabel: 'Hapus',
      confirmColor: 'red',
      icon: 'danger',
    })
    if (!confirmed) return
    const existing = semesters.find(s => s.nomor === nomor)
    if (!existing) return
    const { error } = await supabase.from('semester').delete().eq('id', existing.id)
    if (error) alert('Gagal hapus: ' + error.message)
    else fetchSemesters()
  }

  const semesterAktif = getSemesterAktif(semesters)
  const selectedTa = tahunAjarans?.find(t => t.id === selectedTaId)

  return (
    <div>
      {ConfirmModalComponent}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Manajemen Semester
          </h3>
          <p className="text-xs text-slate-500 mt-1">Atur rentang tanggal Semester 1 & 2 untuk setiap Tahun Ajaran.</p>
        </div>
        <select
          value={selectedTaId}
          onChange={e => setSelectedTaId(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">-- Pilih Tahun Ajaran --</option>
          {(tahunAjarans || []).map(ta => (
            <option key={ta.id} value={ta.id}>
              {ta.nama} {ta.is_aktif ? '(Aktif)' : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedTaId ? (
        <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
          Pilih tahun ajaran untuk mengatur semester
        </div>
      ) : loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(nomor => {
            const existing = semesters.find(s => s.nomor === nomor)
            const isAktif = semesterAktif?.nomor === nomor
            
            return (
              <div key={nomor} className={`border rounded-xl p-4 transition-all ${isAktif ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-2xl flex items-center justify-center text-sm font-bold ${isAktif ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {nomor}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Semester {nomor}</p>
                      {isAktif && (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">
                          🟢 Semester Aktif
                        </span>
                      )}
                    </div>
                  </div>
                  {existing && (
                    <button
                      onClick={() => handleDelete(nomor)}
                      className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-2xl transition-colors"
                    >
                      Hapus
                    </button>
                  )}
                </div>

                {existing && (
                  <div className="mb-3 text-xs text-slate-500 bg-slate-50 rounded-2xl px-3 py-2 border border-slate-100">
                    <span className="font-medium text-slate-700">Tersimpan: </span>
                    {formatTanggal(existing.tanggal_mulai)} — {formatTanggal(existing.tanggal_selesai)}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={form[nomor].tanggal_mulai}
                      onChange={e => setForm(prev => ({ ...prev, [nomor]: { ...prev[nomor], tanggal_mulai: e.target.value } }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Selesai</label>
                    <input
                      type="date"
                      value={form[nomor].tanggal_selesai}
                      onChange={e => setForm(prev => ({ ...prev, [nomor]: { ...prev[nomor], tanggal_selesai: e.target.value } }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={() => handleSave(nomor)}
                    disabled={saving === nomor}
                    className={`w-full py-2 rounded-2xl text-xs font-bold transition-all ${saving === nomor ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'}`}
                  >
                    {saving === nomor ? 'Menyimpan...' : existing ? '✓ Perbarui Semester' : '+ Simpan Semester'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
