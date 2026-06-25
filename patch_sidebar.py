import os
import re

def add_collapse_to_sidebar(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    
    # 1. Update <aside> width classes
    content = re.sub(
        r'<aside className=\{`fixed inset-y-0 left-0 z-40 w-72 m-4 bg-white rounded-xl border-none flex flex-col transition-transform duration-300 ease-in-out md:static md:w-64 md:translate-x-0 md:z-auto \$\{',
        r'<aside className={`fixed inset-y-0 left-0 z-40 m-4 bg-white rounded-xl border-none flex flex-col transition-all duration-300 ease-in-out md:static md:translate-x-0 md:z-auto ${sidebarCollapsed ? \'w-24\' : \'w-72 md:w-64\'} ${',
        content
    )
    
    # Also handle possible variations where transition-transform was changed to transition-all
    content = re.sub(
        r'<aside className=\{`fixed inset-y-0 left-0 z-40 w-72 m-4 bg-white rounded-xl border-none flex flex-col transition-all duration-300 ease-in-out md:static md:w-64 md:translate-x-0 md:z-auto \$\{',
        r'<aside className={`fixed inset-y-0 left-0 z-40 m-4 bg-white rounded-xl border-none flex flex-col transition-all duration-300 ease-in-out md:static md:translate-x-0 md:z-auto ${sidebarCollapsed ? \'w-24\' : \'w-72 md:w-64\'} ${',
        content
    )

    # 2. Update Sidebar Header
    header_regex = re.compile(
        r'<div className="p-5 border-b border-slate-200 flex items-center justify-between">\s*<div className="flex items-center gap-3">\s*<img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0 drop-shadow-sm" />\s*<div>\s*<p className="font-semibold text-slate-800 text-sm">([^<]+)</p>\s*<p className="text-slate-500 text-xs mt-0\.5">([^<]+)</p>\s*</div>\s*</div>\s*<button onClick=\{closeSidebar\}[^>]*>[\s\S]*?</button>\s*</div>'
    )
    
    def repl_header(m):
        return f"""<div className={{`p-5 border-b border-slate-200 flex items-center shrink-0 ${{sidebarCollapsed ? 'justify-center' : 'justify-between'}}`}}>
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-20 h-20 object-contain shrink-0 drop-shadow-sm" />
            {{!sidebarCollapsed && (
              <div className="animate-fade-in whitespace-nowrap">
                <p className="font-semibold text-slate-800 text-sm">{m.group(1)}</p>
                <p className="text-slate-500 text-xs mt-0.5">{m.group(2)}</p>
              </div>
            )}}
          </div>
          {{!sidebarCollapsed && (
            <button onClick={{closeSidebar}} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}}
        </div>"""
        
    content = header_regex.sub(repl_header, content)
    
    # 3. Update category labels (FITUR SISTEM, PENGUMUMAN / DOKUMEN, etc.)
    # <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">FITUR SISTEM</p>
    content = re.sub(
        r'<p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">([^<]+)</p>',
        r'{!sidebarCollapsed && <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">\1</p>}',
        content
    )
    
    # 4. Update the logout section and add toggle button
    # Replace the logout container div
    logout_regex = re.compile(r'<div className="p-4 border-t border-slate-200">\s*<button onClick=\{([^}]+)\}\s*className="([^"]+)">\s*<svg[^>]*>[\s\S]*?</svg>\s*Keluar Sesi\s*</button>\s*</div>')
    
    def repl_bottom(m):
        onclick = m.group(1)
        return f"""<div className="p-4 border-t border-slate-200 space-y-2">
          <button onClick={{() => setSidebarCollapsed(!sidebarCollapsed)}}
            title="Toggle Sidebar"
            className={{`w-full flex items-center px-4 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all ${{sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-4'}}`}}>
            <svg className={{`w-5 h-5 shrink-0 transition-transform duration-300 ${{sidebarCollapsed ? 'rotate-180' : ''}}`}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            {{!sidebarCollapsed && <span className="animate-fade-in">Sembunyikan</span>}}
          </button>
          <button onClick={{{onclick}}}
            title="Keluar Sesi"
            className={{`w-full flex items-center px-4 py-3 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors ${{sidebarCollapsed ? 'justify-center aspect-square px-0' : 'gap-3'}}`}}>
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            {{!sidebarCollapsed && <span className="animate-fade-in">Keluar Sesi</span>}}
          </button>
        </div>"""
        
    content = logout_regex.sub(repl_bottom, content)

    # 5. Update sidebar navigation buttons
    # Pattern: 
    # <button onClick={() => handleMenuNavigation('dashboard')}
    #   className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
    #     activeMenu === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    #   }`}>
    #   <IconDashboard /> Beranda Utama
    # </button>
    
    # We need to parse all <button> in the nav area and wrap their text in {!sidebarCollapsed && <span ...>}
    # Also adjust the button classes.
    
    def repl_nav_button(m):
        full_button = m.group(0)
        
        # Extract onclick
        onclick_m = re.search(r'onClick=\{([^\}]+)\}', full_button)
        onclick = onclick_m.group(1) if onclick_m else "() => {}"
        
        # Extract active condition
        active_cond_m = re.search(r'\$\{\s*([^?]+)\?', full_button)
        active_cond = active_cond_m.group(1).strip() if active_cond_m else "false"
        
        # Extract icon and text
        # Usually it's like <IconDashboard /> Beranda Utama or <svg ...>...</svg> Presensi QR Code
        # We can split by > and find the last text.
        icon_text_m = re.search(r'>\s*([\s\S]*?)([\s\w\/]+)\s*</button>', full_button)
        if icon_text_m:
            icon = icon_text_m.group(1).strip()
            text = icon_text_m.group(2).strip()
            
            # If the icon part still has <span> from previous mods, we need to handle it.
            # But assuming clean slate:
            if "<span" in icon:
                # it's already wrapped!
                return full_button
                
            # If the text is empty because the icon regex captured it all:
            # Let's do a more robust extraction.
            parts = re.split(r'(</(?:svg|Icon[\w]+)>|/>)\s*', full_button)
            # The last part before </button> is the text.
            match = re.search(r'(?:/>|</svg>|</Icon[^>]*>)\s*(.*)\s*</button>', full_button, flags=re.IGNORECASE|re.DOTALL)
            if match:
                text_part = match.group(1).strip()
                if not text_part:
                    return full_button # no text found
                
                # We need to replace the text_part with {!sidebarCollapsed && <span className="animate-fade-in truncate">{text_part}</span>}
                # And update class
                
                # Rebuild button
                new_class = f"`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-300 ${{{active_cond} ? 'bg-indigo-50 text-indigo-700 shadow-sm scale-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:scale-[1.02]'}} ${{sidebarCollapsed ? 'justify-center aspect-square px-0 py-3.5' : 'gap-3 px-3 py-2.5'}}`"
                
                # Replace class
                new_button = re.sub(r'className=\{`[^`]+`\}', f'className={{{new_class}}}', full_button)
                
                # If there's no tooltip, maybe add title
                if 'title=' not in new_button:
                    # insert after button
                    new_button = new_button.replace('<button', f'<button title="{text_part}"', 1)
                
                # Replace text
                new_button = new_button.replace(text_part + '</button>', f'{{!sidebarCollapsed && <span className="animate-fade-in truncate">{text_part}</span>}}\n          </button>')
                
                return new_button
                
        return full_button

    nav_regex = re.compile(r'<button onClick=\{[^}]+handleMenuNavigation[\s\S]*?</button>')
    content = nav_regex.sub(repl_nav_button, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")
    else:
        print(f"No changes made to {filepath}")

add_collapse_to_sidebar('src/pages/Admin.jsx')
add_collapse_to_sidebar('src/pages/DashboardGuru.jsx')

