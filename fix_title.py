import os
import re

for file in ['src/pages/Admin.jsx', 'src/pages/DashboardGuru.jsx']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the corrupted title tags
    # <button title="<rect ...> ... "
    # Replace it with title="Presensi QR Code"
    content = re.sub(r'title="<rect[^>]*>[^"]*"', 'title="Presensi QR Code"', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed title tags")
