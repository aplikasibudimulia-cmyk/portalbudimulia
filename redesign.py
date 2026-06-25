import re
import os

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Global background
    content = content.replace('bg-slate-50', 'bg-[#F9F6F0]')
    
    # Rounded corners for main cards
    content = content.replace('rounded-xl', 'rounded-[32px]')
    content = content.replace('rounded-2xl', 'rounded-[32px]')
    content = content.replace('rounded-3xl', 'rounded-[32px]')
    
    # Remove harsh borders on white cards, add slight pastel feel
    content = re.sub(r'border border-slate-200\s*bg-white', r'border-none bg-white', content)
    content = re.sub(r'bg-white border border-slate-200', r'bg-white border-none', content)
    
    # Make sidebar floating
    # Find sidebar div
    content = re.sub(r'w-72 bg-white border-r border-slate-200', r'w-72 m-4 bg-[#F1EADC] rounded-[32px] border-none', content)
    
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

