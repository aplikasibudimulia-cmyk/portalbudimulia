import os
import re

filepath = 'src/components/AdminManajemenAkunSection.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the state variable
content = re.sub(r'\s*const \[akunSummary, setAkunSummary\] = useState\(\{ total: 0, murid: 0, guru: 0, admin: 0 \}\)\n', '\n', content)

# Remove fetchAkunSummary definition
content = re.sub(r'\s*const fetchAkunSummary = async \(\) => \{.*?\n    \}\n', '', content, flags=re.DOTALL)

# Remove fetchAkunSummary calls inside useEffect and fetchData
content = re.sub(r'\s*fetchAkunSummary\(\)\n', '\n', content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Cleaned up unused akunSummary state and functions")
