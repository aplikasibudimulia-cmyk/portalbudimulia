import os
import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    def replacer(match):
        full_class_string = match.group(0)
        
        dark_bgs = [
            'bg-indigo-500', 'bg-indigo-600', 'bg-indigo-700', 'bg-indigo-800', 'bg-indigo-900',
            'bg-blue-500', 'bg-blue-600', 'bg-blue-700', 'bg-blue-800', 'bg-blue-900',
            'bg-slate-500', 'bg-slate-600', 'bg-slate-700', 'bg-slate-800', 'bg-slate-900',
            'bg-red-500', 'bg-red-600', 'bg-red-700', 'bg-red-800', 'bg-red-900',
            'bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700', 'bg-emerald-800', 'bg-emerald-900',
            'bg-green-500', 'bg-green-600', 'bg-green-700', 'bg-green-800', 'bg-green-900',
            'bg-amber-500', 'bg-amber-600', 'bg-amber-700', 'bg-amber-800', 'bg-amber-900',
            'bg-rose-500', 'bg-rose-600', 'bg-rose-700', 'bg-rose-800', 'bg-rose-900',
            'bg-violet-500', 'bg-violet-600', 'bg-violet-700', 'bg-violet-800', 'bg-violet-900',
            'from-slate-800', 'from-violet-600', 'from-indigo-600'
        ]
        
        has_dark = any(bg in full_class_string for bg in dark_bgs)
        if has_dark:
            full_class_string = full_class_string.replace('text-indigo-600', 'text-white')
        
        if 'hover:bg-indigo-600' in full_class_string or 'hover:bg-indigo-700' in full_class_string or 'hover:bg-slate-800' in full_class_string or 'hover:bg-red-600' in full_class_string:
            full_class_string = full_class_string.replace('hover:text-indigo-600', 'hover:text-white')
            
        return full_class_string

    content = re.sub(r'className="[^"]*"', replacer, content)
    content = re.sub(r'className=\{`[^`]*`\}', replacer, content)

    # Some edge cases from the check script:
    # "text-xs font-medium bg-gradient-to-r from-violet-600 to-indigo-600 text-indigo-600"
    content = content.replace('from-violet-600 to-indigo-600 text-indigo-600', 'from-violet-600 to-indigo-600 text-white')
    content = content.replace('bg-indigo-600 text-indigo-600', 'bg-indigo-600 text-white')
    content = content.replace('bg-emerald-600 text-indigo-600', 'bg-emerald-600 text-white')
    content = content.replace('bg-indigo-600 hover:bg-indigo-700 text-indigo-600', 'bg-indigo-600 hover:bg-indigo-700 text-white')
    content = content.replace('bg-indigo-500 text-indigo-600', 'bg-indigo-500 text-white')
    content = content.replace('bg-slate-800 to-slate-900 rounded-xl p-6 md:p-8 shadow-lg text-indigo-600', 'bg-slate-800 to-slate-900 rounded-xl p-6 md:p-8 shadow-lg text-white')

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.jsx'):
            fix_file(os.path.join(root, file))

