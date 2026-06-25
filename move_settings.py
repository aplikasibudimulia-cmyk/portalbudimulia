import os
import re

filepath = 'src/pages/Admin.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the Pengaturan Sistem button
pengaturan_pattern = r'\s*<button title="Pengaturan Sistem" onClick=\{\(\) => handleMenuNavigation\(\'konfigurasi\'\)\}[\s\S]*?</button>\s*'
match = re.search(pengaturan_pattern, content)
if not match:
    print("Could not find Pengaturan Sistem button!")
else:
    btn_text = match.group(0)
    
    # Remove it from original position
    content = content.replace(btn_text, '\n')
    
    # Now we need to insert it right before the Keluar Sesi button inside the logout div
    # Wait, the logout div is:
    # <div className="p-4 border-t border-slate-200 bg-slate-50">
    #   <button onClick={handleLogout} ...>
    
    logout_div_pattern = r'(<div className="p-4 border-t border-slate-200 bg-slate-50">)(\s*<button onClick=\{handleLogout\})'
    replacement = r'\1' + '\n          <div className="space-y-2">\n' + btn_text + r'\2'
    
    # Wait, if we use space-y-2 we need to close the div AFTER the logout button!
    # Let's just put it in the same space-y-2 div.
    # Actually, if we just make the container `<div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">` it's easier.
    
    content = re.sub(r'<div className="p-4 border-t border-slate-200 bg-slate-50">', r'<div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">', content)
    
    # Now insert the button right before the logout button
    content = re.sub(r'(\s*<button onClick=\{handleLogout\})', btn_text.rstrip() + r'\1', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Moved Pengaturan Sistem button!")
