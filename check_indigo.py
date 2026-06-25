import os
import re

count = 0
for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.jsx'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
            matches = re.findall(r'className=(?:\{|")[^"]*text-indigo-600[^"]*(?:\}|")', content)
            if matches:
                print(f"--- {file} ---")
                for m in set(matches):
                    print(m)
                count += len(matches)
print(f"Total: {count}")
