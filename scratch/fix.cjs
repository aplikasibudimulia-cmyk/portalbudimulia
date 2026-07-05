const fs = require('fs');
const file = 'c:/Users/Gesta/AndroidStudioProjects/SKL-BM/src/pages/DashboardOrangTua.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    setIsSavingBiodata(true)
            <img src="/logo.png?v=1782401880" alt="Logo" className={\`\${sidebarCollapsed ? 'w-14 h-14' : 'w-20 h-20'} object-contain shrink-0 drop-shadow-sm transition-all duration-300\`} />`;

const replacement = `    setIsSavingBiodata(true)

    try {
      const { error } = await supabase
        .from('siswa_permanent')
        .update({
          nama_ortu: editBiodataForm.nama_ortu.trim() || null,
          no_hp_ortu: editBiodataForm.no_hp_ortu.trim() || null,
          email_ortu: editBiodataForm.email_ortu.trim() || null
        })
        .eq('nisn', studentData.nisn)

      if (error) throw error

      setBiodataSuccess(true)
      const updatedData = { ...studentData, ...editBiodataForm }
      setStudentData(updatedData)
      localStorage.setItem('siswa_session', JSON.stringify(updatedData))
      
      logActivity({
        userRole: 'Siswa',
        action: 'Update Biodata Orang Tua',
        details: \`Orang tua dari siswa dengan NISN \${studentData.nisn} berhasil memperbarui biodata.\`
      })

      setTimeout(() => {
        setShowEditBiodataModal(false)
        setBiodataSuccess(false)
      }, 1500)
    } catch (err) {
      setBiodataError('Terjadi kesalahan saat menyimpan biodata.')
    } finally {
      setIsSavingBiodata(false)
    }
  }

  // Tampilan Menu Siswa (Opsional / Per Pengumuman)
  const showNisnMenu = selectedType ? selectedType.show_nisn : false
  const showNipdMenu = selectedType ? selectedType.show_nipd : false
  const showTahunLulusMenu = selectedType ? selectedType.show_tahun_lulus : false

  // Either global profile wants it shown OR the current menu type specifically wants it shown
  const isNisnVisible = showProfileConfig.nisn || showNisnMenu
  const isNipdVisible = showProfileConfig.nipd || showNipdMenu

  const sapaanHeader = studentData?.nama_ortu 
    ? \`Selamat datang, \${studentData.nama_ortu} orangtua dari \${studentData.nama_lengkap || studentData?.nama}\` 
    : \`Selamat datang, Bapak/Ibu orangtua dari \${studentData?.nama_lengkap || studentData?.nama}\`;

  const studentInfoCard = studentData && (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fade-in mb-8 relative">
      {linkGrupOrtu && (
        <a href={linkGrupOrtu} target="_blank" rel="noopener noreferrer" className="absolute top-6 right-6 inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs px-3 py-1.5 rounded-xl transition-colors border border-emerald-200 shadow-sm">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span className="hidden sm:inline">Grup Wali Kelas</span>
          <span className="sm:hidden">Grup</span>
        </a>
      )}
      <div className="flex items-center gap-5 mb-6">
        {showProfileConfig.foto && (
          <img src={photoUrls[photoIndex] || DEFAULT_AVATAR} alt={studentData.nama_lengkap}
            className="w-16 h-16 rounded-full object-cover bg-blue-100 shrink-0 border-2 border-white shadow-sm"
            onError={() => {
              if (photoIndex < photoUrls.length - 1) {
                setPhotoIndex(prev => prev + 1)
              } else if (photoUrls[photoIndex] !== DEFAULT_AVATAR) {
                setPhotoUrls(prev => { const n = [...prev]; n[photoIndex] = DEFAULT_AVATAR; return n; })
              }
            }} />
        )}
        <div className={linkGrupOrtu ? "pr-24 sm:pr-32" : ""}>
          <p className="text-xs text-indigo-500 font-semibold mb-0.5">{sapaanHeader}</p>
          <h2 className="text-2xl font-bold text-slate-800 leading-tight">{studentData.nama_lengkap}</h2>
          {showProfileConfig.kelas && (
            <p className="text-sm text-slate-500 mt-1">Kelas: <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{studentData.kelas}</span></p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isNisnVisible && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">NISN</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nisn ?? '—'}</p>
          </div>
        )}
        {isNipdVisible && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">NIPD</p>
            <p className="text-sm font-bold text-slate-700">{studentData.nipd ?? '—'}</p>
          </div>
        )}
        {showTahunLulusMenu && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium mb-1">Tahun Lulus</p>
            <p className="text-sm font-bold text-slate-700">{studentData.tahun_lulus ?? '—'}</p>
          </div>
        )}
        {showProfileConfig.tahun_ajaran && (
          <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl px-4 py-3">
            <p className="text-xs text-indigo-400 font-medium mb-1">Tahun Ajaran</p>
            <p className="text-sm font-bold text-indigo-700">{studentData.tahun_ajaran ?? '—'}</p>
          </div>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium mt-4">Memuat portal...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-800">
      
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
{/* Sidebar */}
      <div className={\`fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 transform transition-all duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col shadow-sm \${sidebarOpen ? 'translate-x-0' : '-translate-x-[150%]'} \${sidebarCollapsed ? 'w-24' : 'w-72'}\`}>
        
        {/* Sidebar Header */}
        <div className={\`p-5 border-b border-slate-200 flex items-center shrink-0 bg-white transition-all \${sidebarCollapsed ? 'justify-center' : 'justify-between'}\`}>
          <div onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={\`flex items-center cursor-pointer hover:opacity-80 transition-opacity \${sidebarCollapsed ? 'justify-center w-full' : 'gap-3'}\`} title="Tampilkan/Sembunyikan Sidebar">
            <img src="/logo.png?v=1782401880" alt="Logo" className={\`\${sidebarCollapsed ? 'w-14 h-14' : 'w-20 h-20'} object-contain shrink-0 drop-shadow-sm transition-all duration-300\`} />`;

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTargetStr = targetStr.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedTargetStr)) {
  content = normalizedContent.replace(normalizedTargetStr, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Success!');
} else {
  console.log('Target string not found in file!');
}
