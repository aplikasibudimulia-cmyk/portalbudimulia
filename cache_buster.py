import os
import re
import time

timestamp = str(int(time.time()))

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.jsx'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            if '/logo.png' in content:
                # Replace exact string '/logo.png' with '/logo.png?v=NEWTIMESTAMP'
                # but careful not to replace already timestamped ones multiple times if they exist.
                # First remove any existing query strings on logo.png
                content = re.sub(r'/logo\.png\?v=\d+', '/logo.png', content)
                # Now add the new query string
                content = content.replace('/logo.png', f'/logo.png?v={timestamp}')
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated cache buster in {filepath}")

