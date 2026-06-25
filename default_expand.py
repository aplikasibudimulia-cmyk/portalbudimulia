import os

files = [
    'src/pages/Dashboard.jsx',
    'src/pages/DashboardGuru.jsx',
    'src/pages/Admin.jsx'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('const [sidebarCollapsed, setSidebarCollapsed] = useState(true)', 'const [sidebarCollapsed, setSidebarCollapsed] = useState(false)')
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
