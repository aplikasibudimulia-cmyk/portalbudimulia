import os
import re

filepath = 'src/pages/Admin.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Block 5 closing (which is right before <CollapsibleSection title="Upload Foto Siswa Massal">)
content = re.sub(
    r'                  </div>\n                </div>\n\n              <CollapsibleSection title="Upload Foto Siswa Massal">',
    r'                  </div>\n                </CollapsibleSection>\n\n              <CollapsibleSection title="Upload Foto Siswa Massal">',
    content
)

# Fix Block 6 closing (which is right before {/* Modal Update Terakhir */})
content = re.sub(
    r'                  </div>\n                </div>\n\n                {/\* Modal Update Terakhir \*/}',
    r'                  </div>\n                </CollapsibleSection>\n\n                {/* Modal Update Terakhir */}',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed closings")
