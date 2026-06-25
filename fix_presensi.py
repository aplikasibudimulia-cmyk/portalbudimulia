import os

for file in ['src/pages/Admin.jsx', 'src/pages/DashboardGuru.jsx']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the broken Presensi QR Code button text block and fix it.
    start_idx = content.find('<button title="Presensi QR Code"')
    if start_idx != -1:
        end_idx = content.find('Presensi QR Code"', start_idx + 10)
        
        # We know the original was supposed to be:
        # <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
        
        # Let's just fix the whole button:
        # Instead of parsing, we can find the block starting with `<button title="Presensi QR Code"` down to `</button>`
        # and replace it entirely!
        
        # Actually it's easier to use a regex to replace the entire <button> that has handleMenuNavigation('presensi_qr')
        import re
        content = re.sub(
            r'<button title="Presensi QR Code"[^>]*>[\s\S]*?onClick=\{([^}]*handleMenuNavigation\(\'presensi_qr\'\)[^}]*)\}[\s\S]*?</button>',
            r'''<button onClick={\1}
            title="Presensi QR Code"
            className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${activeMenu === 'presensi_qr' ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'} ${sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}`}>
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 14v3M14 17h3"/></svg>
            {!sidebarCollapsed && <span className="animate-fade-in truncate">Presensi QR Code</span>}
          </button>''',
            content
        )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed presensi qr code button")
