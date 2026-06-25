import os
import re

for file in ['src/pages/Admin.jsx', 'src/pages/DashboardGuru.jsx']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # We need to fix the text wrapping.
    # The buttons look like:
    # <IconDashboard /> Beranda Utama
    # </button>
    
    # Let's find all occurrences of:
    # <Icon([A-Za-z]+) />\s+([A-Za-z\s]+)\s*</button>
    
    def repl_icon_text(m):
        icon_name = m.group(1)
        text = m.group(2).strip()
        return f'<Icon{icon_name} /> {{!sidebarCollapsed && <span className="animate-fade-in truncate">{text}</span>}}\n            </button>'

    content = re.sub(r'<Icon([A-Za-z]+)\s*/>\s*([^<]+)\s*</button>', repl_icon_text, content)
    
    # Also fix Kelola Pengumuman: <IconSettings /> Kelola Pengumuman
    # The above regex handles it.

    # Also fix the dynamic loop:
    # <IconFile />
    # <span className="truncate">{t.nama}</span>
    # </button>
    
    content = re.sub(
        r'<IconFile\s*/>\s*<span className="truncate">\{t\.nama\}</span>\s*</button>',
        r'<IconFile />\n                {!sidebarCollapsed && <span className="animate-fade-in truncate">{t.nama}</span>}\n              </button>',
        content
    )
    
    # Also we need to fix the `className` for the dynamic loop button, since it wasn't modified earlier!
    # className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
    #    activeMenu === t.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    #  }`}
    
    dynamic_btn_class_pattern = r'className=\{`w-full flex items-center gap-3 px-3 py-2\.5 rounded-xl text-sm font-medium transition-all \$\{\s*activeMenu === t\.id \? \'bg-indigo-50 text-indigo-700 shadow-sm\' : \'text-slate-600 hover:bg-slate-100 hover:text-slate-900\'\s*\}\`\}'
    
    new_dynamic_class = r"className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === t.id ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}"
    
    content = re.sub(dynamic_btn_class_pattern, new_dynamic_class, content)

    # Let's also check if Icon components have shrink-0. If not, add shrink-0 to their className inside the component definition.
    # Icon definition looks like: const IconDashboard = () => (<svg className="w-5 h-5"...
    # Let's add shrink-0 to any w-5 h-5 in svg.
    # But only inside the file, just do a global replace of className="w-5 h-5" to className="w-5 h-5 shrink-0" for the svg tags.
    # Wait, there are many svgs. Let's just do it carefully.
    content = re.sub(r'<svg className="w-5 h-5"', r'<svg className="w-5 h-5 shrink-0"', content)
    content = re.sub(r'<svg className="w-6 h-6"', r'<svg className="w-6 h-6 shrink-0"', content)
    # clean up duplicates if any
    content = content.replace('shrink-0 shrink-0', 'shrink-0')

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed text wrapping and shrinking")
