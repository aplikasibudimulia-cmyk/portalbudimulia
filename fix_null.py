import os

files = [
    'src/pages/Dashboard.jsx',
    'src/pages/DashboardGuru.jsx',
    'src/pages/Admin.jsx'
]

for file in files:
    with open(file, 'rb') as f:
        b = f.read()
    if b'\x00' in b:
        b = b.replace(b'\x00', b'')
        with open(file, 'wb') as f:
            f.write(b)
        print(f"Fixed null bytes in {file}")
