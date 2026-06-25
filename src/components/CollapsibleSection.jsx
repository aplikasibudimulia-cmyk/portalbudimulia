import React, { useState } from 'react';

export default function CollapsibleSection({ title, description, children, defaultOpen = false, icon = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-5 overflow-hidden transition-all duration-300">
      <div 
        className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          {icon && <div className="text-indigo-600">{icon}</div>}
          <div>
            <h3 className="text-sm font-bold text-slate-800">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
          </div>
        </div>
        <div className={`p-1.5 rounded-lg bg-slate-100 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      <div className={`transition-all duration-300 ease-in-out origin-top ${isOpen ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="p-4 sm:p-5 pt-0 border-t border-slate-100">
          <div className="pt-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
