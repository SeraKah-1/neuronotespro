
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Download, Copy, Eye, Check, List, Book, Focus, Save, Edit3, CloudUpload, Clipboard, ClipboardCheck, EyeOff, MousePointerClick, BookOpen, Microscope, Activity, AlertTriangle, Info, Wand2, Search, X, HelpCircle, MessageSquareQuote, LayoutTemplate, Undo2, Redo2, Loader2, Workflow, Printer, FileDown, Maximize2, Minimize2, UploadCloud, ArrowLeft, Sparkles, Bot, Settings2, Pin } from 'lucide-react';
import { StorageService } from '../services/storageService';
import { processGeneratedNote } from '../utils/formatter';
import { refineNoteContent } from '../services/geminiService';
import { refineNoteContentGroq } from '../services/groqService';
import Mermaid from './Mermaid';
import ContextSidePanel from './ContextSidePanel';
import GhostBlock from './GhostBlock';
import StickyNoteBoard from './StickyNoteBoard';
import { AppTheme, AIProvider, GenerationConfig, StickyNote } from '../types';

interface OutputDisplayProps {
  content: string;
  topic: string;
  noteId?: string;
  config: GenerationConfig;
  onUpdateContent?: (newContent: string) => void;
  onManualSave?: (content: string) => void;
  onExit: () => void;
  theme?: AppTheme;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const SensorBlock: React.FC<{ children: React.ReactNode; active: boolean; label?: string }> = React.memo(({ children, active, label }) => {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!active) setRevealed(true);
    else setRevealed(false);
  }, [active]);

  if (!active) return <div className="mb-4">{children}</div>;

  return (
    <div 
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      className={`relative mb-4 transition-all duration-500 ${revealed ? 'sensor-blur revealed' : 'sensor-blur'}`}
    >
       {!revealed && (
         <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-[var(--ui-text-muted)] text-[10px] font-bold uppercase tracking-widest opacity-50">
               Click to Reveal
            </div>
         </div>
       )}
       {children}
    </div>
  );
});

