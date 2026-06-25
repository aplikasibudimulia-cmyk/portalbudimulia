import re

for file in ['src/pages/Dashboard.jsx', 'src/pages/DashboardGuru.jsx', 'src/pages/Admin.jsx']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Turn logo container into a clickable toggle
    # Look for: <div className="flex items-center gap-3"> (or similar around the logo)
    content = re.sub(
        r'<div className="flex items-center gap-3">\s*<img src="/logo.png"',
        r'<div onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" title="Tampilkan/Sembunyikan Sidebar">\n            <img src="/logo.png"',
        content
    )
    
    # 2. Remove the "Sembunyikan" button at the bottom of Dashboard.jsx if it exists
    # The button usually has `<span className="animate-fade-in">Sembunyikan</span>`
    # Let's find the button and remove it.
    sembunyikan_pattern = r'<button onClick=\{[^}]*setSidebarCollapsed[^>]*>\s*<svg[^>]*>.*?</svg>\s*\{!sidebarCollapsed && <span className="animate-fade-in">Sembunyikan</span>\}\s*</button>'
    content = re.sub(sembunyikan_pattern, '', content, flags=re.DOTALL)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Applied logo toggle")
