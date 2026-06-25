import os

files = [
    'src/pages/DashboardGuru.jsx',
    'src/pages/Admin.jsx'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if the file is corrupted with spaces between every character
    # For example, " i m p o r t "
    if content.startswith(' i m p o r t '):
        # Fix the spacing
        fixed_content = content[1::2]
        with open(file, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"Fixed {file}")
    else:
        print(f"File {file} does not match corruption pattern. Starts with: {repr(content[:20])}")
