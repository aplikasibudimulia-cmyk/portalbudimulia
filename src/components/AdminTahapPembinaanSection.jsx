import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const EMPTY_FORM = { nama_tahap: '', batas_poin: '', tindakan: '', penanggung_jawab: '', urutan: '' }

const BADGE_COLORS = [
  { min: 76, label: 'Aman', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { min: 51, label: 'Panggilan I', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { min: 26, label: 'Panggilan II', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { min: 1,  label: 'Panggilan III', color: 'bg-red-100 text-red-700 border-red-200' },
  { min: 0,  label: 'Panggilan IV', color: 'bg-red-900/10 text-red-900 border-red-300' },
]

export default function AdminTahapPembinaanSection({ readOnly = false }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef()
  const { requestConfirm, ConfirmModalComponent } = useConfirm()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('guidance_stages').select('*').order('urutan')
    setData(rows || [])
    setLoading(false)
  }

  const openAdd = () => {
    const maxUrutan = data.length > 0 ? Math.max(...data.map(d => d.urutan || 0)) + 1 : 1
    setEditItem(null)
    setForm({ ...EMPTY_FORM, urutan: maxUrutan })
    setShowModal(true)
  }
  const openEdit = (item) => {
    setEditItem(item)
    setForm({ nama_tahap: item.nama_tahap, batas_poin: item.batas_poin, tindakan: item.tindakan, penanggung_jawab: item.penanggung_jawab, urutan: item.urutan })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.nama_tahap || form.batas_poin === '' || !form.tindakan) { alert('Lengkapi field wajib.'); return }
    setSaving(true)
    const payload = { nama_tahap: form.nama_tahap, batas_poin: parseInt(form.batas_poin), tindakan: form.tindakan, penanggung_jawab: form.penanggung_jawab, urutan: parseInt(form.urutan) || 0 }
    if (editItem) {
      const { error } = await supabase.from('guidance_stages').update(payload).eq('id', editItem.id)
      if (error) alert('Gagal: ' + error.message)
    } else {
      const { error } = await supabase.from('guidance_stages').insert([payload])
      if (error) alert('Gagal: ' + error.message)
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  const handleDelete = async (item) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Tahap Pembinaan?',
      message: `Hapus "${item.nama_tahap}"? Data log pembinaan yang terkait mungkin terpengaruh.`,
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('guidance_stages').delete().eq('id', item.id)
    if (error) alert('Gagal: ' + error.message)
    else fetchData()
  }

  // ─── EXPORT ───────────────────────────────────────────────
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Tahap Pembinaan')
    ws.columns = [
      { header: 'Urutan', key: 'urutan', width: 10 },
      { header: 'Nama Tahap', key: 'nama_tahap', width: 20 },
      { header: 'Batas Poin (≤)', key: 'batas_poin', width: 15 },
      { header: 'Tindakan/Sanksi', key: 'tindakan', width: 45 },
      { header: 'Penanggung Jawab', key: 'penanggung_jawab', width: 35 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    data.forEach((row, i) => {
      const r = ws.addRow({ urutan: row.urutan, nama_tahap: row.nama_tahap, batas_poin: row.batas_poin, tindakan: row.tindakan, penanggung_jawab: row.penanggung_jawab })
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
    })
    ws.eachRow(r => { r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } } }) })
    const buf = await wb.xlsx.writeBuffer()
    const today = new Date().toISOString().slice(0, 10)
    saveAs(new Blob([buf]), `tahap-pembinaan-${today}.xlsx`)
  }

  // ─── IMPORT ───────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportLoading(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    const rows = []
    ws.eachRow((row, rn) => {
      if (rn === 1) return
      const [urutanRaw, nama_tahap, batas_poinRaw, tindakan, penanggung_jawab] = [1,2,3,4,5].map(i => (row.getCell(i).value ?? '').toString().trim())
      const errors = []
      if (!nama_tahap) errors.push('Nama tahap kosong')
      if (!tindakan) errors.push('Tindakan kosong')
      const urutan = parseInt(urutanRaw); if (isNaN(urutan)) errors.push('Urutan bukan angka')
      const batas_poin = parseInt(batas_poinRaw); if (isNaN(batas_poin)) errors.push('Batas poin bukan angka')
      rows.push({ urutan, nama_tahap, batas_poin, tindakan, penanggung_jawab, _errors: errors, _valid: errors.length === 0 })
    })
    setImportRows(rows.filter(r => r.nama_tahap || r.tindakan))
    setImportLoading(false)
    setImportResult(null)
    if (importRef.current) importRef.current.value = ''
  }

  const handleImportSave = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) { alert('Tidak ada data valid.'); return }
    setImportLoading(true)
    const inserts = valid.map(r => ({ urutan: r.urutan, nama_tahap: r.nama_tahap, batas_poin: r.batas_poin, tindakan: r.tindakan, penanggung_jawab: r.penanggung_jawab }))
    const { error } = await supabase.from('guidance_stages').insert(inserts)
    setImportLoading(false)
    if (error) { alert('Gagal import: ' + error.message); return }
    setImportResult({ success: valid.length, skipped: importRows.length - valid.length })
    fetchData()
  }

  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Template Tahap Pembinaan')
    ws.columns = [
      { header: 'Urutan', key: 'urutan', width: 10 },
      { header: 'Nama Tahap', key: 'nama_tahap', width: 20 },
      { header: 'Batas Poin (≤)', key: 'batas_poin', width: 15 },
      { header: 'Tindakan/Sanksi', key: 'tindakan', width: 45 },
      { header: 'Penanggung Jawab', key: 'penanggung_jawab', width: 35 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    ws.addRow({ urutan: 1, nama_tahap: 'Panggilan I', batas_poin: 75, tindakan: 'Pemanggilan Orang Tua', penanggung_jawab: 'Wali Kelas' })
    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), 'template-tahap-pembinaan.xlsx')
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>

  return (
    <div className="animate-slide-up">
      {ConfirmModalComponent}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tahap Pembinaan</h2>
          <p className="text-slate-500 text-sm mt-0.5">Batas poin dan tindakan yang diambil per tahap pembinaan</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
            <button onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null) }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold transition-all">Import</button>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Tambah
            </button>
          </div>
        )}
      </div>

      {/* Visual timeline */}
      <div className="space-y-3">
        {data.length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">Belum ada data tahap pembinaan.</div>
        ) : data.map((item, idx) => {
          const bgColors = ['border-yellow-200 bg-yellow-50', 'border-orange-200 bg-orange-50', 'border-red-200 bg-red-50', 'border-red-300 bg-red-100']
          const numColors = ['text-yellow-700 bg-yellow-100', 'text-orange-700 bg-orange-100', 'text-red-700 bg-red-100', 'text-red-900 bg-red-200']
          const badgeColors = ['text-yellow-700 bg-yellow-100 border-yellow-200', 'text-orange-700 bg-orange-100 border-orange-200', 'text-red-700 bg-red-100 border-red-200', 'text-red-900 bg-red-200 border-red-300']
          const i = Math.min(idx, 3)
          return (
            <div key={item.id} className={`border ${bgColors[i]} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${numColors[i]}`}>{item.urutan}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-bold text-slate-800">{item.nama_tahap}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColors[i]}`}>Poin ≤ {item.batas_poin}</span>
                </div>
                <p className="text-sm text-slate-600">{item.tindakan}</p>
                {item.penanggung_jawab && <p className="text-xs text-slate-500 mt-1">Penanggung Jawab: <span className="font-semibold">{item.penanggung_jawab}</span></p>}
              </div>
              {!readOnly && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white/80 rounded-lg transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => handleDelete(item)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white/80 rounded-lg transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{editItem ? 'Edit Tahap Pembinaan' : 'Tambah Tahap Pembinaan'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Urutan</label>
                  <input type="number" value={form.urutan} onChange={e => setForm({...form, urutan: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Batas Poin (≤) <span className="text-red-500">*</span></label>
                  <input type="number" value={form.batas_poin} onChange={e => setForm({...form, batas_poin: e.target.value})} placeholder="75" required className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Tahap <span className="text-red-500">*</span></label>
                <input value={form.nama_tahap} onChange={e => setForm({...form, nama_tahap: e.target.value})} placeholder="Panggilan I" required className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tindakan / Sanksi <span className="text-red-500">*</span></label>
                <textarea rows={2} value={form.tindakan} onChange={e => setForm({...form, tindakan: e.target.value})} required placeholder="Pemanggilan orang tua..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Penanggung Jawab</label>
                <input value={form.penanggung_jawab} onChange={e => setForm({...form, penanggung_jawab: e.target.value})} placeholder="Wali Kelas" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Batal</button>
                <button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-60 flex items-center justify-center">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800">Import Tahap Pembinaan</h3>
              <button onClick={() => setShowImportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="flex gap-3 mb-4">
                <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Download Template</button>
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                  Pilih File Excel <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
                </label>
              </div>
              {importLoading && <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}
              {importRows.length > 0 && !importResult && (
                <>
                  <div className="overflow-auto border border-slate-200 rounded-xl max-h-60">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        {['Urutan','Nama Tahap','Batas Poin','Tindakan','Status'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}
                      </tr></thead>
                      <tbody>{importRows.map((r,i) => (
                        <tr key={i} className={`border-b border-slate-50 ${!r._valid ? 'bg-red-50' : i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-3 py-2">{r.urutan}</td>
                          <td className="px-3 py-2 font-semibold">{r.nama_tahap}</td>
                          <td className="px-3 py-2">≤ {r.batas_poin}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{r.tindakan}</td>
                          <td className="px-3 py-2">{r._valid ? <span className="text-emerald-600 font-semibold">✓ Valid</span> : <span className="text-red-500">✗ {r._errors.join(', ')}</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => { setShowImportModal(false); setImportRows([]) }} className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Batal</button>
                    <button onClick={handleImportSave} disabled={importLoading} className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-60 flex items-center justify-center">
                      {importLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : `Simpan ${importRows.filter(r=>r._valid).length} Data`}
                    </button>
                  </div>
                </>
              )}
              {importResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="font-bold text-emerald-700 text-lg">{importResult.success} data berhasil diimport</p>
                  <button onClick={() => setShowImportModal(false)} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold">Tutup</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
