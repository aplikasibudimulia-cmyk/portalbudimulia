import os
import re

for file in ['src/pages/Admin.jsx', 'src/pages/DashboardGuru.jsx', 'src/pages/Dashboard.jsx']:
    if not os.path.exists(file): continue
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # The button class is:
    # w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors
    # Let's replace it with a template literal that supports sidebarCollapsed.
    old_class = r'className="w-full flex items-center justify-center gap-2 px-4 py-2\.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors"'
    new_class = r'className={`w-full flex items-center justify-center rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors ${sidebarCollapsed ? "aspect-square px-0" : "gap-2 px-4 py-2.5"}`}'
    
    content = re.sub(old_class, new_class, content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Updated Keluar Sesi styling")
