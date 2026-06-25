import os

filepath = 'src/components/AdminManajemenAkunSection.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_next = False
for i, line in enumerate(lines):
    if line.strip() == 'useEffect(() => {':
        if i+1 < len(lines) and lines[i+1].strip() == '}, [])':
            skip_next = True
            continue
    if skip_next and line.strip() == '}, [])':
        skip_next = False
        continue
    
    if line.strip() == '}, [activeTab, activeTa])  }':
        new_lines.append(line.replace('}  }', '}').replace(']  }', ']'))
        continue

    new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
