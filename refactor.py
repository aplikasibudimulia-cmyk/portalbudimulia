import os
import re

filepath = 'src/pages/Admin.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'CollapsibleSection' not in content:
    import_stmt = "import CollapsibleSection from '../components/CollapsibleSection'\n"
    content = content.replace("import AdminBerandaConfigSection", import_stmt + "import AdminBerandaConfigSection")

# Replace Block 1: Manajemen Tahun Ajaran
# Find: <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<h3 className="text-sm font-semibold text-slate-800 mb-4">Manajemen Tahun Ajaran</h3>
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<h3 className="text-sm font-semibold text-slate-800 mb-4">Manajemen Tahun Ajaran</h3>',
    r'<CollapsibleSection title="Manajemen Tahun Ajaran" defaultOpen={true}>',
    content
)

# Replace Block 2: AdminSemesterSection
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<AdminSemesterSection ([^>]+) />\s*</div>',
    r'<CollapsibleSection title="Manajemen Semester">\n                  <AdminSemesterSection \1 />\n                </CollapsibleSection>',
    content
)

# Replace Block 3: AdminMapelSection
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<AdminMapelSection />\s*</div>',
    r'<CollapsibleSection title="Manajemen Mata Pelajaran">\n                  <AdminMapelSection />\n                </CollapsibleSection>',
    content
)

# Replace Block 4: AdminBerandaConfigSection
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<AdminBerandaConfigSection />\s*</div>',
    r'<CollapsibleSection title="Tampilan Profil Beranda Siswa">\n                  <AdminBerandaConfigSection />\n                </CollapsibleSection>',
    content
)

# Replace Block 5: Sinkronisasi Data CSV
# This one is tricky because it doesn't end immediately. The div closes way down.
# Let's replace the opening div.
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-xl p-4">',
    r'<CollapsibleSection title="Sinkronisasi Data (CSV)">\n                  <div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-xl p-4">',
    content
)

# Replace Block 6: Upload Foto Siswa Massal
content = re.sub(
    r'<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">\s*<div className="flex items-start justify-between flex-wrap gap-4 mb-4">\s*<div>\s*<h3 className="text-sm font-semibold text-slate-800">Upload Foto Siswa Massal</h3>',
    r'<CollapsibleSection title="Upload Foto Siswa Massal">\n                  <div className="flex items-start justify-between flex-wrap gap-4 mb-4">\n                    <div>\n                      <h3 className="text-sm font-semibold text-slate-800 hidden">Upload Foto Siswa Massal</h3>',
    content
)


# Now we need to replace the closing </div> for Block 1, Block 5, and Block 6 with </CollapsibleSection>
# Wait, this is very fragile. Let's do it by finding the exact closing divs in the context of `konfigurasi`.
# Actually, since we only opened `<CollapsibleSection>` for them, their matching `</div>` needs to be `</CollapsibleSection>`.
# But how to find which `</div>` is which?
