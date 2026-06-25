import os
import re

files = ['src/pages/Dashboard.jsx', 'src/pages/DashboardGuru.jsx', 'src/pages/Admin.jsx']

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern 1 (from Dashboard / DashboardGuru)
    content = re.sub(
        r'<div className="w-14 h-14[^>]*>\s*<img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />\s*</div>',
        '<img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0 drop-shadow-sm" />',
        content
    )

    # Pattern 2 (from Admin)
    content = re.sub(
        r'<div className="border border-slate-200 rounded-xl shadow-sm p-1 bg-white shrink-0">\s*<img src="/logo.png" alt="Logo" className="w-14 h-14 object-contain" />\s*</div>',
        '<img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0 drop-shadow-sm" />',
        content
    )
    
    # Pattern 3 (Admin with sidebarCollapsed ternary if it changed)
    content = re.sub(
        r'<div className="w-14 h-14 rounded-full shadow-sm flex items-center justify-center bg-white p-1 shrink-0">\s*<img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />\s*</div>',
        '<img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0 drop-shadow-sm" />',
        content
    )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Replaced logos")
