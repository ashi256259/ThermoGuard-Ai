import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: React.ReactNode;
  children?: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children || <Info className="w-3 h-3 text-slate-500 cursor-help ml-1 hover:text-blue-600 transition-colors" />}
      {show && (
        <div className="absolute z-50 w-48 p-2 text-[10px] leading-tight text-slate-600 bg-white border border-slate-200 rounded shadow-xl bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e293b]"></div>
        </div>
      )}
    </div>
  );
};
