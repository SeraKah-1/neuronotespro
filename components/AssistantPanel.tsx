import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadCloud, Send, StickyNote, FileText, X, Loader2, Bot, User, Copy, Check, Book, Plus, Layers, Wand2, Save, Settings2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { HistoryItem, AIProvider, AppModel, GEMINI_MODELS_LIST, ChatMessage } from '../types';
import { StorageService } from '../services/storageService';

interface AssistantPanelProps {
  noteMetadata?: HistoryItem['metadata'];
  onPromptSubmit: (history: ChatMessage[], files: File[], provider?: AIProvider, model?: string, contextIds?: string[], personality?: string) => Promise<string>;
  onDeepenNote?: (instruction: string, files: File[], provider?: AIProvider, model?: string, contextIds?: string[]) => Promise<string>;
  isProcessing: boolean;
  groqModels?: {value: string, label: string, badge: string}[];
  externalPrompt?: string;
  onExternalPromptHandled?: () => void;
  onAddSticky?: (text: string, color?: 'yellow'|'blue'|'green'|'pink') => void;
}

const AssistantPanel: React.FC<AssistantPanelProps> = ({ noteMetadata, onPromptSubmit, onDeepenNote, isProcessing, groqModels = [], externalPrompt, onExternalPromptHandled, onAddSticky }) => {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [provider, setProvider] = useState<AIProvider>(AIProvider.GEMINI);
  const [model, setModel] = useState<string>(AppModel.GEMINI_2_5_FLASH);
  
  // Context Injection State
  const [availableNotes, setAvailableNotes] = useState<HistoryItem[]>([]);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);

  // Custom Prompts State
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [showPromptPicker, setShowPromptPicker] = useState(false);

  // Personality State
  const [personality, setPersonality] = useState('');
  const [showPersonalitySettings, setShowPersonalitySettings] = useState(false);

  useEffect(() => {
      const savedPrompts = localStorage.getItem('neuro_assistant_prompts');
      if (savedPrompts) {
          try {
              setCustomPrompts(JSON.parse(savedPrompts));
          } catch (e) {
              setCustomPrompts(["Summarize this note", "Explain this concept simply", "Create a quiz from this note"]);
          }
      } else {
          setCustomPrompts(["Summarize this note", "Explain this concept simply", "Create a quiz from this note"]);
      }
  }, []);

  const saveCustomPrompt = () => {
      if (!prompt.trim()) return;
      if (customPrompts.includes(prompt.trim())) return;
      const newPrompts = [...customPrompts, prompt.trim()];
      setCustomPrompts(newPrompts);
      localStorage.setItem('neuro_assistant_prompts', JSON.stringify(newPrompts));
      alert("Prompt saved!");
  };

  const deleteCustomPrompt = (promptToDelete: string) => {
      const newPrompts = customPrompts.filter(p => p !== promptToDelete);
      setCustomPrompts(newPrompts);
      localStorage.setItem('neuro_assistant_prompts', JSON.stringify(newPrompts));
  };

  const savePersonality = () => {
      setShowPersonalitySettings(false);
  };

  useEffect(() => {
      if (externalPrompt) {
          setPrompt(externalPrompt);
          if (onExternalPromptHandled) {
              onExternalPromptHandled();
          }
      }
  }, [externalPrompt, onExternalPromptHandled]);

  useEffect(() => {
      const notes = StorageService.getInstance().getLocalNotesMetadata();
      setAvailableNotes(notes);
  }, []);

  const toggleContext = (id: string) => {
      setSelectedContextIds(prev => 
          prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
      );
  };
  
  const [messages, setMessages] = useState<ChatMessage[]>([
      { role: 'model', content: "Hi! I'm your Neuro-Sidekick. Ask me anything about this note." }
  ]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      setFiles(prev => [...prev, ...Array.from(e.clipboardData.files)]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if ((!prompt.trim() && files.length === 0) || isProcessing) return;
    
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setPrompt('');
    setFiles([]); 

    try {
        const response = await onPromptSubmit(newHistory, files, provider, model, selectedContextIds, personality);
        setMessages(prev => [...prev, { role: 'model', content: response }]);
    } catch (e) {
        setMessages(prev => [...prev, { role: 'model', content: "Sorry, I encountered an error." }]);
    }
  };

  const handleDeepen = async () => {
    if (isProcessing || !onDeepenNote) return;
    
    const userMsg: ChatMessage = { role: 'user', content: prompt || "Deepen this note using the provided context." };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    const currentPrompt = prompt;
    setPrompt('');
    const currentFiles = [...files];
    setFiles([]); 

    try {
        const response = await onDeepenNote(currentPrompt, currentFiles, provider, model, selectedContextIds);
        setMessages(prev => [...prev, { role: 'model', content: response }]);
    } catch (e) {
        setMessages(prev => [...prev, { role: 'model', content: "Sorry, I encountered an error while deepening the note." }]);
    }
  };

  const CopyButton = ({ text }: { text: string }) => {
      const [copied, setCopied] = useState(false);
      const handleCopy = () => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      };
      return (
          <button onClick={handleCopy} className="p-1 text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] transition-colors" title="Copy">
              {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
      );
  };

  const cleanResponse = (text: string) => {
    if (!text) return "";
    // Replace <br> tags with newlines
    return text.replace(/<br\s*\/?>/gi, '\n');
  };

  return (
    <div className="h-full flex flex-col bg-[var(--ui-surface)] border-l border-[var(--ui-border)]">
      {/* HEADER */}
      <div className="p-4 border-b border-[var(--ui-border)] font-bold text-[var(--ui-text-main)] flex flex-col gap-2 relative">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                AI Assistant
            </div>
            <button 
                onClick={() => setShowPersonalitySettings(!showPersonalitySettings)}
                className={`p-1 rounded transition-colors ${showPersonalitySettings ? 'bg-[var(--ui-primary)]/10 text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)]'}`}
                title="AI Personality Settings"
            >
                <Settings2 size={16}/>
            </button>
        </div>

        {/* Personality Settings Dropdown */}
        {showPersonalitySettings && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--ui-surface)] border border-[var(--ui-border)] shadow-xl rounded-xl p-3 z-50 animate-scale-in">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-[var(--ui-border)]">
                    <span className="text-xs font-bold">AI Personality (System Prompt)</span>
                    <button onClick={() => setShowPersonalitySettings(false)} className="text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"><X size={14}/></button>
                </div>
                <textarea 
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    placeholder="e.g., You are a strict medical professor. Always answer in bullet points..."
                    className="w-full h-24 bg-[var(--ui-bg)] text-[var(--ui-text-main)] text-xs p-2 rounded outline-none border border-[var(--ui-border)] resize-none mb-2"
                />
                <button 
                    onClick={savePersonality}
                    className="w-full py-1.5 text-xs bg-[var(--ui-primary)] text-white rounded hover:opacity-90 transition-opacity"
                >
                    Save Personality
                </button>
            </div>
        )}
        
        {/* MODEL SELECTOR */}
        <div className="flex gap-1 w-full">
            <select 
                value={provider} 
                onChange={(e) => { setProvider(e.target.value as AIProvider); setModel(''); }}
                className="bg-[var(--ui-bg)] text-[10px] font-bold border border-[var(--ui-border)] rounded p-1 outline-none flex-1"
            >
                <option value={AIProvider.GEMINI}>Gemini</option>
                <option value={AIProvider.GROQ}>Groq</option>
            </select>
            <select 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                className="bg-[var(--ui-bg)] text-[10px] font-bold border border-[var(--ui-border)] rounded p-1 outline-none flex-[2] truncate"
            >
                {(provider === AIProvider.GEMINI ? GEMINI_MODELS_LIST : groqModels).map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                ))}
            </select>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[var(--ui-bg)]">
        
        {/* MESSAGES */}
        {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-[var(--ui-primary)] text-white' : 'bg-emerald-500 text-white'}`}>
                    {msg.role === 'user' ? <User size={14}/> : <Bot size={14}/>}
                </div>
                <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm relative group ${
                        msg.role === 'user' 
                        ? 'bg-[var(--ui-primary)] text-white rounded-tr-none' 
                        : 'bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-main)] rounded-tl-none markdown-body'
                    }`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{cleanResponse(msg.content)}</ReactMarkdown>
                        {msg.role === 'model' && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                {onAddSticky && (
                                    <button 
                                        onClick={() => onAddSticky(msg.content, 'yellow')}
                                        className="p-1 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] hover:bg-[var(--ui-primary)]/10 transition-colors"
                                        title="Convert to Sticky Note"
                                    >
                                        <StickyNote size={12}/>
                                    </button>
                                )}
                                <CopyButton text={msg.content} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ))}
        
        {isProcessing && (
            <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Loader2 size={14} className="animate-spin"/>
                </div>
                <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] p-3 rounded-2xl rounded-tl-none text-xs text-[var(--ui-text-muted)]">
                    Thinking...
                </div>
            </div>
        )}
      </div>

      {/* INPUT AREA */}
      <div className="p-3 bg-[var(--ui-surface)] border-t border-[var(--ui-border)]">
        {/* Context Chips */}
        {selectedContextIds.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                {selectedContextIds.map(id => {
                    const note = availableNotes.find(n => n.id === id);
                    if (!note) return null;
                    return (
                        <div key={id} className="bg-indigo-100 text-indigo-800 border border-indigo-200 rounded px-2 py-1 text-[10px] flex items-center gap-1 shrink-0">
                            <Book size={10}/>
                            <span className="max-w-[80px] truncate">{note.topic}</span>
                            <button onClick={() => toggleContext(id)} className="hover:text-indigo-500"><X size={10}/></button>
                        </div>
                    );
                })}
            </div>
        )}

        {files.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                {files.map((f, i) => (
                    <div key={i} className="bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded px-2 py-1 text-[10px] flex items-center gap-1 shrink-0">
                        <FileText size={10}/>
                        <span className="max-w-[80px] truncate">{f.name}</span>
                        <button onClick={() => removeFile(i)} className="hover:text-red-400"><X size={10}/></button>
                    </div>
                ))}
            </div>
        )}
        
        {/* Context Picker Modal */}
        {showContextPicker && (
            <div className="absolute bottom-16 left-4 right-4 bg-[var(--ui-surface)] border border-[var(--ui-border)] shadow-xl rounded-xl p-3 max-h-60 overflow-y-auto z-50">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-[var(--ui-border)]">
                    <span className="text-xs font-bold">Select Context Notes</span>
                    <button onClick={() => setShowContextPicker(false)}><X size={14}/></button>
                </div>
                <div className="space-y-1">
                    {availableNotes.map(note => (
                        <div 
                            key={note.id} 
                            onClick={() => toggleContext(note.id)}
                            className={`p-2 rounded text-xs cursor-pointer flex items-center gap-2 ${selectedContextIds.includes(note.id) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-[var(--ui-bg)]'}`}
                        >
                            <div className={`w-3 h-3 rounded border flex items-center justify-center ${selectedContextIds.includes(note.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-400'}`}>
                                {selectedContextIds.includes(note.id) && <Check size={8} className="text-white"/>}
                            </div>
                            <span className="truncate">{note.topic}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Custom Prompt Picker Modal */}
        {showPromptPicker && (
            <div className="absolute bottom-16 left-4 right-4 bg-[var(--ui-surface)] border border-[var(--ui-border)] shadow-xl rounded-xl p-3 max-h-60 overflow-y-auto z-50">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-[var(--ui-border)]">
                    <span className="text-xs font-bold">Custom Prompts</span>
                    <button onClick={() => setShowPromptPicker(false)}><X size={14}/></button>
                </div>
                <div className="space-y-1 mb-2">
                    {customPrompts.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between group p-2 rounded text-xs hover:bg-[var(--ui-bg)]">
                            <span 
                                className="cursor-pointer flex-1 truncate mr-2" 
                                onClick={() => { setPrompt(p); setShowPromptPicker(false); }}
                            >
                                {p}
                            </span>
                            <button 
                                onClick={() => deleteCustomPrompt(p)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                            >
                                <X size={12}/>
                            </button>
                        </div>
                    ))}
                </div>
                <button 
                    onClick={saveCustomPrompt}
                    disabled={!prompt.trim() || customPrompts.includes(prompt.trim())}
                    className="w-full py-1.5 text-xs bg-[var(--ui-primary)]/10 text-[var(--ui-primary)] rounded hover:bg-[var(--ui-primary)]/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                >
                    <Save size={12}/> Save Current Prompt
                </button>
            </div>
        )}

        <div 
            className="flex items-center gap-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-[var(--ui-primary)] transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onPaste={handlePaste}
        >
            <button 
                onClick={() => { setShowPromptPicker(!showPromptPicker); setShowContextPicker(false); }}
                className={`p-1 rounded hover:bg-[var(--ui-surface)] transition-colors ${showPromptPicker ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}`}
                title="Custom Prompts"
            >
                <Wand2 size={16}/>
            </button>

            <button 
                onClick={() => { setShowContextPicker(!showContextPicker); setShowPromptPicker(false); }}
                className={`p-1 rounded hover:bg-[var(--ui-surface)] transition-colors ${selectedContextIds.length > 0 ? 'text-indigo-500' : 'text-[var(--ui-text-muted)]'}`}
                title="Add Context from Notes"
            >
                <Book size={16}/>
            </button>

            <label className="cursor-pointer text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] transition-colors">
                <input type="file" multiple className="hidden" onChange={handleFileSelect}/>
                <UploadCloud size={18}/>
            </label>
            
            <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Ask Neuro-Sidekick..."
                className="flex-1 bg-transparent outline-none text-sm text-[var(--ui-text-main)] placeholder-[var(--ui-text-muted)]"
                disabled={isProcessing}
            />
            
            <button 
                onClick={handleDeepen}
                disabled={isProcessing || (files.length === 0 && selectedContextIds.length === 0 && !prompt.trim())}
                className="text-indigo-500 disabled:opacity-30 hover:scale-110 transition-transform"
                title="Deepen Note with Context"
            >
                <Layers size={18}/>
            </button>

            <button 
                onClick={handleSubmit}
                disabled={(!prompt.trim() && files.length === 0) || isProcessing}
                className="text-[var(--ui-primary)] disabled:opacity-30 hover:scale-110 transition-transform"
                title="Send to Assistant"
            >
                <Send size={18}/>
            </button>
        </div>
        <div className="text-[9px] text-[var(--ui-text-muted)] text-center mt-2">
            AI can make mistakes. Check important info.
        </div>
      </div>
    </div>
  );
};

export default AssistantPanel;
