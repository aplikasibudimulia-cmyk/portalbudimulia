import re
import os

pastels = ['bg-[#F8D2D9]', 'bg-[#FBE4C4]', 'bg-[#C6EBD9]', 'bg-[#D7D7F8]']

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Change rounded-xl to rounded-[32px] globally in components
    content = content.replace('rounded-xl', 'rounded-[32px]')
    content = content.replace('rounded-2xl', 'rounded-[32px]')
    content = content.replace('rounded-lg', 'rounded-2xl') # Some smaller elements should be rounder
    
    # Remove borders from cards
    content = re.sub(r'border border-slate-200\s*bg-white', r'border-none bg-white', content)
    content = re.sub(r'bg-white border border-slate-200', r'bg-white border-none', content)
    content = content.replace('bg-white', 'bg-[#FDFDFB]')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk('src/components'):
    for file in files:
        if file.endswith('.jsx'):
            update_file(os.path.join(root, file))

