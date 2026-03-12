
import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import Mermaid from './Mermaid';
import { Edit3 } from 'lucide-react';

interface StickyNoteProps {
  id: string;
  x: number;
  y: number;
  w: number;
  content: string;
  type: 'markdown' | 'mermaid' | 'title';
  scale: number;
  onDragEnd: (id: string, x: number, y: number) => void;
  onEditDiagram?: (id: string, code: string) => void;
}

const StickyNote: React.FC<StickyNoteProps> = ({ 
  id, x, y, w, content, type, scale, onDragEnd, onEditDiagram 
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x, y });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Sync initial position
  useEffect(() => {
    if (nodeRef.current) {
      nodeRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      posRef.current = { x, y };
    }
  }, [x, y]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      
      const dx = (moveEvent.clientX - dragStart.current.x) / scale;
      const dy = (moveEvent.clientY - dragStart.current.y) / scale;
      
      const newX = posRef.current.x + dx;
      const newY = posRef.current.y + dy;
      
      if (nodeRef.current) {
        nodeRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!isDragging.current) return;
      
      const dx = (upEvent.clientX - dragStart.current.x) / scale;
      const dy = (upEvent.clientY - dragStart.current.y) / scale;
      
      const finalX = posRef.current.x + dx;
      const finalY = posRef.current.y + dy;
      
      isDragging.current = false;
      posRef.current = { x: finalX, y: finalY };
      
      onDragEnd(id, finalX, finalY);
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={nodeRef}
      className="absolute flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 group will-change-transform"
      style={{ 
        width: w,
        maxHeight: 800,
        left: 0,
        top: 0
      }}
    >
      {/* Drag Handle */}
      <div 
        className="h-6 bg-slate-100 border-b border-slate-200 cursor-grab active:cursor-grabbing flex items-center justify-center"
        onMouseDown={handleMouseDown}
      >
        <div className="w-12 h-1 bg-slate-300 rounded-full"></div>
      </div>

      {/* Content */}
      <div className="p-5 overflow-y-auto custom-scrollbar bg-white text-slate-800 text-sm">
        {type === 'mermaid' ? (
          <div className="relative">
            <div className="pointer-events-none">
              <Mermaid chart={content.replace(/```mermaid/g, '').replace(/```/g, '')} />
            </div>
            <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-auto">
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onEditDiagram?.(id, content.replace(/```mermaid/g, '').replace(/```/g, '')); 
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 transform hover:scale-105 transition-all"
              >
                <Edit3 size={14}/> Edit Diagram
              </button>
            </div>
          </div>
        ) : (
          <div className="markdown-body prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(StickyNote);
