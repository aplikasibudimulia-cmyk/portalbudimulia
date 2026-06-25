import os

filepath = 'src/pages/Admin.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Ensure CollapsibleSection is imported
import_line = "import CollapsibleSection from '../components/CollapsibleSection'\n"
# Find AdminBerandaConfigSection import and insert before it
for i, line in enumerate(lines):
    if "import AdminBerandaConfigSection" in line:
        if import_line not in lines:
            lines.insert(i, import_line)
        break

# Since we inserted a line, all line numbers are shifted by +1!
# Wait, let's just re-read the file without lines so we don't hardcode numbers,
# or we can just shift them. Let's do replacements by exact string matching using a script.
