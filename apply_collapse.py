import re
import os

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'sidebarCollapsed' in content:
        return # Already processed

    # Add state
    content = content.replace('const [sidebarOpen, setSidebarOpen] = useState(false)', 'const [sidebarOpen, setSidebarOpen] = useState(false)\n  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)')
    
    # Modify sidebar wrapper
    content = re.sub(r'(<div className={ixed inset-y-0 left-0 z-40 w-72 m-4 bg-\[#F1EADC\] rounded-\[32px\] border-none transform transition-transform duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col shadow-sm \$\{sidebarOpen \? \'translate-x-0\' : \'-translate-x-full\'\}>\s*)',
                     r'<div className={ixed inset-y-0 left-0 z-40 my-4 ml-4 bg-[#F1EADC] rounded-[32px] border-none transform transition-all duration-300 ease-in-out md:translate-x-0 md:relative flex flex-col shadow-sm  }>\n        ',
                     content)

    # Simplify the regex for replacing the sidebar wrapper. 
    # Just replace w-72 m-4 with my-4 ml-4 
    content = content.replace('w-72 m-4 bg-[#F1EADC] rounded-[32px] border-none transform transition-transform duration-300', 
                              'my-4 ml-4 bg-[#F1EADC] rounded-[32px] border-none transform transition-all duration-300')
    content = content.replace('', 
                              ' ')

    # Add the toggle button to the footer
    # Find the footer actions div
    footer_match = re.search(r'(<div className="p-4 space-y-3 shrink-0">)', content)
    if footer_match:
        toggle_btn = '''<div className="p-4 space-y-3 shrink-0">
           <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
             title="Toggle Sidebar"
             className={w-full flex items-center px-4 py-3.5 rounded-3xl text-sm font-bold text-slate-500 hover:bg-white/60 hover:text-slate-900 transition-all }>
             <svg className={w-6 h-6 shrink-0 transition-transform duration-300 } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
             {!sidebarCollapsed && <span className="animate-fade-in">Sembunyikan</span>}
           </button>'''
        content = content.replace(footer_match.group(1), toggle_btn)

    # Now for every button in the sidebar menu, we need to hide the text when collapsed.
    # We will use regex to find button content and wrap text in {!sidebarCollapsed && <span>text</span>}
    # This is tricky with python regex, let's just use replace on specific known strings if possible, or tell the user to wait.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_file('src/pages/DashboardGuru.jsx')
process_file('src/pages/Admin.jsx')

