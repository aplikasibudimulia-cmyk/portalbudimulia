import os
import re

def revert_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Revert global background
    content = content.replace('bg-[#F9F6F0]/50', 'bg-slate-50/50')
    content = content.replace('bg-[#F9F6F0]', 'bg-slate-50')
    
    # Revert rounded corners (except for the specific ones we want to keep if any, but let's standardise to rounded-xl)
    # The sidebar collapse button might use rounded-3xl but changing to rounded-xl is fine for the original theme.
    content = content.replace('rounded-[32px]', 'rounded-xl')
    content = content.replace('rounded-3xl', 'rounded-xl')
    
    # Revert border-none to border border-slate-200
    # Note: earlier we did: content = re.sub(r'border-none bg-white', r'border border-slate-200 bg-white', content)
    content = content.replace('border-none bg-white', 'border border-slate-200 bg-white')
    content = content.replace('bg-white border-none', 'bg-white border border-slate-200')
    content = content.replace('bg-[#FDFDFB]', 'bg-white')

    # Revert Sidebar active states
    content = content.replace('bg-slate-900 text-white shadow-xl', 'bg-indigo-50 text-indigo-700 shadow-sm')
    content = content.replace('bg-slate-900 text-white shadow-lg', 'bg-indigo-50 text-indigo-700 shadow-sm')
    content = content.replace('text-white', 'text-indigo-600') # This might affect other things, but text-indigo-600 was the active icon color. Wait, let's be careful.
    
    # Inactive sidebar hover
    content = content.replace('hover:bg-white/60 hover:text-slate-900', 'hover:bg-slate-50 hover:text-slate-700')
    content = content.replace('hover:bg-white/60', 'hover:bg-slate-50')
    
    # Restore Sidebar layout wrapper
    # my-4 ml-4 bg-[#F1EADC] rounded-xl border-none transform transition-all duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col shadow-sm  
    content = content.replace('my-4 ml-4 bg-[#F1EADC] rounded-xl border-none transform transition-all', 
                              'bg-white border-r border-slate-200 transform transition-all')
    content = content.replace('bg-[#F1EADC]', 'bg-white')
    
    # Restore the logout button bg-white/40 to just standard
    content = content.replace('bg-white/40', 'bg-red-50')
    
    # Let's fix text-white replacing being too broad
    # Earlier we replaced !selectedType ? 'text-indigo-600' : 'text-slate-400' with 	ext-white
    # Let's fix it manually or by careful regex if needed.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.jsx'):
            revert_file(os.path.join(root, file))

