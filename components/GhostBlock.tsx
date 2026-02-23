import React from 'react';
import { Check, X, Pin, Sparkles } from 'lucide-react';

interface GhostBlockProps {
  originalText: string;
  generatedText: string;
  position: { top: number; left: number };
  onAccept: () => void;
  onDiscard: () => void;
  onPin: () => void;
}

const GhostBlock: React.FC<GhostBlockProps> = ({
  originalText,
  generatedText,
  position,
  onAccept,
  onDiscard,
  onPin
}) => {
  return (
    <div 
      className="absolute z-50 w-full max-w-2xl bg-[var(--ui-surface)] border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.15)] rounded-xl overflow-hidden animate-fade-in backdrop-blur-md"
      style={{ top: position.top + 20, left: '50%', transform: 'translateX(-50%)' }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20">
        <div className="flex items-center gap-2 text-indigo-400">
          <Sparkles size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">AI Suggestion</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={onPin}
            className="p-1.5 hover:bg-indigo-500/20 rounded text-indigo-400 transition-colors"
            title="Pin as Sticky Note"
          >
            <Pin size={14} />
          </button>
          <button 
            onClick={onDiscard}
            className="p-1.5 hover:bg-red-500/20 rounded text-red-400 transition-colors"
            title="Discard"
          >
            <X size={14} />
          </button>
          <button 
            onClick={onAccept}
            className="p-1.5 hover:bg-green-500/20 rounded text-green-400 transition-colors"
            title="Accept"
          >
            <Check size={14} />
          </button>
        </div>
      </div>

      {/* CONTENT COMPARISON (Optional, for now just show result) */}
      <div className="p-4 max-h-60 overflow-y-auto custom-scrollbar">
         <div className="text-sm text-[var(--ui-text-main)] leading-relaxed whitespace-pre-wrap">
            {generatedText}
         </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center gap-2 p-2 bg-[var(--ui-bg)] border-t border-[var(--ui-border)]">
         <button 
            onClick={onAccept}
            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
         >
            <Check size={14} /> Accept
         </button>
         <button 
            onClick={onDiscard}
            className="flex-1 py-1.5 bg-[var(--ui-surface)] hover:bg-[var(--ui-bg)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
         >
            <X size={14} /> Discard
         </button>
      </div>
    </div>
  );
};

export default GhostBlock;
