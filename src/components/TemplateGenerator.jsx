import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { jsPDF } from 'jspdf'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

const AVAILABLE_FIELDS = [
  { key: 'nama_lengkap', label: 'Nama Lengkap' },
  { key: 'kelas', label: 'Kelas' },
  { key: 'nisn', label: 'NISN' },
  { key: 'nipd', label: 'NIPD' },
  { key: 'kode', label: 'Kode Siswa' },
  { key: 'no_whatsapp', label: 'No WhatsApp' },
]

export default function TemplateGenerator({ type, students, onRefresh }) {
  const [templateUrl, setTemplateUrl] = useState(type?.template_url || '')
  const [config, setConfig] = useState(type?.template_config || [])
  const [uploadingBg, setUploadingBg] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(null)
  
  const bgInputRef = useRef(null)
  const editorRef = useRef(null)

  // Sync state when type changes
  useEffect(() => {
    setTemplateUrl(type?.template_url || '')
    setConfig(type?.template_config || [])
  }, [type])

  const handleUploadBackground = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
      alert('Konfigurasi Cloudinary belum diatur.')
      return
    }

    setUploadingBg(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)
    const sanitizeName = (str) => (str || 'Lainnya').replace(/\s+/g, '_')
    formData.append('public_id', `bg_${type.kode_jenis}`)
    formData.append('folder', `templates/${sanitizeName(type.nama)}`)

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.secure_url) {
        const { error } = await supabase.from('jenis_pengumuman')
          .update({ template_url: data.secure_url })
          .eq('id', type.id)
        
        if (!error) {
          setTemplateUrl(data.secure_url)
          onRefresh?.()
        } else {
          alert('Gagal menyimpan URL ke database.')
        }
      }
    } catch (err) {
      alert('Gagal mengunggah gambar.')
    }
    setUploadingBg(false)
    if (bgInputRef.current) bgInputRef.current.value = ''
  }

  const addField = (fieldKey) => {
    if (config.some(c => c.key === fieldKey)) return
    const fieldDef = AVAILABLE_FIELDS.find(f => f.key === fieldKey)
    setConfig([...config, {
      id: Date.now().toString(),
      key: fieldKey,
      label: fieldDef.label,
      x: 50, // percentage
      y: 50, // percentage
      size: 12,
      color: '#000000',
      bold: false,
      align: 'left'
    }])
  }

  const removeField = (id) => {
    setConfig(config.filter(c => c.id !== id))
  }

  const updateField = (id, changes) => {
    setConfig(config.map(c => c.id === id ? { ...c, ...changes } : c))
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    const { error } = await supabase.from('jenis_pengumuman')
      .update({ template_config: config })
      .eq('id', type.id)
    if (error) alert('Gagal menyimpan konfigurasi.')
    else onRefresh?.()
    setSavingConfig(false)
  }

  // Simple drag logic
  const handleDrag = (e, id) => {
    if (!editorRef.current) return
    const rect = editorRef.current.getBoundingClientRect()
    // only update if it's a mouse event inside the rect
    if (e.clientX === 0 && e.clientY === 0) return // ignore invalid events

    const xPos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const yPos = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    updateField(id, { x: xPos, y: yPos })
  }

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const generateAndUploadAll = async () => {
    if (!templateUrl || config.length === 0) {
      alert('Template gambar dan teks harus dikonfigurasi terlebih dahulu.')
      return
    }
    if (!window.confirm(`Yakin ingin membuat dan mengunggah PDF untuk ${students.length} siswa? Ini mungkin memakan waktu beberapa menit.`)) return

    setGenerating(true)
    setProgress({ current: 0, total: students.length, status: 'Mengunduh gambar template...' })

    try {
      // 1. Download template image as base64
      const imgRes = await fetch(templateUrl)
      const imgBlob = await imgRes.blob()
      const base64Img = await blobToBase64(imgBlob)

      let successCount = 0
      let failCount = 0

      // 2. Loop through students
      for (let i = 0; i < students.length; i++) {
        const student = students[i]
        if (!student.kode) { failCount++; continue }

        setProgress({ current: i + 1, total: students.length, status: `Memproses ${student.nama_lengkap}...` })

        // Initialize jsPDF A4
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        // Add background
        doc.addImage(base64Img, 'JPEG', 0, 0, 210, 297)

        // Add texts
        config.forEach(field => {
          const text = student[field.key] || '-'
          doc.setFontSize(field.size)
          doc.setTextColor(field.color)
          doc.setFont(undefined, field.bold ? 'bold' : 'normal')
          
          const xMm = (field.x / 100) * 210
          const yMm = (field.y / 100) * 297
          
          doc.text(text, xMm, yMm, { align: field.align })
        })

        const pdfBlob = doc.output('blob')
        const fileName = `${student.kode}${type.kode_jenis}.pdf`

        // Upload to Cloudinary
        const formData = new FormData()
        formData.append('file', pdfBlob, fileName)
        formData.append('upload_preset', UPLOAD_PRESET)
        const sanitizeName = (str) => (str || 'Lainnya').replace(/\s+/g, '_')
        formData.append('public_id', `${student.kode}${type.kode_jenis}`)
        formData.append('folder', `pengumuman/${sanitizeName(type.nama)}`)

        const upRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: formData })
        const upData = await upRes.json()

        if (upData.secure_url) {
          // Upsert to Supabase
          await supabase.from('berkas_pengumuman').upsert({
            kode_siswa: student.kode,
            kode_jenis: type.kode_jenis,
            file_name: fileName,
            file_url: upData.secure_url,
            is_accessible: false // Default tertutup
          }, { onConflict: 'kode_siswa,kode_jenis' })
          successCount++
        } else {
          failCount++
        }
      }

      alert(`Selesai! Berhasil: ${successCount}, Gagal: ${failCount}`)
    } catch (err) {
      console.error(err)
      alert('Terjadi kesalahan saat proses massal: ' + err.message)
    }

    setGenerating(false)
    setProgress(null)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Upload Background Section */}
      <div className="bg-white border-none rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-2">1. Background Template (A4)</h3>
        <p className="text-slate-500 text-sm mb-4">Unggah gambar kosong (kop surat, dll) berukuran A4 (Portrait) berformat JPG/PNG.</p>
        
        <input ref={bgInputRef} type="file" accept="image/jpeg, image/png" className="hidden" onChange={handleUploadBackground} />
        
        <div className="flex items-center gap-4">
          <button onClick={() => bgInputRef.current?.click()} disabled={uploadingBg || generating}
            className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-sm transition border border-indigo-200">
            {uploadingBg ? 'Mengunggah...' : 'Upload Gambar Background'}
          </button>
          {templateUrl && <span className="text-green-600 text-sm font-medium flex items-center gap-1"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Template Terpasang</span>}
        </div>
      </div>

      {/* Visual Editor Section */}
      {templateUrl && (
        <div className="bg-white border-none rounded-xl p-6 shadow-sm grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">2. Variabel Teks</h3>
              <p className="text-slate-500 text-sm mb-4">Pilih variabel yang ingin ditampilkan di dokumen.</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {AVAILABLE_FIELDS.map(f => (
                  <button key={f.key} onClick={() => addField(f.key)} disabled={config.some(c => c.key === f.key) || generating}
                    className="px-3 py-1.5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-medium transition">
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {config.map(field => (
                <div key={field.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 relative group">
                  <button onClick={() => removeField(field.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <p className="font-semibold text-slate-800 text-sm mb-2">{field.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium">Ukuran Font</label>
                      <input type="number" value={field.size} onChange={e => updateField(field.id, { size: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-medium">Warna</label>
                      <input type="color" value={field.color} onChange={e => updateField(field.id, { color: e.target.value })} className="w-full h-7 rounded cursor-pointer" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input type="checkbox" checked={field.bold} onChange={e => updateField(field.id, { bold: e.target.checked })} /> Bold
                    </label>
                    <select value={field.align} onChange={e => updateField(field.id, { align: e.target.value })} className="text-xs border border-slate-300 rounded px-1 py-0.5">
                      <option value="left">Kiri</option>
                      <option value="center">Tengah</option>
                      <option value="right">Kanan</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleSaveConfig} disabled={savingConfig || generating}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm transition">
              {savingConfig ? 'Menyimpan...' : 'Simpan Layout'}
            </button>
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Pratinjau Layout</h3>
            <p className="text-slate-500 text-sm mb-4">Geser teks ke posisi yang diinginkan. Posisi akan dihitung sebagai persentase dari ukuran A4.</p>
            
            <div className="relative border border-slate-300 shadow-sm bg-slate-100 flex items-center justify-center overflow-hidden" style={{ aspectRatio: '210/297' }}>
              <img src={templateUrl} alt="Template" className="w-full h-full object-cover pointer-events-none" />
              
              <div ref={editorRef} className="absolute inset-0 z-10"
                   onDragOver={e => e.preventDefault()}>
                {config.map(field => (
                  <div key={field.id}
                    draggable
                    onDragEnd={e => handleDrag(e, field.id)}
                    className="absolute cursor-move px-2 py-0.5 border border-dashed border-indigo-400 bg-white/50 hover:bg-white/80 transition-colors whitespace-nowrap"
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      transform: field.align === 'center' ? 'translateX(-50%)' : field.align === 'right' ? 'translateX(-100%)' : 'none',
                      fontSize: `${field.size * 0.3}vw`, // responsive preview roughly mapping to mm
                      color: field.color,
                      fontWeight: field.bold ? 'bold' : 'normal',
                    }}
                  >
                    {`{{${field.label}}}`}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generator Section */}
      {templateUrl && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center">
          <h3 className="text-xl font-bold text-indigo-900 mb-2">3. Buat PDF Massal</h3>
          <p className="text-indigo-700 text-sm mb-6 max-w-lg">
            Sistem akan otomatis mengisi teks pada template gambar, membuat PDF, dan mengunggahnya ke server untuk setiap siswa.
          </p>

          {progress && (
            <div className="w-full max-w-md mb-6">
              <div className="flex justify-between text-xs font-semibold text-indigo-800 mb-1">
                <span>{progress.status}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
              </div>
            </div>
          )}

          <button onClick={generateAndUploadAll} disabled={generating || config.length === 0}
            className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold transition active:scale-95 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {generating ? 'Sedang Memproses...' : 'Generate & Upload Semua'}
          </button>
        </div>
      )}

    </div>
  )
}