const OutputDisplay: React.FC<OutputDisplayProps> = ({ content, topic, onUpdateContent, onManualSave, onExit, noteId, config, theme = AppTheme.CLINICAL_CLEAN }) => {
  const [history, setHistory] = useState<string[]>([content]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [editableContent, setEditableContent] = useState(content);
  const debouncedContent = useDebounce(editableContent, 500); 

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diagrams'>('preview');
  const [showToc, setShowToc] = useState(false);
  const [activeHeaderId, setActiveHeaderId] = useState<string>('');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const [sensorMode, setSensorMode] = useState(false);

  const [showMagicEdit, setShowMagicEdit] = useState(false);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // --- ASSISTANT & CONFIG STATE ---
  const [activeConfig, setActiveConfig] = useState<GenerationConfig>(config);
  const [showAssistantPanel, setShowAssistantPanel] = useState(false);

  // Sync prop config to local state if it changes
  useEffect(() => {
      setActiveConfig(config);
  }, [config]);

  // --- MICRO-RAG STATE ---
  const [attachedContextIds, setAttachedContextIds] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{top: number, left: number, bottom: number} | null>(null);
  const [isDeepening, setIsDeepening] = useState(false);

  // --- GHOST BLOCK & STICKIES ---
  const [ghostBlock, setGhostBlock] = useState<{ id: string; originalText: string; generatedText: string; position: { top: number; left: number } } | null>(null);
  const [stickies, setStickies] = useState<StickyNote[]>([]);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');

  // --- DIAGRAM GALLERY STATE ---
  const [diagrams, setDiagrams] = useState<{ id: string; code: string; title: string; index: number }[]>([]);

  useEffect(() => {
      isMounted.current = true;
      // Load context IDs if note exists
      if (noteId) {
          const storage = StorageService.getInstance();
          const notes = storage.getLocalNotesMetadata();
          const currentNote = notes.find(n => n.id === noteId);
          if (currentNote && currentNote.attached_context_ids) {
              setAttachedContextIds(currentNote.attached_context_ids);
          }
      }
      return () => { isMounted.current = false; };
  }, [noteId]);

  // ... (Existing useEffects)

  // --- SELECTION LISTENER FOR DEEPEN ---
  useEffect(() => {
      const handleSelection = () => {
          const selection = window.getSelection();
          if (selection && selection.toString().trim().length > 0) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setSelectedText(selection.toString());
              // Use fixed positioning relative to viewport
              setSelectionPos({
                  top: rect.top - 50, // Position above selection
                  left: rect.left + (rect.width / 2), // Center horizontally
                  bottom: rect.bottom + 10 // Position below selection
              });
          } else {
              // Only clear if not interacting with the menu (handled by blur/click outside logic usually, but here simplified)
              // We'll clear it if selection is empty
              if (!showCustomPrompt) {
                  setSelectionPos(null);
                  setSelectedText('');
              }
          }
      };

      document.addEventListener('selectionchange', handleSelection);
      return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  const handleQuickAction = async (action: 'deepen' | 'simplify' | 'expand' | 'quiz' | 'custom', customPrompt?: string) => {
      if (!selectedText) return;
      
      setIsDeepening(true);
      try {
          let prompt = "";
          
          if (action === 'deepen') {
               // ... existing deepen logic ...
               if (attachedContextIds.length === 0) {
                   alert("Please attach context files first for Deepen.");
                   setIsDeepening(false);
                   return;
               }
               const storage = StorageService.getInstance();
               const materials = await storage.getLibraryMaterialsByIds(attachedContextIds);
               let contextStr = "";
               materials.forEach(m => {
                   try {
                       const decoded = decodeURIComponent(escape(atob(m.content)));
                       contextStr += `\n--- DOCUMENT: ${m.title} ---\n${decoded.substring(0, 15000)}\n`;
                   } catch (e) { console.warn("Decode failed", e); }
               });
               prompt = `
               TASK: Deepen and expand the following text based strictly on the provided context documents.
               SELECTED TEXT: "${selectedText}"
               CONTEXT DOCUMENTS: ${contextStr}
               INSTRUCTIONS: Elaborate on the selected text using specific details from the context. Return ONLY the expanded text (Markdown).
               `;
          } else if (action === 'simplify') {
              prompt = `TASK: Rewrite the following text to be simpler and easier to understand (ELI5 level). Maintain key information.\nTEXT: "${selectedText}"`;
          } else if (action === 'expand') {
              prompt = `TASK: Expand on the following text with more detail, examples, and context.\nTEXT: "${selectedText}"`;
          } else if (action === 'quiz') {
              prompt = `TASK: Create a short quiz (1-3 multiple choice questions) based on the following text. Format as Markdown.\nTEXT: "${selectedText}"`;
          } else if (action === 'custom' && customPrompt) {
              prompt = `TASK: ${customPrompt}\nTEXT: "${selectedText}"`;
          }

          let newSegment = "";
          if (activeConfig.provider === AIProvider.GEMINI) {
              newSegment = await refineNoteContent(activeConfig, selectedText, prompt);
          } else {
              newSegment = await refineNoteContentGroq(activeConfig, selectedText, prompt);
          }

          // SET GHOST BLOCK instead of replacing immediately
          setGhostBlock({
              id: Date.now().toString(),
              originalText: selectedText,
              generatedText: newSegment,
              position: selectionPos ? { top: selectionPos.bottom, left: selectionPos.left } : { top: 100, left: 100 }
          });
          
          setSelectionPos(null); // Hide menu
          setShowCustomPrompt(false);

      } catch (e: any) {
          alert("Action Failed: " + e.message);
      } finally {
          setIsDeepening(false);
      }
  };

  const handleGhostAction = (action: 'accept' | 'discard' | 'pin') => {
      if (!ghostBlock) return;

      if (action === 'accept') {
          const newFullContent = editableContent.replace(ghostBlock.originalText, ghostBlock.generatedText);
          pushToHistory(newFullContent);
      } else if (action === 'pin') {
          const newSticky: StickyNote = {
              id: Date.now().toString(),
              text: ghostBlock.generatedText,
              color: 'bg-yellow-100',
              timestamp: Date.now()
          };
          setStickies(prev => [...prev, newSticky]);
      }
      
      setGhostBlock(null);
  };

  const pushToHistory = useCallback((newContent: string) => {
      if (newContent === history[historyIndex]) return;
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newContent);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setEditableContent(newContent);
      if (onUpdateContent) onUpdateContent(newContent);
      setIsDirty(true);
  }, [history, historyIndex, onUpdateContent]);

  const undo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          setHistoryIndex(prevIndex);
          setEditableContent(history[prevIndex]);
          if (onUpdateContent) onUpdateContent(history[prevIndex]);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setHistoryIndex(nextIndex);
          setEditableContent(history[nextIndex]);
          if (onUpdateContent) onUpdateContent(history[nextIndex]);
      }
  };

  // --- TOC GENERATION ---
  const [toc, setToc] = useState<TocItem[]>([]);
  useEffect(() => {
      const lines = debouncedContent.split('\n');
      const headers: TocItem[] = [];
      lines.forEach((line) => {
          const match = line.match(/^(#{1,3})\s+(.+)$/);
          if (match) {
              const level = match[1].length;
              const text = match[2].trim();
              const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              headers.push({ id, text, level });
          }
      });
      setToc(headers);
  }, [debouncedContent]);

  const handleScroll = () => {
      if (!scrollRef.current) return;
      const scrollPos = scrollRef.current.scrollTop;
      
      // Highlight TOC
      const headers = document.querySelectorAll('h1, h2, h3');
      let currentId = '';
      headers.forEach((header) => {
          const h = header as HTMLElement;
          if (h.offsetTop - 100 <= scrollPos) {
              currentId = h.id;
          }
      });
      if (currentId) setActiveHeaderId(currentId);
  };

  const scrollToHeader = (id: string) => {
      const element = document.getElementById(id);
      if (element && scrollRef.current) {
          scrollRef.current.scrollTo({
              top: element.offsetTop - 80,
              behavior: 'smooth'
          });
          setActiveHeaderId(id);
      }
  };

  const handleManualSaveTrigger = () => {
      if (onManualSave) {
          setIsSaving(true);
          onManualSave(editableContent);
          setTimeout(() => {
              setIsSaving(false);
              setJustSaved(true);
              setIsDirty(false);
              setTimeout(() => setJustSaved(false), 2000);
          }, 800);
      }
  };

  const executeMagicEdit = async () => {
      if (!magicInstruction.trim()) return;
      setIsMagicLoading(true);
      try {
          const newContent = await refineNoteContent(activeConfig, editableContent, magicInstruction);
          pushToHistory(newContent);
          setMagicInstruction('');
          setShowMagicEdit(false);
      } catch (e: any) {
          alert("Magic Edit Failed: " + e.message);
      } finally {
          setIsMagicLoading(false);
      }
  };

  const handleDiagramUpdate = (index: number, newCode: string, newTitle: string) => {
      const updated = [...diagrams];
      updated[index] = { ...updated[index], code: newCode, title: newTitle };
      setDiagrams(updated);
      // Also update in markdown content? (Complex, maybe just local state for now or regex replace)
  };

  const handleSidePanelAction = async (action: 'summarize' | 'quiz') => {
      setIsMagicLoading(true);
      try {
          let prompt = "";
          if (action === 'summarize') {
              prompt = `TASK: Create a concise summary (TL;DR) of the following note.\nNOTE CONTENT:\n${editableContent}`;
          } else if (action === 'quiz') {
              prompt = `TASK: Generate 3 multiple-choice questions based on the following note content. Format as Markdown.\nNOTE CONTENT:\n${editableContent}`;
          }

          let result = "";
          if (activeConfig.provider === AIProvider.GEMINI) {
              result = await refineNoteContent(activeConfig, editableContent, prompt);
          } else {
              result = await refineNoteContentGroq(activeConfig, editableContent, prompt);
          }

          // Add result as a Sticky Note
          const newSticky: StickyNote = {
              id: Date.now().toString(),
              text: `**${action.toUpperCase()}**\n\n${result}`,
              color: 'bg-blue-100',
              timestamp: Date.now()
          };
          setStickies(prev => [...prev, newSticky]);
          setShowAssistantPanel(false);

      } catch (e: any) {
          alert("Action Failed: " + e.message);
      } finally {
          setIsMagicLoading(false);
      }
  };

  // Extract Diagrams from Markdown
  useEffect(() => {
      const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
      let match;
      const found: { id: string; code: string; title: string; index: number }[] = [];
      let idx = 0;
      while ((match = mermaidRegex.exec(debouncedContent)) !== null) {
          found.push({
              id: `diag-${idx}`,
              code: match[1].trim(),
              title: `Diagram ${idx + 1}`,
              index: idx
          });
          idx++;
      }
      setDiagrams(found);
  }, [debouncedContent]);

  // Custom Components for ReactMarkdown
  const components = useMemo(() => ({
      code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const isMermaid = match && match[1] === 'mermaid';
          
          if (!inline && isMermaid) {
              return (
                  <div className="my-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <Mermaid chart={String(children).replace(/\n$/, '')} />
                  </div>
              );
          }
          
          if (!inline && match) {
              return (
                  <div className="relative group my-4 rounded-lg overflow-hidden border border-gray-700 bg-[#1e1e1e]">
                      <div className="flex justify-between items-center px-3 py-1.5 bg-[#2d2d2d] border-b border-gray-700">
                          <span className="text-xs font-mono text-gray-400">{match[1]}</span>
                          <button 
                              onClick={() => navigator.clipboard.writeText(String(children))}
                              className="text-gray-400 hover:text-white transition-colors"
                              title="Copy Code"
                          >
                              <Copy size={12}/>
                          </button>
                      </div>
                      <pre className={`${className} p-4 overflow-x-auto custom-scrollbar`} {...props}>
                          <code className={className} {...props}>
                              {children}
                          </code>
                      </pre>
                  </div>
              );
          }
          return <code className={`${className} bg-gray-100 text-red-500 px-1 py-0.5 rounded text-sm font-mono`} {...props}>{children}</code>;
      },
      h1: ({node, ...props}: any) => <h1 id={String(props.children).toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="text-3xl font-bold mt-8 mb-4 pb-2 border-b border-[var(--ui-border)] text-[var(--md-heading)]" {...props} />,
      h2: ({node, ...props}: any) => <h2 id={String(props.children).toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="text-2xl font-bold mt-6 mb-3 text-[var(--md-heading)]" {...props} />,
      h3: ({node, ...props}: any) => <h3 id={String(props.children).toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="text-xl font-semibold mt-5 mb-2 text-[var(--md-heading)]" {...props} />,
      p: ({node, ...props}: any) => <p className="mb-4 leading-relaxed text-[var(--md-text)]" {...props} />,
      ul: ({node, ...props}: any) => <ul className="list-disc pl-6 mb-4 space-y-1 text-[var(--md-text)]" {...props} />,
      ol: ({node, ...props}: any) => <ol className="list-decimal pl-6 mb-4 space-y-1 text-[var(--md-text)]" {...props} />,
      blockquote: ({node, ...props}: any) => (
          <blockquote className="border-l-4 border-[var(--ui-primary)] pl-4 py-1 my-4 bg-[var(--ui-surface)] italic text-[var(--ui-text-muted)] rounded-r-lg" {...props} />
      ),
      table: ({node, ...props}: any) => <div className="overflow-x-auto my-6 rounded-lg border border-[var(--md-border)]"><table className="min-w-full divide-y divide-[var(--md-border)]" {...props} /></div>,
      th: ({node, ...props}: any) => <th className="px-4 py-3 bg-[var(--ui-bg)] text-left text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wider" {...props} />,
      td: ({node, ...props}: any) => <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--md-text)] border-t border-[var(--md-border)]" {...props} />,
      // Custom Sensor Block for ">>>" syntax (simulated via blockquote or specific marker, but here we use a custom component if possible, or just standard rendering)
      // For now, let's assume standard markdown doesn't have a direct "Sensor" tag, but we can wrap specific sections if needed.
  }), [debouncedContent]);

  // --- PDF EXPORT (Improved Strategy: DOM Expansion + Style Injection + Responsive SVG Fix) ---
  const handleExportPdf = async () => {
      if (typeof (window as any).html2pdf === 'undefined') {
          alert("PDF library not loaded. Please refresh the page.");
          return;
      }

      const element = document.querySelector('.markdown-body') as HTMLElement;
      const scrollContainer = scrollRef.current;
      
      if (!element || !scrollContainer) return;
      setIsExportingPdf(true);
      
      // 1. Snapshot Original States
      const originalStyle = element.getAttribute('style');
      const originalClass = element.className;
      const originalOverflow = scrollContainer.style.overflow;
      const originalHeight = scrollContainer.style.height;
      
      try {
          // 2. APPLY PRINT MODE & EXPAND
          // Add the 'print-mode' class to force SVG responsiveness via global CSS
          element.classList.add('print-mode');
          
          scrollContainer.style.overflow = 'visible';
          scrollContainer.style.height = 'auto';

          // 3. Apply Styling Overrides
          element.style.setProperty('--ui-bg', '#ffffff');
          element.style.setProperty('--ui-surface', '#ffffff');
          element.style.setProperty('--ui-text-main', '#000000');
          element.style.setProperty('--ui-text-muted', '#333333');
          element.style.setProperty('--md-bg', '#ffffff');
          element.style.setProperty('--md-text', '#000000');
          element.style.setProperty('--md-heading', '#000000');
          element.style.setProperty('--md-code-bg', '#f5f5f5');
          element.style.setProperty('--md-border', '#cccccc');
          
          element.style.backgroundColor = '#ffffff';
          element.style.color = '#000000';
          element.style.width = '100%'; 
          element.style.maxWidth = 'none'; 
          element.style.margin = '0';
          element.style.padding = '20px';
          
          // Reveal Sensors
          const sensors = Array.from(document.querySelectorAll('.sensor-blur')) as HTMLElement[];
          sensors.forEach(s => {
              s.style.filter = 'none';
              s.style.opacity = '1';
          });

          // Fix SVGs background
          const svgs = element.querySelectorAll('svg');
          svgs.forEach(svg => {
              svg.style.backgroundColor = '#ffffff';
          });

          // 4. Wait for Layout Recalculation (Extended wait for Mermaid resize)
          await new Promise(resolve => setTimeout(resolve, 800));

          // 5. Generate
          const opt = {
              margin: [10, 10, 10, 10], // mm
              filename: `${topic.replace(/[^a-z0-9]/gi, '_')}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { 
                  scale: 2, 
                  useCORS: true, 
                  logging: false, 
                  backgroundColor: '#ffffff',
                  scrollY: 0, 
                  scrollX: 0,
                  windowWidth: 800, // FORCE A4 WIDTH CONTEXT
                  windowHeight: scrollContainer.scrollHeight,
                  // Fallback: Strip fixed dimensions from cloned SVGs to ensure CSS takes over
                  onclone: (clonedDoc: Document) => {
                      const clonedSvgs = clonedDoc.querySelectorAll('.mermaid-container svg');
                      clonedSvgs.forEach((svg) => {
                          const el = svg as HTMLElement;
                          el.removeAttribute('width');
                          el.removeAttribute('height');
                          el.style.width = '100%';
                          el.style.height = 'auto';
                          el.style.overflow = 'visible';
                      });
                  }
              },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };
          
          // @ts-ignore
          await window.html2pdf().set(opt).from(element).save();

      } catch (e) { 
          console.error("PDF Export Error", e);
          alert("Export failed. Please check console."); 
      } 
      finally { 
          // 6. Restore Original State
          if (originalStyle) {
              element.setAttribute('style', originalStyle);
          } else {
              element.removeAttribute('style');
          }
          // IMPORTANT: Remove the print-mode class
          element.classList.remove('print-mode');
          element.className = originalClass;

          // Restore Container
          scrollContainer.style.overflow = originalOverflow;
          scrollContainer.style.height = originalHeight;

          // Restore Sensors
          const sensors = Array.from(document.querySelectorAll('.sensor-blur')) as HTMLElement[];
          sensors.forEach((s) => {
             s.style.filter = '';
             s.style.opacity = '';
          });

          setIsExportingPdf(false); 
      }
  };

  const handleCloudUpload = async () => {
      const storage = StorageService.getInstance();
      if (!storage.isCloudReady()) return alert("Connect to Supabase in Settings first.");
      
      const currentId = noteId || Date.now().toString();

      if (topic) {
          const note = { 
              id: currentId, 
              topic, 
              content: editableContent, 
              timestamp: Date.now(), 
              mode: config.mode, 
              provider: config.provider, 
              parentId: null, 
              tags: [],
              attached_context_ids: attachedContextIds, // Include Context IDs
              _status: 'synced' 
          };

          setIsSaving(true);
          try {
              await storage.saveNoteLocal(note as any);
              await storage.uploadNoteToCloud(note as any);
              alert("Uploaded to Cloud Successfully!");
              setIsDirty(false);
          } catch(e: any) { 
              console.error(e);
              alert("Upload failed: " + e.message); 
          } finally {
              setIsSaving(false);
          }
      }
  };

  // ... (Existing executeMagicEdit, handleMermaidChange, Renderers)

  return (
    <div className="h-full flex flex-col relative font-sans bg-[var(--ui-bg)]">
      
      {/* --- TOOLBAR (TOP STICKY) --- */}
      <div className="sticky top-0 z-50 flex flex-col bg-[var(--ui-surface)]/95 backdrop-blur-md border-b border-[var(--ui-border)] shadow-sm transition-all">
          <div className="flex items-center justify-between px-4 py-3 overflow-x-auto no-scrollbar gap-4">
              <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                      onClick={onExit} 
                      className="mr-2 p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] transition-colors"
                      title="Back to Workspace"
                  >
                      <ArrowLeft size={18}/>
                  </button>

                  <div className="flex bg-[var(--ui-bg)] rounded-lg p-0.5 border border-[var(--ui-border)]">
                      <button onClick={() => setActiveTab('preview')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap ${activeTab === 'preview' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><BookOpen size={14}/> <span className="hidden sm:inline">Read</span></button>
                      <button onClick={() => setActiveTab('code')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap ${activeTab === 'code' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Edit3 size={14}/> <span className="hidden sm:inline">Code</span></button>
                      <button onClick={() => setActiveTab('diagrams')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap ${activeTab === 'diagrams' ? 'bg-[var(--ui-surface)] shadow text-[var(--ui-text-main)]' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}`}><Workflow size={14}/> <span className="hidden sm:inline">Diagrams</span></button>
                  </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                  <button 
                    onClick={() => setShowAssistantPanel(!showAssistantPanel)} 
                    className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${showAssistantPanel ? 'bg-indigo-100 text-indigo-600' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)]'}`}
                    title="Assistant Context & Settings"
                  >
                    <Bot size={18}/>
                    <span className="text-xs font-bold hidden sm:inline">Assistant</span>
                  </button>

                  <div className="w-[1px] h-6 bg-[var(--ui-border)] mx-1"></div>

                  <button onClick={() => setShowToc(!showToc)} className={`p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)] ${showToc ? 'bg-[var(--ui-bg)] text-[var(--ui-primary)]' : ''} hidden md:block`} title="Outline"><List size={18}/></button>
                  <button onClick={handleExportPdf} disabled={isExportingPdf} className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-[var(--ui-text-main)]" title="PDF">{isExportingPdf ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}</button>
                  <button onClick={() => setSensorMode(!sensorMode)} className={`p-2 rounded-lg ${sensorMode ? 'bg-amber-100 text-amber-600' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)]'}`} title="Sensor Mode"><EyeOff size={18}/></button>
                  <button onClick={() => setShowMagicEdit(!showMagicEdit)} className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-indigo-500" title="Magic Edit"><Wand2 size={18}/></button>
                  <button onClick={handleCloudUpload} className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] hover:text-cyan-500" title="Upload Cloud"><UploadCloud size={18}/></button>
                  
                  <div className="w-[1px] h-6 bg-[var(--ui-border)] mx-1"></div>

                  <button onClick={undo} disabled={historyIndex === 0} className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] disabled:opacity-30"><Undo2 size={18}/></button>
                  <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-2 rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-bg)] disabled:opacity-30"><Redo2 size={18}/></button>

                  <button 
                      onClick={handleManualSaveTrigger} 
                      disabled={isSaving}
                      className={`ml-2 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${justSaved ? 'bg-green-500 text-white' : (isDirty ? 'bg-[var(--ui-primary)] text-white hover:opacity-90' : 'bg-[var(--ui-bg)] text-[var(--ui-text-muted)] border border-[var(--ui-border)]')}`}
                  >
                      {isSaving ? <Loader2 size={14} className="animate-spin"/> : justSaved ? <Check size={14}/> : <Save size={14}/>}
                      <span className="hidden md:inline">{justSaved ? 'Saved' : 'Save'}</span>
                  </button>
              </div>
          </div>
      </div>

      {/* QUICK ACTIONS FLOATING MENU */}
      {selectionPos && activeTab === 'preview' && !ghostBlock && (
          <div 
            className="fixed z-50 animate-scale-in flex items-center gap-1 bg-[var(--ui-surface)] p-1 rounded-full shadow-xl border border-[var(--ui-border)]"
            style={{ top: selectionPos.top, left: selectionPos.left, transform: 'translateX(-50%)' }}
          >
              {!showCustomPrompt ? (
                  <>
                      <button 
                        onClick={() => handleQuickAction('deepen')}
                        disabled={isDeepening || attachedContextIds.length === 0}
                        className="p-2 rounded-full hover:bg-indigo-100 text-indigo-600 disabled:opacity-50 transition-colors relative group"
                        title="Deepen (Requires Context)"
                      >
                         {isDeepening ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                         {attachedContextIds.length === 0 && (
                             <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                                 Need Context
                             </span>
                         )}
                      </button>
                      <div className="w-[1px] h-4 bg-[var(--ui-border)]"></div>
                      <button 
                        onClick={() => handleQuickAction('simplify')}
                        className="p-2 rounded-full hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors"
                        title="Simplify (ELI5)"
                      >
                         <Minimize2 size={16}/>
                      </button>
                      <button 
                        onClick={() => handleQuickAction('expand')}
                        className="p-2 rounded-full hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors"
                        title="Expand"
                      >
                         <Maximize2 size={16}/>
                      </button>
                      <button 
                        onClick={() => handleQuickAction('quiz')}
                        className="p-2 rounded-full hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors"
                        title="Create Quiz"
                      >
                         <HelpCircle size={16}/>
                      </button>
                      <div className="w-[1px] h-4 bg-[var(--ui-border)]"></div>
                      <button 
                        onClick={() => setShowCustomPrompt(true)}
                        className="p-2 rounded-full hover:bg-[var(--ui-bg)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)] transition-colors"
                        title="Custom Prompt"
                      >
                         <MessageSquareQuote size={16}/>
                      </button>
                  </>
              ) : (
                  <div className="flex items-center gap-2 px-2">
                      <input 
                        autoFocus
                        type="text" 
                        value={customPromptText}
                        onChange={(e) => setCustomPromptText(e.target.value)}
                        placeholder="Ask AI to edit..."
                        className="w-48 bg-transparent text-xs outline-none text-[var(--ui-text-main)]"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleQuickAction('custom', customPromptText);
                            if (e.key === 'Escape') setShowCustomPrompt(false);
                        }}
                      />
                      <button 
                        onClick={() => handleQuickAction('custom', customPromptText)}
                        className="p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700"
                      >
                          <Sparkles size={12}/>
                      </button>
                      <button 
                        onClick={() => setShowCustomPrompt(false)}
                        className="p-1.5 text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]"
                      >
                          <X size={12}/>
                      </button>
                  </div>
              )}
          </div>
      )}

      {/* GHOST BLOCK OVERLAY */}
      {ghostBlock && (
          <GhostBlock 
             originalText={ghostBlock.originalText}
             generatedText={ghostBlock.generatedText}
             position={ghostBlock.position}
             onAccept={() => handleGhostAction('accept')}
             onDiscard={() => handleGhostAction('discard')}
             onPin={() => handleGhostAction('pin')}
          />
      )}

      {/* STICKY NOTES BOARD */}
      <StickyNoteBoard 
         stickies={stickies}
         onDelete={(id) => setStickies(prev => prev.filter(s => s.id !== id))}
      />

      {showMagicEdit && (
          <div className="bg-[var(--ui-surface)] border-b border-[var(--ui-border)] p-2 animate-scale-in">
              <div className="max-w-2xl mx-auto flex items-center gap-2 bg-[var(--ui-bg)] border border-[var(--ui-border)] rounded-lg px-3 py-2">
                  <Wand2 size={16} className="text-[var(--ui-primary)]"/>
                  <input 
                      autoFocus
                      type="text" 
                      value={magicInstruction}
                      onChange={(e) => setMagicInstruction(e.target.value)}
                      placeholder="Describe changes (e.g. 'Add a table comparison', 'Simplify language')..."
                      className="flex-1 bg-transparent text-sm outline-none text-[var(--ui-text-main)]"
                      onKeyDown={(e) => e.key === 'Enter' && executeMagicEdit()}
                  />
                  {isMagicLoading ? <Loader2 size={16} className="animate-spin text-[var(--ui-text-muted)]"/> : (
                      <button onClick={() => setShowMagicEdit(false)} className="hover:text-[var(--ui-text-main)] text-[var(--ui-text-muted)]"><X size={16}/></button>
                  )}
              </div>
          </div>
      )}

      {showToc && activeTab === 'preview' && toc.length > 0 && (
          <div className="absolute left-4 top-16 w-56 max-h-[calc(100vh-150px)] overflow-y-auto custom-scrollbar bg-[var(--ui-surface)]/95 backdrop-blur border border-[var(--ui-border)] rounded-xl shadow-2xl p-4 z-40 animate-slide-up hidden md:block">
              <div className="flex justify-between items-center mb-4 border-b border-[var(--ui-border)] pb-2">
                  <span className="text-xs font-bold text-[var(--ui-text-muted)] uppercase tracking-widest">Outline</span>
                  <button onClick={() => setShowToc(false)}><X size={14} className="text-[var(--ui-text-muted)]"/></button>
              </div>
              <div className="space-y-1">
                {toc.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToHeader(item.id)}
                    className={`w-full text-left py-1.5 px-2 text-[11px] rounded transition-all truncate border-l-2
                        ${activeHeaderId === item.id ? 'border-[var(--ui-primary)] text-[var(--ui-primary)] font-bold bg-[var(--ui-primary-glow)]' : 'border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text-main)]'}
                        ${item.level > 1 ? 'ml-2' : ''}
                    `}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
          </div>
      )}

      {/* --- CONTENT SCROLL AREA --- */}
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar relative scroll-smooth"
        ref={scrollRef}
        onScroll={handleScroll}
      >
         {activeTab === 'preview' && (
             <div className={`min-h-full py-10 px-4 md:px-10 flex justify-center pb-32 transition-all duration-300 ${showToc ? 'md:pl-64' : ''}`}>
                <div 
                  ref={markdownRef}
                  className={`markdown-body w-full max-w-4xl animate-fade-in relative theme-${theme} transition-all duration-300`}
                  id="markdown-content"
                >
                   <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
                      {debouncedContent}
                   </ReactMarkdown>
                </div>
             </div>
         )}

         {activeTab === 'code' && (
             <div className="min-h-full p-4 md:p-6 pb-32">
                <textarea 
                    value={editableContent}
                    onChange={(e) => { setEditableContent(e.target.value); setIsDirty(true); }}
                    onBlur={() => pushToHistory(editableContent)}
                    className="w-full h-[80vh] bg-[#0f172a] text-gray-300 font-mono text-sm p-6 rounded-xl outline-none resize-none border border-gray-700 shadow-inner"
                    spellCheck={false}
                />
             </div>
         )}

         {activeTab === 'diagrams' && (
             <div className="min-h-full p-4 md:p-8 pb-32">
                 {diagrams.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-[50vh] text-[var(--ui-text-muted)]">
                         <Workflow size={48} className="mb-4 opacity-20"/>
                         <p>No diagrams found in this note.</p>
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         {diagrams.map((diag, idx) => (
                             <div key={diag.id} className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl overflow-hidden shadow-sm flex flex-col">
                                 <div className="p-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg)] flex items-center justify-between">
                                     <input 
                                         type="text" 
                                         defaultValue={diag.title}
                                         onBlur={(e) => handleDiagramUpdate(idx, diag.code, e.target.value)}
                                         className="bg-transparent font-bold text-xs text-[var(--ui-text-main)] outline-none w-full"
                                     />
                                     <div className="text-[10px] text-[var(--ui-text-muted)] font-mono px-2 py-0.5 bg-[var(--ui-surface)] rounded border border-[var(--ui-border)]">MERMAID</div>
                                 </div>
                                 <div className="p-4 flex-1 bg-white overflow-auto min-h-[200px] flex items-center justify-center">
                                     <Mermaid chart={diag.code} />
                                 </div>
                                 <div className="p-2 border-t border-[var(--ui-border)] bg-[var(--ui-bg)]">
                                     <details className="group">
                                         <summary className="text-[10px] font-bold text-[var(--ui-text-muted)] cursor-pointer hover:text-[var(--ui-primary)] list-none flex items-center gap-1">
                                             <Edit3 size={10}/> Edit Code
                                         </summary>
                                         <textarea 
                                             defaultValue={diag.code}
                                             onBlur={(e) => handleDiagramUpdate(idx, e.target.value, diag.title)}
                                             className="w-full h-32 mt-2 bg-[#0f172a] text-gray-300 font-mono text-xs p-2 rounded outline-none resize-none"
                                             spellCheck={false}
                                         />
                                     </details>
                                 </div>
                             </div>
                         ))}
                     </div>
                 )}
             </div>
         )}
      </div>
      <ContextSidePanel 
        isOpen={showAssistantPanel}
        onClose={() => setShowAssistantPanel(false)}
        config={activeConfig}
        onConfigChange={setActiveConfig}
        attachedContextIds={attachedContextIds}
        onContextChange={(ids) => {
            setAttachedContextIds(ids);
            setIsDirty(true);
        }}
        storageService={StorageService.getInstance()}
        onQuickAction={handleSidePanelAction}
      />
    </div>
  );
};

export default OutputDisplay;

