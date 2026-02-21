
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, ArrowRight, Command, Zap, Layout, FileText, Settings, Hash, 
  BrainCircuit, Sparkles, Cpu, Maximize2, X, GraduationCap, Microscope, 
  PenTool, FolderOpen, LogOut, Component 
} from 'lucide-react';
import { AppView, NoteMode, AIProvider, AppModel, HistoryItem } from '../types';
import { StorageService } from '../services/storageService';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
  onChangeMode: (mode: NoteMode) => void;
  onChangeProvider: (provider: AIProvider) => void;
  onSelectNote: (note: HistoryItem) => void;
  toggleFocusMode: () => void;
  isFocusMode: boolean;
}

type CommandGroup = 'Navigation' | 'Actions' | 'AI Model' | 'Note Mode' | 'Library';

interface CommandItem {
  id: string;
  label: string;
  group: CommandGroup;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ 
  isOpen, onClose, onNavigate, onChangeMode, onChangeProvider, onSelectNote, toggleFocusMode, isFocusMode
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notes, setNotes] = useState<HistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load notes for search when opened
  useEffect(() => {
    if (isOpen) {
      const storage = StorageService.getInstance();
      setNotes(storage.getLocalNotesMetadata()); // Fast local search - metadata only
      setQuery('');
      setSelectedIndex(0);
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const commands: CommandItem[] = useMemo(() => {
    const staticCmds: CommandItem[] = [
      // Navigation
      { id: 'nav-workspace', group: 'Navigation', label: 'Go to Workspace', icon: <Sparkles size={14}/>, action: () => onNavigate(AppView.WORKSPACE) },
      { id: 'nav-syllabus', group: 'Navigation', label: 'Go to Syllabus Manager', icon: <Layout size={14}/>, action: () => onNavigate(AppView.SYLLABUS) },
      { id: 'nav-vault', group: 'Navigation', label: 'Go to Neural Vault', icon: <FileText size={14}/>, action: () => onNavigate(AppView.ARCHIVE) },
      
      // Actions
      { id: 'act-focus', group: 'Actions', label: isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode (Zen)', icon: <Maximize2 size={14}/>, shortcut: 'F', action: toggleFocusMode },
      
      // AI Providers
      { id: 'ai-gemini', group: 'AI Model', label: 'Switch to Gemini Engine', icon: <Sparkles size={14}/>, action: () => onChangeProvider(AIProvider.GEMINI) },
      { id: 'ai-groq', group: 'AI Model', label: 'Switch to Groq LPU', icon: <Cpu size={14}/>, action: () => onChangeProvider(AIProvider.GROQ) },
      
      // Modes
      { id: 'mode-general', group: 'Note Mode', label: 'Mode: Standard', icon: <GraduationCap size={14}/>, action: () => onChangeMode(NoteMode.GENERAL) },
      { id: 'mode-cheat', group: 'Note Mode', label: 'Mode: Cheat Sheet', icon: <Zap size={14}/>, action: () => onChangeMode(NoteMode.CHEAT_CODES) },
      { id: 'mode-custom', group: 'Note Mode', label: 'Mode: Custom', icon: <PenTool size={14}/>, action: () => onChangeMode(NoteMode.CUSTOM) },
    ];

    // Dynamic Note Search
    const noteCmds: CommandItem[] = notes.map(note => ({
      id: `note-${note.id}`,
      group: 'Library',
      label: note.topic,
      icon: <FileText size={14}/>,
      action: () => onSelectNote(note)
    }));

    return [...staticCmds, ...noteCmds];
  }, [notes, isFocusMode]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands.slice(0, 15); // Show top default commands
    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(lowerQuery) || 
      cmd.group.toLowerCase().includes(lowerQuery)
    ).slice(0, 50);
  }, [query, commands]);

  // Keyboard Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  // Keep selected item in view
  useEffect(() => {
    if (listRef.current) {
       const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
       if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest' });
       }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-[#0f172a] border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] animate-slide-up relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-gray-900/50">
          <Search className="text-gray-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-lg text-white placeholder-gray-500 outline-none font-medium"
            placeholder="Type a command or search notes..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          <div className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded border border-gray-700 font-mono">ESC</div>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-2 scroll-smooth">
          {filteredCommands.length === 0 ? (
             <div className="p-8 text-center text-gray-500">No matching commands found.</div>
          ) : (
             filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.id}
                  onClick={() => { cmd.action(); onClose(); }}
                  className={`
                    flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-all group
                    ${index === selectedIndex ? 'bg-neuro-primary text-white shadow-lg' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-md ${index === selectedIndex ? 'bg-white/20' : 'bg-gray-800'}`}>
                      {cmd.icon}
                    </div>
                    <div>
                      <div className={`text-sm font-medium ${index === selectedIndex ? 'text-white' : 'text-gray-300'}`}>{cmd.label}</div>
                      <div className={`text-[10px] ${index === selectedIndex ? 'text-white/70' : 'text-gray-600'}`}>{cmd.group}</div>
                    </div>
                  </div>
                  
                  {cmd.shortcut && (
                     <div className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${index === selectedIndex ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-500'}`}>
                        {cmd.shortcut}
                     </div>
                  )}
                  {index === selectedIndex && <ArrowRight size={14} className="animate-pulse"/>}
                </div>
             ))
          )}
        </div>
        
        {/* Footer */}
        <div className="p-2 border-t border-white/5 bg-gray-900/80 text-[10px] text-gray-500 flex justify-between px-4">
           <span>Select <strong className="text-gray-400">↵</strong></span>
           <span>Navigate <strong className="text-gray-400">↑↓</strong></span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
