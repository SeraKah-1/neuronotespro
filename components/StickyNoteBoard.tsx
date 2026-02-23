import React from 'react';
import { StickyNote } from '../types';
import { X, Pin } from 'lucide-react';

interface StickyNoteBoardProps {
  stickies: StickyNote[];
  onDelete: (id: string) => void;
}

const StickyNoteBoard: React.FC<StickyNoteBoardProps> = ({ stickies, onDelete }) => {
  if (stickies.length === 0) return null;

  const getStyles = (colorClass: string) => {
      if (colorClass.includes('blue')) {
          return {
              bg: 'bg-blue-50/90',
              border: 'border-blue-200/50',
              text: 'text-blue-900',
              icon: 'text-blue-600',
              meta: 'text-blue-700/50'
          };
      }
      // Default Yellow
      return {
          bg: 'bg-yellow-50/90',
          border: 'border-yellow-200/50',
          text: 'text-yellow-900',
          icon: 'text-yellow-600',
          meta: 'text-yellow-700/50'
      };
  };

  return (
    <div className="fixed right-4 top-24 w-64 space-y-4 z-40 pointer-events-none">
      {stickies.map((note) => {
        const styles = getStyles(note.color || 'bg-yellow-100');
        return (
        <div 
          key={note.id}
          className={`pointer-events-auto relative p-4 rounded-xl shadow-lg border ${styles.border} ${styles.bg} backdrop-blur-sm transform transition-all hover:scale-105 hover:rotate-1 animate-scale-in`}
          style={{ 
             transform: `rotate(${Math.random() * 4 - 2}deg)`,
             zIndex: 50
          }}
        >
          <div className="flex justify-between items-start mb-2">
            <Pin size={12} className={`${styles.icon} opacity-50 rotate-45`} />
            <button 
              onClick={() => onDelete(note.id)}
              className={`${styles.meta} hover:text-red-500 transition-colors`}
            >
              <X size={14} />
            </button>
          </div>
          <div className={`text-xs font-handwriting ${styles.text} leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar`}>
            {note.text}
          </div>
          <div className={`mt-2 text-[9px] ${styles.meta} text-right font-mono`}>
            {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )})}
    </div>
  );
};

export default StickyNoteBoard;
