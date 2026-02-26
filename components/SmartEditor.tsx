import React, { useState, useRef, useEffect } from 'react';
import { Lightbulb, AlertTriangle, Info, CheckCircle } from 'lucide-react';

// ============================================================================
// 1. THE PRESENTATION ILLUSION (PURE FUNCTION RENDERER FOR BLOCKQUOTE)
// ============================================================================

export const renderCalloutBlockquote = (children: React.ReactNode) => {
  const childrenArray = React.Children.toArray(children);
  
  // Cari elemen pertama yang bukan sekadar whitespace (react-markdown sering menyisipkan '\n')
  const firstRealChildIndex = childrenArray.findIndex(
    (child) => typeof child !== 'string' || child.trim() !== ''
  );
  
  if (firstRealChildIndex !== -1) {
    const firstChild = childrenArray[firstRealChildIndex];
    
    // Di react-markdown, isi dari blockquote biasanya adalah elemen block seperti <p>
    if (React.isValidElement<any>(firstChild) && firstChild.type === 'p') {
      const pChildren = React.Children.toArray((firstChild.props as any).children);
      
      if (pChildren.length > 0 && typeof pChildren[0] === 'string') {
        const firstText = pChildren[0];
        
        // Deteksi sintaks Obsidian: [!type] Optional Title
        const match = firstText.match(/^\s*\[!([a-zA-Z]+)\](.*)/);
        
        if (match) {
          const type = match[1].toLowerCase();
          const customTitle = match[2].trim();
          
          // Hapus sintaks [!type] Title dari teks paragraf pertama
          const newFirstText = firstText.replace(/^\s*\[![a-zA-Z]+\][^\n]*/, '').replace(/^\n/, '');
          
          const newPChildren = [...pChildren];
          newPChildren[0] = newFirstText;
          
          // Jika paragraf pertama jadi kosong melompong, kita hilangkan saja
          const isPEmpty = newPChildren.length === 1 && typeof newPChildren[0] === 'string' && newPChildren[0].trim() === '';
          const newFirstChild = isPEmpty ? null : React.cloneElement(firstChild, {}, ...newPChildren);
          
          const calloutContent = [
            ...childrenArray.slice(0, firstRealChildIndex),
            ...(newFirstChild ? [newFirstChild] : []),
            ...childrenArray.slice(firstRealChildIndex + 1)
          ];
          
          // Styling default (Neo-Brutalism style)
          let bg = 'bg-gray-100';
          let border = 'border-gray-800';
          let icon = <Info size={16} />;
          let title = customTitle || type.charAt(0).toUpperCase() + type.slice(1);

          if (['note', 'abstract', 'summary', 'tldr'].includes(type)) {
            bg = 'bg-yellow-50 dark:bg-yellow-900/20';
            border = 'border-yellow-500';
            icon = <Lightbulb size={16} className="text-yellow-600" />;
          } else if (['warning', 'caution', 'attention'].includes(type)) {
            bg = 'bg-orange-50 dark:bg-orange-900/20';
            border = 'border-orange-500';
            icon = <AlertTriangle size={16} className="text-orange-600" />;
          } else if (['danger', 'error', 'bug', 'fail'].includes(type)) {
            bg = 'bg-red-50 dark:bg-red-900/20';
            border = 'border-red-500';
            icon = <AlertTriangle size={16} className="text-red-600" />;
          } else if (['info', 'todo'].includes(type)) {
            bg = 'bg-blue-50 dark:bg-blue-900/20';
            border = 'border-blue-500';
            icon = <Info size={16} className="text-blue-600" />;
          } else if (['success', 'check', 'done'].includes(type)) {
            bg = 'bg-green-50 dark:bg-green-900/20';
            border = 'border-green-500';
            icon = <CheckCircle size={16} className="text-green-600" />;
          }

          return (
            <div className={`my-4 border-2 ${border} ${bg} p-4 rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,0.1)] dark:shadow-[4px_4px_0px_rgba(255,255,255,0.05)] transition-all`}>
              <div className="font-extrabold uppercase tracking-wide flex items-center gap-2 mb-2 pb-2 border-b-2 border-black/10 dark:border-white/10">
                {icon}
                <span>{title}</span>
              </div>
              <div className="text-sm leading-relaxed opacity-90 callout-content">
                {calloutContent}
              </div>
            </div>
          );
        }
      }
    }
  }
  return null; // Return null jika bukan callout
};

// ============================================================================
// 2. MANUAL TRIGGER: THE SLASH COMMAND PROTOCOL (DROP-IN REPLACEMENT)
// ============================================================================

