import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useConfirm } from '../utils/useConfirm'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const EMPTY_FORM = { tipe: 'negative', kategori: '', kode: '', jenis: '', keterangan: '', poin: '' }

const ROMANS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX"];
const getNextKategori = (data, tipe) => {
  const kats = [...new Set((data || []).filter(d => d.tipe === tipe).map(d => d.kategori))];
  let maxIdx = -1;
  kats.forEach(k => {
    if (!k) return;
    const romanMatch = k.split('.')[0];
    const idx = ROMANS.indexOf(romanMatch);
    if (idx > maxIdx) maxIdx = idx;
  });
  if (maxIdx !== -1 && maxIdx < ROMANS.length - 1) return `${ROMANS[maxIdx + 1]}. `;
  return "KATEGORI BARU";
}

export default function AdminKatalogPoinSection({ readOnly = false }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('negative')
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('all')
  const [isNewKategori, setIsNewKategori] = useState(false)
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
    const { data: rows } = await supabase.from('point_catalog').select('*').order('kategori').order('kode')
    setData(rows || [])
    setLoading(false)
  }

  const filtered = data.filter(d => {
    if (d.tipe !== activeTab) return false
    const q = search.toLowerCase()
    const matchSearch = !q || d.kategori?.toLowerCase().includes(q) || d.kode?.toLowerCase().includes(q) || d.jenis?.toLowerCase().includes(q)
    const matchKat = filterKategori === 'all' || d.kategori === filterKategori
    return matchSearch && matchKat
  })

  const uniqueKategoris = [...new Set(data.filter(d => d.tipe === activeTab).map(d => d.kategori))].sort()

  const openAdd = () => { 
    setEditItem(null); 
    const firstKat = [...new Set((data||[]).filter(d => d.tipe === activeTab).map(d=>d.kategori))].sort()[0] || '';
    setForm({ ...EMPTY_FORM, tipe: activeTab, kategori: firstKat }); 
    setIsNewKategori(false);
    setShowModal(true); 
  }
  const openEdit = (item) => {
    setEditItem(item)
    setForm({ tipe: item.tipe, kategori: item.kategori, kode: item.kode, jenis: item.jenis, keterangan: item.keterangan || '', poin: item.poin })
    setIsNewKategori(false);
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.kode || !form.jenis || form.poin === '') { alert('Lengkapi semua field wajib.'); return }
    const poinNum = parseInt(form.poin)
    if (isNaN(poinNum)) { alert('Poin harus berupa angka.'); return }
    if (form.tipe === 'negative' && poinNum > 0) { alert('Poin negatif harus bernilai negatif (< 0).'); return }
    if (form.tipe === 'positive' && poinNum <= 0) { alert('Poin positif harus bernilai positif (> 0).'); return }
    setSaving(true)
    const payload = { tipe: form.tipe, kategori: form.kategori, kode: form.kode, jenis: form.jenis, keterangan: form.keterangan, poin: poinNum }
    if (editItem) {
      const { error } = await supabase.from('point_catalog').update(payload).eq('id', editItem.id)
      if (error) { alert('Gagal: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('point_catalog').insert([payload])
      if (error) { alert('Gagal: ' + (error.code === '23505' ? 'Kode sudah ada!' : error.message)); setSaving(false); return }
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  const handleDelete = async (item) => {
    const confirmed = await requestConfirm({
      title: 'Hapus Katalog?',
      message: `Hapus "${item.kode} — ${item.jenis}"?`,
      confirmLabel: 'Hapus', confirmColor: 'red', icon: 'danger',
    })
    if (!confirmed) return
    const { error } = await supabase.from('point_catalog').delete().eq('id', item.id)
    if (error) alert('Gagal: ' + error.message)
    else fetchData()
  }

  // ─── EXPORT ───────────────────────────────────────────────
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Katalog Poin')
    ws.columns = [
      { header: 'Tipe (Negatif/Positif)', key: 'tipe', width: 22 },
      { header: 'Kategori', key: 'kategori', width: 28 },
      { header: 'Kode', key: 'kode', width: 12 },
      { header: 'Jenis Pelanggaran/Prestasi', key: 'jenis', width: 40 },
      { header: 'Sanksi/Keterangan', key: 'keterangan', width: 40 },
      { header: 'Poin', key: 'poin', width: 10 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    data.forEach((row, i) => {
      const r = ws.addRow({ tipe: row.tipe === 'negative' ? 'Negatif' : 'Positif', kategori: row.kategori, kode: row.kode, jenis: row.jenis, keterangan: row.keterangan || '', poin: row.poin })
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF' } }
      r.getCell('poin').font = { color: { argb: row.poin < 0 ? 'FFDC2626' : 'FF16A34A' }, bold: true }
    })
    ws.eachRow(r => { r.eachCell(c => { c.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } } }) })
    const buf = await wb.xlsx.writeBuffer()
    const today = new Date().toISOString().slice(0, 10)
    saveAs(new Blob([buf]), `katalog-poin-${today}.xlsx`)
  }

  // ─── IMPORT ───────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportLoading(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    const existingCodes = new Set(data.map(d => d.kode))
    const rows = []
    ws.eachRow((row, rn) => {
      if (rn === 1) return
      const [tipeRaw, kategori, kode, jenis, keterangan, poinRaw] = [1,2,3,4,5,6].map(i => (row.getCell(i).value ?? '').toString().trim())
      const errors = []
      const tipe = tipeRaw.toLowerCase() === 'positif' ? 'positive' : tipeRaw.toLowerCase() === 'negatif' ? 'negative' : null
      if (!tipe) errors.push('Tipe harus "Positif" atau "Negatif"')
      if (!kode) errors.push('Kode kosong')
      if (!jenis) errors.push('Jenis kosong')
      const poin = parseInt(poinRaw)
      if (isNaN(poin)) errors.push('Poin bukan angka')
      const isUpdate = existingCodes.has(kode)
      rows.push({ tipe, kategori, kode, jenis, keterangan, poin, _errors: errors, _valid: errors.length === 0, _isUpdate: isUpdate })
    })
    setImportRows(rows.filter(r => r.kode || r.jenis))
    setImportLoading(false)
    setImportResult(null)
    if (importRef.current) importRef.current.value = ''
  }

  const handleImportSave = async () => {
    const valid = importRows.filter(r => r._valid)
    if (valid.length === 0) { alert('Tidak ada data valid.'); return }
    setImportLoading(true)
    const upserts = valid.map(r => ({ tipe: r.tipe, kategori: r.kategori, kode: r.kode, jenis: r.jenis, keterangan: r.keterangan, poin: r.poin }))
    const { error } = await supabase.from('point_catalog').upsert(upserts, { onConflict: 'kode' })
    setImportLoading(false)
    if (error) { alert('Gagal import: ' + error.message); return }
    setImportResult({ success: valid.length, skipped: importRows.length - valid.length })
    fetchData()
  }

  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Template Katalog Poin')
    ws.columns = [
      { header: 'Tipe (Negatif/Positif)', key: 'tipe', width: 22 },
      { header: 'Kategori', key: 'kategori', width: 28 },
      { header: 'Kode', key: 'kode', width: 12 },
      { header: 'Jenis Pelanggaran/Prestasi', key: 'jenis', width: 40 },
      { header: 'Sanksi/Keterangan', key: 'keterangan', width: 40 },
      { header: 'Poin', key: 'poin', width: 10 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
    ws.addRow({ tipe: 'Negatif', kategori: 'I. KEHADIRAN', kode: '1.a', jenis: 'Terlambat ≤ 5 menit', keterangan: 'Dicatat petugas piket', poin: -2 })
    ws.addRow({ tipe: 'Positif', kategori: 'Prestasi Akademik', kode: 'PA-1', jenis: 'Juara kelas', keterangan: 'Penghargaan sekolah', poin: 10 })
    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), 'template-katalog-poin.xlsx')
  }

  const poinBadge = (poin) => {
    if (poin < 0) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">{poin}</span>
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">+{poin}</span>
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>

  return (
    <>
      {ConfirmModalComponent}
      <div className="animate-slide-up flex flex-col min-h-[calc(100vh-2rem-57px)] md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] pb-2 md:pb-0">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Katalog Poin</h2>
          <p className="text-slate-500 text-sm mt-0.5">Daftar jenis poin pelanggaran & prestasi siswa</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
            <button onClick={() => { setShowImportModal(true); setImportRows([]); setImportResult(null) }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold transition-all">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              Import
            </button>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Tambah
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4 shrink-0">
        {[{v:'negative',l:'Poin Negatif'},{v:'positive',l:'Poin Positif'}].map(t => (
          <button key={t.v} onClick={() => { setActiveTab(t.v); setFilterKategori('all'); setSearch('') }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === t.v ? (t.v === 'negative' ? 'bg-red-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm') : 'text-slate-600 hover:text-slate-800'}`}>
            {t.l} ({data.filter(d => d.tipe === t.v).length})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 shrink-0">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Cari kode atau jenis..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={filterKategori} onChange={e => setFilterKategori(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700">
          <option value="all">Semua Kategori</option>
          {uniqueKategoris.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border-none rounded-xl shadow-sm flex flex-col overflow-hidden flex-1 min-h-[500px] lg:min-h-0">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">Tidak ada data ditemukan.</div>
        ) : (
          <div className="overflow-auto flex-1 border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold w-24">Kode</th>
                  <th className="px-4 py-3 text-left font-semibold">Kategori</th>
                  <th className="px-4 py-3 text-left font-semibold">Jenis</th>
                  <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Keterangan/Sanksi</th>
                  <th className="px-4 py-3 text-center font-semibold w-20">Poin</th>
                  {!readOnly && <th className="px-4 py-3 text-center font-semibold w-20">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors ${i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5"><span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{item.kode}</span></td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-medium">{item.kategori}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{item.jenis}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs hidden md:table-cell">{item.keterangan || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{poinBadge(item.poin)}</td>
                    {!readOnly && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
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
        )}
      </div>

      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{editItem ? 'Edit Katalog Poin' : 'Tambah Katalog Poin'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {[{v:'negative',l:'Negatif'},{v:'positive',l:'Positif'}].map(t => (
                    <button key={t.v} type="button" onClick={() => {
                        const firstKat = [...new Set((data||[]).filter(d => d.tipe === t.v).map(d=>d.kategori))].sort()[0] || '';
                        setForm({...form, tipe: t.v, kategori: firstKat});
                        setIsNewKategori(false);
                      }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${form.tipe === t.v ? (t.v === 'negative' ? 'bg-red-600 text-white border-red-600' : 'bg-emerald-600 text-white border-emerald-600') : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kode <span className="text-red-500">*</span></label>
                  <input value={form.kode} onChange={e => setForm({...form, kode: e.target.value})} placeholder="1.a" required disabled={!!editItem} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Poin <span className="text-red-500">*</span></label>
                  <input type="number" value={form.poin} onChange={e => setForm({...form, poin: e.target.value})} placeholder={form.tipe === 'negative' ? '-5' : '10'} required className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <select 
                    value={isNewKategori ? "NEW" : form.kategori} 
                    onChange={e => {
                      if (e.target.value === "NEW") {
                        setIsNewKategori(true)
                        setForm({...form, kategori: getNextKategori(data, form.tipe)})
                      } else {
                        setIsNewKategori(false)
                        setForm({...form, kategori: e.target.value})
                      }
                    }}
                    disabled={!!editItem}
                    className={`${isNewKategori ? 'w-1/3' : 'w-full'} px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white disabled:bg-slate-50`}
                  >
                    {[...new Set(data.filter(d => d.tipe === form.tipe).map(d => d.kategori))].sort().map(k => <option key={k} value={k}>{k}</option>)}
                    <option value="NEW">+ Buat Kategori Baru...</option>
                  </select>
                  {isNewKategori && (
                    <input value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} placeholder="I. KEHADIRAN" className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis <span className="text-red-500">*</span></label>
                <input value={form.jenis} onChange={e => setForm({...form, jenis: e.target.value})} required placeholder="Terlambat ≤ 5 menit" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sanksi / Keterangan</label>
                <input value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})} placeholder="Keterangan tindakan" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
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
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800">Import Katalog Poin</h3>
              <button onClick={() => setShowImportModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <p className="text-xs text-slate-500 mb-3">Import bersifat <strong>UPSERT</strong>: kode yang sudah ada akan diperbarui, kode baru akan ditambahkan.</p>
              <div className="flex gap-3 mb-4">
                <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">Download Template</button>
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                  Pilih File Excel <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
                </label>
              </div>
              {importLoading && <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>}
              {importRows.length > 0 && !importResult && (
                <>
                  <p className="text-xs text-slate-500 mb-2">Preview: {importRows.filter(r=>r._valid).length} valid ({importRows.filter(r=>r._valid&&r._isUpdate).length} update, {importRows.filter(r=>r._valid&&!r._isUpdate).length} baru), {importRows.filter(r=>!r._valid).length} error</p>
                  <div className="overflow-auto border border-slate-200 rounded-xl max-h-60">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        {['Tipe','Kode','Jenis','Poin','Status'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600">{h}</th>)}
                      </tr></thead>
                      <tbody>{importRows.map((r,i) => (
                        <tr key={i} className={`border-b border-slate-50 ${!r._valid ? 'bg-red-50' : r._isUpdate ? 'bg-amber-50' : i%2===0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-3 py-1.5">{r.tipe === 'negative' ? 'Negatif' : r.tipe === 'positive' ? 'Positif' : r.tipe}</td>
                          <td className="px-3 py-1.5 font-mono font-bold text-indigo-700">{r.kode}</td>
                          <td className="px-3 py-1.5 max-w-[180px] truncate">{r.jenis}</td>
                          <td className="px-3 py-1.5 font-bold">{r.poin}</td>
                          <td className="px-3 py-1.5">{!r._valid ? <span className="text-red-500">✗ {r._errors.join(', ')}</span> : r._isUpdate ? <span className="text-amber-600 font-semibold">↻ Update</span> : <span className="text-emerald-600 font-semibold">+ Baru</span>}</td>
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
                  {importResult.skipped > 0 && <p className="text-sm text-slate-500 mt-1">{importResult.skipped} dilewati</p>}
                  <button onClick={() => setShowImportModal(false)} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold">Tutup</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
