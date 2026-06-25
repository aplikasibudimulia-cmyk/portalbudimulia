import os

filepath = 'src/pages/Admin.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.strip() == '</div>' and (i+1 == 2238 or i+1 == 2271):
        lines[i] = line.replace('</div>', '</CollapsibleSection>')
    
    # Actually wait! The line numbers are shifted because in the previous replacements we replaced blocks!
    # Let's search by contextual matching.
    
    # if line i is </div> and line i+2 has <CollapsibleSection title="Upload Foto Siswa Massal">
    if i+2 < len(lines) and '</div>' in line and '<CollapsibleSection title="Upload Foto Siswa Massal">' in lines[i+2]:
        lines[i] = line.replace('</div>', '</CollapsibleSection>')
    
    # if line i is </div> and line i+2 has {/* Modal Update Terakhir */}
    if i+2 < len(lines) and '</div>' in line and '{/* Modal Update Terakhir */}' in lines[i+2]:
        lines[i] = line.replace('</div>', '</CollapsibleSection>')

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed closings again")