export interface SlashCommandEditorProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const SlashCommandEditor: React.FC<SlashCommandEditorProps> = ({ className = "", onChange, onKeyDown, value, ...props }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const commands = [
    { id: 'note', label: 'Note', icon: <Lightbulb size={14} className="text-yellow-500" />, text: '> [!note]\n> ' },
    { id: 'warning', label: 'Warning', icon: <AlertTriangle size={14} className="text-orange-500" />, text: '> [!warning]\n> ' },
    { id: 'danger', label: 'Danger', icon: <AlertTriangle size={14} className="text-red-500" />, text: '> [!danger]\n> ' },
    { id: 'info', label: 'Info', icon: <Info size={14} className="text-blue-500" />, text: '> [!info]\n> ' },
    { id: 'success', label: 'Success', icon: <CheckCircle size={14} className="text-green-500" />, text: '> [!success]\n> ' },
  ];

  const filteredCommands = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()));

  const updateMirror = () => {
    if (!textareaRef.current || !mirrorRef.current) return;
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    
    const style = window.getComputedStyle(ta);
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.width = style.width;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          insertCommand(filteredCommands[selectedIndex]);
        }
        return;
      } else if (e.key === 'Escape') {
        setShowMenu(false);
        return;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Auto-continue blockquote (>) on Enter
      const ta = textareaRef.current;
      if (ta) {
        const cursorPosition = ta.selectionStart;
        const currentValue = String(value || ta.value);
        const valueBeforeCursor = currentValue.slice(0, cursorPosition);
        const lines = valueBeforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];
        
        // Cek apakah baris saat ini hanya berisi "> " (kosong)
        const emptyBlockquoteMatch = currentLine.match(/^(\s*>\s*)$/);
        if (emptyBlockquoteMatch) {
          e.preventDefault();
          // Hapus "> " dan ganti dengan baris baru biasa (break out dari blockquote)
          const textAfterCursor = currentValue.slice(cursorPosition);
          const newValue = valueBeforeCursor.slice(0, -currentLine.length) + '\n' + textAfterCursor;
          
          if (onChange) {
            const event = { target: { value: newValue } } as React.ChangeEvent<HTMLTextAreaElement>;
            onChange(event);
          }
          
          setTimeout(() => {
            ta.focus();
            const newPos = cursorPosition - currentLine.length + 1;
            ta.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }
        
        // Cek apakah baris saat ini diawali dengan "> "
        const blockquoteMatch = currentLine.match(/^(\s*>\s*)/);
        if (blockquoteMatch) {
          e.preventDefault();
          const prefix = blockquoteMatch[1];
          const textAfterCursor = currentValue.slice(cursorPosition);
          const newValue = valueBeforeCursor + '\n' + prefix + textAfterCursor;
          
          if (onChange) {
            const event = { target: { value: newValue } } as React.ChangeEvent<HTMLTextAreaElement>;
            onChange(event);
          }
          
          setTimeout(() => {
            ta.focus();
            const newPos = cursorPosition + 1 + prefix.length;
            ta.setSelectionRange(newPos, newPos);
          }, 0);
          return;
        }
      }
    }
    
    // Teruskan event ke parent jika ada
    if (onKeyDown) onKeyDown(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    
    // Teruskan event ke parent
    if (onChange) onChange(e);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    
    // Deteksi apakah user mengetik '/' di awal baris atau setelah spasi
    const match = textBeforeCursor.match(/(?:^|\n| )\/([a-zA-Z]*)$/);
    
    if (match) {
      setFilter(match[1]);
      setShowMenu(true);
      setSelectedIndex(0);
      
      // Kalkulasi posisi popup menu
      updateMirror();
      if (mirrorRef.current && textareaRef.current) {
        const textBefore = textBeforeCursor.slice(0, -match[0].length + 1); 
        mirrorRef.current.textContent = textBefore;
        
        const span = document.createElement('span');
        span.textContent = '/';
        mirrorRef.current.appendChild(span);
        
        setMenuPos({
          top: span.offsetTop + parseInt(window.getComputedStyle(textareaRef.current).lineHeight || '20'),
          left: span.offsetLeft
        });
      }
    } else {
      setShowMenu(false);
    }
  };

  const insertCommand = (command: typeof commands[0]) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const cursorPosition = ta.selectionStart;
    const currentValue = String(value || ta.value);
    const textBeforeCursor = currentValue.slice(0, cursorPosition);
    const textAfterCursor = currentValue.slice(cursorPosition);
    
    const match = textBeforeCursor.match(/(?:^|\n| )\/([a-zA-Z]*)$/);
    if (match) {
      const startPos = cursorPosition - match[1].length - 1; 
      const prefix = (startPos > 0 && currentValue[startPos-1] !== '\n' && currentValue[startPos-1] !== ' ') ? ' ' : '';
      
      const newValue = currentValue.slice(0, startPos) + prefix + command.text + textAfterCursor;
      
      // Buat synthetic event untuk memicu onChange parent
      if (onChange) {
        const event = {
          target: { value: newValue }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        onChange(event);
      }
      
      setTimeout(() => {
        ta.focus();
        const newPos = startPos + prefix.length + command.text.length;
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    }
    setShowMenu(false);
  };

  return (
    <div className="relative w-full h-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full h-full resize-none outline-none bg-transparent ${className}`}
        {...props}
      />
      
      {/* Hidden mirror div untuk kalkulasi koordinat kursor (X,Y) */}
      <div 
        ref={mirrorRef} 
        className="absolute top-0 left-0 -z-10 opacity-0 pointer-events-none"
        aria-hidden="true"
      />
      
      {/* Slash Command Popup Menu */}
      {showMenu && filteredCommands.length > 0 && (
        <div 
          className="absolute z-50 bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-lg shadow-xl py-1 w-48 overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="px-3 py-2 text-[10px] font-bold text-[var(--ui-text-muted)] uppercase tracking-wider border-b border-[var(--ui-border)]">
            Insert Callout
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => insertCommand(cmd)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                  idx === selectedIndex 
                    ? 'bg-[var(--ui-primary)]/10 text-[var(--ui-primary)]' 
                    : 'text-[var(--ui-text-main)] hover:bg-[var(--ui-bg)]'
                }`}
              >
                {cmd.icon}
                <span className="font-medium">{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
