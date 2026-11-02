import React, { useState } from 'react'

export default function SuratVisualBuilder({ 
  builderState, 
  onChange, 
  availableTags = [],
  onResetStandard
}) {
  const [activeAccordion, setActiveAccordion] = useState('tujuan') // 'header' | 'tujuan' | 'pembuka' | 'sections' | 'catatan' | 'penutup' | 'pengesahan'

  // Helper untuk update field di builderState
  const updateField = (key, value) => {
    onChange({ ...builderState, [key]: value })
  }

  // Helper huruf sub-poin (a., b., c., d...)
  const getSubLetter = (index) => String.fromCharCode(97 + index) + '.'
  const getRomanNumeral = (index) => {
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    return (roman[index] || (index + 1)) + '.'
  }

  // --- Handlers Tujuan Baris ---
  const handleAddTujuanBaris = () => {
    const current = builderState.tujuanBaris || []
    onChange({
      ...builderState,
      tujuanBaris: [...current, { label: 'Baris Baru', tag: availableTags[0] || 'Nama', suffix: '' }]
    })
  }

  const handleUpdateTujuanBaris = (index, field, value) => {
    const list = [...(builderState.tujuanBaris || [])]
    list[index] = { ...list[index], [field]: value }
    onChange({ ...builderState, tujuanBaris: list })
  }

  const handleDeleteTujuanBaris = (index) => {
    const list = (builderState.tujuanBaris || []).filter((_, i) => i !== index)
    onChange({ ...builderState, tujuanBaris: list })
  }

  // --- Handlers Paragraf Pembuka ---
  const handleAddParagrafPembuka = () => {
    const list = [...(builderState.paragrafPembuka || [])]
    list.push('')
    onChange({ ...builderState, paragrafPembuka: list })
  }

  const handleUpdateParagrafPembuka = (index, value) => {
    const list = [...(builderState.paragrafPembuka || [])]
    list[index] = value
    onChange({ ...builderState, paragrafPembuka: list })
  }

  const handleDeleteParagrafPembuka = (index) => {
    const list = (builderState.paragrafPembuka || []).filter((_, i) => i !== index)
    onChange({ ...builderState, paragrafPembuka: list })
  }

  // --- Handlers Bagian Romawi & Sub Poin ---
  const handleAddSection = () => {
    const current = builderState.sections || []
    const newIdx = current.length + 1
    onChange({
      ...builderState,
      sections: [
        ...current,
        {
          id: `sec_${Date.now()}`,
          title: `BAGIAN BARU ${newIdx}`,
          items: [
            { label: 'Poin Pertama', tag: availableTags[0] || 'Nama', suffix: '' }
          ]
        }
      ]
    })
  }

  const handleUpdateSectionTitle = (sIdx, value) => {
    const list = [...(builderState.sections || [])]
    list[sIdx] = { ...list[sIdx], title: value }
    onChange({ ...builderState, sections: list })
  }

  const handleDeleteSection = (sIdx) => {
    const list = (builderState.sections || []).filter((_, i) => i !== sIdx)
    onChange({ ...builderState, sections: list })
  }

  const handleAddItemToSection = (sIdx) => {
    const list = [...(builderState.sections || [])]
    const items = [...(list[sIdx].items || [])]
    items.push({ label: 'Item Baru', tag: availableTags[0] || 'Nama', suffix: '' })
    list[sIdx] = { ...list[sIdx], items }
    onChange({ ...builderState, sections: list })
  }

  const handleUpdateItem = (sIdx, iIdx, field, value) => {
    const list = [...(builderState.sections || [])]
    const items = [...(list[sIdx].items || [])]
    items[iIdx] = { ...items[iIdx], [field]: value }
    list[sIdx] = { ...list[sIdx], items }
    onChange({ ...builderState, sections: list })
  }

  const handleDeleteItem = (sIdx, iIdx) => {
    const list = [...(builderState.sections || [])]
    const items = (list[sIdx].items || []).filter((_, i) => i !== iIdx)
    list[sIdx] = { ...list[sIdx], items }
    onChange({ ...builderState, sections: list })
  }

  // --- Handlers Catatan ---
  const handleAddCatatanPoin = () => {
    const list = [...(builderState.catatanPoin || [])]
    list.push('')
    onChange({ ...builderState, catatanPoin: list })
  }

  const handleUpdateCatatanPoin = (index, value) => {
    const list = [...(builderState.catatanPoin || [])]
    list[index] = value
    onChange({ ...builderState, catatanPoin: list })
  }

  const handleDeleteCatatanPoin = (index) => {
    const list = (builderState.catatanPoin || []).filter((_, i) => i !== index)
    onChange({ ...builderState, catatanPoin: list })
  }

  // --- Handlers Paragraf Penutup ---
  const handleAddParagrafPenutup = () => {
    const list = [...(builderState.paragrafPenutup || [])]
    list.push('')
    onChange({ ...builderState, paragrafPenutup: list })
  }

  const handleUpdateParagrafPenutup = (index, value) => {
    const list = [...(builderState.paragrafPenutup || [])]
    list[index] = value
    onChange({ ...builderState, paragrafPenutup: list })
  }

  const handleDeleteParagrafPenutup = (index) => {
    const list = (builderState.paragrafPenutup || []).filter((_, i) => i !== index)
    onChange({ ...builderState, paragrafPenutup: list })
  }

  // --- Handlers Pengesahan ---
  const handleUpdatePengesahan = (field, value) => {
    const pengesahan = {
      ...(builderState.pengesahan || {
        kota: 'Jakarta',
        mengetahui: 'Mengetahui,',
        jabatan: 'Kepala SMP Budi Mulia,',
        nama: '( Septian Ruswadi, S.Pd )'
      }),
      [field]: value
    }
    onChange({ ...builderState, pengesahan })
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden text-slate-800 space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 p-5 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-xl">
            ✨
          </span>
          <div>
            <h3 className="font-bold text-base leading-tight">Formulir Penyusun Surat Resmi (Visual Builder)</h3>
            <p className="text-xs text-blue-100 mt-0.5">
              Kop Sekolah &amp; TTD/Cap otomatis aktif. Susun isi surat, sub-data Romawi &amp; poin dengan mudah tanpa Word!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onResetStandard && (
            <button
              type="button"
              onClick={onResetStandard}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs transition cursor-pointer"
              title="Kembalikan ke susunan CKG standar"
            >
              ↺ Format Standar CKG
            </button>
          )}
        </div>
      </div>

      {/* Accordion Tabs */}
      <div className="p-5 space-y-3">

        {/* 1. KEPALA SURAT (Nomor, Lampiran, Perihal) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'header' ? '' : 'header')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>📌</span>
              <span>1. Nomor Surat, Lampiran &amp; Perihal</span>
            </div>
            <span>{activeAccordion === 'header' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'header' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nomor Surat:</label>
                  <input
                    type="text"
                    value={builderState.nomorSurat || ''}
                    onChange={(e) => updateField('nomorSurat', e.target.value)}
                    placeholder="misal: 084/SMP-BM/KES/IX/2026"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Lampiran:</label>
                  <input
                    type="text"
                    value={builderState.lampiran || ''}
                    onChange={(e) => updateField('lampiran', e.target.value)}
                    placeholder="misal: 1 (satu) Berkas Hasil Skrining"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Perihal:</label>
                  <input
                    type="text"
                    value={builderState.perihal || ''}
                    onChange={(e) => updateField('perihal', e.target.value)}
                    placeholder="misal: Pemberitahuan Hasil Cek Kesehatan"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. TUJUAN SURAT (Kepada Yth & Identitas) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'tujuan' ? '' : 'tujuan')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>🎯</span>
              <span>2. Ditujukan Kepada &amp; Identitas Penerima</span>
            </div>
            <span>{activeAccordion === 'tujuan' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'tujuan' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kepada Yth (Tipe Penerima):</label>
                  <input
                    type="text"
                    value={builderState.tujuanTipe || ''}
                    onChange={(e) => updateField('tujuanTipe', e.target.value)}
                    placeholder="misal: Bapak/Ibu Orang Tua / Wali Murid dari:"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Di Mana (Lokasi Penerima):</label>
                  <input
                    type="text"
                    value={builderState.diMana || ''}
                    onChange={(e) => updateField('diMana', e.target.value)}
                    placeholder="misal: di Tempat"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Baris Identitas Dinamis (Nama Siswa, Kelas/NISN, dll) */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-700">Baris Identitas Siswa / Penerima:</label>
                  <button
                    type="button"
                    onClick={handleAddTujuanBaris}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition"
                  >
                    + Tambah Baris Identitas
                  </button>
                </div>

                <div className="space-y-2">
                  {(builderState.tujuanBaris || []).map((tb, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        value={tb.label}
                        onChange={(e) => handleUpdateTujuanBaris(idx, 'label', e.target.value)}
                        placeholder="Label (misal: Nama Siswa)"
                        className="w-44 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                      />
                      <span className="text-slate-400 font-bold">:</span>
                      <select
                        value={tb.tag}
                        onChange={(e) => handleUpdateTujuanBaris(idx, 'tag', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white text-indigo-700"
                      >
                        {availableTags.map((tag, tIdx) => (
                          <option key={tIdx} value={tag}>
                            &lt;&lt;{tag}&gt;&gt;
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={tb.suffix || ''}
                        onChange={(e) => handleUpdateTujuanBaris(idx, 'suffix', e.target.value)}
                        placeholder="Teks tambahan / tag kedua (misal: / <<NISN>>)"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteTujuanBaris(idx)}
                        className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0"
                        title="Hapus baris"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. PARAGRAF PEMBUKA (Paragraf 1, 2...) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'pembuka' ? '' : 'pembuka')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>✍️</span>
              <span>3. Paragraf Pembuka &amp; Pengantar Surat</span>
            </div>
            <span>{activeAccordion === 'pembuka' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'pembuka' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="flex justify-between items-center">
                <p className="text-slate-500">Tulis teks kalimat pembuka surat. Setiap paragraf akan otomatis diberi jeda enter yang rapi.</p>
                <button
                  type="button"
                  onClick={handleAddParagrafPembuka}
                  className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition"
                >
                  + Tambah Paragraf Pembuka
                </button>
              </div>

              <div className="space-y-3">
                {(builderState.paragrafPembuka || []).map((p, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center font-bold text-slate-700">
                      <span>Paragraf Pembuka {idx + 1}:</span>
                      {(builderState.paragrafPembuka || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteParagrafPembuka(idx)}
                          className="text-rose-600 hover:text-rose-700 text-xs font-semibold"
                        >
                          Hapus Paragraf
                        </button>
                      )}
                    </div>
                    {/* Helper toolbar for numbering & bullets */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const addition = (p && p.trim() ? '\n' : '') + '1. Poin pertama\n2. Poin kedua\n3. Poin ketiga'
                          handleUpdateParagrafPembuka(idx, (p || '') + addition)
                        }}
                        className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 flex items-center gap-1 transition"
                        title="Sisipkan format penomoran 1, 2, 3..."
                      >
                        <span>🔢 + Sisipkan Numbering (1. 2. 3...)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const addition = (p && p.trim() ? '\n' : '') + '• Poin pertama\n• Poin kedua\n• Poin ketiga'
                          handleUpdateParagrafPembuka(idx, (p || '') + addition)
                        }}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 flex items-center gap-1 transition"
                        title="Sisipkan format bullet •"
                      >
                        <span>• + Sisipkan Poin (Bullet)</span>
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={p}
                      onChange={(e) => handleUpdateParagrafPembuka(idx, e.target.value)}
                      placeholder="Ketik teks paragraf... (Bisa ketik '1. Teks', '2. Teks' atau '- Teks' dengan enter untuk penomoran otomatis)"
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. SUB-DATA ROMAWI (I, II, III...) & SUB-POIN (a, b, c...) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'sections' ? '' : 'sections')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>📊</span>
              <span>4. Sub-Bagian Data Romawi (I, II, III...) &amp; Sub-Poin (a, b, c...)</span>
            </div>
            <span>{activeAccordion === 'sections' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'sections' && (
            <div className="p-4 bg-white space-y-4 text-xs animate-in fade-in duration-150">
              <div className="flex justify-between items-center">
                <p className="text-slate-500">
                  Sub-bagian Romawi otomatis diberi awalan <strong>I., II., III.</strong> dan sub-poin otomatis diberi abjad <strong>a., b., c.</strong> dengan titik dua sejajar.
                </p>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs"
                >
                  + Tambah Bagian Romawi Baru
                </button>
              </div>

              <div className="space-y-4">
                {(builderState.sections || []).map((sec, sIdx) => (
                  <div key={sec.id || sIdx} className="p-4 bg-slate-50 rounded-2xl border border-indigo-100 space-y-3">
                    {/* Header Bagian Romawi */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {getRomanNumeral(sIdx)}
                        </span>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => handleUpdateSectionTitle(sIdx, e.target.value)}
                          placeholder="Judul Bagian (misal: DATA PEMERIKSAAN FISIK & VITAL)"
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs uppercase tracking-wide bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddItemToSection(sIdx)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold text-xs transition"
                        >
                          + Tambah Sub-Poin (a, b, c...)
                        </button>
                        {(builderState.sections || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSection(sIdx)}
                            className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs"
                            title="Hapus Bagian ini"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sub-poin a, b, c... */}
                    <div className="space-y-2 pt-1">
                      {(sec.items || []).map((item, iIdx) => (
                        <div key={iIdx} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200">
                          <span className="w-6 font-bold text-center text-slate-700 shrink-0">
                            {getSubLetter(iIdx)}
                          </span>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => handleUpdateItem(sIdx, iIdx, 'label', e.target.value)}
                            placeholder="Label (misal: Tinggi Badan)"
                            className="w-48 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
                          />
                          <span className="text-slate-400 font-bold">:</span>
                          <select
                            value={item.tag}
                            onChange={(e) => handleUpdateItem(sIdx, iIdx, 'tag', e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white text-indigo-700"
                          >
                            {availableTags.map((tag, tIdx) => (
                              <option key={tIdx} value={tag}>
                                &lt;&lt;{tag}&gt;&gt;
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={item.suffix || ''}
                            onChange={(e) => handleUpdateItem(sIdx, iIdx, 'suffix', e.target.value)}
                            placeholder="Satuan / Teks Belakang (misal: cm)"
                            className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(sIdx, iIdx)}
                            className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center shrink-0 ml-auto"
                            title="Hapus sub-poin"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. CATATAN / POIN TAMBAHAN (Numbering / Bullet) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'catatan' ? '' : 'catatan')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>💡</span>
              <span>5. Catatan Tambahan (Opsi Numbering / Bullet)</span>
            </div>
            <span>{activeAccordion === 'catatan' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'catatan' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700">Tipe Penomoran:</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => updateField('catatanListType', 'number')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        builderState.catatanListType === 'number'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      1. 2. 3. Numbering
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('catatanListType', 'bullet')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        builderState.catatanListType === 'bullet'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      • Bullet Poin
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddCatatanPoin}
                  className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition"
                >
                  + Tambah Poin Catatan
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Judul Catatan:</label>
                <input
                  type="text"
                  value={builderState.catatanJudul || ''}
                  onChange={(e) => updateField('catatanJudul', e.target.value)}
                  placeholder="misal: Catatan Bagi Orang Tua:"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-xs"
                />
              </div>

              <div className="space-y-2">
                {(builderState.catatanPoin || []).map((cp, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-500 pt-1.5 w-6 text-center shrink-0">
                      {builderState.catatanListType === 'number' ? `${idx + 1}.` : '•'}
                    </span>
                    <textarea
                      rows={2}
                      value={cp}
                      onChange={(e) => handleUpdateCatatanPoin(idx, e.target.value)}
                      placeholder="Isi poin catatan..."
                      className="flex-1 p-2 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteCatatanPoin(idx)}
                      className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs shrink-0 mt-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 6. PARAGRAF PENUTUP */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'penutup' ? '' : 'penutup')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span>📜</span>
              <span>6. Paragraf Penutup</span>
            </div>
            <span>{activeAccordion === 'penutup' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'penutup' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="flex justify-between items-center">
                <p className="text-slate-500">Tulis ucapan terima kasih dan kalimat penutup surat.</p>
                <button
                  type="button"
                  onClick={handleAddParagrafPenutup}
                  className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition"
                >
                  + Tambah Paragraf Penutup
                </button>
              </div>

              <div className="space-y-3">
                {(builderState.paragrafPenutup || []).map((p, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center font-bold text-slate-700">
                      <span>Paragraf Penutup {idx + 1}:</span>
                      {(builderState.paragrafPenutup || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteParagrafPenutup(idx)}
                          className="text-rose-600 hover:text-rose-700 text-xs font-semibold"
                        >
                          Hapus Paragraf
                        </button>
                      )}
                    </div>
                    {/* Helper toolbar for numbering & bullets */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const addition = (p && p.trim() ? '\n' : '') + '1. Poin pertama\n2. Poin kedua\n3. Poin ketiga'
                          handleUpdateParagrafPenutup(idx, (p || '') + addition)
                        }}
                        className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 flex items-center gap-1 transition"
                        title="Sisipkan format penomoran 1, 2, 3..."
                      >
                        <span>🔢 + Sisipkan Numbering (1. 2. 3...)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const addition = (p && p.trim() ? '\n' : '') + '• Poin pertama\n• Poin kedua\n• Poin ketiga'
                          handleUpdateParagrafPenutup(idx, (p || '') + addition)
                        }}
                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 flex items-center gap-1 transition"
                        title="Sisipkan format bullet •"
                      >
                        <span>• + Sisipkan Poin (Bullet)</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={p}
                      onChange={(e) => handleUpdateParagrafPenutup(idx, e.target.value)}
                      placeholder="Ketik teks kalimat penutup... (Bisa ketik '1. Teks', '2. Teks' atau '- Teks' dengan enter untuk penomoran otomatis)"
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 7. PENGESAHAN (Kota & Tanggal, Mengetahui, Jabatan, TTD & Cap Kepsek) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden transition">
          <button
            type="button"
            onClick={() => setActiveAccordion(activeAccordion === 'pengesahan' ? '' : 'pengesahan')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-xs uppercase tracking-wider text-slate-800 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span>🖋️</span>
              <span>7. Pengesahan (Tanggal, Mengetahui, Cap &amp; TTD Kepsek, Nama Kepsek)</span>
            </div>
            <span>{activeAccordion === 'pengesahan' ? '▲' : '▼'}</span>
          </button>

          {activeAccordion === 'pengesahan' && (
            <div className="p-4 bg-white space-y-3 text-xs animate-in fade-in duration-150">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 flex items-start gap-2.5">
                <span className="text-lg">⚙️</span>
                <div>
                  <p className="font-bold">Cap Sekolah &amp; Tanda Tangan Resmi Otomatis Terpasang</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Tanda tangan dan cap resmi SMP Budi Mulia otomatis dipasang pada posisi yang presisi. Anda dapat menggeser posisinya secara bebas melalui tombol &quot;⚙️ Atur TTD &amp; Cap&quot; di pratinjau.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kota Penerbitan Surat:</label>
                  <input
                    type="text"
                    value={builderState.pengesahan?.kota || 'Jakarta'}
                    onChange={(e) => handleUpdatePengesahan('kota', e.target.value)}
                    placeholder="misal: Jakarta"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Teks Mengetahui:</label>
                  <input
                    type="text"
                    value={builderState.pengesahan?.mengetahui || 'Mengetahui,'}
                    onChange={(e) => handleUpdatePengesahan('mengetahui', e.target.value)}
                    placeholder="misal: Mengetahui,"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Jabatan Penandatangan:</label>
                  <input
                    type="text"
                    value={builderState.pengesahan?.jabatan || 'Kepala SMP Budi Mulia,'}
                    onChange={(e) => handleUpdatePengesahan('jabatan', e.target.value)}
                    placeholder="misal: Kepala SMP Budi Mulia,"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nama Kepala Sekolah &amp; Gelar:</label>
                  <input
                    type="text"
                    value={builderState.pengesahan?.nama || '( Septian Ruswadi, S.Pd )'}
                    onChange={(e) => handleUpdatePengesahan('nama', e.target.value)}
                    placeholder="misal: ( Septian Ruswadi, S.Pd )"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
