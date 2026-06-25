import re
import os

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Sidebar active states
    content = content.replace('bg-indigo-50 text-indigo-700 shadow-sm', 'bg-slate-900 text-white shadow-lg')
    content = content.replace('text-indigo-600', 'text-white') # if it's active icon
    content = content.replace('text-slate-400', 'text-slate-500')
    
    # Inactive sidebar hover
    content = content.replace('hover:bg-slate-50', 'hover:bg-white/60')
    
    # User profile header matching reference
    content = content.replace('bg-white border-b border-slate-200 shadow-sm', 'bg-transparent border-none')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

files = [
    'src/pages/Dashboard.jsx',
    'src/pages/DashboardGuru.jsx',
    'src/pages/Admin.jsx'
]

for file in files:
    if os.path.exists(file):
        update_file(file)
        print(f'Updated {file}')

