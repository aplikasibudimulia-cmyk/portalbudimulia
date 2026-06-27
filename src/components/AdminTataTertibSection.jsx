import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const EMPTY_FORM = { bab: '', nama_bab: '', pasal: '', nama_pasal: '', nomor: '', isi: '' }

const ROMANS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
const getNextBab = (data) => {
  if (!data || data.length === 0) return "BAB I";
  const lastBab = data[data.length - 1].bab;
  const roman = lastBab.replace("BAB ", "").trim();
  const idx = ROMANS.indexOf(roman);
  if (idx !== -1 && idx < ROMANS.length - 1) return `BAB ${ROMANS[idx + 1]}`;
  return "BAB NEW";
}

const getNextPasal = (data) => {
  if (!data || data.length === 0) return "Pasal 1";
  const lastPasal = data[data.length - 1].pasal;
  const numMatch = lastPasal.match(/\d+/);
  if (numMatch) return `Pasal ${parseInt(numMatch[0]) + 1}`;
  return "Pasal NEW";
}

export default function AdminTataTertibSection({ readOnly = false }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterBab, setFilterBab] = useState('all')
  const [collapsedBabs, setCollapsedBabs] = useState({})
  const [isNewBab, setIsNewBab] = useState(false)
  const [isNewPasal, setIsNewPasal] = useState(false)
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
    const { data: rows } = await supabase
      .from('school_regulations')
      .select('*')
      .order('urutan', { ascending: true })
    setData(rows || [])
    setLoading(false)
  }

  const uniqueBabs = [...new Set((data || []).map(d => d.bab))].sort()

  const filtered = data.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q || d.bab?.toLowerCase().includes(q) || d.pasal?.toLowerCase().includes(q)
      || d.nama_pasal?.toLowerCase().includes(q) || d.isi?.toLowerCase().includes(q)
    const matchBab = filterBab === 'all' || d.bab === filterBab
    return matchSearch && matchBab
  })

  // Group by bab > pasal
  const grouped = filtered.reduce((acc, row) => {
    const babKey = row.bab
    if (!acc[babKey]) acc[babKey] = { nama_bab: row.nama_bab, pasals: {} }
    const pasalKey = row.pasal
    if (!acc[babKey].pasals[pasalKey]) acc[babKey].pasals[pasalKey] = { nama_pasal: row.nama_pasal, items: [] }
    acc[babKey].pasals[pasalKey].items.push(row)
    return acc
  }, {})

  const toggleBab = (bab) => {
    setCollapsedBabs(prev => ({ ...prev, [bab]: !prev[bab] }))
  }

  const openAdd = () => { 
    setEditItem(null); 
    const firstBab = uniqueBabs[0] || '';
    const existingBabObj = data.find(d => d.bab === firstBab);
    const pasalsForFirstBab = [...new Set((data || []).filter(d => d.bab === firstBab).map(d => d.pasal))].sort();
    const firstPasal = pasalsForFirstBab[0] || '';
    const existingPasalObj = data.find(d => d.pasal === firstPasal && d.bab === firstBab);
    
    setForm({
      ...EMPTY_FORM, 
      bab: firstBab, 
      nama_bab: existingBabObj?.nama_bab || '',
      pasal: firstPasal,
      nama_pasal: existingPasalObj?.nama_pasal || ''
    });
    setIsNewBab(false);
    setIsNewPasal(false);
    setShowModal(true); 
  }
  const openEdit = (item) => { 
    setEditItem(item); 
    setForm({ bab: item.bab, nama_bab: item.nama_bab, pasal: item.pasal, nama_pasal: item.nama_pasal, nomor: item.nomor, isi: item.isi }); 
    setIsNewBab(false);
    setIsNewPasal(false);
    setShowModal(true); 
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.bab || !form.pasal || !form.nomor || !form.isi) { alert('Lengkapi semua field wajib.'); return }
    setSaving(true)
    const maxUrutan = data.length > 0 ? Math.max(...data.map(d => d.urutan || 0)) + 1 : 1
    if (editItem) {
      const { error } = await supabase.from('school_regulations').update({ ...form }).eq('id', editItem.id)
      if (error) alert('Gagal: ' + error.message)
    } else {
      const { error } = await supabase.from('school_regulations').insert([{ ...form, urutan: maxUrutan }])
      if (error) alert('Gagal: ' + error.message)
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  const handleDelete = async (item) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Ketentuan?',
      message: `Hapus "${item.bab} ${item.pasal} No. ${item.nomor}"?\nTindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('school_regulations').delete().eq('id', item.id)
    if (error) alert('Gagal: ' + error.message)
    else fetchData()
  }

  // ─── EXPORT ───────────────────────────────────────────────
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Tata Tertib')
    ws.columns = [
      { header: 'Bab', key: 'bab', width: 10 },
      { header: 'Nama Bab', key: 'nama_bab', width: 22 },
      { header: 'Pasal', key: 'pasal', width: 12 },
      { header: 'Nama Pasal', key: 'nama_pasal', width: 22 },
      { header: 'Nomor', key: 'nomor', width: 10 },
      { header: 'Isi Ketentuan', key: 'isi', width: 60 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    data.forEach((row, i) => {
      const r = ws.addRow({ bab: row.bab, nama_bab: row.nama_bab, pasal: row.pasal, nama_pasal: row.nama_pasal, nomor: row.nomor, isi: row.isi })
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
      r.alignment = { wrapText: true, vertical: 'top' }
    })
    ws.eachRow(r => { r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } } }) })
    const buf = await wb.xlsx.writeBuffer()
    const today = new Date().toISOString().slice(0, 10)
    saveAs(new Blob([buf]), `tata-tertib-${today}.xlsx`)
  }

  // ─── IMPORT ───────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    const rows = []
    ws.eachRow((row, rn) => {
      if (rn === 1) return
      const [bab, nama_bab, pasal, nama_pasal, nomor, isi] = [1,2,3,4,5,6].map(i => (row.getCell(i).value ?? '').toString().trim())
      const errors = []
      if (!bab) errors.push('Bab kosong')
      if (!pasal) errors.push('Pasal kosong')
      if (!nomor) errors.push('Nomor kosong')
      if (!isi) errors.push('Isi kosong')
      rows.push({ bab, nama_bab, pasal, nama_pasal, nomor, isi, _errors: errors, _valid: errors.length === 0 })
    })
    setImportRows(rows.filter(r => r.bab || r.isi))
    setImportLoading(false)
    setImportResult(null)
    if (importRef.current) importRef.current.value = ''
  }

  const handleImportSave = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) { alert('Tidak ada data valid untuk disimpan.'); return }
    setImportLoading(true)
    const maxUrutan = data.length > 0 ? Math.max(...data.map(d => d.urutan || 0)) : 0
    const inserts = valid.map((r, i) => ({ bab: r.bab, nama_bab: r.nama_bab, pasal: r.pasal, nama_pasal: r.nama_pasal, nomor: r.nomor, isi: r.isi, urutan: maxUrutan + i + 1 }))
    const { error } = await supabase.from('school_regulations').insert(inserts)
    setImportLoading(false)
    if (error) { alert('Gagal import: ' + error.message); return }
    setImportResult({ success: valid.length, skipped: importRows.length - valid.length })
    fetchData()
  }

  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Template Tata Tertib')
    ws.columns = [
      { header: 'Bab', key: 'bab', width: 10 },
      { header: 'Nama Bab', key: 'nama_bab', width: 22 },
      { header: 'Pasal', key: 'pasal', width: 12 },
      { header: 'Nama Pasal', key: 'nama_pasal', width: 22 },
      { header: 'Nomor', key: 'nomor', width: 10 },
      { header: 'Isi Ketentuan', key: 'isi', width: 60 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    ws.addRow({ bab: 'BAB I', nama_bab: 'Tujuan dan Fungsi', pasal: 'Pasal 1', nama_pasal: 'Tujuan', nomor: '01', isi: 'Contoh isi ketentuan pasal ini.' })
    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), 'template-tata-tertib.xlsx')
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>

  return (
    <>
      {ConfirmModalComponent}
      <div className="animate-slide-up flex flex-col min-h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] pb-2 md:pb-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tata Tertib Sekolah</h2>
          <p className="text-slate-500 text-sm mt-0.5">Pasal-pasal tata tertib SMP Budi Mulia Jakarta</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Excel
            </button>
            <button onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null) }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              Import Excel
            </button>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Tambah Pasal
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 shrink-0">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Cari pasal atau isi ketentuan..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={filterBab} onChange={e => setFilterBab(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700">
          <option value="all">Semua Bab</option>
          {uniqueBabs.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Content — grouped */}
      <div className="space-y-4 flex-1 overflow-auto pr-1 min-h-[500px] lg:min-h-0 pb-4 scrollbar-hide">
        {Object.entries(grouped).length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">Tidak ada data ditemukan.</div>
        ) : Object.entries(grouped).map(([bab, babData]) => (
          <div key={bab} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div 
              onClick={() => toggleBab(bab)}
              className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors flex justify-between items-center"
            >
              <h3 className="font-bold text-indigo-800 text-sm">{bab} — {babData.nama_bab}</h3>
              <svg className={`w-4 h-4 text-indigo-600 transition-transform duration-300 ${collapsedBabs[bab] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {!collapsedBabs[bab] && (
              <div className="animate-fade-in">
                {Object.entries(babData.pasals).map(([pasal, pasalData]) => (
              <div key={pasal}>
                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-600">{pasal}: {pasalData.nama_pasal}</p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {pasalData.items.map((item, idx) => (
                      <tr key={item.id} className={`border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="px-5 py-2.5 w-12 text-center text-xs font-bold text-slate-500">{item.nomor}</td>
                        <td className="px-2 py-2.5 text-slate-700 leading-relaxed">{item.isi}</td>
                        {!readOnly && (
                          <td className="px-3 py-2.5 w-20 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEdit(item)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => handleDelete(item)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
              </div>
            )}
          </div>
        ))}
      </div>

      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{editItem ? 'Edit Ketentuan' : 'Tambah Ketentuan'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bab <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select 
                      value={isNewBab ? "NEW" : form.bab} 
                      onChange={e => {
                        if (e.target.value === "NEW") {
                          setIsNewBab(true)
                          setForm({...form, bab: getNextBab(data), nama_bab: ''})
                        } else {
                          setIsNewBab(false)
                          const existingBab = data.find(d => d.bab === e.target.value)
                          setForm({...form, bab: e.target.value, nama_bab: existingBab?.nama_bab || ''})
                        }
                      }}
                      disabled={!!editItem}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white disabled:bg-slate-50"
                    >
                      {uniqueBabs.map(b => <option key={b} value={b}>{b}</option>)}
                      <option value="NEW">+ Buat Bab Baru...</option>
                    </select>
                    {isNewBab && (
                      <input value={form.bab} disabled className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-bold text-center shrink-0" />
                    )}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Bab</label>
                  <input value={form.nama_bab} onChange={e => setForm({...form, nama_bab: e.target.value})} disabled={!isNewBab && !editItem} placeholder="Tujuan dan Fungsi" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50" />
                </div>
                
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pasal <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select 
                      value={isNewPasal ? "NEW" : form.pasal} 
                      onChange={e => {
                        if (e.target.value === "NEW") {
                          setIsNewPasal(true)
                          setForm({...form, pasal: getNextPasal(data), nama_pasal: ''})
                        } else {
                          setIsNewPasal(false)
                          const existingPasal = data.find(d => d.pasal === e.target.value && d.bab === form.bab)
                          setForm({...form, pasal: e.target.value, nama_pasal: existingPasal?.nama_pasal || ''})
                        }
                      }}
                      disabled={!!editItem}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white disabled:bg-slate-50"
                    >
                      {[...new Set((data || []).filter(d => d.bab === form.bab).map(d => d.pasal))].sort().map(p => <option key={p} value={p}>{p}</option>)}
                      <option value="NEW">+ Buat Pasal Baru...</option>
                    </select>
                    {isNewPasal && (
                      <input value={form.pasal} disabled className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 font-bold text-center shrink-0" />
                    )}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Pasal</label>
                  <input value={form.nama_pasal} onChange={e => setForm({...form, nama_pasal: e.target.value})} disabled={!isNewPasal && !editItem} placeholder="Tujuan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor <span className="text-red-500">*</span></label>
                <input value={form.nomor} onChange={e => setForm({...form, nomor: e.target.value})} placeholder="01" required className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Isi Ketentuan <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.isi} onChange={e => setForm({...form, isi: e.target.value})} required placeholder="Tulis isi ketentuan di sini..." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                <button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center">
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
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800">Import Tata Tertib dari Excel</h3>
              <button onClick={() => setShowImportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <div className="flex gap-3 mb-4">
                <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download Template
                </button>
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all cursor-pointer">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                  Pilih File Excel
                  <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
                </label>
              </div>

              {importLoading && <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}

              {importRows.length > 0 && !importResult && (
                <>
                  <p className="text-xs text-slate-500 mb-2">Preview: {importRows.filter(r => r._valid).length} valid, {importRows.filter(r => !r._valid).length} error</p>
                  <div className="overflow-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 border-b border-slate-200">
                        {['Bab','Pasal','Nomor','Isi Ketentuan','Status'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}
                      </tr></thead>
                      <tbody>{importRows.map((r, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${!r._valid ? 'bg-red-50' : i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-3 py-2">{r.bab}</td>
                          <td className="px-3 py-2">{r.pasal}</td>
                          <td className="px-3 py-2">{r.nomor}</td>
                          <td className="px-3 py-2 max-w-[240px] truncate">{r.isi}</td>
                          <td className="px-3 py-2">{r._valid ? <span className="text-emerald-600 font-semibold">✓ Valid</span> : <span className="text-red-500 font-semibold">✗ {r._errors.join(', ')}</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => { setShowImportModal(false); setImportRows([]) }} className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">Batal</button>
                    <button onClick={handleImportSave} disabled={importLoading || importRows.filter(r=>r._valid).length===0} className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-60 flex items-center justify-center">
                      {importLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : `Simpan ${importRows.filter(r=>r._valid).length} Data Valid`}
                    </button>
                  </div>
                </>
              )}
              {importResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="font-bold text-emerald-700 text-lg">{importResult.success} data berhasil diimport</p>
                  {importResult.skipped > 0 && <p className="text-sm text-slate-500 mt-1">{importResult.skipped} data dilewati karena error</p>}
                  <button onClick={() => setShowImportModal(false)} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700">Tutup</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
